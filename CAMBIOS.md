# Cambios

Qué trajo cada versión, en español y sin jerga. Lo más nuevo va arriba.

---

## v0.5.0 — La vitrina de dispositivos

**Qué se hizo**

- Tres pantallas en la portada —computadora, tableta y teléfono— con la interfaz
  de la aplicación dibujada por dentro: tablero con fichas de cifras, gráfica de
  historia, tabla de plan contra real, el corte de la tarjeta y las barras del
  pulso.
- **Están dibujadas en HTML y CSS, no son capturas.** Pesan casi nada, se ven
  nítidas en cualquier resolución y siguen el modo claro u oscuro de quien mira.
  Una imagen no hace ninguna de las tres cosas.
- Cada aparato se desplaza a distinta velocidad al bajar. Esa diferencia es lo
  que el ojo lee como profundidad — antes las tres capas iban casi al mismo
  ritmo y por eso el efecto se sentía pobre.
- Proporciones reales: 16:10 la computadora, 3:4 la tableta, 1:2.05 el teléfono.
  Sin eso eran rectángulos redondeados cuyo alto decidía el contenido.

**Correcciones sobre la primera versión**

- La tableta tapaba la tabla de la computadora. Se recompuso para que el traslape
  sea de bordes, no de contenido.
- Las barras de la gráfica usaban `--suave` sobre `--superficie`, que en modo
  oscuro son casi el mismo color: desaparecían. Ahora se mezclan con el acento.
- Un ancho de barra se me fue como atributo en el HTML. Los anchos y alturas van
  como clase: un solo estilo en línea obligaría a abrirle la mano a la CSP con
  `unsafe-inline`, y esa concesión no se hace por dibujar dos barras.

**Lo que hay que saber**

- **Las pantallas muestran la interfaz que se va a construir, no una terminada.**
  La aplicación es la etapa 4. Este trabajo es también el diseño de esa etapa,
  adelantado.

---

## v0.4.0 — Portada con profundidad, y las puertas de entrada

**Qué se hizo**

- La portada se rehízo con desplazamiento por capas: el fondo se mueve a otra
  velocidad que el contenido, el ejemplo del corte de tarjeta queda clavado
  mientras el texto pasa a su lado, y los bloques aparecen al entrar en pantalla.
  **Todo con CSS, sin una línea de JavaScript** — la política de seguridad lleva
  `script-src 'self'` sin excepciones y cada script es una superficie más que
  vigilar.
- `Entrar` y `Crear cuenta` en el encabezado de todo el sitio, más las páginas
  `/entrar` y `/registro`.
- Correo de entrada: se habilitó Cloudflare Email Routing sobre el dominio.

**Un error que casi se publica**

El botón «Crear cuenta» salía en **gris sobre verde, ilegible**. La causa era
especificidad de CSS: `.menu a` vale (0,1,1) y `.boton--principal` vale (0,1,0),
así que el color del menú le ganaba al del botón sin importar el orden del
archivo. Se corrigió excluyendo los botones de la regla del menú —
`.menu a:not(.boton)` — en vez de subirle la especificidad al botón, que habría
tapado este caso y dejado la trampa para el siguiente. Medido después: contraste
9.04, cuando la norma AA pide 4.5.

**Lo que hay que saber**

- **Los formularios de `/entrar` y `/registro` están deshabilitados a propósito.**
  La sesión real llega en la etapa 3, sobre las tablas de la etapa 2. Un
  formulario que parece funcionar y se traga la contraseña de alguien sin hacer
  nada es peor que no tener formulario: enseña a la gente a escribir credenciales
  en pantallas que no las piden de verdad. Mientras tanto, ambas páginas dicen en
  la primera línea que el acceso todavía no abre.
- **Falta verificar la dirección de destino del correo.** Cloudflare envió un
  correo de confirmación; hasta que se haga clic en ese enlace, la regla de
  `hola@controlewallet.com` no se puede crear.

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
