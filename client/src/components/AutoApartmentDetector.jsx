import React,{useMemo,useState} from 'react';
import {api,statusLabel} from '../api';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function morphDilate(src,w,h){
  const out=new Uint8Array(src.length);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      let hit=0;
      for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1)&&!hit;yy++){
        const row=yy*w;
        for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){
          if(src[row+xx]){hit=1;break}
        }
      }
      out[y*w+x]=hit;
    }
  }
  return out;
}
function morphErode(src,w,h){
  const out=new Uint8Array(src.length);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      let ok=1;
      for(let yy=y-1;yy<=y+1&&ok;yy++){
        for(let xx=x-1;xx<=x+1;xx++){
          if(xx<0||yy<0||xx>=w||yy>=h||!src[yy*w+xx]){ok=0;break}
        }
      }
      out[y*w+x]=ok;
    }
  }
  return out;
}

function components(mask,w,h,eight=true){
  const labels=new Int32Array(mask.length);
  const queue=new Int32Array(mask.length);
  const stats=[];
  let next=0;
  const dirs=eight
    ? [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]
    : [[0,-1],[-1,0],[1,0],[0,1]];

  for(let i=0;i<mask.length;i++){
    if(!mask[i]||labels[i])continue;
    next++;
    let head=0,tail=0;
    queue[tail++]=i;labels[i]=next;
    let area=0,sumX=0,sumY=0,minX=w,minY=h,maxX=0,maxY=0,touchesBorder=false;

    while(head<tail){
      const idx=queue[head++],y=Math.floor(idx/w),x=idx-y*w;
      area++;sumX+=x;sumY+=y;
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      if(x===0||y===0||x===w-1||y===h-1)touchesBorder=true;

      for(const [dx,dy] of dirs){
        const xx=x+dx,yy=y+dy;
        if(xx<0||yy<0||xx>=w||yy>=h)continue;
        const ni=yy*w+xx;
        if(mask[ni]&&!labels[ni]){
          labels[ni]=next;
          queue[tail++]=ni;
        }
      }
    }

    stats.push({
      id:next,area,cx:sumX/area,cy:sumY/area,minX,minY,maxX,maxY,
      width:maxX-minX+1,height:maxY-minY+1,touchesBorder
    });
  }
  return {labels,stats};
}

function suggestedCount(stats,opaqueCount,expected){
  const usable=stats.filter(s=>s.area>=Math.max(60,opaqueCount*.0018)).sort((a,b)=>b.area-a.area).slice(0,30);
  if(!usable.length)return {count:0,usable};
  if(Number(expected)>0)return {count:Math.min(Number(expected),usable.length),usable};

  let bestIndex=-1,bestDrop=.38;
  const maxCheck=Math.min(20,usable.length-1);
  for(let i=3;i<maxCheck;i++){
    const ratio=usable[i+1].area/usable[i].area;
    const drop=1-ratio;
    if(drop>bestDrop && usable[i].area>=opaqueCount*.004){
      bestDrop=drop;bestIndex=i;
    }
  }
  let count=bestIndex>=0?bestIndex+1:usable.filter(s=>s.area>=usable[0].area*.28).length;
  count=clamp(count,1,Math.min(30,usable.length));
  return {count,usable};
}

