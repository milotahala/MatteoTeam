import {REVIEW_FIXTURE} from './plan-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {expandStart,shiftTotals,shiftIntervals,combineSectorDays,personDays,parsePhotoWords} from '../weekly-plan.mjs';

test('night ends follow shift start weekday, including Sunday and minute extensions',()=>{
 for(const start of ['18','19']){
  assert.equal(expandStart(start,3),`${start}-04`);
  assert.equal(expandStart(start,4),`${start}-06`);
  assert.equal(expandStart(start,5),`${start}-06`);
  assert.equal(expandStart(start,6),`${start}-04`);
 }
 assert.equal(shiftTotals('19-04').total,8.5);
 assert.equal(shiftTotals('19-06').total,10.5);
 assert.equal(shiftTotals('14-23:30').total-shiftTotals('14-22').total,1.5);
 assert.equal(shiftTotals('9-19:30').total,10);
 assert.equal(shiftTotals('0900-1930').total,10);
});
test('ambiguous noon must be reviewed, malformed times cannot save',()=>{
 assert.equal(expandStart('12',0),'12');
 for(const value of ['12','25-06','9:75-18','12-12']) assert.throws(()=>shiftIntervals(value));
 assert.equal(shiftTotals('12-17').total,4.5);
 assert.equal(shiftTotals('12-22').total,9.5);
 assert.equal(shiftTotals('Frei').total,0);
});
test('multi-sector identities count once and conflicts require a correction',()=>{
 assert.equal(combineSectorDays(['Frei','14-22']),'14-22');
 assert.equal(combineSectorDays(['9-12','12-17']),'9-12 / 12-17');
 assert.equal(shiftTotals('9-12 / 12-17').total,7.5);
 assert.throws(()=>combineSectorDays(['11-19','12-17']));
 assert.throws(()=>combineSectorDays(['U','14-22']));
 assert.equal(personDays({old:{0:'14-22'},uid:{0:'Krank'}},'uid',[{id:'old',accountId:'uid'}])[0],'Krank');
 assert.equal(personDays({older:{0:'14-22'}},'uid',[{id:'old',accountId:'uid',aliases:['older']}])[0],'14-22');
 assert.equal(personDays({old:{0:'14-22'}},'uid',[{id:'old',accountId:'uid'}])[0],'14-22');
 assert.equal(personDays({old:{0:'14-22'},uid:{0:'14-22'}},'uid',[{id:'old',accountId:'uid'}])[0],'14-22');
});
test('positioned OCR retains blank cells and right-aligned numeric cells',()=>{
 const w=(text,x,y,width=40)=>({text,bbox:{x0:x,y0:y,x1:x+width,y1:y+15}});
 const words=[w('Pizza',0,0),...Array.from({length:7},(_,i)=>w(`Mo.${19+i}.10`,200+i*100,0,60)),w('Alex',0,30),w('Frei',200,30),w('18',475,30,15),w('12',875,30,15),w('Küche',0,60),w('Sam',0,90),w('14',675,90,15)];
 const parsed=parsePhotoWords(words);
 assert.deepEqual(parsed.rows[0].days,['Frei','','18','','','','12']);
 assert.equal(parsed.rows[1].department,'Küche');
 assert.deepEqual(parsed.dates,['19.10','20.10','21.10','22.10','23.10','24.10','25.10']);
 assert.throws(()=>parsePhotoWords([]));
});
test('synthetic review fixture has 18 sector rows and 16 distinct people; Alex/Sam are shared',()=>{
 assert.equal(REVIEW_FIXTURE.length,18);
 assert.equal(new Set(REVIEW_FIXTURE.map(r=>r.name)).size,16);
 assert.deepEqual(REVIEW_FIXTURE.filter(r=>r.name==='Alex').map(r=>r.department),['Pizza','Kasse']);
 assert.deepEqual(REVIEW_FIXTURE.filter(r=>r.name==='Sam').map(r=>r.department),['Service','Küche']);
});
