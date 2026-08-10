/* ============================================================
   La vuelta completa: base → armador → núcleo.

   POR QUÉ NO BASTA CON `armador.prueba.js`:

   Aquella suite compara el armador contra fixtures que escribí yo,
   con los nombres de columna que yo CREO que existen. Si me
   equivoqué igual en los dos sitios —en el armador y en el
   fixture— la prueba pasa en verde y producción falla. Es el
   clásico examen donde uno se corrige su propia hoja.

   Esta suite no acepta mi palabra: escribe filas de verdad en la
   base de pruebas, las vuelve a leer por la API, las pasa por el
   armador y comprueba que el núcleo saca los números correctos.
   Si un nombre de columna no existe, la escritura falla; si el
   armador lee un campo que la base no da, el número sale mal.

   Correr:  npm run pruebas:integracion
   ============================================================ */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../sitio/app/nucleo/index.js';
import { armar, CONFIGURACION, POR_MES } from '../sitio/app/datos/armador.js';
import { entrar } from '../sitio/app/datos/api.js';
import { cerrarMes, guardarAvance, reabrirMes, ErrorSiguienteCerrado }
  from '../sitio/app/datos/cierre.js';

const URL     = process.env.SUPABASE_URL;
const ANON    = process.env.SUPABASE_ANON_KEY;
const SECRETA = process.env.SUPABASE_SERVICE_KEY;

if (!URL || !ANON || !SECRETA) {
  console.error('\nFaltan SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_KEY.\n');
  process.exit(1);
}
if (/qhbkghxuwzdrlswphusd/.test(URL)) {
  console.error('\nESTO APUNTA A PRODUCCIÓN. Abortando.\n');
  process.exit(1);
}

const admin = (ruta, opts = {}) => fetch(`${URL}${ruta}`, {
  ...opts,
  headers: { apikey: SECRETA, Authorization: `Bearer ${SECRETA}`,
             'Content-Type': 'application/json', ...(opts.headers || {}) }
});

let sesion;
const api = (ruta, opts = {}) => fetch(`${URL}/rest/v1${ruta}`, {
  ...opts,
  headers: { apikey: ANON, Authorization: `Bearer ${sesion.access_token}`,
             'Content-Type': 'application/json',
             Prefer: 'return=representation', ...(opts.headers || {}) }
});

const json = async r => { const t = await r.text(); try { return t ? JSON.parse(t) : null; } catch { return t; } };

/** Inserta y revienta con el mensaje de Postgres si la columna no existe. */
async function meter(tabla, fila) {
  const r = await api(`/${tabla}`, { method: 'POST', body: JSON.stringify(fila) });
  const cuerpo = await json(r);
  if (!r.ok) throw new Error(`insertar en ${tabla}: ${JSON.stringify(cuerpo)}`);
  return cuerpo[0];
}

const sello = Date.now();
const correo = `integracion-${sello}@controlewallet.test`;
const clave  = `Clave-${sello}`;
let usuario, hogar, doc;

