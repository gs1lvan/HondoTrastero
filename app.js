(() => {
'use strict';
const $ = id => document.getElementById(id);
const config = window.HONDO_CONFIG || {};
const ready = !!(config.supabaseUrl && config.supabaseAnonKey);
const client = ready ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const data = {objetos: [], cajas: [], ubicaciones: []};
let inventoryQuickMode=false;
let closeQuickCamera=null;
const names = {objetos:'objeto', cajas:'subespacio', ubicaciones:'espacio'};
const BUCKET = 'objetos';
const DEFAULT_CATEGORIES = Object.freeze([
 {"id": "herramientas-bricolaje", "icon": "🔧", "name": "Herramientas y bricolaje"},
 {"id": "ferreteria-repuestos", "icon": "🔩", "name": "Ferretería y repuestos"},
 {"id": "electricidad-iluminacion", "icon": "💡", "name": "Electricidad e iluminación"},
 {"id": "informatica-electronica", "icon": "💻", "name": "Informática y electrónica"},
 {"id": "fotografia-video-sonido", "icon": "📷", "name": "Fotografía, vídeo y sonido"},
 {"id": "electrodomesticos", "icon": "🔌", "name": "Electrodomésticos"},
 {"id": "cocina-menaje", "icon": "🍽️", "name": "Cocina y menaje"},
 {"id": "muebles-hogar", "icon": "🪑", "name": "Muebles y equipamiento del hogar"},
 {"id": "decoracion", "icon": "🖼️", "name": "Decoración"},
 {"id": "navidad-celebraciones", "icon": "🎄", "name": "Navidad y celebraciones"},
 {"id": "ropa-calzado", "icon": "👕", "name": "Ropa y calzado"},
 {"id": "textiles-hogar", "icon": "🛏️", "name": "Textiles del hogar"},
 {"id": "deporte-ejercicio", "icon": "🏋️", "name": "Deporte y ejercicio"},
 {"id": "playa-piscina-camping", "icon": "🏖️", "name": "Playa, piscina y camping"},
 {"id": "viajes-equipaje", "icon": "🧳", "name": "Viajes y equipaje"},
 {"id": "jardineria-exterior", "icon": "🌱", "name": "Jardinería y exterior"},
 {"id": "vehiculos-accesorios", "icon": "🚗", "name": "Vehículos y accesorios"},
 {"id": "juegos-juguetes-ocio", "icon": "🎮", "name": "Juegos, juguetes y ocio"},
 {"id": "libros-publicaciones", "icon": "📚", "name": "Libros y publicaciones"},
 {"id": "documentos-papeleria", "icon": "📁", "name": "Documentos y papelería"},
 {"id": "arte-manualidades-modelismo", "icon": "🎨", "name": "Arte, manualidades y modelismo"},
 {"id": "limpieza-mantenimiento", "icon": "🧹", "name": "Limpieza y mantenimiento"},
 {"id": "mascotas", "icon": "🐕", "name": "Mascotas"},
 {"id": "recuerdos-colecciones", "icon": "🏺", "name": "Recuerdos y colecciones"}
]);
const CATEGORY_ICONS = new Map([
 ['herramientas-bricolaje','Hammer'],
 ['ferreteria-repuestos','Nut'],
 ['electricidad-iluminacion','Lightbulb'],
 ['informatica-electronica','Laptop'],
 ['fotografia-video-sonido','Camera'],
 ['electrodomesticos','Plug'],
 ['cocina-menaje','Utensils'],
 ['muebles-hogar','Armchair'],
 ['decoracion','Image'],
 ['navidad-celebraciones','TreePine'],
 ['ropa-calzado','Shirt'],
 ['textiles-hogar','BedDouble'],
 ['deporte-ejercicio','Dumbbell'],
 ['playa-piscina-camping','Tent'],
 ['viajes-equipaje','Luggage'],
 ['jardineria-exterior','Sprout'],
 ['vehiculos-accesorios','Car'],
 ['juegos-juguetes-ocio','Gamepad2'],
 ['libros-publicaciones','LibraryBig'],
 ['documentos-papeleria','Folder'],
 ['arte-manualidades-modelismo','Palette'],
 ['limpieza-mantenimiento','Brush'],
 ['mascotas','PawPrint'],
 ['recuerdos-colecciones','Trophy'],
 ['','Box'],
 ['__sin_categoria__','Tag']
]);
let CATEGORIES = [...DEFAULT_CATEGORIES];
let CATEGORIES_BY_ID = new Map(CATEGORIES.map(cat=>[cat.id,cat]));
let categoryCatalogReady=false;
let categoryCatalogError='';
let categoryEditingId=null;
let categoryEditDraft='';
let categoryBusy=false;
let categoryChannel=null;
let categoryRefreshPending=false;
function setCategoryCatalog(rows){
 CATEGORIES=rows.map(row=>({id:row.id,name:row.nombre,icon:row.icono||''})).sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));
 CATEGORIES_BY_ID=new Map(CATEGORIES.map(cat=>[cat.id,cat]));
 if(selectedCategoryFilter&&!CATEGORIES_BY_ID.has(selectedCategoryFilter))selectedCategoryFilter='';
}
async function loadCategoryCatalog(){
 const {data:rows,error}=await client.from('categorias').select('id,nombre,icono').order('nombre');
 categoryCatalogReady=!error;
 categoryCatalogError=error?(error.code==='42P01'||error.code==='PGRST205'
  ? 'Para activar la gestión, ejecuta una vez 02_catalogo_categorias.sql en Supabase.'
  : 'No se pudo cargar el catálogo de categorías. Vuelve a intentarlo.'):'';
 if(!error)setCategoryCatalog(rows||[]);
}
function categoryMessage(text,error=false){
 const status=$('categoryAdminStatus');status.textContent=text;status.classList.toggle('text-danger',error);
}
function cancelCategoryEdit(focusId=null){
 categoryEditingId=null;categoryEditDraft='';categoryMessage('');renderCategoryAdmin();
 if(focusId)document.getElementById('categoryEdit-'+focusId)?.focus({preventScroll:true});
}
function renderCategoryAdmin(){
 $('categoryName').disabled=!categoryCatalogReady||categoryBusy;
 $('categorySave').disabled=!categoryCatalogReady||categoryBusy;
 $('categorySetupLink').hidden=categoryCatalogReady;
 if(categoryCatalogError)categoryMessage(categoryCatalogError,true);
 if(categoryEditingId&&!CATEGORIES_BY_ID.has(categoryEditingId)){categoryEditingId=null;categoryEditDraft=''}
 const list=$('categoryAdminList');list.replaceChildren();
 if(!CATEGORIES.length)list.append(elem('p','','Todavía no hay categorías.'));
 for(const cat of CATEGORIES){
  const row=elem('div','category-admin-row');
  if(cat.id===categoryEditingId){
   const form=elem('form','category-inline-form');
   const input=elem('input','form-control category-inline-input');input.type='text';input.maxLength=80;input.required=true;
   input.id='categoryInlineName';input.value=categoryEditDraft;input.setAttribute('aria-label','Nombre de la categoría');
   input.disabled=categoryBusy||!categoryCatalogReady;
   input.addEventListener('input',()=>{categoryEditDraft=input.value});
   input.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();cancelCategoryEdit(cat.id)}});
   const save=elem('button','btn btn-primary category-inline-save','✓');save.type='submit';save.title='Guardar nombre';save.setAttribute('aria-label','Guardar nombre de la categoría');
   const cancel=elem('button','btn btn-outline-primary category-inline-cancel','↶');cancel.type='button';cancel.title='Cancelar edición';cancel.setAttribute('aria-label','Cancelar edición');
   save.disabled=cancel.disabled=categoryBusy||!categoryCatalogReady;
   cancel.addEventListener('click',()=>cancelCategoryEdit(cat.id));
   form.addEventListener('submit',event=>saveCategory(event,cat.id));form.append(input,save,cancel);row.append(form);
  }else{
   const name=elem('button','category-admin-name');name.type='button';
   const icon=categoryIcon(cat.id,cat.icon);icon.setAttribute('aria-hidden','true');name.append(icon,' '+cat.name);
   name.id='categoryEdit-'+cat.id;name.title=cat.name;name.setAttribute('aria-label','Editar categoría: '+cat.name);
   name.disabled=!categoryCatalogReady||categoryBusy;
   name.addEventListener('click',()=>{
    categoryEditingId=cat.id;categoryEditDraft=cat.name;categoryMessage('');renderCategoryAdmin();
    $('categoryInlineName').focus({preventScroll:true});$('categoryInlineName').select();
   });
   row.append(name);
  }
  const remove=elem('button','category-admin-delete','×');remove.type='button';remove.title='Eliminar '+cat.name;remove.setAttribute('aria-label','Eliminar categoría: '+cat.name);
  remove.disabled=!categoryCatalogReady||categoryBusy;
  remove.addEventListener('click',()=>deleteCategory(cat));row.append(remove);list.append(row);
 }
}
async function saveCategory(event,editingId=null){
 event.preventDefault();if(categoryBusy||!categoryCatalogReady)return;
 const nombre=(editingId?categoryEditDraft:$('categoryName').value).trim();
 if(!nombre||nombre.length>80){categoryMessage('Escribe un nombre de entre 1 y 80 caracteres.',true);return}
 if(CATEGORIES.some(cat=>cat.id!==editingId&&normalizarCategoria(cat.name.trim())===normalizarCategoria(nombre))){categoryMessage('Ya existe una categoría con ese nombre.',true);return}
 categoryBusy=true;renderCategoryAdmin();
 try{
  const result=editingId
   ?await client.from('categorias').update({nombre}).eq('id',editingId).select('id').single()
   :await client.from('categorias').insert({id:crypto.randomUUID(),nombre,icono:''}).select('id').single();
  if(result.error)throw result.error;
  if(editingId){categoryEditingId=null;categoryEditDraft=''}else $('categoryName').value='';
  await load();categoryMessage('Categoría guardada.');
 }catch(error){categoryMessage(error.code==='23505'?'Ya existe una categoría con ese nombre.':'No se pudo guardar la categoría. '+error.message,true)}
 finally{categoryBusy=false;renderCategoryAdmin();if(categoryEditingId)$('categoryInlineName')?.focus({preventScroll:true})}
}
async function deleteCategory(cat){
 if(categoryBusy||!categoryCatalogReady)return;
 if(!confirm('¿Eliminar «'+cat.name+'» del catálogo? Se quitará esta categoría de los objetos que la tengan. Los objetos y sus otras categorías se conservarán.'))return;
 categoryBusy=true;renderCategoryAdmin();
 try{
  const {data:deleted,error}=await client.from('categorias').delete().eq('id',cat.id).select('id');
  if(error)throw error;if(!deleted?.length)throw new Error('La categoría ya no existe o no tienes permiso.');
  if(categoryEditingId===cat.id){categoryEditingId=null;categoryEditDraft=''}
  await load();categoryMessage('Categoría eliminada. Los objetos se han conservado.');
 }catch(error){categoryMessage('No se pudo eliminar la categoría. '+error.message,true)}
 finally{categoryBusy=false;renderCategoryAdmin()}
}
async function refreshSharedCategories(){
 if(!user||categoryBusy||categoryEditingId||categoryRefreshPending||document.hidden)return;
 categoryRefreshPending=true;
 try{await load()}catch{}finally{categoryRefreshPending=false}
}
function subscribeCategories(){
 if(categoryChannel){client.removeChannel(categoryChannel);categoryChannel=null}
 if(user)categoryChannel=client.channel('catalogo-categorias-'+user.id)
  .on('postgres_changes',{event:'*',schema:'public',table:'categorias'},refreshSharedCategories).subscribe();
}


