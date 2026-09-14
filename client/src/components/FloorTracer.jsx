import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Stage,Layer,Group,Image as KImage,Line,Circle,Rect,Text} from 'react-konva';

function useImg(src){
  const [img,setImg]=useState(null);
  useEffect(()=>{
    if(!src){setImg(null);return}
    const i=new Image();
    i.crossOrigin='anonymous';
    i.onload=()=>setImg(i);
    i.src=src;
  },[src]);
  return img;
}
const clamp=v=>Math.max(0,Math.min(1,v));

function snapPoint(raw,points,ortho=true,s45=false){
  if(!points.length||(!ortho&&!s45)) return raw;
  const a=points[points.length-1],dx=raw.x-a.x,dy=raw.y-a.y,len=Math.hypot(dx,dy);
  if(len<1e-6)return raw;
  const step=s45?Math.PI/4:Math.PI/2,ang=Math.atan2(dy,dx),sa=Math.round(ang/step)*step;
  return {x:clamp(a.x+Math.cos(sa)*len),y:clamp(a.y+Math.sin(sa)*len)};
}

export default function FloorTracer({asset,value,onChange}){
  const holder=useRef(),stage=useRef(),viewport=useRef();
  const image=useImg(asset?.signed_url);
  const [size,setSize]=useState({w:900,h:620});
  const [scale,setScale]=useState(1),[pos,setPos]=useState({x:0,y:0});
  const [mode,setMode]=useState('draw');
  const [points,setPoints]=useState(value?.points||[]);
  const [calPoints,setCalPoints]=useState(value?.calibration?.points||[]);
  const [calMeters,setCalMeters]=useState(value?.calibration?.distance_m||10);
  const [snap90,setSnap90]=useState(true),[snap45,setSnap45]=useState(false);

  useEffect(()=>{setPoints(value?.points||[]);setCalPoints(value?.calibration?.points||[]);setCalMeters(value?.calibration?.distance_m||10)},[value,asset?.id]);
  useEffect(()=>{
    const ro=new ResizeObserver(([e])=>{
      const w=Math.max(420,e.contentRect.width);
      const ratio=image?image.height/image.width:.66;
      setSize({w,h:Math.min(760,Math.max(420,w*ratio))});
    });
    if(holder.current)ro.observe(holder.current);
    return()=>ro.disconnect();
  },[image]);

  const imgRect=useMemo(()=>{
    if(!image)return{x:0,y:0,w:size.w,h:size.h};
    const ir=image.width/image.height,sr=size.w/size.h;
    if(ir>sr){const w=size.w,h=w/ir;return{x:0,y:(size.h-h)/2,w,h}}
    const h=size.h,w=h*ir;return{x:(size.w-w)/2,y:0,w,h};
  },[image,size]);

  function ptr(){
    const p=stage.current?.getPointerPosition();
    if(!p||!viewport.current)return{x:0,y:0};
    const local=viewport.current.getAbsoluteTransform().copy().invert().point(p);
    return{x:clamp((local.x-imgRect.x)/imgRect.w),y:clamp((local.y-imgRect.y)/imgRect.h)};
  }

  function click(e){
    if(e.target?.getClassName?.()==='Circle')return;
    const p=ptr();
    if(mode==='calibrate'){
      setCalPoints(v=>v.length>=2?[p]:[...v,p]);
      return;
    }
    if(mode!=='draw')return;
    const free=e.evt?.altKey||e.evt?.metaKey;
    const force45=e.evt?.shiftKey;
    setPoints(v=>[...v,free?p:snapPoint(p,v,snap90||force45,snap45||force45)]);
  }

  function wheel(e){
    e.evt.preventDefault();
    const p=stage.current?.getPointerPosition(); if(!p)return;
    const old=scale,local={x:(p.x-pos.x)/old,y:(p.y-pos.y)/old};
    const next=Math.max(.5,Math.min(6,e.evt.deltaY>0?old/1.08:old*1.08));
    setScale(next);setPos({x:p.x-local.x*next,y:p.y-local.y*next});
  }

  function dragPoint(i,e){
    const x=clamp((e.target.x()-imgRect.x)/imgRect.w),y=clamp((e.target.y()-imgRect.y)/imgRect.h);
    setPoints(v=>v.map((p,j)=>j===i?{x,y}:p));
  }

  const px=(p)=>[imgRect.x+p.x*imgRect.w,imgRect.y+p.y*imgRect.h];
  const calibration={points:calPoints,distance_m:Number(calMeters)||0};
  const result={points,calibration,asset_id:asset?.id||null};

  return <div className="tracer">
    <div className="tracer-tools">
      <div className="seg">
        <button className={mode==='draw'?'active':''} onClick={()=>setMode('draw')}>Contur</button>
        <button className={mode==='edit'?'active':''} onClick={()=>setMode('edit')}>Editează</button>
        <button className={mode==='pan'?'active':''} onClick={()=>setMode('pan')}>Pan</button>
        <button className={mode==='calibrate'?'active':''} onClick={()=>{setMode('calibrate');setCalPoints([])}}>Calibrare</button>
      </div>
      <div className="seg">
        <button className={snap90?'active':''} onClick={()=>setSnap90(v=>!v)}>0/90°</button>
        <button className={snap45?'active':''} onClick={()=>setSnap45(v=>!v)}>45°</button>
      </div>
      <button onClick={()=>setPoints(v=>v.slice(0,-1))}>Undo</button>
      <button onClick={()=>{setScale(1);setPos({x:0,y:0})}}>Reset view</button>
      <button onClick={()=>onChange?.(result)} className="primary">Aplică geometria</button>
    </div>

    <div className="calibration-row">
      <span>Scară:</span>
      <input type="number" step=".01" min="0" value={calMeters} onChange={e=>setCalMeters(e.target.value)}/>
      <span>m între cele 2 puncte de calibrare</span>
      <small>{calPoints.length}/2 puncte</small>
    </div>

    <div className="tracer-stage" ref={holder}>
      <Stage ref={stage} width={size.w} height={size.h} onClick={click} onTap={click} onWheel={wheel}>
        <Layer>
          <Group ref={viewport} x={pos.x} y={pos.y} scaleX={scale} scaleY={scale} draggable={mode==='pan'}
            onDragEnd={e=>setPos({x:e.target.x(),y:e.target.y()})}>
            <Rect width={size.w} height={size.h} fill="#e8ece9"/>
            {image&&<KImage image={image} x={imgRect.x} y={imgRect.y} width={imgRect.w} height={imgRect.h}/>}
            {points.length>0&&<Line points={points.flatMap(px)} closed={points.length>=3} stroke="#0b8d49" fill="rgba(21,180,92,.18)" strokeWidth={2/scale}/>}
            {points.map((p,i)=>{const [x,y]=px(p);return <Circle key={i} x={x} y={y} radius={6/scale} fill="#fff" stroke="#0b8d49" strokeWidth={1.5/scale}
              draggable={mode==='edit'} onDragMove={e=>dragPoint(i,e)}/>})}
            {calPoints.length>0&&<>
              {calPoints.length===2&&<Line points={calPoints.flatMap(px)} stroke="#ff5a36" dash={[8/scale,6/scale]} strokeWidth={2/scale}/>}
              {calPoints.map((p,i)=>{const [x,y]=px(p);return <Circle key={'c'+i} x={x} y={y} radius={7/scale} fill="#ff5a36" stroke="#fff" strokeWidth={2/scale}/>})}
            </>}
            {!image&&<Text text="Selectează un plan de etaj pentru trasare" x={30} y={40} fontSize={18} fill="#5b655f"/>}
          </Group>
        </Layer>
      </Stage>
    </div>
    <p className="hint">Conturul se salvează normalizat. Pentru scară: selectează „Calibrare”, click pe două puncte între care cunoști distanța și introdu valoarea în metri.</p>
  </div>
}