before(async () => {
  const r = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: correo, password: clave, email_confirm: true })
  });
  usuario = await json(r);
  if (!r.ok) throw new Error('alta: ' + JSON.stringify(usuario));

  const s = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: correo, password: clave })
  });
  sesion = await json(s);
  if (!s.ok) throw new Error('sesión: ' + JSON.stringify(sesion));

  hogar = (await json(await api('/hogares?select=*')))[0];
  assert.ok(hogar?.id, 'el alta no creó hogar');

  // El hogar arranca su mes el 7, como el original: así se ejercita
  // el camino difícil, no el de calendario.
  await api(`/hogares?id=eq.${hogar.id}`, { method: 'PATCH', body: JSON.stringify({ inicio_mes: 7 }) });

  const H = hogar.id;

  /* ---------- se siembra un hogar completo ---------- */

  const cuenta = await meter('cuentas', {
    hogar_id: H, nombre: 'Ficohsa', numero: '200012610911',
    saldo_inicial: 30000, desde_mes: '2026-07',
    retenido_monto: 450, retenido_fecha: '2026-08-04',
    saldo_banco_monto: 28750.25, saldo_banco_fecha: '2026-08-03'
  });

  const persona = await meter('personas', { hogar_id: H, nombre: 'Moisés', cuenta_id: cuenta.id });

  const pago = await meter('plantilla_ingresos', { hogar_id: H, nombre: 'Comisiones', dia: 6 });

  await meter('plantilla_lineas', {
    hogar_id: H, plantilla_id: pago.id, persona_id: persona.id,
    bruto: 25000, deducciones: [{ concepto: 'ISR', monto: 5000 }]
  });

  const tarjeta = await meter('tarjetas', {
    hogar_id: H, nombre: 'BAC', numero: '4321', tipo: 'credito',
    dia_corte: 6, dia_pago: 20, paga_con: pago.id,
    saldo_inicial: 0, desde_mes: '2026-07', paga_total: true, tasa_anual: 54,
    retenido_monto: 120, retenido_fecha: '2026-08-05',
    saldo_banco_monto: 19101, saldo_banco_fecha: '2026-08-06'
  });

  const comida = await meter('gastos', {
    hogar_id: H, concepto: 'Comida', monto: 8000, categoria: 'Alimentación',
    medio_pago: 'tarjeta', tarjeta_id: tarjeta.id, crecimiento: 0, orden: 0
  });
  const salud = await meter('gastos', {
    hogar_id: H, concepto: 'Pediatría', monto: 2000, categoria: 'Salud',
    medio_pago: 'efectivo', crecimiento: 3, orden: 1
  });

  await meter('financiamientos', {
    hogar_id: H, nombre: 'Refri', cuota_mensual: 500, cuotas_totales: 12, cuotas_pagadas: 5
  });

  const proyecto = await meter('proyectos', {
    hogar_id: H, nombre: 'Carro', costo_min: 180000, costo_max: 220000,
    aporte_mensual: 3000, tipo: 'necesidad', urgencia: 'este_ano', orden: 0
  });
  await meter('aportes', {
    hogar_id: H, proyecto_id: proyecto.id, persona_id: persona.id,
    monto: 4500, fecha: '2026-07-20'
  });

  await meter('ingresos_mes', {
    hogar_id: H, periodo: '2026-07', plantilla_id: pago.id, persona_id: persona.id,
    bruto: 27400, deducciones: [{ concepto: 'ISR', monto: 6200 }], confirmado: true
  });

  await meter('movimientos', { hogar_id: H, fecha: '2026-07-20', periodo: '2026-07', monto: 2410.75,
    concepto: 'Súper', gasto_id: comida.id, persona_id: persona.id, medio_pago: 'tarjeta', tarjeta_id: tarjeta.id });
  await meter('movimientos', { hogar_id: H, fecha: '2026-08-02', periodo: '2026-07', monto: 1180.50,
    concepto: 'Gasolina', gasto_id: comida.id, persona_id: persona.id, medio_pago: 'tarjeta', tarjeta_id: tarjeta.id });
  await meter('movimientos', { hogar_id: H, fecha: '2026-07-15', periodo: '2026-07', monto: 640.25,
    concepto: 'Farmacia', gasto_id: salud.id, persona_id: persona.id, medio_pago: 'efectivo' });

  await meter('retiros', { hogar_id: H, fecha: '2026-07-18', periodo: '2026-07', monto: 3000,
    cuenta_id: cuenta.id, persona_id: persona.id, nota: 'Cajero' });

  await meter('pagos_tarjeta', { hogar_id: H, fecha: '2026-07-25', periodo: '2026-07', monto: 5000,
    tarjeta_id: tarjeta.id, cuenta_id: cuenta.id });

  await meter('comercios', { hogar_id: H, clave: 'PAIZ', gasto_id: comida.id });

  /* ---------- y se lee de vuelta, como lo hará la app ---------- */

  const filas = { hogar: (await json(await api(`/hogares?id=eq.${H}&select=*`)))[0] };
  for (const t of [...CONFIGURACION, ...POR_MES]) {
    filas[t] = await json(await api(`/${t}?select=*`));
  }
  doc = armar(filas);

  /* La misma sesión, pero dentro del cliente DE LA APP. Es lo que
     permite que las pruebas del cierre corran el módulo de producción
     —`datos/cierre.js`, con su `api.js` debajo— en vez de una
     imitación. Sin esto habría que reescribir aquí el orden de los dos
     escritos, y una copia del código no prueba el código. */
  await entrar(correo, clave);
});

