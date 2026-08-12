/* ============================================================
   Informe del mes — para imprimir, guardar o enseñarle a alguien.

   Es la única pantalla que no sirve para operar la app: sirve para
   SACAR lo que la app sabe y llevárselo. A una reunión con la pareja,
   a un asesor, a un banco que pide ver cómo se administran.

   NO CALCULA NADA POR SU CUENTA. Cada cifra sale del mismo núcleo que
   dibuja el resto de la app. Si un número apareciera aquí distinto al
   de la pantalla, sería un error — y por eso lo que recorre el
   histórico se pide al servidor en vez de estimarlo: un informe con
   cifras «casi buenas» es peor que no tenerlo, porque se imprime y se
   queda.

   POR QUÉ ES UNA PANTALLA Y NO UN ARCHIVO QUE SE BAJA

   Porque el navegador ya sabe imprimir, y guardar como PDF es una
   opción de esa misma ventana. Generar un archivo aparte obligaría a
   mantener un segundo juego de estilos que nadie mira hasta que se
   rompe. Lo que se ve en pantalla es exactamente lo que sale impreso.
   ============================================================ */

import * as A from '../nucleo/index.js';
import {
  $, esc, dinero, pct, nombreMes, diaCorto, cargando, mesCorto
} from '../ui.js';
import { historico } from '../datos/historico.js';

/** Una sección del informe, que no se dibuja si no tiene nada que decir. */
const seccion = (titulo, cuerpo, nota) => !cuerpo ? '' : `
  <section class="panel informe__s">
    <div class="panel__tope"><h2>${esc(titulo)}</h2></div>
    ${nota ? `<p class="panel__nota">${esc(nota)}</p>` : ''}
    ${cuerpo}
  </section>`;

const filas = lista => !lista.length ? '' : `
  <ul class="lista-cfg">
    ${lista.map(f => `
      <li><div class="fila-cfg fila-cfg--quieta">
        <span class="fila-cfg__t">
          <strong>${esc(f.t)}</strong>${f.d ? `<small>${esc(f.d)}</small>` : ''}
        </span>
        <span class="fila-cfg__v ${f.tono || ''}">${esc(f.v)}</span>
      </div></li>`).join('')}
  </ul>`;

