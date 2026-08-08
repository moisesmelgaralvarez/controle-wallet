# Controle Wallet

App instalable en Android y iPhone para llevar el presupuesto de Moisés y Judith,
sus proyectos y su estado financiero.

**Arranca vacía.** No trae datos de ejemplo ni supone nada: un asistente los lleva a
construir la base desde cero, y todo lo que la app muestre después será lo que ustedes
registraron.

Es una **PWA**: un solo código para los dos teléfonos, sin tiendas de aplicaciones,
sin cuentas de desarrollador y sin costo. Se instala en la pantalla de inicio, abre
a pantalla completa y **funciona sin señal**.

---

## 1. Probarla ahora mismo (sin instalar nada)

En la Terminal:

```bash
cd ~/Documents/Presupuesto-app && python3 -m http.server 8777
```

Y abre <http://localhost:8777> en el navegador.

> Nota: en esta Mac el servidor de vista previa de Claude no puede leer `~/Documents`
> (restricción de privacidad de macOS). Ejecutar el comando tú mismo en la Terminal sí funciona.

---

## 2. Ponerla en línea

Para **instalarla en el teléfono** hace falta que esté servida por HTTPS. Un archivo
abierto desde el disco no se puede instalar ni funciona sin conexión.

Va en **Cloudflare Pages**, conectado a un repositorio de GitHub. Cada `git push`
publica solo: no hay que volver a subir la carpeta nunca.

### 2.1 El repositorio

El proyecto ya es un repositorio git. Solo falta crearlo en GitHub y enlazarlo:

```bash
git remote add origin https://github.com/TU-USUARIO/controlewallet.git
git push -u origin main
```

Puede ser público: **no hay ni una credencial en el código**. La URL y la clave de
Supabase se escriben en la app y viven en el teléfono; la clave de Anthropic vive en
los secretos de Supabase. El `.gitignore` además deja fuera los respaldos exportados
y los estados de cuenta, que sí son datos del hogar.

### 2.2 Cloudflare Pages

**Workers & Pages → Create → Pages → Connect to Git**, y elige el repositorio.
La configuración de compilación va **vacía**: no hay nada que compilar.

| Campo | Valor |
|---|---|
| Framework preset | None |
| Build command | *(vacío)* |
| Build output directory | `/` |

Después, en **Custom domains**, añade el dominio. Si lo compraste en Cloudflare, es
un desplegable y no hay que tocar DNS.

Cloudflare Pages respeta el archivo [`_headers`](_headers), así que la política de
seguridad viaja con el sitio. GitHub Pages **no** permite cabeceras propias: ahí se
perdería el CSP, y por eso no sirve para esta app.

### 2.3 A partir de ahí

```bash
git add -A && git commit -m "qué cambió" && git push
```

En un minuto está en línea. Y como hay historial, cualquier versión anterior se
recupera con `git revert`.

---

## 3. Conectar la nube (para que ambos vean lo mismo)

Sin este paso la app funciona perfecto, pero **cada teléfono guarda sus propios datos**:
lo que registre Judith no aparecerá en tu teléfono.

### 3.1 Crear el proyecto

1. Entra a <https://supabase.com> y crea una cuenta gratuita.
2. **New project.** Ponle el nombre que quieras y guarda la contraseña de la base de datos.
   Elige la región más cercana (`East US` va bien desde Honduras).
3. Espera a que termine de crearse (un par de minutos).

### 3.2 Crear la tabla

En el panel: **SQL Editor → New query**. Pega todo el contenido de
[`supabase-schema.sql`](supabase-schema.sql) y dale **Run**.

### 3.3 Cerrar el registro público — no te saltes esto

**Authentication → Sign In / Providers → Email** y **apaga** *"Allow new users to sign up"*.

Si lo dejas encendido, cualquiera que vea la clave pública puede crearse una cuenta
y leer el presupuesto.

### 3.4 Crear las dos cuentas

**Authentication → Users → Add user → Create new user.** Una para ti y otra para Judith,
con su correo y una contraseña cada uno. Marca el correo como confirmado.

### 3.5 Conectar la app

En la app, toca el **puntito de estado** arriba a la derecha. Ahí pegas:

| Campo | Dónde sacarlo |
|---|---|
| URL del proyecto | Project Settings → Data API → *Project URL* |
| Clave pública (anon) | Project Settings → API Keys → *anon / public* |
| Nombre del hogar | El que quieras, pero **igual en los dos teléfonos** (ej. `melgar-vallejos`) |