after(async () => {
  if (usuario?.id) await admin(`/auth/v1/admin/users/${usuario.id}`, { method: 'DELETE' });
});

/* ============================================================
   Lo que la base devolvió, calculado por el núcleo
   ============================================================ */

test('el documento armado desde la base tiene todo lo sembrado', () => {
  assert.equal(doc.inicioMes, 7, 'el día de arranque no llegó');
  assert.equal(doc.personas.length, 1);
  assert.equal(doc.cuentas.length, 1);
  assert.equal(doc.tarjetas.length, 1);
  assert.equal(doc.gastos.length, 2);
  assert.equal(doc.financiamientos.length, 1);
  assert.equal(doc.proyectos.length, 1);
  assert.equal(doc.proyectos[0].aportes.length, 1);
  assert.equal(doc.plantillaIngresos.length, 1);
  assert.equal(doc.plantillaIngresos[0].lineas.length, 1);
  assert.equal(doc.movimientos.length, 3);
  assert.equal(doc.retiros.length, 1);
  assert.equal(doc.pagosTarjeta.length, 1);
  assert.equal(doc.comercios.PAIZ, doc.gastos.find(g => g.concepto === 'Comida').id);
  assert.equal(doc.configurado, true);
});

test('las anclas de conciliación sobrevivieron el viaje de ida y vuelta', () => {
  assert.deepEqual(doc.cuentas[0].saldoBanco, { monto: 28750.25, fecha: '2026-08-03' });
  assert.deepEqual(doc.cuentas[0].retenido,   { monto: 450,      fecha: '2026-08-04' });
  assert.deepEqual(doc.tarjetas[0].saldoBanco, { monto: 19101,   fecha: '2026-08-06' });
  assert.deepEqual(doc.tarjetas[0].retenido,   { monto: 120,     fecha: '2026-08-05' });
});

test('ningún monto quedó como texto al volver de la base', () => {
  // Es LA trampa: PostgREST devuelve `numeric` como cadena, y
  // "8000.00" + "2000.00" da "8000.002000.00" sin que nada avise.
  const malos = [];
  const revisar = (ruta, v) => {
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) &&
        !/fecha|periodo|desdeMes|cerradoEl|numero|\bdia\b|id$/i.test(ruta)) malos.push(`${ruta}="${v}"`);
    else if (Array.isArray(v)) v.forEach((x, i) => revisar(`${ruta}[${i}]`, x));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => revisar(`${ruta}.${k}`, x));
  };
  revisar('D', JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(malos, []);
});

test('el ingreso confirmado manda sobre la plantilla', () => {
  const r = A.ingresoMes(doc, '2026-07');
  // 27,400 confirmados − 6,200 de ISR = 21,200. La plantilla decía
  // 25,000 − 5,000 = 20,000, y no debe usarse.
  assert.equal(r.neto, 21200);
  assert.equal(r.confirmado, true);
});

test('un mes sin confirmar cae a la plantilla y se marca estimado', () => {
  const r = A.ingresoMes(doc, '2026-08');
  assert.equal(r.neto, 20000);
  assert.equal(r.confirmado, false);
});

test('el gasto del 2 de agosto pertenece a julio, por el ciclo del hogar', () => {
  // Con arranque el 7, ese movimiento es de julio. Si el armador
  // perdiera `inicio_mes`, caería en agosto y el cierre no cuadraría.
  const porCat = A.porCategoria(doc, '2026-07');
  const total = porCat.filas.reduce((s, f) => s + f.monto, 0);
  assert.equal(Number(total.toFixed(2)), 4231.50, 'los tres movimientos deben sumar en julio');
});

test('el ciclo de la tarjeta cuadra con lo cargado', () => {
  const c = A.cicloTarjeta(doc, doc.tarjetas[0], '2026-07');
  // Del 7 jul al 6 ago: el súper (2,410.75) y la gasolina (1,180.50).
  assert.equal(c.cargado, 3591.25);
  assert.equal(c.evento, 'Comisiones');
});