let listMode='ampliado';
try{if(localStorage.getItem('hondotrastero:listado')==='reducido')listMode='reducido'}catch{}
const inventoryOrderButtons=[...document.querySelectorAll('[data-inventory-order]')];
let inventoryOrder='categorias';
try{const saved=localStorage.getItem('hondotrastero:orden');if(['categorias','categorias-desc','espacios','fecha-desc','fecha-asc'].includes(saved))inventoryOrder=saved}catch{}
let administrationOpen=false;
let boxSpace='';
const expandedSubspaces=new Set();
let sessionObjectSpace='';
let tab='objetos', editing=null, user=null, selectedPhoto=null, photoPreviewUrl=null;
let removePhoto=false;
let selectedCategoryFilter = ''; // Filtro visual: no modifica las categorías de los objetos.

function show(id,visible){$(id).classList.toggle('d-none',!visible)}
function clearMsg(){show('notice',false)}
function alertMsg(message,kind='danger'){
 const el=$('notice');el.textContent=message;el.className=`alert alert-${kind}`;el.scrollIntoView({block:'nearest'});
}
function elem(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function trashIcon(){
 const library=window.lucide;
 const icon=library?.icons?.Trash2&&library.createElement?.(library.icons.Trash2);
 if(!icon)return document.createTextNode('🗑');
 icon.setAttribute('aria-hidden','true');
 icon.setAttribute('width','1em');
 icon.setAttribute('height','1em');
 return icon;
}
function categoryIcon(id,fallback,className){
 const wrapper=elem('span',className);
 const library=window.lucide;
 const node=library?.icons?.[CATEGORY_ICONS.get(id)||'Tag'];
 if(node&&library.createElement){
  const icon=library.createElement(node);
  icon.setAttribute('width','1em');
  icon.setAttribute('height','1em');
  icon.setAttribute('stroke-width','2.4');
  icon.style.verticalAlign='-.125em';
  wrapper.append(icon);
 }else wrapper.textContent=fallback;
 return wrapper;
}
const page={
 show(){show('appView',false);show('editPage',true);window.scrollTo(0,0)},
 hide(){show('editPage',false);if(user)show('appView',true);window.scrollTo(0,0)}
};
document.querySelectorAll('[data-close-form]').forEach(b=>b.addEventListener('click',()=>{closeQuickCamera?.();page.hide()}));

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
function boxLabel(id){return data.cajas.find(x=>x.id===id)?.nombre||'Sin subespacio'}
function defaultSpaceKey(){return 'hondotrastero:espacio-defecto:'+user.id}
function defaultObjectSpace(){
 try{const id=localStorage.getItem(defaultSpaceKey());return data.ubicaciones.some(space=>space.id===id)?id:''}catch{return ''}
}
function defaultBoxKey(spaceId){return 'hondotrastero:subespacio-defecto:'+user.id+':'+spaceId}
function defaultObjectBox(spaceId){
 try{const id=localStorage.getItem(defaultBoxKey(spaceId));return data.cajas.some(box=>box.id===id&&box.ubicacion_id===spaceId)?id:''}catch{return ''}
}
function refreshDefaultBox(){
 const select=$('defaultObjectBox'),spaceId=$('defaultObjectSpace').value;
 select.replaceChildren(new Option('Sin subespacio por defecto',''));
 for(const box of data.cajas.filter(box=>box.ubicacion_id===spaceId).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'))){
  select.add(new Option(box.nombre,box.id));
 }
 select.value=defaultObjectBox(spaceId);
 select.disabled=!spaceId;
}
function refreshDefaultSpace(){
 const select=$('defaultObjectSpace');select.replaceChildren(new Option('Sin espacio por defecto',''));
 for(const space of [...data.ubicaciones].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')))select.add(new Option(space.nombre,space.id));
 select.value=defaultObjectSpace();
 refreshDefaultBox();
}
function lastLocationKey(){return `hondotrastero:last-location:${user.id}`}
function objectSpace(item){
 if(item.ubicacion_id)return item.ubicacion_id;
 return data.cajas.find(box=>box.id===item.caja_id)?.ubicacion_id||'';
}
async function signedPhoto(path){
 const {data:result,error}=await client.storage.from(BUCKET).createSignedUrl(path,3600);
 if(error)throw error;return result.signedUrl;
}
function photoField(item,onSelected=null){
 const wrap=elem('div','photo-field'),lab=elem('label','form-label fw-semibold','Fotografía');
 const preview=elem('img','photo-preview d-none');preview.id='photoPreview';preview.alt='Vista previa de la fotografía';
 const buttons=elem('div','d-flex flex-wrap gap-2');
 const cameraButton=elem('button','btn btn-outline-primary flex-grow-1','Hacer foto');cameraButton.type='button';
 const removeButton=elem('button','photo-remove-corner d-none');removeButton.append(trashIcon());removeButton.type='button';removeButton.id='removePhotoBtn';removeButton.setAttribute('aria-label','Eliminar foto');removeButton.title='Eliminar foto';
 const attachButton=elem('button','btn btn-outline-primary flex-grow-1','Adjuntar foto');attachButton.type='button';
 const cameraInput=elem('input','visually-hidden');cameraInput.type='file';cameraInput.id='fieldCamera';cameraInput.accept='image/*';cameraInput.setAttribute('capture','environment');
 const galleryInput=elem('input','visually-hidden');galleryInput.type='file';galleryInput.id='fieldPhoto';galleryInput.accept='image/*';
 function choosePhoto(input){acceptPhoto(input.files?.[0])}
 function acceptPhoto(file){
  if(!file)return;
  if(!file.type.startsWith('image/')){alertMsg('Selecciona un archivo de imagen.');return}
  if(onSelected){onSelected(file);return}
  selectedPhoto=file;removePhoto=false;removeButton.classList.remove('d-none');
  if(photoPreviewUrl){URL.revokeObjectURL(photoPreviewUrl);photoPreviewUrl=null}
  photoPreviewUrl=URL.createObjectURL(file);preview.src=photoPreviewUrl;preview.classList.remove('d-none');
 }
 for(const [button,symbol] of [[cameraButton,'📷'],[attachButton,'🖼️']]){
  const icon=elem('span','photo-button-icon',symbol+' ');icon.setAttribute('aria-hidden','true');button.prepend(icon);
 }
 cameraButton.addEventListener('click',()=>{cameraInput.value='';cameraInput.click()});
 attachButton.addEventListener('click',()=>{galleryInput.value='';galleryInput.click()});
 cameraInput.addEventListener('change',()=>choosePhoto(cameraInput));
 galleryInput.addEventListener('change',()=>choosePhoto(galleryInput));
 removeButton.addEventListener('click',()=>{
  if(!confirm('¿Quitar la fotografía del objeto?'))return;
  selectedPhoto=null;removePhoto=true;
  if(photoPreviewUrl){URL.revokeObjectURL(photoPreviewUrl);photoPreviewUrl=null}
  preview.removeAttribute('src');preview.classList.add('d-none');
  cameraInput.value='';galleryInput.value='';removeButton.classList.add('d-none');
 });
 wrap.openQuickCamera=()=>openInventoryCamera(acceptPhoto,()=>{
  const hint=elem('p','mb-0','Toca «Hacer foto» para abrir la cámara del móvil.');
  hint.setAttribute('role','status');wrap.append(hint);
 });
 buttons.append(cameraButton,attachButton);
 if(item?.foto_path)removeButton.classList.remove('d-none');
 const frame=elem('div','photo-preview-frame');frame.append(preview,removeButton);
 wrap.append(lab,frame,buttons,cameraInput,galleryInput);
 if(item?.id){
  const viewer=elem('dialog','mx-auto my-auto');
  viewer.setAttribute('aria-label','Fotografía ampliada');
  viewer.style.cssText='width:calc(100% - 1rem);max-width:none;max-height:calc(100% - 1rem);padding:.5rem;border:0;border-radius:.75rem;background:#151515;color:#fff';
  const close=elem('button','btn btn-light d-block ms-auto mb-2','×');
  close.type='button';close.setAttribute('aria-label','Cerrar fotografía ampliada');
  const enlarged=elem('img');enlarged.alt='Fotografía del objeto';
  enlarged.style.cssText='display:block;width:100%;height:calc(100dvh - 5rem);object-fit:contain';
  viewer.append(close,enlarged);
  wrap.append(viewer);
  preview.tabIndex=0;preview.setAttribute('role','button');
  preview.setAttribute('aria-label','Ampliar fotografía');preview.setAttribute('aria-haspopup','dialog');
  preview.style.cursor='zoom-in';
  preview.addEventListener('click',()=>{
   if(!preview.hasAttribute('src')||viewer.open)return;
   enlarged.src=preview.src;
   viewer.showModal();
  });
  preview.addEventListener('keydown',event=>{
   if(event.key==='Enter'||event.key===' '){
    event.preventDefault();
    preview.click();
   }
  });
  close.addEventListener('click',()=>viewer.close());
  viewer.addEventListener('click',event=>{if(event.target===viewer)viewer.close()});
  viewer.addEventListener('close',()=>enlarged.removeAttribute('src'));
 }
 if(item?.foto_path)signedPhoto(item.foto_path).then(url=>{
  if(!selectedPhoto&&!removePhoto){preview.src=url;preview.classList.remove('d-none')}
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
function itemCategories(item){
 // El campo nuevo es una lista de identificadores válidos; no se duplican objetos.
 return Array.isArray(item?.categorias)
  ? [...new Set(item.categorias.filter(id=>CATEGORIES_BY_ID.has(id)))]
  : [];
}
function categoryField(item){
 const selected=new Set(itemCategories(item));
 const field=elem('fieldset','category-field');
 field.setAttribute('aria-label','Categorías');
 const counter=elem('p','category-counter');counter.id='categoryCount';
 const list=elem('div','category-grid');list.id='categoryGrid';
 const rows=[];
 for(const cat of CATEGORIES){
  const label=elem('label','category-choice');
  const checkbox=elem('input','form-check-input');checkbox.type='checkbox';checkbox.name='fieldCategories';checkbox.value=cat.id;checkbox.checked=selected.has(cat.id);
  const text=elem('span','category-choice-label');
  const icon=categoryIcon(cat.id,cat.icon);icon.setAttribute('aria-hidden','true');text.append(icon,' '+cat.name);
  label.append(checkbox,text);
  const refresh=()=>{label.classList.toggle('selected',checkbox.checked);updateCount()};
  checkbox.addEventListener('change',refresh);
  label.classList.toggle('selected',checkbox.checked);
  rows.push({label,cat});list.append(label);
 }
 function updateCount(){
  const ordered=[...rows].sort((a,b)=>{
   const selectedA=a.label.querySelector('input').checked;
   const selectedB=b.label.querySelector('input').checked;
   return Number(selectedB)-Number(selectedA)||a.cat.name.localeCompare(b.cat.name,'es');
  });
  for(const row of ordered)list.append(row.label);
  const n=list.querySelectorAll('input:checked').length;
  counter.textContent=`${n} ${n===1?'categoría seleccionada':'categorías seleccionadas'}`;
 }
 updateCount();field.append(counter,list);
 if(item?.categoria?.trim()&&!selected.size){
  const legacy=elem('p','category-legacy',`Categoría anterior: «${item.categoria.trim()}». Asígnale una o varias de las categorías actuales.`);
  field.append(legacy);
 }
 return field;
}
function spaceBoxesField(space){
 const panel=elem('section','space-boxes');
 const list=elem('div','vstack gap-2');
 const label=elem('label','form-label','Nuevo subespacio');label.htmlFor='spaceNewBox';
 const input=elem('input','form-control');input.id='spaceNewBox';input.type='text';input.placeholder='Nombre del subespacio';input.maxLength=150;
 const add=elem('button','btn btn-primary','Añadir subespacio');add.type='button';add.id='spaceAddBoxBtn';
 const message=elem('p','form-text');message.setAttribute('role','status');
 let busy=false;
 async function run(action){
  if(busy)return;
  busy=true;add.disabled=true;
  list.querySelectorAll('button').forEach(b=>b.disabled=true);
  message.textContent='';
  try{
   await action();
   const result=await client.from('cajas').select('*').order('creado_en',{ascending:false});
   if(result.error)throw result.error;
   data.cajas=result.data||[];
   render();paint();
  }catch(error){message.textContent='No se pudo completar: '+error.message}
  finally{busy=false;add.disabled=false;list.querySelectorAll('button').forEach(b=>b.disabled=false)}
 }
 function paint(){
  list.replaceChildren();
  const boxes=data.cajas.filter(box=>box.ubicacion_id===space.id).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  if(!boxes.length)list.append(elem('p','form-text','Este espacio todavía no tiene subespacios.'));
  for(const box of boxes){
   const row=elem('div','d-flex align-items-center justify-content-between gap-2');
   const parsed=splitSubspaceName(box.nombre);
   const name=elem('span','subspace-icon-title');
   name.style.minWidth='0';name.style.overflowWrap='anywhere';
   if(parsed.icon)name.append(subspaceIcon(parsed.icon));
   name.append(document.createTextNode(parsed.name));row.append(name);
   const remove=elem('button','btn btn-sm btn-outline-danger','Eliminar');remove.type='button';
   remove.setAttribute('aria-label','Eliminar subespacio '+box.nombre);
   remove.addEventListener('click',()=>{
    if(busy)return;
    run(async()=>{
     // Consultar el contenido actual antes de permitir el borrado.
     const contents=await client.from('objetos').select('id').eq('caja_id',box.id).limit(1);
     if(contents.error)throw contents.error;
     if(contents.data?.length){message.textContent='Este subespacio contiene objetos. Muévelos antes de eliminarlo.';return}
     if(!confirm('¿Eliminar el subespacio «'+box.nombre+'»?'))return;
     const result=await client.from('cajas').delete().eq('id',box.id);
     if(result.error)throw result.error;
     message.textContent='Subespacio eliminado.';
    });
   });
   row.append(remove);list.append(row);
  }
 }
 add.addEventListener('click',()=>{
  const name=input.value.trim();
  if(!name){message.textContent='Escribe el nombre del subespacio.';input.focus();return}
  run(async()=>{
   const result=await client.from('cajas').insert({nombre:name,ubicacion_id:space.id,descripcion:null});
   if(result.error)throw result.error;
   input.value='';message.textContent='Subespacio añadido.';
  });
 });
 input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();add.click()}});
 paint();panel.append(list,label,input,message);
 $('saveBtn').before(add);
 return panel;
}


async function openInventoryCamera(onPhoto,fallback){
 closeQuickCamera?.();
 if(!navigator.mediaDevices?.getUserMedia){fallback();return}
 const overlay=elem('div','inventory-camera paper-card');
 overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Fotografiar objeto');
 overlay.style.cssText='position:fixed;inset:0;z-index:10000;margin:0;display:flex;flex-direction:column;gap:12px;padding:16px;overflow:auto;border-radius:0';
 const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;
 video.style.cssText='width:100%;min-height:0;flex:1;object-fit:contain;background:#111';
 const preview=document.createElement('img');preview.alt='Foto para confirmar';preview.hidden=true;preview.style.cssText=video.style.cssText;
 const controls=elem('div','d-flex flex-wrap gap-2');
 const shoot=elem('button','btn btn-primary','Hacer foto');
 const accept=elem('button','btn btn-primary','Usar foto');accept.hidden=true;
 const retry=elem('button','btn btn-outline-primary','Repetir');retry.hidden=true;
 const cancel=elem('button','btn btn-outline-primary','Volver');
 for(const b of [shoot,accept,retry,cancel])b.type='button';
 controls.append(shoot,accept,retry,cancel);overlay.append(video,preview,controls);document.body.append(overlay);
 let stream=null,blob=null,url=null,closed=false;
 const close=()=>{
  if(closed)return;closed=true;clearTimeout(cameraTimeout);stream?.getTracks().forEach(t=>t.stop());
  video.srcObject=null;if(url)URL.revokeObjectURL(url);overlay.remove();
  if(closeQuickCamera===close)closeQuickCamera=null;
 };
 const cameraTimeout=setTimeout(()=>{close();fallback()},10000);
 closeQuickCamera=close;
 cancel.addEventListener('click',close);
 retry.addEventListener('click',()=>{preview.hidden=true;video.hidden=false;shoot.hidden=false;accept.hidden=true;retry.hidden=true});
 accept.addEventListener('click',()=>{if(!blob)return;const file=new File([blob],'objeto-'+Date.now()+'.jpg',{type:'image/jpeg'});close();onPhoto(file)});
 shoot.addEventListener('click',()=>{
  if(!video.videoWidth)return;
  shoot.disabled=true;
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  canvas.getContext('2d').drawImage(video,0,0);
  canvas.toBlob(result=>{
   shoot.disabled=false;if(closed||!result)return;blob=result;
   if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);preview.src=url;
   video.hidden=true;preview.hidden=false;shoot.hidden=true;accept.hidden=false;retry.hidden=false;
  },'image/jpeg',.9);
 });
 try{
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  if(closed){stream.getTracks().forEach(t=>t.stop());return}
  video.srcObject=stream;await video.play();clearTimeout(cameraTimeout);
 }catch(error){if(closed)return;close();fallback()}
}

const editorActionHome=$('saveBtn').parentElement;
function startObjectPhoto(){
 closeCategoryFilter();clearMsg();
 editing=null;selectedPhoto=null;removePhoto=false;
 if(photoPreviewUrl){URL.revokeObjectURL(photoPreviewUrl);photoPreviewUrl=null}
 $('spaceAddBoxBtn')?.remove();
 $('editPage').classList.toggle('editor-compact',listMode==='reducido');
 $('modalTitle').textContent='Añadir objeto · Fotografía';
 editorActionHome.append($('deleteObjectBtn'),$('saveBtn'));
 show('saveBtn',false);show('deleteObjectBtn',false);
 const root=$('modalFields');root.replaceChildren();
 const field=photoField(null,file=>{
  openForm('objetos');
  selectedPhoto=file;
  $('removePhotoBtn').classList.remove('d-none');
  photoPreviewUrl=URL.createObjectURL(file);
  const preview=$('photoPreview');
  preview.src=photoPreviewUrl;preview.classList.remove('d-none');
 });
 // Primer paso: cámara, galería o continuar sin foto.
 field.querySelector('label').remove();
 const skip=elem('button','btn btn-outline-primary','Omitir este paso');skip.type='button';
 skip.addEventListener('click',()=>openForm('objetos'));
 root.append(field,skip);
 if(inventoryQuickMode){
  const stop=elem('button','btn btn-outline-danger','Terminar de inventariar');stop.type='button';
  stop.addEventListener('click',()=>{inventoryQuickMode=false;$('inventoryQuickMode').checked=false;closeQuickCamera?.();page.hide();administrationOpen=true;render()});
  root.append(stop);
 }
 page.show();
 if(inventoryQuickMode)field.openQuickCamera();
}

const SUBSPACE_ICONS=[
 ['canape','Canapé','🛏',[30,160,300,300]],
 ['armario','Armario','🚪',[385,155,250,305]],
 ['estanteria','Estantería alta','📚',[735,150,240,315]],
 ['mesilla','Mesilla','🛎',[60,565,245,240]],
 ['comoda','Cómoda','🗄',[365,565,295,240]],
 ['baul','Baúl','🧳',[700,550,290,260]],
 ['altillo','Altillo','🏗',[25,920,310,210]],
 ['caja','Caja','📦',[365,920,295,215]],
 ['maletero','Maletero','🚗',[700,890,300,260]],
 ['cajon','Cajón','🗃',[30,1250,300,205]],
 ['banco','Banco','🪑',[355,1250,310,205]],
 ['zapatero','Zapatero','👞',[735,1220,245,250]],
 ['mesa-elevable','Mesa elevable','🪟',[50,230,730,600],'extra'],
 ['reposapies','Reposapiés','🛋',[915,225,500,610],'extra'],
 ['sofa-dos-plazas','Sillón de dos plazas','🛌',[0,0,768,512],'sofa']
];
function splitSubspaceName(name=''){
 for(const icon of SUBSPACE_ICONS)if(name.startsWith(icon[2]))return {icon,name:name.slice(icon[2].length).replace(/^[\uFE0E\uFE0F\s]+/u,'')};
 return {icon:null,name};
}
function subspaceIcon(icon){
 const ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox',icon[3].join(' '));svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.classList.add('subspace-type-icon');
 const image=document.createElementNS(ns,'image');
 const extra=icon[4]==='extra',sofa=icon[4]==='sofa';
 image.setAttribute('href',sofa?'assets/subespacio-sofa-dos-plazas.webp':extra?'assets/subespacios-mesa-reposapies.webp':'assets/subespacios-ilustrados.webp');
 image.setAttribute('width',sofa?'768':extra?'1536':'1024');image.setAttribute('height',sofa?'512':extra?'1024':'1536');
 svg.append(image);return svg;
}
function subspaceIconField(initial){
 const field=elem('fieldset','subspace-icon-field'),legend=elem('legend','form-label','Icono del subespacio');
 const cloud=elem('div','subspace-icon-cloud');field.append(legend,cloud);
 const input=$('fieldName');input.dataset.subspaceIcon=initial?.[0]||'';
 const options=[[null,'Sin icono'],...SUBSPACE_ICONS.map(icon=>[icon,icon[1]])];
 for(const [icon,label] of options){
  const button=elem('button','subspace-icon-choice');button.type='button';button.title=label;button.setAttribute('aria-label',label);
  button.dataset.icon=icon?.[0]||'';button.setAttribute('aria-pressed',String(button.dataset.icon===input.dataset.subspaceIcon));
  if(icon)button.append(subspaceIcon(icon));else button.append(elem('span','','×'));
  button.append(elem('small','subspace-icon-caption',label));
  button.addEventListener('click',()=>{
   input.dataset.subspaceIcon=button.dataset.icon;
   for(const peer of cloud.children)peer.setAttribute('aria-pressed',String(peer===button));
   const preview=$('subspaceIconPreview');preview.replaceChildren();
   if(icon)preview.append(subspaceIcon(icon));
   preview.append(document.createTextNode(input.value||'Nombre del subespacio'));
  });cloud.append(button);
 }
 const preview=elem('div','subspace-icon-preview');preview.id='subspaceIconPreview';preview.setAttribute('aria-live','polite');
 const refresh=()=>{preview.replaceChildren();const icon=SUBSPACE_ICONS.find(x=>x[0]===input.dataset.subspaceIcon);if(icon)preview.append(subspaceIcon(icon));preview.append(document.createTextNode(input.value||'Nombre del subespacio'))};
 input.addEventListener('input',refresh);refresh();field.append(preview);return field;
}

function openForm(type=tab,item=null){
 // Recuperar los mismos controles antes de reconstruir los campos.
 editorActionHome.append($('deleteObjectBtn'),$('saveBtn'));
 $('editPage').classList.toggle('editor-compact',listMode==='reducido');
 closeCategoryFilter();
 $('spaceAddBoxBtn')?.remove();
 show('saveBtn',true);
 clearMsg();editing={type,id:item?.id||null};selectedPhoto=null;removePhoto=false;
 show('deleteObjectBtn',type==='objetos'&&!!item?.id);
 if(photoPreviewUrl){URL.revokeObjectURL(photoPreviewUrl);photoPreviewUrl=null}
 const root=$('modalFields');root.replaceChildren();
 if(type==='objetos'){
  const photo=photoField(item);
  const actions=elem('div','object-photo-actions');
  $('deleteObjectBtn').textContent='Eliminar objeto';
  actions.append($('deleteObjectBtn'),$('saveBtn'));
  photo.append(actions);root.append(photo);
 }
 $('modalTitle').textContent=(item?'Editar ':'Añadir ')+names[type];
 root.append(inputField('fieldName','Nombre',type==='cajas'?splitSubspaceName(item?.nombre).name:item?.nombre,'text',type!=='objetos'||!!item?.id));
 if(type==='objetos'){
  const input=$('fieldName');
  const control=elem('div','object-name-control');
  input.before(control);control.append(input);
  const clear=elem('button','object-name-clear');clear.append(trashIcon());
  clear.type='button';clear.setAttribute('aria-label','Borrar nombre');clear.title='Borrar nombre';
  control.append(clear);
  let edited=false;
  const syncClear=()=>{clear.hidden=!input.value};
  input.addEventListener('input',()=>{edited=true;syncClear()});
  clear.addEventListener('click',()=>{
   if(!confirm('¿Borrar el nombre del objeto?'))return;
   input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
  });
  if(!item?.id){
   let maximum=0;
   for(const object of data.objetos){
    const match=/^Objeto_(\d+)$/i.exec((object.nombre||'').trim());
    if(match&&Number.isSafeInteger(Number(match[1])))maximum=Math.max(maximum,Number(match[1]));
   }
   try{const n=Number(localStorage.getItem('hondotrastero:ultimo-nombre-automatico'));if(Number.isSafeInteger(n))maximum=Math.max(maximum,n)}catch{}
   input.value='Objeto_'+(maximum+1);
   nextAutomaticObjectName().then(name=>{
    if(!input.isConnected||edited)return;
    input.value=name;syncClear();
   }).catch(()=>{/* Al guardar se volverá a validar la numeración en Supabase. */});
  }
  syncClear();
 }


 if(type==='ubicaciones'){
  const extra=elem('details','space-extra-fields');
  const summary=elem('summary','form-label','Descripción | Espacio superior');
  summary.style.cursor='pointer';
  const fields=elem('div','vstack gap-3 mt-3');
  fields.append(inputField('fieldDesc','Descripción',item?.descripcion||'','text',false));
  fields.append(selectField('fieldParent','Espacio superior',data.ubicaciones.filter(x=>x.id!==item?.id),true,item?.ubicacion_padre_id));
  fields.addEventListener('invalid',()=>{extra.open=true},true);
  extra.append(summary,fields);root.append(extra);
 }
 if(type==='ubicaciones'&&item?.id){
  root.append(spaceBoxesField(item));
  show('saveBtn',false);
  const initial={fieldName:$('fieldName').value,fieldDesc:$('fieldDesc').value,fieldParent:$('fieldParent').value};
  const refreshSave=()=>show('saveBtn',Object.keys(initial).some(id=>$(id).value!==initial[id]));
  for(const id of Object.keys(initial)){
   $(id).addEventListener('input',refreshSave);
   $(id).addEventListener('change',refreshSave);
  }
 }
 if(type==='cajas'){
  root.append(selectField('fieldLocation','Espacio',data.ubicaciones,false,item?.ubicacion_id||boxSpace||localStorage.getItem(lastLocationKey())));
  root.append(inputField('fieldDesc','Descripción',item?.descripcion||'','text',false));
  root.append(subspaceIconField(splitSubspaceName(item?.nombre).icon));
 }
 if(type==='objetos'){
  const extra=elem('details','object-extra-fields');
  const summary=elem('summary','form-label','Descripción | Cantidad | Fecha');
  summary.style.cursor='pointer';
  const fields=elem('div','vstack gap-3 mt-3');
  fields.append(inputField('fieldDesc','Descripción',item?.descripcion||'','text',false));
  fields.append(inputField('fieldQty','Cantidad',item?.cantidad??1,'number',false));
  const createdDate=item?.creado_en?new Date(item.creado_en):null;
  const createdLabel=createdDate&&Number.isFinite(createdDate.getTime())
   ?new Intl.DateTimeFormat('es-ES',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Madrid'}).format(createdDate)
   :item?'Sin fecha registrada':'Se asignará al guardar';
  const dateField=inputField('fieldCreatedAt','Fecha de alta',createdLabel,'text',false);
  dateField.querySelector('input').readOnly=true;
  fields.append(dateField);
  extra.append(summary,fields);
  // Abrir el panel si la validación necesita mostrar un campo oculto.
  fields.addEventListener('invalid',()=>{extra.open=true},true);
  root.append(extra);
  const categoriesPanel=elem('details','object-category-panel');
  categoriesPanel.open=false;
  const categoriesSummary=elem('summary','form-label','Categorías');
  categoriesSummary.style.cursor='pointer';
  const categoryFields=categoryField(item);
  function refreshCategorySummary(){
   const selected=[...categoryFields.querySelectorAll('input[name="fieldCategories"]:checked')]
    .map(input=>CATEGORIES_BY_ID.get(input.value)?.name).filter(Boolean)
    .sort((a,b)=>a.localeCompare(b,'es'));
   categoriesSummary.replaceChildren(document.createTextNode('Categorías'));
   if(selected.length){
    const names=elem('span','', ' | '+selected.join(', '));
    names.style.fontWeight='400';
    categoriesSummary.append(names);
   }
  }
  categoryFields.addEventListener('change',refreshCategorySummary);
  refreshCategorySummary();
  categoriesPanel.append(categoriesSummary,categoryFields);
  root.append(categoriesPanel,extra);
  const wrap=elem('div');
  const initialBox=data.cajas.find(b=>b.id===item?.caja_id);
  const initialSpace=initialBox?.ubicacion_id||item?.ubicacion_id||(!item?(data.ubicaciones.some(space=>space.id===sessionObjectSpace)?sessionObjectSpace:defaultObjectSpace()):'')||localStorage.getItem(lastLocationKey())||'';
  wrap.append(selectField('fieldLocation','Espacio',data.ubicaciones,false,initialSpace));
  wrap.append(selectField('fieldBox','Subespacio',[],true));
  wrap.className='vstack gap-2 object-location-fields';
  $('fieldName').parentElement.after(wrap);
  const loc=$('fieldLocation'),box=$('fieldBox');
  function refreshBoxes(selected=''){
   box.replaceChildren(new Option('Sin subespacio', ''));
   for(const entry of data.cajas.filter(b=>b.ubicacion_id===loc.value).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'))){
    box.add(new Option(entry.nombre,entry.id));
   }
   box.value=[...box.options].some(o=>o.value===selected)?selected:'';
  }
  refreshBoxes(item?item.caja_id||'':defaultObjectBox(loc.value));
  loc.addEventListener('change',()=>{
   if(!item)sessionObjectSpace=loc.value;
   refreshBoxes(!item?defaultObjectBox(loc.value):box.value);
  });
  box.addEventListener('change',()=>{
   const selected=data.cajas.find(b=>b.id===box.value);
   if(selected)loc.value=selected.ubicacion_id;
  });
 }
 page.show();
}
async function load(){
 await loadCategoryCatalog();
 const tables=Object.keys(data);
 const results=await Promise.all(tables.map(t=>client.from(t).select('*').order('creado_en',{ascending:false})));
 for(let i=0;i<results.length;i++){
  if(results[i].error)throw results[i].error;
  data[tables[i]]=results[i].data||[];
 }
 render();
}
// Las cifras representan fichas de inventario, coherentes con el contador general.
// Al contar un espacio se incluyen los objetos de sus cajas y subespacios.
function spaceParents(){
 return new Map(data.ubicaciones.map(item=>[item.id,item.ubicacion_padre_id||null]));
}
function belongsToSpace(item,spaceId,parents){
 let id=objectSpace(item);
 const visited=new Set();
 while(id&&!visited.has(id)){
  if(id===spaceId)return true;
  visited.add(id);
  id=parents.get(id);
 }
 return false;
}
// Selector integrado en la página: nunca invoca el menú blanco nativo de Android.
function normalizarCategoria(texto){
 return String(texto||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
}
function closeCategoryFilter(){
 const dialog=$('filterCategoryPanel');
 if(dialog.open)dialog.close();
}
function chooseCategoryFilter(value){
 selectedCategoryFilter=value;
 closeCategoryFilter();
 render();
 $('filterCategoryButton').focus({preventScroll:true});
}
function refreshInventoryFilters(){
 show('inventoryFilters',tab==='objetos');
 if(tab!=='objetos'){
  closeCategoryFilter();
  return;
 }
 const space=$('filterSpace');
 const oldSpace=space.value;
 const total=data.objetos.length;
 const parents=spaceParents();
 const spaceCounts=new Map(),categoryCounts=new Map();
 let withoutCategories=0;
 for(const item of data.objetos){
  const cats=itemCategories(item);
  if(!cats.length)withoutCategories++;
  for(const id of cats)categoryCounts.set(id,(categoryCounts.get(id)||0)+1);
  let id=objectSpace(item);
  const visited=new Set();
  while(id&&!visited.has(id)&&parents.has(id)){
   visited.add(id);spaceCounts.set(id,(spaceCounts.get(id)||0)+1);id=parents.get(id);
  }
 }
 const spaces=[
  {id:'',nombre:'Todos los espacios',count:total},
  ...[...data.ubicaciones].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'))
   .map(({id,nombre})=>({id,nombre,count:spaceCounts.get(id)||0}))
 ];
 space.replaceChildren(...spaces.map(({id,nombre,count})=>new Option(`${nombre} (${count})`,id)));
 space.value=[...space.options].some(o=>o.value===oldSpace)?oldSpace:'';
 const spaceList=$('spaceFilterOptions');
 if(spaceList){
  $('spaceFilterButtonText').textContent=space.selectedOptions[0].textContent;
  spaceList.replaceChildren();
  for(const {id,nombre,count} of spaces){
   const selected=id===space.value;
   const row=elem('button','category-filter-option');
   row.type='button';
   row.classList.toggle('selected',selected);
   row.setAttribute('aria-pressed',String(selected));
   const check=elem('span','category-option-check',selected?'✓':'');
   check.setAttribute('aria-hidden','true');
   row.append(elem('span','category-option-name',nombre),elem('span','category-option-count',String(count)),check);
   row.addEventListener('click',()=>{
    space.value=id;
    $('spaceFilterDialog').close();
    render();
   });
   spaceList.append(row);
  }
 }
 // El catálogo es fijo: todas las opciones se muestran, incluso con cero objetos.
 const categoryOptions=[
  {value:'',name:'Todas las categorías',icon:'📦',count:total},
  ...CATEGORIES.map(cat=>({value:cat.id,name:cat.name,icon:cat.icon,count:categoryCounts.get(cat.id)||0})),
  {value:'__sin_categoria__',name:'Sin categoría',icon:'🏷️',count:withoutCategories}
 ];
 const chosen=categoryOptions.find(option=>option.value===selectedCategoryFilter)||categoryOptions[0];
 selectedCategoryFilter=chosen.value;
 $('categoryFilterButtonText').textContent=`${chosen.name} (${chosen.count})`;
 $('filterCategoryButton').setAttribute('aria-label',`Categoría: ${chosen.name}. ${chosen.count} ${chosen.count===1?'objeto':'objetos'}. Abrir lista`);
 const list=$('categoryFilterOptions'),oldScroll=list.scrollTop;
 list.replaceChildren();
 for(const option of categoryOptions){
  const row=elem('button','category-filter-option');row.type='button';
  row.dataset.categoryName=option.name;
  row.dataset.value=option.value;
  row.setAttribute('aria-pressed',String(option.value===selectedCategoryFilter));
  if(option.value===selectedCategoryFilter)row.classList.add('selected');
  const icon=categoryIcon(option.value,option.icon,'category-option-icon');icon.setAttribute('aria-hidden','true');
  const name=elem('span','category-option-name',option.name);
  const count=elem('span','category-option-count',String(option.count));
  const tick=elem('span','category-option-check',option.value===selectedCategoryFilter?'✓':'');tick.setAttribute('aria-hidden','true');
  row.append(icon,name,count,tick);
  row.addEventListener('click',()=>chooseCategoryFilter(option.value));
  list.append(row);
 }
 list.scrollTop=oldScroll;
}
function refreshBoxSpaces(){
 show('boxSpacePanel',false);
 if(tab!=='cajas')return;
 if(!data.ubicaciones.some(s=>s.id===boxSpace))boxSpace='';
 const select=$('boxSpace');
 select.replaceChildren(new Option('Selecciona un espacio',''));
 for(const space of [...data.ubicaciones].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'))){
  const count=data.cajas.filter(box=>box.ubicacion_id===space.id).length;
  select.add(new Option(space.nombre+' ('+count+')',space.id));
 }
 select.value=boxSpace;
}
function inventoryEntries(rows,order){
 const compare=(a,b)=>(a.nombre||'').localeCompare(b.nombre||'','es',{sensitivity:'base',numeric:true})||String(a.id).localeCompare(String(b.id));
 if(order==='fecha-desc'||order==='fecha-asc'){
  return [...rows].sort((a,b)=>{
   const first=Date.parse(a.creado_en),second=Date.parse(b.creado_en);
   if(!Number.isFinite(first))return Number.isFinite(second)?1:compare(a,b);
   if(!Number.isFinite(second))return -1;
   return (order==='fecha-desc'?second-first:first-second)||compare(a,b);
  }).map(item=>({item}));
 }
 const sorted=[...rows].sort(compare);
 if(order==='espacios'){
  const spaces=orderedSpaces();
  const spaceIds=new Set(spaces.map(space=>space.id));
  const groups=new Map();
  for(const item of sorted){
   const id=objectSpace(item);
   const key=spaceIds.has(id)?id:null;
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push({item});
  }
  const entries=[];
  for(const space of spaces){
   if(groups.has(space.id))entries.push({heading:space.nombre},...groups.get(space.id));
  }
  if(groups.has(null))entries.push({heading:'Sin espacio'},...groups.get(null));
  return entries;
 }
 if(order!=='categorias'&&order!=='categorias-desc')return sorted.map(item=>({item}));
 const groups=[...CATEGORIES].sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));
 if(order==='categorias-desc')groups.reverse();
 const entries=[];
 for(const category of groups){
  const members=sorted.filter(item=>itemCategories(item).includes(category.id));
  if(members.length){entries.push({heading:category.name});entries.push(...members.map(item=>({item})))}
 }
 const unclassified=sorted.filter(item=>!itemCategories(item).length);
 if(unclassified.length){entries.push({heading:'Sin categoría'});entries.push(...unclassified.map(item=>({item})))}
 return entries;
}
function subspaceEntries(rows){
 const entries=[],assigned=new Set();
 const compare=(a,b)=>(a.nombre||'').localeCompare(b.nombre||'','es',{sensitivity:'base',numeric:true});
 for(const space of orderedSpaces()){
  const boxes=rows.filter(box=>box.ubicacion_id===space.id).sort(compare);
  if(!boxes.length)continue;
  entries.push({heading:space.nombre});
  for(const item of boxes){entries.push({item});assigned.add(item.id)}
 }
 const unassigned=rows.filter(box=>!assigned.has(box.id)).sort(compare);
 if(unassigned.length){entries.push({heading:'Sin espacio'});entries.push(...unassigned.map(item=>({item})))}
 return entries;
}
function orderedSpaces(){
 let ids=[];
 try{const saved=JSON.parse(localStorage.getItem('hondotrastero:orden-espacios:'+user.id)||'[]');if(Array.isArray(saved))ids=saved}catch{}
 const ranks=new Map(ids.map((id,index)=>[id,index]));
 return [...data.ubicaciones].sort((a,b)=>(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity));
}
function moveSpace(id,direction){
 const spaces=orderedSpaces(),index=spaces.findIndex(space=>space.id===id),next=index+direction;
 if(index<0||next<0||next>=spaces.length)return;
 [spaces[index],spaces[next]]=[spaces[next],spaces[index]];
 try{localStorage.setItem('hondotrastero:orden-espacios:'+user.id,JSON.stringify(spaces.map(space=>space.id)))}catch{
  alertMsg('No se pudo recordar el orden de los espacios en este dispositivo.');return;
 }
 render();
 $('spaceMove'+(direction<0?'Up':'Down')+id)?.focus({preventScroll:true});
}
function subspaceContents(box,label){
 const objects=data.objetos.filter(obj=>obj.caja_id===box.id)
  .sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||'','es',{sensitivity:'base',numeric:true}));
 if(!objects.length&&!label)return elem('p','subspace-empty','Sin objetos guardados');
 const disclosure=elem('details','subspace-contents');
 disclosure.open=expandedSubspaces.has(box.id);
 disclosure.append(elem('summary','subspace-contents-summary',(label||'Ver objetos')+' · '+objects.length));
 const list=elem('div','subspace-object-list');let loaded=false;
 const loadObjects=()=>{
  if(loaded)return;loaded=true;
  if(!objects.length)list.append(elem('p','subspace-empty','Sin objetos guardados'));
  for(const object of objects){
   const row=elem('button','subspace-object');row.type='button';
   row.setAttribute('aria-label','Abrir ficha de '+object.nombre);
   if(object.foto_path){
    const image=elem('img','subspace-object-photo');image.alt='';image.loading='lazy';
    signedPhoto(object.foto_path).then(url=>{image.src=url}).catch(()=>image.remove());row.append(image);
   }
   const text=elem('span','subspace-object-text');text.append(elem('span','subspace-object-name',object.nombre));
   const categories=itemCategories(object).map(id=>CATEGORIES_BY_ID.get(id)?.name).filter(Boolean);
   if(categories.length)text.append(elem('small','subspace-object-category',categories.join(' · ')));
   row.append(text);
   const arrow=elem('span','subspace-object-arrow','›');arrow.setAttribute('aria-hidden','true');row.append(arrow);
   row.addEventListener('click',event=>{event.stopPropagation();openForm('objetos',object)});
   list.append(row);
  }
 };
 disclosure.addEventListener('click',event=>event.stopPropagation());
 disclosure.addEventListener('toggle',()=>{
  if(disclosure.open){expandedSubspaces.add(box.id);loadObjects()}else expandedSubspaces.delete(box.id);
 });
 disclosure.append(list);
 if(disclosure.open)loadObjects();
 return disclosure;
}
function render(){
 $('clearSearch')?.classList.toggle('d-none',!$('search').value);
 $('records').classList.toggle('records-reduced',listMode==='reducido');
 $('appView').classList.toggle('listing-compact',listMode==='reducido');
 refreshBoxSpaces();
 show('adminStyleTools',administrationOpen);
 if(administrationOpen){refreshDefaultSpace();renderCategoryAdmin()}
 const managingSpaces=tab==='ubicaciones';
 show('inventoryToolbar',tab==='objetos');
 const addLabel=$('newItem').querySelector('.add-button-label');
 addLabel.textContent='＋ Añadir '+names[tab];
 if(tab==='objetos'||tab==='ubicaciones'||tab==='cajas'){
  const plain=document.createElement('span');plain.className='add-label-plain';plain.textContent=addLabel.textContent;
  const stamp=document.createElement('span');stamp.className='add-label-stamp';stamp.setAttribute('aria-hidden','true');
  const verb=document.createElement('span');verb.className='add-stamp-verb';verb.textContent='Añadir';
  const noun=document.createElement('span');noun.className='add-stamp-noun';noun.textContent=names[tab];
  stamp.append(verb,noun);addLabel.replaceChildren(plain,stamp);
 }
 show('newItem',true);
 refreshInventoryFilters();
 $('countObjects').textContent=data.objetos.length;
 $('countBoxes').textContent=data.cajas.length;
 $('countLocations').textContent=data.ubicaciones.length;
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',!administrationOpen&&b.dataset.tab===tab));
 $('manageSpaces').classList.toggle('active',administrationOpen);
 $('manageSpaces').setAttribute('aria-expanded',String(administrationOpen));
 document.querySelector('.section-heading').classList.toggle('d-none',administrationOpen);
 show('records',!administrationOpen);
 show('inventoryOrderPanel',!administrationOpen&&tab==='objetos');
 const orderSelect=$('inventoryOrder');
 if(orderSelect)orderSelect.value=inventoryOrder;
 for(const button of inventoryOrderButtons){
  const direction=button.querySelector('[data-order-direction]');
  if(direction){
   const descending=inventoryOrder==='categorias-desc';
   button.dataset.inventoryOrder=descending?'categorias-desc':'categorias';
   direction.textContent=descending?'↓ Z–A':'↑ A–Z';
   button.setAttribute('aria-label',descending?'Por categorías de Z a A. Cambiar a A–Z':'Por categorías de A a Z. '+(inventoryOrder==='categorias'?'Cambiar a Z–A':'Aplicar orden'));
  }
  const selected=button.dataset.inventoryOrder===inventoryOrder;
  button.setAttribute('aria-pressed',String(selected));
  button.classList.toggle('selected',selected);
  const check=button.querySelector('.category-option-check:not([data-order-direction])');
  if(check)check.textContent=selected?'✓':'';
 }
 const orderLabel=inventoryOrderButtons.find(button=>button.dataset.inventoryOrder===inventoryOrder)||orderSelect?.selectedOptions[0];
 $('inventoryOrderSummary').textContent=orderLabel?' | '+(orderLabel.querySelector('.category-option-name')||orderLabel).textContent+(orderLabel.hasAttribute('data-order-toggle')?(inventoryOrder==='categorias-desc'?' ↓ Z–A':' ↑ A–Z'):''):'';
 if(administrationOpen){
  for(const id of ['boxSpacePanel','inventoryToolbar','inventoryFilters','empty'])show(id,false);
  closeCategoryFilter();
  return;
 }
 const heading=$('sectionTitle');heading.textContent=tab==='objetos'?'📦 Inventario':tab==='cajas'?'▤ Subespacios':'▥ Espacios';
 const q=tab==='cajas'?'':$('search').value.trim().toLocaleLowerCase('es');
 const selectedSpace=$('filterSpace').value,selectedCategory=selectedCategoryFilter;
 const parents=spaceParents();
 const source=tab==='ubicaciones'?orderedSpaces():data[tab];
 const rows=source.filter(item=>{
  if(!`${item.nombre} ${item.descripcion||''}`.toLocaleLowerCase('es').includes(q))return false;
  if(tab==='cajas')return true;
  if(tab!=='objetos')return true;
  if(selectedSpace&&!belongsToSpace(item,selectedSpace,parents))return false;
  const cats=itemCategories(item);
  if(selectedCategory&&(selectedCategory==='__sin_categoria__'?cats.length>0:!cats.includes(selectedCategory)))return false;
  return true;
 });
 const root=$('records');root.replaceChildren();show('empty',rows.length===0);
 $('empty').textContent=tab==='cajas'?'Todavía no hay subespacios. Pulsa Añadir subespacio para crear el primero.':'Todavía no hay registros en esta sección.';
 const entries=tab==='objetos'?inventoryEntries(rows,inventoryOrder):tab==='cajas'?subspaceEntries(rows):rows.map(item=>({item}));
 for(const entry of entries){
  if(entry.heading){
   const title=elem('h2','h5 mt-4 mb-2',entry.heading);
   root.append(title);continue;
  }
  const item=entry.item;
  const line=elem('div','list-group-item record');
  {
   const recordType=tab;
   line.style.cursor='pointer';
   line.tabIndex=0;
   line.setAttribute('aria-label','Editar '+names[recordType]+' '+item.nombre);
   line.addEventListener('click',event=>{
    if(event.target.closest('button,a,input,select,textarea,details,summary'))return;
    openForm(recordType,item);
   });
   line.addEventListener('keydown',event=>{
    if(event.target!==line||!['Enter',' '].includes(event.key))return;
    event.preventDefault();openForm(recordType,item);
   });
  }
  if(listMode!=='reducido'&&tab==='objetos'&&item.foto_path){
   const img=elem('img','record-photo');img.alt='Foto de '+item.nombre;img.loading='lazy';
   signedPhoto(item.foto_path).then(url=>{img.src=url}).catch(()=>img.remove());line.append(img);
  }
  const main=elem('div','record-main');main.append(elem('div','record-title',item.nombre));
  let detail=item.descripcion||'';
  if(tab==='objetos'){
   detail=[`×${item.cantidad}`,item.caja_id?`${locationLabel(objectSpace(item))} | ${boxLabel(item.caja_id)}`:locationLabel(item.ubicacion_id),detail].filter(Boolean).join(' · ');
  }
  if(tab==='cajas')detail=[locationLabel(item.ubicacion_id),detail].filter(Boolean).join(' · ');
  if(tab==='ubicaciones'&&item.ubicacion_padre_id)detail=[`Dentro de ${locationLabel(item.ubicacion_padre_id)}`,detail].filter(Boolean).join(' · ');
  if(detail)main.append(elem('div','record-detail',detail));
  if(listMode==='reducido'){
   const concepts=[item.nombre];
   if(tab==='objetos'){
    concepts.push('×'+item.cantidad,locationLabel(objectSpace(item)));
    if(item.caja_id)concepts.push(boxLabel(item.caja_id));

   }
   if(tab==='cajas')concepts.push(locationLabel(item.ubicacion_id));
   if(tab==='ubicaciones'){
    if(item.ubicacion_padre_id)concepts.push(locationLabel(item.ubicacion_padre_id));
   }
   if(item.descripcion)concepts.push(item.descripcion);
   if(tab==='objetos'){
    const text=elem('span','record-compact-text');
    text.append(elem('span','object-name-badge',item.nombre));
    if(concepts.length>1)text.append(document.createTextNode(' | '+concepts.slice(1).join(' | ')));
    main.replaceChildren(text);
   }else if(tab==='ubicaciones'){
    main.classList.add('space-record-main');
    main.replaceChildren(elem('strong','record-compact-text space-record-name',item.nombre));
    const details=[item.ubicacion_padre_id?'Dentro de '+locationLabel(item.ubicacion_padre_id):'',item.descripcion||''].filter(Boolean);
    if(details.length)main.append(elem('div','record-compact-text',details.join(' | ')));
   }else main.replaceChildren(elem('span','record-compact-text',concepts.join(' | ')));
  }
  if(tab==='objetos'){
   main.classList.add('object-record-main');
   const titleLine=elem('div','object-title-line');
   const title=elem('span',listMode==='reducido'?'object-name-badge':'record-title',item.nombre);
   titleLine.append(title);
   const cats=itemCategories(item).map(id=>CATEGORIES_BY_ID.get(id));
   const place=[locationLabel(objectSpace(item)),item.caja_id?boxLabel(item.caja_id):''].filter(Boolean).join(' | ');
   main.replaceChildren(titleLine,elem('div','record-detail object-place-line',place));
   if(item.descripcion)main.append(elem('div','record-detail',item.descripcion));
   if(!cats.length&&item.categoria?.trim())main.append(elem('span','record-category-legacy','Pendiente de clasificar (antes: '+item.categoria.trim()+')'));
   line.append(main);root.append(line);
   continue;
  }
  if(tab==='cajas'){
   const parsed=splitSubspaceName(item.nombre);
   if(parsed.icon){
    const title=main.querySelector('.record-title,.record-compact-text');
    if(title){title.replaceChildren(subspaceIcon(parsed.icon),document.createTextNode(listMode==='reducido'?parsed.name+' | '+locationLabel(item.ubicacion_id):parsed.name));title.classList.add('subspace-icon-title')}
   }
  }
  const actions=elem('div','record-actions');
  const del=elem('button','btn btn-sm btn-outline-danger','Eliminar');del.type='button';del.addEventListener('click',()=>removeItem(tab,item));
  if(tab==='ubicaciones'){
   line.classList.add('space-record');
   actions.classList.add('space-order-actions');
   const arrows=elem('div','space-move-controls');
   actions.append(arrows);
   const all=orderedSpaces(),index=all.findIndex(space=>space.id===item.id);
   for(const [direction,symbol,label] of [[-1,'↑','Subir'],[1,'↓','Bajar']]){
    const move=elem('button','btn btn-sm btn-outline-primary space-order-button',symbol);
    move.type='button';move.id='spaceMove'+(direction<0?'Up':'Down')+item.id;
    move.setAttribute('aria-label',label+' '+item.nombre);move.title=label+' '+item.nombre;
    move.disabled=direction<0?index===0:index===all.length-1;
    move.addEventListener('click',()=>moveSpace(item.id,direction));
    arrows.append(move);
   }
  }
  if(listMode==='reducido'){
   del.textContent='×';
   del.title='Eliminar '+item.nombre;
   del.setAttribute('aria-label','Eliminar '+item.nombre);
   if(tab!=='objetos')actions.append(del);
  }else if(tab==='ubicaciones'){
   const buttons=elem('div','space-edit-controls');
   buttons.append(del);actions.append(buttons);
  }else actions.append(del);
  line.append(main,actions);
  if(tab==='cajas'){
   line.classList.add('subspace-record');
   line.append(subspaceContents(item));
  }
  if(tab==='ubicaciones'){
   const boxes=data.cajas.filter(box=>box.ubicacion_id===item.id)
    .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
   for(const box of boxes)line.append(subspaceContents(box,splitSubspaceName(box.nombre).name));
  }
  root.append(line);
 }
}
async function removeItem(type,item){
 if(type==='cajas'&&data.objetos.some(obj=>obj.caja_id===item.id)){alertMsg('Este subespacio contiene objetos. Muévelos a otro espacio o subespacio antes de eliminarlo.','warning');return}
 if(!confirm(`¿Eliminar ${names[type]} «${item.nombre}»?`))return;
 const {error}=await client.from(type).delete().eq('id',item.id);
 if(error){alertMsg(`No se pudo eliminar: ${error.message}`);return}
 if(type==='objetos'&&item.foto_path){
  const result=await client.storage.from(BUCKET).remove([item.foto_path]);
  if(result.error)alertMsg('Objeto eliminado, pero no se pudo borrar su fotografía: '+result.error.message,'warning');
 }
 if(type==='objetos'&&editing?.type===type&&editing.id===item.id){editing=null;page.hide()}
 try{await load()}catch(e){alertMsg(e.message)}
}
$('deleteObjectBtn').addEventListener('click',async()=>{
 if(editing?.type!=='objetos'||!editing.id)return;
 const item=data.objetos.find(obj=>obj.id===editing.id);if(!item)return;
 const button=$('deleteObjectBtn');button.disabled=true;
 try{await removeItem('objetos',item)}finally{button.disabled=false}
});

