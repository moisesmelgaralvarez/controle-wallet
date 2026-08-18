/* ============================================================
   Piezas sueltas que usa todo lo demás

   Números, sumas y formato. No sabe de presupuestos: por eso puede
   importarlo cualquiera sin arrastrar dependencias.

   `fmt`, `nf` y `nf0` estaban al FINAL de asesor.js (línea 1699) y los
   usaba `cierreDeMes` en la 290. Funcionaba porque todo vivía en un
   mismo ámbito y nadie llamaba nada hasta después de evaluar el
   archivo. En módulos eso no se sostiene, así que bajan aquí.

   Extraído de asesor.js (24-29, 413-414, 1699-1701) sin tocar una línea.

   ------------------------------------------------------------
   LA MONEDA VIVE AQUÍ, Y ANTES NO VIVÍA EN NINGUNA PARTE

   `fmt` decía `'L ' + nf.format(n)`, con la `L` escrita a mano y el
   agrupado clavado en `es-HN`. Pero el núcleo no solo devuelve
   números: devuelve FRASES ya redactadas —la carta del asesor, los
   pasos del diagnóstico, los bloqueos del cierre, las alertas de cada
   proyecto— y todas esas frases traen cifras dentro.

   La interfaz sí sabía de monedas: `ui.js` tenía su propio símbolo
   por hogar. El resultado, en la pantalla de Resumen de un hogar en
   dólares: las fichas de arriba decían «$ 12,480.00» y el Diagnóstico,
   tres centímetros más abajo, «L 12,480.00». La misma cifra con dos
   monedas en la misma pantalla es peor que estar en una sola moneda:
   hace dudar del número, no del rótulo.

   Así que el símbolo, los decimales y el agrupado viven en UN solo
   lugar —esta tabla— y `ui.js` los toma de aquí en vez de tener los
   suyos.

   EL SEPARADOR NO ES ADORNO. En Colombia, Chile, Argentina, Uruguay,
   Bolivia, Paraguay y Brasil el punto agrupa y la coma decimal: «1,234»
   allá es UNO CON DOSCIENTOS TREINTA Y CUATRO, no mil doscientos
   treinta y cuatro. Escribir cifras con el agrupado de Honduras a
   alguien de Bogotá no le cambia el estilo: le cambia el número.

   Y `decimales: 0` en peso colombiano, peso chileno y guaraní tampoco
   es un gusto: ahí los centavos no circulan, y escribirlos hace que
   toda cifra aparente cien veces más precisión de la que tiene.

   Sigue siendo UNA moneda por hogar. Convertir entre monedas es otra
   cosa —necesita tipo de cambio con fecha y una columna `moneda` por
   cuenta— y no se resuelve acá. Esto arregla que lo que ya se elegía
   se respete.
   ============================================================ */
const HORIZONTE = 60;          // meses que se simulan como máximo
const COLCHON_MIN = 0.20;      // parte del disponible que no debería comprometerse

const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
const dosDig = n => String(n).padStart(2, '0');

const sumaMontos = arr => (arr || []).reduce((s, x) => s + num(x.monto), 0);
const perDe = x => x.periodo || String(x.fecha || '').slice(0, 7);

/* ---------- moneda ---------- */

