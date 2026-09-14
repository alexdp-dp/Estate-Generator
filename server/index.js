import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import {fileURLToPath} from 'url';
import {createClient} from '@supabase/supabase-js';
const __filename=fileURLToPath(import.meta.url),__dirname=path.dirname(__filename);
const app=express(); app.use(express.json({limit:'12mb'})); app.use(cookieParser());
const SUPABASE_URL=process.env.SUPABASE_URL, KEY=process.env.SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET=process.env.JWT_SECRET||'CHANGE_THIS_IN_RENDER';
if(!SUPABASE_URL||!KEY)console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
const sb=createClient(SUPABASE_URL||'http://localhost',KEY||'missing',{auth:{persistSession:false,autoRefreshToken:false}});
const ADMIN_USER='alexdarie', ADMIN_HASH='pbkdf2_sha256$210000$lM6qBN+L6b1Vqcj0u9nnOQ==$BU5Pfss01ik6AKY7wxWg9MTlN1NTqZfVkejYPpBDMVY=';
function verifyPassword(password,record){const [,it,salt64,hash64]=record.split('$');const got=crypto.pbkdf2Sync(password,Buffer.from(salt64,'base64'),Number(it),32,'sha256');return crypto.timingSafeEqual(got,Buffer.from(hash64,'base64'))}
function auth(req,res,next){try{req.user=jwt.verify(req.cookies.es_token,JWT_SECRET);next()}catch{res.status(401).json({error:'Unauthorized'})}}
function clean(o,allowed){return Object.fromEntries(Object.entries(o||{}).filter(([k])=>allowed.includes(k)))}
function send(res,data,error,status=500){if(error)return res.status(status).json({error:error.message||String(error)});res.json(data)}
app.get('/api/version',(req,res)=>res.json({app:'estate-studio',build:'03.6-auto-apartments',time:'2026-09-14'}));
app.get('/api/health',async(req,res)=>{const {error}=await sb.from('projects').select('id',{head:true,count:'exact'});res.status(error?500:200).json({ok:!error,supabase:!error,error:error?.message})});
app.post('/api/auth/login',(req,res)=>{if(req.body?.username===ADMIN_USER&&verifyPassword(String(req.body?.password||''),ADMIN_HASH)){const token=jwt.sign({sub:ADMIN_USER},JWT_SECRET,{expiresIn:'24h'});res.cookie('es_token',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:86400000});return res.json({ok:true,user:ADMIN_USER})}res.status(401).json({error:'User sau parolă incorecte'})});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:req.user.sub}));
app.post('/api/auth/logout',(req,res)=>{res.clearCookie('es_token');res.json({ok:true})});
async function treeByProject(project){
 const {data:assets,error:ase}=await sb.from('project_assets').select('*').eq('project_id',project.id).order('sort_order'); if(ase)throw ase;
 const {data:buildings,error:be}=await sb.from('buildings').select('*').eq('project_id',project.id).order('sort_order'); if(be)throw be;
 for(const b of buildings||[]){const {data:floors,error:fe}=await sb.from('floors').select('*').eq('building_id',b.id).order('sort_order');if(fe)throw fe;for(const f of floors||[]){const {data:aps,error:ae}=await sb.from('apartments').select('*, apartment_polygons(points)').eq('floor_id',f.id).order('code');if(ae)throw ae;f.apartments=aps||[]}b.floors=floors||[]}
 return {...project,assets:assets||[],buildings:buildings||[]};
}
app.get('/api/admin/projects',auth,async(req,res)=>{const {data,error}=await sb.from('projects').select('*').order('updated_at',{ascending:false});if(error)return send(res,null,error);const out=[];for(const p of data||[]){const {count:bc}=await sb.from('buildings').select('*',{count:'exact',head:true}).eq('project_id',p.id);const {data:bs}=await sb.from('buildings').select('id').eq('project_id',p.id);let fc=0,ac=0;for(const b of bs||[]){const {data:fs,count}=await sb.from('floors').select('id',{count:'exact'}).eq('building_id',b.id);fc+=count||0;for(const f of fs||[]){const {count:cc}=await sb.from('apartments').select('*',{count:'exact',head:true}).eq('floor_id',f.id);ac+=cc||0}}out.push({...p,building_count:bc||0,floor_count:fc,apartment_count:ac})}res.json(out)});
app.post('/api/admin/projects',auth,async(req,res)=>{const body=clean(req.body,['name','slug','description','embed_height','source_mode']);const {data,error}=await sb.from('projects').insert(body).select().single();if(error)return send(res,null,error);await sb.from('buildings').insert({project_id:data.id,name:'Bloc 1',sort_order:0,floors_count:9,default_floor_height_m:3,ground_floor_different:false,ground_floor_height_m:3,real_height_m:27,display_height_units:2.7});res.json(data)});
app.get('/api/admin/projects/:id',auth,async(req,res)=>{const {data,error}=await sb.from('projects').select('*').eq('id',req.params.id).single();if(error)return send(res,null,error,404);try{res.json(await treeByProject(data))}catch(e){send(res,null,e)}});
app.patch('/api/admin/projects/:id',auth,async(req,res)=>{const allowed=['name','slug','description','embed_height','source_mode','model_generation_status','settings','is_published'];const {data,error}=await sb.from('projects').update(clean(req.body,allowed)).eq('id',req.params.id).select().single();send(res,data,error)});
app.delete('/api/admin/projects/:id',auth,async(req,res)=>{const {data,error}=await sb.from('projects').delete().eq('id',req.params.id).select();send(res,data,error)});
app.post('/api/admin/projects/:id/duplicate',auth,async(req,res)=>{try{const {data:p,error}=await sb.from('projects').select('*').eq('id',req.params.id).single();if(error)throw error;delete p.id;delete p.created_at;delete p.updated_at;p.name+=' copie';p.slug=p.slug+'-copie-'+Date.now().toString().slice(-5);p.is_published=false;const {data:np,error:pe}=await sb.from('projects').insert(p).select().single();if(pe)throw pe;const original=await treeByProject({...p,id:req.params.id});for(const ob of original.buildings){const b={...ob,project_id:np.id};delete b.id;delete b.created_at;delete b.updated_at;delete b.floors;const {data:nb,error:be}=await sb.from('buildings').insert(b).select().single();if(be)throw be;for(const ofl of ob.floors){const fl={...ofl,building_id:nb.id};delete fl.id;delete fl.created_at;delete fl.updated_at;delete fl.apartments;const {data:nf,error:fe}=await sb.from('floors').insert(fl).select().single();if(fe)throw fe;for(const oa of ofl.apartments){const poly=oa.apartment_polygons?.[0]?.points||[];const a={...oa,floor_id:nf.id};delete a.id;delete a.created_at;delete a.updated_at;delete a.apartment_polygons;const {data:na,error:ae}=await sb.from('apartments').insert(a).select().single();if(ae)throw ae;if(poly.length)await sb.from('apartment_polygons').insert({apartment_id:na.id,points:poly})}}}res.json(np)}catch(e){send(res,null,e)}});
const buildingAllowed=['project_id','name','sort_order','floors_count','default_floor_height_m','ground_floor_different','ground_floor_height_m','model_node_name','model_path','real_height_m','display_height_units','model_up_axis','auto_ground','position_x','position_y','position_z','rotation_y_deg','settings'];
app.post('/api/admin/buildings',auth,async(req,res)=>{const {data,error}=await sb.from('buildings').insert(clean(req.body,buildingAllowed)).select().single();send(res,data,error)});
app.patch('/api/admin/buildings/:id',auth,async(req,res)=>{const {data,error}=await sb.from('buildings').update(clean(req.body,buildingAllowed)).eq('id',req.params.id).select().single();send(res,data,error)});
app.delete('/api/admin/buildings/:id',auth,async(req,res)=>{const {data,error}=await sb.from('buildings').delete().eq('id',req.params.id).select();send(res,data,error)});
app.post('/api/admin/buildings/:id/generate-floors',auth,async(req,res)=>{try{const count=Math.max(1,Math.min(100,Number(req.body.count)||1)),standard=Number(req.body.standard)||3,gd=!!req.body.groundDifferent,ground=gd?(Number(req.body.ground)||standard):standard;await sb.from('floors').delete().eq('building_id',req.params.id);let from=0;const rows=[];for(let i=0;i<count;i++){const h=i===0?ground:standard;rows.push({building_id:req.params.id,name:i===0?'Parter':`Etaj ${i}`,floor_number:i,sort_order:i,height_from_m:from,height_to_m:from+h});from+=h}const {data,error}=await sb.from('floors').insert(rows).select();if(error)throw error;await sb.from('buildings').update({floors_count:count,default_floor_height_m:standard,ground_floor_different:gd,ground_floor_height_m:ground,real_height_m:from}).eq('id',req.params.id);res.json(data)}catch(e){send(res,null,e)}});
const floorAllowed=['name','floor_number','sort_order','height_from_m','height_to_m','plan_path','model_node_name','plan_width','plan_height','settings'];
app.patch('/api/admin/floors/:id',auth,async(req,res)=>{const {data,error}=await sb.from('floors').update(clean(req.body,floorAllowed)).eq('id',req.params.id).select().single();send(res,data,error)});
const apartmentAllowed=['floor_id','code','title','status','rooms','usable_area_sqm','total_area_sqm','price','currency','description','model_node_name','image_path','external_url','settings'];
app.post('/api/admin/apartments',auth,async(req,res)=>{const {data,error}=await sb.from('apartments').insert(clean(req.body,apartmentAllowed)).select().single();send(res,data,error)});
app.patch('/api/admin/apartments/:id',auth,async(req,res)=>{const {data,error}=await sb.from('apartments').update(clean(req.body,apartmentAllowed)).eq('id',req.params.id).select().single();send(res,data,error)});
app.delete('/api/admin/apartments/:id',auth,async(req,res)=>{const {data,error}=await sb.from('apartments').delete().eq('id',req.params.id).select();send(res,data,error)});
app.put('/api/admin/apartments/:id/polygon',auth,async(req,res)=>{const points=(req.body.points||[]).map(p=>({x:Math.max(0,Math.min(1,Number(p.x))),y:Math.max(0,Math.min(1,Number(p.y)))}));const {data,error}=await sb.from('apartment_polygons').upsert({apartment_id:req.params.id,points},{onConflict:'apartment_id'}).select().single();send(res,data,error)});

