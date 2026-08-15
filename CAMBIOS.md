# Cambios

Qué trajo cada versión, en español y sin jerga. Lo más nuevo va arriba.

---

## v0.25.1 — Tu propio respaldo ya no se cuela por la pantalla de la app vieja

**Qué pasaba**

La pantalla de traer el hogar tiene un portero que revisa el archivo antes de
escribir nada. Solo miraba dos cosas: que trajera **personas** y **gastos**.

El respaldo que exporta esta misma app —el de «Llevarte todo»— trae las dos,
porque son dos de sus veinte tablas. Así que el archivo propio **pasaba el
portero**, se traía como si fuera del formato viejo, y ensuciaba el hogar sin dar
un solo error. Y como traer *agrega* en vez de reemplazar, eso no se deshace
solo.

**Por qué era peor de lo que parece**

No es un caso raro: es **el único que quedaba**. Quien no viene de la app
anterior solo abre esa pantalla por una razón —querer restaurar su respaldo— así
que el camino más probable hasta ese botón terminaba justo en el fallo callado.

**Por qué no se distingue por la versión**

Parecería lo obvio, y está mal: **el respaldo viejo también trae versión**, va por
la 6. Mirarla habría dejado fuera todos los respaldos legítimos — cambiar un
fallo callado por otro.

Se distingue por el sello de fecha que solo pone esta app. La anterior guarda sus
datos tal cual, sin envoltorio.

**341 pruebas en verde**, cinco nuevas — y comprobado que fallan si se les quita
el arreglo.

> **Ojo:** el respaldo de «Llevarte todo» **todavía no se puede restaurar**. Esto
> solo impide que se estropee algo al intentarlo por la puerta equivocada. Que se
> pueda volver a meter es una función que aún no existe.

---

## v0.25.0 — Traer el hogar de la app anterior

*Cierra la fase 1.*

**Qué se hizo**

Desde «Tu cuenta» se sube lo exportado de la app vieja y el hogar entero pasa a
Controle Wallet: rubros, movimientos, cuentas, tarjetas, proyectos y los meses ya
cerrados.

**La prueba que decide si esto sirve**

No es que las filas entren. Es que **los mismos números salgan por los dos
caminos** — el motor viejo sobre los datos viejos, y el motor nuevo sobre lo que
quedó guardado.

Se comparan diez cifras: ingreso neto, gastos del plan, disponible real, saldo de
la cuenta, deuda de la tarjeta, efectivo, cargado en el ciclo, gasto por
categoría, cuotas y patrimonio. **Si una sola no cuadra, la migración no pasa.**

Una migración que pierde el 3% de los movimientos se ve igual de bien que una
perfecta. Solo la comparación las distingue. Y se comprobó que la comparación
puede fallar: quitándole un movimiento a propósito, dice «cargado en el ciclo:
antes 3591.25, ahora 1180.5».

**Tres decisiones que se ven en el resultado**

- **Los meses cerrados entran de último.** En cuanto uno entra marcado como
  cerrado, la base deja de aceptar movimientos de ese mes — escribirlos antes
  haría que la migración rechazara sus propios datos.
- **Lo migrado queda como tecleado a mano**, no como importado del banco. Si
  entrara como importado, la siguiente importación de un estado de cuenta lo
  borraría por caer en su rango de fechas.
- **Agrega, no reemplaza.** Vaciar primero es una decisión que no se puede
  deshacer, y la toma el dueño desde su panel, no una importación. La pantalla lo
  advierte.

**336 pruebas · 35 de aislamiento · 32 de integración**, en verde.

---

## v0.24.0 — El informe del mes, para imprimir o llevárselo

**Qué se hizo**

Una pantalla nueva, la única que no sirve para operar la app: sirve para **sacar
lo que la app sabe y llevárselo**. A una reunión con la pareja, a un asesor, a un
banco que pide ver cómo se administra la casa. Se imprime o se guarda como PDF.

**No calcula nada por su cuenta**

Cada cifra sale del mismo motor que dibuja el resto de la app. Si un número
apareciera aquí distinto al de la pantalla, sería un error.

Por eso lo que recorre todo el histórico se le **pide al servidor** en vez de
estimarlo, y la pantalla **espera** a tenerlo todo antes de dibujar. Dibujar a
medias y completar después dejaría salir por la impresora una versión incompleta
que después nadie distingue de la buena.

**Nueve nombres equivocados, y ninguno daba error**