Guarda, e inicia sesión con la cuenta que creaste. Repite en el teléfono de Judith
con **la misma URL, la misma clave y el mismo nombre de hogar**, pero su propia cuenta.

> **Si un teléfono ya tiene datos y el otro está en blanco**, no importa cuál conecte
> primero: al fundirse, lo que exista sobrevive y se publica para el otro. El teléfono
> vacío recibe la configuración completa en el siguiente sondeo (hasta 20 segundos).
> Lo que **no** debe hacerse es completar el asistente en los dos teléfonos por separado
> antes de conectar: eso crearía dos juegos de gastos y personas con ids distintos, y la
> fusión los sumaría en vez de reconocerlos como los mismos.

---

## 4. Instalarla en el teléfono

**iPhone** — abre la dirección en **Safari** (tiene que ser Safari), toca el botón
de compartir y elige **Añadir a pantalla de inicio**.

**Android** — abre la dirección en Chrome, menú de tres puntos, **Instalar aplicación**.

Queda con su ícono, sin barra de navegador. Se ve y se comporta como una app.

---

## 5. Armar la base desde cero

La primera vez, la app abre en un asistente de cuatro pasos:

1. **Quiénes usan la app.** Los nombres que aparecerán en cada ingreso y gasto.
2. **Los pagos que reciben.** Cada uno con su día del mes y su monto *típico*, más las
   retenciones que le aplican.
3. **Los gastos del hogar.** Con su categoría y, sobre todo, **cómo se pagan**: con
   tarjeta o en efectivo.
4. **Tarjetas y financiamientos.** Opcional, pero es donde la app se vuelve útil de verdad.

Todo se puede cambiar después desde Presupuesto — incluidas **las personas**, que tienen
su propia sección al principio de esa pantalla. Si un día quieren volver a empezar,
hay un botón **Borrar todo y empezar de nuevo** al final de esa pantalla.

### Los ingresos se llenan mes a mes

El monto de la plantilla es solo una **estimación**. Cada mes, en Presupuesto, cada pago
aparece marcado como *estimado* con un botón **Confirmar lo recibido**: ahí anotan el bruto
real y las retenciones que de verdad aplicaron.

Esto es lo que hace que el ISR variable quede bien registrado — cuando la comisión sube,
la retención sube, y el neto de ese mes no es el de siempre. Los meses sin confirmar se
marcan como estimados en toda la app, para que nunca confundan una proyección con un hecho.

### Las cinco pantallas

| Pantalla | Para qué |
|---|---|
| **Resumen** | El disponible real del mes y el **pulso**: si van a buen ritmo o adelantados |
| **Presupuesto** | Personas, pagos, gastos, tarjetas y financiamientos. Aquí se edita todo |
| **Proyectos** | Las metas de compra, con el consejo del asesor y el orden de prioridad |
| **Movimientos** | Lo que se gastó de verdad: registro, búsqueda y reparto por categoría |
| **Historia** | Mes a mes: cuánto entró, cuánto se fue y cuánto quedó |

### Buscar en el registro

Cuando se acumulan cientos de gastos, el buscador de **Movimientos** encuentra por detalle,
rubro, categoría, persona o fecha. No hace falta escribir tildes: buscar `pediatria`
encuentra *Pediatría*. Los chips filtran por medio de pago y por persona, y se combinan
con el texto. Tocar de nuevo un filtro encendido lo apaga.

### En qué se fue

Debajo del plan, Movimientos reparte lo gastado del mes **por categoría**, de mayor a menor
y con el porcentaje de cada una. La categoría no vive en el movimiento sino en el rubro al
que apunta: si recategorizas un gasto, se reordena también todo lo ya registrado.

---

## 6. La tarjeta es un medio de pago, no una deuda aparte

Este es el punto que más cambia respecto a una app de presupuesto genérica.

Si todos los gastos del mes se cargan a la tarjeta y luego se paga con el ingreso del
corte, **restar el gasto y además el pago de la tarjeta cuenta el mismo dinero dos veces**.
Por eso el disponible real se calcula así:

```
ingreso neto del mes
− gastos corrientes        (vayan por tarjeta o en efectivo)
− fondo de salud
− cuotas de financiamiento
= disponible real
```

La tarjeta no aparece en esa resta. Se vigila aparte, **por ciclo de corte**, que es la
pregunta que de verdad importa cada mes:

> Del 7 de julio al 6 de agosto se cargaron L 19,101.
> Lo paga Comisiones, que trae L 14,840.
> **Faltan L 4,261** — esa diferencia sale de las quincenas o se queda revolviendo.

