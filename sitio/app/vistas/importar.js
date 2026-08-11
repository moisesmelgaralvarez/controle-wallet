/* ============================================================
   Importar — el estado de cuenta del banco, sin teclear.

   Es la pantalla que le ahorra a un hogar cien renglones al mes. Y
   justo por eso es la que más fácil hace daño: mete decenas de
   movimientos de un golpe, y si mete de más o de menos, el mes deja
   de cuadrar y nadie sabe por qué.

   TRES COSAS QUE HACE A PROPÓSITO:

   1. ENSEÑA ANTES DE ESCRIBIR. Leer el archivo no toca la base. Se
      ve el lote entero —cuántos gastos, cuántos retiros, qué rubros
      nuevos se van a crear, cuántas filas se van a reemplazar— y
      recién entonces aparece el botón. Un importador que escribe
      primero y enseña después no se puede revisar.

   2. DICE SI EL ARCHIVO CUADRA CONSIGO MISMO. El estado de cuenta
      trae su saldo inicial y su saldo final: si sumar los
      movimientos no da el final, es que algún renglón no se leyó
      bien. Esa comprobación no depende de lo que la app crea, solo
      del archivo, y es la que atrapa un PDF mal interpretado antes
      de que entre.

   3. AVISA QUÉ VA A REEMPLAZAR. Cada importación borra lo que se
      importó antes para esa cuenta dentro de esas fechas — es lo que
      impide duplicar. Pero borrar sin decirlo, aunque sea correcto,
      es la clase de cosa que hace desconfiar de una app de dinero.

   Lo que NO hace: tocar lo que alguien escribió a mano. Nunca.
   ============================================================ */

import * as A from '../nucleo/index.js';
import {
  $, $$, esc, dinero, diaCorto, cargando, avisar, selector, campo, datosDeForma
} from '../ui.js';
import { preparar, aplicar } from '../datos/importar.js';
import { crear } from '../datos/escribir.js';
import { FILAS } from '../datos/filas.js';

/** Cuántos renglones se listan sin pedirlo. Con 300 movimientos, la
    pantalla no ayuda: abruma. */
const A_LA_VISTA = 40;

