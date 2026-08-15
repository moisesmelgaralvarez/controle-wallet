# Traspaso — continuar Controle Wallet

> Pegá este documento completo al abrir un chat nuevo. Describe el estado real
> del proyecto al 12 de agosto de 2026, verificado contra el repositorio y contra
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

**Regla del dueño, adoptada:** cada pieza que se termina **se une y se publica en
el momento**. Nada esperando aprobación, sin sorpresas. Y se le dice qué versión
quedó en línea y qué se ve distinto.

---

## 2. Dónde está todo

| Pieza | Dónde |
|---|---|
| Código | `~/Documents/Controle Wallet` · GitHub `moisesmelgaralvarez/controle-wallet` |
| Sitio y app | Cloudflare Workers, Worker `controle-wallet`, dominio `controlewallet.com` |
| Base de producción | Supabase `controle-produccion` · ref `qhbkghxuwzdrlswphusd` |
| Base de pruebas | Supabase `controle-pruebas` · ref `xidzmxtninmtxgqhddvu` |
| Correo de salida | Resend, desde `hola@controlewallet.com` |
| App anterior, congelada | `heredado/` en el repositorio (**no se edita**) |

Las CLI (`gh`, `wrangler`, `supabase`) están instaladas y con sesión iniciada.
El enlace de Supabase debe quedar **siempre en pruebas** — es el seguro que evita
aplicar una migración donde no toca. Cambialo a producción solo para aplicar, y
devolvelo en el mismo comando.

**La computadora del dueño NO es servidor.** Ninguna pieza del servicio depende
de ella. Si preguntan, la respuesta corta está en `EL-SERVICIO.md`.

---

## 3. Qué ya está hecho

`main` va en **v0.25.0**, y **producción está al día con `main`**. Todo pasa por
Pull Request; `main` está protegido. Dos verificaciones en CI.

**Etapas 0 a 4 — cerradas.** Fundación con vuelta atrás ensayada (4 s el código,
22 s el esquema). Núcleo de 1,728 líneas partido en 13 módulos ES. Esquema de 20
tablas con RLS en todas. Cliente propio sobre PostgREST y GoTrue. Interfaz con
asistente, Resumen, Movimientos, Presupuesto, Proyectos, Historia y selector de
mes.

**Etapa 5 — cerrada.**
- **Cierre de mes** con las tres conciliaciones, la apertura sembrada y los dos
  candados.
- **Importar estados de cuenta**: BAC y Ficohsa por PDF con lector propio,
  cualquier banco por CSV/Excel, y **cualquier PDF guiándose por el saldo** que
  arrastra cada renglón. Sin duplicar, ni del archivo ni de lo tecleado a mano.
- **Informe del mes**, para imprimir o guardar como PDF.

**Etapa 6 — cerrada.** Invitaciones al hogar, y panel de cuenta con exportar todo
y borrar la cuenta de verdad.

**Etapa 8 — cerrada.** Traer el hogar de la app anterior, con la comprobación de
que los mismos números salen por los dos caminos.

### Las pantallas (9 en el menú)

Resumen · Movimientos · Presupuesto · Proyectos · Historia · Cierre · Importar ·
Informe · Tu cuenta

### Las pruebas

```
npm run pruebas               336 · núcleo, armador, equivalencia, filas, contratos
npm run pruebas:aislamiento    35 · intentos de violar el aislamiento
npm run pruebas:integracion    32 · base → armador → núcleo, contra la base real
```

Las de integración y aislamiento necesitan `SUPABASE_URL`, `SUPABASE_ANON_KEY` y
`SUPABASE_SERVICE_KEY` de **pruebas**. Se sacan sin escribirlas en ningún lado:

```bash
REF=xidzmxtninmtxgqhddvu
LLAVES=$(npx supabase projects api-keys --project-ref $REF -o json)
export SUPABASE_URL="https://$REF.supabase.co"
export SUPABASE_ANON_KEY=$(printf '%s' "$LLAVES" | python3 -c "import json,sys; print(next(k['api_key'] for k in json.load(sys.stdin) if k['name']=='anon'))")
export SUPABASE_SERVICE_KEY=$(printf '%s' "$LLAVES" | python3 -c "import json,sys; print(next(k['api_key'] for k in json.load(sys.stdin) if k['name']=='service_role'))")
unset LLAVES
```

### Las funciones de la base y del borde

