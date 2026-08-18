-- ============================================================
-- Leer y escribir la propia preferencia de pantalla.
--
-- VA EN SU PROPIO ARCHIVO Y ESO IMPORTA. Estas funciones nacieron
-- pegadas al final de `20260817230000_preferencias_de_pantalla.sql`,
-- que YA estaba aplicada. Supabase sigue las migraciones por NOMBRE DE
-- ARCHIVO: al volver a empujar contestó «Remote database is up to
-- date» y no creó ninguna de las dos. Una migración editada después de
-- aplicarse no se vuelve a correr, y el aviso de éxito lo dice igual.
--
-- Reverso: supabase/reversos/20260817231000_preferencias_funciones.reverso.sql
-- ============================================================

-- ------------------------------------------------------------
-- Leer y escribir la propia preferencia, y nada más.
--
-- Van como funciones y no como un UPDATE directo desde el navegador
-- porque así el cliente no necesita saber que existe una tabla
-- `perfiles`: pide «guardá mi riel» y listo. `auth.uid()` decide de
-- quién es la fila, así que no hay forma de escribir la de otro ni
-- pasando otro id — no hay parámetro de id que pasar.
--
-- `security invoker`, a diferencia de las de invitación: acá RLS SÍ
-- puede autorizar, porque la persona ya es dueña de su perfil. Cuando
-- una política alcanza, se usa la política.
-- ------------------------------------------------------------

create or replace function public.mi_preferencia_riel()
returns boolean
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select coalesce((select riel_plegado from public.perfiles where id = auth.uid()), false);
$$;

create or replace function public.guardar_preferencia_riel(p_plegado boolean)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.perfiles set riel_plegado = coalesce(p_plegado, false)
   where id = auth.uid();
$$;

grant execute on function public.mi_preferencia_riel to authenticated;
grant execute on function public.guardar_preferencia_riel to authenticated;
