-- ============================================================
-- Un mes cerrado no puede impedirte borrar tu cuenta.
--
-- DOS REGLAS DEL PROYECTO CHOCANDO, Y NADIE LO HABÍA NOTADO
--
-- 1. Un mes cerrado es inmutable, y lo impone la base con un
--    disparador sobre movimientos, retiros, pagos y ingresos. Sin eso
--    la conciliación no valdría nada.
--
-- 2. La política de privacidad publicada dice que podés llevarte todo
--    y borrarlo todo cuando querás.
--
-- Al borrar un usuario, el disparador `borrar_hogar_sin_miembros`
-- elimina su hogar y el `on delete cascade` arrastra las veinte
-- tablas… y ahí `impedir_mes_cerrado` abortaba el borrado entero.
--
-- Resultado: CUALQUIERA QUE HUBIERA CERRADO UN MES NO PODÍA BORRAR SU
-- CUENTA NUNCA. La app prometía por escrito algo que la base impedía.
-- Salió en la primera prueba del borrado real, con un mes de mayo
-- cerrado de por medio.
--
-- CUÁL DE LAS DOS GANA, Y POR QUÉ
--
-- La privacidad. La inmutabilidad del mes cerrado protege la
-- contabilidad DEL DUEÑO de esos datos: existe para que nadie le
-- reescriba un mes ya cuadrado. Cuando esa misma persona decide
-- borrarlo todo, no queda nada que proteger — y sostener la regla
-- ahí la convierte en lo contrario de lo que era: un candado sobre
-- datos que su dueño quiere fuera.
--
-- CÓMO SE DISTINGUE UN BORRADO DE UN CAMBIO
--
-- Con una marca explícita que solo pone `borrar_hogar_sin_miembros`
-- justo antes de eliminar el hogar, y que dura lo que la transacción.
-- Se descartó la alternativa astuta —mirar si el hogar ya no existe—
-- porque depende de en qué orden aplica Postgres el cascade, y una
-- defensa que se apoya en un detalle de implementación se rompe en
-- una actualización sin avisar a nadie.
--
-- La marca NO abre ningún hueco: `set_config` con `is_local = true`
-- vive dentro de la transacción, y solo la pone una función
-- `security definer` que nadie puede llamar desde la API. Desde el
-- navegador no hay forma de encenderla.
--
-- Reverso: supabase/reversos/20260811030000_borrar_cuenta_con_mes_cerrado.reverso.sql
-- ============================================================

create or replace function public.impedir_mes_cerrado()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_hogar   uuid;
  v_periodo text;
begin
  if tg_op = 'DELETE' then
    v_hogar := old.hogar_id; v_periodo := old.periodo;
  else
    v_hogar := new.hogar_id; v_periodo := new.periodo;
  end if;

  /* Si el hogar entero se está yendo, no hay mes que proteger.

     Se comprueba de DOS maneras, y no es redundancia inútil: la marca
     la pone `borrar_hogar_sin_miembros` cuando el borrado pasa por
     ahí, pero el borrado de un usuario lo ejecuta GoTrue por su
     cuenta y no siempre se ve la marca desde aquí. Lo que sí es
     cierto en todos los caminos es que, cuando el cascade llega a
     esta fila, la fila del hogar YA NO ESTÁ.

     Y la tercera es la que de verdad cierra el caso, porque es cierta
     pase lo que pase con el orden del cascade y con la visibilidad de
     la marca: SI EL HOGAR YA NO TIENE MIEMBROS, no queda nadie cuya
     contabilidad haya que proteger. La regla existe para que a una
     persona no le reescriban un mes cuadrado; sin personas, no hay
     nada que defender.

     Las tres solo aplican al BORRAR. Un INSERT o un UPDATE sobre un
     mes cerrado sigue bloqueado siempre, sin excepción: ahí sí habría
     alguien a quien le cambiarían las cuentas.

     Cualquiera de las tres que dé positivo basta. Ninguna abre un
     hueco: si el hogar existe, la regla sigue entera, y `set_config`
     con `is_local` solo lo puede encender una función `security
     definer` que nadie alcanza desde la API. */
  /* EL CASO QUE COSTÓ ENCONTRARLO.

     Cada fila guarda en `actualizado_por` quién la tocó, con
     `on delete set null` hacia `auth.users`. Así que borrar un usuario
     no solo BORRA filas: además hace un UPDATE sobre cada fila que esa
     persona escribió alguna vez, poniendo ese campo en nulo. Y ese
     UPDATE chocaba con el candado del mes cerrado.

     O sea: cualquiera que hubiera cerrado un mes Y hubiera escrito
     esos datos desde su propia sesión —es decir, todo el mundo— no
     podía borrar su cuenta. Se escondió mucho tiempo porque al
     probarlo con la clave de servicio el campo queda nulo y el UPDATE
     nunca ocurre.

     Se deja pasar solo si NO cambia nada más: se comparan las dos
     versiones de la fila sin `actualizado_por` ni `actualizado_en`, y
     tienen que ser idénticas. Si alguien intenta colar un cambio de
     monto o de fecha aprovechando esto, las dos versiones difieren y
     el candado actúa igual. */
  if tg_op = 'UPDATE'
     and new.actualizado_por is null
     and old.actualizado_por is not null
     and (to_jsonb(new) - 'actualizado_por' - 'actualizado_en')
       = (to_jsonb(old) - 'actualizado_por' - 'actualizado_en')
  then
    return new;
  end if;

  if tg_op = 'DELETE' and (
       current_setting('app.borrando_hogar', true) = 'si'
       or not exists (select 1 from public.hogares h where h.id = v_hogar)
       or not exists (select 1 from public.miembros m where m.hogar_id = v_hogar))
  then
    return old;
  end if;

  if exists (select 1 from public.presupuesto_mes p
             where p.hogar_id = v_hogar and p.periodo = v_periodo and p.cerrado) then
    raise exception 'El mes % ya está cerrado y no admite cambios.', v_periodo
      using errcode = 'check_violation';
  end if;

  -- En un UPDATE también hay que mirar el mes de ORIGEN: si no,
  -- se podría sacar un registro de un mes cerrado moviéndole la
  -- fecha a uno abierto, y el cierre dejaría de cuadrar.
  if tg_op = 'UPDATE' and old.periodo is distinct from new.periodo then
    if exists (select 1 from public.presupuesto_mes p
               where p.hogar_id = old.hogar_id and p.periodo = old.periodo and p.cerrado) then
      raise exception 'El mes % ya está cerrado: no se puede sacar un registro de ahí.', old.periodo
        using errcode = 'check_violation';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.borrar_hogar_sin_miembros()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.miembros m where m.hogar_id = old.hogar_id) then
    /* La marca que le dice a `impedir_mes_cerrado` que esto es un
       borrado del hogar entero y no un cambio dentro de un mes.
       `true` = local a la transacción: se apaga sola al terminar,
       pase lo que pase. */
    perform set_config('app.borrando_hogar', 'si', true);

    -- Todo lo del presupuesto cuelga de `hogares` con `on delete
    -- cascade`, así que esta sola línea se lleva las veinte tablas.
    delete from public.hogares where id = old.hogar_id;

    perform set_config('app.borrando_hogar', 'no', true);
  end if;
  return old;
end;
$$;

comment on function public.impedir_mes_cerrado is
  'Un mes cerrado no admite cambios. Excepción: cuando se está borrando el hogar entero, porque entonces no queda contabilidad que proteger y la política de privacidad promete poder borrarlo todo.';
