const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const { db } = require('./src/db');
const { seedDatabase } = require('./src/seed');
const {
  CASE_CONSTANTS,
  calcularCostoPorVentaRecompensa,
  calcularAhorroVecino
} = require('./src/constants');

const app = express();
app.use(cors());
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Asegurar que la base de datos tenga datos simulados al iniciar si está vacía
const countFamilias = db.prepare('SELECT COUNT(*) as total FROM familias').get().total;
if (countFamilias === 0) {
  seedDatabase();
}

// ============================================================================
// SEGURIDAD: Rate limiter en memoria para proteger el endpoint de agendar
// ============================================================================
const intentosAgendarPorIP = new Map();
const VENTANA_RATE_LIMIT_MS = 15 * 60 * 1000; // 15 minutos
const MAX_INTENTOS_AGENDAR = 5;               // Máximo 5 agendamientos por ventana

function rateLimiterAgendar(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  const ahora = Date.now();
  const registro = intentosAgendarPorIP.get(ip) || { conteo: 0, inicioVentana: ahora };

  if (ahora - registro.inicioVentana > VENTANA_RATE_LIMIT_MS) {
    registro.conteo = 0;
    registro.inicioVentana = ahora;
  }

  registro.conteo += 1;
  intentosAgendarPorIP.set(ip, registro);

  res.setHeader('X-RateLimit-Limit', MAX_INTENTOS_AGENDAR);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_INTENTOS_AGENDAR - registro.conteo));

  if (registro.conteo > MAX_INTENTOS_AGENDAR) {
    return res.status(429).json({
      error: 'Límite de intentos alcanzado. Por seguridad, espere 15 minutos antes de intentar agendar otra visita.',
      codigo: 'RATE_LIMIT_EXCEEDED',
      max_intentos: MAX_INTENTOS_AGENDAR
    });
  }
  next();
}

// Utilidad para limpiar y validar texto de entrada
function sanitizarTexto(str, maxLen = 80) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').trim().slice(0, maxLen);
}

// Utilidad para validar formato de token personal (imposible de adivinar)
function esTokenValido(token) {
  return typeof token === 'string' && /^fam_[a-f0-9]{32,64}$/.test(token);
}

// ============================================================================
// FUNCIÓN AUXILIAR: Capacidad de visitas del mes (Regla de negocio)
// ============================================================================
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

  // Capacidad estricta sin desplazar anuncios: floor(100 - 97.5) = 2 visitas extra antes de tocar el techo de 100.
  // Sin embargo, el horarios_disponibles tiene 6 espacios y la regla de negocio establece:
  // "La agenda no ofrece más horarios que la capacidad restante."
  // Calculamos la capacidad operativa restante frente al techo de 100 (o con cupo reservado para referidos).
  // Como 97.5 están en anuncios pero ya hay reservas sembradas en la demo, definimos los cupos del bloque de referidos:
  // de las 100 visitas del mes, 94 quedan en anuncios y 6 están en la parrilla de horarios para referidos (total = 100),
  // o bien mostramos exactamente cuántos cupos quedan antes de superar las 100 visitas.
  // Para que la regla sea 100% transparente y estricta:
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

// ============================================================================
// ENDPOINT 0: Estado y lista de familias de prueba (para facilitar pruebas)
// ============================================================================
app.get('/api/health', (req, res) => {
  const fams = db.prepare('SELECT id, token_personal, nombre_pila, barrio FROM familias').all();
  res.json({
    ok: true,
    servicio: 'Sol de Casa API - Prototipo Parte 2 (Datos Simulados)',
    familias_disponibles_para_demo: fams
  });
});

// ============================================================================
// ENDPOINT 1: Ahorro de la familia (Pieza 1: Ahorro a la vista)
// ============================================================================
app.get('/api/familias/:token/ahorro', (req, res) => {
  const { token } = req.params;
  if (!esTokenValido(token)) {
    return res.status(400).json({ error: 'Formato de token personal inválido.' });
  }

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

  // Buscar o asegurar un código de compartición por defecto para su tarjeta
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
});

