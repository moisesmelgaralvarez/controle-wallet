/* ============================================================
   Facturas — capturar la foto, guardarla y mandarla a leer.

   La clave de la IA NO vive aquí. El teléfono manda la imagen a
   una Edge Function de Supabase que sí tiene servidor y guarda el
   secreto; una clave metida en esta app sería pública para
   cualquiera que abra el código.

   Las fotos se guardan en IndexedDB (localStorage no aguanta:
   tope de ~5 MB, y una factura pesa cientos de kB). Se quedan en
   el teléfono que las tomó; no se sincronizan.
   ============================================================ */
(function () {
'use strict';

const BD = 'presupuesto.facturas';
const ALMACEN = 'facturas';

// La API no gana nada por encima de 2576 px de lado largo, así que
// reducir hasta ahí no pierde información: solo evita subir 12 MP.
const LADO_MAX = 2576;
const CALIDAD = 0.85;

/* ---------- almacenamiento ---------- */

let _bd = null;
function abrir() {
  if (_bd) return Promise.resolve(_bd);
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('Este navegador no guarda fotos.'));
    const p = indexedDB.open(BD, 1);
    p.onupgradeneeded = () => {
      if (!p.result.objectStoreNames.contains(ALMACEN)) {
        p.result.createObjectStore(ALMACEN, { keyPath: 'id' });
      }
    };
    p.onsuccess = () => { _bd = p.result; res(_bd); };
    p.onerror = () => rej(p.error || new Error('No se pudo abrir el almacén de fotos.'));
  });
}

function tx(modo, fn) {
  return abrir().then(bd => new Promise((res, rej) => {
    const t = bd.transaction(ALMACEN, modo);
    const pedido = fn(t.objectStore(ALMACEN));
    t.oncomplete = () => res(pedido ? pedido.result : undefined);
    t.onerror = () => rej(t.error);
  }));
}

const guardar  = reg => tx('readwrite', s => s.put(reg));
const obtener  = id  => tx('readonly',  s => s.get(id));
const borrar   = id  => tx('readwrite', s => s.delete(id));
const todas    = ()  => tx('readonly',  s => s.getAll());

/* ---------- imagen ---------- */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * Normaliza la foto: corrige la orientación del teléfono, la acota a
 * LADO_MAX y la vuelve JPEG. Devuelve el data URL para mostrar y el
 * base64 pelado para mandar.
 */
async function normalizar(archivo) {
  if (!archivo || !/^image\//.test(archivo.type)) {
    throw new Error('Eso no es una imagen.');
  }

  // imageOrientation respeta el EXIF: sin esto, las fotos verticales
  // del teléfono llegan acostadas y el modelo lee peor.
  const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });

  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto  = Math.round(bitmap.height * escala);

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close && bitmap.close();

  const dataUrl = lienzo.toDataURL('image/jpeg', CALIDAD);
  return {
    dataUrl,
    base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
    tipo: 'image/jpeg',
    ancho, alto,
    bytes: Math.round(dataUrl.length * 0.75)
  };
}

/** Abre la cámara o la galería y devuelve la foto ya normalizada. */
function capturar() {
  return new Promise((res, rej) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.capture = 'environment';   // en el móvil abre la cámara trasera
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return rej(null);            // cancelado: no es un error
      normalizar(f).then(res, rej);
    };
    inp.click();
  });
}

/* ---------- cola ---------- */

async function encolar(foto) {
  const reg = {
    id: uid(),
    dataUrl: foto.dataUrl,
    tipo: foto.tipo,
    bytes: foto.bytes,
    creada: new Date().toISOString(),
    estado: 'pendiente',      // pendiente | leyendo | leida | error
    resultado: null,
    error: null
  };
  await guardar(reg);
  return reg;
}

const pendientes = async () =>
  (await todas()).filter(f => f.estado === 'pendiente' || f.estado === 'error');

/* ---------- lectura ---------- */

const configurado = () => Boolean(window.Sync && window.Sync.estado().autenticado);

/**
 * Manda la foto a la Edge Function. `categorias` son los conceptos del
 * plan, para que el modelo escoja uno que exista en vez de inventarlo.
 */
async function leer(reg, categorias) {
  if (!configurado()) {
    throw new Error('Falta conectar Supabase e iniciar sesión para leer facturas.');
  }

  reg.estado = 'leyendo';
  reg.error = null;
  await guardar(reg);

  try {
    const datos = await window.Sync.invocar('leer-factura', {
      imagen: reg.dataUrl.slice(reg.dataUrl.indexOf(',') + 1),
      tipo: reg.tipo,
      categorias,
      // La fecha del teléfono, no toISOString(): eso es UTC y en Honduras
      // devuelve el día siguiente a partir de las 6 de la tarde, así que una
      // factura sin fecha legible entraba fechada mañana.
      hoy: window.Asesor.hoyLocal()
    });
    reg.estado = 'leida';
    reg.resultado = datos;
    await guardar(reg);
    return datos;
  } catch (e) {
    reg.estado = 'error';
    reg.error = e.message || 'No se pudo leer';
    await guardar(reg);
    throw e;
  }
}

/** Reintenta lo que quedó en cola (por ejemplo, tomado sin señal). */
async function procesarPendientes(categorias, alAvanzar) {
  if (!configurado() || !navigator.onLine) return 0;
  const cola = await pendientes();
  let hechas = 0;
  for (const reg of cola) {
    try { await leer(reg, categorias); hechas++; if (alAvanzar) alAvanzar(reg); }
    catch (e) { break; }   // si una falla, el resto probablemente también
  }
  return hechas;
}

window.Facturas = {
  soportado: Boolean(window.indexedDB && window.createImageBitmap),
  configurado, capturar, normalizar, encolar, leer,
  pendientes, procesarPendientes, obtener, borrar, todas,
  LADO_MAX
};

})();
