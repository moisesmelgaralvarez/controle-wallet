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
  /* LA PRIMERA PÁGINA YA TRAE EL TOTAL, ASÍ QUE NO HACE FALTA
     PREGUNTAR DE A UNA.

     Antes esto era un bucle: pedir, mirar si vino llena, pedir la
     siguiente. Con 3,240 movimientos son cuatro viajes en fila india,
     cada uno esperando al anterior y pagando entera la latencia entre
     la función y PostgREST. Pero el total exacto viene en el
     `Content-Range` de la PRIMERA respuesta —`count=exact` está puesto
     justamente para eso—, así que después de ese viaje ya se sabe
     cuántas páginas faltan y se pueden pedir todas a la vez.

     La comprobación de fondo no se toca: si al final lo traído no cuadra
     con lo que el servidor dijo que había, se levanta la mano. Traer en
     paralelo no vuelve más fiable a nadie; solo más rápido. */
  const primera = await leerPagina(0, tam - 1);
  if (!Array.isArray(primera.filas)) throw new Error('La página no trajo filas.');

  const total = primera.total;
  const todo = primera.filas.slice();

  /* Sin total no hay con qué calcular cuántas páginas faltan, así que se
     sigue de a una. Es el caso de una instancia con `count` apagado: no
     se puede comprobar nada, y tampoco se aborta por no poder. */
  if (total == null) {
    for (let pagina = 1; pagina < tope && todo.length === pagina * tam; pagina++) {
      const { filas } = await leerPagina(pagina * tam, (pagina + 1) * tam - 1);
      if (!Array.isArray(filas)) throw new Error('La página no trajo filas.');
      todo.push(...filas);
    }
    return todo;
  }

  const paginas = Math.min(tope, Math.max(1, Math.ceil(total / tam)));
  if (paginas > 1) {
    /* El orden se conserva: `Promise.all` devuelve en el orden en que se
       pidieron, no en el que contestaron. */
    const resto = await Promise.all(
      Array.from({ length: paginas - 1 },
        (_, i) => leerPagina((i + 1) * tam, (i + 2) * tam - 1)));
    for (const { filas } of resto) {
      if (!Array.isArray(filas)) throw new Error('La página no trajo filas.');
      todo.push(...filas);
    }
  }

  if (todo.length !== total) {
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
  /* CON ORDEN, O LAS PÁGINAS NO SON PÁGINAS. Sin `order`, Postgres no
     promete devolver las filas en el mismo orden en dos consultas
     distintas, y cada página es una consulta distinta: la 2 podía repetir
     una fila de la 1 y saltarse otra. La cuenta total salía igual, así
     que la comprobación de abajo no lo veía. Pidiendo las páginas en
     paralelo el riesgo es el mismo, y más fácil de pisar. Todas las
     tablas que se traen tienen `id` como llave primaria. */
  const consulta = new URLSearchParams({ select: '*', order: 'id', ...filtros }).toString();

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
