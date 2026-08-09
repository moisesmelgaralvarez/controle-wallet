/* ============================================================
   Aislamiento entre hogares — la suite que intenta romperlo.

   El punto 8 de la especificación lo pide con estas palabras:
   «Antes de darlo por bueno, escribí pruebas que intenten leer y
   escribir datos de otro hogar y verificá que fallan.»

   Eso es lo que hay aquí. Se crean dos usuarios de verdad, cada
   uno con su hogar, se les siembran datos, y después el usuario A
   intenta por todos los medios tocar lo de B. Cada intento tiene
   que fallar.

   POR QUÉ VIVE APARTE DE LAS DEMÁS PRUEBAS:

   Necesita credenciales de un proyecto Supabase real, y las del
   núcleo no necesitan nada. Si estuviera en el mismo `npm run
   pruebas`, la primera vez que alguien lo corriera sin credenciales
   la suite se saltaría estas pruebas — y una comprobación que se
   salta sola es peor que no tenerla: da la tranquilidad sin dar la
   garantía. Aquí, sin credenciales, revienta y dice por qué.

   Correr:  npm run pruebas:aislamiento
   ============================================================ */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const URL     = process.env.SUPABASE_URL;
const ANON    = process.env.SUPABASE_ANON_KEY;
const SECRETA = process.env.SUPABASE_SERVICE_KEY;

if (!URL || !ANON || !SECRETA) {
  console.error(`
Faltan credenciales del proyecto de PRUEBAS.

  export SUPABASE_URL=https://<ref>.supabase.co
  export SUPABASE_ANON_KEY=...
  export SUPABASE_SERVICE_KEY=...

Nunca las de producción: esta suite crea y borra usuarios.
`);
  process.exit(1);
}

if (/qhbkghxuwzdrlswphusd/.test(URL)) {
  console.error('\nESTO APUNTA A PRODUCCIÓN. Abortando: la suite crea y borra usuarios.\n');
  process.exit(1);
}

/* ---------- utilidades de red ---------- */

const admin = (ruta, opts = {}) => fetch(`${URL}${ruta}`, {
  ...opts,
  headers: { apikey: SECRETA, Authorization: `Bearer ${SECRETA}`,
             'Content-Type': 'application/json', ...(opts.headers || {}) }
});

/** Petición a la API de datos con el token de un usuario concreto. */
const como = (sesion, ruta, opts = {}) => fetch(`${URL}/rest/v1${ruta}`, {
  ...opts,
  headers: { apikey: ANON, Authorization: `Bearer ${sesion.access_token}`,
             'Content-Type': 'application/json',
             Prefer: 'return=representation', ...(opts.headers || {}) }
});

const json = async r => { const t = await r.text(); try { return t ? JSON.parse(t) : null; } catch { return t; } };

async function crearUsuario(correo) {
  const r = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: correo, password: 'Prueba-' + Math.random().toString(36).slice(2, 10),
                           email_confirm: true })
  });
  const u = await json(r);
  if (!r.ok) throw new Error(`No se pudo crear ${correo}: ${JSON.stringify(u)}`);
  return u;
}

async function entrar(correo, clave) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: correo, password: clave })
  });
  const s = await json(r);
  if (!r.ok) throw new Error(`No se pudo entrar como ${correo}: ${JSON.stringify(s)}`);
  return s;
}

/* ---------- montaje ---------- */

const sello = Date.now();
const correoA = `prueba-a-${sello}@controlewallet.test`;
const correoB = `prueba-b-${sello}@controlewallet.test`;
const claveA  = `Clave-A-${sello}`;
const claveB  = `Clave-B-${sello}`;

let usuarioA, usuarioB, sesionA, sesionB, hogarA, hogarB, gastoB, movB;

/** Todas las tablas del presupuesto, para barrerlas de una. */
const TABLAS = ['cuentas', 'personas', 'plantilla_ingresos', 'plantilla_lineas', 'tarjetas',
                'gastos', 'financiamientos', 'proyectos', 'ingresos_mes', 'movimientos',
                'retiros', 'pagos_tarjeta', 'aportes', 'presupuesto_mes', 'comercios'];

