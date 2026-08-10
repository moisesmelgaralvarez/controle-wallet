/* ============================================================
   Cierre de mes — dar el mes por bueno, y que quede firme.

   Es la pantalla que convierte un mes en historia. Hasta que se
   cierra, el plan de un mes viejo es el plan de HOY: bajar el
   presupuesto de comida en septiembre haría parecer que en agosto se
   pasaron. Cerrar le saca la foto al plan que de verdad rigió, y esa
   foto ya no se mueve.

   CERRAR NO ES MARCAR UNA CASILLA. Son dos candados, y los dos están
   ahí porque un cierre flojo no sirve de nada:

   1. LAS TRES CONCILIACIONES. Lo que la app calcula contra lo que
      declaró el banco —cuenta por cuenta, tarjeta por tarjeta— y
      contra lo que hay en la mano. Un descuadre que se deja pasar no
      se queda quieto: el mes siguiente arranca con él encima y ya
      nadie sabe de dónde salió.

   2. LOS EXCESOS, EXPLICADOS. Un rubro que se pasó y no dice por qué
      es, dentro de tres meses, indistinguible de un descuido.

   Un descuadre se puede resolver de dos maneras: que cuadre, o que
   alguien lo reconozca y lo explique. Lo segundo también es
   información — lo que no vale es esconderlo.

   POR QUÉ ESTA PANTALLA ESPERA AL SERVIDOR

   Por lo mismo que Historia, y por una razón más. La obvia: con qué
   saldos arrancó el mes sale de recorrer todo lo anterior mientras
   nadie haya cerrado el mes previo. La fina: el ciclo de una tarjeta
   va de corte a corte, así que agarra días del mes pasado, y el
   navegador solo baja el mes en curso — la conciliación de la tarjeta
   se quedaría sin los pagos de esa cola. Las dos inventan un
   descuadre, y un descuadre inventado bloquea un cierre que sí
   cuadraba. Peor que no dar el dato es dar uno falso con un botón al
   lado.

   Y UNA VEZ CERRADO EL PRIMERO, LA CADENA SE SOSTIENE SOLA: cerrar
   siembra en el mes siguiente la foto de cómo terminó este, así que
   el próximo cierre ya no tiene que deducir nada.
   ============================================================ */

import {
  $, $$, esc, dinero, pct, nombreMes, diaCorto, cargando, avisar
} from '../ui.js';
import { sumaMeses, rangoPeriodo, inicioMes } from '../nucleo/fechas.js';
import { historico } from '../datos/historico.js';
import { guardarAvance, cerrarMes, reabrirMes, ErrorSiguienteCerrado } from '../datos/cierre.js';

/**
 * Un rubro del mes: lo planeado contra lo gastado.
 *
 * Con el mes cerrado la nota se enseña como texto y no como campo. Un
 * campo editable sobre un mes cerrado promete algo que la base va a
 * rechazar, y quien lo descubre escribiendo pierde lo que escribió.
 */
const filaRubro = (f, cerrado) => `
  <li class="cierre-rubro" data-tono="${f.excedido ? 'mal' : 'ok'}">
    <div class="cierre-rubro__tope">
      <span class="cierre-rubro__t">
        <strong>${esc(f.concepto)}</strong>
        <small>${esc(dinero(f.real))} de ${esc(dinero(f.plan))}
          ${f.plan > 0 ? `· ${esc(pct(f.pct))}` : '· sin presupuesto'}</small>
      </span>
      <span class="cierre-rubro__v ${f.excedido ? 'mal' : 'bien'}">
        ${esc(dinero(Math.abs(f.diferencia)))}
        <!-- La palabra, no el signo. Un «L -300.00» en verde se lee un
             instante como que FALTAN 300, cuando significa lo contrario:
             gastaron 300 menos de lo planeado. En una app de dinero ese
             instante es todo el problema. -->
        <small>${f.diferencia > 0 ? 'de más' : f.diferencia < 0 ? 'de menos' : 'exacto'}</small>
      </span>
    </div>
    ${cerrado
      ? (f.nota ? `<p class="conc__resuelto">${esc(f.nota)}</p>` : '')
      : (f.excedido ? `
        <label class="campo campo--pegado">
          <span>Por qué se pasó</span>
          <input data-nota="${esc(f.gastoId)}" value="${esc(f.nota)}"
                 placeholder="Se adelantó la compra del mes, cumpleaños…">
        </label>` : '')}
  </li>`;

