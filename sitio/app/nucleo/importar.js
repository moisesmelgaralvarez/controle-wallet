/* ============================================================
   Importación de estados de cuenta.

   Dos formatos: CSV (genérico, sirve para cualquier banco) y el
   PDF de BAC, que viene cifrado con RC4 y hay que abrir a mano
   porque la app no puede cargar librerías de fuera.

   REGLA CENTRAL — el archivo manda sobre su propio rango.
   Cada importación reemplaza lo que se había importado antes para
   esa misma cuenta dentro de las mismas fechas. Como el exportado
   de la semana 3 contiene íntegras la 1 y la 2, sustituirlo es
   exacto por definición: no se puede duplicar aunque se importe
   diez veces, y un cargo que el banco reversa desaparece solo.

   Comparar transacción por transacción sería frágil: dos cargas de
   combustible de L 400 el mismo día son dos gastos reales, no una
   repetida, y ese método borraría una.

   Lo que se anotó a mano nunca se toca: solo se reemplaza lo que
   tiene origen 'import'.
   ============================================================ */

/* ============================================================
   1. MD5 y RC4 — para abrir el PDF cifrado de BAC.
   El navegador no trae MD5 (Web Crypto no lo ofrece) y el
   estándar de cifrado de PDF lo exige.
   ============================================================ */

function md5(bytes) {
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
             5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
             4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
             6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const K = new Int32Array(64);
  for (let i = 0; i < 64; i++) K[i] = (Math.abs(Math.sin(i + 1)) * 4294967296) | 0;

  const len = bytes.length;
  const conRelleno = new Uint8Array((((len + 8) >> 6) + 1) << 6);
  conRelleno.set(bytes);
  conRelleno[len] = 0x80;
  const bits = len * 8;
  for (let i = 0; i < 4; i++) conRelleno[conRelleno.length - 8 + i] = (bits >>> (8 * i)) & 255;

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Int32Array(16);
  const rot = (x, c) => (x << c) | (x >>> (32 - c));

  for (let off = 0; off < conRelleno.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      M[i] = conRelleno[off + i * 4] | (conRelleno[off + i * 4 + 1] << 8) |
             (conRelleno[off + i * 4 + 2] << 16) | (conRelleno[off + i * 4 + 3] << 24);
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16)      { F = (B & C) | (~B & D);  g = i; }
      else if (i < 32) { F = (D & B) | (~D & C);  g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D;           g = (3 * i + 5) % 16; }
      else             { F = C ^ (B | ~D);        g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) | 0;
      A = D; D = C; C = B;
      B = (B + rot(F, S[i])) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  const out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((v, i) => {
    for (let j = 0; j < 4; j++) out[i * 4 + j] = (v >>> (8 * j)) & 255;
  });
  return out;
}

function rc4(clave, datos) {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + clave[i % clave.length]) & 255;
    const t = S[i]; S[i] = S[j]; S[j] = t;
  }
  const out = new Uint8Array(datos.length);
  let i = 0; j = 0;
  for (let n = 0; n < datos.length; n++) {
    i = (i + 1) & 255; j = (j + S[i]) & 255;
    const t = S[i]; S[i] = S[j]; S[j] = t;
    out[n] = datos[n] ^ S[(S[i] + S[j]) & 255];
  }
  return out;
}

/* ============================================================
   2. Lectura del PDF
   ============================================================ */

const RELLENO = new Uint8Array([
  0x28,0xBF,0x4E,0x5E,0x4E,0x75,0x8A,0x41,0x64,0x00,0x4E,0x56,
  0xFF,0xFA,0x01,0x08,0x2E,0x2E,0x00,0xB6,0xD0,0x68,0x3E,0x80,
  0x2F,0x0C,0xA9,0xFE,0x64,0x53,0x69,0x7A]);

const bin = b => { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };
const aBytes = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };

/** Cadena PDF: <hex> o (literal con escapes). */
function cadenaPdf(t) {
  t = t.trim();
  if (t[0] === '<') {
    const h = t.slice(1, -1).replace(/[^0-9A-Fa-f]/g, '');
    const b = new Uint8Array(h.length >> 1);
    for (let i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16);
    return b;
  }
  const out = [];
  for (let i = 1; i < t.length - 1; i++) {
    if (t[i] === '\\') {
      const n = t[++i];
      const m = { n: 10, r: 13, t: 9, b: 8, f: 12 };
      if (m[n] != null) out.push(m[n]);
      else if (n >= '0' && n <= '7') {
        let o = n;
        while (o.length < 3 && t[i + 1] >= '0' && t[i + 1] <= '7') o += t[++i];
        out.push(parseInt(o, 8));
      } else out.push(n.charCodeAt(0) & 255);
    } else out.push(t.charCodeAt(i) & 255);
  }
  return new Uint8Array(out);
}

/** Clave del documento, con contraseña de usuario vacía (algoritmo 2 del estándar). */
function clavePdf(txt) {
  const ref = txt.match(/\/Encrypt\s+(\d+)\s+0\s+R/);
  if (!ref) return null;                       // sin cifrar
  const obj = txt.match(new RegExp('(?:^|[^0-9])' + ref[1] + '\\s+0\\s+obj([\\s\\S]*?)endobj'));
  if (!obj) return null;
  const cuerpo = obj[1];

  const O = cadenaPdf((cuerpo.match(/\/O\s*(\([\s\S]*?\)|<[0-9A-Fa-f\s]+>)/) || [])[1] || '<>');
  const P = parseInt((cuerpo.match(/\/P\s+(-?\d+)/) || [])[1] || '0', 10) >>> 0;
  const R = parseInt((cuerpo.match(/\/R\s+(\d+)/) || [])[1] || '2', 10);
  const bitsLargo = parseInt((cuerpo.match(/\/Length\s+(\d+)/) || [])[1] || '40', 10);
  const id = cadenaPdf((txt.match(/\/ID\s*\[\s*(<[0-9A-Fa-f\s]+>|\([\s\S]*?\))/) || [])[1] || '<>');

  const n = bitsLargo >> 3;
  const entrada = new Uint8Array(32 + O.length + 4 + id.length);
  entrada.set(RELLENO, 0);
  entrada.set(O.slice(0, 32), 32);
  for (let i = 0; i < 4; i++) entrada[32 + O.slice(0, 32).length + i] = (P >>> (8 * i)) & 255;
  entrada.set(id, 32 + O.slice(0, 32).length + 4);

  let k = md5(entrada);
  if (R >= 3) for (let i = 0; i < 50; i++) k = md5(k.slice(0, n));
  return k.slice(0, n);
}

function claveObjeto(clave, num, gen) {
  const e = new Uint8Array(clave.length + 5);
  e.set(clave);
  e[clave.length]     = num & 255;
  e[clave.length + 1] = (num >> 8) & 255;
  e[clave.length + 2] = (num >> 16) & 255;
  e[clave.length + 3] = gen & 255;
  e[clave.length + 4] = (gen >> 8) & 255;
  return md5(e).slice(0, Math.min(clave.length + 5, 16));
}

async function inflar(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('sin-inflate');
  const ds = new DecompressionStream('deflate');
  const r = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(r).arrayBuffer());
}

/**
 * Tabla de glifo → letra de una fuente incrustada.
 *
 * Los PDF impresos desde el navegador no guardan letras sino índices de
 * glifo: <0038> no es una "8", es "la posición 0x38 de esta fuente". La
 * traducción vive en el flujo /ToUnicode de cada fuente, en formato CMap.
 * Sin esto, de esos archivos no sale una sola palabra legible.
 */
function leerCMap(texto) {
  const mapa = new Map();
  const hex = h => parseInt(h, 16);
  const letras = h => {
    let out = '';
    for (let i = 0; i + 3 < h.length + 1; i += 4) {
      const c = parseInt(h.substr(i, 4), 16);
      if (!isNaN(c) && c) out += String.fromCharCode(c);
    }
    return out;
  };

  const bf = /beginbfchar([\s\S]*?)endbfchar/g;
  let m;
  while ((m = bf.exec(texto))) {
    const par = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let p;
    while ((p = par.exec(m[1]))) mapa.set(hex(p[1]), letras(p[2]));
  }

  const br = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = br.exec(texto))) {
    const tri = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([\s\S]*?)\])/g;
    let t;
    while ((t = tri.exec(m[1]))) {
      const desde = hex(t[1]), hasta = hex(t[2]);
      if (t[3]) {
        const base = hex(t[3]);
        for (let c = desde; c <= hasta && c - desde < 65535; c++) {
          mapa.set(c, String.fromCharCode(base + (c - desde)));
        }
      } else if (t[4]) {
        const lista = t[4].match(/<([0-9A-Fa-f]+)>/g) || [];
        lista.forEach((h, i) => mapa.set(desde + i, letras(h.slice(1, -1))));
      }
    }
  }
  return mapa;
}