| Dónde | Qué hace |
|---|---|
| Edge `historico` | Corre el núcleo sobre TODO el histórico. Devuelve patrimonio, salud, carta, cierre, paraCerrar, historia, cuentas, tarjetas, cartera |
| Edge `cuenta` | Borra la cuenta de verdad. Necesita la clave de servicio |
| Edge `invitar` | Manda la invitación por correo |
| `importar_lote` | Borra e inserta un estado de cuenta en UNA transacción |
| `aceptar_invitacion` | Convierte un token válido en membresía |
| `impedir_mes_cerrado` | Un mes cerrado no admite cambios |
| `borrar_hogar_sin_miembros` | Se lleva el hogar cuando se va el último |

---

## 4. Reglas que no se negocian

1. **El servidor es la única fuente de verdad.** Nada de `localStorage` ni
   `IndexedDB` como almacén. Lo único en el dispositivo es el token de sesión.
2. **El núcleo es puro.** Recibe datos, devuelve números. Hay una prueba que
   verifica que no toca `window`, `document`, `localStorage` ni `fetch`.
3. **Multi-inquilino desde el primer commit.** Ninguna consulta sin acotar al
   hogar. El filtro va en la base, nunca en el cliente.
4. **El aislamiento se garantiza con RLS.** El código del navegador se asume
   hostil. Toda tabla nueva necesita sus cuatro políticas y su prueba de
   violación.
5. **Ningún secreto en el cliente.**
6. **Datos de tarjeta: jamás.** Ni número, ni CVV, ni vencimiento.
7. **Todo cambio pasa por el repositorio**, con rama y Pull Request. Excepción
   documentada: la configuración de autenticación de Supabase se administra en el
   panel (ver `SECRETOS.md`).
8. **Nada se pierde.** Toda función que existía tiene que seguir existiendo.
9. **Sin dependencias porque sí.** Las únicas son `wrangler` y `supabase`.
10. **Ni un estilo en línea.** Es lo que permite `style-src 'self'` sin
    excepciones en la CSP.

---

## 5. Decisiones ya tomadas — no volver a discutirlas

- **Una moneda por hogar**, sin conversión. Multi-moneda es fase 2.
- **La app anterior está congelada.** Solo errores graves.
- **RLS con funciones, no con claims en el JWT.**
- **Montos en `numeric(14,2)` en la base, flotantes dentro del núcleo.**
- **Un solo Worker** sirve el sitio en `/` y la app en `/app`.
- **El token de sesión vive en `localStorage`.** La defensa es la CSP estricta.
- **El enrutador solo muestra las vistas que ya funcionan.**
- **El efectivo contado manda** sobre el calculado al cerrar un mes.
- **Los meses pasados NO se congelan solos.** Solo al cerrarlos.
- **No se lee un PDF desconocido adivinando columnas** — está medido que se
  equivoca en silencio. Se lee por el saldo, o se rechaza.

---

## 6. Trampas que ya costaron caro — leer antes de tocar nada

Cada una de estas rompió algo, y **todas fallaron en silencio**.

**Una comprobación que no puede fallar no está comprobando nada.** Es la trampa
que más veces se repitió. Comprobar que un módulo *se importa* no comprueba que
sus funciones existan: importar un espacio de nombres siempre funciona aunque
venga vacío. Pasó con `A.leerArchivo is not a function` en producción. **Toda
prueba nueva se verifica rompiéndola a propósito.**

**El esquema se queda atrás del núcleo, y no avisa.** Cuatro veces: las anclas de
conciliación, la apertura del cierre, la procedencia de lo importado, y
`copiado_de`. El núcleo lee un campo que las tablas nunca le dieron. Se encuentra
**mirando quién consume, no el esquema**.

**Los nombres de campo anidados.** Escribiendo el informe me equivoqué en nueve de
una sentada (`patrimonio.patrimonio` por `.neto`, `salud.meses` por
`.mesesColchon`). Ninguno da error: llega `undefined` y se imprime L 0.00. Hay
una prueba que lee el código de la vista y exige que cada campo exista.

**`on delete set null` hace UPDATE, no solo DELETE.** Borrar un usuario actualiza
cada fila que esa persona tocó, y ese UPDATE chocaba con el candado del mes
cerrado: **nadie que hubiera cerrado un mes podía borrar su cuenta**. Se escondió
porque probándolo con la clave de servicio el campo queda nulo.

**`supabase config push` manda el archivo ENTERO.** Rompió producción tres veces.
La configuración de autenticación se administra en el panel.

**Nunca escribas una clave dentro de un comando.** Dos veces se ejecutó un comando
con un texto de ejemplo dentro.

**Y nunca le des al dueño un comando sin el `cd`.** Se ejecutó desde la carpeta
personal y falló con `no such file or directory`.