before(async () => {
  usuarioA = await crearUsuario(correoA);
  usuarioB = await crearUsuario(correoB);

  // Ponerles contraseña conocida (el alta admin no la devuelve).
  for (const [u, c] of [[usuarioA, claveA], [usuarioB, claveB]]) {
    const r = await admin(`/auth/v1/admin/users/${u.id}`, {
      method: 'PUT', body: JSON.stringify({ password: c })
    });
    if (!r.ok) throw new Error('No se pudo fijar la contraseña: ' + JSON.stringify(await json(r)));
  }

  sesionA = await entrar(correoA, claveA);
  sesionB = await entrar(correoB, claveB);

  // El disparador de alta les creó un hogar a cada uno.
  hogarA = (await json(await como(sesionA, '/hogares?select=id')))[0]?.id;
  hogarB = (await json(await como(sesionB, '/hogares?select=id')))[0]?.id;
  assert.ok(hogarA && hogarB, 'el alta no creó hogar para alguno de los dos');
  assert.notEqual(hogarA, hogarB);

  // Datos en el hogar de B, que es lo que A va a intentar tocar.
  gastoB = (await json(await como(sesionB, '/gastos', {
    method: 'POST',
    body: JSON.stringify({ hogar_id: hogarB, concepto: 'Secreto de B', monto: 5000, categoria: 'Hogar' })
  })))[0];

  movB = (await json(await como(sesionB, '/movimientos', {
    method: 'POST',
    body: JSON.stringify({ hogar_id: hogarB, fecha: '2026-08-05', periodo: '2026-08',
                           monto: 1234.56, concepto: 'Compra de B', gasto_id: gastoB.id })
  })))[0];

  assert.ok(gastoB?.id && movB?.id, 'no se pudo sembrar el hogar de B');
});

after(async () => {
  for (const u of [usuarioA, usuarioB]) {
    if (u?.id) await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
  }
});

/* ============================================================
   1. Leer lo ajeno
   ============================================================ */

test('A no ve el hogar de B ni pidiéndolo por su id', async () => {
  const filas = await json(await como(sesionA, `/hogares?id=eq.${hogarB}&select=*`));
  assert.deepEqual(filas, [], 'A vio el hogar de B');
});

test('A solo ve su propio hogar al listar todos', async () => {
  const filas = await json(await como(sesionA, '/hogares?select=id'));
  assert.equal(filas.length, 1);
  assert.equal(filas[0].id, hogarA);
});

test('A no ve las membresías del hogar de B', async () => {
  const filas = await json(await como(sesionA, `/miembros?hogar_id=eq.${hogarB}&select=*`));
  assert.deepEqual(filas, []);
});

test('A no ve la bitácora de B', async () => {
  const filas = await json(await como(sesionA, `/bitacora?hogar_id=eq.${hogarB}&select=*`));
  assert.deepEqual(filas, []);
});

test('A no ve el perfil de B', async () => {
  const filas = await json(await como(sesionA, `/perfiles?id=eq.${usuarioB.id}&select=*`));
  assert.deepEqual(filas, []);
});

test('A no ve NINGUNA fila de B en NINGUNA tabla del presupuesto', async () => {
  const filtrados = [];
  for (const t of TABLAS) {
    const filas = await json(await como(sesionA, `/${t}?hogar_id=eq.${hogarB}&select=*`));
    if (!Array.isArray(filas) || filas.length > 0) filtrados.push(`${t}: ${JSON.stringify(filas)}`);
  }
  assert.deepEqual(filtrados, [], 'se filtraron datos de B');
});

test('A no ve el gasto de B ni pidiéndolo por su id exacto', async () => {
  const filas = await json(await como(sesionA, `/gastos?id=eq.${gastoB.id}&select=*`));
  assert.deepEqual(filas, []);
});

test('A no puede contar cuántos registros tiene B', async () => {
  // Un conteo que se filtre ya dice más de lo que debería.
  const r = await como(sesionA, `/movimientos?hogar_id=eq.${hogarB}&select=id`,
                       { headers: { Prefer: 'count=exact' } });
  const rango = r.headers.get('content-range') || '';
  assert.ok(/\/0$|^\*\/0$/.test(rango) || rango.endsWith('/0'),
    `el conteo reveló filas de B: ${rango}`);
});

/* ============================================================
   2. Escribir en lo ajeno
   ============================================================ */

