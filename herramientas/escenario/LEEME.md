# El escenario — las vistas reales sin base ni sesión

Sirve `sitio/` tal cual y, en `/escenario/?vista=resumen|movimientos|importar`,
monta la vista de verdad sobre un **hogar inventado** (`hogar.js`). Lo que la
Edge Function `historico` calcularía lo calcula `historico-falso.js` con el
mismo núcleo, y un *import map* lo pone en lugar del de verdad. Nada se
escribe: `aplicar` fallaría sin base, y está bien que falle.

```bash
node herramientas/escenario/servidor.mjs &          # puerto 8790
node herramientas/escenario/capturar.mjs            # 5 anchos × 2 temas, mide desborde y errores
```

## Por qué existe

El 18 de septiembre de 2026 las dos bases de Supabase estaban pausadas y no
había contra qué probar. Montando las vistas reales con un CSV de ejemplo
aparecieron tres defectos que las pruebas unitarias no veían:

- `preparar` trabajaba sobre el hogar vivo y la tarjeta de débito nueva nunca
  llegaba a la base: la importación se habría caído por la llave foránea.
- El depósito del sueldo se emparejaba con el pago de la tarjeta del mismo día
  y monto, y la importación **borraba el pago**.
- La hoja de cada formulario quedaba debajo de la barra del teléfono: el botón
  de guardar estaba tapado.

Las pruebas pasaban porque probaban el núcleo solo. La pantalla no llama al
núcleo: llama a `preparar`, a `aplicar`, a la hoja. **Lo que se verifica tiene
que ser lo que el usuario toca.**

No reemplaza a `npx wrangler dev` contra la base de pruebas: no hay RLS, ni
CSP, ni escritura. Sirve para mirar y medir las pantallas, y para recorrer los
flujos hasta el botón de aplicar.
