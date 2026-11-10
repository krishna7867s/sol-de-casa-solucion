const os = require('os');
const QRCode = require('qrcode');
const { seedDatabase } = require('../seed');
const { CASE_CONSTANTS } = require('../constants');
const { sanitizarTexto } = require('../middleware/validate');
const { obtenerResumenReglaAndres } = require('./recompensasController');
const { obtenerEstadoCapacidadVisitas } = require('./vecinoController');
const {
  Familia,
  Comparticion,
  VisitaVecino,
  Reserva,
  Recompensa,
  MovimientoRecompensa,
  runInTransaction
} = require('../models/orm');

/**
 * GET /api/health
 */
function obtenerEstadoSalud(req, res) {
  const fams = Familia.findAllPublic();
  res.json({
    ok: true,
    servicio: 'Sol de Casa API - Prototipo Parte 2 (Datos Simulados)',
    familias_disponibles_para_demo: fams
  });
}

/**
 * POST /api/demo/reservas/:id/avanzar
 * Endpoint de demostración para avanzar una reserva a "hecha" o "firmada" en vivo
 */
function avanzarEstadoReservaDemo(req, res) {
  const reservaId = Number(req.params.id);
  const nuevoEstado = req.body?.estado;

  if (!reservaId || !['hecha', 'firmada'].includes(nuevoEstado)) {
    return res.status(400).json({
      error: 'Debe indicar un ID de reserva válido y el estado "hecha" o "firmada".'
    });
  }

  const reserva = Reserva.findById(reservaId);
  if (!reserva) {
    return res.status(404).json({ error: `Reserva con ID ${reservaId} no encontrada.` });
  }

  const ahora = new Date().toISOString();

  const recompensasDesbloqueadas = runInTransaction(() => {
    Reserva.updateEstado(reservaId, nuevoEstado, ahora);

    const nuevasRecompensas = [];

    if (nuevoEstado === 'firmada') {
      const recompensasFirma = Recompensa.findActiveByDisparador('firmar');

      for (const rec of recompensasFirma) {
        const insertado = MovimientoRecompensa.createOrIgnore({
          familia_id: reserva.familia_referente_id,
          recompensa_id: rec.id,
          reserva_id: reservaId,
          evento: 'firmar',
          costo: rec.costo_sol_de_casa,
          fecha: ahora
        });
        if (insertado) {
          nuevasRecompensas.push({
            recompensa: rec.nombre,
            quien_recibe: rec.quien_recibe,
            costo_sol_de_casa: rec.costo_sol_de_casa
          });
        }
      }
    }

    return nuevasRecompensas;
  });

  const reservaActualizada = Reserva.findById(reservaId);

  res.json({
    ok: true,
    mensaje: nuevoEstado === 'firmada'
      ? `¡Reserva #${reservaId} (${reserva.nombre_vecino}) avanzada a FIRMADA! Se desbloquearon las recompensas de cierre para la familia y el vecino.`
      : `Reserva #${reservaId} (${reserva.nombre_vecino}) avanzada a VISITA HECHA.`,
    reserva: reservaActualizada,
    recompensas_desbloqueadas: recompensasDesbloqueadas
  });
}

/**
 * GET /api/andres/panel
 * Pieza 5: Panel de Andrés con embudo en vivo, CAC frente a $300 y visitas frente a 100
 */
