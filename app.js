(() => {
'use strict';
const $ = id => document.getElementById(id);
const config = window.HONDO_CONFIG || {};
const ready = !!(config.supabaseUrl && config.supabaseAnonKey);
const client = ready ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const data = {objetos: [], cajas: [], ubicaciones: []};
const names = {objetos:'objeto', cajas:'caja', ubicaciones:'espacio'};
const BUCKET = 'objetos';
let tab='objetos', editing=null, user=null, selectedPhoto=null, photoPreviewUrl=null;

function show(id,visible){$(id).classList.toggle('d-none',!visible)}
function clearMsg(){show('notice',false)}
function alertMsg(message,kind='danger'){
 const el=$('notice');el.textContent=message;el.className=`alert alert-${kind}`;el.scrollIntoView({block:'nearest'});
}
function elem(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
const page={
 show(){show('appView',false);show('editPage',true);window.scrollTo(0,0)},
 hide(){show('editPage',false);if(user)show('appView',true);window.scrollTo(0,0)}
};
document.querySelectorAll('[data-close-form]').forEach(b=>b.addEventListener('click',()=>page.hide()));

function selectField(id,label,items,optional=false,selected=''){
 const wrap=elem('div'),lab=elem('label','form-label',label),sel=elem('select','form-select');
 lab.htmlFor=id;sel.id=id;sel.required=!optional;
 const empty=elem('option','',optional?'Ninguno':'Selecciona una opción');empty.value='';sel.append(empty);
 for(const item of items){const opt=elem('option','',item.nombre);opt.value=item.id;sel.append(opt)}
 sel.value=selected||'';wrap.append(lab,sel);return wrap;
}
function inputField(id,label,value='',type='text',required=true){
 const wrap=elem('div'),lab=elem('label','form-label',label),input=elem('input','form-control');
 lab.htmlFor=id;input.id=id;input.type=type;input.value=value??'';input.required=required;
 if(type==='number')input.min='1';wrap.append(lab,input);return wrap;
}
function locationLabel(id){return data.ubicaciones.find(x=>x.id===id)?.nombre||'Sin espacio'}
function boxLabel(id){return data.cajas.find(x=>x.id===id)?.nombre||'Sin caja'}
function lastLocationKey(){return `hondotrastero:last-location:${user.id}`}
function objectSpace(item){
 if(item.ubicacion_id)return item.ubicacion_id;
 return data.cajas.find(box=>box.id===item.caja_id)?.ubicacion_id||'';
}
async function signedPhoto(path){
 const {data:result,error}=await client.storage.from(BUCKET).createSignedUrl(path,3600);
 if(error)throw error;return result.signedUrl;
}
function photoField(item){
 const wrap=elem('div','photo-field'),lab=elem('label','form-label fw-semibold','Fotografía (opcional)');
 const preview=elem('img','photo-preview d-none');preview.id='photoPreview';preview.alt='Vista previa de la fotografía';
 const buttons=elem('div','d-flex flex-wrap gap-2');
 const cameraButton=elem('button','btn btn-outline-primary flex-grow-1','📷 Hacer foto');cameraButton.type='button';
 const attachButton=elem('button','btn btn-outline-primary flex-grow-1','🖼️ Adjuntar foto');attachButton.type='button';
 const cameraInput=elem('input','visually-hidden');cameraInput.type='file';cameraInput.id='fieldCamera';cameraInput.accept='image/*';cameraInput.setAttribute('capture','environment');
 const galleryInput=elem('input','visually-hidden');galleryInput.type='file';galleryInput.id='fieldPhoto';galleryInput.accept='image/*';
 function choosePhoto(input){
  const file=input.files?.[0];if(!file)return;
  if(!file.type.startsWith('image/')){alertMsg('Selecciona un archivo de imagen.');return}
  selectedPhoto=file;
  if(photoPreviewUrl){URL.revokeObjectURL(photoPreviewUrl);photoPreviewUrl=null}
  photoPreviewUrl=URL.createObjectURL(file);preview.src=photoPreviewUrl;preview.classList.remove('d-none');
 }
 cameraButton.addEventListener('click',()=>{cameraInput.value='';cameraInput.click()});
 attachButton.addEventListener('click',()=>{galleryInput.value='';galleryInput.click()});
 cameraInput.addEventListener('change',()=>choosePhoto(cameraInput));
 galleryInput.addEventListener('change',()=>choosePhoto(galleryInput));
 buttons.append(cameraButton,attachButton);
 const help=elem('div','form-text','Puedes tomar una foto ahora o elegir una existente. Se comprimirá antes de subirla.');
 wrap.append(lab,preview,buttons,cameraInput,galleryInput,help);
 if(item?.foto_path)signedPhoto(item.foto_path).then(url=>{
  if(!selectedPhoto){preview.src=url;preview.classList.remove('d-none')}
 }).catch(()=>{});
 return wrap;
}
async function compressPhoto(file){
 const bitmap=await createImageBitmap(file),ratio=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
 canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
 let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.75));
 if(!blob||blob.type!=='image/webp')blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.72));
 if(!blob)throw new Error('No se pudo procesar la fotografía');
 if(blob.size>2*1024*1024)throw new Error('La fotografía comprimida supera los 2 MB');
 return {blob,extension:blob.type==='image/webp'?'webp':'jpg'};
}
async function uploadPhoto(file){
 const {blob,extension}=await compressPhoto(file),path=`${user.id}/${crypto.randomUUID()}.${extension}`;
 const {error}=await client.storage.from(BUCKET).upload(path,blob,{contentType:blob.type,upsert:false});
 if(error)throw error;return path;
}
function openForm(type=tab,item=null){
 clearMsg();editing={type,id:item?.id||null};selectedPhoto=null;
 if(photoPreviewUrl){URL.revokeObjectURL(photoPreviewUrl);photoPreviewUrl=null}
 const root=$('modalFields');root.replaceChildren();
 if(type==='objetos')root.append(photoField(item));
 $('modalTitle').textContent=(item?'Editar ':'Añadir ')+names[type];
 root.append(inputField('fieldName','Nombre',item?.nombre));
 root.append(inputField('fieldDesc','Descripción (opcional)',item?.descripcion||'','text',false));
 if(type==='ubicaciones')root.append(selectField('fieldParent','Espacio superior (opcional)',data.ubicaciones.filter(x=>x.id!==item?.id),true,item?.ubicacion_padre_id));
 if(type==='cajas')root.append(selectField('fieldLocation','Espacio',data.ubicaciones,false,item?.ubicacion_id||localStorage.getItem(lastLocationKey())));
 if(type==='objetos'){
  root.append(inputField('fieldQty','Cantidad',item?.cantidad??1,'number'));
  const categoryField=inputField('fieldCategory','Categoría (opcional)',item?.categoria||'','text',false);
  const categoryInput=categoryField.querySelector('input');categoryInput.setAttribute('list','categorySuggestions');
  const suggestions=elem('datalist');suggestions.id='categorySuggestions';
  [...new Set(data.objetos.map(o=>(o.categoria||'').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'es')).forEach(name=>{const opt=elem('option');opt.value=name;suggestions.append(opt)});
  categoryField.append(suggestions);root.append(categoryField);
  const wrap=elem('div');
  wrap.append(selectField('fieldLocation','Espacio (si no está en caja)',data.ubicaciones,true,item?.ubicacion_id||(!item?.caja_id?localStorage.getItem(lastLocationKey()):'')));
  wrap.append(selectField('fieldBox','Caja (opcional)',data.cajas,true,item?.caja_id));root.append(wrap);
  const loc=$('fieldLocation'),box=$('fieldBox');
  loc.addEventListener('change',()=>{if(loc.value)box.value=''});
  box.addEventListener('change',()=>{if(box.value)loc.value=''});
 }
 page.show();
}
async function load(){
 const tables=Object.keys(data);
 const results=await Promise.all(tables.map(t=>client.from(t).select('*').order('creado_en',{ascending:false})));
 for(let i=0;i<results.length;i++){
  if(results[i].error)throw results[i].error;
  data[tables[i]]=results[i].data||[];
 }
 render();
}
function refreshInventoryFilters(){
 show('inventoryFilters',tab==='objetos');
 const space=$('filterSpace'),category=$('filterCategory');
 const oldSpace=space.value,oldCategory=category.value;
 space.replaceChildren(new Option('Todos los espacios',''));
 for(const item of [...data.ubicaciones].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'))){space.add(new Option(item.nombre,item.id))}
 space.value=[...space.options].some(o=>o.value===oldSpace)?oldSpace:'';
 category.replaceChildren(new Option('Todas las categorías',''));
 const available=[...new Set(data.objetos.map(item=>(item.categoria||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
 for(const name of available)category.add(new Option(name,name));
 if(data.objetos.some(item=>!item.categoria?.trim()))category.add(new Option('Sin categoría','__sin_categoria__'));
 category.value=[...category.options].some(o=>o.value===oldCategory)?oldCategory:'';
}
function render(){
 refreshInventoryFilters();
 $('countObjects').textContent=data.objetos.length;
 $('countBoxes').textContent=data.cajas.length;
 $('countLocations').textContent=data.ubicaciones.length;
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 const heading=$('sectionTitle');heading.textContent=tab==='objetos'?'📦 Inventario':tab==='cajas'?'▤ Cajas':'▥ Espacios';
 const q=$('search').value.trim().toLocaleLowerCase('es');
 const selectedSpace=$('filterSpace').value,selectedCategory=$('filterCategory').value;
 const rows=data[tab].filter(item=>{
  if(!`${item.nombre} ${item.descripcion||''}`.toLocaleLowerCase('es').includes(q))return false;
  if(tab!=='objetos')return true;
  if(selectedSpace&&objectSpace(item)!==selectedSpace)return false;
  const cat=(item.categoria||'').trim();
  if(selectedCategory&&(selectedCategory==='__sin_categoria__'?!!cat:cat!==selectedCategory))return false;
  return true;
 });
 const root=$('records');root.replaceChildren();show('empty',rows.length===0);
 for(const item of rows){
  const line=elem('div','list-group-item record');
  if(tab==='objetos'&&item.foto_path){
   const img=elem('img','record-photo');img.alt='Foto de '+item.nombre;img.loading='lazy';
   signedPhoto(item.foto_path).then(url=>{img.src=url}).catch(()=>img.remove());line.append(img);
  }
  const main=elem('div','record-main');main.append(elem('div','record-title',item.nombre));
  let detail=item.descripcion||'';
  if(tab==='objetos')detail=[`×${item.cantidad}`,item.categoria?.trim()||'',item.caja_id?`▣ Caja: ${boxLabel(item.caja_id)}`:`▤ Espacio: ${locationLabel(item.ubicacion_id)}`,detail].filter(Boolean).join(' · ');
  if(tab==='cajas')detail=[locationLabel(item.ubicacion_id),detail].filter(Boolean).join(' · ');
  if(tab==='ubicaciones'&&item.ubicacion_padre_id)detail=[`Dentro de ${locationLabel(item.ubicacion_padre_id)}`,detail].filter(Boolean).join(' · ');
  if(detail)main.append(elem('div','record-detail',detail));
  const actions=elem('div','record-actions');
  const edit=elem('button','btn btn-sm btn-outline-primary','Editar');edit.type='button';edit.addEventListener('click',()=>openForm(tab,item));
  const del=elem('button','btn btn-sm btn-outline-danger','Eliminar');del.type='button';del.addEventListener('click',()=>removeItem(tab,item));
  actions.append(edit,del);line.append(main,actions);root.append(line);
 }
}
async function removeItem(type,item){
 if(!confirm(`¿Eliminar ${names[type]} «${item.nombre}»?`))return;
 const {error}=await client.from(type).delete().eq('id',item.id);
 if(error){alertMsg(`No se pudo eliminar: ${error.message}`);return}
 if(type==='objetos'&&item.foto_path){
  const result=await client.storage.from(BUCKET).remove([item.foto_path]);
  if(result.error)alertMsg('Objeto eliminado, pero no se pudo borrar su fotografía: '+result.error.message,'warning');
 }
 try{await load()}catch(e){alertMsg(e.message)}
}
$('editForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!editing)return;
 const {type,id}=editing,name=$('fieldName').value.trim();
 if(!name){alertMsg('El nombre es obligatorio');return}
 const payload={nombre:name,descripcion:$('fieldDesc').value.trim()||null};
 if(type==='ubicaciones')payload.ubicacion_padre_id=$('fieldParent').value||null;
 if(type==='cajas')payload.ubicacion_id=$('fieldLocation').value||null;
 if(type==='objetos'){
  payload.cantidad=Number($('fieldQty').value);
  payload.ubicacion_id=$('fieldLocation').value||null;
  payload.caja_id=$('fieldBox').value||null;
  const category=$('fieldCategory').value.trim();
  if(category||data.objetos.some(x=>Object.prototype.hasOwnProperty.call(x,'categoria')))payload.categoria=category||null;
  if(Boolean(payload.ubicacion_id)===Boolean(payload.caja_id)){
   alertMsg('Selecciona un espacio o una caja, pero no ambas.');return;
  }
 }
 if(type==='cajas'&&!payload.ubicacion_id){alertMsg('Selecciona un espacio.');return}
 $('saveBtn').disabled=true;let newPhotoPath=null;
 try{
  if(type==='objetos'&&selectedPhoto){newPhotoPath=await uploadPhoto(selectedPhoto);payload.foto_path=newPhotoPath}
  const query=id?client.from(type).update(payload).eq('id',id):client.from(type).insert(payload);
  const {error}=await query;if(error)throw error;
  if(type==='objetos'&&newPhotoPath&&id){
   const previous=data.objetos.find(x=>x.id===id)?.foto_path;
   if(previous&&previous!==newPhotoPath){
    const removal=await client.storage.from(BUCKET).remove([previous]);
    if(removal.error)console.warn('No se pudo borrar la fotografía anterior',removal.error);
   }
  }
 }catch(err){
  if(newPhotoPath)await client.storage.from(BUCKET).remove([newPhotoPath]);
  $('saveBtn').disabled=false;
  alertMsg(err.message?.includes('categoria')?'Para guardar categorías, aplica primero migracion_categorias.sql en Supabase.':'No se pudo guardar: '+err.message);
  return;
 }
 $('saveBtn').disabled=false;
 if(payload.ubicacion_id)localStorage.setItem(lastLocationKey(),payload.ubicacion_id);
 if(type==='objetos'&&payload.caja_id){
  const box=data.cajas.find(x=>x.id===payload.caja_id);
  if(box)localStorage.setItem(lastLocationKey(),box.ubicacion_id);
 }
 page.hide();
 try{await load();clearMsg()}catch(err){alertMsg(err.message)}
});
document.querySelector('.parcel-nav').addEventListener('click',e=>{
 const b=e.target.closest('[data-tab]');if(!b)return;
 tab=b.dataset.tab;$('search').value='';render();
});
$('searchTab').addEventListener('click',()=>{$('search').focus();$('search').scrollIntoView({behavior:'smooth',block:'center'})});
$('search').addEventListener('input',render);
$('filterSpace').addEventListener('change',render);
$('filterCategory').addEventListener('change',render);
$('clearFilters').addEventListener('click',()=>{$('search').value='';$('filterSpace').value='';$('filterCategory').value='';render()});
$('addCurrent').addEventListener('click',()=>openForm());
$('newItem').addEventListener('click',()=>openForm('objetos'));
$('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();clearMsg();
 const btn=e.target.querySelector('button');btn.disabled=true;
 const {error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
 btn.disabled=false;
 if(error)alertMsg('No se pudo iniciar sesión. Comprueba el correo y la contraseña.');
 $('password').value='';
});
$('logout').addEventListener('click',async()=>{
 if(!confirm('¿Quieres cerrar sesión?'))return;
 const {error}=await client.auth.signOut();if(error)alertMsg(error.message);
});
async function sessionChanged(session){
 user=session?.user||null;
 show('account',!!user);$('account').style.display=user?'flex':'none';
 show('appView',!!user&&$('editPage').classList.contains('d-none'));
 show('loginView',!user&&ready);
 if(!user){$('userEmail').textContent='';return}
 $('userEmail').textContent=user.email||'';
 try{await load();clearMsg()}catch(e){alertMsg(`Error al cargar el inventario: ${e.message}`)}
}
if(!ready){show('setup',true);return}
client.auth.onAuthStateChange((event,session)=>{setTimeout(()=>sessionChanged(session),0)});
client.auth.getSession().then(({data:{session}})=>sessionChanged(session)).catch(e=>alertMsg(e.message));
})();
