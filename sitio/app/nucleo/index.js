/* ============================================================
   Núcleo financiero de Controle Wallet — puerta de entrada.

   Este es el activo más valioso del proyecto: la lógica que decide
   cuánto hay, cuánto se debe, si un proyecto es viable y si el mes
   cuadra. Viene de `asesor.js`, probado en uso real durante meses.

   Funciones puras. Reciben el documento de datos y devuelven
   números. No tocan el DOM, ni la red, ni la base. Por eso el mismo
   código corre en el navegador, en el servidor y en las pruebas — y
   por eso se puede confiar en que las tres den el mismo resultado.

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

export { HORIZONTE, COLCHON_MIN, perDe } from './base.js';

export {
  sumaMeses, distanciaMeses, diaValido, diasDelMes, hoyLocal,
  inicioMes, periodoDe, rangoPeriodo, diasPeriodo
} from './fechas.js';

export {
  netoLinea, dedTotal, lineaDe, ingresoMes, eventoConfirmado,
  mesConfirmadoPrevio, lineaParaConfirmar
} from './ingresos.js';

export {
  cuotasEn, activo, cuotasRestantes, saldoFinanciamiento,
  deudaFinanciada, liberaciones
} from './financiamientos.js';

export {
  gastosMes, montosDeMes, mesCongelado, mesCerrado, fotoDelPlan, cierreDeMes,
  cicloDe, cicloTarjeta, efectivo,
  saldoCuenta, saldosCuentas, pagoPendiente,
  deudaTarjeta, deudaTarjetas,
  estadoTarjeta, estadoTarjetas, efectivoHasta, saldosCierre, aperturaDe,
  movimientoCuenta, conciliaciones, TOLERANCIA
} from './saldos.js';

export { presupuestoSugerido, coberturaImportada, mediana } from './sugerido.js';

export { proyectar, resumenMes, acumulado, mesesPara, evaluarProyecto } from './proyeccion.js';

export { diasHasta, pulso, historia, porCategoria } from './pulso.js';

export { patrimonio, saludFinanciera, MESES_COLCHON, planIncompleto } from './patrimonio.js';

/* El importador de estados de cuenta. Se reexporta aquí como todo lo
   demás: `index.js` es la puerta del núcleo, y una pieza que no pase
   por ella obliga a cada pantalla a saber en qué archivo vive cada
   función. Faltaba, y el fallo no se vio hasta tener la pantalla
   delante — `A.leerArchivo is not a function`, en producción. */
export {
  leerArchivo, aplicarLote, destinoDe, claveComercio, reglaDe, rubroPara,
  REGLAS, TIPOS, verificarTarjeta, conciliarConApp,
  // Y los internos, que el `window.Importar` de la app anterior también
  // exponía. Van completos por la misma regla que el resto del núcleo:
  // nada de lo que existía se pierde en la mudanza. Hay una prueba que
  // compara las dos superficies nombre por nombre.
  md5, rc4, filasCsv, mapearColumnas, decodificar, fechaIso, numero,
  adaptadorBac, adaptadorCsv, adaptadorFicohsa, adaptadorSaldos, esPagoDeTarjeta,
  clasificar, verificar, renglonesPdf
} from './importar.js';

export {
  priorizar, evaluarCartera, fugasRecurrentes,
  TIPOS_PROYECTO, URGENCIAS, VEREDICTOS, ETIQUETA_URGENCIA, tipoDe, urgenciaDe
} from './prioridad.js';

export { cartaAsesor } from './carta.js';

/** Qué falta para que la app pueda calcular algo con sentido. */
export function faltantes(D) {
  const f = [];
  if (!(D.personas || []).length) f.push({ k: 'personas', t: 'Quiénes usan la app' });
  if (!(D.plantillaIngresos || []).length) f.push({ k: 'ingresos', t: 'Los pagos que reciben' });
  if (!(D.gastos || []).length) f.push({ k: 'gastos', t: 'Los gastos del mes' });
  return f;
}
