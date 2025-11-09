// physics.js — N-body RK4 integrator & constants (AU, day, M☉)
export const G = 2.959122082855911e-4; // AU^3 / (Msun * day^2)

export class NBodyRK4 {
    constructor(masses, pos, vel, softening = 1e-6) {
        const n = masses.length;
        this.n = n;
        this.m = Float64Array.from(masses);
        this.state = new Float64Array(6 * n); // [x... y... z... vx... vy... vz...]
        for (let i = 0; i < n; i++) {
            this.state[3*i+0] = pos[i][0];
            this.state[3*i+1] = pos[i][1];
            this.state[3*i+2] = pos[i][2];
            this.state[3*n + 3*i + 0] = vel[i][0];
            this.state[3*n + 3*i + 1] = vel[i][1];
            this.state[3*n + 3*i + 2] = vel[i][2];
        }
        this.soft2 = softening * softening;
    }

    deriv(out, s) {
        const n = this.n;
        // positions' derivatives = velocities
        for (let i=0;i<3*n;i++) out[i] = s[3*n + i];

        // accelerations
        for (let i=0;i<n;i++) {
            let ax=0, ay=0, az=0;
            const xi = s[3*i], yi = s[3*i+1], zi = s[3*i+2];
            for (let j=0;j<n;j++) if (j!==i) {
                const xj=s[3*j], yj=s[3*j+1], zj=s[3*j+2];
                const dx=xi-xj, dy=yi-yj, dz=zi-zj;
                const r2 = dx*dx + dy*dy + dz*dz + this.soft2;
                const invR3 = 1.0 / Math.pow(r2, 1.5);
                const f = -G * this.m[j] * invR3;
                ax += f * dx; ay += f * dy; az += f * dz;
            }
            out[3*n + 3*i + 0] = ax;
            out[3*n + 3*i + 1] = ay;
            out[3*n + 3*i + 2] = az;
        }
    }

    step(dt) {
        const n6 = 6*this.n, s=this.state;
        const k1=new Float64Array(n6), k2=new Float64Array(n6),
            k3=new Float64Array(n6), k4=new Float64Array(n6);
        this.deriv(k1, s);
        const s2=new Float64Array(n6); for (let i=0;i<n6;i++) s2[i]=s[i]+0.5*dt*k1[i];
        this.deriv(k2, s2);
        const s3=new Float64Array(n6); for (let i=0;i<n6;i++) s3[i]=s[i]+0.5*dt*k2[i];
        this.deriv(k3, s3);
        const s4=new Float64Array(n6); for (let i=0;i<n6;i++) s4[i]=s[i]+dt*k3[i];
        this.deriv(k4, s4);
        for (let i=0;i<n6;i++) s[i] += (dt/6)*(k1[i] + 2*k2[i] + 2*k3[i] + k4[i]);
    }

    energy() {
        const n=this.n, s=this.state, m=this.m;
        let K=0;
        for (let i=0;i<n;i++) {
            const vx=s[3*n+3*i], vy=s[3*n+3*i+1], vz=s[3*n+3*i+2];
            K += 0.5*m[i]*(vx*vx+vy*vy+vz*vz);
        }
        let U=0;
        for (let i=0;i<n;i++) for (let j=i+1;j<n;j++) {
            const dx=s[3*i]-s[3*j], dy=s[3*i+1]-s[3*j+1], dz=s[3*i+2]-s[3*j+2];
            const r=Math.sqrt(dx*dx+dy*dy+dz*dz + this.soft2);
            U += -G * m[i]*m[j] / r;
        }
        return K + U;
    }

    getPositions() {
        const n=this.n, s=this.state;
        const out = new Array(n);
        for (let i=0;i<n;i++) out[i] = [s[3*i], s[3*i+1], s[3*i+2]];
        return out;
    }
}

// --- Helpers you can reuse elsewhere (AU, day, M☉) ---

// Physical radius in AU based on mass (same logic as renderer, but kept in physics land)
export function physicalRadiusAU(m){
    const R_SUN_AU = 0.00465047;
    const M_JUP_MSUN = 0.000954588;
    const R_JUP_AU = R_SUN_AU * 0.10045;
    const M_EARTH_MSUN = 3.003e-6;
    const R_EARTH_AU = R_SUN_AU / 109.0;

    if (!Number.isFinite(m) || m <= 0) m = M_EARTH_MSUN;
    if (m >= 0.1) {                 // main-sequence-ish
        return R_SUN_AU * Math.pow(m, 0.8);
    } else if (m >= M_JUP_MSUN) {   // brown dwarfs/giants ~flat radius
        const mj = m / M_JUP_MSUN;
        return R_JUP_AU * Math.pow(mj, 0.03);
    } else if (m >= M_EARTH_MSUN) { // rocky/icy
        const me = m / M_EARTH_MSUN;
        return R_EARTH_AU * Math.pow(me, 0.27);
    } else {
        return R_EARTH_AU * 0.5;
    }
}

