
import { NBodyRK4, detectCollision, detectEscape } from './physics.js';
import { PRESETS } from './presets.js';
import { setupRenderer } from './renderer.js';
import { $, bindInputs, readInputsIntoParams, wireHUD, setEnergyText, setSimTime,
    buildInitJSON, copyJSONToClipboard, toast, log, clearLog, approxEqual, populateVisualPresetOptions } from './ui.js';


let params = {
    masses: [1.10, 0.95, 0.75, 3.003e-6],
    pos: [[-1.2,0,0],[0,0,0],[1.0,0.8,0],[0.25,0,0]],
    vel: [[0,0.006,0],[0,-0.008,0],[-0.006,0,0],[0,0.02,0]],
    timeScale: 5,
    trailLen: 3000,
    softening: 1e-6,
};

// Collision detection configuration
const COLLISION = {
    enabled: true,
    mode: 'core',   // 'core' | 'vdt'
    fudge: 1.2      // >1 gives safety margin against timestep skipping
};

// Escape detection configuration
const ESCAPE = {
    enabled: true,
    maxSepAU: 5.0,     // consider escape only beyond this CM distance
    fudge: 1.1,        // safety margin (>= 1.0)
    consecutive: 8     // require N consecutive frames to declare escape
};

// rolling counters per body
let escapeCounters = [0,0,0,0];

let engine = null;
let paused = false;
let simTimeDays = 0;

// Renderer now async (loads visual_config.json)
const R = await setupRenderer();

// Populate visual preset dropdown
{
    const info = R.getVisualConfig();
    populateVisualPresetOptions(info.presets, info.defaultKey);
}

function rebuildEngine() {
    readInputsIntoParams(params);
    R.createBodies(params.masses.length);

    engine = new NBodyRK4(params.masses, params.pos, params.vel, params.softening);
    setEnergyText(engine.energy());
    simTimeDays = 0; setSimTime(simTimeDays);
    escapeCounters = new Array(params.masses.length).fill(0);   // <— reset here

    R.setMasses(params.masses);
    R.setPositions(params.pos);
    R.resetTrails(params.pos);
}

function applyPreset(key) {
    const p = PRESETS[key];
    if (!p) { console.warn('[preset] unknown key:', key); return; }
    params = {
        ...params,
        masses: p.masses.map(x=>x),
        pos:    p.pos.map(r=>[r[0],r[1],r[2]]),
        vel:    p.vel.map(u=>[u[0],u[1],u[2]]),
    };
    bindInputs(params);
    rebuildEngine();
    paused = false;
}

bindInputs(params);
wireHUD({
    onPause: () => { paused = !paused; },
    onReset: rebuildEngine,
    onPreset: applyPreset,
    onTimescale: () => { params.timeScale = parseFloat($('timescale').value); },
    onTraillen: () => { params.trailLen  = parseInt($('traillen').value); },
    onSoftening: () => { params.softening = parseFloat($('softening').value); },
    onCopyJSON: () => { readInputsIntoParams(params); copyJSONToClipboard(buildInitJSON(params)); },
    onSelfTest: runSelfTests,
    onVisualPreset: (key) => {
        R.setVisualPreset(key);
        // Reapply current masses so shells/cores update to new preset’s scales/materials
        R.setMasses(params.masses);
    }
});

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

        const pos = engine.getPositions();
        R.setPositions(pos);
        for (let i=0;i<pos.length;i++) R.updateTrail(i, pos[i][0], pos[i][1], pos[i][2], params.trailLen);

        // After updating positions, check for collisions
        if (COLLISION.enabled) {
            const hit = detectCollision({
                engine,
                masses: params.masses,
                opts: (COLLISION.mode === 'vdt')
                    ? { mode:'vdt', fudge: COLLISION.fudge, dt } // dt = per-substep size you used above
                    : { mode:'core', fudge: COLLISION.fudge }
            });
            if (hit) {
                paused = true;
                log(`Collision detected between body ${hit.i+1} and ${hit.j+1} (sep=${hit.sep.toExponential(3)} AU, min=${hit.minSep.toExponential(3)} AU)`);
                // optional: quick visual nudge (pulse their materials)
                try {
                    const gi = R.bodies[hit.i], gj = R.bodies[hit.j];
                    gi.children?.forEach?.(child => child.material?.emissive?.offsetHSL(0, 0, 0.25));
                    gj.children?.forEach?.(child => child.material?.emissive?.offsetHSL(0, 0, 0.25));
                } catch {}
                // optional UX
                import('./ui.js').then(({ toast }) => toast(`Collision: ${hit.i+1} ↔ ${hit.j+1}. Simulation paused.`));
            }
        }

        // --- Escape detection (after positions/trails updated) ---
        if (ESCAPE.enabled) {
            const esc = detectEscape({
                engine,
                masses: params.masses,
                maxSepAU: ESCAPE.maxSepAU,
                fudge: ESCAPE.fudge
            });

            // decay all counters by 1 (don’t let stale positives linger)
            for (let i = 0; i < escapeCounters.length; i++) {
                escapeCounters[i] = Math.max(0, escapeCounters[i] - 1);
            }

            if (esc) {
                const k = esc.index;
                // reinforce the candidate body
                escapeCounters[k] = Math.min(ESCAPE.consecutive, escapeCounters[k] + 2);

                if (escapeCounters[k] >= ESCAPE.consecutive) {
                    paused = true;
                    const days = simTimeDays.toFixed(2);
                    log(`Escape detected: body ${k+1} at ${days} d — r_CM=${esc.rCM.toFixed(3)} AU, v=${esc.v.toExponential(3)} AU/day, v_esc=${esc.vEsc.toExponential(3)} AU/day`);

                    // optional: subtle visual cue (brighten emissive briefly)
                    try {
                        const g = R.bodies[k];
                        g.children?.forEach?.(child => child.material?.emissive?.offsetHSL(0, 0, 0.35));
                    } catch {}

                    toast(`Escape: body ${k+1}. Simulation paused.`);
                }
            }
        }

        if ((performance.now() % 250) < 16) { setEnergyText(engine.energy()); setSimTime(simTimeDays); }
    }
    R.render();
}

