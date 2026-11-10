const crypto = require('crypto');
const { db } = require('../db');
const { CASE_CONSTANTS } = require('../constants');
const { obtenerResumenReglaAndres } = require('./recompensasController');

/**
 * GET /api/familias/:token/ahorro
 * Pieza 1: Ahorro a la vista (mes actual y acumulado al 70% simulado del inversor)
 */
function obtenerAhorroFamilia(req, res) {
  const { token } = req.params;

  const familia = db.prepare(`
    SELECT id, token_personal, nombre_pila, nombre_completo, barrio,
           fecha_instalacion, recibo_antes, tiene_plan_mantenimiento, es_simulado
    FROM familias WHERE token_personal = ?
  `).get(token);

  if (!familia) {
    return res.status(404).json({ error: 'Familia no encontrada.' });
  }

  const historial = db.prepare(`
    SELECT mes, etiqueta_mes, kwh_producidos, recibo_antes, recibo_despues, ahorro, es_simulado
    FROM ahorros_mensuales
    WHERE familia_id = ?
    ORDER BY mes DESC
  `).all(familia.id);

  const ultimoMes = historial[0] || null;
  const ahorroAcumulado = Number(
    historial.reduce((acc, row) => acc + row.ahorro, 0).toFixed(2)
  );
  const kwhAcumulados = Math.round(
    historial.reduce((acc, row) => acc + row.kwh_producidos, 0)
  );

  let comparticionActiva = db.prepare(`
    SELECT codigo_ref, canal, fecha FROM comparticiones
    WHERE familia_id = ? ORDER BY id DESC LIMIT 1
  `).get(familia.id);

  if (!comparticionActiva) {
    const nuevoRef = `ref_${familia.id}_${crypto.randomBytes(6).toString('hex')}`;
    db.prepare(`
      INSERT INTO comparticiones (codigo_ref, familia_id, canal, fecha, es_simulado)
      VALUES (?, ?, 'LinkDirecto', ?, 1)
    `).run(nuevoRef, familia.id, new Date().toISOString());
    comparticionActiva = { codigo_ref: nuevoRef, canal: 'LinkDirecto', fecha: new Date().toISOString() };
  }

  res.json({
    nota_datos: 'Datos simulados al 70% de ahorro a partir de lecturas horarias del inversor (simulado)',
    familia: {
      nombre_pila: familia.nombre_pila,
      nombre_completo: familia.nombre_completo,
      barrio: familia.barrio,
      fecha_instalacion: familia.fecha_instalacion,
      recibo_antes: familia.recibo_antes,
      porcentaje_ahorro_promedio: 70,
      tiene_plan_mantenimiento: Boolean(familia.tiene_plan_mantenimiento),
      es_simulado: Boolean(familia.es_simulado)
    },
    resumen_ahorro: {
      mes_actual: ultimoMes ? ultimoMes.etiqueta_mes : 'Octubre 2026 (simulado)',
      ahorro_ultimo_mes: ultimoMes ? ultimoMes.ahorro : Number((familia.recibo_antes * 0.70).toFixed(2)),
      recibo_antes_ultimo_mes: ultimoMes ? ultimoMes.recibo_antes : familia.recibo_antes,
      recibo_despues_ultimo_mes: ultimoMes ? ultimoMes.recibo_despues : Number((familia.recibo_antes * 0.30).toFixed(2)),
      ahorro_acumulado_total: ahorroAcumulado,
      meses_instalados: historial.length,
      kwh_solares_acumulados: kwhAcumulados
    },
    link_compartir: {
      codigo_ref: comparticionActiva.codigo_ref,
      url_relativa: `/vecino/${comparticionActiva.codigo_ref}`,
      mensaje_whatsapp_sugerido: `¡Hola vecina! Le cuento que en nuestra casa en ${familia.barrio} el recibo de luz bajó un 70% con Sol de Casa. Este mes nos ahorramos $${ultimoMes ? ultimoMes.ahorro : 77} (simulado). Aquí puede ver mi postal de ahorro y calcular cuánto le bajaría su recibo y agendar directo sin esperar que la llamen:`
    },
    gatillo_conductual_inversor: {
      momento_optimo_detectado: `Día de cierre del recibo de luz en ${familia.barrio.split(',')[0]} + Récord solar del inversor`,
      alerta_inteligente: `¡Momento ideal para compartir! Hoy llegó el cobro de luz en ${familia.barrio.split(',')[0]} y sus paneles acaban de cruzar $${ahorroAcumulado} de ahorro acumulado (simulado). Además, el técnico Jorge tiene ruta programada en su barrio esta semana.`,
      upsell_bateria_familia: {
        titulo: 'Elegible para Batería de Respaldo contra apagones ($3.000)',
        detalle: `Con su ahorro de $${ultimoMes ? ultimoMes.ahorro : 77}/mes, usted ya financia el 75% de una Batería de Respaldo para cortes de luz (Parte 1, Sección 4).`
      }
    },
    historial_mensual: historial
  });
}

