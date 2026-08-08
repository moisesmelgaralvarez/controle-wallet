# Vuelta atrás

Qué hacer cuando una actualización sale mala. Léelo ahora, no cuando esté ardiendo.

**La meta: producción sana en menos de cinco minutos, base de datos incluida.**

---

## La trampa que hay que entender antes que nada

Revertir el código **no revierte la base de datos.**

Si una actualización cambió el esquema y solo se vuelve atrás el código, la
aplicación vieja se topa con una base nueva y truena — a veces de inmediato, a veces
en la pantalla que nadie abrió todavía. Es el modo más común de convertir un
problema chico en una caída larga.

De ahí salen las dos reglas que gobiernan todo lo demás:

1. **Toda modificación del esquema va como migración numerada en
   `supabase/migrations/`, con su reverso escrito.** Nunca a mano en el panel.
2. **Una migración nueva tiene que ser compatible con el código anterior.** Se agrega
   una columna antes de usarla; se deja de usar una columna antes de borrarla. Así,
   revertir el código solo casi siempre basta, y es lo que hace que quepa en cinco
   minutos.

---

## Caso 1 — El código está mal, la base no cambió

El 90% de las veces. Dos caminos, y conviene conocer los dos.

**El rápido (segundos).** Cloudflare guarda todas las versiones publicadas:

```
Workers & Pages → controle-wallet → Deployments → la versión buena → Rollback
```

Producción queda sana de inmediato. **Esto no arregla el repositorio**: `main` sigue
teniendo el commit malo. Es una venda, no una cura — sirve para dejar de sangrar
mientras se hace lo de abajo.

**El correcto (minutos).** Deshacer en el repositorio, dejando constancia:

```bash
git revert <commit-malo>
git push
```

Sale un commit nuevo que deshace el anterior. El historial no se toca: queda escrito
que hubo un problema y cuándo se corrigió. La publicación automática se encarga del
resto.

> Nunca `git reset --hard` sobre `main`, nunca `push --force`. Borrar historial en un
> proyecto con dinero de por medio es de las pocas cosas verdaderamente
> irreversibles.

---

## Caso 2 — La actualización cambió el esquema

Aquí hay que hacer las dos cosas, **y en este orden**:

1. **Primero el código**, por cualquiera de los dos caminos de arriba. Deja de entrar
   escritura con la forma nueva.
2. **Después el esquema**, aplicando el reverso:

```bash
npx supabase db query --linked -f supabase/reversos/<NNNN>_<nombre>.reverso.sql
```

Al revés no: si se revierte el esquema con la aplicación nueva todavía en línea,
cada escritura que llegue en ese hueco falla o corrompe.

> **Los reversos viven en `supabase/reversos/`, no junto a las migraciones.** La
> CLI de Supabase ejecuta *todo* archivo `.sql` que encuentre en
> `supabase/migrations/`: un reverso guardado ahí se aplicaría como si fuera una
> migración más y borraría las tablas recién creadas.

> **`--linked` no es opcional.** Sin esa bandera, `supabase db query` va contra una
> base local que casi nunca existe, no dice nada útil, y uno se queda creyendo que
> revirtió algo que sigue en pie.

**Reconstruir después de revertir.** El reverso borra las tablas, pero el registro
de migraciones seguiría diciendo que están aplicadas, y entonces `db push` no las
vuelve a correr: el esquema queda irrecuperable por la vía normal. Por eso cada
reverso termina borrando su propia fila de `supabase_migrations.schema_migrations`.
Es una trampa que no se descubre leyendo — solo ensayando.

```bash
npx supabase db push --include-all
```

---

## Caso 3 — La migración borró o transformó datos

**Esto no se revierte.** Un reverso puede devolver la *forma* de una tabla; no puede
devolver lo que ya no está.

Por eso una migración que borre o transforme datos existentes:

- se avisa al dueño **antes**, con lo que va a pasar dicho en llano;
- se prueba primero en `controle-pruebas`, con una copia de datos reales;
- se ejecuta sabiendo cuál es el respaldo más reciente y de cuándo es.

Si a pesar de todo hay que restaurar: **Supabase → Database → Backups**, y se pierde
lo escrito entre el respaldo y ahora. Es una operación de última instancia, no un
paso más del procedimiento.

