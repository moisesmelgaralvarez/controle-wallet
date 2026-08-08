/* ============================================================
   La aplicación.

   Primera vista: el Resumen. Trae el hogar del servidor, lo pasa
   por el armador y deja que el núcleo —el mismo que lleva meses
   probado con dinero real— saque los números.

   Tres cosas que este archivo hace a propósito:

   1. NADA SE GUARDA EN EL DISPOSITIVO. Lo traído vive en memoria
      mientras dure la pestaña. Se cierra el navegador y no queda
      rastro; se vuelve a entrar y está todo, porque está en el
      servidor.

   2. EL ESTADO SIEMPRE A LA VISTA. Cargando, al día, error o sin
      conexión. Cuando los datos vienen de la red, no decir en qué
      estado se está es dejar que la gente confíe en una pantalla
      vieja.

   3. SIN CONEXIÓN NO SE ESCRIBE, y se dice antes de que alguien lo
      descubra perdiendo un registro. Guardar cambios "para
      después" traería de vuelta justo el problema que el servidor
      autoritativo vino a quitar.
   ============================================================ */

import { haySesion, usuario, salir, ErrorDatos } from './datos/api.js';
import { cargarHogar, datosDelHogar, mesDeHoy, olvidar } from './datos/hogar.js';
import * as A from './nucleo/index.js';

/* Sin sesión no hay nada que mostrar. */
if (!haySesion()) location.replace('/entrar');

const $ = s => document.querySelector(s);
const vista = $('#vista');

/* ---------- formato ---------- */

let moneda = 'HNL';
const simbolos = { HNL: 'L', USD: '$', EUR: '€' };

const nf = n => new Intl.NumberFormat('es-HN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
}).format(Number(n) || 0);

const dinero = n => `${simbolos[moneda] || moneda} ${nf(n)}`;
const pct = n => `${Math.round((Number(n) || 0) * 100)}%`;

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];
const nombreMes = per => {
  const [y, m] = per.split('-');
  return `${MESES[+m - 1][0].toUpperCase()}${MESES[+m - 1].slice(1)} ${y}`;
};

/** Todo lo que sale a pantalla pasa por aquí. */
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- estado visible ---------- */

const TEXTOS = { cargando: 'Cargando…', ok: 'Al día', error: 'No se pudo cargar', 'sin-red': 'Sin conexión' };

function marcar(estado) {
  for (const id of ['#estado', '#estado2']) {
    const e = $(id); if (e) e.dataset.estado = estado;
  }
  for (const id of ['#estadoTexto', '#estadoTexto2']) {
    const e = $(id); if (e) e.textContent = TEXTOS[estado] || estado;
  }
  $('#soloLectura').hidden = estado !== 'sin-red';
}

/* ---------- la vista ---------- */

