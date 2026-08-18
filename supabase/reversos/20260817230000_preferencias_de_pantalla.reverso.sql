-- Reverso de 20260817230000_preferencias_de_pantalla.
--
-- ADVERTENCIA: esto BORRA la preferencia de tema y de riel de cada
-- persona. No hay pérdida de datos financieros; lo que se pierde es que
-- cada quien vuelva a elegir su modo. Las columnas se van con su
-- contenido y no se pueden recuperar sin respaldo.
alter table public.perfiles drop constraint if exists perfiles_tema_valido;
alter table public.perfiles drop column if exists riel_plegado;
alter table public.perfiles drop column if exists tema;
