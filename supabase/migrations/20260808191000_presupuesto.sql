-- ============================================================
-- Las tablas del presupuesto.
--
-- Aquí se rompe el documento único `jsonb` de la app anterior en
-- tablas reales. No es cosmético: con el servidor autoritativo y
-- dos personas editando a la vez, un solo bloque por hogar
-- significa que el último que guarda le borra el trabajo al otro.
-- Con filas, cada quien escribe la suya.
--
-- DINERO EN `numeric(14,2)`, NO EN `float`. En la base los montos
-- se suman, se comparan y se concilian contra lo que dice el banco;
-- un flotante binario no representa 0.10 exacto y esas diferencias
-- se acumulan. (Dentro del núcleo de cálculo sí se trabaja con
-- números de JavaScript, que es como está probado desde hace meses
-- y tiene su propia tolerancia para las conciliaciones.)
--
-- Reverso: 20260808191000_presupuesto.reverso.sql
-- ============================================================

create type public.medio_pago  as enum ('tarjeta', 'efectivo');
create type public.tipo_tarjeta as enum ('credito', 'debito');

-- ------------------------------------------------------------
-- 1. Configuración del hogar
-- ------------------------------------------------------------

create table public.cuentas (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares(id) on delete cascade,
  nombre          text not null,
  -- Sirve para que al importar un estado de cuenta la app sepa sola
  -- de qué cuenta es. No es un dato sensible de pago.
  numero          text,
  saldo_inicial   numeric(14,2) not null default 0,
  desde_mes       text not null,
  -- "Retenidos y diferidos": compras hechas que el comercio aún no
  -- cobra. Ese dinero ya no es del hogar aunque el saldo lo muestre.
  retenido_monto  numeric(14,2),
  retenido_fecha  date,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null
);

