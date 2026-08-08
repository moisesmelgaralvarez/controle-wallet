# Cambios

Qué trajo cada versión, en español y sin jerga. Lo más nuevo va arriba.

---

## v0.3.0 — El sitio público

*Etapa 7 de la fase 1, adelantada a pedido del dueño para tener algo visible en
`controlewallet.com` mientras se construye la aplicación por dentro.*

**Qué se hizo**

- Seis páginas: inicio, precios, preguntas frecuentes, contacto, términos y
  condiciones, y privacidad. Más el 404 y el marcador de `/app`.
- Sistema visual propio (`sitio.css`) que es también el primer borrador del
  lenguaje que hereda la aplicación en la etapa 4: tokens de color, escala
  tipográfica fluida, modo claro y oscuro, y los cuatro escalones de pantalla.
- Direcciones limpias, sin `.html`. Antes cada enlace interno provocaba una
  redirección de más.
- `robots.txt` y `sitemap.xml`. El sitio se indexa; `/app` no.
- Verificado a 360 px y a 2560 px: sin scroll horizontal, sin nada que se
  desborde y sin espacio muerto a los lados.

**Decisiones de contenido**

- **No se inventaron precios.** La página de precios dice la verdad — que todavía
  no se cobra — y se compromete a anunciar el precio antes de aplicarlo. Poner un
  número falso obliga después a cambiarlo o a inflarlo por si acaso.
- Los términos incluyen un aviso explícito de que **esto no es asesoría
  financiera**. La app da veredictos sobre proyectos, y esa distinción tiene que
  quedar por escrito.
- La política de privacidad **nombra a los cuatro proveedores** que tocan datos
  del usuario, incluido que las fotos de facturas se envían a Anthropic para ser
  leídas. Es información del hogar saliendo del país y quien la usa merece
  saberlo.

**Lo que hay que saber**

- **`hola@controlewallet.com` todavía no recibe correo.** El dominio está
  verificado para *enviar* (Resend), pero falta configurar el reenvío de entrada
  en Cloudflare Email Routing. Hasta entonces, los enlaces de contacto del sitio
  llevan a un buzón que no existe.
- Los documentos legales están escritos con cuidado pero **no los ha revisado un
  abogado**. Antes de que entre el primer usuario real conviene que alguien
  licenciado en Honduras los mire.

---

## v0.2.0 — El núcleo financiero, en módulos

*Etapa 1 de la fase 1.*

Sigue sin haber nada que un usuario vea. Lo que cambió es dónde vive el motor de
cálculo y quién puede usarlo.

**Qué se hizo**

- `asesor.js` (1,728 líneas) pasó a doce módulos en `nucleo/`, y `importar.js` a uno
  más. **No se reescribió ni una línea:** los cuerpos se extrajeron por número de
  línea con un guion, y lo único escrito a mano fueron los `import` y `export` de
  los bordes. Un verificador comprueba que las 1,667 líneas de código quedaron
  cubiertas, sin repetirse ni perderse.
- Las pruebas dejaron de vivir en una página que alguien tenía que acordarse de
  abrir: ahora corren con `node --test` en cada Pull Request. **180 en verde.**
- Se agregó una prueba que compara la API vieja contra la nueva nombre por nombre,
  y otra que verifica que ningún módulo del núcleo toca `window`, `document`,
  `localStorage` ni `fetch` — la condición para que el mismo código corra en el
  navegador, en el servidor y en las pruebas.

**Lo que hay que saber**

- De las 200 pruebas originales se portaron 175. Las otras 25 probaban la fusión
  entre teléfonos de `sync.js`. No es pérdida de cobertura: esa maquinaria
  desaparece con el servidor como única fuente de verdad, y probar algo que ya no
  existe sería teatro.
- El módulo `saldos.js` quedó grande (636 líneas) a propósito. Gastos, ciclo de
  tarjeta, cuentas, deuda y cierre se llaman en círculo entre sí; partirlos
  fingiría una separación que el dominio no tiene y dejaría cuatro archivos
  importándose mutuamente.

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
