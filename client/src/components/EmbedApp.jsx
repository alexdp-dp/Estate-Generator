import React,{useEffect,useMemo,useState} from 'react';
import {useParams} from 'react-router-dom';
import {api,statusLabel} from '../api';
import ThreeViewer from './ThreeViewer';
function polygonPoints(apartment){
  const rel=apartment?.apartment_polygons;
  if(Array.isArray(rel)) return rel[0]?.points||[];
  return rel?.points||[];
}

function FloorOverlay({floor,onClose,onApartment}){return <div className="embed-overlay"><div className="floor-sheet"><button className="sheet-close" onClick={onClose}>×</button><div className="sheet-head"><div><span>PLAN ETAJ</span><h2>{floor.name}</h2></div><div className="legend"><i className="available"/>Disponibil <i className="reserved"/>Rezervat <i className="sold"/>Vândut</div></div><div className="plan-public">{floor.plan_path?<div className="plan-image-wrap"><img src={floor.plan_path}/><svg viewBox="0 0 100 100" preserveAspectRatio="none">{(floor.apartments||[]).map(a=>{const ps=polygonPoints(a);return ps.length>2?<polygon key={a.id} className={a.status} points={ps.map(p=>`${p.x*100},${p.y*100}`).join(' ')} onClick={()=>onApartment(a)}><title>{a.code} · {statusLabel[a.status]}</title></polygon>:null})}</svg></div>:<div className="plan-missing">Planul etajului nu este încărcat.</div>}</div><div className="apartments-strip">{(floor.apartments||[]).map(a=><button key={a.id} onClick={()=>onApartment(a)}><b>{a.code}</b><span>{a.rooms?`${a.rooms} camere · `:''}{a.usable_area_sqm?`${a.usable_area_sqm} m² · `:''}{statusLabel[a.status]}</span></button>)}</div></div></div>}
function ApartmentCard({a,onClose}){return <div className="embed-overlay"><div className="apartment-card"><button className="sheet-close" onClick={onClose}>×</button>{a.image_path&&<img src={a.image_path}/>}<span className={'status-pill '+a.status}>{statusLabel[a.status]}</span><h2>{a.title||a.code}</h2><div className="apartment-stats"><div><b>{a.rooms||'—'}</b><span>camere</span></div><div><b>{a.usable_area_sqm||'—'}</b><span>m² utili</span></div><div><b>{a.total_area_sqm||'—'}</b><span>m² total</span></div></div>{a.price&&<div className="price">{Number(a.price).toLocaleString('ro-RO')} {a.currency||'EUR'}</div>}<p>{a.description}</p>{a.external_url&&<a className="primary button-link" href={a.external_url} target="_blank" rel="noreferrer">Vezi apartamentul</a>}</div></div>}
export default function EmbedApp(){const {slug}=useParams();const [project,setProject]=useState(null),[error,setError]=useState(''),[buildingId,setBuildingId]=useState(null),[floor,setFloor]=useState(null),[apartment,setApartment]=useState(null),[activeFloor,setActiveFloor]=useState(null);
 useEffect(()=>{const preview=new URLSearchParams(window.location.search).get('preview')==='1';api(`/public/projects/${slug}${preview?'?preview=1':''}`).then(p=>{setProject(p);setBuildingId((p.buildings||[]).length===1?p.buildings[0].id:null)}).catch(e=>setError(e.message))},[slug]);
 const building=project?.buildings?.find(b=>b.id===buildingId)||((project?.buildings||[]).length===1?project.buildings[0]:null);
 if(error)return <div className="embed-error"><b>Viewer indisponibil</b><span>{error}</span></div>; if(!project)return <div className="embed-loading">ESTATE STUDIO</div>;
 return <div className="embed-root"><ThreeViewer
 buildings={project.buildings||[]}
 selectedBuildingId={building?.id}
 selectedFloor={activeFloor}
 onSelectBuilding={b=>{setBuildingId(b.id)}}
 onSelectFloor={(f,b)=>{setBuildingId(b.id);setActiveFloor(f);setFloor(f)}}
/>
 <div className="embed-brand">{project.settings?.logo_url&&<img src={project.settings.logo_url}/>}<div><small>EXPLORARE 3D</small><strong>{project.name}</strong></div></div>
 {(project.buildings||[]).length>1&&<div className="building-switch"><button className={!building?'active':''} onClick={()=>{setBuildingId(null);setActiveFloor(null)}}>Ansamblu</button>{project.buildings.map(b=><button key={b.id} className={b.id===building?.id?'active':''} onClick={()=>{setBuildingId(b.id);setActiveFloor(null)}}>{b.name}</button>)}</div>}
 {!building&&(project.buildings||[]).length>1&&<div className="overview-card"><small>PLAN GENERAL</small><h2>O nouă perspectivă.</h2><p>Selectează o clădire direct din machetă sau din lista de mai jos.</p>{project.buildings.map(b=><button key={b.id} onClick={()=>setBuildingId(b.id)}><span>{b.name}</span><b>Explorează →</b></button>)}</div>} {building&&<div className="floor-selector"><div><small>{building.name}</small><b>Selectează etajul</b></div><div className="floor-buttons">{[...(building.floors||[])].reverse().map(f=><button key={f.id} onMouseEnter={()=>setActiveFloor(f)} onMouseLeave={()=>setActiveFloor(null)} onClick={()=>{setActiveFloor(f);setFloor(f)}}><span>{f.name}</span><small>{f.apartments?.filter(a=>a.status==='available').length||0} disponibile</small></button>)}</div></div>}
 <div className="north-indicator"><b>N</b><span>↑</span></div><div className="embed-hint">Rotește · apropie · selectează clădirea și etajul</div>
 {floor&&<FloorOverlay floor={floor} onClose={()=>{setFloor(null);setActiveFloor(null)}} onApartment={setApartment}/>} {apartment&&<ApartmentCard a={apartment} onClose={()=>setApartment(null)}/>}</div>}
