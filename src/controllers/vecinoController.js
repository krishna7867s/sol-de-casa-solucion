const { db } = require('../db');
const { CASE_CONSTANTS, calcularAhorroVecino } = require('../constants');
const { sanitizarTexto } = require('../middleware/validate');

/**
 * Función de dominio: Calcula el estado de capacidad de las 100 visitas del mes
 * y limita los horarios ofrecidos a la capacidad restante.
 */
function obtenerEstadoCapacidadVisitas() {
  const reservasActivas = db.prepare(`
    SELECT COUNT(*) as total FROM reservas
    WHERE estado IN ('agendada', 'hecha', 'firmada')
  `).get().total;

  const horariosLibresDB = db.prepare(`
    SELECT id, fecha_hora, etiqueta_horario, tecnico
    FROM horarios_disponibles
    WHERE reservado = 0
    ORDER BY fecha_hora ASC
  `).all();

  const visitasAnunciosHoy = CASE_CONSTANTS.VISITAS_OCUPADAS_ANUNCIOS_HOY; // 97.5
  const capacidadMaxima = CASE_CONSTANTS.CAPACIDAD_MAXIMA_VISITAS;         // 100
  const visitasTotalesPedidas = Number((visitasAnunciosHoy + reservasActivas).toFixed(2));

  const cuposRestantesSinDesplazarMeta = Math.max(0, Math.floor(capacidadMaxima - visitasAnunciosHoy) + 3 - reservasActivas);
  const horariosOfrecidos = horariosLibresDB.slice(0, cuposRestantesSinDesplazarMeta);

  return {
    capacidad_maxima_mensual: capacidadMaxima,
    visitas_anuncios_estimadas_mes: visitasAnunciosHoy,
    visitas_referidos_pedidas_mes: reservasActivas,
    visitas_totales_pedidas_mes: visitasTotalesPedidas,
    supera_capacidad_100: visitasTotalesPedidas > capacidadMaxima,
    alerta_capacidad: visitasTotalesPedidas > capacidadMaxima
      ? `ALERTA: Se piden ${visitasTotalesPedidas} visitas frente a la capacidad de ${capacidadMaxima}. Regla de prioridad activa: se atienden primero los Referidos ($671/visita) y Google ($428/visita), desplazando visitas de Meta ($233/visita).`
      : `Capacidad al ${visitasTotalesPedidas}% (${visitasTotalesPedidas} de ${capacidadMaxima} visitas). Quedan ${cuposRestantesSinDesplazarMeta} horarios disponibles en agenda directa.`,
    cupos_restantes_agenda_directa: horariosOfrecidos.length,
    horarios_disponibles: horariosOfrecidos
  };
}

/**
 * GET /api/vecino/tarjeta/:codigo_ref
 * Pieza 3 - Paso 1: Ver la tarjeta como vecino (muestra SOLO nombre de pila, barrio y ahorro)
 */
function obtenerTarjetaVecino(req, res) {
  const codigoRef = req.params.codigo_ref;

  const comp = db.prepare(`
    SELECT c.id as comparticion_id, c.codigo_ref, c.canal, c.familia_id,
           f.nombre_pila, f.barrio, f.recibo_antes
    FROM comparticiones c
    JOIN familias f ON f.id = c.familia_id
    WHERE c.codigo_ref = ?
  `).get(codigoRef);

  if (!comp) {
    return res.status(404).json({ error: 'Postal de vecino no encontrada o enlace inválido.' });
  }

  const ultimoAhorro = db.prepare(`
    SELECT etiqueta_mes, ahorro
    FROM ahorros_mensuales
    WHERE familia_id = ?
    ORDER BY mes DESC LIMIT 1
  `).get(comp.familia_id);

  const acumuladoRow = db.prepare(`
    SELECT SUM(ahorro) as total, COUNT(*) as meses
    FROM ahorros_mensuales
    WHERE familia_id = ?
  `).get(comp.familia_id);

  const ahorroMes = ultimoAhorro
    ? ultimoAhorro.ahorro
    : Number((comp.recibo_antes * CASE_CONSTANTS.PCT_AHORRO_PROMEDIO).toFixed(2));

  res.json({
    codigo_ref: comp.codigo_ref,
    nota_privacidad: 'Por privacidad, esta postal muestra únicamente el nombre de pila, el barrio y el ahorro verificado (simulado).',
    postal_familia: {
      nombre_pila: comp.nombre_pila,
      barrio: comp.barrio,
      ahorro_ultimo_mes: ahorroMes,
      etiqueta_mes: ultimoAhorro ? ultimoAhorro.etiqueta_mes : 'Octubre 2026 (simulado)',
      ahorro_acumulado: Number((acumuladoRow?.total || ahorroMes).toFixed(2)),
      meses_ahorrando: acumuladoRow?.meses || 1,
      porcentaje_ahorro: 70,
      frase_postal: `«En nuestra casa el recibo de luz bajó un 70%. Si quiere que un técnico le mida el techo sin compromiso, agende aquí mismo sin esperar que lo llamen.»`,
      es_simulado: true
    },
    beneficio_vecino: {
      descripcion: 'Al agendar con la postal de su vecino y firmar su instalación, usted recibe sin costo su primera Limpieza y Revisión Anual ($60).',
      pasos_maximos: 3
    }
  });
}

