/* ============================================================
   Historia — mes a mes, y qué queda de verdad.

   La pregunta que ninguna otra pantalla contesta: ¿este hogar avanza?
   El Resumen dice cómo va el mes; esto dice cómo van los meses.

   POR QUÉ ESTA SÍ ESPERA AL SERVIDOR

   Proyectos pinta de inmediato y sube el veredicto cuando llega la
   respuesta, porque lo que dibuja de entrada —avance, cuota, plazo—
   ya es cierto con el mes cargado. Aquí no hay nada equivalente: la
   historia ES el histórico, y en el navegador solo vive el mes en
   curso. Dibujar un «promedio» con un mes sería inventarlo, y sobre
   todo se leería como un hecho.

   Así que se espera, se dice que se está esperando, y si el viaje
   falla se ofrece reintentar. Ninguna de las tres cosas es un
   número equivocado.

   EL MES EN CURSO QUEDA FUERA DE LOS PROMEDIOS

   Lo decide el núcleo (`historia`), y conviene saberlo al leer la
   pantalla: lleva unos días de gasto contra meses enteros, así que
   compararlo sería darse una palmada en la espalda por no haber
   terminado el mes. Aparece en la gráfica y en la lista, marcado, y
   no entra en el promedio ni en los récords.

   Y UNA ADVERTENCIA QUE NO SE PUEDE CALLAR

   Un mes sin ingreso confirmado se calcula contra el monto TÍPICO de
   la plantilla. El gasto de ese mes es real; el ingreso contra el que
   se resta, no. Sin decirlo, la cifra se lee como un hecho.
   ============================================================ */

import {
  $, $$, esc, dinero, pct, nombreMes, mesCorto, cargando
} from '../ui.js';
import { historico } from '../datos/historico.js';

/* Cuántos meses mira la pantalla. El núcleo acepta el largo; doce es
   lo que cabe legible en un teléfono y lo que la gente compara. */
const MESES = 12;