/**
 * Reúne los pedazos de un renglón en celdas.
 *
 * Los estados que genera el banco escriben campos enteros de una vez. Lo
 * impreso desde el navegador, en cambio, emite UNA LETRA por operador: la
 * fecha "06/07/2026" llega como diez fragmentos. Se vuelven a pegar por
 * cercanía — las letras de una palabra van casi juntas, y entre columna y
 * columna hay un salto mucho mayor.
 *
 * El umbral sale del propio renglón, no de un número fijo, para que aguante
 * cualquier tamaño de letra.
 */
function unirFragmentos(items) {
  if (items.length < 2) return items.map(p => p[1]);

  const largoMedio = items.reduce((s, p) => s + p[1].length, 0) / items.length;
  if (largoMedio > 2.5) return items.map(p => p[1]);   // ya vienen enteros

  const huecos = [];
  for (let i = 1; i < items.length; i++) huecos.push(items[i][0] - items[i - 1][0]);
  const orden = huecos.slice().sort((a, b) => a - b);
  const mediano = orden[orden.length >> 1] || 1;
  // Tres distancias distintas: entre letras de una palabra, entre palabras,
  // y entre columnas. Sin el nivel intermedio "SUPER TDAS PAIZ" saldría
  // pegado y ninguna regla de clasificación lo reconocería.
  const letra = mediano * 1.6;
  const columna = mediano * 4;

  const out = [];
  let actual = items[0][1];
  for (let i = 1; i < items.length; i++) {
    const hueco = items[i][0] - items[i - 1][0];
    if (hueco <= letra) actual += items[i][1];
    else if (hueco <= columna) actual += ' ' + items[i][1];
    else { if (actual.trim()) out.push(actual.trim()); actual = items[i][1]; }
  }
  if (actual.trim()) out.push(actual.trim());
  return out;
}

/** Renglones de texto del PDF, reconstruidos por posición vertical. */
async function renglonesPdf(buffer) {
  const bytes = new Uint8Array(buffer);
  const txt = bin(bytes);
  const clave = clavePdf(txt);
  // Cada flujo es una página y sus coordenadas Y empiezan de nuevo. Si se
  // mezclaran en un solo mapa, la página 2 se entrelazaría con la 1 y el
  // orden de las transacciones —y a quién pertenecen— saldría revuelto.
  const paginas = [];

  // Índice de objetos, para poder saltar de /F9 → fuente → su tabla ToUnicode.
  const objetos = new Map();
  const reObj = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  let o;
  while ((o = reObj.exec(txt))) objetos.set(+o[1], { gen: +o[2], cuerpo: o[3], desde: o.index + o[0].indexOf(o[3]) });

  const flujoDe = async (num) => {
    const ob = objetos.get(num);
    if (!ob) return null;
    const L = ob.cuerpo.match(/\/Length\s+(\d+)/);
    const ini = ob.cuerpo.match(/stream\r?\n/);
    if (!L || !ini) return null;
    const d0 = ob.desde + ini.index + ini[0].length;
    let datos = bytes.slice(d0, d0 + parseInt(L[1], 10));
    if (clave) datos = rc4(claveObjeto(clave, num, ob.gen), datos);
    try { return bin(await inflar(datos)); } catch (e) { return null; }
  };

  // Tabla de traducción por nombre de fuente (/F9, /F10…).
  const tablas = new Map();
  for (const [num, ob] of objetos) {
    const tu = ob.cuerpo.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (!tu) continue;
    const cmap = await flujoDe(+tu[1]);
    if (cmap) tablas.set(num, leerCMap(cmap));
  }
  // /F9 9 0 R  →  la tabla del objeto 9
  const porNombre = new Map();
  (txt.match(/\/Font\s*<<([\s\S]*?)>>/g) || []).forEach(bloque => {
    const re2 = /\/(F\d+)\s+(\d+)\s+0\s+R/g;
    let f;
    while ((f = re2.exec(bloque))) {
      if (tablas.has(+f[2])) porNombre.set(f[1], tablas.get(+f[2]));
    }
  });

  const re = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  let m;
  while ((m = re.exec(txt))) {
    const num = +m[1], gen = +m[2], cuerpo = m[3];
    const largo = cuerpo.match(/\/Length\s+(\d+)/);
    const ini = cuerpo.match(/stream\r?\n/);
    if (!largo || !ini) continue;

    const desde = m.index + m[0].indexOf(cuerpo) + ini.index + ini[0].length;
    let datos = bytes.slice(desde, desde + parseInt(largo[1], 10));
    if (clave) datos = rc4(claveObjeto(clave, num, gen), datos);

    let inf;
    try { inf = await inflar(datos); } catch (e) { continue; }
    const cont = bin(inf);
    if (cont.indexOf('Tj') < 0) continue;

    // Td es relativo y Tm absoluto: hay que soportar los dos. Los estados de
    // BAC usan Td; lo impreso desde el navegador usa Tm en cada línea.
    const filas = new Map();
    let x = 0, y = 0, tabla = null, invertida = false;
    const ops = /BT|\/(F\d+)\s+[\d.]+\s+Tf|([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm|([-\d.]+)\s+([-\d.]+)\s+Td|\(((?:\\.|[^\\)])*)\)\s*Tj|<([0-9A-Fa-f\s]+)>\s*Tj/g;
    let o;
    while ((o = ops.exec(cont))) {
      if (o[0] === 'BT') { x = 0; y = 0; continue; }
      if (o[1]) { tabla = porNombre.get(o[1]) || null; continue; }
      // En Tm los dos últimos números son el desplazamiento; el cuarto dice
      // si el eje vertical va al revés, como en lo impreso desde el navegador.
      if (o[7] != null) { x = parseFloat(o[6]); y = parseFloat(o[7]);
                          if (parseFloat(o[5]) < 0) invertida = true; continue; }
      if (o[9] != null) { x += parseFloat(o[8]); y += parseFloat(o[9]); continue; }

      let s = '';
      if (o[10] != null) {
        s = bin(cadenaPdf('(' + o[10] + ')'));
      } else if (o[11] != null) {
        // Índices de glifo: sin la tabla de la fuente no significan nada.
        const h = o[11].replace(/\s/g, '');
        if (!tabla) continue;
        for (let i = 0; i + 3 < h.length + 1; i += 4) {
          const c = parseInt(h.substr(i, 4), 16);
          s += tabla.has(c) ? tabla.get(c) : '';
        }
      }
      s = s.trim();
      if (!s) continue;
      const fila = Math.round(y);
      if (!filas.has(fila)) filas.set(fila, []);
      filas.get(fila).push([x, s]);
    }
    if (filas.size) paginas.push({ filas, invertida });
  }

  // Con Td la Y sube y hay que leer de mayor a menor; con la matriz invertida
  // del navegador baja, y el orden es el contrario. Se decide por página.
  const out = [];
  paginas.forEach(({ filas, invertida }) => {
    const renglones = Array.from(filas.keys())
      .sort((a, b) => invertida ? a - b : b - a)
      .map(k => unirFragmentos(filas.get(k).sort((a, b) => a[0] - b[0])));
    /* Coser DENTRO de la página y nunca entre páginas: el pie de una y el
       encabezado de la siguiente quedan pegados en el orden, y unirlos
       inventaría un concepto que no existe. */
    out.push(...coserDescripcionesPartidas(renglones));
  });
  return out;
}

/**
 * Devuelve su descripción a los renglones que la perdieron.
 *
 * EL DEFECTO, Y CÓMO SE VEÍA. Cuando la descripción de un movimiento es
 * larga, el banco la parte en varias líneas y deja la fecha y el monto en
 * la de en medio:
 *
 *     PEDIDOS YA RESTAURANTEFRANCISCO
 *     15/08/2026                          459.00 LPS
 *     MO\HND
 *
 * Los fragmentos se agrupan por su coordenada vertical, así que el renglón
 * con la fecha y el monto se queda SIN texto: está arriba y abajo, en otras
 * dos filas. Y sin concepto no hay regla que pueda clasificarlo — dos
 * pedidos por L 619 entraron como «sin clasificar» y el dueño no tenía
 * cómo saber de dónde salían.
 *
 * LA COSTURA ES CONSERVADORA A PROPÓSITO. Solo toca renglones que tienen
 * fecha y monto pero NINGUNA palabra, y solo se lleva vecinos que no
 * tienen ni fecha ni monto —o sea, que no son movimientos—. Un renglón que
 * ya se leía bien no puede salir peor: no entra en el caso.
 */
function coserDescripcionesPartidas(renglones) {
  const FECHA = /\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/;
  const MONTO = /-?[\d,]+\.\d{2}/;

  /* CADA RENGLÓN ES UN ARREGLO DE CELDAS, no una cadena, y confundir las dos
     cosas rompió la importación de PDF en producción con «t.replace is not a
     function». `unirFragmentos` devuelve las columnas por separado a
     propósito: los adaptadores las necesitan así para saber cuál es la fecha
     y cuál el monto. */
  const texto = r => (Array.isArray(r) ? r.join(' ') : String(r || ''));

  /* Lo que queda al quitarle fecha, montos, moneda y puntuación. Si no sobra
     ni una letra, es un movimiento sin descripción. */
  const palabras = r => texto(r)
    .replace(FECHA, ' ')
    .replace(/-?[\d,]+\.\d{2}/g, ' ')
    .replace(/\b(LPS|USD|HNL)\b/gi, ' ')
    .replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '')
    .trim();

  const esMovimiento = r => FECHA.test(texto(r)) && MONTO.test(texto(r));
  const esSoloTexto  = r => !FECHA.test(texto(r)) && !MONTO.test(texto(r)) &&
                            palabras(r).length >= 3;

  const usados = new Set();
  const out = renglones.map((r, i) => {
    if (!esMovimiento(r) || palabras(r).length) return r;
    /* Arriba primero: el banco escribe el principio de la descripción antes
       de la línea del monto, así que unir al revés dejaría el concepto dado
       vuelta — «MO\HND PEDIDOS YA…». */
    const trozos = [];
    if (i > 0 && esSoloTexto(renglones[i - 1]) && !usados.has(i - 1)) {
      trozos.push(...(Array.isArray(renglones[i - 1]) ? renglones[i - 1] : [renglones[i - 1]]));
      usados.add(i - 1);
    }
    if (i + 1 < renglones.length && esSoloTexto(renglones[i + 1]) && !usados.has(i + 1)) {
      trozos.push(...(Array.isArray(renglones[i + 1]) ? renglones[i + 1] : [renglones[i + 1]]));
      usados.add(i + 1);
    }
    if (!trozos.length) return r;
    /* Las celdas de texto se anteponen a las del movimiento: el adaptador
       sigue encontrando la fecha y el monto donde los buscaba, y ahora
       además hay una celda con el concepto. */
    return Array.isArray(r) ? [...trozos, ...r] : [...trozos, r];
  });

  /* Los trozos ya cosidos se van: dejarlos duplicaría el texto y algún
     adaptador podría leerlos como un movimiento más. */
  return out.filter((_, i) => !usados.has(i));
}


