'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const core=require('../backup.js');
const JSZip=require('../vendor/jszip.min.js');
const root=path.join(__dirname,'..');
const user={id:'11111111-1111-4111-8111-111111111111'};
const project='https://zdohjcvmhluhalwbrphn.supabase.co';
const initial=()=>({ubicaciones:[{id:'u1',nombre:'Casa',ubicacion_padre_id:null}],cajas:[],objetos:[{id:'o1',nombre:'Taladro',ubicacion_id:'u1',caja_id:null,categorias:[],foto_path:null}],categorias:[]});
function fakeIndexedDB(){
 const memory=new Map();
 return {open(){
  const request={};
  setTimeout(()=>{
   request.result={close(){},transaction(){
    const tx={objectStore(){
     const operation=(action,key,value)=>{
      const result={result:memory.get(key)};
      if(action==='put')memory.set(key,value);
      if(action==='delete')memory.delete(key);
      setTimeout(()=>tx.oncomplete?.(),0);return result;
     };
     return {get:key=>operation('get',key),put:(value,key)=>operation('put',key,value),delete:key=>operation('delete',key)};
    }};
    return tx;
   }};
   request.onsuccess?.();
  },0);return request;
 }};
}
async function waitFor(condition){
 const deadline=Date.now()+3000;
 while(!condition()){if(Date.now()>deadline)throw new Error('La interfaz no alcanzó el estado esperado');await new Promise(r=>setTimeout(r,5))}
}
function setup({missing=false}={}){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://example.com/',runScripts:'outside-only'}),w=dom.window;
 Object.defineProperty(w,'crypto',{value:globalThis.crypto});w.Blob=globalThis.Blob;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
 w.structuredClone=structuredClone;w.JSZip=JSZip;w.indexedDB=fakeIndexedDB();w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.HTMLAnchorElement.prototype.click=function(){};
 w.eval(fs.readFileSync(path.join(root,'backup.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'backup-ui.js'),'utf8'));
 let rows=initial(),commits=0,refreshes=0;
 const client={rpc:async(name,args)=>{
  if(name==='hondo_backup_snapshot')return {data:structuredClone(rows)};
  if(missing)return {error:{code:'PGRST202',message:'missing'}};
  if(args.dry_run)return {data:{ready:true}};
  commits++;rows=structuredClone(args.payload.tables);return {data:{restored:true}};
 }};
 const ui=w.HondoBackupUI.install({client,getUser:()=>user,project,onRestored:async()=>{refreshes++}});
 const $=id=>w.document.getElementById(id);
 return {dom,w,$,ui,client,commits:()=>commits,refreshes:()=>refreshes};
}
async function selectCopy(env){
 const result=await core.createArchive(env.client,{project,userId:user.id},{JSZip});
 Object.defineProperty(env.$('backupFile'),'files',{configurable:true,value:[new Blob([result.archive])]});
 env.$('backupFile').dispatchEvent(new env.w.Event('change'));
 await waitFor(()=>!env.ui.isBusy());
}
test('interfaz exige copia previa descargada, casilla y texto antes de sustituir datos',async()=>{
 const e=setup();
 try{
  e.$('backupOpen').click();await selectCopy(e);
  assert.match(e.$('backupStatus').textContent,/Copia comprobada/);assert.equal(e.$('backupRestore').disabled,true);assert.equal(e.commits(),0);
  e.$('backupBefore').click();await waitFor(()=>!e.ui.isBusy());
  assert.equal(e.$('backupConfirmControls').hidden,true);assert.equal(e.$('backupRestore').disabled,true);
  e.$('backupDownload').click();assert.equal(e.$('backupConfirmControls').hidden,false);
  e.$('backupConfirmSaved').checked=true;e.$('backupConfirmSaved').dispatchEvent(new e.w.Event('change'));
  assert.equal(e.$('backupRestore').disabled,true);
  e.$('backupConfirmText').value='RESTAURAR';e.$('backupConfirmText').dispatchEvent(new e.w.Event('input'));
  assert.equal(e.$('backupRestore').disabled,false);e.$('backupRestore').click();await waitFor(()=>!e.ui.isBusy());
  assert.equal(e.commits(),1);assert.equal(e.refreshes(),1);assert.match(e.$('backupStatus').textContent,/completada y comprobada/);
 }finally{e.dom.window.close()}
});
test('sin SQL muestra activación y permite comprobar el ZIP, pero bloquea restaurar',async()=>{
 const e=setup({missing:true});
 try{
  e.$('backupOpen').click();await selectCopy(e);
  assert.equal(e.$('backupSummary').hidden,false);assert.equal(e.$('backupSetup').hidden,false);
  assert.equal(e.$('backupBefore').disabled,true);assert.equal(e.$('backupRestore').disabled,true);assert.equal(e.commits(),0);
 }finally{e.dom.window.close()}
});
test('crear y descargar una copia nunca envía una restauración',async()=>{
 const e=setup();
 try{
  e.$('backupOpen').click();e.$('backupCreate').click();await waitFor(()=>!e.ui.isBusy());
  assert.equal(e.$('backupDownload').hidden,false);assert.match(e.$('backupStatus').textContent,/Copia preparada/);
  e.$('backupDownload').click();assert.equal(e.commits(),0);
 }finally{e.dom.window.close()}
});
