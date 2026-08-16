# El ADN visual de Controle Wallet

*Al 15 de agosto de 2026. Este documento es la fuente de verdad de la identidad.
Ninguna pantalla, generada por Stitch o escrita a mano, puede contradecirlo.*

---

## 1. Qué encontré en el export de Stitch

Medí las 13 pantallas del archivo, no las miré. Cada dato de abajo sale de comparar
los `tailwind.config` de cada documento entre sí.

**Trece pantallas para cuatro rutas.** Hay 5 versiones de Resumen (una llamada
"Dashboard"), 3 de Presupuesto, 3 de Cierre de Mes y 2 de Movimientos. Faltan por
completo Proyectos, Historia, Importar, Informe y Tu cuenta — cinco de tus nueve
secciones.

### Las divergencias, con su valor exacto

| Token | Valores distintos | Reparto |
|---|---|---|
| `primary` | **2** | `#95d3ba` en 10 pantallas · `#064e3b` en 3 |
| `background` | **3** | `#131315` en 10 · `#FBF9F9` en 2 · `#000000` en 1 |
| `surface` | **3** | `#131315` en 10 · `#FFFFFF` en 1 · `#ffffff` en 1 |
| `on-surface` | **3** | `#e5e1e4` en 10 · `#131315` en 2 · `#1a1c1d` en 1 |
| `tertiary` | **3** | `#95d3ba` en 9 · `#ffb4a9` en 3 · `#084e3b` en 1 |
| `error` | **2** | `#ffb4ab` en 12 · `#ba1a1a` en 1 |
| Radios | **6** | `sm`, `lg`, `xl`, `2xl`, `full` y un `[24px]` suelto |

### Los cuatro errores que rompen la marca

**1. Tres pantallas "claras" traen tokens oscuros.** *Resumen (Professional Light)*,
*Presupuesto (Light Mode)* y *Resumen (Light Mode)* declaran `background: #131315` —
negro — pese a llamarse claras y llevar `class="light"`. No son variantes: están mal.

**2. Tres pantallas declaran Geist pero nunca la cargan.** *Cierre de Mes (Light
Mode)*, *Presupuesto (Light Mode)* y *Movimientos (Desktop Dark)* piden
`font-body-pro: Geist` sin incluir la hoja de la fuente. Se renderizan en la fuente
por defecto del sistema — precisamente lo que estás tratando de dejar atrás.

**3. Una pantalla carga una fuente que no usa.** *Movimientos (Light Mode)* trae
**Inter** desde Google Fonts y declara Geist. Descarga una fuente para nada y usa
otra que nunca llegó.

**4. Seis pantallas van en `lang="en"`.** Con contenido en español. Un lector de
pantalla las pronuncia con fonemas ingleses: "Supermercado" sale ilegible. Es un
fallo de accesibilidad real, no cosmético.

### Y la observación de fondo

Nada de esto es culpa de Stitch. Es lo que pasa cuando **cada pantalla se genera
por separado**: cada generación reinventa la paleta porque no tiene memoria de la
anterior. La solución no es corregir las 13 — es tener un ADN escrito que toda
generación futura tenga que obedecer. Eso es este documento.

---

## 2. El ADN

Destilado de los valores mayoritarios del export, corregido donde el contraste no
alcanzaba.

### Tipografía — una sola familia

**Geist Variable**, autoalojada. Un archivo de 38 KB cubre los pesos 100 a 900.
Licencia SIL OFL 1.1 (Vercel + basement.studio).

Una familia, no dos. En un producto de nueve pantallas donde cada cifra tiene que
verse igual en el teléfono y en la computadora, dos familias son dos oportunidades
de que algo se desalinee.

| Papel | Tamaño | Peso | Interletrado | Dónde |
|---|---|---|---|---|
| Rótulo técnico | 12px | 500 | +0.02em, mayúsculas | `.rotulo` `.etiqueta` `.pie-disp` |
| Cifra de lista | 14px | 600 | −0.02em, tabular | `.mov-fila__monto` `.cat-lista__v` |
| Cuerpo | 16px | 400 | −0.01em | prosa, campos |
| Subtítulo | 20→24px | 600 | −0.02em | `h3` `.panel__tope` |
| Titular | 24→32px | 600 | −0.03em | `h2` `.tope h1` |
| Cifra madre | 36→56px | 700 | −0.05em, tabular | `.cifra__valor` `.plan__precio` |