export function historia({ contenedor, periodo, recargar }) {
  let datos = null;
  let fallo = null;
  let mio = null;

  /* ---------- piezas ---------- */

  /** La gráfica: ingreso contra gastado, con lo que quedó encima.
      Se dibuja en HTML y CSS —no en SVG— por lo mismo que la vitrina
      del sitio: sigue el modo claro u oscuro, se lee con cualquier
      tamaño de letra y no pesa nada. */
  function grafica(filas) {
    const techo = Math.max(...filas.flatMap(f => [f.ingreso, f.gastado]), 1);
    const alto = v => Math.max(2, Math.round((v / techo) * 100));

    return `
      <div class="grafica" aria-hidden="true">
        ${filas.map(f => `
          <div class="grafica__mes" data-encurso="${f.enCurso ? 'si' : 'no'}">
            <span class="grafica__quedo" data-tono="${f.quedo < 0 ? 'mal' : f.enCurso ? 'tenue' : 'bien'}">
              ${esc(dinero(f.quedo))}
            </span>
            <div class="grafica__barras">
              <i class="grafica__b grafica__b--ingreso" data-alto="${alto(f.ingreso)}"></i>
              <i class="grafica__b grafica__b--gasto"   data-alto="${alto(f.gastado)}"></i>
            </div>
            <span class="grafica__etq">${esc(mesCorto(f.per))}</span>
          </div>`).join('')}
      </div>
      <div class="leyenda">
        <span><i class="leyenda__m leyenda__m--ingreso"></i>Ingreso neto</span>
        <span><i class="leyenda__m leyenda__m--gasto"></i>Gastado</span>
      </div>`;
  }

  function encabezado(h) {
    if (!h.mesesCerrados) {
      return `<p class="aviso aviso--ok">
        Todavía no hay ningún mes cerrado. Cuando termine ${esc(nombreMes(periodo))}
        empieza a compararse y a salir el promedio.</p>`;
    }

    const positivo = h.promedio >= 0;
    const estimados = h.filas.filter(f => !f.enCurso && !f.confirmado).length;

    return `
      <section class="panel destacado">
        <span class="destacado__t">${h.mesesCerrados === 1
          ? 'El mes pasado les quedó' : 'Les queda al mes, en promedio'}</span>
        <div class="destacado__v ${positivo ? 'bien' : 'mal'}">${esc(dinero(h.promedio))}</div>
        <p class="destacado__d">
          ${h.mesesCerrados === 1
            ? 'Con un mes cerrado todavía no hay tendencia. A partir del segundo empieza a verse.'
            : `Sobre ${esc(h.mesesCerrados)} meses cerrados. En total llevan
               <b>${esc(dinero(Math.abs(h.total)))}</b>
               ${positivo ? 'por encima de lo gastado' : 'de más gastado'}.`}
        </p>
        ${estimados ? `<p class="destacado__d ojo">
          El ingreso de ${estimados === 1 ? 'un mes' : `${esc(estimados)} meses`} no está
          confirmado, así que esta cifra usa el monto típico: el gasto es real, el
          ingreso no.</p>` : ''}
      </section>`;
  }

  /* ---------- pintar ---------- */

  function pintar() {
    if (fallo) {
      contenedor.innerHTML = `
        <div class="error-caja">
          <p><strong>No se pudo traer la historia</strong></p>
          <p>${esc(fallo)}</p>
        </div>
        <button class="boton boton--borde" type="button" data-reintentar>Reintentar</button>`;
      $('[data-reintentar]', contenedor).addEventListener('click', () => {
        fallo = null; pintar(); traer({ refrescar: true });
      });
      mio = contenedor.firstElementChild;
      return;
    }

    if (!datos) {
      contenedor.innerHTML = cargando('Juntando los meses…');
      mio = contenedor.firstElementChild;
      return;
    }

    const h = datos.historia || { filas: [], meses: 0 };

    if (!h.meses) {
      contenedor.innerHTML = `
        <div class="vacio">
          <h2>Todavía no hay historia</h2>
          <p>En cuanto confirmen un ingreso o anoten un gasto, este mes empieza a contar.</p>
          <button class="boton boton--principal" type="button" data-ir-movimientos>Registrar un gasto</button>
        </div>`;
      $('[data-ir-movimientos]', contenedor).addEventListener('click',
        () => { location.hash = '#/movimientos'; });
      mio = contenedor.firstElementChild;
      return;
    }

    // Del más nuevo al más viejo: es el orden en que se pregunta.
    const alReves = h.filas.slice().reverse();
    const movimientos = (datos.filasUsadas || {}).movimientos;

    contenedor.innerHTML = `
      ${encabezado(h)}

      ${h.filas.length > 1 ? `
        <section class="panel">
          <div class="panel__tope"><h2>Mes a mes</h2></div>
          ${grafica(h.filas)}
        </section>` : ''}

      ${h.mejor && h.peor ? `
        <section class="fichas-app">
          <article class="ficha-app">
            <span class="ficha-app__t">Mejor mes</span>
            <div class="ficha-app__v bien">${esc(dinero(h.mejor.quedo))}</div>
            <div class="ficha-app__d">${esc(nombreMes(h.mejor.per))}</div>
          </article>
          <article class="ficha-app">
            <span class="ficha-app__t">Mes más apretado</span>
            <div class="ficha-app__v ${h.peor.quedo < 0 ? 'mal' : ''}">${esc(dinero(h.peor.quedo))}</div>
            <div class="ficha-app__d">${esc(nombreMes(h.peor.per))}</div>
          </article>
        </section>` : ''}

      <section class="panel">
        <div class="panel__tope"><h2>Cada mes</h2></div>
        <ul class="lista-cfg">
          ${alReves.map(f => `
            <li>
              <div class="fila-cfg fila-cfg--quieta">
                <span class="fila-cfg__t">
                  <strong>${esc(nombreMes(f.per))}${f.enCurso
                    ? ' <span class="etiqueta">en curso</span>' : ''}${!f.confirmado
                    ? ' <span class="etiqueta">estimado</span>' : ''}</strong>
                  <small>${esc(dinero(f.ingreso))} ${f.confirmado ? 'entró' : 'estimado'} ·
                         ${esc(dinero(f.gastado))} gastado${f.movimientos
                    ? ` · ${esc(f.movimientos)} ${f.movimientos === 1 ? 'registro' : 'registros'}` : ''}</small>
                </span>
                <span class="fila-cfg__v ${f.quedo < 0 ? 'mal' : ''}">
                  ${esc(dinero(f.quedo))}<small>${esc(pct(f.tasa))} del ingreso</small>
                </span>
              </div>
            </li>`).join('')}
        </ul>
        <p class="pulso-app__pie panel__nota">
          Solo aparecen los meses con algo registrado: lo que no se anotó no se
          inventa. El mes en curso se muestra aparte y no entra en el promedio.
          ${movimientos ? `Calculado en el servidor sobre ${esc(movimientos)}
            ${movimientos === 1 ? 'movimiento' : 'movimientos'}.` : ''}
        </p>
      </section>`;

    // Las alturas se aplican aquí y no con `style=` en el HTML: un solo
    // estilo en línea obligaría a abrirle la mano a la CSP.
    $$('[data-alto]', contenedor).forEach(b => { b.style.height = b.dataset.alto + '%'; });
    mio = contenedor.firstElementChild;
  }

  /* ---------- traer ---------- */

  function traer(opciones) {
    historico(periodo, opciones)
      .then(r => { datos = r; fallo = null; })
      .catch(e => { fallo = e.message || 'Falló el cálculo.'; })
      .finally(() => {
        // Solo si esta pantalla sigue puesta. Si alguien navegó a otra
        // vista mientras tanto, repintar aquí le borraría la suya.
        if (mio && contenedor.contains(mio)) pintar();
      });
  }

  pintar();
  traer();
}
