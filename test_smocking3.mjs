/**
 * Round 3: XPBD-only stitch (no lerp/weld) + correct XY coordinate system
 *
 * Root cause of persistent vel~27:
 *   lerp/weld sets pos→centroid (kills velocity),
 *   then stretch constraints move pos away → energy injected every substep.
 *
 * Solution: treat stitch as a normal XPBD distance constraint (restLen=0, adjustable compliance).
 *   This way constraints reach equilibrium naturally — no energy injection.
 *
 * Key question: can XPBD stitch (restLen=0) close the gap with stretchC=1e-5?
 *   (In round 1 it failed with stretchC=1e-8, but softer cloth should allow it)
 */

const NX=9,NY=6,SCALE=1.0,N=NX*NY;
function vidx(i,j){return j*NX+i;}
function dist3(pos,a,b){const dx=pos[b*3]-pos[a*3],dy=pos[b*3+1]-pos[a*3+1],dz=pos[b*3+2]-pos[a*3+2];return Math.sqrt(dx*dx+dy*dy+dz*dz);}

function init(noiseAmp){
  const pos=new Float32Array(N*3),prev=new Float32Array(N*3),w=new Float32Array(N);
  for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){
    const v=vidx(i,j);
    pos[v*3]=i*SCALE;pos[v*3+1]=-j*SCALE;pos[v*3+2]=(Math.random()-0.5)*noiseAmp;
    prev[v*3]=pos[v*3];prev[v*3+1]=pos[v*3+1];prev[v*3+2]=pos[v*3+2];
    w[v]=j===0?0:1;
  }
  return{pos,prev,w};
}
function buildCons(pos,sC,bC){
  const cons=[],seen=new Set();
  const add=(a,b,c)=>{const k=a<b?`${a}-${b}`:`${b}-${a}`;if(seen.has(k))return;seen.add(k);
    const dx=pos[b*3]-pos[a*3],dy=pos[b*3+1]-pos[a*3+1],dz=pos[b*3+2]-pos[a*3+2];
    const r=Math.sqrt(dx*dx+dy*dy+dz*dz);if(r<1e-6)return;cons.push({a,b,r,c});};
  for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){
    const v=vidx(i,j);
    if(i+1<NX)add(v,vidx(i+1,j),sC);if(j+1<NY)add(v,vidx(i,j+1),sC);
    if(i+1<NX&&j+1<NY){add(v,vidx(i+1,j+1),sC);add(vidx(i+1,j),vidx(i,j+1),sC);}
    if(i+2<NX)add(v,vidx(i+2,j),bC);if(j+2<NY)add(v,vidx(i,j+2),bC);
  }
  return cons;
}
function buildGroups(){
  const g=[];
  for(let j=1;j<NY;j++){const o=(j%2===1)?0:1;for(let i=o;i+2<NX;i+=2)g.push([vidx(i,j),vidx(i+2,j)]);}
  return g;
}

// XPBD stitch: distance constraint with restLen=0 between each pair in a group
function buildStitchCons(groups, stitchCompliance){
  const cons=[];
  for(const group of groups){
    for(let a=0;a<group.length-1;a++)
      for(let b=a+1;b<group.length;b++)
        cons.push({a:group[a],b:group[b],r:0,c:stitchCompliance});
  }
  return cons;
}

const BASE={substeps:20,gravity:-3,stretchC:1e-5,bendC:5e-4,damp:0.998,noiseAmp:0.05,strength:0.9};