Escribiendo esta pantalla me equivoqué en nueve campos de una sentada
—`patrimonio.patrimonio` por `.neto`, `salud.meses` por `.mesesColchon`, y siete
más—. Ninguno rompe nada visible: llega un valor vacío, se imprime **L 0.00**, y
queda en un documento que alguien enseña.

La comprobación que ya existía no los veía porque solo miraba los nombres de
primer nivel. La nueva corre el motor de verdad, lee el código del informe, y
exige que cada campo que usa exista en el resultado. **Comprobado que puede
fallar**: con un campo inventado, la prueba lo nombra.

**Lo impreso es lo que se ve.** Sin un segundo juego de estilos para el PDF —
sería uno que nadie mira hasta que se rompe. Al imprimir se quitan la navegación
y el botón, se fuerza fondo claro, y ningún panel ni título se parte entre dos
hojas.

**336 pruebas · 35 de aislamiento · 28 de integración**, en verde.

---

## v0.23.0 — El hogar es de dos: invitaciones

**Qué se hizo**

Se invita a alguien al hogar por correo. Quien entra ve **las mismas cifras**, no
una copia: si tu pareja anota un gasto, aparece en tu pantalla.

**Por qué esta parte no se apoya en la base como todo lo demás**

En toda la app es la base la que decide quién ve qué, y esa es la regla del
proyecto. Aquí no se puede: **quien acepta una invitación todavía no es
miembro**, así que ninguna política puede autorizarlo — es justo el momento
anterior a serlo.

Entonces lo que autoriza es el **enlace**, y sus cuatro condiciones se escriben a
la vista en vez de esconderse en una regla que no podría existir:

1. **El enlace existe** — 32 bytes al azar, comparados exactos.
2. **Sigue pendiente** — usarlo dos veces no vuelve a meter a nadie.
3. **No está vencido** — siete días. Un enlace de hace ocho meses en un correo
   reenviado no abre la puerta de nadie.
4. **El correo coincide** — la que de verdad cierra el caso. Sin ella, cualquiera
   que consiga el enlace entra al hogar.

*Invitar* sí lo controla la base: crear la invitación exige ser el dueño del
hogar.

**Detalles que salen de usarlo, no de diseñarlo**

- **Se puede copiar el enlace.** El correo se pierde o cae en spam, y sin esa
  salida una invitación perdida no tiene arreglo.
- **Si el correo ya tiene cuenta**, eso no es un error: es el caso más común al
  invitar a quien ya usa la app.
- **Quien llega invitado entra al hogar antes de cargar nada.** Si no, caería en
  el asistente de arranque a armar un hogar que no necesita.

**325 pruebas · 35 de aislamiento · 28 de integración**, en verde.

---

## v0.22.0 — Tu cuenta: llevarte todo, o borrarlo todo

**Por qué se hizo ahora**

La política de privacidad publicada dice, textualmente, que la exportación y el
borrado están disponibles «directamente en tu panel, sin tener que pedirlos». Ese
panel no existía. **Una política que promete lo que la aplicación no puede hacer
no es una política: es una deuda.**

**Qué trae**

- **Llevarte todo**: un archivo con todo el hogar tal como está guardado. No un
  resumen — los datos.
- **Borrar la cuenta de verdad**: pide escribir el correo propio, y se comprueba
  también en el servidor. Si hay alguien más en el hogar, el hogar sigue.
- «Tu cuenta» se alcanza **aunque el hogar esté a medias**: mandar al asistente a
  quien viene a borrarse lo dejaría atrapado.

**El defecto que esto destapó, y que afectaba a todos**

**Nadie que hubiera cerrado un mes podía borrar su cuenta. Nunca.**

Dos reglas del proyecto chocando sin que se notara: un mes cerrado es intocable,
y cada fila guarda quién la tocó. Así que borrar a un usuario no solo *borra*
filas — además **modifica** cada fila que esa persona escribió alguna vez, para
quitar su nombre. Y esa modificación chocaba con el candado del mes cerrado,
abortando el borrado entero.

Costó encontrarlo porque probándolo por la vía de administración el campo queda
vacío y la modificación nunca ocurre. Solo aparece cuando los datos se
escribieron desde una sesión de verdad — o sea, siempre, en la vida real.

**Cuál de las dos reglas gana: la privacidad.** Que un mes cerrado sea intocable
existe para que nadie le reescriba a alguien un mes ya cuadrado. Cuando esa misma
persona decide borrarlo todo, no queda nada que proteger. **Y el candado sigue
entero**: la modificación solo pasa si no cambia nada más. Intentar colar un
cambio de monto o de fecha aprovechando eso lo bloquea igual.

