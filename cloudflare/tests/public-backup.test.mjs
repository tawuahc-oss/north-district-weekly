import test from 'node:test';
import assert from 'node:assert/strict';
import weekly from '../worker.js';
import {setup} from './helpers.mjs';
function backups(){
  const rows=new Map(),jobs=[];
  return {rows,ctx:{waitUntil(job){jobs.push(job);}},async flush(){await Promise.all(jobs.splice(0));},
    kv:{async get(key){return rows.has(key)?JSON.parse(rows.get(key)):null;},async put(key,value){rows.set(key,value);}}};
}
test('weekly backup never exposes future notices and does not grant admin access during an outage',async()=>{
  const {env,sqlite}=setup(),backup=backups();env.PUBLIC_BACKUPS=backup.kv;
  sqlite.prepare('INSERT INTO monthly_announcements(id,title,start_date,end_date,publish_date) VALUES(?,?,?,?,?)').run('future','UNPUBLISHED_TEST','2099-01-01','2099-01-02','2099-01-01');
  sqlite.prepare('INSERT INTO weekly_events(id,weekday,category,title) VALUES(?,?,?,?)').run('weekly',4,'學生聚會','Public weekly event');
  const url='https://weekly.example';
  const online=await weekly.fetch(new Request(url+'/api/public'),env,backup.ctx);assert.equal(online.status,200);await backup.flush();
  assert.equal([...backup.rows.values()].some(value=>value.includes('UNPUBLISHED_TEST')),false);
  const realDB=env.DB;env.DB={prepare(){throw Error('simulated outage');},batch(){throw Error('simulated outage');}};
  const saved=await weekly.fetch(new Request(url+'/api/public'),env,backup.ctx),data=await saved.json();
  assert.equal(saved.status,200);assert.equal(data.stale,true);assert.equal(data.weekly_events.length,1);assert.equal(data.monthly_announcements.length,0);
  assert.equal((await weekly.fetch(new Request(url+'/api/admin/data'),env,backup.ctx)).status,401);
  const post=await weekly.fetch(new Request(url+'/api/admin/weekly_events',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:'{}'}),env,backup.ctx);
  assert.equal(post.status,401);
  env.DB=realDB;assert.equal((await (await weekly.fetch(new Request(url+'/api/public'),env)).json()).stale,undefined);sqlite.close();
});
