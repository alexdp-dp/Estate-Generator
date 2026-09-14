export async function api(path, options={}) {
  const opts={credentials:'include', ...options};
  if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string') {
    opts.headers={...(opts.headers||{}),'Content-Type':'application/json'};
    opts.body=JSON.stringify(opts.body);
  }
  const r=await fetch('/api'+path,opts);
  const text=await r.text();
  let data=null;
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok){const e=new Error(data?.error||`HTTP ${r.status}`); e.status=r.status; e.data=data; throw e;}
  return data;
}
export function slugify(v=''){return v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,80)}
export const statusLabel={available:'Disponibil',reserved:'Rezervat',sold:'Vândut'};
