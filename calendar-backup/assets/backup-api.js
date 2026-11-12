export function createBackupApi({fetcher=fetch,showStatus=()=>{}}={}){
 let pending;
 async function snapshot(){
  pending||=fetcher('./snapshot.json',{cache:'no-store'}).then(async response=>{
   if(!response.ok)throw Error('備用資料未能讀取。');const data=await response.json();
   if(data.format!=='nds-calendar-public-snapshot'||data.version!==1||!data.months||!Array.isArray(data.categories))throw Error('備用資料格式不正確。');
   showStatus(data);return data;
  }).catch(error=>{pending=null;throw error;});
  return pending;
 }
 return async function(path,method='GET'){
  if(method!=='GET'||path.startsWith('/api/admin/'))throw Error('這是唯讀備用月曆，不能登入或修改資料。');
  const data=await snapshot();
  if(path==='/api/categories')return {categories:data.categories};
  const url=new URL(path,'https://backup.invalid');
  if(url.pathname==='/api/calendar'){
   const from=url.searchParams.get('from'),to=url.searchParams.get('to'),month=from?.slice(0,7);
   if(!from||!to||!(month in data.months)||to.slice(0,7)!==month)throw Error('備用月曆只包含 '+data.from+' 至 '+data.to+' 的資料。');
   return {events:data.months[month].filter(e=>e.start_at.slice(0,10)<=to&&(e.end_at||e.start_at).slice(0,10)>=from),from,to};
  }
  throw Error('備用月曆不支援此操作。');
 };
}
