/* ============================================================
   Sincronización con Supabase — sin SDK, solo fetch.
   Modelo: el teléfono manda. Todo se guarda primero en local y
   la nube es un espejo compartido entre los dos dispositivos.
   ============================================================ */
(function () {
'use strict';

const CFG_KEY = 'presupuesto.sync.cfg';
const SES_KEY = 'presupuesto.sync.ses';
const TABLA   = 'hogar_estado';
const INTERVALO = 20000;   // sondeo en primer plano

let cfg  = leer(CFG_KEY) || { url: '', key: '', hogar: 'hogar' };
let ses  = leer(SES_KEY) || null;
let doc  = null;
let onRemoto = null;
let onEstado = null;
let estadoActual = 'local';
let ultimoOk = null;
let timer = null;
let empujando = false;
let pendiente = false;

function leer(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

const configurado = () => Boolean(cfg.url && cfg.key);
const autenticado = () => Boolean(ses && ses.access_token);

function marcar(e) {
  estadoActual = e;
  if (onEstado) onEstado(e);
}

/* ---------- fusión de documentos ---------- */

const ts = v => { const t = Date.parse(v || 0); return isNaN(t) ? 0 : t; };

/** Une dos colecciones por id, quedándose con la versión más reciente. */
function unirColeccion(A, B, tumbas) {
  const m = new Map();
  [].concat(A || [], B || []).forEach(it => {
    if (!it || !it.id) return;
    const muerto = tumbas[it.id];
    if (muerto && ts(muerto) >= ts(it._upd)) return;   // se borró después de la última edición
    const prev = m.get(it.id);
    if (!prev) { m.set(it.id, it); return; }
    const gana = ts(it._upd) >= ts(prev._upd) ? it : prev;
    const pierde = gana === it ? prev : it;
    // Los aportes de un proyecto se acumulan: nunca se pisan entre teléfonos.
    if (gana.aportes || pierde.aportes) {
      const copia = Object.assign({}, gana);
      copia.aportes = unirColeccion(gana.aportes, pierde.aportes, tumbas);
      m.set(it.id, copia);
    } else {
      m.set(it.id, gana);
    }
  });
  return Array.from(m.values());
}

/**
 * Une dos mapas indexados por mes ("2026-08" → objeto con _upd), quedándose
 * con la versión más reciente de cada mes. Es la misma regla que en las
 * colecciones con id, pero aquí la clave es el mes.
 */
function unirPorMes(A, B) {
  const out = {};
  [A || {}, B || {}].forEach(m => {
    Object.keys(m).forEach(k => {
      const prev = out[k];
      if (!prev || ts(m[k] && m[k]._upd) >= ts(prev._upd)) out[k] = m[k];
    });
  });
  return out;
}

function merge(a, b) {
  if (!a) return b;
  if (!b) return a;
  const base = ts(b.actualizado) > ts(a.actualizado) ? b : a;
  const otro = base === b ? a : b;

  const out = JSON.parse(JSON.stringify(base));
  const tumbas = Object.assign({}, otro._borrados, base._borrados);
  out._borrados = tumbas;

  ['personas', 'cuentas', 'plantillaIngresos', 'gastos', 'tarjetas', 'financiamientos',
   'proyectos', 'movimientos', 'retiros', 'pagosTarjeta'].forEach(col => {
    out[col] = unirColeccion(a[col], b[col], tumbas);
  });

  // Los ingresos confirmados no son una lista con id, sino un objeto por mes.
  // Se unen mes a mes: si cada teléfono confirmó un mes distinto, quedan los dos.
  const mesesMuertos = Object.assign({}, otro._borradosMes, base._borradosMes);
  out._borradosMes = mesesMuertos;

  /** Une por mes y descarta los meses que se borraron después de su última edición. */
  const vivosPorMes = (x, y) => {
    const todos = unirPorMes(x, y);
    const out2 = {};
    Object.keys(todos).forEach(k => {
      const muerto = mesesMuertos[k];
      if (muerto && ts(muerto) >= ts(todos[k] && todos[k]._upd)) return;
      out2[k] = todos[k];
    });
    return out2;
  };

  out.ingresosMes = vivosPorMes(a.ingresosMes, b.ingresosMes);

  // El presupuesto congelado de cada mes también va por mes, no por id. Sin
  // unirlo, cerrar agosto en un teléfono se perdía en cuanto el otro subiera
  // cualquier cambio posterior: su documento pasaba a ser la base y se llevaba
  // por delante el cierre. Un mes cerrado no se puede perder por eso.
  out.presupuestoMes = vivosPorMes(a.presupuestoMes, b.presupuestoMes);

  // Lo aprendido de cada comercio se suma: si un teléfono clasificó "PAIZ" y el
  // otro "PUMA", quedan los dos. Aquí no hay fecha por entrada, así que en un
  // choque manda el documento más reciente. (Quitar una asignación en un
  // teléfono no se propaga al otro; volver a asignarla sí.)
  out.comercios = Object.assign({}, otro.comercios, base.comercios);

  // Que un teléfono ya haya terminado el asistente basta para los dos. Pero si
  // no quedó nada, "configurado" no puede seguir en pie: sin esto, un "borrar
  // todo" deja la app vacía y sin ofrecer el asistente para volver a empezar.
  out.configurado = Boolean(a.configurado || b.configurado) &&
    Boolean(out.personas.length || out.plantillaIngresos.length || out.gastos.length);

  // El orden importa: en los gastos es visual, en los proyectos es la prioridad
  // con la que se reparte el disponible. Se respeta el del documento base.
  ['gastos', 'proyectos'].forEach(col => {
    const orden = new Map((base[col] || []).map((x, i) => [x.id, i]));
    out[col].sort((x, y) => (orden.has(x.id) ? orden.get(x.id) : 999) - (orden.has(y.id) ? orden.get(y.id) : 999));
  });

  out.actualizado = new Date(Math.max(ts(a.actualizado), ts(b.actualizado))).toISOString();
  return out;
}

/* ---------- red ---------- */

function cabeceras(extra) {
  return Object.assign({
    'apikey': cfg.key,
    'Authorization': 'Bearer ' + (autenticado() ? ses.access_token : cfg.key),
    'Content-Type': 'application/json'
  }, extra || {});
}

async function refrescarSesion() {
  if (!ses || !ses.refresh_token) return false;
  try {
    const r = await fetch(`${cfg.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: ses.refresh_token })
    });
    if (!r.ok) { ses = null; guardar(SES_KEY, null); return false; }
    ses = await r.json();
    guardar(SES_KEY, ses);
    return true;
  } catch (e) { return false; }
}

async function pedir(ruta, opciones, reintento) {
  const r = await fetch(cfg.url + ruta, Object.assign({ headers: cabeceras() }, opciones));
  if (r.status === 401 && !reintento && await refrescarSesion()) {
    return pedir(ruta, opciones, true);
  }
  return r;
}

async function entrar(email, password) {
  if (!configurado()) throw new Error('Falta configurar la URL y la clave de Supabase.');
  const r = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': cfg.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.msg || j.message || 'No se pudo iniciar sesión.');
  ses = j;
  guardar(SES_KEY, ses);
  await tirar();
  arrancarSondeo();
  return true;
}

function salir() {
  ses = null;
  guardar(SES_KEY, null);
  marcar('local');
}

/**
 * Llama a una Edge Function del proyecto. Va con el token de sesión,
 * así que la función puede exigir que quien llame sea uno de ustedes.
 * Es la vía para usar servicios que necesitan una clave secreta: la
 * clave se queda en el servidor y nunca baja al teléfono.
 */
async function invocar(nombre, cuerpo) {
  if (!configurado()) throw new Error('Falta configurar la URL y la clave de Supabase.');
  if (!autenticado()) throw new Error('Falta iniciar sesión.');

  const r = await pedir(`/functions/v1/${nombre}`, {
    method: 'POST',
    body: JSON.stringify(cuerpo || {})
  });

  const texto = await r.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch (e) {}

  if (!r.ok) {
    const msg = (datos && (datos.error || datos.message))
      || (r.status === 404 ? `La función "${nombre}" no está desplegada.` : `Error ${r.status}`);
    throw new Error(msg);
  }
  return datos;
}

/**
 * Forma canónica de un documento: mismas claves en el mismo orden siempre.
 * Sirve para comparar dos documentos por contenido — JSON.stringify a secas
 * no vale, porque el orden de las claves puede diferir sin que cambie nada.
 */
function canonico(v) {
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort()
      .map(k => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

const difieren = (a, b) => canonico(a) !== canonico(b);

/** Trae el documento remoto y lo funde con el local. */
async function tirar() {
  if (!configurado() || !autenticado()) { marcar('local'); return; }
  marcar('syncing');
  try {
    const r = await pedir(`/rest/v1/${TABLA}?hogar=eq.${encodeURIComponent(cfg.hogar)}&select=data,actualizado`);
    if (!r.ok) { marcar('error'); return; }
    const filas = await r.json();

    if (filas.length && filas[0].data) {
      const remoto = filas[0].data;
      const fundido = merge(doc, remoto);
      doc = fundido;
      if (onRemoto) onRemoto(fundido);

      // Si la fusión aportó algo que la nube no tenía, hay que subirlo.
      // Sin esto, un teléfono con datos que se conecta a una nube vacía se
      // los queda para sí: funde en local y nunca los publica, así que el
      // otro teléfono jamás los ve. Converge solo: una vez subido, la nube
      // queda igual al fundido y la comparación deja de disparar.
      if (difieren(fundido, remoto)) await empujar(fundido, true);
    } else {
      await empujar(doc, true);   // nube vacía: la sembramos
    }

    ultimoOk = new Date();
    marcar('ok');
  } catch (e) {
    marcar('error');
  }
}

/** Sube el documento local. */
async function empujar(d, silencioso) {
  doc = d || doc;
  if (!configurado() || !autenticado()) { marcar('local'); return; }
  if (empujando) { pendiente = true; return; }

  empujando = true;
  if (!silencioso) marcar('syncing');
  try {
    const r = await pedir(`/rest/v1/${TABLA}`, {
      method: 'POST',
      headers: cabeceras({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ hogar: cfg.hogar, data: doc, actualizado: new Date().toISOString() })
    });
    if (!r.ok) { marcar('error'); }
    else { ultimoOk = new Date(); marcar('ok'); }
  } catch (e) {
    marcar('pending');
  } finally {
    empujando = false;
    if (pendiente) { pendiente = false; empujar(doc, true); }
  }
}

/* ---------- ciclo ---------- */

function arrancarSondeo() {
  clearInterval(timer);
  if (!configurado() || !autenticado()) return;
  timer = setInterval(() => { if (!document.hidden) tirar(); }, INTERVALO);
}

let enganchado = false;

function arrancar(d, cbRemoto, cbEstado) {
  doc = d;
  onRemoto = cbRemoto;
  onEstado = cbEstado;

  if (!configurado())      marcar('local');
  else if (!autenticado()) marcar('pending');
  else { tirar(); arrancarSondeo(); }

  // Guardar el proyecto vuelve a llamar aquí. Sin esta guarda se apilaba un
  // oyente más en cada guardado, y al volver a la app se disparaban tantas
  // consultas a la nube como veces se hubiera tocado la configuración.
  if (enganchado) return;
  enganchado = true;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tirar(); });
  window.addEventListener('online', () => tirar());
  window.addEventListener('offline', () => marcar('pending'));
}

/* ---------- estado legible ---------- */

function estado() {
  const base = { url: cfg.url, key: cfg.key, hogar: cfg.hogar, configurado: configurado(), autenticado: autenticado(), correo: (ses && ses.user && ses.user.email) || '' };

  if (!configurado())
    return Object.assign(base, { estado: 'local', titulo: 'Solo en este teléfono',
      detalle: 'Los datos no salen de aquí. Conecta la nube para compartirlos.' });

  if (!autenticado())
    return Object.assign(base, { estado: 'pending', titulo: 'Falta iniciar sesión',
      detalle: 'La nube está configurada, pero nadie ha entrado en este teléfono.' });

  const mapa = {
    ok:      { titulo: 'Sincronizado', detalle: ultimoOk ? 'Al día · ' + ultimoOk.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }) : 'Al día' },
    syncing: { titulo: 'Sincronizando…', detalle: 'Consultando la nube.' },
    pending: { titulo: 'Cambios sin subir', detalle: 'Sin conexión. Se subirán solos al volver la señal.' },
    error:   { titulo: 'No se pudo conectar', detalle: 'Revisa la URL, la clave y que la tabla exista.' },
    local:   { titulo: 'Solo en este teléfono', detalle: 'Sin nube activa.' }
  };
  return Object.assign(base, { estado: estadoActual }, mapa[estadoActual] || mapa.local);
}

function configurar(url, key, hogar) {
  cfg = { url: (url || '').replace(/\/+$/, ''), key: key || '', hogar: hogar || 'hogar' };
  guardar(CFG_KEY, cfg);
}

window.Sync = {
  arrancar, configurar, estado, merge, entrar, salir, invocar, canonico, difieren,
  push: d => empujar(d, false),
  pull: tirar
};

})();
