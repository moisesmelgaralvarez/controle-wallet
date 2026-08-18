-- ============================================================
-- Leer y escribir el tema de pantalla de la propia cuenta.
--
-- La columna `perfiles.tema` la creó `20260817230000`; acá van sus dos
-- funciones. VAN EN SU PROPIO ARCHIVO por lo mismo que la vez pasada:
-- Supabase sigue las migraciones por nombre, y agregarle algo a una que
-- ya se aplicó contesta «up to date» sin ejecutar nada.
--
-- `security invoker`, no `definer`: acá RLS SÍ puede autorizar, porque
-- la persona ya es dueña de su perfil. Cuando una política alcanza, se
-- usa la política.
--
-- Reverso: supabase/reversos/20260818000000_tema_del_perfil.reverso.sql
-- ============================================================

create or replace function public.mi_tema()
returns text
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select coalesce((select tema from public.perfiles where id = auth.uid()), 'sistema');
$$;

-- La comprobación se repite acá aunque la columna ya tenga su `check`:
-- un valor inválido tiene que rebotar con un mensaje que se entienda, no
-- con una violación de restricción en crudo.
create or replace function public.guardar_tema(p_tema text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_tema is null or p_tema not in ('sistema', 'claro', 'oscuro') then
    raise exception 'El tema solo puede ser sistema, claro u oscuro.'
      using errcode = 'check_violation';
  end if;
  update public.perfiles set tema = p_tema where id = auth.uid();
end;
$$;

grant execute on function public.mi_tema to authenticated;
grant execute on function public.guardar_tema to authenticated;
