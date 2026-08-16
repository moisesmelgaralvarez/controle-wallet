# Rediseño de Controle Wallet — plan y prompts

*Para ejecutar con Claude Code dentro del repositorio. Cinco etapas, un PR por
etapa (o por página). Cada prompt se pega tal cual.*

---

## Antes de empezar: dos archivos al repositorio

```bash
cd ~/Documents/"Controle Wallet"
git switch -c feat/adn-fundacion
```

Copiá del paquete a la raíz del repositorio:

```
CLAUDE.md                          ← Claude Code lo lee solo en cada sesión
IDENTIDAD.md                       ← la especificación del ADN
sitio/marca.css
sitio/fuentes/Geist-Variable.woff2
sitio/fuentes/OFL-Geist.txt
```

`CLAUDE.md` es lo que hace que estos prompts puedan ser cortos: el contexto del
proyecto, las diez reglas y el ADN ya están cargados antes de que escribas nada.
Sin él, cada prompt tendría que repetir todo y aun así se le olvidaría a la mitad.

---

## Etapa 0 — La fundación

**Riesgo: bajo. Impacto: el 60% del cambio visual.**
Esta etapa no rediseña nada: cambia la identidad de lo que ya existe.
Hacela sola, en su propio PR, y mirá el resultado antes de seguir.

```
Vamos a instalar el nuevo ADN visual del producto. Leé primero IDENTIDAD.md
completo — es la especificación, no una sugerencia.

Esta tarea NO rediseña ninguna pantalla. Solo cambia la identidad de lo que ya
existe. Si en algún momento te dan ganas de reacomodar una composición, pará:
no es esta etapa.

Hacé exactamente esto:

1. Borrá de sitio/sitio.css dos bloques, y solo dos:
   - el `:root { … }` del principio
   - el `@media (prefers-color-scheme: dark) { :root { … } }`
   Son alrededor de 1,122 bytes. El resto de sitio.css no se toca: sigue
   consumiendo las mismas variables, que ahora las define marca.css.

2. Enlazá /marca.css como ÚLTIMA hoja en TODAS las páginas:
   sitio/index.html, precios, preguntas, contacto, entrar, registro, terminos,
   privacidad, 404 y sitio/app/index.html.
   Va de último a propósito: gana por cascada y así no hace falta un solo
   !important.

3. Revisá sitio/_headers. Si la CSP no declara font-src explícito, agregá
   `font-src 'self'`. La fuente se sirve desde nuestro propio Worker; no debe
   quedar ninguna petición a fonts.googleapis.com ni a ningún CDN.

4. Buscá en todo sitio/ cualquier atributo style= que haya quedado, y cualquier
   <link> o @import a un dominio externo. Reportámelos. No los arregles todavía:
   solo listámelos.

VERIFICAR — midiendo, no mirando. Con `npx wrangler dev`:
   - Cargá cada página en 390, 768, 1024, 1440 y 1920, en claro y en oscuro.
   - Confirmá con getComputedStyle que en las 10 páginas el body resuelve
     font-family Geist y que document.fonts.check('16px Geist') da true.
   - Consola: cero violaciones de CSP, cero peticiones a dominios externos.
   - Mirá específicamente la barra de pestañas de la app con sus siete entradas:
     ya se desbordó 20 px una vez.
   - Corré `npm run pruebas`. Deben salir 336 en verde.

OJO — la escala tipográfica cambia a propósito: --t-md pasa de 17px a 16px,
--t-sm de 15 a 14, --radio de 14 a 12. Todo el texto encoge un punto. Si algo
se desborda o se corta, decímelo con el ancho exacto y el elemento; no lo
"arregles" cambiando el token, que es lo que rompería la uniformidad.

Cuando esté verde: rama feat/adn-fundacion, PR con descripción en español de qué
cambia y por qué. No unas nada sin decirme qué encontraste.
```

---

## Etapa 1 — Higiene

**Riesgo: bajo.** Son errores reales que ya están en producción.

