import React,{Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {Canvas,useThree} from '@react-three/fiber';
import {Environment,OrbitControls,useGLTF} from '@react-three/drei';
import * as THREE from 'three';

function axisInfo(axis='Y'){
  if(axis==='Z') return {key:'z', rot:[-Math.PI/2,0,0]};
  if(axis==='X') return {key:'x', rot:[0,0,Math.PI/2]};
  return {key:'y', rot:[0,0,0]};
}

function floorAtWorldY(building, worldY){
  const floors=building.floors||[];
  if(!floors.length) return null;
  const baseY=Number(building.position_y)||0;
  const display=Math.max(.000001,Number(building.display_height_units)||2.7);
  const real=Math.max(.000001,Number(building.real_height_m)||display);
  const metres=(worldY-baseY)/display*real;
  return floors.find((f,index)=>{
    const from=Number(f.height_from_m)||0;
    const to=Number(f.height_to_m)||0;
    const last=index===floors.length-1;
    return metres>=from && (metres<to || (last && metres<=to+.0001));
  })||null;
}

function BuildingModel({
  building,
  selectedFloor,
  hoveredFloor,
  hovered,
  onHover,
  onLeave,
  onSelectBuilding,
  onSelectFloor,
  dimOthers=false
}){
  const {scene}=useGLTF(building.model_path);
  const clone=useMemo(()=>scene.clone(true),[scene]);
  const info=axisInfo(building.model_up_axis);

  const metrics=useMemo(()=>{
    const b=new THREE.Box3().setFromObject(clone);
    const min=b.min[info.key], max=b.max[info.key];
    const raw=Math.max(.000001,max-min);
    const display=Number(building.display_height_units)||2.7;
    return {scale:display/raw,min};
  },[clone,info.key,building.display_height_units]);

  const shift=[0,0,0];
  shift[info.key==='x'?0:info.key==='y'?1:2]=building.auto_ground===false?0:-metrics.min*metrics.scale;

  const effectiveFloor=hoveredFloor||selectedFloor||null;
  const floorMin=effectiveFloor
    ? (Number(building.position_y)||0)+(Number(effectiveFloor.height_from_m)||0)/(Number(building.real_height_m)||1)*(Number(building.display_height_units)||2.7)
    : -99999;
  const floorMax=effectiveFloor
    ? (Number(building.position_y)||0)+(Number(effectiveFloor.height_to_m)||0)/(Number(building.real_height_m)||1)*(Number(building.display_height_units)||2.7)
    : -99998;

  useEffect(()=>{
    clone.traverse(o=>{
      if(!o.isMesh) return;
      if(!o.userData.originalMaterial) o.userData.originalMaterial=o.material;
      const original=o.userData.originalMaterial;
      const m=Array.isArray(original)?original[0].clone():original.clone();
      m.transparent=true;
      m.opacity=dimOthers ? .20 : 1;
      m.onBeforeCompile=s=>{
        s.uniforms.uFloorMin={value:floorMin};
        s.uniforms.uFloorMax={value:floorMax};
        s.uniforms.uHasFloor={value:effectiveFloor?1:0};
        s.uniforms.uHoverBuilding={value:hovered?1:0};
        s.vertexShader=s.vertexShader
          .replace('#include <common>','#include <common>\nvarying float vEstateWorldY;')
          .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvEstateWorldY=(modelMatrix*vec4(transformed,1.0)).y;');
        s.fragmentShader=s.fragmentShader
          .replace('#include <common>','#include <common>\nvarying float vEstateWorldY; uniform float uFloorMin; uniform float uFloorMax; uniform float uHasFloor; uniform float uHoverBuilding;')
          .replace(
            '#include <dithering_fragment>',
            `if(uHasFloor>.5 && vEstateWorldY>=uFloorMin && vEstateWorldY<=uFloorMax){
               gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(0.05,0.92,0.43),0.78);
               gl_FragColor.a=1.0;
             } else if(uHoverBuilding>.5 && uHasFloor<.5){
               gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(0.12,0.88,0.45),0.38);
             }
             #include <dithering_fragment>`
          );
      };
      m.needsUpdate=true;
      o.material=m;
    });
    return()=>clone.traverse(o=>{
      if(o.isMesh&&o.userData.originalMaterial)o.material=o.userData.originalMaterial;
    });
  },[clone,floorMin,floorMax,effectiveFloor,dimOthers,hovered]);

  function hoverEvent(e){
    e.stopPropagation();
    const f=floorAtWorldY(building,e.point.y);
    onHover?.({
      building,
      floor:f,
      clientX:e.nativeEvent?.clientX??0,
      clientY:e.nativeEvent?.clientY??0
    });
  }

  function clickEvent(e){
    e.stopPropagation();
    const f=floorAtWorldY(building,e.point.y);
    onSelectBuilding?.(building);
    if(f) onSelectFloor?.(f,building);
  }

  return (
    <group
      position={[Number(building.position_x)||0,Number(building.position_y)||0,Number(building.position_z)||0]}
      rotation={[
        info.rot[0],
        info.rot[1]+THREE.MathUtils.degToRad(Number(building.rotation_y_deg)||0),
        info.rot[2]
      ]}
      onPointerOver={hoverEvent}
      onPointerMove={hoverEvent}
      onPointerOut={e=>{e.stopPropagation();onLeave?.(building)}}
      onClick={clickEvent}
    >
      <primitive object={clone} scale={metrics.scale} position={shift}/>
    </group>
  );
}

function CameraRig({preset,controlsRef}){
  const {camera}=useThree();
  useEffect(()=>{
    if(!preset)return;
    camera.up.set(0,1,0);
    if(preset==='top'){
      camera.position.set(0,9,.001);
      camera.up.set(0,0,-1);
      controlsRef.current?.target.set(0,0,0);
      camera.lookAt(0,0,0);
    }else if(preset==='front'){
      camera.position.set(0,2.6,7);
      controlsRef.current?.target.set(0,1.3,0);
      camera.lookAt(0,1.3,0);
    }else{
      camera.position.set(5,3.8,6);
      controlsRef.current?.target.set(0,1.25,0);
      camera.lookAt(0,1.25,0);
    }
    camera.updateProjectionMatrix();
    controlsRef.current?.update();
  },[preset,camera,controlsRef]);
  return null;
}

export default function ThreeViewer({
  buildings=[],
  selectedBuildingId,
  selectedFloor,
  onSelectBuilding,
  onSelectFloor,
  compact=false,
  onReady
}){
  const controls=useRef();
  const [preset,setPreset]=useState('perspective');
  const [autoRotate,setAutoRotate]=useState(false);
  const [hoverInfo,setHoverInfo]=useState(null);

  function zoom(factor){
    const c=controls.current;
    if(!c)return;
    const cam=c.object;
    const v=cam.position.clone().sub(c.target).multiplyScalar(factor);
    cam.position.copy(c.target.clone().add(v));
    c.update();
  }

  const models=buildings.filter(b=>b.model_path);
  useEffect(()=>{onReady?.({setPreset,controls})},[onReady]);

  return (
    <div className={'three-viewer '+(compact?'compact':'')} style={{cursor:hoverInfo?'pointer':'grab'}}>
      {models.length===0 && (
        <div className="viewer-empty">
          <b>Niciun model 3D încărcat</b>
          <span>Încarcă un GLB/GLTF din secțiunea Model 3D.</span>
        </div>
      )}

      <Canvas
        camera={{position:[5,3.8,6],fov:38,near:.01,far:1000}}
        shadows
        dpr={[1,1.7]}
        onPointerMissed={()=>setHoverInfo(null)}
        onCreated={({gl})=>{gl.outputColorSpace=THREE.SRGBColorSpace}}
      >
        <color attach="background" args={['#e9edea']}/>
        <ambientLight intensity={1.45}/>
        <directionalLight castShadow position={[6,9,5]} intensity={2.2}/>

        <Suspense fallback={null}>
          {models.map(b=>(
            <BuildingModel
              key={b.id}
              building={b}
              selectedFloor={b.id===selectedBuildingId?selectedFloor:null}
              hoveredFloor={hoverInfo?.building?.id===b.id?hoverInfo.floor:null}
              hovered={hoverInfo?.building?.id===b.id}
              onHover={setHoverInfo}
              onLeave={building=>setHoverInfo(v=>v?.building?.id===building.id?null:v)}
              onSelectBuilding={onSelectBuilding}
              onSelectFloor={onSelectFloor}
              dimOthers={!!selectedBuildingId&&b.id!==selectedBuildingId}
            />
          ))}
          <Environment preset="city"/>
        </Suspense>

        <gridHelper args={[20,40,'#aeb6b1','#d3d8d5']} position={[0,-.001,0]}/>
        <OrbitControls
          ref={controls}
          makeDefault
          enableDamping
          dampingFactor={.08}
          autoRotate={autoRotate}
          autoRotateSpeed={.7}
          minDistance={1}
          maxDistance={30}
        />
        <CameraRig preset={preset} controlsRef={controls}/>
      </Canvas>

      {hoverInfo&&(
        <div
          className="model-tooltip"
          style={{
            left:Math.min(window.innerWidth-220,hoverInfo.clientX+16),
            top:Math.min(window.innerHeight-80,hoverInfo.clientY+16)
          }}
        >
          <strong>{hoverInfo.building.name}</strong>
          <span>{hoverInfo.floor?hoverInfo.floor.name:'Click pentru selectare'}</span>
          {hoverInfo.floor&&<small>Click pentru planul etajului</small>}
        </div>
      )}

      {!compact&&<>
        <div className="viewer-presets">
          <button className={preset==='perspective'?'active':''} onClick={()=>setPreset('perspective')}>Perspectivă</button>
          <button className={preset==='top'?'active':''} onClick={()=>setPreset('top')}>De sus</button>
          <button className={preset==='front'?'active':''} onClick={()=>setPreset('front')}>Față</button>
        </div>
        <div className="viewer-tools">
          <button onClick={()=>zoom(.8)}>＋</button>
          <button onClick={()=>zoom(1.25)}>−</button>
          <button onClick={()=>{setPreset('perspective');setTimeout(()=>controls.current?.reset(),0)}}>⌖</button>
          <button className={autoRotate?'active':''} onClick={()=>setAutoRotate(v=>!v)}>↻</button>
          <button onClick={()=>document.querySelector('.three-viewer')?.requestFullscreen?.()}>⛶</button>
        </div>
      </>}
    </div>
  );
}
