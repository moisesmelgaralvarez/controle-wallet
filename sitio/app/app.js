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

import { haySesion, salir, capturarSesionDeURL, ErrorDatos, llamar, ponerClave } from './datos/api.js';
import { cargarHogar, datosDelHogar, mesDeHoy, olvidar } from './datos/hogar.js';
import { olvidarHistorico } from './datos/historico.js';
import * as A from './nucleo/index.js';
import { $, esc, fijarMoneda, nombreMes, cerrarHoja, cargando } from './ui.js';
import { limites, mover, esElActual } from './datos/periodos.js';
import { resumen } from './vistas/resumen.js';
import { movimientos } from './vistas/movimientos.js';
import { presupuesto } from './vistas/presupuesto.js';
import { proyectos } from './vistas/proyectos.js';
import { historia } from './vistas/historia.js';
import { cierre } from './vistas/cierre.js';
import { importar } from './vistas/importar.js';
import { informe } from './vistas/informe.js';
import { cuenta } from './vistas/cuenta.js';
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
  importar:    { titulo: 'Importar',     pintar: importar },
  informe:     { titulo: 'Informe',      pintar: informe },
  cuenta:      { titulo: 'Tu cuenta',    pintar: cuenta }
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
    elegido: /^\d{4}-\d{2}$/.test(mes) ? mes : null,
    // La invitación trae su token en el mismo sitio donde otras vistas
    // llevan el mes. No es un período, así que viaja aparte.
    extra: partes[1] || ''
  };
}

let { ruta, elegido, extra } = leerHash();

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

/**
 * Quien llega con una invitación entra al hogar ANTES de cargar nada.
 *
 * Va primero por una razón práctica: si se cargara el hogar antes,
 * quien todavía no pertenece a ninguno caería en el asistente de
 * arranque y le tocaría armar un hogar que no necesita — el suyo ya
 * existe, es al que lo invitaron.
 */
async function aceptarInvitacion(token) {
  marcar('cargando');
  vista.innerHTML = cargando('Entrando al hogar…');
  try {
    await llamar('aceptar_invitacion', { p_token: token });
    olvidar();
    olvidarHistorico();

    /* Quien llega por el enlace de una invitación NO TIENE CONTRASEÑA:
       `/auth/v1/invite` crea la cuenta sin ninguna. Si se la manda al
       resumen sin pedírsela, entra hoy y mañana no puede volver. Se le
       pide acá, con el hogar ya resuelto. */
    if (delCorreo && delCorreo.tipo === 'invite') {
      // El token ya se usó; sacarlo de la dirección antes de seguir.
      history.replaceState(null, '', '/app/#/resumen');
      ({ ruta, elegido, extra } = leerHash());
      return pedirClave({ alTerminar: () => arrancar({ refrescar: true }) });
    }

    // Sin el token en la dirección: ya se usó, y dejarlo invita a
    // compartir un enlace que ya no sirve.
    location.replace('/app/#/resumen');
    location.reload();
  } catch (err) {
    marcar('error');
    vista.innerHTML = `
      <div class="error-caja">
        <p><strong>No se pudo entrar al hogar</strong></p>
        <p>${esc(err.message || 'Esa invitación no se pudo usar.')}</p>
      </div>
      <button class="boton boton--borde" type="button" id="alResumen">Ir a mi hogar</button>`;
    $('#alResumen').addEventListener('click', () => { location.hash = '#/resumen'; });
  }
}

/**
 * Elegir contraseña, para quien entró por invitación.
 *
 * `/auth/v1/invite` crea la cuenta SIN contraseña. El enlace del correo
 * la deja adentro una vez y, si no elige una acá, no puede volver a
 * entrar nunca — y encima no tiene cómo enterarse de por qué. Se vio en
 * un hogar de verdad: «le pide iniciar sesión» y no había con qué.
 *
 * Va DESPUÉS de entrar al hogar y no antes: primero se resuelve lo que
 * la trajo —quedar adentro—, y recién entonces se le pide algo. Al
 * revés, un error al elegir contraseña la dejaría fuera del hogar
 * habiendo hecho todo bien.
 */
function pedirClave({ alTerminar }) {
  marcar('ok');
  document.body.dataset.asistente = 'si';
  $('#titulo').textContent = 'Elegí tu contraseña';
  $('#mesNav').hidden = true;
  vista.innerHTML = `
    <div class="asistente">
      <p class="asistente__entrada">
        Ya estás dentro del hogar. Elegí una contraseña para poder volver a
        entrar sin depender del correo.
      </p>
      <form class="asistente__forma" id="formaClave" novalidate>
        <label class="campo">
          <span class="campo__nombre">Contraseña</span>
          <input class="campo__caja" type="password" name="clave" required
                 minlength="8" autocomplete="new-password">
          <span class="campo__ayuda">Ocho caracteres o más.</span>
        </label>
        <p class="aviso aviso--malo" id="claveMal" hidden></p>
        <button class="boton boton--principal" type="submit">Guardar y entrar</button>
      </form>
    </div>`;

  $('#formaClave').addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = $('#formaClave button[type="submit"]');
    const clave = $('#formaClave [name="clave"]').value;
    const mal = $('#claveMal');
    if (!clave || clave.length < 8) {
      mal.hidden = false; mal.textContent = 'Tiene que ser de ocho caracteres o más.';
      return;
    }
    boton.disabled = true; boton.textContent = 'Guardando…';
    try {
      await ponerClave(clave);
      document.body.dataset.asistente = 'no';
      alTerminar();
    } catch (err) {
      mal.hidden = false;
      mal.textContent = err.message || 'No se pudo guardar la contraseña.';
      boton.disabled = false; boton.textContent = 'Guardar y entrar';
    }
  });
}

