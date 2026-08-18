-- ============================================================
-- REPARACIÓN — esto SÍ cambia filas. Borra.
--
-- NO SE CORRE SIN HABER LEÍDO `rubros-duplicados-informe.sql` PRIMERO.
-- Producción no tiene respaldo automático.
--
-- QUÉ HACE, EN UNA SOLA TRANSACCIÓN
--
--   1. De cada grupo de rubros con el mismo nombre en el mismo hogar,
--      elige UNO que se queda: el más viejo. Es el que tiene más
--      probabilidad de estar referenciado desde algo anterior al fallo.
--   2. Si alguna copia traía un monto presupuestado y la que se queda
--      no, ese monto se conserva. Nadie va a acordarse de que tecleó el
--      presupuesto de Farmacia en la tercera copia.
--   3. Reapunta a la que se queda TODO lo que colgaba de las otras:
--      movimientos, aprendizaje de comercios, y las claves del plan
--      congelado de los meses cerrados.
--   4. Recién entonces borra las copias.
--
-- POR QUÉ SE APAGA UN DISPARADOR, Y POR QUÉ ESO NO ES UNA TRAMPA
--
-- `mes_cerrado_movimientos` prohíbe tocar un movimiento de un mes ya
-- cerrado, y hace bien: sin él, la conciliación no vale nada. Pero acá
-- no se está cambiando NADA de lo que ese bloqueo protege — ni la fecha,
-- ni el monto, ni el periodo. Se cambia a qué fila apunta un rubro que
-- es la MISMA cosa con otro identificador. El mes cerrado queda idéntico
-- peso por peso; lo único que cambia es que deja de apuntar a una fila
-- que va a desaparecer.
--
-- Se apaga y se vuelve a encender DENTRO de la transacción. En Postgres
-- el DDL es transaccional: si algo falla a mitad, el disparador vuelve
-- solo junto con todo lo demás. No hay estado en que quede apagado.
--
-- CÓMO SE DESHACE: no se deshace. Por eso va el informe antes.
-- ============================================================

begin;

-- Quién se queda y quién se va. Se materializa ANTES de tocar nada:
-- si se calculara sobre la marcha, cada borrado cambiaría el cálculo
-- del siguiente.
create temp table plan_rubros on commit drop as
select g.id,
       g.hogar_id,
       g.concepto,
       g.monto,
       first_value(g.id) over (partition by g.hogar_id, lower(btrim(g.concepto))
                               order by g.creado_en, g.id) as se_queda,
       row_number()      over (partition by g.hogar_id, lower(btrim(g.concepto))
                               order by g.creado_en, g.id) as puesto,
       count(*)          over (partition by g.hogar_id, lower(btrim(g.concepto))) as copias
  from public.gastos g;

create temp table a_borrar on commit drop as
select id, hogar_id, se_queda, monto from plan_rubros where copias > 1 and puesto > 1;

-- Nada que hacer: se sale sin tocar nada y sin dar error.
do $$
begin
  if not exists (select 1 from a_borrar) then
    raise notice 'No hay rubros duplicados. No se cambió nada.';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. El presupuesto que se hubiera perdido.
--
-- Si una copia traía monto y la que se queda está en cero, se conserva
-- el mayor del grupo. Es la única pieza de esto que no es puramente
-- mecánica, y por eso el informe la enseña antes en `monto_mayor`.
-- ------------------------------------------------------------
update public.gastos q
   set monto = mayor.monto
  from (select b.se_queda, max(b.monto) as monto
          from a_borrar b group by b.se_queda) mayor
 where q.id = mayor.se_queda
   and q.monto = 0
   and mayor.monto > 0;

-- ------------------------------------------------------------
-- 3. El plan CONGELADO de los meses cerrados.
--
-- `montos` y `notas` son jsonb con el identificador del rubro como
-- CLAVE, y eso no es una llave foránea: borrar el rubro dejaría la clave
-- apuntando a nada, en silencio, dentro de un mes ya conciliado.
--
-- Si la clave destino ya existía, los montos se SUMAN: son dos líneas
-- del mismo rubro y el total del mes tiene que quedar igual.
-- ------------------------------------------------------------
update public.presupuesto_mes p
   set montos = (
         select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
           from (select coalesce(b.se_queda::text, e.key) as k,
                        sum((e.value)::numeric)           as v
                   from jsonb_each_text(p.montos) e
                   left join a_borrar b on b.id::text = e.key
                  group by 1) t
       )
 where exists (select 1 from jsonb_each_text(p.montos) e
                join a_borrar b on b.id::text = e.key);

update public.presupuesto_mes p
   set notas = (
         select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
           from (select coalesce(b.se_queda::text, e.key) as k,
                        string_agg(e.value, ' · ')        as v
                   from jsonb_each_text(p.notas) e
                   left join a_borrar b on b.id::text = e.key
                  group by 1) t
       )
 where exists (select 1 from jsonb_each_text(p.notas) e
                join a_borrar b on b.id::text = e.key);

-- ------------------------------------------------------------
-- 4. Los movimientos y el aprendizaje de los comercios.
--
-- El disparador se apaga solo para esto y vuelve tres líneas después.
-- Ver el porqué arriba: no se toca ni una cifra del mes cerrado.
-- ------------------------------------------------------------
alter table public.movimientos disable trigger mes_cerrado_movimientos;

update public.movimientos m
   set gasto_id = b.se_queda
  from a_borrar b
 where m.gasto_id = b.id;

alter table public.movimientos enable trigger mes_cerrado_movimientos;

update public.comercios c
   set gasto_id = b.se_queda
  from a_borrar b
 where c.gasto_id = b.id;

-- ------------------------------------------------------------
-- 5. Y recién ahora, las copias.
--
-- Después de reapuntar y no antes: `comercios.gasto_id` es
-- `on delete cascade`, así que borrar primero se habría llevado por
-- delante el aprendizaje de qué comercio va a qué rubro — en silencio.
-- ------------------------------------------------------------
delete from public.gastos g using a_borrar b where g.id = b.id;

-- ------------------------------------------------------------
-- 6. Lo que quedó. Se lee ANTES de confirmar.
-- ------------------------------------------------------------
select 'DESPUÉS' as caso,
       (select count(*) from public.gastos)                        as rubros,
       (select count(*) from a_borrar)                             as borrados,
       (select count(*) from public.movimientos where gasto_id is null) as movimientos_sin_rubro,
       (select count(*) from public.comercios)                     as comercios;

select 'RUBROS QUE QUEDAN' as caso, concepto, monto
  from public.gastos order by orden, concepto;

-- Si los números cuadran: COMMIT.  Si no: ROLLBACK.
-- Se deja SIN confirmar a propósito — el paso que borra en producción
-- lo da una persona, no un archivo.
