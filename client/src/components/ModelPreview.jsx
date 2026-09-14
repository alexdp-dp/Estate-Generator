import React,{Suspense,useMemo,useRef,useState} from 'react';
import {Canvas} from '@react-three/fiber';
import {Environment,OrbitControls} from '@react-three/drei';
import * as THREE from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';

function geometryScale(geom,asset){
  const cal=geom?.geometry?.calibration;
  const ps=cal?.points||[];
  const d=Number(cal?.distance_m)||0;
  const w=Number(asset?.width)||1,h=Number(asset?.height)||1;
  if(ps.length!==2||d<=0)return {mx:20,mz:20};
  const dx=(ps[1].x-ps[0].x)*w,dy=(ps[1].y-ps[0].y)*h;
  const px=Math.hypot(dx,dy)||1;
  const mpp=d/px;
  return {mx:w*mpp,mz:h*mpp};
}

function levelGeometry(points,scale,height){
  if(!points||points.length<3)return null;
  const shape=new THREE.Shape();
  points.forEach((p,i)=>{
    const x=(p.x-.5)*scale.mx;
    const z=(.5-p.y)*scale.mz;
    if(i===0)shape.moveTo(x,z); else shape.lineTo(x,z);
  });
  shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false});
  g.rotateX(-Math.PI/2);
  g.computeVertexNormals();
  return g;
}

export function buildGeneratedScene(project,onlyBuildingId=null){
  const root=new THREE.Group();
  root.name=project?.name||'GeneratedProject';
  for(const b of project?.buildings||[]){
    if(onlyBuildingId&&b.id!==onlyBuildingId)continue;
    const bg=new THREE.Group();bg.name=b.name;
    bg.position.set(Number(b.position_x)||0,Number(b.position_y)||0,Number(b.position_z)||0);
    bg.rotation.y=THREE.MathUtils.degToRad(Number(b.rotation_y_deg)||0);
    const levels=[...(b.levels||[])].sort((a,b)=>a.level_number-b.level_number);
    for(const lvl of levels){
      const ft=(b.floor_types||[]).find(x=>x.id===lvl.floor_type_id);
      if(!ft)continue;
      const geom=(b.geometry||[]).find(g=>g.floor_type_id===ft.id&&g.geometry_kind==='footprint');
      if(!geom?.geometry?.points?.length)continue;
      const asset=(project.assets||[]).find(a=>a.id===geom.geometry.asset_id);
      const scale=geometryScale(geom,asset);
      const h=Math.max(.1,Number(lvl.elevation_to_m)-Number(lvl.elevation_from_m));
      const g=levelGeometry(geom.geometry.points,scale,h);
      if(!g)continue;
      const m=new THREE.MeshStandardMaterial({color:0xf4f2ed,roughness:.78,metalness:0});
      const mesh=new THREE.Mesh(g,m);mesh.name=`${b.name}_${lvl.name}`;mesh.position.y=Number(lvl.elevation_from_m)||0;
      mesh.castShadow=true;mesh.receiveShadow=true;bg.add(mesh);
    }
    root.add(bg);
  }
  return root;
}

function Generated({project}){
  const scene=useMemo(()=>buildGeneratedScene(project),[project]);
  return <primitive object={scene}/>;
}

export async function exportGeneratedGLB(project,onlyBuildingId=null){
  const scene=buildGeneratedScene(project,onlyBuildingId);
  const exporter=new GLTFExporter();
  const arrayBuffer=await new Promise((resolve,reject)=>{
    exporter.parse(scene,resolve,reject,{binary:true,trs:false,onlyVisible:true});
  });
  return new Blob([arrayBuffer],{type:'model/gltf-binary'});
}

export default function ModelPreview({project}){
  return <div className="model-preview">
    <Canvas camera={{position:[18,14,22],fov:42}} shadows dpr={[1,1.6]}>
      <color attach="background" args={['#e8ece9']}/>
      <ambientLight intensity={1.5}/>
      <directionalLight castShadow position={[10,20,12]} intensity={2.5}/>
      <Suspense fallback={null}><Generated project={project}/><Environment preset="city"/></Suspense>
      <gridHelper args={[80,80,'#9da8a2','#d4d9d6']}/>
      <OrbitControls makeDefault enableDamping/>
    </Canvas>
  </div>
}
