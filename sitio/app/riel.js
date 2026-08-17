/* ============================================================
   El riel se pliega, y su estado vive en el servidor.

   POR QUÉ NO EN `localStorage`, QUE SERÍA UNA LÍNEA

   La regla 1 del proyecto dice que el servidor es la única fuente de
   verdad y que lo ÚNICO que queda en el aparato es el token de sesión.
   Un `localStorage.setItem('riel', 'plegado')` la rompe por comodidad,
   que es como se rompen siempre las reglas de este tipo.

   Y al obedecerla se gana algo que el atajo no daba: quien pliega el
   riel en la computadora lo encuentra plegado en la tableta.

   POR QUÉ SE PINTA ANTES DE PREGUNTAR

   La preferencia viaja con el resto del perfil, que llega con la
   primera carga. Pero el riel se dibuja antes: si se esperara la
   respuesta, el menú aparecería desplegado y se plegaría solo medio
   segundo después, a la vista. Así que se pinta con lo que ya se sabe
   y solo se corrige si el servidor dice otra cosa — y esa corrección,
   sin transición, para que no se lea como un movimiento decidido.

   SIN ESTE ARCHIVO el riel se ve completo y funciona: lo que se pierde
   es poder plegarlo. Por eso el botón se esconde con CSS donde no hay
   puntero fino, y nunca aparece un control que no hace nada.
   ============================================================ */

import { llamar } from './datos/api.js';

const PLEGADO = 'data-plegado';

document.addEventListener('DOMContentLoaded', () => {
  const riel  = document.querySelector('.riel-app');
  const boton = document.querySelector('[data-pliegue]');
  if (!riel || !boton) return;

  /* Sin puntero fino el riel no se pliega —la etiqueta flotante nunca
     aparecería— así que acá tampoco hay nada que hacer. */
  const fino = matchMedia('(hover: hover) and (pointer: fine)');

  const pintar = (plegado, { animar = true } = {}) => {
    if (!animar) riel.style.transitionDuration = '0s';
    riel.toggleAttribute(PLEGADO, plegado);
    boton.setAttribute('aria-expanded', String(!plegado));
    boton.title = plegado ? 'Desplegar el menú' : 'Plegar el menú';
    const voz = boton.querySelector('.nav__voz');
    if (voz) voz.textContent = boton.title;
    if (!animar) {
      /* Dos cuadros: uno para que el navegador aplique el cambio sin
         transición y otro para devolvérsela. Con uno solo, a veces la
         transición vuelve a tiempo de animar la corrección. */
      requestAnimationFrame(() => requestAnimationFrame(() => {
        riel.style.transitionDuration = '';
      }));
    }
  };

  let guardando = null;
  const guardar = (plegado) => {
    /* El estado de la pantalla no vale una pantalla de error. Si no se
       puede guardar, el riel queda como lo dejó la persona en esta
       sesión y se reintenta la próxima vez que lo toque. */
    clearTimeout(guardando);
    guardando = setTimeout(() => {
      llamar('guardar_preferencia_riel', { p_plegado: plegado }).catch(() => {});
    }, 400);
  };

  boton.addEventListener('click', () => {
    const plegado = !riel.hasAttribute(PLEGADO);
    pintar(plegado);
    guardar(plegado);
  });

  /* Lo que dijo el servidor. Llega después del primer pintado y solo
     corrige si hace falta, sin animación: una corrección que se mueve se
     lee como una decisión, y esto no lo decidió nadie ahora. */
  if (fino.matches) {
    llamar('mi_preferencia_riel')
      .then((plegado) => {
        if (Boolean(plegado) !== riel.hasAttribute(PLEGADO)) {
          pintar(Boolean(plegado), { animar: false });
        }
      })
      .catch(() => {});
  }
});
