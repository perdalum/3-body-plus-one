export const $ = id => document.getElementById(id);

export function bindInputs(params) {
    const n = params.masses.length;
    for (let i=0;i<n;i++){
        const s = String(i);
        if ($('m'+s)) $('m'+s).value = params.masses[i];
        if ($('x'+s)) $('x'+s).value = params.pos[i][0];
        if ($('y'+s)) $('y'+s).value = params.pos[i][1];
        if ($('z'+s)) $('z'+s).value = params.pos[i][2];
        if ($('vx'+s)) $('vx'+s).value = params.vel[i][0];
        if ($('vy'+s)) $('vy'+s).value = params.vel[i][1];
        if ($('vz'+s)) $('vz'+s).value = params.vel[i][2];
    }
    if ($('timescale')) $('timescale').value = params.timeScale;
    if ($('traillen')) $('traillen').value = params.trailLen;
    if ($('softening')) $('softening').value = params.softening;
}

export function readInputsIntoParams(params) {
    const n = params.masses.length;
    params.masses = Array.from({length:n}, (_,i)=> parseFloat($('m'+i).value));
    params.pos = Array.from({length:n}, (_,i)=> [parseFloat($('x'+i).value), parseFloat($('y'+i).value), parseFloat($('z'+i).value)]);
    params.vel = Array.from({length:n}, (_,i)=> [parseFloat($('vx'+i).value), parseFloat($('vy'+i).value), parseFloat($('vz'+i).value)]);
    params.timeScale = parseFloat($('timescale').value);
    params.trailLen = parseInt($('traillen').value);
    params.softening = parseFloat($('softening').value);
}

export function wireHUD({ onPause, onReset, onPreset, onTimescale, onTraillen, onSoftening, onCopyJSON, onSelfTest, onVisualPreset }) {
    $('pause').addEventListener('click', onPause);
    $('reset').addEventListener('click', onReset);
    $('timescale').addEventListener('input', onTimescale);
    $('traillen').addEventListener('input', onTraillen);
    $('softening').addEventListener('input', onSoftening);
    $('copyjson').addEventListener('click', onCopyJSON);
    document.querySelectorAll('[data-preset]').forEach(btn =>
        btn.addEventListener('click', e => onPreset(e.currentTarget.dataset.preset))
    );
    const toggleBtn = $('togglePanel'); const dashboard = $('dashboard');
    toggleBtn.addEventListener('click', () => {
        dashboard.classList.toggle('hidden');
        toggleBtn.textContent = dashboard.classList.contains('hidden') ? 'Show Controls' : 'Hide Controls';
    });
    $('selftest').addEventListener('click', onSelfTest);

    const vp = $('visualPreset');
    if (vp && onVisualPreset) vp.addEventListener('change', () => onVisualPreset(vp.value));

    // --- Keyboard shortcuts ---
    document.addEventListener('keydown', (e) => {
        // Ignore typing inside input/textarea
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        // (H) → Toggle HUD visibility
        if (e.key.toLowerCase() === 'h') {
            dashboard.classList.toggle('hidden');
            toggleBtn.textContent = dashboard.classList.contains('hidden') ? 'Show Controls' : 'Hide Controls';
        }

        // (Space) → Pause / Resume simulation
        if (e.code === 'Space') {
            e.preventDefault(); // prevent page scroll
            onPause?.();
        }
    });
}

export function populateVisualPresetOptions(presets, defaultKey){
    const vp = $('visualPreset'); if (!vp) return;
    vp.innerHTML = '';
    Object.entries(presets).forEach(([key, def]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = def.label || key;
        if (key === defaultKey) opt.selected = true;
        vp.appendChild(opt);
    });
}

export function setEnergyText(val) {
    $('energy').textContent = Number.isFinite(val) ? val.toExponential(6) : '—';
}
export function setSimTime(days) {
    const yrs = days / 365.25;
    $('simtime').textContent = `${days.toFixed(2)} d (${yrs.toFixed(4)} yr)`;
}

export function buildInitJSON(params) {
    const obj = { masses: params.masses, pos: params.pos, vel: params.vel, softening: params.softening };
    return JSON.stringify(obj, null, 2);
}

export async function copyJSONToClipboard(text) {
    const box = $('jsonbox');
    box.value = text; box.scrollTop = 0;
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            toast('Init JSON copied to clipboard');
        } else {
            box.focus(); box.select(); toast('Init JSON populated below — select & copy');
        }
    } catch {
        toast('Copy failed — JSON shown below for manual copy');
    }
}

export function toast(msg) {
    const t = document.createElement('div');
    t.className = 'badge'; t.textContent = msg;
    document.querySelector('.footer').appendChild(t);
    setTimeout(()=> t.remove(), 2200);
}

export function log(line){ const el = $('testlog'); el.textContent += `\n${line}`; el.scrollTop = el.scrollHeight; }
export function clearLog(){ $('testlog').textContent = ''; }
export function approxEqual(a,b,eps){ return Math.abs(a-b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)); }