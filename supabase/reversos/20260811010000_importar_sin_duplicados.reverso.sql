-- ============================================================
-- REVERSO de 20260811010000_importar_sin_duplicados.sql
--
-- Devuelve la función a su forma anterior, sin la lista de ids a
-- borrar. Nada de lo importado se toca; lo que se pierde es poder
-- quitar, en la misma transacción, lo que se había tecleado a mano y
-- también venía en el archivo.
--
-- Después de esto hay que volver a aplicar la migración
-- 20260810230000, que es la que crea la versión anterior.
-- ============================================================

drop function if exists public.importar_lote(
  text, uuid, date, date, text, jsonb, jsonb, jsonb, numeric, numeric,
  uuid[], uuid[], uuid[]);

delete from supabase_migrations.schema_migrations where version = '20260811010000';