**325 pruebas · 31 de aislamiento · 28 de integración**, en verde.

---

## v0.21.0 — Que no quede nada duplicado, ni del archivo ni a mano

**El requisito, en una línea:** lo que diga la app del banco tiene que coincidir
con lo que diga Controle Wallet.

**El hueco que faltaba cerrar**

Reimportar el mismo archivo ya no duplicaba nada. Faltaba **el otro lado** — lo
que alguien tecleó a mano y después viene en el estado de cuenta. Eso no lo
tocaba ninguna importación, y era a propósito: lo escrito a mano es sagrado. Pero
entonces el mismo gasto quedaba **dos veces**, y el saldo dejaba de coincidir con
el del banco.

**Cómo se detecta**

Por **fecha y monto**, no por concepto: el banco recorta y reescribe las
descripciones, pero la fecha y el monto no mienten. Cada movimiento del archivo
empareja con **uno solo** — dos cargas de combustible de L 400 el mismo día son
dos gastos reales, y marcar las dos borraría uno de verdad.

**Se enseña antes, y quitarlos es una decisión.** La pantalla los lista con el
nombre que les puso el dueño y el que les da el banco. **Sin marcar la casilla no
se borra nada**: quitarlos no puede ser un efecto secundario de importar.

**Y va todo junto.** Borrar en un viaje e insertar en otro dejaría, si el segundo
no llega, el mes **sin** ese movimiento: ni el tecleado ni el importado. Un
duplicado se ve; un hueco no.

**324 pruebas · 27 de aislamiento · 28 de integración**, en verde.

---

## v0.20.2 — Un Excel se puede elegir, y se dice por qué no se lee

Salió probando con **seis archivos reales**.

**El selector bloqueaba los Excel sin explicar nada**

Los `.xls` y `.xlsx` quedaban grises y no se podían ni elegir. Eso no informa:
parece que la app está rota. Se comprobó qué son esos archivos —un Excel binario
de verdad, no una tabla de texto disfrazada— así que leerlos pediría un
intérprete que la app no puede cargar sin debilitar su seguridad.

Ahora se pueden elegir, y el mensaje dice **qué hacer**: descargar el CSV o el
PDF de esos mismos movimientos, que los dos se leen.

**El mensaje de un PDF ilegible decía qué no, no qué sí**

Tres de los seis archivos resultaron ser impresiones en PDF de la propia pantalla
de importar, no estados de cuenta. Rechazarlos es correcto; no decir por qué, no.
El mensaje ahora dice qué hace falta: que cada renglón traiga fecha, concepto y
**el saldo que queda después** — que es de donde sale el monto sin adivinar.

**Medido contra los archivos reales**

| Archivo | Resultado |
|---|---|
| CSV de Ficohsa | **15 movimientos, cuadra exacto** |
| PDF del mes de Ficohsa | **5 movimientos, cuadra exacto** |
| PDF de tarjeta BAC | **12 movimientos**, sin cuadre — y lo avisa |

**324 pruebas en verde.**

---

## v0.20.1 — El PDF del mes en curso, de cualquier banco

**Por qué esto importa más de lo que parecía**

Los bancos dan CSV de los meses **cerrados**, pero del mes **en curso** —el único
que sirve para controlar el gasto mientras pasa— solo dan una impresión en PDF.
Así que el PDF no era el camino secundario: era el principal, y para importar
semana a semana es el único.

**Cómo se lee un banco que nadie programó**

No se leen las columnas: **se lee el saldo que arrastra cada renglón.**

    monto = saldo de este renglón − saldo del anterior

Eso es exacto y el signo viene solo. Y funciona igual para una cuenta —donde un
cargo baja el saldo— que para una tarjeta —donde sube lo que se debe—, porque en
los dos casos se lee el número del banco en sus propios términos.

**Se comprueba solo, renglón por renglón.** Esa diferencia tiene que coincidir
con alguno de los otros números del mismo renglón: es el banco diciendo lo mismo
dos veces. Si más de uno de cada diez no cuadra, **el archivo se rechaza entero**.
Entregar «casi bien» con dinero es entregar mal.

**Lo que no se inventa**

- Si el archivo no dice con qué saldo arrancaba, el **primer movimiento queda
  fuera** y se avisa: su signo es genuinamente desconocido.
- Si no está claro si el documento es de una cuenta o de una tarjeta, **se
  pregunta**. No es lo mismo, y suponerlo cambiaría el signo de todo.