**Toda cifra de dinero va en `tabular-nums`.** Sin excepción. Una columna de montos
que baila al cambiar de valor se lee como descuido, y este producto vende confianza.

### Color — diez tokens, dos modos

Todo el código consume exactamente **10 variables** (`app.css` las usa más de 400
veces). Redefinirlas cambia la identidad completa sin tocar una sola clase.

| Token | Claro | Oscuro | Significado |
|---|---|---|---|
| `--fondo` | `#FBF9F9` | `#131315` | lienzo |
| `--superficie` | `#FFFFFF` | `#1B1B1D` | cartas y paneles |
| `--elevado` | `#F1EFEE` | `#232326` | franjas, campos |
| `--tinta` | `#131315` | `#E5E1E4` | texto principal |
| `--tenue` | `#5B5F5D` | `#A4ABA7` | texto secundario |
| `--borde` | `#CFCBC8` | `#37373A` | filete decorativo |
| `--borde-fuerte` | `#87847F` | `#727674` | borde de controles |
| `--acento` | `#064E3B` | `#95D3BA` | **a favor** |
| `--acento-ct` | `#FFFFFF` | `#00382A` | texto sobre acento |
| `--suave` | `#E6F2EC` | `#12241D` | fondo teñido |
| `--alerta` | `#B3261E` | `#FFB4AB` | **en contra** |

**Un color, un significado, en todo el producto.** `--acento` es lo que va a favor:
disponible, confirmado, conciliado, resuelto. `--alerta` es lo que va en contra:
faltante, sobregiro, vencido, destructivo. Ningún otro color existe. El export tenía
`tertiary` en tres valores distintos sin significado asignado — por eso se sentía
que cada pantalla era de otro producto.

El oscuro **no es el claro invertido**: el verde sube a menta porque un verde
profundo sobre negro no se lee, y la alerta baja a salmón por la misma razón.

### Contraste — medido, no estimado

| Par | Claro | Oscuro | Mínimo |
|---|---|---|---|
| tinta / fondo | 17.69:1 | 14.33:1 | 4.5 |
| tenue / fondo | 6.18:1 | 7.92:1 | 4.5 |
| acento / fondo | 9.27:1 | 10.87:1 | 4.5 |
| acento-ct / acento | 9.72:1 | 7.69:1 | 4.5 |
| alerta / fondo | 6.23:1 | 10.93:1 | 4.5 |
| borde-fuerte / fondo | 3.55:1 | 4.03:1 | 3.0 |

Todos pasan WCAG AA. El `--borde-fuerte` existe porque WCAG 1.4.11 exige 3:1 en el
borde de un control, y el filete decorativo no llega — subirlo dejaría toda la
interfaz encajonada. Dos tokens: el fino separa, el fuerte delimita controles.

### Forma

- **Un radio**: 12px en superficies, 8px en controles, píldora en sellos y chips.
  El export traía seis radios distintos conviviendo.
- **Una sombra**, de un solo nivel. Dos niveles son un sistema; seis son un accidente.
- **44px de objetivo táctil** en `pointer: coarse`. Los botones crecen, no se aprietan.

### Proporción — la regla 60-30-10

Los diez tokens dicen **qué** colores existen. Esta regla dice **cuánta pantalla**
ocupa cada uno, que es una decisión distinta y la que más se descuida.

| Papel | Meta | Qué es |
|---|---|---|
| **60 · dominante** | `--fondo` | El lienzo. El aire entre las cosas |
| **30 · secundario** | `--superficie`, `--elevado`, bordes | Cartas, franjas, campos, filetes |
| **10 · acento** | `--acento`, `--suave`, `--alerta` | Lo que significa algo |

**Dos presupuestos, no uno:**

- **El sitio que vende** — `60 / 30 / 10`. Ahí el acento es persuasión: portada,
  llamadas a la acción, franjas teñidas. Puede y debe pintar.
- **Las pantallas de la app** — `60 / 32 / 8`. Ahí el acento es **semántico**:
  significa "a favor". Si el 10% de una pantalla de finanzas está verde, el verde
  deja de significar nada. La restricción es lo que le da fuerza a la señal.