function key(x,y){return `${x},${y}`}
function polygonArea(points){
  let a=0;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    a+=(points[j][0]*points[i][1]-points[i][0]*points[j][1]);
  }
  return a/2;
}
function pointLineDistance(p,a,b){
  const [px,py]=p,[ax,ay]=a,[bx,by]=b;
  const dx=bx-ax,dy=by-ay;
  if(dx===0&&dy===0)return Math.hypot(px-ax,py-ay);
  const t=clamp(((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy),0,1);
  return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
}
function rdp(points,eps){
  if(points.length<3)return points;
  let maxD=0,index=0;
  const first=points[0],last=points[points.length-1];
  for(let i=1;i<points.length-1;i++){
    const d=pointLineDistance(points[i],first,last);
    if(d>maxD){maxD=d;index=i}
  }
  if(maxD>eps){
    const left=rdp(points.slice(0,index+1),eps);
    const right=rdp(points.slice(index),eps);
    return left.slice(0,-1).concat(right);
  }
  return [first,last];
}
function simplifyClosed(loop,eps=2.2){
  if(loop.length<5)return loop;
  let pts=loop.slice();
  if(pts.length>1&&pts[0][0]===pts[pts.length-1][0]&&pts[0][1]===pts[pts.length-1][1])pts.pop();

  // rotate at a strong corner, then treat as an open polyline with duplicated start
  let corner=0,best=0;
  for(let i=0;i<pts.length;i++){
    const p=pts[(i-1+pts.length)%pts.length],c=pts[i],n=pts[(i+1)%pts.length];
    const cross=Math.abs((c[0]-p[0])*(n[1]-c[1])-(c[1]-p[1])*(n[0]-c[0]));
    if(cross>best){best=cross;corner=i}
  }
  pts=pts.slice(corner).concat(pts.slice(0,corner));
  const open=pts.concat([pts[0]]);
  let out=rdp(open,eps);
  if(out.length>1)out.pop();

  // snap near-axis segments to exact horizontal/vertical and remove duplicates
  const axisTol=3.2;
  for(let i=1;i<out.length;i++){
    const prev=out[i-1],cur=out[i];
    if(Math.abs(cur[0]-prev[0])<=axisTol)cur[0]=prev[0];
    if(Math.abs(cur[1]-prev[1])<=axisTol)cur[1]=prev[1];
  }
  out=out.filter((p,i)=>i===0||p[0]!==out[i-1][0]||p[1]!==out[i-1][1]);

  // remove collinear points
  let changed=true;
  while(changed&&out.length>4){
    changed=false;
    const next=[];
    for(let i=0;i<out.length;i++){
      const a=out[(i-1+out.length)%out.length],b=out[i],c=out[(i+1)%out.length];
      if((a[0]===b[0]&&b[0]===c[0])||(a[1]===b[1]&&b[1]===c[1])){changed=true;continue}
      next.push(b);
    }
    out=next;
  }
  return out;
}

function contourForLabel(labelMap,target,w,h){
  const edges=[];
  const byStart=new Map();
  function add(sx,sy,ex,ey,dir){
    const id=edges.length;
    edges.push({sx,sy,ex,ey,dir,used:false});
    const k=key(sx,sy);
    const arr=byStart.get(k)||[];arr.push(id);byStart.set(k,arr);
  }
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i=y*w+x;
      if(labelMap[i]!==target)continue;
      if(y===0||labelMap[(y-1)*w+x]!==target)add(x,y,x+1,y,0);
      if(x===w-1||labelMap[y*w+x+1]!==target)add(x+1,y,x+1,y+1,1);
      if(y===h-1||labelMap[(y+1)*w+x]!==target)add(x+1,y+1,x,y+1,2);
      if(x===0||labelMap[y*w+x-1]!==target)add(x,y+1,x,y,3);
    }
  }
  const loops=[];
  for(let e0=0;e0<edges.length;e0++){
    if(edges[e0].used)continue;
    const start=edges[e0],loop=[[start.sx,start.sy]];
    start.used=true;
    let cx=start.ex,cy=start.ey,prevDir=start.dir,safety=0;
    while((cx!==start.sx||cy!==start.sy)&&safety++<edges.length+10){
      loop.push([cx,cy]);
      const candidates=(byStart.get(key(cx,cy))||[]).filter(id=>!edges[id].used);
      if(!candidates.length)break;
      let bestId=candidates[0],bestRank=99;
      for(const id of candidates){
        const d=edges[id].dir;
        const delta=(d-prevDir+4)%4;
        const rank=delta===1?0:delta===0?1:delta===3?2:3; // right, straight, left, back
        if(rank<bestRank){bestRank=rank;bestId=id}
      }
      const e=edges[bestId];e.used=true;prevDir=e.dir;cx=e.ex;cy=e.ey;
    }
    if(loop.length>=4&&cx===start.sx&&cy===start.sy)loops.push(loop);
  }
  if(!loops.length)return [];
  loops.sort((a,b)=>Math.abs(polygonArea(b))-Math.abs(polygonArea(a)));
  let chosen=loops[0],eps=2.2;
  let simplified=simplifyClosed(chosen,eps);
  while(simplified.length>80&&eps<10){eps+=.8;simplified=simplifyClosed(chosen,eps)}
  return simplified.map(([x,y])=>({x:clamp(x/w,0,1),y:clamp(y/h,0,1)}));
}