/**
 * POST /api/familias/:token/compartir
 * Pieza 2: Registrar compartición de la postal de ahorro por WhatsApp o Publicación
 */
function registrarComparticionFamilia(req, res) {
  const { token } = req.params;

  const familia = db.prepare('SELECT id, nombre_pila, barrio, recibo_antes FROM familias WHERE token_personal = ?').get(token);
  if (!familia) {
    return res.status(404).json({ error: 'Familia no encontrada.' });
  }

  const canalesValidos = ['WhatsApp', 'Publicacion', 'LinkDirecto', 'QR_Vecino'];
  const canal = canalesValidos.includes(req.body?.canal) ? req.body.canal : 'WhatsApp';

  const codigoRef = `ref_${familia.id}_${crypto.randomBytes(6).toString('hex')}`;
  const fecha = new Date().toISOString();

  const info = db.prepare(`
    INSERT INTO comparticiones (codigo_ref, familia_id, canal, fecha, es_simulado)
    VALUES (?, ?, ?, ?, 1)
  `).run(codigoRef, familia.id, canal, fecha);

  const ahorroMes = Number((familia.recibo_antes * CASE_CONSTANTS.PCT_AHORRO_PROMEDIO).toFixed(2));

  res.status(201).json({
    ok: true,
    mensaje: 'Tarjeta de ahorro lista para compartir (simulado).',
    comparticion: {
      id: info.lastInsertRowid,
      codigo_ref: codigoRef,
      canal,
      fecha,
      url_vecino: `/vecino/${codigoRef}`,
      postal_publica: {
        nombre_pila: familia.nombre_pila,
        barrio: familia.barrio,
        ahorro_mes: ahorroMes,
        etiqueta: 'Datos simulados al 70% de ahorro'
      }
    }
  });
}

/**
 * GET /api/familias/:token/recompensas
 * Pieza 4: Progreso y barra de avance de recompensas de la familia
 */