function obtenerPanelAndres(req, res) {
  const totalComparticiones = Comparticion.count();
  const totalCalculadora = VisitaVecino.countAllCalculadora();
  const totalAgendadas = Reserva.count();
  const totalHechas = Reserva.countHechasOFirmadas();
  const totalFirmadas = Reserva.countFirmadas();

  const gastoRecompensasReal = MovimientoRecompensa.sumAllCostos();

  const resumenRegla = obtenerResumenReglaAndres();
  const estadoCapacidad = obtenerEstadoCapacidadVisitas();

  const costoVisitasObservadas = totalHechas * CASE_CONSTANTS.COSTO_VISITA_TECNICA;
  const costoPorVentaObservadoSimulado = totalFirmadas > 0
    ? Number(((costoVisitasObservadas + gastoRecompensasReal) / totalFirmadas).toFixed(2))
    : resumenRegla.cac_referido_total_calculado;

  const listaReservas = Reserva.findAllWithFamilia();

  res.json({
    etiqueta_panel: 'Panel de Control de Andrés · Datos Simulados en Vivo',
    embudo_referidos_en_vivo: {
      tarjetas_compartidas: totalComparticiones,
      vecinos_usaron_calculadora: totalCalculadora,
      vecinos_agendaron_visita: totalAgendadas,
      visitas_tecnicas_hechas: totalHechas,
      instalaciones_firmadas: totalFirmadas,
      tasas_conversion_simuladas: {
        compartida_a_calculadora_pct: totalComparticiones > 0 ? Number(((totalCalculadora / totalComparticiones) * 100).toFixed(1)) : 0,
        calculadora_a_agenda_pct: totalCalculadora > 0 ? Number(((totalAgendadas / totalCalculadora) * 100).toFixed(1)) : 0,
        agenda_a_firma_pct: totalAgendadas > 0 ? Number(((totalFirmadas / totalAgendadas) * 100).toFixed(1)) : 0
      }
    },
    economia_y_regla_300: {
      contribucion_por_venta: CASE_CONSTANTS.CONTRIBUCION_VENTA,
      contribucion_promedio_con_bateria: CASE_CONSTANTS.CONTRIBUCION_PROMEDIO_CON_BATERIA,
      tope_andres_por_venta_referida: CASE_CONSTANTS.TOPE_CAC_REFERIDO,
      costo_visitas_por_venta_esperado: resumenRegla.costo_visitas_por_venta_referida,
      presupuesto_maximo_recompensas: resumenRegla.presupuesto_real_maximo_recompensas,
      costo_recompensas_esperado_por_venta: resumenRegla.costo_recompensas_actual_por_venta,
      cac_referido_esperado_modelo: resumenRegla.cac_referido_total_calculado,
      cac_referido_observado_simulado: costoPorVentaObservadoSimulado,
      gasto_recompensas_acumulado_simulado: gastoRecompensasReal,
      cumple_regla_300: resumenRegla.cumple_regla_300 && costoPorVentaObservadoSimulado <= CASE_CONSTANTS.TOPE_CAC_REFERIDO,
      comparativa_cac_canales: CASE_CONSTANTS.COMPARATIVA_CANALES
    },
    capacidad_visitas: estadoCapacidad,
    plan_crecimiento_y_honestidad_tecnico_nuevo: {
      capacidad_tecnico_nuevo: 50,
      costo_mensual_tecnico_nuevo: 1800,
      visitas_por_lead_referido: 0.727,
      leads_referidos_necesarios: 69,
      rendimiento_letrero_referencia: '6 leads en 20 casas en 2 meses (0,3 leads por casa en 2 meses; 0,15 leads/casa/mes)',
      familias_compartiendo_en_2_meses: 230,
      porcentaje_base_420_familias: 55,
      veredicto_honesto: 'En un solo mes NO alcanza para llenar las 50 visitas de un técnico nuevo solo con referidos (harían falta 460 familias activas al ritmo del letrero, más de las 420 que existen). Por eso en los primeros 90 días los referidos sustituyen las visitas caras y de bajo cierre de Meta ($233/visita vs $671/visita en referidos), y el técnico extra se contrata cuando la base activa supere las 115–230 familias compartiendo.'
    },
    metrica_semanal_retencion: {
      definicion_retener: 'Como una familia compra paneles cada 15–20 años, "retener" no es recompra sino mantener a la familia orgullosa de su ahorro y compartiendo activamente su prueba con vecinos.',
      nombre_metrica: 'Familias Activas Compartiendo en los últimos 30 días por cada 100 instaladas (FAC-30)',
      valor_base_hoy: '8% refiere al año (~0,7% mensual), aunque el 40% ya enseña su recibo en papel de forma informal.',
      meta_90_dias: 'Pasar de 25% a 80% de familias que conocen su ahorro mensual, y lograr ≥ 15 familias compartiendo su postal por cada 100 instaladas cada mes.'
    },
    experimento_ab_50_clientes: {
      diseno: 'Prueba A/B aleatoria durante 30 días con 50 familias instaladas: Grupo Control (25 familias, experiencia actual: 0 mensajes post-instalación) vs. Grupo Tratamiento (25 familias, reciben por WhatsApp su Postal Celestial del Sol con ahorro mensual del inversor + link de agenda directa para vecinos).',
      por_que_metrica_corto_plazo: 'Con 50 familias y una tasa base de 8% de referidos al año (~0.33 ventas esperadas en un mes), medir ventas cerradas en 30 días no tiene potencia estadística. La métrica principal debe medir el comportamiento intermedio donde hoy se pierde el 60%–92% del potencial.',
      hipotesis: 'Si enviamos el reporte visual de ahorro con link de agenda directa (en 3 pasos y sin esperar las 31 horas de llamada), entonces el % de familias que comparte su prueba de ahorro con al menos un vecino en 30 días pasará de <5% rastreable hoy (40% informal) a ≥ 32% (al menos 8 de las 25 familias), generando ≥ 5 vecinos que usan la calculadora y ≥ 3 visitas agendadas.',
      metrica_principal: '% de familias del grupo que comparte su postal verificada (clic de vecino único en su link) en 30 días (Meta: ≥ 32%, es decir ≥ 8 de 25 familias).',
      contrametricas: [
        'Costo total por venta referida (visitas + recompensas) ≤ $300.',
        'Tasa de asistencia a visitas agendadas por vecinos ≥ 85% (que agendar sin llamada previa de Paola no suba las inasistencias).',
        'Saturación de agenda: no desplazar visitas de Google Ads ($428/visita), desplazando únicamente el excedente de Meta Ads ($233/visita).'
      ]
    },
    reservas_recientes: listaReservas
  });
}

function obtenerIPLocalRed() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

/**
 * GET /api/qr/:codigo_ref
 * Genera un código QR REAL (estándar ISO/IEC 18004) escaneable con la cámara del celular
 */
async function generarQRRealVecino(req, res) {
  const codigoRef = sanitizarTexto(req.params.codigo_ref, 60);
  const ipRed = obtenerIPLocalRed();
  const port = process.env.PORT || 3001;
  const baseUrl = req.query.base
    ? String(req.query.base).replace(/\/$/, '')
    : `http://${ipRed}:${port}`;
  const urlDestino = `${baseUrl}/vecino/${encodeURIComponent(codigoRef)}`;

  try {
    const svgReal = await QRCode.toString(urlDestino, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 132,
      color: {
        dark: '#3d2327',
        light: '#faf4ea'
      }
    });

    res.json({
      ok: true,
      codigo_ref: codigoRef,
      url_escaneable: urlDestino,
      ip_red_local: ipRed,
      svg: svgReal
    });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo generar el código QR real.' });
  }
}

module.exports = {
  obtenerEstadoSalud,
  avanzarEstadoReservaDemo,
  obtenerPanelAndres,
  generarQRRealVecino,
  seedDatabase
};
