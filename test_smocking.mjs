/**
 * Test: smocking cloth simulation with correct coordinate system
 *
 * Key design:
 *  - Cloth hangs in XY plane (pole along X, cloth hangs in -Y)
 *  - Z = fold direction (perpendicular to cloth)
 *  - Top row (pattern y=0) pinned at world Y=0
 *  - Pattern Y → world -Y  (hanging direction)
 *  - Small Z-noise breaks symmetry so folds go in ±Z
 *  - Stitch groups: horizontal lines at same pattern-y (pull in X direction)
 *  - Folds should form in Z
 *
 * Metrics:
 *  - maxZ: how much the cloth folds in Z (higher = good smocking)
 *  - stitchDist: how close stitch groups are after 480 frames
 *  - stable: max velocity at f480 < threshold
 */

// ── Simulate a simple 6×4 smocking grid ────────────────────────────────────
// Mock "Arrow" pattern: stitch pairs at same row, 2 cells apart
// Grid: NX×NY
const NX = 9, NY = 6;
const SCALE = 1.0;   // world units per pattern unit

// Build grid
function vertIdx(i, j) { return j * NX + i; }
const N = NX * NY;

function initPositions(noiseAmp, gravityType) {
  const pos = new Float32Array(N * 3);
  const prev = new Float32Array(N * 3);
  const w = new Float32Array(N);
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const v = vertIdx(i, j);
      pos[v*3]   = i * SCALE;           // X: horizontal (parallel to pole)
      pos[v*3+1] = -j * SCALE;          // Y: hanging downward
      pos[v*3+2] = (Math.random()-0.5) * noiseAmp; // Z: fold direction

      prev[v*3] = pos[v*3]; prev[v*3+1] = pos[v*3+1]; prev[v*3+2] = pos[v*3+2];
      w[v] = (j === 0) ? 0 : 1; // pin top row
    }
  }
  return { pos, prev, w };
}

function buildConstraints(pos, stretchC, bendC) {
  const cons = [];
  const seen = new Set();
  const add = (a, b, c) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(k)) return;
    seen.add(k);
    const dx=pos[b*3]-pos[a*3],dy=pos[b*3+1]-pos[a*3+1],dz=pos[b*3+2]-pos[a*3+2];
    const r=Math.sqrt(dx*dx+dy*dy+dz*dz);
    if(r<1e-6) return;
    cons.push({a,b,r,c});
  };
  // Structural
  for(let j=0;j<NY;j++) for(let i=0;i<NX;i++){
    const v=vertIdx(i,j);
    if(i+1<NX) add(v,vertIdx(i+1,j),stretchC);
    if(j+1<NY) add(v,vertIdx(i,j+1),stretchC);
    if(i+1<NX&&j+1<NY){add(v,vertIdx(i+1,j+1),stretchC);add(vertIdx(i+1,j),vertIdx(i,j+1),stretchC);}
  }
  // Bend (skip-1)
  for(let j=0;j<NY;j++) for(let i=0;i<NX;i++){
    const v=vertIdx(i,j);
    if(i+2<NX) add(v,vertIdx(i+2,j),bendC);
    if(j+2<NY) add(v,vertIdx(i,j+2),bendC);
  }
  return cons;
}

// Arrow-like stitch groups: row 1→ pair every 2 vertices
// [(0,1)-(2,1)], [(2,1)-(4,1)], ...
// [(1,2)-(3,2)], [(3,2)-(5,2)], ...
// Alternating rows for diamond pattern
function buildStitchGroups() {
  const groups = [];
  for (let j = 1; j < NY; j++) {
    const offset = (j % 2 === 1) ? 0 : 1;
    for (let i = offset; i+2 < NX; i += 2) {
      groups.push([vertIdx(i, j), vertIdx(i+2, j)]);
    }
  }
  return groups;
}

function dist3(pos,a,b){const dx=pos[b*3]-pos[a*3],dy=pos[b*3+1]-pos[a*3+1],dz=pos[b*3+2]-pos[a*3+2];return Math.sqrt(dx*dx+dy*dy+dz*dz);}

