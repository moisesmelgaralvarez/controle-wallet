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
    return responder({ error: 'Hace falta iniciar sesión.' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const clave = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !clave) return responder({ error: 'Falta configuración del proyecto.' }, 500);

  try {
    const { periodo, meses = 12 } = await req.json().catch(() => ({}));
    if (!/^\d{4}-\d{2}$/.test(String(periodo || ''))) {
      return responder({ error: 'Falta el período, con forma AAAA-MM.' }, 400);
    }

    const traer = (tabla: string) =>
      traerTodo(lectorPostgrest({ url, clave, autorizacion, tabla }));

    // El hogar sale de RLS: quien pregunta solo ve el suyo.
    const hogares = await traer('hogares');
    const hogar = hogares[0];
    if (!hogar) return responder({ error: 'No se encontró tu hogar.' }, 404);

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
    return responder({ error: (e as Error).message || 'Falló el cálculo.' }, 500);
  }
});
