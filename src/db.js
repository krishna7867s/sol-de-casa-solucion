const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'sol_de_casa.sqlite');
const db = new Database(DB_PATH);

// Activar foreign keys y modo WAL para concurrencia limpia
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function initSchema() {
  db.exec(`
    -- 1. Familias que ya tienen paneles solares instalados
    CREATE TABLE IF NOT EXISTS familias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_personal TEXT NOT NULL UNIQUE,
      nombre_pila TEXT NOT NULL,
      apellido TEXT NOT NULL,
      nombre_completo TEXT NOT NULL,
      barrio TEXT NOT NULL,
      fecha_instalacion TEXT NOT NULL,
      recibo_antes REAL NOT NULL,
      tiene_plan_mantenimiento INTEGER NOT NULL DEFAULT 0,
      es_simulado INTEGER NOT NULL DEFAULT 1
    );

    -- 2. Ahorros mensuales por familia (datos simulados al 70% como si vinieran del inversor)
    CREATE TABLE IF NOT EXISTS ahorros_mensuales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      familia_id INTEGER NOT NULL,
      mes TEXT NOT NULL, -- formato YYYY-MM
      etiqueta_mes TEXT NOT NULL, -- ej. "Octubre 2026 (simulado)"
      kwh_producidos REAL NOT NULL,
      recibo_antes REAL NOT NULL,
      recibo_despues REAL NOT NULL,
      ahorro REAL NOT NULL,
      es_simulado INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (familia_id) REFERENCES familias(id) ON DELETE CASCADE
    );

    -- 3. Comparticiones de la tarjeta de ahorro
    CREATE TABLE IF NOT EXISTS comparticiones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo_ref TEXT NOT NULL UNIQUE, -- código único para rastrear esta compartición o link
      familia_id INTEGER NOT NULL,
      canal TEXT NOT NULL CHECK(canal IN ('WhatsApp', 'Publicacion', 'LinkDirecto', 'QR_Vecino')),
      fecha TEXT NOT NULL,
      es_simulado INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (familia_id) REFERENCES familias(id) ON DELETE CASCADE
    );

    -- 4. Visitas de vecinos a la página y uso de la calculadora
    CREATE TABLE IF NOT EXISTS visitas_vecino (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comparticion_id INTEGER NOT NULL,
      familia_referente_id INTEGER NOT NULL,
      uso_calculadora INTEGER NOT NULL DEFAULT 0,
      recibo_ingresado REAL,
      ahorro_calculado REAL,
      anios_recuperacion REAL,
      fecha TEXT NOT NULL,
      es_simulado INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (comparticion_id) REFERENCES comparticiones(id) ON DELETE CASCADE,
      FOREIGN KEY (familia_referente_id) REFERENCES familias(id) ON DELETE CASCADE
    );

    -- 5. Horarios disponibles de los técnicos para agendar sin esperar las 31h de llamada
    CREATE TABLE IF NOT EXISTS horarios_disponibles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha_hora TEXT NOT NULL UNIQUE,
      etiqueta_horario TEXT NOT NULL,
      tecnico TEXT NOT NULL,
      reservado INTEGER NOT NULL DEFAULT 0
    );

    -- 6. Reservas de visita técnica hechas por vecinos (solo nombre y teléfono, máx 3 pasos)
    CREATE TABLE IF NOT EXISTS reservas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comparticion_id INTEGER NOT NULL,
      familia_referente_id INTEGER NOT NULL,
      visita_vecino_id INTEGER,
      nombre_vecino TEXT NOT NULL,
      telefono_vecino TEXT NOT NULL,
      horario_elegido TEXT NOT NULL,
      estado TEXT NOT NULL CHECK(estado IN ('agendada', 'hecha', 'firmada')) DEFAULT 'agendada',
      fecha_creacion TEXT NOT NULL,
      fecha_actualizacion TEXT NOT NULL,
      es_simulado INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (comparticion_id) REFERENCES comparticiones(id) ON DELETE CASCADE,
      FOREIGN KEY (familia_referente_id) REFERENCES familias(id) ON DELETE CASCADE,
      FOREIGN KEY (visita_vecino_id) REFERENCES visitas_vecino(id) ON DELETE SET NULL
    );

    -- 7. Catálogo de recompensas con regla de negocio calculada en servidor
    CREATE TABLE IF NOT EXISTS recompensas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      disparador TEXT NOT NULL CHECK(disparador IN ('agendar', 'firmar')),
      quien_recibe TEXT NOT NULL CHECK(quien_recibe IN ('familia', 'vecino')),
      costo_sol_de_casa REAL NOT NULL,
      multiplicador_embudo REAL NOT NULL,
      costo_por_venta_calculado REAL NOT NULL,
      activa INTEGER NOT NULL DEFAULT 1
    );

    -- 8. Movimientos de recompensas otorgadas a las familias / vecinos
    CREATE TABLE IF NOT EXISTS movimientos_recompensa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      familia_id INTEGER NOT NULL,
      recompensa_id INTEGER NOT NULL,
      reserva_id INTEGER NOT NULL,
      evento TEXT NOT NULL CHECK(evento IN ('agendar', 'firmar')),
      costo REAL NOT NULL,
      fecha TEXT NOT NULL,
      es_simulado INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (familia_id) REFERENCES familias(id) ON DELETE CASCADE,
      FOREIGN KEY (recompensa_id) REFERENCES recompensas(id) ON DELETE CASCADE,
      FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE CASCADE,
      UNIQUE(reserva_id, recompensa_id)
    );
  `);
}

initSchema();

module.exports = {
  db,
  initSchema,
  DB_PATH
};

