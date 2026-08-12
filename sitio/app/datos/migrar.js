/* ============================================================
   Traer el hogar de la app anterior.

   El respaldo que exporta la app vieja ES el documento del núcleo:
   el mismo objeto que `armador.js` construye desde las tablas, pero
   guardado tal cual en un archivo. Así que migrar no es traducir
   conceptos —no hay ninguno nuevo— es NORMALIZAR: repartir ese objeto
   en las veinte tablas y darle a cada fila un identificador de verdad.

   LO QUE HACE QUE ESTO SE PUEDA COMPROBAR

   Al terminar, los mismos números tienen que salir por los dos
   caminos: el núcleo viejo sobre el documento viejo, y el núcleo nuevo
   sobre lo que quedó en las tablas. **Si uno solo no cuadra, la
   migración no pasa.** No es una precaución: es la única forma de
   saber que no se perdió nada, porque una migración que pierde el 3%
   de los movimientos se ve igual de bien que una perfecta.

   LOS IDENTIFICADORES SE REHACEN

   La app vieja usaba ids cortos —`g1`, `c1`— que no son UUID y que
   podrían chocar entre hogares. Se genera uno nuevo para cada fila y
   se guarda la equivalencia, porque todo lo demás apunta a ellos: un
   movimiento a su rubro, una tarjeta a su cuenta, un aporte a su
   proyecto. Perder ese mapa a mitad de camino dejaría las referencias
   apuntando al vacío, y eso no da error: da totales que no cuadran.

   NO BORRA NADA. Si el hogar ya tenía datos, esto AGREGA. Vaciar
   primero sería la clase de decisión que no se puede deshacer, y la
   toma el dueño desde su panel, no una importación.
   ============================================================ */

import { crearVarias, fusionar } from './escribir.js';
import { invalidarConfiguracion } from './hogar.js';
import { olvidarHistorico } from './historico.js';

const uid = () => crypto.randomUUID();
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const texto = (v, largo) => v == null ? null : String(v).slice(0, largo || 200);

/**
 * ¿Esto se parece a un respaldo de la app anterior?
 *
 * Se comprueba antes de tocar nada. Un archivo equivocado —otro
 * respaldo, un JSON cualquiera— no debería empezar a escribir filas y
 * fallar a la mitad.
 */
export function reconocer(doc) {
  if (!doc || typeof doc !== 'object') return 'Ese archivo no es un respaldo.';
  if (!Array.isArray(doc.gastos)) return 'Ese archivo no trae los gastos del hogar.';
  if (!Array.isArray(doc.personas)) return 'Ese archivo no trae a las personas del hogar.';
  return null;
}

/** Cuántas cosas trae, para poder enseñarlo antes de escribir. */
export function inventario(doc) {
  const n = x => (Array.isArray(x) ? x.length : Object.keys(x || {}).length);
  return {
    personas: n(doc.personas), cuentas: n(doc.cuentas), tarjetas: n(doc.tarjetas),
    gastos: n(doc.gastos), financiamientos: n(doc.financiamientos),
    proyectos: n(doc.proyectos),
    aportes: (doc.proyectos || []).reduce((s, p) => s + n(p.aportes), 0),
    pagos: n(doc.plantillaIngresos),
    movimientos: n(doc.movimientos), retiros: n(doc.retiros),
    pagosTarjeta: n(doc.pagosTarjeta),
    mesesConfirmados: n(doc.ingresosMes), mesesCongelados: n(doc.presupuestoMes),
    comercios: n(doc.comercios)
  };
}

/**
 * Vuelca el respaldo en las tablas del hogar.
 *
 * El orden NO es estético: cada tabla apunta a las anteriores, y
 * PostgREST rechaza una fila cuya referencia todavía no existe. Los
 * gastos van después de las tarjetas porque un rubro dice con qué
 * tarjeta se paga; los aportes después de los proyectos; todo lo del
 * mes al final.
 */
