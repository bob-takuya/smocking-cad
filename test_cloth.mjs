/**
 * Headless cloth physics test
 * Usage: node test_cloth.mjs [config_name]
 *
 * Tests different configurations and logs:
 * - Max velocity (instability indicator)
 * - Stitch distance convergence
 * - Energy
 */

// ─── Grid ────────────────────────────────────────────────────────────────────
const RES = 20;          // smaller for speed
const N   = (RES+1)**2;
const SPACING = 0.5;

function vidx(i,j){ return j*(RES+1)+i; }

// ─── Configurations to test ──────────────────────────────────────────────────
const CONFIGS = {
  baseline: {
    substeps: 15, gravity: -6, stretchC: 1e-8, bendC: 5e-5,
    damping: 0.99, lerpRate: 0.03, snapDist: 0.08,
  },
  // 1) More substeps
  substeps30: {
    substeps: 30, gravity: -6, stretchC: 1e-8, bendC: 5e-5,
    damping: 0.99, lerpRate: 0.015, snapDist: 0.08,
  },
  // 2) Substeps + stronger damping
  heavyDamp: {
    substeps: 30, gravity: -6, stretchC: 1e-8, bendC: 5e-5,
    damping: 0.97, lerpRate: 0.015, snapDist: 0.08,
  },
  // 3) Softer stretch (less stiff → less fighting)
  softerStretch: {
    substeps: 20, gravity: -6, stretchC: 1e-5, bendC: 1e-3,
    damping: 0.98, lerpRate: 0.02, snapDist: 0.08,
  },
  // 4) Very soft + slow lerp
  softSlow: {
    substeps: 20, gravity: -4, stretchC: 1e-5, bendC: 1e-3,
    damping: 0.97, lerpRate: 0.01, snapDist: 0.05,
  },
  // 5) Iterative constraint pass (solve 3× per substep)
  multiPass: {
    substeps: 15, gravity: -6, stretchC: 1e-8, bendC: 5e-5,
    damping: 0.98, lerpRate: 0.02, snapDist: 0.08, passes: 3,
  },
  // 6) Compliance ramp (start loose, tighten each substep)
  complianceRamp: {
    substeps: 20, gravity: -6, stretchC: 1e-8, bendC: 5e-5,
    damping: 0.985, lerpRate: 0.02, snapDist: 0.08,
    stretchCStart: 1e-3, stretchCEnd: 1e-8,  // ramp over substeps
  },
  // 7) Pure position Verlet (no explicit velocity, just prevPos damping)
  verletNoVel: {
    substeps: 20, gravity: -6, stretchC: 1e-8, bendC: 5e-5,
    damping: 0.995, lerpRate: 0.02, snapDist: 0.08,
    useVerlet: true,
  },
};

// ─── Build constraints ───────────────────────────────────────────────────────
function buildConstraints(pos, stretchC, bendC) {
  const cons = [];
  const d = (a,b) => {
    const dx=pos[b*3]-pos[a*3], dy=pos[b*3+1]-pos[a*3+1], dz=pos[b*3+2]-pos[a*3+2];
    return Math.sqrt(dx*dx+dy*dy+dz*dz);
  };
  for(let j=0;j<=RES;j++) for(let i=0;i<=RES;i++){
    const v=vidx(i,j);
    if(i<RES) cons.push({a:v,b:vidx(i+1,j),r:d(v,vidx(i+1,j)),c:stretchC});
    if(j<RES) cons.push({a:v,b:vidx(i,j+1),r:d(v,vidx(i,j+1)),c:stretchC});
    if(i<RES&&j<RES){
      cons.push({a:v,b:vidx(i+1,j+1),r:d(v,vidx(i+1,j+1)),c:stretchC});
      cons.push({a:vidx(i+1,j),b:vidx(i,j+1),r:d(vidx(i+1,j),vidx(i,j+1)),c:stretchC});
    }
    if(i+2<=RES) cons.push({a:v,b:vidx(i+2,j),r:d(v,vidx(i+2,j)),c:bendC});
    if(j+2<=RES) cons.push({a:v,b:vidx(i,j+2),r:d(v,vidx(i,j+2)),c:bendC});
  }
  return cons;
}

