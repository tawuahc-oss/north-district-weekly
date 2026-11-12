import {writeFile,rename,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const eventFields=['id','event_id','title','description','location','start_at','end_at','all_day','category_id','category_name','category_color','recurrence_rule_id','is_recurring','original_start_at','exception_action'];
export function publicEvent(row){return Object.fromEntries(eventFields.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));}
export function validatePublicSnapshot(snapshot){
 if(snapshot.format!=='nds-calendar-public-snapshot'||snapshot.version!==1||!Array.isArray(snapshot.categories)||!snapshot.months||!Number.isFinite(Date.parse(snapshot.generated_at)))throw Error('Invalid public snapshot');
 for(const [month,events] of Object.entries(snapshot.months)){
  if(!/^\d{4}-\d{2}$/.test(month)||!Array.isArray(events))throw Error('Invalid snapshot month');
  for(const e of events)if(!e.id||typeof e.title!=='string'||typeof e.start_at!=='string'||Object.keys(e).some(k=>!eventFields.includes(k)))throw Error('Unsafe public event');
 }
 return snapshot;
}
export async function updateCalendarBackup({fetcher=fetch,year=Number(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric'}).format(new Date())),output=new URL('../calendar-backup/snapshot.json',import.meta.url)}={}){
 const root='https://nds-cal.tawuahc.workers.dev';
 async function get(path){const r=await fetcher(root+path,{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}});if(!r.ok)throw Error('Calendar source HTTP '+r.status);return r.json();}
 const categoryResponse=await get('/api/categories');
 if(!Array.isArray(categoryResponse.categories))throw Error('Missing categories');
 const categories=categoryResponse.categories.map(c=>({id:c.id,name:c.name,color:c.color,sort_order:c.sort_order}));
 const months={};
 // Current and next calendar year. Each query stays within the API range cap.
 for(let y=year;y<=year+1;y++)for(let m=1;m<=12;m++){
  const month=y+'-'+String(m).padStart(2,'0'),from=month+'-01',to=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
  const response=await get('/api/calendar?from='+from+'&to='+to);
  if(!Array.isArray(response.events)||response.truncated||response.has_more)throw Error('Incomplete public calendar for '+month);
  months[month]=response.events.map(publicEvent);
 }
 const snapshot=validatePublicSnapshot({format:'nds-calendar-public-snapshot',version:1,generated_at:new Date().toISOString(),from:year+'-01-01',to:(year+1)+'-12-31',categories,months});
 // Replace only after every query succeeded, never overwrite a good backup with an error.
 await mkdir(new URL('./',output),{recursive:true});
 await writeFile(new URL(output.href+'.tmp'),JSON.stringify(snapshot));await rename(new URL(output.href+'.tmp'),output);
 console.log('Public calendar snapshot verified: '+Object.keys(months).length+' months; no internal notes or credentials.');
 return snapshot;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await updateCalendarBackup();
