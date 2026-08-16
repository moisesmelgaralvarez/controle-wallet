```
REDISEÑO DEL SITIO PÚBLICO — Controle Wallet

Leé IDENTIDAD.md antes de nada. Es el ADN: tokens, tipografía, y la proporción
60-30-10. No se negocia.

Tenés 13 skills de diseño instaladas. Usalas de verdad — este prompt te dice
cuál y cuándo. Aportan OFICIO DENTRO del ADN, no lo reemplazan: si una skill te
propone otra paleta, otro tipo o otro radio, gana IDENTIDAD.md. Si una skill te
propone una composición, un ritmo o un movimiento mejor, gana la skill.

EL PROBLEMA REAL
El sitio actual no se ve pobre por los colores. Se ve pobre por la composición:
bloques apilados del mismo peso, sin jerarquía, sin un solo momento que detenga
el scroll, sin movimiento. Parece una plantilla con buen texto encima. Tiene
que parecer un producto por el que alguien pagaría.

ALCANCE
Solo sitio/*.html y sus hojas (sitio.css, inicio.css, dispositivos.css).
NO toques sitio/app/ — la aplicación es otra etapa.

═══════════════════════════════════════════════════════════════════
FASE 1 — DIRECCIÓN. No escribas una línea de código todavía.
═══════════════════════════════════════════════════════════════════

1. Invocá `frontend-design`. Pedile dirección estética para ESTE brief, no
   genérica: finanzas del hogar hondureño, una pareja, ingreso variable, la
   tesis es "estás contando la misma plata dos veces". Exigile UN riesgo
   estético real que pueda justificar, no la respuesta segura.

2. Invocá `apple-design`. Sacá de ahí el criterio de ritmo vertical, de peso
   entre secciones y de movimiento físico.

3. Invocá `prototype` (de Emil). Generá TRES portadas genuinamente distintas
   — tres ideas, no tres variaciones de la misma. Renderizalas en el
   comparador visual.

4. Invocá `/impeccable critique` sobre las tres. Que juzgue cuál tiene más
   techo, y por qué.

PARÁ ACÁ. Mostrame las tres con capturas reales a 390, 768 y 1440, en claro y
en oscuro, más tu recomendación en dos frases. No sigas sin que yo elija.

═══════════════════════════════════════════════════════════════════
FASE 2 — CONSTRUCCIÓN. Solo después de que yo elija una dirección.
═══════════════════════════════════════════════════════════════════

Arquitectura: 13 secciones, el orden y los pesos están en REDISENO.md
(Etapa 2). Respetá el ritmo: nunca dos secciones de peso ALTO seguidas.

Trabajá de a dos secciones. Para cada par:

  a. `/impeccable layout` para la composición.
  b. `/impeccable typeset` para la jerarquía tipográfica dentro del ADN.
  c. `find-animation-opportunities` para decidir qué se mueve — y qué NO.
     Rechazá todo lo que no gane algo. Un sitio de finanzas que se mueve de
     más se siente frívolo.
  d. `animate` para las animaciones que sí sobrevivieron.
  e. `/impeccable polish` al final del par.

Reglas técnicas, no negociables:
  - Ni un estilo en línea. Ni una dependencia nueva. Ni una petición externa.
  - Las pantallas de dispositivos se DIBUJAN en HTML y CSS, no son capturas:
    pesan casi nada, se ven nítidas a cualquier resolución y siguen el modo
    claro u oscuro. Una imagen no hace ninguna de las tres.
  - Toda cifra de dinero en tabular-nums.
  - `prefers-reduced-motion: reduce` desactiva TODO el movimiento.
  - Reusá las clases que ya existen antes de crear una. Si creás, seguí la
    convención BEM en español del proyecto.

Contenido:
  - Usá las cifras reales que ya están en el sitio: L 19,101 consumido,
    L 14,840 abonado, L 4,261 faltante, ciclo 7 jul – 6 ago, L 1,340 por día.
  - Borrá el renglón de "Facturas por foto" de la lista "Lo que ya está
    resuelto". Esa función NO existe (TRASPASO.md §8) y esa sección dice
    "Nada de esto es promesa".
  - No inventes ninguna otra afirmación sobre lo que el producto hace sin
    cotejarla contra TRASPASO.md §8.

═══════════════════════════════════════════════════════════════════
FASE 3 — REVISIÓN. Antes de mostrarme cada par de secciones.
═══════════════════════════════════════════════════════════════════

  1. `/impeccable audit` — anti-patrones.
  2. `review-animations` — el movimiento contra un estándar de craft alto.
  3. `web-design-guidelines` — accesibilidad y UX.
  4. Proporción: servís con `npx wrangler dev`, abrís la página y corrés
     herramientas/medir-proporcion.js en la consola. Meta 60/30/10.
     La línea base de hoy es 46/51/1.7 — dominante y secundario invertidos.
     Si las cartas siguen cubriendo más que el lienzo, la solución es MENOS
     cartas y MÁS aire. Nunca compensar con color.
  5. Capturas con Playwright a 390, 768, 1024, 1440 y 1920, claro y oscuro.
  6. Consola limpia: cero CSP, cero peticiones externas.
  7. `npm run pruebas` — 336 en verde.

Mostrame las capturas y los números de proporción. Si algo no cierra, decímelo
antes de proponer el arreglo.

═══════════════════════════════════════════════════════════════════
CÓMO TRABAJAR
═══════════════════════════════════════════════════════════════════

Rama feat/sitio-<seccion>. Un PR por par de secciones. Descripción en español:
qué cambia y por qué.

Cuando dos skills se contradigan sobre color, tipo o forma: gana IDENTIDAD.md.
Cuando se contradigan sobre composición, ritmo o movimiento: elegí vos, y
decime cuál seguiste y por qué en una línea.

Y lo más importante: **no me describas el diseño, mostrámelo.** Capturas
renderizadas, siempre. Si no puedo verlo, no puedo juzgarlo.
```
