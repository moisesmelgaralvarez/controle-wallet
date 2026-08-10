/* ============================================================
   Cliente de datos y de sesión — sin SDK.

   Son unas doscientas líneas de `fetch` contra dos APIs estándar:
   PostgREST para los datos y GoTrue para la sesión. El SDK oficial
   pesa más de cien kilobytes, traería su propio árbol de
   dependencias y obligaría a abrirle la mano a la política de
   seguridad. La app anterior ya demostró durante meses que el
   refresco de sesión a mano funciona; esto es esa misma idea,
   ordenada.

   DÓNDE VIVE LA SESIÓN:

   El token de refresco se guarda en `localStorage`. Es la ÚNICA
   cosa que queda en el dispositivo, y no es un dato financiero:
   es la credencial que evita escribir la contraseña en cada
   visita. Ningún gasto, ningún saldo, ningún movimiento se guarda
   aquí — para eso está el servidor, que es la única fuente de
   verdad.

   La alternativa sería una cookie `httpOnly` puesta por un
   servidor propio. Se descartó por dos razones: mete una pieza en
   el camino de cada petición, y estorba cuando la fase 2
   empaquete la app para las tiendas. La defensa real contra el
   robo de ese token es la CSP con `script-src 'self'`, que impide
   que corra código inyectado.

   Cerrar sesión borra el token. `salirDeTodos` además lo invalida
   en el servidor, así que no sirve ni copiado.
   ============================================================ */

import { CONFIG } from './config.js';
import { traducir } from './mensajes.js';

const LLAVE_SESION = 'controle.sesion';

let sesion = leerSesion();
let alCambiar = null;

/* ---------- almacenamiento de la credencial ---------- */

function leerSesion() {
  try { return JSON.parse(localStorage.getItem(LLAVE_SESION)); }
  catch { return null; }
}

function guardarSesion(s) {
  sesion = s;
  try {
    if (s) localStorage.setItem(LLAVE_SESION, JSON.stringify(s));
    else localStorage.removeItem(LLAVE_SESION);
  } catch { /* modo privado: la sesión dura lo que la pestaña */ }
  if (alCambiar) alCambiar(s);
}

export const haySesion = () => Boolean(sesion && sesion.access_token);
export const usuario   = () => (sesion && sesion.user) || null;
export const alCambiarSesion = fn => { alCambiar = fn; };

/**
 * Recoge la sesión que viene en el fragmento de la URL.
 *
 * Al confirmar el correo —o al abrir un enlace de recuperación—
 * Supabase devuelve a la persona con los tokens colgados detrás de
 * un `#`. Sin esto, alguien confirma su cuenta, aterriza en la app
 * y la ve pedirle que inicie sesión: hizo todo bien y el servicio
 * le dice que no. Es el peor primer minuto posible.
 *
 * Los tokens se sacan de la barra de direcciones apenas se leen.
 * Van en el fragmento —que no viaja al servidor— pero igual
 * quedarían en el historial y en cualquier captura de pantalla.
 *
 * Devuelve el tipo de enlace (`signup`, `recovery`…) o null.
 */
export function capturarSesionDeURL() {
  const hash = (typeof location !== 'undefined' && location.hash) || '';
  if (!hash.includes('access_token') && !hash.includes('error')) return null;

  const p = new URLSearchParams(hash.slice(1));
  const limpiar = () => history.replaceState(null, '', location.pathname + location.search);

  if (p.get('error')) {
    limpiar();
    return { error: p.get('error_description') || p.get('error') };
  }

  const access_token = p.get('access_token');
  if (!access_token) return null;

  guardarSesion({
    access_token,
    refresh_token: p.get('refresh_token'),
    token_type: p.get('token_type') || 'bearer',
    expires_in: Number(p.get('expires_in')) || 3600
  });
  limpiar();
  return { tipo: p.get('type') || 'signup' };
}

/* ---------- errores en cristiano ---------- */

/**
 * Un error de red y uno de permisos no son lo mismo y no se
 * arreglan igual. El texto que ve la persona lo decide
 * `mensajes.js`; lo que viaja aquí es de qué tipo fue, para que la
 * pantalla pueda distinguir «sin conexión» de «no tenés permiso».
 */
export class ErrorDatos extends Error {
  constructor(mensaje, { estado = 0, causa = null, sinConexion = false } = {}) {
    super(mensaje);
    this.name = 'ErrorDatos';
    this.estado = estado;
    this.causa = causa;
    this.sinConexion = sinConexion;
  }
}

/* ---------- la petición ---------- */

const cabeceras = (extra = {}) => ({
  apikey: CONFIG.clave,
  Authorization: `Bearer ${(sesion && sesion.access_token) || CONFIG.clave}`,
  'Content-Type': 'application/json',
  ...extra
});

