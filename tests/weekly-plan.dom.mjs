import {REVIEW_FIXTURE} from './plan-fixture.mjs';
// Integration harness: real weekly UI and functions, isolated Firestore adapter.
import {createRequire} from 'node:module';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
import {webcrypto} from 'node:crypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const helpers=fs.readFileSync(new URL('../weekly-plan.mjs',import.meta.url),'utf8').replace(/export /g,'');
const weekly=source.slice(source.indexOf('    let planningPeople = []'),source.indexOf('    async function moveWeek(days)'));
const section=source.match(/<section id="viewWeekly"[\s\S]*?<\/section>/)[0].replace('view card hidden','view card');
const css=source.match(/<style>([\s\S]*?)<\/style>/)[1];
let dom;
const page={
 async setContent(html){dom=new JSDOM(html,{runScripts:'outside-only',url:'https://example.test'});dom.window.structuredClone=structuredClone;Object.defineProperty(dom.window,'crypto',{value:webcrypto});dom.window.confirm=()=>true;},
 async addScriptTag({content}){dom.window.eval(content)},
 async evaluate(fn){const result=await dom.window.eval('('+fn.toString()+')()');return structuredClone(result)},
 locator(selector){return {async count(){return dom.window.document.querySelectorAll(selector).length},async evaluate(fn){return structuredClone(fn(dom.window.document.querySelector(selector)))},async evaluateAll(fn){return fn([...dom.window.document.querySelectorAll(selector)])}}}
};
try{

 await page.setContent(`<style>${css}</style>${section}<input id="hoursWeekPicker"/>`);
 await page.addScriptTag({content:`(()=>{
 const $=id=>document.getElementById(id);const safe=v=>String(v??'').trim();
 let admin=true,staffCache=[],currentUser={uid:'owner'};const db={};
 const isAdmin=()=>admin; const messages=[];const showMsg=m=>messages.push(m);
 const htmlEscape=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const addDays=(date,n)=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
 const formatDayHeader=d=>d;const todayStr=()=> '2026-10-20';const weekKeyFrom=d=>{const n=new Date(d+'T12:00:00').getDay();return addDays(d,n===0?-6:1-n)};
 const records=new Map();const doc=(db,c,id)=>c+'/'+id;
 const snap=id=>({exists:()=>records.has(id),data:()=>structuredClone(records.get(id))});
 const getDoc=async id=>snap(id);const serverTimestamp=()=>1;
 const runTransaction=async(db,fn)=>{const writes=[];await fn({get:async id=>snap(id),set:(id,value,opts)=>writes.push([id,opts?.merge?{...records.get(id),...value}:value])});for(const [id,value]of writes)records.set(id,JSON.parse(JSON.stringify(value)));};
 const REVIEW_FIXTURE=${JSON.stringify(REVIEW_FIXTURE)};
 ${helpers}
 ${weekly}
 window.weeklyTest={loadWeekly,importWeeklyPhoto,showWeeklyReview,applyWeeklyReview,saveWeekly,linkWeeklyPerson,renderWeeklyTable,parsePhotoWords,provided:REVIEW_FIXTURE,records,messages,
 setAdmin:v=>{admin=v},setStaff:v=>{staffCache=v},state:()=>({planningPeople,weeklyPeople,weeklyDirty,weeklyLoadedStart}),personDays,
 edit:(name,dept,day,value)=>{const p=weeklyPeople.find(p=>p.name===name);const input=[...document.querySelectorAll('#weekBody input')].find(i=>i.dataset.row===p.id+'::'+dept&&i.dataset.day===String(day));input.value=value;input.dispatchEvent(new Event('input'));}};
 })();`});
 await page.evaluate(async()=>{
   document.getElementById('weekPicker').value='2026-10-19';await weeklyTest.loadWeekly();
   await weeklyTest.importWeeklyPhoto({name:'private-plan.json',type:'application/json',size:3000,text:async()=>JSON.stringify({format:'matteoteam-plan-v1',weekStart:'2026-10-19',rows:weeklyTest.provided})});
   document.getElementById('weeklyReviewed').checked=true;weeklyTest.applyWeeklyReview();
 });
 assert.match(await page.evaluate(()=>weeklyTest.messages.at(-1)),/Ungültige Schicht: 12/);
 assert.equal(await page.evaluate(()=>weeklyTest.state().planningPeople.length),0,'failed review must roll back roster');
 await page.locator('#weeklyReviewBody input[data-import-day]').evaluateAll(inputs=>inputs.forEach(i=>{if(i.value==='12')i.value='12-17'}));
 await page.evaluate(()=>weeklyTest.applyWeeklyReview());
 assert.equal(await page.evaluate(()=>weeklyTest.state().weeklyPeople.length),16);
 assert.equal(await page.locator('#weekBody input').count(),18*7);
 assert.equal(await page.evaluate(()=>weeklyTest.records.size),0,'review is not a database write');
 await page.evaluate(async()=>{weeklyTest.records.set('timeClock/real',{out:'23:30'});await weeklyTest.saveWeekly()});
 assert.equal(await page.evaluate(()=>Object.keys(weeklyTest.records.get('weeklyPlans/2026-10-19').entries).length),16);
 assert.deepEqual(await page.evaluate(()=>weeklyTest.records.get('timeClock/real')),{out:'23:30'});
 assert.equal(await page.evaluate(()=>weeklyTest.state().weeklyDirty),false);
 await page.evaluate(async()=>{
  weeklyTest.setStaff([{id:'uid-milot',name:'Milot Muzlijaj',department:'Kasse'}]);
  const p=weeklyTest.state().planningPeople.find(p=>p.name==='Alex');weeklyTest.linkWeeklyPerson(p.id,'uid-milot');await weeklyTest.saveWeekly();
 });
 assert.equal(await page.evaluate(()=>weeklyTest.state().weeklyPeople.filter(p=>p.accountId==='uid-milot').length),1);
 assert.equal(await page.evaluate(()=>weeklyTest.records.get('weeklyPlans/2026-10-19').entries['uid-milot'][6]),'12-17');
 assert.equal(await page.evaluate(()=>{
 const p=weeklyTest.state().planningPeople.find(p=>p.name==='Alex');return weeklyTest.personDays({[p.id]:{0:'9-18'}},'uid-milot',weeklyTest.state().planningPeople)[0];
 }),'9-18');
 // A sick-leave writer using canonical entries must override stale sector data.
 await page.evaluate(async()=>{const r=weeklyTest.records.get('weeklyPlans/2026-10-19');r.entries['uid-milot'][6]='Krank';await weeklyTest.loadWeekly()});
 assert.equal(await page.evaluate(()=>{
 const p=weeklyTest.state().weeklyPeople.find(p=>p.accountId==='uid-milot');return [...document.querySelectorAll('#weekBody input')].filter(i=>i.dataset.staff===p.id&&i.dataset.day==='6').map(i=>i.value).filter(Boolean).join('|');
 }),'Krank');
 // Concurrent updates fail without overwriting either plan.
 await page.evaluate(async()=>{
 weeklyTest.edit('Person1','Pizza',0,'10-19:30');const p=weeklyTest.state().weeklyPeople.find(p=>p.name==='Person1');weeklyTest.records.get('weeklyPlans/2026-10-19').entries[p.id][0]='Krank';await weeklyTest.saveWeekly();
 });
 assert.match(await page.evaluate(()=>weeklyTest.messages.at(-1)),/inzwischen geändert/);
 assert.equal(await page.evaluate(()=>weeklyTest.state().weeklyDirty),true);
 await page.evaluate(()=>{weeklyTest.setAdmin(false);weeklyTest.renderWeeklyTable()});
 assert.equal(await page.locator('#weekBody input:not([readonly])').count(),0);
 assert.equal(await page.locator('#weeklyTools').evaluate(e=>e.classList.contains('hidden')),true);
 await page.evaluate(()=>{weeklyTest.setAdmin(true);weeklyTest.renderWeeklyTable()});
 console.log('PASS: review rollback, 16 identities/18 sectors, atomic save, account linking/history, sick-leave override, concurrent edits, separate actuals, staff read-only.');
}finally{dom?.window.close()}
