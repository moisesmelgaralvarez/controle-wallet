-- ============================================================
-- Importar un estado de cuenta: borrar e insertar, o nada.
--
-- POR QUÉ ESTO ES UNA FUNCIÓN Y NO DOS VIAJES DESDE EL NAVEGADOR
--
-- La regla del importador obliga a BORRAR ANTES DE INSERTAR: cada
-- archivo reemplaza lo que se importó antes para esa cuenta dentro de
-- ese rango de fechas. El orden no es negociable —hay que quitar lo
-- viejo para que lo nuevo no duplique— y por eso, a diferencia del
-- cierre de mes, aquí NO se puede elegir un orden que haga inofensivo
-- el fallo a medias.
--
-- Desde el navegador serían dos viajes. Si el segundo no llega —se
-- cayó la red, se cerró la pestaña, el teléfono se durmió— el mes
-- queda con un HUECO: los movimientos viejos borrados y los nuevos sin
-- entrar. Y no es un hueco que se vea: la pantalla enseña menos gastos
-- de los que hubo, así que el mes parece que salió barato. La persona
-- cierra el mes contenta y el error se descubre cuando el banco no
-- cuadra, semanas después.
--
-- Dentro de una función, las dos cosas son una sola transacción: o
-- entra todo o no se toca nada. Es la única forma honesta de hacerlo.
--
-- POR QUÉ `security invoker`
--
-- Para que las políticas RLS sigan decidiendo qué se puede tocar. Una
-- función `security definer` correría con los permisos de quien la
-- creó y tendría que filtrar por hogar a mano — y filtrar a mano es
-- teatro: el día que alguien borre esa línea se lleva el aislamiento
-- con ella. Aquí, si el hogar no es tuyo, RLS no te deja borrar ni
-- insertar, y la función no tiene nada que decidir al respecto.
--
-- EL HOGAR NO SE PIDE: SE DEDUCE
--
-- Sale de la cuenta o la tarjeta de destino, que a su vez está detrás
-- de RLS. Si se recibiera como parámetro habría que confiar en que el
-- navegador manda el suyo, y el navegador se asume hostil.
--
-- LO QUE EL LLAMADOR NO PUEDE FALSEAR
--
-- `origen`, `fuente`, `lote` y `hogar_id` los pone la función, no el
-- cuerpo que llega. Si vinieran de afuera, alguien podría insertar
-- filas marcadas 'manual' —que ninguna importación futura borraría— o
-- con la fuente de otra cuenta, y el reemplazo por rango dejaría de
-- ser exacto. Del cuerpo solo se leen los campos de dinero y fecha.
--
-- UN MES CERRADO SIGUE SIENDO INTOCABLE
--
-- No hace falta comprobarlo aquí: el disparador `impedir_mes_cerrado`
-- vive en las tres tablas y aborta la transacción entera. Que la
-- importación falle completa es justo lo correcto — media importación
-- sobre un mes cerrado sería peor.
--
-- Reverso: supabase/reversos/20260810230000_importar_lote.reverso.sql
-- ============================================================

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
  p_retenido      numeric default null
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