/* ============================================================
   3. Lectura del CSV — genérico, para cualquier banco
   ============================================================ */

/** El CSV de Ficohsa viene en ISO-8859-1; el de otros suele ser UTF-8. */
function decodificar(buffer) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  // El carácter de reemplazo delata que no era UTF-8.
  if (utf8.indexOf('�') < 0) return utf8;
  return new TextDecoder('iso-8859-1').decode(buffer);
}

/**
 * Con qué está separado este archivo.
 *
 * La coma no es universal, y en Honduras casi nunca lo es: donde el
 * decimal se escribe con coma, los bancos exportan con punto y coma
 * para no chocar consigo mismos. También aparece el tabulador, que es
 * lo que sale al copiar de Excel.
 *
 * Se decide contando fuera de comillas y quedándose con el que más
 * aparece. Suponer la coma dejaba el archivo entero en UNA columna, y
 * entonces no se encontraba el encabezado y el banco parecía
 * ilegible — cuando el único problema era un punto y coma.
 */
function separadorDe(texto) {
  const muestra = texto.slice(0, 8000);
  let entre = false;
  const cuenta = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  for (const c of muestra) {
    if (c === '"') entre = !entre;
    else if (!entre && c in cuenta) cuenta[c]++;
  }
  return Object.keys(cuenta).reduce((a, b) => cuenta[b] > cuenta[a] ? b : a, ',');
}

function filasCsv(texto, sep) {
  const separador = sep || separadorDe(texto);
  const filas = [];
  let campo = '', fila = [], entre = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entre) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else entre = false; }
      else campo += c;
    } else if (c === '"') entre = true;
    else if (c === separador) { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

const SIN_TILDES = s => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Encuentra la fila de encabezados y a qué corresponde cada columna. */
function mapearColumnas(filas) {
  const PISTAS = {
    fecha:   ['fecha', 'date', 'fec'],
    desc:    ['descripcion', 'concepto', 'detalle', 'referencia', 'description'],
    debito:  ['debito', 'debe', 'cargo', 'retiro', 'debit'],
    credito: ['credito', 'haber', 'abono', 'deposito', 'credit'],
    monto:   ['monto', 'importe', 'valor', 'amount'],
    balance: ['balance', 'saldo']
  };
  for (let i = 0; i < Math.min(filas.length, 40); i++) {
    const f = filas[i].map(SIN_TILDES);
    const mapa = {};
    f.forEach((c, j) => {
      for (const k in PISTAS) {
        if (mapa[k] != null) continue;
        if (PISTAS[k].some(p => c === p || c.startsWith(p + ' ') || c === p + '.')) mapa[k] = j;
      }
    });
    if (mapa.fecha != null && mapa.desc != null &&
        (mapa.debito != null || mapa.credito != null || mapa.monto != null)) {
      return { fila: i, mapa };
    }
  }
  return null;
}

/* ============================================================
   4. Normalización
   ============================================================ */

const numero = s => {
  let t = String(s || '').replace(/[^\d.,-]/g, '');
  /* «1.250,75» y «1,250.75» son el mismo dinero escrito de dos maneras,
     y quitar las comas a ciegas convierte el primero en 1250075 —mil
     veces más— sin dar ningún error. Manda el ÚLTIMO separador: el que
     está más a la derecha es el decimal, porque los miles nunca van al
     final. */
  const coma = t.lastIndexOf(','), punto = t.lastIndexOf('.');
  if (coma > punto) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const v = parseFloat(t);
  return isNaN(v) ? 0 : v;
};

/** dd/mm/aaaa → aaaa-mm-dd */
function fechaIso(s) {
  const m = String(s || '').match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!m) return '';
  let [, d, mes, a] = m;
  if (a.length === 2) a = '20' + a;
  return `${a}-${String(+mes).padStart(2, '0')}-${String(+d).padStart(2, '0')}`;
}

/* ============================================================
   5. Adaptadores por banco
   ============================================================ */

