# Cambios

Qué trajo cada versión, en español y sin jerga. Lo más nuevo va arriba.

---

## v0.19.0 — Importar el estado de cuenta

**Qué se hizo**

- **Importar estados de cuenta del banco**: el PDF de BAC —que viene cifrado y
  hay que abrir a mano— y CSV de cualquier banco. Decenas de movimientos de un
  golpe, en vez de teclearlos.
- Se llega desde **Movimientos → «Importar del banco»**, que es justo donde uno
  piensa en ello, y desde el menú lateral en pantalla grande.

**Enseña antes de escribir**

Leer el archivo **no toca tus datos**. Se ve el lote entero antes de aprobarlo:
cuántos gastos, cuántos retiros, qué rubros nuevos se van a crear, y a qué rubro
va cada gasto —corregible ahí mismo, y lo corregido queda aprendido para la
próxima—. Un importador que escribe primero y enseña después no se puede revisar.

**Dice si el archivo cuadra consigo mismo**

El estado de cuenta trae su saldo inicial y su saldo final. Si sumar los
movimientos no da el final, es que algún renglón no se leyó bien, y se avisa
antes de aplicar. Esa comprobación no depende de lo que la app crea: solo del
archivo.

**Avisa qué va a reemplazar**

Cada importación reemplaza lo que se importó antes de esa cuenta en esas fechas
—es lo que impide duplicar cuando el archivo nuevo ya trae lo del anterior— y
**lo que escribiste a mano no se toca nunca**. Borrar sin decirlo, aunque sea
correcto, es de las cosas que hacen desconfiar de una app de dinero.

**Entra todo o no entra nada**

El borrado va antes que la inserción por necesidad. Partido en dos viajes, una
caída de red en medio dejaría el mes con menos gastos de los que hubo — y eso no
se ve: el mes parece que salió barato. Va dentro de una sola transacción en la
base, y hay una prueba que fuerza el fallo a mitad de camino y comprueba que no
se perdió ni una fila.

**El banco manda sobre el saldo.** Cada importación deja anotado el saldo que
declara el archivo con su fecha de corte. Es contra eso que cuadra el cierre del
mes, y antes había que teclearlo a mano.

**Dos defectos que salieron al medir**

Siete entradas en la barra del teléfono **se desbordaban 20 px**. Pero el número
no era el problema de fondo: importar no es un sitio al que se navega, es algo
que se hace una vez al mes. Salió de la barra y quedó donde se piensa en ello.

Y `'otros'` —lo que el motor devuelve cuando no supo clasificar un renglón— no
es un rubro. Mandarlo a la base habría reventado **la importación entera por un
solo renglón raro**. Ahora entra sin rubro, y el cierre lo lee como «Sin
clasificar».

**297 pruebas · 27 de aislamiento · 25 de integración.**

---

## v0.18.1 — El efectivo contado manda

**Qué cambia**

Al cerrar un mes, si alguien contó el dinero que hay en la mano, **esa cifra es
la que arrastra el mes siguiente**. Antes arrastraba la que la app deducía de lo
anotado.

**Por qué**

Contar es medir; sumar lo anotado es deducir — y lo que nadie anotó no existe
para la app. Cuando las dos no coinciden, arrancar el mes siguiente con la
deducción es empezar con una cifra que ya sabemos equivocada, y arrastrarla mes
tras mes. Es el mismo criterio con el que el saldo declarado por el banco ya
mandaba en las cuentas y en las tarjetas; el efectivo era el único que no lo
seguía, y solo porque no tiene banco que lo declare.

**La diferencia no se tapa.** Sigue bloqueando el cierre hasta que alguien la
explique, y queda guardada como ajuste con su nota. Que lo contado mande no
significa esconder por qué no cuadraba.

**Un hueco de tiempos que este cambio destapó**

Los saldos que se le siembran al mes siguiente los calcula el servidor **al abrir
la pantalla** — antes de que nadie escriba nada. Así que arreglar solo el núcleo
dejaba el caso más torcido posible: la cifra contada se guardaba en el mes que se
cierra —visible y correcta— y el mes siguiente arrancaba igual **con la deducción
vieja**. El cierre ahora usa lo que se acaba de teclear, con su prueba de
integración: se cierra con 1,450 en los saldos del servidor, se cuentan 990, y el
mes siguiente arranca con 990.

