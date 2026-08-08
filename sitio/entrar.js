/* ============================================================
   Entrar.

   Nada de este archivo toca la contraseña más allá de pasársela a
   la API de sesión: no se guarda, no se registra en consola, no
   viaja a ningún otro lado. Lo que vuelve es un token, y de eso se
   encarga `api.js`.
   ============================================================ */

import { entrar, recuperar, haySesion, ErrorDatos } from '/app/datos/api.js';

const $ = s => document.querySelector(s);
const forma = $('#forma'), error = $('#error'), enviar = $('#enviar');

/* Quien ya tiene sesión no tiene nada que hacer aquí. */
if (haySesion()) location.replace('/app/');

function mostrar(mensaje, tono = 'error') {
  error.textContent = mensaje;
  error.hidden = false;
  error.classList.toggle('aviso--error', tono === 'error');
  error.classList.toggle('aviso--ok', tono === 'ok');
}

function ocupado(si, texto) {
  enviar.disabled = si;
  enviar.textContent = si ? texto : 'Entrar';
}

forma.addEventListener('submit', async e => {
  e.preventDefault();
  error.hidden = true;

  const correo = $('#correo').value.trim();
  const clave  = $('#clave').value;

  if (!correo || !clave) return mostrar('Falta el correo o la contraseña.');

  ocupado(true, 'Entrando…');
  try {
    await entrar(correo, clave);
    // `replace` y no `href`: volver atrás no debe regresar al formulario.
    location.replace('/app/');
  } catch (err) {
    mostrar(err instanceof ErrorDatos ? err.message : 'No se pudo entrar.');
    ocupado(false);
    $('#clave').focus();
  }
});

$('#olvide').addEventListener('click', async e => {
  e.preventDefault();
  const correo = $('#correo').value.trim();
  if (!correo) { mostrar('Escribí tu correo arriba y volvé a tocar aquí.'); return $('#correo').focus(); }

  try {
    await recuperar(correo);
  } catch { /* se responde igual, ver abajo */ }

  // Se responde lo mismo exista o no la cuenta. Decir «ese correo no
  // está registrado» le confirmaría a cualquiera quién tiene cuenta
  // aquí, que es información que no nos toca repartir.
  mostrar('Si ese correo tiene cuenta, va en camino un enlace para cambiar la contraseña.', 'ok');
});
