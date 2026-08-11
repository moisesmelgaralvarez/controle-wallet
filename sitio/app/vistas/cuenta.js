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

import { $, esc, avisar, campo, nombreMes } from '../ui.js';
import * as api from '../datos/api.js';
import { CONFIGURACION, POR_MES } from '../datos/armador.js';
import { usuario, salir } from '../datos/api.js';
import { olvidar } from '../datos/hogar.js';
import { olvidarHistorico } from '../datos/historico.js';

/** Todas las tablas del hogar, sin repetir. */
const TABLAS = [...new Set([...CONFIGURACION, ...POR_MES])];

export function cuenta({ contenedor, hogar }) {
  const yo = usuario() || {};

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

      </div>
    </div>`;

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
}