test('cuando el banco declaró un saldo, ese manda', () => {
  const s = A.saldoCuenta(doc, doc.cuentas[0], '2026-07');
  // Hay un ancla del banco: 28,750.25 al 3 de agosto. A partir de ahí
  // el núcleo NO recalcula desde cero — toma la palabra del banco y le
  // suma solo lo posterior a esa fecha. Es justo para lo que existe el
  // ancla, y es lo que hace que la conciliación signifique algo.
  assert.equal(s.saldo, 28750.25);
});

test('sin declaración del banco, el saldo se calcula desde el inicial', () => {
  // El mismo hogar sin ancla: 30,000 inicial + 21,200 confirmado
  // − 3,000 de retiro − 5,000 de pago de tarjeta = 43,200.
  const sinAncla = structuredClone(doc);
  delete sinAncla.cuentas[0].saldoBanco;
  const s = A.saldoCuenta(sinAncla, sinAncla.cuentas[0], '2026-07');
  assert.equal(s.saldo, 43200);
});

test('el disponible real no resta la tarjeta dos veces', () => {
  const r = A.resumenMes(doc, '2026-07');
  // 21,200 neto − 10,000 de gastos − 500 de cuota = 10,700.
  // El pago de la tarjeta NO entra: sus consumos ya están en gastos.
  assert.equal(r.disponible, 10700);
});

test('el asesor produce su carta sin tropezar con datos reales', () => {
  const carta = A.cartaAsesor(doc, '2026-07');
  assert.ok(carta && (Array.isArray(carta) ? carta.length : Object.keys(carta).length),
    'la carta salió vacía');
});

test('cerrar un mes desde la API lo vuelve inmutable de verdad', async () => {
  await meter('presupuesto_mes', {
    hogar_id: hogar.id, periodo: '2026-07',
    montos: { x: 1 }, cerrado: true, cerrado_el: new Date().toISOString()
  });
  const r = await api('/movimientos', {
    method: 'POST',
    body: JSON.stringify({ hogar_id: hogar.id, fecha: '2026-07-28', periodo: '2026-07', monto: 1 })
  });
  assert.ok(!r.ok, 'entró un movimiento en un mes ya cerrado');
});

/* ============================================================
   El cierre de mes, corriendo el módulo de producción

   Estas no imitan lo que hace la app: importan `datos/cierre.js` y lo
   ejecutan contra la base de pruebas con la sesión de un usuario de
   verdad. Es la única forma de comprobar lo que más caro sale y menos
   se ve — el ORDEN de los dos escritos, y que sembrarle la apertura al
   mes siguiente no le borre lo que ya tenía.

   Se usan meses distintos de 2026-07 porque la prueba de arriba lo
   dejó cerrado, y un mes cerrado ya no admite nada.
   ============================================================ */

/** La fila de `presupuesto_mes` de un período, leída con la clave de servicio. */
const filaMes = async periodo => (await json(
  await admin(`/rest/v1/presupuesto_mes?hogar_id=eq.${hogar.id}&periodo=eq.${periodo}&select=*`)))[0] || null;

/** Lo que la pantalla le pasa a `cerrarMes`, ya calculado por el servidor. */
const paraCerrar = (periodo, extra = {}) => ({
  periodo, hogarId: hogar.id,
  montos: { g1: 8000 }, notas: { g1: 'Compra grande de despensa' },
  ajustes: { 'cuenta:c1': { monto: -125.5, nota: 'Comisión que no anotamos' } },
  efectivoContado: 1450,
  saldos: { fecha: '2026-09-06', cuentas: { c1: 28750.25 }, tarjetas: { t1: 19101 },
            financiamientos: { f1: 3500 }, efectivo: 1450 },
  desdeSiguiente: '2026-09-07',
  ...extra
});

test('guardar a medias no cierra el mes ni le inventa una fecha', async () => {
  await guardarAvance(paraCerrar('2026-09'));
  const f = await filaMes('2026-09');
  assert.ok(f, 'no se escribió la fila');
  assert.equal(f.cerrado, false);
  assert.equal(f.cerrado_el, null, 'decir que se cerró el día tal, sin haberlo cerrado, es inventar un hecho');
  assert.equal(f.notas.g1, 'Compra grande de despensa');
  assert.equal(Number(f.efectivo_contado), 1450);
});

