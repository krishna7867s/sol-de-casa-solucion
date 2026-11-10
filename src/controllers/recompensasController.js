const { CASE_CONSTANTS, calcularCostoPorVentaRecompensa } = require('../constants');
const { sanitizarTexto } = require('../middleware/validate');
const { Recompensa } = require('../models/orm');

/**
 * Función de dominio: Calcula el costo de recompensas por venta frente al tope de $300
 * de Andrés ($133,33 de las 2,22 visitas + recompensas <= $300 -> tope real ≈ $167).
 */
function obtenerResumenReglaAndres() {
  const recompensas = Recompensa.findAllActive();
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

/**
 * GET /api/recompensas/catalogo
 * Pieza 4: Catálogo de recompensas con costo por venta calculado en servidor
 */
function listarCatalogoRecompensas(req, res) {
  const resumen = obtenerResumenReglaAndres();
  res.json({
    explicacion_cuentas: {
      por_que_el_presupuesto_es_167_y_no_300: 'Cada venta referida requiere 1 / 0.45 = 2.22 visitas técnicas. A $60 por visita, las visitas cuestan $133.33 por venta cerrada. Como el tope de Andrés es $300 por venta referida (incluyendo visitas), quedan exactamente $166.67 (≈ $167) para recompensas.',
      por_que_agendar_pesa_2_47: 'De cada vecino que agenda, el 90% realiza la visita y el 45% de las visitas firma (0.90 × 0.45 = 0.405 ventas por agenda). Por tanto, hay 1 / 0.405 = 2.469 (≈ 2.47) agendas por cada venta cerrada. Cada $1 pagado al agendar cuesta $2.47 por venta cerrada; cada $1 pagado al firmar cuesta $1.00 por venta cerrada.',
      trampa_evitada: 'Si diéramos una limpieza fuera del plan ($60) al agendar, costaría $60 × 2.469 = $148.15 por venta cerrada solo por agendar, dejando casi sin presupuesto el cierre.'
    },
    ...resumen
  });
}

/**
 * POST /api/recompensas/validar-o-agregar
 * Pieza 4: Valida que una recompensa no supere los $300 por venta referida (la rechaza si se pasa)
 */
function validarOAgregarRecompensa(req, res) {
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

    Recompensa.create({
      codigo: cod,
      nombre: nom,
      descripcion: desc,
      disparador,
      quien_recibe: receptor,
      costo_sol_de_casa: Number(costo_sol_de_casa),
      multiplicador_embudo: mult,
      costo_por_venta_calculado: costoPorVentaNueva
    });
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
}

module.exports = {
  obtenerResumenReglaAndres,
  listarCatalogoRecompensas,
  validarOAgregarRecompensa
};
