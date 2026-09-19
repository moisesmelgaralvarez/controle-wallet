import * as A from '/app/nucleo/index.js';
import { hogarCompleto, PERIODO } from '/escenario/hogar.js';
import { resumen } from '/app/vistas/resumen.js';
import { movimientos } from '/app/vistas/movimientos.js';
import { importar } from '/app/vistas/importar.js';
const vista = new URLSearchParams(location.search).get('vista') || 'resumen';
const completo = hogarCompleto();
// El navegador solo tiene el mes en curso, como en la app de verdad.
const D = { ...completo, movimientos: completo.movimientos.filter(m => m.periodo === PERIODO) };
const contenedor = document.getElementById('vista');
contenedor.innerHTML = '';
const V = { resumen, movimientos, importar }[vista];
V({ contenedor, D, periodo: PERIODO, hogar: { id: 'h1' }, recargar: () => {} });
document.body.dataset.listo = '1';
