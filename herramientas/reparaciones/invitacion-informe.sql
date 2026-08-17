-- ============================================================
-- INFORME — SOLO LECTURA. No cambia ni una fila.
--
-- Qué dejó el defecto de las invitaciones de agosto de 2026, antes de
-- reparar nada. Se corre en el editor SQL de Supabase (producción) y su
-- salida es lo que decide si la reparación se ejecuta o no.
--
-- Se mira, se lee, y recién después se corre `invitacion-reparar.sql`.
-- ============================================================

-- 1. Quién quedó en MÁS DE UN hogar.
--    Es el estado que rompe la app: toma `(hogares)[0]` sin ordenar ni
--    ofrecer selector, así que cuál se ve queda al azar.
select 'EN VARIOS HOGARES' as caso,
       u.email,
       count(*) as hogares,
       string_agg(h.nombre || ' (' || m.rol || ')', ' · ' order by m.creado_en) as cuales
  from public.miembros m
  join auth.users u on u.id = m.usuario_id
  join public.hogares h on h.id = m.hogar_id
 group by u.email
having count(*) > 1;

-- 2. Quién quedó SIN NINGÚN hogar.
select 'SIN HOGAR' as caso, u.email, u.created_at
  from auth.users u
 where not exists (select 1 from public.miembros m where m.usuario_id = u.id);

-- 3. Invitaciones que siguen esperando.
select 'INVITACIÓN PENDIENTE' as caso,
       i.correo, h.nombre as hogar, i.rol, i.vence_en,
       (i.vence_en < now()) as ya_vencida
  from public.invitaciones i
  join public.hogares h on h.id = i.hogar_id
 where i.estado = 'pendiente';

-- 4. LO QUE SE BORRARÍA, y con qué adentro.
--
--    Un hogar es candidato solo si cumple TODO: su único miembro es
--    propietario, esa persona tiene otro hogar además de este, y no hay
--    UNA SOLA FILA de presupuesto adentro. La cuenta por tabla se
--    imprime entera a propósito: si alguna no es cero, el hogar no se
--    toca, y hay que poder verlo antes de ejecutar nada.
with solitarios as (
  select h.id, h.nombre
    from public.hogares h
   where (select count(*) from public.miembros m where m.hogar_id = h.id) = 1
     and exists (
       select 1 from public.miembros m
        where m.hogar_id = h.id and m.rol = 'propietario'
          and (select count(*) from public.miembros m2 where m2.usuario_id = m.usuario_id) > 1)
)
select 'CANDIDATO A BORRAR' as caso,
       s.nombre as hogar,
       (select u.email from public.miembros m join auth.users u on u.id = m.usuario_id
         where m.hogar_id = s.id limit 1) as de_quien,
       (select count(*) from public.cuentas            where hogar_id = s.id) as cuentas,
       (select count(*) from public.personas           where hogar_id = s.id) as personas,
       (select count(*) from public.tarjetas           where hogar_id = s.id) as tarjetas,
       (select count(*) from public.gastos             where hogar_id = s.id) as gastos,
       (select count(*) from public.movimientos        where hogar_id = s.id) as movimientos,
       (select count(*) from public.ingresos_mes       where hogar_id = s.id) as ingresos,
       (select count(*) from public.proyectos          where hogar_id = s.id) as proyectos,
       (select count(*) from public.presupuesto_mes    where hogar_id = s.id) as presupuesto,
       (select count(*) from public.plantilla_ingresos where hogar_id = s.id) as plant_ingresos,
       (select count(*) from public.plantilla_lineas   where hogar_id = s.id) as plant_lineas
  from solitarios s;