test('cerrar escribe las DOS filas: el mes y la apertura del siguiente', async () => {
  const r = await cerrarMes(paraCerrar('2026-09'));
  assert.equal(r.sig, '2026-10');

  const mes = await filaMes('2026-09');
  assert.equal(mes.cerrado, true);
  assert.ok(mes.cerrado_el, 'un mes cerrado deja constancia de cuándo');
  assert.equal(mes.montos.g1, 8000);
  assert.equal(mes.ajustes['cuenta:c1'].nota, 'Comisión que no anotamos');

  const sig = await filaMes('2026-10');
  assert.ok(sig, 'el mes siguiente se quedó sin apertura: arrancaría deduciendo del histórico');
  assert.equal(sig.cerrado, false, 'sembrar la apertura no cierra el mes siguiente');
  assert.equal(sig.apertura.cuentas.c1, 28750.25);
  assert.equal(sig.apertura.efectivo, 1450);
  assert.equal(sig.apertura.fecha, '2026-09-07');
});

test('la apertura sembrada vuelve del armador como DECLARADA, no deducida', async () => {
  // Es la vuelta completa: lo que se escribió al cerrar tiene que
  // llegarle al núcleo como un hecho. Si volviera `derivada`, el mes
  // siguiente se pondría a recorrer el histórico — que en el navegador
  // no está.
  const filas = { hogar: (await json(await api(`/hogares?id=eq.${hogar.id}&select=*`)))[0] };
  for (const t of [...CONFIGURACION, ...POR_MES]) filas[t] = await json(await api(`/${t}?select=*`));
  const D = armar(filas);

  const ap = A.aperturaDe(D, '2026-10');
  assert.equal(ap.derivada, false, 'la apertura guardada se estaría tratando como deducción');
  assert.equal(ap.cuentas[Object.keys(ap.cuentas)[0]], 28750.25);
  assert.equal(ap.efectivo, 1450);
});

test('sembrar la apertura NO le borra al mes siguiente su foto del plan', async () => {
  /* El upsert solo toca las columnas que viajan. Si `filaApertura`
     mandara la fila entera, el mes siguiente perdería sus montos —y con
     ellos el plan que rigió— sin que nada avisara. */
  await admin('/rest/v1/presupuesto_mes', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ hogar_id: hogar.id, periodo: '2026-12',
                           montos: { g1: 4321 }, notas: { g1: 'lo de diciembre' } })
  });

  await cerrarMes(paraCerrar('2026-11', { desdeSiguiente: '2026-12-07' }));

  const dic = await filaMes('2026-12');
  assert.equal(dic.montos.g1, 4321, 'la foto del plan de diciembre se perdió al sembrarle la apertura');
  assert.equal(dic.notas.g1, 'lo de diciembre');
  assert.ok(dic.apertura, 'y aun así la apertura tiene que haber quedado');
});

test('no se cierra un mes si el siguiente ya está cerrado, y no queda nada a medias', async () => {
  await meter('presupuesto_mes', {
    hogar_id: hogar.id, periodo: '2027-02',
    montos: { g1: 1 }, cerrado: true, cerrado_el: new Date().toISOString()
  });

  await assert.rejects(
    () => cerrarMes(paraCerrar('2027-01', { desdeSiguiente: '2027-02-07' })),
    e => e instanceof ErrorSiguienteCerrado && e.siguiente === '2027-02');

  // Lo que importa no es que fallara: es que no dejó el mes cerrado a
  // medias. Se lee ANTES de escribir justo para esto.
  const enero = await filaMes('2027-01');
  assert.ok(!enero || enero.cerrado === false, 'enero quedó cerrado pese a que el cierre se rechazó');
});

test('reabrir devuelve el mes a editable y le quita la fecha de cierre', async () => {
  const antes = await filaMes('2026-09');
  assert.equal(antes.cerrado, true, 'la prueba anterior debía dejarlo cerrado');

  await reabrirMes({ periodo: '2026-09', hogarId: hogar.id });

  const f = await filaMes('2026-09');
  assert.equal(f.cerrado, false);
  assert.equal(f.cerrado_el, null);
  // La apertura del siguiente NO se borra: mientras el mes vuelve a
  // cuadrar, esa cifra sigue siendo la mejor que hay.
  assert.ok((await filaMes('2026-10')).apertura, 'se borró la apertura del mes siguiente al reabrir');
});
