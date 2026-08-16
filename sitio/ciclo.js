/* ============================================================
   El ciclo propio — el único control del sitio público.

   Mueve un dibujo, no datos. No hay red, no hay almacenamiento, no
   hay estado que sobreviva a la recarga: es una demostración de la
   pregunta que el producto contesta, puesta antes de pedir un correo.

   POR QUÉ MUEVE ATRIBUTOS Y NO ESTILOS
   La regla del proyecto es cero estilos en línea, y no es estética:
   es lo que permite `style-src 'self'` sin excepciones en la CSP. Un
   `elemento.style.setProperty(...)` funcionaría hoy en los navegadores
   —la CSP no vigila el CSSOM— pero dejaría el sitio a un cambio de
   navegador de romperse en silencio, que es la peor clase de falla.
   Los atributos `x`, `width` y `x1` de SVG son geometría, no estilo:
   ninguna política los mira.

   SIN ESTE ARCHIVO
   La sección se ve completa, con el ciclo del ejemplo (corta el 6) ya
   dibujado en el HTML. El control se agrega desde acá, así que nadie
   se encuentra con un deslizador que no hace nada.
   ============================================================ */

/* La ventana del dibujo: 62 días, del -31 al 31, donde el día 0 es la
   medianoche con que abre el mes del calendario. Las tres constantes
   son las mismas que están escritas en los atributos del SVG en
   index.html; si cambia una, cambian las dos. */
const DIAS_MES = 31;
const ORIGEN   = 15;
const POR_DIA  = 9.5;

/* x(0) = 309.5 — donde arranca el mes del calendario. */
const x = (dia) => ORIGEN + (dia + DIAS_MES) * POR_DIA;

document.addEventListener('DOMContentLoaded', () => {
  const panel = document.querySelector('[data-panel]');
  const mando = document.querySelector('[data-corte]');
  if (!panel || !mando) return;

  const ciclo   = panel.querySelector('[data-ciclo]');
  const cota    = panel.querySelector('[data-cota]');
  const tope    = panel.querySelector('[data-tope]');
  const costura = panel.querySelector('[data-costura]');
  const nudo    = panel.querySelector('[data-nudo]');
  const dia     = panel.querySelector('[data-dia]');
  const rango   = panel.querySelector('[data-rango]');
  const dias    = panel.querySelector('[data-dias]');

  /* Recién acá aparece el control: hasta esta línea el deslizador está
     escondido por hoja de estilo. Un control visible que no responde es
     peor que ningún control. */
  panel.classList.add('vivo');

  const dibujar = () => {
    const corte = Number(mando.value);

    /* El ciclo abre el día siguiente al corte del mes anterior y cierra
       el día del corte de este. En la ventana del dibujo eso va del día
       (corte − 31) al día (corte). */
    const abre  = x(corte - DIAS_MES);
    const cierra = x(corte);

    ciclo.setAttribute('x', abre);
    /* La costura es un rectángulo de 1.5 de ancho: se centra restando su
       mitad, o el corte quedaría medio píxel corrido del nudo. */
    costura.setAttribute('x', cierra - 0.75);
    nudo.setAttribute('cx', cierra);

    /* La cota mide lo que el ciclo ya lleva acumulado cuando el mes del
       calendario apenas empieza. Es el argumento entero del producto
       reducido a una medida. */
    cota.setAttribute('x', abre);
    cota.setAttribute('width', x(0) - abre);
    tope.setAttribute('x', abre);

    const acumulados = DIAS_MES - corte;

    dia.textContent   = String(corte);
    rango.textContent = `del ${corte + 1} al ${corte}`;
    dias.textContent  = `${acumulados} días`;
  };

  mando.addEventListener('input', dibujar);
  dibujar();
});
