-- ============================================================
-- Que una invitación no termine en dos hogares.
--
-- EL DEFECTO, TAL COMO LO VIVIÓ UN HOGAR DE VERDAD
--
-- Se invitó a una persona sin cuenta. Le llegó el correo, lo abrió, y
-- la app le pidió armar un hogar — habiendo sido invitada a uno que ya
-- existía. Al final ninguno de los dos veía lo del otro.
--
-- Eran tres fallas encadenadas, y esta migración arregla la de la base.
-- Las otras dos —el correo que no llevaba el token y la app que borraba
-- la ruta al capturar la sesión— van en el mismo Pull Request.
--
-- LA DE ACÁ: `al_crear_usuario` le creaba un hogar A TODO USUARIO NUEVO,
-- sin preguntar si venía invitado. Y como la app toma
-- `(hogares)[0]` sin ordenar ni ofrecer selector, pertenecer a dos
-- hogares deja al azar cuál se ve. No es desorden: es no determinismo.
--
-- POR QUÉ EL DISPARADOR SE ABSTIENE EN VEZ DE METERLA AL HOGAR
--
-- Sería lo obvio y está mal. `/auth/v1/invite` crea la fila en
-- `auth.users` EN EL MOMENTO EN QUE SE MANDA LA INVITACIÓN, no cuando
-- la persona la abre: el disparador corre antes de que nadie haya
-- aceptado nada. Meterla ahí la haría miembro sin que hubiera
-- aceptado, y el correo promete, con esas palabras, que «nadie ve nada
-- tuyo mientras no aceptes».
--
-- Así que acá solo se OMITE el hogar propio. La entrada sigue siendo
-- de `aceptar_invitacion`, que es la que corre cuando la persona
-- realmente acepta, y que ya comprueba las cuatro condiciones.
--
-- LAS MISMAS CUATRO CONDICIONES, Y NO TRES
--
-- Existe, pendiente, no vencida, y el correo coincide. La de coincidir
-- importa acá tanto como en `aceptar_invitacion`: `raw_user_meta_data`
-- viene del cliente en un registro común, así que sin ella cualquiera
-- podría registrarse con un token ajeno y quedarse sin hogar propio a
-- propósito para confundir el arranque. Con ella, el token solo sirve
-- en manos del correo al que se invitó.
--
-- QUÉ PASA SI LA INVITACIÓN NO SIRVE
--
-- Se cae al camino de siempre y se le crea su hogar. Es la respuesta
-- segura: entre dejar a alguien sin hogar y darle uno de más, lo
-- segundo se arregla solo con `aceptar_invitacion` y lo primero no.
--
-- Reverso: supabase/reversos/20260817140000_invitacion_sin_hogar_extra.reverso.sql
-- ============================================================

create or replace function public.al_crear_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hogar  uuid;
  v_nombre text;
  v_token  text;
  v_invita boolean := false;
begin
  v_nombre := coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1));

  insert into public.perfiles (id, nombre) values (new.id, v_nombre);

  /* ¿Viene invitada? La función `invitar` deja el token en los
     metadatos al llamar a `/auth/v1/invite`. Las cuatro condiciones son
     las mismas de `aceptar_invitacion`, y la del correo es la que de
     verdad cierra el caso. */
  v_token := nullif(trim(new.raw_user_meta_data ->> 'invitacion'), '');
  if v_token is not null then
    select true into v_invita
      from public.invitaciones i
     where i.token = v_token
       and i.estado = 'pendiente'
       and i.vence_en >= now()
       and lower(i.correo) = lower(coalesce(new.email, ''));
  end if;

  /* Invitada: NO se le crea hogar. Todavía no es miembro de ninguno, y
     eso es correcto — lo será cuando acepte. */
  if coalesce(v_invita, false) then
    return new;
  end if;

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
  'Crea el perfil de un usuario nuevo y, salvo que venga con una invitación válida, también su hogar y su membresía de propietario. Se abstiene de crear el hogar cuando hay invitación porque la app toma (hogares)[0] sin selector, y pertenecer a dos deja al azar cuál se ve; no la mete al hogar ajeno porque el disparador corre al MANDAR la invitación, no al aceptarla, y el correo promete que nadie ve nada hasta que se acepte.';

-- ------------------------------------------------------------
-- Que quien entra sin hogar sepa que la invitaron.
--
-- Sin esto, la persona invitada que no llegó por el enlace —lo perdió,
-- entró directo, cambió de aparato— se queda con una cuenta sin hogar
-- y sin forma de enterarse de que hay una invitación esperándola. La
-- app no puede leer `invitaciones` por su cuenta: RLS lo impide, y
-- correctamente, porque todavía no es miembro de ese hogar.
--
-- `security definer` por la misma razón que `aceptar_invitacion`: es
-- el momento anterior a ser miembro, y ninguna política puede
-- autorizarlo. Solo devuelve las invitaciones DEL PROPIO CORREO de
-- quien pregunta, así que no expone nada de nadie más.
--
-- NO devuelve el token. Devuelve lo justo para preguntar «¿entrás al
-- hogar Tal?»: el nombre y quién invita. Aceptar se hace con
-- `aceptar_invitacion_mia`, que no necesita que el token viaje al
-- navegador.
-- ------------------------------------------------------------

create or replace function public.mi_invitacion_pendiente()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_correo text;
  v_fila   record;
begin
  if auth.uid() is null then return null; end if;
  select email into v_correo from auth.users where id = auth.uid();
  if v_correo is null then return null; end if;

  select i.id, i.rol, h.nombre as hogar
    into v_fila
    from public.invitaciones i
    join public.hogares h on h.id = i.hogar_id
   where lower(i.correo) = lower(v_correo)
     and i.estado = 'pendiente'
     and i.vence_en >= now()
   order by i.creado_en desc
   limit 1;

  if v_fila.id is null then return null; end if;
  return jsonb_build_object('id', v_fila.id, 'hogar', v_fila.hogar, 'rol', v_fila.rol);
end;
$$;

grant execute on function public.mi_invitacion_pendiente to authenticated;

-- Aceptar la propia invitación SIN token: la identifica el correo de
-- quien pide, que es la misma condición que ya cerraba el caso en
-- `aceptar_invitacion`. Evita que el token tenga que viajar al
-- navegador y quedarse en el historial solo para poder aceptar.
create or replace function public.aceptar_invitacion_mia(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión para aceptar la invitación.'
      using errcode = 'insufficient_privilege';
  end if;

  select i.token into v_token
    from public.invitaciones i
    join auth.users u on u.id = auth.uid()
   where i.id = p_id
     and lower(i.correo) = lower(coalesce(u.email, ''));

  if v_token is null then
    raise exception 'Esa invitación no es tuya.' using errcode = 'insufficient_privilege';
  end if;

  -- Se delega: las cuatro condiciones viven en un solo lugar y no se
  -- copian acá, donde se desincronizarían al primer cambio.
  return public.aceptar_invitacion(v_token);
end;
$$;

grant execute on function public.aceptar_invitacion_mia to authenticated;
