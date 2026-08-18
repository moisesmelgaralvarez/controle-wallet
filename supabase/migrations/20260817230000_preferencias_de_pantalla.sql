-- ============================================================
-- Las preferencias de pantalla viven en el SERVIDOR.
--
-- POR QUÉ NO EN EL DISPOSITIVO, QUE SERÍA LO OBVIO
--
-- La regla 1 de este proyecto dice que el servidor es la única fuente
-- de verdad y que lo ÚNICO que queda en el aparato es el token de
-- sesión. Un `localStorage.setItem('tema', 'oscuro')` la rompe, y la
-- rompe por comodidad — que es como se rompen siempre.
--
-- Y al obedecerla se gana algo que el atajo no daba: la preferencia
-- SIGUE A LA PERSONA. Quien pliega el riel en la computadora lo
-- encuentra plegado en la tableta, y quien elige el modo oscuro no
-- tiene que volver a elegirlo en cada aparato. Es mejor, no solo más
-- correcto.
--
-- `perfiles` ya tenía `idioma` y `zona_horaria`: estas dos son de la
-- misma familia y viven al lado.
--
-- TEMA: 'sistema' POR DEFECTO, Y NO 'claro'
--
-- Quien nunca tocó el interruptor no eligió nada, y suponer que quiere
-- claro es tan arbitrario como suponer oscuro. 'sistema' respeta lo
-- que ya configuró en su aparato, que es una elección que sí hizo.
--
-- Reverso: supabase/reversos/20260817230000_preferencias_de_pantalla.reverso.sql
-- ============================================================

alter table public.perfiles
  add column if not exists tema text not null default 'sistema',
  add column if not exists riel_plegado boolean not null default false;

-- Tres valores y ninguno más. Sin esto, un cliente con un error escribe
-- 'dark' y la pantalla se queda sin tema sin que nadie sepa por qué.
alter table public.perfiles
  drop constraint if exists perfiles_tema_valido;
alter table public.perfiles
  add constraint perfiles_tema_valido check (tema in ('sistema', 'claro', 'oscuro'));

comment on column public.perfiles.tema is
  'sistema | claro | oscuro. Vive acá y no en el dispositivo porque la regla 1 dice que lo único que queda en el aparato es el token de sesión — y porque así la elección sigue a la persona entre aparatos.';
comment on column public.perfiles.riel_plegado is
  'Si el riel lateral de la app queda plegado a iconos. Misma razón que `tema`.';
