# Controle Wallet

Servicio de finanzas personales del hogar: presupuesto mensual, tarjetas por ciclo
de corte, financiamientos, proyectos con veredicto y un asesor que proyecta a 60
meses. Multiusuario, multiplataforma y con suscripción.

Nace de una aplicación privada que dos personas usaron durante meses. El motor
financiero de aquella app se rescata entero; lo que se rehace es todo lo demás.

**Estado: fase 1 cerrada.** En producción, en `v0.25.0`, con nueve pantallas:
Resumen, Movimientos, Presupuesto, Proyectos, Historia, Cierre de mes, Importar,
Informe y Tu cuenta. Lo que falta para venderlo no es código — está en
[EL-SERVICIO.md](EL-SERVICIO.md).

---

## 1. Cómo está organizado

| Carpeta | Qué contiene |
|---|---|
| `sitio/` | Todo lo que se sirve al navegador. El sitio público en la raíz, la aplicación bajo `/app` |
| `sitio/app/nucleo/` | El motor financiero en módulos puros. Corre igual en el navegador, en el servidor y en las pruebas. **No toca red, ni pantalla, ni almacenamiento** |
| `sitio/app/datos/` | Lo que habla con la base: el cliente, el armador que convierte filas en el documento que el núcleo espera, y el importador |
| `sitio/app/vistas/` | Una pantalla por archivo |
| `pruebas/` | Las del núcleo, más las de aislamiento entre hogares y las de integración contra la base real |
| `supabase/` | Migraciones numeradas, sus reversos en `supabase/reversos/`, y las Edge Functions |
| `heredado/` | La aplicación anterior, congelada, como referencia. **No se edita.** Ver [heredado/LEEME-PRIMERO.md](heredado/LEEME-PRIMERO.md) |

Documentos aparte:

- [EL-SERVICIO.md](EL-SERVICIO.md) — dónde vive el servicio, qué cuesta y qué falta. Escrito para el dueño, no para un programador.
- [CAMBIOS.md](CAMBIOS.md) — qué trajo cada versión.
- [VUELTA-ATRAS.md](VUELTA-ATRAS.md) — cómo se deshace una actualización mala. Léelo antes de necesitarlo.
- [SECRETOS.md](SECRETOS.md) — qué secretos existen y dónde vive cada uno. Sin sus valores.
- [TRASPASO.md](TRASPASO.md) — para retomar el desarrollo desde cero, con las trampas que ya costaron caro.

---

## 2. Cómo se trabaja

**`main` es lo que está en producción. Nunca se edita directo.**

```bash
git switch -c feat/lo-que-sea
# ...cambios...
git commit -m "qué cambia y por qué"
git push -u origin feat/lo-que-sea
gh pr create
```

- Cada cambio en su propia rama: `feat/…` para lo nuevo, `fix/…` para lo que se arregla.
- **Se prueba contra `controle-pruebas`, nunca contra producción.** Con `npx wrangler
  dev` alcanza: todo lo que no sea `controlewallet.com` habla con la base de pruebas.
  Para enseñarlo en línea, `npm run publicar:pruebas` publica el Worker de pruebas.
- El Pull Request lleva descripción en español: qué cambia y **por qué**.
- Las pruebas corren solas en cada PR. Si salen rojas, no se une.
- Las versiones se etiquetan (`v1.0.0`) y se anotan en `CAMBIOS.md`. **Cada etiqueta
  tiene su entrada**, y eso se comprueba comparando las dos listas.
- Al publicar, el orden es **migración → Edge Function → Worker**. Si el Worker va
  primero, la pantalla nueva se queda a medias en silencio.

**Nunca se borra historial.** Deshacer un cambio se hace con `git revert`, que deja
constancia de que hubo un problema y de cuándo se corrigió.

---

## 3. Los dos ambientes

Separados de verdad, con su propio proyecto de Supabase cada uno. **Jamás se prueba
contra los datos reales de un cliente.**

| | Pruebas | Producción |
|---|---|---|
| Worker | `controle-wallet-pruebas` | `controle-wallet` |
| Dirección | `*.workers.dev` | `controlewallet.com` |
| Base | `controle-pruebas` | `controle-produccion` |
| Datos | Inventados | Reales |

---

## 4. Correr en esta máquina

```bash
npm ci
npm run pruebas
```

Esas 336 no tocan la red y corren en menos de un segundo. Las otras dos suites sí
hablan con la base de **pruebas**, así que necesitan sus credenciales en el
ambiente (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`); en
`TRASPASO.md` está cómo sacarlas sin escribirlas en ningún lado:

```bash
npm run pruebas:aislamiento
npm run pruebas:integracion
```

Para ver el sitio como lo servirá Cloudflare, con sus cabeceras y todo:

```bash
npx wrangler dev
```

---

## 5. Las reglas que no se negocian

Están completas en la especificación de la fase 1. El resumen que hay que tener en
la cabeza al escribir cada línea:

1. **El servidor es la única fuente de verdad.** Nada de `localStorage` ni
   `IndexedDB` como almacén de datos del usuario.
2. **El núcleo es puro y vive aparte.** Recibe datos, devuelve resultados. No sabe
   de red, ni de base, ni de pantalla.
3. **Multi-inquilino desde el primer commit.** Ninguna consulta sin acotar al hogar.
4. **El aislamiento se garantiza en la base, con RLS.** El código del navegador es
   público y se asume hostil.
5. **Ningún secreto en el cliente.**
6. **Datos de tarjeta: jamás.** Ni número, ni CVV, ni vencimiento. Eso es de la pasarela.
7. **Todo cambio pasa por el repositorio.** Nada a mano en los paneles. La única
   excepción son los secretos, y por eso existe `SECRETOS.md`.
8. **Nada se pierde.** Toda función que existía tiene que seguir existiendo.
9. **Sin dependencias porque sí.** Cada librería se justifica. Las únicas son `wrangler`
   y `supabase`, y las dos son herramientas, no código que se envíe al navegador.
10. **Ni un estilo en línea.** Es lo que permite sostener `style-src 'self'` sin
    excepciones en la CSP.