test('A no puede insertar un gasto en el hogar de B', async () => {
  const r = await como(sesionA, '/gastos', {
    method: 'POST',
    body: JSON.stringify({ hogar_id: hogarB, concepto: 'Intruso', monto: 1 })
  });
  assert.ok(!r.ok, `la inserción cruzada fue aceptada (${r.status})`);
});

test('A no puede insertar en NINGUNA tabla del hogar de B', async () => {
  const cuerpos = {
    cuentas:            { nombre: 'x', desde_mes: '2026-08' },
    personas:           { nombre: 'x' },
    plantilla_ingresos: { nombre: 'x', dia: 15 },
    tarjetas:           { nombre: 'x', tipo: 'credito', dia_corte: 6 },
    gastos:             { concepto: 'x', monto: 1 },
    financiamientos:    { nombre: 'x' },
    proyectos:          { nombre: 'x' },
    movimientos:        { fecha: '2026-08-05', periodo: '2026-08', monto: 1 },
    retiros:            { fecha: '2026-08-05', periodo: '2026-08', monto: 1 },
    pagos_tarjeta:      { fecha: '2026-08-05', periodo: '2026-08', monto: 1 },
    presupuesto_mes:    { periodo: '2026-08' },
    comercios:          { clave: 'x' }
  };
  const aceptadas = [];
  for (const [t, cuerpo] of Object.entries(cuerpos)) {
    const r = await como(sesionA, `/${t}`, {
      method: 'POST', body: JSON.stringify({ hogar_id: hogarB, ...cuerpo })
    });
    if (r.ok) aceptadas.push(t);
  }
  assert.deepEqual(aceptadas, [], 'aceptó inserciones en el hogar de B');
});

test('A no puede modificar el gasto de B', async () => {
  const r = await como(sesionA, `/gastos?id=eq.${gastoB.id}`, {
    method: 'PATCH', body: JSON.stringify({ monto: 0 })
  });
  const filas = await json(r);
  assert.deepEqual(filas, [], 'A modificó una fila de B');

  // Y de verdad no cambió.
  const real = (await json(await como(sesionB, `/gastos?id=eq.${gastoB.id}&select=monto`)))[0];
  assert.equal(Number(real.monto), 5000);
});

test('A no puede borrar el movimiento de B', async () => {
  const filas = await json(await como(sesionA, `/movimientos?id=eq.${movB.id}`, { method: 'DELETE' }));
  assert.deepEqual(filas, []);

  const sigue = await json(await como(sesionB, `/movimientos?id=eq.${movB.id}&select=id`));
  assert.equal(sigue.length, 1, 'el movimiento de B desapareció');
});

test('A no puede cambiarle el nombre al hogar de B', async () => {
  const filas = await json(await como(sesionA, `/hogares?id=eq.${hogarB}`, {
    method: 'PATCH', body: JSON.stringify({ nombre: 'Mío ahora' })
  }));
  assert.deepEqual(filas, []);
});

test('A no puede meterse como miembro del hogar de B', async () => {
  const r = await como(sesionA, '/miembros', {
    method: 'POST',
    body: JSON.stringify({ hogar_id: hogarB, usuario_id: usuarioA.id, rol: 'propietario' })
  });
  assert.ok(!r.ok, 'A se agregó al hogar de B');
});

test('A no puede ascenderse dentro de su propio hogar por la vía de miembros de B', async () => {
  const filas = await json(await como(sesionA, `/miembros?hogar_id=eq.${hogarB}`, {
    method: 'PATCH', body: JSON.stringify({ rol: 'propietario' })
  }));
  assert.deepEqual(filas, []);
});

test('A no puede escribir en la bitácora de nadie', async () => {
  const r = await como(sesionA, '/bitacora', {
    method: 'POST',
    body: JSON.stringify({ hogar_id: hogarA, accion: 'inventada' })
  });
  assert.ok(!r.ok, 'la bitácora acepta escrituras del cliente');
});

