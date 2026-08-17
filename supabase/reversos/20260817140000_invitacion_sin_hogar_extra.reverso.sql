-- ============================================================
-- Reverso de 20260817140000_invitacion_sin_hogar_extra.
--
-- Devuelve `al_crear_usuario` a crear hogar SIEMPRE, y borra las dos
-- funciones nuevas.
--
-- ADVERTENCIA: volver atrás reinstala el defecto. Quien se registre
-- con una invitación válida va a volver a recibir un hogar propio
-- además del que la invitó, y como la app toma `(hogares)[0]` sin
-- selector, cuál de los dos ve queda al azar. No hay pérdida de datos;
-- lo que se pierde es la corrección.
-- ============================================================

drop function if exists public.aceptar_invitacion_mia(uuid);
drop function if exists public.mi_invitacion_pendiente();

create or replace function public.al_crear_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hogar uuid;
  v_nombre text;
begin
  v_nombre := coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1));

  insert into public.perfiles (id, nombre) values (new.id, v_nombre);

  insert into public.hogares (nombre)
  values (coalesce(nullif(trim(new.raw_user_meta_data ->> 'hogar'), ''), 'Mi hogar'))
  returning id into v_hogar;

  insert into public.miembros (hogar_id, usuario_id, rol)
  values (v_hogar, new.id, 'propietario');

  insert into public.bitacora (hogar_id, usuario_id, accion, entidad, entidad_id)
  values (v_hogar, new.id, 'hogar.creado', 'hogares', v_hogar::text);

  return new;
end;
$$;

comment on function public.al_crear_usuario is
  'Al registrarse se crea el perfil, su hogar y su membresía de propietario.';
