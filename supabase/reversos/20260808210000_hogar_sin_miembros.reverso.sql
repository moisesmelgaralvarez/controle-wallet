-- ============================================================
-- REVERSO de 20260808210000_hogar_sin_miembros.sql
--
-- Quita el disparador. Los hogares que ya se borraron NO vuelven:
-- un reverso devuelve la forma, nunca el contenido.
--
-- Tras revertir esto, borrar una cuenta vuelve a dejar su hogar
-- huérfano — lo que contradice la política de privacidad. Si se
-- revierte, hay que limpiar a mano.
-- ============================================================

drop trigger if exists hogar_sin_miembros on public.miembros;
drop function if exists public.borrar_hogar_sin_miembros();

delete from supabase_migrations.schema_migrations where version = '20260808210000';
