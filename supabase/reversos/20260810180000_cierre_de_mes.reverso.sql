-- ============================================================
-- REVERSO de 20260810180000_cierre_de_mes.sql
--
-- Quita lo que un cierre recuerda: la apertura sembrada, los ajustes
-- justificados y el efectivo contado.
--
-- QUÉ SE PIERDE DE VERDAD, dicho sin adornos: los meses que ya se
-- hayan cerrado siguen cerrados —`cerrado` y `montos` no se tocan—
-- pero pierden su cuadratura. La apertura vuelve a deducirse
-- recorriendo todo el histórico, y las justificaciones de los
-- descuadres desaparecen. El dinero no se mueve ni un centavo; lo
-- que se va es la explicación de por qué cuadraba.
--
-- Por eso, si ya hay meses cerrados, esto se revierte sabiendo cuál
-- es el respaldo más reciente. Ver VUELTA-ATRAS.md, caso 3.
--
-- Es seguro correr esto con el código anterior en línea: aquella
-- versión no conocía las columnas y nunca las leyó.
-- ============================================================

alter table public.presupuesto_mes
  drop column if exists apertura,
  drop column if exists ajustes,
  drop column if exists efectivo_contado;

delete from supabase_migrations.schema_migrations where version = '20260810180000';
