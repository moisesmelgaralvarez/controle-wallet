-- ============================================================
-- «Entra todo o no entra nada» pasa a ser cierto
--
-- La pantalla de importar lo promete con esas palabras. Era verdad
-- DENTRO de esta función, y mentira fuera: los rubros nuevos y el
-- aprendizaje comercio → rubro se escribían en dos peticiones sueltas
-- ANTES de llamarla, sin transacción que las cubriera.
--
-- EL DEFECTO QUE ESO DESTAPÓ, Y CÓMO SE VEÍA
--
-- El núcleo es puro: no conoce la base, así que a un rubro nuevo le
-- pone un identificador que inventa el navegador. Ese identificador
-- queda metido en dos sitios —el aprendizaje del comercio y el
-- `gasto_id` de cada movimiento— pero la fila que se le mandaba a la
-- base NO lo llevaba. Postgres asignaba otro con `gen_random_uuid()`,
-- el del navegador se perdía, y todo lo que apuntaba a él quedaba
-- apuntando al vacío: violación de llave foránea, que PostgREST
-- contesta con 409 y el cliente traducía como «Ese registro ya
-- existe» — justo lo contrario de lo que pasaba.
--
-- Y COBRABA INTERESES. El paso 1 —crear los rubros— sí funcionaba y
-- no se deshacía. El 2 se caía. Como la recarga del documento va
-- después, el navegador seguía sin saber que esos rubros ya existían,
-- y al reintentar los volvía a crear. Cinco intentos dejaron cinco
-- copias de cada uno de los catorce rubros en el hogar de producción.
--
-- LA SALIDA NO ES MANDAR EL IDENTIFICADOR Y YA
--
-- Eso arregla la llave foránea y nada más. Mientras haya tres
-- peticiones, cualquier fallo entre la primera y la tercera vuelve a
-- dejar basura a medio escribir. Los rubros y los comercios entran
-- ACÁ, en la misma transacción que los movimientos: o queda todo, o
-- no queda nada — que es lo que la pantalla dice.
--
-- Y de paso las dos inserciones nuevas son idempotentes: `do nothing`
-- por identificador y `do update` por (hogar, clave). Reintentar deja
-- de poder duplicar aunque algo falle más adelante.
--
-- Reverso: supabase/reversos/20260818120000_importar_todo_o_nada.reverso.sql
-- ============================================================

drop function if exists public.importar_lote(
  text, uuid, date, date, text, jsonb, jsonb, jsonb, numeric, numeric,
  uuid[], uuid[], uuid[]);

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
  p_borrar_pagos       uuid[] default '{}',
  -- Los rubros que el archivo obliga a crear, CON el identificador que
  -- ya les puso el navegador: es el que traen los movimientos de este
  -- mismo lote y el aprendizaje de los comercios.
  p_rubros        jsonb default '[]'::jsonb,
  -- Lo aprendido: comercio → rubro.
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

  /* ---------- 0. los rubros que el archivo obliga a crear ----------

     PRIMERO, y en esta misma transacción, porque los movimientos que
     entran más abajo traen su `gasto_id` apuntando acá. El
     identificador viene del cuerpo: si lo pusiera la base, el que
     traen los movimientos no existiría.

     `do nothing` por identificador: si esto se reintenta después de un
     fallo posterior, el rubro no se duplica. */

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

  /* ---------- 0b. y lo aprendido: comercio → rubro ----------

     Después de los rubros, porque `gasto_id` apunta a ellos. Se
     actualiza si la clave ya estaba: reclasificar un comercio es
     precisamente cambiarle el rubro. */

  insert into public.comercios (hogar_id, clave, gasto_id)
  select v_hogar, left(x->>'clave', 120), nullif(x->>'gasto_id', '')::uuid
    from jsonb_array_elements(coalesce(p_comercios, '[]'::jsonb)) x
      on conflict (hogar_id, clave) do update set gasto_id = excluded.gasto_id;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('comercios', v_n);

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
  'Aplica un estado de cuenta en UNA transacción: crea los rubros que el archivo obliga —con el identificador que ya traen sus movimientos—, guarda el aprendizaje comercio → rubro, borra lo importado antes de esa fuente en ese rango e inserta lo del archivo. Va security invoker para que RLS siga decidiendo, y el hogar se deduce del destino en vez de recibirse.';

-- `anon` no: importar exige sesión iniciada, como todo lo demás.
grant execute on function public.importar_lote to authenticated;