function analyzePixels(imageData,w,h,threshold,expected,excludedIds=new Set()){
  const d=imageData.data,N=w*h;
  const opaque=new Uint8Array(N),dark=new Uint8Array(N);
  let opaqueCount=0;

  for(let i=0,p=0;i<N;i++,p+=4){
    const a=d[p+3];
    if(a>48){
      opaque[i]=1;opaqueCount++;
      const gray=.299*d[p]+.587*d[p+1]+.114*d[p+2];
      if(gray<threshold)dark[i]=1;
    }
  }

  // Close little antialias/gaps, then grow the dark-wall band slightly.
  let wall=morphDilate(dark,w,h);
  wall=morphErode(wall,w,h);
  wall=morphDilate(wall,w,h);

  const free=new Uint8Array(N);
  for(let i=0;i<N;i++)free[i]=opaque[i]&&!wall[i]?1:0;
  const cc=components(free,w,h,true);
  const {count,usable}=suggestedCount(cc.stats,opaqueCount,expected);
  const initial=usable.slice(0,count);
  const chosen=initial.filter(c=>!excludedIds.has(c.id));

  // Transparent holes fully enclosed by the drawing are strong common-core/stair candidates.
  const transparent=new Uint8Array(N);
  for(let i=0;i<N;i++)transparent[i]=opaque[i]?0:1;
  const bg=components(transparent,w,h,true);
  const holes=bg.stats
    .filter(s=>!s.touchesBorder&&s.area>=Math.max(80,N*.0008))
    .sort((a,b)=>b.area-a.area);
  const likelyCore=holes[0]||null;

  const chosenMap=new Map(chosen.map((c,i)=>[c.id,i+1]));
  const excludedMap=new Set(initial.filter(c=>excludedIds.has(c.id)).map(c=>c.id));

  // Multi-source Voronoi inside the opaque plan:
  // apartment free-space competes with common/outside wall edges.
  // This places shared boundaries close to the middle of thick black walls.
  const finalLabels=new Int16Array(N);
  const queue=new Int32Array(N);
  let head=0,tail=0;

  for(let i=0;i<N;i++){
    const c=cc.labels[i];
    if(chosenMap.has(c)){
      finalLabels[i]=chosenMap.get(c);queue[tail++]=i;
    }else if(excludedMap.has(c)){
      finalLabels[i]=-1;queue[tail++]=i;
    }
  }

  // Seed common/outside side of walls only, not open terraces/floors.
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i=y*w+x;
      if(!opaque[i]||!wall[i]||finalLabels[i])continue;
      let nextToTransparent=false;
      if(x===0||!opaque[i-1])nextToTransparent=true;
      else if(x===w-1||!opaque[i+1])nextToTransparent=true;
      else if(y===0||!opaque[i-w])nextToTransparent=true;
      else if(y===h-1||!opaque[i+w])nextToTransparent=true;
      if(nextToTransparent){finalLabels[i]=-1;queue[tail++]=i}
    }
  }

  while(head<tail){
    const idx=queue[head++],label=finalLabels[idx];
    const y=Math.floor(idx/w),x=idx-y*w;
    const ns=[idx-w,idx-1,idx+1,idx+w];
    if(y>0){const n=ns[0];if(opaque[n]&&!finalLabels[n]){finalLabels[n]=label;queue[tail++]=n}}
    if(x>0){const n=ns[1];if(opaque[n]&&!finalLabels[n]){finalLabels[n]=label;queue[tail++]=n}}
    if(x<w-1){const n=ns[2];if(opaque[n]&&!finalLabels[n]){finalLabels[n]=label;queue[tail++]=n}}
    if(y<h-1){const n=ns[3];if(opaque[n]&&!finalLabels[n]){finalLabels[n]=label;queue[tail++]=n}}
  }

  const areas=chosen.map(c=>c.area).sort((a,b)=>a-b);
  const median=areas.length?areas[Math.floor(areas.length/2)]:1;
  const detections=chosen.map((c,i)=>{
    const label=i+1;
    const points=contourForLabel(finalLabels,label,w,h);
    const ratio=c.area/Math.max(1,median);
    const confidence=clamp(.76+.12*Math.min(1,ratio),.70,.94);
    return {componentId:c.id,points,confidence,area:c.area,cx:c.cx/w,cy:c.cy/h};
  }).filter(x=>x.points.length>=4);

  detections.sort((a,b)=>{
    const rowA=Math.round(a.cy*8),rowB=Math.round(b.cy*8);
    return rowA===rowB?a.cx-b.cx:a.cy-b.cy;
  });

  let corePoints=[];
  if(likelyCore){
    corePoints=contourForLabel(bg.labels,likelyCore.id,w,h);
  }

  return {
    detections,
    initialCandidates:initial,
    excludedIds,
    likelyCore:likelyCore?{...likelyCore,points:corePoints}:null,
    threshold,
    expected:Number(expected)||0,
    opaqueCount,
    width:w,height:h
  };
}