// ─── Run one config ──────────────────────────────────────────────────────────
function runConfig(name, cfg) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`CONFIG: ${name}`);
  console.log(JSON.stringify(cfg, null, 2));
  console.log('='.repeat(60));

  const pos  = new Float32Array(N*3);
  const prev = new Float32Array(N*3);
  const vel  = new Float32Array(N*3);
  const w    = new Float32Array(N);

  // Init hanging cloth
  const half = (RES*SPACING)/2;
  for(let j=0;j<=RES;j++) for(let i=0;i<=RES;i++){
    const v=vidx(i,j);
    pos[v*3]   = i*SPACING - half;
    pos[v*3+1] = -j*SPACING;
    pos[v*3+2] = (Math.random()-0.5)*0.04;
    prev[v*3]=pos[v*3]; prev[v*3+1]=pos[v*3+1]; prev[v*3+2]=pos[v*3+2];
    w[v] = j===0 ? 0 : 1;
  }

  const cons = buildConstraints(pos, cfg.stretchC, cfg.bendC);
  const SUBSTEPS = cfg.substeps;
  const PASSES   = cfg.passes || 1;
  const GRAVITY  = cfg.gravity;
  const DAMPING  = cfg.damping;
  const dt = 1/60;

  // Choose 2 test stitch points: lower-quarter corners (symmetrical)
  const pA = vidx(Math.round(RES*0.25), Math.round(RES*0.6));
  const pB = vidx(Math.round(RES*0.75), Math.round(RES*0.6));
  const STRENGTH = 0.8;
  const SNAP = cfg.snapDist;
  const LERP = cfg.lerpRate;

  console.log(`Stitch: pA=${pA} pB=${pB}`);
  console.log(`Initial distance: ${dist3(pos,pA,pB).toFixed(4)}`);

  let welded = false;
  const LOG_FRAMES = [1,5,10,30,60,120,240,480];
  let maxInstability = 0;

  for(let frame=1; frame<=500; frame++){
    const subDt = dt/SUBSTEPS;
    const sd2   = subDt*subDt;

    for(let sub=0; sub<SUBSTEPS; sub++){
      const stretchC = cfg.stretchCStart
        ? cfg.stretchCStart + (cfg.stretchCEnd - cfg.stretchCStart) * (sub/SUBSTEPS)
        : cfg.stretchC;

      if(cfg.useVerlet){
        // Position Verlet
        for(let v=0;v<N;v++){
          if(w[v]===0) continue;
          const vx=pos[v*3]-prev[v*3];
          const vy=pos[v*3+1]-prev[v*3+1];
          const vz=pos[v*3+2]-prev[v*3+2];
          prev[v*3]=pos[v*3]; prev[v*3+1]=pos[v*3+1]; prev[v*3+2]=pos[v*3+2];
          pos[v*3]  += vx*DAMPING;
          pos[v*3+1]+= vy*DAMPING + GRAVITY*subDt*subDt;
          pos[v*3+2]+= vz*DAMPING;
        }
      } else {
        // Explicit velocity
        for(let v=0;v<N;v++){
          if(w[v]===0) continue;
          vel[v*3+1]+=GRAVITY*subDt;
          prev[v*3]=pos[v*3]; prev[v*3+1]=pos[v*3+1]; prev[v*3+2]=pos[v*3+2];
          pos[v*3]  +=vel[v*3]  *subDt;
          pos[v*3+1]+=vel[v*3+1]*subDt;
          pos[v*3+2]+=vel[v*3+2]*subDt;
        }
      }

      // Constraint passes
      for(let pass=0; pass<PASSES; pass++){
        for(const c of cons){
          const wa=w[c.a], wb=w[c.b], wSum=wa+wb;
          if(wSum===0) continue;
          const dx=pos[c.b*3]-pos[c.a*3], dy=pos[c.b*3+1]-pos[c.a*3+1], dz=pos[c.b*3+2]-pos[c.a*3+2];
          const d=Math.sqrt(dx*dx+dy*dy+dz*dz);
          if(d<1e-6) continue;
          const alpha=stretchC/sd2;
          const lam=-(d-c.r)/(wSum+alpha);
          const nx=dx/d,ny=dy/d,nz=dz/d;
          pos[c.a*3]-=wa*lam*nx; pos[c.a*3+1]-=wa*lam*ny; pos[c.a*3+2]-=wa*lam*nz;
          pos[c.b*3]+=wb*lam*nx; pos[c.b*3+1]+=wb*lam*ny; pos[c.b*3+2]+=wb*lam*nz;
        }
      }

      // Stitch
      if(!welded){
        const d=dist3(pos,pA,pB);
        const mx=(pos[pA*3]+pos[pB*3])/2, my=(pos[pA*3+1]+pos[pB*3+1])/2, mz=(pos[pA*3+2]+pos[pB*3+2])/2;
        if(d<SNAP){
          welded=true;
          pos[pA*3]=pos[pB*3]=mx; pos[pA*3+1]=pos[pB*3+1]=my; pos[pA*3+2]=pos[pB*3+2]=mz;
        } else {
          const rate=STRENGTH*LERP;
          pos[pA*3]+=(mx-pos[pA*3])*rate; pos[pA*3+1]+=(my-pos[pA*3+1])*rate; pos[pA*3+2]+=(mz-pos[pA*3+2])*rate;
          pos[pB*3]+=(mx-pos[pB*3])*rate; pos[pB*3+1]+=(my-pos[pB*3+1])*rate; pos[pB*3+2]+=(mz-pos[pB*3+2])*rate;
        }
      } else {
        const mx=(pos[pA*3]+pos[pB*3])/2, my=(pos[pA*3+1]+pos[pB*3+1])/2, mz=(pos[pA*3+2]+pos[pB*3+2])/2;
        pos[pA*3]=pos[pB*3]=mx; pos[pA*3+1]=pos[pB*3+1]=my; pos[pA*3+2]=pos[pB*3+2]=mz;
      }

      if(!cfg.useVerlet){
        for(let v=0;v<N;v++){
          if(w[v]===0) continue;
          vel[v*3]  =(pos[v*3]  -prev[v*3])  /subDt;
          vel[v*3+1]=(pos[v*3+1]-prev[v*3+1])/subDt;
          vel[v*3+2]=(pos[v*3+2]-prev[v*3+2])/subDt;
        }
      }
    }

    // Damping once per frame
    if(!cfg.useVerlet){
      for(let v=0;v<N;v++){
        vel[v*3]*=DAMPING; vel[v*3+1]*=DAMPING; vel[v*3+2]*=DAMPING;
      }
    }

    // Metrics
    let maxVel=0, totalKE=0, maxPos=0;
    for(let v=0;v<N;v++){
      if(w[v]===0) continue;
      const spd2=vel[v*3]**2+vel[v*3+1]**2+vel[v*3+2]**2;
      maxVel=Math.max(maxVel,Math.sqrt(spd2));
      totalKE+=spd2*0.5;
      maxPos=Math.max(maxPos,Math.abs(pos[v*3+2])); // max Z displacement
    }
    if(maxVel>maxInstability) maxInstability=maxVel;

    if(LOG_FRAMES.includes(frame)){
      const stitchDist=dist3(pos,pA,pB);
      const status = maxVel>50 ? '💥EXPLODE' : maxVel>10 ? '⚠️ UNSTBL' : maxVel>2 ? '🔸 ACTIVE' : '✅ STABLE';
      console.log(`f${String(frame).padStart(3)}: ${status} | maxVel=${maxVel.toFixed(3).padStart(8)} | KE=${totalKE.toFixed(1).padStart(8)} | stitchDist=${stitchDist.toFixed(4)} | maxZ=${maxPos.toFixed(3)} | welded=${welded}`);
    }
  }

  const finalStitchDist = dist3(pos,pA,pB);
  const finalMaxVel = maxInstability;
  console.log(`\n→ Final stitch dist: ${finalStitchDist.toFixed(5)}`);
  console.log(`→ Peak max velocity: ${finalMaxVel.toFixed(3)}`);
  console.log(`→ Welded: ${welded}`);
  return { finalStitchDist, finalMaxVel, welded };
}

function dist3(pos,a,b){
  const dx=pos[b*3]-pos[a*3], dy=pos[b*3+1]-pos[a*3+1], dz=pos[b*3+2]-pos[a*3+2];
  return Math.sqrt(dx*dx+dy*dy+dz*dz);
}

// ─── Main ────────────────────────────────────────────────────────────────────
const target = process.argv[2];
const toRun  = target ? { [target]: CONFIGS[target] } : CONFIGS;

const results = {};
for(const [name, cfg] of Object.entries(toRun)){
  results[name] = runConfig(name, cfg);
}

console.log('\n\n' + '='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
for(const [name, r] of Object.entries(results)){
  const ok = r.finalMaxVel < 2 && r.welded;
  console.log(`${ok?'✅':'❌'} ${name.padEnd(20)} | peak=${r.finalMaxVel.toFixed(2).padStart(8)} | stitchDist=${r.finalStitchDist.toFixed(4)} | welded=${r.welded}`);
}
