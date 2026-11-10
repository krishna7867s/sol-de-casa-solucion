/**
 * Constantes financieras y operativas oficiales del Caso C "Sol de Casa" (Partes 1 y 2)
 */
const CASE_CONSTANTS = {
  // 1. Economía unitaria de una instalación
  PRECIO_INSTALACION: 6500,
  PCT_EQUIPOS: 0.55,          // $3.575 (se paga el mes de la firma)
  PCT_INSTALACION: 0.17,      // $1.105 (se paga al mes siguiente)
  PCT_MARGEN_BRUTO: 0.28,     // $1.820 (100% - 55% - 17%)
  PCT_COMISION_ASESORA: 0.03, // $195 (se paga en todas las ventas, va en contribución)
  CONTRIBUCION_VENTA: 1625,   // 6500 * (0.28 - 0.03) = $1.625

  // 2. Visitas técnicas y capacidad
  COSTO_VISITA_TECNICA: 60,
  CAPACIDAD_MAXIMA_VISITAS: 100, // 2 técnicos * 50 visitas/mes
  VISITAS_OCUPADAS_ANUNCIOS_HOY: 97.5, // Meta (500*0.55*0.30*0.70 = 57.75) + Google (100*0.85*0.55*0.85 = 39.7375) = 97.4875
  COSTO_TECNICO_EXTRA: 1800,
  CAPACIDAD_TECNICO_EXTRA: 50,

  // 3. Embudo de Referidos (Parte 2)
  REF_TASA_CONTACTO: 0.95,
  REF_TASA_AGENDA: 0.85,
  REF_TASA_VISITA_HECHA: 0.90,
  REF_TASA_CIERRE: 0.45,

  // Tasas compuestas de Referidos por lead:
  // Agendas por lead = 0.95 * 0.85 = 0.8075
  // Visitas hechas por lead = 0.95 * 0.85 * 0.90 = 0.72675 (≈ 0.727)
  // Ventas por lead = 0.95 * 0.85 * 0.90 * 0.45 = 0.3270375 (≈ 0.327)
  // Agendas por cada venta cerrada = 1 / (0.90 * 0.45) = 1 / 0.405 = 2.4691358 (≈ 2.47)
  // Visitas hechas por cada venta cerrada = 1 / 0.45 = 2.2222222 (≈ 2.22)
  // Costo de visitas por venta referida = (1 / 0.45) * 60 = 133.3333333 (≈ $133.33)
  AGENDAS_POR_LEAD_REF: 0.95 * 0.85,
  VISITAS_POR_LEAD_REF: 0.95 * 0.85 * 0.90,
  VENTAS_POR_LEAD_REF: 0.95 * 0.85 * 0.90 * 0.45,
  MULTIPLICADOR_AGENDAR_POR_VENTA: 1 / (0.90 * 0.45), // 2.4691358...
  VISITAS_HECHAS_POR_VENTA_REF: 1 / 0.45,             // 2.2222222...
  COSTO_VISITAS_POR_VENTA_REF: (1 / 0.45) * 60,       // 133.3333333...

  // 4. Regla de Andrés y presupuesto de recompensas
  TOPE_CAC_REFERIDO: 300, // Máximo permitido sumando visitas + recompensas por venta cerrada
  PRESUPUESTO_MAX_RECOMPENSAS_POR_VENTA: 300 - ((1 / 0.45) * 60), // 166.6666667 (≈ $167)

  // 5. Costos reales de recompensas para Sol de Casa
  COSTO_LIMPIEZA_FUERA_PLAN: 60,
  PRECIO_PLAN_MANTENIMIENTO_MES: 12,

  // 6. Ahorro del cliente
  RECIBO_PROMEDIO_ANTES: 110,
  PCT_AHORRO_PROMEDIO: 0.70, // Ahorra 70% ($77/mes con recibo de $110)

  // 6B. Oferta del Proveedor de la Parte 1 (Sección 4): Batería de Respaldo ($3.000)
  PRECIO_BATERIA_RESPALDO: 3000,
  PCT_MARGEN_BRUTO_BATERIA: 0.20,     // $600 margen bruto
  PCT_COMISION_BATERIA: 0.03,         // $90 comisión asesora
  CONTRIBUCION_BATERIA: 510,          // $3.000 * (20% - 3%) = $510 de contribución neta extra
  TASA_ADOPCION_BATERIA_PRUEBA: 0.15, // 3 de 20 clientes en la visita la agregaron (15%)
  CONTRIBUCION_PROMEDIO_CON_BATERIA: 1625 + (0.15 * 510), // $1.701,50 por venta cerrada

  // 7. Comparativa con canales pagados hoy ($4.000 Meta + $4.000 Google)
  COMPARATIVA_CANALES: {
    referido: {
      nombre: 'Referido (Ciclo Sol de Casa)',
      cpl: 0,
      visitas_por_venta: 2.22,
      costo_visitas_por_venta: 133.33,
      cac_sin_recompensas: 133.33,
      valor_por_visita: (0.45 * 1625) - 60 // $671.25
    },
    google: {
      nombre: 'Google Ads ($4.000/mes)',
      cpl: 40,
      visitas_por_venta: 1 / 0.30, // 3.33
      cac_anuncios: 4000 / 11.92125, // $335.54
      cac_real: (4000 + (39.7375 * 60)) / 11.92125, // $535.54 (≈ $536)
      valor_por_visita: (0.30 * 1625) - 60 // $427.50 (≈ $428)
    },
    meta: {
      nombre: 'Meta Ads ($4.000/mes)',
      cpl: 8,
      visitas_por_venta: 1 / 0.18, // 5.56
      cac_anuncios: 4000 / 10.395, // $384.80
      cac_real: (4000 + (57.75 * 60)) / 10.395, // $718.13 (≈ $718)
      valor_por_visita: (0.18 * 1625) - 60 // $232.50 (≈ $233)
    }
  }
};