async function cuerpoDe(r) {
  const t = await r.text();
  if (!t) return null;
  try { return JSON.parse(t); } catch { return t; }
}

/** Renueva el token de acceso con el de refresco. */
async function refrescar() {
  if (!sesion || !sesion.refresh_token) return false;
  try {
    const r = await fetch(`${CONFIG.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: CONFIG.clave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: sesion.refresh_token })
    });
    if (!r.ok) { guardarSesion(null); return false; }
    guardarSesion(await r.json());
    return true;
  } catch { return false; }
}

async function pedir(ruta, opciones = {}, reintento = false) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ErrorDatos('Sin conexión. Los datos viven en el servidor.', { sinConexion: true });
  }

  let r;
  try {
    r = await fetch(CONFIG.url + ruta, { ...opciones, headers: cabeceras(opciones.headers) });
  } catch (e) {
    throw new ErrorDatos('No se pudo hablar con el servidor.', { causa: e, sinConexion: true });
  }

  // Un token vencido se renueva una vez y se reintenta. Si vuelve a
  // fallar, la sesión se cayó de verdad y hay que volver a entrar.
  if (r.status === 401 && !reintento && await refrescar()) {
    return pedir(ruta, opciones, true);
  }

  const cuerpo = await cuerpoDe(r);
  if (!r.ok) throw new ErrorDatos(traducir(r.status, cuerpo), { estado: r.status, causa: cuerpo });
  return cuerpo;
}

/* ---------- datos ---------- */

const consulta = filtros => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros || {})) p.append(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

/**
 * Lee una tabla. Los filtros van con la sintaxis de PostgREST
 * (`periodo: 'eq.2026-08'`).
 *
 * No hace falta pasar el hogar: las políticas RLS solo devuelven
 * las filas del hogar de quien pregunta. Filtrar por hogar en el
 * cliente sería teatro — quien quisiera saltárselo solo tendría
 * que borrar esa línea.
 */
export const leer = (tabla, filtros) =>
  pedir(`/rest/v1/${tabla}${consulta({ select: '*', ...filtros })}`);

export const crear = (tabla, fila) =>
  pedir(`/rest/v1/${tabla}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(fila)
  }).then(f => (Array.isArray(f) ? f[0] : f));

export const actualizar = (tabla, id, cambios) =>
  pedir(`/rest/v1/${tabla}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(cambios)
  }).then(f => (Array.isArray(f) ? f[0] : f));

export const borrar = (tabla, id) =>
  pedir(`/rest/v1/${tabla}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });

/** Varias tablas de un tirón, en paralelo. */
export async function leerVarias(tablas, filtros = {}) {
  const pares = await Promise.all(
    tablas.map(async t => [t, await leer(t, filtros[t])])
  );
  return Object.fromEntries(pares);
}

/* ---------- sesión ---------- */

async function auth(ruta, cuerpo) {
  const r = await fetch(`${CONFIG.url}/auth/v1${ruta}`, {
    method: 'POST',
    headers: { apikey: CONFIG.clave, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  const datos = await cuerpoDe(r);
  if (!r.ok) throw new ErrorDatos(traducir(r.status, datos), { estado: r.status, causa: datos });
  return datos;
}

/**
 * Alta. El hogar y la membresía de propietario los crea un
 * disparador en la base, no esta función: si dependiera de una
 * llamada posterior del navegador, una pestaña cerrada a destiempo
 * dejaría al usuario sin hogar y de ahí no se sale solo.
 */
export async function registrar({ correo, clave, nombre, hogar }) {
  const datos = await auth('/signup', {
    email: correo,
    password: clave,
    data: { nombre: nombre || '', hogar: hogar || '' }
  });
  // Con confirmación por correo encendida, no viene sesión todavía.
  if (datos && datos.access_token) guardarSesion(datos);
  return { sesionIniciada: Boolean(datos && datos.access_token), usuario: datos && datos.user };
}

export async function entrar(correo, clave) {
  guardarSesion(await auth('/token?grant_type=password', { email: correo, password: clave }));
  return sesion;
}

export async function recuperar(correo) {
  await auth('/recover', { email: correo });
}

/** Cierra la sesión de este dispositivo. */
export async function salir() {
  try { await pedir('/auth/v1/logout?scope=local', { method: 'POST' }); } catch { /* igual se borra */ }
  guardarSesion(null);
}

/** Cierra la sesión en TODOS los dispositivos, invalidando el token. */
export async function salirDeTodos() {
  try { await pedir('/auth/v1/logout?scope=global', { method: 'POST' }); } catch { /* igual se borra */ }
  guardarSesion(null);
}

/** Llama a una Edge Function, que es donde viven los secretos. */
export const invocar = (nombre, cuerpo) =>
  pedir(`/functions/v1/${nombre}`, { method: 'POST', body: JSON.stringify(cuerpo || {}) });
