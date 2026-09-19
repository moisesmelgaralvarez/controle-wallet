-- ============================================================
-- INFORME — SOLO LECTURA. No cambia ni una fila.
--
-- Las compras leídas del estado de cuenta de una CUENTA que quedaron como
-- «tarjeta» sin tarjeta, de antes de que el importador creara la tarjeta
-- de débito solo (migración 20260918120000). No bajan ninguna cuenta ni
-- suben ninguna deuda: dinero gastado que ningún saldo refleja.
--
-- Y quién figura como que las hizo: el importador anterior le cargaba
-- todo a la primera persona del hogar, incluido lo de la cuenta de otro.
--
-- Se corre en el editor SQL de producción. Si sale vacío, no hay nada que
-- reparar. Si no, `debito-sin-tarjeta-reparar.sql`.
-- ============================================================

select c.nombre                                   as cuenta,
       count(*)                                   as compras,
       sum(m.monto)                               as total,
       min(m.fecha)                               as desde,
       max(m.fecha)                               as hasta,
       (select t.nombre from public.tarjetas t
         where t.tipo = 'debito' and t.cuenta_id = c.id limit 1) as debito_existente,
       dueno.nombre                               as dueno_de_la_cuenta,
       count(*) filter (where m.persona_id is distinct from dueno.id) as a_nombre_de_otro
  from public.movimientos m
  join public.cuentas c
    on m.fuente = 'cuenta:' || c.id::text
  left join lateral (select p.id, p.nombre from public.personas p
                      where p.cuenta_id = c.id order by p.creado_en limit 1) dueno on true
 where m.origen = 'import'
   and m.medio_pago = 'tarjeta'
   and m.tarjeta_id is null
 group by c.id, c.nombre, dueno.id, dueno.nombre
 order by c.nombre;
