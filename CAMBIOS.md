# Cambios

Qué trajo cada versión, en español y sin jerga. Lo más nuevo va arriba.

---

## v0.1.0 — Fundación

*Etapa 0 de la fase 1.*

No hay nada que un usuario pueda ver todavía. Lo que se montó es el piso sobre el
que se construye todo lo demás.

**Qué se hizo**

- Repositorio en GitHub como única fuente del proyecto, con `main` protegido y
  trabajo por ramas y Pull Request.
- La aplicación anterior queda copiada tal cual en `heredado/`, congelada, como
  referencia y como origen de la migración de datos. No se toca ni una coma.
- Publicación en Cloudflare Workers sobre `controlewallet.com`, con marcadores de
  posición para el sitio público y para la aplicación.
- Cabeceras de seguridad en `sitio/_headers`, ahora **sin** `unsafe-inline` en los
  estilos: la interfaz nueva se escribe sin estilos en línea desde el primer día.
- Pruebas automáticas en cada Pull Request.
- Dos ambientes separados con su propia base: `controle-pruebas` y
  `controle-produccion`.
- Procedimiento de vuelta atrás escrito y **ensayado sobre producción**, con el
  tiempo medido: se publicó una versión rota a propósito y volver a la buena tomó
  **4 segundos**. Ver [VUELTA-ATRAS.md](VUELTA-ATRAS.md), incluido lo que salió mal
  durante el ensayo.
- Los dos proyectos de Supabase enlazados, con `controle-pruebas` como destino por
  omisión para que nadie migre producción por descuido.

**Lo que hay que saber**

- El respaldo diario automático de la base exige el plan Pro de Supabase (~$25 al
  mes). Mientras la base siga en el plan gratuito, **no hay respaldo automático**.
- El plan gratuito de Supabase pausa un proyecto tras una semana sin uso.