Mientras no haya movimientos registrados en el ciclo, la app usa el plan como referencia
y lo dice. Al ir anotando gastos reales, la cifra pasa a ser la real.

**Los financiamientos sí restan.** Compras a cuotas, extrafinanciamiento o préstamos con
cuota fija son un compromiso mensual aparte del gasto corriente. La app sabe cuántas cuotas
faltan, así que también sabe **cuándo se libera** ese dinero — y avisa que a partir de ese
mes los proyectos avanzan más rápido.

---

## 7. El asesor financiero

Proyecta hasta 60 meses hacia adelante sobre el disponible real.

**Lo que toma en cuenta mes a mes:**

- El ingreso confirmado de cada mes, o el típico donde todavía no se confirmó.
- Los gastos, capitalizando los que tienen crecimiento mensual (el de salud, sobre todo).
- Las cuotas de financiamiento vigentes, que van desapareciendo conforme se terminan.

**Lo que recomienda en cada proyecto:**

- Cuánto apartar al mes y por quincena, dejando siempre un **colchón del 20%**.
- En cuántos meses se alcanza, con dos escenarios cuando el costo es un rango.
- Si hay fecha objetivo, la cuota que haría falta — y si no da, lo dice.
- Un veredicto: **Viable · Ajustado · No viable · Alcanzado**.

**El disponible se reparte en cascada.** Los proyectos se atienden en el orden de la lista:
el primero reserva lo suyo y el segundo solo sugiere sobre lo que quedó. Sin eso, dos
proyectos en automático reservarían el mismo dinero. Para cambiar prioridades, cambia el orden.

### El pulso del mes

En Resumen, dos barras que se leen juntas: **cuánto mes ha corrido** y **cuánto presupuesto
se ha ido**. Si la segunda va más larga, van gastando más rápido que el calendario. Debajo,
la cifra accionable: a este ritmo cerrarían en tanto, y para llegar justos quedan tanto al
día. Más la agenda: cuándo entra el próximo pago y cuándo corta la tarjeta.

Gastar el 26% del presupuesto es normal el día 20 y es una alarma el día 4. Esa comparación
es toda la señal.

### La historia

La pestaña **Historia** guarda la memoria: cada mes con lo que entró, lo que se gastó y lo
que quedó, más el promedio, el mejor mes y el más apretado.

Dos reglas la mantienen honesta:

- **El mes en curso no compite.** Sale en la lista y en la gráfica, marcado *en curso* y en
  gris, pero queda fuera del promedio y de los récords: lleva unos días de gasto contra
  meses enteros y siempre ganaría.
- **No se rellenan huecos.** Un mes sin ingreso confirmado y sin un solo movimiento no
  aparece. Lo que no se anotó no se inventa.

---

## 8. Las cuentas de banco

Cada quien registra su cuenta —dónde le depositan— y la app lleva el saldo. Es la
respuesta a "¿cuánto tenemos de verdad?", distinta de "¿cuánto sobra este mes?".

```
Saldo al empezar el mes que elijas
  + ingresos CONFIRMADOS de quienes depositan ahí
  − retiros de efectivo desde esa cuenta
  − compras con la tarjeta de débito de esa cuenta
  − pagos de tarjeta girados desde esa cuenta
  = lo que hay en el banco
```

**Dos reglas evitan contar el mismo dinero dos veces:**

- **Solo suma lo confirmado.** Un pago en *estimado* todavía no está en el banco. Si
  sumara el monto típico, el saldo no cuadraría con el del cajero.
- **La tarjeta de crédito no resta al comprar.** El dinero sigue en la cuenta hasta
  que se paga el corte; lo que resta es el pago, no la compra. La de **débito** sí
  resta al instante, porque ahí el dinero sale en el momento.

El retiro de efectivo resta una sola vez, al sacarlo. Gastar ese efectivo después
mueve la bolsa de efectivo, no la cuenta.

### Débito y crédito son cosas distintas

Al registrar una tarjeta se elige el tipo. La de **débito** se liga a una cuenta y no
tiene ciclo de corte: no aparece en el bloque de cortes porque no hay nada que pagar.
La de **crédito** funciona como siempre, con su día de corte.

Por eso el gasto en efectivo ya no dice "efectivo o débito": si pagaron con débito,
va como **tarjeta**, escogiendo la de débito. Así el saldo de la cuenta baja solo.

### Pagar la tarjeta

En Movimientos hay **Pagar tarjeta**: sale de la cuenta que elijas y salda el corte.
El monto viene sugerido con lo que falta por saldar. **No es un gasto nuevo** — los
consumos ya estaban contados; esto solo mueve el dinero de la cuenta a la tarjeta.

