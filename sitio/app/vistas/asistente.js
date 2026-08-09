/* ============================================================
   El asistente de arranque.

   Lo que separa una base vacía de un presupuesto que sirve. Cinco
   pasos, y al final el hogar calcula de verdad.

   DOS DECISIONES QUE VALE LA PENA CONOCER:

   1. CADA PASO SE GUARDA AL TERMINARLO, no todo al final. Si
      alguien cierra la pestaña en el paso 3, lo de los pasos 1 y 2
      quedó guardado y puede seguir después. Guardar todo al final
      sería más simple de programar y castigaría a quien se
      interrumpe — que en un teléfono es cualquiera.

   2. NADA DE ESTRUCTURA HEREDADA. Las categorías, los pagos y los
      rubros que se sugieren son EJEMPLOS que se pueden botar
      enteros. La app anterior traía el presupuesto de un hogar
      concreto metido dentro; esta no supone nada sobre cómo vive
      quien la usa.
   ============================================================ */

import { esc, campo, campoMonto, selector, datosDeForma, avisar, $, $$ } from '../ui.js';
import { crear, crearVarias, actualizar } from '../datos/escribir.js';

/* Sugerencias, no imposiciones. Se muestran para que nadie empiece
   frente a una hoja en blanco, y se borran de un toque. */
const CATEGORIAS = ['Alimentación', 'Servicios', 'Transporte', 'Salud', 'Hogar', 'Educación', 'Otros'];

const GASTOS_SUGERIDOS = [
  { concepto: 'Supermercado', categoria: 'Alimentación', medio: 'tarjeta' },
  { concepto: 'Energía eléctrica', categoria: 'Servicios', medio: 'tarjeta' },
  { concepto: 'Agua', categoria: 'Servicios', medio: 'efectivo' },
  { concepto: 'Internet y teléfono', categoria: 'Servicios', medio: 'tarjeta' },
  { concepto: 'Combustible', categoria: 'Transporte', medio: 'tarjeta' }
];

const MONEDAS = [
  { valor: 'HNL', texto: 'Lempira (L)' },
  { valor: 'USD', texto: 'Dólar ($)' },
  { valor: 'GTQ', texto: 'Quetzal (Q)' },
  { valor: 'CRC', texto: 'Colón (₡)' },
  { valor: 'MXN', texto: 'Peso mexicano ($)' },
  { valor: 'EUR', texto: 'Euro (€)' }
];

