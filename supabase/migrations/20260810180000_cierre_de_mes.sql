-- ============================================================
-- Lo que un mes cerrado tiene que recordar.
--
-- `presupuesto_mes` nació guardando el plan congelado —`montos` y
-- `notas`— y con eso basta para que un mes viejo no se reescriba
-- solo. Pero cerrar un mes es más que congelar el plan: es CUADRAR,
-- y de esa cuadratura salen tres datos que hoy no tienen dónde
-- vivir. El núcleo ya los lee (`aperturaDe` y `conciliaciones`, en
-- `nucleo/saldos.js`); las tablas nunca se los dieron.
--
--   apertura          con qué saldos arrancó el mes
--   ajustes           el descuadre que alguien reconoció y explicó
--   efectivo_contado  lo que de verdad había en la mano
--
-- POR QUÉ LA APERTURA ES LA PIEZA IMPORTANTE
--
-- Cerrar un mes siembra en el siguiente la foto de cómo terminó:
-- saldo final = saldo inicial, sin huecos. Eso hace dos cosas.
--
-- La primera es que la historia encadene: sin apertura sembrada,
-- cada mes empezaría de cero y no habría forma de saber si el hogar
-- avanzó o retrocedió.
--
-- La segunda es la que no se ve y vale más. Sin apertura, calcular
-- el arranque de un mes obliga a recorrer TODO lo anterior —es
-- `saldosCierre` sumando desde el primer día— y el navegador solo
-- tiene el mes en curso. Con la apertura sembrada, el arranque es un
-- dato guardado, no una deducción, y el cierre se calcula con lo que
-- ya está en pantalla. Es el mismo mecanismo que las anclas del
-- banco, aplicado al tiempo en vez de al saldo: **una cadena de
-- meses cerrados es un ancla que se renueva sola**.
--
-- POR QUÉ `jsonb` Y NO TABLAS
--
-- Los tres se escriben de una sola vez, al cerrar, y después no se
-- tocan: un mes cerrado es inmutable y el disparador `impedir_mes_
-- cerrado` lo impone en la base. No hay dos personas editándolos a
-- la vez, que es el problema que las tablas vienen a resolver. Es el
-- mismo criterio con el que ya viven `montos` y `notas`.
--
-- `ajustes` lleva `not null default '{}'` como sus hermanas; los
-- otros dos van NULOS a propósito. Un `{}` diría «se abrió el mes
-- sin nada», y un `0` diría «contaron y no había nada» — las dos
-- cosas son afirmaciones. Nulo dice lo único cierto mientras nadie
-- cierre: que no se ha hecho.
--
-- MIGRACIÓN ADITIVA: tres columnas opcionales sobre una tabla que
-- hoy nadie escribe todavía. El código anterior sigue funcionando
-- sin cambios, que es lo que permite revertir el código sin tocar
-- la base.
--
-- Reverso: supabase/reversos/20260810180000_cierre_de_mes.reverso.sql
-- ============================================================

alter table public.presupuesto_mes
  add column apertura         jsonb,
  add column ajustes          jsonb not null default '{}'::jsonb,
  add column efectivo_contado numeric(14,2)
    check (efectivo_contado is null or efectivo_contado >= 0);

comment on column public.presupuesto_mes.apertura is
  'Foto de los saldos con que arrancó el mes, sembrada al cerrar el anterior. Nulo = todavía se deduce recorriendo el histórico.';

comment on column public.presupuesto_mes.ajustes is
  'Descuadres reconocidos al conciliar: clave de la conciliación → {monto, nota}. Sin nota no cuenta como resuelto.';

comment on column public.presupuesto_mes.efectivo_contado is
  'Lo que había en la mano al cerrar, contado. Es el ancla del efectivo, que no tiene una del banco.';
