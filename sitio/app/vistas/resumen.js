/* ============================================================
   Resumen — la pantalla que se abre.

   Responde tres preguntas en el orden en que la gente las hace:
   cuánto me queda, voy a buen ritmo, y me alcanza para el corte de
   la tarjeta.
   ============================================================ */

import * as A from '../nucleo/index.js';
import { esc, dinero, pct } from '../ui.js';

export function resumen({ contenedor, D, periodo }) {
  const r = A.resumenMes(D, periodo);
  const p = A.pulso(D, periodo);
  const credito = (D.tarjetas || []).filter(t => (t.tipo || 'credito') === 'credito');
  const efe = A.efectivo(D, periodo);

  // Un porcentaje que llegue como `undefined` se vuelve `NaN%`, el
  // navegador descarta el ancho y la barra queda LLENA. Se ve en
  // pantalla y no avisa por ningún lado — el peor tipo de error.
  const barra = v => Math.max(0, Math.min(100, Math.round((Number(v) || 0) * 100)));

  const fichas = [
    { t: 'Disponible real', v: dinero(r.disponible), c: r.disponible >= 0 ? 'bien' : 'mal',
      d: r.confirmado ? 'con lo que de verdad entró' : 'con montos estimados' },
    { t: 'Ingreso neto', v: dinero(r.neto),
      d: r.confirmado ? 'confirmado' : r.parcial ? 'confirmado a medias' : 'sin confirmar' },
    { t: 'Gastos del mes', v: dinero(r.gastos),
      d: r.salud > 0 ? `${dinero(r.salud)} de salud` : 'del plan' },
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

      <section class="panel">
        <h2>Tarjetas</h2>
        ${credito.length ? credito.map(t => {
          const c = A.cicloTarjeta(D, t, periodo);
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
              ${c.usandoPlan ? '<div class="ciclo-app__f"><em class="ciclo-app__nota">Según el plan: todavía no hay consumos registrados en este ciclo.</em></div>' : ''}
              ${!c.evento ? '<div class="ciclo-app__f"><em class="ciclo-app__nota">Falta decir qué ingreso paga esta tarjeta.</em></div>' : ''}
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

  // Los anchos se aplican aquí y no con `style=` en el HTML: un solo
  // estilo en línea obligaría a abrirle la mano a la CSP.
  contenedor.querySelectorAll('[data-ancho]').forEach(b => { b.style.width = b.dataset.ancho + '%'; });
}
