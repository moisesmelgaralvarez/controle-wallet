-- ============================================================
-- Las anclas de conciliación que faltaban.
--
-- El núcleo lee de las cuentas y de las tarjetas dos datos que el
-- esquema no tenía:
--
--   saldoBanco = { monto, fecha }   lo que el BANCO dice que hay
--   retenido   = { monto, fecha }   ya gastado, aún sin aplicar
--
-- No son campos cosméticos: son el ancla contra la que se concilia.
-- `saldoCuenta` compara el saldo que la app calcula contra el que
-- declaró el banco y solo cuenta los movimientos POSTERIORES a esa
-- fecha; sin el ancla, esa comparación no existe y el cierre de mes
-- se queda sin una de sus tres conciliaciones.
--
-- Los escribe el importador de estados de cuenta: cuando se importa
-- un archivo, el saldo que trae queda anotado como la verdad del
-- banco a esa fecha.
--
-- Apareció al escribir el armador, comparando campo por campo lo
-- que el núcleo lee contra lo que las tablas ofrecen. Es la clase
-- de hueco que no se ve mirando el esquema: se ve mirando quién lo
-- consume.
--
-- MIGRACIÓN ADITIVA: solo agrega columnas opcionales, así que el
-- código anterior sigue funcionando sin cambios. Esa es la
-- propiedad que permite revertir el código sin tocar la base.
--
-- Reverso: supabase/reversos/20260808200000_anclas_de_conciliacion.reverso.sql
-- ============================================================

alter table public.cuentas
  add column saldo_banco_monto numeric(14,2),
  add column saldo_banco_fecha date;

alter table public.tarjetas
  add column saldo_banco_monto numeric(14,2),
  add column saldo_banco_fecha date,
  add column retenido_monto    numeric(14,2),
  add column retenido_fecha    date;

comment on column public.cuentas.saldo_banco_monto is
  'Lo que el banco declaró que hay. Ancla de la conciliación.';
comment on column public.tarjetas.retenido_monto is
  'Autorizado por el comercio y todavía no aplicado al estado de cuenta.';
