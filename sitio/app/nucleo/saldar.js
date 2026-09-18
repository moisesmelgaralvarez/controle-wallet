/* ============================================================
   Cómo se salda la tarjeta

   El dueño lo pidió así: «debería aparecer el gasto que tenemos en la
   tarjeta menos lo que posiblemente caiga el 31 y el promedio aproximado
   que podríamos estar recibiendo el 6, basado en lo recibido esa fecha
   en meses anteriores, para ver cómo saldar lo que debemos».

   Es una proyección y se dice como tal. Nada de esto entra al
   «disponible real»: lo que todavía no cayó no se puede gastar, y
   mezclarlo con lo que hay era justo el error que se corrigió en agosto.

   De dónde sale cada cifra:

   · La deuda, de `deudaTarjeta`: lo que declaró el banco más lo cargado
     después, más lo retenido que el estado de cuenta todavía no trae.
   · Lo que hay, de `patrimonio`: solo cuentas con saldo del banco.
   · Cada ingreso, de lo que DE VERDAD entró las últimas veces que se
     confirmó. Con PROMEDIO y no mediana, porque es lo que el dueño pidió
     y porque aquí interesa cuánto suele entrar, no descartar el mes raro.
     Si nunca se confirmó, lo que dice la plantilla, y se avisa.
   ============================================================ */

import { patrimonio } from './patrimonio.js';
import { netoLinea } from './ingresos.js';
import { diaValido, hoyLocal, iso } from './fechas.js';

const cent = x => Math.round(x * 100) / 100;

/** Cuántas veces atrás se miran para el promedio de un ingreso. */
const VECES_PROMEDIO = 6;

/** Cuánto dejó un ingreso cada mes que se confirmó, del más viejo al más nuevo. */
function historialIngreso(D, ev) {
  const meses = D.ingresosMes || {};
  return Object.keys(meses).sort().flatMap(per => {
    const m = meses[per];
    const lineas = m && m.confirmado && m.confirmado[ev.id] && m.lineas && m.lineas[ev.id];
    if (!lineas) return [];
    const neto = Object.values(lineas).reduce((s, l) => s + netoLinea(l), 0);
    return neto > 0 ? [{ per, neto }] : [];
  });
}

/** La próxima vez que cae un ingreso del día `dia`, contando desde mañana. */
function proximaFecha(dia, hoy) {
  const [y, m, d] = hoy.split('-').map(Number);
  if (diaValido(y, m, dia) > d) return iso(y, m, diaValido(y, m, dia));
  const yy = m === 12 ? y + 1 : y, mm = m === 12 ? 1 : m + 1;
  return iso(yy, mm, diaValido(yy, mm, dia));
}

/**
 * La deuda de las tarjetas contra lo que hay y lo que viene.
 *
 * `hoy` entra como argumento para que el núcleo siga siendo puro y la
 * prueba no dependa del calendario —ya se cayó una así—. Por omisión, la
 * fecha del teléfono.
 */
function planParaSaldar(D, per, hoy = hoyLocal()) {
  const p = patrimonio(D, per);
  const tarjetas = (p.tarjetas || []).filter(t => t.deudaTotal > 0.004)
    .map(t => ({ id: t.id, nombre: t.nombre, deuda: t.deudaTotal,
                 segunBanco: t.segunBanco, retenido: t.retenido }));
  if (!tarjetas.length) return { hay: false };

  const deuda = cent(tarjetas.reduce((s, t) => s + t.deuda, 0));
  const disponible = cent(p.enBanco + p.enMano);

  const ingresos = (D.plantillaIngresos || []).map(ev => {
    const veces = historialIngreso(D, ev).slice(-VECES_PROMEDIO);
    const plantilla = (ev.lineas || []).reduce((s, l) => s + netoLinea(l), 0);
    const montos = veces.map(v => v.neto);
    return {
      id: ev.id, nombre: ev.nombre,
      fecha: proximaFecha(ev.dia || 1, hoy),
      monto: cent(montos.length ? montos.reduce((a, b) => a + b, 0) / montos.length : plantilla),
      base: montos.length ? 'promedio' : 'plantilla',
      veces: montos.length,
      minimo: montos.length ? cent(Math.min(...montos)) : null,
      maximo: montos.length ? cent(Math.max(...montos)) : null
    };
  }).filter(x => x.monto > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Con qué ingreso se completa la deuda, contando lo que ya hay.
  let acumulado = disponible, cubreCon = null;
  for (const x of ingresos) {
    acumulado += x.monto;
    if (!cubreCon && disponible < deuda && acumulado >= deuda) cubreCon = x.id;
  }
  const porEntrar = cent(ingresos.reduce((s, x) => s + x.monto, 0));

  return {
    hay: true, hoy, tarjetas, deuda, disponible, ingresos, porEntrar,
    cubreYa: disponible >= deuda,
    cubreCon,
    // Lo que queda (o falta) después de usar todo lo que hay y lo que viene
    // en pagar la tarjeta. Negativo: ni juntándolo todo alcanza.
    resultado: cent(disponible + porEntrar - deuda),
    // Lo que falta por pagar con los ingresos, después de usar lo que hay.
    faltaTrasDisponible: cent(Math.max(0, deuda - disponible))
  };
}

export { planParaSaldar, historialIngreso, proximaFecha };