export function informe({ contenedor, D, periodo, hogar }) {
  let datos = null;
  let fallo = null;
  let mio = null;

  function pintar() {
    if (fallo) {
      contenedor.innerHTML = `
        <div class="error-caja">
          <p><strong>No se pudo armar el informe</strong></p>
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
      /* Se ESPERA, y se dice. Este informe se imprime: dibujarlo con
         lo que hay y completarlo después dejaría salir por la
         impresora una versión a medias que después nadie distingue de
         la buena. */
      contenedor.innerHTML = cargando('Armando el informe con todo el histórico…');
      mio = contenedor.firstElementChild;
      return;
    }

    const r = A.resumenMes(D, periodo);
    const cat = A.porCategoria(D, periodo);
    const rango = A.rangoPeriodo(periodo, A.inicioMes(D));
    const quienes = (D.personas || []).map(p => p.nombre).filter(Boolean).join(' y ');
    const pat = datos.patrimonio;
    const salud = datos.salud;
    const hist = datos.historia;

    contenedor.innerHTML = `
      <article class="informe">

        <header class="informe__tope">
          <h1>${esc(hogar?.nombre || 'Nuestro hogar')}</h1>
          <p class="informe__sub">Informe de ${esc(nombreMes(periodo))}${
            A.inicioMes(D) === 1 ? '' :
            ` · del ${esc(diaCorto(rango.desde))} al ${esc(diaCorto(rango.hasta))}`}</p>
          ${quienes ? `<p class="informe__sub">${esc(quienes)}</p>` : ''}
          <p class="informe__sub informe__fuente">Cada cifra sale de lo que ustedes
            registraron. Calculado sobre ${esc((datos.filasUsadas || {}).movimientos || 0)}
            movimientos.</p>
        </header>

        <button class="boton boton--principal informe__imprimir" type="button" data-imprimir>
          Imprimir o guardar como PDF
        </button>

        ${seccion('Dónde están parados', !datos.carta?.parrafos?.length ? '' : `
          <div class="informe__prosa">
            ${datos.carta.parrafos.map(x => `
              <h3>${esc(x.titulo || '')}</h3>
              <p>${esc(x.texto || '')}</p>`).join('')}
          </div>`,
          'La lectura de un asesor sobre estos números.')}

        ${seccion('Qué conviene hacer, en orden', !salud?.pasos?.length ? '' : `
          <ol class="pasos">
            ${salud.pasos.map(x => `
              <li data-nivel="${esc(x.nivel || 'good')}">
                <strong>${esc(x.titulo || '')}</strong>
                <p>${esc(x.texto || '')}</p>
              </li>`).join('')}
          </ol>`,
          'El orden ES el consejo: apartar para una meta mientras una tarjeta revuelve al 50% anual es perder dinero todos los meses, por disciplinado que se sienta.')}

        ${seccion('El capital', !pat?.hayDatos ? '' : filas([
          { t: 'Lo que tienen menos lo que deben', v: dinero(pat.neto),
            tono: pat.neto < 0 ? 'mal' : 'bien' },
          { t: 'En el banco', d: 'sumando todas las cuentas', v: dinero(pat.enBanco) },
          { t: 'Efectivo en mano', v: dinero(pat.enMano) },
          { t: 'Deuda de tarjetas', v: dinero(pat.enTarjetas), tono: 'mal' },
          { t: 'Financiamientos', v: dinero(pat.enFinanciamientos), tono: 'mal' }
        ]), 'La cifra que no se puede maquillar: el disponible del mes puede verse bien con la tarjeta reventada.')}

        ${pat && !pat.hayDatos ? `<p class="aviso aviso--ojo">
          <strong>El capital no se puede calcular todavía</strong>
          Falta declarar el saldo de ${esc((pat.faltanCuentas || []).concat(pat.faltanSaldosTarjeta || [])
            .map(x => x.nombre || x).join(', ') || 'las cuentas')}. Sin eso, cualquier cifra
          de capital sería creíble y falsa.</p>` : ''}

        ${seccion('El mes', filas([
          { t: 'Ingreso neto', d: r.confirmado ? 'confirmado' : 'estimado del plan', v: dinero(r.neto) },
          { t: 'Gastos del plan', v: dinero(r.gastos) },
          { t: 'Cuotas de financiamiento', v: dinero(r.cuotas || 0) },
          { t: 'Disponible real', v: dinero(r.disponible),
            tono: r.disponible < 0 ? 'mal' : 'bien' }
        ]), 'Lo que entra, lo que está comprometido, y lo que queda de verdad.')}

        ${seccion('En qué se fue', filas(cat.filas.map(f => ({
          t: f.categoria, d: `${pct(f.pct)} del gasto · ${f.movimientos} ${f.movimientos === 1 ? 'registro' : 'registros'}`,
          v: dinero(f.monto)
        }))), 'Por categoría, con lo registrado en el mes.')}

        ${seccion('El colchón', !salud ? '' : filas([
          { t: 'Meses de gasto cubiertos', v: `${(salud.mesesColchon ?? 0).toFixed(1)} meses`,
            tono: (salud.mesesColchon ?? 0) < 3 ? 'mal' : 'bien' },
          { t: 'Líquido disponible', v: dinero(salud.liquido) },
          { t: 'Lo recomendado', d: `${A.MESES_COLCHON} meses de gasto`, v: dinero(salud.metaColchon) },
          { t: 'Lo que cuesta la deuda al mes', v: dinero(salud.interesMensual), tono: 'mal' },
          { t: 'Y al año', v: dinero(salud.interesAnual), tono: 'mal' }
        ]), 'Cuánto aguantaría el hogar sin ingresos. Tres meses es lo que recomienda cualquier manual.')}

        ${seccion('Mes a mes', !hist?.filas?.length ? '' : filas(
          hist.filas.slice().reverse().map(f => ({
            t: nombreMes(f.per) + (f.enCurso ? ' (en curso)' : ''),
            d: `${dinero(f.ingreso)} entró · ${dinero(f.gastado)} gastado`,
            v: dinero(f.quedo), tono: f.quedo < 0 ? 'mal' : 'bien'
          }))),
          hist.mesesCerrados > 1
            ? `Sobre ${hist.mesesCerrados} meses cerrados. El mes en curso no entra en el promedio.`
            : 'El mes en curso no entra en el promedio: lleva unos días contra meses enteros.')}

        ${seccion('Las metas', !Object.keys(datos.cartera || {}).length ? '' : filas(
          (D.proyectos || []).filter(p => datos.cartera[p.id]).map(p => {
            const ev = datos.cartera[p.id];
            return { t: p.nombre,
                     d: `${A.VEREDICTOS?.[ev.veredicto] || ev.veredicto || ''}${
                       ev.mesesMin ? ` · ${ev.mesesMin} meses` : ''}`,
                     v: dinero(ev.faltaMin ?? 0) };
          })), 'Cuánto falta para cada una, y el veredicto según el colchón y la deuda que hay hoy.')}

        <footer class="informe__pie">
          <p>Generado por Controle Wallet el ${esc(diaCorto(new Date().toISOString().slice(0, 10)))}.
             Ninguna cifra de este documento se estimó: todas salen de lo registrado.</p>
        </footer>
      </article>`;

    $('[data-imprimir]', contenedor).addEventListener('click', () => window.print());
    mio = contenedor.firstElementChild;
  }

  function traer(opciones) {
    historico(periodo, opciones)
      .then(x => { datos = x; fallo = null; })
      .catch(e => { fallo = e.message || 'Falló el cálculo.'; })
      .finally(() => { if (mio && contenedor.contains(mio)) pintar(); });
  }

  pintar();
  traer();
}
