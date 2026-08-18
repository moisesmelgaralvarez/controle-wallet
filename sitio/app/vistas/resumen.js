/* ============================================================
   Resumen — la pantalla que se abre.

   Responde, en el orden en que la gente las hace, primero las tres
   preguntas del MES —cuánto me queda, voy a buen ritmo, me alcanza
   para el corte— y después las dos del HOGAR: cuánto tenemos de
   verdad, y qué conviene hacer primero.

   LAS DOS ÚLTIMAS VIENEN DEL SERVIDOR. El capital y el diagnóstico
   salen de `patrimonio` y `saludFinanciera`, que recorren toda la
   vida del hogar; en el navegador solo vive el mes en curso. La
   pantalla NO espera: dibuja el mes de inmediato —que ya es cierto—
   y agrega el resto cuando la respuesta llega. Si el viaje falla se
   queda lo que había, que nunca fue mentira.

   EL CAPITAL ES LA CIFRA QUE NO SE PUEDE MAQUILLAR. El disponible del
   mes sube y baja; el saldo de una cuenta puede verse bien con la
   tarjeta reventada. Esto junta las dos caras y dice si el hogar
   avanza o retrocede.

   Y EL DIAGNÓSTICO ES SOBRE TODO UN ORDEN. Un asesor no da consejos
   sueltos: dice qué va primero. Apartar para un proyecto mientras se
   revuelve una tarjeta al 50% anual es perder dinero todos los meses,
   por disciplinado que se sienta.
   ============================================================ */

import * as A from '../nucleo/index.js';
import { $, $$, esc, dinero, pct, diaCorto } from '../ui.js';
import { historico } from '../datos/historico.js';

