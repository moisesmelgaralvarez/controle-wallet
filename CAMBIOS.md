# Cambios

Qué trajo cada versión, en español y sin jerga. Lo más nuevo va arriba.

---

## v0.11.0 — El presupuesto se edita

*Sigue la etapa 4.*

**Qué se hizo**

- **La pantalla de Presupuesto.** Hasta ahora el asistente armaba el hogar una
  vez y ahí quedaba: para corregir un monto había que volver a pasar por él.
  Ahora se editan los pagos con lo que le toca a cada persona y sus retenciones,
  los gastos, las tarjetas, las cuentas de banco, las personas, los
  financiamientos y los datos del hogar — nombre, moneda y día en que arranca el
  mes.
- Cada panel cierra con su total, y la pantalla cierra con la resta completa:
  ingreso neto − gastos corrientes − fondo de salud − cuotas = disponible real.
  Es la fórmula del núcleo, a la vista, para que se entienda de dónde sale la
  cifra que manda.
- **Lo que falta se señala en rojo, no en gris:** una tarjeta sin ingreso
  asignado o una cuenta donde no cobra nadie son huecos que dejan un cálculo a
  medias, no detalles.

**Lo que NO se muestra, a propósito**

- **El saldo de las cuentas.** Calcularlo exige recorrer todo el histórico y en
  el navegador solo vive el mes en curso: un saldo hecho con un mes de datos
  sería un número creíble y falso, que en una app de dinero es de lo peor que
  puede pasar. Lo que se muestra es lo declarado —con cuánto arranca la cuenta y
  desde qué mes—, y el saldo llega cuando el servidor calcule la historia.
- Al gasto solo se le ofrecen tarjetas **de crédito**. Asignarle una de débito lo
  sacaría del corte de todas sin avisar, porque el ciclo solo mira las de
  crédito.

**Una prueba nueva que vale por varias**

De formulario a fila hay una frontera: la pantalla habla como la gente y la base
habla `snake_case`. Un nombre de columna mal escrito no falla al programarlo:
falla con un 400 en la cara de quien acaba de darle a Guardar. Así que los
armadores de fila viven aparte y sin pantalla, y una prueba **lee las
migraciones** —la única autoridad sobre qué columnas existen— y comprueba que
cada una de las que el editor escribe está de verdad ahí. La misma prueba
verifica que cada `check` del esquema tenga su recorte en el navegador: un día
99 se guarda como 31, no como un error del servidor.

**Medido en el navegador, no visto a ojo**

Sin desbordes ni scroll horizontal a 360, 768, 1440, 1600 y 2560 px. Contraste
mínimo 5.7 en modo claro y 7.4 en oscuro, cuando la norma AA pide 4.5. Los
números cuadran con el núcleo: 66,500 − 19,300 − 3,200 − 1,250 = 42,750.

**Dos arreglos encontrados midiendo**

- Los botones de «Agregar» medían **29 px de alto**. Se ven bien en una captura
  y se fallan con el pulgar; con `pointer: coarse` pasan a 44, que es la
  referencia. Alcanza también a los botones de icono del asistente.
- El diálogo ancho tenía sus catorce campos en **una sola columna dentro de un
  cuadro de 1,200 px**: la mitad quedaba fuera de la vista. Ahora usa dos
  columnas, y en un pago las dos personas quedan lado a lado, que es además como
  se comparan.

---

## v0.10.0 — Movimientos: el gasto del día

*Sigue la etapa 4.*

- Registrar, editar y borrar gastos, con buscador que ignora tildes y mayúsculas
  y filtros por medio de pago y por persona.
- Las dos cosas que **no** son gastos, con su propia forma y su explicación en
  pantalla: un retiro solo mueve dinero de la cuenta a la cartera, y pagar la
  tarjeta no es un gasto nuevo porque los consumos ya se contaron.
- El período de cada registro sale del día de arranque del hogar, no del mes del
  calendario: con arranque el 7, un gasto del 2 de agosto pertenece a julio.
- **Un error que se veía en pantalla:** la barra de pestañas del teléfono
  aparecía también en escritorio. La regla que la oculta vivía en un `@media`
  situado antes de la definición de `.barra-app`, y con la misma especificidad
  gana la última del archivo. Un `@media` acota cuándo aplica una regla; no le
  sube la prioridad.

