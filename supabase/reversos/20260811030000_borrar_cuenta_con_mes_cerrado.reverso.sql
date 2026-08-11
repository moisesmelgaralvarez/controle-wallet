-- ============================================================
-- REVERSO de 20260811030000_borrar_cuenta_con_mes_cerrado.sql
--
-- Devuelve las dos funciones a su forma anterior: el mes cerrado
-- vuelve a bloquear TODO, incluido el borrado del hogar.
--
-- QUÉ SE PIERDE, dicho claro: quien haya cerrado un mes vuelve a NO
-- poder borrar su cuenta. La política de privacidad publicada dice
-- que sí puede, así que revertir esto deja a la app prometiendo algo
-- que no cumple. No es una pérdida de función: es una promesa rota.
--
-- Se revierte solo si el arreglo causó un problema peor, y sabiendo
-- eso.
-- ============================================================

create or replace function public.impedir_mes_cerrado()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_hogar   uuid;
  v_periodo text;
begin
  if tg_op = 'DELETE' then
    v_hogar := old.hogar_id; v_periodo := old.periodo;
  else
    v_hogar := new.hogar_id; v_periodo := new.periodo;
  end if;

  if exists (select 1 from public.presupuesto_mes p
             where p.hogar_id = v_hogar and p.periodo = v_periodo and p.cerrado) then
    raise exception 'El mes % ya está cerrado y no admite cambios.', v_periodo
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and old.periodo is distinct from new.periodo then
    if exists (select 1 from public.presupuesto_mes p
               where p.hogar_id = old.hogar_id and p.periodo = old.periodo and p.cerrado) then
      raise exception 'El mes % ya está cerrado: no se puede sacar un registro de ahí.', old.periodo
        using errcode = 'check_violation';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.borrar_hogar_sin_miembros()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.miembros m where m.hogar_id = old.hogar_id) then
    delete from public.hogares where id = old.hogar_id;
  end if;
  return old;
end;
$$;

delete from supabase_migrations.schema_migrations where version = '20260811030000';