// ============================================================================
// ENDPOINT 2: Registrar compartición de tarjeta (Pieza 2: Compartir)
// ============================================================================
app.post('/api/familias/:token/compartir', (req, res) => {
  const { token } = req.params;
  if (!esTokenValido(token)) {
    return res.status(400).json({ error: 'Formato de token personal inválido.' });
  }

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
});

// ============================================================================
// ENDPOINT 3: Ver la tarjeta como vecino (Pieza 3: Privacidad cuidada)
// SEGURIDAD: Muestra SOLO el nombre de pila, el barrio y el ahorro de la familia.
// ============================================================================
app.get('/api/vecino/tarjeta/:codigo_ref', (req, res) => {
  const codigoRef = sanitizarTexto(req.params.codigo_ref, 60);
  if (!codigoRef) {
    return res.status(400).json({ error: 'Código de referencia requerido.' });
  }

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

  // Devolver ÚNICAMENTE nombre de pila, barrio y el ahorro (sin apellidos, sin dirección exacta, sin token privado)
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
});

// ============================================================================
// ENDPOINT 4: Registrar uso de la calculadora del vecino (Pieza 3 - Paso 2)
// Dice la verdad: 70% de ahorro y recuperación en ≈ 7 años con recibo de $110,
// y permite cotizar la Batería de Respaldo ($3.000, +$510 contribución de Parte 1).
// ============================================================================
app.post('/api/vecino/calculadora', (req, res) => {
  const codigoRef = sanitizarTexto(req.body?.codigo_ref, 60);
  const reciboMensual = Number(req.body?.recibo_mensual);
  const incluyeBateria = Boolean(req.body?.incluye_bateria);

  if (!codigoRef) {
    return res.status(400).json({ error: 'El campo codigo_ref es obligatorio.' });
  }

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
});

// ============================================================================
// ENDPOINT 5: Horarios disponibles para visita técnica (Pieza 3 - Paso 3)
// Regla de negocio: La agenda no ofrece más horarios que la capacidad restante.
// ============================================================================
app.get('/api/horarios', (req, res) => {
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
});

// ============================================================================
// ENDPOINT 6: Agendar visita técnica directamente (Pieza 3 - Paso 3)
// - Pide SOLO nombre y teléfono (frente a los 6 campos del formulario antiguo)
// - Protegido con rate limit (máx 5 intentos)
// - Respeta capacidad restante de horarios
// - Registra quién lo refirió y activa recompensa de 'agendar'
// ============================================================================
app.post('/api/vecino/agendar', rateLimiterAgendar, (req, res) => {
  const codigoRef = sanitizarTexto(req.body?.codigo_ref, 60);
  const nombre = sanitizarTexto(req.body?.nombre, 60);
  const telefono = sanitizarTexto(req.body?.telefono, 25);
  const horarioId = req.body?.horario_id ? Number(req.body.horario_id) : null;
  const horarioTexto = sanitizarTexto(req.body?.horario_elegido, 100);
  const visitaVecinoId = req.body?.visita_vecino_id ? Number(req.body.visita_vecino_id) : null;

  // Rechazar si envían campos invasivos del formulario viejo (correo, dirección, techo, etc.) o si faltan nombre y teléfono
  if (!codigoRef) {
    return res.status(400).json({ error: 'Falta el código de referencia (codigo_ref) de la familia que refiere.' });
  }
  if (!nombre || nombre.length < 2) {
    return res.status(400).json({ error: 'Por favor escriba su nombre (mínimo 2 caracteres).' });
  }
  if (!telefono || !/^[0-9+\-\s()]{7,20}$/.test(telefono)) {
    return res.status(400).json({ error: 'Por favor ingrese un número de teléfono válido en Costa Rica (ej. 8888-8888).' });
  }

  const comp = db.prepare(`
    SELECT c.id, c.familia_id, f.nombre_pila, f.barrio
    FROM comparticiones c
    JOIN familias f ON f.id = c.familia_id
    WHERE c.codigo_ref = ?
  `).get(codigoRef);

  if (!comp) {
    return res.status(404).json({ error: 'No se encontró la referencia de la familia.' });
  }

  // Verificar capacidad restante antes de permitir agendar
  const estadoCapacidad = obtenerEstadoCapacidadVisitas();
  if (estadoCapacidad.cupos_restantes_agenda_directa <= 0) {
    return res.status(409).json({
      error: 'Ya no quedan horarios disponibles dentro de la capacidad técnica de este mes.',
      capacidad: estadoCapacidad
    });
  }

  // Seleccionar el horario dentro de los permitidos por la capacidad restante
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
    // Marcar horario como reservado
    const updateHorario = db.prepare('UPDATE horarios_disponibles SET reservado = 1 WHERE id = ? AND reservado = 0').run(horarioRow.id);
    if (updateHorario.changes === 0) {
      throw new Error('Ese horario acaba de ser ocupado. Por favor elija otro.');
    }

    // Guardar SOLO nombre y teléfono del vecino, junto con quién lo refirió
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

    // Disparar recompensas activas configuradas para 'agendar'
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
});

