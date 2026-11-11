import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function frontend(api){
  const elements=new Map();
  const $=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'old',options:[{}],
      classList:{add(){},remove(){},toggle(){}},setAttribute(){},removeAttribute(){},
      replaceChildren(){this.cleared=true;},reset(){this.resetCalled=true;}});
    return elements.get(id);
  };
  const context={api,$,db:{auth:{getSession:async()=>({data:{session:{user:{id:'admin'}}}})}},
    ADMIN_UID:'admin',weekly:[],notices:[],session:null,loading:false,loadTask:null,authRevision:0,
    noticeSortable:null,CATEGORIES:[],CATEGORY_COLORS:{},selected:new Set(),
    publicCacheKey:'test',localStorage:{setItem(){},getItem(){return null;}},
    msg(){},migrationMessage(){},categorySelect(){},fillCategoryEditor(){},filters(){},
    resetW(){},resetA(){},renderWeekly(){},renderNotices(){},renderWeeklyAdmin(){},renderNoticeAdmin(){}};
  vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('function load(){'),html.indexOf('function renderWeeklyAdmin(){')),context);
  return {context,$};
}
const publicData={weekly_categories:[],weekly_events:[{id:'public'}],monthly_announcements:[]};

test('a session expiring between validation and admin fetch falls back to public data',async()=>{
  const {context,$}=frontend(async path=>{
    if(path==='/api/public')return publicData;
    throw Object.assign(Error('expired'),{status:401});
  });
  await context.load();
  assert.equal(context.session,null);
  assert.equal(context.weekly[0].id,'public');
  assert.equal($('announcementAdminList').cleared,true);
  assert.equal($('categoryEditor').resetCalled,true);
});

test('auth transitions wait for an old load then fetch a fresh session and dataset',async()=>{
  let release,publicCalls=0,adminCalls=0;
  const {context}=frontend(async path=>{
    if(path==='/api/public'){
      publicCalls++;
      if(publicCalls===1)await new Promise(resolve=>{release=resolve;});
      return publicData;
    }
    adminCalls++;return {...publicData,weekly_events:[{id:'admin'}]};
  });
  const first=context.load();
  context.authRevision++;
  const refresh=context.refreshAfterAuthChange();
  release();await Promise.all([first,refresh]);
  assert.equal(publicCalls,2);
  assert.equal(adminCalls,1);
  assert.equal(context.weekly[0].id,'admin');
});

test('background refresh does not reset forms while an admin or login panel is open',()=>{
  let calls=0;
  const context={document:{hidden:false,querySelector:()=>({})},load:()=>{calls++;}};
  vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('function refreshWhenIdle(){'),html.indexOf('setInterval(refreshWhenIdle')),context);
  context.refreshWhenIdle();assert.equal(calls,0);
  context.document.querySelector=()=>null;
  context.refreshWhenIdle();assert.equal(calls,1);
  context.document.hidden=true;
  context.refreshWhenIdle();assert.equal(calls,1);
});
