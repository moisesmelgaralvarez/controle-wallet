/* ============================================================
   El armador.

   Toma las filas de la base y arma el documento con la forma que
   el núcleo financiero espera desde siempre.

   POR QUÉ EXISTE ESTA PIEZA:

   El motor de cálculo recibe UN objeto con todo dentro —personas,
   gastos, movimientos, meses confirmados— y de ahí saca cada
   número. Está probado así con dinero real desde hace meses.

   La base, en cambio, tiene que estar normalizada: con dos
   personas editando a la vez, un solo bloque por hogar significa
   que el último que guarda le borra el trabajo al otro.

   Las dos cosas son ciertas al mismo tiempo, y este archivo es el
   que las concilia. Tablas por fuera, documento por dentro. Sin él
   habría que reescribir 1,700 líneas de aritmética probada para
   ganar exactamente nada.

   DOS TRAMPAS QUE ESTE ARCHIVO EXISTE PARA EVITAR:

   1. PostgREST devuelve las columnas `numeric` como TEXTO. Un
      "5000.00" que se cuela sin convertir no revienta: se suma
      como cadena y "5000.00" + "300.00" da "5000.00300.00". El
      error aparece como un número absurdo tres pantallas después.
      Todo monto pasa por `num()`.

   2. La base usa snake_case y el núcleo camelCase. Un `saldoInicial`
      que llegue como `saldo_inicial` no da error: llega
      `undefined`, se convierte en 0, y el saldo simplemente sale
      mal sin que nada avise.
   ============================================================ */

/** Número seguro. Cubre el texto que devuelve PostgREST y los nulos. */
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Igual, pero conserva la ausencia: no todo cero significa "vacío". */
const numOpt = v => (v === null || v === undefined || v === '') ? null : num(v);

/** { monto, fecha } solo si de verdad hay algo declarado. */
const par = (monto, fecha) =>
  (monto === null || monto === undefined) ? undefined : { monto: num(monto), fecha: fecha || null };

/** Ordena por el campo `orden` y, a igualdad, por antigüedad. */
const porOrden = (a, b) => (a.orden - b.orden) || String(a.creado_en).localeCompare(String(b.creado_en));

/**
 * Arma el documento del núcleo a partir de las filas del hogar.
 *
 * Recibe un objeto con una propiedad por tabla, tal como las
 * devuelve la API de datos. Las tablas que falten se tratan como
 * vacías: así una vista que solo pidió lo que necesitaba mostrar
 * sigue funcionando.
 */
