-- ============================================================
-- REVERSO de 20260808200000_anclas_de_conciliacion.sql
--
-- Quita las columnas de conciliación. Se pierde lo que el banco
-- había declarado; los movimientos no se tocan.
--
-- Es seguro correr esto con el código anterior en línea: aquella
-- versión no conocía estas columnas y nunca las leyó. Esa es la
-- ventaja de que la migración fuera aditiva.
-- ============================================================

alter table public.tarjetas
  drop column if exists retenido_fecha,
  drop column if exists retenido_monto,
  drop column if exists saldo_banco_fecha,
  drop column if exists saldo_banco_monto;

alter table public.cuentas
  drop column if exists saldo_banco_fecha,
  drop column if exists saldo_banco_monto;

delete from supabase_migrations.schema_migrations where version = '20260808200000';