/** Estado de cuenta de BAC (tarjeta de crédito), desde el PDF. */
function adaptadorBac(renglones) {
  const plano = renglones.map(r => r.join(' ')).join('\n');
  // Dos formatos del mismo banco: el estado oficial que sale tras el corte,
  // y la vista de movimientos recientes que se puede sacar cualquier día.
  // Se compara sin espacios ni tildes: según el tamaño de letra, el PDF puede
  // entregar "Banca en Línea" o "BancaenLínea", y no vale jugársela a eso.
  const compacto = SIN_TILDES(plano).replace(/\s+/g, '');
  const oficial = compacto.includes('transaccionesdelperiodo') || compacto.includes('fechadecorte');
  const enLinea = compacto.includes('bancaenlinea') || compacto.includes('saldoenlempiras');
  if (!oficial && !enLinea) return null;

  const producto = (plano.match(/Producto:\s*([\w*-]+)/) || [])[1]
                || (compacto.match(/(\d{4}-\d{2}\*+-\*+-\d{4})/) || [])[1] || '';
  const corte = fechaIso((plano.match(/Fecha de corte:?\s*([\d/]+)/) || [])[1]);
  const limite = fechaIso((plano.match(/Fecha límite:?\s*([\d/]+)/) || [])[1]);
  // El estado dice cuánto se debe al corte. Es la verdad del banco: vale más
  // que cualquier cifra que la app pueda deducir sumando consumos.
  let saldoCorte = numero((plano.match(/Saldo Al Corte\/Local:?\s*([\d.,-]+)/i) || [])[1]);
  if (!saldoCorte) saldoCorte = numero((compacto.match(/saldoenlempiras:?([\d.,-]+)/i) || [])[1]);
  // Si el estado trae el saldo del corte anterior, se puede cuadrar la tarjeta
  // igual que una cuenta. Si no viene, no se inventa: se deja en null y el
  // cuadre simplemente no corre.
  const mAnt = plano.match(/Saldo\s+Anterior[:\s]*([\d.,-]+)/i);
  const saldoAnterior = mAnt ? numero(mAnt[1]) : null;

  const ES_FECHA = /^\d{2}\/\d{2}\/\d{4}$/;
  // La vista en línea pega la moneda al monto: "487.60LPS", "20.00 USD".
  const ES_NUM = /^-?[\d,]+\.\d{2}\s*(LPS|USD)?$/i;
  const esDolar = c => /USD/i.test(c);
  const movs = [];
  let titular = '';

  renglones.forEach(r => {
    if (!r.length) return;
    if (!ES_FECHA.test(r[0])) {
      // Las secciones por tarjetahabiente son un renglón con el nombre; trae
      // además un 0.00 en cada columna de monto, así que hay que ignorarlos.
      const soloTexto = r.filter(c => !ES_NUM.test(c)).join(' ').trim();
      // BAC escribe al tarjetahabiente como NOMBRE/APELLIDO. Exigir la barra
      // descarta los rótulos del pie ("PUNTOS LEMPIRAS FACILES", "TASA DE
      // INTERES ANUAL"), que si no se colaban como si fueran personas.
      if (/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]+\/[A-ZÁÉÍÓÚÑ\s.]{4,}$/.test(soloTexto)) titular = soloTexto;
      return;
    }
    const nums = r.filter(c => ES_NUM.test(c));
    if (!nums.length) return;
    const concepto = r.slice(1).filter(c => !ES_NUM.test(c)).join(' ').trim();
    // En la vista en línea la moneda viene pegada; en el oficial son dos columnas.
    const enLps = nums.filter(c => !esDolar(c));
    const enUsd = nums.filter(esDolar);
    const local = enLps.length ? numero(enLps[0]) : 0;
    const dolares = enUsd.length ? numero(enUsd[0]) : (nums.length > 1 && !enLps.length ? 0 : (oficial && nums.length > 1 ? numero(nums[1]) : 0));
    if (!local && !dolares) return;
    movs.push({
      fecha: fechaIso(r[0]), concepto, titular,
      // En la tarjeta un cargo es positivo y un pago/reverso es negativo.
      monto: local, dolares
    });
  });

  return { banco: 'BAC', tipo: 'tarjeta', cuenta: producto, corte, limite,
           saldoCorte, saldoAnterior, movs };
}

/**
 * "Transacciones del mes" de Ficohsa, desde el PDF.
 *
 * Sale de la banca en línea y es texto normal —ni cifrado ni glifos—, así que
 * lo difícil ya lo hizo renglonesPdf. La tabla es
 *   Fecha | Referencia | Código | Descripción | Débito | Créditos | Balance
 * y en la misma página viene encajado un "Resumen de estado de cuenta" con sus
 * propias filas; se descarta solo, porque esas no empiezan por una fecha.
 */
function adaptadorFicohsa(renglones) {
  const plano = renglones.map(r => r.join(' ')).join('\n');
  const compacto = SIN_TILDES(plano).replace(/\s+/g, '');
  if (!compacto.includes('transaccionesdelmes')) return null;
  if (!compacto.includes('saldoenlibros') && !compacto.includes('balancedelacuenta')) return null;

  const cuenta = (plano.match(/Cuenta:\s*(\d{5,})/) || [])[1] || '';
  const titular = (renglones.find(r => /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.]{8,}$/.test((r[0] || '').trim())) || [])[0] || '';

  const ES_FECHA = /^\d{2}\/\d{2}\/\d{4}$/;
  // Débito, crédito y balance siempre llevan dos decimales; la referencia es un
  // entero pelado. Eso los distingue sin depender de en qué columna caiga cada uno.
  const ES_MONTO = /^-?[\d,]+\.\d{2}$/;

  const movs = [];
  renglones.forEach(r => {
    if (!r.length || !ES_FECHA.test(String(r[0]).trim())) return;
    const montos = r.filter(c => ES_MONTO.test(String(c).trim()));
    if (montos.length < 2) return;

    // Los tres últimos son débito, crédito y balance. Si el banco no imprime el
    // balance, quedan los dos primeros y el saldo se deja en null.
    const tresFinales = montos.slice(-3);
    const conBalance = tresFinales.length === 3;
    const debito  = numero(conBalance ? tresFinales[0] : montos[0]);
    const credito = numero(conBalance ? tresFinales[1] : montos[1]);
    const balance = conBalance ? numero(tresFinales[2]) : null;

    const texto = r.slice(1).filter(c => !ES_MONTO.test(String(c).trim()));
    // El primer trozo suele ser el número de referencia: no dice nada del gasto.
    if (texto.length > 1 && /^\d+$/.test(String(texto[0]).trim())) texto.shift();

    movs.push({
      fecha: fechaIso(r[0]),
      concepto: texto.join(' ').trim(),
      monto: credito - debito,          // + entra, − sale
      balance
    });
  });

  // Ficohsa no imprime el saldo inicial, pero sí el balance después de cada
  // movimiento: el de la primera fila menos su propio efecto es el de partida.
  // Con eso la verificación contra el saldo final vuelve a tener sentido, y si
  // una fila se leyó mal, deja de cuadrar y el archivo no se importa.
  // Bloque "Balance de la cuenta": Moneda | Saldo en libros | Retenidos y
  // diferidos | Saldo disponible. Lo retenido son compras ya hechas que el
  // comercio no ha cobrado: siguen en libros pero ese dinero ya se gastó.
  let retenido = null, disponible = null;
  const iCab = renglones.findIndex(r => r.some(c => /saldo\s*en\s*libros/i.test(String(c))));
  if (iCab >= 0) {
    for (let k = iCab + 1; k < Math.min(iCab + 4, renglones.length); k++) {
      const nums = renglones[k].filter(c => ES_MONTO.test(String(c).trim()));
      if (nums.length >= 3) { retenido = numero(nums[1]); disponible = numero(nums[2]); break; }
    }
  }

  const cent = v => Math.round(v * 100) / 100;
  const primero = movs[0];
  const saldoIni = primero && primero.balance != null ? cent(primero.balance - primero.monto) : null;
  const ultimo = movs.length ? movs[movs.length - 1] : null;
  const saldoFin = ultimo && ultimo.balance != null ? cent(ultimo.balance) : null;

  // El archivo dice qué ventana cubre. Vale más que las fechas del primer y el
  // último movimiento: si un cargo se reversa y desaparece del exportado nuevo,
  // con el rango declarado el viejo sí se borra al reemplazar.
  const declarado = f => fechaIso((plano.match(new RegExp('Fecha ' + f + ':?\\s*([\\d/]+)')) || [])[1]);

  return { banco: 'Ficohsa', tipo: 'cuenta', cuenta, titular, saldoIni, saldoFin, movs,
           retenido, disponible,
           desdeDecl: declarado('desde'), hastaDecl: declarado('hasta') };
}

