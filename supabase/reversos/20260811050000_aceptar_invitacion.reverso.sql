-- ============================================================
-- REVERSO de 20260811050000_aceptar_invitacion.sql
--
-- Quita la función que convierte un token de invitación en una
-- membresía.
--
-- QUÉ SE PIERDE: poder aceptar invitaciones. Nadie queda fuera de un
-- hogar al que ya pertenece —`miembros` no se toca— pero las
-- invitaciones pendientes dejan de servir hasta que la función
-- vuelva.
--
-- Es seguro con el código anterior en línea: aquella versión no
-- llamaba a ninguna de las dos.
-- ============================================================

drop function if exists public.aceptar_invitacion(text);
drop function if exists public.vencer_invitaciones(uuid);

delete from supabase_migrations.schema_migrations where version = '20260811050000';
