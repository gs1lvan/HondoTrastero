/* HondoTrastero: formato de copia portable. Sin sesiones ni contraseñas. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.HondoBackup=api;
})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const TABLES=['ubicaciones','cajas','objetos','categorias'];
 const MAX_BYTES=512*1024*1024, MAX_PHOTO_BYTES=20*1024*1024;
 const PREFS=['estilo','listado','orden','terminal-tipografia','terminal-brillo','terminal-tono','terminal-saturacion',
  'terminal-intensidad-fondo','terminal-transparencia-nombre','ultimo-nombre-automatico'];
 const own=(o,key)=>Object.prototype.hasOwnProperty.call(o,key);
 function assert(value,message){if(!value)throw new Error(message)}
 function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  return JSON.stringify(value);
 }
 const same=(a,b)=>canonical(a)===canonical(b);
 async function sha256(bytes){return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('')}
 function photoType(bytes){
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {mime:'image/jpeg',ext:'jpg'};
  if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return {mime:'image/png',ext:'png'};
  // Los bytes 4–7 son un tamaño binario, no texto. Decodificar todo como UTF-8
  // puede acortarlos y desplazar WEBP aunque la fotografía sea válida.
  if(bytes.length>=12&&bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70
   &&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80)return {mime:'image/webp',ext:'webp'};
  throw new Error('Una fotografía no tiene un formato compatible (JPG, PNG o WebP).');
 }
 function missingFunction(error){return ['PGRST202','42883'].includes(error?.code)}
 async function readTables(client){
  const tables={};
  for(const name of TABLES){
   tables[name]=[];
   for(let offset=0;;){
    const {data,error}=await client.from(name).select('*').order('id').range(offset,offset+499);
    if(error)throw new Error('No se pudo leer '+name+': '+error.message);
    assert(Array.isArray(data),'Respuesta incompleta al leer '+name+'.');
    tables[name].push(...data);
    // Continuar hasta una página vacía: respeta también límites de API inferiores a 500.
    if(!data.length)break;
    offset+=data.length;
   }
  }
  return tables;
 }
 async function readSnapshot(client){
  const {data,error}=await client.rpc('hondo_backup_snapshot');
  if(!error){assert(data&&TABLES.every(t=>Array.isArray(data[t])),'No se pudo obtener el inventario. Comprueba la sesión.');return data}
  if(!missingFunction(error))throw new Error('No se pudo leer el inventario: '+error.message);
  // Permitir descargar copias antes de activar la función SQL. Doble lectura y
  // otra comprobación al acabar las fotos para detectar modificaciones concurrentes.
  const first=await readTables(client),second=await readTables(client);
  assert(same(first,second),'El inventario ha cambiado durante la copia. Vuelve a intentarlo.');
  return first;
 }
 function preferenceKeys(userId){
  return [...PREFS.map(k=>'hondotrastero:'+k),...['espacio-defecto:','orden-espacios:','last-location:','saltar-entrada:'].map(k=>'hondotrastero:'+k+userId)];
 }
 function allowedPreference(key,userId){
  return preferenceKeys(userId).includes(key)||key.startsWith('hondotrastero:subespacio-defecto:'+userId+':');
 }
 function preferences(storage,userId){
  const result={};
  if(!storage)return result;
  for(let i=0;i<storage.length;i++){
   const key=storage.key(i);
   if(key&&allowedPreference(key,userId))result[key]=storage.getItem(key);
  }
  return result;
 }
 function applyPreferences(storage,userId,values){
  const keys=[];
  for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key&&allowedPreference(key,userId))keys.push(key)}
  for(const key of keys)storage.removeItem(key);
  for(const [key,value] of Object.entries(values))if(allowedPreference(key,userId))storage.setItem(key,value);
 }
 function validateTables(tables){
  assert(tables&&typeof tables==='object','Faltan los datos de la copia.');
  const ids={};
  for(const name of TABLES){
   const rows=tables[name];
   assert(Array.isArray(rows),'Falta la tabla '+name+'.');
   ids[name]=new Set();
   for(const row of rows){
    assert(row&&typeof row==='object'&&!Array.isArray(row)&&typeof row.id==='string'&&row.id.length>0,'Registro incorrecto en '+name+'.');
    assert(!ids[name].has(row.id),'Identificador duplicado en '+name+'.');ids[name].add(row.id);
    assert(typeof row.nombre==='string'&&row.nombre.trim(),'Hay un registro sin nombre en '+name+'.');
   }
  }
  const parents=new Map(tables.ubicaciones.map(r=>[r.id,r.ubicacion_padre_id]));
  for(const row of tables.ubicaciones){
   const visited=new Set([row.id]);let parent=row.ubicacion_padre_id;
   while(parent){
    assert(ids.ubicaciones.has(parent),'Falta el espacio padre de '+row.nombre+'.');
    assert(!visited.has(parent),'Hay un ciclo entre espacios.');visited.add(parent);parent=parents.get(parent);
   }
  }
  for(const row of tables.cajas)assert(ids.ubicaciones.has(row.ubicacion_id),'Falta el espacio de un subespacio.');
  for(const row of tables.objetos){
   assert(!!row.ubicacion_id!==!!row.caja_id,'Un objeto debe pertenecer a un espacio o a un subespacio.');
   if(row.ubicacion_id)assert(ids.ubicaciones.has(row.ubicacion_id),'Falta el espacio de un objeto.');
   if(row.caja_id)assert(ids.cajas.has(row.caja_id),'Falta el subespacio de un objeto.');
   if(row.categorias!=null){
    assert(Array.isArray(row.categorias)&&new Set(row.categorias).size===row.categorias.length,'Categorías incorrectas.');
    for(const id of row.categorias)assert(ids.categorias.has(id),'Falta una categoría de un objeto.');
   }
   assert(row.foto_path==null||(typeof row.foto_path==='string'&&row.foto_path.length>0),'Ruta de fotografía incorrecta.');
  }
  return tables;
 }
 function counts(tables){return {...Object.fromEntries(TABLES.map(name=>[name,tables[name].length])),fotos:new Set(tables.objetos.map(r=>r.foto_path).filter(Boolean)).size}}
 function contextCheck(manifest,context){
  assert(manifest.app==='HondoTrastero'&&manifest.version===1,'El archivo no es una copia compatible de HondoTrastero.');
  assert(manifest.source?.project===context.project,'La copia pertenece a otro servidor de HondoTrastero.');
  assert(manifest.source?.userId===context.userId,'Inicia sesión con la cuenta que creó esta copia.');
  assert(typeof manifest.createdAt==='string'&&Number.isFinite(Date.parse(manifest.createdAt)),'La fecha de la copia no es válida.');
 }
 async function retry(operation){
  let last;
  for(let i=0;i<3;i++)try{return await operation()}catch(error){last=error}
  throw last;
 }
 async function createArchive(client,context,{JSZip,storage,onProgress=()=>{},assertSession=()=>{},snapshot}={}){
  assert(JSZip,'No se pudo cargar la herramienta ZIP.');assertSession();onProgress('Preparando datos…',0);
  const tables=snapshot||await readSnapshot(client);validateTables(tables);
  const zip=new JSZip(),files=[],photoPaths=[...new Set(tables.objetos.map(row=>row.foto_path).filter(Boolean))];
  let bytesTotal=0;
  async function add(name,bytes,extra={}){
   bytesTotal+=bytes.length;assert(bytesTotal<=MAX_BYTES,'La copia supera 512 MB. Hazla desde un equipo con más capacidad mediante una copia técnica.');
   zip.file(name,bytes);files.push({name,size:bytes.length,sha256:await sha256(bytes),...extra});
  }
  const settings=preferences(storage,context.userId);
  await add('datos.json',new TextEncoder().encode(JSON.stringify({tables,preferences:settings})));
  for(let i=0;i<photoPaths.length;i++){
   assertSession();onProgress('Descargando fotografías: '+(i+1)+' de '+photoPaths.length+'…',photoPaths.length?5+80*i/photoPaths.length:85);
   const path=photoPaths[i];
   try{
    const blob=await retry(async()=>{const {data,error}=await client.storage.from('objetos').download(path);if(error)throw new Error('No se pudo descargar una fotografía. Reintenta la copia. '+error.message);assert(data?.size>0,'Una fotografía está vacía.');return data});
    assert(blob.size<=MAX_PHOTO_BYTES,'Una fotografía supera 20 MB.');
    const bytes=new Uint8Array(await blob.arrayBuffer()),type=photoType(bytes);
    await add('fotografias/'+String(i+1).padStart(6,'0')+'.'+type.ext,bytes,{originalPath:path,mime:type.mime});
   }catch(error){
    const object=tables.objetos.find(row=>row.foto_path===path);
    throw new Error('No se pudo incluir la foto de «'+object.nombre+'» ('+path+'): '+error.message);
   }
  }
  assertSession();onProgress('Comprobando que el inventario no ha cambiado…',87);
  assert(same(tables,await readSnapshot(client)),'El inventario ha cambiado durante la copia. Vuelve a intentarlo.');
  const manifest={app:'HondoTrastero',version:1,createdAt:new Date().toISOString(),source:{project:context.project,userId:context.userId},scope:'visible-inventory',counts:counts(tables),files};
  zip.file('manifest.json',JSON.stringify(manifest,null,2));
  zip.file('LEEME.txt','Copia de HondoTrastero. Conserva el ZIP completo. Incluye los registros accesibles a la cuenta que lo creó, fotografías vinculadas, catálogo y preferencias de este dispositivo. No incluye usuarios, contraseñas, archivos huérfanos ni configuración interna de Supabase. Para restaurar: Administrar > Copias de seguridad, con la misma cuenta y servidor. Las categorías existentes se conservan porque el catálogo es compartido.');
  onProgress('Preparando el archivo ZIP…',90);
  const archive=await zip.generateAsync({type:'uint8array',compression:'STORE',streamFiles:true},info=>onProgress('Preparando el archivo ZIP…',90+info.percent*.1));
  assertSession();return {archive,manifest,tables,preferences:settings};
 }
 async function readArchive(input,context,{JSZip,onProgress=()=>{}}={}){
  assert(JSZip,'No se pudo cargar la herramienta ZIP.');
  const size=input.size??input.byteLength;assert(size>0&&size<=MAX_BYTES+8*1024*1024,'Selecciona un ZIP de hasta 512 MB.');
  const bytes=typeof input.arrayBuffer==='function'?await input.arrayBuffer():input;
  let zip;
  try{zip=await JSZip.loadAsync(bytes)}catch{throw new Error('No se pudo abrir el ZIP. Puede estar dañado.')}
  const entries=Object.values(zip.files);let expanded=0;
  for(const entry of entries){
   assert(!entry.unsafeOriginalName||entry.unsafeOriginalName===entry.name,'El ZIP contiene rutas incorrectas.');
   expanded+=entry._data?.uncompressedSize||0;
   assert(expanded<=MAX_BYTES+8*1024*1024,'El contenido del ZIP supera el límite de 512 MB.');
  }
  const manifestEntry=zip.file('manifest.json');
  assert(manifestEntry&&(manifestEntry._data?.uncompressedSize||0)<=2*1024*1024,'Falta el manifiesto o es demasiado grande.');
  let manifest;
  try{manifest=JSON.parse(await manifestEntry.async('string'))}catch{throw new Error('El manifiesto de la copia no es válido.')}
  contextCheck(manifest,context);
  assert(Array.isArray(manifest.files)&&manifest.files.length>0,'La lista de archivos está vacía.');
  const names=new Set(),originals=new Set(),photos=new Map();let body;
  for(let i=0;i<manifest.files.length;i++){
   const file=manifest.files[i];
   assert(file&&typeof file.name==='string'&&!names.has(file.name),'Lista de archivos incorrecta.');names.add(file.name);
   assert(file.name==='datos.json'||/^fotografias\/\d{6,}\.(jpg|png|webp)$/.test(file.name),'Archivo inesperado en la copia.');
   assert(Number.isSafeInteger(file.size)&&file.size>0&&/^[a-f0-9]{64}$/.test(file.sha256),'Metadatos de archivo incorrectos.');
   assert(file.size<=(file.name==='datos.json'?25*1024*1024:MAX_PHOTO_BYTES),'Un archivo de la copia es demasiado grande.');
   const entry=zip.file(file.name);assert(entry,'Falta el archivo '+file.name+'.');
   assert(entry._data.uncompressedSize===file.size,'El tamaño de '+file.name+' no coincide.');
   onProgress('Comprobando archivos: '+(i+1)+' de '+manifest.files.length+'…',100*(i+1)/manifest.files.length);
   const content=await entry.async('uint8array');
   assert(await sha256(content)===file.sha256,'El archivo '+file.name+' está dañado o ha sido modificado.');
   if(file.name==='datos.json'){
    try{body=JSON.parse(new TextDecoder().decode(content))}catch{throw new Error('Los datos del inventario no son válidos.')}
   }else{
    const type=photoType(content);
    assert(file.mime===type.mime&&file.name.endsWith('.'+type.ext),'Formato de fotografía incorrecto.');
    assert(typeof file.originalPath==='string'&&file.originalPath&&!originals.has(file.originalPath),'Fotografía duplicada o sin referencia.');
    originals.add(file.originalPath);photos.set(file.originalPath,{bytes:content,mime:type.mime,ext:type.ext,sha256:file.sha256});
   }
  }
  assert(names.has('datos.json'),'Falta el inventario.');
  assert(entries.every(e=>e.dir||names.has(e.name)||['manifest.json','LEEME.txt'].includes(e.name)),'El ZIP contiene archivos no declarados.');
  validateTables(body?.tables);
  const paths=new Set(body.tables.objetos.map(r=>r.foto_path).filter(Boolean));
  assert(paths.size===photos.size&&[...paths].every(path=>photos.has(path)),'Faltan fotografías o hay fotografías sin objeto.');
  assert(same(counts(body.tables),manifest.counts),'Los recuentos no coinciden con el inventario.');
  assert(body.preferences&&typeof body.preferences==='object'&&!Array.isArray(body.preferences),'Preferencias no válidas.');
  for(const [key,value] of Object.entries(body.preferences))assert(allowedPreference(key,context.userId)&&typeof value==='string'&&value.length<=100000,'La copia contiene preferencias no permitidas.');
  return {manifest,tables:body.tables,preferences:body.preferences,photos};
 }
 function payloadFor(tables,context){return {app:'HondoTrastero',version:1,project:context.project,userId:context.userId,tables}}
 async function restorePreflight(client,context,copy,expected){
  const {data,error}=await client.rpc('hondo_restore_backup',{payload:payloadFor(copy.tables,context),expected,dry_run:true});
  if(error){
   if(missingFunction(error))throw Object.assign(new Error('Falta activar la restauración en Supabase. Descarga y ejecuta una vez el SQL de activación.'),{needsSetup:true});
   throw new Error('No se puede restaurar: '+error.message);
  }
  assert(data?.ready===true,'El servidor no ha confirmado que pueda restaurar.');
 }
 async function restoreArchive(client,context,copy,expected,{onProgress=()=>{},assertSession=()=>{},onPrepared=async()=>{}}={}){
  assertSession();await restorePreflight(client,context,copy,expected);
  const tables=structuredClone(copy.tables),batch=globalThis.crypto.randomUUID(),paths=new Map();let done=0;
  // Nunca se sobrescriben ni se borran las fotos actuales. Si falla una subida,
  // los datos todavía no han cambiado. Las rutas nuevas permiten reintentar.
  for(const [oldPath,photo] of copy.photos){
   assertSession();onProgress('Preparando fotografías: '+(++done)+' de '+copy.photos.size+'…',70*done/Math.max(1,copy.photos.size));
   const path=context.userId+'/restauraciones/'+batch+'/'+String(done).padStart(6,'0')+'.'+photo.ext;
   const {error}=await client.storage.from('objetos').upload(path,new Blob([photo.bytes],{type:photo.mime}),{contentType:photo.mime,upsert:false});
   if(error)throw new Error('No se pudo preparar una fotografía. El inventario no se ha sustituido. '+error.message);
   const downloaded=await client.storage.from('objetos').download(path);
   if(downloaded.error||!downloaded.data||await sha256(await downloaded.data.arrayBuffer())!==photo.sha256)throw new Error('No se pudo verificar una fotografía subida. El inventario no se ha sustituido.');
   paths.set(oldPath,path);
  }
  for(const row of tables.objetos)if(row.foto_path)row.foto_path=paths.get(row.foto_path);
  assertSession();onProgress('Restaurando el inventario…',85);
  // Guardar la intención antes de enviar: si se pierde la respuesta, al volver
  // se compara el inventario con estas rutas y nunca se borra una foto en uso.
  await onPrepared(tables);
  let response;
  try{response=await client.rpc('hondo_restore_backup',{payload:payloadFor(tables,context),expected,dry_run:false})}
  catch{throw Object.assign(new Error('Se perdió la conexión. Comprueba el resultado antes de reintentar.'),{uncertain:true})}
  if(response.error)throw Object.assign(new Error('No se confirmó la restauración. '+response.error.message),{uncertain:true});
  assert(response.data?.restored===true,'El servidor no confirmó la restauración. Comprueba el resultado.');
  onProgress('Comprobando el inventario restaurado…',95);
  let actual;
  try{actual=await readSnapshot(client)}catch{throw Object.assign(new Error('El servidor restauró los datos, pero no se pudo comprobar el resultado. Vuelve a conectar.'),{uncertain:true})}
  assert(matchesRestored(actual,tables),'La restauración terminó, pero hay cambios posteriores o datos que no coinciden. Comprueba el inventario.');
  onProgress('Restauración completada.',100);return {tables,actual};
 }
 function matchesRestored(actual,target){
  // Los disparadores del servidor pueden actualizar fechas de modificación.
  const clean=rows=>rows.map(r=>Object.fromEntries(Object.entries(r).filter(([key])=>!['actualizado_en','actualizado_por','updated_at'].includes(key)))).sort((a,b)=>a.id.localeCompare(b.id));
  return ['ubicaciones','cajas','objetos'].every(t=>same(clean(actual[t]),clean(target[t])));
 }
 return {TABLES,MAX_BYTES,canonical,same,sha256,counts,validateTables,readSnapshot,createArchive,readArchive,
  restorePreflight,restoreArchive,matchesRestored,preferences,applyPreferences};
});
