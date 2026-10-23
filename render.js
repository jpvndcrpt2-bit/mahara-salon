/* Mah Ara — makeup & hair renderer.
   Texture-preserving recolouring (luminance kept) with feathered masks, so lips keep their gloss,
   brows keep their hairs and hair keeps its highlights. Pure canvas; everything runs on the device. */
const LIP_OUT=[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];
const LIP_IN=[78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95];
const EYES=[
  {upper:[33,246,161,160,159,158,157,173,133],open:[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],outer:33,inner:133},
  {upper:[263,466,388,387,386,385,384,398,362],open:[362,398,384,385,386,387,388,466,263,249,390,373,374,380,381,382],outer:263,inner:362}
];
const BROWS=[{up:[70,63,105,66,107],lo:[46,53,52,65,55]},{up:[300,293,334,296,336],lo:[276,283,282,295,285]}];
const CHEEKS=[[50,101],[280,330]];

let cache={photo:null,face:null,W:0,H:0};
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lumOf=(r,g,b)=>r*.299+g*.587+b*.114;
const hex=h=>h.match(/\w\w/g).map(x=>parseInt(x,16));

function region(W,H,pts,blur,draw){
  /* returns {x0,y0,w,h,a:Uint8ClampedArray} — alpha mask limited to the bounding box */
  let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  for(const p of pts){minx=Math.min(minx,p[0]);miny=Math.min(miny,p[1]);maxx=Math.max(maxx,p[0]);maxy=Math.max(maxy,p[1])}
  const pad=Math.ceil(blur*3+4),x0=Math.max(0,Math.floor(minx-pad)),y0=Math.max(0,Math.floor(miny-pad)),x1=Math.min(W,Math.ceil(maxx+pad)),y1=Math.min(H,Math.ceil(maxy+pad)),w=x1-x0,h=y1-y0;
  if(w<=0||h<=0)return null;
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});
  g.translate(-x0,-y0);if(blur)g.filter=`blur(${blur}px)`;g.fillStyle='#fff';draw(g);
  const d=g.getImageData(0,0,w,h).data,a=new Uint8ClampedArray(w*h);for(let i=0;i<a.length;i++)a[i]=d[i*4+3];
  return{x0,y0,w,h,a};
}
const poly=(g,pts)=>{g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();g.fill()};
function subtract(r,o){ /* r.alpha *= (1 - o.alpha) */
  if(!r||!o)return r;
  for(let y=0;y<r.h;y++){const oy=y+r.y0-o.y0;if(oy<0||oy>=o.h)continue;for(let x=0;x<r.w;x++){const ox=x+r.x0-o.x0;if(ox<0||ox>=o.w)continue;r.a[y*r.w+x]*=1-o.a[oy*o.w+ox]/255}}
  return r;
}