**294 pruebas · 20 de integración, en verde.**

---

## v0.18.0 — Dar el mes por bueno

*Abre la etapa 5.*

**Qué se hizo**

- **Cierre de mes**, la pantalla que convierte un mes en historia. Hasta ahora,
  el plan de un mes viejo era el plan de HOY: bajar el presupuesto de comida en
  septiembre hacía parecer que en agosto se habían pasado. Cerrar le saca la
  foto al plan que de verdad rigió, y esa foto ya no se mueve.
- **Las tres conciliaciones**, cada una con su ventana de fechas escrita: lo que
  la app calcula contra lo que declaró el banco —cuenta por cuenta, tarjeta por
  tarjeta— y contra lo que hay en la mano.
- **Reabrir**, que es del propietario del hogar y lo impone la base.

**Cerrar no es marcar una casilla**

Son dos candados. Un descuadre que se deja pasar no se queda quieto: el mes
siguiente arranca con él encima y ya nadie sabe de dónde salió. Y un exceso sin
explicar, dentro de tres meses, es indistinguible de un descuido.

Un descuadre se resuelve de dos maneras: que cuadre, o que alguien lo reconozca
y lo explique. Lo segundo también es información — lo que no vale es esconderlo.
Por eso un ajuste **sin nota no cuenta**.

**Una cadena de meses cerrados es un ancla que se renueva sola**

Cerrar siembra en el mes siguiente la foto de cómo terminó este: saldo final =
saldo inicial, sin huecos. Eso hace que la historia encadene, y hace algo que no
se ve: mientras nadie haya cerrado el mes previo, saber con qué saldos arrancó
un mes obliga a recorrer TODO lo anterior. Con la apertura sembrada, el arranque
es un dato guardado y no una deducción. Es el mismo mecanismo que las anclas del
banco, aplicado al tiempo en vez de al saldo.

**El orden de los dos escritos, que no es el que parece**

Se siembra la apertura del mes siguiente **primero** y se marca cerrado
**después**. Puesto al derecho, una caída de red en medio deja un mes cerrado
cuyo siguiente no tiene apertura, y entonces se deduce del histórico… que en el
navegador es un solo mes. Números creíbles y falsos, sin un solo error en
pantalla. Al revés, el peor caso es inofensivo: queda sembrada la apertura
correcta —que es la misma se cierre o no— y el mes sigue abierto.

Y antes de escribir se **lee** el mes siguiente. Si ya está cerrado, no se toca
nada: reescribirle la apertura le movería el suelo a una cuadratura que alguien
ya dio por buena.

**Un defecto que habría vaciado el presupuesto del mes entrante**

La columna `montos` es `not null default '{}'`, así que toda fila de
`presupuesto_mes` trae `{}` aunque nadie haya congelado nada — incluida la que
se crea solo para sembrar la apertura. El núcleo leía cualquier `{}` como foto
del plan, y ese mes habría salido con **todos sus rubros en cero**: presupuesto
de comida cero, de servicios cero, y la app diciendo que se pasaron en todo. En
la app anterior no podía ocurrir porque ahí la propiedad simplemente no existía;
apareció al normalizar el esquema. Una foto vacía no es una foto.

**El cálculo va en el servidor, y la segunda razón no es la obvia**

La conocida: el arranque del mes recorre toda la vida del hogar. La otra: el
ciclo de una tarjeta va **de corte a corte**, así que agarra días del mes
pasado, y el navegador solo baja el mes en curso — la conciliación de la tarjeta
se quedaría sin los pagos de esa cola. Las dos inventan un descuadre, y un
descuadre inventado **bloquea un cierre que sí cuadraba**. `datos/cierre.js` ni
siquiera recibe el documento del hogar: así no puede calcular con historia
incompleta ni por accidente.

**Dos defectos que aparecieron midiendo, no mirando**

