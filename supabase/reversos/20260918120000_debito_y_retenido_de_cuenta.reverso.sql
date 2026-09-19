-- ============================================================
-- Reverso de 20260918120000_debito_y_retenido_de_cuenta
--
-- Devuelve `importar_lote` a la versión del ancla que no retrocede. Volver
-- acá reabre los dos defectos: las compras de una cuenta sin tarjeta de
-- débito anotada no bajan de ningún saldo, y lo retenido de una cuenta se
-- lee y no se guarda.
--
-- Las tarjetas de débito que ya se hayan creado SE QUEDAN: son verdad
-- (la cuenta tiene esa tarjeta) y de ellas cuelgan movimientos.
-- ============================================================

drop function if exists public.importar_lote(
  text, uuid, date, date, text, jsonb, jsonb, jsonb, numeric, numeric,
  uuid[], uuid[], uuid[], jsonb, jsonb, jsonb);

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
  p_borrar_movimientos uuid[] default '{}',
  p_borrar_retiros     uuid[] default '{}',
  p_borrar_pagos       uuid[] default '{}',
  p_rubros        jsonb default '[]'::jsonb,
  p_comercios     jsonb default '[]'::jsonb
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
  v_anclado  boolean := false;
begin
  if p_destino_clase not in ('cuenta', 'tarjeta') then
    raise exception 'El destino tiene que ser una cuenta o una tarjeta.'
      using errcode = 'check_violation';
  end if;

  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas del archivo no es válido.'
      using errcode = 'check_violation';
  end if;

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

  insert into public.gastos
    (id, hogar_id, concepto, monto, categoria, medio_pago, tarjeta_id, crecimiento, orden)
  select (x->>'id')::uuid, v_hogar,
         left(coalesce(x->>'concepto', 'Sin nombre'), 80),
         coalesce((x->>'monto')::numeric, 0),
         coalesce(nullif(x->>'categoria', ''), 'Otros'),
         coalesce(x->>'medio_pago', 'tarjeta')::public.medio_pago,
         nullif(x->>'tarjeta_id', '')::uuid,
         coalesce((x->>'crecimiento')::numeric, 0),
         coalesce((x->>'orden')::int, 0)
    from jsonb_array_elements(coalesce(p_rubros, '[]'::jsonb)) x
      on conflict (id) do nothing;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('rubros', v_n);

  insert into public.comercios (hogar_id, clave, gasto_id)
  select v_hogar, left(x->>'clave', 120), nullif(x->>'gasto_id', '')::uuid
    from jsonb_array_elements(coalesce(p_comercios, '[]'::jsonb)) x
      on conflict (hogar_id, clave) do update set gasto_id = excluded.gasto_id;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('comercios', v_n);

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

  insert into public.movimientos
    (hogar_id, fecha, periodo, monto, concepto, gasto_id, persona_id,
     medio_pago, tarjeta_id, origen, fuente, lote)
  select v_hogar, (x->>'fecha')::date, x->>'periodo', (x->>'monto')::numeric,
         left(coalesce(x->>'concepto', ''), 80),
         nullif(x->>'gasto_id', '')::uuid, nullif(x->>'persona_id', '')::uuid,
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

  /* ---------- el banco manda, pero la declaración MÁS RECIENTE ----------

     Antes acá había un UPDATE directo, y por eso el estado de cuenta del
     ciclo cerrado el 6 de agosto pisó el saldo declarado el 18. Ahora
     decide `anclar_saldo_banco`, y se devuelve si lo aplicó: importar un
     mes viejo tiene que poder traer sus movimientos sin mover el saldo
     de hoy, y la pantalla tiene que poder decirlo. */

  if p_saldo_banco is not null then
    v_anclado := public.anclar_saldo_banco(p_destino_clase, p_destino_id, p_saldo_banco, p_hasta);
  end if;
  v_res := v_res || jsonb_build_object('ancla_aplicada', v_anclado);

  -- Lo retenido caduca solo: en cuanto el comercio cobra, deja de estar
  -- retenido y pasa a ser un cargo del estado de cuenta. Va con la misma
  -- regla: un archivo viejo no sabe qué está retenido hoy.
  if p_retenido is not null and p_destino_clase = 'tarjeta' and v_anclado then
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
  'Aplica un estado de cuenta en UNA transacción: crea los rubros que el archivo obliga —con el identificador que ya traen sus movimientos—, guarda el aprendizaje comercio → rubro, borra lo importado antes de esa fuente en ese rango e inserta lo del archivo. El saldo declarado solo avanza: un archivo viejo trae sus movimientos sin tocar el saldo de hoy. Va security invoker para que RLS siga decidiendo.';

grant execute on function public.importar_lote to authenticated;
