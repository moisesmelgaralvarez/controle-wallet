/* ============================================================
   Presupuesto — lógica de la aplicación.
   La app arranca vacía: todo se construye desde el asistente.
   Los cálculos financieros viven en asesor.js.
   ============================================================ */
(function () {
'use strict';

const A = window.Asesor;

/* ---------- utilidades ---------- */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => new Date().toISOString();

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const nf2 = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-HN', { maximumFractionDigits: 0 });

// El espacio tras la L es duro: evita que quede sola al final del renglón.
const money  = n => 'L ' + nf2.format(Number(n) || 0);
const moneyC = n => 'L ' + nf0.format(Math.round(Number(n) || 0));

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const mesKey   = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
/** El mes del hogar al que pertenece una fecha, según el día de arranque. */
const perDe    = f => A.periodoDe(f, A.inicioMes(D));
/** Mes en curso según el ciclo del hogar, no el del calendario. */
const mesHoy   = () => perDe(fechaLocal());
const mesLabel = k => { const [y, m] = k.split('-'); return `${cap(MESES[+m - 1])} ${y}`; };
/** "7 ago – 6 sep": solo tiene sentido enseñarlo si el mes no es el de calendario. */
function mesRango(k) {
  if (A.inicioMes(D) === 1) return '';
  const r = A.rangoPeriodo(k, A.inicioMes(D));
  const corto = f => { const [, m, d] = f.split('-'); return `${+d} ${MES_CORTO[+m - 1]}`; };
  return `${corto(r.desde)} – ${corto(r.hasta)}`;
}
const mesCorto = k => { const [y, m] = k.split('-'); return `${MES_CORTO[+m - 1]} ${String(y).slice(2)}`; };
const diaMes   = f => { const [y, m, d] = f.split('-'); return `${+d} de ${MESES[+m - 1]}`; };

/** Fecha local YYYY-MM-DD. toISOString() da UTC y en husos negativos adelanta el día. */
const fechaLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const CATEGORIAS = ['Alimentación', 'Servicios', 'Transporte', 'Salud', 'Hogar', 'Otros'];

const plural = (n, s, p) => `${nf0.format(n)} ${n === 1 ? s : p}`;
const enMeses = n => n === null ? 'más de 5 años' : n === 0 ? 'ya está' : plural(n, 'mes', 'meses');

/* ---------- estado inicial: vacío ---------- */

function seed() {
  return {
    version: 6,
    actualizado: now(),
    configurado: false,
    inicioMes: 1,            // día en que arranca el mes del hogar (1 = calendario)
    personas: [],
    cuentas: [],             // cuentas de banco: dónde vive el dinero
    plantillaIngresos: [],   // qué pagos existen y sus montos típicos
    ingresosMes: {},         // lo que realmente entró, mes a mes
    gastos: [],
    tarjetas: [],
    financiamientos: [],
    proyectos: [],
    movimientos: [],
    retiros: [],            // efectivo sacado del banco: traslado, no gasto
    pagosTarjeta: [],       // dinero que sale de una cuenta a saldar una tarjeta
    comercios: {},          // comercio → rubro, aprendido una vez y recordado
    presupuestoMes: {}      // el plan congelado de cada mes ya vivido
  };
}

/* ---------- migración ---------- */

function migrar(d) {
  if (!d) return d;

  if ((d.version || 1) < 3) {
    d.plantillaIngresos = d.plantillaIngresos || d.ingresos || [];
    delete d.ingresos;

    // Los ajustes por mes de la v2 son, en la v3, meses ya confirmados.
    d.ingresosMes = d.ingresosMes || {};
    Object.keys(d.ajustes || {}).forEach(per => {
      const mes = d.ingresosMes[per] || { lineas: {}, confirmado: {} };
      Object.keys(d.ajustes[per]).forEach(evId => {
        mes.lineas[evId] = d.ajustes[per][evId];
        mes.confirmado[evId] = true;
      });
      d.ingresosMes[per] = mes;
    });
    delete d.ajustes;

    d.tarjetas = d.tarjetas || [];
    d.financiamientos = d.financiamientos || [];

    // Un "crédito" de la v2 tenía saldo y pago: eso es un financiamiento.
    // La tarjeta como medio de pago no existía y hay que declararla aparte.
    (d.creditos || []).forEach(c => {
      const cuota = +c.pagoMensual || 0;
      const saldo = +c.saldo || 0;
      d.financiamientos.push({
        id: c.id || uid(), nombre: c.nombre || 'Financiamiento',
        cuotaMensual: cuota,
        cuotasTotales: cuota > 0 ? Math.ceil(saldo / cuota) : 0,
        cuotasPagadas: 0, tarjetaId: null, _upd: now()
      });
    });
    delete d.creditos;

    (d.gastos || []).forEach(g => {
      if (g.medioPago == null) g.medioPago = 'tarjeta';
      if (g.categoria == null) g.categoria = 'Otros';
      if (g.crecimiento == null) g.crecimiento = 0;
    });

    (d.proyectos || []).forEach(p => {
      if (p.costoMin == null) { p.costoMin = +p.meta || 0; p.costoMax = +p.meta || 0; }
      if (p.aporteMensual == null) p.aporteMensual = 0;
      delete p.meta;
    });

    // Si ya tenía datos, no tiene sentido mandarlo al asistente.
    d.configurado = Boolean((d.personas || []).length && (d.plantillaIngresos || []).length);
    d.version = 3;
  }

  if (d.inicioMes == null) d.inicioMes = 1;

  if ((d.version || 1) < 4) {
    // La tarjeta que existía era siempre de crédito: la de débito es nueva.
    (d.tarjetas || []).forEach(t => { if (t.tipo == null) t.tipo = 'credito'; });
    d.version = 4;
  }

  if ((d.version || 1) < 5) {
    // Un registro sin `periodo` se contaba por los primeros siete caracteres de
    // su fecha, o sea por el mes de CALENDARIO. Con un ciclo que arranca el 7,
    // un gasto del 2 de agosto es de julio, y así aparecía en el mes que no era.
    // Se le escribe el mes que le toca de una vez y deja de depender del apaño.
    const ini = A.inicioMes(d);
    ['movimientos', 'retiros', 'pagosTarjeta'].forEach(col => {
      (d[col] || []).forEach(x => {
        if (x.periodo || !x.fecha) return;
        x.periodo = A.periodoDe(x.fecha, ini);
        x._upd = now();
      });
    });

    // Antes, un consumo sin tarjeta se le achacaba a la primera de la lista al
    // calcular el corte. Esa suposición se quitó del asesor porque metía en el
    // corte compras que salían directo de la cuenta. Para no perder por el
    // camino lo que sí era de la tarjeta, se escribe aquí de una vez: solo
    // cuando hay UNA sola tarjeta de crédito y el movimiento no vino del
    // estado de cuenta de un banco.
    const credito = (d.tarjetas || []).filter(t => (t.tipo || 'credito') === 'credito');
    if (credito.length === 1) {
      (d.movimientos || []).forEach(m => {
        if (m.tarjetaId) return;
        if ((m.medioPago || 'tarjeta') !== 'tarjeta') return;
        if (m.origen === 'import' && /^cuenta:/.test(m.fuente || '')) return;
        m.tarjetaId = credito[0].id;
        m._upd = now();
      });
    }
    d.version = 5;
  }

  if ((d.version || 1) < 6) {
    // Sin saber qué tan necesario es un proyecto, ningún motor puede ordenarlos
    // por mérito: solo por si el dinero alcanza. Lo ya registrado entra como
    // "deseo / algún día", que es el supuesto conservador — nada se cuela
    // adelante por omisión; para subir de categoría hay que decirlo.
    (d.proyectos || []).forEach(p => {
      if (p.tipo == null) p.tipo = 'deseo';
      if (p.urgencia == null) p.urgencia = 'algun_dia';
      if (p.consecuencia == null) p.consecuencia = '';
    });
    d.version = 6;
  }

  ['personas','cuentas','plantillaIngresos','gastos','tarjetas','financiamientos',
   'proyectos','movimientos','retiros','pagosTarjeta'].forEach(k => { d[k] = d[k] || []; });
  d.ingresosMes = d.ingresosMes || {};
  d.comercios = d.comercios || {};
  d.presupuestoMes = d.presupuestoMes || {};
  d._borradosMes = d._borradosMes || {};

  // Una versión anterior marcaba el "borrar todo" con una fecha de corte. Si el
  // reloj del otro teléfono iba adelantado, esa fecha quedaba en el futuro y se
  // comía cada registro nuevo al sincronizar. Se retira en cuanto se abre.
  delete d._reset;
  return d;
}

/* ---------- estado ---------- */

const KEY = 'presupuesto.hogar.v1';
let D = null;
let vista = 'resumen';
let periodo = mesKey(new Date());   // se recalcula al cargar, ya con el ciclo
let colaFacturas = [];   // fotos tomadas que aún no se han leído
let filtroMov = { texto: '', medio: '', personaId: '' };

function cargar() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { D = migrar(JSON.parse(raw)); persistir(false); return; }
  } catch (e) { console.warn('No se pudo leer el almacenamiento local', e); }
  D = seed();
  persistir(false);
}

function persistir(marcar = true) {
  if (marcar) D.actualizado = now();
  try { localStorage.setItem(KEY, JSON.stringify(D)); }
  catch (e) { console.error('No se pudo guardar', e); toast('No se pudo guardar en este dispositivo'); }
  if (marcar && window.Sync) window.Sync.push(D);
}

let remotoPendiente = null;

/**
 * Aplica lo que vino de la nube. Con un formulario abierto NO se puede tocar:
 * el formulario ya tiene en la mano la lista donde va a escribir, y cambiar D
 * por debajo haría que guardara sobre el documento viejo — el registro se
 * pierde sin dar ningún error. Se espera a que la hoja se cierre.
 */
function aplicarRemoto(remoto) {
  if (!remoto) return;
  if (!sheet.hidden) { remotoPendiente = remoto; return; }
  D = migrar(window.Sync.merge(D, remoto));
  try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) {}
  render();
}

/* ---------- atajos ---------- */

const persona   = id => D.personas.find(p => p.id === id) || { nombre: 'Sin asignar' };
const gastoDe   = id => D.gastos.find(g => g.id === id);
const tarjetaDe = id => D.tarjetas.find(t => t.id === id);
const eventoDe  = id => D.plantillaIngresos.find(e => e.id === id);

/**
 * A qué mes pertenece un registro. Se usa el del asesor, no `x.periodo` a
 * secas: un registro viejo sin `periodo` lo contaba el asesor —por su fecha—
 * pero no la app, y el total de la pantalla salía distinto al del informe y
 * al del cierre de mes.
 */
const perReg = x => A.perDe(x);
const delMes = (lista, per = periodo) => (lista || []).filter(x => perReg(x) === per);

function realPorGasto() {
  const m = {};
  delMes(D.movimientos).forEach(x => {
    const k = x.gastoId || 'otros';
    m[k] = (m[k] || 0) + (+x.monto || 0);
  });
  return m;
}

const gastadoMes = () => delMes(D.movimientos)
  .reduce((s, m) => s + (+m.monto || 0), 0);

/* ---------- integridad al eliminar ---------- */

/**
 * Borrar un registro deja referencias colgando en los demás, y ahí es donde
 * los números dejan de cuadrar: un movimiento que apunta a un gasto que ya no
 * existe desaparece del "plan contra realidad" pero sigue sumando en el total.
 * Esto reengancha lo que quedó suelto en vez de dejarlo apuntando al vacío.
 */
function limpiarReferencias(tipo, id) {
  if (tipo === 'gasto') {
    // El rubro se fue, pero el dinero se gastó: pasa a "Otros", no se pierde.
    D.movimientos.forEach(m => {
      if (m.gastoId === id) { m.gastoId = 'otros'; m._upd = now(); }
    });
    // Y lo aprendido de los comercios tiene que soltar el rubro muerto: si no,
    // la próxima importación volvía a etiquetar contra un id que ya no existe
    // y ese gasto desaparecía del plan contra realidad aunque siguiera sumando
    // en el total.
    Object.keys(D.comercios || {}).forEach(k => {
      if (D.comercios[k] === id) delete D.comercios[k];
    });
  }

  if (tipo === 'tarjeta') {
    // Sin esto, un movimiento con la tarjeta borrada no cae en ningún ciclo.
    D.gastos.forEach(g => { if (g.tarjetaId === id) { g.tarjetaId = null; g._upd = now(); } });
    D.movimientos.forEach(m => { if (m.tarjetaId === id) { m.tarjetaId = null; m._upd = now(); } });
  }

  if (tipo === 'evento') {
    D.tarjetas.forEach(t => { if (t.pagaCon === id) { t.pagaCon = ''; t._upd = now(); } });
    Object.keys(D.ingresosMes).forEach(k => {
      const mes = D.ingresosMes[k];
      if (!mes) return;
      if (mes.lineas) delete mes.lineas[id];
      if (mes.confirmado) delete mes.confirmado[id];
      mes._upd = now();
    });
  }

  if (tipo === 'cuenta') {
    // Sin esto quedarían ingresos cayendo en una cuenta que ya no existe.
    D.personas.forEach(p => { if (p.cuentaId === id) { p.cuentaId = null; p._upd = now(); } });
    D.tarjetas.forEach(t => { if (t.cuentaId === id) { t.cuentaId = null; t._upd = now(); } });
    D.retiros.forEach(r => { if (r.cuentaId === id) { r.cuentaId = null; r._upd = now(); } });
    D.pagosTarjeta.forEach(x => { if (x.cuentaId === id) { x.cuentaId = null; x._upd = now(); } });
  }

  if (tipo === 'tarjeta') {
    D.pagosTarjeta.forEach(x => { if (x.tarjetaId === id) { x.tarjetaId = null; x._upd = now(); } });
  }

  if (tipo === 'persona') {
    D.plantillaIngresos.forEach(ev => {
      ev.lineas = (ev.lineas || []).filter(l => l.personaId !== id);
      ev._upd = now();
    });
    Object.keys(D.ingresosMes).forEach(k => {
      const mes = D.ingresosMes[k];
      if (!mes || !mes.lineas) return;
      Object.keys(mes.lineas).forEach(evId => { delete mes.lineas[evId][id]; });
      mes._upd = now();
    });
  }

  if (tipo === 'aporte') {
    // El aporte vive dentro del proyecto: hay que marcar el padre como tocado.
    const p = D.proyectos.find(x => x.id === sheet.dataset.padre);
    if (p) p._upd = now();
  }
}

/** Lo mismo, pero sobre el borrador del asistente. */
function limpiarReferenciasAsis(tipo, id) {
  if (tipo === 'tarjeta') asis.gastos.forEach(g => { if (g.tarjetaId === id) g.tarjetaId = null; });
  if (tipo === 'evento')  asis.tarjetas.forEach(t => { if (t.pagaCon === id) t.pagaCon = ''; });
}

/* ---------- piezas ---------- */

const VEREDICTO = {
  // Los cuatro del asesor: mezclan si el dinero alcanza con si conviene ahora.
  hazlo_ya:      { t: 'Hazlo ya',      c: 'critical' },
  programado:    { t: 'Programado',    c: 'good' },
  puede_esperar: { t: 'Puede esperar', c: 'serious' },
  reconsiderar:  { t: 'Reconsideralo', c: 'critical' },
  logrado:       { t: 'Alcanzado',     c: 'good' },
  // Los de flujo puro siguen existiendo dentro de evaluarProyecto.
  viable:   { t: 'Viable',    c: 'good' },
  ajustado: { t: 'Ajustado',  c: 'serious' },
  inviable: { t: 'No viable', c: 'critical' }
};

const ICONO = {
  good:     '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  warning:  '<circle cx="12" cy="12" r="9"/><path d="M12 7.6v5.2M12 16.3v.1"/>',
  serious:  '<circle cx="12" cy="12" r="9"/><path d="M12 7.6v5.2M12 16.3v.1"/>',
  critical: '<circle cx="12" cy="12" r="9"/><path d="M12 7.6v5.2M12 16.3v.1"/>',
  mas:      '<path d="M12 5.5v13M5.5 12h13"/>',
  chev:     '<path d="M9.5 5.5l7 6.5-7 6.5"/>'
};

function badge(v) {
  const s = VEREDICTO[v] || VEREDICTO.viable;
  return `<span class="badge badge--${s.c}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONO[s.c]}</svg>${esc(s.t)}</span>`;
}

const alerta = a => `<li class="alerta alerta--${esc(a.nivel)}">
  <svg viewBox="0 0 24 24" aria-hidden="true">${ICONO[a.nivel] || ICONO.warning}</svg>
  <span>${esc(a.texto)}</span></li>`;

const vacio = (titulo, sub, accion, etiqueta) => `
  <div class="empty">
    <div class="empty__t">${esc(titulo)}</div>
    <div class="empty__s">${esc(sub)}</div>
    ${accion ? `<button class="btn" data-act="${esc(accion)}" style="margin-top:18px;max-width:280px;margin-inline:auto">
      <svg viewBox="0 0 24 24">${ICONO.mas}</svg> ${esc(etiqueta)}</button>` : ''}
  </div>`;

/* ---------- gráficas ---------- */

function chartIngresos() {
  const evs = D.plantillaIngresos;
  if (!evs.length) return '';

  const W = 320, H = 176, padL = 6, padR = 6, padT = 32, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = Math.max(...evs.flatMap(ev => D.personas.map(p => A.netoLinea(A.lineaDe(D, ev, p.id, periodo)))), 1);

  const gw = plotW / evs.length;
  const bw = Math.min(26, (gw - 14) / 2);
  let marks = '', ticks = '';

  evs.forEach((ev, i) => {
    const cx = padL + gw * i + gw / 2;
    let total = 0;
    D.personas.forEach((p, j) => {
      const v = A.netoLinea(A.lineaDe(D, ev, p.id, periodo));
      total += v;
      const h = Math.max(2, (v / max) * plotH);
      const x = cx - bw - 1 + j * (bw + 2);
      marks += `<rect class="c-bar" x="${x.toFixed(1)}" y="${(padT + plotH - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="var(--serie-${j % 2})"/>`;
      marks += `<rect class="c-hit" x="${(x - 3).toFixed(1)}" y="${padT}" width="${(bw + 6).toFixed(1)}" height="${plotH}"
                 data-tip="${esc(p.nombre)} · ${esc(ev.nombre)}|${esc(money(v))}"/>`;
    });
    ticks += `<text class="c-tick" x="${cx.toFixed(1)}" y="${H - 12}" text-anchor="middle">${esc(ev.nombre.split(' ')[0])}</text>`;
    ticks += `<text class="c-tick" x="${cx.toFixed(1)}" y="${H - 2}" text-anchor="middle" opacity=".7">día ${esc(String(ev.dia))}</text>`;
    ticks += `<text class="c-val" x="${cx.toFixed(1)}" y="14" text-anchor="middle">${esc(moneyC(total))}</text>`;
  });

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
            aria-label="Ingreso neto por fecha de pago, separado por persona">
    <line class="c-axis" x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}"/>
    ${marks}${ticks}
  </svg>
  <div class="legend">
    ${D.personas.map((p, j) => `<span class="legend__i"><span class="legend__s" style="background:var(--serie-${j % 2})"></span>${esc(p.nombre)}</span>`).join('')}
  </div>`;
}

function chartGastos() {
  const items = D.gastos.filter(g => (+g.monto || 0) > 0).sort((a, b) => b.monto - a.monto);
  if (!items.length) return '<div class="empty"><div class="empty__s">Ningún gasto tiene monto asignado.</div></div>';

  const max = items[0].monto;
  const rowH = 30, W = 320, labW = 104, valW = 58;
  const barW = W - labW - valW;

  const rows = items.map((g, i) => {
    const y = i * rowH;
    const w = Math.max(3, (g.monto / max) * barW);
    const r = g.monto / max;
    const tono = r > 0.66 ? 'var(--seq-550)' : r > 0.33 ? 'var(--seq-400)' : 'var(--seq-250)';
    return `
      <text class="c-lab" x="0" y="${y + 19}">${esc(g.concepto.slice(0, 15))}</text>
      <rect class="c-bar" x="${labW}" y="${y + 8}" width="${w.toFixed(1)}" height="13" fill="${tono}"/>
      <text class="c-val" x="${W}" y="${y + 19}" text-anchor="end">${esc(nf0.format(g.monto))}</text>
      <rect class="c-hit" x="0" y="${y}" width="${W}" height="${rowH}"
            data-tip="${esc(g.concepto)} · ${esc(g.categoria || 'Otros')}|${esc(money(g.monto))}"/>`;
  }).join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${items.length * rowH}" role="img"
            aria-label="Gastos presupuestados por concepto, de mayor a menor">${rows}</svg>`;
}

function chartProyeccion(ev) {
  const cuota = ev.cuotaSugerida;
  if (!(cuota > 0) || ev.faltaMax <= 0 || !ev.filas.length) return '';
  if (ev.mesesSugerido !== null && ev.mesesSugerido <= 1) return '';

  const n = Math.max(6, Math.min(24, (ev.mesesSugerido || 24) + 2));
  const serie = [];
  let junta = ev.junta, alcanzado = null;
  for (let k = 0; k < n; k++) {
    junta = Math.min(ev.max, junta + Math.min(cuota, Math.max(0, ev.filas[k] ? ev.filas[k].disponible : 0)));
    if (alcanzado === null && junta >= ev.max) alcanzado = k;
    serie.push(junta);
  }

  const W = 320, H = 132, padL = 4, padR = 4, padT = 10, padB = 20;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = ev.max * 1.08 || 1;
  const px = i => padL + (i / (n - 1)) * plotW;
  const py = v => padT + plotH - (v / max) * plotH;

  const linea = serie.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join('');
  const area = `M${px(0).toFixed(1)},${(padT + plotH).toFixed(1)}` +
               serie.map((v, i) => `L${px(i).toFixed(1)},${py(v).toFixed(1)}`).join('') +
               `L${px(n - 1).toFixed(1)},${(padT + plotH).toFixed(1)}Z`;

  const banda = ev.max > ev.min
    ? `<rect x="${padL}" y="${py(ev.max).toFixed(1)}" width="${plotW}" height="${Math.max(1, py(ev.min) - py(ev.max)).toFixed(1)}" fill="var(--seq-400)" opacity=".13"/>`
    : '';

  const hitos = [0, Math.round((n - 1) / 2), n - 1].map(k =>
    `<text class="c-tick" x="${px(k).toFixed(1)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === n - 1 ? 'end' : 'middle'}">${esc(mesCorto(A.sumaMeses(periodo, k)))}</text>`).join('');

  const marca = alcanzado !== null
    ? `<circle cx="${px(alcanzado).toFixed(1)}" cy="${py(ev.max).toFixed(1)}" r="4" fill="var(--good)" stroke="var(--surface)" stroke-width="2"/>` : '';

  return `<svg class="chart" style="margin-top:14px" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="Ahorro acumulado proyectado frente al rango de costo del proyecto">
    ${banda}
    <line class="c-grid" x1="${padL}" y1="${py(ev.min).toFixed(1)}" x2="${W - padR}" y2="${py(ev.min).toFixed(1)}" stroke-dasharray="3 3"/>
    ${ev.max > ev.min ? `<line class="c-grid" x1="${padL}" y1="${py(ev.max).toFixed(1)}" x2="${W - padR}" y2="${py(ev.max).toFixed(1)}" stroke-dasharray="3 3"/>` : ''}
    <path d="${area}" fill="var(--seq-400)" opacity=".14" stroke="none"/>
    <path d="${linea}" fill="none" stroke="var(--seq-400)" stroke-width="2" stroke-linejoin="round"/>
    ${marca}
    <line class="c-axis" x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}"/>
    ${hitos}
  </svg>
  <div class="legend">
    <span class="legend__i"><span class="legend__s" style="background:var(--seq-400)"></span>Ahorro acumulado</span>
    <span class="legend__i"><span class="legend__s" style="background:var(--seq-400);opacity:.28"></span>Rango de costo</span>
    ${alcanzado !== null ? '<span class="legend__i"><span class="legend__s" style="background:var(--good);border-radius:50%"></span>Meta alcanzada</span>' : ''}
  </div>`;
}

/* ---------- pulso del mes ---------- */

/**
 * La pregunta de todos los días: ¿vamos bien? Se responde comparando cuánto
 * lleva gastado el hogar contra cuánto lleva corrido el mes. Las dos barras
 * juntas lo dicen de un vistazo: si la de abajo va más larga, van adelantados.
 */
function bloquePulso() {
  const p = A.pulso(D, periodo);
  if (!p.hayPlan || !p.enCurso) return '';

  const pctMes = Math.min(100, p.avanceMes * 100);
  const pctGasto = Math.min(100, p.avanceGasto * 100);
  const sobregiro = p.gastado > p.presupuesto;

  const agenda = [
    p.proximoIngreso ? `<b>${esc(p.proximoIngreso.nombre)}</b> ${p.proximoIngreso.enDias === 0
      ? 'entra hoy' : 'en ' + esc(plural(p.proximoIngreso.enDias, 'día', 'días'))}` : '',
    p.proximoCorte ? `corte de <b>${esc(p.proximoCorte.nombre)}</b> ${p.proximoCorte.enDias === 0
      ? 'hoy' : 'en ' + esc(plural(p.proximoCorte.enDias, 'día', 'días'))}` : ''
  ].filter(Boolean).join(' · ');

  return `
    <div class="sec"><span class="sec__t">Cómo va ${esc(mesLabel(periodo))}</span>
      <button class="sec__a" data-goto="movimientos">Registrar gasto</button></div>
    <div class="card">
      <div class="pulso__par">
        <div class="pulso__l">Mes transcurrido</div>
        <div class="pulso__n">${esc(nf0.format(pctMes))}%</div>
      </div>
      <div class="bar" style="margin-top:6px"><div class="bar__f pulso__tiempo" style="width:${pctMes.toFixed(1)}%"></div></div>

      <div class="pulso__par" style="margin-top:12px">
        <div class="pulso__l">Presupuesto gastado</div>
        <div class="pulso__n">${esc(nf0.format(pctGasto))}%</div>
      </div>
      <div class="bar" style="margin-top:6px"><div class="bar__f ${sobregiro ? 'is-over' : p.adelantado ? 'pulso__alerta' : ''}" style="width:${pctGasto.toFixed(1)}%"></div></div>

      ${p.gastado === 0 ? `
        <div class="field__h" style="margin-top:12px">
          Todavía no hay nada registrado en ${esc(mesLabel(periodo))}. En cuanto anoten
          el primer gasto puedo decirles si van a buen ritmo.</div>`
      : sobregiro ? `
        <div class="consejo consejo--critical" style="margin-top:12px">
          <div class="consejo__t">Ya se pasaron del plan</div>
          <div class="consejo__c">Van <b>${esc(money(p.gastado - p.presupuesto))}</b> por encima
            y todavía quedan ${esc(plural(p.diasRestantes, 'día', 'días'))} de mes.</div>
        </div>`
      : p.adelantado ? `
        <div class="consejo consejo--critical" style="margin-top:12px">
          <div class="consejo__t">Van más rápido que el calendario</div>
          <div class="consejo__c">A este ritmo cerrarían en <b>${esc(money(p.proyeccion))}</b>,
            unos ${esc(money(p.desvio))} por encima del plan. Para llegar justos quedan
            <b>${esc(money(p.porDia))}</b> al día hasta fin de mes.</div>
        </div>`
      : `
        <div class="consejo consejo--good" style="margin-top:12px">
          <div class="consejo__t">Van holgados</div>
          <div class="consejo__c">A este ritmo cerrarían en <b>${esc(money(p.proyeccion))}</b>,
            dentro del plan. Pueden gastar <b>${esc(money(p.porDia))}</b> al día los
            ${esc(plural(p.diasRestantes, 'día que queda', 'días que quedan'))}.</div>
        </div>`}

      ${agenda ? `<div class="field__h" style="margin-top:10px">Lo que viene: ${agenda}.</div>` : ''}
    </div>`;
}

/* ---------- ciclo de tarjeta ---------- */

