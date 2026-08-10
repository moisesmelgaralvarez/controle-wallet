-- ============================================================
-- REVERSO de 20260810120000_ingreso_copiado.sql
--
-- Quita la marca de «copiado, sin revisar». Los ingresos confirmados
-- no se tocan: siguen contando igual, porque `copiado_de` nunca
-- decidió un cálculo — solo decía si alguien había mirado la cifra.
--
-- Lo que se pierde al revertir es esa distinción: las filas que se
-- habían copiado con el atajo pasan a verse como confirmadas a mano.
-- Es una pérdida de matiz, no de dinero.
--
-- Es seguro correr esto con el código anterior en línea: aquella
-- versión no conocía la columna y nunca la leyó. Esa es la ventaja de
-- que la migración fuera aditiva.
-- ============================================================

alter table public.ingresos_mes
  drop column if exists copiado_de;

delete from supabase_migrations.schema_migrations where version = '20260810120000';
