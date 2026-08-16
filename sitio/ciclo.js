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
  const sujeto  = panel.querySelector('[data-sujeto]');
  const rotulo  = panel.querySelector('[data-rotulo]');
  const lectura = panel.querySelector('[data-lectura]');
  const calza   = panel.querySelector('[data-calza]');
  const marcas  = panel.querySelectorAll('[data-marca]');

  /* Las dos formas de tener un mes que no empieza el 1, y la diferencia
     exacta entre ellas — que es de UN día, no de cero:

       corte: la tarjeta cierra el día D, así que el periodo va del D+1 al D.
              El día 1 del calendario ya lleva 31 − D días corriendo.

       pago:  el dinero cae el día D y ahí arranca el mes de la casa, así que
              va del D al D−1. El día 1 ya lleva 32 − D días gastándose.

     Redondear las dos al mismo número sería más fácil y estaría mal: son
     cifras que alguien va a comparar con su propio calendario. */
  const FORMAS = {
    corte: {
      cierra:  (d) => d,
      desde:   (d) => d + 1,
      hasta:   (d) => d,
      corridos:(d) => DIAS_MES - d,
      sujeto:  'tu tarjeta ya acumula',
      rotulo:  'El día que corta',
    },
    pago: {
      cierra:  (d) => d - 1,
      desde:   (d) => d,
      hasta:   (d) => (d === 1 ? DIAS_MES : d - 1),
      /* El día 1 es el caso borde y la fórmula general lo contestaba al
         revés: 32 − 1 daba 31 días corridos cuando la verdad es CERO — a
         quien le pagan el 1 su mes real le coincide con el calendario. */
      corridos:(d) => (d === 1 ? 0 : DIAS_MES - d + 1),
      sujeto:  'ya llevás',
      rotulo:  'El día que te pagan',
    },
  };

  const forma = () =>
    FORMAS[[...marcas].find((m) => m.checked)?.value || 'corte'];

  /* Recién acá aparece el control: hasta esta línea el deslizador está
     escondido por hoja de estilo. Un control visible que no responde es
     peor que ningún control. */
  panel.classList.add('vivo');

  const dibujar = () => {
    const d = Number(mando.value);
    const f = forma();

    /* El periodo cierra el día que diga la forma elegida, y abre 31 días
       antes. En la ventana del dibujo eso va del día (cierra − 31) al día
       (cierra). */
    const fin   = f.cierra(d);
    const abre  = x(fin - DIAS_MES);
    const cierra = x(fin);

    ciclo.setAttribute('x', abre);
    /* La costura es un rectángulo de 1.5 de ancho: se centra restando su
       mitad, o el corte quedaría medio píxel corrido del nudo. */
    costura.setAttribute('x', cierra - 0.75);
    nudo.setAttribute('cx', cierra);

    /* La cota mide lo que el periodo ya lleva acumulado cuando el mes del
       calendario apenas empieza. Es el argumento entero del producto
       reducido a una medida. */
    cota.setAttribute('x', abre);
    cota.setAttribute('width', x(0) - abre);
    tope.setAttribute('x', abre);

    const corridos = f.corridos(d);

    dia.textContent    = String(d);
    rango.textContent  = `del ${f.desde(d)} al ${f.hasta(d)}`;
    dias.textContent   = `${corridos} días`;
    sujeto.textContent = f.sujeto;
    rotulo.textContent = f.rotulo;

    /* Sin desfase se cambia la frase entera, no el número: «ya llevás 0 días»
       se lee como que algo falló. */
    lectura.hidden = corridos === 0;
    calza.hidden   = corridos !== 0;
  };

  mando.addEventListener('input', dibujar);
  marcas.forEach((m) => m.addEventListener('change', dibujar));
  dibujar();
});
