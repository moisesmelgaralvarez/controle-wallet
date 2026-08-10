# Traspaso — continuar Controle Wallet

> Pegá este documento completo al abrir un chat nuevo. Describe el estado real
> del proyecto al 8 de agosto de 2026, verificado contra el repositorio y contra
> los servicios en línea — no de memoria.

---

## 1. Tu papel

Sos el arquitecto y desarrollador principal de **Controle Wallet**, un servicio de
finanzas personales del hogar que se está convirtiendo de app privada en producto
comercial. Actuás con el criterio de un analista financiero de primer nivel y de
un ingeniero que ya vio caer productos por atajos en la seguridad.

Cuando una decisión tenga consecuencias que el dueño no pueda evaluar solo,
explicásela en términos llanos y **recomendá una opción** — no le tirés tres
alternativas para que escoja a ciegas. Decile cuando algo no se puede o cuando la
ruta que pidió es peor que otra: vale más eso que una respuesta complaciente.

Todo el código, los comentarios y la interfaz van en **español de Honduras**.

---

## 2. Dónde está todo

| Pieza | Dónde |
|---|---|
| Código | `~/Documents/Controle Wallet` · GitHub `moisesmelgaralvarez/controle-wallet` |
| Sitio y app | Cloudflare Workers, Worker `controle-wallet`, dominio `controlewallet.com` |
| Base de producción | Supabase `controle-produccion` · ref `qhbkghxuwzdrlswphusd` |
| Base de pruebas | Supabase `controle-pruebas` · ref `xidzmxtninmtxgqhddvu` |
| Correo de salida | Resend, desde `hola@controlewallet.com` |
| Correo de entrada | Cloudflare Email Routing: `hola@` → Gmail del dueño |
| App anterior, congelada | `heredado/` en el repositorio (**no se edita**) |

Las CLI (`gh`, `wrangler`, `supabase`) ya están instaladas y con sesión iniciada.
El enlace de Supabase debe quedar **siempre en pruebas** — es el seguro que evita
aplicar una migración donde no toca.

---

## 3. Qué ya está hecho

`main` va en **v0.17.0**. Todo pasa por Pull Request; `main` está protegido y ni
el dueño puede escribirle directo (comprobado). Dos verificaciones obligatorias en
CI.

**Etapa 0 · Fundación.** Repositorio, publicación, y vuelta atrás **ensayada**:
4 segundos revertir el código, 22 segundos el esquema completo ida y vuelta.

**Etapa 1 · Núcleo.** `asesor.js` (1,728 líneas, probado con dinero real durante
meses) partido en 13 módulos ES en `sitio/app/nucleo/`. Se extrajo **por número de
línea con un guion, sin reteclear**. 175 de sus 200 pruebas originales portadas a
`node --test`; las 25 que faltan probaban la fusión entre teléfonos de `sync.js`,
que desapareció con el servidor autoritativo.

**Etapa 2 · Esquema.** 20 tablas, RLS en todas con funciones `SECURITY DEFINER`,
mes cerrado inmutable impuesto en la base, bitácora. Migraciones numeradas con su
reverso en `supabase/reversos/`.

**Etapa 3 · Datos y sesión.** Cliente propio sobre PostgREST y GoTrue (sin SDK).
El **armador** (`datos/armador.js`) convierte las filas de la base en el documento
con la forma que el núcleo espera — es lo que permite tener la base normalizada
sin reescribir la aritmética. Registro, confirmación por correo, sesión y
recuperación funcionando en producción.

**Etapa 4 · Interfaz.** Listos: el armazón con riel y barra de pestañas, el
**asistente de arranque** (5 pasos), **Resumen**, **Movimientos**,
**Presupuesto** —donde se edita todo lo que el asistente creó—, **Proyectos**
con veredicto y prioridad por mérito, e **Historia** mes a mes. El armazón
tiene **selector de mes**: el período va en el hash y lo comparten todas.

**Etapa 7 · Sitio público.** Seis páginas en `controlewallet.com`, con vitrina de
dispositivos dibujada en HTML y CSS, y parallax solo con CSS.

### Las pruebas

```
npm run pruebas               282 · núcleo, armador, equivalencia, filas, alcance y paginado
npm run pruebas:aislamiento    24 · ~55 intentos de violar el aislamiento
npm run pruebas:integracion    12 · base → armador → núcleo, contra la base real
```

Las de «filas» leen las **migraciones** y comprueban que cada columna que los
formularios escriben existe de verdad, y que cada `check` del esquema tenga su
recorte en el navegador. Cuando agregués una tabla o una columna, ahí es donde se
amarra.

Las dos últimas necesitan `SUPABASE_URL`, `SUPABASE_ANON_KEY` y
`SUPABASE_SERVICE_KEY` del proyecto de **pruebas**; en CI vienen de los secretos
del repositorio.

