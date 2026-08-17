# La pantalla de la portada — qué se hizo y qué costó

*Registro de la sesión del 17 de agosto de 2026. Reemplaza al paquete de diseño
que había acá antes: ese proponía tres láminas de tinta que se descartaron
después de verlas. Se deja el camino descartado porque la razón por la que se
cayó es lo más útil del documento.*

---

## Lo que quedó

Un acto propio entre la portada y la primera franja, con **una película de 9
segundos** dentro de un marco de aparato apoyado sobre el papel.

La película son **dos cosas unidas por un fundido**:

| tramo | qué es | de dónde sale |
|---|---|---|
| 0 – 6.0 s | una hoja en blanco deshaciéndose en partículas de luz que caen y se ordenan en columnas | generado (Kling 3.0, 11 créditos) |
| 6.0 – 9.0 s | el tablero **real** de la app contando sus cifras | grabado con `herramientas/filmar.js` |

El empalme es invisible porque las columnas de luz y las barras de la gráfica
son la misma forma. Y las cifras del tablero están a medio contar justo cuando
la luz aterriza, así que se ve el presupuesto calculándose mientras el plano
generado se convierte en el producto.

## Por qué se descartó lo generado que mostraba interfaz

Se generaron primero tres láminas de tinta y una pantalla de producto. Las de
tinta salieron bien como imágenes y mal como argumento: eran abstractas, y el
sitio ya tiene un instrumento —las dos reglas de días— que dice lo mismo mejor
y sin costar créditos.

La de producto salió con **texto inventado, cifras en dólares y un logo ajeno**
en el cuadro. Eso no es un defecto de esa generación: es lo que hacen los
modelos de imagen con la interfaz. Y este sitio se sostiene en que *«nada de
esto es promesa»*, así que una captura falsa era la contradicción más cara
posible.

De ahí la regla que quedó: **lo generado no muestra interfaz nunca.** Muestra
luz, partículas y atmósfera —lo único que un modelo no puede arruinar— y la
interfaz la pone la cámara.

## Lo que se midió, y lo que la medición desmintió

Cinco cosas se hicieron mal a ojo y las encontró la medición, no la vista:

1. **La CSP prohíbe `blob:` en `media-src`.** El primer montaje bajaba el
   archivo a memoria —receta de raspado— y el video nunca cargaba:
   `MEDIA_ELEMENT_ERROR: Media load rejected`. La salida no fue abrirle la mano
   a la política: fue no necesitarla. Se reproduce una vez, con `src` directo.

2. **El marco salía en 411 px.** Nació al lado del titular, en dos columnas. Un
   tablero de 1920 metido en 411 px deja su texto en un tercio. Se mudó a un
   acto propio, a todo el ancho: **1246 px**.

3. **La portada crecía a 1303 px dentro de una ventana de 900.** Misma causa:
   titular, pantalla e instrumento no caben en un viewport.

4. **El póster del teléfono era el primer cuadro** —la hoja deshaciéndose—, o
   sea una imagen abstracta sin una sola cifra, justo lo contrario de lo que la
   compuerta existe para dar. Ahora es el último cuadro.

5. **El corte de 1024 estaba corrido.** A esa ventana el marco sale en 838 px y
   la letra más chica del tablero en 9.5 px, bajo el umbral de 10 px del
   proyecto. El marco llega a los 883 px que hacen falta con una ventana de
   ~1080, y ese es el número que quedó.

## Las compuertas, y por qué son dos listas

Son cuatro condiciones repartidas en dos grupos, y el reparto importa:

- **Por tamaño** (ancho ≤ 1080, vertical con puntero grueso, teléfono
  acostado) → se esconde **el acto entero**. No es por peso: es que a esa
  escala el tablero no se lee, y más abajo la vitrina ya enseña la app en un
  teléfono, filmada al tamaño correcto.
- **Por movimiento reducido** → se queda el acto con el último cuadro fijo.
  Quien tiene esa preferencia en una pantalla de 1440 sí puede leer el tablero;
  lo que no quiere es que se mueva.

Las listas están escritas igual en `sitio/papel.css` y en `sitio/portada.js`.
Si una cambia y la otra no, un lado esconde lo que el otro descarga.

## La calidad, medida

El requisito fue «bastante calidad, sin detalles de mala calidad». Medido:

| | SSIM contra el original | bandeado | cercanía al tablero nativo |
|---|---|---|---|
| 720p crf 21 (3.3 MB) | 0.9949 | 0 | 0.9926 |
| **1080p crf 19 (6.3 MB)** | — | 0 | **0.9972** |

La compresión nunca fue el problema: hasta crf 21 conserva el 99.5% y no hay un
solo escalón de bandeado. El techo era el tamaño del plano generado —nace en
1284 × 716— y la cura fue montar a 1080p, donde el tablero baja desde sus 2560
nativos en vez de pasar por 1280.

## Lo que costó

| | créditos |
|---|---|
| 6 cuadros de tinta (descartados) | 12 |
| 1 cuadro de producto (descartado) | 2 |
| 3 videos de tinta (descartados) | 27 |
| **1 cuadro + 1 video de luz (el que quedó)** | **11** |
| total gastado | 52 |

Saldo al cerrar: **46.5**. Lo grabado con `filmar.js` no cuesta créditos y se
puede volver a generar idéntico cuando cambie la interfaz.

## Cómo se vuelve a hacer

```bash
npx wrangler dev &                    # el plató se compone contra el sitio real
node herramientas/filmar.js           # regraba las cuatro películas, incluida app-hero
```

Después se une el plano generado con el tablero. El original de la mitad
generada vive en `revision/laminas/v-luz.mp4`, que está fuera del repositorio
por `.gitignore`:

```bash
ffmpeg -i revision/laminas/v-luz.mp4 -i sitio/media/app-hero.mp4 -filter_complex "[0:v]scale=1920:1080:flags=lanczos,fps=30,setsar=1[a];[1:v]scale=1920:1080:flags=lanczos,fps=30,setsar=1[b];[a][b]xfade=transition=fade:duration=0.6:offset=5.442[v]" -map "[v]" -c:v libx264 -crf 19 -preset slow -pix_fmt yuv420p -movflags +faststart -an sitio/media/hero-scrub.mp4
```

El póster es el **primer** cuadro y `hero-final.jpg` el **último**. Los dos
hacen falta: el primero para que la película no arranque mostrando su final, el
segundo para quien no la recibe.
