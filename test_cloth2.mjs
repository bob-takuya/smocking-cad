/**
 * Cloth test round 2 - focus on verlet + soft constraints + snap tuning
 */
const RES=20, N=(RES+1)**2, SPACING=0.5;
function vidx(i,j){return j*(RES+1)+i;}

const CONFIGS = {
  // Verlet + soft stretch + big snap
  verletSoft: {
    substeps:20, gravity:-5, stretchC:1e-5, bendC:1e-3,
    damping:0.998, lerpRate:0.025, snapDist:0.5, useVerlet:true,
  },
  // Verlet + medium stretch + fast lerp
  verletMed: {
    substeps:20, gravity:-5, stretchC:1e-6, bendC:1e-4,
    damping:0.997, lerpRate:0.04, snapDist:0.3, useVerlet:true,
  },
  // Verlet + velocity kill at weld
  verletKill: {
    substeps:20, gravity:-5, stretchC:1e-5, bendC:1e-3,
    damping:0.997, lerpRate:0.03, snapDist:0.5, useVerlet:true, killOnWeld:true,
  },
  // softerStretch + bigger snap (most promising from round 1)
  softSnap05: {
    substeps:20, gravity:-6, stretchC:1e-5, bendC:1e-3,
    damping:0.98, lerpRate:0.02, snapDist:0.5,
  },
  // softSnap + stronger lerp
  softFast: {
    substeps:20, gravity:-4, stretchC:1e-5, bendC:1e-3,
    damping:0.98, lerpRate:0.05, snapDist:0.5,
  },
  // Verlet + velocity injection toward midpoint (instead of lerp)
  verletVelInject: {
    substeps:20, gravity:-5, stretchC:1e-5, bendC:1e-3,
    damping:0.997, snapDist:0.3, useVerlet:true, useVelInject:true, injectSpeed:0.15,
  },
  // Gradual pin: move pin target 0.05 units/frame toward midpoint
  gradualPin: {
    substeps:20, gravity:-5, stretchC:1e-8, bendC:5e-5,
    damping:0.995, snapDist:0.05, useVerlet:true, useGradualPin:true, pinSpeed:0.08,
  },
};

function buildConstraints(pos, stretchC, bendC) {
  const cons=[];
  const d=(a,b)=>{const dx=pos[b*3]-pos[a*3],dy=pos[b*3+1]-pos[a*3+1],dz=pos[b*3+2]-pos[a*3+2];return Math.sqrt(dx*dx+dy*dy+dz*dz);};
  for(let j=0;j<=RES;j++) for(let i=0;i<=RES;i++){
    const v=vidx(i,j);
    if(i<RES) cons.push({a:v,b:vidx(i+1,j),r:d(v,vidx(i+1,j)),c:stretchC});
    if(j<RES) cons.push({a:v,b:vidx(i,j+1),r:d(v,vidx(i,j+1)),c:stretchC});
    if(i<RES&&j<RES){cons.push({a:v,b:vidx(i+1,j+1),r:d(v,vidx(i+1,j+1)),c:stretchC});cons.push({a:vidx(i+1,j),b:vidx(i,j+1),r:d(vidx(i+1,j),vidx(i,j+1)),c:stretchC});}
    if(i+2<=RES) cons.push({a:v,b:vidx(i+2,j),r:d(v,vidx(i+2,j)),c:bendC});
    if(j+2<=RES) cons.push({a:v,b:vidx(i,j+2),r:d(v,vidx(i,j+2)),c:bendC});
  }
  return cons;
}
function dist3(pos,a,b){const dx=pos[b*3]-pos[a*3],dy=pos[b*3+1]-pos[a*3+1],dz=pos[b*3+2]-pos[a*3+2];return Math.sqrt(dx*dx+dy*dy+dz*dz);}

