/**
 * Test round 2: fix persistent velocity oscillation at weld points
 *
 * Root cause: welded vertex is set to centroid (step 3),
 *   but stretch constraints (step 2) pull it back each substep → infinite oscillation.
 *
 * Solutions to test:
 *   A. pinOnWeld: set w[vi]=0 (invMass=0) after welding → stretch can't move it
 *   B. stitchFirst: apply stitch BEFORE stretch constraints → constraints see fixed weld
 *   C. hardPin: set w[vi]=0 AND add hard spring from pin to weld location
 *   D. noWeldMove: don't reset prev on weld (let velocity carry through)
 *   E. stiffDamp: aggressively damp weld-group vertices (damp=0.9 per substep for those)
 *   F. pinOnWeld + noGravity (best fold from round 1 + pin fix)
 *   G. strongBend + pinOnWeld (best fold config + pin fix)
 */

const NX = 9, NY = 6, SCALE = 1.0;
const N = NX * NY;
function vidx(i,j){return j*NX+i;}
function dist3(pos,a,b){const dx=pos[b*3]-pos[a*3],dy=pos[b*3+1]-pos[a*3+1],dz=pos[b*3+2]-pos[a*3+2];return Math.sqrt(dx*dx+dy*dy+dz*dz);}

function init(noiseAmp) {
  const pos=new Float32Array(N*3),prev=new Float32Array(N*3),w=new Float32Array(N);
  for(let j=0;j<NY;j++) for(let i=0;i<NX;i++){
    const v=vidx(i,j);
    pos[v*3]=i*SCALE; pos[v*3+1]=-j*SCALE; pos[v*3+2]=(Math.random()-0.5)*noiseAmp;
    prev[v*3]=pos[v*3];prev[v*3+1]=pos[v*3+1];prev[v*3+2]=pos[v*3+2];
    w[v]=j===0?0:1;
  }
  return{pos,prev,w};
}

function buildCons(pos,sC,bC){
  const cons=[],seen=new Set();
  const add=(a,b,c)=>{
    const k=a<b?`${a}-${b}`:`${b}-${a}`;if(seen.has(k))return;seen.add(k);
    const dx=pos[b*3]-pos[a*3],dy=pos[b*3+1]-pos[a*3+1],dz=pos[b*3+2]-pos[a*3+2];
    const r=Math.sqrt(dx*dx+dy*dy+dz*dz);if(r<1e-6)return;cons.push({a,b,r,c});
  };
  for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){
    const v=vidx(i,j);
    if(i+1<NX)add(v,vidx(i+1,j),sC);if(j+1<NY)add(v,vidx(i,j+1),sC);
    if(i+1<NX&&j+1<NY){add(v,vidx(i+1,j+1),sC);add(vidx(i+1,j),vidx(i,j+1),sC);}
    if(i+2<NX)add(v,vidx(i+2,j),bC);if(j+2<NY)add(v,vidx(i,j+2),bC);
  }
  return cons;
}

function buildGroups(){
  const groups=[];
  for(let j=1;j<NY;j++){
    const offset=(j%2===1)?0:1;
    for(let i=offset;i+2<NX;i+=2)groups.push([vidx(i,j),vidx(i+2,j)]);
  }
  return groups;
}

const BASE = {substeps:20,gravity:-3,stretchC:1e-5,bendC:5e-4,damp:0.998,lerpRate:0.025,snap:0.5,strength:0.9,noiseAmp:0.05};

const CONFIGS = {
  // Baseline from round1 (oscillating)
  baseline:    {...BASE},
  // A: Pin welded vertices (w=0)
  pinOnWeld:   {...BASE, pinOnWeld:true},
  // B: Stitch before stretch
  stitchFirst: {...BASE, stitchFirst:true},
  // C: Pin + stitch first
  pinAndFirst: {...BASE, pinOnWeld:true, stitchFirst:true},
  // D: noGravity + pinOnWeld (best fold + stable)
  noGravPin:   {...BASE, gravity:0, pinOnWeld:true},
  // E: aggressive local damping on weld group
  localDamp:   {...BASE, weldDamp:0.85},
  // F: pin + more substeps
  pinMore:     {...BASE, pinOnWeld:true, substeps:30},
  // G: stronger snap threshold (weld earlier, less oscillation before weld)
  bigSnap:     {...BASE, snap:1.5, pinOnWeld:true},
};