function runSelfTests(){
    clearLog(); log('Running tests…');

    const ids = [
        'm0','m1','m2','m3','x0','y0','z0','vx0','vy0','vz0',
        'x1','y1','z1','vx1','vy1','vz1',
        'x2','y2','z2','vx2','vy2','vz2',
        'x3','y3','z3','vx3','vy3','vz3',
        'timescale','traillen','softening',
        'legend1','legend2','legend3','legend4',
        'pause','reset','selftest','togglePanel','copyjson','jsonbox','simtime','visualPreset'
    ];
    const missing = ids.filter(id => !$(id));
    const pass0 = missing.length === 0;
    log(`Test 0 (DOM ids present): ${pass0 ? 'PASS' : 'FAIL'}${pass0 ? '' : ' missing=' + missing.join(',')}`);

    // Visual preset round-trip
    const vp = $('visualPreset'); const old = vp.value;
    vp.value = 'cinematic'; vp.dispatchEvent(new Event('change'));
    const changed = $('visualPreset').value === 'cinematic';
    log(`Test 1 (visual preset change event): ${changed ? 'PASS' : 'FAIL'}`);
    vp.value = old; vp.dispatchEvent(new Event('change'));

    // Physics sanity
    const P = PRESETS['figure8'];
    let eng = new NBodyRK4(P.masses, P.pos, P.vel, 1e-6);
    const E0 = eng.energy(); for (let i=0;i<200;i++) eng.step(0.01); const E1 = eng.energy();
    const rel = Math.abs((E1 - E0) / E0);
    const pass2 = rel < 1e-3;
    log(`Test 2 (energy drift < 1e-3): ${pass2 ? 'PASS' : 'FAIL'} (rel=${rel.toExponential(3)})`);

    // Preset write-through to inputs
    applyPreset('tristar-planet');
    const z3v = parseFloat($('z3').value);
    const expectedZ3 = PRESETS['tristar-planet'].pos[3][2];
    const pass3 = approxEqual(z3v, expectedZ3, 1e-12);
    log(`Test 3 (preset planet z -> inputs): ${pass3 ? 'PASS' : 'FAIL'} (z3=${z3v}, expected=${expectedZ3})`);

    // JSON parse
    const js = buildInitJSON(params);
    let parsedOk = false; try { JSON.parse(js); parsedOk = true } catch {}
    log(`Test 4 (init JSON parses): ${parsedOk ? 'PASS' : 'FAIL'}`);

    // Sim time format
    setSimTime(12.3456);
    const pass5 = $('simtime').textContent.includes('12.35 d');
    log(`Test 5 (simtime formats): ${pass5 ? 'PASS' : 'FAIL'}`);

    applyPreset('tristar-planet');
}

// Boot
applyPreset('tristar-planet');
bindInputs(params);
rebuildEngine();
frame();

// Show one-time hint for HUD shortcut
toast('Tip: Press H to hide/show the control panel');
toast('Shortcuts: [H] hide/show controls, [Space] pause/resume');
