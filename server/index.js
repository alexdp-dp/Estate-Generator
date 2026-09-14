import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import {fileURLToPath} from 'url';
import {createClient} from '@supabase/supabase-js';

const __filename=fileURLToPath(import.meta.url),__dirname=path.dirname(__filename);
const app=express();
app.use(express.json({limit:'20mb'}));
app.use(cookieParser());

const SUPABASE_URL=process.env.SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const JWT_SECRET=process.env.JWT_SECRET||'CHANGE_THIS_IN_RENDER';
if(!SUPABASE_URL) console.error('[CONFIG] SUPABASE_URL lipsește.');
if(!KEY) console.error('[CONFIG] SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY lipsește.');
const sb=createClient(SUPABASE_URL||'http://localhost',KEY||'missing',{auth:{persistSession:false,autoRefreshToken:false}});
const ADMIN_USER='alexdarie';
const ADMIN_HASH='pbkdf2_sha256$210000$lM6qBN+L6b1Vqcj0u9nnOQ==$BU5Pfss01ik6AKY7wxWg9MTlN1NTqZfVkejYPpBDMVY=';

function verifyPassword(password,record){
  const [,it,salt64,hash64]=record.split('$');
  const got=crypto.pbkdf2Sync(password,Buffer.from(salt64,'base64'),Number(it),32,'sha256');
  return crypto.timingSafeEqual(got,Buffer.from(hash64,'base64'));
}
function auth(req,res,next){
  try{req.user=jwt.verify(req.cookies.esg_token,JWT_SECRET);next()}
  catch{res.status(401).json({error:'Unauthorized'})}
}
function send(res,data,error,status=500){
  if(error)return res.status(status).json({error:error.message||String(error)});
  res.json(data);
}
function clean(o,allowed){return Object.fromEntries(Object.entries(o||{}).filter(([k])=>allowed.includes(k)))}

app.get('/api/version',(req,res)=>res.json({app:'estate-studio-model-generator',build:'1.1-create-fix'}));
app.get('/api/health',async(req,res)=>{
  if(!SUPABASE_URL || !KEY){
    return res.status(500).json({
      ok:false,
      error:!SUPABASE_URL?'SUPABASE_URL lipsește în Render Environment':'SUPABASE_SERVICE_ROLE_KEY lipsește în Render Environment'
    });
  }
  try{
    const {error}=await sb.from('generator_projects').select('id',{head:true,count:'exact'});
    res.status(error?500:200).json({ok:!error,error:error?.message||null});
  }catch(e){
    res.status(500).json({ok:false,error:e.message});
  }
});

app.post('/api/auth/login',(req,res)=>{
  if(req.body?.username===ADMIN_USER&&verifyPassword(String(req.body?.password||''),ADMIN_HASH)){
    const token=jwt.sign({sub:ADMIN_USER},JWT_SECRET,{expiresIn:'24h'});
    res.cookie('esg_token',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:86400000});
    return res.json({ok:true});
  }
  res.status(401).json({error:'User sau parolă incorecte'});
});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:req.user.sub}));
app.post('/api/auth/logout',(req,res)=>{res.clearCookie('esg_token');res.json({ok:true})});

async function signedAsset(a){
  const {data}=await sb.storage.from(a.storage_bucket).createSignedUrl(a.storage_path,60*60*4);
  return {...a,signed_url:data?.signedUrl||null};
}
async function projectTree(id){
  const {data:p,error:pe}=await sb.from('generator_projects').select('*').eq('id',id).single();if(pe)throw pe;
  const {data:buildings,error:be}=await sb.from('generator_buildings').select('*').eq('generator_project_id',id).order('sort_order');if(be)throw be;
  const {data:assets,error:ae}=await sb.from('generator_assets').select('*').eq('generator_project_id',id).order('created_at');if(ae)throw ae;
  const signed=[];for(const a of assets||[])signed.push(await signedAsset(a));
  const {data:exports,error:ee}=await sb.from('generator_exports').select('*').eq('generator_project_id',id).order('created_at',{ascending:false});if(ee)throw ee;
  for(const x of exports||[]){if(x.storage_bucket&&x.storage_path)x.public_url=sb.storage.from(x.storage_bucket).getPublicUrl(x.storage_path).data.publicUrl}
  for(const b of buildings||[]){
    const {data:fts,error:fe}=await sb.from('generator_floor_types').select('*').eq('building_id',b.id).order('sort_order');if(fe)throw fe;
    const {data:levels,error:le}=await sb.from('generator_levels').select('*').eq('building_id',b.id).order('level_number');if(le)throw le;
    const {data:geometry,error:ge}=await sb.from('generator_geometry').select('*').eq('building_id',b.id).order('created_at');if(ge)throw ge;
    b.floor_types=fts||[];b.levels=levels||[];b.geometry=geometry||[];
  }
  return {...p,assets:signed,buildings:buildings||[],exports:exports||[]};
}

