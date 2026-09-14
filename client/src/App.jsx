import React,{lazy,Suspense,useEffect,useMemo,useState} from 'react';
import {Navigate,Route,Routes,useNavigate,useParams} from 'react-router-dom';
import {api,levelsToText,parseLevels,slugify} from './api';
import FloorTracer from './components/FloorTracer';
import ModelPreview,{exportGeneratedGLB} from './components/ModelPreview';

function Login({done}){
  const [user,setUser]=useState('alexdarie'),[pass,setPass]=useState(''),[error,setError]=useState('');
  async function submit(e){e.preventDefault();setError('');try{await api('/auth/login',{method:'POST',body:{username:user,password:pass}});done()}catch(err){setError(err.message)}}
  return <div className="login-page"><form className="login-card" onSubmit={submit}>
    <div className="eyebrow">ESTATE STUDIO</div><h1>Model Generator</h1><p>Generează GLB-uri din planuri și imagini, separat de configuratorul Estate Studio.</p>
    <label>Utilizator<input value={user} onChange={e=>setUser(e.target.value)}/></label>
    <label>Parolă<input type="password" value={pass} onChange={e=>setPass(e.target.value)}/></label>
    <button className="primary">Autentificare</button>{error&&<div className="error">{error}</div>}
  </form></div>
}

function Shell({children,title,subtitle,back}){
  const nav=useNavigate();
  return <div className="shell">
    <aside><div className="logo">ESTATE <span>STUDIO</span></div><div className="tool-name">MODEL GENERATOR</div>
      <nav><button onClick={()=>nav('/projects')}>Proiecte generator</button><a href="/admin/projects">Estate Studio ↗</a></nav>
    </aside>
    <main><header>{back&&<button className="ghost" onClick={back}>← Înapoi</button>}<div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div></header>{children}</main>
  </div>
}

function Projects(){
  const [items,setItems]=useState([]),[open,setOpen]=useState(false),[name,setName]=useState(''),[count,setCount]=useState(2),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[dbStatus,setDbStatus]=useState(null);
  const nav=useNavigate();

  async function load(){
    try{
      setError('');
      const rows=await api('/generator/projects');
      setItems(rows);
    }catch(e){
      setError(`Nu pot încărca proiectele: ${e.message}`);
    }
  }

  useEffect(()=>{
    load();
    fetch('/api/health')
      .then(r=>r.json().then(d=>({ok:r.ok,data:d})))
      .then(({ok,data})=>setDbStatus({ok,message:data.error||null}))
      .catch(e=>setDbStatus({ok:false,message:e.message}));
  },[]);

  async function create(e){
    e.preventDefault();
    if(!name.trim()) return setError('Introdu un nume pentru proiect.');
    setBusy(true);
    setError('');
    try{
      const payload={
        name:name.trim(),
        slug:slugify(name.trim()) || `model-${Date.now()}`,
        building_count:Math.max(1,Number(count)||1)
      };
      const p=await api('/generator/projects',{method:'POST',body:payload});
      if(!p?.id) throw new Error('Serverul nu a întors ID-ul proiectului creat.');
      nav(`/projects/${p.id}/general`);
    }catch(err){
      setError(`Nu am putut crea proiectul: ${err.message}`);
    }finally{
      setBusy(false);
    }
  }

  return <Shell title="Model Generator" subtitle="Proiecte separate pentru reconstrucția 3D din planuri și randări.">
    {dbStatus&&<div className={'db-banner '+(dbStatus.ok?'ok':'bad')}>
      <b>{dbStatus.ok?'● Supabase conectat':'● Supabase indisponibil'}</b>
      {!dbStatus.ok&&<span>{dbStatus.message||'Verifică variabilele Environment din Render.'}</span>}
    </div>}
    {error&&<div className="error project-error">{error}</div>}
    <div className="top-actions"><button className="primary" onClick={()=>{setError('');setOpen(true)}}>＋ Proiect nou</button></div>
    <div className="cards">
      {items.map(p=><article className="project-card" key={p.id}><div className="pill">{p.building_count} clădiri</div><h3>{p.name}</h3><p>{p.asset_count} fișiere · {p.geometry_count} geometrii</p><button className="primary" onClick={()=>nav(`/projects/${p.id}/general`)}>Deschide</button></article>)}
      {!items.length&&<div className="empty">Nu există proiecte în Model Generator.</div>}
    </div>
    {open&&<div className="modal"><form className="modal-card" onSubmit={create}><button type="button" className="modal-x" onClick={()=>setOpen(false)}>×</button><h2>Proiect nou</h2>
      <label>Nume proiect<input autoFocus value={name} onChange={e=>setName(e.target.value)} required/></label>
      <label>Câte clădiri/blocuri?<input type="number" min="1" max="50" value={count} onChange={e=>setCount(e.target.value)}/></label>
      <button className="primary" disabled={busy}>{busy?'Creez…':'Creează proiect'}</button>
    </form></div>}
  </Shell>
}