function bloqueCiclo(t) {
  const c = A.cicloTarjeta(D, t, periodo);
  const sinIngreso = !c.evento;

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div>
          <div style="font-size:15px;font-weight:680;letter-spacing:-.02em">${esc(t.nombre)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px">
            Ciclo del ${esc(diaMes(c.desde))} al ${esc(diaMes(c.hasta))}
          </div>
        </div>
        <button class="iconbtn" data-act="edit-tarjeta" data-id="${esc(t.id)}" aria-label="Editar tarjeta" style="margin:-6px -8px 0 0">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>
        </button>
      </div>

      ${(() => {
        // Las tres cifras que la gente confunde, separadas y con nombre. Que el
        // ciclo cargue 54,000 y la deuda sea 30,000 no es un error: hubo abonos.
        const e = A.estadoTarjeta(D, t, periodo);
        if (!e) return '';
        return `
        <div class="ciclo ciclo--tres" style="margin-top:12px">
          <div class="ciclo__c">
            <div class="ciclo__l">Consumido en el ciclo</div>
            <div class="ciclo__v">${esc(money(e.consumido))}</div>
          </div>
          <div class="ciclo__op">−</div>
          <div class="ciclo__c">
            <div class="ciclo__l">Abonado en el ciclo</div>
            <div class="ciclo__v">${esc(money(e.abonado))}</div>
          </div>
          <div class="ciclo__op">=</div>
          <div class="ciclo__c">
            <div class="ciclo__l">Deuda viva hoy</div>
            <div class="ciclo__v">${esc(money(e.deuda))}</div>
          </div>
        </div>
        <div class="field__h" style="margin-top:8px">
          Consumieron <b>${esc(money(e.consumido))}</b> en el ciclo, abonaron
          <b>${esc(money(e.abonado))}</b> y deben <b>${esc(money(e.deuda))}</b>.
          ${e.pagaTotal
            ? 'Como saldan el total antes de la fecha límite, esa deuda <b>no cuesta intereses</b>: es crédito gratis.'
            : `De eso, lo que dejen revolviendo cuesta <b>${esc(money(e.interesMensual))}</b> al mes.`}
        </div>
        ${e.sinAncla ? `<div class="field__h" style="margin-top:6px;color:var(--critical)">
          Falta el saldo del estado de cuenta. Sin ese dato el cierre del mes no puede cuadrar.
        </div>` : e.anclaVieja ? `<div class="field__h" style="margin-top:6px;color:var(--critical)">
          El saldo del banco que tienen guardado es del ${esc(diaMes(e.ancla.fecha))}, anterior a
          este ciclo. Actualícenlo o el cuadre saldrá torcido.
        </div>` : ''}`;
      })()}

      <div class="ciclo">
        <div class="ciclo__c">
          <div class="ciclo__l">${c.usandoPlan ? 'Según el plan' : 'A cubrir con el corte'}</div>
          <div class="ciclo__v">${esc(money(c.aCubrir))}</div>
        </div>
        <div class="ciclo__op">−</div>
        <div class="ciclo__c">
          <div class="ciclo__l">${sinIngreso ? 'Sin pago asignado' : 'Lo paga ' + esc(c.evento)}</div>
          <div class="ciclo__v">${esc(money(c.ingresoPago))}</div>
        </div>
      </div>

      ${sinIngreso ? `
        <div class="alertas"><li class="alerta alerta--warning" style="list-style:none">
          <svg viewBox="0 0 24 24">${ICONO.warning}</svg>
          <span>No has dicho qué pago cubre esta tarjeta. Sin eso no puedo avisarte si el corte alcanza.</span>
        </li></div>`
      : c.alcanza ? `
        <div class="consejo consejo--good" style="margin-top:12px">
          <div class="consejo__t">El corte queda cubierto</div>
          <div class="consejo__c">Sobran <b>${esc(money(c.cobertura))}</b> del pago de ${esc(c.evento)} después de saldar la tarjeta.</div>
        </div>`
      : (() => {
        // Si el corte ya se saldó, gritar "no alcanza" es contradecirse con la
        // línea de abajo. Lo que quedó no es una alarma sino un dato: ese pago
        // solo no daba, y la diferencia salió de otro lado.
        const pg = A.pagoPendiente(D, t, periodo);
        const yaSaldado = pg && pg.saldado;
        return `
        <div class="consejo ${yaSaldado ? '' : 'consejo--critical'}" style="margin-top:12px">
          <div class="consejo__t">${yaSaldado
            ? `${esc(c.evento)} solo no daba para el corte`
            : 'El corte no alcanza'}</div>
          <div class="consejo__c">${esc(c.evento)} trae <b>${esc(money(c.ingresoPago))}</b> y el corte
            va en <b>${esc(money(c.aCubrir))}</b>: ese pago se queda corto por
            <b>${esc(money(Math.abs(c.cobertura)))}</b>.
            ${yaSaldado
              ? 'Ya lo saldaron, así que la diferencia salió de otro lado — de las quincenas o de lo que había en la cuenta.'
              : 'Esa diferencia sale de las quincenas o se queda revolviendo con intereses.'}</div>
        </div>`;
      })()}

      ${(() => {
        const p = A.pagoPendiente(D, t, periodo);
        if (!p || !p.pagado) return '';
        // Ojo con las dos cifras: arriba es cuánto le falta AL PAGO para cubrir el
        // corte; aquí es cuánto queda del corte por saldar. Decir "faltan" en las
        // dos hacía que pareciera que la app se contradecía.
        return `<div class="field__h" style="margin-top:10px">
          Ya pagaron <b>${esc(money(p.pagado))}</b> de este corte${p.saldado
            ? ': queda saldado.' : `; queda por pagar <b>${esc(money(p.pendiente))}</b>.`}</div>`;
      })()}

      ${c.usandoPlan ? `<div class="field__h" style="margin-top:10px">
        Todavía no hay gastos registrados en este ciclo, así que uso el plan como referencia.
        Al ir registrando movimientos, esta cifra pasa a ser la real.</div>` : ''}
    </div>`;
}

/* ---------- vistas ---------- */

function vResumen() {
  if (!D.configurado) return vBienvenida();

  const r = A.resumenMes(D, periodo);
  const gastado = gastadoMes();
  const pct = r.gastos > 0 ? Math.min(100, (gastado / r.gastos) * 100) : 0;
  const incompleto = A.planIncompleto(D, periodo);

  const flujo = [
    { l: 'Ingreso neto del mes', v: r.neto,      s: ''  },
    { l: 'Gastos corrientes',    v: r.corriente, s: '−' },
    { l: 'Fondo de salud',       v: r.salud,     s: '−' },
    { l: 'Cuotas de financiamiento', v: r.cuotas, s: '−' }
  ];

  const avisos = `
    ${r.pendientes.length ? `<div class="note note--info">
      <svg viewBox="0 0 24 24">${ICONO.warning}</svg>
      <div>${r.pendientes.length === D.plantillaIngresos.length
        ? `Aún no confirmas ningún ingreso de ${esc(mesLabel(periodo))}. Las cifras de abajo son <b>estimadas</b> con los montos típicos.`
        : `Faltan por confirmar: <b>${esc(r.pendientes.map(e => e.nombre).join(', '))}</b>. Ese monto es estimado.`}
      <button class="lnk" data-goto="presupuesto">Confirmar ahora</button></div>
    </div>` : ''}

    ${incompleto.hay ? `<div class="note">
      <svg viewBox="0 0 24 24">${ICONO.critical}</svg>
      <div><b>El plan está sin montos.</b> Hay ${esc(plural(incompleto.sinMonto, 'rubro', 'rubros'))}
      creados y ninguno tiene presupuesto, así que la cifra de arriba no es lo que les
      sobra: es el ingreso entero, sin restar nada. Llénalo con lo que gastan de verdad
      y empieza a significar algo.
      <button class="lnk" data-act="presupuesto-sugerido">Sugerir con mi histórico</button></div>
    </div>` : ''}`;

  const heroDisponible = `
    <div class="hero">
      <div class="hero__label">${incompleto.hay ? 'Ingreso sin comprometer' : 'Disponible real para metas'}</div>
      <div class="hero__val ${r.disponible < 0 ? 'is-neg' : ''}"><span class="cur">L</span>${esc(nf2.format(r.disponible))}</div>
      <div class="hero__sub">${incompleto.hay
        ? `Sin gastos presupuestados no hay nada que restar: es el ingreso completo.
           De hecho este mes ya llevan ${esc(money(gastado))} gastados.`
        : r.confirmado
        ? 'Con los ingresos ya confirmados de este mes.'
        : 'Estimado. Cambia cuando confirmes lo que realmente entró.'}</div>
    </div>`;

  // Lo ancho lleva lo que necesita anchura: el diagnóstico, el pulso, las
  // tablas del flujo y las tarjetas. El riel, las cifras de apoyo.
  const ancha = `
    ${avisos}

    ${bloqueDiagnostico()}

    ${bloquePulso()}

    <div class="sec"><span class="sec__t">Cómo se llega a esa cifra</span></div>
    <div class="card card--flush">
      ${flujo.map(f => `
        <div class="row">
          <div class="row__main"><div class="row__t" style="font-weight:500">${esc(f.l)}</div></div>
          <div class="row__v ${f.s ? 'is-muted' : ''}">${esc(f.s)}${esc(money(f.v))}</div>
        </div>`).join('')}
      <div class="total">
        <span>Disponible real</span>
        <span ${r.disponible < 0 ? 'style="color:var(--critical)"' : ''}>${esc(money(r.disponible))}</span>
      </div>
    </div>
    <div class="field__h" style="margin-top:8px">
      El pago de la tarjeta no se resta aquí: los consumos del mes ya están en los gastos.
      Restarlo otra vez contaría el mismo dinero dos veces.
    </div>

    ${(() => {
      // La de débito no tiene corte: su consumo ya salió de la cuenta.
      const credito = D.tarjetas.filter(t => (t.tipo || 'credito') === 'credito');
      return credito.length ? `<div class="sec"><span class="sec__t">Tarjetas · corte de este mes</span></div>
        ${credito.map(bloqueCiclo).join('')}` : '';
    })()}

    <div class="sec"><span class="sec__t">Gastado este mes</span>
      <button class="sec__a" data-goto="movimientos">Ver movimientos</button></div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
        <div style="font-size:22px;font-weight:750;letter-spacing:-.03em">${esc(money(gastado))}</div>
        <div style="font-size:12.5px;color:var(--muted);font-weight:550">de ${esc(money(r.gastos))} presupuestado</div>
      </div>
      <div class="bar"><div class="bar__f ${r.gastos <= 0 ? '' : gastado > r.gastos ? 'is-over' : pct >= 100 ? 'is-full' : ''}" style="width:${pct.toFixed(1)}%"></div></div>
      <div style="margin-top:8px;font-size:12.5px;color:var(--ink-2)">
        ${r.gastos <= 0
          ? `No hay presupuesto asignado en ${esc(mesLabel(periodo))}, así que no hay contra
             qué medirlo. "Pasarse" de cero no significa nada.`
          : gastado > r.gastos
          ? `Se pasaron por <b style="color:var(--critical)">${esc(money(gastado - r.gastos))}</b> en ${esc(mesLabel(periodo))}.`
          : `Quedan <b>${esc(money(r.gastos - gastado))}</b> del presupuesto de ${esc(mesLabel(periodo))}.`}
      </div>
    </div>

    ${D.plantillaIngresos.length ? `<div class="sec"><span class="sec__t">Ingreso por fecha de pago</span></div>
      <div class="card">${chartIngresos()}</div>` : ''}

    ${D.gastos.length ? `<div class="sec"><span class="sec__t">Gastos del plan</span>
      <button class="sec__a" data-goto="presupuesto">Editar</button></div>
      <div class="card">${chartGastos()}</div>` : ''}

    ${vProyectosResumen()}`;

  const rail = `
    ${bloquePatrimonio('detalle')}

    ${bloqueCuentas()}

    <div class="sec"><span class="sec__t">El mes en cifras</span></div>
    <div class="tiles">
      <div class="tile">
        <div class="tile__l">Ingreso neto</div>
        <div class="tile__v">${esc(money(r.neto))}</div>
        <div class="tile__d">de ${esc(money(r.bruto))} bruto</div>
      </div>
      <div class="tile">
        <div class="tile__l">Retenciones</div>
        <div class="tile__v">${esc(money(r.deducciones))}</div>
        <div class="tile__d">${esc(nf0.format(r.bruto ? r.deducciones / r.bruto * 100 : 0))}% del bruto</div>
      </div>
      <div class="tile">
        <div class="tile__l">Fondo de salud</div>
        <div class="tile__v">${esc(money(r.salud))}</div>
        <div class="tile__d">${esc(nf0.format(r.neto ? r.salud / r.neto * 100 : 0))}% del ingreso</div>
      </div>
      <div class="tile">
        <div class="tile__l">Por financiar</div>
        <div class="tile__v">${esc(money(r.deudaFinanciada))}</div>
        <div class="tile__d">${r.financiados ? esc(plural(r.financiados, 'financiamiento activo', 'financiamientos activos')) : 'ninguno activo'}</div>
      </div>
    </div>

    ${D.personas.length > 1 ? `<div class="sec"><span class="sec__t">Aporte de cada uno</span></div>
    <div class="card card--flush">
      ${D.personas.map((p, j) => `
        <div class="row">
          <span class="dot" style="background:var(--serie-${j % 2})"></span>
          <div class="row__main">
            <div class="row__t">${esc(p.nombre)}</div>
            <div class="row__s">${esc(nf0.format(r.neto ? r.porPersona[p.id] / r.neto * 100 : 0))}% del ingreso del hogar</div>
          </div>
          <div class="row__v">${esc(money(r.porPersona[p.id]))}</div>
        </div>`).join('')}
      <div class="total"><span>Total</span><span>${esc(money(r.neto))}</span></div>
    </div>` : ''}`;

  return tablero(heroDisponible + bloquePatrimonio('hero'), ancha, rail);
}

function vBienvenida() {
  const f = A.faltantes(D);
  return `
    <div class="bienvenida">
      <div class="bienvenida__ico">
        <svg viewBox="0 0 24 24"><path d="M4 19V10M9.3 19V5M14.7 19v-6M20 19v-9"/></svg>
      </div>
      <h2 class="bienvenida__t">Empecemos de cero</h2>
      <p class="bienvenida__s">Esta herramienta no trae datos de ejemplo: todo lo que veas
        va a ser lo que ustedes registren. Vamos a armar la base del presupuesto paso a paso.</p>

      <ul class="pasos">
        <li><span>1</span> Quiénes usan la app</li>
        <li><span>2</span> Los pagos que reciben cada mes</li>
        <li><span>3</span> Los gastos del hogar</li>
        <li><span>4</span> Tarjetas y financiamientos</li>
      </ul>

      <button class="btn" data-act="asistente">Configurar ahora</button>
      <div class="field__h" style="text-align:center;margin-top:14px">
        Toma unos minutos. Todo se puede cambiar después.
      </div>
    </div>`;
}

function vProyectosResumen() {
  if (!D.proyectos.length) return '';
  const cartera = A.evaluarCartera(D, periodo);
  return `
    <div class="sec"><span class="sec__t">Proyectos</span>
      <button class="sec__a" data-goto="proyectos">Ver todos</button></div>
    ${D.proyectos.slice(0, 3).map(p => {
      const ev = cartera[p.id];
      const pct = ev.max > 0 ? Math.min(100, ev.junta / ev.max * 100) : 0;
      return `
      <button class="card card--tap" data-goto="proyectos">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div style="font-size:15px;font-weight:650;letter-spacing:-.015em">${esc(p.nombre)}</div>
          ${badge(ev.veredicto)}
        </div>
        <div class="bar"><div class="bar__f ${pct >= 100 ? 'is-full' : ''}" style="width:${pct.toFixed(1)}%"></div></div>
        <div style="margin-top:9px;font-size:12.5px;color:var(--ink-2);text-align:left">
          ${ev.faltaMax > 0
            ? `Faltan <b>${esc(money(ev.faltaMax))}</b>${ev.disponible > 0 ? ` · ${esc(enMeses(ev.mesesSugerido))} al ritmo sugerido` : ''}`
            : '<b>Meta alcanzada</b>'}
        </div>
      </button>`;
    }).join('')}
  `;
}

function vPresupuesto() {
  if (!D.configurado) return vBienvenida();
  const r = A.resumenMes(D, periodo);

  // El riel lleva quiénes son y dónde vive el dinero; lo ancho, el plan del mes.
  const rail = `
    <div class="sec" style="margin-top:14px"><span class="sec__t">Cuentas de banco</span>
      <button class="sec__a" data-act="add-cuenta">Añadir</button></div>
    ${!D.cuentas.length
      ? vacio('Sin cuentas', 'Registra dónde les depositan, para ver cuánto tienen de verdad.', 'add-cuenta', 'Añadir cuenta')
      : `<div class="card card--flush">
        ${A.saldosCuentas(D, periodo).filas.map(f => `
          <button class="row" data-act="edit-cuenta" data-id="${esc(f.id)}">
            <div class="row__main">
              <div class="row__t">${esc(f.nombre)}</div>
              <div class="row__s">${f.personas.length
                ? esc(f.personas.map(pid => persona(pid).nombre).join(' y ')) + ' depositan aquí'
                : '<span style="color:var(--critical)">sin dueño: aquí no le cae el pago a nadie</span>'}</div>
            </div>
            <div class="row__v ${f.saldo < 0 ? 'is-neg' : ''}">${esc(money(f.saldo))}</div>
            <svg class="row__chev" viewBox="0 0 24 24">${ICONO.chev}</svg>
          </button>`).join('')}
      </div>`}

    <div class="sec"><span class="sec__t">Personas</span>
      <button class="sec__a" data-act="add-persona">Añadir</button></div>
    ${!D.personas.length
      ? vacio('Sin personas', 'Los nombres aparecen en cada ingreso, gasto y aporte.', 'add-persona', 'Añadir persona')
      : `<div class="card card--flush">
        ${D.personas.map((p, j) => `
          <button class="row" data-act="edit-persona" data-id="${esc(p.id)}">
            <span class="dot" style="background:var(--serie-${j % 2})"></span>
            <div class="row__main">
              <div class="row__t">${esc(p.nombre)}</div>
              <div class="row__s">${esc(money(r.porPersona[p.id] || 0))} de ingreso este mes</div>
            </div>
            <svg class="row__chev" viewBox="0 0 24 24">${ICONO.chev}</svg>
          </button>`).join('')}
      </div>`}

`;

  const ancha = `    <div class="sec"><span class="sec__t">Ingresos · ${esc(mesLabel(periodo))}</span>
      <button class="sec__a" data-act="add-evento">Añadir pago</button></div>

    ${!D.plantillaIngresos.length
      ? vacio('Sin pagos definidos', 'Registra los pagos que reciben cada mes.', 'add-evento', 'Añadir pago')
      : D.plantillaIngresos.map(ev => {
        const conf = A.eventoConfirmado(D, ev.id, periodo);
        const total = D.personas.reduce((s, p) => s + A.netoLinea(A.lineaDe(D, ev, p.id, periodo)), 0);
        return `
        <div class="card card--flush">
          <div class="total" style="background:transparent;border-bottom:1px solid var(--border-2)">
            <span>${esc(ev.nombre)}
              <span style="font-weight:500;color:var(--muted);font-size:12.5px">· día ${esc(String(ev.dia))}</span>
              ${(() => {
                const cop = ((D.ingresosMes[periodo] || {}).copiado || {})[ev.id];
                if (cop) return `<span class="tag tag--up">copiado de ${esc(mesCorto(cop))}, sin revisar</span>`;
                return conf ? '<span class="tag tag--ok">confirmado</span>'
                            : '<span class="tag tag--up">estimado</span>';
              })()}
            </span>
            <span>${esc(money(total))}</span>
          </div>
          ${D.personas.map((p, j) => {
            const l = A.lineaDe(D, ev, p.id, periodo);
            if (!l) return '';
            return `
            <div class="row">
              <span class="dot" style="background:var(--serie-${j % 2})"></span>
              <div class="row__main">
                <div class="row__t">${esc(p.nombre)}</div>
                <div class="row__s">${esc(money(l.bruto))} bruto − ${esc(money(A.dedTotal(l)))} en ${esc(String((l.deducciones || []).length))} retenciones</div>
              </div>
              <div class="row__v">${esc(money(A.netoLinea(l)))}</div>
            </div>`;
          }).join('')}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border-2)">
            <button class="subbtn" data-act="confirmar-evento" data-ev="${esc(ev.id)}">
              ${conf ? 'Editar lo recibido' : 'Confirmar lo recibido'}
            </button>
            <button class="subbtn" data-act="edit-evento" data-ev="${esc(ev.id)}">Editar el pago fijo</button>
          </div>
        </div>`;
      }).join('')}

    ${D.plantillaIngresos.length ? `<div class="card" style="padding:14px 16px">
      <div style="display:flex;justify-content:space-between;font-weight:700;letter-spacing:-.015em">
        <span>Ingreso neto del mes</span><span style="font-variant-numeric:tabular-nums">${esc(money(r.neto))}</span>
      </div>
    </div>` : ''}

    ${(() => {
      // Atajo para el caso normal: el mes vino igual que el anterior. Solo
      // aparece si de verdad hay de dónde copiar y algo sin confirmar.
      const copiables = r.pendientes.filter(ev => A.mesConfirmadoPrevio(D, ev.id, periodo));
      if (!copiables.length) return '';
      const desde = A.mesConfirmadoPrevio(D, copiables[0].id, periodo);
      const total = copiables.reduce((s, ev) => s + D.personas.reduce((t, p) => {
        const f = A.lineaParaConfirmar(D, ev, p.id, periodo);
        return t + (f.origen === 'copia' ? A.netoLinea(f.linea) : 0);
      }, 0), 0);
      return `<button class="btn btn--ghost" data-act="copiar-ingresos" data-k="${esc(desde)}" style="margin-top:10px">
        Confirmar ${esc(plural(copiables.length, 'pago', 'pagos'))} igual que ${esc(mesLabel(desde))}
      </button>
      <div class="field__h" style="margin-top:8px">
        Copia ${esc(money(total))} de ${esc(mesLabel(desde))} y los da por confirmados. Úsalo solo
        si el mes vino igual — después se puede corregir pago por pago.
      </div>`;
    })()}

    ${A.mesCerrado(D, periodo) ? `
      <div class="note note--info" style="margin-top:14px">
        <svg viewBox="0 0 24 24">${ICONO.good}</svg>
        <div><b>${esc(mesLabel(periodo))} está cerrado.</b> Su presupuesto quedó fijo:
        lo que edites abajo rige de aquí en adelante, no cambia este mes.
        <button class="lnk" data-act="cerrar-mes" data-k="${esc(periodo)}">Ver el cierre</button></div>
      </div>` : A.mesCongelado(D, periodo) ? `
      <div class="note" style="margin-top:14px">
        <svg viewBox="0 0 24 24">${ICONO.warning}</svg>
        <div><b>${esc(mesLabel(periodo))} ya terminó</b> y su presupuesto está congelado,
        pero falta cerrarlo y justificar los excesos.
        <button class="lnk" data-act="cerrar-mes" data-k="${esc(periodo)}">Cerrar el mes</button></div>
      </div>` : ''}

    <div class="sec"><span class="sec__t">Gastos</span>
      <button class="sec__a" data-act="presupuesto-sugerido">Sugerir con mi histórico</button></div>
    ${!D.gastos.length
      ? vacio('Sin gastos registrados', 'Comida, servicios, transporte: lo que se va cada mes.', 'add-gasto', 'Añadir gasto')
      : `<div class="card card--flush">
        ${D.gastos.map(g => `
          <button class="row" data-act="edit-gasto" data-id="${esc(g.id)}">
            <div class="row__main">
              <div class="row__t">${esc(g.concepto)}${(+g.crecimiento) ? `<span class="tag tag--up">+${esc(String(g.crecimiento))}%/mes</span>` : ''}</div>
              <div class="row__s">${esc(g.categoria || 'Otros')} · ${g.medioPago === 'efectivo' ? 'efectivo' : 'tarjeta'}${!(+g.monto) ? ' · sin monto' : ''}</div>
            </div>
            <div class="row__v">${esc(money(g.monto))}</div>
            <svg class="row__chev" viewBox="0 0 24 24">${ICONO.chev}</svg>
          </button>`).join('')}
        <div class="total"><span>Total gastos</span><span>${esc(money(
          D.gastos.reduce((s, g) => s + (+g.monto || 0), 0)))}</span></div>
      </div>`}
      ${A.mesCongelado(D, periodo) ? `<div class="field__h" style="margin-top:8px">
        Esta lista es el plan de aquí en adelante. ${esc(mesLabel(periodo))} ya quedó
        congelado en ${esc(money(r.gastos))}, y esa es la cifra contra la que se mide.</div>` : ''}
    <button class="btn btn--ghost" data-act="add-gasto" style="margin-top:10px">
      <svg viewBox="0 0 24 24">${ICONO.mas}</svg> Añadir gasto</button>

    <div class="sec"><span class="sec__t">Tarjetas</span>
      <button class="sec__a" data-act="add-tarjeta">Añadir tarjeta</button></div>
    ${!D.tarjetas.length
      ? vacio('Sin tarjetas', 'Si pagan los gastos con tarjeta, regístrala para vigilar el corte.', 'add-tarjeta', 'Añadir tarjeta')
      : `<div class="card card--flush">
        ${D.tarjetas.map(t => {
          const ev = eventoDe(t.pagaCon);
          return `
          <button class="row" data-act="edit-tarjeta" data-id="${esc(t.id)}">
            <div class="row__main">
              <div class="row__t">${esc(t.nombre)}</div>
              <div class="row__s">${(t.tipo || 'credito') === 'debito'
                ? 'De débito' + (t.cuentaId ? ' · ' + esc((D.cuentas.find(c => c.id === t.cuentaId) || {}).nombre || '') : '')
                : 'Corta el ' + esc(String(t.diaCorte)) + ' · ' + (ev ? 'la paga ' + esc(ev.nombre) : '<span style="color:var(--critical)">sin pago asignado</span>')}</div>
            </div>
            <svg class="row__chev" viewBox="0 0 24 24">${ICONO.chev}</svg>
          </button>`;
        }).join('')}
      </div>`}

    <div class="sec"><span class="sec__t">Financiamientos</span>
      <button class="sec__a" data-act="add-fin">Añadir</button></div>
    ${!D.financiamientos.length
      ? vacio('Sin financiamientos', 'Compras a cuotas, extrafinanciamiento o préstamos con cuota fija.', 'add-fin', 'Añadir financiamiento')
      : `<div class="card card--flush">
        ${D.financiamientos.map(f => {
          const rest = A.cuotasRestantes(f);
          return `
          <button class="row" data-act="edit-fin" data-id="${esc(f.id)}">
            <div class="row__main">
              <div class="row__t">${esc(f.nombre)}${rest === 0 ? '<span class="tag tag--ok">liquidado</span>' : ''}</div>
              <div class="row__s">${esc(money(f.cuotaMensual))} al mes · ${rest > 0 ? esc(plural(rest, 'cuota restante', 'cuotas restantes')) : 'sin cuotas pendientes'}</div>
            </div>
            <div class="row__v">${esc(money(A.saldoFinanciamiento(f)))}</div>
            <svg class="row__chev" viewBox="0 0 24 24">${ICONO.chev}</svg>
          </button>`;
        }).join('')}
        <div class="total"><span>Cuota mensual total</span><span>${esc(money(r.cuotas))}</span></div>
      </div>`}

    <div class="card" style="padding:14px 16px;${r.disponible < 0 ? 'background:color-mix(in srgb, var(--critical) 10%, var(--surface))' : ''}">
      <div style="display:flex;justify-content:space-between;font-weight:700;letter-spacing:-.015em">
        <span>Disponible real</span>
        <span style="font-variant-numeric:tabular-nums;${r.disponible < 0 ? 'color:var(--critical)' : ''}">${esc(money(r.disponible))}</span>
      </div>
    </div>

    <div class="sec"><span class="sec__t">Informes</span></div>
    <button class="btn" data-act="analisis" style="margin-top:12px">
      <svg viewBox="0 0 24 24"><path d="M6 3.5h8l4.5 4.5v12.5H6z"/><path d="M14 3.5V8h4.5"/><path d="M9.5 16.5v-3M12 16.5v-5M14.5 16.5v-2"/></svg>
      Análisis de ${esc(mesLabel(periodo))}
    </button>
    <div class="field__h" style="margin-top:8px">
      Un documento con el resumen, el plan contra lo real, las tarjetas, los proyectos
      con sus plazos y la proyección a 12 meses. Se abre en cualquier navegador; para
      tenerlo en PDF, ábrelo e imprime.
    </div>

    <div class="sec"><span class="sec__t">Datos</span></div>
    <button class="btn" data-act="importar-estados" style="margin-top:12px">
      <svg viewBox="0 0 24 24"><path d="M12 14.5v-11M12 3.5l-4 4M12 3.5l4 4M4.5 16v3.5h15V16"/></svg>
      Importar estados de cuenta
    </button>
    <div class="field__h" style="margin-top:8px">
      Suelta los PDF o CSV de todos los bancos de una vez. Cada uno se enruta solo por
      su número de cuenta, se verifica contra el saldo del banco y se revisa antes de guardar.
      Puedes subirlos cada semana: lo repetido se reemplaza, no se duplica.
    </div>
    <button class="btn btn--ghost" data-act="exportar" style="margin-top:14px">
      <svg viewBox="0 0 24 24"><path d="M12 3.5v11M12 14.5l-4-4M12 14.5l4-4M4.5 16v3.5h15V16"/></svg>
      Exportar respaldo
    </button>
    <button class="btn btn--danger" data-act="reiniciar" style="margin-top:8px">Borrar todo y empezar de nuevo</button>`;

  return tablero(null, ancha, rail);
}

function vProyectos() {
  if (!D.configurado) return vBienvenida();
  if (!D.proyectos.length) return vacio('Sin proyectos todavía',
    'Una compra grande, un viaje, un fondo de emergencia.', 'add-proyecto', 'Crear el primero');

  const pri = A.priorizar(D, periodo);

  return tablero(null, `
    <div class="sec" style="margin-top:14px"><span class="sec__t">Metas de compra</span>
      <button class="sec__a" data-act="add-proyecto">Nuevo</button></div>
    ${pri.filas.length > 1 ? `<div class="field__h" style="margin-top:8px">
      Ordenadas por <b>mérito</b>, no por antigüedad: salud y seguridad van primero, y el
      disponible se reparte en ese orden. ${pri.colchonFlaco
        ? 'Con el colchón por debajo de un mes, los gustos quedan pospuestos.' : ''}</div>` : ''}

    ${pri.filas.map((fila, i) => {
      const p = fila.p;
      const ev = fila.ev;
      ev.veredicto = fila.veredicto;
      const pct = ev.max > 0 ? Math.min(100, ev.junta / ev.max * 100) : 0;
      const rango = ev.max > ev.min;

      const consejo = ev.faltaMax <= 0 ? `
        <div class="consejo consejo--good">
          <div class="consejo__t">Meta alcanzada</div>
          <div class="consejo__c">Ya reunieron lo necesario; sobran ${esc(money(ev.junta - ev.max))}.</div>
        </div>`
      : ev.disponible <= 0 ? `
        <div class="consejo consejo--critical">
          <div class="consejo__t">Sin margen para avanzar</div>
          <div class="consejo__c">El disponible real es ${esc(money(ev.disponible))}. Hay que liberar flujo
            —bajar gastos o terminar un financiamiento— antes de comprometer nada aquí.</div>
        </div>`
      : ev.sinMargen ? `
        <div class="consejo consejo--critical">
          <div class="consejo__t">En espera</div>
          <div class="consejo__c">Los proyectos de arriba ya reservan todo el margen seguro del mes.
            Este arranca cuando alguno termine. Destinando todo el disponible sin colchón,
            tomaría <b>${esc(enMeses(ev.mesesMax))}</b>.</div>
        </div>`
      : `
        <div class="consejo">
          <div class="consejo__t">Recomendación</div>
          <div class="consejo__c">
            Apartando <b>${esc(money(ev.cuotaSugerida))}</b> al mes
            (<b>${esc(money(ev.quincenal))}</b> por quincena)
            alcanzan ${rango ? 'el costo máximo' : 'la meta'} en <b>${esc(enMeses(ev.mesesSugerido))}</b>.${
            rango && ev.mesesMin !== ev.mesesMax
              ? ` Si la cotización sale en el extremo bajo, bastan <b>${esc(enMeses(ev.mesesMin))}</b> destinando todo el disponible.`
              : ''}${
            ev.cuotaObjetivo != null
              ? `<br><br>Para llegar a la fecha objetivo harían falta <b>${esc(money(ev.cuotaObjetivo))}</b> al mes durante ${esc(enMeses(ev.mesesObjetivo))}.`
              : ''}
          </div>
          <div class="consejo__m">Compromete el ${esc(nf0.format(Math.min(999, ev.carga * 100)))}% del disponible real de ${esc(money(ev.disponible))}.</div>
        </div>`;

      return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
          <div style="min-width:0;flex:1">
            <div style="font-size:16px;font-weight:680;letter-spacing:-.02em">${esc(p.nombre)}</div>
            <div style="font-size:12.5px;color:var(--muted);margin-top:2px">
              ${rango ? `${esc(money(ev.min))} – ${esc(money(ev.max))}` : esc(money(ev.max))}${p.nota ? ' · ' + esc(p.nota) : ''}
            </div>
          </div>
          <div style="display:flex;gap:2px;margin:-6px -8px 0 0">
            <button class="iconbtn" data-act="edit-proyecto" data-id="${esc(p.id)}" aria-label="Editar proyecto">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>
            </button>
          </div>
        </div>

        <div style="margin-top:12px">${badge(ev.veredicto)}
          <span class="tag">${esc(A.TIPOS_PROYECTO[fila.tipo].etiqueta)}</span>
          <span class="tag">${esc(A.ETIQUETA_URGENCIA[fila.urgencia])}</span>
          ${pri.filas.length > 1 ? `<span class="tag">#${esc(String(i + 1))} por mérito</span>` : ''}
        </div>
        ${fila.porque.length ? `<div class="field__h" style="margin-top:8px">
          ${esc(cap(fila.porque[0]))}${fila.porque.length > 1 ? '; ' + esc(fila.porque.slice(1).join('; ')) : ''}.</div>` : ''}
        ${p.consecuencia ? `<div class="field__h" style="margin-top:6px">
          Si no se hace: ${esc(p.consecuencia)}</div>` : ''}

        <div class="bar" style="height:10px;margin-top:12px"><div class="bar__f ${pct >= 100 ? 'is-full' : ''}" style="width:${pct.toFixed(1)}%"></div></div>
        <div style="display:flex;justify-content:space-between;margin-top:9px;font-size:13px">
          <span style="color:var(--ink-2)">${esc(money(ev.junta))} acumulado</span>
          <span style="color:var(--muted)">${esc(nf0.format(pct))}% del ${rango ? 'máximo' : 'total'}</span>
        </div>

        ${consejo}
        ${ev.alertas.length ? `<ul class="alertas">${ev.alertas.map(alerta).join('')}</ul>` : ''}
        ${chartProyeccion(ev)}

        ${(p.aportes || []).length ? `
        <div class="card card--flush" style="margin-top:14px">
          ${p.aportes.map(ap => `
            <button class="row" data-act="edit-aporte" data-id="${esc(p.id)}" data-ap="${esc(ap.id)}">
              <div class="row__main">
                <div class="row__t">${esc(persona(ap.personaId).nombre)}</div>
                <div class="row__s">${esc(ap.fecha || '')}${ap.nota ? ' · ' + esc(ap.nota) : ''}</div>
              </div>
              <div class="row__v">${esc(money(ap.monto))}</div>
              <svg class="row__chev" viewBox="0 0 24 24">${ICONO.chev}</svg>
            </button>`).join('')}
          <div class="total"><span>Aportado</span><span>${esc(money(ev.junta))}</span></div>
        </div>` : ''}

        <button class="btn btn--ghost" data-act="add-aporte" data-id="${esc(p.id)}" style="margin-top:12px">
          <svg viewBox="0 0 24 24">${ICONO.mas}</svg> Registrar aporte
        </button>
      </div>`;
    }).join('')}
  `, null);
}

function vMovimientos() {
  if (!D.configurado) return vBienvenida();

  const r = A.resumenMes(D, periodo);
  const rp = realPorGasto();
  const gastado = gastadoMes();
  const hayRegistro = registroDelMes().length > 0;

  // El plan del MES, no la plantilla de hoy. En un mes ya congelado son cosas
  // distintas: bajar hoy el rubro de comida no puede reescribir hacia atrás
  // contra qué se midió agosto. El total de abajo ya venía del mes congelado,
  // así que fila por fila se comparaba contra otro número y la suma no cuadraba.
  const planMes = A.gastosMes(D, 0, periodo).detalle;
  const filas = planMes.filter(g => g.monto > 0 || rp[g.id]);

  const ef = A.efectivo(D, periodo);

  return tablero(null, `
    ${window.Facturas && Facturas.soportado ? `
      <button class="btn btn--escanear" data-act="escanear" ${!D.gastos.length ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24"><path d="M4 8.5V6a2 2 0 012-2h2.5M15.5 4H18a2 2 0 012 2v2.5M20 15.5V18a2 2 0 01-2 2h-2.5M8.5 20H6a2 2 0 01-2-2v-2.5"/><circle cx="12" cy="12" r="3"/></svg>
        Escanear factura
      </button>` : ''}

    <div class="dosbtn">
      <button class="btn btn--ghost" data-act="add-mov" ${!D.gastos.length ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24">${ICONO.mas}</svg> Gasto
      </button>
      <button class="btn btn--ghost" data-act="add-retiro">
        <svg viewBox="0 0 24 24"><path d="M4.5 7.5h15v11h-15zM4.5 11h15"/><circle cx="8" cy="15" r="1.2"/></svg> Retiro
      </button>
    </div>
    ${D.cuentas.length && D.tarjetas.some(t => (t.tipo || 'credito') === 'credito') ? `
      <button class="btn btn--ghost" data-act="add-pago-tarjeta" style="margin-top:10px">
        <svg viewBox="0 0 24 24"><path d="M4.5 7.5h15v11h-15zM4.5 11h15"/><path d="M12 20.5l3-3M12 20.5l-3-3"/></svg>
        Pagar tarjeta
      </button>` : ''}

    ${colaFacturas.length ? `
    <div class="card" style="margin-top:12px">
      <div style="display:flex;gap:10px;align-items:center">
        <div class="row__main">
          <div class="row__t">${esc(plural(colaFacturas.length, 'factura sin leer', 'facturas sin leer'))}</div>
          <div class="row__s">${!Facturas.configurado()
            ? 'Se leerán cuando conectes la nube'
            : navigator.onLine ? 'Toca para reintentar' : 'Sin señal ahora mismo'}</div>
        </div>
        ${Facturas.configurado() && navigator.onLine
          ? '<button class="lnk" data-act="reintentar-facturas">Reintentar</button>' : ''}
      </div>
      <div class="miniaturas">
        ${colaFacturas.slice(0, 6).map(f => `
          <img class="miniatura" src="${esc(f.dataUrl)}" alt="Factura pendiente">`).join('')}
      </div>
    </div>` : ''}
    ${!D.gastos.length ? '<div class="field__h" style="margin-top:8px">Primero define los gastos del plan en Presupuesto.</div>' : ''}

    ${ef.hayDatos ? bloqueEfectivo(ef) : ''}

    ${filas.length ? `
    <div class="sec"><span class="sec__t">Plan contra realidad · ${esc(mesLabel(periodo))}</span></div>
    <div class="card card--flush">
      ${filas.map(g => {
        const real = rp[g.id] || 0, plan = g.monto;
        // Sin presupuesto la barra se queda vacía. Antes se pintaba al 100% y en
        // verde, que se lee como "justo en el plan" cuando no hay plan ninguno.
        const pct = plan > 0 ? Math.min(100, real / plan * 100) : 0;
        const over = plan > 0 && real > plan;
        return `
        <div class="row" style="display:block">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
            <span class="row__t">${esc(g.concepto)}</span>
            <span class="row__v ${over ? 'is-neg' : ''}">${esc(money(real))}</span>
          </div>
          <div class="bar" style="height:6px;margin-top:8px"><div class="bar__f ${over ? 'is-over' : pct >= 100 ? 'is-full' : ''}" style="width:${pct.toFixed(1)}%"></div></div>
          <div style="margin-top:5px;font-size:11.5px;color:var(--muted)">
            ${plan > 0 ? `de ${esc(money(plan))} · ${over ? `<span style="color:var(--critical);font-weight:600">${esc(money(real - plan))} por encima</span>` : `quedan ${esc(money(plan - real))}`}` : 'sin presupuesto asignado'}
          </div>
        </div>`;
      }).join('')}
      ${rp['otros'] ? `<div class="row"><div class="row__main"><div class="row__t">Otros</div>
        <div class="row__s">fuera del plan</div></div><div class="row__v">${esc(money(rp['otros']))}</div></div>` : ''}
      <div class="total"><span>Total gastado</span><span ${r.gastos > 0 && gastado > r.gastos ? 'style="color:var(--critical)"' : ''}>${esc(money(gastado))}</span></div>
    </div>
    ${r.gastos <= 0 ? `<div class="field__h" style="margin-top:8px">
      Ninguno de estos rubros tiene presupuesto, así que no hay barra que llenar.
      <button class="lnk" data-act="presupuesto-sugerido">Ponerles monto con mi histórico</button>
    </div>` : ''}` : ''}

    ${bloqueCategorias()}

    <div class="sec"><span class="sec__t">Registro</span>
      ${D.movimientos.some(m => m.origen === 'import') ? '<button class="sec__a" data-act="clasificar-comercios">Clasificar comercios</button>' : ''}</div>
    ${hayRegistro ? bloqueBuscador() : ''}
    <div id="regLista">${listaRegistro()}</div>
  `, null);
}

/* ---------- historia ---------- */

function chartHistoria(h) {
  const filas = h.filas;
  if (filas.length < 2) return '';

  const W = 320, H = 178, padL = 6, padR = 6, padT = 30, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = Math.max(...filas.flatMap(f => [f.ingreso, f.gastado]), 1);

  const gw = plotW / filas.length;
  const bw = Math.min(18, (gw - 10) / 2);
  let marks = '', ticks = '';

  filas.forEach((f, i) => {
    const cx = padL + gw * i + gw / 2;
    [['ingreso', f.ingreso, 'var(--serie-0)'], ['gastado', f.gastado, 'var(--serie-1)']]
      .forEach(([etq, v, color], j) => {
        const alto = Math.max(2, (v / max) * plotH);
        const x = cx - bw - 1 + j * (bw + 2);
        marks += `<rect class="c-bar" x="${x.toFixed(1)}" y="${(padT + plotH - alto).toFixed(1)}" width="${bw.toFixed(1)}" height="${alto.toFixed(1)}" fill="${color}"/>`;
        marks += `<rect class="c-hit" x="${(x - 2).toFixed(1)}" y="${padT}" width="${(bw + 4).toFixed(1)}" height="${plotH}"
                   data-tip="${esc(mesLabel(f.per))} · ${etq}|${esc(money(v))}"/>`;
      });
    ticks += `<text class="c-tick" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(mesCorto(f.per))}</text>`;
    // El color va en `style` y no en `fill`: la regla .c-val del CSS gana al atributo.
    // El mes en curso se marca en gris para que no se lea como resultado cerrado.
    const tono = f.quedo < 0 ? 'var(--critical)' : f.enCurso ? 'var(--muted)' : '';
    ticks += `<text class="c-val" x="${cx.toFixed(1)}" y="16" text-anchor="middle"
               ${tono ? `style="fill:${tono}"` : ''}>${esc(moneyC(f.quedo))}</text>`;
  });

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="Ingreso y gasto real de cada mes, con lo que quedó encima">
    <line class="c-axis" x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}"/>
    ${marks}${ticks}
  </svg>
  <div class="legend">
    <span class="legend__i"><span class="legend__s" style="background:var(--serie-0)"></span>Ingreso neto</span>
    <span class="legend__i"><span class="legend__s" style="background:var(--serie-1)"></span>Gastado</span>
  </div>`;
}

function vHistoria() {
  if (!D.configurado) return vBienvenida();

  // El mes del hogar, no el del calendario: con un ciclo que arranca el 7, el
  // 3 de agosto se sigue viviendo julio. Con mesKey() la historia daba julio
  // por cerrado —y lo metía en el promedio a media carrera— mientras marcaba
  // agosto "en curso" sin haber empezado.
  const h = A.historia(D, mesHoy(), 12);
  if (!h.meses) return vacio('Todavía no hay historia',
    'En cuanto confirmen un ingreso o anoten un gasto, este mes empieza a contar.',
    'add-mov', 'Registrar un gasto');

  const positivo = h.promedio >= 0;

  return tablero(null, `
    ${h.mesesCerrados ? `
    <div class="hero" style="margin-top:14px">
      <div class="hero__label">${h.mesesCerrados === 1 ? 'El mes pasado les quedó' : 'Les queda al mes, en promedio'}</div>
      <div class="hero__val ${positivo ? '' : 'is-neg'}"><span class="cur">L</span>${esc(nf2.format(h.promedio))}</div>
      <div class="hero__sub">${h.mesesCerrados === 1
        ? 'Con un mes cerrado todavía no hay tendencia. A partir del segundo empieza a verse.'
        : `Sobre ${esc(plural(h.mesesCerrados, 'mes cerrado', 'meses cerrados'))}. En total llevan
           <b>${esc(money(h.total))}</b> ${positivo ? 'por encima de lo gastado' : 'de más gastado'}.`}${
        // Sin esta advertencia, una cifra sacada del monto TÍPICO se lee como un
        // hecho: el gasto es real, pero el ingreso contra el que se resta no.
        (() => {
          const est = h.filas.filter(f => !f.enCurso && !f.confirmado).length;
          return est ? ` El ingreso de ${est === 1 ? 'ese mes' : 'esos meses'} no está
            confirmado, así que esta cifra usa el monto típico: el gasto es real, el ingreso no.` : '';
        })()}</div>
    </div>`
    : `<div class="note note--info" style="margin-top:14px">
        <svg viewBox="0 0 24 24">${ICONO.warning}</svg>
        <div>Todavía no hay ningún mes cerrado. Cuando termine ${esc(mesLabel(periodo))}
        empiezo a comparar y a sacar el promedio.</div>
      </div>`}

    ${h.filas.length > 1 ? `<div class="sec"><span class="sec__t">Mes a mes</span></div>
      <div class="card">${chartHistoria(h)}</div>` : ''}

    ${h.mejor && h.peor ? `
    <div class="tiles">
      <div class="tile">
        <div class="tile__l">Mejor mes</div>
        <div class="tile__v">${esc(moneyC(h.mejor.quedo))}</div>
        <div class="tile__d">${esc(mesLabel(h.mejor.per))}</div>
      </div>
      <div class="tile">
        <div class="tile__l">Mes más apretado</div>
        <div class="tile__v">${esc(moneyC(h.peor.quedo))}</div>
        <div class="tile__d">${esc(mesLabel(h.peor.per))}</div>
      </div>
    </div>` : ''}

    <div class="sec"><span class="sec__t">Cada mes</span></div>
    <div class="card card--flush">
      ${h.filas.slice().reverse().map(f => `
        <button class="row" data-act="ver-mes" data-k="${esc(f.per)}">
          <div class="row__main">
            <div class="row__t">${esc(mesLabel(f.per))}${f.enCurso
              ? '<span class="tag">en curso</span>' : ''}${f.confirmado
              ? '' : '<span class="tag tag--up">estimado</span>'}</div>
            <div class="row__s">${esc(money(f.ingreso))} ${f.confirmado ? 'entró' : 'estimado'} · ${esc(money(f.gastado))} gastado
              ${f.movimientos ? '· ' + esc(plural(f.movimientos, 'registro', 'registros')) : ''}</div>
          </div>
          <div class="row__v ${f.quedo < 0 ? 'is-neg' : ''}">${esc(money(f.quedo))}</div>
          <svg class="row__chev" viewBox="0 0 24 24">${ICONO.chev}</svg>
        </button>`).join('')}
    </div>
    <div class="field__h" style="margin-top:8px">
      Toca un mes para verlo completo. Solo aparecen los meses con algo registrado:
      lo que no se anotó no se inventa.
    </div>`, null);
}

/* ---------- registro: búsqueda y filtros ---------- */

/** Todo lo anotado en el periodo, gastos y retiros juntos, del más nuevo al más viejo. */
function registroDelMes() {
  return []
    .concat(delMes(D.movimientos))
    .concat(delMes(D.retiros).map(r => Object.assign({ esRetiro: true }, r)))
    .concat(delMes(D.pagosTarjeta).map(x => Object.assign({ esPago: true }, x)))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}

/**
 * El texto se busca contra todo lo que la persona recuerda de un gasto: en qué
 * fue, de qué rubro, quién pagó y la fecha. Sin acentos ni mayúsculas, porque
 * nadie escribe "Alimentación" con tilde cuando anda buscando algo rápido.
 */
const sinTildes = s => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function filtrarRegistro(lista) {
  const q = sinTildes(filtroMov.texto).trim();
  return lista.filter(x => {
    if (filtroMov.medio) {
      const medio = x.esRetiro ? 'efectivo' : (x.medioPago || 'tarjeta');
      if (medio !== filtroMov.medio) return false;
    }
    if (filtroMov.personaId && x.personaId !== filtroMov.personaId) return false;
    if (!q) return true;
    const g = x.esRetiro ? null : gastoDe(x.gastoId);
    const heno = sinTildes([
      x.concepto, x.nota, x.fecha,
      x.esRetiro ? 'retiro efectivo' : '',
      g ? g.concepto : '', g ? g.categoria : '',
      persona(x.personaId).nombre
    ].filter(Boolean).join(' '));
    return q.split(/\s+/).every(p => heno.includes(p));
  });
}

const hayFiltro = () => Boolean(filtroMov.texto.trim() || filtroMov.medio || filtroMov.personaId);

function filaRegistro(x) {
  if (x.esPago) {
    const t = tarjetaDe(x.tarjetaId), c = (D.cuentas.find(k => k.id === x.cuentaId) || {});
    return `
    <button class="row" data-act="edit-pago-tarjeta" data-id="${esc(x.id)}">
      <span class="marca marca--retiro" aria-hidden="true"></span>
      <div class="row__main">
        <div class="row__t">Pago de ${esc(t ? t.nombre : 'tarjeta')}</div>
        <div class="row__s">${esc(x.fecha || '')}${c.nombre ? ' · desde ' + esc(c.nombre) : ''}${x.nota ? ' · ' + esc(x.nota) : ''}</div>
      </div>
      <div class="row__v is-muted">${esc(money(x.monto))}</div>
      <svg class="row__chev" viewBox="0 0 24 24">${ICONO.chev}</svg>
    </button>`;
  }
  return x.esRetiro ? `
    <button class="row" data-act="edit-retiro" data-id="${esc(x.id)}">
      <span class="marca marca--retiro" aria-hidden="true"></span>
      <div class="row__main">
        <div class="row__t">Retiro de efectivo</div>
        <div class="row__s">${esc(x.fecha || '')} · ${esc(persona(x.personaId).nombre)}${x.nota ? ' · ' + esc(x.nota) : ''}</div>
      </div>
      <div class="row__v is-muted">${esc(money(x.monto))}</div>
      <svg class="row__chev" viewBox="0 0 24 24">${ICONO.chev}</svg>
    </button>` : `
    <button class="row" data-act="edit-mov" data-id="${esc(x.id)}">
      <span class="marca" aria-hidden="true"></span>
      <div class="row__main">
        <div class="row__t">${esc(x.concepto || (gastoDe(x.gastoId) || {}).concepto || 'Gasto')}</div>
        <div class="row__s">${esc(x.fecha || '')} · ${esc(persona(x.personaId).nombre)} · ${x.medioPago === 'efectivo' ? 'efectivo' : 'tarjeta'}</div>
      </div>
      <div class="row__v">${esc(money(x.monto))}</div>
      <svg class="row__chev" viewBox="0 0 24 24">${ICONO.chev}</svg>
    </button>`;
}

/** Solo la lista: se repinta sola al teclear sin tocar el campo de búsqueda. */
function listaRegistro() {
  const todos = registroDelMes();
  const vistos = filtrarRegistro(todos);

  if (!todos.length) return `<div class="empty">
    <div class="empty__t">Nada registrado en ${esc(mesLabel(periodo))}</div>
    <div class="empty__s">Cada gasto que anoten aparece aquí y descuenta del plan.</div>
  </div>`;

  if (!vistos.length) return `<div class="empty">
    <div class="empty__t">Nada coincide</div>
    <div class="empty__s">Ningún registro de ${esc(mesLabel(periodo))} cuadra con esa búsqueda.</div>
    <button class="btn btn--ghost" data-act="limpiar-filtros" style="margin-top:16px;max-width:240px;margin-inline:auto">Quitar filtros</button>
  </div>`;

  const suma = vistos.filter(x => !x.esRetiro).reduce((s, x) => s + (+x.monto || 0), 0);

  return `
    ${hayFiltro() ? `<div class="field__h" style="margin-top:10px">
      ${esc(plural(vistos.length, 'registro', 'registros'))} de ${esc(String(todos.length))}
      · ${esc(money(suma))} en gastos.
      <button class="lnk" data-act="limpiar-filtros">Quitar filtros</button>
    </div>` : ''}
    <div class="card card--flush">${vistos.map(filaRegistro).join('')}</div>`;
}

function bloqueBuscador() {
  const chip = (act, valor, etiqueta, activo) => `
    <button class="chip ${activo ? 'is-on' : ''}" data-act="${act}" data-v="${esc(valor)}"
      aria-pressed="${activo ? 'true' : 'false'}">${esc(etiqueta)}</button>`;

  return `
    <div class="buscador">
      <svg class="buscador__ico" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.4"/><path d="M15.8 15.8L20 20"/></svg>
      <input class="input" id="movBuscar" type="search" autocomplete="off"
             placeholder="Buscar en ${esc(mesLabel(periodo))}"
             aria-label="Buscar en el registro" value="${esc(filtroMov.texto)}">
    </div>
    <div class="chips">
      ${chip('filtro-medio', '', 'Todo', !filtroMov.medio)}
      ${chip('filtro-medio', 'tarjeta', 'Tarjeta', filtroMov.medio === 'tarjeta')}
      ${chip('filtro-medio', 'efectivo', 'Efectivo', filtroMov.medio === 'efectivo')}
      ${D.personas.length > 1
        ? D.personas.map(p => chip('filtro-persona', p.id, p.nombre, filtroMov.personaId === p.id)).join('')
        : ''}
    </div>`;
}

/* ---------- en qué se fue ---------- */

function bloqueCategorias() {
  const c = A.porCategoria(D, periodo);
  if (!c.total) return '';

  return `
    <div class="sec"><span class="sec__t">En qué se fue</span></div>
    <div class="card card--flush">
      ${c.filas.map((f, i) => `
        <div class="row" style="display:block">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
            <span class="row__t">${esc(f.categoria)}
              <span style="color:var(--muted);font-weight:500">· ${esc(plural(f.movimientos, 'registro', 'registros'))}</span></span>
            <span class="row__v">${esc(money(f.monto))}</span>
          </div>
          <div class="bar" style="height:6px;margin-top:8px">
            <div class="bar__f" style="width:${(f.pct * 100).toFixed(1)}%;background:var(--seq-${i === 0 ? '550' : i === 1 ? '400' : '250'})"></div>
          </div>
          <div style="margin-top:5px;font-size:11.5px;color:var(--muted)">
            ${esc(nf0.format(f.pct * 100))}% de lo gastado este mes</div>
        </div>`).join('')}
    </div>
    ${c.mayor && c.filas.length > 1 ? `<div class="field__h" style="margin-top:8px">
      La mayor parte se fue en <b>${esc(c.mayor.categoria)}</b>:
      ${esc(nf0.format(c.mayor.pct * 100))} de cada 100 lempiras.</div>` : ''}`;
}

/* ---------- cuentas de banco ---------- */

/**
 * Lo que hay en el banco. Es un saldo acumulado, no el disponible del mes:
 * son dos preguntas distintas y conviene que no se confundan.
 */
/**
 * A quién pertenece una cuenta, deducido de su propio nombre. Las cuentas suelen
 * llamarse "FICOHSA-MOISES ARMANDO MELGAR ALVAREZ": el dato ya está escrito ahí
 * y pedirlo otra vez a mano es hacer trabajar a la persona para nada.
 *
 * Se exigen DOS palabras del nombre para no emparejar a dos hermanos por el
 * apellido, ni a "Juan" con "Juana".
 */
function dueñoPorNombre(fila) {
  const t = sinTildes(fila.nombre);
  const candidatos = D.personas.filter(p => {
    const partes = sinTildes(p.nombre).split(/\s+/).filter(w => w.length > 2);
    return partes.length >= 2 && partes.filter(w => t.includes(w)).length >= 2;
  });
  // Si el nombre encaja con dos personas, no se adivina: se pregunta.
  return candidatos.length === 1 ? candidatos[0] : null;
}

function bloqueCuentas() {
  const c = A.saldosCuentas(D, periodo);
  if (!c.hayDatos) return '';

  return `
    <div class="sec"><span class="sec__t">En el banco</span>
      <button class="sec__a" data-goto="presupuesto">Editar</button></div>
    <div class="card card--flush">
      ${c.filas.map(f => `
        <div class="row" style="display:block">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
            <span class="row__t">${esc(f.nombre)}</span>
            <span class="row__v ${f.disponible < 0 ? 'is-neg' : ''}">${esc(money(f.disponible))}</span>
          </div>
          ${f.retenido > 0 ? `<div style="margin-top:4px;font-size:11.5px;color:var(--muted)">
            ${esc(money(f.saldo))} en libros − <b>${esc(money(f.retenido))}</b> ya gastado que el
            comercio no ha cobrado</div>` : ''}
          <div style="margin-top:5px;font-size:11.5px;color:var(--muted)">
            ${f.segunBanco
              ? `según el banco al ${esc(diaMes(f.segunBanco.fecha))}${
                  f.segunBanco.despues ? ` · ${esc(money(f.segunBanco.despues))} después` : ''}`
              : `${esc(money(f.inicial))} al empezar${
                  f.acreditado ? ` · +${esc(money(f.acreditado))} acreditado` : ''}${
                  f.salidas ? ` · −${esc(money(f.salidas))} en salidas` : ''}`}
          </div>
        </div>`).join('')}
      ${c.filas.length > 1 ? `<div class="total"><span>Total disponible</span>
        <span ${c.totalDisponible < 0 ? 'style="color:var(--critical)"' : ''}>${esc(money(c.totalDisponible))}</span></div>` : ''}
    </div>
    ${c.totalRetenido > 0 ? `<div class="field__h" style="margin-top:8px">
      Hay <b>${esc(money(c.totalRetenido))}</b> ya gastado esperando que el comercio lo cobre.
      Está en el saldo del banco pero no es de ustedes: no cuenta como capital ni como colchón.
    </div>` : ''}
    ${(() => {
      // Un saldo en rojo casi siempre es configuración incompleta, no un mal
      // cálculo. Decirlo con nombre y apellido evita media hora de desconcierto.
      const huerfanas = c.filas.filter(f => !f.personas.length);
      const sinConfirmar = c.filas.filter(f => f.personas.length && f.sinConfirmar);
      if (!huerfanas.length && !sinConfirmar.length) return '';
      return `<div class="consejo consejo--critical" style="margin-top:12px">
        <div class="consejo__t">Falta decir a quién le cae el pago</div>
        <div class="consejo__c">
          ${huerfanas.length ? `<p style="margin:0">Cada persona cobra en una cuenta, y eso
            todavía no está marcado para <b>${esc(huerfanas.map(f => f.nombre).join(' y '))}</b>.
            Sin ese dato, cuando confirmen un ingreso la app no sabe a qué saldo sumarlo: ahí
            solo entran restas —gastos, retiros, pagos— y el saldo va quedando más bajo de lo
            que hay de verdad. ${huerfanas.every(f => f.segunBanco)
              ? 'Ahora mismo lo tapa el saldo que trae el banco, pero en cuanto pase unos días sin importar nada se va a notar.'
              : ''}</p>
            <p style="margin:8px 0 0"><b>Cómo se arregla:</b> tocá la cuenta aquí arriba y
            elegí de quién es. ${huerfanas.some(f => dueñoPorNombre(f))
              ? 'O dejá que lo adivine: el nombre de la cuenta ya trae el de la persona.'
              : ''}</p>
            ${huerfanas.some(f => dueñoPorNombre(f)) ? `
            <button class="btn btn--ghost" data-act="asignar-por-nombre" style="margin-top:10px">
              Asignar por el nombre de la cuenta</button>` : ''}` : ''}
          ${sinConfirmar.length ? `<p style="margin:${huerfanas.length ? '8px' : '0'} 0 0">
            ${huerfanas.length ? 'Además, no' : 'No'} hay ingresos <b>confirmados</b> en
            ${esc(mesLabel(periodo))}: mientras sigan en estimado no se suman al banco.
            Confírmalos en Presupuesto.</p>` : ''}
        </div>
      </div>`;
    })()}
    <div class="field__h" style="margin-top:8px">
      Solo suma lo que confirmaron como recibido: si un pago sigue en <b>estimado</b>,
      todavía no está aquí. Los consumos con tarjeta de crédito tampoco restan hasta
      que se paga el corte.
    </div>`;
}

/* ---------- capital y diagnóstico ---------- */

/**
 * El capital total: lo que tienen menos lo que deben. Va primero en el
 * Resumen porque es la única cifra que no se puede maquillar — el disponible
 * del mes puede verse bien con la tarjeta reventada.
 */
/**
 * `parte` reparte este bloque entre la franja de cifras principales y el riel:
 * el número grande manda arriba, el desglose es de apoyo. En el teléfono se
 * piden los dos seguidos y queda como estaba.
 */
function bloquePatrimonio(parte) {
  const p = A.patrimonio(D, periodo);
  if (!p.hayDatos) return '';

  const fila = (etiqueta, valor, sub, neg) => `
    <div class="row">
      <div class="row__main"><div class="row__t" style="font-weight:500">${esc(etiqueta)}</div>
        ${sub ? `<div class="row__s">${sub}</div>` : ''}</div>
      <div class="row__v ${neg ? 'is-neg' : ''}">${esc(valor)}</div>
    </div>`;

  const heroCapital = `
    <div class="hero">
      <div class="hero__label">Capital · lo que tienen menos lo que deben</div>
      <div class="hero__val ${p.neto < 0 ? 'is-neg' : ''}">${p.neto < 0 ? '−' : ''}<span class="cur">L</span>${esc(nf2.format(Math.abs(p.neto)))}</div>
      <div class="hero__sub">${p.neto < 0
        ? 'Deben más de lo que tienen. Bajar esta deuda es lo que más rinde ahora mismo.'
        : 'Esta es la cifra que debe subir mes a mes. Todo lo demás es medio para llegar aquí.'}</div>
    </div>`;
  if (parte === 'hero') return heroCapital;

  return `
    ${parte === 'detalle' ? '<div class="sec"><span class="sec__t">De qué se compone</span></div>'
                          : '<div class="sec"><span class="sec__t">Capital total</span></div>' + heroCapital}
    <div class="card card--flush">
      ${fila('En el banco', money(p.enBanco), p.retenidoBanco > 0
        ? `disponible; ${esc(money(p.enLibros))} en libros menos ${esc(money(p.retenidoBanco))} ya gastado` : '')}
      ${p.enMano > 0 ? fila('Efectivo en mano', money(p.enMano)) : ''}
      ${p.retenidoTarjetas > 0 ? fila('Tarjetas · autorizado sin aplicar', '−' + money(p.retenidoTarjetas),
        'compras hechas que aún no salen en el corte', true) : ''}
      ${p.enTarjetas > 0 ? (() => {
        const revuelve = p.tarjetas.reduce((s, t) => s + t.revolvente, 0);
        const contado = p.enTarjetas - revuelve;
        return (contado > 0 ? fila('Tarjetas · por pagar este mes', '−' + money(contado),
                  'dentro del plazo sin intereses', true) : '') +
               (revuelve > 0 ? fila('Tarjetas · saldo que revuelve', '−' + money(revuelve),
                  'esto sí genera intereses', true) : '');
      })() : ''}
      ${p.enFinanciamientos > 0 ? fila('Financiamientos por pagar', '−' + money(p.enFinanciamientos), '', true) : ''}
      <div class="total"><span>Capital</span>
        <span ${p.neto < 0 ? 'style="color:var(--critical)"' : ''}>${p.neto < 0 ? '−' : ''}${esc(money(Math.abs(p.neto)))}</span></div>
    </div>
    ${p.faltanSaldosTarjeta ? `<div class="field__h" style="margin-top:8px">
      Falta declarar cuánto deben en alguna tarjeta. Sin ese dato el capital sale
      mejor de lo que es. <button class="lnk" data-goto="presupuesto">Completarlo</button></div>` : ''}`;
}

/**
 * El diagnóstico y, sobre todo, el ORDEN. Un asesor no da consejos sueltos:
 * dice qué va primero. Apartar para un proyecto mientras se revuelve una
 * tarjeta cara es perder dinero cada mes, por disciplinado que se sienta.
 */
function bloqueDiagnostico() {
  const s = A.saludFinanciera(D, periodo);
  if (!s.pasos.length && !s.caras.length) return '';

  const meses = s.mesesColchon;
  const nivelColchon = meses === null ? '' :
    meses >= A.MESES_COLCHON ? 'good' : meses >= 1 ? 'serious' : 'critical';

  return `
    <div class="sec"><span class="sec__t">Diagnóstico</span></div>

    ${meses !== null ? `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
        <div style="font-size:15px;font-weight:680;letter-spacing:-.02em">Colchón de emergencia</div>
        <div style="font-size:20px;font-weight:750;letter-spacing:-.03em;${
          nivelColchon === 'critical' ? 'color:var(--critical)' : nivelColchon === 'good' ? 'color:var(--good-text)' : ''}">
          ${esc(meses >= 10 ? nf0.format(meses) : meses.toFixed(1))} ${meses === 1 ? 'mes' : 'meses'}</div>
      </div>
      <div class="bar" style="height:8px"><div class="bar__f ${
        nivelColchon === 'critical' ? 'is-over' : nivelColchon === 'good' ? 'is-full' : ''}"
        style="width:${Math.min(100, (meses / A.MESES_COLCHON) * 100).toFixed(1)}%"></div></div>
      <div style="margin-top:8px;font-size:12.5px;color:var(--ink-2)">
        ${esc(money(s.liquido))} líquido contra ${esc(money(s.gastoMensual))} de gasto al mes.
        Lo sano son <b>${esc(String(A.MESES_COLCHON))} meses</b> (${esc(money(s.metaColchon))}).
      </div>
    </div>` : ''}

    ${s.interesMensual === 0 && s.porPagar > 0 ? (() => {
      const t = s.alContado.find(x => x.graciaMaxima > 0);
      if (!t) return '';
      return `<div class="card" style="margin-top:12px">
        <div style="font-size:15px;font-weight:680;letter-spacing:-.02em">Los días de gracia</div>
        <div class="ciclo" style="margin-top:12px">
          <div class="ciclo__c">
            <div class="ciclo__l">Comprando justo tras el corte</div>
            <div class="ciclo__v" style="color:var(--good-text)">${esc(String(t.graciaMaxima))} días</div>
          </div>
          <div class="ciclo__op">·</div>
          <div class="ciclo__c">
            <div class="ciclo__l">Comprando justo antes</div>
            <div class="ciclo__v">${esc(String(t.graciaMinima))} días</div>
          </div>
        </div>
        <div class="field__h" style="margin-top:10px">
          Una compra grande hecha el día después del corte se paga hasta
          <b>${esc(String(t.graciaMaxima - t.graciaMinima))} días</b> más tarde que la misma compra
          hecha un día antes. Mismo precio, más plazo, sin costo.
        </div>
      </div>`;
    })() : ''}

    ${s.interesMensual > 0 ? `<div class="card" style="margin-top:12px">
      <div style="font-size:15px;font-weight:680;letter-spacing:-.02em">Lo que cuesta la deuda</div>
      <div class="ciclo" style="margin-top:12px">
        <div class="ciclo__c">
          <div class="ciclo__l">Al mes en intereses</div>
          <div class="ciclo__v" style="color:var(--critical)">${esc(money(s.interesMensual))}</div>
        </div>
        <div class="ciclo__op">·</div>
        <div class="ciclo__c">
          <div class="ciclo__l">Al año</div>
          <div class="ciclo__v" style="color:var(--critical)">${esc(money(s.interesAnual))}</div>
        </div>
      </div>
      <div class="field__h" style="margin-top:10px">
        Eso se va sin comprar nada. Se come el
        <b>${esc(nf0.format(Math.min(999, s.mordidaInteres * 100)))}%</b> del disponible del mes:
        de los ${esc(money(s.disponibleDeclarado))} que parecen libres, quedan
        <b>${esc(money(s.disponibleReal))}</b>.
      </div>
    </div>` : ''}

    ${s.pasos.map(x => `
      <div class="consejo ${x.nivel === 'good' ? 'consejo--good' : x.nivel === 'critical' ? 'consejo--critical' : ''}" style="margin-top:12px">
        <div class="consejo__t">${esc(x.orden)}. ${esc(x.titulo)}</div>
        <div class="consejo__c">${esc(x.texto)}</div>
      </div>`).join('')}`;
}

/** Bolsa de efectivo: cuánto se sacó del banco y cuánto queda en la mano. */
function bloqueEfectivo(ef) {
  return `
    <div class="sec"><span class="sec__t">Efectivo en mano</span></div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
        <div style="font-size:22px;font-weight:750;letter-spacing:-.03em;${ef.descuadre ? 'color:var(--critical)' : ''}">${esc(money(ef.saldo))}</div>
        <div style="font-size:12.5px;color:var(--muted);font-weight:550">debería quedarles</div>
      </div>
      <div class="ciclo" style="margin-top:12px">
        <div class="ciclo__c">
          <div class="ciclo__l">Retirado este mes</div>
          <div class="ciclo__v">${esc(money(ef.retiradoMes))}</div>
        </div>
        <div class="ciclo__op">−</div>
        <div class="ciclo__c">
          <div class="ciclo__l">Gastado en efectivo</div>
          <div class="ciclo__v">${esc(money(ef.gastadoMes))}</div>
        </div>
      </div>
      ${ef.descuadre ? `
        <div class="consejo consejo--critical" style="margin-top:12px">
          <div class="consejo__t">Falta registrar un retiro</div>
          <div class="consejo__c">Han gastado <b>${esc(money(Math.abs(ef.saldo)))}</b> más en efectivo
            del que aparece retirado. O falta anotar un retiro, o un gasto quedó marcado como
            efectivo cuando en realidad fue con tarjeta.</div>
        </div>`
      : `<div class="field__h" style="margin-top:10px">
          El retiro solo mueve dinero de la cuenta a la cartera, así que no cambia el
          disponible del mes. Lo que descuenta es en qué se gasta ese efectivo.</div>`}
    </div>`;
}

/* ---------- hoja modal ---------- */

const sheet = $('#sheet');
let onGuardar = null;
let focoPrevio = null;   // a dónde devolver el foco al cerrar la hoja

/** Lo que se puede enfocar dentro de la hoja, en el orden en que aparece. */
const enfocables = () => $$('button, input, select, textarea, [href]', sheet)
  .filter(el => !el.disabled && el.offsetParent !== null);

function abrirSheet(titulo, html, guardar, opciones = {}) {
  // Se guarda solo al abrir de nuevo: al reabrir el asistente paso a paso
  // hay que conservar el botón desde el que se entró la primera vez.
  if (sheet.hidden) focoPrevio = document.activeElement;
  $('#sheetTitle').textContent = titulo;
  $('#sheetBody').innerHTML = html;
  onGuardar = guardar || null;
  sheet.dataset.reopen = '';
  sheet.dataset.del = '';
  sheet.dataset.padre = '';
  sheet.dataset.factura = '';
  sheet.classList.toggle('sheet--full', Boolean(opciones.full));
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  $('.sheet__body').scrollTop = 0;
  const f = $('#sheetBody input, #sheetBody select');
  if (f && !('ontouchstart' in window)) setTimeout(() => f.focus(), 260);
}

function cerrarSheet() {
  sheet.hidden = true;
  sheet.classList.remove('sheet--full');
  onGuardar = null;
  document.body.style.overflow = '';
  // Sin esto el foco vuelve al principio de la página y quien navega con
  // teclado tiene que bajar otra vez hasta donde estaba.
  if (focoPrevio && focoPrevio.isConnected) { try { focoPrevio.focus(); } catch (e) {} }
  focoPrevio = null;

  // Lo que llegó de la nube mientras se editaba entra ahora, ya sin riesgo.
  if (remotoPendiente) {
    const r = remotoPendiente;
    remotoPendiente = null;
    aplicarRemoto(r);
  }
}

/**
 * Rechaza el guardado señalando el campo culpable: lo marca, lo trae a la
 * vista y le da el foco. Un aviso al pie no sirve en un formulario largo —
 * si el campo que falla quedó fuera de pantalla, desde fuera parece que el
 * botón Guardar no hace nada.
 */
function fallo(sel, mensaje) {
  toast(mensaje);
  const el = $(sel, sheet);
  if (el) {
    el.classList.add('is-mal');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // El foco va después del desplazamiento; si no, iOS lo corta a medias.
    setTimeout(() => { try { el.focus({ preventScroll: true }); } catch (e) {} }, 160);
  }
  return false;
}

function val(sel) { const e = $(sel, sheet); return e ? e.value.trim() : ''; }
function num(sel) { const v = parseFloat(val(sel).replace(/,/g, '')); return isNaN(v) ? 0 : v; }

function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2800);
}

const campo = (id, etiqueta, attrs, ayuda) => `
  <div class="field">
    <label class="field__l" for="${id}">${etiqueta}</label>
    <input class="input" id="${id}" ${attrs}>
    ${ayuda ? `<div class="field__h">${ayuda}</div>` : ''}
  </div>`;

const filaDed = (i, d) => `
  <div class="grid2" style="margin-top:8px" data-ded="${i}">
    <input class="input" data-k="concepto" value="${d ? esc(d.concepto) : ''}" placeholder="Concepto">
    <div class="conmenos">
      <input class="input" data-k="monto" type="number" inputmode="decimal" step="0.01" min="0" value="${d ? esc(String(d.monto)) : ''}" placeholder="0.00">
      <button class="quitar" type="button" data-act="quita-ded" aria-label="Quitar retención">
        <svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button>
    </div>
  </div>`;

/** Bloque de bruto + retenciones para una persona, con neto en vivo. */
const bloquePersona = (p, l) => `
  <div class="perbloque" data-persona="${esc(p.id)}">
    <div class="perbloque__t">${esc(p.nombre)}</div>
    <div class="field">
      <label class="field__l">Ingreso bruto (L)</label>
      <input class="input" data-k="bruto" type="number" inputmode="decimal" step="0.01" min="0"
             value="${l ? esc(String(l.bruto)) : ''}" placeholder="0.00">
    </div>
    <div class="field">
      <label class="field__l">Retenciones</label>
      <div data-deds>${((l && l.deducciones) || []).map((d, i) => filaDed(i, d)).join('')}</div>
      <button class="btn btn--ghost" type="button" data-act="add-ded" style="margin-top:10px">
        <svg viewBox="0 0 24 24">${ICONO.mas}</svg> Añadir retención</button>
      <div class="field__h" data-neto></div>
    </div>
  </div>`;

/** Lee los bloques de persona del formulario abierto. */
function leerPersonas() {
  return $$('[data-persona]', sheet).map(b => ({
    personaId: b.dataset.persona,
    bruto: Math.max(0, parseFloat($('[data-k="bruto"]', b).value) || 0),
    deducciones: $$('[data-ded]', b).map(r => ({
      concepto: $('[data-k="concepto"]', r).value.trim() || 'Retención',
      monto: Math.max(0, parseFloat($('[data-k="monto"]', r).value) || 0)
    })).filter(d => d.monto > 0)
  }));
}

function refrescarNetos() {
  $$('[data-persona]', sheet).forEach(b => {
    const cont = $('[data-neto]', b);
    if (!cont) return;
    const bruto = parseFloat($('[data-k="bruto"]', b).value) || 0;
    const suma = $$('[data-k="monto"]', b).reduce((s, i) => s + (parseFloat(i.value) || 0), 0);
    const neto = bruto - suma;
    cont.innerHTML = `Neto: <b style="color:${neto < 0 ? 'var(--critical)' : 'var(--ink)'}">${esc(money(neto))}</b>`;
  });
}

/* ---------- asistente de configuración ---------- */

let asis = null;

function abrirAsistente() {
  asis = {
    paso: 1,
    personas: D.personas.length ? D.personas.slice() : [{ id: uid(), nombre: '' }, { id: uid(), nombre: '' }],
    eventos: D.plantillaIngresos.slice(),
    gastos: D.gastos.slice(),
    tarjetas: D.tarjetas.slice(),
    financiamientos: D.financiamientos.slice()
  };
  pintarAsistente();
}

const TOTAL_PASOS = 4;

function pintarAsistente() {
  const p = asis.paso;
  const cuerpos = { 1: pasoPersonas, 2: pasoIngresos, 3: pasoGastos, 4: pasoTarjetas };

  abrirSheet(`Paso ${p} de ${TOTAL_PASOS}`, `
    <div class="progreso"><div class="progreso__f" style="width:${(p / TOTAL_PASOS * 100).toFixed(0)}%"></div></div>
    ${cuerpos[p]()}
    <div class="asis__nav">
      ${p > 1 ? '<button class="btn btn--ghost" data-act="asis-atras">Atrás</button>' : '<span></span>'}
      <button class="btn" data-act="asis-siguiente">${p === TOTAL_PASOS ? 'Terminar' : 'Siguiente'}</button>
    </div>
  `, null, { full: true });
  if (p === 1) setTimeout(() => { const i = $('#sheetBody input'); if (i) i.focus(); }, 250);
}

function pasoPersonas() {
  return `
    <h3 class="asis__t">¿Quiénes usan la app?</h3>
    <p class="asis__s">Los nombres aparecen en cada ingreso y gasto, para saber siempre quién puso qué.</p>
    <div id="asis-personas">
      ${asis.personas.map((p, i) => `
        <div class="conmenos" style="margin-top:10px" data-per="${esc(p.id)}">
          <input class="input" data-k="nombre" value="${esc(p.nombre)}" placeholder="Nombre ${i + 1}" autocomplete="off">
          ${asis.personas.length > 1 ? `<button class="quitar" type="button" data-act="asis-quita-persona" aria-label="Quitar">
            <svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button>` : ''}
        </div>`).join('')}
    </div>
    <button class="btn btn--ghost" data-act="asis-add-persona" style="margin-top:12px">
      <svg viewBox="0 0 24 24">${ICONO.mas}</svg> Añadir otra persona</button>`;
}

function pasoIngresos() {
  return `
    <h3 class="asis__t">¿Qué pagos reciben al mes?</h3>
    <p class="asis__s">Registra cada pago con el día en que cae y el monto <b>típico</b>.
      Cada mes vas a confirmar lo que realmente entró — así el ISR variable queda registrado tal cual.</p>

    ${asis.eventos.length ? `<div class="card card--flush" style="margin-top:14px">
      ${asis.eventos.map(e => {
        const total = asis.personas.reduce((s, p) => {
          const l = (e.lineas || []).find(x => x.personaId === p.id);
          return s + A.netoLinea(l);
        }, 0);
        return `
        <button class="row" data-act="asis-edit-evento" data-id="${esc(e.id)}">
          <div class="row__main">
            <div class="row__t">${esc(e.nombre)}</div>
            <div class="row__s">día ${esc(String(e.dia))} del mes</div>
          </div>
          <div class="row__v">${esc(money(total))}</div>
          <svg class="row__chev" viewBox="0 0 24 24">${ICONO.chev}</svg>
        </button>`;
      }).join('')}
    </div>` : `<div class="empty" style="padding:26px 10px">
      <div class="empty__s">Todavía no hay pagos registrados.</div></div>`}

    <button class="btn btn--ghost" data-act="asis-add-evento" style="margin-top:12px">
      <svg viewBox="0 0 24 24">${ICONO.mas}</svg> Añadir un pago</button>`;
}

function pasoGastos() {
  const total = asis.gastos.reduce((s, g) => s + (+g.monto || 0), 0);
  return `
    <h3 class="asis__t">¿En qué se va el dinero?</h3>
    <p class="asis__s">Los gastos del mes, sin importar cómo se paguen. Marca cuáles van con
      tarjeta: eso me deja vigilar si el corte alcanza.</p>

    ${asis.gastos.length ? `<div class="card card--flush" style="margin-top:14px">
      ${asis.gastos.map(g => `
        <button class="row" data-act="asis-edit-gasto" data-id="${esc(g.id)}">
          <div class="row__main">
            <div class="row__t">${esc(g.concepto)}</div>
            <div class="row__s">${esc(g.categoria)} · ${g.medioPago === 'efectivo' ? 'efectivo' : 'tarjeta'}</div>
          </div>
          <div class="row__v">${esc(money(g.monto))}</div>
          <svg class="row__chev" viewBox="0 0 24 24">${ICONO.chev}</svg>
        </button>`).join('')}
      <div class="total"><span>Total</span><span>${esc(money(total))}</span></div>
    </div>` : `<div class="empty" style="padding:26px 10px">
      <div class="empty__s">Todavía no hay gastos registrados.</div></div>`}

    <button class="btn btn--ghost" data-act="asis-add-gasto" style="margin-top:12px">
      <svg viewBox="0 0 24 24">${ICONO.mas}</svg> Añadir un gasto</button>`;
}

function pasoTarjetas() {
  return `
    <h3 class="asis__t">Tarjetas y financiamientos</h3>
    <p class="asis__s">La tarjeta es por dónde pasa el gasto, no un gasto aparte. Los
      financiamientos —compras a cuotas, extrafinanciamiento— sí son un compromiso fijo
      que reduce lo disponible.</p>

    <div class="sec" style="margin-top:20px"><span class="sec__t">Tarjetas</span></div>
    ${asis.tarjetas.length ? `<div class="card card--flush">
      ${asis.tarjetas.map(t => {
        const ev = asis.eventos.find(e => e.id === t.pagaCon);
        return `
        <button class="row" data-act="asis-edit-tarjeta" data-id="${esc(t.id)}">
          <div class="row__main">
            <div class="row__t">${esc(t.nombre)}</div>
            <div class="row__s">corta el ${esc(String(t.diaCorte))} · ${ev ? 'la paga ' + esc(ev.nombre) : 'sin pago asignado'}</div>
          </div>
          <svg class="row__chev" viewBox="0 0 24 24">${ICONO.chev}</svg>
        </button>`;
      }).join('')}
    </div>` : ''}
    <button class="btn btn--ghost" data-act="asis-add-tarjeta" style="margin-top:10px">
      <svg viewBox="0 0 24 24">${ICONO.mas}</svg> Añadir tarjeta</button>

    <div class="sec" style="margin-top:24px"><span class="sec__t">Financiamientos</span></div>
    ${asis.financiamientos.length ? `<div class="card card--flush">
      ${asis.financiamientos.map(f => `
        <button class="row" data-act="asis-edit-fin" data-id="${esc(f.id)}">
          <div class="row__main">
            <div class="row__t">${esc(f.nombre)}</div>
            <div class="row__s">${esc(money(f.cuotaMensual))} × ${esc(String(A.cuotasRestantes(f)))} cuotas</div>
          </div>
          <svg class="row__chev" viewBox="0 0 24 24">${ICONO.chev}</svg>
        </button>`).join('')}
    </div>` : ''}
    <button class="btn btn--ghost" data-act="asis-add-fin" style="margin-top:10px">
      <svg viewBox="0 0 24 24">${ICONO.mas}</svg> Añadir financiamiento</button>

    <div class="field__h" style="margin-top:16px">Este paso es opcional: si no tienen tarjeta
      ni nada financiado, dale a Terminar.</div>`;
}

function avanzarAsistente() {
  const p = asis.paso;

  if (p === 1) {
    asis.personas = $$('#asis-personas [data-per]', sheet).map(b => ({
      id: b.dataset.per, nombre: $('[data-k="nombre"]', b).value.trim(), _upd: now()
    })).filter(x => x.nombre);
    if (!asis.personas.length) { toast('Escribe al menos un nombre'); return; }
  }

  if (p === 2 && !asis.eventos.length) { toast('Añade al menos un pago'); return; }
  if (p === 3 && !asis.gastos.length) { toast('Añade al menos un gasto'); return; }

  if (p === TOTAL_PASOS) {
    // Lo que se quitó dentro del asistente hay que marcarlo como borrado; si no,
    // el otro teléfono lo devuelve en la primera fusión.
    const vivos = new Set([].concat(asis.personas, asis.eventos, asis.gastos,
                                    asis.tarjetas, asis.financiamientos).map(x => x.id));
    D._borrados = D._borrados || {};
    [].concat(D.personas, D.plantillaIngresos, D.gastos, D.tarjetas, D.financiamientos)
      .forEach(x => { if (x && x.id && !vivos.has(x.id)) D._borrados[x.id] = now(); });

    D.personas = asis.personas;
    D.plantillaIngresos = asis.eventos;
    D.gastos = asis.gastos;
    D.tarjetas = asis.tarjetas;
    D.financiamientos = asis.financiamientos;
    D.configurado = true;
    persistir();
    cerrarSheet();
    asis = null;
    vista = 'presupuesto';
    render();
    toast('Listo. Ahora confirma los ingresos de este mes.');
    return;
  }

  asis.paso++;
  pintarAsistente();
}

/* ---------- formularios ---------- */

/** Cuenta de banco: la bolsa donde de verdad vive el dinero. */
function fmCuenta(id) {
  const c = id ? D.cuentas.find(x => x.id === id) : null;
  const dueños = c ? D.personas.filter(p => p.cuentaId === c.id) : [];
  const ligadas = c ? D.tarjetas.filter(t => t.cuentaId === c.id) : [];

  abrirSheet(c ? 'Editar cuenta' : 'Nueva cuenta', `
    ${campo('f-nom', 'Nombre de la cuenta', `value="${esc(c ? c.nombre : '')}" placeholder="Ficohsa de Moisés"`)}
    ${campo('f-num', 'Número de cuenta',
      `value="${esc(c && c.numero ? c.numero : '')}" placeholder="200012610911" inputmode="numeric"`,
      'Con esto, al importar un estado de cuenta la app sabe sola que es de aquí.')}
    ${campo('f-sal', 'Saldo con el que arranca (L)',
      `type="number" inputmode="decimal" step="0.01" value="${c ? esc(String(c.saldoInicial)) : ''}" placeholder="0.00"`,
      'Lo que hay en la cuenta al empezar el mes de abajo. De ahí en adelante la app suma y resta sola.')}
    ${campo('f-des', 'Desde qué mes', `type="month" value="${esc(c ? (c.desdeMes || '') : mesHoy())}"`,
      'Los ingresos y salidas anteriores a este mes no se cuentan: ya están dentro del saldo de arriba.')}
    ${campo('f-ret', 'Ya gastado, pendiente de salir (L)',
      `type="number" inputmode="decimal" step="0.01" min="0" value="${esc(c && c.retenido && c.retenido.monto ? String(c.retenido.monto) : '')}" placeholder="0.00"`,
      'Compras que ya hicieron y el comercio todavía no cobra — el banco las llama "retenidos y diferidos". Ese dinero ya no es suyo: no cuenta como capital ni como colchón. Al importar el estado de cuenta se actualiza solo.')}
    ${D.personas.length ? `<div class="field"><label class="field__l" for="f-dueno">¿De quién es esta cuenta?</label>
      <select class="input" id="f-dueno">
        <option value="">— de nadie en particular —</option>
        ${D.personas.map(p => `<option value="${esc(p.id)}"${dueños.some(d => d.id === p.id) ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}
      </select>
      <div class="field__h">Aquí es donde le depositan el sueldo. Sin esto, lo que confirme
        como recibido no se suma a ningún saldo y la cuenta va quedando más baja de lo real.
        ${dueños.length > 1 ? `<b>Ojo:</b> ahora mismo la comparten
          ${esc(dueños.map(p => p.nombre).join(' y '))}; al elegir uno, el otro se queda sin cuenta.` : ''}</div></div>`
      : `<div class="field__h" style="margin-top:14px">
      Cuando registres personas vas a poder decir a quién le depositan aquí.</div>`}
    ${c && ligadas.length ? `<div class="field__h" style="margin-top:10px">
      Tarjetas ligadas: ${esc(ligadas.map(t => t.nombre).join(', '))}.</div>` : ''}
    <button class="btn" data-act="guardar" style="margin-top:20px">Guardar</button>
    ${c ? '<button class="btn btn--danger" data-act="borrar" style="margin-top:8px">Eliminar cuenta</button>' : ''}
  `, () => {
    const nombre = val('#f-nom');
    if (!nombre) return fallo('#f-nom', 'Ponle un nombre a la cuenta');
    const desdeMes = val('#f-des');
    if (!desdeMes) return fallo('#f-des', 'Falta desde qué mes cuenta el saldo');
    const datos = { nombre, numero: val('#f-num'), saldoInicial: num('#f-sal'), desdeMes, _upd: now() };
    // El cero es un valor válido —significa "ya no hay nada retenido"—, así que
    // se distingue del campo vacío, que quiere decir "no lo toques".
    if (val('#f-ret') !== '') datos.retenido = { monto: num('#f-ret'), fecha: fechaLocal() };
    const actual = id ? D.cuentas.find(x => x.id === id) : null;
    if (actual) Object.assign(actual, datos);
    else D.cuentas.push(Object.assign({ id: uid() }, datos));

    // El dueño se guarda en la persona, no en la cuenta: es la persona la que
    // dice dónde cobra. Se hace desde aquí porque es donde uno está mirando.
    if (D.personas.length) {
      const cid = (actual || D.cuentas[D.cuentas.length - 1]).id;
      const nuevo = val('#f-dueno');
      D.personas.forEach(p => {
        if (p.id === nuevo && p.cuentaId !== cid) { p.cuentaId = cid; p._upd = now(); }
        else if (p.id !== nuevo && p.cuentaId === cid) { p.cuentaId = null; p._upd = now(); }
      });
    }
    return true;
  });
  sheet.dataset.del = c ? `cuenta:${c.id}` : '';
}

/** Alta, edición y baja de una persona. Fuera del asistente no había forma. */
function fmPersona(id) {
  const p = id ? D.personas.find(x => x.id === id) : null;
  const ligados = p
    ? D.movimientos.filter(m => m.personaId === p.id).length +
      D.retiros.filter(x => x.personaId === p.id).length
    : 0;
  const sePuedeBorrar = Boolean(p) && D.personas.length > 1;

  abrirSheet(p ? 'Editar persona' : 'Nueva persona', `
    ${campo('f-nom', 'Nombre', `value="${esc(p ? p.nombre : '')}" placeholder="Nombre"`)}
    ${D.cuentas.length ? `<div class="field"><label class="field__l" for="f-cta">Dónde le caen los ingresos</label>
      <select class="input" id="f-cta">
        <option value="">— sin cuenta —</option>
        ${D.cuentas.map(c => `<option value="${esc(c.id)}"${p && p.cuentaId === c.id ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('')}
      </select>
      <div class="field__h">Lo que confirme como recibido suma al saldo de esa cuenta.</div></div>` : ''}
    ${p ? `<div class="field__h" style="margin-top:14px">
      ${sePuedeBorrar
        ? `Al eliminarla se borran sus montos de cada pago del mes.${ligados
            ? ` Los ${esc(plural(ligados, 'gasto o retiro que anotó', 'gastos y retiros que anotó'))} se conservan, pero quedan sin dueño.`
            : ''}`
        : 'Es la única persona registrada: no se puede eliminar. Añade otra antes.'}
      </div>` : ''}
    <button class="btn" data-act="guardar" style="margin-top:20px">Guardar</button>
    ${sePuedeBorrar ? '<button class="btn btn--danger" data-act="borrar" style="margin-top:8px">Eliminar persona</button>' : ''}
  `, () => {
    const nombre = val('#f-nom');
    if (!nombre) return fallo('#f-nom', 'Ponle un nombre');
    const datos = { nombre, _upd: now() };
    if (D.cuentas.length) datos.cuentaId = val('#f-cta') || null;
    const actual = id ? D.personas.find(x => x.id === id) : null;
    if (actual) Object.assign(actual, datos);
    else D.personas.push(Object.assign({ id: uid() }, datos));
    return true;
  });
  sheet.dataset.del = sePuedeBorrar ? `persona:${p.id}` : '';
}

/** Editor de un pago recurrente. `destino` decide si va al asistente o al documento. */
function fmEvento(id, enAsistente) {
  // Se resuelve al vuelo, nunca se guarda la referencia: la sincronización
  // puede reemplazar D entera mientras el formulario está abierto.
  const listaDe = () => enAsistente ? asis.eventos : D.plantillaIngresos;
  const personas = enAsistente ? asis.personas : D.personas;
  const ev = id ? listaDe().find(e => e.id === id) : null;

  // Sin personas el formulario no tendría dónde poner los montos y guardaría
  // un pago vacío que después no se puede arreglar desde ningún lado.
  if (!personas.length) { toast('Primero añade al menos una persona'); return; }

  abrirSheet(ev ? 'Editar pago' : 'Nuevo pago', `
    ${campo('f-nom', 'Nombre del pago', `value="${esc(ev ? ev.nombre : '')}" placeholder="Comisiones, primera quincena…"`)}
    ${campo('f-dia', 'Día del mes en que cae', `type="number" inputmode="numeric" min="1" max="31" value="${ev ? esc(String(ev.dia)) : ''}" placeholder="1 a 31"`)}
    <div class="field__h" style="margin-top:14px">Montos <b>típicos</b>. Cada mes confirmarás
      lo que realmente entró, y ahí se registra el ISR que tocó.</div>
    ${personas.map(p => bloquePersona(p, (ev && ev.lineas || []).find(l => l.personaId === p.id))).join('')}
    <button class="btn" data-act="guardar" style="margin-top:20px">Guardar</button>
    ${ev ? '<button class="btn btn--danger" data-act="borrar" style="margin-top:8px">Eliminar pago</button>' : ''}
  `, () => {
    const nombre = val('#f-nom');
    if (!nombre) return fallo('#f-nom', 'Ponle nombre al pago');
    // Sin el crudo, un día vacío se colaba como día 1: Math.max(1, 0) es 1.
    const diaCrudo = num('#f-dia');
    if (!diaCrudo) return fallo('#f-dia', 'Falta el día del mes en que cae');
    const dia = Math.min(31, Math.max(1, diaCrudo));

    const lineas = leerPersonas();
    const mala = lineas.find(l => l.deducciones.reduce((s, d) => s + d.monto, 0) > l.bruto);
    if (mala) return fallo(`[data-persona="${mala.personaId}"] [data-k="bruto"]`,
                           'Las retenciones superan al bruto');

    const lista = listaDe();
    const actual = id ? lista.find(e => e.id === id) : null;
    if (actual) Object.assign(actual, { nombre, dia, lineas, _upd: now() });
    else lista.push({ id: uid(), nombre, dia, lineas, _upd: now() });
    return true;
  });
  sheet.dataset.del = ev ? (enAsistente ? `asis-evento:${ev.id}` : `evento:${ev.id}`) : '';
  sheet.dataset.reopen = enAsistente ? 'asis' : '';
  refrescarNetos();
}

/** Confirmación de lo que realmente entró en el mes. */
function fmConfirmar(evId) {
  const ev = eventoDe(evId);
  if (!ev) return;
  const conf = A.eventoConfirmado(D, evId, periodo);

  // De dónde sale lo que aparece relleno. Se mira una vez para la nota, pero
  // cada persona resuelve la suya: puede que a una se le copie y a otra no.
  const fuentes = D.personas.map(p => A.lineaParaConfirmar(D, ev, p.id, periodo));
  const copiado = fuentes.find(f => f.origen === 'copia');
  // Distinto de `copiado`: esto es lo que YA se copió con el atajo y quedó
  // guardado sin que nadie lo mirara.
  const yaCopiado = ((D.ingresosMes[periodo] || {}).copiado || {})[evId] || null;

  abrirSheet(`${ev.nombre} · ${mesLabel(periodo)}`, `
    <div class="field__h" style="margin-bottom:4px">
      ${conf ? 'Ya confirmaste este pago. Puedes corregirlo.'
             : 'Anota lo que realmente entró este mes: el bruto y las retenciones que aplicaron.'}
    </div>
    ${yaCopiado ? `<div class="note">
      <svg viewBox="0 0 24 24">${ICONO.warning}</svg>
      <div>Estos números se <b>copiaron de ${esc(mesLabel(yaCopiado))}</b> con el atajo y
      todavía no los ha revisado nadie. Compará con lo que de verdad entró y guardá:
      con eso deja de estar "sin revisar".</div>
    </div>` : !conf && copiado ? `<div class="note note--info">
      <svg viewBox="0 0 24 24">${ICONO.good}</svg>
      <div>Ya está lleno con lo de <b>${esc(mesLabel(copiado.desde))}</b>, que es lo último
      que confirmaron. Si el mes vino igual, solo dale a confirmar; si cambió algo,
      corregí el renglón que sea.</div>
    </div>` : ''}
    ${D.personas.map((p, i) => bloquePersona(p, fuentes[i].linea)).join('')}
    <button class="btn" data-act="guardar" style="margin-top:20px">Confirmar ${esc(mesLabel(periodo))}</button>
    <label class="field__h" style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;cursor:pointer">
      <input type="checkbox" id="f-tipico" style="margin-top:2px">
      <span>Guardar también como el <b>monto típico</b> de este pago. Sirve para que
      las estimaciones de los meses que vienen dejen de usar la cifra del asistente.</span>
    </label>
    ${conf ? `<button class="btn btn--ghost" data-act="desconfirmar" data-ev="${esc(evId)}" style="margin-top:8px">Volver a estimado</button>` : ''}
  `, () => {
    const lineas = leerPersonas();
    const mala = lineas.find(l => l.deducciones.reduce((s, d) => s + d.monto, 0) > l.bruto);
    if (mala) return fallo(`[data-persona="${mala.personaId}"] [data-k="bruto"]`,
                           'Las retenciones superan al bruto');
    if (!lineas.some(l => l.bruto > 0))
      return fallo('[data-k="bruto"]', 'Falta el monto que entró');

    const mes = D.ingresosMes[periodo] || {};
    // Un mes que llegó de la nube puede venir sin alguna de las dos partes;
    // sin esto, confirmar reventaba con "cannot set property of undefined".
    mes.lineas = mes.lineas || {};
    mes.confirmado = mes.confirmado || {};
    mes.lineas[evId] = {};
    lineas.forEach(l => { mes.lineas[evId][l.personaId] = l; });
    mes.confirmado[evId] = true;
    // Abrirlo y guardarlo ES revisarlo: deja de ser una copia a ciegas.
    if (mes.copiado) delete mes.copiado[evId];
    mes._upd = now();
    D.ingresosMes[periodo] = mes;

    // Que la plantilla siga a la realidad, si lo piden. Es opcional a propósito:
    // un mes con un bono o un descuento raro no debería reescribir el típico.
    const tip = $('#f-tipico', sheet);
    if (tip && tip.checked) {
      const actual = D.plantillaIngresos.find(e => e.id === evId);
      if (actual) {
        actual.lineas = lineas.map(l => ({ personaId: l.personaId, bruto: l.bruto,
                                           deducciones: l.deducciones.slice() }));
        actual._upd = now();
      }
    }
    return true;
  });
  refrescarNetos();
}

function fmGasto(id, enAsistente) {
  const listaDe = () => enAsistente ? asis.gastos : D.gastos;
  const tarjetas = enAsistente ? asis.tarjetas : D.tarjetas;
  const g = id ? listaDe().find(x => x.id === id) : null;

  abrirSheet(g ? 'Editar gasto' : 'Nuevo gasto', `
    ${campo('f-con', 'Concepto', `value="${esc(g ? g.concepto : '')}" placeholder="Comida, energía, pediatra…"`)}
    ${campo('f-mon', 'Monto mensual (L)', `type="number" inputmode="decimal" step="0.01" min="0" value="${g ? esc(String(g.monto)) : ''}" placeholder="0.00"`)}
    <div class="field"><label class="field__l" for="f-cat">Categoría</label>
      <select class="input" id="f-cat">
        ${CATEGORIAS.map(c => `<option value="${esc(c)}"${g && g.categoria === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
      </select></div>
    <div class="field"><label class="field__l" for="f-med">Cómo se paga</label>
      <select class="input" id="f-med">
        <option value="tarjeta"${!g || g.medioPago !== 'efectivo' ? ' selected' : ''}>Con tarjeta</option>
        <option value="efectivo"${g && g.medioPago === 'efectivo' ? ' selected' : ''}>Efectivo</option>
      </select>
      <div class="field__h">Esto no cambia el total del presupuesto; sirve para saber cuánto
        cae en el corte de la tarjeta.</div></div>
    ${tarjetas.length > 1 ? `<div class="field"><label class="field__l" for="f-tar">Con cuál tarjeta</label>
      <select class="input" id="f-tar">
        ${tarjetas.map(x => `<option value="${esc(x.id)}"${g && g.tarjetaId === x.id ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}
        <option value=""${g && !g.tarjetaId ? ' selected' : ''}>— cualquiera —</option>
      </select>
      <div class="field__h">Solo aplica si se paga con tarjeta. Con "cualquiera" el gasto
        se cuenta en el corte de todas, y ahí las cifras se inflan.</div></div>` : ''}
    ${campo('f-cre', 'Crecimiento mensual (%)',
      `type="number" inputmode="decimal" step="0.1" min="0" max="20" value="${g ? esc(String(g.crecimiento || 0)) : '0'}"`,
      'Déjalo en 0 si es estable. Para gastos de salud que van en aumento, 2–3% refleja la tendencia.')}
    <button class="btn" data-act="guardar" style="margin-top:20px">Guardar</button>
    ${g ? '<button class="btn btn--danger" data-act="borrar" style="margin-top:8px">Eliminar gasto</button>' : ''}
  `, () => {
    const concepto = val('#f-con');
    if (!concepto) return fallo('#f-con', 'Ponle un concepto');
    const monto = num('#f-mon');
    if (monto < 0) return fallo('#f-mon', 'El monto no puede ser negativo');
    const medioPago = val('#f-med');
    // En efectivo la tarjeta no pinta nada; con una sola no hay nada que elegir.
    const tarjetaId = medioPago === 'efectivo' ? null
      : tarjetas.length > 1 ? (val('#f-tar') || null)
      : g ? (g.tarjetaId || null)
      : (tarjetas[0] ? tarjetas[0].id : null);
    const datos = { concepto, monto, categoria: val('#f-cat'), medioPago, tarjetaId,
                    crecimiento: Math.min(20, Math.max(0, num('#f-cre'))), _upd: now() };
    const lista = listaDe();
    const actual = id ? lista.find(x => x.id === id) : null;
    if (actual) Object.assign(actual, datos);
    else lista.push(Object.assign({ id: uid() }, datos));
    return true;
  });
  sheet.dataset.del = g ? (enAsistente ? `asis-gasto:${g.id}` : `gasto:${g.id}`) : '';
  sheet.dataset.reopen = enAsistente ? 'asis' : '';
}

function fmTarjeta(id, enAsistente) {
  const listaDe = () => enAsistente ? asis.tarjetas : D.tarjetas;
  const eventos = enAsistente ? asis.eventos : D.plantillaIngresos;
  const t = id ? listaDe().find(x => x.id === id) : null;

  abrirSheet(t ? 'Editar tarjeta' : 'Nueva tarjeta', `
    ${campo('f-nom', 'Nombre', `value="${esc(t ? t.nombre : '')}" placeholder="Tarjeta principal"`)}
    <div class="field"><label class="field__l" for="f-tipo">Qué tipo es</label>
      <select class="input" id="f-tipo">
        <option value="credito"${!t || (t.tipo || 'credito') === 'credito' ? ' selected' : ''}>De crédito — se paga en el corte</option>
        <option value="debito"${t && t.tipo === 'debito' ? ' selected' : ''}>De débito — sale al instante de la cuenta</option>
      </select>
      <div class="field__h">La de débito descuenta del saldo en el momento de la compra.
        La de crédito no toca la cuenta hasta que pagas el corte.</div></div>
    ${!enAsistente && D.cuentas.length ? `<div class="field"><label class="field__l" for="f-cta">De qué cuenta sale</label>
      <select class="input" id="f-cta">
        <option value="">— sin cuenta —</option>
        ${D.cuentas.map(c => `<option value="${esc(c.id)}"${t && t.cuentaId === c.id ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('')}
      </select></div>` : ''}
    ${campo('f-num', 'Número de la tarjeta',
      `value="${esc(t && t.numero ? t.numero : '')}" placeholder="5140-00**-****-8941"`,
      'Basta con que coincidan los últimos cuatro. Sirve para enrutar los estados de cuenta.')}
    ${campo('f-lim', 'Fecha límite de pago (día del mes)',
      `type="number" inputmode="numeric" min="1" max="31" value="${t && t.diaPago ? esc(String(t.diaPago)) : ''}" placeholder="Ej. 27"`,
      'El día hasta el que pueden pagar sin intereses. No es el corte: es lo que viene después.')}
    <div class="field"><label class="field__l" for="f-pt">¿Pagan el total cada mes?</label>
      <select class="input" id="f-pt">
        <option value="si"${!t || t.pagaTotal !== false ? ' selected' : ''}>Sí, saldamos todo antes de la fecha límite</option>
        <option value="no"${t && t.pagaTotal === false ? ' selected' : ''}>No, dejamos saldo revolviendo</option>
      </select>
      <div class="field__h">Pagar el total significa <b>cero intereses</b>, sin importar la tasa.
        Solo cuesta lo que se deja revolver.</div></div>
    ${campo('f-deu', 'Cuánto deben hoy en esta tarjeta (L)',
      `type="number" inputmode="decimal" step="0.01" min="0" value="${t && t.saldoInicial != null ? esc(String(t.saldoInicial)) : ''}" placeholder="0.00"`,
      'El saldo que muestra el banco. Sirve para saber la deuda real, no solo el corte del mes.')}
    ${campo('f-des', 'Desde qué mes cuenta ese saldo', `type="month" value="${esc(t && t.desdeMes ? t.desdeMes : mesHoy())}"`)}
    <div class="sec" style="margin-top:20px"><span class="sec__t">Ancla del estado de cuenta</span></div>
    ${campo('f-sb', 'Saldo que dice el estado de cuenta (L)',
      `type="number" inputmode="decimal" step="0.01" min="0" value="${esc(t && t.saldoBanco && t.saldoBanco.monto != null ? String(t.saldoBanco.monto) : '')}" placeholder="0.00"`,
      'La cifra del banco manda sobre cualquier suma que haga la app. Es contra esto que cuadra el cierre del mes.')}
    ${campo('f-sbf', 'Fecha de ese saldo', `type="date" value="${esc(t && t.saldoBanco && t.saldoBanco.fecha ? t.saldoBanco.fecha : '')}"`,
      'Normalmente la fecha de corte. Al importar el estado de cuenta esto se llena solo.')}
    ${campo('f-ret', 'Consumos autorizados sin aplicar (L)',
      `type="number" inputmode="decimal" step="0.01" min="0" value="${esc(t && t.retenido && t.retenido.monto ? String(t.retenido.monto) : '')}" placeholder="0.00"`,
      'Compras ya hechas que el comercio no ha cobrado, así que todavía no salen en el estado de cuenta. Se deben igual: se suman a la deuda, no al capital.')}
    ${campo('f-tas', 'Interés anual (%)',
      `type="number" inputmode="decimal" step="0.1" min="0" max="200" value="${t && t.tasaAnual != null ? esc(String(t.tasaAnual)) : ''}" placeholder="Ej. 55"`,
      'Lo que cobra el banco por revolver saldo. Con esto puedo decirte cuánto les cuesta al mes no saldarla.')}
    ${campo('f-cor', 'Día de corte', `type="number" inputmode="numeric" min="1" max="31" value="${t ? esc(String(t.diaCorte)) : ''}" placeholder="1 a 31"`,
      'El día que cierra el estado de cuenta y se define lo que hay que pagar.')}
    <div class="field"><label class="field__l" for="f-pag">Qué pago la cubre</label>
      <select class="input" id="f-pag">
        <option value="">— sin asignar —</option>
        ${eventos.map(e => `<option value="${esc(e.id)}"${t && t.pagaCon === e.id ? ' selected' : ''}>${esc(e.nombre)} (día ${esc(String(e.dia))})</option>`).join('')}
      </select>
      <div class="field__h">Con esto puedo avisarte si ese ingreso alcanza a cubrir el corte.</div></div>
    <button class="btn" data-act="guardar" style="margin-top:20px">Guardar</button>
    ${t ? '<button class="btn btn--danger" data-act="borrar" style="margin-top:8px">Eliminar tarjeta</button>' : ''}
  `, () => {
    const nombre = val('#f-nom');
    if (!nombre) return fallo('#f-nom', 'Ponle un nombre');
    const tipo = val('#f-tipo') || 'credito';
    const corteCrudo = num('#f-cor');
    // La de débito no tiene corte: sale de la cuenta en el momento. Exigirlo
    // obligaba a inventarse un día para poder guardar.
    if (tipo === 'credito' && !corteCrudo) return fallo('#f-cor', 'Falta el día de corte');
    const diaCorte = Math.min(31, Math.max(1, corteCrudo));
    const datos = { nombre, numero: val('#f-num'), diaCorte, pagaCon: val('#f-pag'), tipo,
                    saldoInicial: num('#f-deu'), desdeMes: val('#f-des'),
                    diaPago: Math.min(31, Math.max(0, Math.round(num('#f-lim')))),
                    pagaTotal: val('#f-pt') !== 'no',
                    tasaAnual: Math.min(200, Math.max(0, num('#f-tas'))), _upd: now() };
    if (!enAsistente && D.cuentas.length) datos.cuentaId = val('#f-cta') || null;

    // El ancla solo se toca si la escribieron: si el campo va vacío se conserva
    // la que puso el importador, que suele ser más fresca que la memoria de uno.
    if (val('#f-ret') !== '') datos.retenido = { monto: num('#f-ret'), fecha: fechaLocal() };
    const sbFecha = val('#f-sbf'), sbMonto = val('#f-sb');
    if (sbFecha && sbMonto !== '') datos.saldoBanco = { monto: num('#f-sb'), fecha: sbFecha };
    else if (!sbFecha && sbMonto === '') datos.saldoBanco = t ? (t.saldoBanco || null) : null;
    else return fallo(sbFecha ? '#f-sb' : '#f-sbf', 'El saldo del banco necesita monto y fecha');
    const lista = listaDe();
    const actual = id ? lista.find(x => x.id === id) : null;
    if (actual) Object.assign(actual, datos);
    else lista.push(Object.assign({ id: uid() }, datos));
    return true;
  });
  sheet.dataset.del = t ? (enAsistente ? `asis-tarjeta:${t.id}` : `tarjeta:${t.id}`) : '';
  sheet.dataset.reopen = enAsistente ? 'asis' : '';
}

function fmFinanciamiento(id, enAsistente) {
  const listaDe = () => enAsistente ? asis.financiamientos : D.financiamientos;
  const f = id ? listaDe().find(x => x.id === id) : null;

  abrirSheet(f ? 'Editar financiamiento' : 'Nuevo financiamiento', `
    ${campo('f-nom', 'Qué es', `value="${esc(f ? f.nombre : '')}" placeholder="Refrigeradora a 12 meses…"`)}
    ${campo('f-cuo', 'Cuota mensual (L)', `type="number" inputmode="decimal" step="0.01" min="0" value="${f ? esc(String(f.cuotaMensual)) : ''}" placeholder="0.00"`)}
    <div class="field"><label class="field__l" for="f-tot">Cuotas</label>
      <div class="grid2">
        <input class="input" id="f-tot" type="number" inputmode="numeric" min="1" max="120" value="${f ? esc(String(f.cuotasTotales)) : ''}" placeholder="Total">
        <input class="input" id="f-pag" type="number" inputmode="numeric" min="0" max="120" value="${f ? esc(String(f.cuotasPagadas)) : '0'}" placeholder="Ya pagadas">
      </div>
      <div class="field__h">Con esto sé cuándo se libera esa cuota y el disponible sube.</div>
    </div>
    <button class="btn" data-act="guardar" style="margin-top:20px">Guardar</button>
    ${f ? '<button class="btn btn--danger" data-act="borrar" style="margin-top:8px">Eliminar</button>' : ''}
  `, () => {
    const nombre = val('#f-nom');
    if (!nombre) return fallo('#f-nom', 'Ponle un nombre');
    const cuotaMensual = num('#f-cuo');
    const cuotasTotales = Math.round(num('#f-tot'));
    if (cuotaMensual <= 0) return fallo('#f-cuo', 'Falta la cuota mensual');
    if (cuotasTotales <= 0) return fallo('#f-tot', 'Falta el total de cuotas');
    const cuotasPagadas = Math.min(cuotasTotales, Math.max(0, Math.round(num('#f-pag'))));
    const datos = { nombre, cuotaMensual, cuotasTotales, cuotasPagadas, _upd: now() };
    const lista = listaDe();
    const actual = id ? lista.find(x => x.id === id) : null;
    if (actual) Object.assign(actual, datos);
    else lista.push(Object.assign({ id: uid(), tarjetaId: null }, datos));
    return true;
  });
  sheet.dataset.del = f ? (enAsistente ? `asis-fin:${f.id}` : `fin:${f.id}`) : '';
  sheet.dataset.reopen = enAsistente ? 'asis' : '';
}

function fmProyecto(id) {
  const p = id ? D.proyectos.find(x => x.id === id) : null;
  abrirSheet(p ? 'Editar proyecto' : 'Nuevo proyecto', `
    ${campo('f-nom', 'Nombre', `value="${esc(p ? p.nombre : '')}" placeholder="Lavadora, viaje, carro…"`)}
    <div class="field"><label class="field__l" for="f-min">Costo estimado (L)</label>
      <div class="grid2">
        <input class="input" id="f-min" type="number" inputmode="decimal" step="0.01" min="0" value="${p ? esc(String(p.costoMin)) : ''}" placeholder="Mínimo">
        <input class="input" id="f-max" type="number" inputmode="decimal" step="0.01" min="0" value="${p ? esc(String(p.costoMax)) : ''}" placeholder="Máximo">
      </div>
      <div class="field__h">Si no hay cotización firme, pon el rango: calculo los dos escenarios.</div>
    </div>
    ${campo('f-apo', 'Cuánto apartar al mes (L)', `type="number" inputmode="decimal" step="0.01" min="0" value="${p && +p.aporteMensual ? esc(String(p.aporteMensual)) : ''}" placeholder="Vacío = lo sugiero yo"`)}
    ${campo('f-fec', 'Fecha objetivo', `type="month" value="${esc(p && p.fechaObjetivo ? p.fechaObjetivo.slice(0, 7) : '')}"`,
      'Opcional. Si la pones, calculo la cuota necesaria y aviso si no da.')}
    ${campo('f-nota', 'Nota', `value="${esc(p ? (p.nota || '') : '')}" placeholder="Para qué es"`)}

    <div class="sec" style="margin-top:22px"><span class="sec__t">Para poder priorizarlo</span></div>
    <div class="field__h">Sin esto solo puedo decirles si el dinero alcanza. Con esto puedo
      decirles si <b>conviene</b>, que es la pregunta que de verdad importa.</div>

    <div class="field"><label class="field__l" for="f-tipo">¿Qué tan necesario es?</label>
      <select class="input" id="f-tipo">
        ${[['salud', 'Salud — una muela, una medicina, algo del cuerpo'],
           ['seguridad', 'Seguridad — evita un daño mayor o un peligro'],
           ['esencial', 'Esencial — hace falta de verdad, no es un gusto'],
           ['productivo', 'Productivo — genera ingreso o ahorra dinero después'],
           ['deseo', 'Deseo — un gusto, puede esperar']]
          .map(([v, txt]) => `<option value="${esc(v)}"${A.tipoDe(p || {}) === v ? ' selected' : ''}>${esc(txt)}</option>`).join('')}
      </select>
      <div class="field__h">Salud y seguridad van antes que cualquier gusto, tengan o no el
        dinero junto. Es lo único que impide que un antojo se cuele adelante de una urgencia.</div></div>

    <div class="field"><label class="field__l" for="f-urg">¿Para cuándo?</label>
      <select class="input" id="f-urg">
        ${[['ya', 'Ya — no aguanta más'],
           ['este_ano', 'Este año'],
           ['algun_dia', 'Algún día, sin prisa']]
          .map(([v, txt]) => `<option value="${esc(v)}"${A.urgenciaDe(p || {}) === v ? ' selected' : ''}>${esc(txt)}</option>`).join('')}
      </select></div>

    ${campo('f-cons', '¿Qué pasa si no lo hacen este año?',
      `value="${esc(p ? (p.consecuencia || '') : '')}" placeholder="Empeora y toca endodoncia; puedo chocar; nada, es un gusto"`,
      'Esta es la pregunta que más pesa. Escrita hoy, es lo que va a justificar el orden dentro de seis meses — y lo que aparece en el informe cuando toque explicar por qué algo se pospuso.')}

    <button class="btn" data-act="guardar" style="margin-top:20px">Guardar</button>
    ${p ? '<button class="btn btn--danger" data-act="borrar" style="margin-top:8px">Eliminar proyecto</button>' : ''}
  `, () => {
    const nombre = val('#f-nom');
    if (!nombre) return fallo('#f-nom', 'Ponle un nombre');
    let costoMin = num('#f-min'), costoMax = num('#f-max');
    if (costoMin <= 0 && costoMax <= 0) return fallo('#f-min', 'Falta el costo estimado');
    if (costoMax <= 0) costoMax = costoMin;
    if (costoMin <= 0) costoMin = costoMax;
    if (costoMin > costoMax) { const t = costoMin; costoMin = costoMax; costoMax = t; }
    const datos = { nombre, costoMin, costoMax, aporteMensual: num('#f-apo'),
                    fechaObjetivo: val('#f-fec'), nota: val('#f-nota'),
                    tipo: val('#f-tipo') || 'deseo', urgencia: val('#f-urg') || 'algun_dia',
                    consecuencia: val('#f-cons'), _upd: now() };
    const actual = id ? D.proyectos.find(x => x.id === id) : null;
    if (actual) Object.assign(actual, datos);
    else D.proyectos.push(Object.assign({ id: uid(), aportes: [] }, datos));
    return true;
  });
  sheet.dataset.del = p ? `proyecto:${p.id}` : '';
}

function fmAporte(pid, apId) {
  const p = D.proyectos.find(x => x.id === pid);
  if (!p) return;
  p.aportes = p.aportes || [];
  const ap = apId ? p.aportes.find(x => x.id === apId) : null;

  abrirSheet(`${ap ? 'Editar aporte' : 'Aporte'} · ${p.nombre}`, `
    <div class="field"><label class="field__l" for="f-per">Quién aporta</label>
      <select class="input" id="f-per">${D.personas.map(x => `<option value="${esc(x.id)}"${ap && ap.personaId === x.id ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></div>
    ${campo('f-mon', 'Monto (L)', `type="number" inputmode="decimal" step="0.01" min="0" value="${ap ? esc(String(ap.monto)) : ''}" placeholder="0.00"`)}
    ${campo('f-fec', 'Fecha', `type="date" value="${esc(ap && ap.fecha ? ap.fecha : fechaLocal())}"`)}
    ${campo('f-nota', 'Nota', `value="${esc(ap ? (ap.nota || '') : '')}" placeholder="De dónde salió"`)}
    <button class="btn" data-act="guardar" style="margin-top:20px">Guardar aporte</button>
    ${ap ? '<button class="btn btn--danger" data-act="borrar" style="margin-top:8px">Eliminar aporte</button>' : ''}
  `, () => {
    const m = num('#f-mon');
    if (m <= 0) return fallo('#f-mon', 'El aporte debe ser mayor que cero');
    const datos = { personaId: val('#f-per'), monto: m, fecha: val('#f-fec') || fechaLocal(),
                    nota: val('#f-nota'), _upd: now() };
    const padre = D.proyectos.find(x => x.id === pid);
    if (!padre) { toast('Ese proyecto ya no existe'); return false; }
    padre.aportes = padre.aportes || [];
    const actual = apId ? padre.aportes.find(x => x.id === apId) : null;
    if (actual) Object.assign(actual, datos);
    else padre.aportes.push(Object.assign({ id: uid() }, datos));
    padre._upd = now();
    return true;
  });
  sheet.dataset.del = ap ? `aporte:${ap.id}` : '';
  sheet.dataset.padre = pid;
}

/**
 * `pre` viene del escaneo de una factura: { reg, datos }. Rellena el
 * formulario pero NUNCA guarda solo — un total mal leído que entra sin
 * revisión ensucia el presupuesto sin que nadie se entere.
 */
function fmMovimiento(id, pre) {
  const m = id ? D.movimientos.find(x => x.id === id) : null;
  const hoy = fechaLocal();
  const d = pre && pre.datos;

  // La categoría llega como texto; hay que casarla con un gasto real del plan.
  const catSugerida = d
    ? (D.gastos.find(g => g.concepto.toLowerCase() === String(d.categoria || '').toLowerCase()) || {}).id || 'otros'
    : null;

  const sel = (gastoId) => m ? m.gastoId === gastoId : catSugerida === gastoId;
  const vMonto = m ? String(m.monto) : d && d.total > 0 ? String(d.total) : '';
  const vMedio = m ? m.medioPago : d ? d.medioPago : 'tarjeta';
  const vTarjeta = m ? (m.tarjetaId || (D.tarjetas[0] || {}).id) : (D.tarjetas[0] || {}).id;
  const vFecha = m ? m.fecha : d && d.fecha ? d.fecha : hoy;
  const vDet   = m ? (m.concepto || '')
                   : d ? [d.comercio, d.detalle].filter(Boolean).join(' · ').slice(0, 80) : '';

  abrirSheet(m ? 'Editar gasto' : d ? 'Revisar factura' : 'Registrar gasto', `
    ${d ? bloqueLectura(pre) : ''}
    <div class="field"><label class="field__l" for="f-cat">Categoría</label>
      <select class="input" id="f-cat">
        ${D.gastos.map(g => `<option value="${esc(g.id)}"${sel(g.id) ? ' selected' : ''}>${esc(g.concepto)}</option>`).join('')}
        <option value="otros"${sel('otros') ? ' selected' : ''}>Otros</option>
      </select></div>
    ${campo('f-mon', 'Monto (L)', `type="number" inputmode="decimal" step="0.01" min="0" value="${esc(vMonto)}" placeholder="0.00"`)}
    <div class="field"><label class="field__l" for="f-med">Cómo se pagó</label>
      <select class="input" id="f-med">
        <option value="tarjeta"${vMedio !== 'efectivo' ? ' selected' : ''}>Con tarjeta</option>
        <option value="efectivo"${vMedio === 'efectivo' ? ' selected' : ''}>Efectivo</option>
      </select></div>
    ${D.tarjetas.length > 1 ? `<div class="field"><label class="field__l" for="f-tar">Con cuál tarjeta</label>
      <select class="input" id="f-tar">
        ${D.tarjetas.map(x => `<option value="${esc(x.id)}"${vTarjeta === x.id ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}
      </select>
      <div class="field__h">Define en qué corte cae este consumo.</div></div>` : ''}
    <div class="field"><label class="field__l" for="f-per">Quién pagó</label>
      <select class="input" id="f-per">${D.personas.map(x => `<option value="${esc(x.id)}"${m && m.personaId === x.id ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></div>
    ${campo('f-fec', 'Fecha', `type="date" value="${esc(vFecha)}"`)}
    ${campo('f-con', 'Detalle', `value="${esc(vDet)}" placeholder="Dónde o en qué"`)}
    <button class="btn" data-act="guardar" style="margin-top:20px">${d ? 'Confirmar y guardar' : 'Guardar'}</button>
    ${m ? '<button class="btn btn--danger" data-act="borrar" style="margin-top:8px">Eliminar</button>' : ''}
    ${d ? '<button class="btn btn--danger" data-act="descartar-factura" style="margin-top:8px">Descartar la foto</button>' : ''}
  `, () => {
    const monto = num('#f-mon');
    if (monto <= 0) return fallo('#f-mon', 'El monto debe ser mayor que cero');
    const fecha = val('#f-fec') || hoy;
    const medioPago = val('#f-med');
    // Al editar no se puede reasignar la tarjeta a ciegas: cambiaría de corte
    // un consumo ya cuadrado. Solo manda lo que el usuario escogió.
    const tarjetaId = medioPago === 'efectivo' ? null
      : D.tarjetas.length > 1 ? (val('#f-tar') || null)
      : m ? (m.tarjetaId || (D.tarjetas[0] ? D.tarjetas[0].id : null))
      : (D.tarjetas[0] ? D.tarjetas[0].id : null);
    const reg = { gastoId: val('#f-cat'), monto, personaId: val('#f-per'), medioPago, tarjetaId,
                  fecha, periodo: perDe(fecha), concepto: val('#f-con'), _upd: now() };
    const actual = id ? D.movimientos.find(x => x.id === id) : null;
    // Si corrigen el rubro de algo que vino del banco, se recuerda el comercio
    // y la próxima importación ya lo clasifica sola.
    if (actual && actual.origen === 'import' && actual.concepto && window.Importar) {
      const k = window.Importar.claveComercio(actual.concepto);
      if (k && reg.gastoId && reg.gastoId !== 'otros') {
        D.comercios = D.comercios || {};
        D.comercios[k] = reg.gastoId;
      }
    }
    if (actual) Object.assign(actual, reg);
    else D.movimientos.push(Object.assign({ id: uid(), facturaId: pre ? pre.reg.id : null }, reg));
    if (pre) { window.Facturas.borrar(pre.reg.id).then(refrescarCola); }
    return true;
  });
  sheet.dataset.del = m ? `movimiento:${m.id}` : '';
  sheet.dataset.factura = pre ? pre.reg.id : '';
}

/** Cabecera de la revisión: la foto, la confianza y lo que quedó dudoso. */
function bloqueLectura(pre) {
  const d = pre.datos;
  const pct = Math.round((+d.confianza || 0) * 100);
  const flojo = !d.legible || pct < 70;
  return `
    <div class="lectura">
      <img class="lectura__foto" src="${esc(pre.reg.dataUrl)}" alt="Foto de la factura">
      <div class="lectura__txt">
        <div class="lectura__t">${esc(d.comercio || 'Sin comercio')}</div>
        <div class="lectura__s">${esc(d.moneda || 'HNL')} ${esc(nf2.format(+d.total || 0))}
          · ${esc(d.fecha || '')}</div>
        <span class="badge badge--${flojo ? 'serious' : 'good'}" style="margin-top:6px">
          <svg viewBox="0 0 24 24" aria-hidden="true">${flojo ? ICONO.warning : ICONO.good}</svg>
          ${flojo ? 'Revisa bien' : 'Lectura clara'} · ${pct}%
        </span>
      </div>
    </div>
    ${d.nota ? `<div class="field__h" style="margin-top:8px">${esc(d.nota)}</div>` : ''}
    <div class="field__h" style="margin-top:8px">
      Todo lo de abajo lo leyó la IA de la foto. <b>Revísalo antes de guardar</b> —
      nada entra al presupuesto hasta que confirmes.
    </div>`;
}

/** Pago de una tarjeta de crédito: sale de una cuenta y salda el corte. */
function fmPagoTarjeta(id) {
  const x = id ? D.pagosTarjeta.find(p => p.id === id) : null;
  const credito = D.tarjetas.filter(t => (t.tipo || 'credito') === 'credito');
  if (!credito.length) { toast('No hay tarjetas de crédito registradas'); return; }
  if (!D.cuentas.length) { toast('Primero registra la cuenta de donde sale el dinero'); return; }

  const hoy = fechaLocal();
  const tarjeta = x ? credito.find(t => t.id === x.tarjetaId) : credito[0];
  const pend = tarjeta ? A.pagoPendiente(D, tarjeta, periodo) : null;

  abrirSheet(x ? 'Editar pago de tarjeta' : 'Pagar tarjeta', `
    <div class="note note--info">
      <svg viewBox="0 0 24 24">${ICONO.warning}</svg>
      <div>Esto <b>no es un gasto nuevo</b>: los consumos ya están contados. Es el dinero
      saliendo de la cuenta para saldar la tarjeta.</div>
    </div>
    ${!x && pend ? `<div class="field__h" style="margin-top:12px">
      El corte de <b>${esc(tarjeta.nombre)}</b> en ${esc(mesLabel(periodo))} va en
      <b>${esc(money(pend.aCubrir))}</b>${pend.pagado > 0 ? `, y ya llevan ${esc(money(pend.pagado))} pagados` : ''}.</div>` : ''}
    <div class="field"><label class="field__l" for="f-tar">Qué tarjeta</label>
      <select class="input" id="f-tar">
        ${credito.map(t => `<option value="${esc(t.id)}"${x && x.tarjetaId === t.id ? ' selected' : ''}>${esc(t.nombre)}</option>`).join('')}
      </select></div>
    <div class="field"><label class="field__l" for="f-cta">De qué cuenta sale</label>
      <select class="input" id="f-cta">
        ${D.cuentas.map(c => `<option value="${esc(c.id)}"${x && x.cuentaId === c.id ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('')}
      </select></div>
    ${campo('f-mon', 'Cuánto pagaste (L)', `type="number" inputmode="decimal" step="0.01" min="0" value="${x ? esc(String(x.monto)) : (pend && pend.pendiente > 0 ? esc(String(Math.round(pend.pendiente * 100) / 100)) : '')}" placeholder="0.00"`)}
    ${campo('f-fec', 'Fecha', `type="date" value="${esc(x ? x.fecha : hoy)}"`)}
    ${campo('f-nota', 'Nota', `value="${esc(x ? (x.nota || '') : '')}" placeholder="Giro desde Ficohsa"`)}
    <button class="btn" data-act="guardar" style="margin-top:20px">Guardar pago</button>
    ${x ? '<button class="btn btn--danger" data-act="borrar" style="margin-top:8px">Eliminar</button>' : ''}
  `, () => {
    const monto = num('#f-mon');
    if (monto <= 0) return fallo('#f-mon', 'El monto debe ser mayor que cero');
    const fecha = val('#f-fec') || hoy;
    const reg = { tarjetaId: val('#f-tar'), cuentaId: val('#f-cta'), monto, fecha,
                  periodo: perDe(fecha), nota: val('#f-nota'), _upd: now() };
    const actual = id ? D.pagosTarjeta.find(p => p.id === id) : null;
    if (actual) Object.assign(actual, reg);
    else D.pagosTarjeta.push(Object.assign({ id: uid() }, reg));
    return true;
  });
  sheet.dataset.del = x ? `pagoTarjeta:${x.id}` : '';
}

function fmRetiro(id) {
  const r = id ? D.retiros.find(x => x.id === id) : null;
  const hoy = fechaLocal();
  abrirSheet(r ? 'Editar retiro' : 'Retiro de efectivo', `
    <div class="note note--info">
      <svg viewBox="0 0 24 24">${ICONO.warning}</svg>
      <div>Un retiro <b>no es un gasto</b>: solo pasa dinero de la cuenta a la cartera.
      No cambia el disponible del mes. Lo que sí cuenta es en qué se gaste ese efectivo.</div>
    </div>
    ${campo('f-mon', 'Cuánto sacaste (L)', `type="number" inputmode="decimal" step="0.01" min="0" value="${r ? esc(String(r.monto)) : ''}" placeholder="0.00"`)}
    ${D.cuentas.length ? `<div class="field"><label class="field__l" for="f-cta">De qué cuenta</label>
      <select class="input" id="f-cta">
        <option value="">— sin cuenta —</option>
        ${D.cuentas.map(c => `<option value="${esc(c.id)}"${r && r.cuentaId === c.id ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('')}
      </select></div>` : ''}
    <div class="field"><label class="field__l" for="f-per">Quién lo sacó</label>
      <select class="input" id="f-per">${D.personas.map(x => `<option value="${esc(x.id)}"${r && r.personaId === x.id ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></div>
    ${campo('f-fec', 'Fecha', `type="date" value="${esc(r ? r.fecha : hoy)}"`)}
    ${campo('f-nota', 'Nota', `value="${esc(r ? (r.nota || '') : '')}" placeholder="De qué cuenta, en qué cajero"`)}
    <button class="btn" data-act="guardar" style="margin-top:20px">Guardar retiro</button>
    ${r ? '<button class="btn btn--danger" data-act="borrar" style="margin-top:8px">Eliminar</button>' : ''}
  `, () => {
    const monto = num('#f-mon');
    if (monto <= 0) return fallo('#f-mon', 'El monto debe ser mayor que cero');
    const fecha = val('#f-fec') || hoy;
    const reg = { monto, personaId: val('#f-per'), fecha, periodo: perDe(fecha),
                  nota: val('#f-nota'), _upd: now() };
    if (D.cuentas.length) reg.cuentaId = val('#f-cta') || null;
    const actual = id ? D.retiros.find(x => x.id === id) : null;
    if (actual) Object.assign(actual, reg);
    else D.retiros.push(Object.assign({ id: uid() }, reg));
    return true;
  });
  sheet.dataset.del = r ? `retiro:${r.id}` : '';
}

/* ---------- escaneo de facturas ---------- */

async function refrescarCola() {
  if (!window.Facturas || !Facturas.soportado) return;
  try { colaFacturas = await Facturas.pendientes(); }
  catch (e) { colaFacturas = []; }
  render();
}

const categoriasPlan = () => D.gastos.map(g => g.concepto).concat('Otros');

async function escanearFactura() {
  if (!window.Facturas || !Facturas.soportado) {
    toast('Este navegador no soporta el escaneo'); return;
  }

  let foto;
  try { foto = await Facturas.capturar(); }
  catch (e) { if (e) toast(e.message || 'No se pudo usar la foto'); return; }

  const reg = await Facturas.encolar(foto);

  if (!Facturas.configurado()) {
    await refrescarCola();
    toast('Foto guardada. Se leerá cuando conectes la nube.');
    return;
  }
  if (!navigator.onLine) {
    await refrescarCola();
    toast('Sin señal. Se leerá al volver la conexión.');
    return;
  }

  abrirSheet('Leyendo la factura', `
    <div class="lectura">
      <img class="lectura__foto" src="${esc(reg.dataUrl)}" alt="Factura">
      <div class="lectura__txt">
        <div class="lectura__t">Leyendo…</div>
        <div class="lectura__s">Tarda unos segundos.</div>
      </div>
    </div>
    <div class="progreso" style="margin-top:18px"><div class="progreso__f progreso__f--indef"></div></div>`);

  try {
    const datos = await Facturas.leer(reg, categoriasPlan());
    cerrarSheet();
    if (!datos || datos.legible === false) {
      await refrescarCola();
      toast('No se pudo leer esa foto. Registra el gasto a mano.');
      return;
    }
    fmMovimiento(null, { reg, datos });
  } catch (e) {
    cerrarSheet();
    await refrescarCola();
    toast(e.message || 'No se pudo leer la factura');
  }
}

async function reintentarFacturas() {
  toast('Leyendo pendientes…');
  const hechas = await Facturas.procesarPendientes(categoriasPlan());
  await refrescarCola();
  if (!hechas) { toast('No se pudo leer ninguna todavía'); return; }

  const listas = (await Facturas.todas()).filter(f => f.estado === 'leida');
  if (listas.length) fmMovimiento(null, { reg: listas[0], datos: listas[0].resultado });
}

function fmPeriodo() {
  // Los meses del HOGAR, no los del calendario, y contados con sumaMeses: con
  // `setMonth(-1)` sobre un día 31 el navegador se salta meses enteros
  // (31 de junio no existe y lo corre al 1 de julio), así que el 29, 30 y 31
  // la lista aparecía con huecos.
  const hoy = mesHoy();
  const keys = new Set([periodo, hoy]);
  ['movimientos', 'retiros', 'pagosTarjeta'].forEach(col =>
    (D[col] || []).forEach(x => keys.add(perReg(x))));
  Object.keys(D.ingresosMes || {}).forEach(k => keys.add(k));
  Object.keys(D.presupuestoMes || {}).forEach(k => keys.add(k));
  for (let i = 0; i < 12; i++) keys.add(A.sumaMeses(hoy, -i));
  const lista = Array.from(keys).filter(Boolean).sort().reverse();

  abrirSheet('Mes', `
    <div class="field"><label class="field__l" for="f-ini">El mes del hogar arranca el día</label>
      <input class="input" id="f-ini" type="number" inputmode="numeric" min="1" max="28"
             value="${esc(String(A.inicioMes(D)))}">
      <div class="field__h">Si viven por el ciclo de la tarjeta, pongan el día siguiente al corte.
        Con corte el 6, aquí va <b>7</b>: agosto sería del 7 de agosto al 6 de septiembre.
        Déjenlo en 1 para usar el mes de calendario.</div>
      <button class="btn btn--ghost" data-act="set-inicio" style="margin-top:10px">Aplicar</button>
    </div>
    <div class="sec"><span class="sec__t">Ir a</span></div>
    <div class="card card--flush" style="margin-top:6px">
    ${lista.map(k => {
      const r = D.plantillaIngresos.length ? A.ingresoMes(D, k) : null;
      return `
      <button class="row" data-act="set-periodo" data-k="${esc(k)}">
        <div class="row__main"><div class="row__t">${esc(mesLabel(k))}</div>
        <div class="row__s">${esc(mesRango(k))}${mesRango(k) && r ? ' · ' : ''}${r ? (r.confirmado ? 'confirmado' : r.parcial ? 'parcialmente confirmado' : 'estimado') : ''}</div></div>
        ${k === periodo ? '<svg class="row__chev" viewBox="0 0 24 24" style="color:var(--seq-400);stroke-width:2.4"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : ''}
      </button>`;
    }).join('')}
  </div>`);
}

function fmSync() {
  const s = window.Sync.estado();
  const bloqueSesion = !s.configurado ? '' : s.autenticado ? `
    <div class="sec"><span class="sec__t">Sesión</span></div>
    <div class="card card--flush" style="margin-top:12px">
      <div class="row"><div class="row__main">
        <div class="row__t">${esc(s.correo || 'Sesión activa')}</div>
        <div class="row__s">Este teléfono está conectado al hogar</div>
      </div></div>
    </div>
    <button class="btn btn--danger" data-act="salir" style="margin-top:8px">Cerrar sesión</button>`
  : `
    <div class="sec"><span class="sec__t">Entrar</span></div>
    ${campo('f-mail', 'Correo', 'type="email" autocapitalize="off" autocomplete="username" spellcheck="false" placeholder="tucorreo@ejemplo.com"')}
    ${campo('f-pass', 'Contraseña', 'type="password" autocomplete="current-password" placeholder="••••••••"')}
    <button class="btn" data-act="entrar" style="margin-top:16px">Iniciar sesión</button>`;

  abrirSheet('Sincronización', `
    <div class="card" style="margin-top:6px">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="syncdot" data-state="${esc(s.estado)}"></span>
        <div><div style="font-weight:650;font-size:14.5px">${esc(s.titulo)}</div>
        <div style="font-size:12.5px;color:var(--muted)">${esc(s.detalle)}</div></div>
      </div>
    </div>
    ${!s.configurado ? `
    <div class="note"><svg viewBox="0 0 24 24">${ICONO.warning}</svg>
      <div>Sin la nube conectada, este teléfono guarda sus <b>propios</b> datos.</div></div>` : ''}

    <div class="sec"><span class="sec__t">Proyecto</span></div>
    ${campo('f-url', 'URL del proyecto Supabase', `value="${esc(s.url)}" placeholder="https://xxxx.supabase.co" autocapitalize="off" autocomplete="off" spellcheck="false"`)}
    ${campo('f-key', 'Clave pública (anon)', `value="${esc(s.key)}" placeholder="eyJhbGciOi…" autocapitalize="off" autocomplete="off" spellcheck="false"`)}
    ${campo('f-hog', 'Nombre del hogar', `value="${esc(s.hogar)}" placeholder="melgar-vallejos" autocapitalize="off" spellcheck="false"`,
      'Debe ser idéntico en los dos teléfonos.')}
    <button class="btn btn--ghost" data-act="guardar" style="margin-top:16px">Guardar proyecto</button>
    ${bloqueSesion}
    <div class="sec"><span class="sec__t">Respaldo manual</span></div>
    <button class="btn btn--ghost" data-act="importar" style="margin-top:12px">
      <svg viewBox="0 0 24 24"><path d="M12 14.5v-11M12 3.5l-4 4M12 3.5l4 4M4.5 16v3.5h15V16"/></svg> Importar respaldo</button>
  `, () => {
    window.Sync.configurar(val('#f-url'), val('#f-key'), val('#f-hog') || 'hogar');
    window.Sync.arrancar(D, aplicarRemoto, pintarSync);
    toast('Proyecto guardado');
    return true;
  });
  sheet.dataset.reopen = 'sync';
}

/* ---------- exportar / importar / reiniciar ---------- */

/* ---------- cierre de mes ---------- */

/**
 * Congela el presupuesto de los meses que ya terminaron.
 *
 * Se hace solo, al abrir la app. Sin esto, bajar un rubro hoy cambiaría el
 * plan de todos los meses pasados y la historia se reescribiría sola: un mes
 * que se cumplió aparecería de pronto excedido.
 */
function congelarMesesPasados() {
  const hoy = mesHoy();
  D.presupuestoMes = D.presupuestoMes || {};
  let n = 0;

  const meses = new Set();
  D.movimientos.forEach(m => { const p = perReg(m); if (p && p < hoy) meses.add(p); });
  Object.keys(D.ingresosMes || {}).forEach(k => { if (k < hoy) meses.add(k); });

  meses.forEach(per => {
    if (D.presupuestoMes[per]) return;
    D.presupuestoMes[per] = { montos: A.fotoDelPlan(D), cerrado: false, notas: {}, _upd: now() };
    n++;
  });
  return n;
}

function fmCerrarMes(per) {
  const mes = per || periodo;
  const c = A.cierreDeMes(D, mes);
  const terminado = mes < mesHoy();

  const fila = f => `
    <div class="row" style="display:block">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
        <span class="row__t">${esc(f.concepto)}</span>
        <span class="row__v ${f.excedido ? 'is-neg' : ''}">${esc(money(f.real))}</span>
      </div>
      <div class="bar" style="height:6px;margin-top:7px"><div class="bar__f ${f.excedido ? 'is-over' : ''}"
        style="width:${Math.min(100, f.plan > 0 ? f.real / f.plan * 100 : 100).toFixed(1)}%"></div></div>
      <div style="margin-top:5px;font-size:11.5px;color:var(--muted)">
        ${f.plan > 0 ? `de ${esc(money(f.plan))} · ` : 'sin presupuesto · '}
        ${f.excedido ? `<b style="color:var(--critical)">${esc(money(f.diferencia))} por encima</b>`
                     : f.plan > 0 ? `quedaron ${esc(money(-f.diferencia))}` : ''}
      </div>
      ${f.excedido ? `
        <input class="input" style="margin-top:8px" data-nota="${esc(f.gastoId)}"
               value="${esc(f.nota)}" placeholder="¿Por qué se pasaron?"
               ${c.cerrado ? 'disabled' : ''}>` : ''}
    </div>`;

  abrirSheet(`Cierre de ${mesLabel(mes)}`, `
    ${c.cerrado ? `
      <div class="consejo consejo--good">
        <div class="consejo__t">Mes cerrado</div>
        <div class="consejo__c">Se cerró el ${esc(diaMes(String(c.cerradoEl).slice(0, 10)))}.
          Su presupuesto quedó fijo y ya no cambia aunque ajustes el plan.</div>
      </div>`
    : !terminado ? `
      <div class="note note--info">
        <svg viewBox="0 0 24 24">${ICONO.warning}</svg>
        <div>${esc(mesLabel(mes))} todavía no termina. Podés mirar cómo va, pero
        conviene cerrarlo cuando pase el ${esc(String(A.rangoPeriodo(mes, A.inicioMes(D)).hasta.slice(8)))}.</div>
      </div>` : ''}

    <div class="tiles" style="margin-top:14px">
      <div class="tile">
        <div class="tile__l">Presupuestado</div>
        <div class="tile__v">${esc(moneyC(c.plan))}</div>
      </div>
      <div class="tile">
        <div class="tile__l">Gastado</div>
        <div class="tile__v" style="${c.dentro ? '' : 'color:var(--critical)'}">${esc(moneyC(c.gastado))}</div>
        <div class="tile__d">${c.dentro ? esc(money(-c.diferencia)) + ' por debajo'
                                        : esc(money(c.diferencia)) + ' por encima'}</div>
      </div>
    </div>

    ${c.ingreso > 0 ? `<div class="card" style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
        <div style="font-size:14.5px;font-weight:650">Quedó del mes</div>
        <div style="font-size:20px;font-weight:750;letter-spacing:-.03em;${c.quedo < 0 ? 'color:var(--critical)' : ''}">${esc(money(c.quedo))}</div>
      </div>
      <div class="field__h" style="margin-top:6px">
        ${esc(money(c.ingreso))} de ingreso${c.ingresoConfirmado ? ' confirmado' : ' <b>estimado</b>'}
        menos ${esc(money(c.gastado))} gastados.
      </div>
    </div>` : ''}

    <div class="sec"><span class="sec__t">Rubro por rubro</span></div>
    <div class="card card--flush">${c.filas.map(fila).join('')}</div>

    ${c.excedidos.length ? `<div class="field__h" style="margin-top:10px">
      Se pasaron en ${esc(plural(c.excedidos.length, 'rubro', 'rubros'))}. La nota es
      <b>obligatoria</b>: dentro de tres meses no te vas a acordar, y esa nota es la
      diferencia entre un descuido y una decisión.</div>` : ''}

    ${bloqueConciliaciones(c, mes)}

    ${!c.cerrado ? `
      ${c.bloqueos.length ? `
        <div class="consejo consejo--critical" style="margin-top:20px">
          <div class="consejo__t">Falta ${esc(plural(c.bloqueos.length, 'cosa', 'cosas'))} para poder cerrar</div>
          <div class="consejo__c"><ul style="margin:6px 0 0;padding-left:18px">
            ${c.bloqueos.map(b => `<li>${esc(b.texto)}</li>`).join('')}
          </ul></div>
        </div>
        <div class="field__h" style="margin-top:10px">
          Un cierre con un descuadre encima no sirve: al mes siguiente la apertura arrastra
          el error y ya nadie sabe de dónde salió. Corregí el registro, o anotá el ajuste
          con su explicación.
        </div>` : ''}
      ${c.bloqueos.length ? `<button class="btn btn--ghost" data-act="guardar-cierre" data-k="${esc(mes)}" style="margin-top:16px">
        Guardar lo anotado sin cerrar</button>` : ''}
      <button class="btn" data-act="confirmar-cierre" data-k="${esc(mes)}" style="margin-top:${c.bloqueos.length ? '8' : '20'}px">
        Cerrar ${esc(mesLabel(mes))}
      </button>
      <div class="field__h" style="margin-top:8px">
        Al cerrarlo, su presupuesto queda congelado para siempre y ${esc(mesLabel(A.sumaMeses(mes, 1)))}
        arranca con estos mismos saldos. Podrás seguir ajustando el plan de los meses que
        vienen sin tocar este.
      </div>` : ''}
  `, null, { full: true });
  sheet.dataset.cierre = mes;
}

/**
 * Las tres conciliaciones. Cada una enseña su ventana de fechas escrita, porque
 * el crédito va de corte a corte y el débito por el mes del hogar: leer una
 * cifra creyendo que corresponde al otro rango es el error más caro de todos.
 */
function bloqueConciliaciones(c, mes) {
  const conc = c.conciliaciones;
  const cerrado = c.cerrado;

  const fila = x => `
    <div class="card" style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
        <div>
          <div style="font-size:14.5px;font-weight:680;letter-spacing:-.015em">${esc(x.nombre)}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px">
            ${esc(x.ventana)} · ${esc(diaMes(x.desde))} al ${esc(diaMes(x.hasta))}
          </div>
        </div>
        ${x.cuadra
          ? '<span class="badge badge--good"><svg viewBox="0 0 24 24">' + ICONO.good + '</svg>Cuadra</span>'
          : x.resuelta
          ? '<span class="badge badge--serious"><svg viewBox="0 0 24 24">' + ICONO.warning + '</svg>Ajustado</span>'
          : '<span class="badge badge--critical"><svg viewBox="0 0 24 24">' + ICONO.critical + '</svg>No cuadra</span>'}
      </div>

      <div class="card card--flush" style="margin-top:10px;box-shadow:none">
        ${[['Saldo de apertura', x.apertura],
           x.consumido != null ? ['Consumido en el ciclo', x.consumido] : null,
           x.abonado != null ? ['Abonado en el ciclo', -x.abonado] : null,
           x.acreditado != null ? ['Acreditaciones confirmadas', x.acreditado] : null,
           x.gastadoDebito != null ? ['Compras con débito', -x.gastadoDebito] : null,
           x.retirado != null && x.clave !== 'efectivo' ? ['Retiros de cajero', -x.retirado] : null,
           x.pagado != null ? ['Pagos girados a la tarjeta', -x.pagado] : null,
           x.clave === 'efectivo' ? ['Retirado del banco', x.retirado] : null,
           x.clave === 'efectivo' ? ['Gastado en efectivo', -x.gastado] : null
          ].filter(Boolean).map(([l, v]) => `
          <div class="row"><div class="row__main"><div class="row__t" style="font-weight:500">${esc(l)}</div></div>
            <div class="row__v ${v < 0 ? 'is-muted' : ''}">${v < 0 ? '−' : ''}${esc(money(Math.abs(v)))}</div></div>`).join('')}
        <div class="total"><span>Debería haber</span><span>${esc(money(x.calculado))}</span></div>
      </div>

      ${x.sinDeclarar ? `
        <div class="field__h" style="margin-top:10px;color:var(--critical)">
          ${x.clave === 'efectivo'
            ? 'Cuenten el efectivo de la cartera y anótenlo abajo.'
            : 'Falta el saldo que declara el banco. Ponelo en la ficha, o importá el estado de cuenta.'}
        </div>`
      : `<div class="row" style="padding-left:0;padding-right:0">
          <div class="row__main"><div class="row__t" style="font-weight:500">Según el banco</div>
            ${x.anclaFecha ? `<div class="row__s">al ${esc(diaMes(x.anclaFecha))}</div>` : ''}</div>
          <div class="row__v">${esc(money(x.declarado))}</div></div>
        <div class="total" style="background:transparent">
          <span>Diferencia</span>
          <span ${x.cuadra ? '' : 'style="color:var(--critical)"'}>${esc(money(x.diferencia))}</span>
        </div>`}

      ${x.imposible ? `<div class="consejo consejo--critical" style="margin-top:10px">
        <div class="consejo__t">La bolsa de efectivo sale negativa</div>
        <div class="consejo__c">Han gastado más efectivo del que aparece retirado. O falta
          anotar un retiro, o un gasto quedó marcado como efectivo cuando fue con tarjeta.</div>
      </div>` : ''}

      ${x.clave === 'efectivo' && !cerrado ? `
        <div class="field" style="margin-top:10px">
          <label class="field__l" for="f-contado">Efectivo contado en la cartera (L)</label>
          <input class="input" id="f-contado" type="number" inputmode="decimal" step="0.01"
                 value="${x.declarado != null ? esc(String(x.declarado)) : ''}" placeholder="0.00">
        </div>` : ''}

      ${!x.cuadra && !cerrado ? `
        <div class="field" style="margin-top:10px">
          <label class="field__l">Ajuste con explicación</label>
          <div class="grid2">
            <input class="input" data-ajuste-monto="${esc(x.clave)}" type="number" inputmode="decimal" step="0.01"
                   value="${x.ajuste ? esc(String(x.ajuste.monto)) : (x.diferencia != null ? esc(String(x.diferencia)) : '')}" placeholder="Diferencia">
            <input class="input" data-ajuste-nota="${esc(x.clave)}"
                   value="${x.ajuste ? esc(x.ajuste.nota) : ''}" placeholder="¿Por qué no cuadra?">
          </div>
          <div class="field__h">Sin explicación el ajuste no vale. Un descuadre reconocido y
            escrito es información; uno escondido, no.</div>
        </div>` : x.ajuste && x.ajuste.nota ? `
        <div class="field__h" style="margin-top:8px">Ajustado por ${esc(money(x.ajuste.monto))}:
          ${esc(x.ajuste.nota)}</div>` : ''}
    </div>`;

  return `
    <div class="sec"><span class="sec__t">Que todo cuadre</span></div>
    <div class="field__h">Tres cuadres independientes. El del crédito va de corte a corte;
      el de la cuenta y el del efectivo, por el mes del hogar. No comparten fechas y por eso
      cada uno lleva las suyas escritas.</div>
    ${conc.todas.map(fila).join('')}`;
}

/**
 * Recoge del formulario todo lo que el cierre necesita: las justificaciones de
 * los excesos, el efectivo contado y los ajustes de descuadre. Se guarda aunque
 * todavía no se pueda cerrar, para no perder lo tecleado al repintar.
 */
function recogerCierre(mes) {
  const notas = {};
  $$('[data-nota]', sheet).forEach(i => {
    const v = i.value.trim();
    if (v) notas[i.dataset.nota] = v;
  });

  const ajustes = {};
  $$('[data-ajuste-nota]', sheet).forEach(i => {
    const clave = i.dataset.ajusteNota;
    const nota = i.value.trim();
    if (!nota) return;                       // sin explicación el ajuste no vale
    const m = $(`[data-ajuste-monto="${clave}"]`, sheet);
    ajustes[clave] = { monto: m ? (parseFloat(m.value) || 0) : 0, nota, _upd: now() };
  });

  D.presupuestoMes = D.presupuestoMes || {};
  const previo = D.presupuestoMes[mes] || {};
  const nuevo = Object.assign({}, previo, {
    // Si ya estaba congelado se respeta su foto: cerrar no cambia el plan que rigió.
    montos: previo.montos || A.fotoDelPlan(D),
    notas: Object.assign({}, previo.notas, notas),
    ajustes: Object.assign({}, previo.ajustes, ajustes),
    _upd: now()
  });

  const cont = $('#f-contado', sheet);
  if (cont && cont.value.trim() !== '') nuevo.efectivoContado = parseFloat(cont.value) || 0;

  D.presupuestoMes[mes] = nuevo;
}

function guardarAvanceCierre(mes) {
  recogerCierre(mes);
  persistir();
  fmCerrarMes(mes);
  const c = A.cierreDeMes(D, mes);
  toast(c.puedeCerrar ? 'Guardado. Ya se puede cerrar.'
                      : `Guardado. Falta: ${c.bloqueos[0].texto}`);
}

function confirmarCierre(mes) {
  recogerCierre(mes);
  const c = A.cierreDeMes(D, mes);

  // Los dos candados. Se validan aquí y no con el botón deshabilitado para que
  // se pueda teclear el ajuste y cerrar en un solo gesto.
  if (!c.puedeCerrar) {
    persistir();
    fmCerrarMes(mes);
    toast(`No se puede cerrar todavía: ${c.bloqueos[0].texto}`);
    return;
  }

  const saldos = A.saldosCierre(D, mes);
  const g = D.presupuestoMes[mes];
  g.cerrado = true;
  g.cerradoEl = now();
  g.saldosCierre = saldos;
  g._upd = now();

  // Regla dura: el cierre de un periodo siembra la apertura del siguiente.
  // Saldo final = saldo inicial, sin huecos ni saltos.
  const sig = A.sumaMeses(mes, 1);
  const prevSig = D.presupuestoMes[sig] || {};
  D.presupuestoMes[sig] = Object.assign({}, prevSig, {
    apertura: Object.assign({}, saldos, { fecha: A.rangoPeriodo(sig, A.inicioMes(D)).desde }),
    _upd: now()
  });

  persistir();
  cerrarSheet();
  render();
  toast(`${mesLabel(mes)} cerrado y cuadrado. ${mesLabel(sig)} arranca con esos saldos.`);
}

/* ---------- clasificar comercios ---------- */

/**
 * Asignar rubro a 400 movimientos uno por uno es el trabajo que veníamos
 * evitando. Pero el dinero no se reparte parejo: un puñado de comercios
 * concentra la mayor parte. Ordenados por monto, quince decisiones cubren
 * dos tercios del gasto — y valen para siempre, porque lo aprendido se
 * aplica también a lo que se importe después.
 */
function fmComercios() {
  const grupos = {};
  D.movimientos.forEach(m => {
    if (!m.concepto || !window.Importar) return;
    const k = window.Importar.claveComercio(m.concepto);
    if (!k) return;
    grupos[k] = grupos[k] || { k, n: 0, total: 0, muestra: m.concepto, rubro: D.comercios[k] || '' };
    grupos[k].n++;
    grupos[k].total += (+m.monto || 0);
  });

  const lista = Object.values(grupos).sort((a, b) => b.total - a.total);
  if (!lista.length) {
    abrirSheet('Comercios', `<div class="empty">
      <div class="empty__t">Nada que clasificar</div>
      <div class="empty__s">Importa tus estados de cuenta y aquí aparecen los comercios.</div></div>`);
    return;
  }

  const total = lista.reduce((s, x) => s + x.total, 0);
  const yaHecho = lista.filter(x => x.rubro).reduce((s, x) => s + x.total, 0);
  const pct = total > 0 ? (yaHecho / total) * 100 : 0;

  abrirSheet('Clasificar comercios', `
    <div class="field__h">
      Ordenados por cuánto se les ha ido. Asigna el rubro <b>una vez por comercio</b>:
      se aplica a todo lo ya registrado y a lo que importes en el futuro.
    </div>

    <div class="card" style="margin-top:14px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
        <div style="font-size:15px;font-weight:680">Gasto ya clasificado</div>
        <div style="font-size:20px;font-weight:750;letter-spacing:-.03em">${esc(nf0.format(pct))}%</div>
      </div>
      <div class="bar" style="height:8px"><div class="bar__f ${pct >= 80 ? 'is-full' : ''}" style="width:${pct.toFixed(1)}%"></div></div>
      <div style="margin-top:8px;font-size:12.5px;color:var(--ink-2)">
        ${esc(plural(lista.filter(x => x.rubro).length, 'comercio asignado', 'comercios asignados'))}
        de ${esc(String(lista.length))}. Con los primeros suele bastar.
      </div>
    </div>

    <div class="card card--flush" style="margin-top:12px">
      ${lista.slice(0, 60).map(x => `
        <div class="row" style="display:block">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
            <span class="row__t">${esc(x.muestra.slice(0, 34))}</span>
            <span class="row__v">${esc(money(x.total))}</span>
          </div>
          <div style="margin-top:3px;font-size:11.5px;color:var(--muted)">
            ${esc(plural(x.n, 'movimiento', 'movimientos'))} · ${esc(nf0.format(total > 0 ? x.total / total * 100 : 0))}% del gasto
          </div>
          <select class="input" style="margin-top:8px" data-act="asignar-comercio" data-k="${esc(x.k)}">
            <option value=""${!x.rubro ? ' selected' : ''}>— sin asignar —</option>
            ${D.gastos.map(g => `<option value="${esc(g.id)}"${x.rubro === g.id ? ' selected' : ''}>${esc(g.concepto)}</option>`).join('')}
          </select>
        </div>`).join('')}
    </div>
    ${lista.length > 60 ? `<div class="field__h" style="margin-top:8px">
      Se muestran los 60 comercios de mayor monto. Los demás pesan poco y quedan en "Otros".</div>` : ''}
  `, null, { full: true });
}

function asignarComercio(sel) {
  const clave = sel.dataset.k, rubro = sel.value;
  D.comercios = D.comercios || {};
  if (rubro) D.comercios[clave] = rubro; else delete D.comercios[clave];

  // Se aplica de una vez a todo lo ya registrado, no solo a lo que venga.
  let n = 0;
  D.movimientos.forEach(m => {
    if (!m.concepto) return;
    if (window.Importar.claveComercio(m.concepto) !== clave) return;
    const nuevo = rubro || 'otros';
    if (m.gastoId !== nuevo) { m.gastoId = nuevo; m._upd = now(); n++; }
  });
  persistir();
  toast(n ? `${plural(n, 'movimiento reclasificado', 'movimientos reclasificados')}.` : 'Guardado.');
}

/* ---------- presupuesto sugerido por el histórico ---------- */

/**
 * Propone el presupuesto mensual a partir de lo que de verdad se gastó.
 * Es el objetivo de todo lo anterior: dejar de adivinar el monto y sacarlo
 * de la evidencia, para tener contra qué medirse cada mes.
 */
function fmPresupuestoSugerido() {
  const p = A.presupuestoSugerido(D, periodo, 12);

  if (!p.hayDatos) {
    const hayMovs = D.movimientos.length > 0;
    abrirSheet('Proponer presupuesto', `
      <div class="empty">
        <div class="empty__t">Todavía no hay gasto registrado</div>
        <div class="empty__s">${hayMovs
          ? 'Lo que hay registrado es de meses posteriores al que estás viendo. Cambia de mes arriba y vuelve a intentarlo.'
          : 'Para proponerte montos necesito ver en qué se les va el dinero. Registra gastos, o importa los estados de cuenta desde Presupuesto → Datos.'}</div>
      </div>`);
    return;
  }

  const clase = { fijo: 'todos los meses', variable: 'algunos meses',
                  puntual: 'una sola vez', unico: 'el único mes con datos' };

  abrirSheet('Presupuesto sugerido', `
    ${p.parcial ? `
      <div class="note"><svg viewBox="0 0 24 24">${ICONO.warning}</svg>
        <div><b>${esc(mesLabel(p.periodos[0]))} todavía no termina</b> —
        lleva ${esc(nf0.format(p.avance * 100))}% corrido. Es el único mes con gasto
        registrado, así que uso ese: lo de abajo es un <b>piso</b>, no el gasto de un mes
        entero. Cuando cierre el mes, vuelve aquí y la cifra será firme.</div>
      </div>` : ''}

    <div class="field__h"${p.parcial ? ' style="margin-top:12px"' : ''}>
      ${p.unSoloMes
        ? `Calculado con <b>${esc(mesLabel(p.periodos[0]))}</b>, el único mes con gasto
           registrado. Con un solo mes no hay mediana que valga: lo que ves es lo que
           se gastó. A partir del segundo mes puedo distinguir lo fijo de lo puntual.`
        : `Calculado con <b>${esc(plural(p.periodos.length, 'mes cerrado', 'meses cerrados'))}</b>
           de gasto real. Uso la <b>mediana</b>, no el promedio: una compra grande de un mes
           inflaría el promedio y el presupuesto saldría más alto de lo que viven.`}
    </div>

    <div class="tiles" style="margin-top:14px">
      <div class="tile">
        <div class="tile__l">${p.unSoloMes ? 'Lo gastado' : 'Mes típico'}</div>
        <div class="tile__v">${esc(moneyC(p.medianaTotal))}</div>
        <div class="tile__d">${p.unSoloMes ? esc(mesLabel(p.periodos[0])) : 'la mediana de sus meses'}</div>
      </div>
      <div class="tile">
        <div class="tile__l">${p.unSoloMes ? 'Rubros' : 'Promedio'}</div>
        <div class="tile__v">${p.unSoloMes ? esc(nf0.format(p.recurrentes.length)) : esc(moneyC(p.promedioTotal))}</div>
        <div class="tile__d">${p.unSoloMes ? 'con gasto registrado' : 'inflado por lo puntual'}</div>
      </div>
    </div>

    <div class="sec"><span class="sec__t">Lo que propongo por rubro</span></div>
    <div class="card card--flush">
      ${p.recurrentes.map(f => `
        <div class="row" style="display:block">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
            <span class="row__t">${esc(f.concepto)}
              <span class="tag ${f.clase === 'fijo' ? 'tag--ok' : ''}">${esc(clase[f.clase])}</span></span>
            <span class="row__v">${esc(money(f.sugerido))}</span>
          </div>
          <div style="margin-top:5px;font-size:11.5px;color:var(--muted)">
            ${p.unSoloMes
              ? `${esc(plural(f.presentes, 'mes con gasto', 'meses con gasto'))}`
              : `apareció ${esc(String(f.presentes))} de ${esc(String(f.deMeses))} meses ·
                 máximo ${esc(moneyC(f.maximo))}`}${f.actual
              ? ` · hoy tienen ${esc(money(f.actual))}` : ' · hoy sin monto en el plan'}
          </div>
        </div>`).join('')}
      <div class="total"><span>Suma de lo sugerido</span><span>${esc(money(p.sumaSugerida))}</span></div>
    </div>

    ${p.unSoloMes ? '' : `<div class="field__h" style="margin-top:8px">
      La suma (${esc(money(p.sumaSugerida))}) no coincide con el mes típico
      (${esc(money(p.medianaTotal))}) y está bien: la mediana no se suma. Presupuestar por
      rubro es algo más holgado, que es lo prudente.
    </div>`}

    ${p.puntuales.length ? `
      <div class="sec"><span class="sec__t">Dejo fuera lo puntual</span></div>
      <div class="card card--flush">
        ${p.puntuales.map(f => `
          <div class="row">
            <div class="row__main"><div class="row__t">${esc(f.concepto)}</div>
              <div class="row__s">una sola vez en ${esc(String(f.deMeses))} meses</div></div>
            <div class="row__v is-muted">${esc(money(f.maximo))}</div>
          </div>`).join('')}
      </div>
      <div class="field__h" style="margin-top:8px">
        Pasó una vez y no se repite. Meterlo al presupuesto mensual sería reservar
        cada mes para algo que no vuelve.
      </div>` : ''}

    <button class="btn" data-act="aplicar-sugerido" style="margin-top:20px">
      Poner estos montos en el plan
    </button>
    <div class="field__h" style="margin-top:8px">
      Solo cambia el monto de los rubros que ya existen. No borra ni crea ninguno,
      y podés ajustarlos uno a uno después.
    </div>
  `, null, { full: true });
}

function aplicarSugerido() {
  const p = A.presupuestoSugerido(D, periodo, 12);
  let n = 0;
  p.recurrentes.forEach(f => {
    const g = D.gastos.find(x => x.id === f.gastoId);
    if (!g || g.monto === f.sugerido) return;
    g.monto = f.sugerido;
    g._upd = now();
    n++;
  });
  persistir();
  cerrarSheet();
  render();
  toast(n ? `${plural(n, 'rubro actualizado', 'rubros actualizados')} con ` +
            (p.unSoloMes ? 'lo que gastaron.' : 'su mediana real.')
          : 'El plan ya estaba en esos montos.');
}

/* ---------- importar estados de cuenta ---------- */

let lotesPendientes = [];

/**
 * Se sueltan todos los archivos de una vez y cada uno se enruta solo por su
 * número de cuenta. Nada se guarda sin que lo revisen: si el saldo del banco
 * no cuadra con lo leído, el archivo se marca y no se aplica.
 */
function fmImportar() {
  if (!window.Importar) { toast('No se pudo cargar el importador'); return; }

  const inp = document.createElement('input');
  inp.type = 'file';
  inp.multiple = true;
  inp.accept = '.pdf,.csv,application/pdf,text/csv';
  inp.onchange = async () => {
    const archivos = Array.from(inp.files || []);
    if (!archivos.length) return;

    abrirSheet('Leyendo estados de cuenta', `
      <div class="field__h">Leyendo ${esc(plural(archivos.length, 'archivo', 'archivos'))}…</div>
      <div class="progreso" style="margin-top:18px"><div class="progreso__f progreso__f--indef"></div></div>`);

    lotesPendientes = [];
    for (const a of archivos) {
      try {
        const lote = await window.Importar.leerArchivo(a, D);
        lote.destino = window.Importar.destinoDe(lote, D);
        // Se compara contra lo que ya hay registrado ANTES de importar: después
        // todo coincide por construcción y ya no se ve lo que faltaba anotar.
        lote.conciliacion = window.Importar.conciliarConApp(D, lote, lote.destino);
        lotesPendientes.push(lote);
      } catch (e) {
        lotesPendientes.push({ archivo: a.name, error: e.message || 'No se pudo leer' });
      }
    }
    revisarImportacion();
  };
  inp.click();
}

function revisarImportacion() {
  const T = window.Importar.TIPOS;
  const aplicables = lotesPendientes.filter(l => !l.error && l.destino &&
    (!l.control || l.control.cuadra));

  const tarjeta = l => `
    <div class="card" style="margin-top:12px">
      <div style="font-size:14.5px;font-weight:680;letter-spacing:-.015em">${esc(l.archivo)}</div>
      ${l.error ? `
        <div class="consejo consejo--critical" style="margin-top:10px">
          <div class="consejo__t">No se pudo leer</div>
          <div class="consejo__c">${esc(l.error)}</div>
        </div>`
      : `
        <div class="row__s" style="margin-top:4px">
          ${esc(l.banco)} · cuenta ${esc(l.cuenta || '—')} ·
          ${esc(l.desde)} al ${esc(l.hasta)} · ${esc(plural(l.movs.length, 'movimiento', 'movimientos'))}
        </div>

        ${!l.destino ? `
          <div class="consejo consejo--critical" style="margin-top:10px">
            <div class="consejo__t">No sé de qué cuenta es</div>
            <div class="consejo__c">Ninguna cuenta ni tarjeta registrada tiene el número
              <b>${esc(l.cuenta || '—')}</b>. Ponlo en la cuenta que corresponda y vuelve a intentar.</div>
          </div>`
        : `<div class="field__h" style="margin-top:6px">Va a <b>${esc(l.destino.nombre)}</b>.</div>`}

        ${l.control ? (l.control.cuadra ? `
          <div class="consejo consejo--good" style="margin-top:10px">
            <div class="consejo__t">El saldo cuadra</div>
            <div class="consejo__c">${esc(money(l.control.saldoIni))} de saldo inicial más los
              movimientos dan ${esc(money(l.control.esperado))}, exactamente el saldo final del banco.</div>
          </div>` : `
          <div class="consejo consejo--critical" style="margin-top:10px">
            <div class="consejo__t">El saldo no cuadra — no se va a importar</div>
            <div class="consejo__c">Sale una diferencia de <b>${esc(money(Math.abs(l.control.diferencia)))}</b>
              contra el saldo final del banco. Prefiero no meter datos que no cuadran.</div>
          </div>`) : ''}

        ${(() => {
          const k = l.conciliacion;
          if (!k || k.cuadra) return k ? `<div class="field__h" style="margin-top:8px">
            Todo lo del archivo ya está registrado, renglón por renglón.</div>` : '';
          const lista = (titulo, arr, nota) => !arr.length ? '' : `
            <div class="field__h" style="margin-top:8px"><b>${esc(titulo)}</b> — ${esc(nota)}</div>
            <div class="card card--flush" style="margin-top:6px;box-shadow:none">
              ${arr.slice(0, 8).map(x => `
                <div class="row"><div class="row__main">
                  <div class="row__t">${esc(String(x.concepto || '').slice(0, 38) || '—')}</div>
                  <div class="row__s">${esc(x.fecha)}${x.manual ? ' · anotado a mano' : ''}</div></div>
                  <div class="row__v">${esc(money(x.monto))}</div></div>`).join('')}
              ${arr.length > 8 ? `<div class="row"><div class="row__main"><div class="row__s">
                y ${esc(String(arr.length - 8))} más</div></div></div>` : ''}
            </div>`;
          return `
            <div class="sec" style="margin-top:12px"><span class="sec__t">Conciliación con lo registrado</span></div>
            ${lista('Renglones del banco sin contraparte', k.soloBanco,
                    'los va a crear esta importación')}
            ${lista('Registros de la app sin renglón del banco', k.soloApp,
                    'revisá si sobran, si el banco aún no los refleja, o si están duplicados')}
            <div class="field__h" style="margin-top:8px">
              Banco ${esc(money(k.totalBanco))} contra app ${esc(money(k.totalApp))} ·
              diferencia <b${Math.abs(k.diferencia) > 0.005 ? ' style="color:var(--critical)"' : ''}>${esc(money(k.diferencia))}</b>.
            </div>`;
        })()}

        <div class="card card--flush" style="margin-top:10px;box-shadow:none">
          ${Object.keys(l.resumen).map(k => `
            <div class="row">
              <div class="row__main"><div class="row__t" style="font-weight:500">${esc(T[k])}</div>
                <div class="row__s">${esc(plural(l.resumen[k].n, 'movimiento', 'movimientos'))}${
                  k === 'traslado' ? ' · no cuentan como ingreso ni gasto' :
                  // Antes decía "van en financiamientos" y no iban a ningún lado:
                  // se descartaban en silencio y el resumen seguía diciendo
                  // "ninguno activo". Mejor decir la verdad.
                  k === 'cuota' ? ' · <b>no se importan</b>: regístralos a mano en Financiamientos' :
                  k === 'pagoTarjeta' && l.tipo === 'tarjeta' ? ' · ya se cuentan desde la cuenta que los pagó' :
                  k === 'ingreso' ? ' · confírmalos tú en Presupuesto' : ''}</div>
              </div>
              <div class="row__v ${k === 'traslado' || k === 'cuota' || k === 'ingreso' ? 'is-muted' : ''}">${esc(money(l.resumen[k].total))}</div>
            </div>`).join('')}
        </div>`}
    </div>`;

  abrirSheet('Revisar antes de importar', `
    <div class="note note--info">
      <svg viewBox="0 0 24 24">${ICONO.warning}</svg>
      <div>Al importar, lo que ya se había traído antes de estas mismas fechas se
      <b>reemplaza</b>. Por eso puedes subir el estado de cuenta cada semana sin duplicar nada.
      Lo que anotaste a mano no se toca.</div>
    </div>
    <div class="field__h" style="margin-top:10px">
      Lo consumido entra en <b>Movimientos</b>, en el mes al que corresponda cada fecha.
      Los rubros que haga falta crear se crean <b>sin monto</b>: el presupuesto es lo que
      <i>piensan</i> gastar y eso no lo decide el banco. Para llenarlo con lo que gastaron
      de verdad, usa <b>Sugerir con mi histórico</b> en la sección de Gastos.
    </div>
    ${lotesPendientes.map(tarjeta).join('')}
    ${aplicables.length ? `
      <button class="btn" data-act="aplicar-importacion" style="margin-top:20px">
        Importar ${esc(plural(aplicables.length, 'archivo', 'archivos'))}
      </button>`
    : `<div class="field__h" style="margin-top:16px">No hay nada que se pueda importar todavía.</div>`}
  `, null, { full: true });
}

function aplicarImportacion() {
  const aplicables = lotesPendientes.filter(l => !l.error && l.destino &&
    (!l.control || l.control.cuadra));
  if (!aplicables.length) return;

  const ayuda = {
    uid, now,
    periodoDe: f => perDe(f),
    debitoDe: cuentaId => (D.tarjetas.find(t => t.tipo === 'debito' && t.cuentaId === cuentaId) || {}).id,
    tarjetaCredito: () => D.tarjetas.find(t => (t.tipo || 'credito') === 'credito')
  };

  let g = 0, r = 0, p = 0, sin = 0;
  const meses = new Set();
  aplicables.forEach(l => {
    const c = window.Importar.aplicarLote(D, l, l.destino, ayuda);
    g += c.gastos; r += c.retiros; p += c.pagos; sin += c.sinCategoria;
    // A qué meses del hogar fue a parar lo del archivo. El estado de cuenta casi
    // siempre cubre un ciclo ya pasado, así que lo importado no tiene por qué
    // caer en el mes que se está viendo — y entonces la pantalla parece vacía.
    const cuenta_ = { gasto: 1, comision: 1, retiro: 1, pagoTarjeta: 1 };
    l.movs.forEach(m => {
      if (!cuenta_[m.tipo]) return;            // traslados, cuotas e ingresos no crean nada
      const per = perDe(m.fecha);
      if (per) meses.add(per);
    });
  });

  persistir();
  lotesPendientes = [];
  cerrarSheet();

  // Se lleva al usuario al mes donde de verdad quedaron los datos, y a la
  // pantalla donde se ven. Antes se quedaba en Presupuesto, mirando los rubros
  // nuevos en L 0.00, con toda la razón para creer que no se había subido nada.
  const conDatos = Array.from(meses).sort();
  const destino = conDatos.includes(periodo) ? periodo : conDatos[conDatos.length - 1];
  const salto = destino && destino !== periodo;
  if (destino) periodo = destino;
  ir('movimientos');

  // Las cuotas no se importan: si el archivo traía alguna, hay que decirlo aquí
  // y no dejar que el usuario descubra el hueco cuadrando números un mes después.
  const cuotas = aplicables.reduce((s, l) => s + ((l.resumen.cuota || {}).n || 0), 0);

  toast(`Listo: ${g} gastos, ${r} retiros y ${p} pagos.` +
        (salto ? ` Están en ${mesLabel(destino)}.` : '') +
        (sin ? ` ${sin} sin rubro: ábrelos y asígnalo una vez.` : '') +
        (cuotas ? ` ${plural(cuotas, 'cuota de financiamiento queda', 'cuotas de financiamiento quedan')} sin registrar.` : ''));
}

/** Análisis completo del mes, en un archivo que se abre y se imprime solo. */
function exportarAnalisis() {
  if (!window.Reporte) { toast('No se pudo cargar el generador del informe'); return; }
  try {
    const html = window.Reporte.generar(D, periodo);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `analisis-presupuesto-${periodo}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Análisis descargado. Ábrelo e imprime para tener el PDF.');
  } catch (e) {
    console.error('Fallo al generar el análisis', e);
    toast('No se pudo generar el análisis');
  }
}

function exportar() {
  try {
    const blob = new Blob([JSON.stringify(D, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `presupuesto-${mesKey(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Respaldo descargado');
  } catch (e) { toast('No se pudo generar el respaldo'); }
}

function importar() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'application/json,.json';
  inp.onchange = () => {
    const f = inp.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onerror = () => toast('No se pudo leer el archivo');
    r.onload = () => {
      try {
        const doc = JSON.parse(r.result);
        if (!doc || typeof doc !== 'object' || !Array.isArray(doc.gastos)) throw new Error('formato');
        // Importar es pedir explícitamente que vuelva lo de antes: las lápidas
        // de un borrado previo tumbarían el respaldo entero al fusionar.
        D._borrados = {};
        D._borradosMes = {};
        D = migrar(window.Sync.merge(D, doc));
        persistir();
        cerrarSheet();
        render();
        toast('Respaldo importado');
      } catch (e) { toast('El archivo no es un respaldo válido'); }
    };
    r.readAsText(f);
  };
  inp.click();
}

function reiniciar() {
  abrirSheet('Borrar todo', `
    <div class="note"><svg viewBox="0 0 24 24">${ICONO.critical}</svg>
      <div>Esto borra <b>todo</b> de este teléfono: ingresos, gastos, tarjetas, movimientos y
      proyectos. Si la nube está conectada, el borrado también se sincroniza.
      No se puede deshacer.</div></div>
    <div class="field__h" style="margin-top:14px">Antes de borrar, conviene exportar un respaldo.</div>
    <button class="btn btn--ghost" data-act="exportar" style="margin-top:12px">Exportar respaldo primero</button>
    <button class="btn btn--danger" data-act="reiniciar-ok" style="margin-top:8px">Sí, borrar todo</button>
  `);
}

/* ---------- render ---------- */

const TITULOS = { resumen: 'Resumen', presupuesto: 'Presupuesto', proyectos: 'Proyectos',
                  movimientos: 'Movimientos', historia: 'Historia' };
const CUERPOS = { resumen: vResumen, presupuesto: vPresupuesto, proyectos: vProyectos,
                  movimientos: vMovimientos, historia: vHistoria };

function render() {
  // Sin configurar no hay sección todavía: manda el nombre de la app. Ojo con
  // no confundirlo con TITULOS.presupuesto, que es la sección del plan.
  $('#viewTitle').textContent = D.configurado ? TITULOS[vista] : 'Controle Wallet';
  $('#periodoLabel').textContent = mesLabel(periodo) + (mesRango(periodo) ? ' · ' + mesRango(periodo) : '');
  $('#periodoBtn').hidden = !D.configurado;

  const el = $('#view-' + vista);
  try {
    el.innerHTML = CUERPOS[vista]();
  } catch (e) {
    console.error('Fallo al dibujar la vista', e);
    el.innerHTML = `<div class="empty" style="margin-top:40px">
      <div class="empty__t">Algo salió mal al mostrar esta sección</div>
      <div class="empty__s">Los datos están a salvo. Exporta un respaldo desde Presupuesto.</div></div>`;
  }

  $$('.view').forEach(v => { v.hidden = v.dataset.view !== vista; });
  $$('.tab').forEach(t => {
    const on = t.dataset.goto === vista;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', String(on));
  });
  $('.tabbar').hidden = !D.configurado;
  montarTips();
}

function limpiarFiltros() { filtroMov = { texto: '', medio: '', personaId: '' }; }

/**
 * Repinta chips y lista sin tocar el campo de búsqueda, para no robarle el
 * foco a quien está escribiendo ni cerrarle el teclado en el móvil.
 */
function repintarRegistro() {
  const caja = $('#movBuscar');
  if (caja) caja.value = filtroMov.texto;
  $$('.chips .chip').forEach(c => {
    const campo = c.dataset.act === 'filtro-medio' ? 'medio' : 'personaId';
    const on = (filtroMov[campo] || '') === c.dataset.v;
    c.classList.toggle('is-on', on);
    c.setAttribute('aria-pressed', String(on));
  });
  const cont = $('#regLista');
  if (cont) cont.innerHTML = listaRegistro();
}

function ir(v) {
  if (!TITULOS[v]) return;
  vista = v;
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function pintarSync(estado) {
  // Hay dos: el punto de la cabecera (móvil) y el de la lateral (escritorio).
  $$('#syncDot, #syncDot2').forEach(d => { d.dataset.state = estado; });
}

/**
 * El tablero de una vista. En el teléfono `.tablero` es un bloque y todo se
 * apila; en escritorio son dos zonas declaradas a mano.
 *
 * Se declaran a mano y no con columnas automáticas porque el navegador reparte
 * por altura, no por sentido: así acababa el buscador en una columna y la lista
 * que filtra en otra. Aquí lo ancho lleva lo que necesita anchura —tablas,
 * gráficas, el registro— y el riel las cifras de apoyo.
 */
const tablero = (franja, ancha, rail) => `
  <div class="tablero${rail ? '' : ' tablero--solo'}">
    ${franja ? `<div class="franja">${franja}</div>` : ''}
    <div class="zona zona--ancha">${ancha}</div>
    ${rail ? `<div class="zona zona--rail">${rail}</div>` : ''}
  </div>`;

/* ---------- hover de gráficas ---------- */

let tipEl = null;
function montarTips() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tip';
    document.body.appendChild(tipEl);
  }
  $$('[data-tip]').forEach(h => {
    const mostrar = e => {
      const [k, v] = h.dataset.tip.split('|');
      tipEl.innerHTML = `<div class="tip__k">${esc(k)}</div><b>${esc(v)}</b>`;
      tipEl.classList.add('is-on');
      const p = e.touches ? e.touches[0] : e;
      const r = tipEl.getBoundingClientRect();
      tipEl.style.left = Math.max(8, Math.min(window.innerWidth - r.width - 8, p.clientX - r.width / 2)) + 'px';
      tipEl.style.top  = Math.max(8, p.clientY - r.height - 14) + 'px';
    };
    const ocultar = () => tipEl.classList.remove('is-on');
    h.addEventListener('pointerenter', mostrar);
    h.addEventListener('pointermove', mostrar);
    h.addEventListener('pointerleave', ocultar);
    h.addEventListener('touchstart', mostrar, { passive: true });
    h.addEventListener('touchend', ocultar);
  });
}

/* ---------- eventos ---------- */

document.addEventListener('change', e => {
  if (e.target.dataset && e.target.dataset.act === 'asignar-comercio') asignarComercio(e.target);
});

document.addEventListener('input', e => {
  // En cuanto corrigen el campo, se le quita la marca de error.
  if (e.target.classList && e.target.classList.contains('is-mal')) e.target.classList.remove('is-mal');

  if (e.target.closest('[data-persona]')) { refrescarNetos(); return; }

  // Solo se repinta la lista. Repintar la vista entera en cada tecla
  // reconstruiría el campo y el foco saltaría fuera a la primera letra.
  if (e.target.id === 'movBuscar') {
    filtroMov.texto = e.target.value;
    const cont = $('#regLista');
    if (cont) cont.innerHTML = listaRegistro();
  }
});

document.addEventListener('click', e => {
  const t = e.target.closest('[data-goto], [data-act], [data-close]');
  if (!t) return;

  if (t.hasAttribute('data-close')) { cerrarSheet(); asis = null; return; }
  if (t.dataset.goto && !t.dataset.act) { ir(t.dataset.goto); return; }

  const a = t.dataset.act;
  const enAsis = sheet.dataset.reopen === 'asis';

  if (a === 'guardar') {
    const reabrir = sheet.dataset.reopen;
    if (onGuardar && onGuardar() === false) return;
    if (reabrir !== 'asis') persistir();
    cerrarSheet();
    if (reabrir === 'asis') pintarAsistente();
    else { render(); if (reabrir === 'sync') fmSync(); }
    return;
  }

  if (a === 'borrar') {
    const [tipo, id] = (sheet.dataset.del || '').split(':');
    const mapa = {
      gasto: () => D.gastos, proyecto: () => D.proyectos, movimiento: () => D.movimientos,
      tarjeta: () => D.tarjetas, fin: () => D.financiamientos, evento: () => D.plantillaIngresos,
      retiro: () => D.retiros, persona: () => D.personas,
      cuenta: () => D.cuentas, pagoTarjeta: () => D.pagosTarjeta,
      aporte: () => ((D.proyectos.find(x => x.id === sheet.dataset.padre) || {}).aportes || []),
      'asis-gasto': () => asis.gastos, 'asis-tarjeta': () => asis.tarjetas,
      'asis-fin': () => asis.financiamientos, 'asis-evento': () => asis.eventos
    };
    if (!mapa[tipo]) return;
    const lista = mapa[tipo]();
    const i = lista.findIndex(x => x.id === id);
    if (i < 0) return;
    lista.splice(i, 1);

    if (tipo.startsWith('asis-')) {
      limpiarReferenciasAsis(tipo.slice(5), id);
      cerrarSheet();
      pintarAsistente();
    } else {
      limpiarReferencias(tipo, id);
      D._borrados = D._borrados || {};
      D._borrados[id] = now();
      persistir();
      cerrarSheet();
      render();
    }
    toast('Eliminado');
    return;
  }

  if (a === 'add-ded') {
    const wrap = $('[data-deds]', t.closest('[data-persona]'));
    wrap.insertAdjacentHTML('beforeend', filaDed($$('[data-ded]', wrap).length, null));
    return;
  }
  if (a === 'quita-ded') { t.closest('[data-ded]').remove(); refrescarNetos(); return; }

  if (a === 'desconfirmar') {
    const mes = D.ingresosMes[periodo];
    if (mes) {
      if (mes.confirmado) delete mes.confirmado[t.dataset.ev];
      if (mes.lineas) delete mes.lineas[t.dataset.ev];
      mes._upd = now();   // sin esto el otro teléfono devuelve la confirmación
    }
    persistir(); cerrarSheet(); render();
    toast('Vuelve a usar el monto típico');
    return;
  }

  /* --- asistente --- */
  if (a === 'asistente')      { abrirAsistente(); return; }
  if (a === 'asis-siguiente') { avanzarAsistente(); return; }
  if (a === 'asis-atras')     { asis.paso--; pintarAsistente(); return; }

  if (a === 'asis-add-persona') {
    asis.personas = $$('#asis-personas [data-per]', sheet).map(b => ({
      id: b.dataset.per, nombre: $('[data-k="nombre"]', b).value.trim()
    }));
    asis.personas.push({ id: uid(), nombre: '' });
    pintarAsistente();
    return;
  }
  if (a === 'asis-quita-persona') {
    const id = t.closest('[data-per]').dataset.per;
    asis.personas = $$('#asis-personas [data-per]', sheet)
      .map(b => ({ id: b.dataset.per, nombre: $('[data-k="nombre"]', b).value.trim() }))
      .filter(x => x.id !== id);
    pintarAsistente();
    return;
  }

  const rutasAsis = {
    'asis-add-evento':   () => fmEvento(null, true),
    'asis-edit-evento':  () => fmEvento(t.dataset.id, true),
    'asis-add-gasto':    () => fmGasto(null, true),
    'asis-edit-gasto':   () => fmGasto(t.dataset.id, true),
    'asis-add-tarjeta':  () => fmTarjeta(null, true),
    'asis-edit-tarjeta': () => fmTarjeta(t.dataset.id, true),
    'asis-add-fin':      () => fmFinanciamiento(null, true),
    'asis-edit-fin':     () => fmFinanciamiento(t.dataset.id, true)
  };
  if (rutasAsis[a]) { rutasAsis[a](); return; }

  /* --- sesión --- */
  if (a === 'entrar') {
    const correo = val('#f-mail'), clave = val('#f-pass');
    if (!correo || !clave) { toast('Faltan el correo y la contraseña'); return; }
    t.disabled = true; t.textContent = 'Entrando…';
    window.Sync.entrar(correo, clave)
      .then(() => { cerrarSheet(); render(); toast('Sesión iniciada'); })
      .catch(err => { t.disabled = false; t.textContent = 'Iniciar sesión'; toast(err.message || 'No se pudo entrar'); });
    return;
  }
  if (a === 'descartar-factura') {
    const fid = sheet.dataset.factura;
    if (fid) window.Facturas.borrar(fid).then(refrescarCola);
    cerrarSheet();
    toast('Foto descartada');
    return;
  }

  if (a === 'salir') { window.Sync.salir(); cerrarSheet(); render(); toast('Sesión cerrada'); return; }
  if (a === 'set-inicio') {
    const dia = Math.min(28, Math.max(1, Math.round(num('#f-ini'))));
    D.inicioMes = dia;
    // Lo ya registrado tiene el mes viejo pegado: hay que reclasificarlo,
    // o los gastos de julio seguirían apareciendo en agosto.
    let movidos = 0;
    ['movimientos', 'retiros', 'pagosTarjeta'].forEach(col => {
      (D[col] || []).forEach(x => {
        const nuevo = A.periodoDe(x.fecha, dia);
        if (nuevo && nuevo !== x.periodo) { x.periodo = nuevo; x._upd = now(); movidos++; }
      });
    });
    persistir();
    periodo = mesHoy();
    cerrarSheet();
    render();
    toast(movidos ? `Listo. ${plural(movidos, 'registro reubicado', 'registros reubicados')}.`
                  : 'Listo. El mes arranca el ' + dia + '.');
    return;
  }

  if (a === 'copiar-ingresos') {
    const mes = D.ingresosMes[periodo] || {};
    mes.lineas = mes.lineas || {};
    mes.confirmado = mes.confirmado || {};
    let n = 0;
    D.plantillaIngresos.forEach(ev => {
      if (A.eventoConfirmado(D, ev.id, periodo)) return;
      const copia = {};
      let hay = false;
      D.personas.forEach(p => {
        const f = A.lineaParaConfirmar(D, ev, p.id, periodo);
        if (f.origen !== 'copia' || !f.linea) return;
        copia[p.id] = { personaId: p.id, bruto: f.linea.bruto,
                        deducciones: (f.linea.deducciones || []).slice() };
        hay = true;
      });
      if (!hay) return;
      mes.lineas[ev.id] = copia;
      mes.confirmado[ev.id] = true;
      // Se queda marcado como copiado hasta que alguien lo abra y lo guarde.
      // "Confirmado" significa "esto fue lo que entró de verdad", y aquí nadie
      // ha mirado todavía: decir lo contrario sería inventarse un hecho.
      mes.copiado = mes.copiado || {};
      mes.copiado[ev.id] = t.dataset.k;
      n++;
    });
    if (!n) { toast('No hay nada que copiar'); return; }
    mes._upd = now();
    D.ingresosMes[periodo] = mes;
    persistir();
    render();
    toast(`${plural(n, 'pago confirmado', 'pagos confirmados')} igual que ${mesLabel(t.dataset.k)}. Revisá y corregí si algo cambió.`);
    return;
  }

  if (a === 'asignar-por-nombre') {
    let n = 0;
    A.saldosCuentas(D, periodo).filas.forEach(f => {
      if (f.personas.length) return;
      const p = dueñoPorNombre(f);
      if (!p || p.cuentaId) return;      // no le quitamos a nadie la que ya tiene
      p.cuentaId = f.id;
      p._upd = now();
      n++;
    });
    if (!n) { toast('No pude emparejar ninguna por el nombre'); return; }
    persistir();
    render();
    toast(`${plural(n, 'cuenta asignada', 'cuentas asignadas')} por el nombre. Revisá que esté bien.`);
    return;
  }

  if (a === 'confirmar-cierre') { confirmarCierre(t.dataset.k); return; }
  if (a === 'guardar-cierre')   { guardarAvanceCierre(t.dataset.k); return; }

  if (a === 'set-periodo') { periodo = t.dataset.k; limpiarFiltros(); cerrarSheet(); render(); return; }
  if (a === 'ver-mes')     { periodo = t.dataset.k; limpiarFiltros(); ir('resumen'); return; }

  /* --- búsqueda y filtros del registro --- */
  if (a === 'filtro-medio' || a === 'filtro-persona') {
    const campo = a === 'filtro-medio' ? 'medio' : 'personaId';
    // Volver a tocar el filtro activo lo apaga: es el gesto que la gente espera.
    filtroMov[campo] = filtroMov[campo] === t.dataset.v ? '' : t.dataset.v;
    repintarRegistro();
    return;
  }
  if (a === 'limpiar-filtros') {
    limpiarFiltros();
    repintarRegistro();
    return;
  }

  if (a === 'reiniciar-ok') {
    // Una lápida por registro. Antes esto era una marca de tiempo general, y
    // como los relojes de dos teléfonos no van iguales, podía quedar fechada
    // en el futuro y borrar sola todo lo que se registrara después.
    const t = now();
    const tumbas = Object.assign({}, D._borrados);
    const meses = Object.assign({}, D._borradosMes);
    // La lista tiene que ser la MISMA que fusiona sync.js. Faltaban 'cuentas' y
    // 'pagosTarjeta': se borraban aquí, pero como no quedaba lápida el otro
    // teléfono las devolvía enteras en la primera sincronización y el "borrar
    // todo" dejaba las cuentas de banco en pie.
    ['personas', 'cuentas', 'plantillaIngresos', 'gastos', 'tarjetas', 'financiamientos',
     'proyectos', 'movimientos', 'retiros', 'pagosTarjeta'].forEach(col => {
      (D[col] || []).forEach(x => {
        if (!x || !x.id) return;
        tumbas[x.id] = t;
        (x.aportes || []).forEach(ap => { if (ap && ap.id) tumbas[ap.id] = t; });
      });
    });
    // La lápida por mes vale para las dos cosas que van indexadas por mes:
    // lo confirmado como recibido y el presupuesto que quedó congelado.
    Object.keys(D.ingresosMes || {}).forEach(k => { meses[k] = t; });
    Object.keys(D.presupuestoMes || {}).forEach(k => { meses[k] = t; });

    D = seed();
    D._borrados = tumbas;
    D._borradosMes = meses;
    persistir();
    cerrarSheet();
    vista = 'resumen';
    render();
    toast('Todo borrado. Empezamos de nuevo.');
    return;
  }

  // Subir y bajar proyectos a mano se quitó: la prioridad la decide el mérito
  // (tipo de necesidad, urgencia, colchón y deuda cara), no el orden de la
  // lista. Dejar los botones habría sido dejar un control que no controla nada.

  const rutas = {
    'add-cuenta':       () => fmCuenta(null),
    'edit-cuenta':      () => fmCuenta(t.dataset.id),
    'add-pago-tarjeta': () => fmPagoTarjeta(null),
    'edit-pago-tarjeta':() => fmPagoTarjeta(t.dataset.id),
    'add-persona':      () => fmPersona(null),
    'edit-persona':     () => fmPersona(t.dataset.id),
    'add-evento':       () => fmEvento(null, false),
    'edit-evento':      () => fmEvento(t.dataset.ev, false),
    'confirmar-evento': () => fmConfirmar(t.dataset.ev),
    'add-gasto':        () => fmGasto(null, false),
    'edit-gasto':       () => fmGasto(t.dataset.id, false),
    'add-tarjeta':      () => fmTarjeta(null, false),
    'edit-tarjeta':     () => fmTarjeta(t.dataset.id, false),
    'add-fin':          () => fmFinanciamiento(null, false),
    'edit-fin':         () => fmFinanciamiento(t.dataset.id, false),
    'add-proyecto':     () => fmProyecto(null),
    'edit-proyecto':    () => fmProyecto(t.dataset.id),
    'add-aporte':       () => fmAporte(t.dataset.id),
    'edit-aporte':      () => fmAporte(t.dataset.id, t.dataset.ap),
    'add-mov':          () => fmMovimiento(null),
    'edit-mov':         () => fmMovimiento(t.dataset.id),
    'escanear':         escanearFactura,
    'reintentar-facturas': reintentarFacturas,
    'add-retiro':       () => fmRetiro(null),
    'edit-retiro':      () => fmRetiro(t.dataset.id),
    'analisis':         exportarAnalisis,
    'importar-estados': fmImportar,
    'presupuesto-sugerido': fmPresupuestoSugerido,
    'cerrar-mes':       () => fmCerrarMes(t.dataset.k || periodo),
    'clasificar-comercios': fmComercios,
    'aplicar-sugerido': aplicarSugerido,
    'aplicar-importacion': aplicarImportacion,
    'exportar':         exportar,
    'importar':         importar,
    'reiniciar':        reiniciar
  };
  if (rutas[a]) rutas[a]();
});

$('#analisisBtn').addEventListener('click', exportarAnalisis);
$('#periodoBtn').addEventListener('click', fmPeriodo);
$$('#syncBtn, #syncBtn2').forEach(b => b.addEventListener('click', fmSync));

$('#themeBtn').addEventListener('click', () => {
  const oscuro = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const siguiente = oscuro ? 'light' : 'dark';
  document.documentElement.dataset.theme = siguiente;
  localStorage.setItem('presupuesto.tema', siguiente);
});

document.addEventListener('keydown', e => {
  if (sheet.hidden) return;

  if (e.key === 'Escape') { cerrarSheet(); asis = null; return; }

  // La hoja se anuncia como diálogo modal: el tabulador no puede salirse de
  // ella hacia la página de atrás, o se navega a ciegas sobre lo que tapa.
  if (e.key !== 'Tab') return;
  const f = enfocables();
  if (!f.length) return;
  const primero = f[0], ultimo = f[f.length - 1];
  if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  else if (!sheet.contains(document.activeElement)) { e.preventDefault(); primero.focus(); }
});

/* ---------- arranque ---------- */

const tema = localStorage.getItem('presupuesto.tema');
if (tema) document.documentElement.dataset.theme = tema;

cargar();
periodo = mesHoy();
// Los meses que ya pasaron quedan con su plan fijo antes de dibujar nada.
if (congelarMesesPasados()) persistir();
render();

// Las fotos tomadas sin señal se leen solas cuando vuelve la conexión.
if (window.Facturas && Facturas.soportado) {
  refrescarCola();
  window.addEventListener('online', () => {
    Facturas.procesarPendientes(categoriasPlan()).then(n => {
      if (n) toast(plural(n, 'factura leída', 'facturas leídas'));
      refrescarCola();
    });
  });
}

window.Sync.arrancar(D, aplicarRemoto, pintarSync);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW no registrado', err));
  });
}

})();
