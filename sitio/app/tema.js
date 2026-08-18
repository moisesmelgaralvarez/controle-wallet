/* ============================================================
   Día y noche.

   TRES ESTADOS Y NO DOS. «Sistema» respeta lo que la persona ya
   eligió en su aparato, y eso es distinto de elegir claro a mano: un
   interruptor de dos posiciones obliga a decidir a quien no quería
   decidir nada. El botón cicla sistema → claro → oscuro → sistema.

   DÓNDE VIVE, Y POR QUÉ NO EN EL DISPOSITIVO

   En `perfiles.tema`. La regla 1 dice que lo único que queda en el
   aparato es el token de sesión, y un `localStorage.setItem('tema',…)`
   la rompe por comodidad. Al obedecerla se gana algo: quien elige
   oscuro en la computadora lo encuentra oscuro en el teléfono.

   EL PRECIO DE ESO, Y CÓMO SE PAGA

   Una preferencia que vive en el servidor no está disponible en el
   primer pintado. Sin cuidado, la app abre con el tema del sistema y
   salta al elegido medio segundo después — un parpadeo a pantalla
   completa, que es de las cosas más feas que puede hacer una interfaz.

   Se paga así: mientras no se sabe, manda el sistema —que es lo que el
   navegador ya iba a pintar, o sea cero cambio— y cuando llega la
   respuesta se aplica SIN transición si difiere. Un cambio instantáneo
   se lee como «así era»; uno animado se lee como un error que se
   corrige solo.

   SIN ESTE ARCHIVO la app se ve completa siguiendo el tema del
   sistema, y el botón no aparece: nace con `hidden` y lo enciende
   este archivo, así que nunca queda un control que no hace nada.
   ============================================================ */

import { llamar } from './datos/api.js';

const CICLO = ['sistema', 'claro', 'oscuro'];
const VOZ = { sistema: 'Automático', claro: 'Modo claro', oscuro: 'Modo oscuro' };

/* `color-scheme` además del atributo: es lo que hace que las barras de
   scroll y los controles nativos acompañen. Sin él, un campo de fecha
   abre un calendario blanco en una app oscura. */
const aplicar = (tema) => {
  const raiz = document.documentElement;
  if (tema === 'sistema') {
    raiz.removeAttribute('data-tema');
    raiz.style.colorScheme = 'light dark';
  } else {
    raiz.setAttribute('data-tema', tema);
    raiz.style.colorScheme = tema === 'oscuro' ? 'dark' : 'light';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  /* `data-interruptor` Y NO `data-tema`, Y NO ES CAPRICHO. El gancho se
     llamaba `data-tema`, igual que el atributo que este mismo archivo le
     pone al <html> para fijar el tema. En cuanto se aplicaba uno,
     `querySelector('[data-tema]')` empezaba a encontrar el <html> —que va
     antes en el documento— en vez del botón. Dos cosas distintas con el
     mismo nombre es una trampa que se arma sola. */
  const botones = [...document.querySelectorAll('[data-interruptor]')];
  if (!botones.length) return;
  for (const b of botones) b.hidden = false;
  const boton = botones[0];

  let actual = 'sistema';

  const pintar = (tema, { animar = true } = {}) => {
    actual = tema;
    if (!animar) for (const b of botones) b.style.transitionDuration = '0s';
    aplicar(tema);
    /* LOS DOS BOTONES, no solo el del riel. En teléfono el riel no existe y
       el interruptor vive en el tope; en escritorio pasa al revés. Pintar uno
       solo dejaba al otro mostrando una cara que no era la del tema. */
    for (const b of botones) {
      b.dataset.actual = tema;
      b.title = VOZ[tema];
      const v = b.querySelector('[data-tema-voz]');
      if (v) v.textContent = VOZ[tema];
    }
    if (!animar) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        for (const b of botones) b.style.transitionDuration = '';
      }));
    }
  };

  pintar('sistema', { animar: false });

  let guardando = null;
  for (const b of botones) b.addEventListener('click', () => {
    const siguiente = CICLO[(CICLO.indexOf(actual) + 1) % CICLO.length];
    pintar(siguiente);
    /* El tema no vale una pantalla de error: si no se puede guardar, queda
       aplicado en esta sesión y se reintenta al próximo toque. */
    clearTimeout(guardando);
    guardando = setTimeout(() => {
      llamar('guardar_tema', { p_tema: siguiente }).catch(() => {});
    }, 400);
  });

  /* Lo que dijo el servidor. Llega después del primer pintado y solo
     corrige si difiere, sin animación: una corrección que se mueve se lee
     como una decisión, y esto no lo decidió nadie ahora. */
  llamar('mi_tema')
    .then((tema) => {
      if (CICLO.includes(tema) && tema !== actual) pintar(tema, { animar: false });
    })
    .catch(() => {});
});