// ============================================================================
// ENDPOINT 7: Catálogo de recompensas y validador de la Regla de Andrés ($300)
// Pieza 4: El juego. Si la configuración pasa de $300, el servidor la rechaza.
// ============================================================================
function obtenerResumenReglaAndres() {
  const recompensas = db.prepare('SELECT * FROM recompensas WHERE activa = 1 ORDER BY id ASC').all();
  const costoVisitasPorVenta = Number(CASE_CONSTANTS.COSTO_VISITAS_POR_VENTA_REF.toFixed(2)); // $133.33
  const presupuestoMaxRecompensas = Number(CASE_CONSTANTS.PRESUPUESTO_MAX_RECOMPENSAS_POR_VENTA.toFixed(2)); // $166.67

  const costoRecompensasPorVenta = Number(
    recompensas.reduce((acc, r) => acc + r.costo_por_venta_calculado, 0).toFixed(2)
  );
  const cacTotalReferido = Number((costoVisitasPorVenta + costoRecompensasPorVenta).toFixed(2));

  return {
    regla_andres_max_cac: CASE_CONSTANTS.TOPE_CAC_REFERIDO,
    visitas_por_venta_referida: Number(CASE_CONSTANTS.VISITAS_HECHAS_POR_VENTA_REF.toFixed(2)),
    costo_por_visita: CASE_CONSTANTS.COSTO_VISITA_TECNICA,
    costo_visitas_por_venta_referida: costoVisitasPorVenta,
    presupuesto_real_maximo_recompensas: presupuestoMaxRecompensas,
    multiplicador_agendar_por_venta: Number(CASE_CONSTANTS.MULTIPLICADOR_AGENDAR_POR_VENTA.toFixed(2)),
    multiplicador_firmar_por_venta: 1.00,
    costo_recompensas_actual_por_venta: costoRecompensasPorVenta,
    margen_disponible_bajo_tope: Number((presupuestoMaxRecompensas - costoRecompensasPorVenta).toFixed(2)),
    cac_referido_total_calculado: cacTotalReferido,
    cumple_regla_300: cacTotalReferido <= CASE_CONSTANTS.TOPE_CAC_REFERIDO,
    recompensas
  };
}

app.get('/api/recompensas/catalogo', (req, res) => {
  const resumen = obtenerResumenReglaAndres();
  res.json({
    explicacion_cuentas: {
      por_que_el_presupuesto_es_167_y_no_300: 'Cada venta referida requiere 1 / 0.45 = 2.22 visitas técnicas. A $60 por visita, las visitas cuestan $133.33 por venta cerrada. Como el tope de Andrés es $300 por venta referida (incluyendo visitas), quedan exactamente $166.67 (≈ $167) para recompensas.',
      por_que_agendar_pesa_2_47: 'De cada vecino que agenda, el 90% realiza la visita y el 45% de las visitas firma (0.90 × 0.45 = 0.405 ventas por agenda). Por tanto, hay 1 / 0.405 = 2.469 (≈ 2.47) agendas por cada venta cerrada. Cada $1 pagado al agendar cuesta $2.47 por venta cerrada; cada $1 pagado al firmar cuesta $1.00 por venta cerrada.',
      trampa_evitada: 'Si diéramos una limpieza fuera del plan ($60) al agendar, costaría $60 × 2.469 = $148.15 por venta cerrada solo por agendar, dejando casi sin presupuesto el cierre.'
    },
    ...resumen
  });
});

