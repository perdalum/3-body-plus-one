// ui.js — inputs, buttons, HUD, tests
export const $ = id => document.getElementById(id);

export function bindInputs(params) {
    ['m0','m1','m2'].forEach((id,i)=> $(id).value = params.masses[i]);
    ['x0','x1','x2'].forEach((id,i)=> $(id).value = params.pos[i][0]);
    ['y0','y1','y2'].forEach((id,i)=> $(id).value = params.pos[i][1]);
    ['z0','z1','z2'].forEach((id,i)=> $(id).value = params.pos[i][2]);
    ['vx0','vx1','vx2'].forEach((id,i)=> $(id).value = params.vel[i][0]);
    ['vy0','vy1','vy2'].forEach((id,i)=> $(id).value = params.vel[i][1]);
    ['vz0','vz1','vz2'].forEach((id,i)=> $(id).value = params.vel[i][2]);
    $('timescale').value = params.timeScale;
    $('traillen').value = params.trailLen;
    $('softening').value = params.softening;
}

export function readInputsIntoParams(params) {
    params.masses = ['m0','m1','m2'].map(id=> parseFloat($(id).value));
    params.pos = [0,1,2].map(i=> [parseFloat($('x'+i).value), parseFloat($('y'+i).value), parseFloat($('z'+i).value)]);
    params.vel = [0,1,2].map(i=> [parseFloat($('vx'+i).value), parseFloat($('vy'+i).value), parseFloat($('vz'+i).value)]);
    params.timeScale = parseFloat($('timescale').value);
    params.trailLen = parseInt($('traillen').value);
    params.softening = parseFloat($('softening').value);
}

export function wireHUD({ onPause, onReset, onPreset, onTimescale, onTraillen, onSoftening, onCopyJSON, onSelfTest }) {
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