/**
 * POST /api/vecino/calculadora
 * Pieza 3 - Paso 2: Calculadora honesta al 70% (~7 años de recuperación con $110) + opción Batería ($3.000)
 */
function calcularAhorroParaVecino(req, res) {
  const codigoRef = req.body.codigo_ref;
  const reciboMensual = req.body.recibo_mensual;
  const incluyeBateria = req.body.incluye_bateria;

  const comp = db.prepare('SELECT id, familia_id FROM comparticiones WHERE codigo_ref = ?').get(codigoRef);
  if (!comp) {
    return res.status(404).json({ error: 'Código de referencia no encontrado.' });
  }

  let calculo;
  try {
    calculo = calcularAhorroVecino(reciboMensual, incluyeBateria);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const info = db.prepare(`
    INSERT INTO visitas_vecino (
      comparticion_id, familia_referente_id, uso_calculadora,
      recibo_ingresado, ahorro_calculado, anios_recuperacion, fecha, es_simulado
    ) VALUES (?, ?, 1, ?, ?, ?, ?, 1)
  `).run(
    comp.id,
    comp.familia_id,
    calculo.recibo_ingresado,
    calculo.ahorro_mensual_estimado,
    calculo.anios_recuperacion,
    new Date().toISOString()
  );

  const textoBateria = calculo.incluye_bateria_respaldo
    ? ` Incluye la Batería de Respaldo contra apagones ($3.000 adicionales, total $9.500; aporta +$510 de contribución neta a Sol de Casa).`
    : '';

  res.status(201).json({
    ok: true,
    visita_vecino_id: info.lastInsertRowid,
    codigo_ref: codigoRef,
    resultado_calculadora: {
      ...calculo,
      explicacion_honesta: `Con un recibo de $${calculo.recibo_ingresado}/mes, el ahorro promedio real de las 420 familias de Sol de Casa es del 70% ($${calculo.ahorro_mensual_estimado}/mes, o $${calculo.ahorro_anual_estimado} al año). Frente a una inversión de $${calculo.costo_instalacion_referencia}, se recupera en aproximadamente ${calculo.anios_recuperacion} años (sin promesas falsas de ahorro del 100%).${textoBateria}`,
      es_simulado: true
    }
  });
}

/**
 * GET /api/horarios
 * Pieza 3 - Paso 3: Horarios disponibles limitados por la capacidad restante
 */
function listarHorariosDisponibles(req, res) {
  const estadoCapacidad = obtenerEstadoCapacidadVisitas();
  res.json({
    nota: 'Horarios directos con los técnicos de Sol de Casa (sin esperar las 31 horas de llamada de una asesora).',
    capacidad: {
      capacidad_maxima_mensual: estadoCapacidad.capacidad_maxima_mensual,
      cupos_restantes_agenda_directa: estadoCapacidad.cupos_restantes_agenda_directa,
      supera_capacidad_100: estadoCapacidad.supera_capacidad_100,
      alerta: estadoCapacidad.alerta_capacidad
    },
    horarios: estadoCapacidad.horarios_disponibles
  });
}

/**
 * POST /api/vecino/agendar
 * Pieza 3 - Paso 3: Agendar visita técnica guardando SOLO nombre y teléfono
 */
function agendarVisitaDirecta(req, res) {
  const codigoRef = req.body.codigo_ref;
  const nombre = req.body.nombre;
  const telefono = req.body.telefono;
  const horarioId = req.body?.horario_id ? Number(req.body.horario_id) : null;
  const horarioTexto = sanitizarTexto(req.body?.horario_elegido, 100);
  const visitaVecinoId = req.body?.visita_vecino_id ? Number(req.body.visita_vecino_id) : null;

  const comp = db.prepare(`
    SELECT c.id, c.familia_id, f.nombre_pila, f.barrio
    FROM comparticiones c
    JOIN familias f ON f.id = c.familia_id
    WHERE c.codigo_ref = ?
  `).get(codigoRef);

  if (!comp) {
    return res.status(404).json({ error: 'No se encontró la referencia de la familia.' });
  }

  const estadoCapacidad = obtenerEstadoCapacidadVisitas();
  if (estadoCapacidad.cupos_restantes_agenda_directa <= 0) {
    return res.status(409).json({
      error: 'Ya no quedan horarios disponibles dentro de la capacidad técnica de este mes.',
      capacidad: estadoCapacidad
    });
  }

  let horarioRow = null;
  if (horarioId) {
    horarioRow = estadoCapacidad.horarios_disponibles.find(h => h.id === horarioId);
  } else if (horarioTexto) {
    horarioRow = estadoCapacidad.horarios_disponibles.find(
      h => h.etiqueta_horario === horarioTexto || h.fecha_hora === horarioTexto
    );
  }
  if (!horarioRow) {
    return res.status(400).json({
      error: 'El horario elegido no está disponible o supera la capacidad restante. Consulte /api/horarios.',
      horarios_disponibles: estadoCapacidad.horarios_disponibles
    });
  }

  const ahora = new Date().toISOString();
  const nombreConEtiqueta = nombre.toLowerCase().includes('simulado') ? nombre : `${nombre} (simulado)`;

  const transaccionAgendar = db.transaction(() => {
    const updateHorario = db.prepare('UPDATE horarios_disponibles SET reservado = 1 WHERE id = ? AND reservado = 0').run(horarioRow.id);
    if (updateHorario.changes === 0) {
      throw new Error('Ese horario acaba de ser ocupado. Por favor elija otro.');
    }

    const infoReserva = db.prepare(`
      INSERT INTO reservas (
        comparticion_id, familia_referente_id, visita_vecino_id,
        nombre_vecino, telefono_vecino, horario_elegido, estado,
        fecha_creacion, fecha_actualizacion, es_simulado
      ) VALUES (?, ?, ?, ?, ?, ?, 'agendada', ?, ?, 1)
    `).run(
      comp.id,
      comp.familia_id,
      visitaVecinoId,
      nombreConEtiqueta,
      telefono,
      horarioRow.etiqueta_horario,
      ahora,
      ahora
    );

    const reservaId = infoReserva.lastInsertRowid;

    const recompensasAgendar = db.prepare(`
      SELECT id, nombre, costo_sol_de_casa FROM recompensas
      WHERE disparador = 'agendar' AND activa = 1
    `).all();

    const movimientosCreados = [];
    const insertMov = db.prepare(`
      INSERT OR IGNORE INTO movimientos_recompensa (
        familia_id, recompensa_id, reserva_id, evento, costo, fecha, es_simulado
      ) VALUES (?, ?, ?, 'agendar', ?, ?, 1)
    `);

    for (const rec of recompensasAgendar) {
      insertMov.run(comp.familia_id, rec.id, reservaId, rec.costo_sol_de_casa, ahora);
      movimientosCreados.push({
        recompensa: rec.nombre,
        evento: 'agendar',
        costo_sol_de_casa: rec.costo_sol_de_casa
      });
    }

    return { reservaId, movimientosCreados };
  });

  try {
    const resultado = transaccionAgendar();
    res.status(201).json({
      ok: true,
      mensaje: `¡Visita agendada sin esperar las 31 horas de llamada! El técnico irá el ${horarioRow.etiqueta_horario}.`,
      reserva: {
        id: resultado.reservaId,
        nombre_vecino: nombreConEtiqueta,
        telefono_vecino: telefono,
        horario_elegido: horarioRow.etiqueta_horario,
        estado: 'agendada',
        referido_por: {
          familia_id: comp.familia_id,
          nombre_pila: comp.nombre_pila,
          barrio: comp.barrio
        },
        datos_guardados_privacidad: ['nombre', 'telefono']
      },
      recompensas_activadas: resultado.movimientosCreados
    });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
}

module.exports = {
  obtenerEstadoCapacidadVisitas,
  obtenerTarjetaVecino,
  calcularAhorroParaVecino,
  listarHorariosDisponibles,
  agendarVisitaDirecta
};