function run(name,cfg){
  const{pos,prev,w}=init(cfg.noiseAmp);
  const cons=buildCons(pos,cfg.stretchC,cfg.bendC);
  const groups=buildGroups();
  const welded=new Set();
  const subDt=(1/60)/cfg.substeps,sd2=subDt*subDt;
  const LOG=[1,5,10,30,60,120,240,480];
  console.log(`\n${'='.repeat(50)}\n${name}`);

  for(let frame=1;frame<=500;frame++){
    for(let sub=0;sub<cfg.substeps;sub++){
      // STITCH FIRST option
      if(cfg.stitchFirst && cfg.strength>0){
        groups.forEach((group,gi)=>{
          let cx=0,cy=0,cz=0,cnt=0;
          for(const vi of group){if(w[vi]===0)continue;cx+=pos[vi*3];cy+=pos[vi*3+1];cz+=pos[vi*3+2];cnt++;}
          if(cnt===0)return; cx/=cnt;cy/=cnt;cz/=cnt;
          if(welded.has(gi)){
            for(const vi of group){if(w[vi]===0)continue;pos[vi*3]=cx;pos[vi*3+1]=cy;pos[vi*3+2]=cz;prev[vi*3]=cx;prev[vi*3+1]=cy;prev[vi*3+2]=cz;}
          } else {
            let maxD=0;
            for(const vi of group){if(w[vi]===0)continue;const dx=pos[vi*3]-cx,dy=pos[vi*3+1]-cy,dz=pos[vi*3+2]-cz;maxD=Math.max(maxD,Math.sqrt(dx*dx+dy*dy+dz*dz));}
            if(maxD<cfg.snap){
              welded.add(gi);
              if(cfg.pinOnWeld)for(const vi of group){w[vi]=0;}
            } else {
              const rate=cfg.strength*cfg.lerpRate;
              for(const vi of group){if(w[vi]===0)continue;pos[vi*3]+=(cx-pos[vi*3])*rate;pos[vi*3+1]+=(cy-pos[vi*3+1])*rate;pos[vi*3+2]+=(cz-pos[vi*3+2])*rate;}
            }
          }
        });
      }

      // Verlet
      for(let v=0;v<N;v++){
        if(w[v]===0)continue;
        const vx=(pos[v*3]-prev[v*3])*cfg.damp,vy=(pos[v*3+1]-prev[v*3+1])*cfg.damp,vz=(pos[v*3+2]-prev[v*3+2])*cfg.damp;
        prev[v*3]=pos[v*3];prev[v*3+1]=pos[v*3+1];prev[v*3+2]=pos[v*3+2];
        pos[v*3]+=vx;pos[v*3+1]+=vy+(cfg.gravity||0)*sd2;pos[v*3+2]+=vz;
      }

      // Constraints
      for(const c of cons){
        const wa=w[c.a],wb=w[c.b],wS=wa+wb;if(wS===0)continue;
        const dx=pos[c.b*3]-pos[c.a*3],dy=pos[c.b*3+1]-pos[c.a*3+1],dz=pos[c.b*3+2]-pos[c.a*3+2];
        const d=Math.sqrt(dx*dx+dy*dy+dz*dz);if(d<1e-6)continue;
        const lam=-(d-c.r)/(wS+c.c/sd2),nx=dx/d,ny=dy/d,nz=dz/d;
        pos[c.a*3]-=wa*lam*nx;pos[c.a*3+1]-=wa*lam*ny;pos[c.a*3+2]-=wa*lam*nz;
        pos[c.b*3]+=wb*lam*nx;pos[c.b*3+1]+=wb*lam*ny;pos[c.b*3+2]+=wb*lam*nz;
      }

      // STITCH AFTER option (default)
      if(!cfg.stitchFirst && cfg.strength>0){
        groups.forEach((group,gi)=>{
          let cx=0,cy=0,cz=0,cnt=0;
          for(const vi of group){if(w[vi]===0)continue;cx+=pos[vi*3];cy+=pos[vi*3+1];cz+=pos[vi*3+2];cnt++;}
          if(cnt===0)return; cx/=cnt;cy/=cnt;cz/=cnt;
          if(welded.has(gi)){
            if(!cfg.pinOnWeld){ // only update if not already pinned
              for(const vi of group){if(w[vi]===0)continue;
                pos[vi*3]=cx;pos[vi*3+1]=cy;pos[vi*3+2]=cz;
                prev[vi*3]=cx;prev[vi*3+1]=cy;prev[vi*3+2]=cz;
              }
            }
          } else {
            let maxD=0;
            for(const vi of group){if(w[vi]===0)continue;const dx=pos[vi*3]-cx,dy=pos[vi*3+1]-cy,dz=pos[vi*3+2]-cz;maxD=Math.max(maxD,Math.sqrt(dx*dx+dy*dy+dz*dz));}
            if(maxD<cfg.snap){
              welded.add(gi);
              if(cfg.pinOnWeld)for(const vi of group){w[vi]=0;}
            } else {
              const rate=cfg.strength*cfg.lerpRate;
              for(const vi of group){if(w[vi]===0)continue;pos[vi*3]+=(cx-pos[vi*3])*rate;pos[vi*3+1]+=(cy-pos[vi*3+1])*rate;pos[vi*3+2]+=(cz-pos[vi*3+2])*rate;}
            }
          }
        });
      }

      // Local weld damping
      if(cfg.weldDamp && cfg.strength>0){
        for(const gi of welded){
          for(const vi of groups[gi]){
            if(w[vi]===0)continue;
            const vx=(pos[vi*3]-prev[vi*3]),vy=(pos[vi*3+1]-prev[vi*3+1]),vz=(pos[vi*3+2]-prev[vi*3+2]);
            pos[vi*3]=prev[vi*3]+vx*cfg.weldDamp;pos[vi*3+1]=prev[vi*3+1]+vy*cfg.weldDamp;pos[vi*3+2]=prev[vi*3+2]+vz*cfg.weldDamp;
          }
        }
      }
    }

    if(LOG.includes(frame)){
      let maxV=0,maxZ=0,minZ=0;
      for(let v=0;v<N;v++){
        const dx=pos[v*3]-prev[v*3],dy=pos[v*3+1]-prev[v*3+1],dz=pos[v*3+2]-prev[v*3+2];
        maxV=Math.max(maxV,Math.sqrt(dx*dx+dy*dy+dz*dz)/subDt);
        maxZ=Math.max(maxZ,pos[v*3+2]);minZ=Math.min(minZ,pos[v*3+2]);
      }
      const zR=maxZ-minZ;
      const st=maxV>50?'💥':maxV>10?'⚠️':maxV>2?'🔸':'✅';
      const fl=zR>1.5?'🌊🌊':zR>0.5?'🌊':'—';
      console.log(`f${String(frame).padStart(3)}: ${st}${fl} vel=${maxV.toFixed(2).padStart(7)} zR=${zR.toFixed(3)} weld=${welded.size}/${groups.length}`);
    }
  }
  let maxZ=0,minZ=0;
  for(let v=0;v<N;v++){maxZ=Math.max(maxZ,pos[v*3+2]);minZ=Math.min(minZ,pos[v*3+2]);}
  // Final velocity
  let finalV=0;
  const subDtF=(1/60)/cfg.substeps;
  for(let v=0;v<N;v++){const dx=pos[v*3]-prev[v*3],dy=pos[v*3+1]-prev[v*3+1],dz=pos[v*3+2]-prev[v*3+2];finalV=Math.max(finalV,Math.sqrt(dx*dx+dy*dy+dz*dz)/subDtF);}
  return{zRange:maxZ-minZ,weld:welded.size,finalV};
}

const results={};
for(const[n,c] of Object.entries(CONFIGS)) results[n]=run(n,c);
console.log('\n\nSUMMARY');
console.log('='.repeat(60));
for(const[n,r] of Object.entries(results)){
  const ok=r.finalV<2&&r.zRange>0.5;
  console.log(`${ok?'✅':'❌'} ${n.padEnd(16)} vel=${r.finalV.toFixed(2).padStart(8)} zR=${r.zRange.toFixed(3)} weld=${r.weld}/18`);
}
