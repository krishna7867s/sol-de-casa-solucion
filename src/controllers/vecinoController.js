const { CASE_CONSTANTS, calcularAhorroVecino } = require('../constants');
const { sanitizarTexto } = require('../middleware/validate');
const {
  AhorroMensual,
  Comparticion,
  VisitaVecino,
  HorarioDisponible,
  Reserva,
  Recompensa,
  MovimientoRecompensa,
  runInTransaction
} = require('../models/orm');

/**
 * Función de dominio: Calcula el estado de capacidad de las 100 visitas del mes
 * y limita los horarios ofrecidos a la capacidad restante.
 */
function obtenerEstadoCapacidadVisitas() {
  const reservasActivas = Reserva.countActive();
  const horariosLibresDB = HorarioDisponible.findAvailable();

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

  const comp = Comparticion.findWithFamiliaByCodigoRef(codigoRef);
  if (!comp) {
    return res.status(404).json({ error: 'Postal de vecino no encontrada o enlace inválido.' });
  }

  const ultimoAhorro = AhorroMensual.findLatestByFamiliaId(comp.familia_id);
  const acumuladoRow = AhorroMensual.getSummaryByFamiliaId(comp.familia_id);

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

  const comp = Comparticion.findByCodigoRef(codigoRef);
  if (!comp) {
    return res.status(404).json({ error: 'Código de referencia no encontrado.' });
  }

  let calculo;
  try {
    calculo = calcularAhorroVecino(reciboMensual, incluyeBateria);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const visita = VisitaVecino.create({
    comparticion_id: comp.id,
    familia_referente_id: comp.familia_id,
    recibo_ingresado: calculo.recibo_ingresado,
    ahorro_calculado: calculo.ahorro_mensual_estimado,
    anios_recuperacion: calculo.anios_recuperacion,
    fecha: new Date().toISOString()
  });

  const textoBateria = calculo.incluye_bateria_respaldo
    ? ` Incluye la Batería de Respaldo contra apagones ($3.000 adicionales, total $9.500; aporta +$510 de contribución neta a Sol de Casa).`
    : '';

  res.status(201).json({
    ok: true,
    visita_vecino_id: visita.id,
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

  const comp = Comparticion.findWithFamiliaByCodigoRef(codigoRef);
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

  try {
    const resultado = runInTransaction(() => {
      const reservadoOk = HorarioDisponible.markReserved(horarioRow.id);
      if (!reservadoOk) {
        throw new Error('Ese horario acaba de ser ocupado. Por favor elija otro.');
      }

      const nuevaReserva = Reserva.create({
        comparticion_id: comp.id,
        familia_referente_id: comp.familia_id,
        visita_vecino_id: visitaVecinoId,
        nombre_vecino: nombreConEtiqueta,
        telefono_vecino: telefono,
        horario_elegido: horarioRow.etiqueta_horario,
        estado: 'agendada',
        fecha_creacion: ahora,
        fecha_actualizacion: ahora
      });

      const recompensasAgendar = Recompensa.findActiveByDisparador('agendar');
      const movimientosCreados = [];

      for (const rec of recompensasAgendar) {
        MovimientoRecompensa.createOrIgnore({
          familia_id: comp.familia_id,
          recompensa_id: rec.id,
          reserva_id: nuevaReserva.id,
          evento: 'agendar',
          costo: rec.costo_sol_de_casa,
          fecha: ahora
        });
        movimientosCreados.push({
          recompensa: rec.nombre,
          evento: 'agendar',
          costo_sol_de_casa: rec.costo_sol_de_casa
        });
      }

      return { reservaId: nuevaReserva.id, movimientosCreados };
    });

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
