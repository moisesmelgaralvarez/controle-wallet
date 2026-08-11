-- ============================================================
-- REVERSO de 20260810230000_importar_lote.sql
--
-- Quita la función que aplica un estado de cuenta en una transacción.
--
-- QUÉ SE PIERDE: la capacidad de importar. Nada de lo ya importado se
-- toca — los movimientos, retiros y pagos siguen ahí, con su
-- procedencia intacta, y se pueden volver a importar en cuanto la
-- función exista otra vez.
--
-- Es seguro correr esto con el código anterior en línea: aquella
-- versión no llamaba a esta función. La versión NUEVA sí, así que el
-- orden manda —primero el código, después el esquema— como dice
-- VUELTA-ATRAS.md, caso 2.
-- ============================================================

drop function if exists public.importar_lote(
  text, uuid, date, date, text, jsonb, jsonb, jsonb, numeric, numeric);

delete from supabase_migrations.schema_migrations where version = '20260810230000';