**Hay cifras del núcleo que recorren TODO el histórico**, y el navegador solo
tiene el mes en curso: `saldoCuenta`, `deudaTarjeta` y `efectivo`. El ancla de
conciliación lo arregla y `datos/alcance.js` decide si se puede.

**El ciclo de una tarjeta va de corte a corte**, así que agarra días del mes
pasado. Por eso el cierre se calcula en el servidor.

**Una foto vacía no es una foto.** `montos` es `not null default '{}'`, y leer ese
`{}` como plan congelado dejaba el mes entrante con todos sus rubros en cero.

**PostgREST devuelve las columnas `numeric` como TEXTO.** Todo pasa por `num()`.

**Un formulario que se abre y se guarda sin tocar nada no puede cambiar un dato.**

**`hidden` no esconde si una clase pone `display`.** Hay una regla con
`!important` en `app.css` que lo resuelve.

**Un `@media` acota cuándo aplica una regla; no le sube la prioridad.**

**La especificidad manda sobre el orden.**

**La unidad `ch` se mide contra la fuente del propio elemento.**

**Medí, no mires.** A 1440 los párrafos salían de 1,302 px y los campos de 1,296.
La barra de pestañas se desbordaba 20 px con siete entradas.

**Los `.reverso.sql` NO van en `supabase/migrations/`.** Van en
`supabase/reversos/`, y cada uno borra su fila de `schema_migrations`.

**`supabase db query` va contra la base LOCAL sin `--linked`.**

**Verificá que el PR se unió antes de desplegar o etiquetar**, y encadená con
`&&`.

**Cloudflare tarda en propagar.** Un sondeo a segundos del despliegue puede dar
404 de algo que está bien. Compará el hash del archivo local contra el remoto
hasta que coincidan.

**En `pruebas/integracion.js` y `aislamiento.js`, `URL` está sombreado** por la
dirección del proyecto. Usá `globalThis.URL`.

---

## 7. Cómo trabajar

```bash
git switch -c feat/lo-que-sea
# …cambios…
npm run pruebas
git commit -m "qué cambia y por qué"
git push -u origin feat/lo-que-sea
gh pr create
# CI verde → unir → aplicar migración a producción → publicar → etiquetar
```

- Nunca a `main` directo. El PR lleva descripción en español: qué cambia y **por
  qué**, con las decisiones no obvias explicadas.
- Las migraciones se aplican primero a **pruebas**, después a producción.
- **Al publicar, el orden es: migración → Edge Function → Worker.** Si el Worker
  va primero, la pantalla se queda a medias en silencio.
- Verificar **midiendo**, no a ojo.
- Los comentarios explican **el porqué**, no el qué.

---

## 8. Lo que falta

**Nada de producto, salvo una cosa que es decisión del dueño:**

- **Facturas por foto.** Necesita un modelo de IA de un tercero. Cuesta por uso,
  manda la imagen fuera, y obligaría a ampliar la política de privacidad.
  Recomendación dada: **esperar a que un cliente lo pida** — importar el estado de
  cuenta ya evita teclear.

**Pendientes del dueño, no técnicos:**

- **Supabase Pro (~$25/mes) — LO ÚNICO URGENTE.** Producción **no tiene respaldo
  automático**. Ya hay datos reales y se puede invitar gente. Un error grave en la
  base es hoy irrecuperable.
- **Revisión legal** de términos y privacidad por alguien licenciado en Honduras.
- **Los precios**, cuando los defina.

**Fase 2, no adelantar:** cobro de suscripciones, apps de tienda, multi-moneda.

---

## 9. Cómo empezar la sesión nueva

1. Leé `EL-SERVICIO.md` (para hablar con el dueño), `CAMBIOS.md`,
   `VUELTA-ATRAS.md` y `SECRETOS.md`.
2. Corré `npm run pruebas` — deben salir **336 en verde**.
3. Comprobá que producción esté al día:
   `curl -s https://controlewallet.com/app/ | grep -o 'data-ruta="[a-z]*"' | sort -u`
   — deben salir **9 secciones**.
4. Mirá `sitio/app/vistas/cierre.js` como referencia del estilo de una vista con
   servidor, y `datos/importar.js` para el patrón de «preparar y después
   aplicar».

**Cómo verificar contra pruebas:** `npx wrangler dev` en el puerto 8787 —
localhost siempre habla con pruebas, nunca con producción. La cuenta de pruebas
del dueño es `moises-melgar@outlook.com` y **la contraseña la escribe él**: no se
pide ni se escribe. Antes de tocar datos, sacá una foto de las tablas y compará
al terminar.
