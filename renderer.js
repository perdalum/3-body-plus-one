// renderer.js — N-body renderer with visual presets loaded from visual_config.json
// Plan B (local vendor): imports resolved via index.html import map
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const $ = id => document.getElementById(id);

// --- Physical radius in AU based on mass (rough scalings) ---
function physicalRadiusAU(m){
    const R_SUN_AU = 0.00465047;
    const M_JUP_MSUN = 0.000954588;
    const R_JUP_AU = R_SUN_AU * 0.10045;
    const M_EARTH_MSUN = 3.003e-6;
    const R_EARTH_AU = R_SUN_AU / 109.0;

    if (!Number.isFinite(m) || m <= 0) m = M_EARTH_MSUN;

    if (m >= 0.1) {                 // main sequence-ish
        return R_SUN_AU * Math.pow(m, 0.8);
    } else if (m >= M_JUP_MSUN) {   // brown dwarfs/giants ~flat radius
        const mj = m / M_JUP_MSUN;
        return R_JUP_AU * Math.pow(mj, 0.03);
    } else if (m >= M_EARTH_MSUN) { // rocky/icy
        const me = m / M_EARTH_MSUN;
        return R_EARTH_AU * Math.pow(me, 0.27);
    } else {
        return R_EARTH_AU * 0.5;      // tiny safety floor
    }
}