function pintarResumen(D, per) {
  const r = A.resumenMes(D, per);
  const p = A.pulso(D, per);
  const credito = (D.tarjetas || []).filter(t => (t.tipo || 'credito') === 'credito');

  const fichas = [
    { t: 'Disponible real', v: dinero(r.disponible), c: r.disponible >= 0 ? 'bien' : 'mal',
      d: r.confirmado ? 'con lo que de verdad entró' : 'con montos estimados' },
    { t: 'Ingreso neto',    v: dinero(r.neto),  d: r.confirmado ? 'confirmado' : 'sin confirmar' },
    { t: 'Gastos del mes',  v: dinero(r.gastos), d: `${dinero(r.salud)} de salud` },
    { t: 'Cuotas',          v: dinero(r.cuotas), d: r.financiados ? `${r.financiados} vigentes` : 'ninguna' }
  ];

  // `pulso` devuelve `avanceMes` y `avanceGasto`, no los nombres que
  // uno supondría. Se leen del núcleo y se acotan aquí: un porcentaje
  // que llegue como `undefined` se vuelve `NaN%`, el navegador
  // descarta el ancho y la barra queda llena — un error que se ve en
  // pantalla pero no avisa por ningún lado.
  const barra = v => Math.max(0, Math.min(100, Math.round((Number(v) || 0) * 100)));
  const ritmo = p && p.adelantado ? 'mal' : '';

  vista.innerHTML = `
    <section class="fichas-app">
      ${fichas.map(f => `
        <article class="ficha-app">
          <span class="ficha-app__t">${esc(f.t)}</span>
          <div class="ficha-app__v ${f.c || ''}">${esc(f.v)}</div>
          <div class="ficha-app__d">${esc(f.d || '')}</div>
        </article>`).join('')}
    </section>

    <div class="zonas">
      <section class="panel">
        <h2>El pulso del mes</h2>
        ${p && p.hayPlan ? `
          <div class="pulso-app">
            <div class="pulso-app__fila">
              <em><span>Mes corrido</span><span>${esc(pct(p.avanceMes))}</span></em>
              <div class="pulso-app__via"><div class="pulso-app__va" data-ancho="${barra(p.avanceMes)}"></div></div>
            </div>
            <div class="pulso-app__fila">
              <em><span>Presupuesto ido</span><span>${esc(pct(p.avanceGasto))}</span></em>
              <div class="pulso-app__via"><div class="pulso-app__va ${ritmo}" data-ancho="${barra(p.avanceGasto)}"></div></div>
            </div>
          </div>

          <!-- La comparación de las dos barras es toda la señal:
               gastar el 26% es normal el día 20 y es alarma el día 4.
               Debajo, la cifra con la que se decide algo. -->
          <p class="pulso-app__pie">
            ${p.adelantado
              ? `Van más rápido que el calendario. A este ritmo cerrarían en
                 <strong>${esc(dinero(p.proyeccion))}</strong>.`
              : 'Van a buen ritmo para llegar al final del mes.'}
          </p>
          <p class="pulso-app__pie">
            Para llegar justos quedan <strong>${esc(dinero(p.porDia))}</strong> al día,
            con ${esc(p.diasRestantes)} ${p.diasRestantes === 1 ? 'día' : 'días'} por delante.
          </p>
          ${p.proximoIngreso || p.proximoCorte ? `
            <p class="pulso-app__pie">
              ${p.proximoIngreso ? `Entra ${esc(p.proximoIngreso.nombre)} en ${esc(p.proximoIngreso.enDias)} d.` : ''}
              ${p.proximoCorte ? `Corta ${esc(p.proximoCorte.nombre)} en ${esc(p.proximoCorte.enDias)} d.` : ''}
            </p>` : ''}
          ` : '<p class="pulso-app__pie">Todavía no hay presupuesto con qué medir el ritmo.</p>'}
      </section>

      <section class="panel">
        <h2>Tarjetas</h2>
        ${credito.length ? credito.map(t => {
          const c = A.cicloTarjeta(D, t, per);
          const falta = c.cobertura < 0;
          return `
            <div class="ciclo-app">
              <div class="ciclo-app__f"><em>${esc(t.nombre)}</em><span>${esc(c.desde)} → ${esc(c.hasta)}</span></div>
              <div class="ciclo-app__f"><em>Se cargó</em><span>${esc(dinero(c.aCubrir))}</span></div>
              ${c.evento ? `<div class="ciclo-app__f"><em>Lo paga: ${esc(c.evento)}</em><span>${esc(dinero(c.ingresoPago))}</span></div>` : ''}
              <div class="ciclo-app__f total">
                <em>${falta ? 'Faltan' : 'Sobra'}</em>
                <span class="${falta ? 'mal' : 'bien'}">${esc(dinero(Math.abs(c.cobertura)))}</span>
              </div>
              ${c.usandoPlan ? '<div class="ciclo-app__f"><em>Según el plan: aún no hay consumos registrados</em></div>' : ''}
            </div>`;
        }).join('') : '<p class="pulso-app__pie">No hay tarjetas de crédito registradas.</p>'}
      </section>
    </div>`;

  // Los anchos se aplican desde JavaScript, no como `style=` en el
  // HTML: un solo estilo en línea obligaría a abrirle la mano a la
  // política de seguridad con 'unsafe-inline'.
  vista.querySelectorAll('[data-ancho]').forEach(b => { b.style.width = b.dataset.ancho + '%'; });
}

function pintarVacio() {
  vista.innerHTML = `
    <div class="vacio">
      <h2>Tu hogar está en blanco</h2>
      <p>
        Falta registrar quiénes lo usan, qué pagos reciben y en qué se les va.
        El asistente que arma todo eso llega en la próxima entrega.
      </p>
    </div>`;
}

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

/* ---------- ciclo ---------- */

let periodo = null;

async function arrancar({ refrescar = false } = {}) {
  marcar('cargando');
  try {
    const h = await datosDelHogar();
    moneda = (h && h.moneda) || 'HNL';
    periodo = mesDeHoy((h && h.inicio_mes) || 1);
    $('#mes').textContent = nombreMes(periodo);

    const D = await cargarHogar(periodo, { refrescar });
    marcar('ok');

    if (A.faltantes(D).length) pintarVacio();
    else pintarResumen(D, periodo);

  } catch (err) {
    pintarError(err);
  }
}

$('#salir').addEventListener('click', async () => {
  await salir();
  olvidar();           // nada del hogar sobrevive al cierre de sesión
  location.replace('/');
});

/* Al volver a la pestaña se vuelve a preguntar: si la otra persona
   del hogar registró algo mientras tanto, aquí es donde aparece. */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && periodo) arrancar({ refrescar: true });
});

window.addEventListener('online',  () => arrancar({ refrescar: true }));
window.addEventListener('offline', () => marcar('sin-red'));

arrancar();
