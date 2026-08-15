# Secretos

**Aquí no hay ni un valor.** Este documento dice qué secretos existen, para qué
sirve cada uno y dónde vive. Los valores se cargan por CLI o por panel y nunca
llegan al repositorio.

## Por qué esto es la única excepción a "todo pasa por el repositorio"

Un secreto que se escribe en el repositorio deja de ser secreto — ese es todo el
argumento. El repositorio es público, y aunque fuera privado, cualquiera con acceso
de lectura lo vería, y quedaría en el historial para siempre aunque después se
borre.

Lo que sí puede vivir aquí es el **inventario**: cuántos hay, qué hacen, quién los
puede rotar y qué se rompe si se rotan. Sin eso, dentro de seis meses nadie se
acuerda de por qué existe una llave y a nadie le da confianza tocarla.

---

## Inventario

| Secreto | Para qué | Dónde vive | Si se rota, se rompe |
|---|---|---|---|
| `RESEND_API_KEY` (contraseña SMTP) | Correos de confirmación, recuperación e invitación | Variable de ambiente al correr `supabase config push`; guardada en Supabase → Auth → SMTP | El registro de usuarios nuevos y la recuperación de contraseña |
| Contraseña de la base | Conexión directa a Postgres y migraciones | Gestor de contraseñas del dueño | Las migraciones desde la CLI |
| `service_role` de Supabase | Borrado real de cuentas y tareas de administración | Secretos de Edge Functions. **Nunca en el navegador** | El borrado de cuenta y el panel de plataforma |
| Token de API de Cloudflare | Publicar desde CI | Secretos del repositorio en GitHub | La publicación automática |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | Correr la suite de aislamiento en CI | Secretos del repositorio en GitHub | Las pruebas de aislamiento entre hogares |

> Los tres últimos son **del proyecto de pruebas**, nunca de producción. La suite
> de aislamiento crea y borra usuarios: apuntarla a producción sería destructivo,
> y por eso el propio archivo aborta si detecta el ref de producción.

### El que todavía no existe

`ANTHROPIC_API_KEY`, para leer facturas por foto. **Esa función está detenida
esperando la decisión del dueño**, así que la llave no está creada en ninguno de
los dos proyectos — comprobado el 15 de agosto de 2026 con `supabase secrets
list` en los dos.

Se anota aquí, y no en la tabla, a propósito: la tabla es el inventario de lo que
existe. Una llave listada como si estuviera puesta hace creer que la función está
lista, y además manda a buscar y rotar algo que no está. Cuando la función se
haga, la llave sube a la tabla **en el mismo PR**.

### La Edge Function `historico` no lleva ningún secreto

Corre el núcleo sobre todo el histórico del hogar para calcular saldos, deuda y
patrimonio — cifras que el navegador no puede sacar porque solo baja el mes en
curso. Va con **el token de quien pregunta**, no con la clave de servicio, así que
las políticas RLS siguen siendo las que deciden qué se ve. No filtra por hogar en
ninguna línea, y esa ausencia es deliberada: filtrar en el código sería teatro, y
el día que alguien borrara esa línea se llevaría el aislamiento con ella.

Comprobado: sin sesión devuelve 401; con la clave publicable sola, RLS no
devuelve ningún hogar y contesta 404 sin filtrar nada.

Las únicas variables que usa —`SUPABASE_URL` y `SUPABASE_ANON_KEY`— las inyecta
Supabase en toda función y no hay que cargarlas.

---

La clave `anon` de Supabase **no es un secreto**: va dentro de la aplicación y eso
es correcto. Por sí sola no abre nada, porque cada tabla exige sesión iniciada y
las políticas RLS deciden qué puede ver cada quien.

---

## Cómo se cargan

```bash
npx supabase secrets set ANTHROPIC_API_KEY=... --project-ref <ref>
```

Los de GitHub, en **Settings → Secrets and variables → Actions**.

## La configuración de autenticación se administra en el panel

**No corras `supabase config push` sobre producción.** Rompió el servicio tres
veces, siempre en silencio: mandó un `site_url` de desarrollo, bajó el límite de
correos a dos por hora, y dejó la contraseña de SMTP con un texto de ejemplo. La
causa es siempre la misma — ese comando manda el archivo **entero**, no los
cambios, y arrastra cada valor de fábrica que nadie tocó.

`supabase/config.toml` se conserva como referencia y para el desarrollo local.
Estos son los valores vigentes en **producción**, para que el repositorio siga
describiendo la realidad aunque no la imponga:

### Authentication → Emails → SMTP Settings

| Campo | Valor |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` — literalmente esa palabra, no un correo |
| Password | la clave de Resend |
| Sender email | `hola@controlewallet.com` |
| Sender name | `Controle Wallet` |

### Authentication → Rate Limits

| Campo | Valor |
|---|---|
| Emails per hour | `50` |

### Authentication → Providers → Email

| Campo | Valor |
|---|---|
| Confirm email | **encendido** |
| Minimum password length | `8` |

### Authentication → URL Configuration

| Campo | Valor |
|---|---|
| Site URL | `https://controlewallet.com/app/` |

> **Nunca escribas una clave dentro de un comando.** Las tres veces que el correo
> se rompió en este proyecto fue por eso: un comando con un hueco que se puede
> ejecutar sin llenar termina ejecutándose sin llenar.
>
> Y la clave de Resend solo se ve **una vez**, al crearla. Si se pierde, no se
> recupera: hay que crear otra y borrar la anterior.

---

## Reglas

- Un secreto de producción **nunca** se usa en pruebas, ni al revés.
- Si un secreto se expone por accidente: se rota primero y se investiga después.
  Borrar el commit no sirve de nada; ya se copió.
- Cuando entre un secreto nuevo, se agrega a la tabla de arriba **en el mismo PR**
  que lo introduce.