/**
 * Calcula el costo esperado por venta cerrada de una recompensa según qué evento la dispara.
 * - Si se dispara al 'agendar': se multiplica por (1 / (0.90 * 0.45)) ≈ 2.4691358 agendas por venta.
 * - Si se dispara al 'firmar': se multiplica por 1.00 (solo se paga cuando hay venta cerrada).
 */
function calcularCostoPorVentaRecompensa(costoUnitarioSolDeCasa, disparador) {
  const costo = Number(costoUnitarioSolDeCasa);
  if (isNaN(costo) || costo < 0) {
    throw new Error('El costo unitario para Sol de Casa debe ser un número mayor o igual a 0.');
  }
  if (disparador === 'agendar') {
    return Number((costo * CASE_CONSTANTS.MULTIPLICADOR_AGENDAR_POR_VENTA).toFixed(2));
  }
  if (disparador === 'firmar') {
    return Number(costo.toFixed(2));
  }
  throw new Error('El disparador debe ser "agendar" o "firmar".');
}

/**
 * Calcula el ahorro estimado de un vecino según su recibo mensual actual.
 * Dice la verdad del caso: 70% de ahorro sobre el recibo y recuperación frente a $6.500
 * (o $9.500 si agrega la Batería de Respaldo de $3.000 de la Parte 1).
 */
function calcularAhorroVecino(reciboMensual, incluyeBateria = false) {
  const recibo = Number(reciboMensual);
  if (isNaN(recibo) || recibo < 20 || recibo > 2000) {
    throw new Error('El monto del recibo de luz debe estar entre $20 y $2.000 mensuales.');
  }
  const conBat = Boolean(incluyeBateria);
  const inversionTotal = conBat
    ? CASE_CONSTANTS.PRECIO_INSTALACION + CASE_CONSTANTS.PRECIO_BATERIA_RESPALDO
    : CASE_CONSTANTS.PRECIO_INSTALACION;
  const contribucionSolDeCasa = conBat
    ? CASE_CONSTANTS.CONTRIBUCION_VENTA + CASE_CONSTANTS.CONTRIBUCION_BATERIA
    : CASE_CONSTANTS.CONTRIBUCION_VENTA;

  const ahorroMensual = Number((recibo * CASE_CONSTANTS.PCT_AHORRO_PROMEDIO).toFixed(2));
  const reciboNuevo = Number((recibo - ahorroMensual).toFixed(2));
  const ahorroAnual = Number((ahorroMensual * 12).toFixed(2));
  const aniosRecuperacion = Number((inversionTotal / ahorroAnual).toFixed(1));

  return {
    recibo_ingresado: recibo,
    incluye_bateria_respaldo: conBat,
    porcentaje_ahorro: 70,
    ahorro_mensual_estimado: ahorroMensual,
    recibo_nuevo_estimado: reciboNuevo,
    ahorro_anual_estimado: ahorroAnual,
    costo_instalacion_referencia: inversionTotal,
    contribucion_para_sol_de_casa: contribucionSolDeCasa,
    anios_recuperacion: aniosRecuperacion
  };
}

module.exports = {
  CASE_CONSTANTS,
  calcularCostoPorVentaRecompensa,
  calcularAhorroVecino
};

