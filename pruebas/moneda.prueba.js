/* ============================================================
   La moneda del hogar, y la racha que se comprueba en vez de creerse.

   DOS DEFECTOS QUE ESTA SUITE FIJA PARA QUE NO VUELVAN

   1. EL NÚCLEO ESCRIBÍA LEMPIRAS SIEMPRE. `fmt` era `'L ' + nf.format(n)`
      con la `L` a mano y el agrupado clavado en `es-HN`. Como el núcleo
      no solo devuelve números sino FRASES —la carta, los pasos del
      diagnóstico, los bloqueos del cierre, las alertas de proyecto—, un
      hogar en dólares veía sus fichas en «$» y el Diagnóstico, tres
      centímetros más abajo, en «L». La misma cifra con dos monedas hace
      dudar del número, no del rótulo.

      No alcanza con probar `fmt` suelta: eso ya pasaba en verde con el
      defecto encima, porque nadie la llamaba desde una prueba. Lo que se
      comprueba acá es que NINGUNA frase del núcleo traiga el símbolo de
      otra moneda.

   2. «NO PAGAN UN LEMPIRA DE INTERÉS» SALÍA DE UNA CASILLA. `pagaTotal`
      lo marca una persona una vez; de ahí colgaba la afirmación más
      fuerte de todo el diagnóstico. Un hogar que marcó la casilla y un
      mes no cubrió el corte seguía leyendo esa frase mientras el banco le
      corría la tasa sobre todo el saldo.

   Cada prueba se verificó rompiéndola a propósito: con el `fmt` viejo
   fallan seis de las trece, y las que quedan verdes son justamente las
   que no dependen del defecto.
   ============================================================ */

import { grupo, probar } from './ayuda.js';
import * as A from '../sitio/app/nucleo/index.js';

/* ============ el hogar de prueba ============ */

/**
 * Una tarjeta que dice pagarse completa, con un año de consumos de
 * 10,000 al mes. `pagos` decide si la racha es real o solo declarada.
 */
const hogarTarjeta = ({ pagos = 10000, deudaBanco = null } = {}) => {
  const movimientos = [];
  const pagosTarjeta = [];
  for (let m = 1; m <= 12; m++) {
    const per = `2026-${String(m).padStart(2, '0')}`;
    movimientos.push({ id: 'm' + m, periodo: per, fecha: `${per}-10`, monto: 10000,
                       gastoId: 'g1', medioPago: 'tarjeta', tarjetaId: 't1' });
    pagosTarjeta.push({ id: 'p' + m, periodo: per, fecha: `${per}-27`, monto: pagos,
                        tarjetaId: 't1', cuentaId: 'c1' });
  }
  const tarjeta = { id: 't1', nombre: 'BAC', tipo: 'credito', diaCorte: 6, diaPago: 27,
                    pagaCon: 'q1', pagaTotal: true, tasaAnual: 55,
                    desdeMes: '2026-01', saldoInicial: 0 };
  if (deudaBanco !== null) tarjeta.saldoBanco = { monto: deudaBanco, fecha: '2026-12-06' };

  return {
    version: 6, configurado: true, inicioMes: 1,
    personas: [{ id: 'p1', nombre: 'Ana', cuentaId: 'c1' }],
    cuentas: [{ id: 'c1', nombre: 'Cuenta', saldoInicial: 8000, desdeMes: '2026-01' }],
    plantillaIngresos: [{ id: 'q1', nombre: 'Sueldo', dia: 30,
                          lineas: [{ personaId: 'p1', bruto: 30000, deducciones: [] }] }],
    ingresosMes: {},
    gastos: [{ id: 'g1', concepto: 'Comida', monto: 9000, categoria: 'Alimentación',
               crecimiento: 0, medioPago: 'tarjeta', tarjetaId: 't1' }],
    tarjetas: [tarjeta],
    financiamientos: [], proyectos: [],
    movimientos, retiros: [], pagosTarjeta, presupuestoMes: {}
  };
};

/** Todas las frases que el núcleo produce para un hogar, en un solo texto. */
function todasLasFrases(D, per) {
  const s = A.saludFinanciera(D, per);
  const c = A.cartaAsesor(D, per);
  const cierre = A.cierreDeMes(D, per);
  return [
    ...s.pasos.map(x => x.titulo + ' ' + x.texto),
    ...c.parrafos.map(x => x.titulo + ' ' + x.texto),
    ...cierre.bloqueos.map(b => b.texto)
  ].join(' \n ');
}

/* ============ la moneda ============ */
grupo('Moneda del hogar');

probar('En lempiras se escribe con L, coma de miles y dos decimales', () => {
  A.fijarMoneda('HNL');
  const t = A.fmt(1234567.891);
  return { ok: t === 'L 1,234,567.89', det: t };
});

probar('En dólares cambia el símbolo, no el agrupado', () => {
  A.fijarMoneda('USD');
  const t = A.fmt(1234567.891);
  A.fijarMoneda('HNL');
  return { ok: t === '$ 1,234,567.89', det: t };
});

