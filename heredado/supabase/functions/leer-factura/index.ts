/* ============================================================
   leer-factura — Edge Function de Supabase (Deno)

   Recibe la foto de una factura desde el teléfono, se la pasa a
   Claude y devuelve los datos ya estructurados.

   Esta función existe por una sola razón: la clave de Anthropic no
   puede vivir en la app. La app es estática — su código se descarga
   completo al teléfono y cualquiera puede leerlo. Aquí la clave es
   un secreto del servidor y nunca sale.

   Desplegar:
     supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
     supabase functions deploy leer-factura

   Por omisión Supabase exige un JWT válido, así que solo alguien
   con sesión iniciada en su proyecto puede llamarla.
   ============================================================ */

import Anthropic from "npm:@anthropic-ai/sdk";

const anthropic = new Anthropic(); // toma ANTHROPIC_API_KEY del entorno

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

/**
 * El esquema obliga al modelo a devolver exactamente esta forma.
 * Sin esto habría que adivinar el formato de la respuesta y parsear
 * texto libre; con esto el JSON siempre llega válido y completo.
 */
const ESQUEMA = {
  type: "object",
  properties: {
    legible: {
      type: "boolean",
      description: "false si la imagen no es una factura o no se lee nada",
    },
    comercio: { type: "string", description: "Nombre del negocio" },
    fecha: { type: "string", description: "YYYY-MM-DD" },
    total: { type: "number", description: "Monto final pagado" },
    moneda: { type: "string", description: "HNL, USD, etc." },
    categoria: { type: "string", description: "Una de las categorías dadas" },
    medioPago: { type: "string", enum: ["tarjeta", "efectivo"] },
    detalle: { type: "string", description: "Descripción breve de la compra" },
    confianza: { type: "number", description: "0 a 1" },
    nota: { type: "string", description: "Qué no se pudo leer bien, o vacío" },
  },
  required: [
    "legible", "comercio", "fecha", "total", "moneda",
    "categoria", "medioPago", "detalle", "confianza", "nota",
  ],
  additionalProperties: false,
};

function instrucciones(categorias: string[], hoy: string) {
  return `Lee esta factura o recibo de compra y extrae los datos.

Categorías disponibles del presupuesto:
${categorias.map((c) => `- ${c}`).join("\n")}

Elige la categoría que mejor corresponda a lo comprado. Si ninguna encaja, usa "Otros".

Reglas:
- total: el monto FINAL pagado, con impuestos incluidos. No el subtotal ni un renglón suelto.
- fecha: formato YYYY-MM-DD. Si la factura no la muestra o no se lee, usa ${hoy}.
- moneda: el código que aparezca. Si no aparece ninguno, usa HNL (lempiras).
- medioPago: "tarjeta" si el recibo indica pago con tarjeta, "efectivo" si indica efectivo.
  Si no se distingue, usa "tarjeta".
- detalle: una frase corta de en qué se gastó. No copies la lista de artículos.
- confianza: 0 a 1. Bájala si la foto está borrosa, cortada, o el total no se lee con certeza.
- legible: false si la imagen no es una factura, o si no se distingue nada.
- nota: si algo quedó dudoso, dilo en una frase. Si todo se leyó bien, déjalo vacío.

No inventes datos. Si un campo no se ve, usa el valor por omisión de las reglas
y bájale la confianza.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Solo POST." }, 405);

  // Supabase ya valida el JWT, pero sin cabecera no hay a quién atribuir la llamada.
  if (!req.headers.get("authorization")) {
    return json({ error: "Falta iniciar sesión." }, 401);
  }

  let cuerpo: {
    imagen?: string;
    tipo?: string;
    categorias?: string[];
    hoy?: string;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "El cuerpo no es JSON válido." }, 400);
  }

  const { imagen, tipo = "image/jpeg", categorias = [], hoy } = cuerpo;
  if (!imagen) return json({ error: "Falta la imagen." }, 400);

  // ~6 MB en base64 ≈ 4.5 MB de imagen. Muy por encima de lo que manda
  // la app (que reduce a 2576 px), así que esto solo frena abusos.
  if (imagen.length > 6_000_000) {
    return json({ error: "La imagen es demasiado grande." }, 413);
  }

  const fechaHoy = hoy || new Date().toISOString().slice(0, 10);
  const cats = categorias.length ? categorias : ["Otros"];

  try {
    const respuesta = await anthropic.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      // Tarea corta y acotada: leer campos de una imagen. No necesita
      // razonamiento profundo, y el esfuerzo bajo abarata cada factura.
      // Si la lectura decepciona en recibos difíciles, subir a "medium".
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: ESQUEMA },
      },
      // Si un clasificador de seguridad rechaza la petición, el modelo de
      // respaldo la atiende en la misma llamada en vez de devolver nada.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: tipo, data: imagen } },
          { type: "text", text: instrucciones(cats, fechaHoy) },
        ],
      }],
    });

    // Hay que mirar stop_reason antes que content: en un rechazo el
    // arreglo viene vacío y leer content[0] reventaría.
    if (respuesta.stop_reason === "refusal") {
      return json({ error: "La imagen fue rechazada por los filtros de seguridad." }, 422);
    }
    if (respuesta.stop_reason === "max_tokens") {
      return json({ error: "La respuesta quedó cortada. Intenta de nuevo." }, 502);
    }

    const bloque = respuesta.content.find((b) => b.type === "text");
    if (!bloque || !("text" in bloque)) {
      return json({ error: "El modelo no devolvió datos." }, 502);
    }

    const datos = JSON.parse(bloque.text);
    return json({
      ...datos,
      _uso: {
        entrada: respuesta.usage.input_tokens,
        salida: respuesta.usage.output_tokens,
      },
    });
  } catch (e) {
    console.error("leer-factura", e);
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return json({ error: `No se pudo leer la factura: ${msg}` }, 502);
  }
});
