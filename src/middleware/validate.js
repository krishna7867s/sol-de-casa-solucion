/**
 * Middleware centralizado de validación de entradas y protección de privacidad
 * Caso C "Sol de Casa" — Seguridad y Reglas de Negocio en el Backend
 */

function sanitizarTexto(str, maxLen = 80) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').trim().slice(0, maxLen);
}

/**
 * 1. Middleware para validar el token criptográfico personal de la familia (:token)
 */
function validarTokenFamilia(req, res, next) {
  const { token } = req.params;
  if (typeof token !== 'string' || !/^fam_[a-f0-9]{32,64}$/.test(token)) {
    return res.status(400).json({
      error: 'Formato de token personal inválido. Se requiere un token criptográfico largo.',
      codigo: 'INVALID_FAMILY_TOKEN'
    });
  }
  next();
}

/**
 * 2. Middleware para validar el código de referencia de una compartición (:codigo_ref o body.codigo_ref)
 */
function validarCodigoRef(req, res, next) {
  const rawRef = req.params.codigo_ref || req.body?.codigo_ref;
  const codigoRef = sanitizarTexto(rawRef, 60);

  if (!codigoRef || !/^[a-zA-Z0-9_-]{6,60}$/.test(codigoRef)) {
    return res.status(400).json({
      error: 'Código de referencia (codigo_ref) inválido o ausente.',
      codigo: 'INVALID_REF_CODE'
    });
  }

  if (req.params.codigo_ref) req.params.codigo_ref = codigoRef;
  if (req.body && req.body.codigo_ref) req.body.codigo_ref = codigoRef;
  next();
}

/**
 * 3. Middleware para validar la entrada de la Calculadora Honesta del Vecino
 */
function validarCalculadoraVecino(req, res, next) {
  const reciboMensual = Number(req.body?.recibo_mensual);
  if (isNaN(reciboMensual) || reciboMensual < 20 || reciboMensual > 2000) {
    return res.status(400).json({
      error: 'El monto del recibo de luz debe ser un número entre $20 y $2.000 mensuales.',
      codigo: 'INVALID_BILL_AMOUNT'
    });
  }
  req.body.recibo_mensual = reciboMensual;
  req.body.incluye_bateria = Boolean(req.body?.incluye_bateria);
  next();
}

/**
 * 4. Middleware para validar el agendamiento directo del vecino (Regla de 2 datos y Privacidad)
 * - Rechaza cualquier intento de enviar los campos invasivos del formulario viejo de 6 campos
 *   (correo, dirección, tipo de techo) para garantizar por arquitectura que solo se guarde nombre y teléfono.
 */
function validarAgendarVecino(req, res, next) {
  const camposProhibidosFormularioViejo = ['correo', 'email', 'direccion', 'tipo_techo', 'cedula'];
  const camposEnviados = Object.keys(req.body || {});
  const intrusivosDetectados = camposEnviados.filter((k) =>
    camposProhibidosFormularioViejo.includes(k.toLowerCase())
  );

  if (intrusivosDetectados.length > 0) {
    return res.status(400).json({
      error: `Rechazado por privacidad y simplicidad: Del vecino se guarda SOLO nombre y teléfono. No se aceptan campos del formulario antiguo (${intrusivosDetectados.join(', ')}).`,
      codigo: 'PRIVACY_EXCESS_FIELDS_REJECTED',
      campos_rechazados: intrusivosDetectados
    });
  }

  const nombre = sanitizarTexto(req.body?.nombre, 60);
  const telefono = sanitizarTexto(req.body?.telefono, 25);

  if (!nombre || nombre.length < 2) {
    return res.status(400).json({
      error: 'Por favor escriba su nombre (mínimo 2 caracteres).',
      codigo: 'INVALID_NEIGHBOR_NAME'
    });
  }

  if (!telefono || !/^[0-9+\-\s()]{7,20}$/.test(telefono)) {
    return res.status(400).json({
      error: 'Por favor ingrese un número de teléfono válido en Costa Rica (ej. 8888-8888).',
      codigo: 'INVALID_NEIGHBOR_PHONE'
    });
  }

  req.body.nombre = nombre;
  req.body.telefono = telefono;
  next();
}

/**
 * 5. Middleware para validar la creación/simulación de recompensas frente a la Regla de Andrés ($300)
 */
function validarConfiguracionRecompensa(req, res, next) {
  const { disparador, costo_sol_de_casa } = req.body || {};

  if (!['agendar', 'firmar'].includes(disparador)) {
    return res.status(400).json({
      error: 'El disparador de la recompensa debe ser "agendar" o "firmar".',
      codigo: 'INVALID_REWARD_TRIGGER'
    });
  }

  const costo = Number(costo_sol_de_casa);
  if (isNaN(costo) || costo < 0 || costo > 1000) {
    return res.status(400).json({
      error: 'El costo para Sol de Casa debe ser un número válido entre $0 y $1.000.',
      codigo: 'INVALID_REWARD_COST'
    });
  }

  req.body.costo_sol_de_casa = costo;
  next();
}

module.exports = {
  sanitizarTexto,
  validarTokenFamilia,
  validarCodigoRef,
  validarCalculadoraVecino,
  validarAgendarVecino,
  validarConfiguracionRecompensa
};