---

## v0.9.0 — El asistente de arranque

*Arranca la etapa 4.*

- Cinco pasos de una base vacía a un hogar que calcula.
- **Cada paso se guarda al terminarlo**, no todo al final: quien cierra la
  pestaña en el paso 3 conserva los dos primeros. Guardar al final sería más
  simple de programar y castigaría a quien se interrumpe, que en un teléfono es
  cualquiera.
- **Nada de estructura heredada.** Las categorías y los rubros sugeridos son
  ejemplos que se botan de un toque. La app anterior traía metido dentro el
  presupuesto de un hogar concreto; esta no supone nada sobre cómo vive quien la
  usa.
- Entran las piezas compartidas que faltaban: formato de dinero y fechas en un
  solo lugar, la hoja de formularios que crece con la pantalla, y la capa de
  escritura donde invalidar lo que se tiene en memoria va **pegado** a guardar y
  no se puede separar.
- Accesibilidad: durante el asistente había dos `<h1>` en la misma página, que
  para un lector de pantalla es una estructura rota.

---

## v0.8.0 — Sesión real y la primera pantalla

*Segunda mitad de la etapa 3, y el arranque de la etapa 4.*

**Qué se hizo**

- **El registro y el inicio de sesión funcionan.** Se acabaron los formularios
  deshabilitados: se crea la cuenta, se confirma por correo, se entra, y hay
  recuperación de contraseña.
- Cliente de datos propio (`datos/api.js`), unas doscientas líneas de `fetch`
  contra PostgREST y GoTrue. **Sin SDK**: el oficial pesa más de cien kilobytes,
  trae su propio árbol de dependencias y obligaría a abrirle la mano a la política
  de seguridad.
- `datos/hogar.js` decide qué se baja: la configuración una vez, y lo que pasó
  **por mes**. Un hogar con tres años de historia no le baja tres años al teléfono
  para enseñarle agosto. Todo en memoria — al cerrar la pestaña no queda nada.
- **La primera pantalla de la aplicación**, en `/app`: disponible real, ingreso,
  gastos, cuotas, el pulso del mes y el ciclo de cada tarjeta. Con riel lateral en
  pantalla grande y barra de pestañas en teléfono.
- El esquema se aplicó también a **producción**.
- El núcleo y el armador se mudaron dentro de `sitio/`, que es lo que se publica.
  Ahora lo que las pruebas ejercitan es exactamente lo que corre en el navegador.

**Comprobado de punta a punta**

Registro → sesión → hogar traído del servidor → números en pantalla. Y lo que más
importa: **en el dispositivo queda una sola cosa, `controle.sesion`.** Ni un gasto,
ni un saldo, ni un movimiento.

**Un error que se veía pero no avisaba**

Las barras del pulso salían llenas y marcando 0%. Le pedía al núcleo unos campos
que no existen; el `undefined` se volvía `NaN%`, el navegador descartaba el ancho y
la barra quedaba al 100%. Los campos de verdad son `avanceMes` y `avanceGasto`.

**Lo que hay que saber**

- **Los correos de confirmación todavía salen por el remitente compartido de
  Supabase**, que está limitado a unos pocos por hora. Para que un desconocido
  pueda registrarse de verdad hay que configurar Resend como SMTP en el panel de
  Supabase — hace falta la clave de API de Resend, que solo tiene el dueño.

---

## v0.7.0 — El armador: de las filas al documento

*Primera mitad de la etapa 3.*

**Qué se hizo**

- `datos/armador.js`: convierte las filas de la base en el documento con la forma
  que el núcleo espera desde siempre. Es el puente que permite tener la base
  normalizada —para que dos personas editen a la vez sin pisarse— sin reescribir
  1,700 líneas de aritmética probada.
- Migración aditiva con las **anclas de conciliación** que faltaban: `saldoBanco`
  en cuentas y tarjetas, y `retenido` en tarjetas. No son cosméticas: son contra
  lo que se concilia. Sin ellas, el cierre de mes se quedaba sin una de sus tres
  conciliaciones.