export function resumen({ contenedor, D, periodo }) {
  let servidor = null;
  let mio = null;

  const pintarTodo = () => {
    pintarMes();
    if (servidor) contenedor.insertAdjacentHTML('beforeend', bloquesDelServidor(servidor));
    $$('[data-ancho]', contenedor).forEach(b => { b.style.width = b.dataset.ancho + '%'; });
    mio = contenedor.firstElementChild;
  };

  function pintarMes() {
  const r = A.resumenMes(D, periodo);
  const p = A.pulso(D, periodo);
  const credito = (D.tarjetas || []).filter(t => (t.tipo || 'credito') === 'credito');
  const efe = A.efectivo(D, periodo);

  // Un porcentaje que llegue como `undefined` se vuelve `NaN%`, el
  // navegador descarta el ancho y la barra queda LLENA. Se ve en
  // pantalla y no avisa por ningún lado — el peor tipo de error.
  const barra = v => Math.max(0, Math.min(100, Math.round((Number(v) || 0) * 100)));

  /* LO QUE DE VERDAD SE GASTÓ, QUE NO ES LO QUE ESTA PANTALLA ENSEÑABA.

     `r.gastos` viene de `gastosMes`, que recorre los rubros con el monto
     que se PLANEÓ y no mira un solo movimiento. Sirve para proyectar —«así
     va a ser septiembre»— pero acá salía bajo el rótulo «Gastos del mes», y
     con 145 movimientos y L 82,935.61 encima decía L 0.00, porque ningún
     rubro tenía monto todavía.

     El dueño lo dijo mejor que cualquier informe: «no entiendo el resumen,
     no sé con cuánto contamos, si estamos en rojo o en verde». */
  /* La media de lo ya gastado, por rubro, como respaldo del presupuesto. El
     dueño lo dijo así: «pasé una serie de estados de cuenta que ayudarán a
     sacar una media de consumo por rubro, necesito que aparezca ahí». Tenía
     razón — la app ya la tenía calculada y no la usaba para esto. */
  const sug = A.presupuestoSugerido(D, periodo, 12);
  const medias = {};
  for (const f of (sug.filas || [])) if (f.gastoId) medias[f.gastoId] = f.sugerido;

  const rp = A.realPorRubro(D, periodo, medias);

  /* Y el disponible se mide contra lo gastado, no contra el plan. Un plan
     vacío daba el ingreso íntegro como disponible: la cifra más peligrosa
     que puede enseñar una app de dinero, porque invita a gastar lo que ya
     se gastó. */
  const disponibleReal = Math.round((r.neto - rp.gastado - r.cuotas) * 100) / 100;

  const fichas = [
    { t: 'Disponible real', v: dinero(disponibleReal), c: disponibleReal >= 0 ? 'bien' : 'mal',
      d: rp.hayGasto ? 'lo que entró menos lo que ya salió'
                     : (r.confirmado ? 'con lo que de verdad entró' : 'con montos estimados') },
    { t: 'Ingreso neto', v: dinero(r.neto),
      d: r.confirmado ? 'confirmado' : r.parcial ? 'confirmado a medias' : 'sin confirmar' },
    { t: 'Gastos del mes', v: dinero(rp.gastado),
      c: rp.hayConQueMedir && rp.diferenciaReferencia < 0 ? 'mal' : '',
      d: rp.hayConQueMedir
           ? `de L ${esc(String(Math.round(rp.referenciaTotal).toLocaleString('en-US')))} ${rp.soloMedia ? 'de media mensual' : rp.algunaMedia ? 'entre presupuesto y tu media' : 'presupuestados'}`
           : (rp.hayGasto ? 'sin historial ni presupuesto con qué compararlo' : 'sin movimientos este mes') },
    { t: 'Cuotas', v: dinero(r.cuotas),
      d: r.financiados ? `${r.financiados} vigente${r.financiados === 1 ? '' : 's'}` : 'ninguna' }
  ];

  contenedor.innerHTML = `
    <section class="fichas-app">
      ${fichas.map(f => `
        <article class="ficha-app">
          <span class="ficha-app__t">${esc(f.t)}</span>
          <div class="ficha-app__v ${f.c || ''}">${esc(f.v)}</div>
          <div class="ficha-app__d">${esc(f.d)}</div>
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
              <div class="pulso-app__via"><div class="pulso-app__va ${p.adelantado ? 'mal' : ''}" data-ancho="${barra(p.avanceGasto)}"></div></div>
            </div>
          </div>
          <p class="pulso-app__pie">
            ${p.adelantado
              ? `Van más rápido que el calendario. A este ritmo cerrarían en <strong>${esc(dinero(p.proyeccion))}</strong>.`
              : 'Van a buen ritmo para llegar al final del mes.'}
          </p>
          <p class="pulso-app__pie">
            Para llegar justos quedan <strong>${esc(dinero(p.porDia))}</strong> al día,
            con ${esc(p.diasRestantes)} ${p.diasRestantes === 1 ? 'día' : 'días'} por delante.
          </p>
          ${p.proximoIngreso || p.proximoCorte ? `
            <p class="pulso-app__pie pulso-app__agenda">
              ${p.proximoIngreso ? `<span>Entra <strong>${esc(p.proximoIngreso.nombre)}</strong> en ${esc(p.proximoIngreso.enDias)} d.</span>` : ''}
              ${p.proximoCorte ? `<span>Corta <strong>${esc(p.proximoCorte.nombre)}</strong> en ${esc(p.proximoCorte.enDias)} d.</span>` : ''}
            </p>` : ''}
        ` : '<p class="pulso-app__pie">Todavía no hay presupuesto con qué medir el ritmo.</p>'}
      </section>

      <!-- ==========================================================
           LO GASTADO POR RUBRO — la pieza que faltaba

           Es lo que el dueño pidió con todas sus letras: «¿dónde está lo
           que llevo gastado respecto al presupuesto por categoría?». No
           estaba en ninguna pantalla. El presupuesto se editaba en un
           lado y lo gastado vivía en otro, y nunca se miraban.

           ORDENADO POR LO QUE MÁS SE GASTÓ, no por lo que más se
           presupuestó ni alfabético. Quien abre esto viene a ver dónde se
           le está yendo la plata, y eso es una sola pregunta con una sola
           respuesta: el primer renglón.
           ========================================================== -->
      <section class="panel panel--ancho">
        <h2>Lo gastado por rubro</h2>
        ${rp.hayGasto ? `
          ${rp.filas.filter(f => f.gastado > 0 || f.referencia > 0).map(f => {
            const pasado = f.referencia > 0 && f.gastado > f.referencia;
            return `
            <div class="rubro-real">
              <div class="rubro-real__f">
                <em>${esc(f.concepto)}</em>
                <span class="cifra ${pasado ? 'mal' : ''}">${esc(dinero(f.gastado))}</span>
              </div>
              ${f.referencia > 0 ? `
                <div class="rubro-real__via" aria-hidden="true">
                  <i class="${pasado ? 'mal' : ''}" data-ancho="${esc(String(barra(Math.min(1, f.consumido))))}"></i>
                </div>
                <div class="rubro-real__f rubro-real__pie">
                  <em>de ${esc(dinero(f.referencia))}${f.deLaMedia ? ' · tu media mensual' : ''}</em>
                  <span class="${pasado ? 'mal' : 'bien'}">
                    ${pasado ? `${esc(dinero(-f.diferencia))} de más` : `quedan ${esc(dinero(f.diferencia))}`}
                  </span>
                </div>`
              : '<div class="rubro-real__f rubro-real__pie"><em class="ojo">sin historial ni presupuesto con qué compararlo</em></div>'}
            </div>`;
          }).join('')}

          ${rp.sinClasificar > 0 ? `
            <div class="rubro-real">
              <div class="rubro-real__f">
                <em class="ojo">Sin clasificar · ${esc(String(rp.movimientosSinClasificar))} movimiento${rp.movimientosSinClasificar === 1 ? '' : 's'}</em>
                <span class="cifra">${esc(dinero(rp.sinClasificar))}</span>
              </div>
              <div class="rubro-real__f rubro-real__pie">
                <em class="ojo">Cuentan en el total del mes, pero contra ningún rubro del plan.</em>
              </div>
            </div>` : ''}

          <div class="rubro-real rubro-real--total">
            <div class="rubro-real__f">
              <em>Total gastado</em>
              <span class="cifra">${esc(dinero(rp.gastado))}</span>
            </div>
            ${rp.hayConQueMedir ? `
              <div class="rubro-real__f rubro-real__pie">
                <em>de ${esc(dinero(rp.referenciaTotal))} ${rp.soloMedia ? 'de media mensual' : rp.algunaMedia ? 'entre presupuesto y tu media' : 'presupuestados'}</em>
                <span class="${rp.diferenciaReferencia < 0 ? 'mal' : 'bien'}">
                  ${rp.diferenciaReferencia < 0 ? `${esc(dinero(-rp.diferenciaReferencia))} de más` : `quedan ${esc(dinero(rp.diferenciaReferencia))}`}
                </span>
              </div>` : ''}
          </div>

          ${rp.soloMedia || rp.algunaMedia ? `
            <p class="pulso-app__pie">
              Los rubros sin presupuesto fijado se miden contra
              <strong>tu media mensual</strong> de ${esc(String((sug.periodos || []).length))}
              ${(sug.periodos || []).length === 1 ? 'mes' : 'meses'} de estados de cuenta.
              Es lo que viene pasando, no una meta: en <strong>Presupuesto</strong> podés
              fijarla como plan y ajustar lo que no te cuadre.
            </p>` : ''}
          ${!rp.hayConQueMedir && rp.hayGasto ? `
            <p class="pulso-app__pie">
              Hay ${esc(dinero(rp.gastado))} gastados y todavía no hay historial ni
              presupuesto con qué medirlos.
            </p>` : ''}
        ` : `<p class="pulso-app__pie">Todavía no hay movimientos en este mes.
             Importá un estado de cuenta y acá vas a ver en qué se está yendo.</p>`}
      </section>

      <section class="panel">
        <h2>Tarjetas</h2>
        ${credito.length ? credito.map(t => {
          const c = A.cicloTarjeta(D, t, periodo);
          const falta = c.cobertura < 0;
          /* La deuda viva de la tarjeta, que es distinta del ciclo: el ciclo
             es lo que cerró este mes, la deuda es lo que queda debiéndose. */
          const d = A.deudaTarjetas(D, periodo).find(x => x.id === t.id);
          return `
            <div class="ciclo-app">
              <div class="ciclo-app__f"><em>${esc(t.nombre)}</em><span>${esc(c.desde)} → ${esc(c.hasta)}</span></div>
              <div class="ciclo-app__f"><em>Se cargó</em><span>${esc(dinero(c.aCubrir))}</span></div>
              ${c.evento ? `<div class="ciclo-app__f"><em>Lo paga: ${esc(c.evento)}</em><span>${esc(dinero(c.ingresoPago))}</span></div>` : ''}
              <div class="ciclo-app__f total">
                <em>${falta ? 'Faltan' : 'Sobra'}</em>
                <span class="${falta ? 'mal' : 'bien'}">${esc(dinero(Math.abs(c.cobertura)))}</span>
              </div>
              ${c.usandoPlan ? '<div class="ciclo-app__f"><em class="ciclo-app__nota">Según el plan: todavía no hay consumos registrados en este ciclo.</em></div>' : ''}
              ${!c.evento ? '<div class="ciclo-app__f"><em class="ciclo-app__nota">Falta decir qué ingreso paga esta tarjeta.</em></div>' : ''}
              ${d && d.pagadoDeMas > 0 ? `
                <div class="ciclo-app__f">
                  <em class="ciclo-app__nota mal">Se pagaron ${esc(dinero(d.pagadoDeMas))} más de
                  lo que esta app sabe que se debía. Falta el saldo de esta tarjeta:
                  importá su estado de cuenta, o escribilo en Presupuesto → Tarjetas.</em>
                </div>` : ''}
              ${d && d.segunBanco ? `
                <div class="ciclo-app__f"><em class="ciclo-app__nota">Deuda según el banco:
                  ${esc(dinero(d.deuda))} — declarada al ${esc(diaCorto(d.segunBanco.fecha))}.</em></div>` : ''}
            </div>`;
        }).join('') : '<p class="pulso-app__pie">No hay tarjetas de crédito registradas.</p>'}

        ${efe.hayDatos ? `
          <div class="ciclo-app ciclo-app--aparte">
            <div class="ciclo-app__f total">
              <em>Efectivo en mano</em>
              <span class="${efe.descuadre ? 'mal' : ''}">${esc(dinero(efe.saldo))}</span>
            </div>
            ${efe.descuadre ? '<div class="ciclo-app__f"><em class="ciclo-app__nota">Se gastó más efectivo del retirado: falta anotar un retiro, o un gasto quedó marcado como efectivo sin serlo.</em></div>' : ''}
          </div>` : ''}
      </section>
    </div>`;

  }

  /* Se pinta ya, con el mes. El viaje al servidor va aparte y solo
     agrega: si tarda, la pantalla ya sirve. */
  pintarTodo();

  historico(periodo)
    .then(x => { servidor = x; })
    .catch(() => { /* el mes sigue en pie; el capital llegará la próxima */ })
    .finally(() => {
      // Solo si esta pantalla sigue puesta: si alguien navegó a otra
      // vista mientras tanto, repintar aquí le borraría la suya.
      if (mio && contenedor.contains(mio)) pintarTodo();
    });
}