A 1440 la pantalla salía en **una sola columna**: los párrafos llegaban a **1,302
px** —más del doble de lo que un ojo sigue sin perder el renglón— y un campo de
texto ocupaba **1,296 px**. Ahora usa las dos zonas del resto de la app: el
trabajo a la izquierda, el resultado y el botón a la derecha. Medido después:
párrafo **728 px**, campo **544 px**.

Y un rubro donde se gastó de menos decía **«L -300.00»** en verde. El signo menos
se lee un instante como que faltan 300, cuando significa lo contrario. Ahora va
la palabra: **«L 300.00 de menos»**.

**Un mensaje que mandaba a buscar un dato que no existe**

Al efectivo sin contar le decía «Falta decir cuánto dice **el banco** que hay en
Efectivo en mano». El efectivo es la única de las tres conciliaciones que **no
tiene banco** que la declare — por eso se cuenta a mano. Venía así de la app
anterior. Ahora dice «Falta contar cuánto hay en efectivo», con su prueba.

**Comprobado contra la base, corriendo el código de producción**

Las seis pruebas nuevas de integración no imitan lo que hace la app: importan
`datos/cierre.js` y lo ejecutan contra la base de pruebas con la sesión de un
usuario de verdad. Una copia del código no prueba el código.

Cerrar septiembre escribe **las dos filas** —el mes con su plan congelado, sus
ajustes y su efectivo contado; octubre con la apertura— y esa apertura vuelve del
armador marcada como **declarada, no deducida**, que es lo que evita que el mes
siguiente se ponga a recorrer el histórico. Guardar a medias no marca cerrado ni
inventa una fecha. Con el mes siguiente ya cerrado, el cierre se rechaza y **no
deja nada a medias**. Reabrir devuelve el mes a editable sin borrar la apertura
que ya se sembró.

Y una que valía por sí sola: **sembrar la apertura no le borra al mes siguiente
su foto del plan.** Diciembre tenía sus montos, se cerró noviembre encima, y los
montos siguen ahí — el upsert solo toca las columnas que viajan.

**Medido:** 58 elementos en oscuro con mínimo **7.42**, 58 en claro con mínimo
**6.52**, ninguno bajo AA. Sin desbordes a 360 ni 1440, en los tres estados de la
pantalla: cuadrado, con excesos sin justificar, y descuadrado con las
conciliaciones sin declarar.

**290 pruebas · 24 de aislamiento · 18 de integración, todas en verde.** El hogar
de pruebas quedó exactamente como estaba.

---

## v0.17.0 — El capital, y qué conviene hacer primero

*Cierra la etapa 4.*

**Qué se hizo**

- **El capital**, en el Resumen: lo que tienen menos lo que deben, con la
  composición completa — banco, efectivo en mano, lo autorizado en tarjeta que
  todavía no sale en el corte, lo que se paga este mes sin intereses, lo que
  revuelve y sí los genera, y los financiamientos.
- **El saldo de cada cuenta**, que hasta ahora no se enseñaba en ninguna parte.
- **El diagnóstico**: el colchón de emergencia contra los tres meses que
  recomienda cualquier manual, lo que cuesta la deuda al mes y al año, y **los
  pasos en orden**.

**El orden ES el consejo**

Un asesor no da consejos sueltos: dice qué va primero. Apartar para un proyecto
mientras se revuelve una tarjeta al 50% anual es perder dinero todos los meses, por
disciplinado que se sienta. Por eso los pasos van numerados y con el color de su
urgencia, no como una lista de sugerencias.

**El capital es la cifra que no se puede maquillar.** El disponible del mes sube y
baja; el saldo de una cuenta puede verse bien con la tarjeta reventada. Esto junta
las dos caras y dice si el hogar avanza o retrocede.

**Sin bloquear la pantalla**

Los tres bloques vienen de la Edge Function, que recorre toda la vida del hogar. El
Resumen dibuja el mes de inmediato —que ya es cierto con lo que hay— y agrega el
resto cuando la respuesta llega. Si el viaje falla, se queda el mes, que nunca fue
mentira.

**Un defecto que escondía media pantalla**