const CONFIGS = {
  // A: Correct XY-hang, Z-noise, soft stretch
  baseXY: {
    noiseAmp: 0.05, substeps: 20, gravity: -3, stretchC: 1e-5, bendC: 1e-3,
    damp: 0.998, lerpRate: 0.025, snap: 0.5, strength: 0.9,
  },
  // B: More Z-noise
  moreNoise: {
    noiseAmp: 0.15, substeps: 20, gravity: -3, stretchC: 1e-5, bendC: 1e-3,
    damp: 0.998, lerpRate: 0.025, snap: 0.5, strength: 0.9,
  },
  // C: Stronger bend (resist in-plane folding → force out-of-plane)
  strongBend: {
    noiseAmp: 0.05, substeps: 20, gravity: -3, stretchC: 1e-5, bendC: 5e-4,
    damp: 0.998, lerpRate: 0.025, snap: 0.5, strength: 0.9,
  },
  // D: Initial Z-offset per column (forced alternating direction)
  zOffset: {
    noiseAmp: 0.0, substeps: 20, gravity: -3, stretchC: 1e-5, bendC: 1e-3,
    damp: 0.998, lerpRate: 0.025, snap: 0.5, strength: 0.9,
    forceZOffset: true,  // alternate columns: Z = +0.1, -0.1, ...
  },
  // E: Heavier gravity (more sag = more natural fold direction)
  heavyGrav: {
    noiseAmp: 0.05, substeps: 20, gravity: -8, stretchC: 1e-5, bendC: 1e-3,
    damp: 0.997, lerpRate: 0.025, snap: 0.5, strength: 0.9,
  },
  // F: Pre-deform: start cloth slightly bowed in Z
  preBowed: {
    noiseAmp: 0.0, substeps: 20, gravity: -3, stretchC: 1e-5, bendC: 1e-3,
    damp: 0.998, lerpRate: 0.025, snap: 0.5, strength: 0.9,
    bowAmp: 0.3,  // bow amplitude in Z (creates front-facing arc)
  },
  // G: No gravity (table-like), just stitch + noise
  noGravity: {
    noiseAmp: 0.08, substeps: 20, gravity: 0, stretchC: 1e-5, bendC: 1e-3,
    damp: 0.998, lerpRate: 0.025, snap: 0.5, strength: 0.9,
  },
  // H: "Wrinkle init" – vertices start slightly wavy in Z
  wavy: {
    noiseAmp: 0.0, substeps: 20, gravity: -3, stretchC: 1e-5, bendC: 1e-3,
    damp: 0.998, lerpRate: 0.025, snap: 0.5, strength: 0.9,
    wavyInit: true,  // sin wave in Z based on X position
  },
};