probar('El peso colombiano agrupa con punto y NO lleva centavos', () => {
  /* No es estilo: «1,234» en Colombia es uno con doscientos treinta y
     cuatro. Escribirle a alguien de Bogotá con el agrupado de Honduras le
     cambia el número, no el adorno. */
  A.fijarMoneda('COP');
  const t = A.fmt(1234567.891);
  A.fijarMoneda('HNL');
  return { ok: t === '$ 1.234.568', det: t };
});

probar('Una moneda desconocida cae al lempira y no escribe «undefined»', () => {
  const puesta = A.fijarMoneda('XYZ');
  const t = A.fmt(100);
  A.fijarMoneda('HNL');
  return { ok: puesta === 'HNL' && t === 'L 100.00', det: `${puesta} · ${t}` };
});

probar('La lista de monedas de la interfaz sale de la tabla del núcleo', () => {
  const codigos = Object.keys(A.MONEDAS);
  return { ok: codigos.includes('HNL') && codigos.includes('COP') && codigos.includes('USD')
             && codigos.every(c => A.MONEDAS[c].simbolo && A.MONEDAS[c].region),
           det: codigos.join(', ') };
});

probar('NINGUNA frase del núcleo trae lempiras en un hogar en dólares', () => {
  /* Esta es la que de verdad importa. Probar `fmt` suelta pasaba en verde
     con el defecto encima, porque el defecto no estaba en `fmt` sino en
     QUIÉN la llamaba: la carta, los pasos y los bloqueos. */
  A.fijarMoneda('USD');
  const texto = todasLasFrases(hogarTarjeta({ pagos: 4000 }), '2026-12');
  A.fijarMoneda('HNL');
  const conLempiras = /L\s[\d.,]/.test(texto);
  return { ok: texto.includes('$') && !conLempiras,
           det: conLempiras ? 'quedó una cifra en lempiras: ' + texto.slice(0, 200)
                            : 'todas las cifras en dólares' };
});

probar('Y en lempiras siguen saliendo en lempiras', () => {
  A.fijarMoneda('HNL');
  const texto = todasLasFrases(hogarTarjeta({ pagos: 4000 }), '2026-12');
  return { ok: /L\s[\d.,]/.test(texto) && !texto.includes('$'), det: texto.slice(0, 160) };
});

/* ============ la racha ============ */
grupo('La racha de pagar el total');

probar('Quien paga el total y debe solo su ciclo NO recibe acusación', () => {
  A.fijarMoneda('HNL');
  const s = A.saludFinanciera(hogarTarjeta({ pagos: 10000 }), '2026-12');
  return { ok: !s.rachaRota.length && s.interesLatente === 0,
           det: 'pasos: ' + s.pasos.map(p => p.clave).join(' → ') };
});

probar('Deber más de dos meses de consumo rompe la racha, diga lo que diga la casilla', () => {
  // Carga 10,000 al mes y paga 4,000: al año arrastra 72,000.
  const s = A.saludFinanciera(hogarTarjeta({ pagos: 4000 }), '2026-12');
  const t = s.rachaRota[0];
  return { ok: s.rachaRota.length === 1 && t.arrastreSinDeclarar === 52000
             && Math.abs(s.interesLatente - 52000 * 0.55 / 12) < 0.01,
           det: `arrastre ${t && t.arrastreSinDeclarar} · latente ${s.interesLatente.toFixed(2)}` };
});

probar('Con la racha en duda desaparece «no pagan un lempira de interés»', () => {
  const s = A.saludFinanciera(hogarTarjeta({ pagos: 4000 }), '2026-12');
  const claves = s.pasos.map(p => p.clave);
  return { ok: claves.includes('racha-rota') && !claves.includes('racha')
             && s.pasos.find(p => p.clave === 'racha-rota').nivel === 'critical',
           det: 'pasos: ' + claves.join(' → ') };
});

probar('El estado de cuenta del banco manda también para esto', () => {
  /* Si el banco dice que se debe poco, no hay arrastre que reclamar aunque
     los pagos registrados se hayan quedado cortos: falta registrar pagos,
     no falta plata. */
  const s = A.saludFinanciera(hogarTarjeta({ pagos: 4000, deudaBanco: 9000 }), '2026-12');
  return { ok: !s.rachaRota.length, det: 'deuda declarada por el banco: 9,000' };
});

probar('Sin consumos observados no se acusa a nadie', () => {
  const d = hogarTarjeta({ pagos: 4000 });
  d.movimientos = [];                       // solo saldo inicial, sin historial
  d.tarjetas[0].saldoInicial = 80000;
  const s = A.saludFinanciera(d, '2026-12');
  return { ok: !s.rachaRota.length, det: 'sin evidencia no hay hallazgo' };
});

probar('El interés latente NO se mezcla con el declarado', () => {
  /* Una sospecha bien fundada no es un hecho. `interesMensual` sigue
     midiendo solo lo que la tarjeta declara revolver. */
  const s = A.saludFinanciera(hogarTarjeta({ pagos: 4000 }), '2026-12');
  return { ok: s.interesMensual === 0 && s.interesLatente > 0,
           det: `declarado ${s.interesMensual} · latente ${s.interesLatente.toFixed(2)}` };
});
