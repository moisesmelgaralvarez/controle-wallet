-- Reverso de 20260817231000_preferencias_funciones.
--
-- Sin estas funciones el riel deja de recordar si quedó plegado: se
-- dibuja desplegado en cada carga. No se pierde ningún dato — la
-- columna `perfiles.riel_plegado` sigue con su valor.
drop function if exists public.guardar_preferencia_riel(boolean);
drop function if exists public.mi_preferencia_riel();
