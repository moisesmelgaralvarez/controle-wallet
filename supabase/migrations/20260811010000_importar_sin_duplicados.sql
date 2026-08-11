-- ============================================================
-- Que no queden transacciones duplicadas: ni del archivo, ni a mano.
--
-- La regla del archivo sobre su propio rango ya impedía que reimportar
-- duplicara lo IMPORTADO. Faltaba el otro lado: lo que alguien tecleó
-- a mano y después viene en el estado de cuenta. Eso no lo tocaba
-- nadie —a propósito, porque lo manual es sagrado— y quedaba dos
-- veces.
--
-- Ahora la función recibe, además, los ids que se anotaron a mano y
-- que la pantalla identificó como el mismo movimiento. Van en la
-- MISMA transacción que el resto: borrar en un viaje e insertar en
-- otro dejaría, si el segundo no llega, el mes sin ese movimiento —
-- ni el tecleado ni el importado. Un duplicado se ve; un hueco no.
--
-- La firma cambia, así que se borra la versión anterior primero. Dos
-- versiones conviviendo dejarían a PostgREST sin saber a cuál llamar.
--
-- Reverso: supabase/reversos/20260811010000_importar_sin_duplicados.reverso.sql
-- ============================================================

drop function if exists public.importar_lote(
  text, uuid, date, date, text, jsonb, jsonb, jsonb, numeric, numeric);

