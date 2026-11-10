const assert = require('assert');
const { app } = require('../server');
const { seedDatabase } = require('./seed');

/**
 * Invoca una ruta de Express directamente en memoria (sin abrir sockets TCP),
 * funcionando tanto dentro del sandbox como fuera de él.
 */
function invokeExpress(appInstance, method, urlPath, body = null, ip = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const req = {
      method: method.toUpperCase(),
      url: urlPath,
      originalUrl: urlPath,
      path: urlPath.split('?')[0],
      headers: { 'content-type': 'application/json' },
      body: body || {},
      ip,
      connection: { remoteAddress: ip },
      get(header) {
        return this.headers[header.toLowerCase()];
      }
    };

    const resHeaders = {};
    const res = {
      statusCode: 200,
      setHeader(k, v) {
        resHeaders[k.toLowerCase()] = v;
      },
      getHeader(k) {
        return resHeaders[k.toLowerCase()];
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ status: this.statusCode, body: payload, headers: resHeaders });
        return this;
      },
      send(payload) {
        resolve({ status: this.statusCode, body: payload, headers: resHeaders });
        return this;
      },
      end(payload) {
        resolve({ status: this.statusCode, body: payload, headers: resHeaders });
        return this;
      }
    };

    try {
      appInstance.handle(req, res, (err) => {
        if (err) return reject(err);
        resolve({ status: 404, body: { error: 'Not Found' } });
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function runTests() {
  const seedInfo = seedDatabase();
  const tokenCarmen = seedInfo.familias[0].token;

  console.log('🧪 Ejecutando batería de pruebas del Backend (8 endpoints + reglas de negocio + rate limit)...');

  // 1. Probar Ahorro de la Familia (Pieza 1)
  const rAhorro = await invokeExpress(app, 'GET', `/api/familias/${tokenCarmen}/ahorro`);
  assert.strictEqual(rAhorro.status, 200);
  assert.strictEqual(rAhorro.body.resumen_ahorro.ahorro_ultimo_mes, 77);
  assert.strictEqual(rAhorro.body.familia.recibo_antes, 110);
  console.log('  ✔ [1/9] GET /api/familias/:token/ahorro -> $77/mes (70% de $110) verificado.');

  // 2. Probar Registrar Compartición (Pieza 2)
  const rComp = await invokeExpress(app, 'POST', `/api/familias/${tokenCarmen}/compartir`, {
    canal: 'WhatsApp'
  });
  assert.strictEqual(rComp.status, 201);
  const nuevoRef = rComp.body.comparticion.codigo_ref;
  assert.ok(nuevoRef.startsWith('ref_'));
  console.log(`  ✔ [2/9] POST /api/familias/:token/compartir -> Código ${nuevoRef} creado.`);

  // 3. Probar Ver Tarjeta como Vecino y Privacidad (Pieza 3 - Paso 1)
  const rVecino = await invokeExpress(app, 'GET', `/api/vecino/tarjeta/${nuevoRef}`);
  assert.strictEqual(rVecino.status, 200);
  assert.strictEqual(rVecino.body.postal_familia.nombre_pila, 'Doña Carmen');
  assert.strictEqual(rVecino.body.postal_familia.apellido, undefined, 'No debe exponer apellido completo');
  assert.strictEqual(rVecino.body.postal_familia.token_personal, undefined, 'No debe exponer token privado');
  console.log('  ✔ [3/9] GET /api/vecino/tarjeta/:codigo_ref -> Privacidad verificada (solo nombre de pila, barrio y ahorro).');

  // 4. Probar Calculadora del Vecino con $110 (Pieza 3 - Paso 2)
  const rCalc = await invokeExpress(app, 'POST', '/api/vecino/calculadora', {
    codigo_ref: nuevoRef,
    recibo_mensual: 110
  });
  assert.strictEqual(rCalc.status, 201);
  assert.strictEqual(rCalc.body.resultado_calculadora.ahorro_mensual_estimado, 77);
  assert.strictEqual(rCalc.body.resultado_calculadora.anios_recuperacion, 7.0);
  console.log('  ✔ [4/9] POST /api/vecino/calculadora -> $110 da $77/mes y 7.0 años de recuperación.');

  // 5. Probar Horarios Disponibles y Agendar Visita Directa (Pieza 3 - Paso 3)
  const rHorarios = await invokeExpress(app, 'GET', '/api/horarios');
  assert.strictEqual(rHorarios.status, 200);
  assert.ok(rHorarios.body.horarios.length > 0, 'Debe haber horarios disponibles');
  const primerHorario = rHorarios.body.horarios[0];

  const rAgendar = await invokeExpress(app, 'POST', '/api/vecino/agendar', {
    codigo_ref: nuevoRef,
    visita_vecino_id: rCalc.body.visita_vecino_id,
    nombre: 'Doña Lorena Quirós (simulado)',
    telefono: '8899-7766',
    horario_id: primerHorario.id
  });
  assert.strictEqual(rAgendar.status, 201);
  assert.strictEqual(rAgendar.body.reserva.estado, 'agendada');
  console.log(`  ✔ [5/9] POST /api/vecino/agendar -> Reserva #${rAgendar.body.reserva.id} agendada sin llamada de 31h.`);

  // 6. Probar Catálogo de Recompensas y Rechazo si pasa de $300 (Pieza 4)
  const rCat = await invokeExpress(app, 'GET', '/api/recompensas/catalogo');
  assert.strictEqual(rCat.status, 200);
  assert.strictEqual(rCat.body.costo_visitas_por_venta_referida, 133.33);
  assert.strictEqual(rCat.body.presupuesto_real_maximo_recompensas, 166.67);
  assert.strictEqual(rCat.body.cumple_regla_300, true);

  // Intentar agregar una recompensa de $60 al agendar ($60 * 2.469 = $148.15 extra -> supera $300)
  const rRechazo = await invokeExpress(app, 'POST', '/api/recompensas/validar-o-agregar', {
    nombre: 'Limpieza gratis solo por agendar (trampa)',
    disparador: 'agendar',
    costo_sol_de_casa: 60,
    persistir: false
  });
  assert.strictEqual(rRechazo.status, 400);
  assert.strictEqual(rRechazo.body.codigo, 'SUPERA_TOPE_300_ANDRES');
  console.log('  ✔ [6/9] POST /api/recompensas/validar-o-agregar -> Rechaza configuraciones que superan los $300 por venta.');

  // 7. Probar Avanzar Reserva a "firmada" en vivo y Progreso de Recompensas
  const rAvanzar = await invokeExpress(app, 'POST', `/api/demo/reservas/${rAgendar.body.reserva.id}/avanzar`, {
    estado: 'firmada'
  });
  assert.strictEqual(rAvanzar.status, 200);
  assert.strictEqual(rAvanzar.body.reserva.estado, 'firmada');
  assert.ok(rAvanzar.body.recompensas_desbloqueadas.length >= 1);

  const rProg = await invokeExpress(app, 'GET', `/api/familias/${tokenCarmen}/recompensas`);
  assert.strictEqual(rProg.status, 200);
  assert.strictEqual(rProg.body.barra_avance.porcentaje, 100);
  console.log('  ✔ [7/9] POST /api/demo/reservas/:id/avanzar -> Desbloquea recompensa al firmar y actualiza barra al 100%.');

  // 8. Probar Panel de Andrés y Alerta de Capacidad > 100 (Pieza 5)
  const rPanel = await invokeExpress(app, 'GET', '/api/andres/panel');
  assert.strictEqual(rPanel.status, 200);
  assert.strictEqual(rPanel.body.capacidad_visitas.supera_capacidad_100, true);
  assert.strictEqual(rPanel.body.economia_y_regla_300.cumple_regla_300, true);
  console.log('  ✔ [8/9] GET /api/andres/panel -> Embudo en vivo, CAC vs $300 y alerta de capacidad (>100 visitas) verificados.');

  // 9. Probar Rate Limit en /api/vecino/agendar (máx 5 intentos por IP)
  let ultimoStatus = 200;
  for (let i = 0; i < 6; i++) {
    const rLimit = await invokeExpress(app, 'POST', '/api/vecino/agendar', {
      codigo_ref: nuevoRef,
      nombre: 'Prueba Rate Limit',
      telefono: '8888-0000'
    }, '10.0.0.99');
    ultimoStatus = rLimit.status;
  }
  assert.strictEqual(ultimoStatus, 429);
  console.log('  ✔ [9/9] Rate Limiter en POST /api/vecino/agendar -> Bloquea con HTTP 429 al superar 5 intentos.');

  // Restaurar estado limpio de la semilla después de los tests
  await invokeExpress(app, 'POST', '/api/demo/reset');
  console.log('\n✅ TODAS LAS PRUEBAS DEL BACKEND PASARON CON ÉXITO.');
}

runTests().catch((err) => {
  console.error('❌ Error en pruebas:', err);
  process.exit(1);
});
