/* ============================================================
   Traer una tabla ENTERA, sin que falte una fila.

   POR QUÉ ESTO NO ES UN `fetch` Y YA:

   PostgREST puede tener un techo de filas por respuesta. Cuando lo
   tiene, no falla ni avisa: devuelve las primeras mil de tres mil con
   un 206 y un `Content-Range` que nadie mira. El saldo sale con un
   tercio de la historia, la cifra parece razonable, y el error
   aparece meses después cuando alguien concilia contra el banco.

   Es la misma familia de error que ya costó caro dos veces en este
   proyecto —el `numeric` que llega como texto, el `desde_mes` que se
   rellena solo—: todas fallan en silencio y todas dan un número
   creíble.

   Así que aquí se pide el CONTEO EXACTO junto con la primera página,
   se sigue pidiendo hasta tenerlo todo, y si al final lo traído no
   cuadra con lo que el servidor dijo que había, se levanta la mano.
   Calcular con la mitad no es una opción: esta función existe
   precisamente para que el servidor sepa lo que el navegador no.
   ============================================================ */

/** Lo que devuelve un `Content-Range: 0-999/3412`. El total, o null. */
export function totalDelRango(rango) {
  const m = /\/(\d+)$/.exec(String(rango || ''));
  return m ? Number(m[1]) : null;
}

/**
 * Trae todas las filas de una tabla, en páginas.
 *
 * `leerPagina(desde, hasta)` tiene que devolver `{ filas, total }`,
 * donde `total` sale de la cabecera `Content-Range` y puede ser null
 * si el servidor no la mandó. Se inyecta para poder probar esto sin
 * red — y sobre todo para poder probar el caso que importa, que es
 * el del techo de filas.
 */
export async function traerTodo(leerPagina, { tam = 1000, tope = 500 } = {}) {
  const todo = [];
  let total = null;

  for (let pagina = 0; pagina < tope; pagina++) {
    const desde = pagina * tam;
    const { filas, total: t } = await leerPagina(desde, desde + tam - 1);

    if (t != null) total = t;
    if (!Array.isArray(filas)) throw new Error('La página no trajo filas.');
    todo.push(...filas);

    // Se sigue mientras la página venga llena. Una página a medias es
    // la última: pedir otra solo gasta un viaje.
    if (filas.length < tam) break;
    // Y si el servidor dijo cuántas hay, se para al llegar.
    if (total != null && todo.length >= total) break;
  }

  if (total != null && todo.length !== total) {
    throw new Error(
      `Se trajeron ${todo.length} filas de ${total}. No se calcula con historia incompleta.`);
  }
  return todo;
}

/**
 * Un lector de páginas contra PostgREST, con la sesión de quien
 * pregunta.
 *
 * VA CON EL TOKEN DEL USUARIO, NO CON LA CLAVE DE SERVICIO. Es lo que
 * deja que las políticas RLS sigan siendo las que deciden qué se ve:
 * esta función no filtra por hogar en ningún lado, porque filtrar en
 * el código sería teatro — la base ya lo hace y lo hace siempre.
 */
export function lectorPostgrest({ url, clave, autorizacion, tabla, filtros = {} }) {
  const consulta = new URLSearchParams({ select: '*', ...filtros }).toString();

  return async (desde, hasta) => {
    const r = await fetch(`${url}/rest/v1/${tabla}?${consulta}`, {
      headers: {
        apikey: clave,
        Authorization: autorizacion,
        // `count=exact` es lo que hace que venga el total en
        // `Content-Range`. Sin él no habría con qué comprobar nada.
        Prefer: 'count=exact',
        Range: `${desde}-${hasta}`,
        'Range-Unit': 'items'
      }
    });

    if (!r.ok && r.status !== 206) {
      throw new Error(`No se pudo leer ${tabla}: ${r.status} ${await r.text()}`);
    }
    return { filas: await r.json(), total: totalDelRango(r.headers.get('content-range')) };
  };
}
