-- ============================================================
-- REPARACIÓN — cambia filas, pero NO BORRA NINGUNA.
--
-- Leer primero `debito-sin-tarjeta-informe.sql`.
--
-- QUÉ HACE, EN UNA SOLA TRANSACCIÓN
--   1. A cada cuenta que tiene compras importadas sin tarjeta y no tiene
--      tarjeta de débito, le crea una: «Débito <cuenta>». Solo el nombre;
--      ningún dígito del plástico. Es lo mismo que hace hoy el importador.
--   2. Cuelga esas compras de la tarjeta de débito de su cuenta: desde ese
--      momento bajan el saldo de la cuenta, como pasó en la realidad.
--   3. Las pone a nombre del dueño de la cuenta, si la cuenta tiene uno.
--
-- POR QUÉ SE APAGA EL CANDADO DEL MES CERRADO: igual que en la reparación
-- de rubros duplicados. No se cambia ni fecha, ni monto, ni periodo: se
-- dice de qué plástico salió una compra que ya estaba contada. Se apaga y
-- se enciende DENTRO de la transacción; si algo falla, vuelve solo.
--
-- CÓMO SE DESHACE: la lista de ids queda en la salida del paso 4. Con
-- ella, `update public.movimientos set tarjeta_id = null ...` y borrar las
-- tarjetas creadas. Por eso se lee antes de confirmar.
-- ============================================================

begin;

create temp table sin_tarjeta on commit drop as
select m.id, m.persona_id, c.id as cuenta_id, c.nombre as cuenta, c.hogar_id,
       (select p.id from public.personas p where p.cuenta_id = c.id
         order by p.creado_en limit 1) as dueno_id
  from public.movimientos m
  join public.cuentas c on m.fuente = 'cuenta:' || c.id::text
 where m.origen = 'import' and m.medio_pago = 'tarjeta' and m.tarjeta_id is null;

-- 1. La tarjeta de débito que falta, una por cuenta.
insert into public.tarjetas (hogar_id, nombre, tipo, cuenta_id)
select distinct s.hogar_id, left('Débito ' || s.cuenta, 60), 'debito'::public.tipo_tarjeta, s.cuenta_id
  from sin_tarjeta s
 where not exists (select 1 from public.tarjetas t
                    where t.tipo = 'debito' and t.cuenta_id = s.cuenta_id);

alter table public.movimientos disable trigger mes_cerrado_movimientos;

-- 2 y 3. De qué plástico salió, y de quién es la cuenta.
update public.movimientos m
   set tarjeta_id = (select t.id from public.tarjetas t
                      where t.tipo = 'debito' and t.cuenta_id = s.cuenta_id
                      order by t.creado_en limit 1),
       persona_id = coalesce(s.dueno_id, m.persona_id)
  from sin_tarjeta s
 where m.id = s.id;

alter table public.movimientos enable trigger mes_cerrado_movimientos;

-- 4. Lo que quedó. Se lee ANTES de confirmar.
select 'REPARADO' as caso, s.cuenta, count(*) as compras,
       string_agg(s.id::text, ' · ') as ids
  from sin_tarjeta s group by s.cuenta;

select 'QUEDAN SIN TARJETA' as caso, count(*) as compras
  from public.movimientos
 where origen = 'import' and medio_pago = 'tarjeta' and tarjeta_id is null
   and fuente like 'cuenta:%';

-- Si cuadra: COMMIT.  Si no: ROLLBACK.
-- Se deja SIN confirmar a propósito: el paso que cambia producción lo da
-- una persona, no un archivo.