`hidden` no estaba escondiendo nada. La regla del navegador —`[hidden] { display:
none }`— vale (0,1,0) de especificidad, **lo mismo** que `.boton { display:
inline-flex }` o `.mes-nav { display: flex }`, y entre una regla del autor y una
del navegador, con igual especificidad, **gana el autor**.

Se veía: el botón «Volver a hoy» seguía en pantalla estando en el mes actual, y el
selector de mes no se escondía durante el asistente. Es la misma familia del
`@media` que acota pero no sube la prioridad, y del botón gris sobre verde. Ahora
hay una sola regla, con `!important` y a propósito: `hidden` significa «esto no
está», y ninguna clase debería poder discutirlo.

**Una prueba de contrato**

Tres vistas leen campos de la respuesta del servidor. Si alguien renombra uno,
nada se rompe de forma visible: el campo llega `undefined`, la vista hace su
`if (!pat) return ''` y el bloque **simplemente no aparece**. Ahora el contrato se
lee del código de la función y se compara contra lo que cada pantalla consume.
Encontró un error en sí misma la primera vez que corrió: `periodo` va como
propiedad abreviada, sin dos puntos, y el lector no la veía.

Medido: 24 elementos en oscuro con mínimo **7.42**, 22 en claro con mínimo
**6.52**, ninguno bajo AA. Sin desbordes a 360 ni 1440. **282 pruebas en verde.**

---

## v0.16.0 — Confirmar lo que de verdad entró

*Cierra la etapa 4.*

**Qué se hizo**

- **Confirmar ingresos, mes a mes.** La plantilla es una estimación; ahora se
  puede anotar lo que realmente entró, con el ISR y las retenciones que tocaron
  ese mes. Cada pago dice de dónde sale su cifra: **confirmado**, **estimado** o
  **sin revisar**.
- El panel «Lo que entra» pasa a hablar del **mes que se está mirando** en vez de
  solo del plan. El total dejó de ser «neto típico» para ser el **ingreso neto del
  mes**, que es la cifra que el resto de la app usa.
- **El formulario viene relleno con lo último confirmado**, no con la plantilla:
  el sueldo del mes pasado se parece mucho más al de este que la cifra que alguien
  tecleó una vez al armar el hogar. Rellenar no es confirmar — quien confirma
  sigue siendo la persona.
- **El atajo para el mes que vino igual:** confirmar de un tirón los pagos que
  faltan con lo del último mes confirmado.
- Opcional al confirmar: **guardar también como monto típico**, para que las
  estimaciones de los meses que vienen dejen de usar la cifra del asistente. Es
  opcional a propósito: un mes con un bono raro no debe reescribir el plan.
- **Volver a estimado**, que borra lo confirmado de ese mes y devuelve el monto
  típico.

**«Confirmado» quiere decir que alguien lo miró**

El atajo ahorra trabajo real, pero deja filas que cuentan como confirmadas sin que
nadie las haya visto. Decir «confirmado» de eso sería inventarse un hecho. Así que
la copia se marca: la fila dice **«sin revisar»** y el formulario avisa de qué mes
salió. La marca se va sola cuando alguien abre el pago y lo guarda, porque abrirlo
y guardarlo **es** revisarlo.

Esa distinción venía de la app anterior y el núcleo ya la esperaba —tiene su prueba
portada— pero al normalizar el esquema la columna se quedó sin migrar: el armador
no tenía de dónde leerla. Ahora `ingresos_mes.copiado_de` existe, con su reverso.

**Un límite que apareció al probarlo**

El atajo no aparecía nunca, y el formulario se rellenaba con la plantilla en vez de
con lo último confirmado. La causa: `ingresos_mes` se bajaba **solo del mes en
curso**, así que buscar «el último mes confirmado» no encontraba nada.

El corte entre lo que se baja entero y lo que se baja por mes no es «configuración
contra hechos»: es **qué crece sin techo y qué no**. Los movimientos de tres años
son miles de filas; los ingresos confirmados son un puñado por mes —uno por persona
y pago— y en tres años no pasan de un par de cientos. Se bajan enteros.

**Comprobado contra la base de pruebas**