async function optimizeImage(file){
  if(!file.type.startsWith('image/'))return {file,width:null,height:null,original_size:file.size};
  const bitmap=await createImageBitmap(file);
  const max=4096,ratio=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
  const w=Math.round(bitmap.width*ratio),h=Math.round(bitmap.height*ratio);
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{alpha:true});ctx.drawImage(bitmap,0,0,w,h);
  const type='image/webp';
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,type,.9));
  const name=file.name.replace(/\.[^.]+$/, '')+'.webp';
  return {file:new File([blob],name,{type}),width:w,height:h,original_size:file.size};
}

const kinds=[
  ['floor_plan','Plan etaj'],['facade','Fațadă'],['section','Secțiune'],['rendering','Randare'],
  ['aerial','Imagine aeriană'],['site_plan','Plan amplasament'],['reference','Referință']
];

function ProjectEditor(){
  const {id,section='general'}=useParams(),nav=useNavigate();
  const [project,setProject]=useState(null),[error,setError]=useState('');
  const [uploadCfg,setUploadCfg]=useState({building_id:'',asset_kind:'floor_plan',orientation:''});
  const [uploading,setUploading]=useState(false);
  const [selBuilding,setSelBuilding]=useState(null),[selFloorType,setSelFloorType]=useState(null),[geomDraft,setGeomDraft]=useState(null);

  async function load(){
    try{const p=await api(`/generator/projects/${id}`);setProject(p);setError('');if(!selBuilding&&p.buildings?.[0])setSelBuilding(p.buildings[0].id)}
    catch(e){setError(e.message)}
  }
  useEffect(()=>{load()},[id]);

  const building=project?.buildings?.find(b=>b.id===selBuilding)||project?.buildings?.[0];
  const floorType=building?.floor_types?.find(f=>f.id===selFloorType)||building?.floor_types?.[0];
  useEffect(()=>{if(building&&!selFloorType&&building.floor_types?.[0])setSelFloorType(building.floor_types[0].id)},[building?.id,project]);

  const tabs=[['general','1. Proiect'],['documents','2. Documentație'],['structure','3. Structură'],['geometry','4. Geometrie'],['preview','5. Preview & GLB']];

  async function patchBuilding(bid,patch){await api(`/generator/buildings/${bid}`,{method:'PATCH',body:patch});await load()}
  async function uploadFiles(files){
    if(!files?.length)return;setUploading(true);
    try{
      for(const original of files){
        const opt=await optimizeImage(original);
        const fd=new FormData();fd.append('file',opt.file);fd.append('generator_project_id',project.id);
        if(uploadCfg.building_id)fd.append('building_id',uploadCfg.building_id);
        fd.append('asset_kind',uploadCfg.asset_kind);fd.append('orientation',uploadCfg.orientation||'');
        if(opt.width)fd.append('width',opt.width);if(opt.height)fd.append('height',opt.height);fd.append('original_size',opt.original_size);
        await api('/generator/upload',{method:'POST',body:fd});
      }
      await load();
    }finally{setUploading(false)}
  }

  async function createStandardTypes(b){
    const n=Number(b.levels_count)||1;
    const rows=[];
    rows.push({name:'Parter',kind:'ground',applies_to_levels:[0],floor_height_m:Number(b.default_floor_height_m)||3});
    if(n>2)rows.push({name:'Etaj tip',kind:'typical',applies_to_levels:Array.from({length:n-2},(_,i)=>i+1),floor_height_m:Number(b.default_floor_height_m)||3});
    if(n>1)rows.push({name:'Etaj retras',kind:'setback',applies_to_levels:[n-1],floor_height_m:Number(b.default_floor_height_m)||3});
    await api(`/generator/buildings/${b.id}/floor-types/replace`,{method:'POST',body:{floor_types:rows}});
    await api(`/generator/buildings/${b.id}/generate-levels`,{method:'POST',body:{}});
    await load();
  }

  async function saveFloorType(ft,patch){await api(`/generator/floor-types/${ft.id}`,{method:'PATCH',body:patch});await api(`/generator/buildings/${building.id}/generate-levels`,{method:'POST',body:{}});await load()}

  const planAssets=(project?.assets||[]).filter(a=>a.asset_kind==='floor_plan'&&(!building||a.building_id===building.id));

  async function assignPlan(assetId){
    if(!floorType)return;
    await api(`/generator/assets/${assetId}`,{method:'PATCH',body:{floor_type_id:floorType.id}});
    await load();
  }

  const assignedPlan=(project?.assets||[]).find(a=>a.floor_type_id===floorType?.id&&a.asset_kind==='floor_plan');
  const existingGeom=building?.geometry?.find(g=>g.floor_type_id===floorType?.id&&g.geometry_kind==='footprint');

  useEffect(()=>{setGeomDraft(existingGeom?.geometry||null)},[existingGeom?.id,floorType?.id]);

  // IMPORTANT: toate hook-urile din ProjectEditor sunt executate înainte de orice return condițional.
  // Altfel React production aruncă invariant #310 după încărcarea proiectului.
  if(!project){
    return <Shell title="Model Generator" back={()=>nav('/projects')}>
      <div className="loading">{error||'Se încarcă…'}</div>
    </Shell>;
  }

  async function saveGeometry(g){
    if(!floorType)return;
    await api(`/generator/floor-types/${floorType.id}/geometry`,{method:'PUT',body:{geometry_kind:'footprint',geometry:g}});
    await load();
  }

  async function doExport(scope='project'){
    const only=scope==='project'?null:building?.id;
    const blob=await exportGeneratedGLB(project,only);
    const name=`${slugify(project.name)}${only?'-'+slugify(building.name):''}.glb`;
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    const fd=new FormData();fd.append('file',new File([blob],name,{type:'model/gltf-binary'}));fd.append('generator_project_id',project.id);if(only)fd.append('building_id',only);fd.append('export_scope',only?'building':'project');
    await api('/generator/export',{method:'POST',body:fd});
    await load();
  }

  return <Shell title={project.name} subtitle="Generator procedural 3D din planuri și imagini" back={()=>nav('/projects')}>
    <div className="tabs">{tabs.map(([key,label])=><button className={section===key?'active':''} key={key} onClick={()=>nav(`/projects/${id}/${key}`)}>{label}</button>)}</div>

    {section==='general'&&<div className="content-grid">
      <section className="panel wide"><h2>Clădiri</h2><p className="hint">Pozițiile sunt folosite în preview și în GLB-ul de ansamblu.</p>
        <div className="building-list">{project.buildings.map((b,i)=><div className="building-row" key={b.id}>
          <input value={b.name} onChange={e=>setProject(p=>({...p,buildings:p.buildings.map(x=>x.id===b.id?{...x,name:e.target.value}:x)}))} onBlur={e=>patchBuilding(b.id,{name:e.target.value})}/>
          <label>Niveluri<input type="number" min="1" value={b.levels_count} onChange={e=>patchBuilding(b.id,{levels_count:+e.target.value})}/></label>
          <label>Etaj standard m<input type="number" step=".1" value={b.default_floor_height_m} onChange={e=>patchBuilding(b.id,{default_floor_height_m:+e.target.value})}/></label>
          <label>X<input type="number" step=".1" value={b.position_x} onChange={e=>patchBuilding(b.id,{position_x:+e.target.value})}/></label>
          <label>Z<input type="number" step=".1" value={b.position_z} onChange={e=>patchBuilding(b.id,{position_z:+e.target.value})}/></label>
          <label>Rot Y°<input type="number" step="1" value={b.rotation_y_deg} onChange={e=>patchBuilding(b.id,{rotation_y_deg:+e.target.value})}/></label>
        </div>)}</div>
      </section>
    </div>}

    {section==='documents'&&<div className="content-grid">
      <section className="panel"><h2>Upload documentație</h2>
        <label>Se aplică la<select value={uploadCfg.building_id} onChange={e=>setUploadCfg(v=>({...v,building_id:e.target.value}))}><option value="">Ansamblu / proiect</option>{project.buildings.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
        <label>Tip<select value={uploadCfg.asset_kind} onChange={e=>setUploadCfg(v=>({...v,asset_kind:e.target.value}))}>{kinds.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
        {uploadCfg.asset_kind==='facade'&&<label>Orientare<select value={uploadCfg.orientation} onChange={e=>setUploadCfg(v=>({...v,orientation:e.target.value}))}><option value="">Nespecificată</option><option>Nord</option><option>Sud</option><option>Est</option><option>Vest</option><option>Față</option><option>Spate</option><option>Stânga</option><option>Dreapta</option></select></label>}
        <label className="dropzone">{uploading?'Optimizez și încarc…':'Alege imagini / planuri'}<input type="file" multiple accept="image/*,.pdf" disabled={uploading} onChange={e=>uploadFiles([...e.target.files])}/></label>
        <p className="hint">Imaginile sunt redimensionate automat până la max. 4096 px și convertite WebP înainte de upload. Originalele mari nu sunt păstrate.</p>
      </section>
      <section className="panel wide"><h2>Fișiere ({project.assets.length})</h2><div className="asset-grid">{project.assets.map(a=><article className="asset-card" key={a.id}>{a.signed_url&&a.mime_type?.startsWith('image/')?<img src={a.signed_url}/>:<div className="file-placeholder">FILE</div>}<div><b>{a.label||a.file_name}</b><small>{kinds.find(k=>k[0]===a.asset_kind)?.[1]||a.asset_kind} · {project.buildings.find(b=>b.id===a.building_id)?.name||'Ansamblu'}</small>{a.orientation&&<small>{a.orientation}</small>}</div></article>)}</div></section>
    </div>}

    {section==='structure'&&<div className="content-grid">
      <section className="panel"><h2>Clădire</h2><select value={building?.id||''} onChange={e=>{setSelBuilding(e.target.value);setSelFloorType(null)}}>{project.buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
        {building&&<><div className="summary"><b>{building.levels_count}</b><span>niveluri</span><b>{building.default_floor_height_m}m</b><span>implicit</span></div><button className="primary" onClick={()=>createStandardTypes(building)}>Generează Parter / Etaj tip / Etaj retras</button></>}
      </section>
      <section className="panel wide"><h2>Tipuri de etaj</h2>
        {!building?.floor_types?.length&&<div className="empty-mini">Generează tipurile standard sau adaugă-le ulterior.</div>}
        {building?.floor_types?.map(ft=><div className="floor-type-row" key={ft.id}><input value={ft.name} onChange={e=>setProject(p=>({...p,buildings:p.buildings.map(b=>b.id===building.id?{...b,floor_types:b.floor_types.map(x=>x.id===ft.id?{...x,name:e.target.value}:x)}:b)}))} onBlur={e=>saveFloorType(ft,{name:e.target.value})}/>
          <select value={ft.kind} onChange={e=>saveFloorType(ft,{kind:e.target.value})}><option value="basement">Subsol</option><option value="ground">Parter</option><option value="typical">Etaj tip</option><option value="setback">Etaj retras</option><option value="penthouse">Penthouse</option><option value="roof">Acoperiș</option><option value="other">Altul</option></select>
          <label>Niveluri<input defaultValue={levelsToText(ft.applies_to_levels)} onBlur={e=>saveFloorType(ft,{applies_to_levels:parseLevels(e.target.value)})}/></label>
          <label>Înălțime m<input type="number" step=".1" defaultValue={ft.floor_height_m||building.default_floor_height_m} onBlur={e=>saveFloorType(ft,{floor_height_m:+e.target.value})}/></label>
        </div>)}
        {!!building?.levels?.length&&<div className="levels-map"><h3>Structură verticală</h3>{[...building.levels].sort((a,b)=>b.level_number-a.level_number).map(l=><div key={l.id}><span>{l.name}</span><b>{building.floor_types.find(f=>f.id===l.floor_type_id)?.name||'Neasociat'}</b><small>{l.elevation_from_m}–{l.elevation_to_m} m</small></div>)}</div>}
      </section>
    </div>}

    {section==='geometry'&&<div className="content-grid">
      <section className="panel"><h2>Ce trasezi?</h2><label>Clădire<select value={building?.id||''} onChange={e=>{setSelBuilding(e.target.value);setSelFloorType(null)}}>{project.buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>Tip etaj<select value={floorType?.id||''} onChange={e=>setSelFloorType(e.target.value)}>{building?.floor_types?.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label>Plan<select value={assignedPlan?.id||''} onChange={e=>assignPlan(e.target.value)}><option value="">Alege plan</option>{planAssets.map(a=><option key={a.id} value={a.id}>{a.label||a.file_name}</option>)}</select></label>
        <div className="note">Trasezi doar conturul exterior al volumului pentru tipul de etaj. Balcoane/fațade/materiale vor fi extinse în buildurile următoare.</div>
      </section>
      <section className="panel wide"><h2>Trasare contur · {floorType?.name||'—'}</h2><FloorTracer asset={assignedPlan} value={geomDraft||existingGeom?.geometry} onChange={saveGeometry}/></section>
    </div>}

    {section==='preview'&&<div className="content-grid preview-grid">
      <section className="panel wide"><div className="panel-head"><div><h2>Preview procedural</h2><p>Etajele sunt extrudate din contururile trasate și calibrarea în metri.</p></div><div className="actions"><button onClick={()=>doExport('building')} disabled={!building}>Exportă {building?.name||'bloc'} GLB</button><button className="primary" onClick={()=>doExport('project')}>Exportă ansamblu GLB</button></div></div><ModelPreview project={project}/></section>
      <section className="panel"><h2>Exporturi</h2>{project.exports?.map(x=><a className="export-row" href={x.public_url} target="_blank" rel="noreferrer" key={x.id}><b>{x.file_name}</b><small>{x.export_scope}</small></a>)}{!project.exports?.length&&<div className="empty-mini">Încă nu ai exportat un GLB.</div>}</section>
    </div>}
  </Shell>
}

export default function App(){
  const [auth,setAuth]=useState(null);
  useEffect(()=>{api('/auth/me').then(()=>setAuth(true)).catch(()=>setAuth(false))},[]);
  if(auth===null)return <div className="loading-screen">ESTATE STUDIO · MODEL GENERATOR</div>;
  if(!auth)return <Login done={()=>setAuth(true)}/>;
  return <Routes>
    <Route path="/" element={<Navigate to="/projects" replace/>}/>
    <Route path="/projects" element={<Projects/>}/>
    <Route path="/projects/:id/:section" element={<ProjectEditor/>}/>
    <Route path="*" element={<Navigate to="/projects" replace/>}/>
  </Routes>
}
