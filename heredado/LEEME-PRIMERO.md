# Esta carpeta está congelada

Lo que hay aquí es la aplicación anterior — la que Moisés y Judith han usado
durante meses — copiada tal cual el 8 de agosto de 2026 desde
`~/Documents/Presupuesto-app`.

**No se edita nada de esta carpeta.** Ni para arreglar un error, ni para mejorar un
comentario, ni para corregir una falta de ortografía.

## Para qué está

1. **Referencia.** Cuando haya duda de cómo se comportaba una función, la respuesta
   está aquí, no en la memoria de nadie.
2. **Origen del núcleo.** `asesor.js` se muda a `nucleo/` en la etapa 1. La mudanza
   se verifica corriendo los dos contra los mismos datos y comparando número por
   número.
3. **Origen de las pruebas.** `pruebas.html` trae 201 pruebas que pasan a
   `node --test` sin perder ni una.
4. **Origen de la migración.** Los datos del hogar salen del formato que esta app
   entiende y entran al modelo nuevo. Sin esta copia no hay con qué verificar que
   los totales cuadran.

## Qué pasa con ella

La app viva sigue publicada y en uso desde su propio repositorio. Está **congelada**
por decisión del dueño: solo se le tocan errores graves, porque cada mejora que
reciba es una mejora más que habría que migrar después.

Cuando la fase 1 termine y los datos estén migrados y cuadrados, esta carpeta se
borra en un commit. Seguirá recuperable en el historial de git para siempre.

## Lo que no hay que copiar de aquí

- **`sync.js`.** Toda la maquinaria de fusión entre dispositivos existía porque cada
  teléfono guardaba su copia. Con el servidor mandando, deja de tener sentido.
- **El esquema de `supabase-schema.sql`.** Una sola tabla `hogar_estado` con todo el
  documento en un `jsonb`, y políticas RLS con dos correos escritos a mano. Sirvió
  para dos personas; no sirve para un producto.
- **El guardado en `localStorage`.** Los datos del usuario van al servidor.
