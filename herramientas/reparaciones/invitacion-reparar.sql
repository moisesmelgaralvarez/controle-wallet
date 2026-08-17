-- ============================================================
-- REPARACIÓN — SÍ CAMBIA DATOS. No se corre sin haber leído antes la
-- salida de `invitacion-informe.sql`.
--
-- Producción NO tiene respaldo automático. Por eso esto va dentro de una
-- transacción con `rollback` al final: corrido tal cual, ENSEÑA lo que
-- haría y no deja nada hecho. Para que quede, se cambia la última línea
-- por `commit`, y solo entonces.
--
-- Qué arregla, en orden:
--   1. Mete a cada persona invitada al hogar que la invitó.
--   2. Marca esas invitaciones como aceptadas.
--   3. Borra los hogares vacíos que el disparador creó de más.
--
-- El paso 3 es el destructivo, y sus condiciones son deliberadamente
-- estrechas: solo se va un hogar cuyo único miembro es su propietario,
-- que además pertenece a otro hogar, y que no tiene NI UNA fila de
-- presupuesto. Si alguna cuenta no da cero, ese hogar no se toca.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. La persona invitada entra al hogar que la invitó.
--    Idempotente: correrlo dos veces no duplica ni falla.
-- ------------------------------------------------------------
insert into public.miembros (hogar_id, usuario_id, rol)
select i.hogar_id, u.id, i.rol
  from public.invitaciones i
  join auth.users u on lower(u.email) = lower(i.correo)
 where i.estado = 'pendiente'
   and i.vence_en >= now()
on conflict (hogar_id, usuario_id) do nothing;

-- ------------------------------------------------------------
-- 2. Esas invitaciones ya no están pendientes.
-- ------------------------------------------------------------
update public.invitaciones i
   set estado = 'aceptada'
  from auth.users u
 where lower(u.email) = lower(i.correo)
   and i.estado = 'pendiente'
   and i.vence_en >= now()
   and exists (select 1 from public.miembros m
                where m.hogar_id = i.hogar_id and m.usuario_id = u.id);

-- ------------------------------------------------------------
-- 3. Fuera los hogares que sobran. LO DESTRUCTIVO.
--
--    `on delete cascade` se lleva miembros y bitácora, así que las
--    condiciones tienen que estar completas ANTES de llegar acá.
-- ------------------------------------------------------------
create temporary table a_borrar on commit drop as
select h.id, h.nombre
  from public.hogares h
 where (select count(*) from public.miembros m where m.hogar_id = h.id) = 1
   and exists (
     select 1 from public.miembros m
      where m.hogar_id = h.id and m.rol = 'propietario'
        and (select count(*) from public.miembros m2 where m2.usuario_id = m.usuario_id) > 1)
   and (select count(*) from public.cuentas            where hogar_id = h.id) = 0
   and (select count(*) from public.personas           where hogar_id = h.id) = 0
   and (select count(*) from public.tarjetas           where hogar_id = h.id) = 0
   and (select count(*) from public.gastos             where hogar_id = h.id) = 0
   and (select count(*) from public.movimientos        where hogar_id = h.id) = 0
   and (select count(*) from public.ingresos_mes       where hogar_id = h.id) = 0
   and (select count(*) from public.proyectos          where hogar_id = h.id) = 0
   and (select count(*) from public.presupuesto_mes    where hogar_id = h.id) = 0
   and (select count(*) from public.plantilla_ingresos where hogar_id = h.id) = 0
   and (select count(*) from public.plantilla_lineas   where hogar_id = h.id) = 0;

-- Lo que se va, a la vista, antes de irse.
select 'SE BORRA' as accion, nombre, id from a_borrar;

delete from public.hogares where id in (select id from a_borrar);

-- ------------------------------------------------------------
-- Cómo quedó cada quien. Nadie debería tener dos.
-- ------------------------------------------------------------
select u.email,
       count(m.hogar_id) as hogares,
       coalesce(string_agg(h.nombre || ' (' || m.rol || ')', ' · '), '— NINGUNO —') as cuales
  from auth.users u
  left join public.miembros m on m.usuario_id = u.id
  left join public.hogares  h on h.id = m.hogar_id
 group by u.email
 order by u.email;

-- ⬇ TAL CUAL, ESTO NO DEJA NADA HECHO. Cambiar por `commit;` para aplicar.
rollback;