**Estado medido hoy** (especimen a 1440, claro y oscuro dan lo mismo — la
proporción es geométrica, no depende del modo):

```
  60 · dominante    46.2%   de menos
  30 · secundario   51.0%   de más
  10 · acento        1.7%   de menos
```

Dominante y secundario están **invertidos**: las cartas cubren más que el lienzo.

Ojo con leer esto de más: el especimen envuelve cada bloque en un `.panel`, así
que exagera el secundario a propósito. Las páginas reales van a dar distinto.
Pero la dirección del arreglo es la misma, y **coincide exactamente con lo que
buscás**: menos cartas y más grandes, más lienzo entre secciones. Aire.

Es la misma corrección que pide el acabado tipo Apple. La regla 60-30-10 y la
arquitectura de trece secciones apuntan al mismo lado — eso es buena señal.

**No se juzga a ojo.** Un fondo se ve dominante mucho antes del 60%, y un acento
se siente excesivo bastante antes del 10%. Se mide:

```
npx wrangler dev
# abrí la página, y en la consola del navegador pegá:
herramientas/medir-proporcion.js
```

Sin dependencias ni instalación. Muestrea la página en rejilla, pregunta qué
elemento está arriba en cada punto, sube por los padres hasta el primer fondo
opaco, y lo compara contra los tokens vivos de `marca.css` — no contra una copia
que se pueda quedar atrás. Además avisa si aparece **cualquier color que no salga
de un token**, que es la fuga por donde se pierde un ADN.

---

## 3. Cómo se instala

Tres pasos. Ninguno toca una clase existente.

### Paso 1 — los archivos

```
sitio/fuentes/Geist-Variable.woff2     (nuevo, 38 KB)
sitio/fuentes/OFL-Geist.txt            (nuevo, la licencia exige distribuirla)
sitio/marca.css                        (nuevo)
```

### Paso 2 — borrar de `sitio.css`

Dos bloques, y solo dos:

- el `:root { … }` de las líneas 1–32
- el `@media (prefers-color-scheme: dark) { :root { … } }` completo

**Si quedan, ganan ellos y `marca.css` no hace nada visible.** Son 1,122 bytes.
El resto de `sitio.css` no se toca: sigue consumiendo las mismas variables.

### Paso 3 — enlazar `marca.css` de último

En **todas** las páginas (`index`, `precios`, `preguntas`, `contacto`, `entrar`,
`registro`, `terminos`, `privacidad`, `404` y `app/index`):

```html
<link rel="stylesheet" href="/sitio.css">
<link rel="stylesheet" href="/app/app.css">   <!-- solo en la app -->
<link rel="stylesheet" href="/marca.css">     <!-- SIEMPRE de último -->
```

Va de último a propósito: así los refinamientos ganan por orden de cascada y no
hace falta un solo `!important`, que es lo que ensucia una hoja con el tiempo.

### La CSP no cambia

`marca.css` no trae estilos en línea, ni CDN, ni dependencias. La fuente se sirve
desde tu propio Worker, así que `font-src 'self'` y `style-src 'self'` quedan
intactos. Si `_headers` no declara `font-src`, agregalo explícito:

```
Content-Security-Policy: ...; font-src 'self'; ...
```

---

## 4. Qué cambia visualmente, y qué hay que medir

Sé honesto con esto antes de unir el PR: **la escala tipográfica cambia**.

| Token | Antes | Ahora |
|---|---|---|
| `--t-sm` | 15px | 14px |
| `--t-md` | 17px | 16px |
| `--radio` | 14px | 12px |

Es el ADN de Stitch, y es el correcto para Geist — pero significa que **todo el
texto del producto encoge un punto**. Tu propia regla lo cubre: *"Medí, no mires.
A 1440 los párrafos salían de 1,302 px y los campos de 1,296."*

Antes de unir, medí en **390, 768, 1024, 1440 y 1920**, en claro y en oscuro, estas
cuatro pantallas: Resumen, Movimientos, Cierre e Informe. Lo que más riesgo tiene
es la barra de pestañas con siete entradas, que ya se te desbordó 20 px una vez.

Ya verifiqué contra tu código real (cargando `sitio.css` + `app.css` + `marca.css`
en ese orden, en un navegador, midiendo el estilo computado):