async function nextAutomaticObjectName(){
 // Consultar todo el inventario visible, sin depender de filtros ni de datos antiguos.
 let maximum=0;
 for(let offset=0;;offset+=1000){
  const {data:rows,error}=await client.from('objetos').select('id,nombre').order('id').range(offset,offset+999);
  if(error)throw new Error('No se pudo obtener un nombre automático: '+error.message);
  for(const row of rows){
   const match=/^Objeto_(\d+)$/i.exec((row.nombre||'').trim());
   if(match){const n=Number(match[1]);if(Number.isSafeInteger(n))maximum=Math.max(maximum,n)}
  }
  if(rows.length<1000)break;
 }
 const key='hondotrastero:ultimo-nombre-automatico';
 try{const saved=Number(localStorage.getItem(key));if(Number.isSafeInteger(saved))maximum=Math.max(maximum,saved)}catch{}
 if(maximum>=Number.MAX_SAFE_INTEGER)throw new Error('Se ha agotado la numeración automática.');
 const next=maximum+1;
 try{localStorage.setItem(key,String(next))}catch{}
 return 'Objeto_'+next;
}

$('editForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!editing)return;
 const {type,id}=editing;
 const name=$('fieldName').value.trim();
 const automaticName=type==='objetos'&&!id&&!name;
 if(!name&&!automaticName){alertMsg('El nombre es obligatorio');return}
 const payload={nombre:name,descripcion:$('fieldDesc').value.trim()||null};
 if(type==='ubicaciones')payload.ubicacion_padre_id=$('fieldParent').value||null;
 if(type==='cajas'){
  payload.ubicacion_id=$('fieldLocation').value||null;
  const icon=SUBSPACE_ICONS.find(x=>x[0]===$('fieldName').dataset.subspaceIcon);
  if(icon)payload.nombre=icon[2]+'\uFE0E '+name;
 }
 if(type==='objetos'){
  payload.cantidad=$('fieldQty').value.trim()===''?1:Number($('fieldQty').value);
  payload.ubicacion_id=$('fieldLocation').value||null;
  payload.caja_id=$('fieldBox').value||null;
  // Se guarda una única ficha con todas sus categorías; no se crean copias.
  payload.categorias=[...document.querySelectorAll('input[name="fieldCategories"]:checked')].map(el=>el.value);
  if(payload.categorias.some(id=>!CATEGORIES_BY_ID.has(id)) || new Set(payload.categorias).size!==payload.categorias.length){
   alertMsg('Hay una categoría no válida o duplicada.');return;
  }
  if(!payload.ubicacion_id){alertMsg('Selecciona un espacio.');return}
  if(payload.caja_id){
   const selectedBox=data.cajas.find(box=>box.id===payload.caja_id);
   if(!selectedBox||selectedBox.ubicacion_id!==payload.ubicacion_id){
    alertMsg('El subespacio seleccionado no pertenece a este espacio.');return;
   }
   // El espacio se obtiene de la caja: conserva el modelo exclusivo de la base de datos.
   payload.ubicacion_id=null;
  }
 }
 if(type==='cajas'&&!payload.ubicacion_id){alertMsg('Selecciona un espacio.');return}
 $('saveBtn').disabled=true;let newPhotoPath=null;
 try{
  if(automaticName)payload.nombre=await nextAutomaticObjectName();
  if(type==='objetos'&&removePhoto)payload.foto_path=null;
  if(type==='objetos'&&selectedPhoto){newPhotoPath=await uploadPhoto(selectedPhoto);payload.foto_path=newPhotoPath}
  const query=id?client.from(type).update(payload).eq('id',id):client.from(type).insert(payload);
  const {error}=await query;if(error)throw error;
  if(type==='objetos'&&(newPhotoPath||removePhoto)&&id){
   const previous=data.objetos.find(x=>x.id===id)?.foto_path;
   if(previous&&previous!==newPhotoPath){
    const removal=await client.storage.from(BUCKET).remove([previous]);
    if(removal.error)console.warn('No se pudo borrar la fotografía anterior',removal.error);
   }
  }
 }catch(err){
  if(newPhotoPath)await client.storage.from(BUCKET).remove([newPhotoPath]);
  $('saveBtn').disabled=false;
  alertMsg('No se pudo guardar: '+err.message);
  return;
 }
 $('saveBtn').disabled=false;
 if(type==='cajas')boxSpace=payload.ubicacion_id;
 if(type==='objetos'&&!id)sessionObjectSpace=$('fieldLocation').value;
 if(payload.ubicacion_id)localStorage.setItem(lastLocationKey(),payload.ubicacion_id);
 if(type==='objetos'&&payload.caja_id){
  const box=data.cajas.find(x=>x.id===payload.caja_id);
  if(box)localStorage.setItem(lastLocationKey(),box.ubicacion_id);
 }
 if(inventoryQuickMode&&type==='objetos'&&!id){
  startObjectPhoto();
  try{await load()}catch(err){alertMsg('Objeto guardado. No se pudo actualizar el inventario: '+err.message)}
  return;
 }
 page.hide();
 try{await load();clearMsg()}catch(err){alertMsg(err.message)}
});
document.querySelector('.parcel-nav').addEventListener('click',e=>{
 const b=e.target.closest('[data-tab]');if(!b)return;
 administrationOpen=false;
 closeCategoryFilter();tab=b.dataset.tab;$('search').value='';render();
});
$('inventoryQuickMode').addEventListener('change',e=>{
 inventoryQuickMode=e.target.checked;
 if(inventoryQuickMode){administrationOpen=false;tab='objetos';render();startObjectPhoto()}
 else closeQuickCamera?.();
});
$('categoryAdminForm').addEventListener('submit',event=>saveCategory(event));
$('categoryAdminPanel').addEventListener('toggle',()=>{if($('categoryAdminPanel').open)refreshSharedCategories()});
window.addEventListener('focus',refreshSharedCategories);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSharedCategories()});
setInterval(refreshSharedCategories,30000);
$('manageSpaces').addEventListener('click',()=>{
 administrationOpen=true;
 closeCategoryFilter();
 clearMsg();
 render();
});
$('defaultObjectSpace').addEventListener('change',()=>{
 try{localStorage.setItem(defaultSpaceKey(),$('defaultObjectSpace').value);sessionObjectSpace='';refreshDefaultBox()}catch{alertMsg('No se pudo recordar el espacio por defecto en este dispositivo.')}
});
$('defaultObjectBox').addEventListener('change',()=>{
 const spaceId=$('defaultObjectSpace').value;if(!spaceId)return;
 try{localStorage.setItem(defaultBoxKey(spaceId),$('defaultObjectBox').value)}catch{alertMsg('No se pudo recordar el subespacio por defecto en este dispositivo.')}
});
function syncListChoices(){
 document.querySelectorAll('[data-list-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.listMode===listMode)));
}
document.querySelectorAll('[data-list-mode]').forEach(button=>button.addEventListener('click',()=>{
 listMode=button.dataset.listMode;
 try{localStorage.setItem('hondotrastero:listado',listMode)}catch{}
 syncListChoices();render();
}));
syncListChoices();
const inventoryOrderDialog=$('inventoryOrderDialog');
function setInventoryOrder(value){
 inventoryOrder=value;
 try{localStorage.setItem('hondotrastero:orden',inventoryOrder)}catch{}
 render();
}
$('openInventoryOrder')?.addEventListener('click',()=>{
 inventoryOrderDialog.showModal();
 inventoryOrderButtons.find(button=>button.dataset.inventoryOrder===inventoryOrder)?.focus();
});
for(const button of inventoryOrderButtons){
 button.addEventListener('click',()=>{
  const value=button.hasAttribute('data-order-toggle')
   ? (inventoryOrder==='categorias'?'categorias-desc':'categorias')
   : button.dataset.inventoryOrder;
  setInventoryOrder(value);
  inventoryOrderDialog.close();
 });
}
$('inventoryOrder')?.addEventListener('change',event=>{
 setInventoryOrder(event.target.value);
 $('inventoryOrderPanel').open=false;
 $('inventoryOrderPanel').querySelector('summary').focus({preventScroll:true});
});
$('search').addEventListener('input',render);
$('clearSearch')?.addEventListener('click',()=>{
 const search=$('search');
 search.value='';search.focus();render();
});
$('filterSpace').addEventListener('change',render);
$('openSpaceFilter')?.addEventListener('click',()=>{
 const dialog=$('spaceFilterDialog');
 dialog.showModal();
 dialog.querySelector('.category-filter-option.selected')?.focus();
});
$('filterCategoryButton').addEventListener('click',()=>{
 const dialog=$('filterCategoryPanel');
 dialog.showModal();
 dialog.querySelector('.category-filter-option.selected')?.focus();
});
$('filterCategoryPanel').addEventListener('keydown',event=>{
 if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
 const options=[...$('categoryFilterOptions').querySelectorAll('.category-filter-option:not([hidden])')];
 if(!options.length)return;
 const current=options.indexOf(document.activeElement);
 let next;
 if(event.key==='Home')next=0;
 else if(event.key==='End')next=options.length-1;
 else if(event.key==='ArrowDown')next=Math.min(current+1,options.length-1);
 else next=Math.max(current-1,0);
 event.preventDefault();options[next].focus();
});
$('clearFilters').addEventListener('click',()=>{closeCategoryFilter();$('search').value='';$('filterSpace').value='';selectedCategoryFilter='';render()});
$('boxSpace').addEventListener('change',()=>{boxSpace=$('boxSpace').value;$('search').value='';render()});
$('newItem').addEventListener('click',()=>{if(tab==='objetos')startObjectPhoto();else openForm(tab)});
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

let welcomeEntered=false;
let welcomeDataReady=false;
let welcomeTimer=null;
function finishWelcomeAnimation(){
 $('welcomeGate').classList.add('animation-finished');clearTimeout(welcomeTimer);
 if(document.activeElement===$('welcomeSkip'))(welcomeDataReady?$('welcomeInventory'):$('welcomeTitle')).focus({preventScroll:true});
}
function skipWelcomeKey(){return 'hondotrastero:saltar-entrada:'+(user?.id||'local')}
function shouldSkipWelcome(){try{return localStorage.getItem(skipWelcomeKey())==='true'}catch{return false}}
$('skipWelcomeAnimation').addEventListener('change',event=>{
 try{localStorage.setItem(skipWelcomeKey(),String(event.target.checked))}catch{event.target.checked=shouldSkipWelcome();alertMsg('No se pudo guardar la preferencia en este dispositivo.')}
});

function setWelcomeVisible(visible){
 const gate=$('welcomeGate'),wasVisible=!gate.classList.contains('d-none');
 show('welcomeGate',visible);document.documentElement.classList.toggle('welcome-open',visible);
 document.querySelector('.parcel-shell').inert=visible;
 if(visible&&!wasVisible){
  gate.classList.remove('animation-finished');
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)finishWelcomeAnimation();
  else welcomeTimer=setTimeout(finishWelcomeAnimation,5000);
  $('welcomeTitle').focus({preventScroll:true});
 }
 if(!visible)clearTimeout(welcomeTimer);
}
function enterFromWelcome(inventariar){
 if(!user||!welcomeDataReady)return;
 welcomeEntered=true;setWelcomeVisible(false);
 administrationOpen=false;tab='objetos';
 inventoryQuickMode=inventariar;$('inventoryQuickMode').checked=inventariar;
 render();
 if(inventariar)startObjectPhoto();
 else{$('newItem').focus({preventScroll:true});window.scrollTo(0,0)}
}
$('welcomeSkip').addEventListener('click',()=>{finishWelcomeAnimation();$('welcomeInventory').focus({preventScroll:true})});
$('welcomeInventory').addEventListener('click',()=>enterFromWelcome(false));
$('welcomeCreate').addEventListener('click',()=>enterFromWelcome(true));
$('welcomeRetry').addEventListener('click',()=>location.reload());
$('welcomeGate').addEventListener('keydown',event=>{
 if(event.key!=='Tab')return;
 const controls=[...$('welcomeGate').querySelectorAll('button')].filter(button=>!button.disabled&&!button.hidden&&getComputedStyle(button).display!=='none');
 if(!controls.length)return;
 const first=controls[0],last=controls[controls.length-1];
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
});

