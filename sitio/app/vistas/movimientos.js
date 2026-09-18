/* ============================================================
   Movimientos — lo que se gastó de verdad.

   Tres cosas distintas conviven aquí, y la app anterior ya había
   aprendido a no confundirlas:

     GASTO          resta del presupuesto del mes.
     RETIRO         NO es gasto: mueve dinero de la cuenta a la
                    cartera. Contarlo restaría dos veces — una al
                    sacarlo y otra al gastarlo.
     PAGO DE TARJETA tampoco es gasto: los consumos ya se contaron.
                    Solo mueve dinero de la cuenta a la tarjeta.

   El buscador ignora tildes a propósito: quien anota «Pediatría»
   con prisa después la busca como «pediatria», y no encontrarla es
   la clase de fricción que hace que la gente deje de registrar.
   ============================================================ */

import * as A from '../nucleo/index.js';
import {
  $, $$, esc, dinero, diaCorto, hoyLocal, hoja, campo, campoMonto,
  selector, avisar, vacio
} from '../ui.js';
import { guardar, borrar } from '../datos/escribir.js';
import { fechaPorOmision } from '../datos/periodos.js';

/** Sin tildes y en minúsculas, para comparar como la gente escribe. */
const plano = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* El filtro es por DE DÓNDE SALIÓ el dinero, no por «tarjeta o efectivo».
   Con dos chips, lo de la cuenta de Judith —pagado con su débito— se
   mezclaba con la tarjeta de crédito bajo «Tarjeta», y no había forma de
   ver lo que se movió en una cuenta. `origen` es el id de la tarjeta, o
   'efectivo', o 'sin' para lo que quedó como tarjeta sin decir cuál. */
let filtro = { texto: '', origen: '', personaId: '' };

