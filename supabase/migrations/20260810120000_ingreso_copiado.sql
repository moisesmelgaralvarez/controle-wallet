-- ============================================================
-- De qué mes se copió un ingreso, y que nadie lo ha revisado.
--
-- Confirmar un ingreso significa «alguien miró lo que de verdad
-- entró». El atajo que copia el mes anterior de un tirón ahorra
-- trabajo real —la mayoría de los meses entra lo mismo— pero deja
-- filas que cuentan como confirmadas SIN que nadie las haya mirado.
-- Decir «confirmado» de eso sería inventarse un hecho.
--
-- Así que la copia se marca. `copiado_de` guarda el mes del que salió
-- la cifra y se borra en cuanto alguien abre ese pago y lo guarda:
-- abrirlo y guardarlo ES revisarlo. Mientras esté puesto, la pantalla
-- lo enseña como «copiado de julio, sin revisar».
--
-- El núcleo ya contaba con esto —viene de la app anterior y tiene su
-- prueba portada— pero al normalizar el esquema la columna se quedó
-- sin migrar, así que el armador no tenía de dónde leerla.
--
-- MIGRACIÓN ADITIVA: una columna opcional. El código anterior sigue
-- funcionando sin cambios, que es lo que permite revertir el código
-- sin tocar la base.
--
-- Reverso: supabase/reversos/20260810120000_ingreso_copiado.reverso.sql
-- ============================================================

alter table public.ingresos_mes
  add column copiado_de text
    check (copiado_de is null or copiado_de ~ '^\d{4}-\d{2}$');

comment on column public.ingresos_mes.copiado_de is
  'Mes del que se copió esta cifra con el atajo, mientras nadie la haya revisado. Nulo = lo confirmó una persona mirándolo.';
