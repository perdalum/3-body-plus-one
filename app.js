// app.js — orchestrates physics, renderer, and UI
import { ThreeBodyRK4_3D } from './physics.js';
import { PRESETS } from './presets.js';
import { setupRenderer } from './renderer.js';
import { $, bindInputs, readInputsIntoParams, wireHUD, setEnergyText, setSimTime,
    buildInitJSON, copyJSONToClipboard, log, clearLog, approxEqual } from './ui.js';

const params = {
    masses: [1, 0.001, 0.001],
    pos: [[0,0,0],[1,0,0],[5.2,0,0]],
    vel: [[0,0,0],[0,0.0172,0],[0,0.0074,0]],
    timeScale: 5,
    trailLen: 2500,
    softening: 1e-6,
};

let engine = null;
let paused = false;
let simTimeDays = 0;

// Renderer
const R = setupRenderer();

function rebuildEngine() {
    readInputsIntoParams(params);
    engine = new ThreeBodyRK4_3D(params.masses, params.pos, params.vel, params.softening);
    setEnergyText(engine.energy());
    simTimeDays = 0; setSimTime(simTimeDays);

    // visuals
    R.setMasses(params.masses);
    R.setPositions(params.pos);
    R.resetTrails(params.pos);
}

function applyPreset(key) {
    const p = PRESETS[key];
    if (!p) { console.warn('[preset] unknown key:', key); return; }
    params.masses = p.masses.map(x=>x);
    params.pos    = p.pos.map(r=>[r[0],r[1],r[2]]);
    params.vel    = p.vel.map(u=>[u[0],u[1],u[2]]);
    bindInputs(params);
    rebuildEngine();
    paused = false;
}

// HUD
bindInputs(params);
wireHUD({
    onPause: () => { paused = !paused; },
    onReset: rebuildEngine,
    onPreset: applyPreset,
    onTimescale: () => { params.timeScale = parseFloat($('timescale').value); },
    onTraillen: () => { params.trailLen  = parseInt($('traillen').value); },
    onSoftening: () => { params.softening = parseFloat($('softening').value); },
    onCopyJSON: () => {
        // Always read latest input values before generating JSON
        readInputsIntoParams(params);
        copyJSONToClipboard(buildInitJSON(params));
    },
    onSelfTest: runSelfTests
});

// Animation
const clock = new (window.THREE?.Clock ?? class { constructor(){this.t=performance.now()/1000} getDelta(){const n=performance.now()/1000; const d=n-this.t; this.t=n; return d;} })();

function frame() {
    requestAnimationFrame(frame);
    const delta = clock.getDelta();

    if (engine && !paused) {
        const subSteps = 4;
        const dt = (delta * params.timeScale) / subSteps;
        let advanced = 0;
        for (let i=0;i<subSteps;i++) { engine.step(dt); advanced += dt; }
        simTimeDays += advanced;

        const s = engine.state;
        const pos = [[s[0],s[1],s[2]],[s[3],s[4],s[5]],[s[6],s[7],s[8]]];
        R.setPositions(pos);
        for (let i=0;i<3;i++) R.updateTrail(i, pos[i][0], pos[i][1], pos[i][2], params.trailLen);

        // periodic HUD updates
        if ((performance.now() % 250) < 16) { setEnergyText(engine.energy()); setSimTime(simTimeDays); }
    }

    R.render();
}

// Self-tests
function runSelfTests(){
    clearLog(); log('Running tests…');

    const ids = ['m0','m1','m2','x0','y0','z0','vx0','vy0','vz0','timescale','traillen','softening','legend1','legend2','legend3','pause','reset','selftest','togglePanel','copyjson','jsonbox','simtime'];
    const missing = ids.filter(id => !$(id));
    const pass0 = missing.length === 0;
    log(`Test 0 (DOM ids present): ${pass0 ? 'PASS' : 'FAIL'}${pass0 ? '' : ' missing=' + missing.join(',')}`);

    // energy drift sanity with figure-8
    const P = PRESETS['figure8'];
    const eng = new ThreeBodyRK4_3D(P.masses, P.pos, P.vel, 1e-6);
    const E0 = eng.energy(); for (let i=0;i<200;i++) eng.step(0.01); const E1 = eng.energy();
    const rel = Math.abs((E1 - E0) / E0);
    const pass1 = rel < 1e-3;
    log(`Test 1 (energy drift < 1e-3): ${pass1 ? 'PASS' : 'FAIL'} (rel=${rel.toExponential(3)})`);

    // preset write-through to inputs
    applyPreset('triangle');
    const z0v = parseFloat($('z0').value);
    const expectedZ0 = PRESETS['triangle'].pos[0][2];
    const pass2 = approxEqual(z0v, expectedZ0, 1e-12);
    log(`Test 2 (preset z -> inputs): ${pass2 ? 'PASS' : 'FAIL'} (z0=${z0v}, expected=${expectedZ0})`);

    rebuildEngine();
    const meshX = R.bodies[0].position.x;
    const expectedX0 = PRESETS['triangle'].pos[0][0];
    const pass3 = approxEqual(meshX, expectedX0, 1e-12);
    log(`Test 3 (rebuild -> mesh.x): ${pass3 ? 'PASS' : 'FAIL'} (x=${meshX})`);

    // JSON parse
    const js = buildInitJSON(params);
    let parsedOk = false; try { JSON.parse(js); parsedOk = true } catch {}
    log(`Test 4 (init JSON parses): ${parsedOk ? 'PASS' : 'FAIL'}`);

    // sim time format
    setSimTime(12.3456);
    const pass5 = $('simtime').textContent.includes('12.35 d');
    log(`Test 5 (simtime formats): ${pass5 ? 'PASS' : 'FAIL'}`);

    // restore default preset
    applyPreset('sun-earth-jupiter');
}

// Boot
applyPreset('sun-earth-jupiter');
bindInputs(params);
rebuildEngine();
frame();