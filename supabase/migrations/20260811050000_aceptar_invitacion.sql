-- ============================================================
-- Aceptar una invitación al hogar.
--
-- POR QUÉ ESTA ES `security definer` Y LAS DEMÁS NO
--
-- Todo lo demás en este proyecto se apoya en RLS, y esa es la regla.
-- Aquí no se puede: quien acepta una invitación TODAVÍA NO ES MIEMBRO
-- del hogar, así que ninguna política puede autorizarlo — es
-- exactamente el momento anterior a serlo. Si se dejara que un
-- usuario cualquiera insertara en `miembros`, cualquiera podría
-- meterse en el hogar de cualquiera.
--
-- Así que la autorización es el TOKEN, y las condiciones se escriben
-- aquí, a la vista, en vez de esconderse en una política que no
-- podría existir.
--
-- LAS CUATRO CONDICIONES, Y POR QUÉ CADA UNA
--
-- 1. El token existe. Es aleatorio de 32 bytes y se compara por
--    igualdad exacta: quien no lo tenga no lo adivina.
--
-- 2. La invitación sigue PENDIENTE. Una aceptada dos veces no puede
--    volver a meter a nadie — ni al mismo, ni a otro que la haya
--    interceptado después.
--
-- 3. No está vencida. Un enlace de hace ocho meses en un correo
--    reenviado no debería abrir la puerta de nadie.
--
-- 4. EL CORREO COINCIDE con el de quien está aceptando. Esta es la
--    que de verdad cierra el caso: sin ella, cualquiera que consiga
--    el enlace —lo reenvían, se filtra, lo ve alguien por encima del
--    hombro— entra al hogar. Con ella, el enlace solo sirve en manos
--    de la persona a la que se invitó.
--
-- QUÉ NO HACE: no crea usuarios ni manda correos. Eso es de la Edge
-- Function `invitar`, que sí necesita la clave de servicio. Aquí solo
-- se convierte un token válido en una membresía.
--
-- Reverso: supabase/reversos/20260811050000_aceptar_invitacion.reverso.sql
-- ============================================================

create or replace function public.aceptar_invitacion(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv     public.invitaciones;
  v_correo  text;
  v_usuario uuid := auth.uid();
begin
  if v_usuario is null then
    raise exception 'Hace falta iniciar sesión para aceptar la invitación.'
      using errcode = 'insufficient_privilege';
  end if;

  select email into v_correo from auth.users where id = v_usuario;

  select * into v_inv from public.invitaciones
   where token = coalesce(p_token, '');

  if v_inv.id is null then
    raise exception 'Esa invitación no existe.' using errcode = 'no_data_found';
  end if;
  if v_inv.estado <> 'pendiente' then
    raise exception 'Esa invitación ya se usó.' using errcode = 'check_violation';
  end if;
  if v_inv.vence_en < now() then
    -- Se marca, para que no quede figurando como pendiente para siempre.
    update public.invitaciones set estado = 'vencida' where id = v_inv.id;
    raise exception 'Esa invitación venció. Pedile a quien te invitó que te mande otra.'
      using errcode = 'check_violation';
  end if;
  if lower(v_inv.correo) <> lower(coalesce(v_correo, '')) then
    raise exception 'Esa invitación es para otro correo. Entrá con la cuenta a la que se invitó.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Idempotente: aceptar dos veces no duplica la membresía ni falla.
  insert into public.miembros (hogar_id, usuario_id, rol)
  values (v_inv.hogar_id, v_usuario, v_inv.rol)
  on conflict (hogar_id, usuario_id) do update set rol = excluded.rol;

  update public.invitaciones set estado = 'aceptada' where id = v_inv.id;

  return jsonb_build_object('hogar_id', v_inv.hogar_id, 'rol', v_inv.rol);
end;
$$;

comment on function public.aceptar_invitacion is
  'Convierte un token de invitación válido en una membresía. Va security definer porque quien acepta todavía no es miembro y ninguna política RLS puede autorizarlo; el token es la autorización, y las cuatro condiciones —existe, pendiente, no vencida, y el correo coincide— están escritas a la vista.';

grant execute on function public.aceptar_invitacion to authenticated;

-- Una invitación pendiente que nadie usó no debería quedar figurando
-- como pendiente para siempre. Se marca al mirarla, no con una tarea
-- programada: una tarea más que mantener por algo que se resuelve solo.
create or replace function public.vencer_invitaciones(p_hogar uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.invitaciones
     set estado = 'vencida'
   where hogar_id = p_hogar and estado = 'pendiente' and vence_en < now();
$$;

grant execute on function public.vencer_invitaciones to authenticated;