// The renderer now loads visual_config.json and supports multiple presets.
export async function setupRenderer() {
    // --- load visual config JSON ---
    const cfg = await fetch('./visual_config.json').then(r => r.json());
    let currentPresetKey = cfg.default_preset || Object.keys(cfg.presets)[0];
    let C = cfg.presets[currentPresetKey];

    const app = $('app');
    const scene = new THREE.Scene();

    // --- Starfield texture based on current preset C ---
    function makeStarTexture(){
        const [w,h] = C.starfield.canvas_size;
        const count = C.starfield.count;
        const variation = C.starfield.brightness_variation;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0,0,w,h);
        for (let i=0;i<count;i++){
            const x = Math.random()*w, y = Math.random()*h, r = Math.random()*1.2 + 0.2;
            const a = 0.6 + variation*Math.random();
            const hue = 210 + 60*(Math.random()-0.5);
            g.fillStyle = `hsla(${hue},80%,${70+20*(Math.random()-0.5)}%,${a})`;
            g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill();
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 8;
        return tex;
    }

    let starTex = makeStarTexture();
    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(1000,64,64),
        new THREE.MeshBasicMaterial({ map: starTex, side: THREE.BackSide, depthWrite:false })
    );
    scene.add(sky);

    // --- Camera / renderer ---
    const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.01, 2000);
    camera.position.set(0,5,18);

    const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.setSize(innerWidth, innerHeight);
    app.appendChild(renderer.domElement);

    // --- Controls (initialized from preset) ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = C.orbit_controls?.damping ?? 0.08;
    controls.rotateSpeed   = C.orbit_controls?.rotate_speed ?? 0.7;
    controls.zoomSpeed     = C.orbit_controls?.zoom_speed ?? 0.8;
    controls.panSpeed      = C.orbit_controls?.pan_speed ?? 0.5;

    // --- Lights (intensities from preset) ---
    const ambL  = new THREE.AmbientLight(0xffffff, C.lighting.ambient_intensity); scene.add(ambL);
    const keyL  = new THREE.PointLight(0xffffff, C.lighting.key_light_intensity);  keyL.position.set(10,10,10);   scene.add(keyL);
    const fillL = new THREE.PointLight(0xffffff, C.lighting.fill_light_intensity); fillL.position.set(-10,-10,-5); scene.add(fillL);

    // --- Grid helper (subtle) ---
    const grid = new THREE.GridHelper(50,50,0x334,0x224);
    grid.material.opacity = 0.2; grid.material.transparent = true;
    scene.add(grid);

    // --- Theme colors from CSS variables ---
    const css = getComputedStyle(document.documentElement);
    const colorVars = [
        css.getPropertyValue('--c1').trim(),
        css.getPropertyValue('--c2').trim(),
        css.getPropertyValue('--c3').trim(),
        css.getPropertyValue('--c4').trim()
    ];

    // --- Bodies & trails containers ---
    let bodies = [];   // [{ group, outer, core }]
    let trails = [];   // [{ line, points }]

    function clearBodies() {
        for (const b of bodies) scene.remove(b.group);
        for (const t of trails) scene.remove(t.line);
        bodies = [];
        trails = [];
    }

    // Choose "planet" as the smallest-mass body (for opacity/material)
    function planetIndex(masses){
        let idx = 0, min = masses[0];
        for (let i=1;i<masses.length;i++) if (masses[i] < min){ min = masses[i]; idx = i; }
        return idx;
    }

    // --- Scaling helpers from preset C ---
    const auToScene = v => v * C.scaling.au_to_scene;

    function visualRadius(m){
        // Used for planet sizing (stars use fixed shell radius from config)
        const r_au = physicalRadiusAU(m);
        const MAG = C.scaling.au_to_scene;
        const MIN = C.scaling.min_visible_radius;
        const MAX = C.scaling.max_visible_radius;
        const gamma = C.scaling.gamma;
        let vis = Math.pow(r_au * MAG, gamma);
        return Math.max(MIN, Math.min(MAX, vis));
    }

    function coreRadius(m){
        // Opaque star core: physical scale reduced by core_scale_factor
        const r_au = physicalRadiusAU(m);
        const MAG = C.scaling.au_to_scene;
        const vis = r_au * MAG * C.scaling.core_scale_factor;
        const MIN = Math.min(C.scaling.min_visible_radius, 0.02);
        const MAX = Math.min(C.scaling.max_visible_radius * 0.7, 0.45);
        return Math.max(MIN, Math.min(MAX, vis));
    }

    // --- Body construction ---
    function createBodies(n){
        clearBodies();

        const outerGeo = new THREE.SphereGeometry(1, 32, 32);
        const coreGeo  = new THREE.SphereGeometry(1, 32, 32);

        for (let i=0;i<n;i++){
            const baseColor = new THREE.Color(colorVars[i % colorVars.length] || '#ffffff');

            // star/planet outer material (tuned per-type in setMasses)
            const outerMat = new THREE.MeshPhysicalMaterial({
                color: baseColor,
                emissive: baseColor,
                emissiveIntensity: C.materials.stars.emissive_intensity, // will be overridden for planet
                roughness: C.materials.stars.roughness,
                metalness: C.materials.stars.metalness,
                clearcoat: C.materials.stars.clearcoat,
                transparent: true,
                opacity: C.materials.stars.opacity
            });
            const outer = new THREE.Mesh(outerGeo, outerMat);

            // stellar core (opaque, bright); hidden for planet
            const coreMat = new THREE.MeshPhysicalMaterial({
                color: baseColor,
                emissive: baseColor,
                emissiveIntensity: C.materials.cores.emissive_intensity,
                roughness: C.materials.cores.roughness,
                metalness: C.materials.cores.metalness,
                transparent: false,
                opacity: C.materials.cores.opacity
            });
            const core = new THREE.Mesh(coreGeo, coreMat);

            const group = new THREE.Group();
            group.add(outer);
            group.add(core);
            scene.add(group);

            // trail
            const geom = new THREE.BufferGeometry();
            const seed = new Float32Array([0,0,0]);
            geom.setAttribute('position', new THREE.BufferAttribute(seed,3));
            const lmat = new THREE.LineBasicMaterial({ color: baseColor, transparent:true, opacity:0.9 });
            const line = new THREE.Line(geom,lmat);
            scene.add(line);

            bodies.push({ group, outer, core });
            trails.push({ line, points: Array.from(seed) });
        }
    }

    function setMasses(masses){
        const pIdx = planetIndex(masses);
        for (let i=0;i<masses.length;i++){
            const m = masses[i];
            const isPlanet = (i === pIdx);

            if (isPlanet){
                // Planet: fully opaque single sphere (outer), no core
                const mat = bodies[i].outer.material;
                mat.transparent = false;
                mat.opacity = C.materials.planet.opacity;
                mat.roughness = C.materials.planet.roughness;
                mat.metalness = C.materials.planet.metalness;
                mat.emissiveIntensity = C.materials.planet.emissive_intensity;

                bodies[i].core.visible = false;

                const Rp = visualRadius(m);
                bodies[i].outer.scale.set(Rp, Rp, Rp);
            } else {
                // Star: translucent shell at fixed radius from config (e.g. 0.1 AU in "realistic")
                const shellR = auToScene(C.scaling.shell_radius_au);
                bodies[i].outer.scale.set(shellR, shellR, shellR);

                const mat = bodies[i].outer.material;
                mat.transparent = true;
                mat.opacity = C.materials.stars.opacity;
                mat.roughness = C.materials.stars.roughness;
                mat.metalness = C.materials.stars.metalness;
                mat.clearcoat = C.materials.stars.clearcoat;
                mat.emissiveIntensity = C.materials.stars.emissive_intensity;

                // Opaque core at reduced physical scale
                const Rc = coreRadius(m);
                bodies[i].core.visible = true;
                bodies[i].core.scale.set(Rc, Rc, Rc);
                bodies[i].core.material.opacity = C.materials.cores.opacity;
                bodies[i].core.material.roughness = C.materials.cores.roughness;
                bodies[i].core.material.metalness = C.materials.cores.metalness;
                bodies[i].core.material.emissiveIntensity = C.materials.cores.emissive_intensity;
            }
        }
    }

    function setPositions(pos){
        for (let i=0;i<pos.length;i++)
            bodies[i].group.position.set(pos[i][0], pos[i][1], pos[i][2]);
    }

    function resetTrails(pos){
        for(let i=0;i<pos.length;i++){
            trails[i].points = [pos[i][0], pos[i][1], pos[i][2]];
            trails[i].line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(trails[i].points,3));
        }
    }

    function updateTrail(i,x,y,z,maxLen){
        const t = trails[i];
        t.points.push(x,y,z);
        if (t.points.length/3 > maxLen) t.points.splice(0,3);
        t.line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(t.points,3));
    }

    // --- Resize & post-processing ---
    addEventListener('resize', ()=>{
        camera.aspect = innerWidth/innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
        composer.setSize(innerWidth, innerHeight);
    });

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
        new THREE.Vector2(innerWidth, innerHeight),
        C.lighting.bloom_strength,
        C.lighting.bloom_radius,
        C.lighting.bloom_threshold
    );
    composer.addPass(bloom);

    function render(){
        // keep sky centered so it rotates with camera without parallax
        sky.position.copy(camera.position);
        composer.render();
    }

    // --- Hot-swap visual preset at runtime (HUD calls this) ---
    function setVisualPreset(name){
        if (!cfg.presets[name]) return;
        currentPresetKey = name;
        C = cfg.presets[name];

        // Lights
        ambL.intensity  = C.lighting.ambient_intensity;
        keyL.intensity  = C.lighting.key_light_intensity;
        fillL.intensity = C.lighting.fill_light_intensity;

        // Bloom
        bloom.strength  = C.lighting.bloom_strength;
        bloom.radius    = C.lighting.bloom_radius;
        bloom.threshold = C.lighting.bloom_threshold;

        // Controls feel
        controls.dampingFactor = C.orbit_controls?.damping ?? controls.dampingFactor;
        controls.rotateSpeed   = C.orbit_controls?.rotate_speed ?? controls.rotateSpeed;
        controls.zoomSpeed     = C.orbit_controls?.zoom_speed ?? controls.zoomSpeed;
        controls.panSpeed      = C.orbit_controls?.pan_speed ?? controls.panSpeed;

        // Starfield
        const newTex = makeStarTexture();
        if (starTex && starTex.dispose) starTex.dispose();
        starTex = newTex;
        sky.material.map = starTex;
        sky.material.needsUpdate = true;

        // Shell/core sizes & materials are updated by caller via setMasses(currentMasses)
    }

    function getVisualConfig(){
        return { presets: cfg.presets, defaultKey: currentPresetKey };
    }

    return {
        // lifecycle & drawing
        createBodies, setMasses, setPositions, resetTrails, updateTrail, render,
        // expose groups so existing code/tests reading .position keep working
        get bodies(){ return bodies.map(b => b.group); },
        // visual config control
        setVisualPreset, getVisualConfig
    };
}