/**
 * Una conciliación, con su ventana de fechas escrita.
 *
 * La ventana no es decoración: crédito y débito NO comparten
 * periodicidad —uno va de corte a corte y el otro por el mes del
 * hogar— y leer una cifra creyendo que corresponde al otro rango es
 * el error que más caro sale de esta pantalla.
 */
const filaConciliacion = (x, cerrado) => `
  <li class="conc" data-estado="${x.resuelta ? 'ok' : x.sinDeclarar ? 'falta' : 'mal'}">
    <div class="conc__tope">
      <span class="conc__t">
        <strong>${esc(x.nombre)}</strong>
        <small>${esc(x.ventana)} · ${esc(diaCorto(x.desde))} a ${esc(diaCorto(x.hasta))}</small>
      </span>
      <span class="conc__v">${x.sinDeclarar
        ? '<em class="conc__falta">falta el dato</em>'
        : `${esc(dinero(Math.abs(x.diferencia)))}<small>${
             Math.abs(x.diferencia) < 0.005 ? 'cuadra' :
             x.diferencia > 0 ? 'de más en la app' : 'de menos en la app'}</small>`}</span>
    </div>

    <div class="conc__cuentas">
      <span>Arranque <b>${esc(dinero(x.apertura))}</b></span>
      <span>La app calcula <b>${esc(dinero(x.calculado))}</b></span>
      <span>${x.declarado == null ? 'Nadie ha declarado el saldo'
                                  : `Declarado <b>${esc(dinero(x.declarado))}</b>`}</span>
    </div>

    ${x.imposible ? `<p class="aviso aviso--error">
      Da efectivo negativo, y eso no existe. Falta anotar un retiro, o un gasto
      quedó marcado como efectivo cuando fue con tarjeta.</p>` : ''}

    ${x.anclaVieja ? `<p class="aviso aviso--ojo">
      El saldo declarado es anterior al corte de este ciclo, así que ya no
      describe la deuda de hoy.</p>` : ''}

    ${x.clave === 'efectivo' && !cerrado ? `
      <label class="campo campo--pegado">
        <span>¿Cuánto hay en la mano?</span>
        <input data-contado type="number" inputmode="decimal" step="0.01" min="0"
               value="${esc(x.declarado == null ? '' : x.declarado)}" placeholder="0.00">
        <small class="campo__ayuda">Contado de verdad. Es el único ancla que
          tiene el efectivo: no hay banco que lo declare.</small>
      </label>` : ''}

    ${!x.resuelta && !x.sinDeclarar && !cerrado ? `
      <div class="conc__ajuste">
        <p class="conc__ajuste-d">Si el descuadre es real y ya sabés de qué es,
          anotalo: un descuadre explicado es historia, uno escondido no.</p>
        <label class="campo campo--pegado">
          <span>Ajuste</span>
          <input data-ajuste-monto="${esc(x.clave)}" type="number" inputmode="decimal" step="0.01"
                 value="${esc(x.ajuste ? x.ajuste.monto : x.diferencia)}">
        </label>
        <label class="campo campo--pegado">
          <span>De qué fue</span>
          <input data-ajuste-nota="${esc(x.clave)}" value="${esc(x.ajuste ? x.ajuste.nota : '')}"
                 placeholder="Comisión que no anotamos, un gasto duplicado…">
        </label>
      </div>` : ''}

    ${x.resuelta && x.ajuste && x.ajuste.nota ? `
      <p class="conc__resuelto">Ajustado por ${esc(dinero(x.ajuste.monto))}:
        ${esc(x.ajuste.nota)}</p>` : ''}
  </li>`;