/**
 * Ofrecerle el hogar a quien fue invitada y llegó sin el enlace.
 *
 * Pasa más de lo que parece: se pierde el correo, se entra directo por
 * la dirección, se cambia de aparato. Sin esto la persona queda con una
 * cuenta sin hogar y SIN FORMA DE ENTERARSE de que hay una invitación
 * esperándola — que es peor que el defecto original, porque no tiene ni
 * un asistente que la distraiga.
 *
 * La app no puede leer `invitaciones` por su cuenta: RLS lo impide, y
 * correctamente, porque todavía no es miembro de ese hogar. De ahí que
 * la pregunta la conteste `mi_invitacion_pendiente`, que solo devuelve
 * lo del propio correo de quien pregunta.
 */
async function ofrecerInvitacion(inv) {
  marcar('ok');
  document.body.dataset.asistente = 'si';
  $('#titulo').textContent = 'Te invitaron a un hogar';
  $('#mesNav').hidden = true;
  vista.innerHTML = `
    <div class="asistente">
      <p class="asistente__entrada">
        Te invitaron al hogar <strong>${esc(inv.hogar)}</strong>. Al entrar vas a
        ver sus ingresos, gastos y metas — y ellos van a ver lo que registrés vos.
      </p>
      <p class="aviso aviso--malo" id="invMal" hidden></p>
      <div class="asistente__forma">
        <button class="boton boton--principal" type="button" id="entrarAlHogar">Entrar al hogar</button>
        <button class="boton boton--borde" type="button" id="hogarPropio">Prefiero armar el mío</button>
      </div>
    </div>`;

  $('#entrarAlHogar').addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Entrando…';
    try {
      await llamar('aceptar_invitacion_mia', { p_id: inv.id });
      olvidar(); olvidarHistorico();
      document.body.dataset.asistente = 'no';

      /* Y ACÁ TAMBIÉN SE PIDE LA CONTRASEÑA, que antes solo se pedía por
         el otro camino. `/auth/v1/invite` crea la cuenta SIN ninguna, así
         que quien entra por acá quedaba adentro hoy y sin poder volver
         mañana — y sin manera de enterarse de por qué.

         Es el hueco que dejó descubierto el correo de verdad: como el
         token no sobrevive a la URL, TODA persona invitada llega por
         este camino y no por el del fragmento. */
      if (delCorreo && delCorreo.tipo === 'invite') {
        delCorreo.tipo = null;      // una sola vez, no en cada recarga
        return pedirClave({ alTerminar: () => arrancar({ refrescar: true }) });
      }
      arrancar({ refrescar: true });
    } catch (err) {
      const mal = $('#invMal');
      mal.hidden = false; mal.textContent = err.message || 'No se pudo entrar al hogar.';
      e.target.disabled = false; e.target.textContent = 'Entrar al hogar';
    }
  });

  /* La salida. Sin ella, quien no quiera entrar a ese hogar se queda
     trancada en esta pantalla sin poder usar la app. */
  $('#hogarPropio').addEventListener('click', () => {
    document.body.dataset.asistente = 'no';
    abrirAsistente();
  });
}

async function arrancar({ refrescar = false } = {}) {
  if (ruta === 'invitacion' && extra) return aceptarInvitacion(extra);

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
    /* «Tu cuenta» se alcanza SIEMPRE, aunque el hogar esté a medias.
       La política de privacidad promete poder llevarse los datos y
       borrar la cuenta «cuando querás»; mandar al asistente a quien
       viene justo a eso lo dejaría atrapado. */
    /* SIN HOGAR NO SIGNIFICA «ARMÁ UNO». Puede significar que la
       invitaron y todavía no entró — que es justo el caso que este
       arreglo persigue. Se pregunta ANTES de abrir el asistente, porque
       abrirlo es lo que la llevaba a armar un hogar de más. */
    if (ruta !== 'cuenta' && !hogar) {
      const inv = await llamar('mi_invitacion_pendiente').catch(() => null);
      if (inv && inv.id) return ofrecerInvitacion(inv);
    }

    if (ruta !== 'cuenta' && A.faltantes(D).length) return abrirAsistente();

    document.body.dataset.asistente = 'no';
    // El mes no significa nada en «Tu cuenta»: enseñarlo invita a creer
    // que exportar o borrar depende del mes que se esté mirando.
    if (ruta === 'cuenta') $('#mesNav').hidden = true;
    else pintarMesNav();

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
  ({ ruta, elegido, extra } = leerHash());
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
