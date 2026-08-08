-- ============================================================
-- Fundación multi-inquilino: perfiles, hogares, miembros,
-- invitaciones y bitácora.
--
-- Esta migración decide quién puede ver qué en todo el producto.
-- Si algo de aquí está mal, ninguna cantidad de cuidado en el
-- navegador lo arregla: el código del cliente se descarga completo
-- y se asume hostil.
--
-- Reverso: 20260808190000_plataforma.reverso.sql
-- ============================================================

-- ------------------------------------------------------------
-- 0. Extensiones
--
-- `gen_random_bytes` viene de pgcrypto y sirve para los tokens de
-- invitación. En Supabase las extensiones viven en su propio
-- esquema, así que se referencia con nombre completo: dejarlo en
-- `public` es una de las cosas que su propio analizador marca.
-- ------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------
-- 1. Tipos
-- ------------------------------------------------------------

-- Rol dentro de UN hogar. 'lectura' puede mirar y no escribir.
create type public.rol_hogar as enum ('propietario', 'miembro', 'lectura');

-- Rol en la plataforma, distinto del rol en un hogar. Un admin
-- administra el servicio; NO por eso ve las finanzas de nadie.
create type public.rol_plataforma as enum ('usuario', 'soporte', 'admin');

create type public.estado_invitacion as enum ('pendiente', 'aceptada', 'cancelada', 'vencida');

-- Se crean ahora aunque el cobro sea de la fase 2: agregar una
-- columna después es barato, pero migrar datos de suscripción a
-- mitad de camino no lo es.
create type public.estado_suscripcion as enum ('prueba', 'activa', 'vencida', 'cancelada');

-- ------------------------------------------------------------
-- 2. Tablas
-- ------------------------------------------------------------

-- Extiende auth.users con lo nuestro. No duplicamos el correo ni la
-- contraseña: de eso se encarga Supabase Auth.
create table public.perfiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  nombre          text not null default '',
  idioma          text not null default 'es',
  zona_horaria    text not null default 'America/Tegucigalpa',
  rol             public.rol_plataforma not null default 'usuario',
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

comment on table public.perfiles is
  'Datos del usuario que no son de autenticación. Uno por cuenta.';

create table public.hogares (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null,
  -- Una moneda por hogar. Sin conversión: eso es fase 2.
  moneda              text not null default 'HNL',
  -- Día en que arranca el mes del hogar. 1 = mes de calendario.
  -- Muchos hogares viven en el ciclo de su tarjeta.
  inicio_mes          smallint not null default 1 check (inicio_mes between 1 and 28),
  plan                text not null default 'gratis',
  estado_suscripcion  public.estado_suscripcion not null default 'prueba',
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);

comment on table public.hogares is
  'El inquilino. Todo dato financiero cuelga de aquí por hogar_id.';

-- Quién pertenece a qué hogar. Es la tabla que gobierna TODO el
-- acceso: las políticas preguntan aquí, nunca por correo escrito a
-- mano en la política.
create table public.miembros (
  hogar_id   uuid not null references public.hogares(id) on delete cascade,
  usuario_id uuid not null references auth.users(id)     on delete cascade,
  rol        public.rol_hogar not null default 'miembro',
  creado_en  timestamptz not null default now(),
  primary key (hogar_id, usuario_id)
);

create index miembros_usuario_idx on public.miembros (usuario_id);

create table public.invitaciones (
  id         uuid primary key default gen_random_uuid(),
  hogar_id   uuid not null references public.hogares(id) on delete cascade,
  correo     text not null,
  rol        public.rol_hogar not null default 'miembro',
  -- Aleatorio y largo. Se compara por igualdad exacta; quien no lo
  -- tenga no puede adivinarlo.
  token      text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  estado     public.estado_invitacion not null default 'pendiente',
  vence_en   timestamptz not null default (now() + interval '7 days'),
  invitado_por uuid references auth.users(id) on delete set null,
  creado_en  timestamptz not null default now()
);

create index invitaciones_hogar_idx  on public.invitaciones (hogar_id);
create index invitaciones_correo_idx on public.invitaciones (lower(correo));

-- Quién hizo qué y cuándo. Necesaria para soporte y para resolver
-- desacuerdos entre dos personas que administran el mismo hogar.
create table public.bitacora (
  id         bigserial primary key,
  hogar_id   uuid references public.hogares(id) on delete cascade,
  usuario_id uuid references auth.users(id)     on delete set null,
  accion     text not null,
  entidad    text,
  entidad_id text,
  detalle    jsonb,
  creado_en  timestamptz not null default now()
);

create index bitacora_hogar_fecha_idx on public.bitacora (hogar_id, creado_en desc);

-- ------------------------------------------------------------
-- 3. Las funciones que deciden el acceso
--
-- POR QUÉ FUNCIONES Y NO DATOS EN EL TOKEN:
--
-- Meter la lista de hogares dentro del JWT es más rápido — se lee
-- sin tocar la base. Pero un token ya emitido no cambia hasta que
-- se renueva, así que quitarle el acceso a alguien tardaría hasta
-- una hora en surtir efecto. En un producto donde dos personas
-- comparten las finanzas de su casa y a veces se separan, eso es
-- inaceptable. Aquí revocar es inmediato.
--
-- SECURITY DEFINER es obligatorio: sin eso, consultar `miembros`
-- dentro de la política de `miembros` dispara recursión infinita.
-- Va con `search_path` fijo para que nadie pueda secuestrar la
-- resolución de nombres.
-- ------------------------------------------------------------

