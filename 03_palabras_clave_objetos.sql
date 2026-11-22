-- Ejecutar en el SQL Editor del proyecto de HondoTrastero antes de publicar el cambio.
ALTER TABLE public.objetos
 ADD COLUMN IF NOT EXISTS palabras_clave text[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
