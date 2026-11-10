const express = require('express');
const cors = require('cors');
const path = require('path');
const { db } = require('./src/db');
const { seedDatabase } = require('./src/seed');

// Middleware de validación y privacidad
const {
  validarTokenFamilia,
  validarCodigoRef,
  validarCalculadoraVecino,
  validarAgendarVecino,
  validarConfiguracionRecompensa
} = require('./src/middleware/validate');

// Controladores separados por dominio
const {
  obtenerAhorroFamilia,
  registrarComparticionFamilia,
  obtenerProgresoRecompensasFamilia
} = require('./src/controllers/familiaController');

const {
  obtenerTarjetaVecino,
  calcularAhorroParaVecino,
  listarHorariosDisponibles,
  agendarVisitaDirecta
} = require('./src/controllers/vecinoController');

const {
  listarCatalogoRecompensas,
  validarOAgregarRecompensa
} = require('./src/controllers/recompensasController');

const {
  obtenerEstadoSalud,
  avanzarEstadoReservaDemo,
  obtenerPanelAndres,
  generarQRRealVecino
} = require('./src/controllers/andresController');

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

// ============================================================================
// DEFINICIÓN DE RUTAS API (Middleware -> Controlador)
// ============================================================================

// 0. Estado y lista de familias de prueba
app.get('/api/health', obtenerEstadoSalud);

// 1. Pieza 1: Ahorro a la vista de la familia
app.get('/api/familias/:token/ahorro', validarTokenFamilia, obtenerAhorroFamilia);

// 2. Pieza 2: Registrar compartición de la postal de ahorro
app.post('/api/familias/:token/compartir', validarTokenFamilia, registrarComparticionFamilia);

// 3. Pieza 3 (Paso 1): Ver la tarjeta como vecino (solo nombre de pila, barrio y ahorro)
app.get('/api/vecino/tarjeta/:codigo_ref', validarCodigoRef, obtenerTarjetaVecino);

// 4. Pieza 3 (Paso 2): Calculadora honesta del vecino (~7 años de recuperación)
app.post('/api/vecino/calculadora', validarCodigoRef, validarCalculadoraVecino, calcularAhorroParaVecino);

// 5. Pieza 3 (Paso 3): Horarios disponibles respetando capacidad restante
app.get('/api/horarios', listarHorariosDisponibles);

// 6. Pieza 3 (Paso 3): Agendar visita técnica directa (solo nombre y teléfono + rate limit)
app.post('/api/vecino/agendar', rateLimiterAgendar, validarCodigoRef, validarAgendarVecino, agendarVisitaDirecta);

// 7. Pieza 4: Catálogo de recompensas y validador en servidor de la Regla de Andrés (<= $300)
app.get('/api/recompensas/catalogo', listarCatalogoRecompensas);
app.post('/api/recompensas/validar-o-agregar', validarConfiguracionRecompensa, validarOAgregarRecompensa);

// 8. Pieza 4: Progreso y barra de avance de recompensas de la familia
app.get('/api/familias/:token/recompensas', validarTokenFamilia, obtenerProgresoRecompensasFamilia);

// 9. Demostración en vivo: Avanzar reserva a 'hecha' o 'firmada'
app.post('/api/demo/reservas/:id/avanzar', avanzarEstadoReservaDemo);

// 10. Pieza 5: Panel de Andrés en vivo
app.get('/api/andres/panel', obtenerPanelAndres);

// 11. Generador de código QR REAL escaneable (ISO/IEC 18004)
app.get('/api/qr/:codigo_ref', validarCodigoRef, generarQRRealVecino);

// 12. Reinicio rápido de la semilla para demostraciones repetibles
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

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`☀️ Servidor Backend Sol de Casa escuchando en http://localhost:${PORT}`);
  });
}

module.exports = { app };
