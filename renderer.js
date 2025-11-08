// renderer.js — N-body renderer with translucent stars + opaque cores, opaque planet
import * as THREE from 'https://esm.sh/three@0.162.0';
import { OrbitControls } from 'https://esm.sh/three@0.162.0/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'https://esm.sh/three@0.162.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.162.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.162.0/examples/jsm/postprocessing/UnrealBloomPass.js';

const $ = id => document.getElementById(id);

export function setupRenderer() {
    const app = $('app');
    const scene = new THREE.Scene();

    // --- Background starfield ---
    function makeStarTexture({w=4096,h=2048,count=14000}={}){
        const c=document.createElement('canvas'); c.width=w; c.height=h;
        const g=c.getContext('2d'); g.fillStyle='#000'; g.fillRect(0,0,w,h);
        for (let i=0;i<count;i++){
            const x=Math.random()*w,y=Math.random()*h,r=Math.random()*1.2+0.2,a=0.6+0.4*Math.random();
            const hue=210+60*(Math.random()-0.5);
            g.fillStyle=`hsla(${hue},80%,${70+20*(Math.random()-0.5)}%,${a})`;
            g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill();
        }
        const tex=new THREE.CanvasTexture(c);
        tex.wrapS=THREE.RepeatWrapping; tex.wrapT=THREE.ClampToEdgeWrapping; tex.anisotropy=8;
        return tex;
    }

    const starTex = makeStarTexture();
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(1000,64,64),
        new THREE.MeshBasicMaterial({ map: starTex, side: THREE.BackSide, depthWrite:false })
    );
    scene.add(sky);

    // --- Camera / renderer / controls ---
    const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.01, 2000);
    camera.position.set(0,5,18);

    const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.setSize(innerWidth, innerHeight);
    app.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08; controls.rotateSpeed = 0.7; controls.zoomSpeed = 0.8; controls.panSpeed = 0.5;

    // --- Lights / grid ---
    scene.add(new THREE.AmbientLight(0xffffff,0.5));
    const keyL = new THREE.PointLight(0xffffff,1.2); keyL.position.set(10,10,10); scene.add(keyL);
    const fillL = new THREE.PointLight(0xffffff,0.6); fillL.position.set(-10,-10,-5); scene.add(fillL);

    const grid = new THREE.GridHelper(50,50,0x334,0x224);
    grid.material.opacity = 0.2; grid.material.transparent = true;
    scene.add(grid);

    // --- Colors ---
    const css = getComputedStyle(document.documentElement);
    const colorVars = [
        css.getPropertyValue('--c1').trim(),
        css.getPropertyValue('--c2').trim(),
        css.getPropertyValue('--c3').trim(),
        css.getPropertyValue('--c4').trim()
    ];

    // === Radius mapping ===
    // Physical radius in AU (rough scalings). Used for the star cores.
    function physicalRadiusAU(m){
        const R_SUN_AU=0.00465047;
        const M_JUP_MSUN=0.000954588;
        const R_JUP_AU=R_SUN_AU*0.10045;
        const M_EARTH_MSUN=3.003e-6;
        const R_EARTH_AU=R_SUN_AU/109.0;

        if (!Number.isFinite(m) || m<=0) m = M_EARTH_MSUN;

        if (m >= 0.1) {                 // main-sequence-ish stars
            return R_SUN_AU*Math.pow(m,0.8);
        } else if (m >= M_JUP_MSUN) {   // giants/brown dwarfs ~flat radius
            const mj = m/M_JUP_MSUN;
            return R_JUP_AU*Math.pow(mj,0.03);
        } else if (m >= M_EARTH_MSUN) { // rocky/icy
            const me = m/M_EARTH_MSUN;
            return R_EARTH_AU*Math.pow(me,0.27);
        } else {
            return R_EARTH_AU*0.5;
        }
    }

    // Visual outer radius for all bodies (pretty shell for stars, actual for planet).
    function visualRadius(m){
        const r_au = physicalRadiusAU(m);
        const MAG = 200;     // AU -> scene units (visibility magnifier)
        const MIN = 0.03;    // floor
        const MAX = 0.60;    // cap
        const gamma = 0.9;   // gentle boost for small radii
        let vis = Math.pow(r_au * MAG, gamma);
        return Math.max(MIN, Math.min(MAX, vis));
    }

    // Star core radius (opaque) — two orders of magnitude smaller than the real scale.
    function coreRadius(m){
        const r_au = physicalRadiusAU(m);

        // Use the same AU->scene MAG so scale stays consistent with shells,
        // then shrink cores by 1e-2 (two orders of magnitude).
        const MAG = 200;
        const CORE_SCALE = 1e-2;   // <<— two orders of magnitude smaller

        // Keep a tiny visual floor so cores don’t disappear and a cap so
        // they remain well inside their translucent shells.
        const MIN = 0.005;
        const MAX = 0.20;

        const vis = r_au * MAG * CORE_SCALE;
        return Math.max(MIN, Math.min(MAX, vis));
    }

    // --- Body construction ---
    let bodies = [];   // array of { group, outer, core }
    let trails = [];   // array of { line, points }

    function clearBodies() {
        for (const b of bodies) scene.remove(b.group);
        for (const t of trails) scene.remove(t.line);
        bodies = [];
        trails = [];
    }

    function createBodies(n){
        clearBodies();

        const outerGeo = new THREE.SphereGeometry(1, 32, 32);
        const coreGeo  = new THREE.SphereGeometry(1, 32, 32);

        for (let i=0;i<n;i++){
            const baseColor = new THREE.Color(colorVars[i % colorVars.length] || '#ffffff');

            // outer shell material (will be translucent for stars, opaque for planet)
            const outerMat = new THREE.MeshPhysicalMaterial({
                color: baseColor,
                emissive: baseColor,
                emissiveIntensity: 0.55,
                roughness: 0.35,
                metalness: 0.1,
                transparent: true,  // default; may be turned off for planet
                opacity: 0.35,
                clearcoat: 0.3
            });

            const outer = new THREE.Mesh(outerGeo, outerMat);

            // core material (opaque, bright)
            const coreMat = new THREE.MeshPhysicalMaterial({
                color: baseColor,
                emissive: baseColor,
                emissiveIntensity: 0.9,
                roughness: 0.2,
                metalness: 0.0,
                transparent: false,
                opacity: 1.0
            });
            const core = new THREE.Mesh(coreGeo, coreMat);
            core.visible = true;

            const group = new THREE.Group();
            group.add(outer);
            group.add(core);
            scene.add(group);

            // trail
            const geom=new THREE.BufferGeometry();
            const seed=new Float32Array([0,0,0]);
            geom.setAttribute('position', new THREE.BufferAttribute(seed,3));
            const lmat=new THREE.LineBasicMaterial({ color: baseColor, transparent:true, opacity:0.9 });
            const line=new THREE.Line(geom,lmat);
            scene.add(line);

            bodies.push({ group, outer, core });
            trails.push({ line, points: Array.from(seed) });
        }
    }

    // Decide which body is the planet: choose the smallest mass.
    function planetIndex(masses){
        let idx = 0, min = masses[0];
        for (let i=1;i<masses.length;i++) if (masses[i] < min){ min = masses[i]; idx = i; }
        return idx;
    }

    function setMasses(masses){
        const pIdx = planetIndex(masses);

        for (let i=0;i<masses.length;i++){
            const m = masses[i];
            const isPlanet = (i === pIdx);

            // outer size
            const Rvis = visualRadius(m);
            bodies[i].outer.scale.set(Rvis, Rvis, Rvis);

            if (isPlanet){
                // Planet: make fully opaque, hide core
                bodies[i].outer.material.transparent = false;
                bodies[i].outer.material.opacity = 1.0;
                bodies[i].outer.material.metalness = 0.2;
                bodies[i].outer.material.roughness = 0.4;
                bodies[i].core.visible = false;
            } else {
                // Star: translucent outer shell + opaque core at “real” scale
                bodies[i].outer.material.transparent = true;
                bodies[i].outer.material.opacity = 0.35;
                bodies[i].core.visible = true;

                const Rc = coreRadius(m);
                bodies[i].core.scale.set(Rc, Rc, Rc);
            }
        }
    }

    function setPositions(pos){
        for (let i=0;i<pos.length;i++)
            bodies[i].group.position.set(pos[i][0],pos[i][1],pos[i][2]);
    }

    function resetTrails(pos){
        for(let i=0;i<pos.length;i++){
            trails[i].points=[pos[i][0],pos[i][1],pos[i][2]];
            trails[i].line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(trails[i].points,3));
        }
    }

    function updateTrail(i,x,y,z,maxLen){
        const t=trails[i];
        t.points.push(x,y,z);
        if (t.points.length/3>maxLen) t.points.splice(0,3);
        t.line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(t.points,3));
    }

    // --- Resize / post FX ---
    addEventListener('resize', ()=>{
        camera.aspect = innerWidth/innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
        composer.setSize(innerWidth, innerHeight);
    });

    const composer=new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene,camera));
    const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),0.6,0.9,0.2);
    composer.addPass(bloom);

    function render(){
        // keep star sphere centered on camera so it rotates with orbit controls (no parallax)
        sky.position.copy(camera.position);
        composer.render();
    }

    return {
        createBodies,
        setMasses,
        setPositions,
        resetTrails,
        updateTrail,
        render,
        // expose groups so existing tests (reading .position) keep working
        get bodies(){ return bodies.map(b => b.group); }
    };
}