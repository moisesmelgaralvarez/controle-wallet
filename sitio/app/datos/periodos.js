/* ============================================================
   Hasta dónde se puede mover el mes.

   La app siempre mostró el mes en curso y nada más. Con el selector,
   cada pantalla puede mirar otro — y hay que decidir hasta dónde,
   porque un selector sin tope deja llegar a enero de 1999 y otro
   demasiado corto esconde datos que sí existen.

   HACIA ADELANTE, EL MES EN CURSO Y PARÁ. Después de él no ha pasado
   nada: el plan estaría entero y el gasto en cero, así que cualquier
   pantalla diría que van holgadísimos. Es una respuesta creíble a una
   pregunta que nadie hizo.

   HACIA ATRÁS, lo que sea MÁS VIEJO entre dos cosas: el mes desde el
   que valen los saldos declarados (`desdeMes` de cuentas y tarjetas)
   y un año. Se toman las dos porque cada una sola falla:

     · Solo lo declarado esconde datos. `desdeMes` dice desde cuándo
       vale un saldo, no cuándo empezó el hogar; alguien puede
       declarar su cuenta desde agosto y tener movimientos de julio
       anotados. Con ese piso, julio quedaría inalcanzable.

     · Solo un año se queda corto para quien ya trajo su historia.

   Y un año, y no otro número, porque es hasta donde llega Historia:
   todo mes que esa pantalla lista tiene que poder abrirse.

   Vive aparte y sin pantalla porque es aritmética de meses, que es
   donde se esconden los errores de uno: diciembre a enero, un mes
   antes del primero, un tope que se pasa por uno.
   ============================================================ */

import { sumaMeses } from '../nucleo/fechas.js';

/** Lo mínimo que se puede mirar hacia atrás: lo que abarca Historia. */
const MINIMO_ATRAS = 12;

const esPeriodo = p => /^\d{4}-\d{2}$/.test(String(p || ''));

/**
 * El primero y el último mes que se pueden mirar.
 *
 * `hasta` es el mes en curso del hogar, que lo calcula quien llama
 * (`mesDeHoy`) porque depende del día de arranque.
 */
export function limites(D, hasta) {
  const declarados = [...(D.cuentas || []), ...(D.tarjetas || [])]
    .map(x => x.desdeMes)
    .filter(esPeriodo);

  /* El más viejo de todos, contando el año por omisión. Que ese año
     entre en la comparación es lo que impide dos cosas: que un
     `desdeMes` reciente esconda meses con datos, y que uno escrito
     hacia adelante deje el rango al revés y trabe las dos flechas. */
  const piso = [...declarados, sumaMeses(hasta, -MINIMO_ATRAS)].sort()[0];

  return { primero: piso, ultimo: hasta };
}

/**
 * El mes que queda al moverse `paso` meses, o `null` si ese paso se
 * sale del rango.
 *
 * Devolver `null` en vez de recortar es deliberado: quien llama usa
 * eso para apagar la flecha. Recortando en silencio, la flecha se
 * vería encendida y no haría nada, que es peor que no tenerla.
 */
export function mover(periodo, paso, { primero, ultimo }) {
  const destino = sumaMeses(periodo, paso);
  if (destino < primero || destino > ultimo) return null;
  return destino;
}

/** ¿Es este el mes en curso? Lo que decide si se avisa que no lo es. */
export const esElActual = (periodo, ultimo) => periodo === ultimo;

/**
 * Con qué fecha se rellena un formulario que se abre mirando un mes.
 *
 * Si hoy cae dentro del mes que se está viendo, hoy. Si no —se está
 * mirando el pasado— el último día de ESE mes.
 *
 * Sin esto, registrar un gasto mientras se mira julio lo guardaría en
 * agosto (el período sale de la fecha, no de la pantalla) y el
 * movimiento desaparecería al guardarlo: se anotó bien, pero en un
 * mes que no se está mirando. Nadie encuentra ese registro después.
 */
export function fechaPorOmision(rango, hoy) {
  return hoy >= rango.desde && hoy <= rango.hasta ? hoy : rango.hasta;
}
