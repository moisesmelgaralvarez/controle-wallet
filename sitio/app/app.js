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
import { limites, mover, esElActual } from './datos/periodos.js';
import { resumen } from './vistas/resumen.js';
import { movimientos } from './vistas/movimientos.js';
import { presupuesto } from './vistas/presupuesto.js';
import { proyectos } from './vistas/proyectos.js';
import { historia } from './vistas/historia.js';
import { cierre } from './vistas/cierre.js';
import { importar } from './vistas/importar.js';
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
  proyectos:   { titulo: 'Proyectos',   pintar: proyectos },
  historia:    { titulo: 'Historia',    pintar: historia },
  cierre:      { titulo: 'Cierre de mes', pintar: cierre },
  importar:    { titulo: 'Importar',     pintar: importar }
};

/* La sección activa se marca en los dos juegos de navegación —riel y
   barra— desde un solo lugar. Si cada uno lo hiciera por su cuenta,
   tarde o temprano uno se quedaría marcando la sección que no es. */
function marcarNavegacion() {
  for (const a of document.querySelectorAll('[data-ruta]')) {
    if (a.dataset.ruta === ruta) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
    // El mes viaja con uno al cambiar de vista. Mirar julio en
    // Movimientos y que Resumen salte a agosto sería perder el hilo a
    // mitad de una pregunta.
    a.setAttribute('href', enlace(a.dataset.ruta, elegido));
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
let limitesDeMes = null;

/* ---------- la ruta y el mes viven en el hash ----------

   `#/movimientos/2026-07`. El mes va en la dirección y no en una
   variable suelta por tres razones: el enlace se puede compartir, el
   botón de atrás del navegador hace lo que uno espera, y al recargar
   la página se queda donde estaba en vez de saltar a hoy.

   Sin período en el hash se entiende «el mes en curso», que es lo que
   contestaba la app hasta ahora y lo que sigue contestando `/app/`. */

function leerHash() {
  const partes = location.hash.replace(/^#\/?/, '').split('/');
  const mes = partes[1] || '';
  return {
    ruta: partes[0] || 'resumen',
    elegido: /^\d{4}-\d{2}$/.test(mes) ? mes : null
  };
}

let { ruta, elegido } = leerHash();

/** Ir a una vista conservando el mes que se está mirando. */
const enlace = (r, mes) => `#/${r}${mes ? '/' + mes : ''}`;

function irAlMes(destino) {
  // `null` llega cuando la flecha estaba apagada: no hay a dónde ir.
  if (!destino) return;
  location.hash = enlace(ruta, destino === (limitesDeMes && limitesDeMes.ultimo) ? null : destino);
}

/* ---------- el control del mes ---------- */

function pintarMesNav() {
  const nav = $('#mesNav');
  nav.hidden = false;
  $('#mes').textContent = nombreMes(periodo);

  const atras = mover(periodo, -1, limitesDeMes);
  const adelante = mover(periodo, 1, limitesDeMes);
  $('#mesAnterior').disabled = !atras;
  $('#mesSiguiente').disabled = !adelante;

  /* Que se vea que NO es el mes en curso, y a lo grande. Cada cifra de
     cada pantalla cambia de significado según el mes que se mira: leer
     el disponible de julio creyendo que es el de agosto es el error más
     caro que esta pantalla puede provocar. */
  const enElActual = esElActual(periodo, limitesDeMes.ultimo);
  $('#mesHoy').hidden = enElActual;
  document.body.dataset.mesPasado = enElActual ? 'no' : 'si';
}

$('#mesAnterior').addEventListener('click', () => irAlMes(mover(periodo, -1, limitesDeMes)));
$('#mesSiguiente').addEventListener('click', () => irAlMes(mover(periodo, 1, limitesDeMes)));
$('#mesHoy').addEventListener('click', () => { location.hash = enlace(ruta, null); });

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
    const actual = mesDeHoy((hogar && hogar.inicio_mes) || 1);
    periodo = elegido || actual;

    const D = await cargarHogar(periodo, { refrescar });
    marcar('ok');

    /* Los límites salen de las cuentas y tarjetas, que se traen
       completas siempre, así que da igual con qué mes se cargó. */
    limitesDeMes = limites(D, actual);

    /* Un mes escrito a mano en la dirección puede caer fuera del
       rango. Se corrige yendo al más cercano en vez de enseñar un mes
       vacío: el hash cambiado dispara otra pasada, y esa ya entra. */
    if (elegido && (elegido < limitesDeMes.primero || elegido > limitesDeMes.ultimo)) {
      location.replace(enlace(ruta, elegido < limitesDeMes.primero ? limitesDeMes.primero : null));
      return;
    }

    // Un hogar sin personas, sin pagos o sin gastos no puede calcular
    // nada. En vez de enseñar una pantalla de ceros, se lleva a
    // armarlo: ver ceros donde debería haber plata desanima más que
    // una pregunta directa.
    if (A.faltantes(D).length) return abrirAsistente();

    document.body.dataset.asistente = 'no';
    pintarMesNav();

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
  $('#mesNav').hidden = true;
  asistente({
    contenedor: vista,
    hogar,
    alTerminar: () => { document.body.dataset.asistente = 'no'; arrancar({ refrescar: true }); }
  });
}

/* ---------- navegación y ciclo de vida ---------- */

window.addEventListener('hashchange', () => {
  ({ ruta, elegido } = leerHash());
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