export function movimientos({ contenedor, D, periodo, hogar, recargar }) {
  const cerrado = A.mesCerrado(D, periodo);

  const porId = (lista, id) => (lista || []).find(x => x.id === id);
  const nombreGasto  = id => porId(D.gastos, id)?.concepto || 'Sin clasificar';
  const nombrePersona= id => porId(D.personas, id)?.nombre || '';
  const categoriaDe  = id => porId(D.gastos, id)?.categoria || 'Otros';

  /* ---------- lo del mes, ya filtrado ---------- */

  /* Con qué fecha se abre un formulario. Mirando el mes en curso es
     hoy; mirando uno pasado, el último día de ESE mes. El período de
     un movimiento sale de su FECHA, no de la pantalla: con la fecha de
     hoy, un gasto anotado mientras se mira julio se guardaría en agosto
     y desaparecería al guardarlo — anotado bien, en un mes que no se
     está mirando, y nadie lo encuentra después. */
  const fechaNueva = () => fechaPorOmision(A.rangoPeriodo(periodo, A.inicioMes(D)), hoyLocal());

  const delMes = (D.movimientos || []).filter(m => A.perDe(m) === periodo);

  const origenDe = m => (m.medioPago || 'tarjeta') === 'efectivo' ? 'efectivo' : (m.tarjetaId || 'sin');
  const tarjetaDe = id => porId(D.tarjetas, id);
  const nombreOrigen = o => o === 'efectivo' ? 'Efectivo'
    : o === 'sin' ? 'Tarjeta sin decir cuál'
    : tarjetaDe(o)?.nombre || 'Tarjeta borrada';
  // Primero las de crédito, después las de débito, al final el efectivo y
  // lo que no dice de dónde salió. Solo los que tienen algo este mes: un
  // chip que no filtra nada es ruido.
  const puesto = o => o === 'efectivo' ? 2 : o === 'sin' ? 3
    : (tarjetaDe(o)?.tipo === 'debito' ? 1 : 0);
  const origenes = [...new Set(delMes.map(origenDe))]
    .sort((a, b) => puesto(a) - puesto(b) || nombreOrigen(a).localeCompare(nombreOrigen(b)));
  if (filtro.origen && !origenes.includes(filtro.origen)) filtro.origen = '';

  const visibles = delMes.filter(m => {
    if (filtro.origen && origenDe(m) !== filtro.origen) return false;
    if (filtro.personaId && m.personaId !== filtro.personaId) return false;
    if (!filtro.texto) return true;
    const t = plano(filtro.texto);
    return [m.concepto, nombreGasto(m.gastoId), categoriaDe(m.gastoId),
            nombrePersona(m.personaId), m.fecha].some(x => plano(x).includes(t));
  }).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  const sumaVisible = visibles.reduce((s, m) => s + m.monto, 0);
  const cat = A.porCategoria(D, periodo);
  const efe = A.efectivo(D, periodo);

  /* ---------- pintar ---------- */

  contenedor.innerHTML = `
    ${cerrado ? `<p class="aviso aviso--error">Este mes está cerrado: no admite cambios.</p>` : ''}

    <section class="acciones-mov">
      <button class="boton boton--principal" type="button" data-nuevo="gasto" ${cerrado ? 'disabled' : ''}>Registrar gasto</button>
      <button class="boton boton--borde" type="button" data-nuevo="retiro" ${cerrado ? 'disabled' : ''}>Retiro de efectivo</button>
      <button class="boton boton--borde" type="button" data-nuevo="pago" ${cerrado ? 'disabled' : ''}>Pagar tarjeta</button>
      <!-- Aquí y no en la barra de abajo: importar no es un sitio al que
           se navega, es lo que uno piensa justo cuando iba a teclear
           treinta renglones a mano. -->
      <button class="boton boton--borde" type="button" data-importar>Importar del banco</button>
    </section>

    <div class="zonas">
      <section class="panel">
        <div class="buscador">
          <input type="search" id="buscar" placeholder="Buscar por detalle, rubro, categoría o persona"
                 value="${esc(filtro.texto)}" aria-label="Buscar movimientos">
          <!-- Dos grupos y no uno: de dónde salió y quién lo gastó son
               preguntas distintas, y en una sola fila «Judith» y «Débito
               Planilla Judith» parecían la misma cosa. -->
          ${origenes.length > 1 ? `
          <div class="chips" role="group" aria-label="De dónde salió">
            ${[['', 'Todo'], ...origenes.map(o => [o, nombreOrigen(o)])].map(([v, t]) => `
              <button class="chip" type="button" data-origen="${esc(v)}" aria-pressed="${filtro.origen === v}">${esc(t)}</button>`).join('')}
          </div>` : ''}
          ${(D.personas || []).length > 1 ? `
          <div class="chips" role="group" aria-label="Quién lo gastó">
            ${(D.personas || []).map(p => `
              <button class="chip" type="button" data-persona="${esc(p.id)}" aria-pressed="${filtro.personaId === p.id}">${esc(p.nombre)}</button>`).join('')}
          </div>` : ''}
        </div>

        ${visibles.length ? `
          <p class="buscador__cuenta">
            ${esc(visibles.length)} ${visibles.length === 1 ? 'movimiento' : 'movimientos'} ·
            <strong>${esc(dinero(sumaVisible))}</strong>
          </p>
          <ul class="movs-lista">
            ${visibles.map(m => `
              <li>
                <button class="mov-fila" type="button" data-editar="${esc(m.id)}">
                  <span class="mov-fila__dia">${esc(diaCorto(m.fecha))}</span>
                  <span class="mov-fila__txt">
                    <strong>${esc(m.concepto || nombreGasto(m.gastoId))}</strong>
                    <small>${esc(nombreGasto(m.gastoId))}${m.personaId ? ' · ' + esc(nombrePersona(m.personaId)) : ''}${origenes.length > 1 ? ' · ' + esc(nombreOrigen(origenDe(m))) : ''}${m.encargo ? ' · por encargo' : ''}</small>
                  </span>
                  <span class="mov-fila__monto">${esc(dinero(m.monto))}</span>
                </button>
              </li>`).join('')}
          </ul>`
        : delMes.length
          ? '<p class="pulso-app__pie">Ningún movimiento coincide con la búsqueda.</p>'
          : vacio('Todavía no hay movimientos', 'Registrá el primero y el mes empieza a tomar forma.')}
      </section>

      <section class="panel">
        <h2>En qué se fue</h2>
        ${cat.filas.length ? `
          <ul class="cat-lista">
            ${cat.filas.map(f => `
              <li>
                <span class="cat-lista__n">${esc(f.categoria)}</span>
                <span class="cat-lista__b"><i data-ancho="${Math.round(f.pct * 100)}"></i></span>
                <span class="cat-lista__v">${esc(dinero(f.monto))}<small>${Math.round(f.pct * 100)}%</small></span>
              </li>`).join('')}
          </ul>`
        : '<p class="pulso-app__pie">Nada gastado todavía este mes.</p>'}

        ${efe.hayDatos ? `
          <div class="ciclo-app ciclo-app--aparte">
            <div class="ciclo-app__f total">
              <em>Efectivo en mano</em>
              <span class="${efe.descuadre ? 'mal' : ''}">${esc(dinero(efe.saldo))}</span>
            </div>
            <div class="ciclo-app__f"><em>Retirado</em><span>${esc(dinero(efe.totalRetirado))}</span></div>
            <div class="ciclo-app__f"><em>Gastado en efectivo</em><span>${esc(dinero(efe.totalGastado))}</span></div>
            ${efe.descuadre ? '<div class="ciclo-app__f"><em class="ciclo-app__nota">Se gastó más efectivo del retirado: falta anotar un retiro, o un gasto quedó marcado como efectivo sin serlo.</em></div>' : ''}
          </div>
          <button class="boton boton--borde boton--chico efectivo__ajuste" type="button" data-ajustar-efectivo
                  ${cerrado ? 'disabled' : ''}>¿No cuadra? Decir cuánto hay</button>` : ''}
      </section>
    </div>`;

  contenedor.querySelectorAll('[data-ancho]').forEach(b => { b.style.width = b.dataset.ancho + '%'; });

  /* ---------- interacción ---------- */

  const buscar = $('#buscar', contenedor);
  let temporizador;
  buscar.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      filtro.texto = buscar.value;
      const pos = buscar.selectionStart;
      movimientos({ contenedor, D, periodo, hogar, recargar });
      const nuevo = $('#buscar', contenedor);
      nuevo.focus(); nuevo.setSelectionRange(pos, pos);
    }, 180);
  });

  $$('[data-origen]', contenedor).forEach(b => b.addEventListener('click', () => {
    // Tocar de nuevo un filtro encendido lo apaga.
    filtro.origen = filtro.origen === b.dataset.origen ? '' : b.dataset.origen;
    movimientos({ contenedor, D, periodo, hogar, recargar });
  }));

  $$('[data-persona]', contenedor).forEach(b => b.addEventListener('click', () => {
    filtro.personaId = filtro.personaId === b.dataset.persona ? '' : b.dataset.persona;
    movimientos({ contenedor, D, periodo, hogar, recargar });
  }));

  $$('[data-nuevo]', contenedor).forEach(b => b.addEventListener('click', () => {
    const tipo = b.dataset.nuevo;
    if (tipo === 'gasto')  formGasto(null);
    if (tipo === 'retiro') formRetiro(null);
    if (tipo === 'pago')   formPago(null);
  }));

  const aju = $('[data-ajustar-efectivo]', contenedor);
  if (aju) aju.addEventListener('click', () => formAjusteEfectivo());

  const imp = $('[data-importar]', contenedor);
  if (imp) imp.addEventListener('click', () => { location.hash = '#/importar'; });

  $$('[data-editar]', contenedor).forEach(b => b.addEventListener('click', () => {
    if (cerrado) return avisar('El mes está cerrado.', 'mal');
    formGasto(porId(D.movimientos, b.dataset.editar));
  }));

  /* ---------- formularios ---------- */

  const opcionesGasto   = () => (D.gastos || []).map(g => ({ valor: g.id, texto: `${g.concepto} · ${g.categoria}` }));
  const opcionesPersona = () => [{ valor: '', texto: '— sin persona —' }, ...(D.personas || []).map(p => ({ valor: p.id, texto: p.nombre }))];
  const opcionesTarjeta = () => (D.tarjetas || []).map(t => ({ valor: t.id, texto: t.nombre }));
  const opcionesCuenta  = () => [{ valor: '', texto: '— sin cuenta —' }, ...(D.cuentas || []).map(c => ({ valor: c.id, texto: c.nombre }))];

  function formGasto(m) {
    const credito = (D.tarjetas || []);
    hoja(m ? 'Editar movimiento' : 'Registrar gasto', `
      ${campoMonto('monto', 'Cuánto', m ? m.monto : '')}
      ${campo('fecha', 'Cuándo', `type="date" value="${esc(m ? m.fecha : fechaNueva())}"`)}
      ${selector('gastoId', 'A qué rubro', opcionesGasto(), m ? m.gastoId : '')}
      ${campo('concepto', 'Detalle', `value="${esc(m ? m.concepto : '')}" placeholder="Dónde, o qué fue"`)}
      ${selector('medioPago', 'Cómo se pagó',
        [{ valor: 'tarjeta', texto: 'Con tarjeta' }, { valor: 'efectivo', texto: 'En efectivo' }],
        m ? m.medioPago : 'tarjeta',
        'Esto decide si el gasto entra al corte de la tarjeta.')}
      ${credito.length ? selector('tarjetaId', 'Con cuál tarjeta',
        [{ valor: '', texto: '— ninguna —' }, ...opcionesTarjeta()], m ? m.tarjetaId : (credito[0]?.id || '')) : ''}
      ${selector('personaId', 'Quién lo hizo', opcionesPersona(), m ? m.personaId : '')}
      <label class="campo campo--pegado">
        <span>Por encargo: me lo van a devolver</span>
        <input type="checkbox" name="encargo"${m && m.encargo ? ' checked' : ''}>
        <small class="campo__ayuda">Una compra que hiciste por otra persona y que te
          va a pagar. Sigue contando en la tarjeta, pero no como gasto de la casa ni en
          tu media.</small>
      </label>
    `, {
      textoGuardar: m ? 'Guardar cambios' : 'Registrar',
      alBorrar: m ? async () => {
        await borrar('movimientos', m.id, m);
        avisar('Movimiento eliminado.');
        recargar();
      } : null,
      alGuardar: async (d, fallo) => {
        if (!d.monto || d.monto <= 0) return fallo('El monto tiene que ser mayor que cero.'), false;
        if (!d.fecha) return fallo('Falta la fecha.'), false;
        if (!d.gastoId) return fallo('Elegí a qué rubro pertenece.'), false;

        // El período se calcula con el día de arranque del hogar, no
        // con el mes del calendario: con arranque el 7, un gasto del
        // 2 de agosto pertenece a julio.
        const per = A.periodoDe(d.fecha, A.inicioMes(D));

        await guardar('movimientos', m ? m.id : null, {
          hogar_id: hogar.id, fecha: d.fecha, periodo: per, monto: d.monto,
          concepto: d.concepto || null, gasto_id: d.gastoId,
          persona_id: d.personaId || null,
          medio_pago: d.medioPago,
          tarjeta_id: d.medioPago === 'tarjeta' ? (d.tarjetaId || null) : null,
          encargo: Boolean(d.encargo)
        });
        avisar(m ? 'Movimiento actualizado.' : 'Gasto registrado.');
        recargar();
      }
    });
  }

  /* EL EFECTIVO SE CUENTA, NO SE DEDUCE.

     La app sabe lo que se retiró y lo que se anotó como gastado en
     efectivo. Lo que se gasta en la calle sin anotarlo —una pulpería, un
     taxi— no lo sabe, y el efectivo «en mano» se queda para siempre con
     plata que ya no existe. Pasó con L 2,200 retirados en agosto: el dueño
     dijo «eso ya no está, se agotó», y la app los seguía sumando.

     Pedir la cifra de la cartera es más fácil que reconstruir en qué se
     fue. La diferencia se anota tal cual: si falta, como gasto en efectivo
     —se gastó, aunque no se sepa en qué—; si sobra, como un retiro que no
     se anotó. Así el ajuste es un movimiento más, visible y borrable, y
     no una cifra corregida por debajo. */
  function formAjusteEfectivo() {
    const calculado = Math.round(efe.saldo * 100) / 100;
    hoja('Cuánto efectivo tienen hoy', `
      <p class="hoja__nota">
        La app calcula <b>${esc(dinero(calculado))}</b>: lo retirado menos lo que se
        anotó como gastado en efectivo. Si en la cartera hay otra cifra, escribila y
        la diferencia queda anotada como un movimiento más.
      </p>
      ${campoMonto('real', 'Lo que hay hoy en la cartera', '')}
      ${selector('gastoId', 'Si falta, en qué se fue',
        [{ valor: '', texto: '— no sé: sin clasificar —' }, ...opcionesGasto()], '')}
    `, {
      textoGuardar: 'Ajustar',
      alGuardar: async (d, fallo) => {
        if (d.real === null || !(d.real >= 0)) {
          return fallo('Escribí cuánto hay, aunque sea cero.'), false;
        }
        const diferencia = Math.round((calculado - d.real) * 100) / 100;
        if (Math.abs(diferencia) < 0.005) return avisar('Ya cuadraba: no hubo que anotar nada.');
        const fecha = fechaNueva();
        const per = A.periodoDe(fecha, A.inicioMes(D));
        if (diferencia > 0) {
          await guardar('movimientos', null, {
            hogar_id: hogar.id, fecha, periodo: per, monto: diferencia,
            concepto: 'Efectivo gastado sin anotar', gasto_id: d.gastoId || null,
            persona_id: null, medio_pago: 'efectivo', tarjeta_id: null
          });
          avisar(`Anotado: ${dinero(diferencia)} de efectivo que se gastó sin registrar.`);
        } else {
          await guardar('retiros', null, {
            hogar_id: hogar.id, fecha, periodo: per, monto: -diferencia,
            cuenta_id: null, persona_id: null, nota: 'Efectivo que no se anotó al sacarlo'
          });
          avisar(`Anotado: ${dinero(-diferencia)} de efectivo que no se había registrado.`);
        }
        recargar();
      }
    });
  }

  function formRetiro(r) {
    hoja('Retiro de efectivo', `
      <p class="hoja__nota">
        Un retiro no es un gasto: solo pasa dinero de la cuenta a la cartera.
        No resta del presupuesto ni entra al corte de la tarjeta.
      </p>
      ${campoMonto('monto', 'Cuánto', r ? r.monto : '')}
      ${campo('fecha', 'Cuándo', `type="date" value="${esc(r ? r.fecha : fechaNueva())}"`)}
      ${(D.cuentas || []).length ? selector('cuentaId', 'De qué cuenta', opcionesCuenta(), r ? r.cuentaId : '') : ''}
      ${selector('personaId', 'Quién lo sacó', opcionesPersona(), r ? r.personaId : '')}
      ${campo('nota', 'Nota', `value="${esc(r ? r.nota : '')}" placeholder="En qué cajero"`)}
    `, {
      textoGuardar: 'Registrar retiro',
      alGuardar: async (d, fallo) => {
        if (!d.monto || d.monto <= 0) return fallo('El monto tiene que ser mayor que cero.'), false;
        await guardar('retiros', r ? r.id : null, {
          hogar_id: hogar.id, fecha: d.fecha, periodo: A.periodoDe(d.fecha, A.inicioMes(D)),
          monto: d.monto, cuenta_id: d.cuentaId || null,
          persona_id: d.personaId || null, nota: d.nota || null
        });
        avisar('Retiro registrado.');
        recargar();
      }
    });
  }

  function formPago(p) {
    const credito = (D.tarjetas || []).filter(t => (t.tipo || 'credito') === 'credito');
    if (!credito.length) return avisar('No hay tarjetas de crédito registradas.', 'mal');

    // Se sugiere lo que falta por saldar: es la cifra que la persona
    // iba a buscar de todos modos.
    const sugerido = (() => {
      try { return Math.max(0, A.pagoPendiente(D, credito[0], periodo) || 0); } catch { return 0; }
    })();

    hoja('Pagar tarjeta', `
      <p class="hoja__nota">
        Pagar la tarjeta no es un gasto nuevo: los consumos ya se contaron.
        Esto solo mueve el dinero de la cuenta a la tarjeta.
      </p>
      ${campoMonto('monto', 'Cuánto', sugerido ? sugerido.toFixed(2) : '')}
      ${campo('fecha', 'Cuándo', `type="date" value="${esc(fechaNueva())}"`)}
      ${selector('tarjetaId', 'Qué tarjeta', opcionesTarjeta(), credito[0].id)}
      ${(D.cuentas || []).length ? selector('cuentaId', 'De qué cuenta sale', opcionesCuenta()) : ''}
      ${campo('nota', 'Nota', 'placeholder="Opcional"')}
    `, {
      textoGuardar: 'Registrar pago',
      alGuardar: async (d, fallo) => {
        if (!d.monto || d.monto <= 0) return fallo('El monto tiene que ser mayor que cero.'), false;
        await guardar('pagos_tarjeta', null, {
          hogar_id: hogar.id, fecha: d.fecha, periodo: A.periodoDe(d.fecha, A.inicioMes(D)),
          monto: d.monto, tarjeta_id: d.tarjetaId,
          cuenta_id: d.cuentaId || null, nota: d.nota || null
        });
        avisar('Pago registrado.');
        recargar();
      }
    });
  }
}