```
Tres correcciones puntuales, cada una en su propio commit dentro de la misma rama.

1. En sitio/index.html, en la lista "Lo que ya está resuelto", borrá el renglón
   completo de "Facturas por foto". Esa función está SIN EMPEZAR (ver TRASPASO.md
   §8) y el encabezado de esa sección dice "Nada de esto es promesa". Es una
   afirmación falsa en un sitio que vende, con términos que todavía no pasaron
   revisión legal. Sale hoy.

2. Recorré las 10 páginas y confirmá que TODAS declaran lang="es-HN". Corregí las
   que no. Un lector de pantalla con lang="en" pronuncia el español con fonemas
   ingleses.

3. Buscá en sitio/sitio.css, sitio/inicio.css, sitio/dispositivos.css y
   sitio/app/app.css cualquier color literal (#hex, rgb(), hsl()) que haya
   quedado fuera de marca.css. Listámelos con archivo y línea. Los que sean
   decorativos, migralos al token que corresponda. Si alguno no encaja en ningún
   token existente, PARÁ y preguntame: inventar un color en la hoja donde estás
   es exactamente cómo se pierde un ADN.

Verificá igual que en la etapa 0 y abrí el PR.
```

---

## Etapa 2 — El sitio que vende

**Riesgo: medio. Es lo que convierte visitantes en clientes.**
Una página por PR. Empezá por la portada; si esa funciona, el resto sale sola.

### Prompt de arquitectura (pegalo una vez, antes de la primera página)

```
Vamos a rediseñar el sitio público. Objetivo: que se vea al nivel de acabado de
Apple o Stripe, y que alguien que llega desconfiado termine creyendo que este
producto entiende su casa mejor que su banco.

La arquitectura es un scroll largo donde cada sección desarrolla UNA idea
completa. Trece secciones, en este orden, con este peso visual:

 1  Portada .............. la tesis en una frase ................... ALTO
 2  El problema .......... "contás la misma plata dos veces" ....... ALTO
 3  El ciclo de corte .... scroll fijo, tres pasos ................. ALTO
 4  La cifra del día ..... "te quedan L 1,340 por día" ............. MEDIO
 5  El pulso del mes ..... 26% es normal el 20, alarma el 4 ........ MEDIO
 6  Todas las pantallas .. teléfono, tableta y computadora ......... ALTO ★
 7  Ingresos que cambian . confirmado vs. estimado ................. MEDIO
 8  Cuotas que terminan .. en qué mes se libera ese dinero ......... MEDIO
 9  El hogar son dos ..... quién anotó qué ....................... . MEDIO
10  Importar el banco .... BAC, Ficohsa o CSV, sin duplicar ........ MEDIO
11  Cierre de mes ........ agosto queda como fue .................. MEDIO
12  Confianza ............ hechos, no sellos ...................... ALTO
13  Cierre y llamada ..... sin costo mientras se construye ........ ALTO

REGLAS DE RITMO — es lo que hace que se sienta Apple y no plantilla:
 - Nunca dos secciones de peso ALTO seguidas, ni cuatro MEDIO en fila.
 - Alterná la superficie: --fondo → --superficie → --fondo → --suave → …
   Que el ojo sepa que cambió de tema antes de leer.
 - La mancha de texto nunca pasa de 65ch, en ninguna resolución. En pantalla
   ancha crece el margen, no el párrafo.
 - Una sección, una idea. Si necesitás dos titulares, son dos secciones.

REGLAS TÉCNICAS — no negociables:
 - Ni un estilo en línea. Ni una dependencia. Ni una petición externa.
 - Las pantallas de dispositivos se DIBUJAN en HTML y CSS, no son capturas.
   Pesan casi nada, se ven nítidas a cualquier resolución y siguen el modo claro
   u oscuro de quien mira. Una imagen no hace ninguna de las tres.
 - Toda cifra de dinero en tabular-nums.
 - Reusá las clases que ya existen en sitio.css e inicio.css antes de crear una
   nueva. Si creás una, seguí la convención BEM en español que ya usa el proyecto.

CONTENIDO: usá las cifras reales que ya están en el sitio (L 19,101 consumido,
L 14,840 abonado, L 4,261 faltante, ciclo 7 jul – 6 ago). No inventes números
nuevos ni promesas de funciones que no existen — cotejá contra TRASPASO.md §8
antes de escribir cualquier afirmación sobre lo que el producto hace.

No escribas nada todavía. Decime cómo vas a estructurar la portada y qué clases
pensás reusar. Empezamos cuando estemos de acuerdo.
```

### Prompt por página (repetilo cambiando la página)