export function cierre({ contenedor, D, periodo, hogar, recargar }) {
  let datos = null;
  let fallo = null;
  let mio = null;

  /* ---------- lo que dice el formulario ahora mismo ---------- */

  function leerFormulario() {
    const notas = {};
    $$('[data-nota]', contenedor).forEach(i => {
      const v = i.value.trim();
      if (v) notas[i.dataset.nota] = v;
    });

    const ajustes = {};
    $$('[data-ajuste-nota]', contenedor).forEach(i => {
      const clave = i.dataset.ajusteNota;
      const nota = i.value.trim();
      // Sin explicación el ajuste no vale. No es rigor por rigor: un
      // número suelto que hace cuadrar la cuenta es exactamente lo que
      // esta pantalla existe para no permitir.
      if (!nota) return;
      const m = $(`[data-ajuste-monto="${CSS.escape(clave)}"]`, contenedor);
      ajustes[clave] = { monto: m ? (parseFloat(m.value) || 0) : 0, nota };
    });

    const cont = $('[data-contado]', contenedor);
    return {
      notas, ajustes,
      efectivoContado: cont && cont.value.trim() !== '' ? parseFloat(cont.value) : null
    };
  }

  /* Todo lo que hace falta para escribir. Los números —la foto del
     plan y los saldos que se le siembran al mes siguiente— vienen del
     servidor, calculados sobre el histórico entero. El día en que
     arranca el mes que viene sí sale de aquí: es configuración del
     hogar, no historia, y el navegador la tiene completa. */
  const comun = () => ({
    periodo,
    hogarId: hogar.id,
    montos: datos.paraCerrar.montos,
    saldos: datos.paraCerrar.saldos,
    desdeSiguiente: rangoPeriodo(sumaMeses(periodo, 1), inicioMes(D)).desde,
    ...leerFormulario()
  });

  /* ---------- acciones ---------- */

  async function conAviso(boton, trabajo, exito) {
    const antes = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    try {
      const r = await trabajo();
      avisar(exito(r));
      // `recargar()` vuelve a armar la vista entera desde cero, y el
      // cálculo del servidor ya quedó invalidado por la escritura
      // (`escribir.js`). Repintar aquí además sería pedir dos veces lo
      // mismo y dejar dos pantallas compitiendo por el mismo hueco.
      recargar();
    } catch (e) {
      avisar(e instanceof ErrorSiguienteCerrado
        ? `${nombreMes(e.siguiente)} ya está cerrado, así que no se le puede mover el saldo de arranque. Reabrilo primero.`
        : (e.message || 'No se pudo guardar.'), 'mal');
      boton.disabled = false;
      boton.textContent = antes;
    }
  }

  /* ---------- pintar ---------- */

  function pintar() {
    if (fallo) {
      contenedor.innerHTML = `
        <div class="error-caja">
          <p><strong>No se pudo preparar el cierre</strong></p>
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
      contenedor.innerHTML = cargando('Cuadrando el mes…');
      mio = contenedor.firstElementChild;
      return;
    }

    const c = datos.cierre;
    const conc = c.conciliaciones;
    const excedidos = c.filas.filter(f => f.excedido);

    const resto = c.filas.filter(f => !f.excedido || c.cerrado);

    /* Dos zonas, como el resto de la app: a la izquierda el trabajo
       —conciliar y explicar—, a la derecha el resultado y el botón. En
       una sola columna a 1440 los párrafos salían de 1300 px y los
       campos de texto ocupaban la pantalla entera. Medido, no a ojo. */
    contenedor.innerHTML = `
      <div class="zonas">
        <div class="pila">

          <section class="panel">
            <div class="panel__tope"><h2>Las tres conciliaciones</h2></div>
            <p class="panel__nota">Cada una lleva escrita su ventana de fechas. La de una
              tarjeta va de corte a corte y la de una cuenta por el mes del hogar: no son
              el mismo período, y confundirlos es el error más caro de esta pantalla.</p>
            <ul class="lista-conc">
              ${conc.todas.map(x => filaConciliacion(x, c.cerrado)).join('')}
            </ul>
          </section>

          ${excedidos.length && !c.cerrado ? `
            <section class="panel">
              <div class="panel__tope"><h2>Lo que se pasó</h2></div>
              <p class="panel__nota">Un exceso explicado hoy es información dentro de tres
                meses. Sin explicación, es indistinguible de un descuido.</p>
              <ul class="lista-cierre">${excedidos.map(f => filaRubro(f, false)).join('')}</ul>
            </section>` : ''}

          ${/* Un panel con una lista vacía no informa de nada y hace
                creer que algo no cargó. */ resto.length ? `
            <section class="panel">
              <div class="panel__tope"><h2>Rubro por rubro</h2></div>
              <ul class="lista-cierre">
                ${resto.map(f => filaRubro(f, c.cerrado)).join('')}
              </ul>
            </section>` : ''}

        </div>
        <div class="pila">

          <section class="panel destacado">
            <span class="destacado__t">${c.cerrado
              ? `${esc(nombreMes(periodo))} está cerrado`
              : `Les quedó en ${esc(nombreMes(periodo))}`}</span>
            <div class="destacado__v ${c.quedo < 0 ? 'mal' : 'bien'}">${esc(dinero(c.quedo))}</div>
            <p class="destacado__d">
              Entró ${esc(dinero(c.ingreso))}${c.ingresoConfirmado ? '' : ' <b>estimado</b>'} ·
              gastaron ${esc(dinero(c.gastado))} de ${esc(dinero(c.plan))} planeados.
            </p>
            ${!c.ingresoConfirmado ? `<p class="destacado__d ojo">
              El ingreso de este mes no está confirmado, así que esta cifra usa el monto
              típico. El gasto es real; el ingreso contra el que se resta, no.</p>` : ''}
          </section>

          ${c.cerrado ? `
            <section class="panel">
              <div class="panel__tope"><h2>Cerrado</h2></div>
              <p class="panel__nota">Se cerró el ${esc(diaCorto(String(c.cerradoEl).slice(0, 10)))}.
                Su presupuesto quedó fijo y sus movimientos ya no admiten cambios —
                lo impone la base de datos, no esta pantalla.</p>
              <button class="boton boton--borde" type="button" data-reabrir>Reabrir el mes</button>
              <p class="panel__nota">Reabrir es del propietario del hogar. Lo que ya se
                sembró como arranque del mes siguiente no se borra: mientras esto vuelve
                a cuadrar, sigue siendo la mejor cifra que hay.</p>
            </section>` : `
            <section class="panel">
              ${c.bloqueos.length ? `
                <div class="panel__tope"><h2>Falta para poder cerrar</h2></div>
                <ul class="lista-bloqueos">
                  ${c.bloqueos.map(b => `<li data-tipo="${esc(b.tipo)}">${esc(b.texto)}</li>`).join('')}
                </ul>
                <p class="panel__nota">Un cierre con un descuadre encima no sirve: al mes
                  siguiente la apertura arrastra el error y ya nadie sabe de dónde salió.</p>
                <button class="boton boton--borde" type="button" data-guardar>Guardar lo escrito</button>
              ` : `
                <div class="panel__tope"><h2>Todo cuadra</h2></div>
                <p class="panel__nota">Al cerrar, el plan de ${esc(nombreMes(periodo))} queda
                  fijo y ${esc(nombreMes(sumaMeses(periodo, 1)))} arranca con estos saldos.
                  Sus movimientos dejan de admitir cambios.</p>
                <button class="boton boton--principal" type="button" data-cerrar>Cerrar ${esc(nombreMes(periodo))}</button>
              `}
            </section>`}

        </div>
      </div>`;

    /* ---------- enganches ---------- */

    const g = $('[data-guardar]', contenedor);
    if (g) g.addEventListener('click', () => conAviso(g,
      () => guardarAvance(comun()),
      () => 'Guardado. Lo escrito no se pierde aunque todavía no cuadre.'));

    const x = $('[data-cerrar]', contenedor);
    if (x) x.addEventListener('click', () => conAviso(x,
      () => cerrarMes(comun()),
      r => `${nombreMes(periodo)} cerrado y cuadrado. ${nombreMes(r.sig)} arranca con esos saldos.`));

    const r = $('[data-reabrir]', contenedor);
    if (r) r.addEventListener('click', () => conAviso(r,
      () => reabrirMes({ periodo, hogarId: hogar.id }),
      () => `${nombreMes(periodo)} quedó abierto otra vez.`));

    mio = contenedor.firstElementChild;
  }

  /* ---------- traer ---------- */

  function traer(opciones) {
    historico(periodo, opciones)
      .then(r => { datos = r; fallo = null; })
      .catch(e => { fallo = e.message || 'Falló el cálculo.'; })
      .finally(() => {
        // Solo si esta pantalla sigue puesta: repintar después de que
        // alguien navegó a otra vista le borraría la suya.
        if (mio && contenedor.contains(mio)) pintar();
      });
  }

  pintar();
  traer();
}