export function armar(filas) {
  const f = nombre => Array.isArray(filas[nombre]) ? filas[nombre] : [];
  const hogar = filas.hogar || {};

  /* ---------- configuración ---------- */

  const personas = f('personas').map(p => ({
    id: p.id,
    nombre: p.nombre,
    cuentaId: p.cuenta_id || null
  }));

  const cuentas = f('cuentas').map(c => ({
    id: c.id,
    nombre: c.nombre,
    numero: c.numero || '',
    saldoInicial: num(c.saldo_inicial),
    desdeMes: c.desde_mes,
    retenido:   par(c.retenido_monto,    c.retenido_fecha),
    saldoBanco: par(c.saldo_banco_monto, c.saldo_banco_fecha)
  }));

  const tarjetas = f('tarjetas').map(t => ({
    id: t.id,
    nombre: t.nombre,
    numero: t.numero || '',
    tipo: t.tipo || 'credito',
    diaCorte: t.dia_corte,
    diaPago: t.dia_pago || 0,
    pagaCon: t.paga_con || null,
    cuentaId: t.cuenta_id || null,
    saldoInicial: num(t.saldo_inicial),
    desdeMes: t.desde_mes || null,
    pagaTotal: t.paga_total !== false,
    tasaAnual: num(t.tasa_anual),
    retenido:   par(t.retenido_monto,    t.retenido_fecha),
    saldoBanco: par(t.saldo_banco_monto, t.saldo_banco_fecha)
  }));

  const gastos = f('gastos').slice().sort(porOrden).map(g => ({
    id: g.id,
    concepto: g.concepto,
    monto: num(g.monto),
    categoria: g.categoria || 'Otros',
    medioPago: g.medio_pago || 'tarjeta',
    tarjetaId: g.tarjeta_id || null,
    crecimiento: num(g.crecimiento)
  }));

  const financiamientos = f('financiamientos').map(x => ({
    id: x.id,
    nombre: x.nombre,
    cuotaMensual: num(x.cuota_mensual),
    cuotasTotales: num(x.cuotas_totales),
    cuotasPagadas: num(x.cuotas_pagadas),
    tarjetaId: x.tarjeta_id || null
  }));

  /* ---------- ingresos ----------
     La plantilla es una lista de pagos, y cada pago lleva dentro lo
     que le toca a cada persona. En la base eso son dos tablas; aquí
     se vuelven a juntar. */

  const lineasPorPlantilla = new Map();
  for (const l of f('plantilla_lineas')) {
    if (!lineasPorPlantilla.has(l.plantilla_id)) lineasPorPlantilla.set(l.plantilla_id, []);
    lineasPorPlantilla.get(l.plantilla_id).push({
      personaId: l.persona_id,
      bruto: num(l.bruto),
      deducciones: (l.deducciones || []).map(d => ({ concepto: d.concepto, monto: num(d.monto) }))
    });
  }

  const plantillaIngresos = f('plantilla_ingresos').map(p => ({
    id: p.id,
    nombre: p.nombre,
    dia: num(p.dia),
    lineas: lineasPorPlantilla.get(p.id) || []
  }));

  /* Lo confirmado, mes a mes:
       ingresosMes["2026-08"].lineas[plantillaId][personaId] = { bruto, deducciones }
       ingresosMes["2026-08"].confirmado[plantillaId] = true

     Un pago cuenta como confirmado cuando TODAS sus líneas de ese
     mes lo están. Confirmar es un acto sobre el pago completo —el
     formulario muestra a todas las personas juntas—, así que una
     línea sin confirmar significa que ese pago todavía no se
     revisó. Con "alguna" bastaría para dar por hecho un mes a
     medias, que es justo lo que la app siempre evitó. */

  const ingresosMes = {};
  const pendientesPorMes = new Map();

  for (const r of f('ingresos_mes')) {
    const mes = ingresosMes[r.periodo] ||
      (ingresosMes[r.periodo] = { lineas: {}, confirmado: {}, copiado: {} });
    const porPlantilla = mes.lineas[r.plantilla_id] || (mes.lineas[r.plantilla_id] = {});

    /* De qué mes se copió, mientras nadie lo haya revisado. Cuenta
       para los cálculos —está confirmado— pero en pantalla se dice que
       nadie lo miró todavía. Basta con que UNA línea del pago venga
       copiada para que el pago entero cuente como sin revisar: es un
       acto sobre el pago completo, igual que confirmarlo. */
    if (r.copiado_de) mes.copiado[r.plantilla_id] = r.copiado_de;

    porPlantilla[r.persona_id] = {
      bruto: num(r.bruto),
      deducciones: (r.deducciones || []).map(d => ({ concepto: d.concepto, monto: num(d.monto) }))
    };

    const clave = `${r.periodo}|${r.plantilla_id}`;
    if (!r.confirmado) pendientesPorMes.set(clave, true);
    else if (!pendientesPorMes.has(clave)) pendientesPorMes.set(clave, false);
  }

  for (const [clave, hayPendiente] of pendientesPorMes) {
    const [periodo, plantillaId] = clave.split('|');
    if (!hayPendiente) ingresosMes[periodo].confirmado[plantillaId] = true;
  }

  /* ---------- proyectos y sus aportes ---------- */

  const aportesPorProyecto = new Map();
  for (const a of f('aportes')) {
    if (!aportesPorProyecto.has(a.proyecto_id)) aportesPorProyecto.set(a.proyecto_id, []);
    aportesPorProyecto.get(a.proyecto_id).push({
      id: a.id,
      personaId: a.persona_id || null,
      monto: num(a.monto),
      fecha: a.fecha,
      nota: a.nota || ''
    });
  }

  // El orden de los proyectos NO es cosmético: es la prioridad con
  // la que se reparte el disponible en cascada. El primero reserva
  // lo suyo y el segundo sugiere sobre lo que quedó.
  const proyectos = f('proyectos').slice().sort(porOrden).map(p => ({
    id: p.id,
    nombre: p.nombre,
    costoMin: num(p.costo_min),
    costoMax: num(p.costo_max),
    aporteMensual: num(p.aporte_mensual),
    fechaObjetivo: p.fecha_objetivo || '',
    nota: p.nota || '',
    tipo: p.tipo || 'deseo',
    urgencia: p.urgencia || 'algun_dia',
    consecuencia: p.consecuencia || '',
    aportes: aportesPorProyecto.get(p.id) || []
  }));

  /* ---------- lo que pasó ---------- */

  const movimientos = f('movimientos').map(m => ({
    id: m.id,
    fecha: m.fecha,
    periodo: m.periodo,
    monto: num(m.monto),
    concepto: m.concepto || '',
    gastoId: m.gasto_id || null,
    personaId: m.persona_id || null,
    medioPago: m.medio_pago || 'tarjeta',
    tarjetaId: m.tarjeta_id || null,
    origen: m.origen || 'manual',
    fuente: m.fuente || ''
  }));

  const retiros = f('retiros').map(r => ({
    id: r.id,
    fecha: r.fecha,
    periodo: r.periodo,
    monto: num(r.monto),
    cuentaId: r.cuenta_id || null,
    personaId: r.persona_id || null,
    nota: r.nota || ''
  }));

  const pagosTarjeta = f('pagos_tarjeta').map(p => ({
    id: p.id,
    fecha: p.fecha,
    periodo: p.periodo,
    monto: num(p.monto),
    tarjetaId: p.tarjeta_id || null,
    cuentaId: p.cuenta_id || null,
    nota: p.nota || ''
  }));

  /* ---------- el plan congelado de cada mes ---------- */

  const presupuestoMes = {};
  for (const p of f('presupuesto_mes')) {
    // Los montos vienen como jsonb: los valores pueden llegar como
    // número o como texto según cómo se escribieron. Se normalizan
    // aquí una sola vez.
    const montos = {};
    for (const [k, v] of Object.entries(p.montos || {})) montos[k] = num(v);

    presupuestoMes[p.periodo] = {
      montos,
      notas: p.notas || {},
      cerrado: Boolean(p.cerrado),
      cerradoEl: p.cerrado_el || null
    };
  }

  /* ---------- lo aprendido al clasificar ---------- */

  const comercios = {};
  for (const c of f('comercios')) comercios[c.clave] = c.gasto_id;

  /* ---------- el documento ---------- */

  return {
    // El día en que arranca el mes del hogar vive en `hogares`, no
    // en una tabla de datos: es configuración, no presupuesto.
    inicioMes: num(hogar.inicio_mes) || 1,
    moneda: hogar.moneda || 'HNL',
    configurado: personas.length > 0 && plantillaIngresos.length > 0 && gastos.length > 0,

    personas, cuentas, tarjetas, gastos, financiamientos, proyectos,
    plantillaIngresos, ingresosMes,
    movimientos, retiros, pagosTarjeta,
    presupuestoMes, comercios
  };
}

