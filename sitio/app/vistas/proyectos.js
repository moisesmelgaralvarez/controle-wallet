/* ============================================================
   Proyectos — las metas, y si conviene hacerlas ahora.

   Aquí conviven DOS CAPAS que el núcleo distingue a propósito y que
   esta pantalla no puede confundir:

     FLUJO      ¿el dinero alcanza? Sale del plan del mes —ingresos,
                gastos, cuotas— y de lo ya aportado. Siempre se puede
                calcular con lo que el navegador tiene.

     VEREDICTO  ¿conviene hacerlo AHORA? Ordena por mérito —salud y
                seguridad antes que cualquier gusto— y castiga al
                gusto cuando no hay colchón o hay deuda cara.

   Un deseo puede tener flujo «viable» y veredicto «reconsideralo» al
   mismo tiempo, y esa tensión es justo la información que la app
   existe para dar.

   POR QUÉ EL VEREDICTO A VECES NO SALE

   El veredicto necesita saber cuánto tiene el hogar líquido y cuánto
   debe, y eso sale de `saludFinanciera`, que recorre TODO el
   histórico. En el navegador solo vive el mes en curso.

   Medido: el mismo proyecto sale «Programado» con doce meses de
   historia y «Reconsideralo» con uno solo, inventándose la razón
   («no hay ni un mes de colchón»). Un veredicto al revés, dicho con
   seguridad, es peor que no darlo.

   La salida es el ANCLA DE CONCILIACIÓN. Cuando una cuenta o una
   tarjeta declara el saldo que dijo el banco, el núcleo parte de esa
   cifra y solo le suma lo posterior a esa fecha — y eso el navegador
   sí lo tiene. Medido también: con el ancla dentro del mes cargado,
   un mes da EXACTAMENTE el mismo número que doce.

   Así que el veredicto sale cuando las anclas están al día, y cuando
   no, se dice qué falta y dónde ponerlo. Lo demás —progreso, cuota,
   plazo y si el dinero alcanza— se muestra siempre, porque siempre
   es cierto.
   ============================================================ */

import * as A from '../nucleo/index.js';
import {
  $, $$, esc, dinero, hoyLocal, mesLocal, hoja, campo, campoMonto,
  selector, avisar, vacio
} from '../ui.js';
import { crear, actualizar, borrar } from '../datos/escribir.js';
import { FILAS } from '../datos/filas.js';
import { alcanzaParaPatrimonio } from '../datos/alcance.js';
import { historico } from '../datos/historico.js';

/* ---------- vocabulario ---------- */

const TIPOS = [
  ['salud',      'Salud — una muela, una medicina, algo del cuerpo'],
  ['seguridad',  'Seguridad — evita un daño mayor o un peligro'],
  ['esencial',   'Esencial — hace falta de verdad, no es un gusto'],
  ['productivo', 'Productivo — genera ingreso o ahorra dinero después'],
  ['deseo',      'Deseo — un gusto, puede esperar']
];

const URGENCIAS = [
  ['ya',        'Ya — no aguanta más'],
  ['este_ano',  'Este año'],
  ['algun_dia', 'Algún día, sin prisa']
];

/** El tono con que se pinta cada veredicto de mérito. */
const TONO = {
  hazlo_ya: 'ya', programado: 'bien', puede_esperar: 'espera',
  reconsiderar: 'mal', logrado: 'listo'
};

/** Y el de la capa de flujo, que es la que siempre se puede calcular. */
const FLUJO = {
  viable:   { texto: 'El dinero alcanza', tono: 'bien' },
  ajustado: { texto: 'Ajustado',          tono: 'espera' },
  inviable: { texto: 'No alcanza',        tono: 'mal' },
  logrado:  { texto: 'Alcanzado',         tono: 'listo' }
};

/** Un plazo en meses, dicho como lo diría una persona. */
function enMeses(n) {
  if (n === 0) return 'ya';
  if (n == null) return 'más de cinco años';
  if (n === 1) return 'un mes';
  if (n < 12) return `${n} meses`;
  const años = Math.floor(n / 12), resto = n % 12;
  const a = años === 1 ? 'un año' : `${años} años`;
  return resto ? `${a} y ${resto} ${resto === 1 ? 'mes' : 'meses'}` : a;
}

const mayus = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

/* ============================================================
   La vista
   ============================================================ */