export async function migrar({ doc, hogarId }) {
  const problema = reconocer(doc);
  if (problema) throw new Error(problema);

  /* El mapa de identificadores viejo → nuevo. Todo lo que se escriba
     después lo consulta; si se perdiera, las referencias quedarían
     apuntando al vacío y los totales no cuadrarían sin dar error. */
  const nuevo = new Map();
  const id = viejo => (viejo == null ? null : nuevo.get(String(viejo)) || null);
  const asignar = x => { const n = uid(); nuevo.set(String(x.id), n); return n; };

  const hechas = {};
  const meter = async (tabla, filas) => {
    if (!filas.length) { hechas[tabla] = 0; return; }
    await crearVarias(tabla, filas);
    hechas[tabla] = filas.length;
  };

  /* ---------- 1. lo que no depende de nada ---------- */

  await meter('personas', (doc.personas || []).map(p => ({
    id: asignar(p), hogar_id: hogarId, nombre: texto(p.nombre, 80) || 'Sin nombre'
  })));

  await meter('cuentas', (doc.cuentas || []).map(c => ({
    id: asignar(c), hogar_id: hogarId,
    nombre: texto(c.nombre, 60) || 'Cuenta', numero: texto(c.numero, 40),
    saldo_inicial: num(c.saldoInicial),
    // `desde_mes` es obligatorio en la base. Si el respaldo no lo trae
    // —los primeros hogares no lo tenían— se toma el mes más viejo con
    // movimientos, que es lo más honesto que se puede deducir.
    desde_mes: c.desdeMes || mesMasViejo(doc),
    saldo_banco_monto: c.saldoBanco?.monto ?? null,
    saldo_banco_fecha: c.saldoBanco?.fecha ?? null,
    retenido_monto: c.retenido?.monto ?? null,
    retenido_fecha: c.retenido?.fecha ?? null
  })));

  await meter('plantilla_ingresos', (doc.plantillaIngresos || []).map(q => ({
    id: asignar(q), hogar_id: hogarId,
    nombre: texto(q.nombre, 60) || 'Pago', dia: Math.min(31, Math.max(1, num(q.dia) || 1))
  })));

  await meter('financiamientos', (doc.financiamientos || []).map(f => ({
    id: asignar(f), hogar_id: hogarId,
    nombre: texto(f.nombre, 60) || 'Financiamiento',
    cuota_mensual: num(f.cuotaMensual),
    cuotas_totales: Math.max(0, Math.round(num(f.cuotasTotales))),
    cuotas_pagadas: Math.min(Math.max(0, Math.round(num(f.cuotasPagadas))),
                             Math.max(0, Math.round(num(f.cuotasTotales))))
  })));

  /* ---------- 2. lo que apunta a lo anterior ---------- */

  await meter('tarjetas', (doc.tarjetas || []).map(t => ({
    id: asignar(t), hogar_id: hogarId,
    nombre: texto(t.nombre, 60) || 'Tarjeta', numero: texto(t.numero, 40),
    tipo: t.tipo === 'debito' ? 'debito' : 'credito',
    // La base exige día de corte a las de crédito. Si el respaldo no
    // lo trae, se pone el 1: es visible y corregible, y sin él la fila
    // entera se rechazaría y se perdería la tarjeta.
    dia_corte: t.tipo === 'debito' ? null : (num(t.diaCorte) || 1),
    dia_pago: t.diaPago == null ? null : Math.min(31, Math.max(0, num(t.diaPago))),
    paga_con: id(t.pagaCon), cuenta_id: id(t.cuentaId),
    saldo_inicial: num(t.saldoInicial), desde_mes: t.desdeMes || null,
    paga_total: t.pagaTotal !== false, tasa_anual: Math.min(200, num(t.tasaAnual)),
    saldo_banco_monto: t.saldoBanco?.monto ?? null,
    saldo_banco_fecha: t.saldoBanco?.fecha ?? null,
    retenido_monto: t.retenido?.monto ?? null,
    retenido_fecha: t.retenido?.fecha ?? null
  })));

  await meter('gastos', (doc.gastos || []).map((g, i) => ({
    id: asignar(g), hogar_id: hogarId,
    concepto: texto(g.concepto, 80) || 'Gasto', monto: num(g.monto),
    categoria: texto(g.categoria, 40) || 'Otros',
    medio_pago: g.medioPago === 'efectivo' ? 'efectivo' : 'tarjeta',
    tarjeta_id: g.medioPago === 'efectivo' ? null : id(g.tarjetaId),
    crecimiento: Math.min(20, Math.max(0, num(g.crecimiento))), orden: i
  })));

  await meter('proyectos', (doc.proyectos || []).map((p, i) => ({
    id: asignar(p), hogar_id: hogarId,
    nombre: texto(p.nombre, 80) || 'Proyecto',
    costo_min: num(p.costoMin) || num(p.costoMax),
    costo_max: num(p.costoMax) || num(p.costoMin),
    aporte_mensual: num(p.aporteMensual),
    fecha_objetivo: p.fechaObjetivo ? `${String(p.fechaObjetivo).slice(0, 7)}-01` : null,
    nota: texto(p.nota, 200), tipo: p.tipo || 'deseo', urgencia: p.urgencia || 'algun_dia',
    consecuencia: texto(p.consecuencia, 200), orden: i
  })));

  /* ---------- 3. las personas apuntan a su cuenta ---------- */

  const conCuenta = (doc.personas || []).filter(p => p.cuentaId && id(p.cuentaId));
  if (conCuenta.length) {
    await fusionar('personas', conCuenta.map(p => ({
      id: id(p.id), hogar_id: hogarId,
      nombre: texto(p.nombre, 80) || 'Sin nombre', cuenta_id: id(p.cuentaId)
    })), 'id');
  }

  /* ---------- 4. lo del mes ---------- */

  await meter('plantilla_lineas', (doc.plantillaIngresos || []).flatMap(q =>
    (q.lineas || []).filter(l => id(l.personaId)).map(l => ({
      id: uid(), hogar_id: hogarId, plantilla_id: id(q.id), persona_id: id(l.personaId),
      bruto: num(l.bruto), deducciones: l.deducciones || []
    }))));

  await meter('aportes', (doc.proyectos || []).flatMap(p =>
    (p.aportes || []).map(a => ({
      id: uid(), hogar_id: hogarId, proyecto_id: id(p.id),
      persona_id: id(a.personaId), monto: num(a.monto),
      fecha: a.fecha, nota: texto(a.nota, 200)
    }))));

  await meter('ingresos_mes', Object.entries(doc.ingresosMes || {}).flatMap(([per, m]) =>
    Object.entries(m.lineas || {}).flatMap(([evId, porPersona]) =>
      Object.entries(porPersona || {})
        .filter(([pid]) => id(pid) && id(evId))
        .map(([pid, l]) => ({
          id: uid(), hogar_id: hogarId, periodo: per,
          plantilla_id: id(evId), persona_id: id(pid),
          bruto: num(l.bruto), deducciones: l.deducciones || [],
          confirmado: Boolean((m.confirmado || {})[evId])
        })))));

  await meter('movimientos', (doc.movimientos || []).map(m => ({
    id: uid(), hogar_id: hogarId, fecha: m.fecha, periodo: m.periodo,
    monto: num(m.monto), concepto: texto(m.concepto, 80),
    gasto_id: id(m.gastoId), persona_id: id(m.personaId),
    medio_pago: m.medioPago === 'efectivo' ? 'efectivo' : 'tarjeta',
    tarjeta_id: id(m.tarjetaId),
    // Lo que vino de la app anterior se marca como manual: nadie lo
    // importó de un banco EN ESTE hogar, y tratarlo como importado lo
    // pondría a merced del borrado de la próxima importación.
    origen: 'manual'
  })));

  await meter('retiros', (doc.retiros || []).map(r => ({
    id: uid(), hogar_id: hogarId, fecha: r.fecha, periodo: r.periodo,
    monto: num(r.monto), cuenta_id: id(r.cuentaId), persona_id: id(r.personaId),
    nota: texto(r.nota, 80), origen: 'manual'
  })));

  await meter('pagos_tarjeta', (doc.pagosTarjeta || []).map(x => ({
    id: uid(), hogar_id: hogarId, fecha: x.fecha, periodo: x.periodo,
    monto: num(x.monto), tarjeta_id: id(x.tarjetaId), cuenta_id: id(x.cuentaId),
    nota: texto(x.nota, 80), origen: 'manual'
  })));

  await meter('comercios', Object.entries(doc.comercios || {})
    .filter(([, gid]) => id(gid))
    .map(([clave, gid]) => ({
      id: uid(), hogar_id: hogarId, clave: texto(clave, 120), gasto_id: id(gid)
    })));

  /* Los meses congelados van AL FINAL, y no por capricho: en cuanto
     uno entra marcado como cerrado, la base deja de aceptar
     movimientos de ese mes. Escribirlos antes haría que la migración
     rechazara sus propios datos. */
  await meter('presupuesto_mes', Object.entries(doc.presupuestoMes || {}).map(([per, p]) => ({
    id: uid(), hogar_id: hogarId, periodo: per,
    montos: mapaConIds(p.montos, id), notas: mapaConIds(p.notas, id),
    ajustes: p.ajustes || {},
    efectivo_contado: p.efectivoContado ?? null,
    cerrado: Boolean(p.cerrado), cerrado_el: p.cerradoEl || null,
    apertura: p.apertura ? { ...p.apertura,
      cuentas: mapaConIds(p.apertura.cuentas, id),
      tarjetas: mapaConIds(p.apertura.tarjetas, id),
      financiamientos: mapaConIds(p.apertura.financiamientos, id) } : null
  })));

  invalidarConfiguracion();
  olvidarHistorico();
  return { hechas, equivalencias: nuevo.size };
}

/** Un mapa `idViejo → valor` con los identificadores nuevos. */
function mapaConIds(mapa, id) {
  const r = {};
  for (const [k, v] of Object.entries(mapa || {})) {
    const n = id(k);
    if (n) r[n] = v;
  }
  return r;
}

/** El mes más viejo con algo registrado, para las cuentas sin `desdeMes`. */
function mesMasViejo(doc) {
  const meses = [...(doc.movimientos || []), ...(doc.retiros || []), ...(doc.pagosTarjeta || [])]
    .map(x => x.periodo).filter(Boolean).sort();
  return meses[0] || new Date().toISOString().slice(0, 7);
}