/**
 * Detect the first pairwise collision in the current state.
 * You can choose one of two radius models:
 *  - { mode: 'core',    fudge: 1.2 }     → uses physical core radii (AU) * fudge
 *  - { mode: 'vdt',     fudge: 1.0, dt } → uses |v| * dt (per body) * fudge
 *
 * @param {{engine:NBodyRK4, masses:number[], opts?:{mode:'core'|'vdt', fudge?:number, dt?:number}}} args
 * @returns {null | {i:number, j:number, sep:number, minSep:number}}
 */
export function detectCollision({ engine, masses, opts = { mode:'core', fudge:1.2 } }) {
    const n = masses.length;
    const s = engine.state; // [x... y... z... vx... vy... vz...]
    const N3 = 3 * n;

    // build radii (AU) per body
    const r = new Float64Array(n);
    const fudge = Number.isFinite(opts.fudge) ? opts.fudge : 1.2;

    if (opts.mode === 'vdt') {
        const dt = Number.isFinite(opts.dt) ? opts.dt : 0; // caller must provide dt if using 'vdt'
        for (let i=0;i<n;i++){
            const vx = s[N3 + 3*i + 0], vy = s[N3 + 3*i + 1], vz = s[N3 + 3*i + 2];
            const v  = Math.hypot(vx, vy, vz);
            r[i] = v * dt * fudge; // AU
        }
    } else {
        // 'core' model: use physical radii with a safety fudge (accounts for discrete timestep)
        for (let i=0;i<n;i++) r[i] = physicalRadiusAU(masses[i]) * fudge;
    }

    // pairwise check (O(n^2))
    for (let i=0;i<n;i++){
        const xi = s[3*i], yi = s[3*i+1], zi = s[3*i+2];
        for (let j=i+1;j<n;j++){
            const dx = xi - s[3*j], dy = yi - s[3*j+1], dz = zi - s[3*j+2];
            const sep = Math.hypot(dx, dy, dz);
            const minSep = r[i] + r[j];
            if (sep < minSep) return { i, j, sep, minSep };
        }
    }
    return null;
}


// --- Constants (AU³ / (M☉ · day²)) ---
export const G_AU3_MSUN_DAY2 = 2.959122082855911e-4;

/**
 * Detects if any body is exceeding local escape velocity relative to the
 * center of mass (CM) of the *other* bodies.
 *
 * Uses: v_esc = sqrt(2 G M_other / r_cm) * fudge
 *
 * Options:
 *  - maxSepAU:       only consider escape when the body is at least this far
 *                    from the CM of the other bodies (reduces noise near center).
 *  - fudge (>=1.0):  margin to account for timestep / modeling approximations.
 *  - consecutive:    how many consecutive frames must satisfy v >= v_esc to trigger.
 *                    (This function returns instantaneous status; the debounce lives in app.js)
 *
 * @param {{
 *   engine: NBodyRK4,
 *   masses: number[],
 *   maxSepAU?: number,
 *   fudge?: number
 * }} args
 * @returns {null | { index:number, v:number, vEsc:number, rCM:number, Mother:number }}
 */
export function detectEscape({ engine, masses, maxSepAU = 5.0, fudge = 1.1 }) {
    const n = masses.length;
    const s = engine.state; // [x... y... z... vx... vy... vz...]
    const N3 = 3 * n;

    for (let k = 0; k < n; k++) {
        // CM of all bodies except k
        let M = 0, cmx = 0, cmy = 0, cmz = 0;
        for (let i = 0; i < n; i++) if (i !== k) {
            const m = masses[i];
            M += m;
            cmx += m * s[3 * i + 0];
            cmy += m * s[3 * i + 1];
            cmz += m * s[3 * i + 2];
        }
        if (M <= 0) continue;
        cmx /= M; cmy /= M; cmz /= M;

        // Distance of k from CM(others)
        const dx = s[3 * k + 0] - cmx;
        const dy = s[3 * k + 1] - cmy;
        const dz = s[3 * k + 2] - cmz;
        const rCM = Math.hypot(dx, dy, dz);

        // Only consider "escape" when sufficiently far from CM (reduces false triggers)
        if (rCM < maxSepAU) continue;

        // Speed of k
        const vx = s[N3 + 3 * k + 0], vy = s[N3 + 3 * k + 1], vz = s[N3 + 3 * k + 2];
        const v  = Math.hypot(vx, vy, vz);

        // Escape speed vs CM(others)
        const vEsc = Math.sqrt(2 * G_AU3_MSUN_DAY2 * M / Math.max(rCM, 1e-16)) * fudge;

        if (v >= vEsc) {
            return { index: k, v, vEsc, rCM, Mother: M };
        }
    }

    return null;
}