create table public.personas (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares(id) on delete cascade,
  nombre          text not null,
  -- Dónde le depositan. Vive en la persona, no en la cuenta: es la
  -- persona la que dice dónde cobra.
  cuenta_id       uuid references public.cuentas(id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null
);

create table public.plantilla_ingresos (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares(id) on delete cascade,
  nombre          text not null,
  dia             smallint not null check (dia between 1 and 31),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null
);

-- Cuánto le toca a cada persona de cada pago, en un mes típico.
-- Las deducciones van en `jsonb` a propósito: son un detalle del
-- renglón —concepto y monto—, siempre se leen y se escriben junto
-- con él, y nadie edita una retención suelta desde otra pantalla.
-- Partirlas en su propia tabla daría dos consultas más por nada.
create table public.plantilla_lineas (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares(id) on delete cascade,
  plantilla_id    uuid not null references public.plantilla_ingresos(id) on delete cascade,
  persona_id      uuid not null references public.personas(id) on delete cascade,
  bruto           numeric(14,2) not null default 0,
  deducciones     jsonb not null default '[]'::jsonb,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null,
  unique (plantilla_id, persona_id)
);

create table public.tarjetas (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares(id) on delete cascade,
  nombre          text not null,
  numero          text,
  tipo            public.tipo_tarjeta not null default 'credito',
  dia_corte       smallint check (dia_corte between 1 and 31),
  dia_pago        smallint check (dia_pago between 0 and 31),
  -- Qué ingreso la paga. De aquí sale la pregunta del día 6.
  paga_con        uuid references public.plantilla_ingresos(id) on delete set null,
  -- La de débito se liga a una cuenta y no tiene ciclo de corte.
  cuenta_id       uuid references public.cuentas(id) on delete set null,
  saldo_inicial   numeric(14,2) not null default 0,
  desde_mes       text,
  paga_total      boolean not null default true,
  tasa_anual      numeric(6,2) not null default 0,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null,
  -- Una tarjeta de crédito sin día de corte no se puede calcular.
  constraint credito_con_corte check (tipo <> 'credito' or dia_corte is not null)
);

create table public.gastos (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares(id) on delete cascade,
  concepto        text not null,
  monto           numeric(14,2) not null default 0,
  categoria       text not null default 'Otros',
  medio_pago      public.medio_pago not null default 'tarjeta',
  tarjeta_id      uuid references public.tarjetas(id) on delete set null,
  -- Crecimiento mensual en por ciento. El de salud, sobre todo.
  crecimiento     numeric(5,2) not null default 0 check (crecimiento between 0 and 20),
  -- El orden es visual, pero se guarda: la lista tiene que verse
  -- igual en los dos teléfonos.
  orden           integer not null default 0,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null
);

create table public.financiamientos (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares(id) on delete cascade,
  nombre          text not null,
  cuota_mensual   numeric(14,2) not null default 0,
  cuotas_totales  integer not null default 0 check (cuotas_totales >= 0),
  cuotas_pagadas  integer not null default 0 check (cuotas_pagadas >= 0),
  tarjeta_id      uuid references public.tarjetas(id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null
);

create table public.proyectos (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares(id) on delete cascade,
  nombre          text not null,
  costo_min       numeric(14,2) not null default 0,
  costo_max       numeric(14,2) not null default 0,
  aporte_mensual  numeric(14,2) not null default 0,
  fecha_objetivo  date,
  nota            text,
  tipo            text not null default 'deseo',
  urgencia        text not null default 'algun_dia',
  consecuencia    text,
  -- Aquí el orden NO es cosmético: es la prioridad con la que se
  -- reparte el disponible en cascada. El primero reserva lo suyo y
  -- el segundo sugiere sobre lo que quedó.
  orden           integer not null default 0,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null
);

-- ------------------------------------------------------------
-- 2. Lo que pasa mes a mes
-- ------------------------------------------------------------

-- Lo que de verdad entró. La plantilla es estimación; esto es hecho.
create table public.ingresos_mes (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares(id) on delete cascade,
  periodo         text not null check (periodo ~ '^\d{4}-\d{2}$'),
  plantilla_id    uuid not null references public.plantilla_ingresos(id) on delete cascade,
  persona_id      uuid not null references public.personas(id) on delete cascade,
  bruto           numeric(14,2) not null default 0,
  deducciones     jsonb not null default '[]'::jsonb,
  confirmado      boolean not null default false,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null,
  unique (hogar_id, periodo, plantilla_id, persona_id)
);

create table public.movimientos (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares(id) on delete cascade,
  fecha           date not null,
  -- A qué mes DEL HOGAR pertenece. Se guarda en vez de calcularse
  -- porque el día de arranque puede cambiar, y un gasto ya
  -- registrado no debe saltar de mes por eso.
  periodo         text not null check (periodo ~ '^\d{4}-\d{2}$'),
  monto           numeric(14,2) not null,
  concepto        text,
  gasto_id        uuid references public.gastos(id)    on delete set null,
  persona_id      uuid references public.personas(id)  on delete set null,
  medio_pago      public.medio_pago not null default 'tarjeta',
  tarjeta_id      uuid references public.tarjetas(id)  on delete set null,
  -- De dónde salió: capturado a mano, importado o leído de factura.
  origen          text not null default 'manual',
  fuente          text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null
);

-- Sacar efectivo NO es un gasto: es un traslado de la cuenta a la
-- cartera. Contarlo como gasto contaría el mismo dinero dos veces.
create table public.retiros (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares(id) on delete cascade,
  fecha           date not null,
  periodo         text not null check (periodo ~ '^\d{4}-\d{2}$'),
  monto           numeric(14,2) not null check (monto > 0),
  cuenta_id       uuid references public.cuentas(id)   on delete set null,
  persona_id      uuid references public.personas(id)  on delete set null,
  nota            text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null
);

-- Pagar la tarjeta tampoco es un gasto nuevo: los consumos ya se
-- contaron. Esto solo mueve dinero de la cuenta a la tarjeta.
create table public.pagos_tarjeta (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares(id) on delete cascade,
  fecha           date not null,
  periodo         text not null check (periodo ~ '^\d{4}-\d{2}$'),
  monto           numeric(14,2) not null check (monto > 0),
  tarjeta_id      uuid references public.tarjetas(id) on delete set null,
  cuenta_id       uuid references public.cuentas(id)  on delete set null,
  nota            text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null
);

create table public.aportes (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares(id) on delete cascade,
  proyecto_id     uuid not null references public.proyectos(id) on delete cascade,
  persona_id      uuid references public.personas(id) on delete set null,
  fecha           date not null,
  monto           numeric(14,2) not null,
  nota            text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null
);

-- El plan congelado de un mes ya vivido. Sin esto, bajar el
-- presupuesto de supermercado en septiembre reescribiría agosto
-- hacia atrás y haría parecer que se pasaron cuando no fue así.
--
-- `montos` y `notas` van en `jsonb` (gasto_id → valor) porque se
-- escriben de una sola vez al cerrar el mes y después no se tocan.
-- No hay dos personas editándolos a la vez, que es el problema que
-- las tablas vienen a resolver.
create table public.presupuesto_mes (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares(id) on delete cascade,
  periodo         text not null check (periodo ~ '^\d{4}-\d{2}$'),
  montos          jsonb not null default '{}'::jsonb,
  notas           jsonb not null default '{}'::jsonb,
  cerrado         boolean not null default false,
  cerrado_el      timestamptz,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null,
  unique (hogar_id, periodo)
);

-- Lo aprendido al clasificar: comercio → rubro.
create table public.comercios (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares(id) on delete cascade,
  clave           text not null,
  gasto_id        uuid references public.gastos(id) on delete cascade,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references auth.users(id) on delete set null,
  unique (hogar_id, clave)
);

-- ------------------------------------------------------------
-- 3. Índices
--
-- Desde el principio, no cuando duela. Con mil hogares no hay
-- tiempo de andar arreglando consultas lentas en producción.
-- ------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['cuentas','personas','plantilla_ingresos','plantilla_lineas',
                           'tarjetas','gastos','financiamientos','proyectos','ingresos_mes',
                           'movimientos','retiros','pagos_tarjeta','aportes',
                           'presupuesto_mes','comercios']
  loop
    execute format('create index %I on public.%I (hogar_id)', t || '_hogar_idx', t);
  end loop;

  -- Todo lo que se consulta por mes.
  foreach t in array array['movimientos','retiros','pagos_tarjeta','ingresos_mes']
  loop
    execute format('create index %I on public.%I (hogar_id, periodo)', t || '_periodo_idx', t);
  end loop;

  -- Y lo que se lista por fecha.
  foreach t in array array['movimientos','retiros','pagos_tarjeta','aportes']
  loop
    execute format('create index %I on public.%I (hogar_id, fecha desc)', t || '_fecha_idx', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4. Un mes cerrado no se toca
--
-- El bloqueo va en la BASE, no en la pantalla. Si viviera solo en
-- el navegador, cualquiera con la consola abierta podría reescribir
-- un mes ya conciliado — y entonces la conciliación no vale nada.
-- ------------------------------------------------------------

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

do $$
declare t text;
begin
  foreach t in array array['movimientos','retiros','pagos_tarjeta','ingresos_mes']
  loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I
       for each row execute function public.impedir_mes_cerrado()',
      'mes_cerrado_' || t, t);
  end loop;
end $$;

-- Reabrir un mes es decisión del propietario, no un efecto
-- secundario de editar cualquier cosa.
create or replace function public.impedir_reapertura()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.cerrado and not new.cerrado and not public.es_propietario(new.hogar_id) then
    raise exception 'Solo el propietario del hogar puede reabrir un mes cerrado.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger reapertura_solo_propietario
  before update on public.presupuesto_mes
  for each row execute function public.impedir_reapertura();

-- ------------------------------------------------------------
-- 5. `actualizado_en` y `actualizado_por`
-- ------------------------------------------------------------

create or replace function public.tocar_fila()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['cuentas','personas','plantilla_ingresos','plantilla_lineas',
                           'tarjetas','gastos','financiamientos','proyectos','ingresos_mes',
                           'movimientos','retiros','pagos_tarjeta','aportes',
                           'presupuesto_mes','comercios']
  loop
    execute format(
      'create trigger %I before insert or update on public.%I
       for each row execute function public.tocar_fila()', 'tocar_' || t, t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 6. RLS en todas
--
-- Se generan en bucle a propósito. Quince tablas por cuatro
-- políticas son sesenta bloques escritos a mano, y basta que UNO
-- se copie mal para que un hogar quede abierto. Generadas, o están
-- bien las sesenta o no está bien ninguna — y eso se nota de
-- inmediato.
--
-- Leer: cualquier miembro. Escribir: miembro con permiso; el rol
-- `lectura` queda fuera por `puede_escribir`.
--
-- El `with check` en INSERT y UPDATE es lo que impide escribir
-- CONTRA otro hogar: sin él, alguien podría insertar una fila con
-- el hogar_id ajeno.
-- ------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['cuentas','personas','plantilla_ingresos','plantilla_lineas',
                           'tarjetas','gastos','financiamientos','proyectos','ingresos_mes',
                           'movimientos','retiros','pagos_tarjeta','aportes',
                           'presupuesto_mes','comercios']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy %I on public.%I for select to authenticated
       using (public.es_miembro(hogar_id))', t || '_leer', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated
       with check (public.puede_escribir(hogar_id))', t || '_insertar', t);

    execute format(
      'create policy %I on public.%I for update to authenticated
       using (public.puede_escribir(hogar_id))
       with check (public.puede_escribir(hogar_id))', t || '_actualizar', t);

    execute format(
      'create policy %I on public.%I for delete to authenticated
       using (public.puede_escribir(hogar_id))', t || '_borrar', t);
  end loop;
end $$;
