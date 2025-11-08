import * as THREE from 'https://esm.sh/three@0.162.0';
import { OrbitControls } from 'https://esm.sh/three@0.162.0/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'https://esm.sh/three@0.162.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.162.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.162.0/examples/jsm/postprocessing/UnrealBloomPass.js';

const $ = id => document.getElementById(id);

export function setupRenderer() {
    const app = $('app');
    const scene = new THREE.Scene();

    function makeStarTexture({w=4096,h=2048,count=14000}={}){
        const c=document.createElement('canvas'); c.width=w; c.height=h;
        const g=c.getContext('2d'); g.fillStyle='#000'; g.fillRect(0,0,w,h);
        for (let i=0;i<count;i++){ const x=Math.random()*w,y=Math.random()*h,r=Math.random()*1.2+0.2,a=0.6+0.4*Math.random();
            const hue=210+60*(Math.random()-0.5); g.fillStyle=`hsla(${hue},80%,${70+20*(Math.random()-0.5)}%,${a})`;
            g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill(); }
        const tex=new THREE.CanvasTexture(c); tex.wrapS=THREE.RepeatWrapping; tex.wrapT=THREE.ClampToEdgeWrapping; tex.anisotropy=8; return tex;
    }

    const starTex = makeStarTexture();
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(1000,64,64),
        new THREE.MeshBasicMaterial({ map: starTex, side: THREE.BackSide, depthWrite:false })
    );
    scene.add(sky);

    const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.01, 2000);
    camera.position.set(0,5,18);

    const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.setSize(innerWidth, innerHeight);
    app.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08; controls.rotateSpeed = 0.7; controls.zoomSpeed = 0.8; controls.panSpeed = 0.5;

    scene.add(new THREE.AmbientLight(0xffffff,0.5));
    const keyL = new THREE.PointLight(0xffffff,1.2); keyL.position.set(10,10,10); scene.add(keyL);
    const fillL = new THREE.PointLight(0xffffff,0.6); fillL.position.set(-10,-10,-5); scene.add(fillL);

    const grid = new THREE.GridHelper(50,50,0x334,0x224);
    grid.material.opacity = 0.2; grid.material.transparent = true;
    scene.add(grid);

    const css = getComputedStyle(document.documentElement);
    const colorVars = [css.getPropertyValue('--c1').trim(), css.getPropertyValue('--c2').trim(),
        css.getPropertyValue('--c3').trim(), css.getPropertyValue('--c4').trim()];

    let bodies = [];
    let trails = [];

    function clearBodies() {
        for (const m of bodies) scene.remove(m);
        for (const t of trails) scene.remove(t.line);
        bodies = [];
        trails = [];
    }

    // Physically inspired mass -> radius mapping (with magnification & clamps)
    function massToRadius(m){
        const R_SUN_AU=0.00465047, M_JUP_MSUN=0.000954588, R_JUP_AU=R_SUN_AU*0.10045, M_EARTH_MSUN=3.003e-6, R_EARTH_AU=R_SUN_AU/109.0;
        if (!Number.isFinite(m) || m<=0) m=M_EARTH_MSUN;
        let r_au;
        if (m>=0.1) r_au=R_SUN_AU*Math.pow(m,0.8);
        else if (m>=M_JUP_MSUN){ const mj=m/M_JUP_MSUN; r_au=R_JUP_AU*Math.pow(mj,0.03); }
        else if (m>=M_EARTH_MSUN){ const me=m/M_EARTH_MSUN; r_au=R_EARTH_AU*Math.pow(me,0.27); }
        else r_au=R_EARTH_AU*0.5;
        const MAG=200, MIN=0.03, MAX=0.60, gamma=0.9;
        let vis=Math.pow(r_au*MAG, gamma);
        return Math.max(MIN, Math.min(MAX, vis));
    }

    function createBodies(n) {
        clearBodies();
        for (let i=0;i<n;i++){
            const geo=new THREE.SphereGeometry(1,32,32);
            const col = new THREE.Color(colorVars[i % colorVars.length] || '#ffffff');
            const mat=new THREE.MeshPhysicalMaterial({ roughness:0.35, metalness:0.1, color:col, emissive:col, emissiveIntensity:0.6, clearcoat:0.3 });
            const mesh=new THREE.Mesh(geo,mat); scene.add(mesh); bodies.push(mesh);

            const geom=new THREE.BufferGeometry(); const seed=new Float32Array([0,0,0]);
            geom.setAttribute('position', new THREE.BufferAttribute(seed,3));
            const lmat=new THREE.LineBasicMaterial({ color: col, transparent:true, opacity:0.9 });
            const line=new THREE.Line(geom,lmat); scene.add(line); trails.push({ line, points:Array.from(seed) });
        }
    }

    function setMasses(masses){ for (let i=0;i<masses.length;i++){ const R=massToRadius(masses[i]); bodies[i].scale.set(R,R,R); } }
    function setPositions(pos){ for (let i=0;i<pos.length;i++) bodies[i].position.set(pos[i][0],pos[i][1],pos[i][2]); }
    function resetTrails(pos){
        for(let i=0;i<pos.length;i++){ trails[i].points=[pos[i][0],pos[i][1],pos[i][2]];
            trails[i].line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(trails[i].points,3)); }
    }
    function updateTrail(i,x,y,z,maxLen){
        const t=trails[i]; t.points.push(x,y,z); if (t.points.length/3>maxLen) t.points.splice(0,3);
        t.line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(t.points,3));
    }

    addEventListener('resize', ()=>{
        camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
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
        createBodies, setMasses, setPositions, resetTrails, updateTrail, render,
        get bodies(){ return bodies; }
    };
}