/* ============================================================
   Lo que solo el servidor sabe
   ============================================================ */

/** Una línea de la composición del capital. */
const linea = (etiqueta, valor, nota = '', resta = false) => `
  <div class="ciclo-app__f">
    <em>${esc(etiqueta)}${nota ? `<span class="ciclo-app__nota"> · ${esc(nota)}</span>` : ''}</em>
    <span class="${resta ? 'mal' : ''}">${resta ? '−' : ''}${esc(dinero(valor))}</span>
  </div>`;

function bloqueCapital(pat) {
  if (!pat || !pat.hayDatos) return '';

  // Lo que se paga completo antes del vencimiento no cuesta intereses;
  // lo que se revuelve sí. Son dos deudas distintas y se dicen aparte.
  const revuelve = (pat.tarjetas || []).reduce((s, t) => s + t.revolvente, 0);
  const alContado = Math.max(0, pat.enTarjetas - revuelve);

  return `
    <section class="panel destacado">
      <span class="destacado__t">Capital · lo que tienen menos lo que deben</span>
      <div class="destacado__v ${pat.neto < 0 ? 'mal' : 'bien'}">${esc(dinero(pat.neto))}</div>
      <p class="destacado__d">${pat.neto < 0
        ? 'Deben más de lo que tienen. Bajar esta deuda es lo que más rinde ahora mismo.'
        : 'Esta es la cifra que debe subir mes a mes. Todo lo demás es medio para llegar aquí.'}</p>

      <div class="ciclo-app ciclo-app--aparte">
        ${linea('En el banco', pat.enBanco, pat.retenidoBanco > 0
          ? `${dinero(pat.enLibros)} en libros menos ${dinero(pat.retenidoBanco)} ya gastado` : '')}
        ${pat.enMano > 0 ? linea('Efectivo en mano', pat.enMano) : ''}
        ${pat.retenidoTarjetas > 0 ? linea('Tarjetas · autorizado sin aplicar', pat.retenidoTarjetas,
          'compras hechas que aún no salen en el corte', true) : ''}
        ${alContado > 0 ? linea('Tarjetas · por pagar este mes', alContado,
          'dentro del plazo, sin intereses', true) : ''}
        ${revuelve > 0 ? linea('Tarjetas · saldo que revuelve', revuelve,
          'esto sí genera intereses', true) : ''}
        ${pat.enFinanciamientos > 0 ? linea('Financiamientos por pagar', pat.enFinanciamientos, '', true) : ''}
        <div class="ciclo-app__f total">
          <em>Capital</em>
          <span class="${pat.neto < 0 ? 'mal' : 'bien'}">${esc(dinero(pat.neto))}</span>
        </div>
      </div>

      ${pat.faltanSaldosTarjeta ? `<p class="pulso-app__pie panel__nota ojo">
        Falta declarar cuánto deben en alguna tarjeta. Sin ese dato el capital sale
        mejor de lo que es: <a href="#/presupuesto">completalo en Presupuesto</a>.</p>` : ''}
      ${pat.faltanCuentas ? `<p class="pulso-app__pie panel__nota ojo">
        No hay ninguna cuenta de banco registrada, así que esta cifra solo cuenta el
        efectivo y las deudas.</p>` : ''}
    </section>`;
}

