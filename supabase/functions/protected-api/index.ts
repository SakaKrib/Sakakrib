import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase environment is not configured.');

const BASE = SUPABASE_URL.replace(/\/+$/, '');
const FUNCTION_NAME = 'protected-api';

const allowedOrigin = (req: Request) => {
  const origin = req.headers.get('origin');
  const configured = Deno.env.get('APP_ORIGIN');
  if (configured && origin === configured) return origin;
  const dev = new Set(['http://localhost:5173','http://localhost:5174','http://localhost:5175','http://localhost:5176','http://127.0.0.1:5173','http://127.0.0.1:5174','http://127.0.0.1:5175','http://127.0.0.1:5176','http://100.109.224.0:5174', 'http://100.109.224.0:5173']);
  return origin && dev.has(origin) ? origin : (configured ?? '');
};
const cors = (req: Request): HeadersInit => {
  const origin = allowedOrigin(req);
  return { ...(origin ? {'Access-Control-Allow-Origin': origin} : {}), 'Access-Control-Allow-Credentials':'true', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-http-method-override', 'Access-Control-Allow-Methods':'GET, POST, PUT, PATCH, DELETE, OPTIONS', Vary:'Origin' };
};
const json = (req: Request, body: Record<string, unknown>, status=200, extra: HeadersInit=[]): Response => {
  const h = new Headers(cors(req)); h.set('Content-Type','application/json'); h.set('Cache-Control','no-store');
  for (const [k,v] of extra) h.append(k,v);
  return new Response(JSON.stringify(body), {status, headers:h});
};
const readCookies = (req: Request) => {
  const out: Record<string,string> = {}; const raw=req.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) { const i=part.indexOf('='); if(i<0) continue; const n=part.slice(0,i).trim(); const v=part.slice(i+1).trim(); if(!n) continue; try{out[n]=decodeURIComponent(v)}catch{out[n]=v;} }
  return out;
};
const cookieBase=['Path=/','HttpOnly','Secure','SameSite=None'];
const authCookies=(a:string,r:string):HeadersInit=>[['Set-Cookie',`sk_access=${encodeURIComponent(a)}; ${cookieBase.join('; ')}; Max-Age=3600`],['Set-Cookie',`sk_refresh=${encodeURIComponent(r)}; ${cookieBase.join('; ')}; Max-Age=2592000`]];
const clearCookies=():HeadersInit=>[['Set-Cookie',`sk_access=; ${cookieBase.join('; ')}; Max-Age=0`],['Set-Cookie',`sk_refresh=; ${cookieBase.join('; ')}; Max-Age=0`]];

