-- HondoTrastero: catálogo compartido de categorías.
-- Ejecutar UNA VEZ en Supabase > SQL Editor. Puede repetirse sin restaurar categorías borradas.
BEGIN;
CREATE TABLE IF NOT EXISTS public.categorias (
 id text PRIMARY KEY,
 nombre text NOT NULL CHECK (char_length(btrim(nombre)) BETWEEN 1 AND 80),
 icono text NOT NULL DEFAULT '',
 creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS categorias_nombre_unico ON public.categorias(lower(btrim(nombre)));
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
-- Los usuarios autenticados comparten la administración del catálogo.
DROP POLICY IF EXISTS categorias_compartidas ON public.categorias;
CREATE POLICY categorias_compartidas ON public.categorias FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorias TO authenticated;
REVOKE ALL ON public.categorias FROM anon;

-- Sembrar solo en la primera activación; no recrear categorías eliminadas al repetir este SQL.
CREATE TABLE IF NOT EXISTS public.hondo_migraciones (id text PRIMARY KEY);
ALTER TABLE public.hondo_migraciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hondo_migraciones FROM anon, authenticated;
DO $seed$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.hondo_migraciones WHERE id='catalogo-categorias-v1') THEN
  INSERT INTO public.categorias(id,nombre,icono) VALUES
 ('herramientas-bricolaje','Herramientas y bricolaje','🔧'),
 ('ferreteria-repuestos','Ferretería y repuestos','🔩'),
 ('electricidad-iluminacion','Electricidad e iluminación','💡'),
 ('informatica-electronica','Informática y electrónica','💻'),
 ('fotografia-video-sonido','Fotografía, vídeo y sonido','📷'),
 ('electrodomesticos','Electrodomésticos','🔌'),
 ('cocina-menaje','Cocina y menaje','🍽️'),
 ('muebles-hogar','Muebles y equipamiento del hogar','🪑'),
 ('decoracion','Decoración','🖼️'),
 ('navidad-celebraciones','Navidad y celebraciones','🎄'),
 ('ropa-calzado','Ropa y calzado','👕'),
 ('textiles-hogar','Textiles del hogar','🛏️'),
 ('deporte-ejercicio','Deporte y ejercicio','🏋️'),
 ('playa-piscina-camping','Playa, piscina y camping','🏖️'),
 ('viajes-equipaje','Viajes y equipaje','🧳'),
 ('jardineria-exterior','Jardinería y exterior','🌱'),
 ('vehiculos-accesorios','Vehículos y accesorios','🚗'),
 ('juegos-juguetes-ocio','Juegos, juguetes y ocio','🎮'),
 ('libros-publicaciones','Libros y publicaciones','📚'),
 ('documentos-papeleria','Documentos y papelería','📁'),
 ('arte-manualidades-modelismo','Arte, manualidades y modelismo','🎨'),
 ('limpieza-mantenimiento','Limpieza y mantenimiento','🧹'),
 ('mascotas','Mascotas','🐕'),
 ('recuerdos-colecciones','Recuerdos y colecciones','🏺')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.hondo_migraciones(id) VALUES ('catalogo-categorias-v1');
 END IF;
END;
$seed$;

-- Sustituir la validación del antiguo catálogo fijo por el catálogo editable.
DO $checks$
DECLARE c record;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='objetos' AND column_name='categorias' AND udt_name='_text') THEN
  RAISE EXCEPTION 'Se requiere public.objetos.categorias de tipo text[]. Ejecuta primero la migración de categorías múltiples.';
 END IF;
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.objetos'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%categorias%' LOOP
  EXECUTE format('ALTER TABLE public.objetos DROP CONSTRAINT %I',c.conname);
 END LOOP;
END;
$checks$;

CREATE OR REPLACE FUNCTION public.hondo_validar_categorias() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $validate$
DECLARE categoria_id text;
BEGIN
 IF NEW.categorias IS NULL THEN RETURN NEW; END IF;
 IF cardinality(NEW.categorias) <> (SELECT count(DISTINCT x) FROM unnest(NEW.categorias) x) THEN
  RAISE EXCEPTION 'Hay categorías duplicadas o vacías.';
 END IF;
 FOR categoria_id IN SELECT unnest(NEW.categorias) ORDER BY 1 LOOP
  PERFORM 1 FROM public.categorias WHERE id=categoria_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La categoría % ya no existe. Actualiza las categorías del objeto.',categoria_id; END IF;
 END LOOP;
 RETURN NEW;
END;
$validate$;
DROP TRIGGER IF EXISTS hondo_validar_categorias ON public.objetos;
CREATE TRIGGER hondo_validar_categorias BEFORE INSERT OR UPDATE OF categorias ON public.objetos FOR EACH ROW EXECUTE FUNCTION public.hondo_validar_categorias();

-- La limpieza y el borrado se ejecutan juntos: nunca se eliminan objetos.
CREATE OR REPLACE FUNCTION public.hondo_quitar_categoria() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $remove$
BEGIN
 UPDATE public.objetos SET categorias=array_remove(categorias,OLD.id) WHERE OLD.id=ANY(categorias);
 RETURN OLD;
END;
$remove$;
DROP TRIGGER IF EXISTS hondo_quitar_categoria ON public.categorias;
CREATE TRIGGER hondo_quitar_categoria BEFORE DELETE ON public.categorias FOR EACH ROW EXECUTE FUNCTION public.hondo_quitar_categoria();

-- Los identificadores son estables; editar el nombre conserva las asignaciones.
CREATE OR REPLACE FUNCTION public.hondo_categoria_id_estable() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $stable$
BEGIN
 IF NEW.id<>OLD.id THEN RAISE EXCEPTION 'No se puede cambiar el identificador de una categoría.'; END IF;
 RETURN NEW;
END;
$stable$;
DROP TRIGGER IF EXISTS hondo_categoria_id_estable ON public.categorias;
CREATE TRIGGER hondo_categoria_id_estable BEFORE UPDATE ON public.categorias FOR EACH ROW EXECUTE FUNCTION public.hondo_categoria_id_estable();
DO $realtime$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='categorias') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.categorias;
 END IF;
END;
$realtime$;
NOTIFY pgrst, 'reload schema';
COMMIT;