- **24 comparaciones por ambos caminos**: el mismo hogar escrito como documento a
  mano y como filas de base, y el núcleo tiene que dar el mismo número por los
  dos. Si el armador se come un campo o pierde un decimal, alguno se separa.
- **12 pruebas de integración contra la base real**: se escriben filas, se leen de
  vuelta por la API, se arma el documento y se verifica que salen los números
  correctos. Sin esto el armador solo estaría comparado contra fixtures que
  escribí yo, y un nombre de columna mal puesto en los dos sitios pasaría en verde.

**Lo que se descubrió al escribirlo**

- Faltaban tres campos en el esquema. Aparecieron comparando campo por campo lo
  que el núcleo *lee* contra lo que las tablas *ofrecen* — un hueco que no se ve
  mirando el esquema, solo mirando quién lo consume.
- PostgREST devuelve las columnas `numeric` como **texto**. Un `"8000.00"` que se
  cuele sin convertir no revienta: se concatena, y el número absurdo aparece tres
  pantallas después. Hay una prueba dedicada a que no quede ni uno.
- Un pago cuenta como confirmado solo cuando **todas** sus líneas lo están.
  Confirmar es un acto sobre el pago completo; con «alguna» bastaría para dar por
  hecho un mes a medias.

---

## v0.6.0 — El esquema multi-inquilino y su aislamiento

*Etapa 2 de la fase 1.*

**Qué se hizo**

- Veinte tablas en dos migraciones numeradas, cada una con su reverso escrito.
  Se acabó el documento único `jsonb`: ahora cada gasto, cada movimiento y cada
  ingreso es una fila. Con dos personas editando a la vez, un solo bloque por
  hogar significa que el último que guarda le borra el trabajo al otro.
- Montos en `numeric(14,2)`, no en flotante. En la base los montos se suman y se
  concilian contra lo que dice el banco, y un flotante binario no representa 0.10
  exacto.
- RLS en todas, con funciones `SECURITY DEFINER` (`es_miembro`, `puede_escribir`,
  `es_propietario`). **No se guardó la lista de hogares en el token de sesión**:
  es más rápido, pero un token ya emitido no cambia hasta renovarse, y quitarle el
  acceso a alguien tardaría hasta una hora en surtir efecto. En un producto donde
  dos personas comparten las finanzas de su casa, eso es inaceptable.
- Al registrarse, un disparador crea el perfil, el hogar y la membresía de
  propietario. Va en la base y no en el navegador para que ocurra siempre: si
  dependiera de una llamada posterior, una pestaña cerrada a destiempo dejaría
  usuarios sin hogar.
- **Un mes cerrado es inmutable, impuesto por la base.** Y se tapó la escapatoria:
  tampoco se puede sacar un registro de un mes cerrado cambiándole el período.
- **Suite de aislamiento: 22 pruebas, unos 55 intentos de violación, todas
  rechazadas.** Corre en CI en cada Pull Request contra el proyecto de pruebas.

**Detalles que costaron un intento**

- Los archivos `.reverso.sql` estaban en `supabase/migrations/`. La CLI toma todo
  `.sql` de esa carpeta como migración: se habrían ejecutado y habrían borrado las
  tablas recién creadas. Viven ahora en `supabase/reversos/`.
- `gen_random_bytes` vive en la extensión `pgcrypto`, que en Supabase está en el
  esquema `extensions`. Se referencia con nombre completo.

---

## v0.5.0 — La vitrina de dispositivos

**Qué se hizo**

- Tres pantallas en la portada —computadora, tableta y teléfono— con la interfaz
  de la aplicación dibujada por dentro: tablero con fichas de cifras, gráfica de
  historia, tabla de plan contra real, el corte de la tarjeta y las barras del
  pulso.
- **Están dibujadas en HTML y CSS, no son capturas.** Pesan casi nada, se ven
  nítidas en cualquier resolución y siguen el modo claro u oscuro de quien mira.
  Una imagen no hace ninguna de las tres cosas.
- Cada aparato se desplaza a distinta velocidad al bajar. Esa diferencia es lo
  que el ojo lee como profundidad — antes las tres capas iban casi al mismo
  ritmo y por eso el efecto se sentía pobre.
- Proporciones reales: 16:10 la computadora, 3:4 la tableta, 1:2.05 el teléfono.
  Sin eso eran rectángulos redondeados cuyo alto decidía el contenido.