function runConfig(name, cfg) {
  const { pos, prev, w } = initPositions(cfg.noiseAmp, null);

  // Apply special initializations
  if (cfg.forceZOffset) {
    for (let j=0;j<NY;j++) for(let i=0;i<NX;i++){
      const v=vertIdx(i,j); if(w[v]===0) continue;
      pos[v*3+2] = (i%2===0 ? 1 : -1) * 0.1;
      prev[v*3+2] = pos[v*3+2];
    }
  }
  if (cfg.bowAmp) {
    // Bow: Z = bowAmp * sin(pi * i / (NX-1))  per vertex
    for(let j=0;j<NY;j++) for(let i=0;i<NX;i++){
      const v=vertIdx(i,j); if(w[v]===0) continue;
      pos[v*3+2] = cfg.bowAmp * Math.sin(Math.PI * i / (NX-1));
      prev[v*3+2] = pos[v*3+2];
    }
  }
  if (cfg.wavyInit) {
    for(let j=0;j<NY;j++) for(let i=0;i<NX;i++){
      const v=vertIdx(i,j); if(w[v]===0) continue;
      pos[v*3+2] = 0.1 * Math.sin(2 * Math.PI * i / NX);
      prev[v*3+2] = pos[v*3+2];
    }
  }

  const cons = buildConstraints(pos, cfg.stretchC, cfg.bendC);
  const groups = buildStitchGroups();
  const welded = new Set();

  const subDt = (1/60) / cfg.substeps;
  const sd2 = subDt * subDt;
  const LOG = [1, 5, 10, 30, 60, 120, 240, 480];

  console.log(`\n${'='.repeat(50)}\n${name} | groups=${groups.length}`);

  for (let frame = 1; frame <= 500; frame++) {
    for (let sub = 0; sub < cfg.substeps; sub++) {
      // Verlet
      for (let v=0;v<N;v++){
        if(w[v]===0) continue;
        const vx=(pos[v*3]-prev[v*3])*cfg.damp;
        const vy=(pos[v*3+1]-prev[v*3+1])*cfg.damp;
        const vz=(pos[v*3+2]-prev[v*3+2])*cfg.damp;
        prev[v*3]=pos[v*3]; prev[v*3+1]=pos[v*3+1]; prev[v*3+2]=pos[v*3+2];
        pos[v*3]+=vx; pos[v*3+1]+=vy+cfg.gravity*sd2; pos[v*3+2]+=vz;
      }
      // Constraints
      for(const c of cons){
        const wa=w[c.a],wb=w[c.b],wS=wa+wb; if(wS===0) continue;
        const dx=pos[c.b*3]-pos[c.a*3],dy=pos[c.b*3+1]-pos[c.a*3+1],dz=pos[c.b*3+2]-pos[c.a*3+2];
        const d=Math.sqrt(dx*dx+dy*dy+dz*dz); if(d<1e-6) continue;
        const lam=-(d-c.r)/(wS+c.c/sd2);
        const nx=dx/d,ny=dy/d,nz=dz/d;
        pos[c.a*3]-=wa*lam*nx; pos[c.a*3+1]-=wa*lam*ny; pos[c.a*3+2]-=wa*lam*nz;
        pos[c.b*3]+=wb*lam*nx; pos[c.b*3+1]+=wb*lam*ny; pos[c.b*3+2]+=wb*lam*nz;
      }
      // Stitch
      if (cfg.strength > 0) {
        groups.forEach((group, gi) => {
          let cx=0,cy=0,cz=0,cnt=0;
          for(const vi of group){if(w[vi]===0)continue;cx+=pos[vi*3];cy+=pos[vi*3+1];cz+=pos[vi*3+2];cnt++;}
          if(cnt===0) return;
          cx/=cnt;cy/=cnt;cz/=cnt;
          if(welded.has(gi)){
            for(const vi of group){if(w[vi]===0)continue;
              pos[vi*3]=cx;pos[vi*3+1]=cy;pos[vi*3+2]=cz;
              prev[vi*3]=cx;prev[vi*3+1]=cy;prev[vi*3+2]=cz;}
          } else {
            let maxD=0;
            for(const vi of group){if(w[vi]===0)continue;
              const dx=pos[vi*3]-cx,dy=pos[vi*3+1]-cy,dz=pos[vi*3+2]-cz;
              maxD=Math.max(maxD,Math.sqrt(dx*dx+dy*dy+dz*dz));}
            if(maxD<cfg.snap){welded.add(gi);}
            else{
              const rate=cfg.strength*cfg.lerpRate;
              for(const vi of group){if(w[vi]===0)continue;
                pos[vi*3]+=(cx-pos[vi*3])*rate;
                pos[vi*3+1]+=(cy-pos[vi*3+1])*rate;
                pos[vi*3+2]+=(cz-pos[vi*3+2])*rate;}
            }
          }
        });
      }
    }

    if (LOG.includes(frame)) {
      let maxV=0, maxZ=0, minZ=0, avgY=0;
      for(let v=0;v<N;v++){
        if(w[v]===0) continue;
        const dx=pos[v*3]-prev[v*3],dy=pos[v*3+1]-prev[v*3+1],dz=pos[v*3+2]-prev[v*3+2];
        maxV=Math.max(maxV,Math.sqrt(dx*dx+dy*dy+dz*dz)/subDt);
        maxZ=Math.max(maxZ,pos[v*3+2]);
        minZ=Math.min(minZ,pos[v*3+2]);
        avgY+=pos[v*3+1];
      }
      avgY/=(N-(NX)); // exclude pinned
      const stitchDist = groups.length>0 ? dist3(pos,groups[0][0],groups[0][1]) : 0;
      const zRange = maxZ - minZ;
      const st = maxV>50?'💥':maxV>10?'⚠️':maxV>2?'🔸':'✅';
      const foldOk = zRange > 0.5 ? '🌊' : zRange > 0.1 ? '〜' : '—';
      console.log(`f${String(frame).padStart(3)}: ${st}${foldOk} vel=${maxV.toFixed(2).padStart(7)} zRange=${zRange.toFixed(3).padStart(7)} stitchD=${stitchDist.toFixed(3)} weld=${welded.size}/${groups.length}`);
    }
  }

  // Final metrics
  let maxZ=0, minZ=0;
  for(let v=0;v<N;v++){if(w[v]===0)continue;maxZ=Math.max(maxZ,pos[v*3+2]);minZ=Math.min(minZ,pos[v*3+2]);}
  const zRange=maxZ-minZ;
  return {zRange, weldRatio: welded.size/groups.length, stable: true};
}

const results = {};
for (const [name, cfg] of Object.entries(CONFIGS)) {
  results[name] = runConfig(name, cfg);
}

console.log('\n\nSUMMARY (higher zRange = better smocking fold)');
console.log('='.repeat(55));
for (const [name, r] of Object.entries(results)) {
  const fold = r.zRange > 1.5 ? '🌊🌊' : r.zRange > 0.5 ? '🌊' : r.zRange > 0.1 ? '〜' : '—';
  console.log(`${fold} ${name.padEnd(20)} zRange=${r.zRange.toFixed(3)} weld=${(r.weldRatio*100).toFixed(0)}%`);
}