Confirmar agosto con 24,800 de bruto y 2,810 de ISR: la fila llega con el monto
como **número**, `copiado_de` en nulo, el sello pasa a «confirmado» y el neto del
mes sube a 21,494.35. La plantilla **no se toca** si no se marca la casilla.
Confirmar julio, volver a agosto y usar el atajo: la fila queda con
`copiado_de: 2026-07` y el sello dice «sin revisar»; abrirla y guardarla la deja en
nulo y «confirmado». «Volver a estimado» borra las filas y el panel vuelve al monto
típico. El hogar de pruebas quedó igual que antes de empezar.

**277 pruebas en verde.**

---

## v0.15.0 — Mirar otro mes

*Cierra un hueco que la app arrastraba desde el principio.*

**Qué se hizo**

- **El selector de mes**, en la cabecera y en todas las pantallas. Hasta ahora la
  app solo sabía enseñar el mes en curso: no había forma de mirar julio, ni de
  revisar en qué se fue diciembre.
- **El mes viaja con uno al cambiar de vista.** Mirar julio en Movimientos y que
  Resumen salte a agosto sería perder el hilo a mitad de una pregunta.
- **El mes va en la dirección** (`#/movimientos/2026-07`): el enlace se puede
  compartir, el botón de atrás del navegador hace lo que uno espera, y al recargar
  se queda donde estaba. Sin mes en la dirección se entiende «el mes en curso»,
  que es lo que la app contestaba antes y sigue contestando.

**Los topes, y por qué**

- **Hacia adelante, el mes en curso y pará.** Después de él no ha pasado nada: el
  plan estaría entero y el gasto en cero, así que cualquier pantalla diría que van
  holgadísimos. Es una respuesta creíble a una pregunta que nadie hizo.
- **Hacia atrás, lo más viejo entre el saldo declarado más antiguo y un año.** Se
  toman los dos porque cada uno solo falla: solo lo declarado esconde datos —
  `desdeMes` dice desde cuándo vale un saldo, no cuándo empezó el hogar, y alguien
  puede declarar su cuenta desde agosto con movimientos de julio anotados—, y solo
  un año se queda corto para quien ya trajo su historia. Un año, y no otro número,
  porque es hasta donde llega Historia: todo mes que esa pantalla lista tiene que
  poder abrirse.
- **Las flechas se apagan en los extremos** en vez de no hacer nada. Una flecha
  encendida que no responde se siente rota.

**La trampa que este trabajo tenía adentro**

El período de un movimiento sale de su **fecha**, no de la pantalla. Con la fecha
de hoy por omisión, un gasto anotado mientras se mira julio se guardaría en agosto
y **desaparecería al guardarlo**: anotado bien, en un mes que no se está mirando, y
nadie lo encuentra después. Ahora el formulario se abre con hoy si hoy cae dentro
del mes que se mira, y con el último día de ese mes si no. Respeta el día de
arranque del hogar: con arranque el 7, «julio» termina el 6 de agosto.

**Que se vea que no es hoy**

Mirando otro mes, el rótulo cambia de color y aparece **«Volver a hoy»**. Cada
cifra de cada pantalla cambia de significado con el mes: leer el disponible de
julio creyendo que es el de agosto es el error más caro que este control puede
provocar.

**Lo que hay que saber**

Un mes pasado **sin plan congelado** se calcula con el plan de hoy, rotulado como
estimado. Es lo que el núcleo hace por diseño mientras ese mes no tenga su foto
(`presupuesto_mes`), y se resuelve solo cuando llegue el cierre de mes de la etapa
5. Hasta entonces, un mes viejo sin cerrar muestra el presupuesto actual como
estimación, no como hecho.

Medido: contraste del rótulo **5.48** en claro y **7.77** en oscuro, botones de
44 px, sin desbordes a 360 ni 1440. **274 pruebas en verde**, once de ellas sobre
la aritmética de meses — diciembre a enero, el mes anterior al primero, el tope
pasado por uno.

---

## v0.14.0 — Historia: cómo van los meses

*Sigue la etapa 4.*

**Qué se hizo**

