export async function api(path,options={}){
  const opts={credentials:'include',...options};
  if(options.body && !(options.body instanceof FormData)){
    opts.headers={'Content-Type':'application/json',...(options.headers||{})};
    opts.body=JSON.stringify(options.body);
  }
  const r=await fetch('/api'+path,opts);
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||`HTTP ${r.status}`);
  return data;
}

export function slugify(v=''){
  return v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
}

export function parseLevels(input=''){
  const out=new Set();
  input.split(',').map(s=>s.trim()).filter(Boolean).forEach(part=>{
    if(part.includes('-')){
      const [a,b]=part.split('-').map(Number);
      if(Number.isFinite(a)&&Number.isFinite(b)){
        for(let i=Math.min(a,b);i<=Math.max(a,b);i++) out.add(i);
      }
    }else{
      const n=Number(part);
      if(Number.isFinite(n)) out.add(n);
    }
  });
  return [...out].sort((a,b)=>a-b);
}

export function levelsToText(arr=[]){
  return [...arr].sort((a,b)=>a-b).join(', ');
}
