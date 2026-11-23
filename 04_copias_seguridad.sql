-- HondoTrastero · copias y restauración, versión 1.
-- DESTINO: proyecto zdohjcvmhluhalwbrphn (config.js de gs1lvan/HondoTrastero).
-- Abrir https://supabase.com/dashboard/project/zdohjcvmhluhalwbrphn/sql/new
-- Ejecutar una vez en Supabase > SQL Editor. Puede repetirse.
-- No cambia tablas, registros, políticas ni permisos del inventario.
-- Las funciones usan los permisos y las políticas del usuario conectado.
BEGIN;

CREATE OR REPLACE FUNCTION public.hondo_backup_snapshot()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_temp AS $function$
 SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE jsonb_build_object(
  'ubicaciones', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.ubicaciones t),'[]'::jsonb),
  'cajas', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.cajas t),'[]'::jsonb),
  'objetos', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.objetos t),'[]'::jsonb),
  'categorias', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.categorias t),'[]'::jsonb)
 ) END;
$function$;

CREATE OR REPLACE FUNCTION public.hondo_restore_backup(
 payload jsonb, expected jsonb, dry_run boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $function$
DECLARE
 current_state jsonb;
 table_name text;
 row_data jsonb;
 remaining jsonb;
 next_remaining jsonb;
 inserted_count integer;
 user_uuid uuid := auth.uid();
BEGIN
 IF user_uuid IS NULL THEN RAISE EXCEPTION 'Es necesario iniciar sesión.'; END IF;
 IF payload->>'project' IS DISTINCT FROM 'https://zdohjcvmhluhalwbrphn.supabase.co'
 OR auth.jwt()->>'iss' IS DISTINCT FROM 'https://zdohjcvmhluhalwbrphn.supabase.co/auth/v1' THEN
  RAISE EXCEPTION 'Destino incorrecto: esta restauración sólo corresponde al proyecto de HondoTrastero zdohjcvmhluhalwbrphn.';
 END IF;
 IF payload->>'app' IS DISTINCT FROM 'HondoTrastero'
 OR payload->>'version' IS DISTINCT FROM '1'
 OR payload->>'userId' IS DISTINCT FROM user_uuid::text
 OR jsonb_typeof(payload->'tables') IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'La copia no corresponde a este usuario o formato.';
 END IF;

 FOREACH table_name IN ARRAY ARRAY['ubicaciones','cajas','objetos','categorias'] LOOP
  IF jsonb_typeof(payload->'tables'->table_name) IS DISTINCT FROM 'array'
  OR jsonb_typeof(expected->table_name) IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Faltan datos de la tabla %.',table_name;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'tables'->table_name) r
    WHERE jsonb_typeof(r) <> 'object' OR NULLIF(r->>'id','') IS NULL)
  OR (SELECT count(*) FROM jsonb_array_elements(payload->'tables'->table_name)) <>
     (SELECT count(DISTINCT r->>'id') FROM jsonb_array_elements(payload->'tables'->table_name) r) THEN
   RAISE EXCEPTION 'Registros no válidos o identificadores duplicados en %.',table_name;
  END IF;
 END LOOP;

 -- Una única transacción. El bloqueo también impide cambios desde otro móvil
 -- entre la comparación de la copia previa y la sustitución del inventario.
 LOCK TABLE public.categorias, public.ubicaciones, public.cajas, public.objetos
 IN SHARE ROW EXCLUSIVE MODE;
 current_state := public.hondo_backup_snapshot();
 IF current_state IS DISTINCT FROM expected THEN
  RAISE EXCEPTION 'El inventario ha cambiado. Comprueba la copia y descarga una nueva copia previa.';
 END IF;

 -- Verificar enlaces incluso en la comprobación sin escritura.
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'tables'->'ubicaciones') u
   WHERE NULLIF(u->>'ubicacion_padre_id','') IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM jsonb_array_elements(payload->'tables'->'ubicaciones') p WHERE p->>'id'=u->>'ubicacion_padre_id'))
 OR EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'tables'->'cajas') c
   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'tables'->'ubicaciones') u WHERE u->>'id'=c->>'ubicacion_id'))
 OR EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'tables'->'objetos') o
   WHERE (NULLIF(o->>'caja_id','') IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM jsonb_array_elements(payload->'tables'->'cajas') c WHERE c->>'id'=o->>'caja_id'))
   OR (NULLIF(o->>'ubicacion_id','') IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM jsonb_array_elements(payload->'tables'->'ubicaciones') u WHERE u->>'id'=o->>'ubicacion_id'))
   OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(o->'categorias','[]'::jsonb)) cat
     WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'tables'->'categorias') c WHERE c->>'id'=cat))) THEN
  RAISE EXCEPTION 'La copia contiene referencias incompletas.';
 END IF;
 IF dry_run IS DISTINCT FROM false THEN RETURN jsonb_build_object('ready',true); END IF;

 -- Las fotos deben estar preparadas en rutas nuevas antes de tocar los datos.
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'tables'->'objetos') o
   WHERE NULLIF(o->>'foto_path','') IS NOT NULL AND
    (o->>'foto_path' NOT LIKE user_uuid::text || '/restauraciones/%'
     OR NOT EXISTS (SELECT 1 FROM storage.objects s WHERE s.bucket_id='objetos' AND s.name=o->>'foto_path'))) THEN
  RAISE EXCEPTION 'Falta alguna fotografía preparada para la restauración.';
 END IF;

 -- El catálogo es compartido: añadir las categorías que falten; conservar
 -- las existentes y sus nombres para no modificar los objetos de otra cuenta.
 -- Se informa de ello también en el resumen de la aplicación.
 INSERT INTO public.categorias
 SELECT r.* FROM jsonb_populate_recordset(NULL::public.categorias,payload->'tables'->'categorias') r
 WHERE NOT EXISTS (SELECT 1 FROM public.categorias c WHERE c.id=r.id);

 -- Sólo filas visibles/editables por las políticas actuales. Si una política,
 -- restricción o inserción falla, PostgreSQL revierte toda la operación.
 DELETE FROM public.objetos;
 DELETE FROM public.cajas;
 -- Desenlazar padres permite borrar árboles con claves foráneas inmediatas.
 UPDATE public.ubicaciones SET ubicacion_padre_id=NULL WHERE ubicacion_padre_id IS NOT NULL;
 DELETE FROM public.ubicaciones;

 remaining := payload->'tables'->'ubicaciones';
 WHILE jsonb_array_length(remaining)>0 LOOP
  next_remaining := '[]'::jsonb; inserted_count := 0;
  FOR row_data IN SELECT value FROM jsonb_array_elements(remaining) LOOP
   IF NULLIF(row_data->>'ubicacion_padre_id','') IS NULL OR EXISTS
     (SELECT 1 FROM public.ubicaciones u WHERE u.id::text=row_data->>'ubicacion_padre_id') THEN
    INSERT INTO public.ubicaciones SELECT * FROM jsonb_populate_record(NULL::public.ubicaciones,row_data);
    inserted_count := inserted_count+1;
   ELSE next_remaining := next_remaining || jsonb_build_array(row_data);
   END IF;
  END LOOP;
  IF inserted_count=0 THEN RAISE EXCEPTION 'Los espacios contienen un ciclo o un padre que falta.'; END IF;
  remaining := next_remaining;
 END LOOP;

 INSERT INTO public.cajas SELECT * FROM jsonb_populate_recordset(NULL::public.cajas,payload->'tables'->'cajas');
 INSERT INTO public.objetos SELECT * FROM jsonb_populate_recordset(NULL::public.objetos,payload->'tables'->'objetos');

 -- Contar y comprobar identificadores: las políticas no pueden dejar un éxito parcial.
 FOREACH table_name IN ARRAY ARRAY['ubicaciones','cajas','objetos'] LOOP
  EXECUTE format('SELECT COALESCE(jsonb_agg(id::text ORDER BY id::text),''[]''::jsonb) FROM public.%I',table_name)
   INTO current_state;
  IF current_state IS DISTINCT FROM (SELECT COALESCE(jsonb_agg(r->>'id' ORDER BY r->>'id'),'[]'::jsonb)
     FROM jsonb_array_elements(payload->'tables'->table_name) r) THEN
   RAISE EXCEPTION 'No se pudo recuperar completamente la tabla %.',table_name;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('restored',true,'objetos',jsonb_array_length(payload->'tables'->'objetos'));
END;
$function$;

REVOKE ALL ON FUNCTION public.hondo_backup_snapshot() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hondo_restore_backup(jsonb,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hondo_backup_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hondo_restore_backup(jsonb,jsonb,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
