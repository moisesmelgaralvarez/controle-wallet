-- ============================================================
-- REVERSO de 20260810210000_procedencia_de_lo_importado.sql
--
-- Quita de dónde vino cada registro.
--
-- QUÉ SE PIERDE DE VERDAD: los movimientos, retiros y pagos siguen
-- ahí —ni un centavo se mueve— pero dejan de saber si los tecleó una
-- persona o vinieron de un estado de cuenta, y de qué archivo.
--
-- La consecuencia práctica es que la siguiente importación ya no
-- puede reemplazar lo suyo: sin `origen` no hay forma de distinguir
-- lo importado de lo escrito a mano, así que reimportar duplicaría.
-- Por eso, si ya se importó algo, esto se revierte sabiendo cuál es
-- el respaldo más reciente. Ver VUELTA-ATRAS.md, caso 3.
--
-- Los índices caen con sus columnas; no hace falta borrarlos aparte.
--
-- Es seguro correr esto con el código anterior en línea: aquella
-- versión no conocía las columnas de `retiros` ni de `pagos_tarjeta`,
-- y `movimientos.origen` y `.fuente` —que son de otra migración— no
-- se tocan aquí.
-- ============================================================

alter table public.movimientos
  drop column if exists lote;

alter table public.retiros
  drop column if exists origen,
  drop column if exists fuente,
  drop column if exists lote;

alter table public.pagos_tarjeta
  drop column if exists origen,
  drop column if exists fuente,
  drop column if exists lote;

delete from supabase_migrations.schema_migrations where version = '20260810210000';
