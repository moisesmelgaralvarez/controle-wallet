/* ============================================================
   El estado del dinero en un mes

   Gastos, ciclo de la tarjeta, efectivo, cuentas de banco, deuda real
   y el cierre con sus tres conciliaciones.

   Es el módulo más grande del núcleo y eso es DELIBERADO. Estas piezas
   se llaman entre sí en círculo: el cierre necesita las conciliaciones,
   que necesitan los saldos de cuenta, que necesitan el ciclo de la
   tarjeta, que necesita los gastos del mes, que es donde empieza el
   cierre. Partirlo en cuatro archivos no separaría nada — solo
   convertiría un ciclo interno, que el lenguaje resuelve solo, en
   cuatro imports circulares que se rompen el día que alguien mueva
   una línea. El dominio no tiene esa costura; el archivo tampoco.

   Extraído de asesor.js (187-312, 343-412, 415-830) sin tocar una línea.
   ============================================================ */

import { num, perDe, sumaMontos, fmt } from './base.js';
import { diaValido, diasDelMes, iso, sumaMeses, inicioMes, rangoPeriodo } from './fechas.js';
import { ingresoMes, netoLinea } from './ingresos.js';
import { saldoFinanciamiento } from './financiamientos.js';
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
  // Una foto VACÍA no es una foto. Parece una distinción de abogado y
  // no lo es: la columna `montos` es `not null default '{}'`, así que
  // toda fila de `presupuesto_mes` trae `{}` aunque nadie haya
  // congelado nada — y cerrar un mes crea la fila del SIGUIENTE para
  // sembrarle la apertura. Leyendo `{}` como foto, ese mes saldría con
  // todos sus rubros en cero: presupuesto de comida cero, de servicios
  // cero, y la app diciendo que se pasaron en todo. En la app anterior
  // no podía pasar porque ahí la propiedad simplemente no existía.
  return m && m.montos && Object.keys(m.montos).length ? m.montos : null;
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
      // El efectivo no tiene banco que lo declare —por eso es la única
      // de las tres que se cuenta a mano— y pedirle «lo que dice el
      // banco» manda a buscar un dato que no existe. Un mensaje tiene
      // que decir QUÉ HACER; este decía qué es imposible.
      ? (x.clave === 'efectivo'
          ? 'Falta contar cuánto hay en efectivo.'
          : `Falta decir cuánto dice el banco que hay en ${x.nombre}.`)
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


export { montosDeMes, mesCongelado, mesCerrado, fotoDelPlan, gastosMes, cierreDeMes, cicloDe, cicloTarjeta, efectivo, saldoCuenta, saldosCuentas, pagoPendiente, deudaTarjeta, deudaTarjetas, cent, esCredito, estadoTarjeta, estadoTarjetas, efectivoHasta, saldosCierre, aperturaDe, movimientoCuenta, TOLERANCIA, conciliaciones };