Si giran de Ficohsa a BAC y de ahí pagan, basta registrar el pago desde Ficohsa: el
saldo queda igual de exacto con la mitad de registros.

---

## 9. Efectivo y retiros

Cada gasto se registra con **cómo se pagó**: con tarjeta o en efectivo. Eso no cambia el
presupuesto (un gasto es un gasto), pero decide si entra o no al corte de la tarjeta.

Los **retiros de cajero** son otra cosa: no son un gasto, solo pasan dinero de la cuenta a
la cartera. Registrarlos como gasto contaría lo mismo dos veces — una al sacarlo y otra al
gastarlo — así que **no tocan el disponible real ni el ciclo de la tarjeta**.

Lo que sí hacen es alimentar la bolsa de **Efectivo en mano**, en Movimientos:

```
efectivo en mano = todo lo retirado − todo lo gastado en efectivo
```

Es un saldo acumulado, no mensual: lo que sobra en la cartera en agosto sigue ahí en
septiembre. Si el saldo se vuelve negativo, la app avisa — significa que falta anotar un
retiro, o que un gasto quedó marcado como efectivo cuando fue con tarjeta.

---

## 10. Escanear facturas (opcional)

Le tomas una foto a la factura y la app la lee: comercio, fecha, total y categoría.
**Nada se guarda solo** — los datos llenan el formulario y tú confirmas. Un total mal
leído que entrara sin revisión ensuciaría el presupuesto sin que nadie se enterara.

### Por qué hace falta una función en el servidor

La clave de la IA **no puede vivir en la app**. Todo el código de la app se descarga
al teléfono y cualquiera puede leerlo: una clave puesta ahí es pública, y quien la
saque gasta con tu tarjeta. Por eso la foto pasa por una Edge Function de Supabase,
que sí es servidor y guarda el secreto:

```
Teléfono  →  Edge Function  →  API de Claude
 (foto)      (tiene la clave)    (lee la factura)
          ←  {comercio, fecha, total, categoría}
```

### Desplegarla

