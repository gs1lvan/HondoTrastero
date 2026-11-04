(() => {
'use strict';
const $ = id => document.getElementById(id);
const config = window.HONDO_CONFIG || {};
const ready = !!(config.supabaseUrl && config.supabaseAnonKey);
const client = ready ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const data = {objetos: [], cajas: [], ubicaciones: []};
const names = {objetos:'objeto', cajas:'caja', ubicaciones:'espacio'};
const BUCKET = 'objetos';
const CATEGORIES = Object.freeze([
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
const CATEGORIES_BY_ID = new Map(CATEGORIES.map(cat=>[cat.id,cat]));

let listMode='ampliado';
try{if(localStorage.getItem('hondotrastero:listado')==='reducido')listMode='reducido'}catch{}
let administrationOpen=false;
let boxSpace='';
let tab='objetos', editing=null, user=null, selectedPhoto=null, photoPreviewUrl=null;
let selectedCategoryFilter = ''; // Filtro visual: no modifica las categorías de los objetos.

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
function itemCategories(item){
 // El campo nuevo es una lista de identificadores válidos; no se duplican objetos.
 return Array.isArray(item?.categorias)
  ? [...new Set(item.categorias.filter(id=>CATEGORIES_BY_ID.has(id)))]
  : [];
}
function categoryField(item){
 const selected=new Set(itemCategories(item));
 const field=elem('fieldset','category-field');
 const legend=elem('legend','form-label','Categorías (puedes seleccionar varias)');
 field.append(legend);
 const tip=elem('p','category-tip','Marca todas las categorías que correspondan al objeto.');field.append(tip);
 const counter=elem('p','category-counter');counter.id='categoryCount';
 const search=elem('input','form-control category-search');search.type='search';
 search.id='categorySearch';search.placeholder='Buscar categoría…';search.setAttribute('aria-label','Buscar entre las categorías disponibles');
 const list=elem('div','category-grid');list.id='categoryGrid';
 const rows=[];
 for(const cat of CATEGORIES){
  const label=elem('label','category-choice');
  const checkbox=elem('input','form-check-input');checkbox.type='checkbox';checkbox.name='fieldCategories';checkbox.value=cat.id;checkbox.checked=selected.has(cat.id);
  label.append(checkbox,elem('span','category-choice-label',`${cat.icon} ${cat.name}`));
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
 search.addEventListener('input',()=>{
  const query=search.value.trim().toLocaleLowerCase('es');
  for(const {label,cat} of rows)label.hidden=!cat.name.toLocaleLowerCase('es').includes(query);
 });
 updateCount();field.append(counter,search,list);
 if(item?.categoria?.trim()&&!selected.size){
  const legacy=elem('p','category-legacy',`Categoría anterior: «${item.categoria.trim()}». Asígnale una o varias de las categorías actuales.`);
  field.append(legacy);
 }
 return field;
}
function spaceBoxesField(space){
 const panel=elem('section','space-boxes');
 const list=elem('div','vstack gap-2');
 const label=elem('label','form-label','Nueva caja');label.htmlFor='spaceNewBox';
 const input=elem('input','form-control');input.id='spaceNewBox';input.type='text';input.placeholder='Nombre de la caja';input.maxLength=150;
 const add=elem('button','btn btn-outline-primary mt-2','Añadir caja');add.type='button';
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
  if(!boxes.length)list.append(elem('p','form-text','Este espacio todavía no tiene cajas.'));
  for(const box of boxes){
   const row=elem('div','d-flex align-items-center justify-content-between gap-2');
   row.append(elem('span','',box.nombre));
   const remove=elem('button','btn btn-sm btn-outline-danger','Eliminar');remove.type='button';
   remove.setAttribute('aria-label','Eliminar caja '+box.nombre);
   remove.addEventListener('click',()=>{
    if(busy)return;
    run(async()=>{
     // Consultar el contenido actual antes de permitir el borrado.
     const contents=await client.from('objetos').select('id').eq('caja_id',box.id).limit(1);
     if(contents.error)throw contents.error;
     if(contents.data?.length){message.textContent='Esta caja contiene objetos. Muévelos antes de eliminarla.';return}
     if(!confirm('¿Eliminar la caja «'+box.nombre+'»?'))return;
     const result=await client.from('cajas').delete().eq('id',box.id);
     if(result.error)throw result.error;
     message.textContent='Caja eliminada.';
    });
   });
   row.append(remove);list.append(row);
  }
 }
 add.addEventListener('click',()=>{
  const name=input.value.trim();
  if(!name){message.textContent='Escribe el nombre de la caja.';input.focus();return}
  run(async()=>{
   const result=await client.from('cajas').insert({nombre:name,ubicacion_id:space.id,descripcion:null});
   if(result.error)throw result.error;
   input.value='';message.textContent='Caja añadida.';
  });
 });
 input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();add.click()}});
 paint();panel.append(list,label,input,add,message);return panel;
}

function openForm(type=tab,item=null){
 closeCategoryFilter();
 clearMsg();editing={type,id:item?.id||null};selectedPhoto=null;
 show('deleteObjectBtn',type==='objetos'&&!!item?.id);
 if(photoPreviewUrl){URL.revokeObjectURL(photoPreviewUrl);photoPreviewUrl=null}
 const root=$('modalFields');root.replaceChildren();
 if(type==='objetos')root.append(photoField(item));
 $('modalTitle').textContent=(item?'Editar ':'Añadir ')+names[type];
 root.append(inputField('fieldName','Nombre',item?.nombre));
 if(type==='cajas')root.append(inputField('fieldDesc','Descripción (opcional)',item?.descripcion||'','text',false));
 if(type==='ubicaciones'){
  const extra=elem('details','space-extra-fields');
  const summary=elem('summary','form-label','Descripción | Espacio superior');
  summary.style.cursor='pointer';
  const fields=elem('div','vstack gap-3 mt-3');
  fields.append(inputField('fieldDesc','Descripción (opcional)',item?.descripcion||'','text',false));
  fields.append(selectField('fieldParent','Espacio superior (opcional)',data.ubicaciones.filter(x=>x.id!==item?.id),true,item?.ubicacion_padre_id));
  fields.addEventListener('invalid',()=>{extra.open=true},true);
  extra.append(summary,fields);root.append(extra);
 }
 if(type==='ubicaciones'&&item?.id)root.append(spaceBoxesField(item));
 if(type==='cajas')root.append(selectField('fieldLocation','Espacio',data.ubicaciones,false,item?.ubicacion_id||boxSpace||localStorage.getItem(lastLocationKey())));
 if(type==='objetos'){
  const extra=elem('details','object-extra-fields');
  const summary=elem('summary','form-label','Descripción | Cantidad');
  summary.style.cursor='pointer';
  const fields=elem('div','vstack gap-3 mt-3');
  fields.append(inputField('fieldDesc','Descripción (opcional)',item?.descripcion||'','text',false));
  fields.append(inputField('fieldQty','Cantidad',item?.cantidad??1,'number'));
  extra.append(summary,fields);
  // Abrir el panel si la validación necesita mostrar un campo oculto.
  fields.addEventListener('invalid',()=>{extra.open=true},true);
  root.append(extra);
  const categoriesPanel=elem('details','object-category-panel');
  categoriesPanel.open=!item;
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
  root.append(categoriesPanel);
  const wrap=elem('div');
  const initialBox=data.cajas.find(b=>b.id===item?.caja_id);
  const initialSpace=initialBox?.ubicacion_id||item?.ubicacion_id||localStorage.getItem(lastLocationKey())||'';
  wrap.append(selectField('fieldLocation','Espacio',data.ubicaciones,false,initialSpace));
  wrap.append(selectField('fieldBox','Caja (opcional)',[],true));
  wrap.className='vstack gap-3 mt-3';
  const movePanel=elem('details','object-move-panel');
  const moveSummary=elem('summary','form-label','Mover objeto');
  moveSummary.style.cursor='pointer';
  movePanel.append(moveSummary,wrap);
  wrap.addEventListener('invalid',()=>{movePanel.open=true},true);
  root.append(movePanel);
  const loc=$('fieldLocation'),box=$('fieldBox');
  function refreshBoxes(selected=''){
   box.replaceChildren(new Option('Sin caja', ''));
   for(const entry of data.cajas.filter(b=>b.ubicacion_id===loc.value).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'))){
    box.add(new Option(entry.nombre,entry.id));
   }
   box.value=[...box.options].some(o=>o.value===selected)?selected:'';
  }
  refreshBoxes(item?.caja_id||'');
  loc.addEventListener('change',()=>refreshBoxes(box.value));
  box.addEventListener('change',()=>{
   const selected=data.cajas.find(b=>b.id===box.value);
   if(selected)loc.value=selected.ubicacion_id;
  });
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
function closeCategoryFilter(focusTrigger=false){
 const panel=$('filterCategoryPanel'),trigger=$('filterCategoryButton');
 if(panel.hidden)return;
 if(document.activeElement===$('categoryFilterSearch'))$('categoryFilterSearch').blur();
 panel.hidden=true;
 trigger.setAttribute('aria-expanded','false');
 $('categoryFilterSearch').value='';
 if(focusTrigger)trigger.focus({preventScroll:true});
}
function toggleCategoryFilter(){
 const panel=$('filterCategoryPanel'),trigger=$('filterCategoryButton');
 if(!panel.hidden){closeCategoryFilter(true);return}
 panel.hidden=false;
 trigger.setAttribute('aria-expanded','true');
 $('categoryFilterSearch').value='';
 $('categoryFilterOptions').scrollTop=0;
 filterCategoryOptions();
 // No enfocamos la búsqueda: Android mostrará el teclado solamente cuando el usuario toque Buscar categoría.
}
function filterCategoryOptions(){
 const term=normalizarCategoria($('categoryFilterSearch').value.trim());
 let count=0;
 for(const row of $('categoryFilterOptions').querySelectorAll('.category-filter-option')){
  row.hidden=!normalizarCategoria(row.dataset.categoryName).includes(term);
  if(!row.hidden)count++;
 }
 $('categoryFilterNoMatch').hidden=count!==0;
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
 space.replaceChildren(new Option(`Todos los espacios (${total})`,''));
 for(const item of [...data.ubicaciones].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'))){
  space.add(new Option(`${item.nombre} (${spaceCounts.get(item.id)||0})`,item.id));
 }
 space.value=[...space.options].some(o=>o.value===oldSpace)?oldSpace:'';
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
  const icon=elem('span','category-option-icon',option.icon);icon.setAttribute('aria-hidden','true');
  const name=elem('span','category-option-name',option.name);
  const count=elem('span','category-option-count',String(option.count));
  const tick=elem('span','category-option-check',option.value===selectedCategoryFilter?'✓':'');tick.setAttribute('aria-hidden','true');
  row.append(icon,name,count,tick);
  row.addEventListener('click',()=>chooseCategoryFilter(option.value));
  list.append(row);
 }
 list.scrollTop=oldScroll;
 filterCategoryOptions();
}
function refreshBoxSpaces(){
 show('boxSpacePanel',tab==='cajas');
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
function render(){
 $('records').classList.toggle('records-reduced',listMode==='reducido');
 $('appView').classList.toggle('listing-compact',listMode==='reducido');
 refreshBoxSpaces();
 show('adminStyleTools',administrationOpen);
 const managingSpaces=tab==='ubicaciones';
 show('inventoryToolbar',tab==='objetos'||(tab==='cajas'&&!!boxSpace));
 $('newItem').lastChild.textContent=' Añadir '+names[tab];
 show('newItem',tab!=='cajas'||!!boxSpace);
 refreshInventoryFilters();
 $('countObjects').textContent=data.objetos.length;
 $('countBoxes').textContent=data.cajas.length;
 $('countLocations').textContent=data.ubicaciones.length;
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 const heading=$('sectionTitle');heading.textContent=tab==='objetos'?'📦 Inventario':tab==='cajas'?'▤ Cajas':'▥ Espacios';
 const q=$('search').value.trim().toLocaleLowerCase('es');
 const selectedSpace=$('filterSpace').value,selectedCategory=selectedCategoryFilter;
 const parents=spaceParents();
 const rows=data[tab].filter(item=>{
  if(!`${item.nombre} ${item.descripcion||''}`.toLocaleLowerCase('es').includes(q))return false;
  if(tab==='cajas')return !!boxSpace&&item.ubicacion_id===boxSpace;
  if(tab!=='objetos')return true;
  if(selectedSpace&&!belongsToSpace(item,selectedSpace,parents))return false;
  const cats=itemCategories(item);
  if(selectedCategory&&(selectedCategory==='__sin_categoria__'?cats.length>0:!cats.includes(selectedCategory)))return false;
  return true;
 });
 const root=$('records');root.replaceChildren();show('empty',rows.length===0);
 $('empty').textContent=tab==='cajas'?(!boxSpace?'Selecciona un espacio para ver sus cajas.':'Este espacio no tiene cajas. Pulsa Añadir caja para crear la primera.'):'Todavía no hay registros en esta sección.';
 for(const item of rows){
  const line=elem('div','list-group-item record');
  if(tab==='objetos'||tab==='ubicaciones'||listMode==='reducido'){
   const recordType=tab;
   line.style.cursor='pointer';
   line.tabIndex=0;
   line.setAttribute('aria-label','Editar '+names[recordType]+' '+item.nombre);
   line.addEventListener('click',event=>{
    if(event.target.closest('button,a,input,select,textarea,summary'))return;
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
  if(tab==='ubicaciones'){
   const boxes=data.cajas.filter(box=>box.ubicacion_id===item.id)
    .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
   if(boxes.length)main.append(elem('div','record-detail space-box-list',boxes.map(box=>box.nombre).join(' | ')));
  }
  let detail=item.descripcion||'';
  if(tab==='objetos'){
   const cats=itemCategories(item).map(id=>CATEGORIES_BY_ID.get(id));
   detail=[`×${item.cantidad}`,item.caja_id?`${locationLabel(objectSpace(item))} | ${boxLabel(item.caja_id)}`:locationLabel(item.ubicacion_id),detail].filter(Boolean).join(' · ');
   const group=elem('div','record-categories');
   for(const cat of cats){
    const badge=elem('span','record-category',cat.icon);
    badge.title=cat.name;
    badge.setAttribute('role','img');
    badge.setAttribute('aria-label',cat.name);
    group.append(badge);
   }
   if(!cats.length&&item.categoria?.trim())group.append(elem('span','record-category-legacy',`Pendiente de clasificar (antes: ${item.categoria.trim()})`));
   if(group.childElementCount)main.append(group);
  }
  if(tab==='cajas')detail=[locationLabel(item.ubicacion_id),detail].filter(Boolean).join(' · ');
  if(tab==='ubicaciones'&&item.ubicacion_padre_id)detail=[`Dentro de ${locationLabel(item.ubicacion_padre_id)}`,detail].filter(Boolean).join(' · ');
  if(detail)main.append(elem('div','record-detail',detail));
  if(listMode==='reducido'){
   const concepts=[item.nombre];
   if(tab==='objetos'){
    concepts.push('×'+item.cantidad,locationLabel(objectSpace(item)));
    if(item.caja_id)concepts.push(boxLabel(item.caja_id));
    const icons=itemCategories(item).map(id=>CATEGORIES_BY_ID.get(id).icon).join(' ');
    if(icons)concepts.push(icons);
   }
   if(tab==='cajas')concepts.push(locationLabel(item.ubicacion_id));
   if(tab==='ubicaciones'){
    concepts.push(...data.cajas.filter(box=>box.ubicacion_id===item.id).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).map(box=>box.nombre));
    if(item.ubicacion_padre_id)concepts.push(locationLabel(item.ubicacion_padre_id));
   }
   if(item.descripcion)concepts.push(item.descripcion);
   main.replaceChildren(elem('span','record-compact-text',concepts.join(' | ')));
  }
  const actions=elem('div','record-actions');
  const edit=elem('button','btn btn-sm btn-outline-primary','Editar');edit.type='button';edit.addEventListener('click',()=>openForm(tab,item));
  const del=elem('button','btn btn-sm btn-outline-danger','Eliminar');del.type='button';del.addEventListener('click',()=>removeItem(tab,item));
  if(listMode==='reducido'){
   del.textContent='×';
   del.title='Eliminar '+item.nombre;
   del.setAttribute('aria-label','Eliminar '+item.nombre);
   if(tab!=='objetos')actions.append(del);
  }else actions.append(edit,del);
  line.append(main,actions);root.append(line);
 }
}
async function removeItem(type,item){
 if(type==='cajas'&&data.objetos.some(obj=>obj.caja_id===item.id)){alertMsg('Esta caja contiene objetos. Muévelos a otro espacio o caja antes de eliminarla.','warning');return}
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
  // Se guarda una única ficha con todas sus categorías; no se crean copias.
  payload.categorias=[...document.querySelectorAll('input[name="fieldCategories"]:checked')].map(el=>el.value);
  if(payload.categorias.some(id=>!CATEGORIES_BY_ID.has(id)) || new Set(payload.categorias).size!==payload.categorias.length){
   alertMsg('Hay una categoría no válida o duplicada.');return;
  }
  if(!payload.ubicacion_id){alertMsg('Selecciona un espacio.');return}
  if(payload.caja_id){
   const selectedBox=data.cajas.find(box=>box.id===payload.caja_id);
   if(!selectedBox||selectedBox.ubicacion_id!==payload.ubicacion_id){
    alertMsg('La caja seleccionada no pertenece a este espacio.');return;
   }
   // El espacio se obtiene de la caja: conserva el modelo exclusivo de la base de datos.
   payload.ubicacion_id=null;
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
  alertMsg(err.message?.includes('categorias')?'Para usar categorías múltiples, ejecuta primero 01_categorias_multiples.sql en Supabase.':'No se pudo guardar: '+err.message);
  return;
 }
 $('saveBtn').disabled=false;
 if(type==='cajas')boxSpace=payload.ubicacion_id;
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
 administrationOpen=false;
 closeCategoryFilter();tab=b.dataset.tab;$('search').value='';render();
});
$('manageSpaces').addEventListener('click',()=>{
 const spacesTab=document.querySelector('[data-tab="ubicaciones"]');
 spacesTab.click();
 administrationOpen=true;
 render();
 spacesTab.focus();
});
const listDialog=$('listMenu');
$('openList').addEventListener('click',()=>listDialog.showModal());
$('closeList').addEventListener('click',()=>listDialog.close());
function syncListChoices(){
 document.querySelectorAll('[data-list-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.listMode===listMode)));
}
document.querySelectorAll('[data-list-mode]').forEach(button=>button.addEventListener('click',()=>{
 listMode=button.dataset.listMode;
 try{localStorage.setItem('hondotrastero:listado',listMode)}catch{}
 syncListChoices();render();listDialog.close();
}));
syncListChoices();
$('search').addEventListener('input',render);
$('filterSpace').addEventListener('change',render);
$('filterCategoryButton').addEventListener('click',toggleCategoryFilter);
$('closeCategoryFilter').addEventListener('click',()=>closeCategoryFilter(true));
$('categoryFilterSearch').addEventListener('input',filterCategoryOptions);
$('filterCategoryPanel').addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();closeCategoryFilter(true);return}
 if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
 // Desde el buscador, Flecha abajo entra en la lista.
 if(event.target===$('categoryFilterSearch')&&event.key!=='ArrowDown')return;
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
document.addEventListener('pointerdown',event=>{
 if($('filterCategoryPanel').hidden)return;
 if($('filterCategoryPanel').contains(event.target)||$('filterCategoryWrap').contains(event.target))return;
 closeCategoryFilter();
});
$('clearFilters').addEventListener('click',()=>{closeCategoryFilter();$('search').value='';$('filterSpace').value='';selectedCategoryFilter='';render()});
$('boxSpace').addEventListener('change',()=>{boxSpace=$('boxSpace').value;$('search').value='';render()});
$('newItem').addEventListener('click',()=>{if(tab==='cajas'&&!boxSpace)return;openForm(tab)});
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
 if(!user){administrationOpen=false;show('adminStyleTools',false);$('userEmail').textContent='';return}
 $('userEmail').textContent=user.email||'';
 try{await load();clearMsg()}catch(e){alertMsg(`Error al cargar el inventario: ${e.message}`)}
}
if(!ready){show('setup',true);return}
client.auth.onAuthStateChange((event,session)=>{setTimeout(()=>sessionChanged(session),0)});
client.auth.getSession().then(({data:{session}})=>sessionChanged(session)).catch(e=>alertMsg(e.message));
})();
