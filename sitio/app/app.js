/* ============================================================
   La aplicación: armazón y enrutador.

   Tres cosas que hace a propósito:

   1. NADA SE GUARDA EN EL DISPOSITIVO. Lo traído vive en memoria
      mientras dure la pestaña. Se cierra el navegador y no queda
      rastro; se vuelve a entrar y está todo, porque está en el
      servidor.

   2. EL ESTADO SIEMPRE A LA VISTA. Cargando, al día, error o sin
      conexión. Cuando los datos vienen de la red, no decir en qué
      estado se está es dejar que la gente confíe en una pantalla
      vieja.

   3. SIN CONEXIÓN NO SE ESCRIBE, y se dice antes de que alguien lo
      descubra perdiendo un registro. Guardar cambios «para después»
      traería de vuelta justo el problema que el servidor
      autoritativo vino a quitar.

   El enrutador va por `#`: no necesita configuración del servidor y
   funciona igual en la vista previa de cada rama. En la navegación
   solo aparecen las vistas que YA funcionan — un menú lleno de
   entradas que dicen «en construcción» enseña a no confiar en el
   menú.
   ============================================================ */

import { haySesion, salir, capturarSesionDeURL, ErrorDatos } from './datos/api.js';
import { cargarHogar, datosDelHogar, mesDeHoy, olvidar } from './datos/hogar.js';
import { olvidarHistorico } from './datos/historico.js';
import * as A from './nucleo/index.js';
import { $, esc, fijarMoneda, nombreMes, cerrarHoja } from './ui.js';
import { resumen } from './vistas/resumen.js';
import { movimientos } from './vistas/movimientos.js';
import { presupuesto } from './vistas/presupuesto.js';
import { proyectos } from './vistas/proyectos.js';
import { asistente } from './vistas/asistente.js';

/* Primero lo que viene del correo: quien acaba de confirmar su cuenta
   llega con la sesión colgada de la URL. Va ANTES de revisar si hay
   sesión — si no, se le mandaría a iniciar sesión justo después de
   haber hecho todo bien. */
const delCorreo = capturarSesionDeURL();

if (!haySesion()) location.replace('/entrar');

const vista = $('#vista');

/* ---------- las vistas ---------- */

const VISTAS = {
  resumen:     { titulo: 'Resumen',     pintar: resumen },
  movimientos: { titulo: 'Movimientos', pintar: movimientos },
  presupuesto: { titulo: 'Presupuesto', pintar: presupuesto },
  proyectos:   { titulo: 'Proyectos',   pintar: proyectos }
};

/* La sección activa se marca en los dos juegos de navegación —riel y
   barra— desde un solo lugar. Si cada uno lo hiciera por su cuenta,
   tarde o temprano uno se quedaría marcando la sección que no es. */
function marcarNavegacion() {
  for (const a of document.querySelectorAll('[data-ruta]')) {
    if (a.dataset.ruta === ruta) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

/* ---------- estado visible ---------- */

const TEXTOS = { cargando: 'Cargando…', ok: 'Al día', error: 'No se pudo cargar', 'sin-red': 'Sin conexión' };

function marcar(estado) {
  for (const id of ['#estado', '#estado2']) { const e = $(id); if (e) e.dataset.estado = estado; }
  for (const id of ['#estadoTexto', '#estadoTexto2']) { const e = $(id); if (e) e.textContent = TEXTOS[estado] || estado; }
  const sl = $('#soloLectura');
  if (sl) sl.hidden = estado !== 'sin-red';
}

/* ---------- ciclo ---------- */

let periodo = null;
let hogar = null;
let ruta = location.hash.replace('#/', '') || 'resumen';

function pintarError(err) {
  const sinRed = err instanceof ErrorDatos && err.sinConexion;
  marcar(sinRed ? 'sin-red' : 'error');
  vista.innerHTML = `
    <div class="error-caja">
      <p><strong>${esc(sinRed ? 'Sin conexión' : 'No se pudo cargar')}</strong></p>
      <p>${esc(err.message || 'Algo salió mal.')}</p>
    </div>
    <button class="boton boton--borde" type="button" id="reintentar">Reintentar</button>`;
  $('#reintentar').addEventListener('click', () => arrancar({ refrescar: true }));
}

function saludarSiViene() {
  if (!delCorreo || delCorreo.tipo !== 'signup') return;
  const p = document.createElement('p');
  p.className = 'aviso aviso--ok';
  p.textContent = 'Tu correo quedó confirmado. Bienvenido a Controle Wallet.';
  vista.prepend(p);
  delCorreo.tipo = null;   // una sola vez, no en cada recarga
}

async function arrancar({ refrescar = false } = {}) {
  marcar('cargando');
  cerrarHoja();
  try {
    hogar = await datosDelHogar();
    fijarMoneda(hogar && hogar.moneda);
    periodo = mesDeHoy((hogar && hogar.inicio_mes) || 1);

    const D = await cargarHogar(periodo, { refrescar });
    marcar('ok');

    // Un hogar sin personas, sin pagos o sin gastos no puede calcular
    // nada. En vez de enseñar una pantalla de ceros, se lleva a
    // armarlo: ver ceros donde debería haber plata desanima más que
    // una pregunta directa.
    if (A.faltantes(D).length) return abrirAsistente();

    document.body.dataset.asistente = 'no';
    $('#mes').textContent = nombreMes(periodo);

    const v = VISTAS[ruta] || VISTAS.resumen;
    $('#titulo').textContent = v.titulo;
    marcarNavegacion();
    v.pintar({ contenedor: vista, D, periodo, hogar, recargar: () => arrancar({ refrescar: true }) });
    saludarSiViene();

  } catch (err) {
    pintarError(err);
  }
}

function abrirAsistente() {
  // El armazón estorba mientras se arma el hogar: todavía no hay a
  // dónde navegar.
  document.body.dataset.asistente = 'si';
  $('#titulo').textContent = 'Armemos tu hogar';
  $('#mes').textContent = '';
  asistente({
    contenedor: vista,
    hogar,
    alTerminar: () => { document.body.dataset.asistente = 'no'; arrancar({ refrescar: true }); }
  });
}

/* ---------- navegación y ciclo de vida ---------- */

window.addEventListener('hashchange', () => {
  ruta = location.hash.replace('#/', '') || 'resumen';
  if (document.body.dataset.asistente === 'si') return;
  arrancar();
});

$('#salir').addEventListener('click', async () => {
  await salir();
  olvidar();            // nada del hogar sobrevive al cierre de sesión
  olvidarHistorico();
  location.replace('/');
});

/* Al volver a la pestaña se vuelve a preguntar: si la otra persona
   del hogar registró algo mientras tanto, aquí es donde aparece. */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && periodo && document.body.dataset.asistente !== 'si') {
    arrancar({ refrescar: true });
  }
});

window.addEventListener('online',  () => arrancar({ refrescar: true }));
window.addEventListener('offline', () => marcar('sin-red'));

arrancar();
