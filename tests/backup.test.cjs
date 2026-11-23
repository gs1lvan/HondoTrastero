'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const backup=require('../backup.js');
const JSZip=require('../vendor/jszip.min.js');
const context={project:'https://example.supabase.co',userId:'11111111-1111-4111-8111-111111111111'};
const image=new Uint8Array([255,216,255,224,0,2,255,217]);
const tables=()=>({ubicaciones:[{id:'u1',nombre:'Casa',ubicacion_padre_id:null}],cajas:[{id:'c1',nombre:'Armario',ubicacion_id:'u1'}],
 objetos:[{id:'o1',nombre:'Caja de herramientas',ubicacion_id:null,caja_id:'c1',categorias:['herramientas'],palabras_clave:['alicates','metro'],foto_path:'original/foto.jpg'}],
 categorias:[{id:'herramientas',nombre:'Herramientas',icono:'🔧'}]});
function clientFor(rows){return {rpc:async()=>({data:structuredClone(rows)}),storage:{from:()=>({download:async()=>({data:new Blob([image])})})}}}
async function archive(){return backup.createArchive(clientFor(tables()),context,{JSZip})}

test('ZIP completo conserva relaciones, palabras clave y fotografía original',async()=>{
 const result=await archive(),read=await backup.readArchive(result.archive,context,{JSZip});
 assert.deepEqual(read.tables,tables());assert.equal(read.photos.size,1);
 assert.deepEqual(read.photos.get('original/foto.jpg').bytes,image);
 assert.equal(result.manifest.counts.objetos,1);
});
test('rechaza fotografía alterada, ausente y ZIP ajeno',async()=>{
 const result=await archive();
 await assert.rejects(backup.readArchive(result.archive,{...context,userId:'otro'},{JSZip}),/cuenta/);
 await assert.rejects(backup.readArchive(result.archive,{...context,project:'otro'},{JSZip}),/servidor/);
 let zip=await JSZip.loadAsync(result.archive);zip.file('fotografias/000001.jpg',new Uint8Array([255,216,255,224,0,2,0,0]));
 await assert.rejects(backup.readArchive(await zip.generateAsync({type:'uint8array'}),context,{JSZip}),/dañado/);
 zip=await JSZip.loadAsync(result.archive);zip.remove('fotografias/000001.jpg');
 await assert.rejects(backup.readArchive(await zip.generateAsync({type:'uint8array'}),context,{JSZip}),/Falta el archivo/);
});
test('rechaza ciclos, identificadores duplicados y referencias incompletas',()=>{
 const cyclic=tables();cyclic.ubicaciones[0].ubicacion_padre_id='u1';assert.throws(()=>backup.validateTables(cyclic),/ciclo/);
 const missing=tables();missing.objetos[0].caja_id='ausente';assert.throws(()=>backup.validateTables(missing),/subespacio/);
 const duplicate=tables();duplicate.objetos.push({...duplicate.objetos[0]});assert.throws(()=>backup.validateTables(duplicate),/duplicado/);
});
test('un fallo de foto o cambio concurrente impide producir una copia completa',async()=>{
 let reads=0;
 const client=clientFor(tables());
 client.rpc=async()=>({data:reads++?{...tables(),objetos:[]}:tables()});
 await assert.rejects(backup.createArchive(client,context,{JSZip}),/ha cambiado/);
 const failure=clientFor(tables());failure.storage.from=()=>({download:async()=>({error:{message:'sin conexión'}})});
 await assert.rejects(backup.createArchive(failure,context,{JSZip}),/descargar/);
});
test('lectura paginada recupera más de 1000 filas con un límite de API reducido',async()=>{
 const rows=tables();rows.objetos=Array.from({length:1203},(_,i)=>({...rows.objetos[0],id:String(i).padStart(5,'0')}));
 const client={rpc:async()=>({error:{code:'PGRST202'}}),from:name=>({select:()=>({order:()=>({range:async start=>({data:rows[name].slice(start,start+137)})})})})};
 assert.equal((await backup.readSnapshot(client)).objetos.length,1203);
});
test('no incluye credenciales ni preferencias de otro usuario',async()=>{
 const entries=new Map([['sb-example-auth-token','SECRET'],['hondotrastero:estilo','terminal'],['hondotrastero:espacio-defecto:otro','privado']]);
 const storage={length:entries.size,key:i=>[...entries.keys()][i],getItem:key=>entries.get(key)};
 const result=await backup.createArchive(clientFor(tables()),context,{JSZip,storage});
 const read=await backup.readArchive(result.archive,context,{JSZip});
 assert.deepEqual(read.preferences,{'hondotrastero:estilo':'terminal'});
});
test('restaurar prepara y verifica fotos antes de escribir datos, sin borrarlas',async()=>{
 const result=await archive(),copy=await backup.readArchive(result.archive,context,{JSZip});
 const calls=[],files=new Map();let target;
 const client={
  rpc:async(name,args)=>{
   calls.push(name+(args?.dry_run?' check':''));
   if(name==='hondo_backup_snapshot')return {data:target};
   if(args.dry_run)return {data:{ready:true}};
   target=args.payload.tables;return {data:{restored:true}};
  },storage:{from:()=>({
   upload:async(path,blob)=>{calls.push('upload');files.set(path,blob);return {}},
   download:async path=>{calls.push('verify-photo');return {data:files.get(path)}},
   remove:()=>{throw new Error('Nunca se deben borrar fotos durante la restauración')}
  })}
 };
 await backup.restoreArchive(client,context,copy,tables(),{onPrepared:async()=>{calls.push('journal')}});
 assert.deepEqual(calls,['hondo_restore_backup check','upload','verify-photo','journal','hondo_restore_backup','hondo_backup_snapshot']);
 assert.match(target.objetos[0].foto_path,/\/restauraciones\//);
 assert.equal(copy.tables.objetos[0].foto_path,'original/foto.jpg');
});
test('foto que no se puede verificar impide enviar la sustitución',async()=>{
 const result=await archive(),copy=await backup.readArchive(result.archive,context,{JSZip});let commits=0;
 const client={rpc:async(name,args)=>{if(!args.dry_run)commits++;return {data:{ready:true}}},
  storage:{from:()=>({upload:async()=>({}),download:async()=>({error:{message:'fallo'}})})}};
 await assert.rejects(backup.restoreArchive(client,context,copy,tables()),/verificar/);assert.equal(commits,0);
});
test('copia vacía se comprueba y conserva recuentos cero',async()=>{
 const empty={ubicaciones:[],cajas:[],objetos:[],categorias:[]};
 const result=await backup.createArchive(clientFor(empty),context,{JSZip});
 assert.deepEqual((await backup.readArchive(result.archive,context,{JSZip})).tables,empty);
});
test('WebP con bytes de tamaño que forman UTF-8 conserva los bytes al crear y comprobar la copia',async()=>{
 // RIFF guarda un entero binario antes de WEBP. C2 A9 se decodifica como
 // un solo carácter UTF-8: no se puede buscar WEBP por posición en texto.
 const webp=new Uint8Array([82,73,70,70,0xc2,0xa9,0,0,87,69,66,80]);
 const rows=tables();rows.objetos[0].foto_path='original/foto.webp';
 const client=clientFor(rows);client.storage.from=()=>({download:async()=>({data:new Blob([webp],{type:'image/webp'})})});
 const result=await backup.createArchive(client,context,{JSZip});
 const copy=await backup.readArchive(result.archive,context,{JSZip});
 assert.equal(copy.photos.get('original/foto.webp').mime,'image/webp');
 assert.deepEqual(copy.photos.get('original/foto.webp').bytes,webp);
});
test('un RIFF que no es WebP se rechaza aunque el servidor lo etiquete como imagen',async()=>{
 const wave=new Uint8Array([82,73,70,70,0xc2,0xa9,0,0,87,65,86,69]);
 const client=clientFor(tables());client.storage.from=()=>({download:async()=>({data:new Blob([wave],{type:'image/webp'})})});
 await assert.rejects(backup.createArchive(client,context,{JSZip}),/Caja de herramientas/);
});
