/* ============================================================
   El informe lee campos que existen — hasta los de adentro.

   La prueba de contrato que ya había comparaba las claves de PRIMER
   NIVEL de la respuesta del servidor. No alcanza: el informe entra
   dentro de esos objetos —`patrimonio.neto`, `salud.mesesColchon`,
   `cartera[id].faltaMin`— y un nombre equivocado ahí no rompe nada
   visible. Llega `undefined`, se imprime «L 0.00», y queda en un
   documento que alguien enseña.

   Escribiendo esta pantalla me equivoqué en NUEVE nombres de una
   sentada: `patrimonio.patrimonio` en vez de `.neto`, `salud.meses`
   en vez de `.mesesColchon`, `resumenMes.ingreso` en vez de `.neto`,
   `porCategoria.parte` en vez de `.pct`, `cartera.falta` en vez de
   `.faltaMin`, y `carta` como lista cuando es un objeto. Ninguno daba
   error.

   Así que aquí se corre el núcleo de verdad sobre un hogar de
   ejemplo, se lee el CÓDIGO del informe, y se exige que cada campo
   que consume exista en el resultado.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '../sitio/app/nucleo/index.js';

const PER = '2026-08';

const hogar = () => ({
  version: 6, configurado: true, inicioMes: 1,
  personas: [{ id: 'p1', nombre: 'Moisés', cuentaId: 'c1' }],
  cuentas: [{ id: 'c1', nombre: 'Ficohsa', saldoInicial: 20000, desdeMes: '2026-07',
              saldoBanco: { monto: 20000, fecha: '2026-08-31' } }],
  plantillaIngresos: [{ id: 'q1', nombre: 'Sueldo', dia: 1,
                        lineas: [{ personaId: 'p1', bruto: 40000, deducciones: [] }] }],
  ingresosMes: {},
  gastos: [{ id: 'g1', concepto: 'Comida', monto: 9000, categoria: 'Alimentación',
             crecimiento: 0, medioPago: 'tarjeta', tarjetaId: 't1' }],
  tarjetas: [{ id: 't1', nombre: 'BAC', tipo: 'credito', diaCorte: 6, diaPago: 27,
               pagaCon: 'q1', pagaTotal: true, tasaAnual: 55, desdeMes: '2026-07',
               saldoInicial: 0, saldoBanco: { monto: 5000, fecha: '2026-08-06' } }],
  financiamientos: [{ id: 'f1', nombre: 'Refri', cuotaMensual: 500,
                      cuotasTotales: 12, cuotasPagadas: 5 }],
  proyectos: [{ id: 'x1', nombre: 'Carro', costoMin: 100000, costoMax: 100000,
                aporteMensual: 2000, tipo: 'necesidad', urgencia: 'este_ano', aportes: [] }],
  movimientos: [{ id: 'm1', periodo: PER, fecha: '2026-08-10', monto: 3000,
                  gastoId: 'g1', medioPago: 'tarjeta', tarjetaId: 't1' }],
  retiros: [], pagosTarjeta: [], comercios: {}, presupuestoMes: {}
});

const D = hogar();

/* Lo que el servidor devuelve, calculado con el núcleo de verdad. */
const RESULTADOS = {
  patrimonio: A.patrimonio(D, PER),
  salud: A.saludFinanciera(D, PER),
  carta: A.cartaAsesor(D, PER),
  historia: A.historia(D, PER, 12),
  resumenMes: A.resumenMes(D, PER),
  porCategoria: A.porCategoria(D, PER)
};

const fuente = readFileSync(
  new URL('../sitio/app/vistas/informe.js', import.meta.url), 'utf8');

test('el lector encuentra el informe y lo que consume', () => {
  // Si esto falla, las de abajo pasarían en verde sin comprobar nada.
  assert.ok(fuente.includes('datos.patrimonio'), 'el informe debería leer el patrimonio');
  assert.ok(Object.keys(RESULTADOS.patrimonio).length > 5, 'el núcleo no devolvió un patrimonio');
});

/** Cada `objeto.campo` que aparece en el código, para un alias dado. */
const camposDe = (alias) =>
  [...new Set([...fuente.matchAll(new RegExp(`\\b${alias}\\.([a-zA-Z_$][\\w$]*)`, 'g'))]
    .map(m => m[1]))];

for (const [alias, resultado] of [['pat', RESULTADOS.patrimonio],
                                  ['salud', RESULTADOS.salud],
                                  ['hist', RESULTADOS.historia],
                                  ['r', RESULTADOS.resumenMes],
                                  ['cat', RESULTADOS.porCategoria]]) {
  test(`el informe solo lee campos que existen en ${alias}`, () => {
    const usados = camposDe(alias);
    assert.ok(usados.length, `no se detectó ningún campo de ${alias}`);
    const inventados = usados.filter(c => !(c in resultado));
    assert.deepEqual(inventados, [],
      `${alias} no tiene: ${inventados.join(', ')} — llegaría undefined y se imprimiría en cero`);
  });
}

test('la carta del asesor es un objeto con párrafos, no una lista', () => {
  // Tratarla como lista daba una sección vacía, sin ningún error.
  const c = RESULTADOS.carta;
  assert.ok(!Array.isArray(c), 'la carta cambió de forma');
  assert.ok(Array.isArray(c.parrafos), 'la carta debería traer `parrafos`');
  assert.ok(c.parrafos.every(p => 'titulo' in p && 'texto' in p),
    'cada párrafo lleva título y texto');
});

test('los pasos del diagnóstico traen lo que el informe imprime', () => {
  const pasos = RESULTADOS.salud.pasos;
  assert.ok(Array.isArray(pasos) && pasos.length, 'no hay pasos que imprimir');
  for (const p of pasos) {
    for (const campo of ['nivel', 'titulo', 'texto']) {
      assert.ok(campo in p, `un paso sin ${campo}: saldría en blanco en el informe`);
    }
  }
});

test('cada meta evaluada trae veredicto y cuánto falta', () => {
  const ev = A.evaluarCartera(D, PER).x1;
  assert.ok(ev, 'no se evaluó la meta');
  for (const campo of ['veredicto', 'faltaMin', 'mesesMin']) {
    assert.ok(campo in ev, `la evaluación no trae ${campo}`);
  }
});
