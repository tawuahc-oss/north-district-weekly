import {withPublicBackup} from './public-backup.js';
const TABLES=['weekly_events','monthly_announcements','weekly_categories'];
const COOKIE='__Host-weekly-session';
const calURL='https://nds-cal.tawuahc.workers.dev';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const tokenOf=r=>(r.headers.get('Cookie')||'').match(/(?:^|;\s*)__Host-weekly-session=([a-f0-9]{64})(?:;|$)/)?.[1];
const cookie=(token,age)=>`${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
async function body(r){if(Number(r.headers.get('content-length'))>500000)fail('資料過大',413);const raw=await r.text();if(raw.length>500000)fail('資料過大',413);try{return JSON.parse(raw);}catch{fail('資料格式不正確');}}
async function calendar(env,path,options={}){return env.AUTH_SERVICE?env.AUTH_SERVICE.fetch(new Request(calURL+path,options)):fetch(calURL+path,options);}
async function authorized(r,env){const token=tokenOf(r);if(!token)return false;const result=await calendar(env,'/api/admin/me',{headers:{Authorization:'Bearer '+token}});if(result.status===401)return false;if(!result.ok)fail('登入服務暫時未能連線，請稍後再試。',503);return (await result.json()).authenticated===true;}
function text(row,key,max,required=false){const v=row[key];if(v===undefined||v===null||v===''){if(required)fail('請填寫 '+key);return null;}if(typeof v!=='string'||v.length>max)fail(key+' 長度或格式不正確');const result=v.trim();if(required&&!result)fail('請填寫 '+key);return result||null;}
function date(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;}
function time(v){return !v||typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v);}
export function validate(table,row){
 if(!row||typeof row!=='object'||Array.isArray(row))fail('資料格式不正確');
 if(table==='weekly_categories'){
  const name=text(row,'name',60,true),color=text(row,'color',7,true),bg=text(row,'bg',7,true);
  if(!/^#[\da-f]{6}$/i.test(color)||!/^#[\da-f]{6}$/i.test(bg))fail('顏色格式不正確');
  const sort_order=row.sort_order??0;if(!Number.isInteger(sort_order)||Math.abs(sort_order)>100000)fail('排序格式不正確');
  return {name,color,bg,sort_order};
 }
 const r={title:text(row,'title',table==='weekly_events'?160:180,true),category:text(row,'category',60,table==='weekly_events'),start_time:text(row,'start_time',8),end_time:text(row,'end_time',8),location:text(row,'location',200)};
 if(!time(r.start_time)||!time(r.end_time))fail('時間格式不正確');
 if(table==='weekly_events'){
  if(!Number.isInteger(row.weekday)||row.weekday<0||row.weekday>6)fail('星期格式不正確');
  Object.assign(r,{weekday:row.weekday,contact_person:text(row,'contact_person',120),notes:text(row,'notes',2000)});
 }else{
  const start=text(row,'start_date',10,true),end=text(row,'end_date',10),pub=text(row,'publish_date',10);
  if(!date(start)||end&&!date(end)||pub&&!date(pub))fail('日期格式不正確');
  if(end&&end<start)fail('結束日期不可早於開始日期');
  if(pub&&pub>(end||start))fail('發布日期不可晚於結束日期');
  const order=row.sort_order??0;if(!Number.isInteger(order)||Math.abs(order)>100000)fail('排序格式不正確');
  Object.assign(r,{start_date:start,end_date:end,publish_date:pub,content:text(row,'content',5000),sort_order:order});
 }
 return r;
}
async function data(env,admin=false){
 const rows=await env.DB.batch([
  env.DB.prepare('SELECT * FROM weekly_events ORDER BY weekday,start_time,title'),
  env.DB.prepare(admin?'SELECT * FROM monthly_announcements ORDER BY sort_order,start_date':"SELECT * FROM monthly_announcements WHERE (publish_date IS NULL OR publish_date<=?1) AND COALESCE(end_date,start_date)>=?1 ORDER BY sort_order,start_date").bind(...(admin?[]:[today()])),
  env.DB.prepare('SELECT * FROM weekly_categories ORDER BY sort_order,name'),
  env.DB.prepare("SELECT value FROM settings WHERE key='migration_pending'")
 ]);
 return {weekly_events:rows[0].results,monthly_announcements:rows[1].results,weekly_categories:rows[2].results,migration_pending:rows[3].results[0]?.value==='1',updated_at:new Date().toISOString()};
}
async function save(env,table,input,id,original){
 let row=input;
 if(id||original){const old=await env.DB.prepare(`SELECT * FROM ${table} WHERE ${original?'name':'id'}=?`).bind(original||id).first();if(!old)fail('找不到資料',404);row={...old,...input};}
 const clean=validate(table,row),keys=Object.keys(clean);
 let statement;
 if(id||original){statement=env.DB.prepare(`UPDATE ${table} SET ${keys.map(k=>k+'=?').join(',')}${table==='weekly_categories'?'':',updated_at=CURRENT_TIMESTAMP'} WHERE ${original?'name':'id'}=? RETURNING *`).bind(...Object.values(clean),original||id);}
 else {if(table!=='weekly_categories')clean.id=crypto.randomUUID();statement=env.DB.prepare(`INSERT INTO ${table} (${Object.keys(clean).join(',')}) VALUES (${Object.keys(clean).map(()=>'?').join(',')}) RETURNING *`).bind(...Object.values(clean));}
 return (await statement.all()).results[0];
}
const weeklyWorker = {
 async fetch(request,env,ctx){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
  if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{
   if(!['GET','HEAD'].includes(method)&&request.headers.get('Origin')!==url.origin)fail('請從週刊網站操作',403);
   if(path==='/api/health'&&method==='GET'){await env.DB.prepare('SELECT 1').first();return json({status:'online',database:'connected',project:'nds-weekly'});}
   if(path==='/api/public'&&method==='GET'){
    return json(await data(env));
   }
   if(path==='/api/admin/login'&&method==='POST'){
    const input=await body(request);if(typeof input.username!=='string'||typeof input.password!=='string'||input.username.length>100||input.password.length>128)fail('登入資料不正確',401);
    const ip=await digest(request.headers.get('CF-Connecting-IP')||'unknown'),now=Math.floor(Date.now()/1000);
    const prefix=ip+':';
    await env.DB.prepare('DELETE FROM login_attempts WHERE attempted_at<?').bind(now-900).run();
    const reserve=await env.DB.prepare('INSERT INTO login_attempts(id,attempted_at) SELECT ?,? WHERE (SELECT count(*) FROM login_attempts WHERE substr(id,1,length(?3))=?3) < 5').bind(prefix+crypto.randomUUID(),now,prefix).run();
    if(!reserve.meta.changes)fail('嘗試次數過多，請在 15 分鐘後再試。',429);
    const response=await calendar(env,'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    if(!response.ok)fail(response.status===401?'使用者名稱或密碼不正確。':'登入服務暫時未能使用，請稍後再試。',response.status===401?401:503);
    const result=await response.json();if(!/^[a-f0-9]{64}$/.test(result.token))fail('登入服務回應異常',503);
    await env.DB.prepare('DELETE FROM login_attempts WHERE substr(id,1,length(?1))=?1').bind(prefix).run();
    return json({authenticated:true},200,{'Set-Cookie':cookie(result.token,28800)});
   }
   if(!path.startsWith('/api/admin/'))return json({error:'找不到此功能'},404);
   // An expired or already revoked session must still be removable from this browser.
   if(path==='/api/admin/logout'&&method==='POST'){
    const token=tokenOf(request);
    if(token){
     const result=await calendar(env,'/api/admin/logout',{method:'POST',headers:{Authorization:'Bearer '+token}});
     if(!result.ok&&result.status!==401)fail('登出服務暫時未能連線，請稍後再試。',503);
    }
    return json({success:true},200,{'Set-Cookie':cookie('',0)});
   }
   const auth=await authorized(request,env);
   if(path==='/api/admin/session'&&method==='GET')return json({authenticated:auth});
   if(!auth)fail('請先以管理員帳戶登入。',401);
   if(path==='/api/admin/data'&&method==='GET')return json(await data(env,true));
   if(path==='/api/admin/export'&&method==='GET')return json({format:'nds-weekly-v1',exported_at:new Date().toISOString(),data:await data(env,true)});
   if(path==='/api/admin/confirm-migration'&&method==='POST'){await env.DB.prepare("UPDATE settings SET value='0' WHERE key='migration_pending'").run();return json({success:true});}
   if(path==='/api/admin/import'&&method==='POST'){
    const input=await body(request),source=input.data||input;
    if(!TABLES.every(t=>Array.isArray(source[t])))fail('備份必須包含聚會、通告及分類三份資料');
    if(source.weekly_events.length+source.monthly_announcements.length+source.weekly_categories.length>2000)fail('請分批匯入，每次最多 2,000 筆');
    const statements=[];
    for(const table of ['weekly_categories','weekly_events','monthly_announcements']){
     const cleanRows=source[table].map(row=>{
      const clean=validate(table,row);if(table!=='weekly_categories'){if(!['string','number'].includes(typeof row.id)||String(row.id).length>100||!String(row.id))fail('資料缺少有效識別碼');clean.id=String(row.id);}return clean;
     });
     if(!cleanRows.length)continue;
     const keys=Object.keys(cleanRows[0]),pk=table==='weekly_categories'?'name':'id';
     // Three statements at most, even for large backups; respects free-plan query limits.
     statements.push(env.DB.prepare(`INSERT INTO ${table} (${keys.join(',')}) SELECT ${keys.map(k=>"json_extract(value,'$."+k+"')").join(',')} FROM json_each(?) WHERE 1 ON CONFLICT(${pk}) DO UPDATE SET ${keys.filter(k=>k!==pk).map(k=>k+'=excluded.'+k).join(',')}`).bind(JSON.stringify(cleanRows)));
    }
    // One batch is atomic; invalid categories or dates cannot leave a partial import.
    if(statements.length)await env.DB.batch(statements);
    return json({success:true,imported:TABLES.reduce((sum,t)=>sum+source[t].length,0)});
   }
   if(path==='/api/admin/retention'&&method==='GET'){
    const cutoff=new Date();cutoff.setUTCFullYear(cutoff.getUTCFullYear()-2);const limit=cutoff.toISOString().slice(0,10);
    const rows=await env.DB.prepare('SELECT * FROM monthly_announcements WHERE COALESCE(end_date,start_date)<? ORDER BY start_date').bind(limit).all();
    return json({cutoff:limit,monthly_announcements:rows.results});
   }
   if(path==='/api/admin/retention'&&method==='POST'){
    const input=await body(request);if(input.backup_downloaded!==true)fail('請先下載封存備份');
    const cutoff=new Date();cutoff.setUTCFullYear(cutoff.getUTCFullYear()-2);const limit=cutoff.toISOString().slice(0,10);
    const result=await env.DB.prepare('DELETE FROM monthly_announcements WHERE COALESCE(end_date,start_date)<?').bind(limit).run();return json({success:true,deleted:result.meta.changes});
   }
   const match=path.match(/^\/api\/admin\/(weekly_events|monthly_announcements|weekly_categories)(?:\/(.+))?$/);
   if(match){
    const table=match[1],key=match[2]?decodeURIComponent(match[2]):null,field=table==='weekly_categories'?'name':'id';
    if(method==='POST'&&!key)return json({data:await save(env,table,await body(request))},201);
    if(method==='PUT'&&key)return json({data:await save(env,table,await body(request),field==='id'?key:null,field==='name'?key:null)});
    if(method==='DELETE'&&key){const result=await env.DB.prepare(`DELETE FROM ${table} WHERE ${field}=? RETURNING *`).bind(key).all();if(!result.results.length)fail('找不到資料',404);return json({data:result.results[0]});}
   }
   return json({error:'找不到此功能'},404);
  }catch(error){
   if(!error.status)console.error('weekly_api_failure',error.name,error.message);
   if(/FOREIGN KEY/i.test(error.message))return json({error:'仍有聚會或通告使用此分類，或指定分類不存在。',code:'23503'},409);
   if(/UNIQUE constraint/i.test(error.message))return json({error:'此分類名稱已存在。',code:'23505'},409);
   return json({error:error.status?error.message:'服務暫時未能完成操作，請稍後再試。'},error.status||503);
  }
 }
};

export default withPublicBackup(weeklyWorker,{prefix:'weekly:',publicPath:path=>path==='/api/public',keys:()=>['public'],warmKeys:()=>['public'],snapshot:env=>data(env),restore:backups=>({...backups[0],monthly_announcements:backups[0].monthly_announcements.filter(row=>(!row.publish_date||row.publish_date<=today())&&(row.end_date||row.start_date)>=today())})});