function obtenerProgresoRecompensasFamilia(req, res) {
  const { token } = req.params;

  const familia = db.prepare('SELECT id, nombre_pila, nombre_completo, barrio FROM familias WHERE token_personal = ?').get(token);
  if (!familia) {
    return res.status(404).json({ error: 'Familia no encontrada.' });
  }

  const reservasVecinos = db.prepare(`
    SELECT id, nombre_vecino, horario_elegido, estado, fecha_creacion, fecha_actualizacion
    FROM reservas
    WHERE familia_referente_id = ?
    ORDER BY id DESC
  `).all(familia.id);

  const movimientos = db.prepare(`
    SELECT m.id, m.evento, m.costo, m.fecha, m.reserva_id,
           r.nombre as recompensa_nombre, r.quien_recibe, r.disparador,
           res.nombre_vecino
    FROM movimientos_recompensa m
    JOIN recompensas r ON r.id = m.recompensa_id
    JOIN reservas res ON res.id = m.reserva_id
    WHERE m.familia_id = ?
    ORDER BY m.id DESC
  `).all(familia.id);

  const totalComparticiones = db.prepare('SELECT COUNT(*) as total FROM comparticiones WHERE familia_id = ?').get(familia.id).total;
  const totalVecinosCalculadora = db.prepare('SELECT COUNT(*) as total FROM visitas_vecino WHERE familia_referente_id = ? AND uso_calculadora = 1').get(familia.id).total;
  const totalAgendadas = reservasVecinos.length;
  const totalHechas = reservasVecinos.filter(r => r.estado === 'hecha' || r.estado === 'firmada').length;
  const totalFirmadas = reservasVecinos.filter(r => r.estado === 'firmada').length;

  let porcentajeAvanceCicloActual = 0;
  let etapaActual = 'Lista para compartir su postal de ahorro';
  if (totalComparticiones > 0) {
    porcentajeAvanceCicloActual = 25;
    etapaActual = 'Postal compartida · esperando que su vecino agende';
  }
  if (totalAgendadas > 0) {
    porcentajeAvanceCicloActual = 50;
    etapaActual = 'Vecino agendó visita · Crédito de $6 en mantenimiento activado';
  }
  if (totalHechas > 0) {
    porcentajeAvanceCicloActual = 75;
    etapaActual = 'Visita técnica realizada · Propuesta entregada al vecino';
  }
  if (totalFirmadas > 0) {
    porcentajeAvanceCicloActual = 100;
    etapaActual = '¡Vecino instaló con Sol de Casa! · Limpieza Solar Anual ($60) desbloqueada';
  }

  const resumenRegla = obtenerResumenReglaAndres();

  res.json({
    familia: {
      nombre_pila: familia.nombre_pila,
      nombre_completo: familia.nombre_completo,
      barrio: familia.barrio
    },
    barra_avance: {
      porcentaje: porcentajeAvanceCicloActual,
      etapa_actual: etapaActual,
      hitos: [
        { paso: 1, titulo: 'Postal compartida', completado: totalComparticiones > 0, recompensa: 'Link personal activo' },
        { paso: 2, titulo: 'Vecino agenda visita', completado: totalAgendadas > 0, recompensa: '$6 de abono en Plan de Mantenimiento (costo por venta: $14.81)' },
        { paso: 3, titulo: 'Técnico mide el techo', completado: totalHechas > 0, recompensa: 'Prioridad en agenda técnica' },
        { paso: 4, titulo: 'Vecino firma sus paneles', completado: totalFirmadas > 0, recompensa: '1 Limpieza Solar Completa para usted ($60) + 1 para su vecino ($60)' }
      ]
    },
    resumen_actividad_familia: {
      tarjetas_compartidas: totalComparticiones,
      vecinos_usaron_calculadora: totalVecinosCalculadora,
      vecinos_agendaron: totalAgendadas,
      visitas_hechas: totalHechas,
      vecinos_firmaron: totalFirmadas,
      costo_recompensas_entregadas_familia: Number(
        movimientos.filter(m => m.quien_recibe === 'familia').reduce((a, b) => a + b.costo, 0).toFixed(2)
      )
    },
    reservas_vecinos: reservasVecinos,
    movimientos_recompensa: movimientos,
    tope_presupuesto_andres: {
      costo_visitas_por_venta: resumenRegla.costo_visitas_por_venta_referida,
      presupuesto_maximo_recompensas: resumenRegla.presupuesto_real_maximo_recompensas,
      costo_recompensas_por_venta_configurado: resumenRegla.costo_recompensas_actual_por_venta,
      cac_total_referido: resumenRegla.cac_referido_total_calculado,
      tope_andres: resumenRegla.regla_andres_max_cac
    }
  });
}

module.exports = {
  obtenerAhorroFamilia,
  registrarComparticionFamilia,
  obtenerProgresoRecompensasFamilia
};
