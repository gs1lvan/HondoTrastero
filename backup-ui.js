/* Interfaz de copias: todas las escrituras requieren confirmación explícita. */
'use strict';
window.HondoBackupUI={install({client,getUser,project,onRestored}){
 const api=window.HondoBackup,$=id=>document.getElementById(id),dialog=$('backupDialog');
 let busy=false,copy=null,expected=null,precopy=null,downloadUrl=null,ready=false,downloaded=false,activeUser=null;
 const context=()=>({project,userId:getUser()?.id});
 const status=(message,error=false)=>{const el=$('backupStatus');el.textContent=message;el.classList.toggle('text-danger',error)};
 const progress=(message,percent)=>{status(message);$('backupProgress').hidden=false;$('backupProgress').value=percent};
 function sessionGuard(userId){if(getUser()?.id!==userId)throw new Error('La sesión ha cambiado. Vuelve a abrir Copias de seguridad.')}
 function updateButtons(){
  $('backupClose').disabled=busy;
  $('backupCreate').disabled=busy;
  $('backupChoose').disabled=busy;
  $('backupBefore').disabled=busy||!copy||!ready;
  $('backupDownload').disabled=busy||!downloadUrl;
  $('backupConfirmSaved').disabled=busy||!downloaded;
  $('backupConfirmText').disabled=busy||!precopy;
  $('backupRestore').disabled=busy||!ready||!precopy||!downloaded||!$('backupConfirmSaved').checked||$('backupConfirmText').value.trim()!=='RESTAURAR';
  $('backupCheckRecovery').disabled=busy;
 }
 function reset(){
  copy=null;expected=null;precopy=null;ready=false;downloaded=false;
  if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=null;
  $('backupDownload').hidden=true;$('backupSummary').hidden=true;$('backupRestoreControls').hidden=true;
  $('backupConfirmControls').hidden=true;$('backupConfirmSaved').checked=false;$('backupConfirmText').value='';
  $('backupSetup').hidden=true;$('backupProgress').hidden=true;$('backupDismissRecovery').hidden=true;status('');updateButtons();
 }
 function showDialog(){
  if(!getUser())return;
  activeUser=getUser().id;reset();dialog.showModal();$('backupClose').focus();checkRecovery();
 }
 async function run(operation){
  if(busy)return;
  busy=true;updateButtons();const userId=activeUser;
  try{sessionGuard(userId);await operation(()=>sessionGuard(userId))}
  catch(error){status(error.message||'No se pudo completar la operación. Vuelve a intentarlo.',true);if(error.needsSetup)$('backupSetup').hidden=false}
  finally{busy=false;updateButtons()}
 }
 function offerDownload(result,prefix){
  if(downloadUrl)URL.revokeObjectURL(downloadUrl);
  downloadUrl=URL.createObjectURL(new Blob([result.archive],{type:'application/zip'}));
  $('backupDownload').hidden=false;
  $('backupDownload').textContent=prefix==='HondoTrastero_previa'?'Descargar copia previa':'Descargar copia completa';
  $('backupDownload').dataset.filename=prefix+'_'+result.manifest.createdAt.replace(/[:.]/g,'-')+'.zip';
 }
 function summary(current){
  const wanted=copy.manifest.counts,now=api.counts(current),body=$('backupSummaryBody');body.replaceChildren();
  for(const [key,label] of [['objetos','Objetos'],['ubicaciones','Espacios'],['cajas','Subespacios'],['fotos','Fotografías'],['categorias','Categorías']]){
   const row=document.createElement('tr');
   for(const text of [label,now[key],wanted[key]]){const cell=document.createElement('td');cell.textContent=text;row.append(cell)}
   body.append(row);
  }
  $('backupCopyDate').textContent='Copia del '+new Date(copy.manifest.createdAt).toLocaleString('es-ES');
  $('backupSummary').hidden=false;
 }
 $('backupOpen').addEventListener('click',showDialog);
 $('backupClose').addEventListener('click',()=>{if(!busy)dialog.close()});
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()});
 window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue=''}});
 $('backupCreate').addEventListener('click',()=>run(async guard=>{
  reset();
  const result=await api.createArchive(client,context(),{JSZip:window.JSZip,storage:localStorage,onProgress:progress,assertSession:guard});
  offerDownload(result,'HondoTrastero');
  status('Copia preparada: '+result.manifest.counts.objetos+' objetos y '+result.manifest.counts.fotos+' fotografías. Descarga el ZIP y guárdalo.');
 }));
 $('backupDownload').addEventListener('click',()=>{
  if(busy||!downloadUrl)return;
  const link=document.createElement('a');link.href=downloadUrl;link.download=$('backupDownload').dataset.filename;document.body.append(link);link.click();link.remove();
  if(precopy){downloaded=true;$('backupConfirmControls').hidden=false}
  else try{localStorage.setItem('hondotrastero:ultima-copia:'+activeUser,new Date().toISOString())}catch{}
  updateButtons();
 });
 $('backupChoose').addEventListener('click',()=>{$('backupFile').value='';$('backupFile').click()});
 $('backupFile').addEventListener('change',()=>{
  const file=$('backupFile').files[0];if(!file)return;
  run(async guard=>{
   reset();
   copy=await api.readArchive(file,context(),{JSZip:window.JSZip,onProgress:progress});guard();
   expected=await api.readSnapshot(client);guard();summary(expected);
   $('backupRestoreControls').hidden=false;
   await api.restorePreflight(client,context(),copy,expected);guard();ready=true;
   status('Copia comprobada. Prepara y descarga una copia del estado actual para continuar.');
  });
 });
 $('backupBefore').addEventListener('click',()=>run(async guard=>{
  precopy=null;downloaded=false;$('backupConfirmSaved').checked=false;$('backupConfirmControls').hidden=true;
  if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=null;$('backupDownload').hidden=true;
  expected=await api.readSnapshot(client);summary(expected);
  await api.restorePreflight(client,context(),copy,expected);
  const result=await api.createArchive(client,context(),{JSZip:window.JSZip,storage:localStorage,onProgress:progress,assertSession:guard,snapshot:expected});
  guard();precopy=result;offerDownload(result,'HondoTrastero_previa');
  status('Copia previa preparada. Descárgala y confirma que la has guardado antes de restaurar.');
 }));
 $('backupConfirmSaved').addEventListener('change',updateButtons);
 $('backupConfirmText').addEventListener('input',updateButtons);
 $('backupRestore').addEventListener('click',()=>{
  if($('backupRestore').disabled)return;
  run(async guard=>{
   if(await journal('get'))throw new Error('Hay una restauración pendiente de comprobar. Comprueba su resultado primero.');
   guard();
   await api.restoreArchive(client,context(),copy,expected,{onProgress:progress,assertSession:guard,onPrepared:async tables=>{
    guard();await journal('put',{tables,expected,preferences:copy.preferences,startedAt:new Date().toISOString()});
   }});
   guard();await journal('delete');
   let prefsWarning='';
   try{api.applyPreferences(localStorage,activeUser,copy.preferences)}catch{prefsWarning=' No se pudieron recuperar algunas preferencias de este dispositivo.'}
   $('backupConfirmControls').hidden=true;precopy=null;ready=false;
   status('Restauración completada y comprobada.'+prefsWarning+' Puedes cerrar esta ventana y consultar el inventario.');
   try{await onRestored()}catch{status('Restauración completada. Recarga la página para actualizar la vista.')}
  });
 });
 async function journal(action,value){
  const key=project+':'+activeUser;
  return new Promise((resolve,reject)=>{
   const request=indexedDB.open('hondotrastero-copias',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('restauracion');
   request.onerror=()=>reject(new Error('No se pudo preparar la recuperación en este dispositivo. Comprueba que el navegador permite almacenamiento.'));
   request.onsuccess=()=>{
    const db=request.result,tx=db.transaction('restauracion',action==='get'?'readonly':'readwrite'),store=tx.objectStore('restauracion');
    let operation;
    if(action==='get')operation=store.get(key);
    if(action==='put')operation=store.put(value,key);
    if(action==='delete')operation=store.delete(key);
    tx.oncomplete=()=>{db.close();resolve(operation.result)};
    tx.onerror=tx.onabort=()=>{db.close();reject(new Error('No se pudo guardar la información de recuperación.'))};
   };
  });
 }
 async function checkRecovery(){
  try{
   const pending=await journal('get');
   $('backupRecovery').hidden=!pending;
   $('backupRecoveryText').textContent=pending?'Hay una restauración pendiente de comprobar. Comprueba si el servidor llegó a completarla.':'';
   if(pending){ready=false;$('backupBefore').disabled=true;$('backupRestore').disabled=true}
  }catch(error){status(error.message,true)}
 }
 $('backupCheckRecovery').addEventListener('click',()=>run(async guard=>{
  const pending=await journal('get');if(!pending){$('backupRecovery').hidden=true;return}
  const actual=await api.readSnapshot(client);guard();
  if(api.matchesRestored(actual,pending.tables)){
   try{api.applyPreferences(localStorage,activeUser,pending.preferences)}catch{}
   await journal('delete');$('backupRecovery').hidden=true;status('La restauración se había completado. El inventario está comprobado.');await onRestored();
  }else if(api.same(actual,pending.expected)){
   await journal('delete');$('backupRecovery').hidden=true;status('El inventario conserva el estado anterior. Puedes seleccionar la copia y reintentar.');
  }else{
   status('El inventario ha cambiado desde el intento. Revísalo y, si necesitas volver atrás, utiliza la copia previa que descargaste.',true);
   $('backupDismissRecovery').hidden=false;
  }
 }));
 $('backupDismissRecovery').addEventListener('click',()=>run(async()=>{
  await journal('delete');$('backupRecovery').hidden=true;$('backupDismissRecovery').hidden=true;
  status('Comprobación cerrada. Selecciona una copia para empezar una nueva restauración.');
 }));
 return {isBusy:()=>busy,async sessionChanged(){
  if(dialog.open&&!busy&&activeUser!==getUser()?.id){dialog.close();reset()}
  if(!getUser())return;
  if(busy)return;
  activeUser=getUser().id;
  try{if(await journal('get')){$('backupOpen').textContent='Copias de seguridad · comprobar restauración'}}catch{}
 }};
}};