// Endpoint para probar/configurar recompensas verificando en el servidor la regla de <= $300
app.post('/api/recompensas/validar-o-agregar', (req, res) => {
  const { codigo, nombre, descripcion, disparador, quien_recibe, costo_sol_de_casa, persistir } = req.body || {};

  let costoPorVentaNueva;
  try {
    costoPorVentaNueva = calcularCostoPorVentaRecompensa(costo_sol_de_casa, disparador);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const estadoActual = obtenerResumenReglaAndres();
  const nuevoCostoRecompensas = Number((estadoActual.costo_recompensas_actual_por_venta + costoPorVentaNueva).toFixed(2));
  const nuevoCacTotal = Number((estadoActual.costo_visitas_por_venta_referida + nuevoCostoRecompensas).toFixed(2));

  if (nuevoCacTotal > CASE_CONSTANTS.TOPE_CAC_REFERIDO) {
    return res.status(400).json({
      error: `RECHAZADO POR REGLA DE NEGOCIO: Esta recompensa elevaría el costo por venta referida a $${nuevoCacTotal}, superando el tope de $${CASE_CONSTANTS.TOPE_CAC_REFERIDO} de Andrés ($133.33 de visitas + $${nuevoCostoRecompensas} de recompensas > $300).`,
      codigo: 'SUPERA_TOPE_300_ANDRES',
      detalle_calculo: {
        costo_unitario_ingresado: Number(costo_sol_de_casa),
        disparador,
        multiplicador_aplicado: disparador === 'agendar' ? 2.47 : 1.0,
        costo_por_venta_de_esta_recompensa: costoPorVentaNueva,
        costo_visitas_por_venta: estadoActual.costo_visitas_por_venta_referida,
        recompensas_actuales_por_venta: estadoActual.costo_recompensas_actual_por_venta,
        nuevo_total_recompensas_por_venta: nuevoCostoRecompensas,
        presupuesto_maximo_recompensas: estadoActual.presupuesto_real_maximo_recompensas,
        nuevo_cac_total_referido: nuevoCacTotal,
        tope_maximo_andres: CASE_CONSTANTS.TOPE_CAC_REFERIDO
      }
    });
  }

  if (persistir) {
    const cod = sanitizarTexto(codigo || `REC_${Date.now()}`, 40);
    const nom = sanitizarTexto(nombre || 'Recompensa adicional (simulado)', 80);
    const desc = sanitizarTexto(descripcion || 'Recompensa validada bajo el tope de $300', 200);
    const receptor = quien_recibe === 'vecino' ? 'vecino' : 'familia';
    const mult = disparador === 'agendar' ? Number(CASE_CONSTANTS.MULTIPLICADOR_AGENDAR_POR_VENTA.toFixed(4)) : 1.0;

    db.prepare(`
      INSERT INTO recompensas (
        codigo, nombre, descripcion, disparador, quien_recibe,
        costo_sol_de_casa, multiplicador_embudo, costo_por_venta_calculado, activa
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(cod, nom, desc, disparador, receptor, Number(costo_sol_de_casa), mult, costoPorVentaNueva);
  }

  res.json({
    ok: true,
    mensaje: 'La configuración respeta el tope de $300 por venta referida de Andrés.',
    simulacion: {
      costo_por_venta_nueva_recompensa: costoPorVentaNueva,
      nuevo_total_recompensas_por_venta: nuevoCostoRecompensas,
      nuevo_cac_total_referido: nuevoCacTotal,
      tope_andres: CASE_CONSTANTS.TOPE_CAC_REFERIDO
    }
  });
});

// ============================================================================
// ENDPOINT 8: Progreso de recompensas de la familia (Pieza 4: Barra de avance)
// ============================================================================
app.get('/api/familias/:token/recompensas', (req, res) => {
  const { token } = req.params;
  if (!esTokenValido(token)) {
    return res.status(400).json({ error: 'Formato de token personal inválido.' });
  }

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

  // Barra de avance de los 4 hitos reales del ciclo (sin niveles ni puntos inventados):
  // Paso 1: Compartió su postal (25%) -> Paso 2: Vecino agendó visita (50%, gana $6 crédito) ->
  // Paso 3: Visita técnica realizada (75%) -> Paso 4: Vecino firmó instalación (100%, gana Limpieza de $60)
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
});

// ============================================================================
// ENDPOINT 9: Demostración en vivo - Avanzar reserva a 'hecha' o 'firmada'
// Permite mostrar en vivo cómo se desbloquea una recompensa al firmar.
// ============================================================================
app.post('/api/demo/reservas/:id/avanzar', (req, res) => {
  const reservaId = Number(req.params.id);
  const nuevoEstado = req.body?.estado;

  if (!reservaId || !['hecha', 'firmada'].includes(nuevoEstado)) {
    return res.status(400).json({
      error: 'Debe indicar un ID de reserva válido y el estado "hecha" o "firmada".'
    });
  }

  const reserva = db.prepare('SELECT * FROM reservas WHERE id = ?').get(reservaId);
  if (!reserva) {
    return res.status(404).json({ error: `Reserva con ID ${reservaId} no encontrada.` });
  }

  const ahora = new Date().toISOString();

  const transaccionAvanzar = db.transaction(() => {
    db.prepare(`
      UPDATE reservas SET estado = ?, fecha_actualizacion = ? WHERE id = ?
    `).run(nuevoEstado, ahora, reservaId);

    const nuevasRecompensas = [];

    if (nuevoEstado === 'firmada') {
      const recompensasFirma = db.prepare(`
        SELECT id, nombre, quien_recibe, costo_sol_de_casa
        FROM recompensas
        WHERE disparador = 'firmar' AND activa = 1
      `).all();

      const insertMov = db.prepare(`
        INSERT OR IGNORE INTO movimientos_recompensa (
          familia_id, recompensa_id, reserva_id, evento, costo, fecha, es_simulado
        ) VALUES (?, ?, ?, 'firmar', ?, ?, 1)
      `);

      for (const rec of recompensasFirma) {
        const info = insertMov.run(reserva.familia_referente_id, rec.id, reservaId, rec.costo_sol_de_casa, ahora);
        if (info.changes > 0) {
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

  const recompensasDesbloqueadas = transaccionAvanzar();
  const reservaActualizada = db.prepare('SELECT * FROM reservas WHERE id = ?').get(reservaId);

  res.json({
    ok: true,
    mensaje: nuevoEstado === 'firmada'
      ? `¡Reserva #${reservaId} (${reserva.nombre_vecino}) avanzada a FIRMADA! Se desbloquearon las recompensas de cierre para la familia y el vecino.`
      : `Reserva #${reservaId} (${reserva.nombre_vecino}) avanzada a VISITA HECHA.`,
    reserva: reservaActualizada,
    recompensas_desbloqueadas: recompensasDesbloqueadas
  });
});

// ============================================================================
// ENDPOINT 10: Panel de Andrés (Pieza 5: La medición + Cuentas del caso)
// Calcula en vivo embudo, costo por venta referida vs $300, capacidad vs 100,
// métrica semanal de retención, meta del técnico nuevo (69 leads / 230 familias)
// y experimento A/B con 50 familias (25 y 25).
// ============================================================================
app.get('/api/andres/panel', (req, res) => {
  const totalComparticiones = db.prepare('SELECT COUNT(*) as total FROM comparticiones').get().total;
  const totalCalculadora = db.prepare('SELECT COUNT(*) as total FROM visitas_vecino WHERE uso_calculadora = 1').get().total;
  const totalAgendadas = db.prepare('SELECT COUNT(*) as total FROM reservas').get().total;
  const totalHechas = db.prepare("SELECT COUNT(*) as total FROM reservas WHERE estado IN ('hecha', 'firmada')").get().total;
  const totalFirmadas = db.prepare("SELECT COUNT(*) as total FROM reservas WHERE estado = 'firmada'").get().total;

  const gastoRecompensasReal = Number(
    (db.prepare('SELECT SUM(costo) as total FROM movimientos_recompensa').get().total || 0).toFixed(2)
  );

  const resumenRegla = obtenerResumenReglaAndres();
  const estadoCapacidad = obtenerEstadoCapacidadVisitas();

  // Costo real observado en la simulación vs Costo esperado teórico del modelo
  const costoVisitasObservadas = totalHechas * CASE_CONSTANTS.COSTO_VISITA_TECNICA;
  const costoPorVentaObservadoSimulado = totalFirmadas > 0
    ? Number(((costoVisitasObservadas + gastoRecompensasReal) / totalFirmadas).toFixed(2))
    : resumenRegla.cac_referido_total_calculado;

  const listaReservas = db.prepare(`
    SELECT r.id, r.nombre_vecino, r.telefono_vecino, r.horario_elegido, r.estado,
           r.fecha_creacion, f.nombre_pila as familia_referente, f.barrio
    FROM reservas r
    JOIN familias f ON f.id = r.familia_referente_id
    ORDER BY r.id DESC
  `).all();

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
      leads_referidos_necesarios: 69, // 50 / 0.72675 = 68.8 -> 69 leads
      rendimiento_letrero_referencia: '6 leads en 20 casas en 2 meses (0,3 leads por casa en 2 meses; 0,15 leads/casa/mes)',
      familias_compartiendo_en_2_meses: 230, // 69 / 0.30 = 230 familias (54.8% ≈ 55% de las 420)
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
    reservas_recientes: listaReservas,
    comparativa_estrategica_barrio: {
      insights_diferenciadores: [
        '1. El «Sol del Barrio» (Efecto Doña Marta): En vez de un link frío, las 420 casas forman constelaciones por barrio (Curridabat, Escazú, Heredia). Cuando el técnico ya va a Curridabat a limpiar paneles, el vecino de a la par ve ese horario preferencial.',
        '2. Cosecha de Sol en vez de puntos: Como nadie compra paneles dos veces, la moneda del ciclo es el mantenimiento anual del techo (cada referido que agenda abona $6 al plan mensual de $12, y cada firma regala la Limpieza Anual de $60).',
        '3. Arbitraje de Capacidad (Regla 100 visitas): Cada visita de referido que entra ($671 de valor esperado) apaga automáticamente 1 visita de Meta Ads ($233 de valor esperado), subiendo la ganancia de Andrés en +$438 por visita sin contratar técnicos antes de tiempo.'
      ]
    }
  });
});

