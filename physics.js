// physics.js — integrator & constants
export const G = 2.959122082855911e-4; // AU^3 / (Msun * day^2)

export class ThreeBodyRK4_3D {
    constructor(masses, pos, vel, softening = 1e-6) {
        this.m = Float64Array.from(masses);
        this.state = new Float64Array(18);
        for (let i = 0; i < 3; i++) {
            this.state[3*i+0] = pos[i][0];
            this.state[3*i+1] = pos[i][1];
            this.state[3*i+2] = pos[i][2];
            this.state[9+3*i+0] = vel[i][0];
            this.state[9+3*i+1] = vel[i][1];
            this.state[9+3*i+2] = vel[i][2];
        }
        this.soft2 = softening * softening;
    }

    deriv(out, s) {
        for (let i=0;i<9;i++) out[i] = s[9+i];
        for (let i=0;i<3;i++) {
            let ax=0, ay=0, az=0;
            const xi=s[3*i], yi=s[3*i+1], zi=s[3*i+2];
            for (let j=0;j<3;j++) if (j!==i) {
                const xj=s[3*j], yj=s[3*j+1], zj=s[3*j+2];
                const dx = xi-xj, dy = yi-yj, dz = zi-zj;
                const r2 = dx*dx + dy*dy + dz*dz + this.soft2;
                const invR3 = 1.0 / Math.pow(r2, 1.5);
                const f = -G * this.m[j] * invR3;
                ax += f * dx; ay += f * dy; az += f * dz;
            }
            out[9+3*i+0] = ax;
            out[9+3*i+1] = ay;
            out[9+3*i+2] = az;
        }
    }

    step(dt) {
        const n = 18, s = this.state;
        const k1=new Float64Array(n), k2=new Float64Array(n),
            k3=new Float64Array(n), k4=new Float64Array(n);
        this.deriv(k1, s);
        const s2=new Float64Array(n); for (let i=0;i<n;i++) s2[i]=s[i]+0.5*dt*k1[i];
        this.deriv(k2, s2);
        const s3=new Float64Array(n); for (let i=0;i<n;i++) s3[i]=s[i]+0.5*dt*k2[i];
        this.deriv(k3, s3);
        const s4=new Float64Array(n); for (let i=0;i<n;i++) s4[i]=s[i]+dt*k3[i];
        this.deriv(k4, s4);
        for (let i=0;i<n;i++) s[i] += (dt/6)*(k1[i] + 2*k2[i] + 2*k3[i] + k4[i]);
    }

    energy() {
        const s = this.state, m = this.m;
        let K = 0;
        for (let i=0;i<3;i++) {
            const vx=s[9+3*i], vy=s[9+3*i+1], vz=s[9+3*i+2];
            K += 0.5*m[i]*(vx*vx+vy*vy+vz*vz);
        }
        const U = (i,j)=>{
            const dx=s[3*i]-s[3*j], dy=s[3*i+1]-s[3*j+1], dz=s[3*i+2]-s[3*j+2];
            const r=Math.sqrt(dx*dx+dy*dy+dz*dz + this.soft2);
            return -G * m[i]*m[j] / r;
        };
        return K + U(0,1) + U(0,2) + U(1,2);
    }
}