async function loadPlan(url,maxDim=520){
  const r=await fetch(url,{mode:'cors'});
  if(!r.ok)throw new Error(`Nu pot încărca planul (${r.status}).`);
  const blob=await r.blob();
  const bmp=await createImageBitmap(blob);
  const scale=Math.min(1,maxDim/Math.max(bmp.width,bmp.height));
  const w=Math.max(1,Math.round(bmp.width*scale)),h=Math.max(1,Math.round(bmp.height*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.clearRect(0,0,w,h);ctx.drawImage(bmp,0,0,w,h);
  return {imageData:ctx.getImageData(0,0,w,h),w,h};
}

const colors=[
  '#22b573','#4f7cff','#f28d63','#9b6ad6','#e4b743','#00a7b5','#e66f9d','#7eb54b',
  '#d66d3a','#607dcb','#7f62a3','#57a86b','#ca6f8a','#b3a33c','#3f94b8','#d58043'
];

export default function AutoApartmentDetector({floor,onClose,onCommitted}){
  const [expected,setExpected]=useState('');
  const [threshold,setThreshold]=useState(90);
  const [busy,setBusy]=useState(false);
  const [raw,setRaw]=useState(null);
  const [result,setResult]=useState(null);
  const [excluded,setExcluded]=useState(new Set());
  const [overwrite,setOverwrite]=useState(false);
  const [message,setMessage]=useState('');
  const [mapping,setMapping]=useState({});

  const existing=floor?.apartments||[];

  async function run(){
    if(!floor?.plan_path)return;
    setBusy(true);setMessage('');
    try{
      const loaded=raw||await loadPlan(floor.plan_path);
      if(!raw)setRaw(loaded);
      const r=analyzePixels(loaded.imageData,loaded.w,loaded.h,Number(threshold)||90,expected,new Set());
      setExcluded(new Set());
      setResult(r);
      const m={};
      r.detections.forEach((d,i)=>{m[i]=existing[i]?.id||'new'});
      setMapping(m);
    }catch(e){
      setMessage(`Eroare detectare: ${e.message}`);
    }finally{setBusy(false)}
  }

  function recompute(nextExcluded){
    if(!raw)return;
    const r=analyzePixels(raw.imageData,raw.w,raw.h,Number(threshold)||90,expected,nextExcluded);
    setExcluded(nextExcluded);setResult(r);
    const m={};
    r.detections.forEach((d,i)=>{m[i]=existing[i]?.id||'new'});
    setMapping(m);
  }

  function markCommon(componentId){
    const next=new Set(excluded);
    if(next.has(componentId))next.delete(componentId);else next.add(componentId);
    recompute(next);
  }

  async function commit(){
    if(!result?.detections?.length)return;
    const used=result.detections.map((d,i)=>mapping[i]).filter(v=>v&&v!=='new');
    if(new Set(used).size!==used.length){
      return setMessage('Același apartament existent este selectat pentru două poligoane. Schimbă maparea.');
    }

    setBusy(true);setMessage('');
    try{
      const payload={
        overwrite_existing:overwrite,
        detections:result.detections.map((d,i)=>({
          points:d.points,
          confidence:d.confidence,
          target_apartment_id:mapping[i]==='new'?null:mapping[i],
          suggested_code:`A${String(i+1).padStart(2,'0')}`
        }))
      };
      const saved=await api(`/admin/floors/${floor.id}/auto-apartments`,{method:'POST',body:payload});
      setMessage(`✓ ${saved.saved} poligoane salvate · ${saved.created} apartamente create${saved.skipped?` · ${saved.skipped} sărite`:''}`);
      await onCommitted?.();
    }catch(e){
      setMessage(`Nu am putut salva: ${e.message}`);
    }finally{setBusy(false)}
  }

  const coreText=result?.likelyCore
    ? `Zonă comună / scară probabilă detectată (${Math.round(result.likelyCore.area)} px analiză)`
    : 'Nu am identificat automat un nucleu comun închis.';

  return <div className="modal auto-detector-modal">
    <div className="modal-card auto-detector-card">
      <button className="x" onClick={onClose}>×</button>
      <div className="auto-head">
        <div><small>AUTO-DETECT · BETA</small><h2>Detectează apartamentele</h2><p>Detectorul caută pereții groși întunecați, separă zonele locuibile și mută limitele comune spre axa mediană a pereților.</p></div>
      </div>

      <div className="detector-settings">
        <label>Număr apartamente estimat
          <input type="number" min="1" max="50" placeholder="Auto" value={expected} onChange={e=>setExpected(e.target.value)}/>
        </label>
        <label>Sensibilitate pereți
          <input type="range" min="65" max="125" value={threshold} onChange={e=>setThreshold(e.target.value)}/>
          <small>{threshold}</small>
        </label>
        <button className="primary" disabled={busy} onClick={run}>{busy?'Analizez…':'Analizează planul'}</button>
      </div>

      {!result&&<div className="detector-intro">
        <b>Ce face detectorul</b>
        <span>• pereții negri/gri groși devin bariere;</span>
        <span>• golurile transparente interioare sunt tratate ca zonă comună/scară;</span>
        <span>• apartamentele concurează pentru jumătatea pereților comuni;</span>
        <span>• nimic nu se salvează până nu confirmi propunerile.</span>
      </div>}

      {result&&<>
        <div className="detector-summary">
          <b>{result.detections.length} apartamente propuse</b>
          <span>{coreText}</span>
          <small>Poți marca o propunere drept „zonă comună” și detectorul recalculează limitele.</small>
        </div>

        <div className="detector-preview">
          <img src={floor.plan_path} alt={`Plan ${floor.name}`}/>
          <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
            {result.likelyCore?.points?.length>3&&<polygon
              className="common-core"
              points={result.likelyCore.points.map(p=>`${p.x*1000},${p.y*1000}`).join(' ')}
            />}
            {result.detections.map((d,i)=><polygon
              key={`${d.componentId}-${i}`}
              points={d.points.map(p=>`${p.x*1000},${p.y*1000}`).join(' ')}
              style={{fill:colors[i%colors.length]+'66',stroke:colors[i%colors.length]}}
            />)}
          </svg>
        </div>

        <div className="detector-grid">
          {result.detections.map((d,i)=><div className="detected-unit" key={d.componentId}>
            <span className="detected-color" style={{background:colors[i%colors.length]}}/>
            <div><b>Propunere {i+1}</b><small>confidence {Math.round(d.confidence*100)}% · {d.points.length} puncte</small></div>
            <select value={mapping[i]||'new'} onChange={e=>setMapping(v=>({...v,[i]:e.target.value}))}>
              <option value="new">Creează apartament nou</option>
              {existing.map(a=><option key={a.id} value={a.id}>{a.code} · {statusLabel[a.status]}</option>)}
            </select>
            <button onClick={()=>markCommon(d.componentId)}>Nu e apartament</button>
          </div>)}
        </div>

        {excluded.size>0&&<div className="excluded-list">
          <b>{excluded.size} zone marcate comune</b>
          <span>Detectorul le folosește ca separatoare și recalculează mijlocul pereților.</span>
        </div>}

        <label className="overwrite-check">
          <input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)}/>
          Permite suprascrierea poligoanelor existente pentru apartamentele selectate
        </label>

        <div className="detector-actions">
          <button onClick={onClose}>Renunță</button>
          <button className="primary" disabled={busy||!result.detections.length} onClick={commit}>
            {busy?'Salvez…':`Acceptă și salvează ${result.detections.length} poligoane`}
          </button>
        </div>
      </>}

      {message&&<div className={message.startsWith('✓')?'success-box':'error-box'}>{message}</div>}
    </div>
  </div>
}
