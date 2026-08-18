/* ============================================================
   Piezas compartidas de la interfaz.

   Formato de números, escapado, diálogos y formularios. Todo lo
   que si cada vista lo resolviera por su cuenta terminaría dando
   resultados distintos en pantallas distintas — que es exactamente
   como se pierde la confianza en una app de dinero.

   Ni un estilo en línea: los estados se manejan con clases y con
   `dataset`. Es lo que permite sostener `style-src 'self'` sin
   excepciones en la política de seguridad.
   ============================================================ */

export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------- escapado ----------
   TODO lo que venga de la base pasa por aquí antes de tocar el
   HTML. Un concepto de gasto es texto que escribió una persona, y
   una persona puede escribir cualquier cosa. */
export const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- números ----------

   EL SÍMBOLO Y EL AGRUPADO NO VIVEN AQUÍ. Vivían: esta hoja tenía su
   propia tabla de seis símbolos y su propio `Intl` clavado en `es-HN`,
   mientras el núcleo tenía la `L` escrita a mano dentro de `fmt`. Dos
   tablas separadas se separan de verdad, y esta ya lo había hecho: en un
   hogar en dólares las fichas del Resumen decían «$ 12,480.00» y el
   Diagnóstico, tres centímetros más abajo, «L 12,480.00».

   Ahora las dos salen de `nucleo/base.js`, que es quien escribe las
   frases donde van metidas esas cifras. Es el mismo criterio que ya se
   aplicó a las categorías de gasto: una lista, un lugar. */

import { fmt, fmt0, MONEDAS as MONEDAS_NUCLEO, fijarMoneda as fijarMonedaNucleo, simboloMoneda }
  from './nucleo/index.js';

/** Se llama una vez, al cargar el hogar. Manda para el núcleo y para acá. */
export const fijarMoneda = m => fijarMonedaNucleo(m);
export const simbolo = () => simboloMoneda();

export const dinero  = n => fmt(n);
export const redondo = n => fmt0(n);
export const pct     = n => `${Math.round((Number(n) || 0) * 100)}%`;

/* ---------- fechas ---------- */

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export const nombreMes = per => {
  const [y, m] = String(per).split('-');
  return `${cap(MESES[+m - 1] || '')} ${y}`;
};

/** El período en corto: «Sep 2026». En un teléfono de 360 px el rótulo
    completo no cabe junto al título y los controles, y lo que sobraba
    empujaba la página entera a lo ancho. Tres letras dicen lo mismo. */
export const nombreMesCorto = per => {
  const [y, m] = String(per).split('-');
  return `${cap(MES_CORTO[+m - 1] || '')} ${y}`;
};

/** El mes en tres letras, para las marcas de una gráfica. */
export const mesCorto = per => MES_CORTO[+String(per).split('-')[1] - 1] || '';

export const diaCorto = f => {
  if (!f) return '';
  const [, m, d] = String(f).split('-');
  return `${+d} ${MES_CORTO[+m - 1]}`;
};

/** Hoy en fecha local. Nunca `toISOString()`: eso da UTC, y en
    Honduras a partir de las seis de la tarde devuelve mañana. */
export function hoyLocal() {
  const d = new Date();
  const dd = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
}

/** El mes de hoy, para los campos `type="month"`. */
export const mesLocal = () => hoyLocal().slice(0, 7);

/* ---------- vocabulario compartido ----------

   Las categorías viven aquí y no en cada pantalla: el asistente las
   ofrece al arrancar y el editor de gastos las vuelve a ofrecer
   después. Dos listas separadas se separan de verdad en cuanto
   alguien agrega una en un solo lado, y entonces un gasto cambia de
   categoría sin que nadie lo haya tocado. */
export const CATEGORIAS = ['Alimentación', 'Servicios', 'Transporte', 'Salud',
                           'Hogar', 'Educación', 'Otros'];

/* Una moneda por hogar, sin conversión: convertir necesita tipo de cambio
   con fecha y una columna `moneda` por cuenta, y eso es otra cosa.

   La lista NO se escribe acá: se deriva de la tabla del núcleo, que es la
   que sabe símbolo, decimales y agrupado de cada una. Escribirla dos veces
   fue justo lo que dejó al selector ofreciendo seis monedas mientras las
   cifras salían todas en lempiras. */
export const MONEDAS = Object.entries(MONEDAS_NUCLEO)
  .map(([valor, m]) => ({ valor, texto: `${m.nombre} (${m.simbolo})` }));

/* ---------- avisos ---------- */

let tiempoAviso = null;

/** Mensaje breve al pie. Para confirmar que algo se guardó. */
export function avisar(texto, tono = 'ok') {
  let caja = $('#aviso-flotante');
  if (!caja) {
    caja = document.createElement('div');
    caja.id = 'aviso-flotante';
    caja.className = 'flotante';
    caja.setAttribute('role', 'status');
    document.body.appendChild(caja);
  }
  caja.textContent = texto;
  caja.dataset.tono = tono;
  caja.dataset.visible = 'si';
  clearTimeout(tiempoAviso);
  tiempoAviso = setTimeout(() => { caja.dataset.visible = 'no'; }, 3200);
}

