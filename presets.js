// presets.js — initial conditions (AU, day, M☉)
import { G } from './physics.js';

// Helper: circular orbit velocity around mass M at radius r (AU/day)
function circVelAUperDay(M, rAU) {
    return Math.sqrt(G * M / rAU);
}

// Build presets at module load
const EPS_PLANET = 3.003e-6; // ~Earth mass in M☉ (tiny)
const ZERO = 0.0;

const triStarPlanet = (() => {
    // Three stars roughly in a rotating triangle-ish configuration,
    // with body 2 as the "middle" one for the planet to orbit.
    const m1 = 1.10, m2 = 0.95, m3 = 0.75, mp = EPS_PLANET; // planet small
    // Place stars in a compact arrangement
    const posStars = [
        [-1.2,  0.0,  0.0],   // star 1
        [ 0.0,  0.0,  0.0],   // star 2 (the one the planet orbits)
        [ 1.0,  0.8,  0.0],   // star 3
    ];
    // Give them gentle initial velocities (heuristic)
    const velStars = [
        [ 0.0,  0.006,  0.0],
        [ 0.0, -0.008,  0.0],
        [-0.006, 0.0,   0.0],
    ];

    // Planet: small circular orbit around star 2
    const rP = 0.25; // AU
    const vCirc = circVelAUperDay(m2, rP); // AU/day
    const posP = [ posStars[1][0] + rP, posStars[1][1] + 0.0, posStars[1][2] ];
    const velP = [ velStars[1][0] + 0.0, velStars[1][1] + vCirc, velStars[1][2] ];

    return {
        masses: [m1, m2, m3, mp],
        pos:    [posStars[0], posStars[1], posStars[2], posP],
        vel:    [velStars[0], velStars[1], velStars[2], velP],
    };
})();

const sunEarthJupiterPlus = (() => {
    const masses = [1.0, 3.003e-6, 0.000954, EPS_PLANET]; // add tiny 4th as test planet
    const pos = [[0,0,0],[1.0,0,0],[5.2,0,0],[1.3,0,0]];
    const vel = [[0,0,0],[0,0.0172,0],[0,0.0074,0],[0,0.015,0]];
    return { masses, pos, vel };
})();

const trianglePlus = (() => {
    const masses = [1,1,1, EPS_PLANET];
    const pos = [[-0.8,0,0.2],[0.4,0.692820323,-0.1],[0.4,-0.692820323,-0.1],[0.6,0.0,0.0]];
    const vel = [[0,0.0055,0],[-0.0048,-0.00275,0.002],[0.0048,-0.00275,-0.002],[0,0.01,0]];
    return { masses, pos, vel };
})();

const figure8Plus = (() => {
    // Classic figure-8 initial conditions for 3 bodies, plus a tiny planet as a test particle
    const masses = [1,1,1, EPS_PLANET];
    const pos = [
        [ 0.97000436, -0.24308753, 0],
        [-0.97000436,  0.24308753, 0],
        [ 0.0,         0.0,        0],
        [ 0.2,         0.0,        0],
    ];
    const vel = [
        [ 0.466203685,  0.43236573, 0],
        [ 0.466203685,  0.43236573, 0],
        [-0.93240737,  -0.86473146, 0],
        [ 0.0,          0.01,       0],
    ];
    return { masses, pos, vel };
})();

export const PRESETS = {
    'tristar-planet': triStarPlanet,
    'sun-earth-jupiter': sunEarthJupiterPlus,
    'triangle': trianglePlus,
    'figure8': figure8Plus,
};