app.get('/api/generator/projects',auth,async(req,res)=>{
  const {data,error}=await sb.from('generator_projects').select('*').order('updated_at',{ascending:false});if(error)return send(res,null,error);
  const out=[];for(const p of data||[]){
    const {count:bc}=await sb.from('generator_buildings').select('*',{count:'exact',head:true}).eq('generator_project_id',p.id);
    const {count:ac}=await sb.from('generator_assets').select('*',{count:'exact',head:true}).eq('generator_project_id',p.id);
    const {data:bs}=await sb.from('generator_buildings').select('id').eq('generator_project_id',p.id);
    let gc=0;for(const b of bs||[]){const {count}=await sb.from('generator_geometry').select('*',{count:'exact',head:true}).eq('building_id',b.id);gc+=count||0}
    out.push({...p,building_count:bc||0,asset_count:ac||0,geometry_count:gc});
  }
  res.json(out);
});
app.post('/api/generator/projects',auth,async(req,res)=>{
  let createdProjectId=null;
  try{
    if(!SUPABASE_URL || !KEY){
      throw new Error('Supabase nu este configurat în Render Environment.');
    }

    const name=String(req.body?.name||'').trim();
    if(!name) return res.status(400).json({error:'Numele proiectului este obligatoriu.'});

    const count=Math.max(1,Math.min(50,Number(req.body.building_count)||1));
    const baseSlug=String(req.body?.slug||'').trim() || `generator-${Date.now()}`;

    // Evită eroarea de slug duplicat dacă utilizatorul recreează un proiect cu același nume.
    let slug=baseSlug;
    const {data:existing,error:existingError}=await sb.from('generator_projects').select('id').eq('slug',slug).maybeSingle();
    if(existingError) throw existingError;
    if(existing) slug=`${baseSlug}-${Date.now().toString().slice(-6)}`;

    const {data:p,error}=await sb
      .from('generator_projects')
      .insert({name,slug})
      .select()
      .single();
    if(error) throw error;
    createdProjectId=p.id;

    const rows=Array.from({length:count},(_,i)=>({
      generator_project_id:p.id,
      name:`Bloc ${i+1}`,
      sort_order:i,
      levels_count:6,
      default_floor_height_m:3,
      position_x:i*22
    }));

    const {error:be}=await sb.from('generator_buildings').insert(rows);
    if(be) throw be;

    res.status(201).json(p);
  }catch(e){
    console.error('[CREATE GENERATOR PROJECT]',e);
    // Nu lăsăm proiecte incomplete dacă inserarea clădirilor eșuează.
    if(createdProjectId){
      try{await sb.from('generator_projects').delete().eq('id',createdProjectId)}catch{}
    }
    res.status(500).json({error:e?.message||String(e)});
  }
});
app.get('/api/generator/projects/:id',auth,async(req,res)=>{try{res.json(await projectTree(req.params.id))}catch(e){send(res,null,e,404)}});
app.patch('/api/generator/projects/:id',auth,async(req,res)=>{const {data,error}=await sb.from('generator_projects').update(clean(req.body,['name','slug','description','status','settings'])).eq('id',req.params.id).select().single();send(res,data,error)});
app.delete('/api/generator/projects/:id',auth,async(req,res)=>{const {data,error}=await sb.from('generator_projects').delete().eq('id',req.params.id).select();send(res,data,error)});

app.patch('/api/generator/buildings/:id',auth,async(req,res)=>{
  const allowed=['name','sort_order','levels_count','default_floor_height_m','position_x','position_y','position_z','rotation_y_deg','settings'];
  const {data,error}=await sb.from('generator_buildings').update(clean(req.body,allowed)).eq('id',req.params.id).select().single();send(res,data,error);
});

app.post('/api/generator/buildings/:id/floor-types/replace',auth,async(req,res)=>{
  try{
    await sb.from('generator_floor_types').delete().eq('building_id',req.params.id);
    const rows=(req.body.floor_types||[]).map((x,i)=>({building_id:req.params.id,name:x.name,kind:x.kind||'typical',sort_order:i,applies_to_levels:x.applies_to_levels||[],floor_height_m:x.floor_height_m||null}));
    const {data,error}=await sb.from('generator_floor_types').insert(rows).select();if(error)throw error;res.json(data);
  }catch(e){send(res,null,e)}
});
app.patch('/api/generator/floor-types/:id',auth,async(req,res)=>{
  const allowed=['name','kind','sort_order','applies_to_levels','floor_height_m','settings'];
  const {data,error}=await sb.from('generator_floor_types').update(clean(req.body,allowed)).eq('id',req.params.id).select().single();send(res,data,error);
});
app.post('/api/generator/buildings/:id/generate-levels',auth,async(req,res)=>{
  try{
    const {data:b,error:be}=await sb.from('generator_buildings').select('*').eq('id',req.params.id).single();if(be)throw be;
    const {data:fts,error:fe}=await sb.from('generator_floor_types').select('*').eq('building_id',req.params.id);if(fe)throw fe;
    await sb.from('generator_levels').delete().eq('building_id',req.params.id);
    let elevation=0;const rows=[];
    for(let n=0;n<Number(b.levels_count||1);n++){
      const ft=(fts||[]).find(f=>(f.applies_to_levels||[]).includes(n));
      const h=Number(ft?.floor_height_m||b.default_floor_height_m||3);
      rows.push({building_id:b.id,floor_type_id:ft?.id||null,level_number:n,name:n===0?'Parter':`Etaj ${n}`,elevation_from_m:elevation,elevation_to_m:elevation+h,sort_order:n});
      elevation+=h;
    }
    const {data,error}=await sb.from('generator_levels').insert(rows).select();if(error)throw error;res.json(data);
  }catch(e){send(res,null,e)}
});