---

## Respaldos

- Respaldo diario automático de producción. **Exige el plan Pro de Supabase (~$25 al
  mes); en el plan gratuito no existe.** Mientras no se contrate, este documento
  describe una red que no está puesta.
- La restauración se prueba **de verdad** al menos una vez, sobre `controle-pruebas`.
  Un respaldo que nunca se restauró no es un respaldo: es una suposición.

---

## El simulacro

No basta con que este documento exista. Hay que haberlo hecho, con cronómetro, sobre
producción, a propósito y en frío.

**Cómo se hace:** se publica una versión deliberadamente rota, con una migración de
esquema incluida; se cronometra desde que se nota hasta que producción está sana; y
se anota el resultado aquí abajo, aunque sea malo.

### Resultado — 8 de agosto de 2026

Se publicó en `controlewallet.com` una versión deliberadamente rota: portada
reemplazada por un cartel de avería y la hoja de estilos borrada. Se confirmó el
daño en producción (`base.css` devolvía 404) antes de arrancar el cronómetro.

| | |
|---|---|
| **Caso 1 — solo código, por Cloudflare** | **4 segundos** |
| Caso 1 — solo código, por el repositorio | `git revert` instantáneo; el cuello de botella es el PR y las pruebas (10 s) |
| **Caso 2 — esquema completo, ida y vuelta** | **22 segundos** (4 s revertir, 16 s reconstruir) |

El tiempo del caso 1 se midió desde que se lanzó `wrangler rollback` hasta que un
sondeo automático confirmó las dos señales de salud: la portada volvió a decir lo
que debe y `base.css` volvió a responder 200. No es una impresión: es una
comprobación.

### Qué salió mal en el ensayo

Dos cosas, y las dos valen más escritas que calladas.

1. **`git revert -q` no existe.** El comando falló, el revert no ocurrió, y como la
   comprobación usaba `git diff --stat` —que sale con código 0 aunque haya
   diferencias— el guion informó "idéntico" cuando no lo era. Se corrigió usando
   `git diff --quiet`, que sí falla cuando hay diferencias. **Lección: una
   comprobación que no puede fallar no está comprobando nada.**

2. **`git add -A` dentro del ensayo se llevó archivos que no eran del ensayo.** La
   configuración de Supabase, recién generada y sin commitear, entró en el commit
   roto; al borrar la rama, desapareció del disco. Se regeneró sin pérdida real,
   pero con datos de verdad habría dolido. **Lección: en un ensayo se añade al
   commit lo que se rompió a propósito, por ruta explícita, nunca `-A`.**

### El ensayo del caso 2 — 8 de agosto de 2026

Sobre `controle-pruebas`, con las veinte tablas del esquema real y datos dentro:
se revirtieron las dos migraciones, se comprobó que la base quedó en cero tablas,
se reconstruyó con `db push --include-all`, y se volvió a correr la suite de
aislamiento completa contra el esquema reconstruido.

**22 segundos de ida y vuelta. 22 de 22 pruebas de aislamiento en verde después**
— o sea que lo reconstruido no solo tiene la misma forma, se comporta igual.

Resultó que la contraseña de la base **no hacía falta**: la CLI abre un rol
temporal usando el token de acceso.

### Lo que salió mal en este ensayo

1. **`supabase db query` va contra la base local si no se le pasa `--linked`.** El
   primer intento reportó "revertido en 1s" y no había revertido nada: el comando
   fallaba contra un Docker inexistente. Un cronómetro que mide un comando que no
   corrió da un número tranquilizador y falso.
2. **`VUELTA-ATRAS.md` documentaba un comando que no existe** (`db execute
   --file --project-ref`). Escrito de memoria y nunca ejecutado. Corregido.
3. **Revertir el esquema no revertía el historial de migraciones.** Las tablas
   desaparecían pero el registro seguía diciendo que estaban aplicadas, así que
   `db push` no las volvía a correr y el esquema quedaba irrecuperable por la vía
   normal. Ahora cada reverso borra su propia fila del historial.

Las tres son la razón de ser del ensayo: ninguna se ve leyendo el procedimiento.