- Solo cuentan las cifras con **centavos**. Sin eso, «Fecha de corte 06/08/2026»
  entraba como movimiento y el 2026 se leía como saldo.

**322 pruebas en verde**, siete nuevas — incluida la que rechaza un archivo cuyos
saldos no cuadran con sus montos.

---

## v0.20.0 — El CSV de cualquier banco, y registrar sin salir

**Qué se hizo**

- **El CSV o Excel de cualquier banco se lee.** Ya no hace falta que alguien
  programe un lector por entidad.
- **Registrar la cuenta o la tarjeta desde la pantalla de importar**, sin ir a
  Presupuesto y volver perdiendo el archivo que ya se leyó.

**Lo que faltaba no era un lector por banco: eran dos suposiciones**

La coma como separador y el punto como decimal. En Honduras casi ningún banco
exporta así — donde el decimal lleva coma, el separador es punto y coma, y de
Excel sale con tabulador. Con la suposición vieja el archivo entero caía en una
sola columna, no se encontraba el encabezado, y el banco parecía ilegible cuando
el único problema era un punto y coma.

Ahora se detectan los dos. Y **«1.250,75» y «1,250.75» son el mismo dinero**:
quitar las comas a ciegas convertía el primero en 1250075 —mil veces más— sin
dar ningún error.

**Por qué NO se lee cualquier PDF, y está medido**

Se probó un lector genérico de PDF y se descartó. El texto de un PDF **pierde la
estructura de columnas**: cuando una celda va vacía desaparece y las de la
derecha se corren. El lector leyó el saldo como si fuera el crédito —L 8,749.25
donde iban −1,250.75— sin dar ningún error.

Un número creíble y falso es peor que no leer el archivo. Así que un PDF
desconocido se rechaza diciendo qué hacer: descargar el mismo movimiento en CSV
o Excel, que sí conserva las columnas vacías. Por PDF siguen BAC y Ficohsa, que
tienen lector propio.

**Registrar sin perder el archivo**

Si el estado de cuenta es de una cuenta o tarjeta que todavía no existe, se
registra ahí mismo: el archivo ya trae el número y, en una tarjeta, la fecha de
corte. Entra con saldo en cero; lo demás se completa después en Presupuesto y no
hace falta para importar.

**315 pruebas en verde.**

---

## v0.19.3 — Un estado de cuenta no se puede archivar en una tarjeta

Salió probando con archivos reales, y el peligroso no daba ningún aviso.

**El desplegable ofrecía el destino equivocado**

Con el CSV de una cuenta, el **único** destino ofrecido era una tarjeta — porque
el hogar no tenía ninguna cuenta registrada. Elegirla habría archivado el estado
de una cuenta dentro de una tarjeta.

**Y eso no falla:** entra completo, la pantalla dice que salió bien, y el mes
descuadra. En la cuenta un cargo *resta*; en la tarjeta *suma* a lo que se debe.
Los pagos de tarjeta se registran desde la cuenta y no al revés. Son dos
aritméticas distintas.

Ahora el desplegable solo ofrece destinos **de la misma clase que el archivo**. Y
si no hay ninguno, lo dice y manda a crearlo, en vez de ofrecer el que sí hay.

**Elegir a mano era para siempre**

Las dos tarjetas de producción tienen el número vacío, así que el reconocimiento
automático no puede emparejar y hay que elegir a mano. Eso es correcto. Pero el
mes siguiente pasaba lo mismo, y el siguiente. Ahora, al elegir a mano un destino
sin número, se ofrece **guardarle el que trae el archivo**. Se hace una vez y se
acabó.

**310 pruebas en verde**, dos nuevas.

---

## v0.19.2 — El ancla de la tarjeta nunca se escribía, y nadie lo decía

Los dos defectos salieron de importar un **estado de cuenta real**. Ninguno daba
error: la importación entraba completa y la pantalla se veía perfecta.

**1. El ancla de la tarjeta no se escribía**

Una cuenta trae saldo final; una tarjeta trae saldo de corte, porque al final del
ciclo lo que hay no es un saldo a favor sino lo que se debe. El código leía solo
el primero, que en un lote de tarjeta viene vacío.

**Consecuencia:** importar la tarjeta dejaba sin escribir el saldo de referencia
del banco. De ese dato depende que el patrimonio se pueda calcular sin bajarle el
histórico entero al teléfono, y que la tarjeta tenga contra qué cuadrar al cerrar
el mes. Todo eso se habría quedado en silencio, con la importación diciendo que
salió bien.

