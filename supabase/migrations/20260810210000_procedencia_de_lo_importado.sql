-- ============================================================
-- De dónde salió cada registro, para poder reimportar sin duplicar.
--
-- El importador de estados de cuenta (`nucleo/importar.js`, ya
-- portado) se apoya en una sola regla, y toda su seguridad cuelga de
-- ella:
--
--   EL ARCHIVO MANDA SOBRE SU PROPIO RANGO. Cada importación borra lo
--   que se había importado antes PARA ESA MISMA CUENTA Y DENTRO DE
--   ESAS MISMAS FECHAS, y vuelve a insertarlo.
--
-- Es exacto por definición: el exportado de la semana 3 contiene
-- íntegras la 1 y la 2, así que sustituirlo no puede duplicar nada
-- aunque se importe diez veces, y un cargo que el banco reversa
-- desaparece solo. La alternativa —comparar transacción por
-- transacción— es frágil: dos cargas de combustible de L 400 el mismo
-- día son dos gastos reales, no uno repetido, y ese método borraría
-- uno.
--
-- Para que la regla funcione hay que saber TRES cosas de cada fila:
--
--   origen   'manual' o 'import'. Lo tecleado a mano no se toca nunca.
--   fuente   'cuenta:<id>' o 'tarjeta:<id>'. Acota el borrado a la
--            cuenta del archivo: importar el estado del BAC no puede
--            llevarse por delante lo importado del Ficohsa.
--   lote     el nombre del archivo del que vino, para poder decir
--            «esto entró con estado-agosto.pdf» cuando algo no cuadre.
--
-- QUÉ FALTABA, Y POR QUÉ IMPORTA
--
-- `movimientos` ya tenía `origen` y `fuente`. `retiros` y
-- `pagos_tarjeta` no tenían ninguna de las tres, y el motor escribe
-- las tres en LAS TRES tablas. Sin ellas, la regla del reemplazo no
-- puede acotar el borrado —no hay con qué distinguir lo importado de
-- lo tecleado— así que reimportar un estado de cuenta duplicaría cada
-- retiro y cada pago de tarjeta. Un retiro duplicado no da error: se
-- resta dos veces del saldo, y el descuadre aparece en el cierre del
-- mes sin que nadie sepa de dónde salió.
--
-- Es el mismo hueco que las anclas de conciliación y que la apertura
-- del cierre, encontrado de la misma forma: mirando qué consume el
-- núcleo, no qué tiene el esquema.
--
-- MIGRACIÓN ADITIVA: columnas opcionales, con el mismo valor por
-- omisión que ya usa `movimientos`. Todo lo que hay hoy queda como
-- 'manual', que es exactamente lo que es — nadie ha importado nada
-- todavía. El código anterior sigue funcionando sin cambios.
--
-- Reverso: supabase/reversos/20260810210000_procedencia_de_lo_importado.reverso.sql
-- ============================================================

alter table public.movimientos
  add column lote text;

alter table public.retiros
  add column origen text not null default 'manual' check (origen in ('manual', 'import')),
  add column fuente text,
  add column lote   text;

alter table public.pagos_tarjeta
  add column origen text not null default 'manual' check (origen in ('manual', 'import')),
  add column fuente text,
  add column lote   text;

-- El borrado por rango pregunta siempre por lo mismo: de este hogar,
-- de esta fuente, entre estas dos fechas. Sin índice, cada
-- importación recorre la tabla entera del hogar.
create index movimientos_import_idx   on public.movimientos   (hogar_id, fuente, fecha) where origen = 'import';
create index retiros_import_idx       on public.retiros       (hogar_id, fuente, fecha) where origen = 'import';
create index pagos_tarjeta_import_idx on public.pagos_tarjeta (hogar_id, fuente, fecha) where origen = 'import';

comment on column public.retiros.origen is
  'manual = lo tecleó una persona y no se toca nunca. import = vino de un estado de cuenta y lo reemplaza la próxima importación del mismo rango.';
comment on column public.retiros.fuente is
  'cuenta:<id> o tarjeta:<id>. Acota el reemplazo al archivo de esa cuenta.';
comment on column public.movimientos.lote is
  'Nombre del archivo del que vino, para poder rastrear un registro hasta su estado de cuenta.';
