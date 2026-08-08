/* ============================================================
   Análisis de presupuesto — genera un documento completo,
   autocontenido y listo para imprimir o guardar como PDF.

   No calcula nada por su cuenta: todo sale del asesor. Si un
   número apareciera aquí distinto al de la app, sería un error.
   Se abre en cualquier navegador sin conexión y sin la app.
   ============================================================ */
(function () {
'use strict';

const A = () => window.Asesor;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nf2 = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-HN', { maximumFractionDigits: 0 });
/** El signo va antes de la L: "−L 3,888.76" y no "L -3,888.76". */
const L  = n => {
  const v = Number(n) || 0;
  return (v < 0 ? '−' : '') + 'L&nbsp;' + nf2.format(Math.abs(v));
};
const pct = n => nf0.format((Number(n) || 0) * 100) + '%';

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const mesLabel = k => { const [y, m] = k.split('-'); return `${cap(MESES[+m - 1])} ${y}`; };
const fechaLarga = f => {
  if (!f) return '';
  const [y, m, d] = f.split('-');
  return `${+d} de ${MESES[+m - 1]} de ${y}`;
};

/* ---------- piezas ---------- */

const seccion = (titulo, cuerpo, nota) => !cuerpo ? '' : `
  <section>
    <h2>${esc(titulo)}</h2>
    ${nota ? `<p class="nota">${nota}</p>` : ''}
    ${cuerpo}
  </section>`;

const tabla = (cabeceras, filas) => !filas.length ? '' : `
  <table>
    <thead><tr>${cabeceras.map((h, i) =>
      `<th${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${filas.map(f => `<tr>${f.map((c, i) =>
      `<td${i ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;

const cifra = (etiqueta, valor, detalle, negativo) => `
  <div class="cifra">
    <div class="cifra__l">${esc(etiqueta)}</div>
    <div class="cifra__v${negativo ? ' neg' : ''}">${valor}</div>
    ${detalle ? `<div class="cifra__d">${detalle}</div>` : ''}
  </div>`;

/** Barra de proporción, dibujada con divs para que sobreviva a la impresión. */
const barra = (parte, total, over) => {
  const w = total > 0 ? Math.min(100, (parte / total) * 100) : 0;
  return `<div class="barra"><div class="barra__f${over ? ' over' : ''}" style="width:${w.toFixed(1)}%"></div></div>`;
};

/* ---------- bloques del informe ---------- */

function resumen(D, per) {
  const r = A().resumenMes(D, per);
  const gastado = (D.movimientos || [])
    .filter(m => A().perDe(m) === per)
    .reduce((s, m) => s + (Number(m.monto) || 0), 0);

  const flujo = [
    ['Ingreso neto del mes', L(r.neto), ''],
    ['Gastos corrientes', '−' + L(r.corriente), ''],
    ['Fondo de salud', '−' + L(r.salud), ''],
    ['Cuotas de financiamiento', '−' + L(r.cuotas), '']
  ];

  return `
    <div class="cifras">
      ${cifra('Disponible real', L(r.disponible),
              r.confirmado ? 'con ingresos confirmados' : 'estimado, falta confirmar', r.disponible < 0)}
      ${cifra('Ingreso neto', L(r.neto), 'de ' + L(r.bruto) + ' bruto')}
      ${cifra('Gasto planificado', L(r.gastos), r.gastos > 0 ? 'según el plan del mes' : 'ningún rubro tiene monto')}
      ${cifra('Gasto real', L(gastado), r.gastos <= 0
        ? 'sin plan contra el que medirlo'
        : gastado > r.gastos
        ? '<b class="neg">' + L(gastado - r.gastos) + ' por encima</b>'
        : 'quedan ' + L(r.gastos - gastado), r.gastos > 0 && gastado > r.gastos)}
    </div>
    ${A().planIncompleto(D, per).hay ? `<p class="nota"><b>Aviso:</b> ningún rubro del plan
      tiene monto asignado, así que el "disponible real" de arriba es el ingreso completo
      sin restar nada, y no hay presupuesto contra el que comparar el gasto. Las cifras de
      este informe que dependan del plan hay que leerlas con eso en mente.</p>` : ''}
    ${tabla(['Concepto', 'Monto'], flujo.map(f => [esc(f[0]), f[1]])
      .concat([['<b>Disponible real</b>', '<b>' + L(r.disponible) + '</b>']]))}
    <p class="nota">El pago de la tarjeta no se resta aquí: los consumos del mes ya están
    contados en los gastos. Restarlo otra vez contaría el mismo dinero dos veces.</p>`;
}

/**
 * La carta. Va primero y en prosa, porque el valor de un asesor no está en la
 * tabla —esa ya viene abajo— sino en la frase que ordena qué hacer antes que
 * qué. Todo sale de datos registrados: cero inventos.
 */
function carta(D, per) {
  const c = A().cartaAsesor(D, per);
  if (!c.parrafos.length) return '';
  return `<div class="carta">${c.parrafos.map(p => `
    <h3>${esc(p.titulo)}</h3>
    <p>${esc(p.texto)}</p>`).join('')}</div>`;
}

function capital(D, per) {
  const p = A().patrimonio(D, per);
  if (!p.hayDatos) return '';
  const filas = [['En el banco', L(p.enBanco)]];
  if (p.enMano > 0) filas.push(['Efectivo en mano', L(p.enMano)]);
  if (p.enTarjetas > 0) filas.push(['Deuda de tarjetas', '<span class="neg">−' + L(p.enTarjetas) + '</span>']);
  if (p.enFinanciamientos > 0) filas.push(['Financiamientos por pagar', '<span class="neg">−' + L(p.enFinanciamientos) + '</span>']);
  filas.push(['<b>Capital total</b>', `<b${p.neto < 0 ? ' class="neg"' : ''}>${L(p.neto)}</b>`]);
  return `
    <div class="cifras">
      ${cifra('Capital total', L(p.neto), p.neto < 0 ? 'deben más de lo que tienen' : 'lo que tienen menos lo que deben', p.neto < 0)}
      ${cifra('Tienen', L(p.activos), 'banco y efectivo')}
      ${cifra('Deben', L(p.pasivos), 'tarjetas y financiamientos', p.pasivos > 0)}
      ${cifra('Cobertura', p.activos > 0 && p.pasivos > 0 ? pct(p.activos / p.pasivos) : (p.pasivos === 0 ? 'sin deuda' : '0%'),
              'de la deuda cubierta con lo líquido')}
    </div>
    ${tabla(['Concepto', 'Monto'], filas)}`;
}

function diagnostico(D, per) {
  const s = A().saludFinanciera(D, per);
  if (!s.pasos.length && !s.caras.length) return '';
  const m = s.mesesColchon;

  const filas = [];
  if (m !== null) filas.push(['Colchón de emergencia',
    `<b>${m >= 10 ? nf0.format(m) : m.toFixed(1)} ${m === 1 ? 'mes' : 'meses'}</b> ` +
    `<span class="tenue">de ${A().MESES_COLCHON} recomendados</span>`]);
  filas.push(['Líquido disponible hoy', L(s.liquido)]);
  filas.push(['Gasto mensual a cubrir', L(s.gastoMensual) +
    (s.baseReal ? ' <span class="tenue">(lo que gastan de verdad; el plan está sin montos)</span>' : '')]);
  if (s.interesMensual > 0) {
    filas.push(['Intereses de deuda al mes', `<span class="neg">${L(s.interesMensual)}</span>`]);
    filas.push(['Intereses al año', `<span class="neg">${L(s.interesAnual)}</span>`]);
    filas.push(['Disponible una vez pagado el interés', `<b>${L(s.disponibleReal)}</b>`]);
  }

  return `
    ${tabla(['Indicador', 'Valor'], filas)}
    <h3>En qué orden atacarlo</h3>
    <ul class="alertas">${s.pasos.map(x =>
      `<li class="${esc(x.nivel)}"><b>${esc(x.orden)}. ${esc(x.titulo)}</b><br>${esc(x.texto)}</li>`).join('')}</ul>`;
}

function cuentas(D, per) {
  const c = A().saldosCuentas(D, per);
  if (!c.hayDatos) return '';
  return tabla(['Cuenta', 'Al empezar', 'Acreditado', 'Salidas', 'Saldo'],
    c.filas.map(f => [esc(f.nombre), L(f.inicial), L(f.acreditado), '−' + L(f.salidas),
                      `<b${f.saldo < 0 ? ' class="neg"' : ''}>${L(f.saldo)}</b>`])
      .concat(c.filas.length > 1
        ? [['<b>Total</b>', '', '', '', '<b>' + L(c.total) + '</b>']] : []));
}

function planContraReal(D, per) {
  const real = {};
  (D.movimientos || []).filter(m => A().perDe(m) === per)
    .forEach(m => { const k = m.gastoId || 'otros'; real[k] = (real[k] || 0) + (Number(m.monto) || 0); });

  // El plan que rigió ESE mes, que en un mes congelado no es el de hoy.
  const filas = A().gastosMes(D, 0, per).detalle
    .filter(g => g.monto > 0 || real[g.id])
    .map(g => {
      const plan = g.monto, r = real[g.id] || 0, over = plan > 0 && r > plan;
      // Sin plan la barra va vacía. Con `plan || r` salía llena, y una barra
      // llena se lee como "cumplido" justo donde no hay nada que cumplir.
      return [esc(g.concepto) + barra(r, plan, over), plan > 0 ? L(plan) : '—',
              `<span${over ? ' class="neg"' : ''}>${L(r)}</span>`,
              plan > 0 ? `<span${over ? ' class="neg"' : ''}>${over ? '+' : ''}${L(r - plan)}</span>` : '—'];
    });

  if (real['otros']) filas.push(['Otros <span class="tenue">fuera del plan</span>', '—', L(real['otros']), '—']);
  return tabla(['Rubro', 'Plan', 'Real', 'Diferencia'], filas);
}

function categorias(D, per) {
  const c = A().porCategoria(D, per);
  if (!c.total) return '';
  return tabla(['Categoría', 'Registros', 'Monto', 'Peso'],
    c.filas.map(f => [esc(f.categoria) + barra(f.monto, c.total),
                      nf0.format(f.movimientos), L(f.monto), pct(f.pct)])
      .concat([['<b>Total</b>', '', '<b>' + L(c.total) + '</b>', '100%']]));
}

function tarjetas(D, per) {
  const credito = (D.tarjetas || []).filter(t => (t.tipo || 'credito') === 'credito');
  if (!credito.length) return '';
  return credito.map(t => {
    const c = A().cicloTarjeta(D, t, per);
    const p = A().pagoPendiente(D, t, per);
    const e = A().estadoTarjeta(D, t, per);
    return `
      <h3>${esc(t.nombre)}</h3>
      <p class="nota">Ciclo del ${esc(fechaLarga(c.desde))} al ${esc(fechaLarga(c.hasta))}.</p>
      ${e ? `<p class="nota">Consumieron <b>${L(e.consumido)}</b> en el ciclo, abonaron
        <b>${L(e.abonado)}</b> y deben <b>${L(e.deuda)}</b> hoy. Que las tres cifras no
        coincidan no es un error: en medio hubo abonos.${e.pagaTotal
          ? ' Al saldar el total antes de la fecha límite, esa deuda no cuesta intereses.'
          : ''}</p>` : ''}
      ${tabla(['Concepto', 'Monto'], [
        [c.usandoPlan ? 'Según el plan' : 'Cargado en el ciclo', L(c.aCubrir)],
        [c.evento ? 'Lo paga ' + esc(c.evento) : 'Sin pago asignado', L(c.ingresoPago)],
        // Dos cifras distintas que antes se llamaban las dos "falta": lo que le
        // falta AL PAGO para cubrir el corte, y lo que queda del corte SIN PAGAR.
        [c.alcanza === null ? '<b>Sin ingreso asignado</b>'
          : c.alcanza ? '<b>Sobra de ese pago tras saldarla</b>'
          : '<b class="neg">Ese pago se queda corto por</b>',
         `<b${c.alcanza === false ? ' class="neg"' : ''}>${L(Math.abs(c.cobertura))}</b>`],
        ['Ya pagado de este corte', L(p ? p.pagado : 0)],
        [p && p.saldado ? '<b>Corte saldado</b>' : '<b>Queda por pagar del corte</b>',
         `<b${p && !p.saldado && p.pendiente > 0 ? ' class="neg"' : ''}>${L(p ? p.pendiente : 0)}</b>`]
      ])}`;
  }).join('');
}

function financiamientos(D) {
  const libs = A().liberaciones(D);
  if (!libs.length) return '';
  return tabla(['Compromiso', 'Cuota mensual', 'Cuotas restantes', 'Se libera en'],
    libs.map(l => [esc(l.nombre), L(l.cuota), nf0.format(l.enMeses),
                   l.enMeses === 1 ? '1 mes' : l.enMeses + ' meses']));
}

function proyectos(D, per) {
  if (!(D.proyectos || []).length) return '';
  const cartera = A().evaluarCartera(D, per);
  const nombre = A().VEREDICTOS;

  return (D.proyectos || []).map((p, i) => {
    const ev = cartera[p.id];
    const plazo = m => m === null ? 'más de 5 años' : m === 0 ? 'ya está' : m === 1 ? '1 mes' : m + ' meses';
    return `
      <h3>${i + 1}. ${esc(p.nombre)} <span class="pill ${esc(ev.veredicto)}">${esc(nombre[ev.veredicto] || '')}</span></h3>
      ${tabla(['Concepto', 'Valor'], [
        ['Costo estimado', ev.max > ev.min ? L(ev.min) + ' – ' + L(ev.max) : L(ev.max)],
        ['Acumulado', L(ev.junta) + ' <span class="tenue">(' +
          pct(ev.max > 0 ? ev.junta / ev.max : 0) + ')</span>'],
        ['Falta', L(ev.faltaMax)],
        ['Cuota sugerida', L(ev.cuotaSugerida) + ' al mes · ' + L(ev.quincenal) + ' por quincena'],
        ['Plazo al ritmo sugerido', plazo(ev.mesesSugerido)],
        ['Destinando todo el disponible', plazo(ev.mesesMax)],
        ['Compromiso del disponible', pct(Math.min(9.99, ev.carga))]
      ])}
      ${ev.alertas.length ? `<ul class="alertas">${ev.alertas
        .map(a => `<li class="${esc(a.nivel)}">${esc(a.texto)}</li>`).join('')}</ul>` : ''}`;
  }).join('');
}

function proyeccion(D, per) {
  const filas = A().proyectar(D, per, 12).filas;
  return tabla(['Mes', 'Ingreso', 'Gastos', 'Salud', 'Cuotas', 'Disponible'],
    filas.map(f => [mesLabel(f.per) + (f.confirmado ? '' : ' <span class="tenue">est.</span>'),
                    L(f.ingreso), L(f.corriente), L(f.salud), L(f.cuotas),
                    `<b${f.disponible < 0 ? ' class="neg"' : ''}>${L(f.disponible)}</b>`]));
}

function historia(D, per) {
  const h = A().historia(D, per, 12);
  if (!h.meses) return '';
  return `
    ${tabla(['Mes', 'Entró', 'Se gastó', 'Quedó'],
      h.filas.slice().reverse().map(f => [
        mesLabel(f.per) + (f.enCurso ? ' <span class="tenue">en curso</span>' : '')
                        + (f.confirmado ? '' : ' <span class="tenue">est.</span>'),
        L(f.ingreso), L(f.gastado),
        `<b${f.quedo < 0 ? ' class="neg"' : ''}>${L(f.quedo)}</b>`]))}
    <p class="nota">Promedio de lo que queda al mes: <b>${L(h.promedio)}</b>
    sobre ${h.mesesCerrados} ${h.mesesCerrados === 1 ? 'mes cerrado' : 'meses cerrados'}
    — el mes en curso no entra en el promedio, que llevaría unos días de gasto contra
    meses enteros. Solo aparecen los meses con algo registrado.</p>`;
}

/* ---------- documento ---------- */

function generar(D, per) {
  const ini = A().inicioMes(D);
  const rango = A().rangoPeriodo(per, ini);
  const subtitulo = ini === 1 ? mesLabel(per)
    : `${mesLabel(per)} · del ${fechaLarga(rango.desde)} al ${fechaLarga(rango.hasta)}`;
  const quienes = (D.personas || []).map(p => p.nombre).filter(Boolean).join(' y ');
  const generado = new Date();

  const cuerpo = [
    seccion('Recomendación del asesor', carta(D, per),
      'Lo que haría un consultor con estos números: dónde están parados, qué hacer con el dinero de este mes y qué meta toca. Todas las cifras salen de lo que ustedes registraron.'),
    seccion('Capital total', capital(D, per),
      'Lo único que no se puede maquillar: el disponible del mes puede verse bien con la tarjeta reventada. Esta cifra junta las dos caras.'),
    seccion('Diagnóstico y prioridades', diagnostico(D, per),
      'El orden importa más que cualquier consejo suelto. Apartar para una meta mientras se revuelve una tarjeta cara pierde dinero cada mes.'),
    seccion('Resumen del mes', resumen(D, per)),
    seccion('En el banco', cuentas(D, per),
      'Solo suma lo confirmado como recibido. Un consumo con tarjeta de crédito no resta hasta que se paga el corte.'),
    seccion('Plan contra realidad', planContraReal(D, per)),
    seccion('En qué se fue', categorias(D, per)),
    seccion('Tarjetas de crédito', tarjetas(D, per)),
    seccion('Compromisos fijos', financiamientos(D),
      'Cuotas que ya están comprometidas. Al terminar, ese monto vuelve al disponible.'),
    seccion('Proyectos', proyectos(D, per),
      'El disponible se reparte en cascada: el primero de la lista reserva antes que los demás.'),
    seccion('Proyección a 12 meses', proyeccion(D, per),
      'Supone que el ingreso se repite con el monto típico después del último mes confirmado. Los gastos con crecimiento se capitalizan y las cuotas desaparecen al terminarse.'),
    seccion('Historia', historia(D, per))
  ].filter(Boolean).join('');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Análisis de presupuesto · ${esc(mesLabel(per))}</title>
<style>
  :root{--ink:#0b0b0b;--ink2:#52514e;--tenue:#898781;--linea:#e1e0d9;
        --azul:#1c5cab;--rojo:#b32d2d;--verde:#006300;--ambar:#7a5200;--fondo:#fff}
  *{box-sizing:border-box}
  body{margin:0;padding:32px 20px 64px;background:#f4f4f1;color:var(--ink);
       font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
  .hoja{max-width:820px;margin:0 auto;background:var(--fondo);padding:44px 40px 52px;
        border-radius:12px;box-shadow:0 2px 20px rgba(0,0,0,.07)}
  header{border-bottom:2px solid var(--ink);padding-bottom:18px;margin-bottom:8px}
  h1{font-size:25px;letter-spacing:-.025em;margin:0}
  .sub{margin-top:5px;color:var(--ink2);font-size:14px}
  .meta{margin-top:3px;color:var(--tenue);font-size:12.5px}
  section{margin-top:34px;break-inside:avoid}
  h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--tenue);
     margin:0 0 12px;padding-bottom:6px;border-bottom:1px solid var(--linea)}
  h3{font-size:15.5px;margin:22px 0 8px;letter-spacing:-.015em}
  .nota{color:var(--ink2);font-size:12.5px;margin:10px 0 0;line-height:1.5}
  table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13.5px}
  th,td{padding:8px 10px;border-bottom:1px solid var(--linea);text-align:left;vertical-align:top}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--tenue);font-weight:650}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  tbody tr:last-child td{border-bottom:0}
  .neg{color:var(--rojo)}
  .tenue{color:var(--tenue);font-weight:400}
  .cifras{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:6px}
  .cifra{border:1px solid var(--linea);border-radius:10px;padding:12px 13px}
  .cifra__l{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--tenue);font-weight:650}
  .cifra__v{font-size:19px;font-weight:700;letter-spacing:-.025em;margin-top:4px;
            font-variant-numeric:tabular-nums}
  .cifra__v.neg{color:var(--rojo)}
  .cifra__d{font-size:11.5px;color:var(--ink2);margin-top:3px}
  .barra{height:5px;border-radius:3px;background:#eceae4;overflow:hidden;margin-top:6px}
  .barra__f{height:100%;background:var(--azul);border-radius:3px}
  .barra__f.over{background:var(--rojo)}
  .pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;
        font-weight:700;vertical-align:middle;background:#eceae4;color:var(--ink2)}
  .pill.viable,.pill.logrado,.pill.programado{background:#e6f6e6;color:var(--verde)}
  .pill.ajustado,.pill.puede_esperar{background:#fdf3e0;color:var(--ambar)}
  .pill.inviable,.pill.reconsiderar,.pill.hazlo_ya{background:#fbe9e9;color:var(--rojo)}
  .carta h3{font-size:14px;margin:16px 0 4px;letter-spacing:-.01em}
  .carta h3:first-child{margin-top:4px}
  .carta p{margin:0;font-size:13.5px;line-height:1.62;color:var(--ink2)}
  .alertas{margin:10px 0 0;padding:0;list-style:none}
  .alertas li{font-size:12.5px;color:var(--ink2);padding:7px 0 7px 13px;
              border-left:3px solid var(--linea);margin-top:6px}
  .alertas li.critical{border-color:var(--rojo)}
  .alertas li.serious{border-color:var(--ambar)}
  footer{margin-top:40px;padding-top:16px;border-top:1px solid var(--linea);
         font-size:11.5px;color:var(--tenue);line-height:1.55}
  @media print{
    body{background:#fff;padding:0;font-size:11pt}
    .hoja{box-shadow:none;border-radius:0;max-width:none;padding:0}
    section{page-break-inside:avoid}
    h2{page-break-after:avoid}
    .cifras{grid-template-columns:repeat(4,1fr)}
  }
  @media (max-width:640px){
    body{padding:0}
    .hoja{padding:26px 18px 34px;border-radius:0}
    .cifras{grid-template-columns:repeat(2,1fr)}
    table{font-size:12.5px}
    th,td{padding:7px 6px}
  }
</style></head>
<body>
<div class="hoja">
  <header>
    <h1>Análisis de presupuesto</h1>
    <div class="sub">${esc(subtitulo)}</div>
    <div class="meta">${quienes ? esc(quienes) + ' · ' : ''}generado el
      ${esc(generado.toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' }))}
      a las ${esc(generado.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }))}</div>
  </header>
  ${cuerpo}
  <footer>
    Documento generado por la app de presupuesto del hogar con los datos registrados
    hasta la fecha indicada. Las cifras marcadas como <i>estimadas</i> usan el monto
    típico porque ese mes todavía no se ha confirmado; las demás son lo realmente
    recibido y gastado. La proyección no adivina ingresos futuros: repite el último
    patrón conocido.
  </footer>
</div>
</body></html>`;
}

window.Reporte = { generar };

})();
