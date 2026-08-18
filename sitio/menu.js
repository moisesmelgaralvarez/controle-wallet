/* ============================================================
   El menú de la cabecera.

   En pantalla angosta la navegación se recoge detrás de un tirador
   y quedan a la vista solo las dos acciones que importan: «Entrar»
   y «Crear cuenta». En pantalla ancha no hace nada: los cuatro
   enlaces van sueltos, que es lo correcto cuando hay espacio.

   SIN ESTE ARCHIVO la cabecera se ve completa, con los cuatro
   enlaces a la vista. El tirador nace con `hidden` en el marcado y
   solo se enciende desde acá: un botón que no abre nada es peor que
   ningún botón.

   LO QUE HACE QUE ESTO SEA UN MENÚ Y NO UN DIV QUE SE ESCONDE

   1. `aria-expanded` en el botón y `aria-controls` apuntando al
      <nav>. Es lo único que le dice a un lector de pantalla que ese
      botón gobierna ese grupo, y si está abierto o cerrado.
   2. ESCAPE CIERRA, y el foco vuelve al tirador. Sin eso, quien
      navega con teclado queda dentro de un menú del que no puede
      salir sin recorrerlo entero.
   3. UN CLIC AFUERA CIERRA. Se escucha en `document`, no en un velo
      que tape la página: un velo hay que pintarlo, y este menú no
      necesita tapar nada.
   4. AL PASAR A PANTALLA ANCHA SE CIERRA Y SE OLVIDA. Si no, el
      <nav> se queda con el atributo de abierto puesto y en
      escritorio aparece un panel flotando sin que nadie lo pidiera.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  const cabecera = document.querySelector('.cabecera');
  const tirador  = document.querySelector('.tirador');
  const menu     = document.getElementById('menu-principal');
  if (!cabecera || !tirador || !menu) return;

  /* El mismo corte que la hoja de estilo. Si cambia uno, cambia el otro. */
  /* 57rem, IDÉNTICO al corte de `papel.css`. Si los dos números se separan,
     aparece una franja de anchos donde la hoja recoge el menú y el JS no —o
     al revés— y el resultado es una cabecera partida en dos renglones que
     nadie sabe de dónde salió. Ya pasó: estaban en 46rem y la cabecera dejaba
     de caber a los 898px, dejando 162px rotos. */
  /* 72rem = 1152, y el número sale de una cuenta, no del gusto: el contenido
     en línea de la cápsula mide 679 px, y con la cápsula al 60% del ancho
     hace falta una ventana de 679 ÷ 0.6 ≈ 1132 para que entre. 1152 deja
     margen.

     Ya subió dos veces —57 → 64 → 72— y siempre por lo mismo: cada vez que
     la cápsula se angosta, el menú en línea necesita más ventana. Si mañana
     se achica otra vez, este número sube con ella.

     IDÉNTICO al corte de `papel.css`: si los dos se separan, aparece una
     franja de anchos donde la hoja recoge el menú y el JS no. */
  const angosto = matchMedia('(max-width: 72rem)');

  /* ---------- el tercer estado: el teléfono ----------

     La cápsula tiene tres formas y no dos:

       escritorio  logo · enlaces · Entrar · Crear cuenta
       tableta     logo · tirador · Entrar · Crear cuenta
       teléfono    logo · tirador          — todo lo demás al desplegable

     La diferencia entre tableta y teléfono es dónde VIVE el bloque de
     sesión, y eso es un cambio de lugar en el documento, no de estilo. Se
     intentó con CSS —sacarlo del panel con `position: fixed`— y salió mal
     dos veces: primero porque `backdrop-filter` en la cápsula la convierte
     en bloque contenedor de sus hijos `fixed`, y después porque la opacidad
     del panel cerrado apaga el subárbol entero y un hijo no puede
     encenderse.

     Mover el NODO es más simple y no tiene esquinas: el mismo elemento, en
     el lugar que le toca. Y se mueve, no se copia — dos «Crear cuenta» en el
     documento son dos para un lector de pantalla, aunque uno esté oculto. */
  /* 40rem = 640, subido desde 34 cuando la cápsula bajó de 70% a 60%: con ese
     porcentaje el contenido de tableta —367 px— no entra hasta los ~640 de
     ventana. IDÉNTICO al corte de `papel.css`. */
  const telefono = matchMedia('(max-width: 40rem)');
  const sesion   = cabecera.querySelector('.sesion');

  const ubicarSesion = () => {
    if (!sesion) return;
    if (telefono.matches) {
      if (sesion.parentElement !== menu) menu.appendChild(sesion);
    } else if (sesion.parentElement !== cabecera) {
      /* Vuelve a la cápsula, y ANTES del tirador: el orden visual es
         logo · tirador · Entrar · Crear cuenta, y el orden del documento
         tiene que coincidir o el recorrido con teclado salta de un lado a
         otro sin motivo. */
      cabecera.insertBefore(sesion, tirador);
    }
  };
  ubicarSesion();
  telefono.addEventListener('change', ubicarSesion);

  /* Recién acá existe el tirador. Hasta esta línea la cabecera es la de
     siempre, con los cuatro enlaces puestos. */
  tirador.hidden = false;
  cabecera.classList.add('cabecera--con-tirador');

  let abierto = false;

  const pintar = () => {
    tirador.setAttribute('aria-expanded', String(abierto));
    menu.toggleAttribute('data-abierto', abierto);
    /* El rótulo cambia porque el botón cambia de trabajo. «Menú» cuando
       abre, «Cerrar» cuando cierra: el dibujo ya lo dice, pero el dibujo no
       se lee en voz alta. */
    tirador.querySelector('.tirador__dicho').textContent = abierto ? 'Cerrar' : 'Menú';
  };

  const cerrar = (devolverFoco) => {
    if (!abierto) return;
    abierto = false;
    pintar();
    if (devolverFoco) tirador.focus();
  };

  tirador.addEventListener('click', () => {
    abierto = !abierto;
    pintar();
  });

  /* Escape cierra y devuelve el foco a donde estaba. */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrar(true);
  });

  /* Un clic fuera de la cabecera cierra. Adentro no: apretar un enlace ya
     navega, y cerrar antes de que el navegador atienda el clic hace que en
     algunos teléfonos el enlace no llegue a dispararse. */
  document.addEventListener('click', (e) => {
    if (abierto && !cabecera.contains(e.target)) cerrar(false);
  });

  /* Al ensanchar, el menú deja de existir como panel: se cierra y se olvida,
     o el <nav> se queda marcado como abierto y en escritorio aparece
     flotando sin que nadie lo haya pedido. */
  angosto.addEventListener('change', (e) => {
    if (!e.matches) cerrar(false);
  });
});