test('A no puede mover una fila suya al hogar de B', async () => {
  const mio = (await json(await como(sesionA, '/gastos', {
    method: 'POST', body: JSON.stringify({ hogar_id: hogarA, concepto: 'de A', monto: 10 })
  })))[0];

  const r = await como(sesionA, `/gastos?id=eq.${mio.id}`, {
    method: 'PATCH', body: JSON.stringify({ hogar_id: hogarB })
  });
  const cuerpo = await json(r);

  // Postgres puede rechazar esto de dos maneras legítimas: negándose con un
  // error de política (el `with check` no se cumple) o dejando la fila fuera
  // del `using` y afectando cero filas. Las dos son correctas — lo único
  // inaceptable sería que el traslado ocurriera. Mi primera versión de esta
  // prueba solo aceptaba la segunda forma y marcaba en rojo un rechazo que
  // en realidad era la defensa funcionando.
  const rechazado = !r.ok || (Array.isArray(cuerpo) && cuerpo.length === 0);
  assert.ok(rechazado, `A trasladó una fila al hogar de B: ${JSON.stringify(cuerpo)}`);

  // Lo que de verdad importa: la fila sigue siendo de A.
  const donde = (await json(await como(sesionA, `/gastos?id=eq.${mio.id}&select=hogar_id`)))[0];
  assert.equal(donde.hogar_id, hogarA, 'la fila terminó en otro hogar');
});

/* ============================================================
   3. Sin sesión no hay nada
   ============================================================ */

test('con la clave pública y sin sesión no se lee nada', async () => {
  const visibles = [];
  for (const t of ['hogares', 'perfiles', 'miembros', ...TABLAS]) {
    const r = await fetch(`${URL}/rest/v1/${t}?select=*`, { headers: { apikey: ANON } });
    const filas = await json(r);
    if (r.ok && Array.isArray(filas) && filas.length > 0) visibles.push(t);
  }
  assert.deepEqual(visibles, [], 'hay tablas legibles sin iniciar sesión');
});

test('sin sesión tampoco se escribe', async () => {
  const r = await fetch(`${URL}/rest/v1/gastos`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ hogar_id: hogarA, concepto: 'anónimo', monto: 1 })
  });
  assert.ok(!r.ok, 'se pudo escribir sin sesión');
});

/* ============================================================
   4. El rol de lectura no escribe
   ============================================================ */

test('un miembro de solo lectura ve pero no toca', async () => {
  // B invita a A a su hogar, con rol lectura.
  const r = await como(sesionB, '/miembros', {
    method: 'POST',
    body: JSON.stringify({ hogar_id: hogarB, usuario_id: usuarioA.id, rol: 'lectura' })
  });
  assert.ok(r.ok, 'B no pudo agregar a A como lectura: ' + JSON.stringify(await json(r)));

  // Ahora A sí ve.
  const ve = await json(await como(sesionA, `/gastos?hogar_id=eq.${hogarB}&select=id`));
  assert.equal(ve.length, 1, 'el miembro de lectura no ve nada');

  // Pero no escribe.
  const ins = await como(sesionA, '/gastos', {
    method: 'POST', body: JSON.stringify({ hogar_id: hogarB, concepto: 'colado', monto: 1 })
  });
  assert.ok(!ins.ok, 'el rol lectura pudo insertar');

  const upd = await json(await como(sesionA, `/gastos?id=eq.${gastoB.id}`, {
    method: 'PATCH', body: JSON.stringify({ monto: 1 })
  }));
  assert.deepEqual(upd, [], 'el rol lectura pudo modificar');

  const del = await json(await como(sesionA, `/gastos?id=eq.${gastoB.id}`, { method: 'DELETE' }));
  assert.deepEqual(del, [], 'el rol lectura pudo borrar');

  // Y no puede ascenderse solo.
  const asc = await json(await como(sesionA, `/miembros?hogar_id=eq.${hogarB}&usuario_id=eq.${usuarioA.id}`, {
    method: 'PATCH', body: JSON.stringify({ rol: 'propietario' })
  }));
  assert.deepEqual(asc, [], 'el rol lectura se ascendió a propietario');
});

/* ============================================================
   5. Un mes cerrado es inmutable — y eso lo impone la base
   ============================================================ */

