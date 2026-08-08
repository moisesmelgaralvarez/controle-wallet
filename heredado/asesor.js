/* ============================================================
   Motor del asesor financiero.
   Funciones puras: reciben el documento de datos y devuelven
   números. No tocan el DOM ni el almacenamiento, para poder
   probarlas por separado (ver pruebas.html).

   El flujo que modela:

     ingreso neto del mes
     − gastos corrientes
     − fondo de salud
     − cuotas de financiamientos
     = disponible real para metas

   La tarjeta de crédito NO se resta aquí. Es el medio por el que
   pasa el gasto, no un gasto adicional: si los consumos del mes ya
   están en "gastos", restar además el pago de la tarjeta contaría
   el mismo dinero dos veces. La tarjeta se vigila aparte, por ciclo
   de corte, para saber si el ingreso que la paga alcanza a cubrirla.
   ============================================================ */
(function () {
'use strict';

const HORIZONTE = 60;          // meses que se simulan como máximo
const COLCHON_MIN = 0.20;      // parte del disponible que no debería comprometerse

const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
const dosDig = n => String(n).padStart(2, '0');

/* ---------- fechas ---------- */

function sumaMeses(per, n) {
  const [y, m] = per.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}`;
}

function distanciaMeses(desde, hasta) {
  const [y1, m1] = desde.split('-').map(Number);
  const [y2, m2] = hasta.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

const diasDelMes = (y, m) => new Date(y, m, 0).getDate();          // m: 1-12
const iso = (y, m, d) => `${y}-${dosDig(m)}-${dosDig(d)}`;

/**
 * Hoy, en la fecha del teléfono. Nunca con toISOString(): eso da UTC, y en
 * Honduras (UTC−6) a partir de las 6 de la tarde ya devuelve el día siguiente.
 */
const hoyLocal = () => {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
};

/** Acota un día al último día real del mes (un corte 31 en febrero es el 28/29). */
const diaValido = (y, m, dia) => Math.min(Math.max(1, num(dia) || 1), diasDelMes(y, m));

/* ---------- el mes del hogar ---------- */

/**
 * Muchos hogares no viven en meses de calendario sino en el ciclo de su
 * tarjeta: "agosto" es del 7 de agosto al 6 de septiembre, porque ese es el
 * gasto que paga el ingreso del 6. `inicio` es el día en que arranca el mes.
 *
 * Con inicio 1 se comporta como siempre: mes de calendario.
 */
const inicioMes = D => Math.min(28, Math.max(1, num(D && D.inicioMes) || 1));

/** A qué mes del hogar pertenece una fecha. */
function periodoDe(fecha, inicio) {
  const t = String(fecha || '');
  if (t.length < 10) return t.slice(0, 7);
  const [y, m, d] = t.split('-').map(Number);
  const per = `${y}-${dosDig(m)}`;
  // Antes del día de arranque, la fecha todavía pertenece al mes anterior.
  return d >= Math.max(1, inicio || 1) ? per : sumaMeses(per, -1);
}

/** Primer y último día de un mes del hogar. */
function rangoPeriodo(per, inicio) {
  const ini = Math.max(1, inicio || 1);
  const [y, m] = per.split('-').map(Number);
  if (ini === 1) return { desde: iso(y, m, 1), hasta: iso(y, m, diasDelMes(y, m)) };

  const desdeD = diaValido(y, m, ini);
  const sig = sumaMeses(per, 1);
  const [y2, m2] = sig.split('-').map(Number);
  const finD = diaValido(y2, m2, ini) - 1;

  // Si el arranque cae el día 1 del mes siguiente, el cierre es el último de este.
  if (finD < 1) return { desde: iso(y, m, desdeD), hasta: iso(y, m, diasDelMes(y, m)) };
  return { desde: iso(y, m, desdeD), hasta: iso(y2, m2, finD) };
}

/** Cuántos días dura ese mes del hogar. */
function diasPeriodo(per, inicio) {
  const r = rangoPeriodo(per, inicio);
  return Math.round((Date.parse(r.hasta) - Date.parse(r.desde)) / 86400000) + 1;
}

/* ---------- ingresos ---------- */

const dedTotal  = l => (l.deducciones || []).reduce((s, d) => s + num(d.monto), 0);
const netoLinea = l => (l ? num(l.bruto) - dedTotal(l) : 0);

/**
 * Línea de ingreso vigente para un mes. Si ese mes ya fue confirmado con
 * lo que realmente entró, manda lo confirmado; si no, se usa la plantilla
 * como estimación.
 */
function lineaDe(D, ev, personaId, per) {
  const mes = D.ingresosMes && D.ingresosMes[per];
  const real = mes && mes.lineas && mes.lineas[ev.id];
  if (real && real[personaId]) return real[personaId];
  return (ev.lineas || []).find(l => l.personaId === personaId);
}

/** El mes confirmado más reciente ANTES de `per` para ese pago. */
function mesConfirmadoPrevio(D, evId, per) {
  const meses = Object.keys(D.ingresosMes || {}).filter(k => {
    const m = D.ingresosMes[k];
    return k < per && m && m.confirmado && m.confirmado[evId] &&
           m.lineas && m.lineas[evId];
  }).sort();
  return meses.length ? meses[meses.length - 1] : null;
}

/**
 * Con qué rellenar el formulario de confirmación, y de dónde salió.
 *
 * El orden importa. La plantilla es lo que alguien tecleó una vez al configurar
 * la app: seis meses después ya no se parece a nada. Lo confirmado el mes
 * pasado sí — el sueldo y las retenciones se mueven poco de un mes a otro. Por
 * eso se copia de ahí y solo se cae a la plantilla si nunca se confirmó nada.
 *
 * Rellenar no es confirmar: la cifra queda propuesta y quien confirma sigue
 * siendo la persona, que es lo único que convierte una estimación en un hecho.
 */
function lineaParaConfirmar(D, ev, personaId, per) {
  const mes = (D.ingresosMes || {})[per];
  const propia = mes && mes.lineas && mes.lineas[ev.id] && mes.lineas[ev.id][personaId];
  if (propia) return { linea: propia, origen: 'mes', desde: per };

  const prev = mesConfirmadoPrevio(D, ev.id, per);
  if (prev) {
    const l = ((D.ingresosMes[prev].lineas || {})[ev.id] || {})[personaId];
    if (l) return { linea: l, origen: 'copia', desde: prev };
  }
  return { linea: (ev.lineas || []).find(l => l.personaId === personaId),
           origen: 'plantilla', desde: null };
}

const eventoConfirmado = (D, evId, per) => Boolean(
  D.ingresosMes && D.ingresosMes[per] && D.ingresosMes[per].confirmado &&
  D.ingresosMes[per].confirmado[evId]
);

/** Ingreso de un mes: real donde se confirmó, estimado donde no. */
function ingresoMes(D, per) {
  let bruto = 0, neto = 0;
  const porPersona = {}, porEvento = {}, pendientes = [];
  (D.personas || []).forEach(p => { porPersona[p.id] = 0; });

  (D.plantillaIngresos || []).forEach(ev => {
    porEvento[ev.id] = 0;
    if (!eventoConfirmado(D, ev.id, per)) pendientes.push(ev);
    (D.personas || []).forEach(p => {
      const l = lineaDe(D, ev, p.id, per);
      if (!l) return;
      const n = netoLinea(l);
      bruto += num(l.bruto);
      neto += n;
      porPersona[p.id] += n;
      porEvento[ev.id] += n;
    });
  });

  const total = (D.plantillaIngresos || []).length;
  return {
    bruto, neto, deducciones: bruto - neto, porPersona, porEvento, pendientes,
    confirmado: total > 0 && pendientes.length === 0,
    parcial: pendientes.length > 0 && pendientes.length < total
  };
}

/* ---------- gastos ---------- */

/* ---------- el presupuesto de cada mes ---------- */

/**
 * Montos congelados de un mes, si ya se congeló.
 *
 * El plan de `D.gastos` es la PLANTILLA: lo que rige de hoy en adelante.
 * Cuando un mes termina se le saca una foto y esa foto no vuelve a moverse.
 * Sin eso, bajar el presupuesto de supermercado en septiembre reescribiría
 * agosto hacia atrás y haría parecer que se pasaron cuando no fue así.
 *
 * Es el mismo patrón que ya usan los ingresos: plantilla + mes confirmado.
 */
const montosDeMes = (D, per) => {
  const m = D.presupuestoMes && D.presupuestoMes[per];
  return m && m.montos ? m.montos : null;
};

const mesCongelado = (D, per) => Boolean(montosDeMes(D, per));
const mesCerrado = (D, per) => Boolean(
  D.presupuestoMes && D.presupuestoMes[per] && D.presupuestoMes[per].cerrado);

/** Foto del plan vigente, para congelar un mes. */
function fotoDelPlan(D) {
  const montos = {};
  (D.gastos || []).forEach(g => { montos[g.id] = num(g.monto); });
  return montos;
}

/** Gastos a k meses vista; los rubros con crecimiento se capitalizan. */
function gastosMes(D, k, per) {
  let salud = 0, corriente = 0;
  const detalle = [];
  // Un mes congelado usa su propia foto y nada más: un rubro creado después
  // no puede aparecer con presupuesto en un mes que ya pasó.
  const fijos = per ? montosDeMes(D, per) : null;

  (D.gastos || []).forEach(g => {
    const base = num(g.monto);
    const monto = fijos
      ? num(fijos[g.id] || 0)
      : base * Math.pow(1 + num(g.crecimiento) / 100, Math.max(0, k));
    const esSalud = (g.categoria || '') === 'Salud';
    detalle.push({ id: g.id, concepto: g.concepto, categoria: g.categoria || 'Otros',
                   base, monto, esSalud, medioPago: g.medioPago || 'tarjeta', tarjetaId: g.tarjetaId || null });
    if (esSalud) salud += monto; else corriente += monto;
  });

  return { salud, corriente, total: salud + corriente, detalle };
}

/**
 * Todo lo que hace falta para cerrar un mes: plan contra realidad, rubro por
 * rubro, y qué se pasó. Es el momento de justificar los excesos, que es lo
 * que convierte un presupuesto en una disciplina y no en un adorno.
 */
function cierreDeMes(D, per) {
  const gas = gastosMes(D, 0, per);
  const real = {};
  (D.movimientos || []).filter(m => perDe(m) === per)
    .forEach(m => { const k = m.gastoId || 'otros'; real[k] = (real[k] || 0) + num(m.monto); });

  const guardado = (D.presupuestoMes || {})[per] || {};
  const notas = guardado.notas || {};

  const filas = gas.detalle
    .filter(g => g.monto > 0 || real[g.id])
    .map(g => {
      const gastado = real[g.id] || 0;
      const dif = gastado - g.monto;
      return {
        gastoId: g.id, concepto: g.concepto, categoria: g.categoria,
        plan: g.monto, real: gastado, diferencia: dif,
        excedido: g.monto > 0 && dif > 0,
        pct: g.monto > 0 ? gastado / g.monto : (gastado > 0 ? Infinity : 0),
        nota: notas[g.id] || ''
      };
    })
    .sort((a, b) => b.diferencia - a.diferencia);

  if (real['otros']) {
    filas.push({ gastoId: 'otros', concepto: 'Sin clasificar', plan: 0,
                 real: real['otros'], diferencia: real['otros'], excedido: false,
                 pct: Infinity, nota: notas['otros'] || '' });
  }

  const plan = gas.total;
  const gastado = Object.keys(real).reduce((s, k) => s + real[k], 0);
  const ing = ingresoMes(D, per);

  const conc = conciliaciones(D, per);
  const sinJustificar = filas.filter(f => f.excedido && !f.nota);

  // Los dos candados. Un cierre que se puede dar por bueno con un descuadre
  // encima no sirve de nada: al mes siguiente la apertura arrastra el error y
  // ya nadie sabe de dónde salió. Y un exceso sin explicar dentro de tres meses
  // es indistinguible de un descuido.
  const bloqueos = [];
  conc.sinResolver.forEach(x => bloqueos.push({
    clave: x.clave, tipo: 'conciliacion', nombre: x.nombre,
    texto: x.sinDeclarar
      ? `Falta decir cuánto dice el banco que hay en ${x.nombre}.`
      : `${x.nombre} no cuadra por ${fmt(Math.abs(x.diferencia))}.`
  }));
  sinJustificar.forEach(f => bloqueos.push({
    clave: 'exceso:' + f.gastoId, tipo: 'exceso', nombre: f.concepto,
    texto: `${f.concepto} se pasó ${fmt(f.diferencia)} y no dice por qué.`
  }));

  return {
    per, filas, plan, gastado, diferencia: gastado - plan,
    dentro: gastado <= plan,
    excedidos: filas.filter(f => f.excedido),
    sinJustificar,
    ingreso: ing.neto, ingresoConfirmado: ing.confirmado,
    quedo: ing.neto - gastado,
    congelado: mesCongelado(D, per),
    cerrado: mesCerrado(D, per),
    cerradoEl: guardado.cerradoEl || null,
    conciliaciones: conc,
    apertura: conc.apertura,
    bloqueos, puedeCerrar: bloqueos.length === 0
  };
}

/* ---------- financiamientos ---------- */

const cuotasRestantes = f => Math.max(0, num(f.cuotasTotales) - num(f.cuotasPagadas));
const activo = f => cuotasRestantes(f) > 0 && num(f.cuotaMensual) > 0;

/** Saldo pendiente: lo que falta por pagar de las cuotas que quedan. */
const saldoFinanciamiento = f => cuotasRestantes(f) * num(f.cuotaMensual);

const deudaFinanciada = D => (D.financiamientos || []).reduce((s, f) => s + saldoFinanciamiento(f), 0);

/**
 * Cuotas vigentes k meses adelante. Los financiamientos se acaban: a los
 * 6 meses una compra a 6 cuotas ya no pesa, y el disponible sube.
 */
function cuotasEn(D, k) {
  let total = 0;
  const vivos = [];
  (D.financiamientos || []).forEach(f => {
    if (!activo(f)) return;
    if (k < cuotasRestantes(f)) { total += num(f.cuotaMensual); vivos.push(f); }
  });
  return { total, vivos };
}

/** Mes (offset) en el que se libera cada financiamiento. */
const liberaciones = D => (D.financiamientos || [])
  .filter(activo)
  .map(f => ({ nombre: f.nombre, enMeses: cuotasRestantes(f), cuota: num(f.cuotaMensual) }))
  .sort((a, b) => a.enMeses - b.enMeses);

/* ---------- ciclo de la tarjeta ---------- */

/**
 * Ventana del ciclo que CIERRA en `per`. Con corte el 6, el ciclo de
 * agosto va del 7 de julio al 6 de agosto, y lo paga el ingreso del 6.
 */
function cicloDe(per, diaCorte) {
  const [y, m] = per.split('-').map(Number);
  const corte = diaValido(y, m, diaCorte);

  const mAnt = m === 1 ? 12 : m - 1;
  const yAnt = m === 1 ? y - 1 : y;
  const corteAnt = diaValido(yAnt, mAnt, diaCorte);

  // El día siguiente al corte anterior, respetando fin de mes.
  let iniY = yAnt, iniM = mAnt, iniD = corteAnt + 1;
  if (iniD > diasDelMes(yAnt, mAnt)) { iniD = 1; iniM = m; iniY = y; }

  return { desde: iso(iniY, iniM, iniD), hasta: iso(y, m, corte), diaCorte: corte };
}

/**
 * Estado de una tarjeta en el mes: cuánto se cargó en el ciclo, qué ingreso
 * lo paga y si alcanza. Es la pregunta real del hogar cada día 6.
 */
function cicloTarjeta(D, tarjeta, per) {
  // El ciclo que le toca a este mes del hogar es aquel cuyo corte cae dentro
  // de él. Con mes que arranca el 7 y corte el 6, "julio" (7 jul – 6 ago) lo
  // cierra el corte del 6 de AGOSTO, no el del 6 de julio.
  const ini = inicioMes(D);
  const corte = num(tarjeta.diaCorte);
  const perCierre = corte >= ini ? per : sumaMeses(per, 1);
  const v = cicloDe(perCierre, tarjeta.diaCorte);

  // Un consumo cae en el ciclo de la tarjeta que lleva escrita, y solo en esa.
  // Antes, lo que no traía tarjeta se le achacaba a la primera de la lista; eso
  // metía en el corte compras que salieron directo de una cuenta —las que
  // importa el banco sin tarjeta de débito registrada— e inflaba lo que hay que
  // pagar. Además contradecía a deudaTarjeta y saldoCuenta, que siempre
  // exigieron coincidencia exacta: la misma compra contaba en el corte pero no
  // en la deuda. Ahora la regla es una sola en las tres.
  const cargado = (D.movimientos || [])
    .filter(m => (m.medioPago || 'tarjeta') === 'tarjeta'
              && m.tarjetaId === tarjeta.id
              && m.fecha >= v.desde && m.fecha <= v.hasta)
    .reduce((s, m) => s + num(m.monto), 0);

  // El plan también sirve de referencia mientras no haya movimientos.
  const planTarjeta = gastosMes(D, 0, per).detalle
    .filter(g => g.medioPago === 'tarjeta' && (!g.tarjetaId || g.tarjetaId === tarjeta.id))
    .reduce((s, g) => s + g.monto, 0);

  const ing = ingresoMes(D, per);
  const evPaga = (D.plantillaIngresos || []).find(e => e.id === tarjeta.pagaCon);
  const ingresoPago = evPaga ? num(ing.porEvento[evPaga.id]) : 0;

  const aCubrir = cargado > 0 ? cargado : planTarjeta;
  const cobertura = ingresoPago - aCubrir;

  return {
    ...v,
    cargado, planTarjeta, aCubrir, usandoPlan: cargado === 0 && planTarjeta > 0,
    evento: evPaga ? evPaga.nombre : null,
    ingresoPago, cobertura,
    alcanza: evPaga ? cobertura >= 0 : null
  };
}

/* ---------- bolsa de efectivo ---------- */

const sumaMontos = arr => (arr || []).reduce((s, x) => s + num(x.monto), 0);
const perDe = x => x.periodo || String(x.fecha || '').slice(0, 7);

/**
 * Efectivo en mano: lo retirado del banco menos lo gastado en efectivo.
 *
 * Un retiro NO es un gasto — solo mueve dinero de la cuenta a la mano — así que
 * no aparece en el disponible real ni en el ciclo de la tarjeta. Registrarlo
 * como gasto contaría doble: una vez al sacarlo y otra al gastarlo.
 *
 * El saldo es acumulado de todo el histórico, porque el efectivo no se reinicia
 * cada mes: lo que sobra en la cartera en agosto sigue ahí en septiembre.
 */
function efectivo(D, per) {
  const retiros = D.retiros || [];
  const enEfectivo = (D.movimientos || []).filter(m => (m.medioPago || 'tarjeta') === 'efectivo');

  const totalRetirado = sumaMontos(retiros);
  const totalGastado  = sumaMontos(enEfectivo);

  return {
    saldo: totalRetirado - totalGastado,
    totalRetirado, totalGastado,
    retiradoMes: sumaMontos(retiros.filter(r => perDe(r) === per)),
    gastadoMes:  sumaMontos(enEfectivo.filter(m => perDe(m) === per)),
    hayDatos: retiros.length > 0 || enEfectivo.length > 0,
    // Gastar más efectivo del retirado significa que falta registrar un retiro.
    descuadre: totalRetirado - totalGastado < -0.005
  };
}

/* ---------- cuentas de banco ---------- */

/**
 * Saldo de una cuenta. Es un STOCK, no un flujo: no se reinicia cada mes, a
 * diferencia del "disponible real". Parte del saldo que declaró el usuario y
 * le aplica todo lo que entró y salió desde ese mes.
 *
 * Dos reglas que evitan contar el mismo dinero dos veces:
 *
 *  · Solo suma ingresos CONFIRMADOS. Lo estimado no está en el banco todavía;
 *    meterlo daría un saldo que no cuadra con el del cajero.
 *  · Un consumo con tarjeta de CRÉDITO no resta aquí. El dinero sigue en la
 *    cuenta hasta que se paga el corte; lo que resta es el pago, no la compra.
 *    La de DÉBITO sí resta al instante, porque ahí sí sale en el momento.
 *
 * El retiro de efectivo resta una sola vez: al sacarlo. Gastar ese efectivo
 * después mueve la bolsa de efectivo, no la cuenta.
 */
function saldoCuenta(D, cuenta, hasta) {
  const desde = cuenta.desdeMes || '0000-00';
  const dentro = per => Boolean(per) && per >= desde && (!hasta || per <= hasta);

  const suyas = new Set((D.personas || [])
    .filter(p => p.cuentaId === cuenta.id).map(p => p.id));

  let acreditado = 0;
  const meses = D.ingresosMes || {};
  Object.keys(meses).forEach(per => {
    if (!dentro(per)) return;
    const mes = meses[per];
    if (!mes || !mes.confirmado) return;
    Object.keys(mes.confirmado).forEach(evId => {
      if (!mes.confirmado[evId]) return;
      const lineas = (mes.lineas || {})[evId] || {};
      Object.keys(lineas).forEach(pid => {
        if (suyas.has(pid)) acreditado += netoLinea(lineas[pid]);
      });
    });
  });

  const debito = new Set((D.tarjetas || [])
    .filter(t => t.tipo === 'debito' && t.cuentaId === cuenta.id).map(t => t.id));

  const gastadoDebito = sumaMontos((D.movimientos || []).filter(m =>
    (m.medioPago || 'tarjeta') === 'tarjeta' && debito.has(m.tarjetaId) && dentro(perDe(m))));
  const retirado = sumaMontos((D.retiros || [])
    .filter(r => r.cuentaId === cuenta.id && dentro(perDe(r))));
  const pagado = sumaMontos((D.pagosTarjeta || [])
    .filter(x => x.cuentaId === cuenta.id && dentro(perDe(x))));

  const inicial = num(cuenta.saldoInicial);
  const propio = inicial + acreditado - gastadoDebito - retirado - pagado;

  // Si el banco ya dijo cuánto hay, esa cifra manda: es un hecho, no una
  // deducción. Solo se le suma lo que haya pasado DESPUÉS de esa fecha.
  const b = cuenta.saldoBanco;
  let saldo = propio, segunBanco = null;
  if (b && b.fecha && b.monto != null) {
    // `hasta` acota igual que arriba: mirando un mes ya pasado no pueden
    // sumarse movimientos de después, o el saldo de julio saldría con gastos
    // de agosto dentro y no cuadraría con nada.
    const posterior = x => dentro(perDe(x)) && String(x.fecha || '') > b.fecha;
    const despues =
      - sumaMontos((D.movimientos || []).filter(m =>
          (m.medioPago || 'tarjeta') === 'tarjeta' && debito.has(m.tarjetaId) && posterior(m)))
      - sumaMontos((D.retiros || []).filter(r => r.cuentaId === cuenta.id && posterior(r)))
      - sumaMontos((D.pagosTarjeta || []).filter(x => x.cuentaId === cuenta.id && posterior(x)));
    saldo = num(b.monto) + despues;
    segunBanco = { monto: num(b.monto), fecha: b.fecha, despues };
  }

  // Compras ya hechas que el comercio todavía no cobra. El banco las llama
  // "retenidos y diferidos": siguen dentro del saldo en libros, pero ese dinero
  // ya se gastó y va a salir. No es capital y no sirve de colchón — contarlo
  // como disponible es la forma más fácil de creerse más rico de lo que se es.
  const ret = cuenta.retenido;
  const retenido = Math.max(0, num(ret && ret.monto));

  return {
    id: cuenta.id, nombre: cuenta.nombre, inicial, desde,
    acreditado, gastadoDebito, retirado, pagado,
    salidas: gastadoDebito + retirado + pagado,
    // `saldo` es el saldo EN LIBROS: es contra este que cuadra el cierre,
    // porque es el que reproduce la aritmética de los movimientos.
    saldo, calculado: propio, segunBanco,
    retenido, retenidoFecha: (ret && ret.fecha) || null,
    // `disponible` es lo que de verdad pueden usar hoy.
    disponible: cent(saldo - retenido),
    personas: Array.from(suyas),
    // Sin ingresos confirmados el saldo es solo el inicial: conviene avisarlo.
    sinConfirmar: acreditado === 0 && !segunBanco
  };
}

function saldosCuentas(D, hasta) {
  const filas = (D.cuentas || []).map(c => saldoCuenta(D, c, hasta));
  return {
    filas,
    total: filas.reduce((s, f) => s + f.saldo, 0),                 // en libros
    totalDisponible: filas.reduce((s, f) => s + f.disponible, 0),  // lo usable
    totalRetenido: filas.reduce((s, f) => s + f.retenido, 0),
    hayDatos: filas.length > 0,
    enRojo: filas.filter(f => f.disponible < 0)
  };
}

/** Lo que falta por saldar de una tarjeta de crédito en el ciclo del mes. */
function pagoPendiente(D, tarjeta, per) {
  if ((tarjeta.tipo || 'credito') !== 'credito') return null;
  const c = cicloTarjeta(D, tarjeta, per);
  const pagado = sumaMontos((D.pagosTarjeta || [])
    .filter(x => x.tarjetaId === tarjeta.id && perDe(x) === per));
  return { ...c, pagado, pendiente: Math.max(0, c.aCubrir - pagado), saldado: pagado >= c.aCubrir };
}

/* ---------- deuda real de la tarjeta ---------- */

/**
 * Lo que se le debe hoy a una tarjeta de crédito. Igual que en una cuenta:
 * parte del saldo que declaró el usuario y le suma consumos y resta pagos.
 *
 * Es distinto del ciclo: el ciclo es lo que cerró este mes, la deuda es lo
 * que queda vivo. Un hogar que revuelve saldo arrastra deuda de ciclos
 * anteriores, y esa es la que cuesta intereses.
 */
function deudaTarjeta(D, tarjeta, hasta) {
  if ((tarjeta.tipo || 'credito') !== 'credito') return null;
  // Pagar el total antes de la fecha límite es el caso sano y el más común
  // en un hogar ordenado: por eso se asume así mientras no digan lo contrario.
  const pagaTotal = tarjeta.pagaTotal !== false;
  const desde = tarjeta.desdeMes || '0000-00';
  const dentro = per => Boolean(per) && per >= desde && (!hasta || per <= hasta);

  const cargado = sumaMontos((D.movimientos || []).filter(m =>
    (m.medioPago || 'tarjeta') === 'tarjeta' && m.tarjetaId === tarjeta.id && dentro(perDe(m))));
  const pagado = sumaMontos((D.pagosTarjeta || [])
    .filter(x => x.tarjetaId === tarjeta.id && dentro(perDe(x))));

  const inicial = num(tarjeta.saldoInicial);
  let deuda = Math.max(0, inicial + cargado - pagado);

  // El estado de cuenta dice la deuda al corte: eso vale más que sumar.
  const sb = tarjeta.saldoBanco;
  let segunBanco = null;
  if (sb && sb.fecha && sb.monto != null) {
    const posterior = x => dentro(perDe(x)) && String(x.fecha || '') > sb.fecha;
    const luego = sumaMontos((D.movimientos || []).filter(m =>
                    (m.medioPago || 'tarjeta') === 'tarjeta' && m.tarjetaId === tarjeta.id && posterior(m)))
                - sumaMontos((D.pagosTarjeta || []).filter(x => x.tarjetaId === tarjeta.id && posterior(x)));
    deuda = Math.max(0, num(sb.monto) + luego);
    segunBanco = { monto: num(sb.monto), fecha: sb.fecha };
  }
  const tasa = Math.max(0, num(tarjeta.tasaAnual));

  // Un saldo que se salda completo antes de la fecha límite NO genera interés:
  // es crédito gratis, no deuda. Solo cuesta lo que se deja revolver.
  const revolvente = pagaTotal ? 0 : deuda;

  // Días sin costo que gana una compra según cuándo se haga. Comprar justo
  // después del corte estira el plazo casi un mes más, y no cuesta nada.
  const corte = num(tarjeta.diaCorte);
  const limite = num(tarjeta.diaPago);
  const trasCorte = limite > 0 ? ((limite - corte) + 30) % 30 : 0;

  // Igual que en la cuenta: consumos autorizados que el comercio no ha cobrado.
  // El estado de cuenta todavía no los trae, pero ya se gastaron.
  const retTj = tarjeta.retenido;
  const retenido = Math.max(0, num(retTj && retTj.monto));

  return {
    id: tarjeta.id, nombre: tarjeta.nombre, inicial, cargado, pagado, deuda, tasa,
    retenido, retenidoFecha: (retTj && retTj.fecha) || null,
    // Lo que de verdad deben: el estado de cuenta más lo que viene en camino.
    deudaTotal: cent(deuda + retenido),
    pagaTotal, revolvente, segunBanco,
    interesMensual: revolvente * (tasa / 100) / 12,
    interesAnual: revolvente * (tasa / 100),
    diaPago: limite,
    graciaMaxima: limite > 0 ? 30 + trasCorte : 0,   // comprando justo tras el corte
    graciaMinima: limite > 0 ? trasCorte : 0,        // comprando justo antes del corte
    declarada: Boolean(tarjeta.desdeMes)
  };
}

const deudaTarjetas = (D, hasta) => (D.tarjetas || [])
  .map(t => deudaTarjeta(D, t, hasta)).filter(Boolean);

/* ---------- consumido, abonado, adeudado ---------- */

const cent = v => Math.round(num(v) * 100) / 100;
const esCredito = t => (t.tipo || 'credito') === 'credito';

/**
 * Las tres cifras de una tarjeta que todo el mundo confunde, separadas y con
 * nombre propio. Que el ciclo cargue L 54,000 y la deuda sea L 30,000 NO es un
 * error: en medio hubo abonos. Enseñar una sola de las tres —o peor, mezclarlas—
 * es lo que hace que las cuentas "no cuadren" sin que nada esté mal.
 *
 *   consumido : lo cargado entre corte y corte
 *   abonado   : lo que se pagó DENTRO de esa misma ventana
 *   deuda     : lo que se le debe al banco hoy, venga de donde venga
 */
function estadoTarjeta(D, tarjeta, per) {
  if (!esCredito(tarjeta)) return null;
  const c = cicloTarjeta(D, tarjeta, per);
  const dv = deudaTarjeta(D, tarjeta, per);

  // Por FECHA, no por periodo: la ventana del crédito es corte a corte y no
  // coincide con el mes del hogar. Mezclarlas descuadra la conciliación.
  const abonado = sumaMontos((D.pagosTarjeta || []).filter(x =>
    x.tarjetaId === tarjeta.id && x.fecha >= c.desde && x.fecha <= c.hasta));

  const ancla = tarjeta.saldoBanco && tarjeta.saldoBanco.fecha &&
                tarjeta.saldoBanco.monto != null ? tarjeta.saldoBanco : null;

  return {
    ...c,
    id: tarjeta.id, nombre: tarjeta.nombre,
    consumido: cent(c.cargado), abonado: cent(abonado), deuda: cent(dv.deuda),
    pagaTotal: dv.pagaTotal, interesMensual: dv.interesMensual, tasa: dv.tasa,
    ancla,
    // Un ancla anterior al corte de este ciclo ya no describe la deuda de hoy.
    anclaVieja: Boolean(ancla) && ancla.fecha < c.desde,
    sinAncla: !ancla
  };
}

const estadoTarjetas = (D, per) => (D.tarjetas || [])
  .filter(esCredito).map(t => estadoTarjeta(D, t, per)).filter(Boolean);

/* ---------- apertura y cierre de saldos ---------- */

/** Efectivo en mano al terminar `per`. A diferencia de efectivo(), va acotado. */
function efectivoHasta(D, per) {
  const hasta = x => !per || perDe(x) <= per;
  const retirado = sumaMontos((D.retiros || []).filter(hasta));
  const gastado = sumaMontos((D.movimientos || [])
    .filter(m => (m.medioPago || 'tarjeta') === 'efectivo' && hasta(m)));
  return cent(retirado - gastado);
}

/**
 * Foto de saldos al terminar `per`. Es lo que el periodo siguiente arrastra:
 * saldo final = saldo inicial, sin huecos. Sin esto cada mes empezaría de cero
 * y la historia dejaría de encadenar.
 */
function saldosCierre(D, per) {
  const cuentas = {}, tarjetas = {}, financiamientos = {};
  (D.cuentas || []).forEach(c => { cuentas[c.id] = cent(saldoCuenta(D, c, per).saldo); });
  (D.tarjetas || []).filter(esCredito)
    .forEach(t => { tarjetas[t.id] = cent(deudaTarjeta(D, t, per).deuda); });
  (D.financiamientos || []).forEach(f => { financiamientos[f.id] = cent(saldoFinanciamiento(f)); });
  return {
    fecha: rangoPeriodo(per, inicioMes(D)).hasta,
    cuentas, tarjetas, financiamientos, efectivo: efectivoHasta(D, per)
  };
}

/**
 * Con qué saldos arranca `per`. Si el mes anterior se cerró, esa foto quedó
 * sembrada y manda; si no, se deduce del cierre del anterior y se marca como
 * derivada, para no hacer pasar por declarado algo que se dedujo.
 */
function aperturaDe(D, per) {
  const guardada = ((D.presupuestoMes || {})[per] || {}).apertura;
  const desde = rangoPeriodo(per, inicioMes(D)).desde;
  if (guardada) return Object.assign({ derivada: false }, guardada, { fecha: guardada.fecha || desde });
  const prev = saldosCierre(D, sumaMeses(per, -1));
  return Object.assign({}, prev, { fecha: desde, derivada: true });
}

/** Lo que entró y salió de una cuenta DENTRO de `per`, para poder conciliar. */
function movimientoCuenta(D, cuenta, per) {
  const suyas = new Set((D.personas || []).filter(p => p.cuentaId === cuenta.id).map(p => p.id));

  let acreditado = 0;
  const mes = (D.ingresosMes || {})[per];
  if (mes && mes.confirmado) {
    Object.keys(mes.confirmado).forEach(evId => {
      if (!mes.confirmado[evId]) return;
      const lineas = (mes.lineas || {})[evId] || {};
      Object.keys(lineas).forEach(pid => {
        if (suyas.has(pid)) acreditado += netoLinea(lineas[pid]);
      });
    });
  }

  const debito = new Set((D.tarjetas || [])
    .filter(t => t.tipo === 'debito' && t.cuentaId === cuenta.id).map(t => t.id));
  const enMes = x => perDe(x) === per;

  const gastadoDebito = sumaMontos((D.movimientos || []).filter(m =>
    (m.medioPago || 'tarjeta') === 'tarjeta' && debito.has(m.tarjetaId) && enMes(m)));
  const retirado = sumaMontos((D.retiros || []).filter(r => r.cuentaId === cuenta.id && enMes(r)));
  const pagado = sumaMontos((D.pagosTarjeta || []).filter(x => x.cuentaId === cuenta.id && enMes(x)));

  return {
    acreditado: cent(acreditado), gastadoDebito: cent(gastadoDebito),
    retirado: cent(retirado), pagado: cent(pagado),
    salidas: cent(gastadoDebito + retirado + pagado)
  };
}

const TOLERANCIA = 0.005;   // medio centavo: por debajo de eso es ruido binario

/**
 * Las tres conciliaciones del cierre. Cada una dice con qué ventana de fechas
 * se hizo, porque crédito y débito NO comparten periodicidad: el crédito va de
 * corte a corte y el débito por el mes del hogar. Leer una cifra creyendo que
 * corresponde al otro rango es el error que más caro sale.
 *
 * Una conciliación queda resuelta si cuadra, o si se anotó un ajuste con nota:
 * un descuadre reconocido y explicado es información; uno escondido, no.
 */
function conciliaciones(D, per) {
  const ini = inicioMes(D);
  const ap = aperturaDe(D, per);
  const guardado = (D.presupuestoMes || {})[per] || {};
  const ajustes = guardado.ajustes || {};
  const ventanaMes = rangoPeriodo(per, ini);

  const resolver = (clave, diferencia, sinDeclarar) => {
    const aj = ajustes[clave];
    const cuadra = !sinDeclarar && Math.abs(num(diferencia)) < TOLERANCIA;
    return {
      cuadra, sinDeclarar,
      ajuste: aj ? { monto: num(aj.monto), nota: aj.nota || '' } : null,
      // Sin nota el ajuste no vale: la nota es lo que lo convierte en historia.
      resuelta: cuadra || Boolean(aj && String(aj.nota || '').trim())
    };
  };

  const tarjetas = (D.tarjetas || []).filter(esCredito).map(t => {
    const e = estadoTarjeta(D, t, per);
    const apertura = cent((ap.tarjetas || {})[t.id]);
    const calculado = cent(apertura + e.consumido - e.abonado);
    const declarado = e.ancla ? cent(e.ancla.monto) : null;
    const diferencia = declarado == null ? null : cent(calculado - declarado);
    return Object.assign({
      clave: 'tarjeta:' + t.id, id: t.id, nombre: t.nombre,
      desde: e.desde, hasta: e.hasta, ventana: 'corte a corte',
      apertura, consumido: e.consumido, abonado: e.abonado,
      calculado, declarado, diferencia,
      anclaFecha: e.ancla ? e.ancla.fecha : null, anclaVieja: e.anclaVieja
    }, resolver('tarjeta:' + t.id, diferencia, declarado == null));
  });

  const cuentas = (D.cuentas || []).map(c => {
    const m = movimientoCuenta(D, c, per);
    const apertura = cent((ap.cuentas || {})[c.id]);
    const calculado = cent(apertura + m.acreditado - m.salidas);
    const b = c.saldoBanco;
    const declarado = b && b.monto != null && b.fecha ? cent(b.monto) : null;
    const diferencia = declarado == null ? null : cent(calculado - declarado);
    return Object.assign({
      clave: 'cuenta:' + c.id, id: c.id, nombre: c.nombre,
      desde: ventanaMes.desde, hasta: ventanaMes.hasta, ventana: 'mes del hogar',
      apertura, calculado, declarado, diferencia,
      anclaFecha: declarado != null ? b.fecha : null
    }, m, resolver('cuenta:' + c.id, diferencia, declarado == null));
  });

  const retirado = sumaMontos((D.retiros || []).filter(r => perDe(r) === per));
  const gastadoEfectivo = sumaMontos((D.movimientos || [])
    .filter(m => (m.medioPago || 'tarjeta') === 'efectivo' && perDe(m) === per));
  const apEfectivo = cent(ap.efectivo);
  const calcEfectivo = cent(apEfectivo + retirado - gastadoEfectivo);
  const contado = guardado.efectivoContado != null ? cent(guardado.efectivoContado) : null;
  const difEfectivo = contado == null ? null : cent(calcEfectivo - contado);
  const efectivo = Object.assign({
    clave: 'efectivo', nombre: 'Efectivo en mano',
    desde: ventanaMes.desde, hasta: ventanaMes.hasta, ventana: 'mes del hogar',
    apertura: apEfectivo, retirado: cent(retirado), gastado: cent(gastadoEfectivo),
    calculado: calcEfectivo, declarado: contado, diferencia: difEfectivo,
    // Una bolsa negativa no es un descuadre de centavos: falta anotar un retiro,
    // o un gasto quedó marcado como efectivo cuando fue con tarjeta.
    imposible: calcEfectivo < -TOLERANCIA
  }, resolver('efectivo', difEfectivo, contado == null));

  const todas = [].concat(tarjetas, cuentas, [efectivo]);
  return {
    per, apertura: ap, tarjetas, cuentas, efectivo, todas,
    ventanaMes, sinResolver: todas.filter(x => !x.resuelta),
    cuadraTodo: todas.every(x => x.resuelta)
  };
}

/* ---------- patrimonio ---------- */

/**
 * El capital total del hogar: lo que tienen menos lo que deben.
 *
 * Es la única cifra que no se puede maquillar. El disponible del mes sube y
 * baja, el saldo de una cuenta puede verse bien con la tarjeta reventada;
 * esto junta las dos caras y dice si el hogar avanza o retrocede.
 *
 * Los aportes a proyectos NO se cuentan aparte: ese dinero, si existe, ya
 * está dentro del saldo de alguna cuenta. Sumarlo sería contarlo dos veces.
 */
function patrimonio(D, per) {
  const cuentas = saldosCuentas(D, per);
  const ef = efectivo(D, per);
  // El capital se mide con el DISPONIBLE, no con el saldo en libros. Lo retenido
  // es una compra ya hecha esperando que el comercio la cobre: ese dinero ya no
  // es de ustedes, solo no ha salido todavía. Sumarlo al capital sería contar
  // como propio algo que ya se gastó.
  const enBanco = cuentas.totalDisponible;
  const enLibros = cuentas.total;
  const retenidoBanco = cuentas.totalRetenido;
  const enMano = Math.max(0, ef.saldo);

  const tarjetas = deudaTarjetas(D, per);
  const enTarjetas = tarjetas.reduce((s, t) => s + t.deuda, 0);
  const retenidoTarjetas = tarjetas.reduce((s, t) => s + t.retenido, 0);
  const enFinanciamientos = deudaFinanciada(D);

  const activos = enBanco + enMano;
  // Lo autorizado en la tarjeta también se debe aunque no esté en el corte.
  const pasivos = enTarjetas + retenidoTarjetas + enFinanciamientos;

  return {
    enBanco, enLibros, retenidoBanco, enMano, activos,
    enTarjetas, retenidoTarjetas, enFinanciamientos, pasivos,
    retenidoTotal: cent(retenidoBanco + retenidoTarjetas),
    neto: activos - pasivos,
    tarjetas,
    // Sin cuentas declaradas la cifra no significa nada y hay que decirlo.
    hayDatos: cuentas.hayDatos || ef.hayDatos || pasivos > 0,
    faltanCuentas: !cuentas.hayDatos,
    faltanSaldosTarjeta: tarjetas.some(t => !t.declarada)
  };
}

/* ---------- salud financiera ---------- */

const MESES_COLCHON = 3;   // el mínimo que recomienda cualquier manual serio

/**
 * El plan existe pero está sin llenar: hay rubros creados y gasto real
 * registrado, y ni un solo monto presupuestado. Es como queda el hogar justo
 * después de importar el primer estado de cuenta.
 *
 * Mientras eso pase, media app miente sin querer: el "disponible real" es el
 * ingreso entero, cualquier gasto "se pasa" de un presupuesto de cero, y las
 * barras de plan contra realidad salen llenas. Hay que detectarlo y decirlo,
 * no seguir dando cifras con cara de firmes.
 */
function planIncompleto(D, per) {
  const gas = gastosMes(D, 0, per);
  const gastado = sumaMontos((D.movimientos || []).filter(x => perDe(x) === per));
  return {
    hay: (D.gastos || []).length > 0 && gas.total <= 0 && gastado > 0,
    rubros: gas.detalle.length,
    sinMonto: gas.detalle.filter(g => g.monto <= 0).length,
    plan: gas.total, gastado
  };
}

/**
 * El diagnóstico que un asesor daría en la primera cita, y en el orden en
 * que lo daría. No es opinión: es aritmética.
 *
 * El orden importa más que cualquier consejo suelto. Apartar dinero para un
 * proyecto mientras se revuelve una tarjeta al 50% anual es perder dinero
 * todos los meses, por muy disciplinado que se sienta.
 */
function saludFinanciera(D, per) {
  const p = patrimonio(D, per);
  const r = resumenMes(D, per);

  // Con el plan sin montos —lo normal justo después de importar— esto daba 0,
  // el colchón salía null y TODO el diagnóstico desaparecía: quedaba un "van
  // bien" solitario con el banco en 662 lempiras. Si no hay plan pero sí hay
  // gasto real, se mide contra lo que de verdad gastan, que es más honesto que
  // callarse.
  let gastoMensual = r.gastos + r.cuotas;
  let baseReal = false;
  if (gastoMensual <= 0) {
    const real = presupuestoSugerido(D, per, 12).medianaTotal || 0;
    if (real > 0) { gastoMensual = real + r.cuotas; baseReal = true; }
  }

  const liquido = p.enBanco + p.enMano;
  const mesesColchon = gastoMensual > 0 ? liquido / gastoMensual : null;

  // Solo cuesta lo que se revuelve. Un saldo que se salda completo cada mes
  // no paga intereses por muy alta que sea la tasa del contrato.
  const caras = p.tarjetas.filter(t => t.revolvente > 0 && t.tasa > 0)
    .sort((a, b) => b.tasa - a.tasa);
  const interesMensual = caras.reduce((s, t) => s + t.interesMensual, 0);

  const alContado = p.tarjetas.filter(t => t.pagaTotal && t.deuda > 0);
  const porPagar = alContado.reduce((s, t) => s + t.deuda, 0);

  const disponibleReal = r.disponible - interesMensual;
  const pasos = [];

  // Cuando se paga el total, el riesgo no es el interés: es el mes en que el
  // ingreso no alcance el corte. Ahí se rompe la racha y empieza a costar.
  const cubreElCorte = liquido + r.neto >= porPagar;

  if (porPagar > 0 && !caras.length) {
    pasos.push({
      orden: pasos.length + 1, clave: 'racha', nivel: 'good',
      titulo: 'Van bien: la tarjeta no les cuesta nada',
      texto: `Deben ${fmt(porPagar)}, pero al saldar el total antes de la fecha límite ` +
             `no pagan un lempira de interés. Eso es crédito gratis y es exactamente ` +
             `como debe usarse. Lo que hay que cuidar es la racha: el mes que el ingreso ` +
             `no alcance el corte, empieza a correr la tasa sobre todo el saldo.`
    });
  }

  if (mesesColchon !== null && mesesColchon < 1) {
    pasos.push({
      orden: pasos.length + 1, clave: 'colchon', nivel: porPagar > 0 ? 'critical' : 'serious',
      titulo: porPagar > 0 ? 'Lo que protege esa racha es el colchón'
                           : 'Primero: un mes de gastos guardado',
      texto: `Hoy tienen ${fmt(liquido)} líquido contra ${fmt(gastoMensual)} de gasto mensual: ` +
             `${mesesColchon < 0.05 ? 'menos de una semana' : Math.round(mesesColchon * 30) + ' días'} de margen. ` +
             (porPagar > 0
               ? `Si un mes las comisiones bajan y no cubren el corte, tocaría revolver ` +
                 `${fmt(porPagar)} y ahí sí empieza el interés. Juntar ${fmt(Math.max(0, gastoMensual - liquido))} ` +
                 `más es lo que compra esa tranquilidad.`
               : `Antes que cualquier proyecto, junten ${fmt(Math.max(0, gastoMensual - liquido))} más.`)
    });
  }

  if (caras.length) {
    const t = caras[0];
    pasos.push({
      orden: pasos.length + 1, clave: 'deuda', nivel: 'critical',
      titulo: `Saldar lo que revuelve en ${t.nombre}`,
      texto: `Revuelven ${fmt(t.revolvente)} al ${nf0.format(t.tasa)}% anual: ${fmt(t.interesMensual)} ` +
             `al mes —${fmt(t.interesAnual)} al año— sin comprar nada. Cada lempira que abonen ahí ` +
             `rinde ${nf0.format(t.tasa)}% garantizado, más que cualquier proyecto.`
    });
  }

  if (mesesColchon !== null && mesesColchon >= 1 && mesesColchon < MESES_COLCHON) {
    pasos.push({
      orden: pasos.length + 1, clave: 'colchon3', nivel: 'serious',
      titulo: `Llegar a ${MESES_COLCHON} meses de colchón`,
      texto: `Tienen ${mesesColchon.toFixed(1)} meses cubiertos. Para llegar a ${MESES_COLCHON} ` +
             `faltan ${fmt(gastoMensual * MESES_COLCHON - liquido)}. Es lo que separa un susto ` +
             `de una crisis.`
    });
  }

  if (!pasos.length && r.disponible > 0) {
    pasos.push({
      orden: 1, clave: 'metas', nivel: 'good',
      titulo: 'Base cubierta: ahora sí, los proyectos',
      texto: `Tienen ${mesesColchon === null ? 'colchón' : mesesColchon.toFixed(1) + ' meses de gastos'} ` +
             `guardados y sin deuda cara encima. Este es el momento de comprometer el disponible ` +
             `en metas, que es para lo que sirve.`
    });
  }

  return {
    liquido, gastoMensual, mesesColchon,
    // `baseReal`: el gasto mensual no salió del plan sino de lo gastado de
    // verdad, porque el plan está sin montos. Hay que decirlo al pintarlo.
    baseReal,
    metaColchon: gastoMensual * MESES_COLCHON,
    caras, interesMensual, interesAnual: interesMensual * 12,
    alContado, porPagar, cubreElCorte,
    disponibleReal, disponibleDeclarado: r.disponible,
    mordidaInteres: r.disponible > 0 ? interesMensual / r.disponible : 0,
    pasos, patrimonio: p
  };
}

/* ---------- presupuesto sugerido por el histórico ---------- */

const mediana = a => {
  if (!a.length) return 0;
  const o = a.slice().sort((x, y) => x - y), m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

/**
 * Propone cuánto presupuestar al mes, a partir de lo que de verdad se gastó.
 *
 * Usa MEDIANA, no promedio. Un mes con una compra de L 8,800 arrastra el
 * promedio hacia arriba y el presupuesto saldría inflado; la mediana ignora
 * ese golpe y describe el mes típico, que es lo que hay que presupuestar.
 *
 * Separa lo recurrente de lo puntual por presencia: un rubro que aparece casi
 * todos los meses es un costo fijo; uno que aparece una vez fue un evento y no
 * debe entrar al presupuesto mensual.
 *
 * Solo mira el mes CERRADO hacia atrás: el mes en curso va a medias y bajaría
 * la mediana sin motivo.
 */
function presupuestoSugerido(D, hasta, meses = 12) {
  const ini = inicioMes(D);
  const hoy = periodoDe(hoyLocal(), ini);
  const rubro = {};
  (D.gastos || []).forEach(g => { rubro[g.id] = g; });

  // Totales por periodo y por rubro. El futuro nunca cuenta.
  const porMes = {};
  (D.movimientos || []).forEach(m => {
    const per = perDe(m);
    if (!per || per > hoy) return;
    if (hasta && per > hasta) return;
    porMes[per] = porMes[per] || {};
    const k = m.gastoId || 'otros';
    porMes[per][k] = (porMes[per][k] || 0) + num(m.monto);
  });

  // El mes en curso va a medias y bajaría la mediana, así que se deja fuera.
  // Salvo que sea lo único que hay: negarse entonces dejaba sin salida a quien
  // acababa de importar su primer estado de cuenta —el aviso hasta le decía
  // "importa tus estados de cuenta y vuelve", que era justo lo que había hecho.
  // Se usa, pero avisando de que el mes no ha terminado.
  const cerrados = Object.keys(porMes).filter(p => p < hoy).sort();
  const parcial = !cerrados.length && Boolean(porMes[hoy]);
  const periodos = (parcial ? [hoy] : cerrados).slice(-meses);
  if (!periodos.length) {
    return { hayDatos: false, parcial: false, periodos: [], filas: [],
             recurrentes: [], puntuales: [], total: 0 };
  }

  // Con un solo mes no se puede decir si un rubro es fijo o fue un evento:
  // hace falta más de un mes para que "aparece casi siempre" signifique algo.
  const unSoloMes = periodos.length < 2;
  // Cuánto lleva corrido el mes en curso, para poder decir contra qué se mide.
  const avance = parcial
    ? Math.min(1, Math.max(0,
        (Math.round((Date.parse(hoyLocal()) - Date.parse(rangoPeriodo(hoy, ini).desde)) / 86400000) + 1)
        / diasPeriodo(hoy, ini)))
    : 1;

  const claves = new Set();
  periodos.forEach(p => Object.keys(porMes[p]).forEach(k => claves.add(k)));

  const filas = Array.from(claves).map(k => {
    // Un rubro ausente un mes cuenta como cero: si no se gastó, no se gastó.
    const serie = periodos.map(p => porMes[p][k] || 0);
    const presentes = serie.filter(v => v > 0).length;
    const med = mediana(serie);
    const g = rubro[k];
    return {
      gastoId: k,
      concepto: g ? g.concepto : (k === 'otros' ? 'Sin clasificar' : 'Rubro borrado'),
      categoria: g ? (g.categoria || 'Otros') : 'Otros',
      actual: g ? num(g.monto) : 0,
      sugerido: Math.round(med),
      mediana: med,
      promedio: serie.reduce((a, b) => a + b, 0) / serie.length,
      maximo: Math.max(...serie),
      presentes, deMeses: periodos.length,
      // Casi todos los meses = costo fijo. Uno o dos = evento, no presupuesto.
      clase: unSoloMes ? 'unico'
           : presentes >= periodos.length * 0.7 ? 'fijo'
           : presentes <= 1 ? 'puntual' : 'variable',
      serie
    };
  }).sort((a, b) => b.mediana - a.mediana);

  const totalesMes = periodos.map(p =>
    Object.keys(porMes[p]).reduce((s, k) => s + porMes[p][k], 0));

  const recurrentes = filas.filter(f => f.clase !== 'puntual');
  return {
    hayDatos: true,
    // `parcial`: lo sugerido sale de un mes que todavía no termina, así que es
    // un piso y no el gasto de un mes completo. Quien lo pinte debe decirlo.
    parcial, avance, unSoloMes,
    periodos, totalesMes,
    filas, recurrentes,
    // La suma de medianas y la mediana de los totales NO coinciden: la mediana
    // no es aditiva. Se enseñan las dos y se explica, en vez de esconderlo.
    sumaSugerida: recurrentes.reduce((s, f) => s + f.sugerido, 0),
    medianaTotal: mediana(totalesMes),
    promedioTotal: totalesMes.reduce((a, b) => a + b, 0) / totalesMes.length,
    puntuales: filas.filter(f => f.clase === 'puntual'),
    planActual: (D.gastos || []).reduce((s, g) => s + num(g.monto), 0)
  };
}

/** Hasta qué fecha hay datos del banco para cada cuenta o tarjeta. */
function coberturaImportada(D) {
  const out = {};
  const anota = (ref, fecha) => {
    if (!ref || !fecha) return;
    if (!out[ref] || fecha > out[ref].hasta) out[ref] = { hasta: fecha };
  };
  ['movimientos', 'retiros', 'pagosTarjeta'].forEach(col =>
    (D[col] || []).forEach(x => { if (x.origen === 'import') anota(x.fuente, x.fecha); }));
  return out;
}

/* ---------- pulso del mes ---------- */

/** Días desde el día `dia` de `per` hasta la próxima vez que caiga `objetivo`. */
function diasHasta(per, dia, objetivo) {
  const [y, m] = per.split('-').map(Number);
  const esteMes = diaValido(y, m, objetivo);
  if (esteMes >= dia) return esteMes - dia;
  const [y2, m2] = sumaMeses(per, 1).split('-').map(Number);
  return (diasDelMes(y, m) - dia) + diaValido(y2, m2, objetivo);
}

/**
 * Cómo va el mes que se está viviendo: si el gasto lleva el ritmo del
 * calendario o va por delante, cuánto queda por día y qué viene después.
 *
 * La comparación que importa no es "cuánto llevo gastado" sino "cuánto llevo
 * gastado FRENTE a qué tan avanzado va el mes". Gastar el 60% del presupuesto
 * es normal el día 20 y es una alarma el día 5.
 */
function pulso(D, per, hoy) {
  const hoyStr = hoy || hoyLocal();
  const ini = inicioMes(D);
  const rango = rangoPeriodo(per, ini);
  const diasMes = diasPeriodo(per, ini);

  // Un mes pasado no tiene "ritmo": tiene resultado. Uno futuro, nada aún.
  const hoyPer = periodoDe(hoyStr, ini);
  const enCurso = hoyPer === per;
  // Días corridos DEL CICLO, que con inicio 7 no coinciden con el día del mes.
  const corridos = Math.round((Date.parse(hoyStr) - Date.parse(rango.desde)) / 86400000) + 1;
  const dia = enCurso ? Math.min(diasMes, Math.max(0, corridos)) : (hoyPer > per ? diasMes : 0);
  const diasRestantes = Math.max(0, diasMes - dia);

  const presupuesto = gastosMes(D, 0, per).total;
  const gastado = sumaMontos((D.movimientos || []).filter(x => perDe(x) === per));

  const avanceMes = diasMes > 0 ? dia / diasMes : 0;
  const avanceGasto = presupuesto > 0 ? gastado / presupuesto : 0;

  const ritmoDiario = dia > 0 ? gastado / dia : 0;
  const proyeccion = ritmoDiario * diasMes;
  const desvio = proyeccion - presupuesto;
  const restante = presupuesto - gastado;
  const porDia = diasRestantes > 0 ? restante / diasRestantes : restante;

  const diaHoy = enCurso ? Number(hoyStr.slice(8, 10)) : 1;
  const perHoy = hoyStr.slice(0, 7);
  const proximo = (arr, campoDia) => (arr || [])
    .filter(x => num(x[campoDia]) > 0)
    .map(x => ({ nombre: x.nombre, dia: num(x[campoDia]),
                 enDias: diasHasta(perHoy, diaHoy, x[campoDia]) }))
    .sort((a, b) => a.enDias - b.enDias)[0] || null;

  return {
    enCurso, dia, diasMes, diasRestantes, desde: rango.desde, hasta: rango.hasta,
    presupuesto, gastado, restante,
    avanceMes, avanceGasto,
    ritmoDiario, proyeccion, desvio, porDia,
    // Se adelanta al calendario: gasta más rápido de lo que corre el mes.
    adelantado: presupuesto > 0 && avanceGasto > avanceMes,
    hayPlan: presupuesto > 0,
    proximoIngreso: enCurso ? proximo(D.plantillaIngresos, 'dia') : null,
    // Solo las de crédito tienen corte: la de débito sale de la cuenta al
    // instante y anunciar su "corte" no significa nada.
    proximoCorte:   enCurso ? proximo((D.tarjetas || [])
                      .filter(t => (t.tipo || 'credito') === 'credito'), 'diaCorte') : null
  };
}

/* ---------- en qué se fue ---------- */

/**
 * Reparte lo realmente gastado en un mes entre las categorías del plan.
 * La categoría no vive en el movimiento sino en el gasto al que apunta:
 * así, recategorizar un rubro reordena también todo el histórico.
 */
function porCategoria(D, per) {
  const deGasto = {};
  (D.gastos || []).forEach(g => { deGasto[g.id] = g.categoria || 'Otros'; });

  const acumulado = {};
  let total = 0;
  (D.movimientos || []).filter(x => perDe(x) === per).forEach(x => {
    // Un movimiento sin rubro —o cuyo rubro se borró— cae en "Otros".
    const cat = deGasto[x.gastoId] || 'Otros';
    const monto = num(x.monto);
    acumulado[cat] = acumulado[cat] || { categoria: cat, monto: 0, movimientos: 0 };
    acumulado[cat].monto += monto;
    acumulado[cat].movimientos++;
    total += monto;
  });

  const filas = Object.keys(acumulado)
    .map(k => Object.assign({ pct: total > 0 ? acumulado[k].monto / total : 0 }, acumulado[k]))
    .sort((a, b) => b.monto - a.monto);

  return { filas, total, mayor: filas[0] || null };
}

/* ---------- historia ---------- */

/**
 * Los meses que ya tienen algo real que contar. No rellena huecos: un mes sin
 * ingreso confirmado y sin un solo movimiento no aparece, porque no hay nada
 * que enseñar más que un número inventado.
 */
function historia(D, hasta, meses = 12) {
  const filas = [];
  for (let k = meses - 1; k >= 0; k--) {
    const per = sumaMeses(hasta, -k);
    const ing = ingresoMes(D, per);
    const movs = (D.movimientos || []).filter(x => perDe(x) === per);
    if (!ing.confirmado && !ing.parcial && !movs.length) continue;

    const gastado = sumaMontos(movs);
    filas.push({
      per, ingreso: ing.neto, confirmado: ing.confirmado,
      gastado, movimientos: movs.length,
      quedo: ing.neto - gastado,
      tasa: ing.neto > 0 ? (ing.neto - gastado) / ing.neto : 0,
      enCurso: per === hasta
    });
  }

  // El mes en curso queda fuera de promedios y récords: lleva unos días de
  // gasto contra meses enteros, así que siempre saldría ganando. Compararlos
  // sería darse una palmada en la espalda por no haber terminado el mes.
  const cerrados = filas.filter(f => !f.enCurso);
  const conIngreso = cerrados.filter(f => f.ingreso > 0);
  const suma = conIngreso.reduce((s, f) => s + f.quedo, 0);
  const ordenados = conIngreso.slice().sort((a, b) => b.quedo - a.quedo);

  return {
    filas,
    meses: filas.length,
    mesesCerrados: conIngreso.length,
    total: suma,
    promedio: conIngreso.length ? suma / conIngreso.length : 0,
    mejor: ordenados[0] || null,
    peor: ordenados.length > 1 ? ordenados[ordenados.length - 1] : null
  };
}

/* ---------- proyección ---------- */

function proyectar(D, desde, meses = HORIZONTE) {
  const filas = [];
  for (let k = 0; k < meses; k++) {
    const per = sumaMeses(desde, k);
    const ing = ingresoMes(D, per);
    const gas = gastosMes(D, k, per);
    const cuo = cuotasEn(D, k);
    filas.push({
      k, per,
      ingreso: ing.neto,
      confirmado: ing.confirmado,
      corriente: gas.corriente,
      salud: gas.salud,
      cuotas: cuo.total,
      disponible: ing.neto - gas.corriente - gas.salud - cuo.total
    });
  }
  return { filas, liberaciones: liberaciones(D) };
}

/** Foto del mes que se enseña en el resumen. */
function resumenMes(D, per) {
  const ing = ingresoMes(D, per);
  const gas = gastosMes(D, 0, per);
  const cuo = cuotasEn(D, 0);
  const disponible = ing.neto - gas.corriente - gas.salud - cuo.total;

  return {
    bruto: ing.bruto, neto: ing.neto, deducciones: ing.deducciones,
    porPersona: ing.porPersona, porEvento: ing.porEvento,
    confirmado: ing.confirmado, parcial: ing.parcial, pendientes: ing.pendientes,
    corriente: gas.corriente, salud: gas.salud, gastos: gas.total,
    cuotas: cuo.total, financiados: cuo.vivos.length,
    deudaFinanciada: deudaFinanciada(D),
    disponible,
    tasaAhorro: ing.neto > 0 ? disponible / ing.neto : 0
  };
}

/* ---------- evaluación de proyectos ---------- */

const acumulado = p => (p.aportes || []).reduce((s, a) => s + num(a.monto), 0);

function mesesPara(filas, falta, cuota) {
  if (falta <= 0) return 0;
  let junta = 0;
  for (let k = 0; k < filas.length; k++) {
    const aporte = cuota != null ? Math.min(cuota, Math.max(0, filas[k].disponible)) : Math.max(0, filas[k].disponible);
    junta += aporte;
    if (junta >= falta) return k + 1;
  }
  return null;
}

function evaluarProyecto(D, p, desde, otrosCompromisos = 0) {
  const proy = proyectar(D, desde);
  const filas = proy.filas;
  const disponible = filas.length ? filas[0].disponible : 0;

  const min = num(p.costoMin);
  const max = Math.max(num(p.costoMax), min);
  const junta = acumulado(p);
  const faltaMin = Math.max(0, min - junta);
  const faltaMax = Math.max(0, max - junta);

  const mesesMin = mesesPara(filas, faltaMin, null);
  const mesesMax = mesesPara(filas, faltaMax, null);

  let mesesObjetivo = null, cuotaObjetivo = null;
  if (p.fechaObjetivo) {
    mesesObjetivo = Math.max(1, distanciaMeses(desde, p.fechaObjetivo.slice(0, 7)));
    cuotaObjetivo = faltaMax / mesesObjetivo;
  }

  const techoSano = Math.max(0, disponible * (1 - COLCHON_MIN) - otrosCompromisos);
  const manual = num(p.aporteMensual) > 0;
  const cuotaSugerida = manual ? num(p.aporteMensual) : Math.min(techoSano, faltaMax || techoSano);
  const mesesSugerido = cuotaSugerida > 0 ? mesesPara(filas, faltaMax, cuotaSugerida) : null;
  const sinMargen = !manual && cuotaSugerida <= 0 && faltaMax > 0 && disponible > 0;

  const exigida = cuotaObjetivo != null ? cuotaObjetivo : cuotaSugerida;
  const carga = disponible > 0 ? exigida / disponible : Infinity;

  const alertas = [];
  let veredicto = 'viable';

  if (faltaMax <= 0) {
    veredicto = 'logrado';
  } else if (disponible <= 0) {
    veredicto = 'inviable';
    alertas.push({ nivel: 'critical', texto: 'No hay disponible: los gastos y las cuotas de financiamiento consumen todo el ingreso neto. Ningún proyecto avanza hasta liberar flujo.' });
  } else if (cuotaObjetivo != null && cuotaObjetivo > disponible) {
    veredicto = 'inviable';
    alertas.push({ nivel: 'critical', texto: `Para la fecha objetivo harían falta ${fmt(cuotaObjetivo)} al mes, y solo hay ${fmt(disponible)} disponibles. La fecha no se sostiene.` });
  } else if (carga > 1 - COLCHON_MIN) {
    veredicto = 'ajustado';
    alertas.push({ nivel: 'serious', texto: `Comprometería el ${Math.round(carga * 100)}% del disponible y dejaría casi sin colchón para imprevistos.` });
  }

  if (sinMargen) {
    veredicto = 'ajustado';
    alertas.push({ nivel: 'serious', texto: `Los otros proyectos ya reservan ${fmt(otrosCompromisos)} al mes y no queda margen seguro para este. Hay que bajarles el ritmo o esperar a que terminen.` });
  } else if (otrosCompromisos > 0 && exigida + otrosCompromisos > disponible) {
    if (veredicto === 'viable') veredicto = 'ajustado';
    alertas.push({ nivel: 'serious', texto: `Sumado a los otros proyectos se piden ${fmt(exigida + otrosCompromisos)} al mes, por encima de los ${fmt(disponible)} disponibles.` });
  } else if (otrosCompromisos > 0) {
    alertas.push({ nivel: 'warning', texto: `Esta cuota ya descuenta los ${fmt(otrosCompromisos)} al mes que reservan los otros proyectos.` });
  }

  // Un financiamiento que termina pronto libera flujo: eso es accionable.
  const pronto = proy.liberaciones.filter(l => l.enMeses > 0 && l.enMeses <= 12);
  if (pronto.length && faltaMax > 0) {
    const l = pronto[0];
    alertas.push({ nivel: 'warning', texto: `En ${l.enMeses} ${l.enMeses === 1 ? 'mes' : 'meses'} termina "${l.nombre}" y se liberan ${fmt(l.cuota)} al mes; a partir de ahí el plazo se acorta.` });
  }

  const salud0 = filas[0] ? filas[0].salud : 0;
  const salud12 = filas[12] ? filas[12].salud : salud0;
  if (salud12 > salud0 * 1.05 && disponible > 0) {
    alertas.push({ nivel: 'warning', texto: `El gasto de salud pasaría de ${fmt(salud0)} a ${fmt(salud12)} en 12 meses; eso resta ${fmt(salud12 - salud0)} al disponible mensual.` });
  }

  if (mesesMax === null && veredicto !== 'logrado' && veredicto !== 'inviable') {
    veredicto = 'inviable';
    alertas.push({ nivel: 'critical', texto: `Ni destinando todo el disponible se alcanza el costo máximo en ${HORIZONTE / 12} años.` });
  }

  return {
    min, max, junta, faltaMin, faltaMax,
    disponible, mesesMin, mesesMax,
    mesesObjetivo, cuotaObjetivo,
    cuotaSugerida, mesesSugerido, sinMargen,
    quincenal: cuotaSugerida / 2,
    carga, veredicto, alertas, filas
  };
}

/* ---------- priorizar por mérito, no por flujo ---------- */

/**
 * El tipo de necesidad ancla la prioridad, y los pesos son deliberados:
 * la distancia entre `salud` y `deseo` es tan grande que ninguna combinación
 * de urgencia puede saltarla. Ese es justo el punto — con el motor viejo, un
 * iPhone con el dinero suelto salía "Viable" y una urgencia dental sin ahorro
 * salía "No viable", que es exactamente al revés de lo que diría un asesor.
 */
const TIPOS_PROYECTO = {
  salud:      { peso: 1000, etiqueta: 'Salud' },
  seguridad:  { peso: 800,  etiqueta: 'Seguridad' },
  esencial:   { peso: 500,  etiqueta: 'Esencial' },
  productivo: { peso: 350,  etiqueta: 'Productivo' },
  deseo:      { peso: 100,  etiqueta: 'Deseo' }
};
const URGENCIAS = { ya: 200, este_ano: 80, algun_dia: 0 };
const ETIQUETA_URGENCIA = { ya: 'no puede esperar', este_ano: 'este año', algun_dia: 'algún día' };

const tipoDe = p => TIPOS_PROYECTO[p.tipo] ? p.tipo : 'deseo';
const urgenciaDe = p => URGENCIAS[p.urgencia] != null ? p.urgencia : 'algun_dia';
const esNecesidad = p => tipoDe(p) === 'salud' || tipoDe(p) === 'seguridad';

/**
 * Ordena la cartera por MÉRITO y reparte el disponible en ese orden.
 *
 * Las penalizaciones son grandes a propósito: no se trata de matizar un poco
 * el orden, sino de que un gusto no pueda adelantarse a la base. Un `deseo` con
 * el colchón vacío cae 600 puntos, que lo deja por debajo de cualquier cosa
 * esencial aunque tenga el dinero junto y la otra no.
 */
function priorizar(D, per) {
  const s = saludFinanciera(D, per);
  const colchonFlaco = s.mesesColchon !== null && s.mesesColchon < 1;
  const deudaCara = s.caras.length > 0;

  const puntuados = (D.proyectos || []).map((p, orden) => {
    const tipo = tipoDe(p), urgencia = urgenciaDe(p);
    let puntaje = TIPOS_PROYECTO[tipo].peso + URGENCIAS[urgencia];
    const porque = [];

    if (esNecesidad(p)) {
      porque.push(`${TIPOS_PROYECTO[tipo].etiqueta.toLowerCase()}: va antes que cualquier gusto`);
    }
    if (tipo === 'deseo' && colchonFlaco) {
      puntaje -= 600;
      porque.push(`es un gusto y no hay ni un mes de colchón (faltan ${fmt(Math.max(0, s.gastoMensual - s.liquido))})`);
    }
    if (!esNecesidad(p) && deudaCara) {
      puntaje -= 400;
      const t = s.caras[0];
      porque.push(`abonar a ${t.nombre} rinde ${nf0.format(t.tasa)}% garantizado (${fmt(t.interesMensual)} al mes)`);
    }
    if (urgencia === 'ya' && !esNecesidad(p)) {
      porque.push('marcado como urgente, pero no es salud ni seguridad');
    }
    return { p, tipo, urgencia, puntaje, porque, orden };
  });

  // A igual mérito manda la urgencia y después el costo menor: terminar antes
  // una meta barata libera la cola para la siguiente.
  puntuados.sort((a, b) =>
    b.puntaje - a.puntaje ||
    URGENCIAS[b.urgencia] - URGENCIAS[a.urgencia] ||
    (num(a.p.costoMax) || num(a.p.costoMin)) - (num(b.p.costoMax) || num(b.p.costoMin)) ||
    a.orden - b.orden);

  // La cascada reparte en el orden de MÉRITO, no en el de la lista, para que lo
  // que de verdad va primero reserve primero.
  let comprometido = 0;
  const filas = puntuados.map((x, i) => {
    const ev = evaluarProyecto(D, x.p, per, comprometido);
    if (ev.faltaMax > 0) {
      comprometido += num(x.p.aporteMensual) > 0 ? num(x.p.aporteMensual) : ev.cuotaSugerida;
    }
    const veredicto = veredictoDe(x, ev, i, colchonFlaco, deudaCara);
    return Object.assign({}, x, { ev, veredicto, posicion: i + 1 });
  });

  return {
    filas, porId: filas.reduce((m, f) => { m[f.p.id] = f; return m; }, {}),
    colchonFlaco, deudaCara, salud: s
  };
}

const VEREDICTOS = {
  hazlo_ya:      'Hazlo ya',
  programado:    'Programado',
  puede_esperar: 'Puede esperar',
  reconsiderar:  'Reconsideralo',
  logrado:       'Alcanzado'
};

function veredictoDe(x, ev, i, colchonFlaco, deudaCara) {
  if (ev.faltaMax <= 0) return 'logrado';
  // Un gusto con la base sin cubrir se reconsidera aunque el flujo diera de sobra:
  // el trueque —lo que cuesta postergarlo contra lo que cuesta no tener colchón—
  // no lo gana nunca.
  if (x.tipo === 'deseo' && (colchonFlaco || deudaCara)) return 'reconsiderar';
  if (esNecesidad(x.p) && x.urgencia === 'ya') return 'hazlo_ya';
  if (ev.disponible <= 0 || ev.sinMargen || ev.mesesSugerido === null) return 'puede_esperar';
  if (i === 0 || ev.cuotaSugerida > 0) return 'programado';
  return 'puede_esperar';
}

/**
 * Evalúa TODOS los proyectos repartiendo el disponible en cascada. El orden ya
 * no es el de la lista sino el de mérito, que es el que decide priorizar().
 */
function evaluarCartera(D, desde) {
  const out = {};
  priorizar(D, desde).filas.forEach(f => {
    out[f.p.id] = Object.assign({}, f.ev, {
      // Dos capas que conviene no confundir: `flujo` dice si el dinero alcanza
      // (lo que siempre calculó evaluarProyecto) y `veredicto` dice si además
      // conviene hacerlo ahora. Un deseo puede tener flujo "viable" y veredicto
      // "reconsiderar" al mismo tiempo, y esa tensión es justo la información.
      flujo: f.ev.veredicto,
      veredicto: f.veredicto, puntaje: f.puntaje, porque: f.porque,
      posicion: f.posicion, tipo: f.tipo, urgencia: f.urgencia
    });
  });
  return out;
}

/**
 * Rubros que se pasan del plan mes tras mes. A la tercera deja de ser un
 * descuido: o el plan está mal puesto o hay una fuga, y las dos cosas se
 * arreglan, pero no solas.
 */
function fugasRecurrentes(D, per, minimo = 3) {
  const meses = [];
  for (let k = 1; k <= 6 && meses.length < 6; k++) {
    const p = sumaMeses(per, -k);
    if (mesCongelado(D, p)) meses.push(p);
  }
  if (!meses.length) return [];

  const racha = {};
  meses.forEach(p => {
    cierreDeMes(D, p).filas.forEach(f => {
      if (f.gastoId === 'otros') return;
      racha[f.gastoId] = racha[f.gastoId] || { gastoId: f.gastoId, concepto: f.concepto, veces: 0, exceso: 0, real: [] };
      if (f.excedido) { racha[f.gastoId].veces++; racha[f.gastoId].exceso += f.diferencia; }
      racha[f.gastoId].real.push(f.real);
    });
  });

  return Object.values(racha)
    .filter(x => x.veces >= minimo)
    .map(x => Object.assign(x, {
      // Lo que de verdad gastan, para poder decir a cuánto subir el plan.
      sugerido: Math.round(mediana(x.real)),
      excesoMedio: cent(x.exceso / x.veces)
    }))
    .sort((a, b) => b.exceso - a.exceso);
}

/* ---------- la carta del asesor ---------- */

const plural2 = (n, s, p) => `${nf0.format(n)} ${n === 1 ? s : p}`;

/**
 * Lo que escribiría un consultor caro al final del mes: dónde están parados,
 * qué hacer con el dinero de este mes, qué pasa con cada meta y una sola acción
 * concreta. Devuelve texto ya redactado —no tablas— porque el valor está en la
 * frase que ordena, no en el dato suelto, que ya está en el resto del informe.
 *
 * Cada cifra sale de lo registrado. Nada se inventa: eso es exactamente lo que
 * hace que valga tanto como el consultor y no cueste nada.
 */
function cartaAsesor(D, per) {
  const s = saludFinanciera(D, per);
  const r = resumenMes(D, per);
  const pri = priorizar(D, per);
  const fugas = fugasRecurrentes(D, per);
  const inc = planIncompleto(D, per);
  const parrafos = [];

  /* 1. Dónde están parados */
  const colchon = s.mesesColchon === null
    ? 'Todavía no puedo medirles el colchón: falta decir en qué se va el dinero.'
    : s.mesesColchon < 1
      ? `El colchón no llega ni a un mes: tienen ${fmt(s.liquido)} líquido contra ` +
        `${fmt(s.gastoMensual)} de gasto mensual. Un imprevisto entra directo a la tarjeta.`
      : `Tienen ${s.mesesColchon.toFixed(1)} meses de gastos guardados ` +
        `(${fmt(s.liquido)} contra ${fmt(s.gastoMensual)} al mes).`;

  const deuda = s.caras.length
    ? `Están revolviendo ${fmt(s.caras[0].revolvente)} en ${s.caras[0].nombre} al ` +
      `${nf0.format(s.caras[0].tasa)}% anual: ${fmt(s.interesMensual)} al mes que se van sin comprar nada.`
    : s.porPagar > 0
      ? `Deben ${fmt(s.porPagar)} en tarjetas, pero como saldan el total antes de la fecha ` +
        `límite no pagan intereses. Eso es crédito gratis y está bien usado.`
      : 'No tienen deuda cara encima.';

  parrafos.push({ titulo: 'Dónde están parados', texto:
    `${colchon} ${deuda} El disponible del mes es ${fmt(r.disponible)}` +
    (inc.hay ? ', aunque con el plan sin montos esa cifra es el ingreso entero y no significa gran cosa.' : '.') });

  /* 2. Qué hacer con el dinero de este mes */
  const pasos = [];
  if (s.caras.length) {
    pasos.push(`abonar a ${s.caras[0].nombre} todo lo que puedan: cada lempira ahí rinde ` +
               `${nf0.format(s.caras[0].tasa)}% garantizado`);
  }
  if (s.mesesColchon !== null && s.mesesColchon < MESES_COLCHON) {
    pasos.push(`llevar el colchón a ${MESES_COLCHON} meses, que son ${fmt(s.metaColchon)}; ` +
               `hoy faltan ${fmt(Math.max(0, s.metaColchon - s.liquido))}`);
  }
  const primera = pri.filas.find(f => f.veredicto === 'hazlo_ya' || f.veredicto === 'programado');
  if (primera) {
    pasos.push(`apartar ${fmt(primera.ev.cuotaSugerida)} al mes ` +
               `(${fmt(primera.ev.quincenal)} por quincena) para ${primera.p.nombre}`);
  }
  parrafos.push({ titulo: 'Qué hacer con el dinero de este mes', texto:
    pasos.length
      ? 'En este orden: ' + pasos.map((x, i) => `${i + 1}) ${x}`).join('; ') + '.'
      : 'Con la base cubierta y sin metas pendientes, lo que sobre va al colchón o a adelantar financiamientos.' });

  /* 3. El veredicto de cada proyecto, en prosa */
  if (pri.filas.length) {
    const frases = pri.filas.map(f => {
      const t = TIPOS_PROYECTO[f.tipo].etiqueta.toLowerCase();
      const plazo = f.ev.mesesSugerido === null ? 'no se alcanza en cinco años'
        : f.ev.mesesSugerido === 0 ? 'ya está'
        : `entra en ${plural2(f.ev.mesesSugerido, 'mes', 'meses')} apartando ${fmt(f.ev.cuotaSugerida)} al mes`;
      const motivo = f.porque.length ? ` — ${f.porque[0]} —` : ' —';
      const conse = f.p.consecuencia ? ` Si no se hace: ${f.p.consecuencia}.` : '';
      return `${f.p.nombre} (${t}, ${ETIQUETA_URGENCIA[f.urgencia]}): ` +
             `${VEREDICTOS[f.veredicto].toLowerCase()}${motivo} ${plazo}.${conse}`;
    });
    parrafos.push({ titulo: 'Qué toca y qué no', texto: frases.join(' ') });
  }

  /* 4. Las fugas del cierre alimentan el mes siguiente */
  if (fugas.length) {
    const f = fugas[0];
    parrafos.push({ titulo: 'Un rubro que se sale del plan todos los meses', texto:
      `${f.concepto} se pasó del plan ${plural2(f.veces, 'mes', 'meses')} seguidos, ` +
      `${fmt(f.excesoMedio)} de más en promedio. A la tercera ya no es un descuido: ` +
      `o el plan está mal puesto o hay una fuga. Subilo a ${fmt(f.sugerido)}, que es lo ` +
      `que de verdad gastan, o córtalo — pero no lo dejen como está.` });
  }

  /* 5. Una sola acción concreta */
  let accion;
  if (inc.hay) {
    accion = `Ponerle monto a los ${plural2(inc.sinMonto, 'rubro', 'rubros')} del plan que están en cero. ` +
             `Sin eso ninguna cifra de esta app significa nada.`;
  } else if (!pri.salud.mesesColchon && pri.salud.mesesColchon !== 0) {
    accion = 'Registrar los saldos de las cuentas para poder medir el colchón.';
  } else if (s.caras.length) {
    accion = `Abonar ${fmt(Math.min(r.disponible > 0 ? r.disponible : s.caras[0].revolvente, s.caras[0].revolvente))} ` +
             `a ${s.caras[0].nombre} este mes.`;
  } else if (s.mesesColchon !== null && s.mesesColchon < 1) {
    accion = `Apartar ${fmt(Math.max(0, s.gastoMensual - s.liquido))} para llegar al primer mes de colchón ` +
             `antes de comprometer nada más.`;
  } else if (primera) {
    accion = `Abrir una transferencia automática de ${fmt(primera.ev.quincenal)} por quincena para ${primera.p.nombre}.`;
  } else {
    accion = `Cerrar ${per} con las tres conciliaciones en cero y dejar sembrada la apertura del mes que viene.`;
  }
  parrafos.push({ titulo: 'La acción de este mes', texto: accion });

  return { per, parrafos, prioridades: pri.filas, salud: s, fugas, planIncompleto: inc };
}

/* ---------- estado de la configuración ---------- */

/** Qué falta para que la app pueda calcular algo con sentido. */
function faltantes(D) {
  const f = [];
  if (!(D.personas || []).length) f.push({ k: 'personas', t: 'Quiénes usan la app' });
  if (!(D.plantillaIngresos || []).length) f.push({ k: 'ingresos', t: 'Los pagos que reciben' });
  if (!(D.gastos || []).length) f.push({ k: 'gastos', t: 'Los gastos del mes' });
  return f;
}

const nf = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-HN', { maximumFractionDigits: 0 });
function fmt(n) { return 'L ' + nf.format(num(n)); }

window.Asesor = {
  HORIZONTE, COLCHON_MIN,
  sumaMeses, distanciaMeses, diaValido, diasDelMes,
  netoLinea, dedTotal, lineaDe, ingresoMes, eventoConfirmado,
  mesConfirmadoPrevio, lineaParaConfirmar,
  gastosMes, cuotasEn, activo, cuotasRestantes, saldoFinanciamiento, deudaFinanciada, liberaciones,
  cicloDe, cicloTarjeta, efectivo,
  montosDeMes, mesCongelado, mesCerrado, fotoDelPlan, cierreDeMes,
  saldoCuenta, saldosCuentas, pagoPendiente,
  deudaTarjeta, deudaTarjetas, patrimonio, saludFinanciera, MESES_COLCHON, planIncompleto,
  diasHasta, pulso, historia, porCategoria, presupuestoSugerido, coberturaImportada, mediana,
  inicioMes, periodoDe, rangoPeriodo, diasPeriodo, hoyLocal,
  // A qué mes pertenece un registro ya guardado. Lo usan también la app y el
  // informe: si cada uno lo resolviera a su manera, los totales no cuadrarían.
  perDe,
  proyectar, resumenMes, acumulado, mesesPara, evaluarProyecto, evaluarCartera,
  // consumido / abonado / adeudado, apertura y las tres conciliaciones del cierre
  estadoTarjeta, estadoTarjetas, efectivoHasta, saldosCierre, aperturaDe,
  movimientoCuenta, conciliaciones, TOLERANCIA,
  // priorizar por mérito y la carta del asesor
  priorizar, fugasRecurrentes, cartaAsesor,
  TIPOS_PROYECTO, URGENCIAS, VEREDICTOS, ETIQUETA_URGENCIA, tipoDe, urgenciaDe,
  faltantes
};

})();
