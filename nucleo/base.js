/* ============================================================
   Piezas sueltas que usa todo lo demás

   Números, sumas y formato. No sabe de presupuestos: por eso puede
   importarlo cualquiera sin arrastrar dependencias.

   `fmt`, `nf` y `nf0` estaban al FINAL de asesor.js (línea 1699) y los
   usaba `cierreDeMes` en la 290. Funcionaba porque todo vivía en un
   mismo ámbito y nadie llamaba nada hasta después de evaluar el
   archivo. En módulos eso no se sostiene, así que bajan aquí.

   Extraído de asesor.js (24-29, 413-414, 1699-1701) sin tocar una línea.
   ============================================================ */
const HORIZONTE = 60;          // meses que se simulan como máximo
const COLCHON_MIN = 0.20;      // parte del disponible que no debería comprometerse

const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
const dosDig = n => String(n).padStart(2, '0');

const sumaMontos = arr => (arr || []).reduce((s, x) => s + num(x.monto), 0);
const perDe = x => x.periodo || String(x.fecha || '').slice(0, 7);
const nf = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-HN', { maximumFractionDigits: 0 });
function fmt(n) { return 'L ' + nf.format(num(n)); }

export { HORIZONTE, COLCHON_MIN, num, dosDig, sumaMontos, perDe, nf, nf0, fmt };
