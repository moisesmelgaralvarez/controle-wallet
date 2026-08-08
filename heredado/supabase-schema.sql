-- ============================================================
-- Presupuesto — esquema para Supabase
-- Pegar completo en:  Supabase → SQL Editor → New query → Run
-- ============================================================

-- Un solo renglón por hogar. Todo el documento va en 'data'.
create table if not exists public.hogar_estado (
  hogar        text primary key,
  data         jsonb not null,
  actualizado  timestamptz not null default now()
);

-- Sin esto, cualquiera con la clave pública podría leer el presupuesto.
alter table public.hogar_estado enable row level security;

-- Dos cerraduras independientes:
--   1. El registro público está cerrado (ver abajo).
--   2. Estas políticas exigen QUIÉN eres, no solo que estés autenticado.
--
-- Con 'using (true)' bastaba una sesión cualquiera para leerlo todo, y toda
-- la seguridad dependía de que la casilla de registro siguiera apagada. Aquí
-- el correo se lee del propio token, sin consultar tablas.
--
-- Si algún día entra otra persona al hogar, hay que añadir su correo a las
-- tres listas de abajo.
drop policy if exists "hogar_leer"       on public.hogar_estado;
drop policy if exists "hogar_insertar"   on public.hogar_estado;
drop policy if exists "hogar_actualizar" on public.hogar_estado;

create policy "hogar_leer"
  on public.hogar_estado for select to authenticated
  using ((auth.jwt() ->> 'email') in
         ('moises-melgar@outlook.com', 'judithvallejo98@gmail.com'));

create policy "hogar_insertar"
  on public.hogar_estado for insert to authenticated
  with check ((auth.jwt() ->> 'email') in
              ('moises-melgar@outlook.com', 'judithvallejo98@gmail.com'));

create policy "hogar_actualizar"
  on public.hogar_estado for update to authenticated
  using ((auth.jwt() ->> 'email') in
         ('moises-melgar@outlook.com', 'judithvallejo98@gmail.com'))
  with check ((auth.jwt() ->> 'email') in
              ('moises-melgar@outlook.com', 'judithvallejo98@gmail.com'));

-- ============================================================
-- IMPORTANTE — hacer esto también, desde el panel:
--
--   Authentication → Sign In / Providers
--     · "Allow new users to sign up"    ->  APAGADO
--     · "Allow anonymous sign-ins"      ->  APAGADO
--     · Email provider                  ->  HABILITADO (si no, nadie entra)
--
-- Lo de "anonymous sign-ins" es tan importante como lo otro: encendido,
-- cualquiera con la clave pública pide una sesión anónima y queda como
-- 'authenticated' sin registrarse.
--
-- Si el registro queda abierto, cualquiera que tenga la clave
-- pública puede crearse una cuenta y leer el presupuesto.
-- Las dos cuentas se crean a mano en Authentication → Users.
-- ============================================================