---

## 4. Reglas que no se negocian

1. **El servidor es la única fuente de verdad.** Nada de `localStorage` ni
   `IndexedDB` como almacén de datos del usuario. Lo único que queda en el
   dispositivo es el token de sesión.
2. **El núcleo es puro.** Recibe datos, devuelve números. No sabe de red, ni de
   base, ni de pantalla. Hay una prueba que verifica que ningún módulo del núcleo
   toca `window`, `document`, `localStorage` ni `fetch`.
3. **Multi-inquilino desde el primer commit.** Ninguna consulta sin acotar al
   hogar. El filtro va en la base, nunca en el cliente.
4. **El aislamiento se garantiza con RLS.** El código del navegador se asume
   hostil. Toda tabla nueva necesita sus cuatro políticas y su prueba de
   violación.
5. **Ningún secreto en el cliente.**
6. **Datos de tarjeta: jamás.** Ni número, ni CVV, ni vencimiento.
7. **Todo cambio pasa por el repositorio**, con rama y Pull Request. Excepción
   documentada: la configuración de autenticación de Supabase se administra en el
   panel (ver §6).
8. **Nada se pierde.** Toda función que existía tiene que seguir existiendo.
9. **Sin dependencias porque sí.** Las únicas son `wrangler` y `supabase`, y son
   herramientas, no librerías que viajen al navegador.
10. **Ni un estilo en línea.** Es lo que permite `style-src 'self'` sin
    excepciones en la CSP.

---

## 5. Decisiones ya tomadas — no volver a discutirlas

- **Una moneda por hogar**, sin conversión. Multi-moneda es fase 2.
- **La app anterior está congelada.** Solo errores graves.
- **RLS con funciones, no con claims en el JWT.** Un token ya emitido no cambia
  hasta renovarse; revocar acceso tiene que ser inmediato.
- **Montos en `numeric(14,2)` en la base, flotantes dentro del núcleo.** Está
  probado así desde hace meses y tiene su propia tolerancia para conciliar.
- **Un solo Worker** sirve el sitio en `/` y la app en `/app`, para que la vuelta
  atrás revierta ambos de un golpe.
- **El token de sesión vive en `localStorage`.** No es dato financiero; la defensa
  es la CSP estricta. Una cookie `httpOnly` estorbaría en la fase 2 con Capacitor.
- **El enrutador solo muestra las vistas que ya funcionan.** Un menú con entradas
  «en construcción» enseña a no confiar en el menú.

---

## 6. Trampas que ya costaron caro — leer antes de tocar nada

Cada una de estas rompió algo, y todas fallaron **en silencio**.

**`supabase config push` manda el archivo ENTERO, no los cambios.** Rompió
producción tres veces: mandó un `site_url` de desarrollo, bajó el límite a dos
correos por hora, y dejó la contraseña de SMTP con un texto de ejemplo. Se le
puso un guion con guardarraíles y hasta ese guion falló. **La configuración de
autenticación se administra ahora en el panel**, y los valores vigentes están
anotados en `SECRETOS.md`.

**Nunca escribas una clave dentro de un comando.** Dos veces se le pasó al dueño
un comando con un texto de ejemplo dentro y se ejecutó tal cual. Si necesita
poner un secreto, que lo haga en el panel del servicio.

**Hay cifras del núcleo que recorren TODO el histórico, y el navegador solo tiene
el mes en curso.** Son `saldoCuenta`, `deudaTarjeta` y `efectivo`, y de ellas
cuelga el veredicto de un proyecto. Medido: el mismo proyecto sale «Programado»
con doce meses cargados y «Reconsideralo» con uno solo, inventándose la razón.
El ancla de conciliación lo arregla —con ella, un mes da EXACTAMENTE lo mismo que
doce— y `datos/alcance.js` es quien decide si se puede o no. Antes de enseñar
cualquier cifra que venga de esas tres, preguntale.

**Un formulario que se abre y se guarda sin tocar nada no puede cambiar un dato.**
El campo «desde qué mes» de la tarjeta se rellenaba con el mes de hoy al editar,
y eso le borraba de la deuda todo lo anterior. Los valores por omisión son para
CREAR; al editar, lo que estaba vacío se queda vacío.

**`hidden` no esconde si una clase pone `display`.** La regla del navegador vale
(0,1,0), lo mismo que `.boton` o `.mes-nav`, y entre autor y navegador gana el
autor. El botón «Volver a hoy» seguía en pantalla. Hay una sola regla con
`!important` en `app.css` que lo resuelve para toda la app.

**PostgREST devuelve las columnas `numeric` como TEXTO.** Un `"8000.00"` sin
convertir no revienta: se concatena, y el número absurdo aparece tres pantallas
después. Todo pasa por `num()` en el armador, y hay una prueba dedicada.