async function sessionChanged(session){
 if(user?.id!==session?.user?.id)sessionObjectSpace='';
 const changedUser=user?.id!==session?.user?.id;
 user=session?.user||null;
 if(changedUser){welcomeEntered=false;welcomeDataReady=false;$('welcomeInventory').disabled=true;$('welcomeCreate').disabled=true;categoryEditingId=null;categoryBusy=false;categoryCatalogReady=false;subscribeCategories();CATEGORIES=[...DEFAULT_CATEGORIES];CATEGORIES_BY_ID=new Map(CATEGORIES.map(cat=>[cat.id,cat]))}
 show('account',!!user);$('account').style.display=user?'flex':'none';
 show('appView',!!user&&$('editPage').classList.contains('d-none'));
 show('loginView',!user&&ready);
 $('skipWelcomeAnimation').checked=shouldSkipWelcome();
 if(user&&!welcomeEntered&&shouldSkipWelcome()){welcomeEntered=true;administrationOpen=false;tab='objetos';inventoryQuickMode=false;$('inventoryQuickMode').checked=false}
 setWelcomeVisible(!!user&&!welcomeEntered);
 if(!user){inventoryQuickMode=false;closeQuickCamera?.();$('inventoryQuickMode').checked=false;administrationOpen=false;show('adminStyleTools',false);$('userEmail').textContent='';return}
 $('userEmail').textContent=user.email||'';
 try{await load();welcomeDataReady=true;$('welcomeInventory').disabled=false;$('welcomeCreate').disabled=false;$('welcomeStatus').textContent='';$('welcomeRetry').hidden=true;clearMsg()}catch(e){$('welcomeStatus').textContent='No se pudo cargar el inventario. Vuelve a intentarlo.';$('welcomeRetry').hidden=false;alertMsg(`Error al cargar el inventario: ${e.message}`)}
}
if(!ready){show('setup',true);return}
client.auth.onAuthStateChange((event,session)=>{setTimeout(()=>sessionChanged(session),0)});
client.auth.getSession().then(({data:{session}})=>sessionChanged(session)).catch(e=>alertMsg(e.message));
})();

