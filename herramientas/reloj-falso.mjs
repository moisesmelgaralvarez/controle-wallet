// ============================================================
// Un reloj que miente, para cazar pruebas que dependen de la fecha.
//
// El 1 de septiembre de 2026 una prueba del núcleo se cayó sola: escribía
// '2026-08' a mano, y el sugerido decide qué mes está cerrado contra el
// reloj. Nadie tocó el código; cambió el mes. Se descubrió dos semanas
// después, con el CI en rojo.
//
//   HOY_FALSO=2027-03-15 node --import ./herramientas/reloj-falso.mjs --test "pruebas/**/*.prueba.js"
//   HOY_FALSO=+40        node --import ./herramientas/reloj-falso.mjs --test "pruebas/**/*.prueba.js"
//
// `+40` es «dentro de cuarenta días»: así el CI siempre mira hacia
// adelante, sin fechas fijas que un día quedan en el pasado.
//
// Solo cambia `new Date()` sin argumentos y `Date.now()`. Una fecha
// escrita —`new Date(2026, 7, 1)`— sigue siendo esa fecha.
//
// (Con `//` y no con un bloque: la ruta de las pruebas lleva «*/» adentro
// y cerraría el comentario a la mitad.)
// ============================================================
const Real = Date;
const pedido = String(process.env.HOY_FALSO || '');
const FIJO = /^\+\d+$/.test(pedido)
  ? Real.now() + Number(pedido.slice(1)) * 86400000
  : Real.parse(pedido + 'T15:00:00');
if (!Number.isFinite(FIJO)) throw new Error(`HOY_FALSO no se entiende: «${pedido}»`);

class Falso extends Real {
  constructor(...a) { if (a.length === 0) super(FIJO); else super(...a); }
  static now() { return FIJO; }
}
globalThis.Date = Falso;
