# Controle Wallet

Servicio de finanzas personales del hogar: presupuesto mensual, tarjetas por ciclo
de corte, financiamientos, proyectos con veredicto y un asesor que proyecta a 60
meses. Multiusuario, multiplataforma y con suscripción.

Nace de una aplicación privada que dos personas usaron durante meses. El motor
financiero de aquella app se rescata entero; lo que se rehace es todo lo demás.

**Estado: fase 1, etapa 0.** Todavía no hay producto. Lo que existe hoy es la
fundación: repositorio, publicación y vuelta atrás.

---

## 1. Cómo está organizado

| Carpeta | Qué contiene |
|---|---|
| `nucleo/` | El motor financiero en módulos puros. Corre igual en el navegador, en el servidor y en las pruebas |
| `sitio/` | Todo lo que se sirve al navegador. El sitio público en la raíz, la aplicación bajo `/app` |
| `pruebas/` | Las pruebas del núcleo y las de aislamiento entre hogares |
| `supabase/` | Migraciones numeradas y Edge Functions |
| `herramientas/` | Guiones de mantenimiento y migración de datos |
| `heredado/` | La aplicación anterior, congelada, como referencia. **No se edita.** Ver [heredado/LEEME-PRIMERO.md](heredado/LEEME-PRIMERO.md) |

Documentos aparte:

- [CAMBIOS.md](CAMBIOS.md) — qué trajo cada versión.
- [VUELTA-ATRAS.md](VUELTA-ATRAS.md) — cómo se deshace una actualización mala. Léelo antes de necesitarlo.
- [SECRETOS.md](SECRETOS.md) — qué secretos existen y dónde vive cada uno. Sin sus valores.

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
- Cada rama genera su enlace de vista previa. Se prueba ahí, no en producción.
- El Pull Request lleva descripción en español: qué cambia y **por qué**.
- Las pruebas corren solas en cada PR. Si salen rojas, no se une.
- Las versiones se etiquetan (`v1.0.0`) y se anotan en `CAMBIOS.md`.

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
9. **Sin dependencias porque sí.** Cada librería se justifica. La CSP estricta se mantiene.