const makeAuthClient=()=>createClient(BASE,SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

type Profile={id:string;email:string|null;role:string|null;email_verified:boolean|null;verification_status:string|null;kyc_completed:boolean|null;landlord_application_status:string|null;real_estate_application_status:string|null;mover_application_status:string|null};
type Auth={user:{id:string;email:string|null};accessToken:string;refreshToken?:string;profile:Profile};

const authenticate=async(token:string):Promise<Auth|null>=>{const ac=makeAuthClient(); const {data,error}=await ac.auth.getUser(token); if(error||!data.user)return null; const uc=createClient(BASE,SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${token}`}}}); const {data:p,error:pe}=await uc.from('profiles').select('id,email,role,email_verified,verification_status,kyc_completed,landlord_application_status,real_estate_application_status,mover_application_status').eq('id',data.user.id).maybeSingle(); if(pe||!p){console.error('Profile authentication lookup failed:',pe);return null;} return {user:{id:data.user.id,email:data.user.email??null},accessToken:token,profile:p as Profile};};
const refresh=async(token:string)=>{const {data,error}=await makeAuthClient().auth.refreshSession({refresh_token:token}); if(error||!data.session||!data.user)return null; const a=await authenticate(data.session.access_token); return a?{...a,refreshToken:data.session.refresh_token}:null;};
const requiredRole=(path:string)=>path.startsWith('/rest/v1/landlord/')?'landlord':path.startsWith('/rest/v1/real_estate/')?'real_estate':path.startsWith('/rest/v1/renter/')?'renter':null;
const authorize=(p:Profile,path:string)=>{if(p.email_verified!==true)return {ok:false as const,status:403,error:'Email verification is required.'}; const role=(p.role??'').trim().toLowerCase(); if(!new Set(['landlord','real_estate','renter','mover','admin']).has(role))return {ok:false as const,status:403,error:'Your account does not have a valid application role.'}; const rr=requiredRole(path); if(rr&&role!==rr)return {ok:false as const,status:403,error:`This protected route requires the ${rr} role.`}; return {ok:true as const};};
const normalize=(path:string)=>{let p='';try{p=decodeURIComponent(path)}catch{return ''} const i=p.indexOf('/rest/v1/'); return i>=0?p.slice(i):p==='/rest/v1'?'/rest/v1/':'';};
const safe=(p:string)=>p.startsWith('/rest/v1/')&&!p.includes('://')&&!p.startsWith('//')&&!p.includes('\\')&&!p.includes('\0');

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:cors(req)});
  const origin=req.headers.get('origin'), configured=Deno.env.get('APP_ORIGIN');
  if(configured&&origin&&origin!==configured)return json(req,{error:'Origin not allowed.'},403);
  try{
    const cookies=readCookies(req); let access=cookies.sk_access; let refreshHeaders:HeadersInit=[];
    let a=access?await authenticate(access):null;
    if(!a){ if(!cookies.sk_refresh)return json(req,{authenticated:false,error:'Authentication required.'},401,clearCookies()); const r=await refresh(cookies.sk_refresh); if(!r)return json(req,{authenticated:false,error:'Authentication expired.'},401,clearCookies()); access=r.accessToken;a=r;refreshHeaders=authCookies(r.accessToken,r.refreshToken!); }

    const url=new URL(req.url);
    const pathname=url.pathname;

    // Protected proxy for user-authenticated Edge Function calls.
    const subscriptionStkPrefix=`/functions/v1/${FUNCTION_NAME}/subscription-stk`;
    if(pathname===subscriptionStkPrefix || pathname===`/${FUNCTION_NAME}/subscription-stk` || pathname.endsWith('/subscription-stk')){
      if(req.method!=='POST') return json(req,{error:'Method not allowed.'},405,refreshHeaders);
      const authz=authorize(a.profile,'/rest/v1/landlord/subscription-stk'); if(!authz.ok)return json(req,{authenticated:true,authorized:false,role:a.profile.role,error:authz.error},authz.status,refreshHeaders);
      const body=await req.text(); const headers=new Headers(); headers.set('apikey',SUPABASE_ANON_KEY); headers.set('Authorization',`Bearer ${access}`); headers.set('Content-Type',req.headers.get('content-type')??'application/json');
      const targetUrl=`${BASE}/functions/v1/subscription-stk`; const response=await fetch(targetUrl,{method:'POST',headers,body}); const rh=new Headers(cors(req)); rh.set('Cache-Control','no-store'); const contentType=response.headers.get('content-type'); if(contentType)rh.set('content-type',contentType); for(const [n,v] of refreshHeaders)rh.append(n,v); return new Response(await response.arrayBuffer(),{status:response.status,headers:rh});
    }

    // Dedicated protected storage upload.
    const storagePrefix=`/functions/v1/${FUNCTION_NAME}/storage/upload`;
    if(pathname===storagePrefix || pathname===`/${FUNCTION_NAME}/storage/upload` || pathname.endsWith('/storage/upload')){
      if(req.method!=='POST') return json(req,{error:'Method not allowed.'},405,refreshHeaders);
      const authz=authorize(a.profile,'/rest/v1/storage/upload'); if(!authz.ok)return json(req,{authenticated:true,authorized:false,error:authz.error},authz.status,refreshHeaders);
      const form=await req.formData(); const file=form.get('file'); const bucket=form.get('bucket'); const path=form.get('path');
      if(!(file instanceof File))return json(req,{error:'file is required.'},400,refreshHeaders); if(typeof bucket!=='string'||!['id-documents','licenses','kyc-documents'].includes(bucket))return json(req,{error:'Invalid storage bucket.'},400,refreshHeaders); if(typeof path!=='string'||!path)return json(req,{error:'path is required.'},400,refreshHeaders);
      const normalized=path.replace(/^\/+/, ''); const first=normalized.split('/')[0]; if(first!==a.user.id)return json(req,{error:'You may only upload documents to your own folder.'},403,refreshHeaders); if(normalized.includes('..')||normalized.includes('\\')||normalized.includes('\0'))return json(req,{error:'Invalid storage path.'},400,refreshHeaders); if(file.size>10*1024*1024)return json(req,{error:'Image is too large. Maximum size is 10 MB.'},413,refreshHeaders); if(!file.type.startsWith('image/'))return json(req,{error:'Only image files are allowed.'},415,refreshHeaders);
      const storageClient=createClient(BASE,SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${access}`}}}); const bytes=await file.arrayBuffer(); const {error:ue}=await storageClient.storage.from(bucket).upload(normalized,bytes,{contentType:file.type||'image/jpeg',cacheControl:'3600',upsert:false}); if(ue){console.error('Storage upload failed:',ue);return json(req,{error:ue.message||'Document upload failed.'},400,refreshHeaders);} const {data:signed,error:se}=await storageClient.storage.from(bucket).createSignedUrl(normalized,3600); if(se||!signed?.signedUrl){console.error('Signed URL failed:',se);return json(req,{error:'Document uploaded but a preview URL could not be generated.'},500,refreshHeaders);} return json(req,{ok:true,bucket,path:normalized,url:signed.signedUrl,publicUrl:signed.signedUrl},200,refreshHeaders);
    }

    // Resolve an already-uploaded document's durable storage path back into a fresh signed URL for display.
    const signPrefix=`/functions/v1/${FUNCTION_NAME}/storage/sign`;
    if(pathname===signPrefix || pathname===`/${FUNCTION_NAME}/storage/sign` || pathname.endsWith('/storage/sign')){
      if(req.method!=='POST') return json(req,{error:'Method not allowed.'},405,refreshHeaders); const authz=authorize(a.profile,'/rest/v1/storage/sign'); if(!authz.ok)return json(req,{authenticated:true,authorized:false,error:authz.error},authz.status,refreshHeaders); const body=await req.json().catch(()=>null); const bucket=body?.bucket; const path=body?.path;
      if(typeof bucket!=='string'||!['id-documents','licenses','kyc-documents'].includes(bucket))return json(req,{error:'Invalid storage bucket.'},400,refreshHeaders); if(typeof path!=='string'||!path)return json(req,{error:'path is required.'},400,refreshHeaders); const normalized=path.replace(/^\/+/, ''); const first=normalized.split('/')[0]; const role=(a.profile.role??'').trim().toLowerCase(); const isOwner=first===a.user.id; const isAdmin=role==='admin'; if(!isOwner&&!isAdmin)return json(req,{error:'You may only view your own documents.'},403,refreshHeaders); if(normalized.includes('..')||normalized.includes('\\')||normalized.includes('\0'))return json(req,{error:'Invalid storage path.'},400,refreshHeaders);
      const storageClient=createClient(BASE,SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${access}`}}}); const {data:signed,error:se}=await storageClient.storage.from(bucket).createSignedUrl(normalized,3600); if(se||!signed?.signedUrl){console.error('Signed URL failed:',se);return json(req,{error:'Unable to generate a preview URL.'},500,refreshHeaders);} return json(req,{ok:true,bucket,path:normalized,url:signed.signedUrl},200,refreshHeaders);
    }

    // Dedicated role-selection endpoint. This runs before generic role authorization
    // because a verified user is allowed to have no role yet. It can modify ONLY the
    // authenticated user's role, never an arbitrary profile or any other profile field.
    const rolePrefix=`/functions/v1/${FUNCTION_NAME}/set-role`;
    if(pathname===rolePrefix || pathname===`/${FUNCTION_NAME}/set-role` || pathname.endsWith('/set-role')){
      if(req.method!=='POST') return json(req,{error:'Method not allowed.'},405,refreshHeaders);
      if(a.profile.email_verified!==true)return json(req,{authenticated:true,authorized:false,error:'Email verification is required.'},403,refreshHeaders);
      const body=await req.json().catch(()=>null); const role=typeof body?.role==='string'?body.role.trim().toLowerCase():'';
      const allowedRoles=new Set(['renter','landlord','mover','real_estate']);
      if(!allowedRoles.has(role))return json(req,{error:'Invalid role selected.'},400,refreshHeaders);
      const userClient=createClient(BASE,SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${access}`}}});
      const {data:updated,error:updateError}=await userClient.from('profiles').update({role}).eq('id',a.user.id).select('id,role').maybeSingle();
      if(updateError){console.error('Role update failed:',updateError);return json(req,{authenticated:true,authorized:true,error:updateError.message||'Unable to save your role.'},400,refreshHeaders);}
      if(!updated)return json(req,{authenticated:true,authorized:true,error:'Profile could not be updated.'},404,refreshHeaders);
      return json(req,{success:true,authenticated:true,authorized:true,profile_id:a.user.id,role:updated.role},200,refreshHeaders);
    }

    const target=normalize(pathname); if(!safe(target))return json(req,{error:'Unsupported protected API path.'},400,refreshHeaders); const authz=authorize(a.profile,target); if(!authz.ok)return json(req,{authenticated:true,authorized:false,role:a.profile.role,error:authz.error},authz.status,refreshHeaders);
    const targetUrl=`${BASE}${target}${url.search}`; const body=req.method==='GET'||req.method==='HEAD'?undefined:await req.text(); const headers=new Headers(); headers.set('apikey',SUPABASE_ANON_KEY); headers.set('Authorization',`Bearer ${access}`); headers.set('Accept',req.headers.get('accept')??'application/json'); for(const name of ['content-type','prefer','range']){const v=req.headers.get(name);if(v)headers.set(name,v);} let response=await fetch(targetUrl,{method:req.method,headers,body});
    if(response.status===401&&cookies.sk_refresh&&refreshHeaders.length===0){const r=await refresh(cookies.sk_refresh);if(r){access=r.accessToken;refreshHeaders=authCookies(r.accessToken,r.refreshToken!);headers.set('Authorization',`Bearer ${access}`);response=await fetch(targetUrl,{method:req.method,headers,body});}}
    const rh=new Headers(cors(req));rh.set('Cache-Control','no-store');for(const n of ['content-type','content-range','location']){const v=response.headers.get(n);if(v)rh.set(n,v);}for(const [n,v] of refreshHeaders)rh.append(n,v);if(response.status===401)for(const [n,v] of clearCookies())rh.append(n,v); return new Response(await response.arrayBuffer(),{status:response.status,headers:rh});
  }catch(error){console.error('protected-api error:',error);return json(req,{error:error instanceof Error?error.message:'Protected API request failed.'},500);}
});
