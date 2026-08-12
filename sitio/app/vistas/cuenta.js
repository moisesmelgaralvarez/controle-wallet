/* ============================================================
   Tu cuenta — llevarte todo, o borrarlo todo.

   Existe porque la política de privacidad publicada dice, textualmente,
   que la exportación y el borrado están disponibles «directamente en
   tu panel, sin tener que pedirlos». Una política que promete algo que
   la aplicación no puede hacer no es una política: es una deuda.

   LO QUE SE LLEVA UNA EXPORTACIÓN

   Todo lo del hogar, tal como está guardado, en un archivo que se abre
   con cualquier cosa. No un resumen bonito: los datos. Si mañana esta
   app desaparece, ese archivo tiene que servir para reconstruir el
   presupuesto en otra parte — si no, no es una exportación, es un
   consuelo.

   POR QUÉ EL BORRADO PIDE ESCRIBIR EL CORREO

   Porque no tiene vuelta atrás y ninguna otra cosa lo frena. Un
   «¿estás seguro?» se contesta que sí sin leer; escribir el propio
   correo obliga a detenerse. Y se comprueba también en el servidor: un
   botón deshabilitado en el navegador no es una defensa.

   Lo que NO borra: el hogar, si queda alguien más adentro. Borrar tu
   cuenta no puede destruirle el presupuesto a tu pareja.
   ============================================================ */

import { $, $$, esc, avisar, campo, selector, diaCorto } from '../ui.js';
import * as api from '../datos/api.js';
import { CONFIGURACION, POR_MES } from '../datos/armador.js';
import { usuario, salir } from '../datos/api.js';
import { olvidar } from '../datos/hogar.js';
import { olvidarHistorico } from '../datos/historico.js';
import { crear, borrar } from '../datos/escribir.js';

/** Todas las tablas del hogar, sin repetir. */
const TABLAS = [...new Set([...CONFIGURACION, ...POR_MES])];