export function importar({ contenedor, D, hogar, recargar }) {
  let archivo = null;
  let lote = null;
  let destino = null;
  let plan = null;
  let fallo = null;
  let leyendo = false;

  const cuentas = D.cuentas || [];
  const tarjetas = (D.tarjetas || []).filter(t => (t.tipo || 'credito') === 'credito');
  const gastos = D.gastos || [];

  /* Los destinos POSIBLES para este archivo, y solo esos.
     Un estado de cuenta y el de una tarjeta no son intercambiables: en
     la cuenta un cargo resta y en la tarjeta suma a lo que se debe, y
     los pagos de tarjeta se registran desde la cuenta y no al revés.
     Ofrecer los dos juntos deja elegir el equivocado con un clic, y el
     error no da ningún aviso: entra completo y descuadra el mes.
     Apareció con un CSV de cuenta cuyo único destino ofrecido era una
     tarjeta. */
  /* El lector genérico a veces no puede saber si el documento es de
     una cuenta o de una tarjeta. No se supone: se pregunta, porque de
     eso depende a qué se puede archivar y cómo se clasifica cada
     renglón. */
  let tipoElegido = null;
  const tipoDe = l => (l && l.tipo) || tipoElegido;

  const posibles = lote => tipoDe(lote) === 'tarjeta'
    ? tarjetas.map(t => ({ valor: 'tarjeta:' + t.id, texto: `${t.nombre} (tarjeta)` }))
    : cuentas.map(c => ({ valor: 'cuenta:' + c.id, texto: `${c.nombre} (cuenta)` }));

  const hayAlguno = cuentas.length + tarjetas.length > 0;

  /* Lo que el archivo ya sabe, para no preguntarlo. */
  const sugerirNombre = l => l.banco && l.banco !== 'CSV' ? l.banco : '';
  const diaDeCorte = l => {
    // El estado de una tarjeta trae su fecha de corte; de ahí sale el
    // día, que es el único campo que la base exige y el archivo no
    // enseña rotulado.
    const f = l.corte || l.hasta || '';
    const d = /^\d{4}-\d{2}-(\d{2})$/.exec(f);
    return d ? String(Number(d[1])) : '';
  };

  /** El número registrado del destino elegido, si tiene alguno. */
  const numeroDe = d => {
    if (!d) return '';
    const lista = d.clase === 'cuenta' ? cuentas : tarjetas;
    return (lista.find(x => x.id === d.id) || {}).numero || '';
  };

  const nombreRubro = id => {
    if (!id || id === 'otros') return 'Sin clasificar';
    const g = gastos.find(x => x.id === id);
    if (g) return g.concepto;
    const nuevo = (plan?.rubrosNuevos || []).find(x => x.id === id);
    return nuevo ? `${nuevo.concepto} (nuevo)` : 'Sin clasificar';
  };

  /* ---------- leer y preparar ---------- */

  async function leer(f) {
    archivo = f; lote = null; plan = null; fallo = null; leyendo = true;
    pintar();
    try {
      lote = await A.leerArchivo(f, D);
      destino = A.destinoDe(lote, D);
      if (destino) rehacerPlan();
    } catch (e) {
      fallo = e.message || 'No se pudo leer el archivo.';
    } finally {
      leyendo = false;
      pintar();
    }
  }

  function rehacerPlan() {
    try {
      plan = preparar({ D, lote, destino });
      fallo = null;
    } catch (e) {
      plan = null;
      fallo = e.message || 'No se pudo preparar la importación.';
    }
  }

  /* ---------- piezas ---------- */

  /** El archivo contra sí mismo: saldo inicial + movimientos = saldo final. */
  function control(c) {
    /* Que la comprobación NO se pueda hacer hay que decirlo. Callarlo
       deja creer que el archivo se revisó y salió bien, cuando lo que
       pasó es que no se revisó — y esta es justo la comprobación que
       atrapa un PDF mal interpretado antes de que entre. Apareció con
       un estado de cuenta real: la tarjeta no traía saldo de corte, no
       se dijo nada, y la pantalla se veía perfecta. */
    if (!c) return `
      <div class="aviso aviso--ojo">
        <strong>No se pudo comprobar que el archivo cuadre</strong>
        <p>Este archivo no trae el saldo anterior y el del corte, así que no hay
           contra qué sumar los movimientos. Puede estar bien, pero <b>nadie lo
           verificó</b>: revisá la lista de abajo antes de aplicar.</p>
      </div>`;
    return `
      <div class="aviso ${c.cuadra ? 'aviso--ok' : 'aviso--error'}">
        <strong>${c.cuadra ? 'El archivo cuadra consigo mismo' : 'El archivo NO cuadra'}</strong>
        <p>Saldo inicial ${esc(dinero(c.saldoIni))} más los movimientos
           ${esc(dinero(c.suma))} da ${esc(dinero(c.esperado))}, y el archivo
           declara ${esc(dinero(c.saldoFin))}.
           ${c.cuadra
             ? 'Se leyeron todos los renglones.'
             : `Sobran o faltan <b>${esc(dinero(Math.abs(c.diferencia)))}</b>: algún renglón
                no se interpretó bien. Revisá la lista antes de aplicar.`}</p>
      </div>`;
  }

  function resumen() {
    const filas = Object.entries(lote.resumen || {});
    if (!filas.length) return '<p class="panel__nota">El archivo no trae movimientos.</p>';
    return `
      <ul class="lista-cfg">
        ${filas.map(([tipo, r]) => `
          <li><div class="fila-cfg fila-cfg--quieta">
            <span class="fila-cfg__t">
              <strong>${esc(A.TIPOS[tipo] || tipo)}</strong>
              <small>${esc(r.n)} ${r.n === 1 ? 'renglón' : 'renglones'}</small>
            </span>
            <span class="fila-cfg__v">${esc(dinero(r.total))}</span>
          </div></li>`).join('')}
      </ul>
      <p class="panel__nota">Solo entran gastos, retiros y pagos de tarjeta. Los
        traslados entre cuentas propias, las cuotas y los reversos se leen para
        que el archivo cuadre, pero no se registran: contarlos sería duplicar.</p>
      ${lote.tipo === 'tarjeta' && (lote.resumen || {}).pagoTarjeta ? `
        <p class="panel__nota">Los ${esc(lote.resumen.pagoTarjeta.n)} pagos que aparecen
          aquí <b>no se registran desde la tarjeta</b>. El dinero sale de la cuenta, no
          de la tarjeta: se anotan al importar el estado de esa cuenta. Registrarlos
          de los dos lados los contaría dos veces.</p>` : ''}`;
  }

  /** Un gasto del lote, con el rubro que el motor le puso y opción de cambiarlo. */
  const filaGasto = (m, i) => `
    <li class="cierre-rubro">
      <div class="cierre-rubro__tope">
        <span class="cierre-rubro__t">
          <strong>${esc(m.concepto || 'Sin concepto')}</strong>
          <small>${esc(diaCorto(m.fecha))}</small>
        </span>
        <span class="cierre-rubro__v">${esc(dinero(m.monto))}</span>
      </div>
      <label class="campo campo--pegado">
        <span>Rubro</span>
        <select data-rubro="${esc(i)}">
          <option value="">Sin clasificar</option>
          ${[...gastos, ...(plan.rubrosNuevos || [])].map(g =>
            `<option value="${esc(g.id)}"${g.id === m.gastoId ? ' selected' : ''}>${esc(g.concepto)}</option>`).join('')}
        </select>
      </label>
    </li>`;

  /* ---------- pintar ---------- */

  function pintar() {
    const sinDestinos = !hayAlguno;
    const destinos = tipoDe(lote) ? posibles(lote) : [];
    /* El saldo declarado NO se llama igual en los dos casos: una cuenta
       trae `saldoFin` y una tarjeta `saldoCorte`. Mismo criterio que en
       `datos/importar.js`, que es quien lo escribe. */
    const ancla = lote ? ((lote.tipo === 'tarjeta' ? lote.saldoCorte : lote.saldoFin) ?? null) : null;

    contenedor.innerHTML = `
      <div class="zonas">
        <div class="pila">

          <section class="panel">
            <div class="panel__tope"><h2>El estado de cuenta</h2></div>
            ${sinDestinos ? `
              <p class="panel__nota">Todavía no hay ninguna cuenta ni tarjeta registrada.
                Agregá una en Presupuesto y volvé: hace falta saber a cuál pertenece
                el archivo.</p>
              <button class="boton boton--borde" type="button" data-ir-presupuesto>Ir a Presupuesto</button>
            ` : `
              <p class="panel__nota">El PDF del banco o un CSV. Nada se guarda hasta que
                lo revises y lo apruebes — leer el archivo no toca tus datos.</p>
              <label class="campo campo--pegado">
                <span>Archivo</span>
                <input type="file" accept=".pdf,.csv,.txt" data-archivo>
              </label>
              ${archivo ? `<p class="panel__nota">Leyendo <b>${esc(archivo.name)}</b>.</p>` : ''}
            `}
          </section>

          ${fallo ? `
            <div class="error-caja">
              <p><strong>No se pudo leer el archivo</strong></p>
              <p>${esc(fallo)}</p>
            </div>` : ''}

          ${leyendo ? cargando('Abriendo el archivo…') : ''}

          ${lote && !leyendo ? `
            <section class="panel">
              <div class="panel__tope"><h2>Qué trae</h2></div>
              <p class="panel__nota">
                ${esc(lote.movs.length)} ${lote.movs.length === 1 ? 'renglón' : 'renglones'},
                del ${esc(diaCorto(lote.desde))} al ${esc(diaCorto(lote.hasta))}.
              </p>
              ${lote.lectura && lote.lectura.metodo === 'saldos' ? `
                <div class="aviso aviso--ok">
                  <strong>Leído por el saldo, y comprobado</strong>
                  <p>Este banco no tiene lector propio, así que cada movimiento se sacó
                     restando su saldo del anterior — y ${esc(lote.lectura.comprobados)}
                     de ellos coinciden con la cifra que el mismo renglón declara. No se
                     adivinó ninguna columna.</p>
                  ${lote.lectura.sinPrimero ? `<p><b>El primer movimiento quedó fuera:</b>
                     el archivo no dice con qué saldo arrancaba, y su signo no se puede
                     deducir. Anotalo a mano si hace falta.</p>` : ''}
                </div>` : control(lote.control)}
              ${resumen()}
            </section>` : ''}

          ${plan && plan.movimientos.length ? `
            <section class="panel">
              <div class="panel__tope"><h2>Los gastos, y a qué rubro van</h2></div>
              <p class="panel__nota">El rubro sale de lo aprendido en importaciones
                anteriores. Lo que corrijas aquí queda aprendido para la próxima.</p>
              <ul class="lista-cierre">
                ${plan.movimientos.slice(0, A_LA_VISTA).map(filaGasto).join('')}
              </ul>
              ${plan.movimientos.length > A_LA_VISTA ? `
                <p class="panel__nota">Y ${esc(plan.movimientos.length - A_LA_VISTA)} más,
                  que entran con el rubro que el motor les puso.</p>` : ''}
            </section>` : ''}

        </div>
        <div class="pila">

          ${lote && !leyendo ? `
            <section class="panel">
              <div class="panel__tope"><h2>A dónde va</h2></div>
              ${!tipoDe(lote) ? `
                <div class="aviso aviso--ojo">
                  <strong>¿Este documento es de una cuenta o de una tarjeta?</strong>
                  <p>El archivo no lo dice con claridad, y no es lo mismo: en una cuenta
                     un cargo baja el saldo y en una tarjeta sube lo que se debe.</p>
                </div>
                ${selector('clase', 'Es de', [
                  { valor: '', texto: '— elegir —' },
                  { valor: 'cuenta', texto: 'Una cuenta' },
                  { valor: 'tarjeta', texto: 'Una tarjeta de crédito' }
                ], tipoElegido || '')}` : ''}
              ${destino ? `
                <p class="panel__nota">El archivo dice ser de
                  <b>${esc(lote.cuenta || 'una cuenta')}</b>, y coincide con
                  <b>${esc(destino.nombre)}</b>.</p>` : `
                <div class="aviso aviso--ojo">
                  <strong>No reconozco la cuenta del archivo</strong>
                  <p>Dice ser de <b>${esc(lote.cuenta || '—')}</b>, y ninguna de las
                     registradas coincide. Elegila a mano, o corregí el número en
                     Presupuesto para que la próxima vez se reconozca sola.</p>
                </div>`}
              ${destinos.length
                ? selector('destino', lote.tipo === 'tarjeta' ? 'Tarjeta' : 'Cuenta',
                    [{ valor: '', texto: '— elegir —' }, ...destinos],
                    destino ? destino.clase + ':' + destino.id : '')
                : `<div class="aviso aviso--ojo">
                     <strong>Todavía no tenés ${lote.tipo === 'tarjeta' ? 'esta tarjeta' : 'esta cuenta'} registrada</strong>
                     <p>El archivo ya dice casi todo lo que hace falta. Registrala aquí y
                        seguimos, sin perder lo que ya se leyó.</p>
                   </div>
                   ${campo('nuevoNombre', lote.tipo === 'tarjeta' ? 'Nombre de la tarjeta' : 'Nombre de la cuenta',
                     `value="${esc(sugerirNombre(lote))}"`,
                     'Como la llamás vos, no como la llama el banco.')}
                   ${campo('nuevoNumero', 'Número',
                     `value="${esc(lote.cuenta || '')}" inputmode="numeric"`,
                     'Viene del archivo. Es lo que hace que la próxima vez se reconozca sola.')}
                   ${lote.tipo === 'tarjeta' ? campo('nuevoCorte', 'Día de corte',
                     `type="number" inputmode="numeric" min="1" max="31" value="${esc(diaDeCorte(lote))}"`,
                     'El día que la tarjeta cierra su ciclo. Sin esto no se puede calcular el ciclo ni el pago.') : ''}
                   <button class="boton boton--principal" type="button" data-registrar>
                     Registrar y seguir
                   </button>
                   <p class="panel__nota">Entra con saldo en cero y sin presupuesto. Lo demás
                     —el día de pago, con qué ingreso se paga, la tasa— lo completás después en
                     Presupuesto, y no hace falta para importar.</p>`}
              ${destino && lote.cuenta && !numeroDe(destino) ? `
                <p class="panel__nota">
                  <label class="campo campo--pegado">
                    <span>Guardar <b>${esc(lote.cuenta)}</b> como su número</span>
                    <input type="checkbox" data-aprender-numero checked>
                    <small class="campo__ayuda">Así la próxima vez se reconoce sola y no hay que elegirla a mano.</small>
                  </label>
                </p>` : ''}
            </section>` : ''}

          ${plan ? `
            <section class="panel">
              <div class="panel__tope"><h2>Qué va a pasar</h2></div>
              <ul class="lista-cfg">
                <li><div class="fila-cfg fila-cfg--quieta">
                  <span class="fila-cfg__t"><strong>Gastos</strong></span>
                  <span class="fila-cfg__v">${esc(plan.movimientos.length)}</span></div></li>
                <li><div class="fila-cfg fila-cfg--quieta">
                  <span class="fila-cfg__t"><strong>Retiros</strong></span>
                  <span class="fila-cfg__v">${esc(plan.retiros.length)}</span></div></li>
                <li><div class="fila-cfg fila-cfg--quieta">
                  <span class="fila-cfg__t"><strong>Pagos de tarjeta</strong></span>
                  <span class="fila-cfg__v">${esc(plan.pagos.length)}</span></div></li>
              </ul>

              ${plan.rubrosNuevos.length ? `
                <p class="panel__nota">Se van a crear
                  ${esc(plan.rubrosNuevos.length)} ${plan.rubrosNuevos.length === 1
                    ? 'rubro nuevo' : 'rubros nuevos'}:
                  <b>${esc(plan.rubrosNuevos.map(g => g.concepto).join(', '))}</b>.
                  Entran con presupuesto en cero; el monto lo ponés vos en Presupuesto.</p>` : ''}

              ${plan.cuenta && plan.cuenta.sinCategoria ? `
                <p class="panel__nota ojo">${esc(plan.cuenta.sinCategoria)}
                  ${plan.cuenta.sinCategoria === 1 ? 'renglón queda' : 'renglones quedan'}
                  sin clasificar. Cuentan en el total del mes, pero no contra ningún
                  rubro del plan.</p>` : ''}

              ${plan.reemplaza ? `
                <div class="aviso aviso--ojo">
                  <strong>Va a reemplazar ${esc(plan.reemplaza)} ${plan.reemplaza === 1
                    ? 'registro' : 'registros'}</strong>
                  <p>Son los que se importaron antes de esta misma cuenta entre el
                     ${esc(diaCorto(lote.desde))} y el ${esc(diaCorto(lote.hasta))}. Es lo que
                     impide duplicar cuando el archivo nuevo ya trae lo del anterior.
                     <b>Lo que escribiste a mano no se toca.</b></p>
                </div>` : ''}

              ${ancla != null ? `
                <p class="panel__nota">El saldo que declara el banco
                  —<b>${esc(dinero(ancla))}</b> al ${esc(diaCorto(lote.hasta))}—
                  queda anotado como la verdad de esa fecha. Es contra eso que cuadra
                  el cierre del mes.</p>` : `
                <p class="panel__nota ojo">Este archivo no trae el saldo declarado, así
                  que ${esc(destino.nombre)} se queda sin ancla. Los movimientos entran
                  igual, pero vas a tener que escribir el saldo a mano en Presupuesto
                  para que el cierre del mes pueda cuadrar.</p>`}

              <button class="boton boton--principal" type="button" data-aplicar>
                Importar ${esc(plan.movimientos.length + plan.retiros.length + plan.pagos.length)} registros
              </button>
              <p class="panel__nota">Entra todo o no entra nada: si algo falla a mitad
                de camino, tus datos quedan exactamente como estaban.</p>
            </section>` : ''}

        </div>
      </div>`;

    enganchar();
  }

  /* ---------- enganches ---------- */

  function enganchar() {
    const f = $('[data-archivo]', contenedor);
    if (f) f.addEventListener('change', e => {
      const elegido = e.target.files && e.target.files[0];
      if (elegido) leer(elegido);
    });

    const ir = $('[data-ir-presupuesto]', contenedor);
    if (ir) ir.addEventListener('click', () => { location.hash = '#/presupuesto'; });

    /* Registrar la cuenta o la tarjeta sin salir de aquí. Mandar a otra
       pantalla y volver significaba perder el archivo ya leído, y
       elegirlo otra vez. */
    const reg = $('[data-registrar]', contenedor);
    if (reg) reg.addEventListener('click', async () => {
      const nombre = ($('[name="nuevoNombre"]', contenedor) || {}).value?.trim();
      const numero = ($('[name="nuevoNumero"]', contenedor) || {}).value?.trim();
      const corte  = ($('[name="nuevoCorte"]', contenedor) || {}).value;

      if (!nombre) return avisar('Ponele un nombre para reconocerla.', 'mal');
      if (lote.tipo === 'tarjeta' && !(Number(corte) >= 1 && Number(corte) <= 31)) {
        return avisar('El día de corte hace falta: sin él no se puede calcular el ciclo.', 'mal');
      }

      reg.disabled = true;
      const antes = reg.textContent;
      reg.textContent = 'Registrando…';
      try {
        const esTarjeta = lote.tipo === 'tarjeta';
        const fila = esTarjeta
          ? FILAS.tarjetas({ nombre, numero, tipo: 'credito', diaCorte: corte,
                             saldoInicial: 0, desdeMes: (lote.desde || '').slice(0, 7),
                             pagaTotal: 'si' }, { hogarId: hogar.id })
          : FILAS.cuentas({ nombre, numero, saldoInicial: 0,
                            desdeMes: (lote.desde || '').slice(0, 7) }, { hogarId: hogar.id });

        await crear(esTarjeta ? 'tarjetas' : 'cuentas', fila);
        avisar(`${nombre} quedó registrada. Volvé a elegir el archivo para seguir.`);
        recargar();
      } catch (e) {
        avisar(e.message || 'No se pudo registrar.', 'mal');
        reg.disabled = false;
        reg.textContent = antes;
      }
    });

    const clase = $('select[name="clase"]', contenedor);
    if (clase) clase.addEventListener('change', () => {
      tipoElegido = clase.value || null;
      destino = null; plan = null;
      pintar();
    });

    const sel = $('select[name="destino"]', contenedor);
    if (sel) sel.addEventListener('change', () => {
      const [clase, id] = sel.value.split(':');
      if (!id) { destino = null; plan = null; return pintar(); }
      const lista = clase === 'cuenta' ? cuentas : tarjetas;
      const x = lista.find(y => y.id === id);
      destino = x ? { clase, id, nombre: x.nombre } : null;
      if (destino) rehacerPlan();
      pintar();
    });

    /* Corregir un rubro cambia ESTE movimiento y además deja aprendido
       el comercio, que es lo que hace que a la próxima no haya que
       volver a corregirlo. */
    $$('[data-rubro]', contenedor).forEach(s => s.addEventListener('change', () => {
      const m = plan.movimientos[Number(s.dataset.rubro)];
      if (!m) return;
      m.gastoId = s.value || null;
      const clave = A.claveComercio(m.concepto || '');
      if (clave && s.value) {
        const ya = plan.comerciosNuevos.find(c => c.clave === clave);
        if (ya) ya.gastoId = s.value;
        else plan.comerciosNuevos.push({ clave, gastoId: s.value });
      }
      avisar(`«${m.concepto}» queda en ${nombreRubro(s.value)}.`);
    }));

    const b = $('[data-aplicar]', contenedor);
    if (b) b.addEventListener('click', async () => {
      b.disabled = true;
      const antes = b.textContent;
      b.textContent = 'Importando…';
      try {
        const aprender = $('[data-aprender-numero]', contenedor);
        const hecho = await aplicar({
          plan, lote, destino, hogarId: hogar.id,
          aprenderNumero: Boolean(aprender && aprender.checked)
        });
        // Lo que dice la BASE que pasó, no lo que el navegador creía.
        avisar(`Listo: ${hecho.movimientos} gastos, ${hecho.retiros} retiros y ` +
               `${hecho.pagos} pagos${hecho.borrados ? `, reemplazando ${hecho.borrados}` : ''}.`);
        recargar();
      } catch (e) {
        avisar(e.message || 'No se pudo importar.', 'mal');
        b.disabled = false;
        b.textContent = antes;
      }
    });
  }

  pintar();
}
