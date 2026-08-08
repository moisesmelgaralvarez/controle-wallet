-- ============================================================
-- DESHACER — devuelve las políticas a como estaban.
-- Úsalo solo si tras endurecer la seguridad la app se queda en
-- "No se pudo conectar" y necesitas volver atrás rápido.
-- ============================================================
drop policy if exists "hogar_leer"       on public.hogar_estado;
drop policy if exists "hogar_insertar"   on public.hogar_estado;
drop policy if exists "hogar_actualizar" on public.hogar_estado;

create policy "hogar_leer"
  on public.hogar_estado for select to authenticated using (true);

create policy "hogar_insertar"
  on public.hogar_estado for insert to authenticated with check (true);

create policy "hogar_actualizar"
  on public.hogar_estado for update to authenticated using (true) with check (true);
