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
| `ANTHROPIC_API_KEY` | Leer facturas por foto | Secretos de Supabase, por proyecto | El escaneo de facturas, hasta redesplegar la función |
| `RESEND_API_KEY` (contraseña SMTP) | Correos de confirmación, recuperación e invitación | Variable de ambiente al correr `supabase config push`; guardada en Supabase → Auth → SMTP | El registro de usuarios nuevos y la recuperación de contraseña |
| Contraseña de la base | Conexión directa a Postgres y migraciones | Gestor de contraseñas del dueño | Las migraciones desde la CLI |
| `service_role` de Supabase | Borrado real de cuentas y tareas de administración | Secretos de Edge Functions. **Nunca en el navegador** | El borrado de cuenta y el panel de plataforma |
| Token de API de Cloudflare | Publicar desde CI | Secretos del repositorio en GitHub | La publicación automática |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | Correr la suite de aislamiento en CI | Secretos del repositorio en GitHub | Las pruebas de aislamiento entre hogares |

> Los tres últimos son **del proyecto de pruebas**, nunca de producción. La suite
> de aislamiento crea y borra usuarios: apuntarla a producción sería destructivo,
> y por eso el propio archivo aborta si detecta el ref de producción.

La clave `anon` de Supabase **no es un secreto**: va dentro de la aplicación y eso
es correcto. Por sí sola no abre nada, porque cada tabla exige sesión iniciada y
las políticas RLS deciden qué puede ver cada quien.

---

## Cómo se cargan

```bash
npx supabase secrets set ANTHROPIC_API_KEY=... --project-ref <ref>
```

Los de GitHub, en **Settings → Secrets and variables → Actions**.

La configuración de correo (remitente, plantillas, SMTP) vive en
`supabase/config.toml` y se empuja desde el repositorio. **La contraseña no está
ahí**: se lee de la variable de ambiente en el momento de empujar.

```bash
export RESEND_API_KEY='...'
npx supabase config push
```

> `config push` empuja la configuración **entera** del proyecto enlazado.
> Verificá con `npx supabase projects list` que el enlace apunte a donde querés
> antes de correrlo — y que `RESEND_API_KEY` esté puesta, o el envío de correos
> queda roto.

---

## Reglas

- Un secreto de producción **nunca** se usa en pruebas, ni al revés.
- Si un secreto se expone por accidente: se rota primero y se investiga después.
  Borrar el commit no sirve de nada; ya se copió.
- Cuando entre un secreto nuevo, se agrega a la tabla de arriba **en el mismo PR**
  que lo introduce.