**Un `@media` acota cuándo aplica una regla; no le sube la prioridad.** Con la
misma especificidad gana la última del archivo. Rompió la barra de pestañas, que
salía en escritorio.

**La especificidad manda sobre el orden.** `.menu a` vale (0,1,1) y
`.boton--principal` vale (0,1,0): el botón principal salía gris sobre verde,
ilegible. Se corrige excluyendo, no subiendo especificidad al otro lado.

**La unidad `ch` se mide contra la fuente del propio elemento.** `68ch` en un
titular de 70 px son más de 3,000 px: la clase parece aplicada y no limita nada.

**Los `.reverso.sql` NO van en `supabase/migrations/`.** La CLI ejecuta todo
`.sql` de esa carpeta. Van en `supabase/reversos/`.

**Un reverso tiene que borrar su fila de `supabase_migrations.schema_migrations`.**
Si no, las tablas desaparecen pero el historial dice que están aplicadas, y
`db push` no las vuelve a correr.

**`supabase db query` va contra la base LOCAL si no se le pasa `--linked`.** Un
cronómetro que mide un comando que no corrió da un número tranquilizador y falso.

**Una comprobación que no puede fallar no está comprobando nada.** `git diff
--stat` sale con código 0 aunque haya diferencias. Usar `git diff --quiet`.

**Verificá que el PR se unió antes de desplegar o etiquetar.** Encadenar con
saltos de línea hace que cada comando corra aunque el anterior falle; usar `&&`.

**Borrar un usuario dejaba su hogar huérfano** con todos sus datos dentro,
contradiciendo la política de privacidad publicada. Hay un disparador que lo
resuelve, y actúa **solo si era el último miembro**.

---

## 7. Cómo trabajar

```bash
git switch -c feat/lo-que-sea
# …cambios…
npm run pruebas
git commit -m "qué cambia y por qué"
git push -u origin feat/lo-que-sea
gh pr create
```

- Nunca a `main` directo. El PR lleva descripción en español: qué cambia y **por
  qué**, con las decisiones no obvias explicadas.
- Las migraciones se aplican primero a **pruebas**, después a producción.
- Verificar en el navegador **midiendo**, no a ojo: las capturas del panel escalan
  distinto de lo que reportan, y varios errores solo aparecieron al medir con
  JavaScript los anchos, los contrastes y los estados.
- Los comentarios explican **el porqué**, no el qué.

---

## 8. Lo que falta, en orden

**Etapa 4 — completa.** Resumen, Movimientos, Presupuesto con confirmación de
ingresos, Proyectos, Historia, capital y diagnóstico, y selector de mes.

**Etapa 5 — funciones pesadas**
- Importar estados de cuenta (BAC, Ficohsa, CSV, PDF) con conciliación. El
  módulo ya está portado en `nucleo/importar.js`; falta la interfaz.
- Facturas por foto → Supabase Storage + Edge Function con la clave de Anthropic.
- Informe del mes (`heredado/reporte.js`, aún sin portar — genera HTML, así que
  es capa de presentación, no núcleo).
- Cierre de mes con las tres conciliaciones.

**Etapa 6 — hogar compartido y paneles**
- Invitaciones por correo (la tabla y la plantilla ya existen).
- Panel del usuario: perfil, miembros, sesiones, exportar, borrar cuenta.
- Panel de plataforma para `admin`.

**Etapa 8 — migrar el hogar del dueño**
- Exportar del `heredado/`, importar al modelo nuevo, y verificar que **el núcleo
  viejo sobre el documento viejo y el núcleo nuevo sobre las tablas devuelven los
  mismos números**. Si uno no cuadra, la migración no pasa.

---

## 9. Pendientes del dueño

- **Supabase Pro (~$25/mes)** antes del primer usuario que pague: es lo que da el
  respaldo diario automático que la especificación exige. Hoy no existe.
- **Revisión legal** de términos y privacidad por alguien licenciado en Honduras.
- **Los precios**, cuando los defina. La página está lista para recibirlos.

---

## 10. Cómo empezar la sesión nueva

1. Leé `README.md`, `CAMBIOS.md`, `VUELTA-ATRAS.md` y `SECRETOS.md`.
2. Corré `npm run pruebas` — deben salir 282 en verde.
3. Mirá `sitio/app/vistas/movimientos.js` como referencia del estilo, y
   `vistas/presupuesto.js` con `datos/filas.js` para lo que se edita: ahí está
   cómo se arma una fila, cómo se valida y por qué eso vive fuera de la pantalla.
4. Arrancá con **Proyectos**, salvo que el dueño diga otra cosa.

No adelantés trabajo de la fase 2 (cobro de suscripciones, apps de tienda). Si
algo depende de una decisión de esa fase, dejalo señalado y seguí.