- **La pantalla de Historia.** El Resumen dice cómo va el mes; esta dice cómo van
  los meses. Cuánto queda al mes en promedio, la gráfica de ingreso contra gasto
  mes a mes, el mejor mes y el más apretado, y la lista completa con lo que quedó
  y qué porcentaje del ingreso representa.
- Se apoya en la Edge Function que entró en v0.13.0: el cálculo ya venía hecho,
  faltaba la pantalla.
- La gráfica está **dibujada en HTML y CSS**, no en SVG ni con una librería. Sigue
  el modo claro u oscuro, se lee con cualquier tamaño de letra y no pesa nada.

**Tres cosas que dice y no se calla**

- **El mes en curso queda fuera del promedio y de los récords**, y se marca
  apagado en la gráfica. Lleva unos días de gasto contra meses enteros: compararlo
  sería darse una palmada en la espalda por no haber terminado el mes.
- **Un mes sin ingreso confirmado usa el monto típico**, y la pantalla lo advierte:
  el gasto es real, el ingreso contra el que se resta no.
- **Solo aparecen los meses con algo registrado.** Lo que no se anotó no se
  inventa.

**Por qué esta pantalla sí espera al servidor**

Proyectos pinta de inmediato y sube el veredicto cuando llega la respuesta, porque
lo que dibuja de entrada ya es cierto. Aquí no hay equivalente: la historia **es**
el histórico. Un «promedio» calculado con un mes sería inventado, y se leería como
un hecho. Así que se espera, se dice que se está esperando, y si falla se ofrece
reintentar.

**Un error que se tragaba lo importante**

La Edge Function se niega a calcular con historia incompleta y dice por qué —
«faltaron 412 filas de movimientos»—, pero la pantalla mostraba **«Falló el
servidor. Intentá de nuevo»**: el mensaje genérico del código 500 le ganaba al
motivo real. Es la misma familia del error de entrada que decía «los datos
enviados no son válidos» a quien tenía el correo sin confirmar.

Ahora las funciones marcan sus errores con `propio`, y esos pasan tal cual. La
marca es explícita en vez de una lista de patrones: una lista hay que mantenerla
al día, y se queda vieja el día que alguien agrega un mensaje.

**Dos arreglos encontrados midiendo**

- En teléfono, la columna de cada mes mide **18 px** y la cifra que iba encima
  mide **71**: se pisaban entre sí y se salían del panel. Ahora la cifra aparece
  solo cuando la columna le da, y la lista de abajo las lleva todas. Es el
  principio de los escalones al revés: en la pantalla chica se muestra **menos**,
  no lo mismo apretado.
- Las marcas de mes también se tocaban. Se muestra una de cada dos, contadas
  **desde el final**, para que la del mes en curso nunca sea la que se esconde.

Medido en los dos modos componiendo capas: 91 elementos, mínimo **5.7** en claro y
**7.42** en oscuro. Las dos series de la gráfica se distinguen entre sí con 3.55 y
4.17, por encima del 3:1 que pide la norma para un gráfico. Sin desbordes a 360,
768, 1440 ni 2000 px. **263 pruebas en verde.**

---

## v0.13.0 — El histórico, calculado donde sí cabe

*Cierra el hueco que dejó Proyectos.*

**Qué se hizo**

- **Una Edge Function (`historico`) que corre el mismo núcleo sobre toda la vida
  del hogar.** No es una segunda implementación en SQL: son los mismos trece
  módulos que corren en el navegador y en las pruebas, importados tal cual. Si
  hubiera dos aritméticas, tarde o temprano darían dos respuestas y no habría
  forma de saber cuál creer.
- Devuelve lo que el navegador no puede calcular: patrimonio, salud financiera,
  historia mes a mes, saldos de cuentas, efectivo, deuda de tarjetas y el
  veredicto de cada proyecto.
- **Proyectos ya no necesita las anclas.** Pinta de inmediato todo lo que es
  cierto con lo que hay —avance, cuota, plazo— y sube al veredicto cuando el
  servidor contesta. Nunca se queda esperando, y si el viaje falla se queda lo
  que había, que nunca fue mentira.

