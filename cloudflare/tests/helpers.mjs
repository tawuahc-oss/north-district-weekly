import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function setup(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/0001_weekly.sql',import.meta.url),'utf8'));
 const wrap=(sql,values=[])=>({
  bind(...args){return wrap(sql,args);},
  async first(){return sqlite.prepare(sql).get(...values)||null;},
  async all(){return {results:sqlite.prepare(sql).all(...values),meta:{changes:0}};},
  async run(){const r=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}};}
 });
 const DB={prepare:sql=>wrap(sql),async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.all());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const sessions=new Set();
 const AUTH_SERVICE={async fetch(r){const path=new URL(r.url).pathname,token=r.headers.get('Authorization')?.slice(7);if(path.endsWith('/login')){const input=await r.json();if(input.username!=='admin'||input.password!=='test-fixture-password')return Response.json({error:'Invalid credentials'},{status:401});const t=crypto.randomUUID().replaceAll('-','').repeat(2);sessions.add(t);return Response.json({token:t});}if(path.endsWith('/logout')){sessions.delete(token);return Response.json({success:true});}return Response.json({authenticated:sessions.has(token)},{status:sessions.has(token)?200:401});}};
 return {env:{DB,AUTH_SERVICE},sqlite};
}