export function cuenta({ contenedor, hogar, recargar }) {
  const yo = usuario() || {};
  let miembros = [];
  let invitaciones = [];

  /* Se traen aparte del hogar porque no participan de ningún cálculo:
     el núcleo no sabe de miembros, y bajarlos con el resto haría más
     lenta cada pantalla para un dato que solo se mira aquí. */
  async function traerGente() {
    try {
      await api.llamar('vencer_invitaciones', { p_hogar: hogar.id });
      miembros = await api.leer('miembros', { select: 'usuario_id,rol,creado_en' });
      invitaciones = await api.leer('invitaciones',
        { select: 'id,correo,rol,estado,vence_en,token', order: 'creado_en.desc' });
    } catch (e) {
      avisar(e.message || 'No se pudo traer quiénes están en el hogar.', 'mal');
    }
    pintar();
  }

  const ROLES = [
    { valor: 'miembro',  texto: 'Miembro — puede registrar y editar' },
    { valor: 'lectura',  texto: 'Solo lectura — ve, no toca' }
  ];

  const soyPropietario = () =>
    (miembros.find(m => m.usuario_id === yo.id) || {}).rol === 'propietario';

  function pintar() {
  contenedor.innerHTML = `
    <div class="zonas">
      <div class="pila">

        <section class="panel">
          <div class="panel__tope"><h2>Tu cuenta</h2></div>
          <ul class="lista-cfg">
            <li><div class="fila-cfg fila-cfg--quieta">
              <span class="fila-cfg__t"><strong>Correo</strong></span>
              <span class="fila-cfg__v">${esc(yo.email || '—')}</span>
            </div></li>
            <li><div class="fila-cfg fila-cfg--quieta">
              <span class="fila-cfg__t"><strong>Hogar</strong></span>
              <span class="fila-cfg__v">${esc(hogar?.nombre || '—')}</span>
            </div></li>
            <li><div class="fila-cfg fila-cfg--quieta">
              <span class="fila-cfg__t"><strong>Moneda</strong></span>
              <span class="fila-cfg__v">${esc(hogar?.moneda || 'HNL')}</span>
            </div></li>
          </ul>
        </section>

        <section class="panel">
          <div class="panel__tope"><h2>Llevarte todo</h2></div>
          <p class="panel__nota">Se baja un archivo con <b>todo</b> lo del hogar tal como
            está guardado: personas, cuentas, tarjetas, rubros, movimientos, proyectos y
            los meses cerrados. No es un resumen — son los datos. Si mañana esta app
            desapareciera, con ese archivo se puede reconstruir el presupuesto en otra
            parte.</p>
          <button class="boton boton--principal" type="button" data-exportar>
            Descargar todos mis datos
          </button>
          <p class="panel__nota">Es un archivo de texto (JSON). Guardalo donde guardarías
            un estado de cuenta: tiene la misma clase de información.</p>
        </section>

      </div>
      <div class="pila">

        <section class="panel">
          <div class="panel__tope"><h2>Borrar la cuenta</h2></div>
          <div class="aviso aviso--error">
            <strong>Esto no tiene vuelta atrás</strong>
            <p>Se borra tu usuario y, <b>si sos el único miembro del hogar</b>, también el
               hogar entero con todos sus datos. Si hay alguien más adentro, el hogar
               sigue: borrar tu cuenta no puede destruirle el presupuesto a otra
               persona.</p>
          </div>
          <p class="panel__nota">Antes de borrar, considerá descargar tus datos: después
            no hay de dónde sacarlos.</p>
          ${campo('confirmacion', 'Escribí tu correo para confirmar',
            `placeholder="${esc(yo.email || 'tu@correo.com')}" autocomplete="off"`,
            'No es un trámite: es para que no pase sin querer.')}
          <button class="boton boton--peligro" type="button" data-borrar>
            Borrar mi cuenta para siempre
          </button>
        </section>

        <section class="panel">
          <div class="panel__tope"><h2>Quiénes están en el hogar</h2></div>
          <p class="panel__nota">Un hogar es de dos, casi siempre. Quien entra ve las
            mismas cifras que vos — no una copia, <b>las mismas</b>: si tu pareja anota
            un gasto, aparece en tu pantalla.</p>

          <ul class="lista-cfg">
            ${miembros.map(m => `
              <li><div class="fila-cfg fila-cfg--quieta">
                <span class="fila-cfg__t">
                  <strong>${m.usuario_id === yo.id ? 'Vos' : 'Otra persona'}</strong>
                  <small>desde el ${esc(diaCorto(String(m.creado_en).slice(0, 10)))}</small>
                </span>
                <span class="fila-cfg__v">${esc(m.rol)}</span>
              </div></li>`).join('')}
          </ul>

          ${soyPropietario() ? `
            ${campo('invitado', 'Invitar por correo',
              'type="email" inputmode="email" placeholder="pareja@correo.com" autocomplete="off"',
              'Le llega un enlace. Al abrirlo con su cuenta, entra al hogar.')}
            ${selector('rolInvitado', 'Con qué permiso', ROLES, 'miembro')}
            <button class="boton boton--principal" type="button" data-invitar>Mandar invitación</button>
          ` : `<p class="panel__nota">Solo el propietario del hogar puede invitar.</p>`}

          ${invitaciones.length ? `
            <div class="panel__tope"><h2>Invitaciones</h2></div>
            <ul class="lista-cfg">
              ${invitaciones.map(i => `
                <li><div class="fila-cfg fila-cfg--quieta">
                  <span class="fila-cfg__t">
                    <strong>${esc(i.correo)}</strong>
                    <small>${esc(i.rol)} · ${i.estado === 'pendiente'
                      ? `vence el ${esc(diaCorto(String(i.vence_en).slice(0, 10)))}`
                      : esc(i.estado)}</small>
                  </span>
                  <span class="fila-cfg__v">
                    ${i.estado === 'pendiente' && soyPropietario() ? `
                      <button class="boton boton--borde boton--chico" type="button"
                              data-copiar="${esc(i.token)}">Copiar enlace</button>
                      <button class="boton boton--borde boton--chico" type="button"
                              data-cancelar="${esc(i.id)}">Cancelar</button>` : ''}
                  </span>
                </div></li>`).join('')}
            </ul>
            <p class="panel__nota">El enlace vale <b>siete días</b> y solo sirve en manos de
              esa persona: al abrirlo se comprueba que el correo coincida. Reenviarlo a
              otro no le abre nada.</p>` : ''}
        </section>

      </div>
    </div>`;

  enganchar();
  }

  function enganchar() {

  /* ---------- llevarse todo ---------- */

  $('[data-exportar]', contenedor).addEventListener('click', async e => {
    const b = e.currentTarget;
    b.disabled = true;
    const antes = b.textContent;
    b.textContent = 'Juntando todo…';
    try {
      /* Se piden las tablas SIN filtro de mes: una exportación a medias
         es peor que ninguna, porque parece completa. RLS ya acota al
         hogar propio, así que no hace falta —ni conviene— filtrar aquí. */
      const datos = { hogar, exportado: new Date().toISOString(), version: 1 };
      for (const t of TABLAS) datos[t] = await api.leer(t);

      const nombre = `controle-wallet-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove();
      // Se suelta después de un instante: revocarlo de inmediato corta
      // la descarga en algunos navegadores.
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      const filas = TABLAS.reduce((s, t) => s + (datos[t] || []).length, 0);
      avisar(`Listo: ${filas} registros en ${nombre}.`);
    } catch (err) {
      avisar(err.message || 'No se pudo exportar.', 'mal');
    } finally {
      b.disabled = false;
      b.textContent = antes;
    }
  });

  /* ---------- borrarlo todo ---------- */

  $('[data-borrar]', contenedor).addEventListener('click', async e => {
    const b = e.currentTarget;
    const escrito = ($('[name="confirmacion"]', contenedor).value || '').trim();

    if (escrito.toLowerCase() !== String(yo.email || '').toLowerCase()) {
      return avisar('Escribí tu correo tal cual para confirmar.', 'mal');
    }
    // Segundo toque, en el mismo botón: el primero pudo ser un resbalón.
    if (b.dataset.seguro !== 'si') {
      b.dataset.seguro = 'si';
      b.textContent = 'Tocá otra vez: esto no se puede deshacer';
      return;
    }

    b.disabled = true;
    b.textContent = 'Borrando…';
    try {
      await api.invocar('cuenta', { confirmacion: escrito });
      // No se avisa y se queda: la cuenta ya no existe, así que
      // cualquier pantalla que siguiera abierta mostraría datos de algo
      // que se acaba de borrar.
      olvidar();
      olvidarHistorico();
      await salir().catch(() => {});
      location.replace('/');
    } catch (err) {
      avisar(err.message || 'No se pudo borrar la cuenta.', 'mal');
      b.disabled = false;
      b.dataset.seguro = 'no';
      b.textContent = 'Borrar mi cuenta para siempre';
    }
  });

  /* ---------- invitar ---------- */

  const inv = $('[data-invitar]', contenedor);
  if (inv) inv.addEventListener('click', async () => {
    const correo = ($('[name="invitado"]', contenedor).value || '').trim().toLowerCase();
    const rol = $('[name="rolInvitado"]', contenedor).value || 'miembro';

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) {
      return avisar('Escribí un correo válido.', 'mal');
    }
    if (correo === String(yo.email || '').toLowerCase()) {
      return avisar('Ese sos vos: ya estás en el hogar.', 'mal');
    }

    inv.disabled = true;
    const antes = inv.textContent;
    inv.textContent = 'Mandando…';
    try {
      /* La fila la escribe el navegador y RLS exige ser propietario.
         La función solo manda el correo — no decide quién puede
         invitar, porque esa decisión ya la tomó la base. */
      const fila = await crear('invitaciones', { hogar_id: hogar.id, correo, rol });
      const r = await api.invocar('invitar', {
        invitacionId: fila.id, destino: location.origin + '/app/'
      });
      avisar(r.yaTieneCuenta ? r.aviso : `Invitación mandada a ${correo}.`);
      await traerGente();
    } catch (e) {
      avisar(e.message || 'No se pudo mandar la invitación.', 'mal');
    } finally {
      inv.disabled = false;
      inv.textContent = antes;
    }
  });

  /* Copiar el enlace sirve para el caso más común de todos: que el
     correo no llegue, o caiga en spam. Sin esto, una invitación
     perdida no tiene salida. */
  $$('[data-copiar]', contenedor).forEach(b => b.addEventListener('click', async () => {
    const enlace = `${location.origin}/app/#/invitacion/${b.dataset.copiar}`;
    try {
      await navigator.clipboard.writeText(enlace);
      avisar('Enlace copiado. Mandáselo por donde quieras.');
    } catch {
      avisar(enlace, 'ok');
    }
  }));

  $$('[data-cancelar]', contenedor).forEach(b => b.addEventListener('click', async () => {
    try {
      await borrar('invitaciones', b.dataset.cancelar);
      avisar('Invitación cancelada.');
      await traerGente();
    } catch (e) {
      avisar(e.message || 'No se pudo cancelar.', 'mal');
    }
  }));
}

  pintar();
  traerGente();
}