**La trampa que este trabajo existía para no repetir**

PostgREST puede cortar una respuesta larga sin avisar: devuelve las primeras mil
filas de tres mil con un `Content-Range` que nadie mira. Calcular un saldo con un
tercio de la historia da un número creíble y falso — la misma familia del
`numeric` que llega como texto. Así que se pide el **conteo exacto**, se pagina
hasta tenerlo todo, y si al final no cuadra **se levanta la mano en vez de
calcular**. Diez pruebas cubren ese camino, incluido el múltiplo exacto del
tamaño de página, que es donde un `<` mal puesto se come la última.

**Seguridad**

La función **no lleva ningún secreto**. Va con el token de quien pregunta, no con
la clave de servicio, y no filtra por hogar en ninguna línea: de eso siguen
encargándose las políticas RLS. Comprobado contra el proyecto de pruebas: sin
sesión devuelve 401, y con la clave publicable sola contesta 404 sin filtrar nada.

**Comprobado de punta a punta**

Desplegada a pruebas y llamada con una sesión real: 710 ms, y trajo exactamente
el hogar de quien preguntó. Un proyecto creado desde la interfaz salió primero
como «El dinero alcanza» y pasó a **«Reconsideralo»** al llegar la respuesta —con
la tarjeta sin ancla, que es justo lo que antes lo impedía—, explicando por qué:
«es un gusto y no hay ni un mes de colchón». El hogar de pruebas quedó igual que
antes de empezar.

---

## v0.12.0 — Proyectos, y el veredicto que no se inventa

*Sigue la etapa 4.*

**Qué se hizo**

- **La pantalla de Proyectos.** Metas con su rango de costo, aportes, avance, y las
  dos capas que el núcleo distingue: si el dinero **alcanza** y si además
  **conviene** hacerlo ahora. Ordenadas por mérito —salud y seguridad antes que
  cualquier gusto— con el disponible repartido en ese orden.
- Cada meta dice su plazo con la cuota sugerida, lo que costaría llegar a la fecha
  objetivo si la hay, y qué porcentaje del disponible compromete.
- El **porqué** del orden va escrito: «abonar a BAC rinde 58% garantizado
  (L 1,421.52 al mes)» pesa más que cualquier etiqueta.

**El hallazgo que definió la pantalla**

El veredicto sale de `saludFinanciera`, que recorre **todo el histórico** — y en el
navegador solo vive el mes en curso. Medido con el mismo hogar y el mismo
proyecto: sale **«Programado»** con doce meses cargados y **«Reconsideralo»** con
uno solo, inventándose la razón («no hay ni un mes de colchón»). No es un
redondeo: son 600 puntos de castigo por un colchón que sí existe.

La salida es el **ancla de conciliación**. Cuando una cuenta o una tarjeta declara
el saldo que dijo el banco, el núcleo parte de esa cifra —que es un hecho, no una
deducción— y solo le suma lo posterior a esa fecha. Medido también: **con el ancla
dentro del mes cargado, un mes da exactamente el mismo resultado que doce.**

Así que el veredicto aparece cuando las anclas están al día, y cuando no, la
pantalla dice **qué falta y dónde ponerlo** en vez de dar un juicio al revés. Lo
que no depende del histórico —avance, cuota, plazo y si el dinero alcanza— se
muestra siempre, porque siempre es cierto.

Esa regla vive en `datos/alcance.js`, aparte de la pantalla, porque Historia y
Patrimonio van a necesitar la misma.

**Un error de contraste, encontrado midiendo**

El sello **«Hazlo ya»** —el veredicto más importante de la pantalla— salía en
blanco sobre el color de alerta: **1.98 de contraste**, cuando la norma AA pide
4.5. Era el menos legible de todos. Ahora usa el par del botón principal y mide
**9.04**. Y va relleno mientras «Programado» va en tinte: los dos dicen que sí, y
lo que los separa es la prisa, no el sentido.

Medido en los dos modos con la composición real de capas: 61 elementos, mínimo
**5.7** en claro y **6.24** en oscuro. Sin desbordes a 360, 768, 1440 y 2400 px.

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