**Correcciones sobre la primera versión**

- La tableta tapaba la tabla de la computadora. Se recompuso para que el traslape
  sea de bordes, no de contenido.
- Las barras de la gráfica usaban `--suave` sobre `--superficie`, que en modo
  oscuro son casi el mismo color: desaparecían. Ahora se mezclan con el acento.
- Un ancho de barra se me fue como atributo en el HTML. Los anchos y alturas van
  como clase: un solo estilo en línea obligaría a abrirle la mano a la CSP con
  `unsafe-inline`, y esa concesión no se hace por dibujar dos barras.

**Lo que hay que saber**

- **Las pantallas muestran la interfaz que se va a construir, no una terminada.**
  La aplicación es la etapa 4. Este trabajo es también el diseño de esa etapa,
  adelantado.

---

## v0.4.0 — Portada con profundidad, y las puertas de entrada

**Qué se hizo**

- La portada se rehízo con desplazamiento por capas: el fondo se mueve a otra
  velocidad que el contenido, el ejemplo del corte de tarjeta queda clavado
  mientras el texto pasa a su lado, y los bloques aparecen al entrar en pantalla.
  **Todo con CSS, sin una línea de JavaScript** — la política de seguridad lleva
  `script-src 'self'` sin excepciones y cada script es una superficie más que
  vigilar.
- `Entrar` y `Crear cuenta` en el encabezado de todo el sitio, más las páginas
  `/entrar` y `/registro`.
- Correo de entrada: se habilitó Cloudflare Email Routing sobre el dominio.

**Un error que casi se publica**

El botón «Crear cuenta» salía en **gris sobre verde, ilegible**. La causa era
especificidad de CSS: `.menu a` vale (0,1,1) y `.boton--principal` vale (0,1,0),
así que el color del menú le ganaba al del botón sin importar el orden del
archivo. Se corrigió excluyendo los botones de la regla del menú —
`.menu a:not(.boton)` — en vez de subirle la especificidad al botón, que habría
tapado este caso y dejado la trampa para el siguiente. Medido después: contraste
9.04, cuando la norma AA pide 4.5.

**Lo que hay que saber**

- **Los formularios de `/entrar` y `/registro` están deshabilitados a propósito.**
  La sesión real llega en la etapa 3, sobre las tablas de la etapa 2. Un
  formulario que parece funcionar y se traga la contraseña de alguien sin hacer
  nada es peor que no tener formulario: enseña a la gente a escribir credenciales
  en pantallas que no las piden de verdad. Mientras tanto, ambas páginas dicen en
  la primera línea que el acceso todavía no abre.
- **Falta verificar la dirección de destino del correo.** Cloudflare envió un
  correo de confirmación; hasta que se haga clic en ese enlace, la regla de
  `hola@controlewallet.com` no se puede crear.

---

## v0.3.0 — El sitio público

*Etapa 7 de la fase 1, adelantada a pedido del dueño para tener algo visible en
`controlewallet.com` mientras se construye la aplicación por dentro.*

**Qué se hizo**

- Seis páginas: inicio, precios, preguntas frecuentes, contacto, términos y
  condiciones, y privacidad. Más el 404 y el marcador de `/app`.
- Sistema visual propio (`sitio.css`) que es también el primer borrador del
  lenguaje que hereda la aplicación en la etapa 4: tokens de color, escala
  tipográfica fluida, modo claro y oscuro, y los cuatro escalones de pantalla.
- Direcciones limpias, sin `.html`. Antes cada enlace interno provocaba una
  redirección de más.
- `robots.txt` y `sitemap.xml`. El sitio se indexa; `/app` no.
- Verificado a 360 px y a 2560 px: sin scroll horizontal, sin nada que se
  desborde y sin espacio muerto a los lados.

**Decisiones de contenido**

- **No se inventaron precios.** La página de precios dice la verdad — que todavía
  no se cobra — y se compromete a anunciar el precio antes de aplicarlo. Poner un
  número falso obliga después a cambiarlo o a inflarlo por si acaso.
- Los términos incluyen un aviso explícito de que **esto no es asesoría
  financiera**. La app da veredictos sobre proyectos, y esa distinción tiene que
  quedar por escrito.
