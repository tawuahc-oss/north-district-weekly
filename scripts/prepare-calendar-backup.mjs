// Refresh the backup's visitor layout deliberately; data-only refreshes use update-calendar-backup.mjs.
import {mkdir,writeFile} from 'node:fs/promises';
const root=new URL('../calendar-backup/',import.meta.url),source='https://nds-cal.tawuahc.workers.dev/';
const files=['index.html','manifest.webmanifest','assets/app.js','assets/calendar.css','assets/lunar-info.js','assets/recurrence-form.js','assets/vendor/lunar.js','assets/vendor/lunar.LICENSE','assets/data/hk-holidays.json','assets/icons/calendar-180.png','assets/icons/calendar-192.png','assets/icons/calendar-512.png'];
for(const name of files){
 const response=await fetch(source+name,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Layout asset HTTP '+response.status+' '+name);
 let content=new Uint8Array(await response.arrayBuffer());
 if(name==='index.html'){
  let text=new TextDecoder().decode(content);
  text=text.replace('<head>','<head><meta name="nds-backup" content="readonly">').replace('<title>北區學生月程</title>','<title>北區學生月程｜唯讀備用站</title>');
  if(!text.includes('</header>'))throw Error('Unknown calendar layout');
  text=text.replace('</header>',`</header><aside id="backupBanner" role="status" style="padding:10px 12px;margin:8px 0;border:1px solid var(--line);border-radius:10px;font-size:.85rem">唯讀備用月曆｜<span id="backupTimestamp">正在讀取備份時間…</span><br>這是獨立保存的公開資料，可能未包含最近修改。<a href="https://nds-cal.tawuahc.workers.dev/">返回主站</a></aside>`);
  content=new TextEncoder().encode(text);
 }
 if(name==='assets/app.js'){
  let text=new TextDecoder().decode(content);
  if(!text.includes("$('loginOpen').hidden=logged;")||!text.includes("async function api(path,method='GET',body) {"))throw Error('Unknown calendar application; review backup adapter');
  text=`import {createBackupApi} from './backup-api.js';\nconst backupApi=createBackupApi({showStatus:data=>{document.getElementById('backupTimestamp').textContent='備份時間：'+new Date(data.generated_at).toLocaleString('zh-HK',{timeZone:'Asia/Hong_Kong'})+'（香港時間）；範圍：'+data.from+' 至 '+data.to;}});\n`+text;
  text=text.replace("async function api(path,method='GET',body) {","async function api(path,method='GET',body) { return backupApi(path,method,body); /* Primary API intentionally disabled in this backup. */\n");
  text=text.replace("$('loginOpen').hidden=logged;","$('loginOpen').hidden=true;");
  text=text.replace(/try\{const saved=JSON\.parse\(sessionStorage\.getItem\(storageKey\)\);[^\n]+\}\s*catch\{\}/,'// Read-only backup never restores a primary administrator session.');
  text=text.replace("$('refresh').onclick=reload;","$('refresh').onclick=()=>location.reload();");
  content=new TextEncoder().encode(text);
 }
 if(name==='manifest.webmanifest'){
  const manifest=JSON.parse(new TextDecoder().decode(content));Object.assign(manifest,{name:'北區學生月程｜唯讀備用站',short_name:'月曆備用',id:'./',start_url:'./',scope:'./'});content=new TextEncoder().encode(JSON.stringify(manifest));
 }
 const target=new URL(name,root);await mkdir(new URL('./',target),{recursive:true});await writeFile(target,content);
}
console.log('Independent visitor layout copied; primary API and administrator login disabled.');
