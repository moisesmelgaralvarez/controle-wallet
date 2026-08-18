-- ============================================================
-- INFORME — SOLO LECTURA. No cambia ni una fila.
--
-- Qué dejó el defecto de la importación del 18 de agosto de 2026.
--
-- El navegador inventaba el identificador de cada rubro nuevo y no lo
-- mandaba; la base asignaba otro; todo lo que apuntaba al primero
-- quedaba apuntando al vacío y la importación se caía. Pero los rubros
-- SÍ quedaban creados, y como el navegador no se enteraba, el siguiente
-- intento los volvía a crear.
--
-- Se corre en el editor SQL de Supabase (producción) y su salida es lo
-- que decide si la reparación se ejecuta o no. Se mira, se lee, y recién
-- después se corre `rubros-duplicados-reparar.sql`.
--
-- LO QUE HAY QUE MIRAR, EN ORDEN:
--   1 · cuántos grupos duplicados hay y cuántas filas sobran
--   2 · qué cuelga de cada copia — si algo cuelga, la reparación lo mueve
--   3 · si alguna copia aparece en el plan CONGELADO de un mes cerrado
--   4 · si algún mes afectado está cerrado (eso obliga a tocar el
--       disparador, y conviene saberlo ANTES y no a mitad de camino)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Los grupos duplicados: mismo hogar, mismo nombre.
--
-- El nombre se normaliza en minúsculas y sin espacios de sobra. No hace
-- falta más: las copias las escribió el mismo código con el mismo texto,
-- así que son idénticas carácter por carácter.
-- ------------------------------------------------------------
select 'GRUPO DUPLICADO'                        as caso,
       g.hogar_id,
       min(g.concepto)                          as rubro,
       count(*)                                 as copias,
       count(*) - 1                             as sobran,
       min(g.creado_en)                         as la_mas_vieja,
       max(g.monto)                             as monto_mayor,
       string_agg(g.id::text, ' · ' order by g.creado_en, g.id) as ids
  from public.gastos g
 group by g.hogar_id, lower(btrim(g.concepto))
having count(*) > 1
 order by count(*) desc, min(g.concepto);

-- ------------------------------------------------------------
-- 2. Qué cuelga de cada copia.
--
-- Si todo sale en cero, el borrado es limpio. Si no, la reparación
-- REAPUNTA antes de borrar — nada se pierde, pero conviene verlo.
-- ------------------------------------------------------------
with grupos as (
  select g.id, g.hogar_id, g.concepto, g.creado_en, g.monto,
         row_number() over (partition by g.hogar_id, lower(btrim(g.concepto))
                            order by g.creado_en, g.id) as puesto,
         count(*)  over (partition by g.hogar_id, lower(btrim(g.concepto))) as copias
    from public.gastos g
)
select 'QUÉ CUELGA' as caso,
       gr.concepto  as rubro,
       case when gr.puesto = 1 then 'SE QUEDA' else 'se borra' end as destino,
       gr.id,
       gr.monto,
       (select count(*) from public.movimientos m  where m.gasto_id = gr.id) as movimientos,
       (select count(*) from public.comercios  c   where c.gasto_id = gr.id) as comercios,
       (select count(*) from public.presupuesto_mes p
         where p.hogar_id = gr.hogar_id
           and (p.montos ? gr.id::text or p.notas ? gr.id::text))            as meses_en_el_plan
  from grupos gr
 where gr.copias > 1
 order by gr.concepto, gr.puesto;

-- ------------------------------------------------------------
-- 3. El plan CONGELADO de un mes cerrado.
--
-- `presupuesto_mes.montos` y `.notas` son jsonb con el identificador del
-- rubro COMO CLAVE, y eso NO es una llave foránea: borrar un rubro deja
-- la clave apuntando a nada y nadie se entera. En un mes cerrado eso es
-- reescribir hacia atrás un mes ya conciliado.
-- ------------------------------------------------------------
with perdedores as (
  select g.id, g.hogar_id
    from (select g.*, row_number() over (partition by g.hogar_id, lower(btrim(g.concepto))
                                         order by g.creado_en, g.id) as puesto
            from public.gastos g) g
   where g.puesto > 1
)
select 'EN UN PLAN CONGELADO' as caso,
       p.periodo, p.cerrado, pe.id as rubro_que_se_borraría,
       p.montos -> pe.id::text as monto_congelado,
       p.notas  -> pe.id::text as nota_congelada
  from public.presupuesto_mes p
  join perdedores pe on pe.hogar_id = p.hogar_id
 where p.montos ? pe.id::text or p.notas ? pe.id::text;

-- ------------------------------------------------------------
-- 4. ¿Hay meses cerrados con movimientos que habría que reapuntar?
--
-- El disparador `mes_cerrado_movimientos` prohíbe tocar un movimiento de
-- un mes cerrado — con razón. Si esto devuelve filas, la reparación
-- tiene que apagar ese disparador durante la transacción, y eso hay que
-- saberlo antes de correrla, no descubrirlo por el error.
-- ------------------------------------------------------------
with perdedores as (
  select g.id, g.hogar_id
    from (select g.*, row_number() over (partition by g.hogar_id, lower(btrim(g.concepto))
                                         order by g.creado_en, g.id) as puesto
            from public.gastos g) g
   where g.puesto > 1
)
select 'MES CERRADO AFECTADO' as caso, m.periodo, count(*) as movimientos
  from public.movimientos m
  join perdedores pe on pe.id = m.gasto_id
  join public.presupuesto_mes p
    on p.hogar_id = m.hogar_id and p.periodo = m.periodo and p.cerrado
 group by m.periodo;

-- ------------------------------------------------------------
-- 5. El resumen de una línea.
-- ------------------------------------------------------------
select 'RESUMEN' as caso,
       (select count(*) from public.gastos)                                  as rubros_hoy,
       (select count(distinct (hogar_id, lower(btrim(concepto))))
          from public.gastos)                                                as rubros_después,
       (select count(*) from public.gastos)
         - (select count(distinct (hogar_id, lower(btrim(concepto))))
              from public.gastos)                                            as se_borrarían;
