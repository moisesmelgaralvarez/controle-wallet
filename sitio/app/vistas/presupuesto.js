/* ============================================================
   Presupuesto — el plan del hogar, y dónde se cambia.

   El asistente arma el hogar una vez. Hasta hoy eso era todo: para
   corregir un monto había que volver a pasar por el asistente. Esta
   pantalla es donde el plan se edita de aquí en adelante — quiénes
   son, qué entra, en qué se va, con qué tarjeta, en qué cuenta y qué
   cuotas siguen vivas.

   TRES COSAS QUE HACE A PROPÓSITO:

   1. EDITA EL PLAN, NO EL MES. Bajar hoy el presupuesto de comida no
      reescribe agosto hacia atrás: un mes que ya terminó guarda su
      propia foto (`presupuesto_mes`) y esa no se mueve. Lo de aquí
      rige de ahora en adelante, y cuando el mes en curso ya está
      congelado se dice en pantalla.

   2. LOS MONTOS DE INGRESO SON TÍPICOS. La plantilla es una
      estimación; lo que de verdad entró se confirma mes a mes. Van
      rotulados como típicos para que nadie confunda una proyección
      con dinero que ya está en la cuenta.

   3. NO SE ENSEÑA EL SALDO DE LAS CUENTAS. Calcularlo exige recorrer
      TODO el histórico, y en el navegador solo vive el mes en curso:
      un saldo hecho con un mes de datos sería un número creíble y
      falso — de los peores que puede tener una app de dinero. Lo que
      sí se muestra es lo que la persona declaró: con cuánto arranca
      la cuenta y desde qué mes. El saldo llega cuando el servidor
      calcule la historia.
   ============================================================ */

import * as A from '../nucleo/index.js';
import {
  $, $$, esc, dinero, diaCorto, mesLocal, nombreMes, hoja, campo, campoMonto,
  selector, avisar, CATEGORIAS, MONEDAS
} from '../ui.js';
import { crear, actualizar, borrar, fusionar, borrarDonde } from '../datos/escribir.js';
import { FILAS, dijoAlgo } from '../datos/filas.js';
import { historico } from '../datos/historico.js';


/* ============================================================
   Los bloques de persona, que dos formularios comparten.

   El editor del plan y la confirmación del mes preguntan lo mismo —
   bruto y retenciones de cada persona— y se leen igual. Vivían
   duplicados dentro de un formulario; separados, el día que uno
   cambie de forma el otro se queda atrás sin que nada avise.
   ============================================================ */

/** Una fila de retención, vacía o con lo que ya había. */
const filaDed = d => `
  <div class="ded" data-ded>
    <input class="ded__c" data-k="concepto" value="${esc(d ? d.concepto : '')}" placeholder="ISR, seguro…" aria-label="Concepto de la retención">
    <input class="ded__m" data-k="monto" type="number" inputmode="decimal" step="0.01" min="0"
           value="${esc(d ? d.monto : '')}" placeholder="0.00" aria-label="Monto de la retención">
    <button class="iconbtn" type="button" data-quita-ded aria-label="Quitar retención">✕</button>
  </div>`;

/** Lo que dicen los bloques de persona de una hoja, ahora mismo. */
function leerBloques(caja) {
  return $$('[data-persona]', caja).map(b => ({
    personaId: b.dataset.persona,
    bruto: Math.max(0, Number($('[data-k="bruto"]', b).value) || 0),
    deducciones: $$('[data-ded]', b).map(f => ({
      concepto: $('[data-k="concepto"]', f).value.trim() || 'Retención',
      monto: Math.max(0, Number($('[data-k="monto"]', f).value) || 0)
    })).filter(x => x.monto > 0)
  }));
}

/** Agregar y quitar retenciones, con el neto en vivo. */
function engancharDeducciones(caja) {
  const refrescarNetos = () => {
    for (const b of $$('[data-persona]', caja)) {
      const l = leerBloques(caja).find(x => x.personaId === b.dataset.persona);
      const neto = l.bruto - l.deducciones.reduce((s, x) => s + x.monto, 0);
      const pie = $('[data-neto]', b);
      if (!pie) continue;
      // El neto es la cifra que la persona reconoce de su boleta: es
      // contra esa que compara, no contra el bruto.
      pie.textContent = `Neto: ${dinero(neto)}`;
      pie.dataset.tono = neto < 0 ? 'mal' : 'ok';
    }
  };

  caja.addEventListener('click', e => {
    const mas = e.target.closest('[data-mas-ded]');
    if (mas) {
      const cont = $('[data-deds]', mas.closest('[data-persona]'));
      cont.insertAdjacentHTML('beforeend', filaDed(null));
      $$('input', cont).pop().focus();
      return refrescarNetos();
    }
    const quita = e.target.closest('[data-quita-ded]');
    if (quita) { quita.closest('[data-ded]').remove(); refrescarNetos(); }
  });

  caja.addEventListener('input', refrescarNetos);
  refrescarNetos();
}


/* La media por rubro, cacheada por periodo EN EL MÓDULO.

   Esta vista se redibuja invocándose otra vez, así que una variable local
   volvería a arrancar en nulo y a pedir el histórico: bucle infinito y una
   petición por repintado. Acá se guarda con su periodo, y `null` significa
   «todavía no se preguntó». */
let mediaDe = null;      // periodo al que corresponde
let media   = null;      // lo que devolvió el histórico

