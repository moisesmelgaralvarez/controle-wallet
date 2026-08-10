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

/* ---------- números ---------- */

let moneda = 'HNL';
const SIMBOLO = { HNL: 'L', USD: '$', EUR: '€', MXN: '$', GTQ: 'Q', CRC: '₡' };

export const fijarMoneda = m => { moneda = m || 'HNL'; };
export const simbolo = () => SIMBOLO[moneda] || moneda;

const nf2 = new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-HN', { maximumFractionDigits: 0 });

export const dinero  = n => `${simbolo()} ${nf2.format(Number(n) || 0)}`;
export const redondo = n => `${simbolo()} ${nf0.format(Math.round(Number(n) || 0))}`;
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

/* Una moneda por hogar, sin conversión: eso es fase 2. La lista está
   aquí por lo mismo que las categorías — el asistente la ofrece al
   arrancar y el editor del hogar la vuelve a ofrecer después. */
export const MONEDAS = [
  { valor: 'HNL', texto: 'Lempira (L)' },
  { valor: 'USD', texto: 'Dólar ($)' },
  { valor: 'GTQ', texto: 'Quetzal (Q)' },
  { valor: 'CRC', texto: 'Colón (₡)' },
  { valor: 'MXN', texto: 'Peso mexicano ($)' },
  { valor: 'EUR', texto: 'Euro (€)' }
];

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
