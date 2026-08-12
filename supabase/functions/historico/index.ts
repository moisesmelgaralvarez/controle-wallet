/* ============================================================
   El histórico, calculado donde sí cabe.

   Hay cifras del núcleo que recorren TODA la vida del hogar:
   `saldoCuenta`, `deudaTarjeta`, `efectivo`, y de ellas cuelgan
   `patrimonio`, `saludFinanciera` y `historia`. El navegador solo
   baja el mes en curso —un hogar con tres años no le baja tres años
   al teléfono— así que ahí esas cifras no se pueden calcular. Y
   calcularlas a medias es peor que no darlas: está medido que el
   veredicto de un proyecto se da vuelta.

   Esta función trae el histórico completo y corre EL MISMO NÚCLEO
   sobre él. No es una segunda implementación en SQL: es el mismo
   archivo que corre en el navegador y en las pruebas, importado tal
   cual. Si hubiera dos aritméticas, tarde o temprano darían dos
   respuestas y no habría forma de saber cuál creer.

   DOS COSAS QUE HACE A PROPÓSITO:

   1. VA CON EL TOKEN DE QUIEN PREGUNTA, no con la clave de servicio.
      Las políticas RLS siguen siendo las que deciden qué se ve. Esta
      función no filtra por hogar en ninguna línea, y esa ausencia es
      deliberada: filtrar en el código sería teatro, y el día que
      alguien borrara esa línea se llevaría el aislamiento con ella.
      No hay ningún secreto aquí dentro.

   2. NO CALCULA CON HISTORIA INCOMPLETA. Si al traer una tabla lo
      recibido no cuadra con lo que el servidor dijo que había,
      revienta en vez de devolver un número. Ver `_compartido/traer.js`.
   ============================================================ */

import { armar, CONFIGURACION, POR_MES } from '../../../sitio/app/datos/armador.js';
import * as A from '../../../sitio/app/nucleo/index.js';
import { traerTodo, lectorPostgrest } from '../_compartido/traer.js';

const CABECERAS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: CABECERAS });

/**
 * Un error que ya está escrito para leerse.
 *
 * `propio: true` es la marca que le dice al navegador «este mensaje
 * pasa tal cual, no lo cambies por el genérico de tu tabla». Sin ella,
 * `traducir()` ve un 500 y muestra «Falló el servidor. Intentá de
 * nuevo», que es justo lo contrario de lo que hace falta: cuando el
 * cálculo se niega porque faltaron 412 filas, ESA es la frase que hay
 * que leer. Se pagó una vez con los errores de entrada, que decían
 * «los datos enviados no son válidos» a quien tenía el correo sin
 * confirmar.
 */
const fallar = (mensaje: string, estado: number) =>
  responder({ error: mensaje, propio: true }, estado);

/**
 * Cada proyecto evaluado trae dentro la proyección a 60 meses con la
 * que se calculó su plazo. Son sesenta filas por proyecto que el
 * navegador no dibuja: con diez metas son seiscientas filas de más
 * viajando por la red para nada.
 */
function sinProyeccion(cartera: Record<string, { filas?: unknown }>) {
  return Object.fromEntries(
    Object.entries(cartera).map(([id, ev]) => {
      const { filas: _descartada, ...resto } = ev;
      return [id, resto];
    }));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CABECERAS });

  const autorizacion = req.headers.get('Authorization') || '';
  if (!autorizacion.startsWith('Bearer ')) {
    return fallar('Hace falta iniciar sesión.', 401);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const clave = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !clave) return fallar('Falta configuración del proyecto.', 500);

  try {
    const { periodo, meses = 12 } = await req.json().catch(() => ({}));
    if (!/^\d{4}-\d{2}$/.test(String(periodo || ''))) {
      return fallar('Falta el período, con forma AAAA-MM.', 400);
    }

    const traer = (tabla: string) =>
      traerTodo(lectorPostgrest({ url, clave, autorizacion, tabla }));

    // El hogar sale de RLS: quien pregunta solo ve el suyo.
    const hogares = await traer('hogares');
    const hogar = hogares[0];
    if (!hogar) return fallar('No se encontró tu hogar.', 404);

    // Aquí NO se filtra por mes: eso es justo lo que el navegador hace
    // y lo que esta función viene a completar.
    const tablas = [...CONFIGURACION, ...POR_MES];
    const filas = Object.fromEntries(
      await Promise.all(tablas.map(async t => [t, await traer(t)])));

    const D = armar({ hogar, ...filas });

    return responder({
      periodo,
      generado: new Date().toISOString(),
      // Cuántas filas entraron en el cálculo. Sirve para que el
      // navegador pueda decir «con 1,240 movimientos detrás» en vez
      // de pedir que se le crea.
      filasUsadas: Object.fromEntries(tablas.map(t => [t, filas[t].length])),

      patrimonio: A.patrimonio(D, periodo),
      salud: A.saludFinanciera(D, periodo),

      /* La carta del asesor: qué hacer con el dinero de este mes, en
         orden. Se calcula aquí porque castiga según el colchón y la
         deuda, y las dos salen del histórico — con un mes cargado
         diría otra cosa, con la misma seguridad. */
      carta: A.cartaAsesor(D, periodo),

      // El cierre se calcula AQUÍ por dos razones, y ninguna es de
      // rendimiento. La primera: con qué saldos arrancó el mes sale de
      // recorrer todo lo anterior mientras nadie haya cerrado el mes
      // previo. La segunda es más fina — el ciclo de una tarjeta va de
      // corte a corte, así que agarra días del mes pasado, y el
      // navegador solo baja el mes en curso: la conciliación de la
      // tarjeta se quedaría sin los pagos de esa cola. Las dos dan un
      // descuadre inventado, y un descuadre inventado bloquea un
      // cierre que sí cuadraba.
      cierre: A.cierreDeMes(D, periodo),

      // Lo que hay que ESCRIBIR para cerrar, ya calculado aquí.
      //
      // No es una comodidad. `saldosCierre` recorre toda la vida del
      // hogar, así que si el navegador lo calculara con su único mes
      // sembraría un arranque falso en el mes siguiente — y un
      // arranque falso no se nota nunca: no hay pantalla donde se vea
      // mal, solo cifras que dejan de cuadrar meses después.
      //
      // `montos` es la foto del plan que rigió el mes. Si ya estaba
      // congelado se respeta la suya: cerrar cuadra las cuentas, no
      // reescribe el plan que estuvo vigente.
      paraCerrar: {
        montos: A.montosDeMes(D, periodo) || A.fotoDelPlan(D),
        saldos: A.saldosCierre(D, periodo)
      },
      historia: A.historia(D, periodo, meses),
      cuentas: A.saldosCuentas(D, periodo),
      efectivo: A.efectivo(D, periodo),
      tarjetas: A.deudaTarjetas(D, periodo),

      // El veredicto de cada proyecto se calcula aquí y no en el
      // navegador porque castiga según el colchón y la deuda, y las
      // dos salen del histórico. Está medido que calculado con un mes
      // se da vuelta.
      cartera: sinProyeccion(A.evaluarCartera(D, periodo))
    });

  } catch (e) {
    // El mensaje de `traerTodo` está escrito para leerse: dice cuántas
    // filas faltaron. No se lo traga un genérico.
    return fallar((e as Error).message || 'Falló el cálculo.', 500);
  }
});