export function proyectos({ contenedor, D, periodo, hogar, recargar }) {
  const ctx = { hogarId: hogar.id };
  const lista = D.proyectos || [];
  const personas = D.personas || [];
  const cuentas = D.cuentas || [];

  /* ---------- de dónde sale el veredicto ----------

     Tres estados, en orden de preferencia, y ninguno miente:

       1. Lo dijo EL SERVIDOR, que corrió el mismo núcleo sobre todo
          el histórico. Es la respuesta buena y la que acaba llegando.

       2. Todavía no contesta, pero las anclas de conciliación están
          al día — y entonces lo que hay cargado alcanza para el mismo
          resultado exacto. Ver `datos/alcance.js`.

       3. Ni lo uno ni lo otro: solo se enseña si el dinero alcanza, y
          se dice qué falta.

     La pantalla arranca en 2 o 3 y sube a 1 cuando el servidor
     contesta. Nunca se queda esperando: lo que se dibuja de entrada
     ya es cierto, y lo que llega después solo agrega. */

  let cartera = null;      // lo que devolvió el servidor
  let falloDelServidor = null;

  function estado() {
    if (cartera) return { juzga: true, fuente: 'servidor' };
    const alcance = alcanzaParaPatrimonio(D, periodo);
    if (alcance.exacto) return { juzga: true, fuente: 'ancla' };
    return { juzga: false, fuente: null, faltan: alcance.faltan };
  }

  /** Las metas en el orden y con el juicio que corresponda al estado. */
  function ordenar(est) {
    if (!est.juzga) {
      // Sin veredicto, el orden es el que la persona le dio a la lista.
      return lista.map(p => ({ p, ev: A.evaluarProyecto(D, p, periodo), porque: [],
                               tipo: A.tipoDe(p), urgencia: A.urgenciaDe(p) }));
    }
    if (est.fuente === 'ancla') return A.priorizar(D, periodo).filas;

    // Del servidor viene un mapa por id; el orden lo da `posicion`.
    return lista
      .filter(p => cartera[p.id])
      .map(p => {
        const ev = cartera[p.id];
        return { p, ev, porque: ev.porque || [], tipo: ev.tipo, urgencia: ev.urgencia,
                 veredicto: ev.veredicto, posicion: ev.posicion };
      })
      .sort((a, b) => a.posicion - b.posicion);
  }

  /* ---------- piezas ---------- */

  const insignia = (texto, tono) => `<span class="sello" data-tono="${esc(tono)}">${esc(texto)}</span>`;

  const alerta = a => `<li data-nivel="${esc(a.nivel)}">${esc(a.texto)}</li>`;

  function consejo(ev) {
    if (ev.faltaMax <= 0) return `
      <div class="consejo" data-tono="listo">
        <strong>Meta alcanzada</strong>
        <p>Ya reunieron lo necesario; sobran ${esc(dinero(ev.junta - ev.max))}.</p>
      </div>`;

    if (ev.disponible <= 0) return `
      <div class="consejo" data-tono="mal">
        <strong>Sin margen para avanzar</strong>
        <p>El disponible real es ${esc(dinero(ev.disponible))}. Hay que liberar flujo
           —bajar gastos o terminar un financiamiento— antes de comprometer nada aquí.</p>
      </div>`;

    if (ev.sinMargen) return `
      <div class="consejo" data-tono="mal">
        <strong>En espera</strong>
        <p>Los proyectos de arriba ya reservan todo el margen seguro del mes. Este arranca
           cuando alguno termine. Destinando todo el disponible, sin colchón, tomaría
           <b>${esc(enMeses(ev.mesesMax))}</b>.</p>
      </div>`;

    const rango = ev.max > ev.min;
    return `
      <div class="consejo">
        <strong>Recomendación</strong>
        <p>Apartando <b>${esc(dinero(ev.cuotaSugerida))}</b> al mes
           (<b>${esc(dinero(ev.quincenal))}</b> por quincena) alcanzan
           ${rango ? 'el costo máximo' : 'la meta'} en <b>${esc(enMeses(ev.mesesSugerido))}</b>.${
          rango && ev.mesesMin !== ev.mesesMax
            ? ` Si la cotización sale en el extremo bajo, bastan <b>${esc(enMeses(ev.mesesMin))}</b> destinando todo el disponible.`
            : ''}</p>
        ${ev.cuotaObjetivo != null ? `
          <p>Para llegar a la fecha objetivo harían falta <b>${esc(dinero(ev.cuotaObjetivo))}</b>
             al mes durante ${esc(enMeses(ev.mesesObjetivo))}.</p>` : ''}
        <small>Compromete el ${Math.round(Math.min(999, ev.carga * 100))}% del disponible real
               de ${esc(dinero(ev.disponible))}.</small>
      </div>`;
  }

  function tarjeta(f, i, est, cuantas) {
    const p = f.p, ev = f.ev;
    const rango = ev.max > ev.min;
    const pct = ev.max > 0 ? Math.min(100, ev.junta / ev.max * 100) : 0;
    const aportes = (p.aportes || []).slice()
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

    return `
      <article class="panel proy">
        <div class="panel__tope">
          <div class="proy__id">
            <h2>${esc(p.nombre)}</h2>
            <small>${rango ? `${esc(dinero(ev.min))} – ${esc(dinero(ev.max))}` : esc(dinero(ev.max))}${
              p.nota ? ' · ' + esc(p.nota) : ''}</small>
          </div>
          <button class="boton boton--borde boton--chico" type="button"
                  data-editar-proyecto="${esc(p.id)}">Editar</button>
        </div>

        <div class="sellos">
          ${est.juzga
            ? insignia(A.VEREDICTOS[f.veredicto], TONO[f.veredicto] || 'espera')
            : insignia(FLUJO[ev.veredicto].texto, FLUJO[ev.veredicto].tono)}
          ${insignia(A.TIPOS_PROYECTO[f.tipo].etiqueta, 'neutro')}
          ${insignia(A.ETIQUETA_URGENCIA[f.urgencia], 'neutro')}
          ${est.juzga && cuantas > 1 ? insignia(`#${i + 1} por mérito`, 'neutro') : ''}
        </div>

        ${f.porque.length ? `<p class="proy__porque">${esc(mayus(f.porque.join('; ')))}.</p>` : ''}
        ${p.consecuencia ? `<p class="proy__porque">Si no se hace: ${esc(p.consecuencia)}</p>` : ''}

        <div class="proy__via"><div class="proy__va" data-ancho="${pct.toFixed(1)}"></div></div>
        <div class="proy__cifras">
          <span>${esc(dinero(ev.junta))} acumulado</span>
          <span>${Math.round(pct)}% del ${rango ? 'máximo' : 'total'}</span>
        </div>

        ${consejo(ev)}
        ${ev.alertas.length ? `<ul class="alertas">${ev.alertas.map(alerta).join('')}</ul>` : ''}

        ${aportes.length ? `
          <ul class="lista-cfg proy__aportes">
            ${aportes.map(ap => `
              <li>
                <button class="fila-cfg" type="button"
                        data-editar-aporte="${esc(ap.id)}" data-proyecto="${esc(p.id)}">
                  <span class="fila-cfg__t">
                    <strong>${esc((personas.find(x => x.id === ap.personaId) || {}).nombre || 'Sin persona')}</strong>
                    <small>${esc(ap.fecha || '')}${ap.nota ? ' · ' + esc(ap.nota) : ''}</small>
                  </span>
                  <span class="fila-cfg__v">${esc(dinero(ap.monto))}</span>
                </button>
              </li>`).join('')}
          </ul>
          <div class="total-cfg"><span>Aportado</span><span>${esc(dinero(ev.junta))}</span></div>` : ''}

        <button class="boton boton--borde boton--bloque" type="button"
                data-nuevo-aporte="${esc(p.id)}">Registrar aporte</button>
      </article>`;
  }

  /* ---------- pintar ---------- */

  /* Lo dibujado en la última pasada. Sirve para saber si esta pantalla
     sigue siendo la que está puesta: cuando el servidor contesta tarde
     y mientras tanto alguien se fue a otra vista, repintar aquí
     borraría la vista de esa persona. */
  let mio = null;

  function pintar() {
    const est = estado();
    const filas = ordenar(est);

    if (!lista.length) {
      contenedor.innerHTML = vacio(
        'Sin proyectos todavía',
        'Una compra grande, un viaje, un fondo de emergencia. Registrala y te digo si conviene hacerla ahora.',
        { accion: 'nuevo', texto: 'Crear el primero' });
      mio = contenedor.firstElementChild;
      $('[data-accion="nuevo"]', contenedor).addEventListener('click', () => formProyecto(null));
      return;
    }

    contenedor.innerHTML = `
      <section class="acciones-mov">
        <button class="boton boton--principal" type="button" data-nuevo-proyecto>Nuevo proyecto</button>
      </section>

      ${est.juzga ? (filas.length > 1 ? `
        <p class="aviso aviso--ok">
          ${/* `<b>` y no `<strong>`: dentro de un aviso, `strong` es el titular
               y va en su propia línea (`display: block` en sitio.css). Usado en
               medio de una frase, la parte en dos y deja la coma huérfana. */''}
          Ordenados por <b>mérito</b>, no por antigüedad: salud y seguridad van
          primero, y el disponible se reparte en ese orden. El porqué de cada
          una va escrito debajo de su nombre.
        </p>` : '')
      : `
        <div class="aviso aviso--error">
          <strong>Falta un dato para poder decirte si conviene</strong>
          <p>
            Lo que ves abajo —cuánto llevan, cuánto apartar y en cuánto llegan— es exacto.
            Lo que no puedo darte todavía es el <b>veredicto</b>: para eso hace falta saber
            cuánto tienen líquido hoy, y eso sale del saldo que declara el banco.
          </p>
          <p>
            ${cuentas.length
              ? `Falta el saldo del banco, con fecha de este mes, en:
                 <b>${esc((est.faltan || []).map(x => x.nombre).join(', '))}</b>.`
              : 'Todavía no hay ninguna cuenta de banco registrada.'}
            Se pone en <a href="#/presupuesto">Presupuesto</a>, y el importador de estados de
            cuenta lo va a llenar solo cuando llegue.
          </p>
          ${falloDelServidor ? `<p>Tampoco se pudo preguntar al servidor: ${esc(falloDelServidor)}</p>` : ''}
        </div>`}

      <div class="proyectos">
        ${filas.map((f, i) => tarjeta(f, i, est, filas.length)).join('')}
      </div>`;

    mio = contenedor.firstElementChild;

    // Los anchos se aplican aquí y no con `style=` en el HTML: un solo
    // estilo en línea obligaría a abrirle la mano a la CSP.
    $$('[data-ancho]', contenedor).forEach(b => { b.style.width = b.dataset.ancho + '%'; });

    enganchar();
  }

  /* Se pinta ya, con lo que hay. El viaje al servidor va aparte y solo
     agrega: si tarda, la pantalla ya sirve; si falla, se queda lo que
     había, que nunca fue mentira. */
  pintar();

  if (lista.length) {
    historico(periodo)
      .then(r => { cartera = r.cartera || null; })
      .catch(e => { falloDelServidor = e.message; })
      .finally(() => {
        // Solo si esta pantalla sigue puesta. Si alguien navegó a otra
        // vista mientras tanto, repintar aquí le borraría la suya.
        if (mio && contenedor.contains(mio)) pintar();
      });
  }

  /* ---------- interacción ----------
     Se vuelve a enganchar en cada pintada: el HTML se rehace entero,
     así que los oyentes del anterior se fueron con él. */

  const porId = id => lista.find(p => p.id === id);

  function enganchar() {
    $('[data-nuevo-proyecto]', contenedor).addEventListener('click', () => formProyecto(null));

    $$('[data-editar-proyecto]', contenedor).forEach(b =>
      b.addEventListener('click', () => formProyecto(porId(b.dataset.editarProyecto))));

    $$('[data-nuevo-aporte]', contenedor).forEach(b =>
      b.addEventListener('click', () => formAporte(porId(b.dataset.nuevoAporte), null)));

    $$('[data-editar-aporte]', contenedor).forEach(b => b.addEventListener('click', () => {
      const p = porId(b.dataset.proyecto);
      formAporte(p, (p.aportes || []).find(a => a.id === b.dataset.editarAporte));
    }));
  }

  /* ============================================================
     Los formularios
     ============================================================ */

  function formProyecto(p) {
    hoja(p ? 'Editar proyecto' : 'Nuevo proyecto', `
      ${campo('nombre', 'Nombre', `value="${esc(p ? p.nombre : '')}" placeholder="Lavadora, viaje, carro…"`)}
      ${campoMonto('costoMin', 'Costo mínimo', p && p.costoMin ? p.costoMin : '',
        'Si no hay cotización firme, poné el rango: se calculan los dos escenarios.')}
      ${campoMonto('costoMax', 'Costo máximo', p && p.costoMax ? p.costoMax : '')}
      ${campoMonto('aporteMensual', 'Cuánto apartar al mes', p && p.aporteMensual ? p.aporteMensual : '',
        'Dejalo vacío y la app sugiere cuánto, sin comerse el colchón.')}
      ${campo('fechaObjetivo', 'Fecha objetivo',
        `type="month" value="${esc(p && p.fechaObjetivo ? p.fechaObjetivo.slice(0, 7) : '')}"`,
        'Opcional. Si la ponés, se calcula la cuota necesaria y se avisa si no da.')}
      ${campo('nota', 'Nota', `value="${esc(p ? p.nota : '')}" placeholder="Para qué es"`)}

      <p class="hoja__nota">
        Lo de abajo es lo que permite <strong>priorizar</strong>. Sin esto solo se puede
        decir si el dinero alcanza; con esto se puede decir si <strong>conviene</strong>,
        que es la pregunta que de verdad importa.
      </p>

      ${selector('tipo', '¿Qué tan necesario es?', TIPOS.map(([v, t]) => ({ valor: v, texto: t })),
        p ? A.tipoDe(p) : 'deseo',
        'Salud y seguridad van antes que cualquier gusto, tengan o no el dinero junto. Es lo único que impide que un antojo se cuele adelante de una urgencia.')}
      ${selector('urgencia', '¿Para cuándo?', URGENCIAS.map(([v, t]) => ({ valor: v, texto: t })),
        p ? A.urgenciaDe(p) : 'algun_dia')}
      ${campo('consecuencia', '¿Qué pasa si no lo hacen este año?',
        `value="${esc(p ? p.consecuencia : '')}" placeholder="Empeora y toca endodoncia; puedo chocar; nada, es un gusto"`,
        'Es la pregunta que más pesa. Escrita hoy, es lo que va a justificar el orden dentro de seis meses.')}
    `, {
      ancha: true,
      alBorrar: p ? async () => {
        await borrar('proyectos', p.id, p);
        avisar('Proyecto eliminado.');
        recargar();
      } : null,
      alGuardar: async (d, fallo) => {
        if (!d.nombre) return fallo('Ponele un nombre.'), false;
        if (!(d.costoMin > 0) && !(d.costoMax > 0)) return fallo('Falta el costo estimado.'), false;

        // Al final de la cola. El orden de los proyectos NO es cosmético:
        // es el desempate cuando dos pesan lo mismo por mérito.
        const orden = p ? null : lista.reduce((m, x) => Math.max(m, Number(x.orden) || 0), 0) + 1;
        const f = FILAS.proyectos(d, { ...ctx, orden });
        if (p) await actualizar('proyectos', p.id, f, f);
        else await crear('proyectos', f);
        avisar(p ? 'Proyecto actualizado.' : 'Proyecto creado.');
        recargar();
      }
    });
  }

  function formAporte(p, ap) {
    if (!p) return avisar('Ese proyecto ya no existe.', 'mal');

    hoja(`${ap ? 'Editar aporte' : 'Registrar aporte'} · ${p.nombre}`, `
      ${campoMonto('monto', 'Cuánto', ap ? ap.monto : '')}
      ${campo('fecha', 'Cuándo', `type="date" value="${esc(ap && ap.fecha ? ap.fecha : hoyLocal())}"`)}
      ${personas.length ? selector('personaId', 'Quién aporta',
        [{ valor: '', texto: '— sin persona —' }, ...personas.map(x => ({ valor: x.id, texto: x.nombre }))],
        // Al registrar uno nuevo se propone la primera persona, como
        // hacía la app anterior: en un hogar de uno solo, obligar a
        // elegir es una pregunta cuya respuesta ya se sabe. Se puede
        // dejar sin dueño, pero hay que quererlo.
        ap ? (ap.personaId || '') : personas[0].id) : ''}
      ${campo('nota', 'Nota', `value="${esc(ap ? ap.nota : '')}" placeholder="De dónde salió"`)}
      <p class="hoja__nota">
        Un aporte no es un gasto: es dinero que ya tenían y que ahora está apartado para
        esta meta. No resta del presupuesto del mes.
      </p>
    `, {
      alBorrar: ap ? async () => {
        await borrar('aportes', ap.id, ap);
        avisar('Aporte eliminado.');
        recargar();
      } : null,
      alGuardar: async (d, fallo) => {
        if (!(d.monto > 0)) return fallo('El aporte tiene que ser mayor que cero.'), false;
        if (!d.fecha) return fallo('Falta la fecha.'), false;
        const f = FILAS.aportes(d, { ...ctx, proyectoId: p.id });
        if (ap) await actualizar('aportes', ap.id, f, f);
        else await crear('aportes', f);
        avisar(ap ? 'Aporte actualizado.' : 'Aporte registrado.');
        recargar();
      }
    });
  }
}
