/* ============================================================
   Crear cuenta.

   El hogar y la membresía de propietario NO se crean aquí: los
   crea un disparador en la base al dar de alta el usuario. Si
   dependieran de una llamada desde esta página, cerrar la pestaña
   un segundo antes dejaría a alguien registrado y sin hogar — un
   estado del que no se sale solo y que habría que reparar a mano,
   uno por uno.
   ============================================================ */

import { registrar, haySesion, ErrorDatos } from '/app/datos/api.js';

const $ = s => document.querySelector(s);
const forma = $('#forma'), error = $('#error'), enviar = $('#enviar');

if (haySesion()) location.replace('/app/');

function mostrar(mensaje, tono = 'error') {
  error.textContent = mensaje;
  error.hidden = false;
  error.classList.toggle('aviso--error', tono === 'error');
  error.classList.toggle('aviso--ok', tono === 'ok');
}

forma.addEventListener('submit', async e => {
  e.preventDefault();
  error.hidden = true;

  const nombre = $('#nombre').value.trim();
  const correo = $('#correo').value.trim();
  const clave  = $('#clave').value;
  const hogar  = $('#hogar').value.trim();

  if (!nombre) { mostrar('Falta tu nombre.'); return $('#nombre').focus(); }
  if (!correo) { mostrar('Falta el correo.'); return $('#correo').focus(); }
  // Se valida aquí por cortesía; quien mande el formulario a mano se
  // topa igual con la regla del servidor, que es la que manda.
  if (clave.length < 8) { mostrar('La contraseña necesita al menos ocho caracteres.'); return $('#clave').focus(); }

  enviar.disabled = true;
  enviar.textContent = 'Creando…';

  try {
    const r = await registrar({ correo, clave, nombre, hogar });

    if (r.sesionIniciada) {
      location.replace('/app/');
      return;
    }

    // Con confirmación por correo encendida no hay sesión todavía.
    // El formulario se reemplaza para que nadie se quede esperando
    // frente a unos campos que ya no sirven.
    forma.innerHTML = `
      <h1>Revisá tu correo</h1>
      <p class="acceso__intro">
        Le mandamos un enlace a <strong></strong>. Tocalo para confirmar tu
        cuenta y entrar.
      </p>
      <p class="acceso__pie">¿No llegó? Mirá en la carpeta de correo no deseado.</p>
      <p class="acceso__pie"><a href="/entrar">Ir a entrar</a></p>`;
    // El correo se inserta como TEXTO, nunca como HTML: es un dato
    // que escribió una persona y no tiene por qué interpretarse.
    forma.querySelector('strong').textContent = correo;

  } catch (err) {
    mostrar(err instanceof ErrorDatos ? err.message : 'No se pudo crear la cuenta.');
    enviar.disabled = false;
    enviar.textContent = 'Crear cuenta';
  }
});