1. Crea una cuenta en <https://console.anthropic.com> y genera una clave de API.
2. Instala la CLI de Supabase y entra al proyecto (`supabase login`, `supabase link`).
3. Guarda la clave como secreto y despliega:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-tu-clave
supabase functions deploy leer-factura
```

El código está en [`supabase/functions/leer-factura/index.ts`](supabase/functions/leer-factura/index.ts).
Supabase exige un JWT válido por omisión, así que solo ustedes dos pueden llamarla.

### Lo que cuesta

Con `claude-opus-5`, alrededor de **$0.02–0.03 por factura** — unos $2–3 al mes si
escanean 100. La función usa esfuerzo bajo (`effort: "low"`), que es lo apropiado
para una lectura acotada como esta. Si algún recibo difícil se lee mal, súbelo a
`"medium"` en el archivo. Para gastar menos, cambiar el modelo a `claude-haiku-4-5`
baja el costo a una quinta parte, con algo menos de precisión en fotos malas.

### Sin señal o sin la función desplegada

La foto **no se pierde**: queda en cola en el teléfono y se lee sola cuando vuelve la
conexión. En Movimientos aparece cuántas están pendientes.

### Límites

- Las fotos se guardan **en el teléfono que las tomó** y no se sincronizan con el otro.
  Sincronizarlas necesitaría Supabase Storage, que es un paso aparte.
- Las facturas **salen del teléfono** hacia Anthropic para ser leídas. Es información
  del hogar; conviene saberlo.
- La lectura es buena pero no infalible. Por eso la app te obliga a confirmar.

---

## 11. Cómo funciona por dentro

Los datos se guardan **primero en el teléfono** y después se sincronizan. Por eso abre al
instante y sirve aunque no haya señal: lo que registres sin internet se sube solo cuando vuelve.

El puntito de arriba dice en qué anda:

| | |
|---|---|
| gris | solo en este teléfono, sin nube |
| amarillo | falta iniciar sesión, o hay cambios sin subir |
| azul parpadeando | sincronizando |
| verde | al día |
| rojo | no se pudo conectar |

Cuando los dos editan a la vez, gana el cambio más reciente **de cada dato por separado**
— no del documento entero. Si tú corriges el gasto de luz y Judith el de comida al mismo
tiempo, se conservan los dos. Los movimientos y aportes nunca se pisan: se suman.

Esto está cubierto por pruebas. Abre `pruebas.html` en el navegador: cubre la fusión entre
teléfonos, el disponible real, los ingresos mes a mes, el ciclo de la tarjeta, los
financiamientos y el asesor. Deben salir las **200 en verde**.

### Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Estructura de la app |
| `app.css` | Estilos, modo claro y oscuro |
| `app.js` | Vistas, asistente, formularios y gráficas |
| `asesor.js` | Motor financiero: proyección, ciclo de tarjeta, viabilidad, pulso e historia |
| `facturas.js` | Foto, cola offline y llamada a la lectura por IA |
| `reporte.js` | Genera el análisis de presupuesto imprimible |
| `importar.js` | Lee estados de cuenta, clasifica comercios y evita duplicados |
| `supabase/functions/leer-factura/` | Edge Function que guarda la clave y lee la factura |
| `sync.js` | Sincronización y fusión entre teléfonos |
| `sw.js` | Hace que funcione sin señal |
| `pruebas.html` | Las 200 pruebas |
| `supabase-schema.sql` | Tabla y permisos de la base |
| `supabase-rollback.sql` | Deshace los permisos si la app se queda sin conectar |
| `_headers` | Cabeceras de seguridad que aplica Netlify |

Si cambias algún archivo, **súbele el número a `CACHE` en `sw.js`** (va en `controlewallet-v1`;
el siguiente sería `controlewallet-v2`). Si no, los teléfonos seguirán mostrando la versión
vieja guardada.

---

### Cabeceras de seguridad

El archivo [`_headers`](_headers) va en la raíz de la carpeta y Netlify lo aplica solo.
Lo importante es la política de contenido: **`script-src 'self'` sin excepciones**, que
significa que el navegador solo ejecuta los `.js` del propio sitio. Aunque alguien lograra
inyectar código en una página, no correría — es la defensa de fondo para la sesión que
vive en el teléfono. `connect-src` además limita a dónde puede hablar la app: solo a sí
misma y a Supabase.

Está probada contra la app completa (vistas, gráficas, fotos de factura, formularios) sin
una sola violación. Si algún día añades una librería externa o un servicio nuevo, tendrás
que abrirle paso en la directiva que corresponda, o el navegador lo bloqueará en silencio.

**Es específica de Netlify.** En otro hosting hay que traducirla a su formato.

---

## 12. Seguridad

Autenticación con **Supabase Auth**, que ya trae lo necesario para dos usuarios fijos:

| Requisito | Cómo queda resuelto |
|---|---|
| Sesión con JWT | Token de acceso de 1 hora, renovado con refresh token rotativo |
| Contraseñas con hash | bcrypt del lado de Supabase; la app nunca ve la contraseña guardada |
| Sin registro público | El alta se apaga en el panel; las dos cuentas se crean a mano |
| Rate limiting en login | Incluido en Supabase Auth |
| HTTPS obligatorio | Lo impone el hosting; sin HTTPS la PWA ni siquiera se instala |
| Secretos fuera del código | La URL y la clave se guardan en el dispositivo, no en el repositorio |

**Una diferencia respecto a un backend propio:** el refresh token se guarda en
`localStorage`, no en una cookie `httpOnly`. Una cookie así solo puede ponerla un servidor
propio, y esta app es estática — montarlo obligaría a un backend Node hospedado y a
mantener a mano el hash de contraseñas y el rate limiting, que es justo donde se cometen
los errores de seguridad. A cambio, el riesgo real (XSS) se contiene por otra vía: la app
no carga ninguna dependencia externa y todo lo que se muestra en pantalla pasa por escapado
de HTML.

La clave `anon` va dentro de la app y eso es correcto: por sí sola no abre nada, porque la
tabla exige sesión iniciada y el registro público está cerrado.

---

## 13. Límites conocidos

- La sincronización **consulta cada 20 segundos** con la app abierta, no es instantánea.
  Para dos personas es de sobra; si un día molesta, se puede pasar a tiempo real.
- Los **gastos y financiamientos** son un plan único, igual todos los meses. Los que se
  capturan mes a mes son los **ingresos**. Si algún día hace falta lo mismo para los gastos,
  el modelo ya está listo para extenderlo.
- La proyección supone que el ingreso **se repite** con el monto típico después del último
  mes confirmado. No adivina comisiones futuras.
- Los intereses de la tarjeta **no se modelan**. La app avisa cuando el corte no alcanza,
  pero no calcula cuánto costaría revolver ese saldo.
- El respaldo manual (**Exportar** en Presupuesto) descarga un archivo con todo. Sirve para
  pasar datos entre teléfonos sin nube, o para dormir tranquilo.