/**
 * Qué tablas hace falta pedir para poder mostrar cada vista.
 *
 * Existe para no bajarle tres años de movimientos al teléfono de
 * nadie: la configuración del hogar son decenas de filas y se trae
 * siempre, pero los movimientos se traen por mes.
 *
 * `historia`, `patrimonio` y `proyeccion` recorren TODO el
 * histórico por diseño. Esas no se arman en el navegador: se
 * calculan en el servidor con este mismo módulo.
 */
export const CONFIGURACION = [
  'personas', 'cuentas', 'tarjetas', 'gastos', 'financiamientos',
  'proyectos', 'aportes', 'plantilla_ingresos', 'plantilla_lineas', 'comercios',

  /* `ingresos_mes` es de un mes, pero se trae ENTERO. El corte de esta
     lista no es «configuración contra hechos»: es qué crece sin techo
     y qué no. Los movimientos de tres años son miles de filas; los
     ingresos confirmados son un puñado por mes —una por persona y
     pago— y en tres años no pasan de un par de cientos.

     Y hace falta tenerlos todos: confirmar un mes se rellena con lo
     ÚLTIMO confirmado (`lineaParaConfirmar`), que se parece mucho más
     al mes que viene que la plantilla que alguien tecleó una vez al
     armar el hogar. Con solo el mes en curso cargado, esa búsqueda no
     encuentra nada y el atajo de copiar no existe. */
  'ingresos_mes'
];

export const POR_MES = ['movimientos', 'retiros', 'pagos_tarjeta', 'presupuesto_mes'];
