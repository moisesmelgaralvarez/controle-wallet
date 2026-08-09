-- ============================================================
-- Un hogar sin miembros no debe quedar en pie.
--
-- Apareció borrando una cuenta de prueba: el usuario se fue, su
-- membresía se fue con él —`miembros.usuario_id` apunta a
-- `auth.users` con `on delete cascade`— pero el HOGAR se quedó.
-- Con él, todos sus gastos, movimientos y saldos.
--
-- Nadie podía volver a verlos: sin membresía, ninguna política RLS
-- los deja leer. Pero ahí seguían, ocupando espacio y contradiciendo
-- lo que la política de privacidad promete: «si borrás tu cuenta,
-- todo se elimina — no la guardamos por si acaso».
--
-- Datos que sobreviven al borrado de quien los creó, invisibles y
-- sin dueño, son exactamente lo que un usuario no espera cuando
-- pide que se borre su cuenta.
--
-- El disparador va DESPUÉS de borrar una membresía y solo actúa si
-- era la última. Sacar a alguien de un hogar compartido no borra
-- nada; irse siendo el único, sí.
--
-- Reverso: supabase/reversos/20260808210000_hogar_sin_miembros.reverso.sql
-- ============================================================

create or replace function public.borrar_hogar_sin_miembros()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.miembros m where m.hogar_id = old.hogar_id) then
    -- Todo lo del presupuesto cuelga de `hogares` con `on delete
    -- cascade`, así que esta sola línea se lleva las veinte tablas.
    delete from public.hogares where id = old.hogar_id;
  end if;
  return old;
end;
$$;

create trigger hogar_sin_miembros
  after delete on public.miembros
  for each row execute function public.borrar_hogar_sin_miembros();

-- Limpieza de los que ya quedaron sueltos.
delete from public.hogares h
where not exists (select 1 from public.miembros m where m.hogar_id = h.id);
