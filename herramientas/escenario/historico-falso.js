// Lo mismo que devuelve la Edge Function `historico`, calculado con EL MISMO
// núcleo sobre el hogar de ejemplo. Si la función agrega un campo que una
// vista lee, hay que agregarlo acá también — o la vista lo pinta vacío.
import * as A from '/app/nucleo/index.js';
import { hogarCompleto, HOY } from '/escenario/hogar.js';
export const olvidarHistorico = () => {};
export async function historico(periodo) {
  const D = hogarCompleto();
  await new Promise(r => setTimeout(r, 50));
  return { periodo, patrimonio: A.patrimonio(D, periodo), salud: A.saludFinanciera(D, periodo),
    sugerido: A.presupuestoSugerido(D, periodo, 12), carta: A.cartaAsesor(D, periodo),
    cuentas: A.saldosCuentas(D, periodo), efectivo: A.efectivo(D, periodo), tarjetas: A.deudaTarjetas(D, periodo),
    saldar: A.planParaSaldar(D, periodo, HOY), historia: A.historia(D, periodo, 12), filasUsadas: {} };
}