export function asistente({ contenedor, hogar, alTerminar }) {
  let paso = 1;
  const total = 5;
  let personas = [];      // se llenan al guardar el paso 2
  let pagos = [];
  let borrador = { personas: [{ nombre: '' }], pagos: [], gastos: [] };

  /* ---------- armazón ---------- */

  function pintar(titulo, entrada, cuerpo, { atras = true, siguiente = 'Continuar', saltar = null } = {}) {
    contenedor.innerHTML = `
      <div class="asistente">
        <div class="asistente__pasos" aria-label="Progreso">
          ${Array.from({ length: total }, (_, i) => `
            <span class="asistente__paso" data-estado="${i + 1 < paso ? 'hecho' : i + 1 === paso ? 'actual' : 'falta'}"></span>`).join('')}
        </div>
        <p class="rotulo">Paso ${paso} de ${total}</p>
        <h1 class="lectura">${esc(titulo)}</h1>
        <p class="asistente__entrada">${entrada}</p>
        <form class="asistente__forma" novalidate>
          ${cuerpo}
          <p class="aviso aviso--error" data-error hidden role="alert"></p>
          <div class="asistente__pie">
            ${atras && paso > 1 ? '<button class="boton boton--borde" type="button" data-atras>Atrás</button>' : ''}
            ${saltar ? `<button class="boton boton--borde" type="button" data-saltar>${esc(saltar)}</button>` : ''}
            <button class="boton boton--principal" type="submit">${esc(siguiente)}</button>
          </div>
        </form>
      </div>`;

    const forma = $('form', contenedor);
    const error = $('[data-error]', contenedor);
    const fallo = m => { error.textContent = m; error.hidden = false; error.scrollIntoView({ block: 'center' }); };

    forma.addEventListener('submit', async e => {
      e.preventDefault();
      error.hidden = true;
      const btn = $('button[type="submit"]', forma);
      btn.disabled = true; const antes = btn.textContent; btn.textContent = 'Guardando…';
      try { await PASOS[paso].guardar(forma, fallo); }
      catch (err) { fallo(err.message || 'No se pudo guardar.'); }
      finally { btn.disabled = false; btn.textContent = antes; }
    });

    const atrasBtn = $('[data-atras]', contenedor);
    if (atrasBtn) atrasBtn.addEventListener('click', () => { paso--; PASOS[paso].pintar(); });

    const saltarBtn = $('[data-saltar]', contenedor);
    if (saltarBtn) saltarBtn.addEventListener('click', () => avanzar());

    window.scrollTo(0, 0);
  }

  function avanzar() {
    if (paso >= total) return alTerminar();
    paso++;
    PASOS[paso].pintar();
  }

  /* ---------- listas editables ---------- */

  function listaEditable(clase, filasHTML, textoAgregar) {
    return `
      <div class="lista-edit" data-lista="${esc(clase)}">${filasHTML}</div>
      <button class="boton boton--borde boton--bloque" type="button" data-agregar="${esc(clase)}">
        + ${esc(textoAgregar)}
      </button>`;
  }

  function engancharLista(clase, nuevaFila) {
    const btn = $(`[data-agregar="${clase}"]`, contenedor);
    if (btn) btn.addEventListener('click', () => {
      const cont = $(`[data-lista="${clase}"]`, contenedor);
      cont.insertAdjacentHTML('beforeend', nuevaFila(cont.children.length));
      engancharQuitar();
      const nuevos = $$('input', cont);
      if (nuevos.length) nuevos[nuevos.length - 1].focus();
    });
    engancharQuitar();
  }

  function engancharQuitar() {
    $$('[data-quitar]', contenedor).forEach(b => {
      if (b.dataset.enganchado) return;
      b.dataset.enganchado = 'si';
      b.addEventListener('click', () => b.closest('[data-fila]').remove());
    });
  }

  const filaHTML = (contenido) => `
    <div class="lista-edit__fila" data-fila>
      ${contenido}
      <button class="iconbtn" type="button" data-quitar aria-label="Quitar">✕</button>
    </div>`;

  /* ---------- los cinco pasos ---------- */

  const PASOS = {

    /* 1 · el hogar */
    1: {
      pintar: () => {
        pintar('Empecemos por tu hogar',
          'Dos datos y ya. Todo esto se puede cambiar después.',
          `${campo('nombre', 'Nombre del hogar', `value="${esc(hogar.nombre || '')}" placeholder="Mi hogar" required`)}
           ${selector('moneda', 'Moneda', MONEDAS, hogar.moneda || 'HNL')}
           ${campo('inicio_mes', '¿Qué día arranca tu mes?',
             `type="number" inputmode="numeric" min="1" max="28" value="${esc(hogar.inicio_mes || 1)}"`,
             'Dejá 1 si usás el mes del calendario. Si vivís según el corte de tu tarjeta —por ejemplo del 7 al 6— poné ese día y todo lo demás se acomoda.')}`,
          { atras: false });
      },
      guardar: async (forma, fallo) => {
        const d = datosDeForma(forma);
        if (!d.nombre) return fallo('Ponele un nombre a tu hogar.');
        const dia = Math.min(28, Math.max(1, Number(d.inicio_mes) || 1));
        await actualizar('hogares', hogar.id, { nombre: d.nombre, moneda: d.moneda, inicio_mes: dia });
        Object.assign(hogar, { nombre: d.nombre, moneda: d.moneda, inicio_mes: dia });
        avanzar();
      }
    },

    /* 2 · las personas */
    2: {
      pintar: () => {
        const fila = i => filaHTML(campo(`persona_${i}`, i === 0 ? 'Nombre' : '', `placeholder="Nombre" value=""`));
        pintar('¿Quiénes usan este hogar?',
          'Los nombres que van a aparecer en cada ingreso y cada gasto. Podés ser vos solo.',
          listaEditable('personas', (borrador.personas.length ? borrador.personas : [{}]).map((_, i) => fila(i)).join(''), 'Agregar persona'));
        engancharLista('personas', fila);
      },
      guardar: async (forma, fallo) => {
        const nombres = $$('[data-lista="personas"] input', contenedor)
          .map(i => i.value.trim()).filter(Boolean);
        if (!nombres.length) return fallo('Agregá al menos una persona.');

        personas = await crearVarias('personas', nombres.map(n => ({ hogar_id: hogar.id, nombre: n })));
        borrador.personas = nombres.map(n => ({ nombre: n }));
        avanzar();
      }
    },

    /* 3 · lo que entra */
    3: {
      pintar: () => {
        const fila = i => filaHTML(`
          <div class="lista-edit__grupo">
            ${campo(`pago_nombre_${i}`, 'Nombre del pago', `placeholder="Sueldo, comisiones, quincena…"`)}
            ${campo(`pago_dia_${i}`, 'Día del mes', `type="number" inputmode="numeric" min="1" max="31" placeholder="15"`)}
            ${selector(`pago_persona_${i}`, '¿Quién lo recibe?',
              personas.map(p => ({ valor: p.id, texto: p.nombre })))}
            ${campoMonto(`pago_bruto_${i}`, 'Monto bruto típico')}
            ${campoMonto(`pago_ret_${i}`, 'Retenciones (ISR, seguro…)', '', 'Dejá vacío si no le descuentan nada.')}
          </div>`);

        pintar('¿Qué entra, y cuándo?',
          'Los montos son <strong>típicos</strong>. Cada mes vas a confirmar lo que de verdad entró — ahí es donde se registra el ISR que tocó ese mes.',
          listaEditable('pagos', fila(0), 'Agregar otro pago'));
        engancharLista('pagos', fila);
      },
      guardar: async (forma, fallo) => {
        const filas = $$('[data-lista="pagos"] [data-fila]', contenedor).map(f => ({
          nombre:  $('[name^="pago_nombre"]', f)?.value.trim(),
          dia:     Number($('[name^="pago_dia"]', f)?.value) || 0,
          persona: $('[name^="pago_persona"]', f)?.value,
          bruto:   Number($('[name^="pago_bruto"]', f)?.value) || 0,
          ret:     Number($('[name^="pago_ret"]', f)?.value) || 0
        })).filter(p => p.nombre);

        if (!filas.length) return fallo('Agregá al menos un pago.');
        const malo = filas.find(p => !p.dia || p.dia < 1 || p.dia > 31);
        if (malo) return fallo(`Falta el día del mes en que cae «${malo.nombre}».`);
        const excede = filas.find(p => p.ret > p.bruto);
        if (excede) return fallo(`En «${excede.nombre}» las retenciones superan al bruto.`);

        for (const p of filas) {
          const pago = await crear('plantilla_ingresos', { hogar_id: hogar.id, nombre: p.nombre, dia: p.dia });
          await crear('plantilla_lineas', {
            hogar_id: hogar.id, plantilla_id: pago.id, persona_id: p.persona,
            bruto: p.bruto,
            deducciones: p.ret > 0 ? [{ concepto: 'Retenciones', monto: p.ret }] : []
          });
          pagos.push(pago);
        }
        avanzar();
      }
    },

    /* 4 · la tarjeta */
    4: {
      pintar: () => {
        pintar('¿Usás tarjeta de crédito?',
          'Es donde esta app se vuelve distinta: la vigila por ciclo de corte en vez de tratarla como una deuda aparte. Si no usás, saltate este paso.',
          `${campo('nombre', 'Nombre de la tarjeta', 'placeholder="BAC, Ficohsa, Atlántida…"')}
           ${campo('dia_corte', '¿Qué día corta?', 'type="number" inputmode="numeric" min="1" max="31" placeholder="6"')}
           ${selector('paga_con', '¿Qué ingreso la paga?',
             [{ valor: '', texto: '— todavía no sé —' }, ...pagos.map(p => ({ valor: p.id, texto: p.nombre }))],
             '', 'De aquí sale la pregunta que importa cada mes: ¿ese ingreso alcanza a cubrir el corte?')}`,
          { siguiente: 'Continuar', saltar: 'No uso tarjeta' });
      },
      guardar: async (forma, fallo) => {
        const d = datosDeForma(forma);
        if (!d.nombre) return avanzar();          // en blanco es lo mismo que saltar
        const corte = Number(d.dia_corte);
        if (!corte || corte < 1 || corte > 31) return fallo('Falta el día de corte de la tarjeta.');

        await crear('tarjetas', {
          hogar_id: hogar.id, nombre: d.nombre, tipo: 'credito',
          dia_corte: corte, paga_con: d.paga_con || null
        });
        avanzar();
      }
    },

    /* 5 · lo que se va */
    5: {
      pintar: () => {
        const fila = (i, s = {}) => filaHTML(`
          <div class="lista-edit__grupo">
            ${campo(`gasto_concepto_${i}`, 'En qué', `placeholder="Supermercado" value="${esc(s.concepto || '')}"`)}
            ${campoMonto(`gasto_monto_${i}`, 'Cuánto al mes')}
            ${selector(`gasto_cat_${i}`, 'Categoría',
              CATEGORIAS.map(c => ({ valor: c, texto: c })), s.categoria || 'Otros')}
            ${selector(`gasto_medio_${i}`, 'Cómo se paga',
              [{ valor: 'tarjeta', texto: 'Con tarjeta' }, { valor: 'efectivo', texto: 'En efectivo' }],
              s.medio || 'tarjeta')}
          </div>`);

        pintar('¿En qué se va?',
          'Estos son ejemplos: borrá los que no van y agregá los tuyos. <strong>Cómo se paga</strong> importa — es lo que decide si el gasto entra o no al corte de la tarjeta.',
          listaEditable('gastos', GASTOS_SUGERIDOS.map((s, i) => fila(i, s)).join(''), 'Agregar gasto'),
          { siguiente: 'Terminar' });
        engancharLista('gastos', i => fila(i));
      },
      guardar: async (forma, fallo) => {
        const filas = $$('[data-lista="gastos"] [data-fila]', contenedor).map((f, i) => ({
          concepto: $('[name^="gasto_concepto"]', f)?.value.trim(),
          monto:    Number($('[name^="gasto_monto"]', f)?.value) || 0,
          categoria:$('[name^="gasto_cat"]', f)?.value,
          medio:    $('[name^="gasto_medio"]', f)?.value,
          orden: i
        })).filter(g => g.concepto && g.monto > 0);

        if (!filas.length) return fallo('Agregá al menos un gasto con su monto.');

        await crearVarias('gastos', filas.map(g => ({
          hogar_id: hogar.id, concepto: g.concepto, monto: g.monto,
          categoria: g.categoria, medio_pago: g.medio, orden: g.orden
        })));

        avisar('Tu hogar quedó armado.');
        alTerminar();
      }
    }
  };

  PASOS[1].pintar();
}