/** CSV genérico de cuenta bancaria. Sirve para Ficohsa y para cualquier otro. */
function adaptadorCsv(texto) {
  const filas = filasCsv(texto);
  const cab = mapearColumnas(filas);
  if (!cab) return null;

  const plano = filas.slice(0, cab.fila).map(f => f.join(' ')).join('\n');
  // Primero el número que va rotulado, y solo si no hay, la tirada larga de
  // dígitos. Exigir 10 o más dejaba fuera a Ficohsa, cuyas cuentas tienen 9, y
  // el archivo se quedaba sin destino aunque la cuenta estuviera registrada.
  const cuenta = (plano.match(/cuenta\s*(?:no\.?|n[úu]mero)?\s*[:#]?\s*(\d{5,})/i) || [])[1]
              || (plano.match(/\b(\d{10,})\b/) || [])[1] || '';
  const titular = (filas.find(f => f.some(c => /titular/i.test(c))) || [])[0] || '';
  const saldoIni = numero((plano.match(/Saldo inicial:?\s*([\d.,-]+)/i) || [])[1]);
  const saldoFin = numero((filas.map(f => f.join(' ')).join('\n')
                    .match(/Saldo final:?\s*([\d.,-]+)/i) || [])[1]);

  return { banco: 'CSV', tipo: 'cuenta', cuenta, titular, saldoIni, saldoFin,
           movs: movsDeTabla(filas, cab) };
}

/**
 * De una tabla con encabezado a la lista de movimientos.
 *
 * Vive aparte porque lo usan dos caminos: el CSV y el lector genérico
 * de PDF. Son el mismo problema —hay columnas rotuladas y hay que
 * leerlas— y tener dos copias significaría que un banco raro se
 * arregla en una y sigue roto en la otra.
 */
function movsDeTabla(filas, cab) {
  const m = cab.mapa;
  const movs = [];
  for (let i = cab.fila + 1; i < filas.length; i++) {
    const f = filas[i];
    const fecha = fechaIso(f[m.fecha]);
    if (!fecha) continue;
    const deb = m.debito  != null ? numero(f[m.debito])  : 0;
    const cre = m.credito != null ? numero(f[m.credito]) : 0;
    const suelto = m.monto != null ? numero(f[m.monto]) : 0;
    const monto = (deb || cre) ? (cre - deb) : suelto;   // + entra, − sale
    if (!monto) continue;
    movs.push({
      fecha, concepto: String(f[m.desc] || '').trim(), monto,
      balance: m.balance != null ? numero(f[m.balance]) : null
    });
  }
  return movs;
}


/**
 * El lector de PDF que NO adivina columnas: se guía por el saldo.
 *
 * EL PROBLEMA QUE RESUELVE. Los bancos dan CSV de los meses cerrados,
 * pero del mes EN CURSO —el único que sirve para controlar el gasto
 * mientras pasa— solo dan una impresión en PDF. Así que el PDF no es
 * el camino secundario: es el principal.
 *
 * POR QUÉ NO SE LEEN LAS COLUMNAS. El texto de un PDF pierde la
 * estructura de la tabla: cuando una celda va vacía DESAPARECE y las
 * de la derecha se corren. Un lector por columnas leía el saldo como
 * si fuera el crédito —L 8,749.25 donde iban −1,250.75— sin dar
 * ningún error. Está medido, y tiene su prueba abajo.
 *
 * LO QUE SÍ ES DE FIAR: EL SALDO QUE ARRASTRA. Casi todo estado de
 * cuenta cierra cada renglón con el saldo después del movimiento. Y
 * entonces el movimiento no hay que adivinarlo:
 *
 *     monto = saldo de este renglón − saldo del anterior
 *
 * Eso es exacto, y el SIGNO viene solo. Sirve igual para una cuenta
 * —donde un cargo baja el saldo— y para una tarjeta —donde un cargo
 * sube lo que se debe—, porque en los dos casos se está leyendo el
 * movimiento del número del banco en sus propios términos, que es
 * justo la convención que el núcleo espera.
 *
 * Y SE COMPRUEBA SOLO. La diferencia entre dos saldos tiene que
 * coincidir con alguno de los otros números del renglón: es el mismo
 * dato dicho dos veces por el banco. Si no coinciden, la lectura está
 * mal y el archivo se rechaza entero. Un lector que se equivoca en
 * silencio es peor que no tener lector.
 */
function adaptadorSaldos(renglones) {
  /* CON DOS DECIMALES, y eso no es un detalle. Aceptando cualquier
     tirada de dígitos, el renglón «Límite de crédito 50,000.00 Fecha
     de corte 06/08/2026» entraba como si fuera un movimiento —tiene
     fecha y tiene números— y el 2026 se leía como saldo. A partir de
     ahí la cadena de saldos se iba entera. El dinero se escribe con
     centavos; los años y los números de cuenta, no. */
  const NUM = /-?\d[\d.,]*[.,]\d{2}(?!\d)/g;
  const plano = renglones.join('\n');

  const lineas = [];
  for (const r of renglones) {
    const t = String(r);
    const fecha = fechaIso(t);
    // La fecha se quita antes de buscar cifras: «05/08/2026» no es dinero.
    const sinFecha = t.replace(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/g, ' ');
    const nums = (sinFecha.match(NUM) || []).map(numero);
    // Hace falta al menos el monto y el saldo. Con uno solo no hay
    // contra qué comprobar, y comprobar es todo el método.
    if (fecha && nums.length >= 2) {
      lineas.push({ fecha, nums, texto: t });
    }
  }
  if (lineas.length < 3) return null;

  /* El saldo de arranque. Muchos estados lo imprimen como un renglón
     aparte, sin fecha: "SALDO ANTERIOR   12,340.50". Si no está, el
     primer movimiento no se puede determinar —su signo es genuinamente
     desconocido— y se dice, en vez de inventarle uno. */
  const mIni = plano.match(/saldo\s+(?:anterior|inicial)[^\d-]*(-?[\d.,]+\d)/i);
  let previo = mIni ? numero(mIni[1]) : null;

  const movs = [];
  let comprobados = 0, fallidos = 0, sinPrimero = false;

  for (const l of lineas) {
    const saldo = l.nums[l.nums.length - 1];
    const otros = l.nums.slice(0, -1);

    if (previo == null) {
      // Sin saldo previo no hay diferencia que calcular. Se anota y se
      // sigue: los demás renglones sí se pueden leer.
      previo = saldo;
      sinPrimero = true;
      continue;
    }

    const monto = Math.round((saldo - previo) * 100) / 100;
    previo = saldo;
    if (!monto) continue;

    // El banco dijo lo mismo dos veces: la diferencia de saldos tiene
    // que aparecer como número en el renglón.
    if (otros.some(n => Math.abs(Math.abs(n) - Math.abs(monto)) < 0.011)) comprobados++;
    else fallidos++;

    movs.push({ fecha: l.fecha, concepto: conceptoDe(l.texto), monto, balance: saldo });
  }

  /* Si más de uno de cada diez renglones no cuadra consigo mismo, la
     lectura está mal. No se entrega «casi bien»: con dinero, casi bien
     es mal. */
  if (!movs.length || fallidos > Math.max(1, (comprobados + fallidos) * 0.1)) return null;

  const cuenta = (plano.match(/cuenta\s*(?:no\.?|n[úu]mero)?\s*[:#]?\s*([\d*-]{5,})/i) || [])[1]
              || (plano.match(/(\d{4}-\d{2}\*+-\*+-\d{4})/) || [])[1]
              || (plano.match(/\b(\d{9,})\b/) || [])[1] || '';

  // Cuenta o tarjeta cambia a qué se puede archivar y cómo se clasifica.
  // Si el documento no lo dice claro, no se supone: lo pregunta la pantalla.
  const c = SIN_TILDES(plano);
  /* Las señales tienen que ser INEQUÍVOCAS. Un «crédito» suelto no
     dice nada: es el rótulo de una columna en cualquier estado de
     cuenta corriente, y tomarlo por tarjeta hacía que el tipo saliera
     ambiguo justo en el caso más común. */
  const esTarjeta = /tarjeta de credito|limite de credito|fecha de corte|saldo al corte|pago minimo/.test(c);
  const esCuenta  = /cuenta de ahorro|cuenta corriente|cuenta de cheques|saldo disponible/.test(c);
  const tipo = esTarjeta && !esCuenta ? 'tarjeta' : (esCuenta && !esTarjeta ? 'cuenta' : null);

  return {
    banco: 'Genérico', tipo, cuenta, titular: '',
    saldoIni: mIni ? numero(mIni[1]) : null,
    saldoFin: movs.length ? movs[movs.length - 1].balance : null,
    movs,
    // Para que la pantalla lo pueda decir en voz alta.
    lectura: { metodo: 'saldos', comprobados, sinPrimero }
  };
}

/** El texto del renglón sin fechas ni cifras: lo que queda es el concepto. */
const conceptoDe = t => String(t)
  .replace(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/g, ' ')
  .replace(/-?[\d.,]+\d/g, ' ')
  .replace(/\s{2,}/g, ' ').trim().slice(0, 80);

/* ============================================================
   6. Clasificación
   ============================================================ */

const TIPOS = {
  gasto:    'Gasto',
  ingreso:  'Ingreso',
  traslado: 'Traslado propio',
  pagoTarjeta: 'Pago de tarjeta',
  retiro:   'Retiro de efectivo',
  comision: 'Comisión',
  cuota:    'Cuota de financiamiento',
  reverso:  'Reverso o ajuste'
};

/**
 * ¿Este cargo de la cuenta es el pago de una tarjeta registrada?
 *
 * El banco escribe "PAGO 5140-00**-****-894" y encima lo recorta, así que los
 * últimos cuatro dígitos no siempre llegan enteros. Se compara con los cuatro
 * primeros y con los cuatro últimos del número que tengan guardado, y basta con
 * que uno coincida. También vale el patrón enmascarado suelto, para el caso de
 * una tarjeta que aún no han registrado con su número.
 */
function esPagoDeTarjeta(t, D) {
  if (!/\bpago\b/.test(t)) return false;
  if (/\d{4}-\d{2}\*+/.test(t)) return true;
  const trozos = t.match(/\d{4}/g) || [];
  if (!trozos.length) return false;
  return (D.tarjetas || []).some(tj => {
    const n = String(tj.numero || '').replace(/\D/g, '');
    if (n.length < 4) return false;
    return trozos.some(x => x === n.slice(0, 4) || x === n.slice(-4));
  });
}

/**
 * ¿La plata se queda en el hogar?
 *
 * SE MIRA EL DESTINO, NO LA LÍNEA ENTERA, Y ESA ES TODA LA CORRECCIÓN.
 *
 * Antes se buscaba si el nombre de alguien del hogar aparecía en cualquier
 * parte del concepto. Pero un renglón de banco se escribe
 * «Transferencia entre Cuentas-ORIGEN-DESTINO», y el ORIGEN es siempre el
 * titular de la cuenta que uno acaba de importar — o sea, siempre alguien
 * del hogar. La comprobación no podía dar «no» nunca: TODA transferencia
 * salía como traslado propio.
 *
 * Se midió con archivos reales: L 900 a una hermana y L 2,060 a otros dos
 * terceros quedaron marcados como «la misma plata cambiando de bolsillo» y
 * no se registraron. Casi tres mil lempiras que salieron de verdad y que la
 * app no vio. Y peor: un ACH de L 1,200 a un tercero se registró como PAGO
 * DE TARJETA, porque esa regla también preguntaba `propio`.
 *
 * NOMBRE DE PILA Y UN APELLIDO, NO DOS APELLIDOS. La comprobación vieja
 * pedía dos coincidencias cualesquiera, y en una familia los apellidos se
 * repiten: «Katherine Alejandra Vallejos Aguilera» daba dos contra «Judith
 * Maryorie Vallejos Aguilera» y pasaba por la misma persona. El nombre de
 * pila es lo que de verdad distingue a un hermano de un cónyuge.
 */
function vaAlHogar(concepto, D) {
  const destino = destinoDelRenglon(concepto);
  if (!destino) return false;
  return (D.personas || []).map(p => SIN_TILDES(p.nombre || '')).filter(Boolean).some(n => {
    const partes = n.split(/\s+/).filter(x => x.length > 2);
    if (partes.length < 2) return false;
    const [pila, ...resto] = partes;
    return destino.includes(pila) && resto.some(x => destino.includes(x));
  });
}

/**
 * A quién va el renglón. El banco escribe el destino al final, después del
 * último guion: «Transferencia entre Cuentas-JUDITH …-KATHERINE …» y
 * «ACH Debito-Daniel Josue Vallejos Aguilera».
 *
 * Si el renglón no tiene esa forma no hay destino que mirar, y entonces no
 * se puede afirmar que la plata se queda en casa.
 */
function destinoDelRenglon(t) {
  if (!/transferencia entre cuentas|ach debito/.test(t)) return '';
  const partes = t.split('-').map(x => x.trim()).filter(Boolean);
  return partes.length >= 2 ? partes[partes.length - 1] : '';
}

/**
 * Decide qué es cada movimiento. Lo delicado son los traslados: una
 * transferencia a la esposa NO es ingreso ni gasto —es la misma plata
 * cambiando de bolsillo— pero una a un tercero sí sale de verdad.
 * Se distinguen comparando el DESTINO contra las personas registradas.
 */
function clasificar(mov, D, lote) {
  const t = SIN_TILDES(mov.concepto);
  const propio = vaAlHogar(t, D);

  if (/reverso|^cr\s|credito por intereses/.test(t)) return 'reverso';
  if (/comision/.test(t)) return 'comision';
  if (/cuota:\s*\d+\/\d+|minicuota|membresia diferida/.test(t)) return 'cuota';
  if (/retiro de efectivo|cajero|atm/.test(t)) return 'retiro';
  if (/pago recibido|su pago recibido/.test(t)) return 'pagoTarjeta';

  if (lote.tipo === 'cuenta') {
    // "PAGO 5140-00**-****-894" es saldar la tarjeta, no una compra. Sin esto
    // entraba como gasto y se contaba dos veces todo lo de la tarjeta: una por
    // cada consumo del estado de cuenta y otra por el giro que los paga.
    if (mov.monto < 0 && esPagoDeTarjeta(t, D)) return 'pagoTarjeta';
    if (/pago de planilla|deposito de efectivo|nomina|salario/.test(t) && mov.monto > 0) return 'ingreso';
    // Un ACH grande a nombre propio suele ser el giro que paga la tarjeta.
    if (/ach debito/.test(t) && propio && mov.monto < 0) return 'pagoTarjeta';
    if (/transferencia entre cuentas/.test(t)) return propio ? 'traslado' : (mov.monto > 0 ? 'ingreso' : 'gasto');
    if (/seguro|ppt /.test(t)) return 'gasto';
    if (mov.monto > 0) return 'ingreso';
    return 'gasto';
  }

  // Tarjeta: lo positivo es consumo, lo negativo es pago o reverso.
  return mov.monto > 0 ? 'gasto' : 'pagoTarjeta';
}

/* ============================================================
   7. Verificación
   ============================================================ */

/**
 * El saldo tiene que cuadrar al céntimo. Si no cuadra, el parseo está
 * mal y hay que decirlo en vez de guardar basura.
 */
/**
 * Cuadre de una TARJETA: saldo anterior + consumos − pagos = saldo al corte.
 * Solo corre si el estado trae el saldo anterior; sin ese dato prefiero no
 * decir nada a dar por bueno un cuadre que en realidad no se hizo.
 */
function verificarTarjeta(lote) {
  if (lote.tipo !== 'tarjeta' || lote.saldoAnterior == null || lote.saldoCorte == null) return null;
  // En la tarjeta un cargo es positivo y un pago negativo, así que la suma ya
  // lleva el signo correcto para arrastrar el saldo.
  const suma = lote.movs.reduce((s, m) => s + m.monto, 0);
  const esperado = Math.round((lote.saldoAnterior + suma) * 100) / 100 + 0;
  const dif = Math.round((esperado - lote.saldoCorte) * 100) / 100;
  return {
    saldoIni: lote.saldoAnterior, suma, esperado, saldoFin: lote.saldoCorte,
    diferencia: dif, cuadra: Math.abs(dif) < 0.01
  };
}

/**
 * Compara el archivo del banco contra lo que ya hay registrado en la app, en
 * la misma ventana y para el mismo destino. Sirve para encontrar lo que se
 * anotó a mano y el banco no tiene (o al revés) ANTES de importar, que es
 * cuando todavía se puede arreglar sin pelearse con los duplicados.
 *
 * El emparejamiento va por fecha y monto, no por concepto: el banco recorta y
 * reescribe las descripciones, pero la fecha y el monto no mienten.
 */
function conciliarConApp(D, lote, destino) {
  if (!destino) return null;
  const ref = destino.clase + ':' + destino.id;
  const dentro = x => x.fecha >= lote.desde && x.fecha <= lote.hasta;

  // Lo que la app ya tiene para ese destino en esa ventana, venga de donde venga.
  const enApp = [];
  (D.movimientos || []).filter(m => dentro(m) &&
      (destino.clase === 'tarjeta' ? m.tarjetaId === destino.id : m.fuente === ref))
    .forEach(m => enApp.push({ fecha: m.fecha, monto: Math.abs(numero(m.monto)),
                               concepto: m.concepto || '', manual: m.origen !== 'import' }));
  (D.retiros || []).filter(r => dentro(r) && (r.cuentaId === destino.id || r.fuente === ref))
    .forEach(r => enApp.push({ fecha: r.fecha, monto: Math.abs(numero(r.monto)),
                               concepto: r.nota || 'Retiro', manual: r.origen !== 'import' }));
  (D.pagosTarjeta || []).filter(x => dentro(x) &&
      (x.tarjetaId === destino.id || x.cuentaId === destino.id || x.fuente === ref))
    .forEach(x => enApp.push({ fecha: x.fecha, monto: Math.abs(numero(x.monto)),
                               concepto: x.nota || 'Pago de tarjeta', manual: x.origen !== 'import' }));

  const delBanco = lote.movs.map(m => ({ fecha: m.fecha, monto: Math.round(Math.abs(m.monto) * 100) / 100,
                                         concepto: m.concepto, tipo: m.tipo }));

  const libres = enApp.map(x => Object.assign({ usado: false }, x,
    { monto: Math.round(x.monto * 100) / 100 }));
  const soloBanco = [];
  delBanco.forEach(b => {
    const par = libres.find(a => !a.usado && a.fecha === b.fecha && Math.abs(a.monto - b.monto) < 0.01);
    if (par) par.usado = true; else soloBanco.push(b);
  });
  const soloApp = libres.filter(a => !a.usado);

  const suma = arr => Math.round(arr.reduce((s, x) => s + x.monto, 0) * 100) / 100;
  return {
    soloBanco, soloApp,
    totalBanco: suma(delBanco), totalApp: suma(libres),
    diferencia: Math.round((suma(delBanco) - suma(libres)) * 100) / 100,
    cuadra: soloBanco.length === 0 && soloApp.length === 0
  };
}

function verificar(lote) {
  // Ojo con `!lote.saldoFin`: una cuenta que queda EXACTAMENTE en cero —lo normal
  // cuando se vacía para pagar la tarjeta— daba falsy y se saltaba la
  // comprobación entera, justo en el archivo que más falta hacía cuadrar.
  if (lote.tipo !== 'cuenta' || lote.saldoIni == null || lote.saldoFin == null) return null;
  const suma = lote.movs.reduce((s, m) => s + m.monto, 0);
  // Redondeado a centavos: sumar decimales binarios deja restos de 1e-13 que
  // se imprimían como "L -0.00" en la pantalla de revisión.
  const esperado = Math.round((lote.saldoIni + suma) * 100) / 100 + 0;
  const dif = Math.round((esperado - lote.saldoFin) * 100) / 100;
  return {
    saldoIni: lote.saldoIni, suma, esperado, saldoFin: lote.saldoFin,
    diferencia: dif, cuadra: Math.abs(dif) < 0.01
  };
}

/* ============================================================
   8. Entrada principal
   ============================================================ */

async function leerArchivo(archivo, D) {
  const buf = await archivo.arrayBuffer();
  const esPdf = /\.pdf$/i.test(archivo.nombre || archivo.name || '') ||
                bin(new Uint8Array(buf.slice(0, 5))) === '%PDF-';

  let lote = null;
  if (esPdf) {
    const rs = await renglonesPdf(buf);
    lote = adaptadorBac(rs) || adaptadorFicohsa(rs) || adaptadorSaldos(rs);
    if (!lote) {
      /* No se intenta leer un PDF desconocido a la brava. El texto de
         un PDF pierde la estructura de columnas: cuando una celda va
         vacía DESAPARECE y las de la derecha se corren, así que el
         saldo se lee como si fuera el crédito. Está medido. Un número
         creíble y falso es peor que no leer el archivo, y el CSV o
         Excel del mismo banco sí conserva las columnas vacías. */
      /* Se dice QUÉ hace falta, no solo que no se pudo. Un PDF sirve
         si trae, renglón por renglón, la fecha, el concepto y el saldo
         que queda después del movimiento: de ahí sale todo lo demás.
         Una impresión de pantalla o un resumen sin saldos no alcanza,
         por mucho que sea del banco. */
      throw new Error(
        'No encuentro movimientos en ese PDF. Para poder leerlo hace falta que cada ' +
        'renglón traiga la fecha, el concepto y el SALDO que queda después — así se ' +
        'saca el monto sin adivinar. Si es un resumen o una impresión de pantalla, no ' +
        'alcanza. Probá con el estado de cuenta completo, o con el CSV.');
    }
  } else {
    lote = adaptadorCsv(decodificar(buf));
    if (!lote) throw new Error('No encuentro las columnas de fecha, descripción y monto en ese archivo.');
  }

  lote.archivo = archivo.name || archivo.nombre || '';
  lote.movs.forEach(m => { m.tipo = clasificar(m, D, lote); });
  lote.desde = lote.desdeDecl || lote.movs.reduce((a, m) => !a || m.fecha < a ? m.fecha : a, '');
  lote.hasta = lote.hastaDecl || lote.movs.reduce((a, m) => m.fecha > a ? m.fecha : a, '');
  lote.control = verificar(lote) || verificarTarjeta(lote);
  lote.resumen = Object.keys(TIPOS).reduce((a, k) => {
    const f = lote.movs.filter(m => m.tipo === k);
    if (f.length) a[k] = { n: f.length, total: f.reduce((s, m) => s + Math.abs(m.monto), 0) };
    return a;
  }, {});
  return lote;
}

/* ============================================================
   9. Aplicar un lote al documento
   ============================================================ */

/** Clave estable de un comercio, para poder recordar su categoría. */
function claveComercio(concepto) {
  return SIN_TILDES(concepto)
    .replace(/\d{2}:\d{2}.*$/, '')      // hora al final
    .replace(/[\\/].*$/, '')            // sucursal tras la barra
    .replace(/\s+\d+$/, '')             // número de tienda
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 24);
}

/* ============================================================
   Clasificación automática de comercios
   ============================================================ */

/**
 * Reglas por palabra clave, escritas sobre comercios reales de Honduras.
 * Cada una dice a qué rubro va y en qué categoría vive ese rubro.
 *
 * El orden importa: la primera que coincide gana. Las más específicas van
 * arriba, porque "FERRETERIA HERCO" debe ganarle a cualquier regla genérica.
 *
 * Lo que no reconoce queda en "Otros" a la vista, no escondido: es preferible
 * un rubro honesto y visible a una categoría inventada que nadie revisa.
 */
const REGLAS = [
  // --- suscripciones y cargos automáticos ---
  [/\bapple\b|itunes|microsoft|anthropic|canva|prezi|paypal|netflix|spotify|google|adobe/, 'Suscripciones', 'Servicios'],
  [/seguro de hre|seguro de vida|db seguro/, 'Seguros', 'Servicios'],
  [/membresia diferida|comision|ppt basico|mantenimiento de cuenta/, 'Comisiones bancarias', 'Servicios'],
  [/claro|tigo|hondutel|internet|cable/, 'Telefonía e internet', 'Servicios'],

  // --- salud ---
  [/farmacia|farmacias|kielsa|siman choluteca \d/, 'Farmacia', 'Salud'],
  [/clinica|dental|\bdr\b|doctor|laboratorio|\blab\b|analiza|linfa|hospital|medico|piel sana|optica|semehsur|patologia|imagenes|rayos/, 'Consultas médicas', 'Salud'],
  [/smartfit|smart fit|gimnasio|gym/, 'Gimnasio', 'Salud'],

  // --- transporte ---
  [/puma|uno choluteca|uno miramontes|gasolinera|estacion miramonte|texaco|shell|petro|combustible/, 'Combustible', 'Transporte'],
  [/repuestos|yonker|american parts|llantas|taller|lubricentro|autopartes/, 'Vehículo', 'Transporte'],

  // --- alimentación ---
  [/paiz|la colonia|supermercado|lady lee|mega fardos|la bodega|despensa|carbajal|mercadito|americana lee|tienda lee/, 'Supermercado', 'Alimentación'],
  [/pedidos ya|pupuser|papa john|kfc|pollo|burger|pizza|comedor|restaurante|barbacoa|colada|bakery|panaderia|cafe|chorizos|mey ko|tasty|bbq|pollisimo|frutiki|asador|grill|parrillada|carnitas|matambr|applebee|ihop|waffl|pozol|casa roble|taqueria|marisco|ceviche|sushi|antojitos|heladeria|donut|sandwich|\bfood\b|ternero|mendels|bip bip|denny|dennis|pizza hut|wendy|subway|domicilio|delivery|espresso|baleada|asados|china|buffet|\btaco|campero|espress|jugueria|licuado|refresqueria|merendero|grano de oro|granodeoro|cafeteria|fressco|starmart|star mart/, 'Comida fuera', 'Alimentación'],

  // --- hogar ---
  [/ferreteria|herco|dicalsa|friopartes|el compadre|construccion|pintura/, 'Ferretería y reparaciones', 'Hogar'],
  [/curacao|radio shack|electronica|almacen|electrodomestic|muebles|la mundial|jetstereo|titan|baquedano|elements|decoracion/, 'Muebles y electrodomésticos', 'Hogar'],

  // --- otros ---
  [/payless|adoc|lili pink|sport line|sportline|bombos|pacer|zapateria|boutique|ropa|gaco kids|kids|beauty|salon|barberia|estetica|dkache|magus|aca joe|carrion|siman(?! choluteca)/, 'Ropa y cuidado personal', 'Otros'],
  [/materno|bebe|pañal|panal|infantil|maternidad/, 'Bebé y niños', 'Otros'],
  [/glodisa|globos|regalo|fiesta|pinata|juguete|celebra|fantasias|variedades/, 'Regalos y celebraciones', 'Otros'],
  [/unicines|cinema|aqua tours|eventos|hotel|tours|villa de jerez/, 'Entretenimiento', 'Otros'],
  [/municipalidad|alcaldia|impuesto|tasa|dei|sar\b/, 'Impuestos y trámites', 'Servicios'],
  [/\buth\b|universidad|colegio|matricula|escolar|educa/, 'Educación', 'Otros'],
  [/copy max|libreria|papeleria|acosa|steren|tecnologia|computacion|informatica/, 'Tecnología y papelería', 'Otros']
];

// Según el tamaño de letra, un PDF puede entregar "SUPER TDAS PAIZ" o
// "SUPERTDASPAIZ". Se prueba con las dos formas para no depender de eso.
const REGLAS_PEGADAS = REGLAS.map(([re, rubro, cat]) =>
  [new RegExp(re.source.replace(/ /g, ''), re.flags), rubro, cat]);

/** Devuelve { rubro, categoria } o null si ninguna regla reconoce el comercio. */
function reglaDe(concepto) {
  const t = SIN_TILDES(concepto);
  for (const [re, rubro, categoria] of REGLAS) {
    if (re.test(t)) return { rubro, categoria };
  }
  const pegado = t.replace(/\s+/g, '');
  for (const [re, rubro, categoria] of REGLAS_PEGADAS) {
    if (re.test(pegado)) return { rubro, categoria };
  }
  return null;
}

/**
 * Clasifica solo, creando el rubro si hace falta. Así una importación deja
 * todo repartido sin pedirle nada al usuario; lo que no reconoce queda en
 * "Otros" y se corrige desde la pantalla de comercios, una vez por comercio.
 */
function rubroPara(concepto, D, ayuda) {
  const clave = claveComercio(concepto);
  const recordado = D.comercios && D.comercios[clave];
  // Se comprueba que el rubro recordado siga existiendo: si se borró en el
  // otro teléfono, apuntar ahí dejaría el gasto fuera del plan contra realidad
  // pero sumando en el total, y el mes no cuadraría.
  if (recordado && (D.gastos || []).some(g => g.id === recordado)) return recordado;

  const r = reglaDe(concepto);
  if (!r) return 'otros';

  let g = (D.gastos || []).find(x => SIN_TILDES(x.concepto) === SIN_TILDES(r.rubro));
  if (!g) {
    g = { id: ayuda.uid(), concepto: r.rubro, monto: 0, categoria: r.categoria,
          medioPago: 'tarjeta', crecimiento: 0, tarjetaId: null, _upd: ayuda.now() };
    D.gastos.push(g);
  }
  D.comercios = D.comercios || {};
  D.comercios[clave] = g.id;
  return g.id;
}

/** A qué cuenta o tarjeta registrada corresponde este archivo. */
function destinoDe(lote, D) {
  const limpio = s => String(s || '').replace(/\D/g, '');
  const n = limpio(lote.cuenta);
  if (!n) return null;
  const coincide = x => {
    const m = limpio(x.numero);
    if (!m || !n) return false;
    // BAC enmascara el medio: se comparan los últimos cuatro.
    return m === n || m.slice(-4) === n.slice(-4);
  };
  if (lote.tipo === 'tarjeta') {
    const t = (D.tarjetas || []).find(coincide);
    return t ? { clase: 'tarjeta', id: t.id, nombre: t.nombre } : null;
  }
  const c = (D.cuentas || []).find(coincide);
  return c ? { clase: 'cuenta', id: c.id, nombre: c.nombre } : null;
}

/**
 * Vuelca el lote sobre el documento.
 *
 * Primero borra TODO lo que se había importado antes para ese mismo destino
 * dentro del mismo rango de fechas, y después inserta lo del archivo. Así el
 * exportado nuevo, que ya contiene las semanas anteriores, no duplica nada; y
 * un cargo que el banco reversó desaparece porque simplemente ya no viene.
 *
 * Lo anotado a mano no se toca: solo se reemplaza lo que tiene origen 'import'.
 */
function aplicarLote(D, lote, destino, ayuda) {
  const { uid, now } = ayuda;
  const ref = destino.clase + ':' + destino.id;
  const borrados = [];

  ['movimientos', 'retiros', 'pagosTarjeta'].forEach(col => {
    D[col] = (D[col] || []).filter(x => {
      const suyo = x.origen === 'import' && x.fuente === ref &&
                   x.fecha >= lote.desde && x.fecha <= lote.hasta;
      if (suyo) borrados.push(x.id);
      return !suyo;
    });
  });
  D._borrados = D._borrados || {};
  borrados.forEach(id => { D._borrados[id] = now(); });

  D.comercios = D.comercios || {};
  const persona = nombre => {
    if (!nombre) return null;
    const t = SIN_TILDES(nombre).replace(/\//g, ' ');
    const p = (D.personas || []).find(x => {
      const partes = SIN_TILDES(x.nombre).split(/\s+/).filter(w => w.length > 2);
      return partes.length >= 2 && partes.filter(w => t.includes(w)).length >= 2;
    });
    return p ? p.id : null;
  };

  const base = m => ({
    id: uid(), origen: 'import', fuente: ref, lote: lote.archivo,
    fecha: m.fecha, periodo: ayuda.periodoDe(m.fecha), _upd: now()
  });

  // El banco manda sobre el saldo. Antes se tecleaba a mano y se desfasaba;
  // ahora cada importación lo pone al día solo, con la fecha de corte.
  const destinoObj = destino.clase === 'cuenta'
    ? (D.cuentas || []).find(c => c.id === destino.id)
    : (D.tarjetas || []).find(t => t.id === destino.id);
  if (destinoObj) {
    if (destino.clase === 'cuenta' && lote.saldoFin != null && lote.hasta) {
      destinoObj.saldoBanco = { monto: lote.saldoFin, fecha: lote.hasta };
      destinoObj._upd = now();
    }
    // Lo retenido caduca solo: en cuanto el comercio cobra, deja de estar
    // retenido y aparece como movimiento. Por eso se pisa con lo que diga el
    // archivo más reciente, incluido el cero — si no, un retenido viejo se
    // quedaría descontando para siempre un gasto que ya se contó dos veces.
    if (destino.clase === 'cuenta' && lote.retenido != null) {
      destinoObj.retenido = { monto: lote.retenido, fecha: lote.hasta || lote.desde };
      destinoObj._upd = now();
    }
    // La vista semanal no trae fecha de corte, pero sí el saldo de hoy: vale
    // la fecha del último movimiento. Solo se pisa si es más reciente.
    const fechaSaldo = lote.corte || lote.hasta;
    if (destino.clase === 'tarjeta' && lote.saldoCorte != null && fechaSaldo) {
      const previo = destinoObj.saldoBanco;
      if (!previo || !previo.fecha || fechaSaldo >= previo.fecha) {
        destinoObj.saldoBanco = { monto: lote.saldoCorte, fecha: fechaSaldo };
        destinoObj._upd = now();
      }
    }
  }

  const cuenta = { gastos: 0, retiros: 0, pagos: 0, omitidos: 0, sinCategoria: 0 };

  lote.movs.forEach(m => {
    const pid = persona(m.titular) || (D.personas[0] || {}).id || null;

    if (m.tipo === 'gasto' || m.tipo === 'comision') {
      const cat = rubroPara(m.concepto, D, ayuda);
      if (cat === 'otros') cuenta.sinCategoria++;
      D.movimientos.push(Object.assign(base(m), {
        gastoId: cat, monto: Math.abs(m.monto), personaId: pid,
        medioPago: 'tarjeta',
        tarjetaId: destino.clase === 'tarjeta' ? destino.id : (ayuda.debitoDe(destino.id) || null),
        concepto: m.concepto.slice(0, 80)
      }));
      cuenta.gastos++;
      return;
    }

    if (m.tipo === 'retiro') {
      D.retiros.push(Object.assign(base(m), {
        monto: Math.abs(m.monto), personaId: pid,
        cuentaId: destino.clase === 'cuenta' ? destino.id : null,
        nota: m.concepto.slice(0, 80)
      }));
      cuenta.retiros++;
      return;
    }

    if (m.tipo === 'pagoTarjeta' && destino.clase === 'cuenta') {
      // Desde la cuenta sí es una salida real de dinero. Visto desde la
      // tarjeta es el mismo pago, y registrarlo dos veces lo duplicaría.
      D.pagosTarjeta.push(Object.assign(base(m), {
        monto: Math.abs(m.monto), cuentaId: destino.id,
        tarjetaId: (ayuda.tarjetaCredito() || {}).id || null,
        nota: m.concepto.slice(0, 80)
      }));
      cuenta.pagos++;
      return;
    }

    cuenta.omitidos++;   // traslados propios, cuotas, reversos e ingresos
  });

  return cuenta;
}

export {
  leerArchivo, aplicarLote, destinoDe, claveComercio, reglaDe, rubroPara, REGLAS, TIPOS,
  verificarTarjeta, conciliarConApp,
  // expuestos para las pruebas
  md5, rc4, filasCsv, mapearColumnas, decodificar, fechaIso, numero,
  adaptadorBac, adaptadorCsv, adaptadorFicohsa, adaptadorSaldos,
  esPagoDeTarjeta, clasificar, verificar, renglonesPdf, coserDescripcionesPartidas
};