test('cerrado el mes, no entra ni se modifica ni se borra nada de él', async () => {
  const per = '2026-05';

  await como(sesionA, '/movimientos', {
    method: 'POST',
    body: JSON.stringify({ hogar_id: hogarA, fecha: '2026-05-10', periodo: per, monto: 500 })
  });
  const previo = (await json(await como(sesionA, `/movimientos?periodo=eq.${per}&select=id`)))[0];
  assert.ok(previo, 'no se pudo sembrar el mes que se va a cerrar');

  await como(sesionA, '/presupuesto_mes', {
    method: 'POST',
    body: JSON.stringify({ hogar_id: hogarA, periodo: per, cerrado: true, cerrado_el: new Date().toISOString() })
  });

  const insertar = await como(sesionA, '/movimientos', {
    method: 'POST',
    body: JSON.stringify({ hogar_id: hogarA, fecha: '2026-05-11', periodo: per, monto: 99 })
  });
  assert.ok(!insertar.ok, 'entró un movimiento en un mes cerrado');

  const modificar = await como(sesionA, `/movimientos?id=eq.${previo.id}`, {
    method: 'PATCH', body: JSON.stringify({ monto: 1 })
  });
  assert.ok(!modificar.ok, 'se modificó un movimiento de un mes cerrado');

  const borrar = await como(sesionA, `/movimientos?id=eq.${previo.id}`, { method: 'DELETE' });
  assert.ok(!borrar.ok, 'se borró un movimiento de un mes cerrado');

  // Y la escapatoria: sacarlo del mes cerrado cambiándole el período.
  const mudar = await como(sesionA, `/movimientos?id=eq.${previo.id}`, {
    method: 'PATCH', body: JSON.stringify({ periodo: '2026-06' })
  });
  assert.ok(!mudar.ok, 'se sacó un registro de un mes cerrado cambiándole el período');
});

test('un mes abierto sí admite cambios', async () => {
  const r = await como(sesionA, '/movimientos', {
    method: 'POST',
    body: JSON.stringify({ hogar_id: hogarA, fecha: '2026-07-10', periodo: '2026-07', monto: 250 })
  });
  assert.ok(r.ok, 'un mes abierto está rechazando escrituras');
});

/* ============================================================
   6. Borrar la cuenta borra de verdad
   ============================================================ */

test('borrar al último miembro se lleva el hogar y todo lo suyo', async () => {
  // Apareció borrando una cuenta de prueba: el usuario se iba, su
  // membresía se iba con él, y el HOGAR se quedaba — con todos sus
  // gastos y saldos dentro. Invisibles, porque sin membresía ninguna
  // política los deja leer, pero ahí. La política de privacidad
  // promete que al borrar la cuenta «todo se elimina, no la guardamos
  // por si acaso», y eso tiene que ser cierto.
  const correo = `huerfano-${Date.now()}@controlewallet.test`;
  const u = await crearUsuario(correo);

  const m = await json(await admin(`/rest/v1/miembros?usuario_id=eq.${u.id}&select=hogar_id`));
  const hogar = m[0]?.hogar_id;
  assert.ok(hogar, 'el alta no creó hogar');

  await admin('/rest/v1/gastos', {
    method: 'POST', body: JSON.stringify({ hogar_id: hogar, concepto: 'rastro', monto: 1 })
  });

  await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });

  const quedaHogar = await json(await admin(`/rest/v1/hogares?id=eq.${hogar}&select=id`));
  const quedanGastos = await json(await admin(`/rest/v1/gastos?hogar_id=eq.${hogar}&select=id`));

  assert.deepEqual(quedaHogar, [], 'el hogar sobrevivió a su único miembro');
  assert.deepEqual(quedanGastos, [], 'quedaron gastos de un hogar sin dueño');
});

test('sacar a un miembro de un hogar compartido NO borra el hogar', async () => {
  // El disparador solo actúa cuando se va el ÚLTIMO. Si borrara el
  // hogar al sacar a cualquiera, quitarle el acceso a una pareja
  // destruiría el presupuesto de la casa.
  const r = await como(sesionB, `/miembros?hogar_id=eq.${hogarB}&usuario_id=eq.${usuarioA.id}`,
                       { method: 'DELETE' });
  assert.ok(r.ok || r.status === 200, 'B no pudo sacar a A de su hogar');

  const sigue = await json(await como(sesionB, `/hogares?id=eq.${hogarB}&select=id`));
  assert.equal(sigue.length, 1, 'sacar a un miembro borró el hogar entero');

  const gasto = await json(await como(sesionB, `/gastos?id=eq.${gastoB.id}&select=id`));
  assert.equal(gasto.length, 1, 'se perdieron los datos del hogar');
});