```
Geist cargada ................ true  (claro y oscuro)
h1 ........................... 56px / 700 / −2.8px
h2 ........................... 32px / 600 / −0.96px
.cifra__valor ................ 56px / 700 / tabular-nums
.ficha-app__v ................ 24px / 700 / tabular-nums
.campo ....................... borde #87847F / radio 8px / Geist
.boton--principal ............ #064E3B sobre #FFFFFF
```

Y verifiqué que **las 69 clases que toca `marca.css` existen** en tu código. Ninguna
es inventada.

---

## 5. Una cosa que encontré midiendo

`app.css` tiene la regla `.panel h2 { font-size: var(--t-md) }`. Es correcta —
un título dentro de un panel no debe competir con el título de la página — pero
significa que un `h2` cambia de tamaño según dónde esté. No es un error; es algo
que hay que saber antes de pensar que la escala falló. A mí me pasó: medí un `h2`
a 16px y tardé un rato en ver que la regla era tuya y estaba bien.

---

## 6. El prompt para las próximas pantallas de Stitch

Pegá esto **antes** de generar cualquier pantalla nueva. Es lo que evita que la
número 14 vuelva a inventar la paleta.

```
ADN OBLIGATORIO — Controle Wallet. No lo modifiques, no lo reinterpretes.

Tipografía: Geist, una sola familia, en TODA la pantalla.
  Rótulo   12px / 500 / +0.02em / MAYÚSCULAS
  Cifra    14px / 600 / −0.02em / tabular-nums
  Cuerpo   16px / 400 / −0.01em
  Sub      24px / 600 / −0.02em
  Titular  32px / 600 / −0.03em
  Display  56px / 700 / −0.05em / tabular-nums

Color, modo claro:
  fondo #FBF9F9 · superficie #FFFFFF · elevado #F1EFEE
  texto #131315 · secundario #5B5F5D · filete #CFCBC8 · borde control #87847F
  acento #064E3B (sobre él, texto #FFFFFF) · teñido #E6F2EC · alerta #B3261E

Color, modo oscuro:
  fondo #131315 · superficie #1B1B1D · elevado #232326
  texto #E5E1E4 · secundario #A4ABA7 · filete #37373A · borde control #727674
  acento #95D3BA (sobre él, texto #00382A) · teñido #12241D · alerta #FFB4AB

Un color, un significado: acento = a favor. alerta = en contra. Nada más.
No inventes un tercer color. No uses "tertiary".

PROPORCIÓN DE SUPERFICIE — regla 60-30-10, es obligatoria:
  60% el fondo (lienzo, aire entre las cosas)
  30% superficies (cartas, franjas, campos, filetes)
  10% acento — y en pantallas de app bajalo a 8%: ahí el acento significa
      "a favor", y si pinta demasiado deja de significar nada.
Si al componer una pantalla las cartas cubren más que el lienzo, la proporción
está invertida: hacé las cartas menos y más grandes, y ensanchá el aire entre
ellas. Nunca compenses agregando color.

Forma: radio 12px en cartas, 8px en controles, píldora en chips y sellos.
UNA sombra, muy suave. Objetivo táctil mínimo 44px.

Idioma: TODO en español de Honduras. La etiqueta del documento es lang="es-HN".
Moneda: Lempira, escrita "L 12,480.00", siempre en cifras tabulares.

Genera SIEMPRE los dos modos, claro y oscuro, con los mismos valores de arriba.
Nunca pongas tokens oscuros en una pantalla clara.
```

---

## 7. Lo que falta

- **Cinco pantallas sin diseñar**: Proyectos, Historia, Importar, Informe y Tu
  cuenta. Con el ADN escrito, generarlas ahora sale coherente de una.
- **Los cortes de pantalla**: tu CSS tiene **12 puntos de quiebre distintos**
  (700, 800, 900, 1000, 1100, 1200, 1250, 1300, 1500, 1600, 1700, 2000). Eso es
  un sistema que creció por parches. Consolidarlos en cinco (700, 1000, 1300,
  1600, 2000) es trabajo aparte y de riesgo medio: tocar los `@media` existentes
  puede romper composiciones que ya funcionan. **No lo hagas en el mismo PR que
  este.** Para pantallas nuevas, usá los cinco.
- **El sitio público** sigue pendiente. Este ADN aplica igual, pero las 13
  pantallas de Stitch son de la app, no del sitio que vende.