create or replace function public.es_miembro(p_hogar uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.miembros m
    where m.hogar_id = p_hogar and m.usuario_id = auth.uid()
  );
$$;

comment on function public.es_miembro is
  'Si el usuario de la sesión pertenece al hogar. Base de toda política RLS.';

create or replace function public.puede_escribir(p_hogar uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.miembros m
    where m.hogar_id = p_hogar
      and m.usuario_id = auth.uid()
      and m.rol in ('propietario', 'miembro')
  );
$$;

comment on function public.puede_escribir is
  'Miembro con permiso de escritura. El rol lectura queda fuera.';

create or replace function public.es_propietario(p_hogar uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.miembros m
    where m.hogar_id = p_hogar
      and m.usuario_id = auth.uid()
      and m.rol = 'propietario'
  );
$$;

-- ------------------------------------------------------------
-- 4. Alta de un usuario nuevo
--
-- Al registrarse se crea el perfil, su hogar y su membresía de
-- propietario. Va como disparador en auth.users para que ocurra
-- SIEMPRE — si dependiera de que el navegador llame a algo después
-- del registro, una pestaña cerrada a destiempo dejaría usuarios
-- sin hogar, que es un estado del que no se sale solo.
-- ------------------------------------------------------------

create or replace function public.al_crear_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hogar uuid;
  v_nombre text;
begin
  v_nombre := coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1));

  insert into public.perfiles (id, nombre) values (new.id, v_nombre);

  insert into public.hogares (nombre)
  values (coalesce(nullif(trim(new.raw_user_meta_data ->> 'hogar'), ''), 'Mi hogar'))
  returning id into v_hogar;

  insert into public.miembros (hogar_id, usuario_id, rol)
  values (v_hogar, new.id, 'propietario');

  insert into public.bitacora (hogar_id, usuario_id, accion, entidad, entidad_id)
  values (v_hogar, new.id, 'hogar.creado', 'hogares', v_hogar::text);

  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.al_crear_usuario();

-- ------------------------------------------------------------
-- 5. `actualizado_en` al día, sin depender del cliente
-- ------------------------------------------------------------

create or replace function public.tocar_actualizado()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger tocar_perfiles before update on public.perfiles
  for each row execute function public.tocar_actualizado();
create trigger tocar_hogares before update on public.hogares
  for each row execute function public.tocar_actualizado();

-- ------------------------------------------------------------
-- 6. RLS
--
-- Se enciende en TODAS. Una tabla sin RLS en un proyecto de
-- Supabase queda expuesta a cualquiera que tenga la clave pública,
-- que viaja dentro de la aplicación.
-- ------------------------------------------------------------

alter table public.perfiles     enable row level security;
alter table public.hogares      enable row level security;
alter table public.miembros     enable row level security;
alter table public.invitaciones enable row level security;
alter table public.bitacora     enable row level security;

-- perfiles: cada quien el suyo.
create policy perfiles_leer on public.perfiles
  for select to authenticated using (id = auth.uid());
create policy perfiles_actualizar on public.perfiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- hogares: solo los propios. Un usuario no puede ni enterarse de
-- que existen otros hogares.
create policy hogares_leer on public.hogares
  for select to authenticated using (public.es_miembro(id));
create policy hogares_actualizar on public.hogares
  for update to authenticated
  using (public.es_propietario(id)) with check (public.es_propietario(id));

-- miembros: se ven los del propio hogar. Solo el propietario mueve
-- membresías.
create policy miembros_leer on public.miembros
  for select to authenticated using (public.es_miembro(hogar_id));
create policy miembros_insertar on public.miembros
  for insert to authenticated with check (public.es_propietario(hogar_id));
create policy miembros_actualizar on public.miembros
  for update to authenticated
  using (public.es_propietario(hogar_id)) with check (public.es_propietario(hogar_id));
create policy miembros_borrar on public.miembros
  for delete to authenticated
  -- El propietario puede sacar a alguien; cualquiera puede irse solo.
  using (public.es_propietario(hogar_id) or usuario_id = auth.uid());

-- invitaciones: las administra el propietario.
create policy invitaciones_leer on public.invitaciones
  for select to authenticated using (public.es_miembro(hogar_id));
create policy invitaciones_insertar on public.invitaciones
  for insert to authenticated with check (public.es_propietario(hogar_id));
create policy invitaciones_actualizar on public.invitaciones
  for update to authenticated
  using (public.es_propietario(hogar_id)) with check (public.es_propietario(hogar_id));
create policy invitaciones_borrar on public.invitaciones
  for delete to authenticated using (public.es_propietario(hogar_id));

-- bitácora: se lee, no se escribe desde el cliente. Un registro de
-- auditoría que el auditado puede editar no sirve de nada.
create policy bitacora_leer on public.bitacora
  for select to authenticated using (public.es_miembro(hogar_id));