```
Implementá la sección 1 (Portada) y la 2 (El problema) de sitio/index.html.

Rama feat/sitio-portada. Solo esas dos secciones; el resto del archivo queda
como está y se ve raro a propósito — lo arreglamos por etapas.

Al terminar, antes de mostrarme nada:
 - Medí en 390, 768, 1024, 1440 y 1920, claro y oscuro.
 - Confirmá que ningún párrafo pasa de 65ch en 1920.
 - Confirmá que ningún objetivo tocable baja de 44px en pointer:coarse.
 - Consola limpia: cero CSP, cero peticiones externas.
 - `npm run pruebas` en verde.

Decime qué mediste y con qué valores. Si algo no cierra, decímelo antes de
proponer el arreglo.
```

---

## Etapa 3 — Las nueve pantallas de la app

**Riesgo: medio-alto.** Aquí hay lógica financiera real detrás de cada vista.

```
Vamos a aplicar el ADN a las pantallas de la app, empezando por Resumen.

REGLA DE ORO DE ESTA ETAPA: no se toca ni una línea de sitio/app/nucleo/ ni de
sitio/app/datos/. Solo la capa de presentación. Si para lograr un diseño te hace
falta un dato que la vista no recibe, PARÁ y decímelo — no lo calcules en la
vista. El núcleo es puro y se queda puro.

Orden: Resumen → Movimientos → Presupuesto → Cierre → Importar → Informe →
Proyectos → Historia → Tu cuenta. Un PR por pantalla.

Para cada una:
 - Reusá las clases que ya existen en app.css. Casi todo el sistema ya está
   nombrado (.ficha-app, .pulso-app, .mov-fila, .conc, .cierre-rubro…).
 - Toda cifra en tabular-nums. Lo confirmado y lo estimado se distinguen SIN
   leer la insignia: peso y borde punteado ya lo dicen.
 - Un color, un significado: --acento a favor, --alerta en contra. Nada más.
 - El riel en pantalla grande y la barra de pestañas en teléfono muestran el
   MISMO juego de destinos. Un solo lugar donde cambiar cuando se agregue una
   vista.

Empezá leyendo sitio/app/vistas/cierre.js, que es la referencia del estilo de una
vista con servidor, y sitio/app/datos/importar.js para el patrón de "preparar y
después aplicar".

Antes de escribir: mostrame qué cambia en Resumen y qué se queda igual. Quiero
ver que "nada se pierde" antes de que toques el archivo.

Verificación por pantalla, además de lo de siempre:
 - Comparar contra producción que las nueve secciones siguen respondiendo:
   curl -s https://controlewallet.com/app/ | grep -o 'data-ruta="[a-z]*"' | sort -u
 - `npm run pruebas` (336) y `npm run pruebas:aislamiento` (35) en verde.
```

---

## Etapa 4 — Consolidar los cortes de pantalla

**Riesgo: medio. Hacelo al final, nunca junto con otra cosa.**

```
El CSS tiene 12 puntos de quiebre distintos: 700, 800, 900, 1000, 1100, 1200,
1250, 1300, 1500, 1600, 1700 y 2000. Es un sistema que creció por parches.

Consolidalos en cinco: 700, 1000, 1300, 1600, 2000.

Esto es delicado: tocar un @media que ya funciona puede romper una composición
en un ancho que nadie mira. Por eso:

 1. Primero, SIN cambiar nada, hacé un inventario: qué regla vive en cada corte,
    en qué archivo, y a qué corte nuevo la moverías. Mostrámelo como tabla.
 2. Recién con la tabla aprobada, aplicá los cambios de a un archivo por commit.
 3. Después de CADA archivo, medí las nueve pantallas de la app y las diez
    páginas del sitio en los cinco anchos, claro y oscuro. Capturá y compará
    contra el estado anterior.

Si en algún ancho una composición cambia de forma, no es un ajuste: es una
regresión. Paramos y lo vemos juntos.
```

---

## Cómo saber que va bien

Después de cada etapa, tres preguntas:

1. **¿Se ve como un solo producto?** Abrí tres pantallas cualesquiera en pestañas
   distintas y saltá entre ellas. Si una se siente de otra app, algo se salió del
   ADN.
2. **¿Las 336 pruebas siguen verdes?** Si una se puso roja por un cambio visual,
   probablemente esa prueba estaba comprobando composición y no lógica — decilo,
   no la borres.
3. **¿La consola está limpia?** Cero CSP, cero peticiones externas. Es la señal de
   que no se coló una dependencia.

---

## Lo que no cambia con el rediseño

Producción **sigue sin respaldo automático**, y ya hay datos reales de clientes.
Un sitio hermoso que pierde los datos de alguien no se recupera con diseño.

**Supabase Pro (~$25/mes) va antes que la etapa 2.** No después.
