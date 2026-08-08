-- ============================================================
-- REVERSO de 20260808191000_presupuesto.sql
--
-- OJO — ESTO BORRA TODO EL PRESUPUESTO DE TODOS LOS HOGARES.
-- Movimientos, ingresos confirmados, cierres de mes, saldos: todo.
-- Un reverso devuelve la FORMA de las tablas, nunca lo que había
-- dentro. Ver VUELTA-ATRAS.md, caso 3.
--
-- Antes de correr esto sobre producción: restaurar respaldo, no
-- ejecutar y ver qué pasa.
--
-- El orden es el inverso al de creación: primero lo que depende de
-- otras tablas, al final lo que las sostiene.
-- ============================================================

drop trigger if exists reapertura_solo_propietario on public.presupuesto_mes;
drop function if exists public.impedir_reapertura();

do $$
declare t text;
begin
  foreach t in array array['movimientos','retiros','pagos_tarjeta','ingresos_mes']
  loop
    execute format('drop trigger if exists %I on public.%I', 'mes_cerrado_' || t, t);
  end loop;
end $$;

drop function if exists public.impedir_mes_cerrado();

do $$
declare t text;
begin
  foreach t in array array['cuentas','personas','plantilla_ingresos','plantilla_lineas',
                           'tarjetas','gastos','financiamientos','proyectos','ingresos_mes',
                           'movimientos','retiros','pagos_tarjeta','aportes',
                           'presupuesto_mes','comercios']
  loop
    execute format('drop trigger if exists %I on public.%I', 'tocar_' || t, t);
  end loop;
end $$;

drop function if exists public.tocar_fila();

-- Las políticas y los índices se van solos con la tabla.
drop table if exists public.comercios;
drop table if exists public.presupuesto_mes;
drop table if exists public.aportes;
drop table if exists public.pagos_tarjeta;
drop table if exists public.retiros;
drop table if exists public.movimientos;
drop table if exists public.ingresos_mes;
drop table if exists public.proyectos;
drop table if exists public.financiamientos;
drop table if exists public.gastos;
drop table if exists public.tarjetas;
drop table if exists public.plantilla_lineas;
drop table if exists public.plantilla_ingresos;
drop table if exists public.personas;
drop table if exists public.cuentas;

drop type if exists public.tipo_tarjeta;
drop type if exists public.medio_pago;
