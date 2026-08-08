-- ============================================================
-- REVERSO de 20260808190000_plataforma.sql
--
-- Deshace la fundación multi-inquilino. El orden importa: primero
-- lo que depende, después lo que sostiene.
--
-- OJO — ESTO BORRA DATOS. Las tablas de aquí guardan los hogares,
-- las membresías y la bitácora. Ejecutarlo sobre producción con
-- usuarios reales destruye información que no se recupera con un
-- `create table` de vuelta.
--
-- Ver VUELTA-ATRAS.md, caso 3: el reverso devuelve la FORMA de una
-- tabla, no lo que había dentro. Si hace falta correr esto sobre
-- producción, primero se restaura un respaldo.
-- ============================================================

drop trigger if exists al_crear_usuario on auth.users;
drop function if exists public.al_crear_usuario();

drop trigger if exists tocar_hogares  on public.hogares;
drop trigger if exists tocar_perfiles on public.perfiles;

-- `tocar_actualizado` la usan también las tablas del presupuesto,
-- así que solo se va si esa migración ya se revirtió.
drop function if exists public.tocar_actualizado();

drop table if exists public.bitacora;
drop table if exists public.invitaciones;
drop table if exists public.miembros;
drop table if exists public.hogares;
drop table if exists public.perfiles;

drop function if exists public.es_propietario(uuid);
drop function if exists public.puede_escribir(uuid);
drop function if exists public.es_miembro(uuid);

drop type if exists public.estado_suscripcion;
drop type if exists public.estado_invitacion;
drop type if exists public.rol_plataforma;
drop type if exists public.rol_hogar;