create or replace function public.importar_lote(
  p_destino_clase text,
  p_destino_id    uuid,
  p_desde         date,
  p_hasta         date,
  p_lote          text,
  p_movimientos   jsonb default '[]'::jsonb,
  p_retiros       jsonb default '[]'::jsonb,
  p_pagos         jsonb default '[]'::jsonb,
  p_saldo_banco   numeric default null,
  p_retenido      numeric default null,
  -- Lo que se anotó A MANO y también viene en el archivo. Va aquí y no
  -- en otra petición porque borrar en un viaje e insertar en otro deja,
  -- si el segundo no llega, el mes SIN el movimiento: ni el tecleado ni
  -- el importado. Un duplicado se ve; un hueco no.
  p_borrar_movimientos uuid[] default '{}',
  p_borrar_retiros     uuid[] default '{}',
  p_borrar_pagos       uuid[] default '{}'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_hogar    uuid;
  v_fuente   text;
  v_borrados int := 0;
  v_n        int;
  v_res      jsonb := '{}'::jsonb;
begin
  if p_destino_clase not in ('cuenta', 'tarjeta') then
    raise exception 'El destino tiene que ser una cuenta o una tarjeta.'
      using errcode = 'check_violation';
  end if;

  -- Un rango abierto borraría TODO lo importado de esa cuenta, no solo
  -- lo del archivo. Es el parámetro más peligroso de la función.
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas del archivo no es válido.'
      using errcode = 'check_violation';
  end if;

  -- El hogar sale del destino, y el destino está detrás de RLS: si no
  -- es tuyo, este select no devuelve nada.
  if p_destino_clase = 'cuenta' then
    select hogar_id into v_hogar from public.cuentas where id = p_destino_id;
  else
    select hogar_id into v_hogar from public.tarjetas where id = p_destino_id;
  end if;

  if v_hogar is null then
    raise exception 'No se encontró la cuenta o tarjeta de destino.'
      using errcode = 'no_data_found';
  end if;

  v_fuente := p_destino_clase || ':' || p_destino_id::text;

  /* ---------- 1. fuera lo que este mismo archivo ya había traído ----------

     Solo `origen = 'import'` y solo de ESTA fuente. Lo tecleado a mano
     no se toca nunca, y lo importado de otra cuenta tampoco. */

  delete from public.movimientos
   where hogar_id = v_hogar and origen = 'import' and fuente = v_fuente
     and fecha between p_desde and p_hasta;
  get diagnostics v_n = row_count; v_borrados := v_borrados + v_n;
  v_res := v_res || jsonb_build_object('movimientos_borrados', v_n);

  delete from public.retiros
   where hogar_id = v_hogar and origen = 'import' and fuente = v_fuente
     and fecha between p_desde and p_hasta;
  get diagnostics v_n = row_count; v_borrados := v_borrados + v_n;
  v_res := v_res || jsonb_build_object('retiros_borrados', v_n);

  delete from public.pagos_tarjeta
   where hogar_id = v_hogar and origen = 'import' and fuente = v_fuente
     and fecha between p_desde and p_hasta;
  get diagnostics v_n = row_count; v_borrados := v_borrados + v_n;
  v_res := v_res || jsonb_build_object('pagos_borrados', v_n);

  /* ---------- 1b. y fuera los que se habían tecleado a mano ----------

     Solo los que el llamador señaló, y solo si son de este hogar: el
     `hogar_id` del WHERE no es adorno — sin él, un id de otro hogar
     entraría por la petición. RLS ya lo impediría, pero una defensa
     que se apoya en otra no es una defensa. */

  if array_length(p_borrar_movimientos, 1) > 0 then
    delete from public.movimientos
     where hogar_id = v_hogar and id = any(p_borrar_movimientos);
    get diagnostics v_n = row_count;
    v_res := v_res || jsonb_build_object('manuales_borrados_mov', v_n);
  end if;

  if array_length(p_borrar_retiros, 1) > 0 then
    delete from public.retiros
     where hogar_id = v_hogar and id = any(p_borrar_retiros);
    get diagnostics v_n = row_count;
    v_res := v_res || jsonb_build_object('manuales_borrados_ret', v_n);
  end if;

  if array_length(p_borrar_pagos, 1) > 0 then
    delete from public.pagos_tarjeta
     where hogar_id = v_hogar and id = any(p_borrar_pagos);
    get diagnostics v_n = row_count;
    v_res := v_res || jsonb_build_object('manuales_borrados_pag', v_n);
  end if;

  /* ---------- 2. y entra lo del archivo ----------

     `hogar_id`, `origen`, `fuente` y `lote` los pone la función. Del
     cuerpo solo se leen dinero, fechas y referencias. */

  insert into public.movimientos
    (hogar_id, fecha, periodo, monto, concepto, gasto_id, persona_id,
     medio_pago, tarjeta_id, origen, fuente, lote)
  select v_hogar, (x->>'fecha')::date, x->>'periodo', (x->>'monto')::numeric,
         left(coalesce(x->>'concepto', ''), 80),
         nullif(x->>'gasto_id', '')::uuid, nullif(x->>'persona_id', '')::uuid,
         -- `medio_pago` es un tipo enumerado, no texto: sin el molde
         -- explícito Postgres rechaza el INSERT entero.
         coalesce(x->>'medio_pago', 'tarjeta')::public.medio_pago,
         nullif(x->>'tarjeta_id', '')::uuid,
         'import', v_fuente, p_lote
    from jsonb_array_elements(coalesce(p_movimientos, '[]'::jsonb)) x;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('movimientos', v_n);

  insert into public.retiros
    (hogar_id, fecha, periodo, monto, cuenta_id, persona_id, nota, origen, fuente, lote)
  select v_hogar, (x->>'fecha')::date, x->>'periodo', (x->>'monto')::numeric,
         nullif(x->>'cuenta_id', '')::uuid, nullif(x->>'persona_id', '')::uuid,
         left(coalesce(x->>'nota', ''), 80), 'import', v_fuente, p_lote
    from jsonb_array_elements(coalesce(p_retiros, '[]'::jsonb)) x;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('retiros', v_n);

  insert into public.pagos_tarjeta
    (hogar_id, fecha, periodo, monto, tarjeta_id, cuenta_id, nota, origen, fuente, lote)
  select v_hogar, (x->>'fecha')::date, x->>'periodo', (x->>'monto')::numeric,
         nullif(x->>'tarjeta_id', '')::uuid, nullif(x->>'cuenta_id', '')::uuid,
         left(coalesce(x->>'nota', ''), 80), 'import', v_fuente, p_lote
    from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) x;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('pagos', v_n);

  /* ---------- 3. el banco manda sobre el saldo ----------

     El ancla de conciliación se pone sola con la fecha de corte del
     archivo. Antes se tecleaba a mano y se desfasaba; y de ese ancla
     depende que el patrimonio se pueda calcular sin bajar el histórico
     entero al teléfono. */

  if p_saldo_banco is not null then
    if p_destino_clase = 'cuenta' then
      update public.cuentas
         set saldo_banco_monto = p_saldo_banco, saldo_banco_fecha = p_hasta
       where id = p_destino_id;
    else
      update public.tarjetas
         set saldo_banco_monto = p_saldo_banco, saldo_banco_fecha = p_hasta
       where id = p_destino_id;
    end if;
  end if;

  -- Lo retenido caduca solo: en cuanto el comercio cobra, deja de
  -- estar retenido y pasa a ser un cargo del estado de cuenta.
  if p_retenido is not null and p_destino_clase = 'tarjeta' then
    update public.tarjetas
       set retenido_monto = p_retenido, retenido_fecha = p_hasta
     where id = p_destino_id;
  end if;

  return v_res || jsonb_build_object(
    'borrados', v_borrados, 'fuente', v_fuente,
    'desde', p_desde, 'hasta', p_hasta);
end;
$$;

comment on function public.importar_lote is
  'Aplica un estado de cuenta en UNA transacción: borra lo importado antes de esa fuente en ese rango e inserta lo del archivo. Va security invoker para que RLS siga decidiendo, y el hogar se deduce del destino en vez de recibirse.';

-- `anon` no: importar exige sesión iniciada, como todo lo demás.
grant execute on function public.importar_lote to authenticated;
