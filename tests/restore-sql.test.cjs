/* Ejecutar con PGlite disponible en NODE_PATH (ver COPIAS_SEGURIDAD.md). */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const space='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',box='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',object='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
async function setup(){
 const db=new PGlite();
 await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon;
  CREATE SCHEMA auth; CREATE SCHEMA storage;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
  GRANT USAGE ON SCHEMA auth, storage TO authenticated;
  CREATE TABLE public.ubicaciones(id uuid PRIMARY KEY, nombre text NOT NULL, descripcion text, user_id uuid NOT NULL DEFAULT auth.uid(), ubicacion_padre_id uuid REFERENCES public.ubicaciones, creado_en timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.cajas(id uuid PRIMARY KEY,nombre text NOT NULL,descripcion text,user_id uuid NOT NULL DEFAULT auth.uid(),ubicacion_id uuid NOT NULL REFERENCES public.ubicaciones,creado_en timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.objetos(id uuid PRIMARY KEY,nombre text NOT NULL,descripcion text,user_id uuid NOT NULL DEFAULT auth.uid(),ubicacion_id uuid REFERENCES public.ubicaciones,caja_id uuid REFERENCES public.cajas,categorias text[] NOT NULL DEFAULT '{}',palabras_clave text[] DEFAULT '{}',foto_path text,cantidad integer NOT NULL DEFAULT 1 CHECK(cantidad>0),creado_en timestamptz NOT NULL DEFAULT now(),CHECK((ubicacion_id IS NULL)<>(caja_id IS NULL)));
  CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text NOT NULL,name text NOT NULL,owner_id text DEFAULT auth.uid()::text);
  GRANT SELECT ON storage.objects TO authenticated;
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE POLICY fotos ON storage.objects TO authenticated USING(owner_id=auth.uid()::text);
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.ubicaciones,public.cajas,public.objetos TO authenticated;
  ALTER TABLE public.ubicaciones ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.cajas ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.objetos ENABLE ROW LEVEL SECURITY;
  CREATE POLICY mis_espacios ON public.ubicaciones TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
  CREATE POLICY mis_cajas ON public.cajas TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
  CREATE POLICY mis_objetos ON public.objetos TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
 `);
 await db.exec(fs.readFileSync(require('node:path').join(__dirname,'../02_catalogo_categorias.sql'),'utf8'));
 await db.exec(fs.readFileSync(require('node:path').join(__dirname,'../04_copias_seguridad.sql'),'utf8'));
 await db.exec(`
  INSERT INTO public.ubicaciones(id,nombre,user_id) VALUES ('${space}','Casa','${uid}'),('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Otra cuenta','${other}');
  INSERT INTO public.cajas(id,nombre,user_id,ubicacion_id) VALUES ('${box}','Armario','${uid}','${space}');
  INSERT INTO public.objetos(id,nombre,user_id,caja_id,categorias,foto_path) VALUES ('${object}','Taladro','${uid}','${box}',ARRAY['herramientas-bricolaje'],'${uid}/original.jpg');
  INSERT INTO public.objetos(id,nombre,user_id,ubicacion_id) VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Objeto ajeno','${other}','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('objetos','${uid}/restauraciones/test/000001.jpg','${uid}');
  SET ROLE authenticated; SET request.jwt.claim.sub='${uid}';
  SET request.jwt.claims='{"iss":"https://zdohjcvmhluhalwbrphn.supabase.co/auth/v1"}';
 `);
 return db;
}
async function snapshot(db){return (await db.query('SELECT public.hondo_backup_snapshot() AS result')).rows[0].result}
async function restore(db,tables,expected,dry_run=false,userId=uid){
 return (await db.query('SELECT public.hondo_restore_backup($1::jsonb,$2::jsonb,$3) AS result',[
  JSON.stringify({app:'HondoTrastero',version:1,project:'https://zdohjcvmhluhalwbrphn.supabase.co',userId,tables}),JSON.stringify(expected),dry_run])).rows[0].result;
}
test('PostgreSQL: restauración atómica, permisos, concurrencia y reversión de errores',async()=>{
 const db=await setup();
 try{
  const initial=await snapshot(db);assert.equal(initial.objetos.length,1);assert.equal(initial.ubicaciones.length,1);
  await db.exec(`SET request.jwt.claims='{"iss":"https://otro-proyecto.supabase.co/auth/v1"}'`);
  await assert.rejects(restore(db,initial,initial),/Destino incorrecto/);
  assert.deepEqual(await snapshot(db),initial);
  await db.exec(`SET request.jwt.claims='{"iss":"https://zdohjcvmhluhalwbrphn.supabase.co/auth/v1"}'`);
  const target=structuredClone(initial);target.objetos[0].nombre='Taladro recuperado';target.objetos[0].foto_path=uid+'/restauraciones/test/000001.jpg';
  target.ubicaciones.push({...target.ubicaciones[0],id:'ffffffff-ffff-4fff-8fff-ffffffffffff',nombre:'Hijo',ubicacion_padre_id:space});
  target.ubicaciones.reverse();
  assert.deepEqual(await restore(db,target,initial,true),{ready:true});assert.deepEqual(await snapshot(db),initial);
  assert.equal((await restore(db,target,initial)).restored,true);
  const restored=await snapshot(db);assert.equal(restored.objetos[0].nombre,'Taladro recuperado');assert.equal(restored.ubicaciones.length,2);
  await db.exec('RESET ROLE');
  assert.equal((await db.query(`SELECT count(*)::integer AS n FROM public.objetos WHERE user_id='${other}'`)).rows[0].n,1);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(restore(db,target,initial),/ha cambiado/);
  assert.deepEqual(await snapshot(db),restored);
  await assert.rejects(restore(db,target,restored,false,other),/usuario/);
  const missing=structuredClone(target);missing.objetos[0].foto_path=uid+'/restauraciones/ausente.jpg';
  await assert.rejects(restore(db,missing,restored),/fotografía/);assert.deepEqual(await snapshot(db),restored);
  const bad=structuredClone(target);bad.objetos[0].cantidad=0;
  bad.categorias.push({...initial.categorias[0],id:'categoria-rollback',nombre:'Debe revertirse',icono:''});
  await assert.rejects(restore(db,bad,restored),/check constraint/);assert.deepEqual(await snapshot(db),restored);
  const cyclic=structuredClone(target);cyclic.ubicaciones[0].ubicacion_padre_id=cyclic.ubicaciones[0].id;
  await assert.rejects(restore(db,cyclic,restored),/ciclo/);assert.deepEqual(await snapshot(db),restored);
  const invisible=structuredClone(target);invisible.objetos[0].user_id=other;
  await assert.rejects(restore(db,invisible,restored),/row-level security/);assert.deepEqual(await snapshot(db),restored);
  // Las categorías compartidas existentes y los objetos ajenos se conservan.
  const shared=structuredClone(target);shared.categorias.find(c=>c.id==='herramientas-bricolaje').nombre='Nombre antiguo';
  await restore(db,shared,restored);
  assert.equal((await snapshot(db)).categorias.find(c=>c.id==='herramientas-bricolaje').nombre,'Herramientas y bricolaje');
  // Una copia vacía es una sustitución explícita válida.
  const empty={ubicaciones:[],cajas:[],objetos:[],categorias:[]};
  await restore(db,empty,await snapshot(db));assert.equal((await snapshot(db)).objetos.length,0);
  await db.exec('RESET ROLE');assert.equal((await db.query(`SELECT count(*)::integer AS n FROM public.objetos WHERE user_id='${other}'`)).rows[0].n,1);
  // SQL repetible, sin pérdida de datos ni cambio de políticas.
  await db.exec(fs.readFileSync(require('node:path').join(__dirname,'../04_copias_seguridad.sql'),'utf8'));
 }finally{await db.close()}
});