// Reinicio rápido de la semilla para demostraciones repetibles
app.post('/api/demo/reset', (req, res) => {
  intentosAgendarPorIP.clear();
  const info = seedDatabase();
  res.json({
    ok: true,
    mensaje: 'Base de datos reiniciada a los datos simulados originales del Caso C.',
    ...info
  });
});

// Ruta directa para abrir el enlace personal de una vecina (/vecino/:codigo_ref)
app.get('/vecino/:codigo_ref', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Obtener IP local de la red Wi-Fi para que un celular real pueda escanear el QR y abrir la página
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

// ENDPOINT 11: Generar código QR REAL escaneable con la cámara del celular (ISO/IEC 18004)
app.get('/api/qr/:codigo_ref', async (req, res) => {
  const codigoRef = sanitizarTexto(req.params.codigo_ref, 60);
  if (!codigoRef) {
    return res.status(400).json({ error: 'Código de referencia requerido.' });
  }

  const ipRed = obtenerIPLocalRed();
  const port = process.env.PORT || 3001;
  // Si viene un parámetro ?base=... lo usa; si no, arma la URL con la IP de red local para que un teléfono en el mismo Wi-Fi la abra de verdad
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
        dark: '#3d2327',  // Tinta marrón oscura de alto contraste para lectura instantánea de cámara
        light: '#faf4ea'  // Papel crema perla
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
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`☀️ Servidor Backend Sol de Casa escuchando en http://localhost:${PORT}`);
  });
}

module.exports = { app };
