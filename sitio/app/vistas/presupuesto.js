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
  $, $$, esc, dinero, mesLocal, hoja, campo, campoMonto,
  selector, avisar, CATEGORIAS, MONEDAS
} from '../ui.js';
import { crear, actualizar, borrar, fusionar } from '../datos/escribir.js';
import { FILAS, dijoAlgo } from '../datos/filas.js';


export function presupuesto({ contenedor, D, periodo, hogar, recargar }) {
  const ctx = { hogarId: hogar.id };
  const r = A.resumenMes(D, periodo);
  const congelado = A.mesCongelado(D, periodo);

  const porId = (lista, id) => (lista || []).find(x => x.id === id);
  const nombreDe = (lista, id) => porId(lista, id)?.nombre || '';

  const personas = D.personas || [];
  const cuentas = D.cuentas || [];
  const tarjetas = D.tarjetas || [];
  const gastos = D.gastos || [];
  const pagos = D.plantillaIngresos || [];
  const finan = D.financiamientos || [];
  const credito = tarjetas.filter(t => (t.tipo || 'credito') === 'credito');

  /** Neto típico de un pago: lo que dice la plantilla, no lo confirmado. */
  const netoTipico = ev => (ev.lineas || []).reduce((s, l) => s + A.netoLinea(l), 0);
  const totalTipico = pagos.reduce((s, ev) => s + netoTipico(ev), 0);
  const totalGastos = gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);

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
            ${lista(pagos.map(ev => fila('pago', ev.id,
              `${esc(ev.nombre)} <span class="etiqueta">día ${esc(ev.dia)}</span>`,
              (ev.lineas || []).length
                ? esc(personas.filter(p => (ev.lineas || []).some(l => l.personaId === p.id))
                    .map(p => p.nombre).join(' y ')) || 'sin personas asignadas'
                : 'todavía sin montos',
              dinero(netoTipico(ev)), 'neto típico')))}
            ${total('Ingreso neto típico del mes', totalTipico)}
            <p class="pulso-app__pie panel__nota">
              Son los montos de un mes normal. Lo que de verdad entró se confirma
              mes a mes, y ahí es donde se registra el ISR que tocó.
            </p>`
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
              dinero(c.saldoInicial), `desde ${esc(c.desdeMes || '—')}`);
          }))
          : nada('Sin cuentas. Registrá dónde les depositan.')}
          ${cuentas.length ? `<p class="pulso-app__pie panel__nota">
            El monto es con el que arranca la cuenta, no su saldo de hoy: para
            saber el saldo hace falta todo el histórico, y aquí solo vive el mes
            en curso.</p>` : ''}
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

  $$('[data-nuevo]', contenedor).forEach(b =>
    b.addEventListener('click', () => ABRIR[b.dataset.nuevo](null)));

  $$('[data-editar]', contenedor).forEach(b =>
    b.addEventListener('click', () => ABRIR[b.dataset.editar](b.dataset.id)));

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
        `type="month" value="${esc(t && t.desdeMes ? t.desdeMes : mesLocal())}"`)}
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

  /* ---------- el editor de pagos ----------

     El único formulario con estructura: un pago lleva dentro lo que
     le toca a CADA persona, y cada persona lleva sus retenciones. Se
     lee del DOM en vez de con `datosDeForma` porque son campos que
     nacen y mueren mientras el formulario está abierto. */

  function formPago(ev) {
    const sePuedeBorrar = Boolean(ev) && pagos.length > 1;
    const lineaDe = pid => (ev && (ev.lineas || []).find(l => l.personaId === pid)) || null;

    const filaDed = d => `
      <div class="ded" data-ded>
        <input class="ded__c" data-k="concepto" value="${esc(d ? d.concepto : '')}" placeholder="ISR, seguro…" aria-label="Concepto de la retención">
        <input class="ded__m" data-k="monto" type="number" inputmode="decimal" step="0.01" min="0"
               value="${esc(d ? d.monto : '')}" placeholder="0.00" aria-label="Monto de la retención">
        <button class="iconbtn" type="button" data-quita-ded aria-label="Quitar retención">✕</button>
      </div>`;

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

    /** Lo que dice cada bloque de persona, ahora mismo. */
    function leerBloques() {
      return $$('[data-persona]', caja).map(b => ({
        personaId: b.dataset.persona,
        bruto: Math.max(0, Number($('[data-k="bruto"]', b).value) || 0),
        deducciones: $$('[data-ded]', b).map(f => ({
          concepto: $('[data-k="concepto"]', f).value.trim() || 'Retención',
          monto: Math.max(0, Number($('[data-k="monto"]', f).value) || 0)
        })).filter(x => x.monto > 0)
      }));
    }

    /** El neto, en vivo. Es la cifra que la persona reconoce de su boleta. */
    function refrescarNetos() {
      for (const b of $$('[data-persona]', caja)) {
        const l = leerBloques().find(x => x.personaId === b.dataset.persona);
        const neto = l.bruto - l.deducciones.reduce((s, x) => s + x.monto, 0);
        const pie = $('[data-neto]', b);
        pie.textContent = `Neto: ${dinero(neto)}`;
        pie.dataset.tono = neto < 0 ? 'mal' : 'ok';
      }
    }

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
}