export function presupuesto({ contenedor, D, periodo, hogar, recargar }) {
  const ctx = { hogarId: hogar.id };
  const r = A.resumenMes(D, periodo);
  const congelado = A.mesCongelado(D, periodo);
  // Un mes cerrado no admite cambios: lo impone la base con un
  // disparador, y aquí se apaga el botón para no prometer lo que el
  // servidor va a rechazar.
  const cerrado = A.mesCerrado(D, periodo);

  const porId = (lista, id) => (lista || []).find(x => x.id === id);
  const nombreDe = (lista, id) => porId(lista, id)?.nombre || '';

  const personas = D.personas || [];
  const cuentas = D.cuentas || [];
  const tarjetas = D.tarjetas || [];
  const gastos = D.gastos || [];
  const pagos = D.plantillaIngresos || [];
  const finan = D.financiamientos || [];
  const credito = tarjetas.filter(t => (t.tipo || 'credito') === 'credito');

  /* ---------- lo que entra, en el mes que se está mirando ----------

     Dos capas, y la pantalla no las puede confundir:

       PLANTILLA   el mes típico. Es lo que alguien tecleó al armar el
                   hogar y lo que se usa mientras nadie confirme.
       CONFIRMADO  lo que de verdad entró ese mes, con el ISR que tocó.

     `lineaDe` ya elige: si el mes tiene su línea, manda esa. Aquí solo
     se rotula de dónde salió cada cifra, que es lo que separa una
     estimación de un hecho. */

  const netoDelMes = ev =>
    personas.reduce((s, p) => s + A.netoLinea(A.lineaDe(D, ev, p.id, periodo)), 0);

  const copiadoDe = ev => ((D.ingresosMes || {})[periodo] || {}).copiado?.[ev.id] || null;

  function estadoDelPago(ev) {
    const quienes = personas
      .filter(p => A.lineaDe(D, ev, p.id, periodo))
      .map(p => esc(p.nombre)).join(' y ');
    const detalle = quienes || 'sin personas asignadas';

    const copia = copiadoDe(ev);
    if (copia) {
      return { confirmado: true, tono: 'espera', rotulo: 'sin revisar',
               pie: `copiado de ${nombreMes(copia).toLowerCase()}`, detalle };
    }
    if (A.eventoConfirmado(D, ev.id, periodo)) {
      return { confirmado: true, tono: 'bien', rotulo: 'confirmado', pie: 'entró', detalle };
    }
    return { confirmado: false, tono: 'neutro', rotulo: 'estimado', pie: 'monto típico', detalle };
  }

  /* Los pagos que se pueden confirmar de un tirón: los que faltan y
     tienen un mes confirmado antes de dónde copiar. */
  const copiables = pagos.filter(ev =>
    !A.eventoConfirmado(D, ev.id, periodo) && A.mesConfirmadoPrevio(D, ev.id, periodo));
  const desdeCopia = copiables.length ? A.mesConfirmadoPrevio(D, copiables[0].id, periodo) : null;
  const totalGastos = gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);

  /* LO QUE SALDRÍA DE PRESUPUESTO SI SE MIRARA LO YA GASTADO.

     VIENE DEL SERVIDOR, y ese detalle es todo. Acá se calculaba con `D`,
     que solo tiene el mes en curso: la mediana de un mes es ese mes, así
     que el botón proponía el gasto de agosto como presupuesto de agosto.
     El dueño lo aplicó y guardó doce rubros con esa cifra — un plan que
     por construcción ya estaba consumido al 100%.

     El mismo defecto ya se había corregido en el Resumen y esta pantalla
     se quedó atrás. Arreglar la mitad de un cálculo es peor que no
     arreglarlo: deja dos pantallas diciendo cosas distintas.

     Empieza en nulo y llega con el viaje al histórico. Sin él no se
     ofrece nada: mejor no proponer que proponer un número falso, y más
     cuando el botón lo ESCRIBE. */
  const sug = mediaDe === periodo ? media : null;

  /* ---------- piezas de la lista ---------- */

  const encabezado = (titulo, accion, texto) => `
    <div class="panel__tope">
      <h2>${esc(titulo)}</h2>
      <button class="boton boton--borde boton--chico" type="button" data-nuevo="${esc(accion)}">${esc(texto)}</button>
    </div>`;

  const fila = (accion, id, titulo, detalle, valor = '', pie = '') => `
    <li>
      <button class="fila-cfg" type="button" data-editar="${esc(accion)}" data-id="${esc(id)}">
        <span class="fila-cfg__t">
          <strong>${titulo}</strong>
          <small>${detalle}</small>
        </span>
        ${valor ? `<span class="fila-cfg__v">${esc(valor)}${pie ? `<small>${esc(pie)}</small>` : ''}</span>` : ''}
      </button>
    </li>`;

  const lista = filas => `<ul class="lista-cfg">${filas.join('')}</ul>`;
  const nada = texto => `<p class="pulso-app__pie">${esc(texto)}</p>`;
  const total = (rotulo, monto) => `
    <div class="total-cfg"><span>${esc(rotulo)}</span><span>${esc(dinero(monto))}</span></div>`;

  /* ---------- pintar ---------- */

  contenedor.innerHTML = `
    ${congelado ? `<p class="aviso aviso--ok">
      Este mes ya quedó congelado con su propio plan. Lo que cambiés aquí rige
      de aquí en adelante y no reescribe el mes en curso.</p>` : ''}

    <div class="zonas">
      <div class="pila">

        <section class="panel">
          ${encabezado('Lo que entra', 'pago', 'Agregar pago')}
          ${pagos.length ? `
            <ul class="lista-cfg">
              ${pagos.map(ev => {
                const e = estadoDelPago(ev);
                return `
                <li>
                  <div class="fila-cfg fila-cfg--quieta">
                    <span class="fila-cfg__t">
                      <strong>${esc(ev.nombre)} <span class="etiqueta">día ${esc(ev.dia)}</span>
                        <span class="sello" data-tono="${esc(e.tono)}">${esc(e.rotulo)}</span></strong>
                      <small>${e.detalle}</small>
                    </span>
                    <span class="fila-cfg__v">${esc(dinero(netoDelMes(ev)))}<small>${esc(e.pie)}</small></span>
                  </div>
                  <div class="fila-cfg__acciones">
                    <button class="boton boton--borde boton--chico" type="button"
                            data-confirmar="${esc(ev.id)}" ${cerrado ? 'disabled' : ''}>
                      ${e.confirmado ? 'Corregir lo recibido' : 'Confirmar lo recibido'}
                    </button>
                    <button class="boton boton--borde boton--chico" type="button"
                            data-editar="pago" data-id="${esc(ev.id)}">Editar el plan</button>
                  </div>
                </li>`;
              }).join('')}
            </ul>
            ${total('Ingreso neto del mes', r.neto)}

            ${copiables.length && !cerrado ? `
              <button class="boton boton--borde boton--bloque" type="button" data-copiar>
                Confirmar ${esc(copiables.length)} ${copiables.length === 1 ? 'pago' : 'pagos'}
                igual que ${esc(nombreMes(desdeCopia))}
              </button>
              <p class="pulso-app__pie panel__nota">
                Copia lo último confirmado y lo da por bueno. Usalo solo si el mes vino
                igual: queda marcado como <b>sin revisar</b> hasta que abras cada pago y
                lo guardes, porque «confirmado» quiere decir que alguien lo miró.
              </p>` : `
              <p class="pulso-app__pie panel__nota">
                La cifra de cada pago es la del <b>mes que estás viendo</b>: lo confirmado
                donde se confirmó, y el monto típico del plan donde todavía no.
              </p>`}`
          : nada('Sin pagos registrados. Sin ellos no hay con qué calcular el mes.')}
        </section>

        <section class="panel">
          ${encabezado('En qué se va', 'gasto', 'Agregar gasto')}
          ${gastos.length ? `
            ${lista(gastos.map(g => fila('gasto', g.id,
              `${esc(g.concepto)}${Number(g.crecimiento) ? ` <span class="etiqueta">+${esc(g.crecimiento)}%/mes</span>` : ''}`,
              `${esc(g.categoria || 'Otros')} · ${(g.medioPago || 'tarjeta') === 'efectivo' ? 'efectivo'
                : 'tarjeta' + (g.tarjetaId ? ' ' + esc(nombreDe(tarjetas, g.tarjetaId)) : '')}`,
              dinero(g.monto), Number(g.monto) ? '' : 'sin monto')))}
            ${total('Total del plan', totalGastos)}`
          : nada('Sin gastos registrados. Comida, servicios, transporte: lo que se va cada mes.')}

          <!-- ==========================================================
               EL PRESUPUESTO QUE SALE DE LO YA GASTADO

               «presupuestoSugerido» existía desde el principio —usa mediana
               en vez de promedio, para que un mes con una compra grande no
               infle el resto, y separa lo recurrente de lo puntual— pero
               solo alimentaba un indicador interno. Nunca se le ofreció a
               nadie.

               Y esa es la razón del arranque en frío que dejó al dueño sin
               entender su propio resumen: sin presupuesto no hay contra qué
               medir lo gastado, el pulso del mes queda en blanco, y la app
               que existe para decir «cómo vamos» no puede decir nada.

               Poner quince cifras a mano, inventadas, es justo lo que este
               producto vino a evitar. Acá están, sacadas de lo que de
               verdad se gastó.
               ========================================================== -->
          ${sug && sug.hayDatos && sug.recurrentes.length ? `
            <div class="sugerido">
              <p class="sugerido__que">
                <strong>Partí de lo que ya gastaste.</strong>
                De ${esc(String(sug.periodos.length))} ${sug.periodos.length === 1 ? 'mes' : 'meses'}
                con movimientos salen estos montos${sug.parcial ? ', y el último va a medias — así que son un piso, no un mes completo' : ''}.
              </p>
              <p class="sugerido__como">
                Es la <strong>mediana</strong>, no el promedio: un mes con una compra
                grande no debe arrastrar el presupuesto de todos los demás. Y lo que
                apareció una sola vez queda fuera — fue un evento, no un costo del mes.
              </p>
              ${lista(sug.recurrentes.slice(0, 8).map(f => fila('gasto', f.gastoId,
                esc(f.concepto),
                `${esc(f.clase === 'fijo' ? 'casi todos los meses' : 'algunos meses')} · hoy ${esc(dinero(f.actual))}`,
                dinero(f.sugerido), 'sugerido')))}
              ${sug.recurrentes.length > 8
                ? `<p class="sugerido__como">y ${esc(String(sug.recurrentes.length - 8))} rubros más.</p>` : ''}
              <div class="acciones">
                <button class="boton boton--principal" type="button" data-aplicar-sugerido>
                  Usar estos montos${sug.recurrentes.length > 8 ? ` (${esc(String(sug.recurrentes.length))} rubros)` : ''}
                </button>
              </div>
              <p class="sugerido__como">
                Cambia solo el monto de cada rubro; no borra ni crea ninguno, y
                después los podés ajustar uno por uno.
              </p>
            </div>` : ''}
        </section>

        <section class="panel">
          ${encabezado('Tarjetas', 'tarjeta', 'Agregar tarjeta')}
          ${tarjetas.length ? lista(tarjetas.map(t => {
            const pago = porId(pagos, t.pagaCon);
            const esCredito = (t.tipo || 'credito') === 'credito';
            const detalle = esCredito
              ? `Corta el ${esc(t.diaCorte)} · ${pago ? 'la paga ' + esc(pago.nombre)
                  : '<em class="ojo">falta decir qué ingreso la paga</em>'}`
              : `De débito${t.cuentaId ? ' · ' + esc(nombreDe(cuentas, t.cuentaId)) : ''}`;
            return fila('tarjeta', t.id, esc(t.nombre), detalle);
          }))
          : nada('Sin tarjetas. Si pagan con una, registrala para vigilar el corte.')}
        </section>

        <section class="panel">
          ${encabezado('Financiamientos', 'financiamiento', 'Agregar')}
          ${finan.length ? `
            ${lista(finan.map(f => {
              const restan = A.cuotasRestantes(f);
              return fila('financiamiento', f.id,
                `${esc(f.nombre)}${restan ? '' : ' <span class="etiqueta">liquidado</span>'}`,
                `${esc(dinero(f.cuotaMensual))} al mes · ${restan
                  ? `${esc(restan)} ${restan === 1 ? 'cuota restante' : 'cuotas restantes'}`
                  : 'sin cuotas pendientes'}`,
                dinero(A.saldoFinanciamiento(f)), 'por pagar');
            }))}
            ${total('Cuota mensual vigente', r.cuotas)}`
          : nada('Sin financiamientos. Compras a cuotas, préstamos con cuota fija.')}
        </section>

        <section class="panel">
          <h2>El mes, en una resta</h2>
          <div class="ciclo-app">
            <div class="ciclo-app__f">
              <em>Ingreso neto${r.confirmado ? ' confirmado' : ' estimado'}</em>
              <span>${esc(dinero(r.neto))}</span>
            </div>
            <div class="ciclo-app__f"><em>− Gastos corrientes</em><span>${esc(dinero(r.corriente))}</span></div>
            ${r.salud ? `<div class="ciclo-app__f"><em>− Fondo de salud</em><span>${esc(dinero(r.salud))}</span></div>` : ''}
            <div class="ciclo-app__f"><em>− Cuotas</em><span>${esc(dinero(r.cuotas))}</span></div>
            <div class="ciclo-app__f total">
              <em>Disponible real</em>
              <span class="${r.disponible >= 0 ? 'bien' : 'mal'}">${esc(dinero(r.disponible))}</span>
            </div>
          </div>
          <p class="pulso-app__pie panel__nota">
            La tarjeta no se resta aquí: es por dónde pasa el gasto, no un gasto
            aparte. Se vigila por su ciclo de corte, en el Resumen.
          </p>
        </section>

      </div>

      <div class="pila">

        <section class="panel">
          ${encabezado('Tu hogar', 'hogar', 'Editar')}
          <div class="ciclo-app">
            <div class="ciclo-app__f"><em>Nombre</em><span>${esc(hogar.nombre || '—')}</span></div>
            <div class="ciclo-app__f"><em>Moneda</em><span>${esc(hogar.moneda || 'HNL')}</span></div>
            <div class="ciclo-app__f">
              <em>Arranca el mes</em>
              <span>${Number(hogar.inicio_mes) > 1 ? `día ${esc(hogar.inicio_mes)}` : 'día 1'}</span>
            </div>
          </div>
        </section>

        <section class="panel">
          ${encabezado('Personas', 'persona', 'Agregar')}
          ${personas.length ? lista(personas.map(p => fila('persona', p.id,
            esc(p.nombre),
            p.cuentaId ? `cobra en ${esc(nombreDe(cuentas, p.cuentaId))}`
              : (cuentas.length ? '<em class="ojo">sin cuenta: lo que reciba no suma a ningún saldo</em>'
                                : 'sin cuenta registrada'),
            dinero(r.porPersona[p.id] || 0), 'este mes')))
          : nada('Sin personas.')}
        </section>

        <section class="panel">
          ${encabezado('Cuentas de banco', 'cuenta', 'Agregar')}
          ${cuentas.length ? lista(cuentas.map(c => {
            const dueños = personas.filter(p => p.cuentaId === c.id);
            return fila('cuenta', c.id, esc(c.nombre),
              dueños.length ? `${esc(dueños.map(p => p.nombre).join(' y '))} ${dueños.length === 1 ? 'cobra' : 'cobran'} aquí`
                : '<em class="ojo">nadie cobra aquí todavía</em>',
              /* EL SALDO QUE DECLARÓ EL BANCO MANDA SOBRE EL DE APERTURA.

                 Acá se enseñaba `saldoInicial` y nada más — el monto con el
                 que arranca la cuenta— y el pie explicaba que no era el saldo
                 de hoy. Todo correcto y todo inútil: quien abre esta pantalla
                 viene a ver cuánto hay.

                 Y la app SÍ lo sabe cuando alguien importó un estado de
                 cuenta: el importador ancla el saldo que declara el banco con
                 su fecha, y eso es un hecho, no una deducción. Tenerlo
                 guardado y no enseñarlo es la peor de las dos opciones. */
              c.saldoBanco && c.saldoBanco.monto != null
                ? dinero(c.saldoBanco.monto)
                : dinero(c.saldoInicial),
              c.saldoBanco && c.saldoBanco.fecha
                ? `según el banco, al ${esc(diaCorto(c.saldoBanco.fecha))}`
                : `apertura · desde ${esc(c.desdeMes || '—')}`);
          }))
          : nada('Sin cuentas. Registrá dónde les depositan.')}
          ${cuentas.length ? `<p class="pulso-app__pie panel__nota">
            ${cuentas.some(c => c.saldoBanco && c.saldoBanco.monto != null)
              ? `Donde dice «según el banco» es el saldo que declaró el estado
                 de cuenta a esa fecha. Donde dice «apertura», nadie ha
                 importado nada todavía y ese es el monto con el que se
                 registró la cuenta, no su saldo de hoy.`
              : `El monto es con el que arranca la cuenta, no su saldo de hoy:
                 importá un estado de cuenta y acá va a aparecer el saldo que
                 declara el banco.`}</p>` : ''}
        </section>

      </div>
    </div>`;

  /* ---------- interacción ---------- */

  const ABRIR = {
    hogar: () => formHogar(),
    persona: id => formPersona(porId(personas, id)),
    cuenta: id => formCuenta(porId(cuentas, id)),
    tarjeta: id => formTarjeta(porId(tarjetas, id)),
    gasto: id => formGasto(porId(gastos, id)),
    financiamiento: id => formFinanciamiento(porId(finan, id)),
    pago: id => formPago(porId(pagos, id))
  };

  /* La media por rubro sale del histórico, que corre en el servidor sobre
     la vida entera del hogar. Se pinta sin ella y se repinta al llegar:
     bloquear la pantalla por un dato de apoyo es cambiar algo que funciona
     por algo que espera. */
  if (mediaDe !== periodo) {
    /* Se marca ANTES de que vuelva la respuesta: si no, cada repintado
       dispararía otro viaje mientras el primero sigue en el aire. */
    mediaDe = periodo;
    media = null;
    historico(periodo)
      .then(x => {
        if (mediaDe !== periodo || !x || !x.sugerido) return;
        media = x.sugerido;
        // Solo si esta pantalla sigue puesta: repintar otra vista le
        // borraría la suya.
        if (contenedor.isConnected) presupuesto({ contenedor, D, periodo, hogar, recargar });
      })
      .catch(() => { mediaDe = null; /* que se pueda reintentar */ });
  }

  $$('[data-nuevo]', contenedor).forEach(b =>
    b.addEventListener('click', () => ABRIR[b.dataset.nuevo](null)));

  $$('[data-editar]', contenedor).forEach(b =>
    b.addEventListener('click', () => ABRIR[b.dataset.editar](b.dataset.id)));

  $$('[data-confirmar]', contenedor).forEach(b =>
    b.addEventListener('click', () => formConfirmar(porId(pagos, b.dataset.confirmar))));

  const botonCopiar = $('[data-copiar]', contenedor);
  if (botonCopiar) botonCopiar.addEventListener('click', copiarDelMesAnterior);

  const botonSugerido = $('[data-aplicar-sugerido]', contenedor);
  if (botonSugerido) botonSugerido.addEventListener('click', aplicarSugerido);

  /* ---------- opciones de los selectores ---------- */

  const sinNada = texto => ({ valor: '', texto });
  const opcPersona = () => personas.map(p => ({ valor: p.id, texto: p.nombre }));
  const opcCuenta  = () => cuentas.map(c => ({ valor: c.id, texto: c.nombre }));
  const opcPago    = () => pagos.map(p => ({ valor: p.id, texto: `${p.nombre} (día ${p.dia})` }));
  const opcTarjeta = () => credito.map(t => ({ valor: t.id, texto: t.nombre }));

  /** Las categorías de siempre, más la que traiga el gasto si es otra. */
  const opcCategoria = actual => {
    const todas = CATEGORIAS.includes(actual) || !actual ? CATEGORIAS : [...CATEGORIAS, actual];
    return todas.map(c => ({ valor: c, texto: c }));
  };

  /**
   * Guardar un formulario simple: arma la fila y crea o actualiza.
   * Un solo camino para «nuevo» y para «editar» es lo que evita que
   * las dos rutas se separen con el tiempo.
   */
  const guardarEn = async (tabla, actual, d, extra = {}) => {
    const f = FILAS[tabla](d, { ...ctx, ...extra });
    if (actual) await actualizar(tabla, actual.id, f, f);
    else await crear(tabla, f);
  };

  /** Eliminar, con el aviso de qué se lleva por delante. */
  const borrarCon = (tabla, x, mensaje) => async () => {
    await borrar(tabla, x.id, x);
    avisar(mensaje);
    recargar();
  };

  /* ============================================================
     Los formularios
     ============================================================ */

  function formHogar() {
    hoja('Tu hogar', `
      ${campo('nombre', 'Nombre del hogar', `value="${esc(hogar.nombre || '')}"`)}
      ${selector('moneda', 'Moneda', MONEDAS, hogar.moneda || 'HNL',
        'Una sola moneda por hogar, sin conversión.')}
      ${campo('inicioMes', '¿Qué día arranca tu mes?',
        `type="number" inputmode="numeric" min="1" max="28" value="${esc(hogar.inicio_mes || 1)}"`,
        'Cambiarlo mueve a qué mes pertenece lo que registrés de ahora en adelante. Lo ya registrado se queda en el mes que le tocó.')}
    `, {
      alGuardar: async (d, fallo) => {
        if (!d.nombre) return fallo('Ponele un nombre a tu hogar.'), false;
        await actualizar('hogares', hogar.id, FILAS.hogares(d));
        avisar('Hogar actualizado.');
        recargar();
      }
    });
  }

  function formPersona(p) {
    // Sin personas la app no calcula nada, y de ahí no se sale desde
    // ninguna pantalla: por eso la última no se puede borrar.
    const sePuedeBorrar = Boolean(p) && personas.length > 1;
    const anotados = p ? (D.movimientos || []).filter(m => m.personaId === p.id).length
                       + (D.retiros || []).filter(x => x.personaId === p.id).length : 0;

    hoja(p ? 'Editar persona' : 'Nueva persona', `
      ${campo('nombre', 'Nombre', `value="${esc(p ? p.nombre : '')}" placeholder="Nombre"`)}
      ${cuentas.length ? selector('cuentaId', 'Dónde le caen los ingresos',
        [sinNada('— sin cuenta —'), ...opcCuenta()], (p && p.cuentaId) || '',
        'Lo que confirme como recibido suma al saldo de esa cuenta.') : ''}
      ${p ? `<p class="hoja__nota">${sePuedeBorrar
        ? `Al eliminarla se borran sus montos de cada pago.${anotados
            ? ` Los ${anotados} ${anotados === 1 ? 'gasto o retiro que anotó se conserva' : 'gastos y retiros que anotó se conservan'}, pero quedan sin dueño.`
            : ''}`
        : 'Es la única persona registrada: sin ella la app no puede calcular nada. Agregá otra antes de eliminarla.'}</p>` : ''}
    `, {
      alBorrar: sePuedeBorrar ? borrarCon('personas', p, 'Persona eliminada.') : null,
      alGuardar: async (d, fallo) => {
        if (!d.nombre) return fallo('Ponele un nombre.'), false;
        await guardarEn('personas', p, d);
        avisar(p ? 'Persona actualizada.' : 'Persona agregada.');
        recargar();
      }
    });
  }

  function formCuenta(c) {
    const dueños = c ? personas.filter(p => p.cuentaId === c.id) : [];
    const ligadas = c ? tarjetas.filter(t => t.cuentaId === c.id) : [];

    hoja(c ? 'Editar cuenta' : 'Nueva cuenta', `
      ${campo('nombre', 'Nombre de la cuenta', `value="${esc(c ? c.nombre : '')}" placeholder="Ficohsa de Moisés"`)}
      ${campo('numero', 'Número de cuenta',
        `value="${esc(c ? c.numero : '')}" inputmode="numeric" placeholder="200012610911"`,
        'Con esto, al importar un estado de cuenta la app sabe sola que es de aquí.')}
      ${campoMonto('saldoInicial', 'Saldo con el que arranca', c ? c.saldoInicial : '',
        'Lo que hay en la cuenta al empezar el mes de abajo. De ahí en adelante la app suma y resta sola.')}
      ${campo('desdeMes', 'Desde qué mes', `type="month" value="${esc(c ? c.desdeMes : mesLocal())}"`,
        'Lo anterior a este mes no se cuenta: ya está dentro del saldo de arriba.')}
      ${campoMonto('retenido', 'Ya gastado, pendiente de salir',
        c && c.retenido ? c.retenido.monto : '',
        'Compras hechas que el comercio todavía no cobra. Ese dinero ya no es suyo: no cuenta como capital ni como colchón. Dejalo vacío para no tocarlo.')}
      ${campoMonto('saldoBanco', 'Saldo que dice el banco',
        c && c.saldoBanco ? c.saldoBanco.monto : '',
        'La cifra del banco manda sobre cualquier suma que haga la app: es contra esto que cuadra el cierre del mes.')}
      ${campo('saldoBancoFecha', 'Fecha de ese saldo',
        `type="date" value="${esc(c && c.saldoBanco ? c.saldoBanco.fecha : '')}"`)}
      ${personas.length ? selector('dueno', '¿A quién le depositan aquí?',
        [sinNada('— a nadie en particular —'), ...opcPersona()], dueños[0]?.id || '',
        dueños.length > 1
          ? `Ahora mismo la comparten ${dueños.map(p => p.nombre).join(' y ')}: al elegir uno, el otro se queda sin cuenta.`
          : 'Sin esto, lo que confirme como recibido no suma a ningún saldo.') : ''}
      ${ligadas.length ? `<p class="hoja__nota">Tarjetas ligadas: ${esc(ligadas.map(t => t.nombre).join(', '))}.</p>` : ''}
    `, {
      alBorrar: c ? borrarCon('cuentas', c, 'Cuenta eliminada.') : null,
      alGuardar: async (d, fallo) => {
        if (!d.nombre) return fallo('Ponele un nombre a la cuenta.'), false;
        if (!d.desdeMes) return fallo('Falta desde qué mes cuenta el saldo.'), false;
        if (dijoAlgo(d.saldoBanco) !== Boolean(d.saldoBancoFecha)) {
          return fallo('El saldo del banco necesita monto y fecha.'), false;
        }

        const f = FILAS.cuentas(d, ctx);
        const guardada = c ? await actualizar('cuentas', c.id, f, f) : await crear('cuentas', f);

        // El dueño se guarda en la PERSONA, no en la cuenta: es la
        // persona la que dice dónde cobra. Se edita desde aquí porque
        // es donde uno está mirando, pero se escribe donde vive.
        if (personas.length) {
          const id = (guardada && guardada.id) || (c && c.id);
          for (const p of personas) {
            if (p.id === d.dueno && p.cuentaId !== id) await actualizar('personas', p.id, { cuenta_id: id });
            else if (p.id !== d.dueno && p.cuentaId === id) await actualizar('personas', p.id, { cuenta_id: null });
          }
        }
        avisar(c ? 'Cuenta actualizada.' : 'Cuenta agregada.');
        recargar();
      }
    });
  }

  function formTarjeta(t) {
    hoja(t ? 'Editar tarjeta' : 'Nueva tarjeta', `
      ${campo('nombre', 'Nombre', `value="${esc(t ? t.nombre : '')}" placeholder="BAC, Ficohsa, Atlántida…"`)}
      ${selector('tipo', 'Qué tipo es', [
        { valor: 'credito', texto: 'De crédito — se paga en el corte' },
        { valor: 'debito',  texto: 'De débito — sale al instante de la cuenta' }
      ], t ? (t.tipo || 'credito') : 'credito',
        'La de débito descuenta del saldo en el momento de la compra; la de crédito no toca la cuenta hasta que se paga el corte.')}
      ${campo('numero', 'Número de la tarjeta',
        `value="${esc(t ? t.numero : '')}" placeholder="5140-00**-****-8941"`,
        'Basta con que coincidan los últimos cuatro. Sirve para enrutar los estados de cuenta.')}
      ${campo('diaCorte', 'Día de corte',
        `type="number" inputmode="numeric" min="1" max="31" value="${esc(t && t.diaCorte ? t.diaCorte : '')}" placeholder="1 a 31"`,
        'El día que cierra el estado de cuenta y queda definido lo que hay que pagar. Solo aplica a las de crédito.')}
      ${campo('diaPago', 'Fecha límite de pago',
        `type="number" inputmode="numeric" min="1" max="31" value="${esc(t && t.diaPago ? t.diaPago : '')}" placeholder="Ej. 27"`,
        'El día hasta el que se puede pagar sin intereses. No es el corte: es lo que viene después.')}
      ${selector('pagaCon', 'Qué pago la cubre',
        [sinNada('— sin asignar —'), ...opcPago()], (t && t.pagaCon) || '',
        'De aquí sale la pregunta que importa cada mes: ¿ese ingreso alcanza a cubrir el corte?')}
      ${cuentas.length ? selector('cuentaId', 'De qué cuenta sale',
        [sinNada('— sin cuenta —'), ...opcCuenta()], (t && t.cuentaId) || '') : ''}
      ${selector('pagaTotal', '¿Pagan el total cada mes?', [
        { valor: 'si', texto: 'Sí, saldamos todo antes de la fecha límite' },
        { valor: 'no', texto: 'No, dejamos saldo revolviendo' }
      ], t && t.pagaTotal === false ? 'no' : 'si',
        'Pagar el total significa cero intereses, sin importar la tasa. Solo cuesta lo que se deja revolver.')}
      ${campoMonto('saldoInicial', 'Cuánto deben hoy en esta tarjeta', t ? t.saldoInicial : '',
        'El saldo que muestra el banco. Sirve para saber la deuda real, no solo el corte del mes.')}
      ${campo('desdeMes', 'Desde qué mes cuenta ese saldo',
        // El mes de hoy se propone solo al CREAR. Al editar una tarjeta
        // que no lo tenía, rellenarlo cambia un número sin que nadie lo
        // haya tocado: `deudaTarjeta` solo cuenta lo que pasó de ese mes
        // en adelante, así que ponerle agosto le borra de la deuda todo
        // lo anterior. Guardar un formulario sin tocarlo no puede mover
        // una cifra.
        `type="month" value="${esc(t ? (t.desdeMes || '') : mesLocal())}"`,
        'Lo anterior a este mes no se cuenta en la deuda: se da por incluido en el saldo de arriba. Dejalo vacío si no querés esa raya.')}
      ${campo('tasaAnual', 'Interés anual (%)',
        `type="number" inputmode="decimal" step="0.1" min="0" max="200" value="${esc(t && t.tasaAnual ? t.tasaAnual : '')}" placeholder="Ej. 55"`,
        'Lo que cobra el banco por revolver saldo. Con esto se puede decir cuánto cuesta al mes no saldarla.')}
      ${campoMonto('retenido', 'Consumos autorizados sin aplicar',
        t && t.retenido ? t.retenido.monto : '',
        'Compras ya hechas que el comercio no ha cobrado, así que todavía no salen en el estado de cuenta. Se deben igual: suman a la deuda, no al capital.')}
      ${campoMonto('saldoBanco', 'Saldo que dice el estado de cuenta',
        t && t.saldoBanco ? t.saldoBanco.monto : '',
        'La cifra del banco manda sobre cualquier suma que haga la app.')}
      ${campo('saldoBancoFecha', 'Fecha de ese saldo',
        `type="date" value="${esc(t && t.saldoBanco ? t.saldoBanco.fecha : '')}"`,
        'Normalmente la fecha de corte. Al importar el estado de cuenta esto se llena solo. El monto y la fecha van juntos: uno sin el otro no sirve para conciliar.')}
    `, {
      ancha: true,
      alBorrar: t ? borrarCon('tarjetas', t, 'Tarjeta eliminada.') : null,
      alGuardar: async (d, fallo) => {
        if (!d.nombre) return fallo('Ponele un nombre.'), false;
        // La base lo exige también, con un `check`: una tarjeta de
        // crédito sin corte no se puede calcular.
        if (d.tipo !== 'debito' && !d.diaCorte) return fallo('Falta el día de corte.'), false;
        if (dijoAlgo(d.saldoBanco) !== Boolean(d.saldoBancoFecha)) {
          return fallo('El saldo del banco necesita monto y fecha.'), false;
        }
        await guardarEn('tarjetas', t, d);
        avisar(t ? 'Tarjeta actualizada.' : 'Tarjeta agregada.');
        recargar();
      }
    });
  }

  function formGasto(g) {
    const sePuedeBorrar = Boolean(g) && gastos.length > 1;
    const anotados = g ? (D.movimientos || []).filter(m => m.gastoId === g.id).length : 0;

    hoja(g ? 'Editar gasto' : 'Nuevo gasto', `
      ${campo('concepto', 'En qué', `value="${esc(g ? g.concepto : '')}" placeholder="Supermercado, energía, pediatra…"`)}
      ${campoMonto('monto', 'Cuánto al mes', g ? g.monto : '')}
      ${selector('categoria', 'Categoría', opcCategoria(g && g.categoria), g ? g.categoria : 'Otros',
        'Los de Salud se apartan en su propio fondo: crecen distinto que el resto.')}
      ${selector('medioPago', 'Cómo se paga', [
        { valor: 'tarjeta',  texto: 'Con tarjeta' },
        { valor: 'efectivo', texto: 'En efectivo' }
      ], g ? g.medioPago : 'tarjeta',
        'No cambia el total del presupuesto; decide cuánto cae en el corte de la tarjeta.')}
      ${credito.length > 1 ? selector('tarjetaId', 'Con cuál tarjeta',
        [...opcTarjeta(), sinNada('— cualquiera —')], g ? (g.tarjetaId || '') : credito[0].id,
        'Solo se ofrecen las de crédito: son las que tienen corte. Con «cualquiera» el gasto se cuenta en el corte de todas, y ahí las cifras se inflan.') : ''}
      ${campo('crecimiento', 'Crecimiento mensual (%)',
        `type="number" inputmode="decimal" step="0.1" min="0" max="20" value="${esc(g ? (g.crecimiento || 0) : 0)}"`,
        'Dejalo en 0 si es estable. Para gastos de salud en aumento, 2 o 3% refleja la tendencia.')}
      ${g && !sePuedeBorrar ? '<p class="hoja__nota">Es el único rubro registrado: sin gastos la app no puede calcular nada. Agregá otro antes de eliminarlo.</p>' : ''}
      ${anotados ? `<p class="hoja__nota">Hay ${anotados} ${anotados === 1 ? 'movimiento anotado' : 'movimientos anotados'} en este rubro. Al eliminarlo se conservan, pero quedan sin clasificar.</p>` : ''}
    `, {
      alBorrar: sePuedeBorrar ? borrarCon('gastos', g, 'Gasto eliminado.') : null,
      alGuardar: async (d, fallo) => {
        if (!d.concepto) return fallo('Ponele un concepto.'), false;

        // Con una sola tarjeta no hay nada que elegir, y el formulario
        // ni pregunta: el gasto va a esa.
        if (credito.length <= 1) d.tarjetaId = g ? g.tarjetaId : (credito[0]?.id || null);

        // Al final de la lista, no encima: el orden es visual pero se
        // guarda, para que se vea igual en los dos teléfonos.
        const orden = g ? null : gastos.reduce((m, x) => Math.max(m, Number(x.orden) || 0), 0) + 1;
        await guardarEn('gastos', g, d, { orden });
        avisar(g ? 'Gasto actualizado.' : 'Gasto agregado.');
        recargar();
      }
    });
  }

  function formFinanciamiento(f) {
    hoja(f ? 'Editar financiamiento' : 'Nuevo financiamiento', `
      ${campo('nombre', 'Qué es', `value="${esc(f ? f.nombre : '')}" placeholder="Refrigeradora a 12 meses…"`)}
      ${campoMonto('cuotaMensual', 'Cuota mensual', f ? f.cuotaMensual : '')}
      ${campo('cuotasTotales', 'Cuotas en total',
        `type="number" inputmode="numeric" min="1" max="600" value="${esc(f ? f.cuotasTotales : '')}" placeholder="12"`)}
      ${campo('cuotasPagadas', 'Cuotas ya pagadas',
        `type="number" inputmode="numeric" min="0" max="600" value="${esc(f ? f.cuotasPagadas : 0)}"`,
        'Con esto se sabe cuándo se libera esa cuota y el disponible sube.')}
    `, {
      alBorrar: f ? borrarCon('financiamientos', f, 'Financiamiento eliminado.') : null,
      alGuardar: async (d, fallo) => {
        if (!d.nombre) return fallo('Ponele un nombre.'), false;
        if (!(d.cuotaMensual > 0)) return fallo('Falta la cuota mensual.'), false;
        if (!(d.cuotasTotales > 0)) return fallo('Falta el total de cuotas.'), false;
        if (d.cuotasPagadas > d.cuotasTotales) {
          return fallo('No puede haber más cuotas pagadas que el total.'), false;
        }
        await guardarEn('financiamientos', f, d);
        avisar(f ? 'Financiamiento actualizado.' : 'Financiamiento agregado.');
        recargar();
      }
    });
  }

  /* ============================================================
     Confirmar lo que entró

     Lo que separa una estimación de un hecho es que alguien lo mire.
     Por eso el formulario viene relleno pero NO se guarda solo: se
     abre con lo último confirmado —que se parece mucho más al mes que
     viene que la plantilla del asistente— y quien confirma sigue
     siendo la persona.
     ============================================================ */

  function formConfirmar(ev) {
    if (!ev) return;

    /* De dónde sale lo que aparece relleno. Se resuelve por persona:
       puede que a una se le copie de junio y a la otra no, porque
       entró al hogar después. */
    const fuentes = personas.map(p => ({ p, ...A.lineaParaConfirmar(D, ev, p.id, periodo) }));
    const deCopia = fuentes.find(f => f.origen === 'copia');
    const yaCopiado = copiadoDe(ev);
    const confirmado = A.eventoConfirmado(D, ev.id, periodo);

    const bloque = ({ p, linea }) => `
      <div class="perbloque" data-persona="${esc(p.id)}">
        <div class="perbloque__t">${esc(p.nombre)}</div>
        <label class="campo">
          <span>Bruto que entró</span>
          <input data-k="bruto" type="number" inputmode="decimal" step="0.01" min="0"
                 value="${esc(linea ? linea.bruto : '')}" placeholder="0.00">
        </label>
        <div class="campo">
          <span>Retenciones</span>
          <div data-deds>${((linea && linea.deducciones) || []).map(filaDed).join('')}</div>
          <button class="boton boton--borde boton--bloque boton--chico" type="button" data-mas-ded>+ Agregar retención</button>
          <small class="campo__ayuda" data-neto></small>
        </div>
      </div>`;

    const caja = hoja(`${ev.nombre} · ${nombreMes(periodo)}`, `
      ${yaCopiado ? `<p class="hoja__nota ojo">
        Estos números se <strong>copiaron de ${esc(nombreMes(yaCopiado))}</strong> con el
        atajo y nadie los ha revisado. Comparalos con lo que de verdad entró y guardá:
        con eso dejan de estar sin revisar.</p>`
      : deCopia && !confirmado ? `<p class="hoja__nota">
        Ya viene lleno con lo de <strong>${esc(nombreMes(deCopia.desde))}</strong>, que es
        lo último confirmado. Si el mes vino igual, dale a confirmar; si cambió algo,
        corregí el renglón que sea.</p>`
      : `<p class="hoja__nota">
        ${confirmado ? 'Ya confirmaste este pago. Podés corregirlo.'
                     : 'Anotá lo que realmente entró este mes: el bruto y las retenciones que aplicaron.'}</p>`}

      ${personas.map(p => bloque(fuentes.find(f => f.p.id === p.id))).join('')}

      <label class="campo campo--casilla">
        <input type="checkbox" name="tipico">
        <span>Guardar también como el <strong>monto típico</strong> de este pago. Sirve para
        que las estimaciones de los meses que vienen dejen de usar la cifra del asistente.</span>
      </label>
    `, {
      ancha: true,
      textoGuardar: `Confirmar ${nombreMes(periodo)}`,
      alBorrar: confirmado ? async () => {
        // Volver a estimado borra las líneas del mes: sin ellas el
        // núcleo vuelve solo a la plantilla. Dejarlas con
        // `confirmado: false` no serviría — `lineaDe` usa la línea del
        // mes exista o no la confirmación.
        await borrarDonde('ingresos_mes',
          { periodo: `eq.${periodo}`, plantilla_id: `eq.${ev.id}` },
          { periodo });
        avisar('Vuelve a usar el monto típico.');
        recargar();
      } : null,
      alGuardar: async (d, fallo) => {
        const lineas = leerBloques(caja);
        const mala = lineas.find(l => l.deducciones.reduce((s, x) => s + x.monto, 0) > l.bruto);
        if (mala) {
          return fallo(`En «${nombreDe(personas, mala.personaId)}» las retenciones superan al bruto.`), false;
        }
        if (!lineas.some(l => l.bruto > 0)) return fallo('Falta el monto que entró.'), false;

        await fusionar('ingresos_mes',
          lineas.map(l => FILAS.ingresos_mes(l, { ...ctx, periodo, plantillaId: ev.id, copiadoDe: null })),
          'hogar_id,periodo,plantilla_id,persona_id');

        /* Que la plantilla siga a la realidad, si lo piden. Es opcional
           a propósito: un mes con un bono o un descuento raro no debe
           reescribir el monto típico de todos los meses que vienen. */
        if (d.tipico) {
          await fusionar('plantilla_lineas',
            lineas.map(l => FILAS.plantilla_lineas(l, { ...ctx, plantillaId: ev.id })),
            'plantilla_id,persona_id');
        }

        avisar(`${ev.nombre} confirmado.`);
        recargar();
      }
    });

    engancharDeducciones(caja);
  }

  /**
   * El atajo: confirmar de un tirón los pagos que faltan con lo del
   * último mes confirmado.
   *
   * Quedan marcados como copiados —«sin revisar»— y no como
   * confirmados a secas. Confirmar quiere decir que alguien miró; aquí
   * nadie miró todavía, y decir lo contrario sería inventarse un
   * hecho. La marca se va sola cuando alguien abre el pago y lo
   * guarda, porque abrirlo y guardarlo ES revisarlo.
   */
  /**
   * Pone en cada rubro el monto que sale de lo ya gastado.
   *
   * SOLO TOCA EL MONTO. No crea rubros, no borra ninguno y no mueve un solo
   * movimiento: si algo sale mal, lo que se pierde es una cifra que se puede
   * volver a escribir, no información.
   *
   * Y SOLO LOS RECURRENTES. Lo que apareció una vez fue un evento —una
   * llanta, una consulta— y meterlo al presupuesto mensual haría creer que
   * cada mes hay que apartar ese dinero. `presupuestoSugerido` ya los separa
   * por presencia; acá solo se respeta esa decisión.
   *
   * No hay confirmación previa a propósito: el botón dice exactamente lo que
   * va a pasar, los montos se ven antes de tocarlo, y cada uno se puede
   * corregir después. Un diálogo de «¿está seguro?» sobre algo reversible
   * solo enseña a la gente a decir que sí sin leer.
   */
  async function aplicarSugerido() {
    const filas = ((sug && sug.recurrentes) || []).filter(f => f.gastoId && f.sugerido > 0);
    if (!filas.length) return avisar('No hay suficiente historial para sugerir montos.', 'mal');

    botonSugerido.disabled = true;
    const antes = botonSugerido.textContent;
    botonSugerido.textContent = 'Aplicando…';
    let cuantos = 0;
    try {
      for (const f of filas) {
        const g = porId(gastos, f.gastoId);
        if (!g) continue;                       // un rubro borrado desde otro aparato
        await actualizar('gastos', g.id, { monto: f.sugerido });
        cuantos++;
      }
    } catch (e) {
      botonSugerido.disabled = false;
      botonSugerido.textContent = antes;
      /* Se dice CUÁNTOS entraron antes de fallar. «No se pudo» a secas deja
         sin saber si hay que volver a empezar o solo terminar. */
      return avisar(`${e.message || 'No se pudo aplicar.'}` +
                    (cuantos ? ` Alcanzaron a quedar ${cuantos}.` : ''), 'mal');
    }
    avisar(`Listo: ${cuantos} rubro${cuantos === 1 ? '' : 's'} con su monto. Ajustá el que no cuadre.`);
    recargar();
  }

  async function copiarDelMesAnterior() {
    let cuantos = 0;
    try {
      for (const ev of copiables) {
        const desde = A.mesConfirmadoPrevio(D, ev.id, periodo);
        if (!desde) continue;

        const lineas = personas
          .map(p => ({ p, ...A.lineaParaConfirmar(D, ev, p.id, periodo) }))
          .filter(f => f.origen === 'copia' && f.linea)
          .map(f => ({ personaId: f.p.id, bruto: f.linea.bruto,
                       deducciones: (f.linea.deducciones || []).slice() }));
        if (!lineas.length) continue;

        await fusionar('ingresos_mes',
          lineas.map(l => FILAS.ingresos_mes(l, { ...ctx, periodo, plantillaId: ev.id, copiadoDe: desde })),
          'hogar_id,periodo,plantilla_id,persona_id');
        cuantos++;
      }
    } catch (e) {
      return avisar(e.message || 'No se pudo copiar.', 'mal');
    }

    if (!cuantos) return avisar('No hay nada que copiar.', 'mal');
    avisar(`${cuantos} ${cuantos === 1 ? 'pago copiado' : 'pagos copiados'}. Revisá y corregí si algo cambió.`);
    recargar();
  }

  /* ---------- el editor de pagos ----------

     El único formulario con estructura: un pago lleva dentro lo que
     le toca a CADA persona, y cada persona lleva sus retenciones. Se
     lee del DOM en vez de con `datosDeForma` porque son campos que
     nacen y mueren mientras el formulario está abierto. */

  function formPago(ev) {
    const sePuedeBorrar = Boolean(ev) && pagos.length > 1;
    const lineaDe = pid => (ev && (ev.lineas || []).find(l => l.personaId === pid)) || null;

    const bloque = p => {
      const l = lineaDe(p.id);
      return `
        <div class="perbloque" data-persona="${esc(p.id)}">
          <div class="perbloque__t">${esc(p.nombre)}</div>
          <label class="campo">
            <span>Ingreso bruto típico</span>
            <input data-k="bruto" type="number" inputmode="decimal" step="0.01" min="0"
                   value="${esc(l ? l.bruto : '')}" placeholder="0.00">
          </label>
          <div class="campo">
            <span>Retenciones</span>
            <div data-deds>${((l && l.deducciones) || []).map(filaDed).join('')}</div>
            <button class="boton boton--borde boton--bloque boton--chico" type="button" data-mas-ded>+ Agregar retención</button>
            <small class="campo__ayuda" data-neto></small>
          </div>
        </div>`;
    };

    const caja = hoja(ev ? 'Editar pago' : 'Nuevo pago', `
      ${campo('nombre', 'Nombre del pago', `value="${esc(ev ? ev.nombre : '')}" placeholder="Sueldo, comisiones, quincena…"`)}
      ${campo('dia', 'Día del mes en que cae',
        `type="number" inputmode="numeric" min="1" max="31" value="${esc(ev ? ev.dia : '')}" placeholder="1 a 31"`)}
      <p class="hoja__nota">
        Montos <strong>típicos</strong>. Cada mes se confirma lo que de verdad
        entró, y ahí es donde se registra el ISR que tocó ese mes.
      </p>
      ${personas.map(bloque).join('')}
      ${ev && !sePuedeBorrar ? '<p class="hoja__nota">Es el único pago registrado: sin ingresos la app no puede calcular nada. Agregá otro antes de eliminarlo.</p>' : ''}
    `, {
      ancha: true,
      alBorrar: sePuedeBorrar ? borrarCon('plantilla_ingresos', ev, 'Pago eliminado.') : null,
      alGuardar: async (d, fallo) => {
        if (!d.nombre) return fallo('Ponele nombre al pago.'), false;
        if (!d.dia) return fallo('Falta el día del mes en que cae.'), false;

        const lineas = leerBloques();
        const mala = lineas.find(l => l.deducciones.reduce((s, x) => s + x.monto, 0) > l.bruto);
        if (mala) {
          return fallo(`En «${nombreDe(personas, mala.personaId)}» las retenciones superan al bruto.`), false;
        }

        const cabeza = FILAS.plantilla_ingresos(d, ctx);
        const pago = ev ? await actualizar('plantilla_ingresos', ev.id, cabeza, cabeza)
                        : await crear('plantilla_ingresos', cabeza);

        // Se guardan TODAS las líneas, incluso las de monto cero: una
        // línea en cero dice «a esta persona no le toca de este pago»,
        // que es distinto de que nadie lo haya contestado nunca.
        await fusionar('plantilla_lineas',
          lineas.map(l => FILAS.plantilla_lineas(l, { ...ctx, plantillaId: pago.id })),
          'plantilla_id,persona_id');

        avisar(ev ? 'Pago actualizado.' : 'Pago agregado.');
        recargar();
      }
    });

    engancharDeducciones(caja);
  }
}