/** Las monedas que el servicio sabe escribir. */
const MONEDAS = {
  HNL: { simbolo: 'L',   nombre: 'Lempira',         decimales: 2, region: 'es-HN' },
  USD: { simbolo: '$',   nombre: 'Dólar',           decimales: 2, region: 'en-US' },
  GTQ: { simbolo: 'Q',   nombre: 'Quetzal',         decimales: 2, region: 'es-GT' },
  CRC: { simbolo: '₡',   nombre: 'Colón',           decimales: 2, region: 'es-CR' },
  NIO: { simbolo: 'C$',  nombre: 'Córdoba',         decimales: 2, region: 'es-NI' },
  PAB: { simbolo: 'B/.', nombre: 'Balboa',          decimales: 2, region: 'es-PA' },
  DOP: { simbolo: 'RD$', nombre: 'Peso dominicano', decimales: 2, region: 'es-DO' },
  MXN: { simbolo: '$',   nombre: 'Peso mexicano',   decimales: 2, region: 'es-MX' },
  COP: { simbolo: '$',   nombre: 'Peso colombiano', decimales: 0, region: 'es-CO' },
  PEN: { simbolo: 'S/',  nombre: 'Sol',             decimales: 2, region: 'es-PE' },
  CLP: { simbolo: '$',   nombre: 'Peso chileno',    decimales: 0, region: 'es-CL' },
  ARS: { simbolo: '$',   nombre: 'Peso argentino',  decimales: 2, region: 'es-AR' },
  UYU: { simbolo: '$U',  nombre: 'Peso uruguayo',   decimales: 2, region: 'es-UY' },
  PYG: { simbolo: '₲',   nombre: 'Guaraní',         decimales: 0, region: 'es-PY' },
  BOB: { simbolo: 'Bs',  nombre: 'Boliviano',       decimales: 2, region: 'es-BO' },
  BRL: { simbolo: 'R$',  nombre: 'Real',            decimales: 2, region: 'pt-BR' },
  EUR: { simbolo: '€',   nombre: 'Euro',            decimales: 2, region: 'es-ES' }
};

const POR_OMISION = 'HNL';
let MONEDA = POR_OMISION;

/** La ficha de una moneda. Una desconocida no revienta: se escribe su código. */
const monedaDe = codigo => MONEDAS[codigo] ||
  { simbolo: String(codigo || POR_OMISION), nombre: String(codigo || ''),
    decimales: 2, region: 'es-HN' };

/**
 * Fija la moneda del hogar. Se llama UNA vez, al cargarlo, y desde ahí
 * manda para todo el núcleo y para la interfaz.
 *
 * Devuelve el código que quedó puesto, que no siempre es el que se
 * pidió: uno desconocido cae al lempira en vez de dejar la app
 * escribiendo «undefined 1,234.00».
 */
function fijarMoneda(codigo) {
  MONEDA = MONEDAS[codigo] ? codigo : POR_OMISION;
  return MONEDA;
}

const monedaActual = () => MONEDA;
const simboloMoneda = codigo => monedaDe(codigo || MONEDA).simbolo;
const decimalesMoneda = codigo => monedaDe(codigo || MONEDA).decimales;

/* `Intl.NumberFormat` es caro de construir y la carta del asesor lo
   llama cientos de veces. Se guarda uno por combinación. */
const cache = new Map();
function formateador(codigo, decimales) {
  const llave = codigo + '/' + decimales;
  let f = cache.get(llave);
  if (!f) {
    f = new Intl.NumberFormat(monedaDe(codigo).region,
      { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
    cache.set(llave, f);
  }
  return f;
}

/* Se conservan los nombres `nf` y `nf0` con su `.format(n)` de siempre
   —los usan la carta, la priorización y el patrimonio para tasas y
   conteos— pero ahora siguen a la moneda del hogar en vez de quedarse
   clavados en `es-HN`. */
const nf  = { format: n => formateador(MONEDA, decimalesMoneda(MONEDA)).format(num(n)) };
const nf0 = { format: n => formateador(MONEDA, 0).format(num(n)) };

/** Una cifra de dinero, ya escrita: símbolo, agrupado y decimales del hogar. */
function fmt(n, codigo) {
  const c = MONEDAS[codigo] ? codigo : MONEDA;
  return `${monedaDe(c).simbolo} ${formateador(c, decimalesMoneda(c)).format(num(n))}`;
}

/** Igual, sin centavos. Para titulares y para las marcas de una gráfica. */
function fmt0(n, codigo) {
  const c = MONEDAS[codigo] ? codigo : MONEDA;
  return `${monedaDe(c).simbolo} ${formateador(c, 0).format(Math.round(num(n)))}`;
}

export {
  HORIZONTE, COLCHON_MIN, num, dosDig, sumaMontos, perDe, nf, nf0, fmt, fmt0,
  MONEDAS, fijarMoneda, monedaActual, simboloMoneda, decimalesMoneda
};