/* ---------- la hoja de formularios ----------

   Un diálogo que en teléfono sube desde abajo y en pantalla grande
   se centra. Y que CRECE con la pantalla: la especificación es
   explícita en que un diálogo no se queda en 560 px cuando hay
   1600 disponibles. */

let alCerrarHoja = null;

export function hoja(titulo, cuerpoHTML, { alGuardar, textoGuardar = 'Guardar', alBorrar, ancha = false } = {}) {
  cerrarHoja();

  const fondo = document.createElement('div');
  fondo.className = 'hoja';
  fondo.dataset.ancha = ancha ? 'si' : 'no';
  fondo.innerHTML = `
    <div class="hoja__fondo" data-cerrar></div>
    <div class="hoja__caja" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <header class="hoja__tope">
        <h2>${esc(titulo)}</h2>
        <button class="iconbtn" type="button" data-cerrar aria-label="Cerrar">✕</button>
      </header>
      <form class="hoja__cuerpo" novalidate>
        ${cuerpoHTML}
        <p class="aviso aviso--error" data-error hidden role="alert"></p>
        <div class="hoja__pie">
          <button class="boton boton--principal" type="submit">${esc(textoGuardar)}</button>
          ${alBorrar ? '<button class="boton boton--peligro" type="button" data-borrar>Eliminar</button>' : ''}
        </div>
      </form>
    </div>`;

  document.body.appendChild(fondo);
  document.body.dataset.hoja = 'abierta';

  const forma = $('form', fondo);
  const error = $('[data-error]', fondo);
  const enviar = $('button[type="submit"]', fondo);

  const fallo = m => { error.textContent = m; error.hidden = false; };

  forma.addEventListener('submit', async e => {
    e.preventDefault();
    error.hidden = true;
    enviar.disabled = true;
    const antes = enviar.textContent;
    enviar.textContent = 'Guardando…';
    try {
      const ok = await alGuardar(datosDeForma(forma), fallo);
      if (ok !== false) cerrarHoja();
    } catch (err) {
      fallo(err.message || 'No se pudo guardar.');
    } finally {
      enviar.disabled = false;
      enviar.textContent = antes;
    }
  });

  if (alBorrar) {
    $('[data-borrar]', fondo).addEventListener('click', async () => {
      // Sin ventana de confirmación del navegador: se pregunta en la
      // misma hoja, con el nombre de lo que se va a borrar.
      const b = $('[data-borrar]', fondo);
      if (b.dataset.seguro !== 'si') {
        b.dataset.seguro = 'si';
        b.textContent = 'Tocá otra vez para eliminar';
        return;
      }
      try { await alBorrar(); cerrarHoja(); }
      catch (err) { fallo(err.message || 'No se pudo eliminar.'); }
    });
  }

  $$('[data-cerrar]', fondo).forEach(x => x.addEventListener('click', cerrarHoja));

  // Escape cierra. Es lo que la gente intenta primero.
  alCerrarHoja = e => { if (e.key === 'Escape') cerrarHoja(); };
  document.addEventListener('keydown', alCerrarHoja);

  const primero = $('input, select, textarea', forma);
  if (primero) primero.focus();

  return fondo;
}

export function cerrarHoja() {
  const h = $('.hoja');
  if (h) h.remove();
  delete document.body.dataset.hoja;
  if (alCerrarHoja) { document.removeEventListener('keydown', alCerrarHoja); alCerrarHoja = null; }
}

/** Lee una forma como objeto. Los números vuelven como números. */
export function datosDeForma(forma) {
  const d = {};
  $$('[name]', forma).forEach(c => {
    if (c.type === 'checkbox') d[c.name] = c.checked;
    else if (c.type === 'number') d[c.name] = c.value === '' ? null : Number(c.value);
    else d[c.name] = c.value.trim();
  });
  return d;
}

/* ---------- campos ---------- */

export const campo = (nombre, etiqueta, atributos = '', ayuda = '') => `
  <label class="campo">
    <span>${esc(etiqueta)}</span>
    <input name="${esc(nombre)}" ${atributos}>
    ${ayuda ? `<small class="campo__ayuda">${esc(ayuda)}</small>` : ''}
  </label>`;

export const campoMonto = (nombre, etiqueta, valor = '', ayuda = '') =>
  campo(nombre, etiqueta,
    `type="number" inputmode="decimal" step="0.01" value="${esc(valor)}" placeholder="0.00"`, ayuda);

export const selector = (nombre, etiqueta, opciones, valor = '', ayuda = '') => `
  <label class="campo">
    <span>${esc(etiqueta)}</span>
    <select name="${esc(nombre)}">
      ${opciones.map(o => `<option value="${esc(o.valor)}"${String(o.valor) === String(valor) ? ' selected' : ''}>${esc(o.texto)}</option>`).join('')}
    </select>
    ${ayuda ? `<small class="campo__ayuda">${esc(ayuda)}</small>` : ''}
  </label>`;

/* ---------- estados de pantalla ---------- */

export const cargando = texto => `<div class="cargando"><p>${esc(texto || 'Cargando…')}</p></div>`;

export const vacio = (titulo, texto, accion) => `
  <div class="vacio">
    <h2>${esc(titulo)}</h2>
    <p>${esc(texto)}</p>
    ${accion ? `<button class="boton boton--principal" type="button" data-accion="${esc(accion.accion)}">${esc(accion.texto)}</button>` : ''}
  </div>`;