const CONFIGS = {
  // A: XPBD stitch compliance = soft
  xpbdSoft:   {...BASE, stitchC: 1e-3},
  // B: XPBD stitch compliance = medium
  xpbdMed:    {...BASE, stitchC: 1e-4},
  // C: XPBD stitch compliance = stiff
  xpbdStiff:  {...BASE, stitchC: 1e-5},
  // D: XPBD stitch + more substeps
  xpbdMore:   {...BASE, stitchC: 1e-4, substeps:30},
  // E: XPBD + no gravity (best fold in round1 was noGravity)
  xpbdNoGrav: {...BASE, stitchC: 1e-4, gravity:0},
  // F: XPBD + stronger damping
  xpbdDamp:   {...BASE, stitchC: 1e-4, damp:0.993},
  // G: XPBD + bend stiffness sweep
  xpbdBend2:  {...BASE, stitchC: 1e-4, bendC:1e-3},
  // H: reference — old lerp+weld from round2 baseline
  lerpWeld:   {...BASE, useLerp:true, lerpRate:0.025, snap:0.5},
};

function run(name,cfg){
  const{pos,prev,w}=init(cfg.noiseAmp);
  const cons=buildCons(pos,cfg.stretchC,cfg.bendC);
  const groups=buildGroups();
  const subDt=(1/60)/cfg.substeps,sd2=subDt*subDt;
  const LOG=[1,5,10,30,60,120,240,480];
  const welded=new Set();
  let stitchCons=[];
  if(!cfg.useLerp) stitchCons=buildStitchCons(groups, cfg.stitchC);

  console.log(`\n${'='.repeat(50)}\n${name} | stitchCons=${stitchCons.length}`);
  for(let frame=1;frame<=500;frame++){
    for(let sub=0;sub<cfg.substeps;sub++){
      // Verlet
      for(let v=0;v<N;v++){
        if(w[v]===0)continue;
        const vx=(pos[v*3]-prev[v*3])*cfg.damp,vy=(pos[v*3+1]-prev[v*3+1])*cfg.damp,vz=(pos[v*3+2]-prev[v*3+2])*cfg.damp;
        prev[v*3]=pos[v*3];prev[v*3+1]=pos[v*3+1];prev[v*3+2]=pos[v*3+2];
        pos[v*3]+=vx;pos[v*3+1]+=vy+(cfg.gravity||0)*sd2;pos[v*3+2]+=vz;
      }
      // Structural constraints
      for(const c of cons){
        const wa=w[c.a],wb=w[c.b],wS=wa+wb;if(wS===0)continue;
        const dx=pos[c.b*3]-pos[c.a*3],dy=pos[c.b*3+1]-pos[c.a*3+1],dz=pos[c.b*3+2]-pos[c.a*3+2];
        const d=Math.sqrt(dx*dx+dy*dy+dz*dz);if(d<1e-6)continue;
        const lam=-(d-c.r)/(wS+c.c/sd2),nx=dx/d,ny=dy/d,nz=dz/d;
        pos[c.a*3]-=wa*lam*nx;pos[c.a*3+1]-=wa*lam*ny;pos[c.a*3+2]-=wa*lam*nz;
        pos[c.b*3]+=wb*lam*nx;pos[c.b*3+1]+=wb*lam*ny;pos[c.b*3+2]+=wb*lam*nz;
      }
      // XPBD stitch constraints (same as structural, but restLen=0)
      if(!cfg.useLerp){
        for(const c of stitchCons){
          const wa=w[c.a],wb=w[c.b],wS=wa+wb;if(wS===0)continue;
          const dx=pos[c.b*3]-pos[c.a*3],dy=pos[c.b*3+1]-pos[c.a*3+1],dz=pos[c.b*3+2]-pos[c.a*3+2];
          const d=Math.sqrt(dx*dx+dy*dy+dz*dz);if(d<1e-6)continue;
          const lam=-d/(wS+c.c/sd2),nx=dx/d,ny=dy/d,nz=dz/d;
          pos[c.a*3]-=wa*lam*nx;pos[c.a*3+1]-=wa*lam*ny;pos[c.a*3+2]-=wa*lam*nz;
          pos[c.b*3]+=wb*lam*nx;pos[c.b*3+1]+=wb*lam*ny;pos[c.b*3+2]+=wb*lam*nz;
        }
      } else {
        // Lerp+weld (reference)
        groups.forEach((group,gi)=>{
          let cx=0,cy=0,cz=0,cnt=0;
          for(const vi of group){if(w[vi]===0)continue;cx+=pos[vi*3];cy+=pos[vi*3+1];cz+=pos[vi*3+2];cnt++;}
          if(cnt===0)return;cx/=cnt;cy/=cnt;cz/=cnt;
          if(welded.has(gi)){
            for(const vi of group){if(w[vi]===0)continue;pos[vi*3]=cx;pos[vi*3+1]=cy;pos[vi*3+2]=cz;prev[vi*3]=cx;prev[vi*3+1]=cy;prev[vi*3+2]=cz;}
          } else {
            let maxD=0;for(const vi of group){if(w[vi]===0)continue;const dx=pos[vi*3]-cx,dy=pos[vi*3+1]-cy,dz=pos[vi*3+2]-cz;maxD=Math.max(maxD,Math.sqrt(dx*dx+dy*dy+dz*dz));}
            if(maxD<cfg.snap){welded.add(gi);}
            else{const rate=cfg.strength*cfg.lerpRate;for(const vi of group){if(w[vi]===0)continue;pos[vi*3]+=(cx-pos[vi*3])*rate;pos[vi*3+1]+=(cy-pos[vi*3+1])*rate;pos[vi*3+2]+=(cz-pos[vi*3+2])*rate;}}
          }
        });
      }
    }
    if(LOG.includes(frame)){
      let maxV=0,maxZ=0,minZ=0;
      for(let v=0;v<N;v++){
        const dx=pos[v*3]-prev[v*3],dy=pos[v*3+1]-prev[v*3+1],dz=pos[v*3+2]-prev[v*3+2];
        maxV=Math.max(maxV,Math.sqrt(dx*dx+dy*dy+dz*dz)/subDt);
        maxZ=Math.max(maxZ,pos[v*3+2]);minZ=Math.min(minZ,pos[v*3+2]);
      }
      const zR=maxZ-minZ,sd=groups.length>0?dist3(pos,groups[0][0],groups[0][1]):0;
      const st=maxV>50?'💥':maxV>10?'⚠️':maxV>2?'🔸':'✅';
      const fl=zR>1.5?'🌊🌊':zR>0.5?'🌊':'—';
      console.log(`f${String(frame).padStart(3)}: ${st}${fl} vel=${maxV.toFixed(2).padStart(7)} zR=${zR.toFixed(3)} sd=${sd.toFixed(3)}`);
    }
  }
  let maxZ=0,minZ=0;for(let v=0;v<N;v++){maxZ=Math.max(maxZ,pos[v*3+2]);minZ=Math.min(minZ,pos[v*3+2]);}
  let finalV=0;const sdt=(1/60)/cfg.substeps;
  for(let v=0;v<N;v++){const dx=pos[v*3]-prev[v*3],dy=pos[v*3+1]-prev[v*3+1],dz=pos[v*3+2]-prev[v*3+2];finalV=Math.max(finalV,Math.sqrt(dx*dx+dy*dy+dz*dz)/sdt);}
  const sd0=groups.length>0?dist3(pos,groups[0][0],groups[0][1]):0;
  return{zRange:maxZ-minZ,finalV,sd0};
}

const results={};
for(const[n,c]of Object.entries(CONFIGS))results[n]=run(n,c);
console.log('\n\nSUMMARY');
console.log('='.repeat(65));
for(const[n,r]of Object.entries(results)){
  const ok=r.finalV<5&&r.zRange>0.5&&r.sd0<0.3;
  console.log(`${ok?'✅':'❌'} ${n.padEnd(16)} vel=${r.finalV.toFixed(2).padStart(8)} zR=${r.zRange.toFixed(3)} sd=${r.sd0.toFixed(3)}`);
}
