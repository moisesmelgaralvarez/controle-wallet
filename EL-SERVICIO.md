# El servicio, en una página

Para contestar sin buscar: dónde vive Controle Wallet, qué cuesta, qué pasa si
algo se cae, y qué falta. Escrito para el dueño, no para un programador.

*Al 10 de agosto de 2026. En línea: **v0.18.2**.*

---

## Si te preguntan «¿dónde está tu aplicación?»

> «Corre en Cloudflare y Supabase. Mi computadora solo es donde se programa.»

Eso es todo. Ninguna pieza del servicio depende de tu Mac. Si se pierde, se moja
o se la roban, **el servicio sigue funcionando** y no se pierde ni un dato de
ningún cliente. Lo único que habría que hacer es instalar las herramientas en
otra computadora y bajar el código de GitHub.

---

## Las cuatro piezas

| Pieza | Quién la hospeda | Qué guarda |
|---|---|---|
| **El sitio y la app** | Cloudflare, red global | Nada. Solo entrega las pantallas |
| **Los datos** | Supabase, `us-east-1` (Virginia, EE. UU.) | Todo: hogares, gastos, saldos |
| **El código** | GitHub, `moisesmelgaralvarez/controle-wallet` | El programa, sin datos ni claves |
| **El correo** | Resend, desde `hola@controlewallet.com` | Nada. Solo envía |

**Hay dos bases separadas**, y esto importa: `controle-produccion` tiene los
datos reales; `controle-pruebas` es donde se prueba todo antes. Nunca se tocan
entre sí. La aplicación decide a cuál hablar por el dominio: `controlewallet.com`
va a producción y cualquier otra cosa va a pruebas.

---

## Qué cuesta al mes

| | Hoy | Cuando haya clientes |
|---|---|---|
| Cloudflare | Gratis | Gratis hasta un volumen que no vas a alcanzar pronto |
| Supabase | Gratis | **~$25/mes — obligatorio**, ver abajo |
| Resend | Gratis | Gratis hasta 3,000 correos al mes |
| Dominio | anual | anual |

> **Los montos exactos confirmalos en cada panel antes de citarlos.** Aquí van
> como orden de magnitud, no como factura.

---

## Lo único que hoy me quitaría el sueño

**Producción no tiene respaldo automático.** El plan gratuito de Supabase no lo
incluye; hay que contratar **Supabase Pro (~$25/mes)**.

Mientras eso no exista, un error grave en la base significa perder datos de
clientes **sin forma de recuperarlos**. No es un riesgo teórico: es la diferencia
entre un mal día y un negocio cerrado.

**Esto hay que resolverlo antes del primer cliente que pague.** No después.

---

## Si algo se rompe

**La vuelta atrás está ensayada con cronómetro, no supuesta.**

| Qué pasó | Cuánto toma volver |
|---|---|
| La aplicación se ve rota | **4 segundos** |
| Además cambió la base de datos | **22 segundos** (ida y vuelta completa) |

El procedimiento paso a paso está en `VUELTA-ATRAS.md`. Lo hace quien esté
programando; vos no tenés que ejecutarlo.

---

## Qué protege los datos de los clientes

- **Cada hogar solo ve lo suyo**, y lo impone la base de datos, no la pantalla.
  Hay una batería de pruebas que intenta ~55 formas distintas de ver los datos de
  otro hogar en cada cambio; si una sola lo lograra, el cambio no entra.
- **Nunca se guardan datos de tarjeta.** Ni número, ni CVV, ni vencimiento.
  Nunca. No es una política: no existe dónde guardarlos.
- **Las contraseñas no las ve nadie**, ni vos ni yo. Las maneja Supabase.
- **Ningún secreto viaja al navegador.** El inventario de qué claves existen y
  dónde vive cada una está en `SECRETOS.md`, sin valores.
- **Borrar un usuario borra su hogar entero** si era el último miembro, como
  promete la política de privacidad.

---

## Qué hay hecho y qué falta

**Funcionando en producción hoy:**
Resumen · Movimientos · Presupuesto · Proyectos · Historia · Cierre de mes

**Falta para poder venderlo:**

| Qué | Estado |
|---|---|
| Importar estados de cuenta del banco | motor y base listos, falta la pantalla |
| Facturas por foto | sin empezar |
| Informe del mes | sin empezar |
| Invitar a tu pareja al hogar | la base está lista, falta la pantalla |
| Panel de cuenta: perfil, exportar, borrar cuenta | sin empezar |
| **Respaldo diario** | **no existe** — ver arriba |
| Revisión legal de términos y privacidad | pendiente, alguien licenciado en Honduras |
| Pasar tu hogar real de la app vieja | sin empezar |

---

## Cómo entra un cambio

1. Se escribe en una rama aparte. **Nadie escribe directo en el código bueno**,
   ni siquiera vos: está bloqueado a propósito.
2. Corren las pruebas solas. Si algo falla, no entra.
3. Se prueba contra `controle-pruebas`, con datos de mentira.
4. Se une y **se publica en el momento**.

Cada versión publicada queda anotada en `CAMBIOS.md`, en español y sin jerga.

---

## Los documentos, y para qué sirve cada uno

| Archivo | Para qué |
|---|---|
| **`EL-SERVICIO.md`** | Este. Para contestar preguntas sin buscar |
| `CAMBIOS.md` | Qué trajo cada versión, en español |
| `VUELTA-ATRAS.md` | Qué hacer si algo se rompe |
| `SECRETOS.md` | Qué claves existen y dónde viven. **Sin valores** |
| `TRASPASO.md` | Para retomar el desarrollo en un chat nuevo |
| `README.md` | Para un programador que llega nuevo |
