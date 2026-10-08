const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const values=new Map(),window={sessionStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},crypto:{randomUUID:()=> 'new-participant'}};
vm.runInNewContext(fs.readFileSync(require('path').join(__dirname,'../session-store.js'),'utf8'),{window});
const S=window.FestivalSession;assert.equal(S.id,'initial');assert(S.save('robot',{score:10},'initial'));assert(S.save('city',{day:4},'initial'));assert.equal(S.read('robot').score,10);
assert.equal(S.reset(),'new-participant');assert.equal(S.read('robot'),undefined);assert.equal(S.save('city',{day:12},'initial'),false,'An old frame cannot restore a previous participant');assert.equal(S.read('city'),undefined);
values.set('festival-session-v1','broken json');assert.equal(S.id,'initial');assert(S.save('robot',{score:0},'initial'));window.sessionStorage.setItem=()=>{throw Error('Storage blocked');};assert.equal(S.save('city',{day:1},'initial'),false,'Unavailable storage never prevents playing');
console.log('Session storage: independent frame checkpoints, reset, stale-frame rejection and unavailable storage passed');
