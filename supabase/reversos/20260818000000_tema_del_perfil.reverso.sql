-- Reverso de 20260818000000_tema_del_perfil.
--
-- Sin estas funciones la app deja de recordar el tema elegido y vuelve a
-- seguir el del sistema en cada carga. No se pierde ningún dato: la
-- columna `perfiles.tema` conserva su valor.
drop function if exists public.guardar_tema(text);
drop function if exists public.mi_tema();