function runConfig(name, cfg) {
  console.log(`\n${'='.repeat(55)}\n${name}`);
  const pos=new Float32Array(N*3),prev=new Float32Array(N*3),vel=new Float32Array(N*3),w=new Float32Array(N);
  const half=(RES*SPACING)/2;
  for(let j=0;j<=RES;j++) for(let i=0;i<=RES;i++){
    const v=vidx(i,j);
    pos[v*3]=i*SPACING-half; pos[v*3+1]=-j*SPACING; pos[v*3+2]=(Math.random()-0.5)*0.04;
    prev[v*3]=pos[v*3]; prev[v*3+1]=pos[v*3+1]; prev[v*3+2]=pos[v*3+2];
    w[v]=j===0?0:1;
  }
  const cons=buildConstraints(pos,cfg.stretchC,cfg.bendC);
  const SUBSTEPS=cfg.substeps, GRAVITY=cfg.gravity, DAMPING=cfg.damping, dt=1/60;
  const pA=vidx(Math.round(RES*0.25),Math.round(RES*0.6));
  const pB=vidx(Math.round(RES*0.75),Math.round(RES*0.6));
  const STRENGTH=0.8, SNAP=cfg.snapDist;

  // For gradual pin: track pin target position
  const initMidX=(pos[pA*3]+pos[pB*3])/2;
  const initMidY=(pos[pA*3+1]+pos[pB*3+1])/2;
  const initMidZ=(pos[pA*3+2]+pos[pB*3+2])/2;
  let pinTargetX=pos[pA*3], pinTargetY=pos[pA*3+1], pinTargetZ=pos[pA*3+2]; // starts at pA, moves to mid

  let welded=false;
  const LOG=[1,5,10,30,60,120,240,360,480];

  for(let frame=1;frame<=500;frame++){
    const subDt=dt/SUBSTEPS, sd2=subDt*subDt;

    // Gradual pin: advance target toward midpoint
    if(cfg.useGradualPin && !welded){
      const dx=initMidX-pinTargetX, dy=initMidY-pinTargetY, dz=initMidZ-pinTargetZ;
      const d=Math.sqrt(dx*dx+dy*dy+dz*dz);
      if(d>0.01){
        const step=Math.min(cfg.pinSpeed, d);
        pinTargetX+=step*dx/d; pinTargetY+=step*dy/d; pinTargetZ+=step*dz/d;
      }
    }

    for(let sub=0;sub<SUBSTEPS;sub++){
      if(cfg.useVerlet){
        for(let v=0;v<N;v++){
          if(w[v]===0) continue;
          const vx=pos[v*3]-prev[v*3], vy=pos[v*3+1]-prev[v*3+1], vz=pos[v*3+2]-prev[v*3+2];
          prev[v*3]=pos[v*3]; prev[v*3+1]=pos[v*3+1]; prev[v*3+2]=pos[v*3+2];
          pos[v*3]+=vx*DAMPING; pos[v*3+1]+=vy*DAMPING+GRAVITY*subDt*subDt; pos[v*3+2]+=vz*DAMPING;
        }
      } else {
        for(let v=0;v<N;v++){
          if(w[v]===0) continue;
          vel[v*3+1]+=GRAVITY*subDt;
          prev[v*3]=pos[v*3]; prev[v*3+1]=pos[v*3+1]; prev[v*3+2]=pos[v*3+2];
          pos[v*3]+=vel[v*3]*subDt; pos[v*3+1]+=vel[v*3+1]*subDt; pos[v*3+2]+=vel[v*3+2]*subDt;
        }
      }

      for(const c of cons){
        const wa=w[c.a],wb=w[c.b],wSum=wa+wb; if(wSum===0) continue;
        const dx=pos[c.b*3]-pos[c.a*3],dy=pos[c.b*3+1]-pos[c.a*3+1],dz=pos[c.b*3+2]-pos[c.a*3+2];
        const d=Math.sqrt(dx*dx+dy*dy+dz*dz); if(d<1e-6) continue;
        const alpha=c.c/sd2, lam=-(d-c.r)/(wSum+alpha), nx=dx/d,ny=dy/d,nz=dz/d;
        pos[c.a*3]-=wa*lam*nx; pos[c.a*3+1]-=wa*lam*ny; pos[c.a*3+2]-=wa*lam*nz;
        pos[c.b*3]+=wb*lam*nx; pos[c.b*3+1]+=wb*lam*ny; pos[c.b*3+2]+=wb*lam*nz;
      }

      // Stitch
      const d=dist3(pos,pA,pB);
      const mx=(pos[pA*3]+pos[pB*3])/2, my=(pos[pA*3+1]+pos[pB*3+1])/2, mz=(pos[pA*3+2]+pos[pB*3+2])/2;
      if(welded){
        pos[pA*3]=pos[pB*3]=mx; pos[pA*3+1]=pos[pB*3+1]=my; pos[pA*3+2]=pos[pB*3+2]=mz;
        if(!cfg.useVerlet){vel[pA*3]=vel[pA*3+1]=vel[pA*3+2]=vel[pB*3]=vel[pB*3+1]=vel[pB*3+2]=0;}
      } else if(cfg.useGradualPin){
        // Pin both to current pin target
        pos[pA*3]=pinTargetX; pos[pA*3+1]=pinTargetY; pos[pA*3+2]=pinTargetZ;
        pos[pB*3]=pinTargetX; pos[pB*3+1]=pinTargetY; pos[pB*3+2]=pinTargetZ;
        if(d<SNAP) welded=true;
      } else if(cfg.useVelInject){
        // Inject velocity toward midpoint
        if(!cfg.useVerlet){
          const ux=mx-pos[pA*3],uy=my-pos[pA*3+1],uz=mz-pos[pA*3+2],ud=Math.sqrt(ux*ux+uy*uy+uz*uz)||1;
          vel[pA*3]=cfg.injectSpeed*ux/ud; vel[pA*3+1]=cfg.injectSpeed*uy/ud; vel[pA*3+2]=cfg.injectSpeed*uz/ud;
          vel[pB*3]=-cfg.injectSpeed*ux/ud; vel[pB*3+1]=-cfg.injectSpeed*uy/ud; vel[pB*3+2]=-cfg.injectSpeed*uz/ud;
        }
        if(d<SNAP) welded=true;
      } else {
        if(d<SNAP){
          welded=true;
          pos[pA*3]=pos[pB*3]=mx; pos[pA*3+1]=pos[pB*3+1]=my; pos[pA*3+2]=pos[pB*3+2]=mz;
        } else {
          const rate=STRENGTH*(cfg.lerpRate||0.02);
          pos[pA*3]+=(mx-pos[pA*3])*rate; pos[pA*3+1]+=(my-pos[pA*3+1])*rate; pos[pA*3+2]+=(mz-pos[pA*3+2])*rate;
          pos[pB*3]+=(mx-pos[pB*3])*rate; pos[pB*3+1]+=(my-pos[pB*3+1])*rate; pos[pB*3+2]+=(mz-pos[pB*3+2])*rate;
        }
      }

      if(!cfg.useVerlet){
        for(let v=0;v<N;v++){if(w[v]===0) continue;
          vel[v*3]=(pos[v*3]-prev[v*3])/subDt; vel[v*3+1]=(pos[v*3+1]-prev[v*3+1])/subDt; vel[v*3+2]=(pos[v*3+2]-prev[v*3+2])/subDt;
        }
      }
    }
    if(!cfg.useVerlet){ for(let v=0;v<N;v++){vel[v*3]*=DAMPING;vel[v*3+1]*=DAMPING;vel[v*3+2]*=DAMPING;} }

    if(LOG.includes(frame)){
      let maxVel=0,maxZ=0;
      for(let v=0;v<N;v++){
        if(w[v]===0) continue;
        let spd;
        if(cfg.useVerlet){const dx=pos[v*3]-prev[v*3],dy=pos[v*3+1]-prev[v*3+1],dz=pos[v*3+2]-prev[v*3+2];spd=Math.sqrt(dx*dx+dy*dy+dz*dz)/subDt;}
        else{spd=Math.sqrt(vel[v*3]**2+vel[v*3+1]**2+vel[v*3+2]**2);}
        maxVel=Math.max(maxVel,spd); maxZ=Math.max(maxZ,Math.abs(pos[v*3+2]));
      }
      const sd=dist3(pos,pA,pB);
      const st=maxVel>50?'💥':maxVel>10?'⚠️':maxVel>2?'🔸':'✅';
      console.log(`f${String(frame).padStart(3)}: ${st} vel=${maxVel.toFixed(2).padStart(7)} sd=${sd.toFixed(3)} maxZ=${maxZ.toFixed(3)} weld=${welded}`);
    }
  }
  const finalSD=dist3(pos,pA,pB);
  let finalVel=0;
  for(let v=0;v<N;v++){if(w[v]===0)continue;const s=Math.sqrt(vel[v*3]**2+vel[v*3+1]**2+vel[v*3+2]**2);finalVel=Math.max(finalVel,s);}
  console.log(`→ finalSD=${finalSD.toFixed(4)} finalVel=${finalVel.toFixed(3)} welded=${welded}`);
  return {finalSD, finalVel, welded};
}

const results={};
for(const [n,c] of Object.entries(CONFIGS)) results[n]=runConfig(n,c);
console.log('\n\nSUMMARY');
for(const [n,r] of Object.entries(results)){
  const ok=r.welded&&isFinite(r.finalVel)&&r.finalVel<2;
  console.log(`${ok?'✅':'❌'} ${n.padEnd(22)} vel=${String(r.finalVel.toFixed(2)).padStart(8)} sd=${r.finalSD.toFixed(4)} weld=${r.welded}`);
}