function bloqueCuentas(cuentas) {
  if (!cuentas || !cuentas.hayDatos) return '';
  return `
    <section class="panel">
      <div class="panel__tope"><h2>En cada cuenta</h2></div>
      <ul class="lista-cfg">
        ${cuentas.filas.map(c => `
          <li>
            <div class="fila-cfg fila-cfg--quieta">
              <span class="fila-cfg__t">
                <strong>${esc(c.nombre)}</strong>
                <small>${c.retenido > 0
                  ? `${esc(dinero(c.saldo))} en libros · ${esc(dinero(c.retenido))} ya gastado sin salir`
                  : c.sinConfirmar ? 'sin ingresos confirmados: es el saldo con que arrancó'
                  : 'disponible'}</small>
              </span>
              <span class="fila-cfg__v ${c.disponible < 0 ? 'mal' : ''}">${esc(dinero(c.disponible))}</span>
            </div>
          </li>`).join('')}
      </ul>
      ${cuentas.filas.length > 1
        ? `<div class="total-cfg"><span>Disponible en total</span><span>${esc(dinero(cuentas.totalDisponible))}</span></div>`
        : ''}
    </section>`;
}

function bloqueDiagnostico(salud) {
  if (!salud || (!salud.pasos.length && !salud.caras.length)) return '';

  const meses = salud.mesesColchon;
  const tono = meses === null ? '' :
    meses >= A.MESES_COLCHON ? 'bien' : meses >= 1 ? 'espera' : 'mal';

  return `
    <section class="panel">
      <div class="panel__tope"><h2>Diagnóstico</h2></div>

      ${meses !== null ? `
        <div class="colchon">
          <div class="colchon__t">
            <span>Colchón de emergencia</span>
            <strong class="${tono === 'mal' ? 'mal' : tono === 'bien' ? 'bien' : ''}">
              ${esc(meses >= 10 ? Math.round(meses) : meses.toFixed(1))} ${meses === 1 ? 'mes' : 'meses'}</strong>
          </div>
          <div class="pulso-app__via">
            <div class="pulso-app__va ${tono === 'mal' ? 'mal' : ''}"
                 data-ancho="${Math.max(0, Math.min(100, (meses / A.MESES_COLCHON) * 100)).toFixed(1)}"></div>
          </div>
          <p class="pulso-app__pie">
            ${esc(dinero(salud.liquido))} líquido contra ${esc(dinero(salud.gastoMensual))} de gasto al mes.
            Lo sano son <b>${A.MESES_COLCHON} meses</b> (${esc(dinero(salud.metaColchon))}).
            ${salud.baseReal ? 'Ese gasto sale de lo que de verdad gastaron, porque el plan todavía no tiene montos.' : ''}
          </p>
        </div>` : ''}

      ${salud.interesMensual > 0 ? `
        <div class="ciclo-app ciclo-app--aparte">
          <div class="ciclo-app__f"><em>Intereses al mes</em><span class="mal">${esc(dinero(salud.interesMensual))}</span></div>
          <div class="ciclo-app__f"><em>Al año</em><span class="mal">${esc(dinero(salud.interesAnual))}</span></div>
          <p class="pulso-app__pie">
            Eso se va sin comprar nada. Se come el
            <b>${Math.round(Math.min(999, salud.mordidaInteres * 100))}%</b> del disponible:
            de los ${esc(dinero(salud.disponibleDeclarado))} que parecen libres, quedan
            <b>${esc(dinero(salud.disponibleReal))}</b>.
          </p>
        </div>` : ''}

      ${salud.pasos.length ? `
        <ol class="pasos">
          ${salud.pasos.map(x => `
            <li data-nivel="${esc(x.nivel)}">
              <strong>${esc(x.titulo)}</strong>
              <p>${esc(x.texto)}</p>
            </li>`).join('')}
        </ol>` : ''}
    </section>`;
}

/** Todo lo que el servidor agrega, en el orden en que se lee. */
const bloquesDelServidor = r =>
  bloqueCapital(r.patrimonio) + bloqueCuentas(r.cuentas) + bloqueDiagnostico(r.salud);