app.post('/api/admin/floors/:id/auto-apartments',auth,async(req,res)=>{
  try{
    const detections=(req.body?.detections||[]).filter(d=>Array.isArray(d.points)&&d.points.length>=3);
    if(!detections.length)return res.status(400).json({error:'Nu există poligoane valide de salvat.'});

    const overwrite=!!req.body?.overwrite_existing;
    const targetIds=detections.map(d=>d.target_apartment_id).filter(Boolean);
    if(new Set(targetIds).size!==targetIds.length){
      return res.status(400).json({error:'Același apartament a fost mapat la mai multe poligoane.'});
    }

    const {data:existing,error:ee}=await sb
      .from('apartments')
      .select('id,code,title,status,settings,apartment_polygons(id)')
      .eq('floor_id',req.params.id)
      .order('code');
    if(ee)throw ee;

    const existingById=new Map((existing||[]).map(a=>[a.id,a]));
    const usedCodes=new Set((existing||[]).map(a=>String(a.code||'').toUpperCase()));
    let counter=1,created=0,saved=0,skipped=0;
    const results=[];

    function nextCode(suggested){
      const wanted=String(suggested||'').trim().toUpperCase();
      if(wanted&&!usedCodes.has(wanted)){usedCodes.add(wanted);return wanted}
      while(usedCodes.has(`A${String(counter).padStart(2,'0')}`))counter++;
      const code=`A${String(counter++).padStart(2,'0')}`;
      usedCodes.add(code);
      return code;
    }

    for(const d of detections){
      let apartment=null;
      if(d.target_apartment_id){
        apartment=existingById.get(d.target_apartment_id);
        if(!apartment)throw new Error('Un apartament selectat nu mai există pe acest etaj.');
        const rel=apartment.apartment_polygons;
        const hasPolygon=Array.isArray(rel)?rel.length>0:!!rel;
        if(hasPolygon&&!overwrite){
          skipped++;
          results.push({apartment_id:apartment.id,code:apartment.code,status:'skipped_existing_polygon'});
          continue;
        }
      }else{
        const code=nextCode(d.suggested_code);
        const {data:newApartment,error:ae}=await sb.from('apartments').insert({
          floor_id:req.params.id,
          code,
          title:`Apartament ${code}`,
          status:'available',
          settings:{auto_detected:true,detection_confidence:Number(d.confidence)||null}
        }).select().single();
        if(ae)throw ae;
        apartment=newApartment;
        created++;
      }

      const points=d.points.map(p=>({
        x:Math.max(0,Math.min(1,Number(p.x))),
        y:Math.max(0,Math.min(1,Number(p.y)))
      }));

      const {error:pe}=await sb.from('apartment_polygons').upsert({
        apartment_id:apartment.id,
        points
      },{onConflict:'apartment_id'});
      if(pe)throw pe;

      await sb.from('apartments').update({
        settings:{
          ...(apartment.settings||{}),
          auto_detected:true,
          detection_confidence:Number(d.confidence)||null,
          detection_version:'03.6'
        }
      }).eq('id',apartment.id);

      saved++;
      results.push({apartment_id:apartment.id,code:apartment.code,status:'saved'});
    }

    res.json({saved,created,skipped,results});
  }catch(e){send(res,null,e)}
});

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:50*1024*1024}});const buckets=new Set(['models','floor-plans','project-images','apartment-images','project-documents']);
app.post('/api/admin/upload/:bucket',auth,upload.single('file'),async(req,res)=>{try{const bucket=req.params.bucket;if(!buckets.has(bucket))return res.status(400).json({error:'Bucket invalid'});if(!req.file)return res.status(400).json({error:'Fișier lipsă'});const safe=req.file.originalname.replace(/[^a-zA-Z0-9._-]+/g,'-');const prefix=[req.body.project_id,req.body.building_id,req.body.floor_id,req.body.apartment_id].filter(Boolean).join('/');const objectPath=`${prefix?prefix+'/':''}${Date.now()}-${safe}`;const {error}=await sb.storage.from(bucket).upload(objectPath,req.file.buffer,{contentType:req.file.mimetype,upsert:false});if(error)throw error;let url=null;if(bucket!=='project-documents')url=sb.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;const asset={project_id:req.body.project_id||null,building_id:req.body.building_id||null,floor_id:req.body.floor_id||null,apartment_id:req.body.apartment_id||null,asset_type:req.body.asset_type||'upload',storage_bucket:bucket,storage_path:objectPath,label:req.body.label||req.file.originalname,file_name:req.file.originalname,mime_type:req.file.mimetype,file_size:req.file.size,metadata:{}};if(asset.project_id)await sb.from('project_assets').insert(asset);res.json({bucket,path:objectPath,url,file_name:req.file.originalname})}catch(e){send(res,null,e)}});
app.get('/api/public/projects/:slug',async(req,res)=>{const {data,error}=await sb.from('projects').select('*').eq('slug',req.params.slug).maybeSingle();if(error)return send(res,null,error);if(!data)return res.status(404).json({error:'Proiect inexistent'});if(!data.is_published&&req.query.preview!=='1')return res.status(404).json({error:'Proiectul nu este publicat'});try{res.json(await treeByProject(data))}catch(e){send(res,null,e)}});
const dist=path.join(__dirname,'../client/dist');app.use(express.static(dist));app.get('*',(req,res)=>res.sendFile(path.join(dist,'index.html')));const PORT=process.env.PORT||3000;app.listen(PORT,'0.0.0.0',()=>console.log(`Estate Studio Build 03.6 on :${PORT}`));