**2. La comprobación que no corrió no se decía**

Cuando el archivo no trae saldo anterior ni de corte, la comprobación no se puede
hacer — y la pantalla simplemente **no dibujaba el panel**. O sea: se veía igual
que un archivo que cuadró.

Es la comprobación que existe para atrapar un PDF mal interpretado *antes* de que
entre. Callar que no se pudo hacer es peor que no tenerla: deja creer que el
archivo se revisó. Ahora lo dice, y avisa que habrá que escribir el saldo a mano
en Presupuesto.

**3. Y se explica por qué los pagos de una tarjeta no entran.** El resumen decía
«8 pagos de tarjeta» y abajo «Pagos de tarjeta: 0». Las dos cifras eran correctas
—el dinero sale de la cuenta, no de la tarjeta— pero juntas se leían como un
error.

**308 pruebas en verde**, dos nuevas.

---

## v0.19.1 — El núcleo no exportaba el importador, y la pantalla reventó

En producción, al elegir un archivo: **«A.leerArchivo is not a function»**.

**Qué pasó**

La puerta del motor financiero no daba salida a ninguna de las funciones del
importador. La pantalla las pedía y llegaban vacías.

**Por qué no lo atrapé**

Comprobé que la pantalla se pudiera cargar y lo di por bueno. Pero **cargar un
módulo siempre funciona, aunque venga vacío**: el error solo aparece al llamar.

Fue exactamente la trampa que este proyecto ya tenía anotada — *una comprobación
que no puede fallar no está comprobando nada.* La mía no podía fallar.

**Qué se arregla**

1. La puerta del motor reexporta el importador completo: las diez funciones
   públicas y los catorce apoyos que la app anterior también exponía. Nada de lo
   que existía se pierde en la mudanza.
2. **Comprobación nueva**: lee el código de cada pantalla, saca cada función que
   usa, y exige que el motor la dé de verdad. Ocho pantallas cubiertas. Con ella
   puesta, este fallo falla en las pruebas y no en la pantalla de alguien.

**306 pruebas en verde.**

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

## v0.18.2 — Importar un estado de cuenta: o entra todo, o no se toca nada

*Debajo del capó. La pantalla llegó en la v0.19.0; esto es lo que escribe.*

**Por qué esto va todo junto y no en dos pasos**

La regla obliga a **borrar antes de insertar**: cada archivo reemplaza lo que se
importó antes para esa cuenta en ese rango de fechas. El orden no es negociable —
hay que quitar lo viejo para que lo nuevo no duplique.

Partido en dos, una caída entre ellos deja el mes con un hueco: lo viejo borrado
y lo nuevo sin entrar. **Y no es un hueco que se vea** — la pantalla enseña menos
gastos de los que hubo, el mes parece que salió barato, se cierra contento, y el
error aparece cuando el banco no cuadra semanas después.

Hecho de una sola vez, o entra todo o no se movió nada. **Hay una prueba que lo
demuestra**: se fuerza un fallo justo después del borrado y se comprueba que las
filas siguen siendo exactamente las mismas.

**Cómo se reusa el motor sin copiarlo**

La clasificación —qué es un gasto, qué es un retiro, a qué rubro va cada cosa— la
sigue haciendo el motor de la app anterior, entero. En vez de reescribirla aquí
—dos aritméticas acaban dando dos respuestas y no hay forma de saber cuál creer—
se le pasa una copia, se le deja trabajar, y se mira qué apareció.

**Detalles que protegen el dinero**

- El rango de fechas se valida: es el dato más peligroso. Sin él, el borrado se
  llevaría todo lo que esa cuenta haya importado nunca.
- La procedencia de cada fila la pone la base, nunca quien llama. Si viniera de
  afuera, alguien podría insertar filas marcadas como «tecleadas a mano» que
  ninguna importación futura borraría.
- Los rubros nuevos y los comercios aprendidos se guardan **aparte, a propósito**:
  si el dinero falla, queda un rubro vacío y reutilizable. El dinero es lo único
  que no puede quedar a medias.

**297 pruebas · 27 de aislamiento · 25 de integración**, en verde.

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

## v0.8.2 — Borrar la cuenta borra de verdad: se va también el hogar

**Qué pasaba**

Borrando una cuenta de prueba: el usuario se iba, su membresía se iba con él, y
**el hogar se quedaba**. Con todos sus gastos, movimientos y saldos dentro.

