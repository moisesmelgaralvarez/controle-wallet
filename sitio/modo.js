/* ============================================================
   El interruptor de modo claro / oscuro.

   Tres estados, no dos: mientras nadie elige, manda el sistema
   operativo. En cuanto alguien pulsa, su elección gana y queda
   guardada — incluso si contradice al sistema.

   Por qué se guarda en el dispositivo: es una preferencia de
   LECTURA, no un dato del hogar. La regla del proyecto —el
   servidor es la única fuente de verdad— habla de la plata, no
   de si alguien prefiere leer en oscuro. Guardarla en el
   servidor obligaría a tener sesión para elegir el modo, en un
   sitio público donde la mayoría todavía no tiene cuenta.

   Este archivo se carga SIN `defer` en el <head> y hace dos
   cosas en dos momentos. La primera —aplicar el tema guardado—
   corre antes de que se pinte nada, o habría un destello blanco
   en cada carga para quien lee en oscuro. La clásica solución de
   un <script> en línea acá no sirve: la CSP del sitio lleva
   `script-src 'self'` sin excepciones, y un archivo aparte es
   justo lo que permite mantenerla.
   ============================================================ */

const guardado = () => {
  try { return localStorage.getItem('tema'); } catch { return null; }
};

/* ---------- antes de pintar ---------- */

/* `documentElement` y no `body`: en el <head> el body todavía no existe. La
   hoja mira `.noche[data-tema]`, así que el atributo se copia al body en
   cuanto aparece. */
{
  const elegido = guardado();
  if (elegido) document.documentElement.dataset.tema = elegido;
}

/* ---------- cuando ya hay documento ---------- */

document.addEventListener('DOMContentLoaded', () => {
  const raiz = document.body;
  const boton = document.querySelector('[data-modo]');

  const elegido = document.documentElement.dataset.tema;
  if (elegido) raiz.dataset.tema = elegido;

  if (!boton) return;

  /* Qué se está viendo AHORA, que no es lo mismo que qué se eligió:
     sin elección, lo que se ve lo decide el sistema. */
  const vigente = () =>
    raiz.dataset.tema ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro');

  const anunciar = () => {
    const oscuro = vigente() === 'oscuro';
    boton.setAttribute('aria-pressed', String(oscuro));
    boton.setAttribute('title', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    boton.setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
  };

  boton.addEventListener('click', () => {
    const nuevo = vigente() === 'oscuro' ? 'claro' : 'oscuro';
    raiz.dataset.tema = nuevo;
    document.documentElement.dataset.tema = nuevo;
    try { localStorage.setItem('tema', nuevo); } catch { /* modo privado: se
      pierde al cerrar, y eso es aceptable para una preferencia de lectura */ }
    anunciar();
  });

  /* Si nadie eligió a mano, el sitio sigue al sistema en vivo: alguien que
     cambia el modo del teléfono al anochecer ve cambiar la página. */
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!guardado()) anunciar();
  });

  anunciar();
});
