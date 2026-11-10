const crypto = require('crypto');
const { db, initSchema } = require('./db');
const { CASE_CONSTANTS, calcularCostoPorVentaRecompensa } = require('./constants');

function generarTokenSeguro(prefijo = 'fam') {
  return `${prefijo}_${crypto.randomBytes(18).toString('hex')}`;
}

function seedDatabase() {
  initSchema();

  const limpar = db.transaction(() => {
    db.prepare('DELETE FROM movimientos_recompensa').run();
    db.prepare('DELETE FROM reservas').run();
    db.prepare('DELETE FROM visitas_vecino').run();
    db.prepare('DELETE FROM comparticiones').run();
    db.prepare('DELETE FROM ahorros_mensuales').run();
    db.prepare('DELETE FROM horarios_disponibles').run();
    db.prepare('DELETE FROM recompensas').run();
    db.prepare('DELETE FROM familias').run();
    db.prepare("DELETE FROM sqlite_sequence").run();
  });

  limpar();

  // 1. Insertar Catálogo de Recompensas (Cumpliendo el tope de ≈ $167 de recompensas y $300 CAC total)
  // Explicación matemática en servidor:
  // - Por qué NO regalar limpieza al agendar: $60 * 2.4691 = $148.15 por venta cerrada (se come casi todo el margen de $166.67).
  // - Nuestro diseño de juego ("Cosecha de Sol"):
  //   1) Al AGENDAR el vecino: Abono de $6 en el Plan de Mantenimiento (mitad de mes, costo Sol de Casa = $6).
  //      Costo por venta cerrada = $6 * 2.4691358 = $14.81.
  //   2) Al FIRMAR el vecino (para la familia que refirió): 1 Limpieza y revisión anual fuera del plan (costo Sol de Casa = $60, valor percibido = $144/año).
  //      Costo por venta cerrada = $60 * 1.0 = $60.00.
  //   3) Al FIRMAR el vecino (para el vecino nuevo, para incentivar que use el link): Bono de bienvenida de $80 de descuento en su instalación (o 1 limpieza anual de $60). Usamos $60 (1 limpieza gratis en su primer año).
  //      Costo por venta cerrada = $60 * 1.0 = $60.00.
  //   Suma de recompensas por venta cerrada = $14.81 + $60.00 + $60.00 = $134.81 (≤ $166.67 presupuesto máximo).
  //   CAC Total Referido = $133.33 (visitas) + $134.81 (recompensas) = $268.15 ≤ $300.00 (Regla de Andrés).
  const insertRecompensa = db.prepare(`
    INSERT INTO recompensas (
      codigo, nombre, descripcion, disparador, quien_recibe,
      costo_sol_de_casa, multiplicador_embudo, costo_por_venta_calculado, activa
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const catalogoRecompensas = [
    {
      codigo: 'BONO_AGENDA_FAMILIA',
      nombre: 'Crédito de $6 en su Plan de Mantenimiento (medio mes)',
      descripcion: 'Se activa apenas su vecina o vecino agenda la visita técnica (con tope de seguridad para Sol de Casa).',
      disparador: 'agendar',
      quien_recibe: 'familia',
      costo: 6.00,
      mult: Number(CASE_CONSTANTS.MULTIPLICADOR_AGENDAR_POR_VENTA.toFixed(4)),
      costoPorVenta: calcularCostoPorVentaRecompensa(6.00, 'agendar') // $14.81
    },
    {
      codigo: 'LIMPIEZA_FIRMA_FAMILIA',
      nombre: 'Limpieza y Revisión Solar Completa de Paneles (sin costo)',
      descripcion: 'Cuando su vecino firma la instalación, usted recibe una limpieza profesional completa de sus paneles (valorada en $144 de plan anual, costo operativo $60 para Sol de Casa).',
      disparador: 'firmar',
      quien_recibe: 'familia',
      costo: 60.00,
      mult: 1.00,
      costoPorVenta: calcularCostoPorVentaRecompensa(60.00, 'firmar') // $60.00
    },
    {
      codigo: 'BONO_FIRMA_VECINO',
      nombre: 'Primera Limpieza Anual + Descuento de Cortesía Vecinal ($60)',
      descripcion: 'Beneficio exclusivo para el vecino que agenda desde la postal de ahorro de una familia Sol de Casa y firma su instalación.',
      disparador: 'firmar',
      quien_recibe: 'vecino',
      costo: 60.00,
      mult: 1.00,
      costoPorVenta: calcularCostoPorVentaRecompensa(60.00, 'firmar') // $60.00
    }
  ];

  for (const r of catalogoRecompensas) {
    insertRecompensa.run(
      r.codigo, r.nombre, r.descripcion, r.disparador, r.quien_recibe,
      r.costo, r.mult, r.costoPorVenta, 1
    );
  }

  // 2. Insertar Familias (Datos simulados con nombres y barrios de Costa Rica)
  // Nota: El primer token es determinístico pero de formato largo criptográfico para facilitar pruebas con curl y que el frontend cargue la familia principal sin fricción, además de tokens aleatorios.
  const familiasSeed = [
    {
      token: 'fam_c9f8e7d6b5a4938271605f4e3d2c1b0a9f8e7d6c',
      nombre_pila: 'Doña Carmen',
      apellido: 'Rojas (simulado)',
      nombre_completo: 'Doña Carmen Rojas (simulado)',
      barrio: 'Curridabat, San José (simulado)',
      fecha_instalacion: '2026-03-15',
      recibo_antes: 110.00,
      plan: 1
    },
    {
      token: 'fam_a1b2c3d4e5f60718293a4b5c6d7e8f901a2b3c4d',
      nombre_pila: 'Don Mauricio',
      apellido: 'Vargas (simulado)',
      nombre_completo: 'Don Mauricio Vargas (simulado)',
      barrio: 'San Rafael de Escazú (simulado)',
      fecha_instalacion: '2026-01-10',
      recibo_antes: 140.00,
      plan: 1
    },
    {
      token: 'fam_f0e9d8c7b6a594837261504f3e2d1c0b9a8f7e6d',
      nombre_pila: 'Familia',
      apellido: 'Mora Jiménez (simulado)',
      nombre_completo: 'Familia Mora Jiménez (simulado)',
      barrio: 'Santo Domingo de Heredia (simulado)',
      fecha_instalacion: '2026-05-20',
      recibo_antes: 95.00,
      plan: 0
    }
  ];

  const insertFamilia = db.prepare(`
    INSERT INTO familias (
      token_personal, nombre_pila, apellido, nombre_completo,
      barrio, fecha_instalacion, recibo_antes, tiene_plan_mantenimiento, es_simulado
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const insertAhorro = db.prepare(`
    INSERT INTO ahorros_mensuales (
      familia_id, mes, etiqueta_mes, kwh_producidos,
      recibo_antes, recibo_despues, ahorro, es_simulado
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const mesesAhorro = [
    { mes: '2026-05', etiqueta: 'Mayo 2026 (simulado)', factorVar: 0.98 },
    { mes: '2026-06', etiqueta: 'Junio 2026 (simulado)', factorVar: 1.02 },
    { mes: '2026-07', etiqueta: 'Julio 2026 (simulado)', factorVar: 1.00 },
    { mes: '2026-08', etiqueta: 'Agosto 2026 (simulado)', factorVar: 1.01 },
    { mes: '2026-09', etiqueta: 'Septiembre 2026 (simulado)', factorVar: 0.99 },
    { mes: '2026-10', etiqueta: 'Octubre 2026 (simulado)', factorVar: 1.00 } // Mes actual exacto 70% ($77 para recibo de $110)
  ];

  const familiaIds = [];
  for (const f of familiasSeed) {
    const info = insertFamilia.run(
      f.token, f.nombre_pila, f.apellido, f.nombre_completo,
      f.barrio, f.fecha_instalacion, f.recibo_antes, f.plan
    );
    const famId = info.lastInsertRowid;
    familiaIds.push({ id: famId, ...f });

    for (const m of mesesAhorro) {
      // En Octubre 2026 (último mes) aseguramos exactamente el 70% ($77.00 en recibo de $110.00)
      const ahorroMes = Number((f.recibo_antes * CASE_CONSTANTS.PCT_AHORRO_PROMEDIO * m.factorVar).toFixed(2));
      const reciboDespues = Number((f.recibo_antes - ahorroMes).toFixed(2));
      const kwh = Math.round(ahorroMes * 5.4); // dato simulado del inversor
      insertAhorro.run(famId, m.mes, m.etiqueta, kwh, f.recibo_antes, reciboDespues, ahorroMes);
    }
  }

  // 3. Insertar Horarios Disponibles de los Técnicos
  // Recordar regla de negocio: Capacidad total = 100 visitas/mes.
  // Los anuncios (Meta $4k + Google $4k) ya consumen 97.5 visitas (quedan o 2-3 cupos libres sin priorizar,
  // o cuando se llenan las 100, los referidos van primero porque cada visita referida vale $671 vs $233 de Meta).
  const insertHorario = db.prepare(`
    INSERT INTO horarios_disponibles (fecha_hora, etiqueta_horario, tecnico, reservado)
    VALUES (?, ?, ?, ?)
  `);

  const horariosSeed = [
    { fh: '2026-11-09T09:00:00', etq: 'Lunes 9 Nov · 9:00 a. m. (Técnico Jorge - simulado)', tec: 'Jorge Méndez (simulado)', res: 1 },
    { fh: '2026-11-09T14:00:00', etq: 'Lunes 9 Nov · 2:00 p. m. (Técnico Esteban - simulado)', tec: 'Esteban Solís (simulado)', res: 1 },
    { fh: '2026-11-10T09:00:00', etq: 'Martes 10 Nov · 9:00 a. m. (Técnico Jorge - simulado)', tec: 'Jorge Méndez (simulado)', res: 0 },
    { fh: '2026-11-10T14:00:00', etq: 'Martes 10 Nov · 2:00 p. m. (Técnico Esteban - simulado)', tec: 'Esteban Solís (simulado)', res: 0 },
    { fh: '2026-11-11T10:00:00', etq: 'Miércoles 11 Nov · 10:00 a. m. (Técnico Jorge - simulado)', tec: 'Jorge Méndez (simulado)', res: 0 },
    { fh: '2026-11-12T09:00:00', etq: 'Jueves 12 Nov · 9:00 a. m. (Técnico Esteban - simulado)', tec: 'Esteban Solís (simulado)', res: 0 },
    { fh: '2026-11-13T14:00:00', etq: 'Viernes 13 Nov · 2:00 p. m. (Técnico Jorge - simulado)', tec: 'Jorge Méndez (simulado)', res: 0 },
    { fh: '2026-11-14T09:00:00', etq: 'Sábado 14 Nov · 9:00 a. m. (Técnico Esteban - simulado)', tec: 'Esteban Solís (simulado)', res: 0 }
  ];

  for (const h of horariosSeed) {
    insertHorario.run(h.fh, h.etq, h.tec, h.res);
  }

  // 4. Insertar Comparticiones, Visitas de Vecinos (Calculadora) y Reservas (Embudo Simulado)
  const insertComparticion = db.prepare(`
    INSERT INTO comparticiones (codigo_ref, familia_id, canal, fecha, es_simulado)
    VALUES (?, ?, ?, ?, 1)
  `);

  const insertVisitaVecino = db.prepare(`
    INSERT INTO visitas_vecino (
      comparticion_id, familia_referente_id, uso_calculadora,
      recibo_ingresado, ahorro_calculado, anios_recuperacion, fecha, es_simulado
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const insertReserva = db.prepare(`
    INSERT INTO reservas (
      comparticion_id, familia_referente_id, visita_vecino_id,
      nombre_vecino, telefono_vecino, horario_elegido, estado,
      fecha_creacion, fecha_actualizacion, es_simulado
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const insertMovimiento = db.prepare(`
    INSERT INTO movimientos_recompensa (
      familia_id, recompensa_id, reserva_id, evento, costo, fecha, es_simulado
    ) VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  // Compartición principal de Doña Carmen (fácil de usar en pruebas y vinculada a su token)
  const comp1 = insertComparticion.run('ref_carmen_curridabat_01', familiaIds[0].id, 'WhatsApp', '2026-11-01T10:15:00').lastInsertRowid;
  const comp2 = insertComparticion.run('ref_carmen_curridabat_02', familiaIds[0].id, 'WhatsApp', '2026-11-02T16:40:00').lastInsertRowid;
  const comp3 = insertComparticion.run('ref_carmen_curridabat_03', familiaIds[0].id, 'Publicacion', '2026-11-03T19:00:00').lastInsertRowid;
  const comp4 = insertComparticion.run('ref_mauricio_escazu_01', familiaIds[1].id, 'WhatsApp', '2026-11-02T11:20:00').lastInsertRowid;
  const comp5 = insertComparticion.run('ref_mauricio_escazu_02', familiaIds[1].id, 'LinkDirecto', '2026-11-04T08:30:00').lastInsertRowid;
  const comp6 = insertComparticion.run('ref_mora_heredia_01', familiaIds[2].id, 'WhatsApp', '2026-11-04T14:10:00').lastInsertRowid;

  // Vecinos que abrieron la tarjeta y usaron la calculadora:
  // Vecino 1: Doña Marta de Curridabat (firmada) -> referida por Doña Carmen
  const v1 = insertVisitaVecino.run(comp1, familiaIds[0].id, 1, 110, 77.0, 7.0, '2026-11-01T10:22:00').lastInsertRowid;
  // Vecino 2: Don Roberto Brenes de Curridabat (agendada, lista para avanzar en vivo a hecha/firmada) -> referido por Doña Carmen
  const v2 = insertVisitaVecino.run(comp2, familiaIds[0].id, 1, 130, 91.0, 6.0, '2026-11-02T16:50:00').lastInsertRowid;
  // Vecino 3: Vecina Silvia Chacón (solo usó calculadora, aún no agenda) -> referida por Doña Carmen
  insertVisitaVecino.run(comp3, familiaIds[0].id, 1, 90, 63.0, 8.6, '2026-11-03T19:12:00');
  // Vecino 4: Don Álvaro Solano (hecha) -> referido por Don Mauricio
  const v4 = insertVisitaVecino.run(comp4, familiaIds[1].id, 1, 150, 105.0, 5.2, '2026-11-02T11:35:00').lastInsertRowid;
  // Vecino 5: Doña Gabriela Umaña (solo usó calculadora) -> referida por Familia Mora
  insertVisitaVecino.run(comp6, familiaIds[2].id, 1, 110, 77.0, 7.0, '2026-11-04T14:20:00');

  // Reservas iniciales (simulado):
  // Reserva 1: Doña Marta (Firmada) -> Dispara bono de agendar ($6) + limpieza al firmar ($60) + bono vecino ($60)
  const r1 = insertReserva.run(
    comp1, familiaIds[0].id, v1,
    'Doña Marta Céspedes (simulado)', '8811-2233',
    'Lunes 2 Nov · 9:00 a. m. (Técnico Jorge - simulado)',
    'firmada', '2026-11-01T10:25:00', '2026-11-03T17:00:00'
  ).lastInsertRowid;

  // Reserva 2: Don Roberto (Agendada) -> Dispara bono de agendar ($6). Ideal para probar el endpoint de avanzar a 'hecha' o 'firmada'
  const r2 = insertReserva.run(
    comp2, familiaIds[0].id, v2,
    'Don Roberto Brenes (simulado)', '8844-5566',
    'Lunes 9 Nov · 9:00 a. m. (Técnico Jorge - simulado)',
    'agendada', '2026-11-02T16:55:00', '2026-11-02T16:55:00'
  ).lastInsertRowid;

  // Reserva 3: Don Álvaro (Hecha) -> Dispara bono de agendar ($6)
  const r3 = insertReserva.run(
    comp4, familiaIds[1].id, v4,
    'Don Álvaro Solano (simulado)', '8722-9900',
    'Lunes 9 Nov · 2:00 p. m. (Técnico Esteban - simulado)',
    'hecha', '2026-11-02T11:40:00', '2026-11-05T11:00:00'
  ).lastInsertRowid;

  // Registrar movimientos de recompensa correspondientes a las reservas sembradas
  const recAgendar = db.prepare("SELECT id, costo_sol_de_casa FROM recompensas WHERE codigo = 'BONO_AGENDA_FAMILIA'").get();
  const recFirmaFam = db.prepare("SELECT id, costo_sol_de_casa FROM recompensas WHERE codigo = 'LIMPIEZA_FIRMA_FAMILIA'").get();
  const recFirmaVec = db.prepare("SELECT id, costo_sol_de_casa FROM recompensas WHERE codigo = 'BONO_FIRMA_VECINO'").get();

  // Movimientos para Reserva 1 (Doña Marta - firmada)
  insertMovimiento.run(familiaIds[0].id, recAgendar.id, r1, 'agendar', recAgendar.costo_sol_de_casa, '2026-11-01T10:25:00');
  insertMovimiento.run(familiaIds[0].id, recFirmaFam.id, r1, 'firmar', recFirmaFam.costo_sol_de_casa, '2026-11-03T17:00:00');
  insertMovimiento.run(familiaIds[0].id, recFirmaVec.id, r1, 'firmar', recFirmaVec.costo_sol_de_casa, '2026-11-03T17:00:00');

  // Movimientos para Reserva 2 (Don Roberto - agendada)
  insertMovimiento.run(familiaIds[0].id, recAgendar.id, r2, 'agendar', recAgendar.costo_sol_de_casa, '2026-11-02T16:55:00');

  // Movimientos para Reserva 3 (Don Álvaro - hecha)
  insertMovimiento.run(familiaIds[1].id, recAgendar.id, r3, 'agendar', recAgendar.costo_sol_de_casa, '2026-11-02T11:40:00');

  return {
    familias: familiaIds,
    codigo_ref_principal: 'ref_carmen_curridabat_01',
    reserva_demo_id: r2
  };
}

if (require.main === module) {
  const resultado = seedDatabase();
  console.log('✅ Base de datos SQLite sembrada con éxito (datos simulados al 70% de ahorro).');
  console.log('   Token principal (Doña Carmen):', resultado.familias[0].token);
  console.log('   Código de compartición inicial:', resultado.codigo_ref_principal);
  console.log('   ID de reserva para avanzar en vivo:', resultado.reserva_demo_id);
}

module.exports = {
  seedDatabase,
  generarTokenSeguro
};