app.patch('/api/generator/assets/:id',auth,async(req,res)=>{
  const {data,error}=await sb.from('generator_assets').update(clean(req.body,['building_id','floor_type_id','asset_kind','orientation','label','sort_order','metadata'])).eq('id',req.params.id).select().single();send(res,data,error);
});
app.put('/api/generator/floor-types/:id/geometry',auth,async(req,res)=>{
  try{
    const {data:ft,error:fe}=await sb.from('generator_floor_types').select('building_id').eq('id',req.params.id).single();if(fe)throw fe;
    const row={building_id:ft.building_id,floor_type_id:req.params.id,geometry_kind:req.body.geometry_kind||'footprint',geometry:req.body.geometry||{}};
    const {data:existing}=await sb.from('generator_geometry').select('id').eq('floor_type_id',req.params.id).eq('geometry_kind',row.geometry_kind).maybeSingle();
    const q=existing?sb.from('generator_geometry').update(row).eq('id',existing.id):sb.from('generator_geometry').insert(row);
    const {data,error}=await q.select().single();if(error)throw error;res.json(data);
  }catch(e){send(res,null,e)}
});

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:100*1024*1024}});
app.post('/api/generator/upload',auth,upload.single('file'),async(req,res)=>{
  try{
    if(!req.file)return res.status(400).json({error:'Fișier lipsă'});
    const safe=req.file.originalname.replace(/[^a-zA-Z0-9._-]+/g,'-');
    const prefix=[req.body.generator_project_id,req.body.building_id||'project'].join('/');
    const objectPath=`${prefix}/${Date.now()}-${safe}`;
    const {error}=await sb.storage.from('generator-assets').upload(objectPath,req.file.buffer,{contentType:req.file.mimetype,upsert:false});if(error)throw error;
    const row={generator_project_id:req.body.generator_project_id,building_id:req.body.building_id||null,asset_kind:req.body.asset_kind||'reference',orientation:req.body.orientation||null,label:req.file.originalname,storage_bucket:'generator-assets',storage_path:objectPath,file_name:req.file.originalname,mime_type:req.file.mimetype,file_size:req.file.size,width:req.body.width?Number(req.body.width):null,height:req.body.height?Number(req.body.height):null,metadata:{original_size:req.body.original_size?Number(req.body.original_size):null}};
    const {data,error:ie}=await sb.from('generator_assets').insert(row).select().single();if(ie)throw ie;res.json(await signedAsset(data));
  }catch(e){send(res,null,e)}
});

app.post('/api/generator/export',auth,upload.single('file'),async(req,res)=>{
  try{
    if(!req.file)return res.status(400).json({error:'Fișier lipsă'});
    const safe=req.file.originalname.replace(/[^a-zA-Z0-9._-]+/g,'-');
    const objectPath=`${req.body.generator_project_id}/${Date.now()}-${safe}`;
    const {error}=await sb.storage.from('generator-exports').upload(objectPath,req.file.buffer,{contentType:'model/gltf-binary',upsert:false});if(error)throw error;
    const row={generator_project_id:req.body.generator_project_id,building_id:req.body.building_id||null,export_scope:req.body.export_scope||'project',status:'ready',storage_bucket:'generator-exports',storage_path:objectPath,file_name:req.file.originalname,metadata:{}};
    const {data,error:ie}=await sb.from('generator_exports').insert(row).select().single();if(ie)throw ie;
    data.public_url=sb.storage.from('generator-exports').getPublicUrl(objectPath).data.publicUrl;res.json(data);
  }catch(e){send(res,null,e)}
});

const dist=path.join(__dirname,'../client/dist');
app.use(express.static(dist));
app.get('*',(req,res)=>res.sendFile(path.join(dist,'index.html')));
const PORT=process.env.PORT||3000;
app.listen(PORT,'0.0.0.0',()=>console.log(`Estate Studio Model Generator on :${PORT}`));