function build(W,H,F){
  const P=i=>[F[i].x*W,F[i].y*H],dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const R={eyes:[],brows:[],cheeks:[]};
  const bl=W*.0014;
  const out=LIP_OUT.map(P),inn=LIP_IN.map(P);
  R.lip=subtract(region(W,H,out,bl*1.2,g=>poly(g,out)),region(W,H,inn,bl,g=>poly(g,inn)));
  for(const e of EYES){
    const up=e.upper.map(P),ew=dist(P(e.outer),P(e.inner)),lift=ew*.34,sh=up.map(p=>[p[0],p[1]-lift]),open=e.open.map(P);
    const shape=[...up,...sh.slice().reverse()];
    const r=subtract(region(W,H,shape,ew*.07,g=>poly(g,shape)),region(W,H,open,ew*.02,g=>poly(g,open)));
    R.eyes.push({r,up,ew,outer:P(e.outer),inner:P(e.inner)});
  }
  for(const b of BROWS){const pts=[...b.up.map(P),...b.lo.slice().reverse().map(P)];R.brows.push(region(W,H,pts,W*.0012,g=>poly(g,pts)))}
  for(const [a,b] of CHEEKS){
    const pa=P(a),pb=P(b),x=(pa[0]+pb[0])/2,y=(pa[1]+pb[1])/2,rad=W*.085;
    R.cheeks.push(region(W,H,[[x-rad,y-rad],[x+rad,y+rad]],0,g=>{g.save();const gr=g.createRadialGradient(x,y/.7,0,x,y/.7,rad);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.55,'rgba(255,255,255,.55)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.scale(1,.7);g.beginPath();g.arc(x,y/.7,rad,0,Math.PI*2);g.fill();g.restore()}));
  }
  return R;
}

/* recolour a region while keeping the pixel's own light/shadow. k: 0 = keep luminance, 1 = use the colour's luminance */
function tint(d,W,r,rgb,strength,k,gloss){
  if(!r)return;
  const rl=Math.max(20,lumOf(rgb[0],rgb[1],rgb[2]));
  for(let y=0;y<r.h;y++){let o=((y+r.y0)*W+r.x0)*4,ai=y*r.w;
    for(let x=0;x<r.w;x++,o+=4,ai++){
      const al=r.a[ai]/255*strength;if(al<.01)continue;
      const lum=lumOf(d[o],d[o+1],d[o+2]),f=(rl*k+lum*(1-k))/rl,hl=gloss?Math.max(0,lum-190)*gloss:0;
      for(let c=0;c<3;c++){const t=clamp(rgb[c]*f+hl,0,255);d[o+c]=d[o+c]*(1-al)+t*al}
    }}
}

function hairAlpha(hair,W,H){
  if(hair.cache&&hair.cache.W===W&&hair.cache.H===H)return hair.cache.a;
  const mw=hair.width,mh=hair.height,src=document.createElement('canvas');src.width=mw;src.height=mh;
  const sg=src.getContext('2d'),im=sg.createImageData(mw,mh);
  for(let i=0;i<mw*mh;i++){const v=hair.soft?hair.values[i]:(hair.values[i]===1?255:0);im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=255;im.data[i*4+3]=v}
  sg.putImageData(im,0,0);
  const dst=document.createElement('canvas');dst.width=W;dst.height=H;const g=dst.getContext('2d',{willReadFrequently:true});
  g.imageSmoothingQuality='high';if(!hair.soft)g.filter=`blur(${Math.max(1,W/700)}px)`;g.drawImage(src,0,0,W,H);
  const d=g.getImageData(0,0,W,H).data,a=new Uint8ClampedArray(W*H);for(let i=0;i<a.length;i++)a[i]=d[i*4+3];
  hair.cache={W,H,a};return a;
}

function recolourHair(d,W,H,hair,rgb,s){
  const a=hairAlpha(hair,W,H);let sum=0,n=0;
  for(let i=0;i<a.length;i++)if(a[i]>200){const o=i*4;sum+=lumOf(d[o],d[o+1],d[o+2]);n++}
  const mean=clamp(n?sum/n:60,28,150);
  for(let i=0;i<a.length;i++){const al=a[i]/255*s;if(al<.01)continue;const o=i*4,lum=lumOf(d[o],d[o+1],d[o+2]),f=clamp(lum/mean,.45,2.1),lift=Math.max(0,(lum-mean*1.4)/255)*90;
    for(let c=0;c<3;c++){const t=Math.min(255,rgb[c]*f+lift);d[o+c]=d[o+c]*(1-al)+t*al}}
}

function liner(ctx,E,a,W){
  for(const e of E){
    const u=e.up,ew=e.ew;ctx.save();ctx.strokeStyle='#241a1c';ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=Math.min(.95,a*1.8);
    ctx.lineWidth=Math.max(1.5,ew*.075);ctx.beginPath();ctx.moveTo(u[0][0],u[0][1]);
    for(let i=1;i<u.length-1;i++){const mx=(u[i][0]+u[i+1][0])/2,my=(u[i][1]+u[i+1][1])/2;ctx.quadraticCurveTo(u[i][0],u[i][1],mx,my)}
    ctx.lineTo(u[u.length-1][0],u[u.length-1][1]);ctx.stroke();
    const ox=e.outer[0]-e.inner[0],oy=e.outer[1]-e.inner[1],len=Math.hypot(ox,oy)||1;
    ctx.lineWidth=Math.max(1.2,ew*.05);ctx.beginPath();ctx.moveTo(e.outer[0],e.outer[1]);
    ctx.lineTo(e.outer[0]+ox/len*ew*.17,e.outer[1]+oy/len*ew*.17-ew*.07);ctx.stroke();ctx.restore();
  }
}

export function drawLook({ctx,canvas,photo,facePoints,hairMask,state,before}){
  const W=canvas.width,H=canvas.height;
  if(cache.photo!==photo||cache.W!==W||cache.H!==H){cache={photo,W,H,data:photo.getContext?photo.getContext('2d').getImageData(0,0,W,H):null,face:null,regions:null}}
  const base=cache.data;
  if(!base){ctx.drawImage(photo,0,0);return}
  const img=ctx.createImageData(W,H);img.data.set(base.data);
  if(!before){
    const a=state.intensity,d=img.data;
    if(state.hair&&hairMask)recolourHair(d,W,H,hairMask,hex(state.hair),Math.min(.95,.4+a*1.1));
    if(facePoints){
      if(cache.face!==facePoints){cache.face=facePoints;cache.regions=build(W,H,facePoints)}
      const R=cache.regions;
      if(state.blush)for(const r of R.cheeks)tint(d,W,r,hex(state.blush),Math.min(.75,a*1.2),.12,0);
      if(state.eye)for(const e of R.eyes)tint(d,W,e.r,hex(state.eye),Math.min(.85,a*1.4),.45,0);
      if(state.brow)for(const r of R.brows)tint(d,W,r,hex(state.brow),Math.min(.9,a*1.5),.5,0);
      if(state.lip)tint(d,W,R.lip,hex(state.lip),Math.min(.92,a*1.9),.6,.9);
    }
  }
  ctx.putImageData(img,0,0);
  if(!before&&facePoints&&state.liner&&cache.regions)liner(ctx,cache.regions.eyes,state.intensity,W);
}