- La política de privacidad **nombra a los cuatro proveedores** que tocan datos
  del usuario, incluido que las fotos de facturas se envían a Anthropic para ser
  leídas. Es información del hogar saliendo del país y quien la usa merece
  saberlo.

**Lo que hay que saber**

- **`hola@controlewallet.com` todavía no recibe correo.** El dominio está
  verificado para *enviar* (Resend), pero falta configurar el reenvío de entrada
  en Cloudflare Email Routing. Hasta entonces, los enlaces de contacto del sitio
  llevan a un buzón que no existe.
- Los documentos legales están escritos con cuidado pero **no los ha revisado un
  abogado**. Antes de que entre el primer usuario real conviene que alguien
  licenciado en Honduras los mire.

---

## v0.2.0 — El núcleo financiero, en módulos

*Etapa 1 de la fase 1.*

Sigue sin haber nada que un usuario vea. Lo que cambió es dónde vive el motor de
cálculo y quién puede usarlo.

**Qué se hizo**

- `asesor.js` (1,728 líneas) pasó a doce módulos en `nucleo/`, y `importar.js` a uno
  más. **No se reescribió ni una línea:** los cuerpos se extrajeron por número de
  línea con un guion, y lo único escrito a mano fueron los `import` y `export` de
  los bordes. Un verificador comprueba que las 1,667 líneas de código quedaron
  cubiertas, sin repetirse ni perderse.
- Las pruebas dejaron de vivir en una página que alguien tenía que acordarse de
  abrir: ahora corren con `node --test` en cada Pull Request. **180 en verde.**
- Se agregó una prueba que compara la API vieja contra la nueva nombre por nombre,
  y otra que verifica que ningún módulo del núcleo toca `window`, `document`,
  `localStorage` ni `fetch` — la condición para que el mismo código corra en el
  navegador, en el servidor y en las pruebas.

**Lo que hay que saber**

- De las 200 pruebas originales se portaron 175. Las otras 25 probaban la fusión
  entre teléfonos de `sync.js`. No es pérdida de cobertura: esa maquinaria
  desaparece con el servidor como única fuente de verdad, y probar algo que ya no
  existe sería teatro.
- El módulo `saldos.js` quedó grande (636 líneas) a propósito. Gastos, ciclo de
  tarjeta, cuentas, deuda y cierre se llaman en círculo entre sí; partirlos
  fingiría una separación que el dominio no tiene y dejaría cuatro archivos
  importándose mutuamente.

---

## v0.1.0 — Fundación

*Etapa 0 de la fase 1.*

No hay nada que un usuario pueda ver todavía. Lo que se montó es el piso sobre el
que se construye todo lo demás.

**Qué se hizo**

- Repositorio en GitHub como única fuente del proyecto, con `main` protegido y
  trabajo por ramas y Pull Request.
- La aplicación anterior queda copiada tal cual en `heredado/`, congelada, como
  referencia y como origen de la migración de datos. No se toca ni una coma.
- Publicación en Cloudflare Workers sobre `controlewallet.com`, con marcadores de
  posición para el sitio público y para la aplicación.
- Cabeceras de seguridad en `sitio/_headers`, ahora **sin** `unsafe-inline` en los
  estilos: la interfaz nueva se escribe sin estilos en línea desde el primer día.
- Pruebas automáticas en cada Pull Request.
- Dos ambientes separados con su propia base: `controle-pruebas` y
  `controle-produccion`.
- Procedimiento de vuelta atrás escrito y **ensayado sobre producción**, con el
  tiempo medido: se publicó una versión rota a propósito y volver a la buena tomó
  **4 segundos**. Ver [VUELTA-ATRAS.md](VUELTA-ATRAS.md), incluido lo que salió mal
  durante el ensayo.
- Los dos proyectos de Supabase enlazados, con `controle-pruebas` como destino por
  omisión para que nadie migre producción por descuido.

**Lo que hay que saber**

- El respaldo diario automático de la base exige el plan Pro de Supabase (~$25 al
  mes). Mientras la base siga en el plan gratuito, **no hay respaldo automático**.
- El plan gratuito de Supabase pausa un proyecto tras una semana sin uso.