Nadie podía volver a verlos —sin membresía la base no los deja leer— pero ahí
seguían.

**Por qué importa**

La política de privacidad ya publicada dice, con estas palabras: «Si borrás tu
cuenta, todo se elimina — no la guardamos por si acaso». No era cierto. Datos que
sobreviven a quien los creó, invisibles y sin dueño, son exactamente lo que nadie
espera cuando pide que le borren la cuenta.

**La distinción que hace la regla nueva**

Actúa **solo si era el último miembro**. Si borrara el hogar al sacar a
cualquiera, quitarle el acceso a una pareja destruiría el presupuesto de la casa
entera.

| | |
|---|---|
| Se va el único miembro | hogar y gastos **borrados** |
| Se saca a uno de dos | hogar y gastos **intactos** |

**24 pruebas de aislamiento en verde.** Se limpian además los hogares que ya
habían quedado sueltos.

---

## v0.8.1 — Correos en español, y tres minas en la configuración

**Qué cambia**

El primer correo que recibía un usuario nuevo **llegaba en inglés** — tanto que
Gmail ofrecía traducirlo. Las plantillas de fábrica vienen así. Se reemplazan por
cuatro en español, guardadas en el repositorio y no escritas a mano en un panel:
confirmar cuenta, recuperar contraseña, invitación a un hogar y cambio de correo.

**Faltaba el último eslabón del registro.** Al confirmar el correo, quien hacía
todo bien aterrizaba en la app y **esta le pedía iniciar sesión otra vez**. El
peor primer minuto posible. Ahora se recoge la sesión, se limpia la barra de
direcciones —esos códigos no tienen por qué quedar en el historial ni en una
captura— y se le da la bienvenida.

**Tres minas encontradas al preparar el cambio**

Cada una habría sido un desastre silencioso, de los que se ven perfectos hasta
que un usuario real se topa con ellos:

1. **La confirmación por correo venía apagada** en los valores de fábrica.
   Empujarlos habría permitido que cualquiera se registrara con la dirección de
   otra persona y se quedara con esa cuenta.
2. **La dirección del sitio venía apuntando a una máquina local.** Cada usuario
   que confirmara su correo habría terminado en una dirección que no existe.
3. **La sección del correo saliente venía comentada.** Empujarla habría borrado
   la configuración de Resend recién puesta.

Las tres corregidas — y de aquí sale la regla de que **la configuración de
autenticación se administra en el panel**, porque ese comando manda el archivo
entero y arrastra cada valor de fábrica que nadie tocó.

**Y un endurecimiento:** cambiar la contraseña exige haber entrado hace poco,
para que una sesión olvidada en una computadora ajena no sirva para apropiarse de
la cuenta.

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

## v0.6.1 — El ensayo de vuelta atrás, ahora con la base de datos

**Qué cambia**

Ya había migraciones de verdad, así que se ensayó de verdad el caso que quedaba
pendiente: una actualización mala **que además cambió la base**.

**El resultado, con cronómetro**

Sobre la base de pruebas, con las veinte tablas y datos dentro:

| | |
|---|---|
| Revertir el esquema completo | 4 s |
| Reconstruirlo | 16 s |
| **Ida y vuelta** | **22 s** |
| Pruebas de aislamiento contra lo reconstruido | **22 de 22 en verde** |

Que las pruebas pasen *después* de reconstruir es lo que importa: lo reconstruido
no solo tiene la misma forma, se comporta igual.

**Tres cosas que solo se ven ensayando**

1. **El comando de revertir iba contra una base local**, no contra la de verdad.
   El primer intento informó «revertido en 1 s» sin haber revertido nada. *Un
   cronómetro que mide un comando que no corrió da un número tranquilizador y
   falso.*
2. **`VUELTA-ATRAS.md` documentaba un comando que no existe.** Escrito de memoria
   y nunca ejecutado. Es exactamente lo que el ensayo viene a impedir.
3. **Revertir el esquema no revertía el registro de migraciones.** Las tablas
   desaparecían pero el registro seguía diciendo que estaban puestas, así que no
   se volvían a crear y el esquema quedaba irrecuperable por la vía normal. Ahora
   cada reverso borra su propia anotación.

**Y una buena noticia:** la contraseña de la base no hacía falta. Ese bloqueo que
veníamos arrastrando no existía.

Con esto queda cumplido y medido el compromiso de que **una actualización mala se
puede revertir en menos de cinco minutos, base de datos incluida**.

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
