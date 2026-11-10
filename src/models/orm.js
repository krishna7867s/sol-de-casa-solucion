const { db } = require('../db');

/**
 * Capa ORM (Object-Relational Mapping) de Sol de Casa
 * ---------------------------------------------------
 * ¿Por qué nunca ocurre una consulta SQL malformada en los controladores?
 * 1. Abstracción de Entidades: Los controladores operan sobre Modelos orientados a objetos
 *    (Familia, Comparticion, Reserva, Recompensa, etc.) y nunca concatenan ni escriben SQL manual.
 * 2. Esquema estricto de columnas (Whitelist): El ORM valida que solo se consulten o inserten
 *    atributos definidos en el esquema del modelo.
 * 3. Compilación parametrizada (Prepared Statements): Todo valor enviado a los métodos del ORM
 *    se enlaza mediante marcadores posicionales (`?`) a nivel del motor SQLite, separando
 *    la estructura sintáctica del árbol AST de SQL de los datos del usuario.
 */
class BaseModel {
  static tableName = '';
  static allowedColumns = [];

  static validatePayload(data) {
    const clean = {};
    for (const key of Object.keys(data)) {
      if (!this.allowedColumns.includes(key)) {
        throw new Error(`[ORM Error] Atributo '${key}' no pertenece al modelo ${this.name} (${this.tableName}).`);
      }
      clean[key] = data[key];
    }
    return clean;
  }

  static findById(id) {
    return db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`).get(Number(id));
  }

  static findOneBy(column, value) {
    if (!this.allowedColumns.includes(column)) {
      throw new Error(`[ORM Error] Columna inválida '${column}' en ${this.name}.`);
    }
    return db.prepare(`SELECT * FROM ${this.tableName} WHERE ${column} = ?`).get(value);
  }

  static count(whereClause = '', params = []) {
    const sql = whereClause
      ? `SELECT COUNT(*) as total FROM ${this.tableName} WHERE ${whereClause}`
      : `SELECT COUNT(*) as total FROM ${this.tableName}`;
    return db.prepare(sql).get(...params).total;
  }
}

class Familia extends BaseModel {
  static tableName = 'familias';
  static allowedColumns = [
    'id', 'token_personal', 'nombre_pila', 'nombre_completo',
    'barrio', 'fecha_instalacion', 'recibo_antes',
    'tiene_plan_mantenimiento', 'es_simulado'
  ];

  static findByToken(token) {
    return this.findOneBy('token_personal', String(token));
  }

  static findAllPublic() {
    return db.prepare('SELECT id, token_personal, nombre_pila, barrio FROM familias').all();
  }
}

class AhorroMensual extends BaseModel {
  static tableName = 'ahorros_mensuales';
  static allowedColumns = [
    'id', 'familia_id', 'mes', 'etiqueta_mes',
    'kwh_producidos', 'recibo_antes', 'recibo_despues', 'ahorro', 'es_simulado'
  ];

  static findByFamiliaId(familiaId) {
    return db.prepare(`
      SELECT mes, etiqueta_mes, kwh_producidos, recibo_antes, recibo_despues, ahorro, es_simulado
      FROM ahorros_mensuales
      WHERE familia_id = ?
      ORDER BY mes DESC
    `).all(Number(familiaId));
  }

  static findLatestByFamiliaId(familiaId) {
    return db.prepare(`
      SELECT etiqueta_mes, ahorro
      FROM ahorros_mensuales
      WHERE familia_id = ?
      ORDER BY mes DESC LIMIT 1
    `).get(Number(familiaId));
  }

  static getSummaryByFamiliaId(familiaId) {
    return db.prepare(`
      SELECT SUM(ahorro) as total, COUNT(*) as meses
      FROM ahorros_mensuales
      WHERE familia_id = ?
    `).get(Number(familiaId));
  }
}

class Comparticion extends BaseModel {
  static tableName = 'comparticiones';
  static allowedColumns = ['id', 'codigo_ref', 'familia_id', 'canal', 'fecha', 'es_simulado'];

  static findLatestByFamiliaId(familiaId) {
    return db.prepare(`
      SELECT codigo_ref, canal, fecha FROM comparticiones
      WHERE familia_id = ? ORDER BY id DESC LIMIT 1
    `).get(Number(familiaId));
  }

  static findByCodigoRef(codigoRef) {
    return this.findOneBy('codigo_ref', String(codigoRef));
  }

  static findWithFamiliaByCodigoRef(codigoRef) {
    return db.prepare(`
      SELECT c.id as comparticion_id, c.id, c.codigo_ref, c.canal, c.familia_id,
             f.nombre_pila, f.barrio, f.recibo_antes
      FROM comparticiones c
      JOIN familias f ON f.id = c.familia_id
      WHERE c.codigo_ref = ?
    `).get(String(codigoRef));
  }

  static create({ codigo_ref, familia_id, canal, fecha, es_simulado = 1 }) {
    const clean = this.validatePayload({ codigo_ref, familia_id, canal, fecha, es_simulado });
    const info = db.prepare(`
      INSERT INTO comparticiones (codigo_ref, familia_id, canal, fecha, es_simulado)
      VALUES (?, ?, ?, ?, ?)
    `).run(clean.codigo_ref, Number(clean.familia_id), clean.canal, clean.fecha, Number(clean.es_simulado));
    return { id: info.lastInsertRowid, ...clean };
  }

  static countByFamiliaId(familiaId) {
    return this.count('familia_id = ?', [Number(familiaId)]);
  }
}

class VisitaVecino extends BaseModel {
  static tableName = 'visitas_vecino';
  static allowedColumns = [
    'id', 'comparticion_id', 'familia_referente_id', 'uso_calculadora',
    'recibo_ingresado', 'ahorro_calculado', 'anios_recuperacion', 'fecha', 'es_simulado'
  ];

  static create(data) {
    const clean = this.validatePayload({ ...data, uso_calculadora: 1, es_simulado: 1 });
    const info = db.prepare(`
      INSERT INTO visitas_vecino (
        comparticion_id, familia_referente_id, uso_calculadora,
        recibo_ingresado, ahorro_calculado, anios_recuperacion, fecha, es_simulado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(clean.comparticion_id),
      Number(clean.familia_referente_id),
      clean.uso_calculadora,
      Number(clean.recibo_ingresado),
      Number(clean.ahorro_calculado),
      Number(clean.anios_recuperacion),
      clean.fecha,
      clean.es_simulado
    );
    return { id: info.lastInsertRowid, ...clean };
  }

  static countCalculadoraByFamiliaId(familiaId) {
    return this.count('familia_referente_id = ? AND uso_calculadora = 1', [Number(familiaId)]);
  }

  static countAllCalculadora() {
    return this.count('uso_calculadora = 1');
  }
}

class HorarioDisponible extends BaseModel {
  static tableName = 'horarios_disponibles';
  static allowedColumns = ['id', 'fecha_hora', 'etiqueta_horario', 'tecnico', 'reservado'];

  static findAvailable() {
    return db.prepare(`
      SELECT id, fecha_hora, etiqueta_horario, tecnico
      FROM horarios_disponibles
      WHERE reservado = 0
      ORDER BY fecha_hora ASC
    `).all();
  }

  static markReserved(horarioId) {
    const info = db.prepare(
      'UPDATE horarios_disponibles SET reservado = 1 WHERE id = ? AND reservado = 0'
    ).run(Number(horarioId));
    return info.changes > 0;
  }
}

class Reserva extends BaseModel {
  static tableName = 'reservas';
  static allowedColumns = [
    'id', 'comparticion_id', 'familia_referente_id', 'visita_vecino_id',
    'nombre_vecino', 'telefono_vecino', 'horario_elegido', 'estado',
    'fecha_creacion', 'fecha_actualizacion', 'es_simulado'
  ];

  static countActive() {
    return this.count("estado IN ('agendada', 'hecha', 'firmada')");
  }

  static countHechasOFirmadas() {
    return this.count("estado IN ('hecha', 'firmada')");
  }

  static countFirmadas() {
    return this.count("estado = 'firmada'");
  }

  static findByFamiliaReferenteId(familiaId) {
    return db.prepare(`
      SELECT id, nombre_vecino, horario_elegido, estado, fecha_creacion, fecha_actualizacion
      FROM reservas
      WHERE familia_referente_id = ?
      ORDER BY id DESC
    `).all(Number(familiaId));
  }

  static findAllWithFamilia() {
    return db.prepare(`
      SELECT r.id, r.nombre_vecino, r.telefono_vecino, r.horario_elegido, r.estado,
             r.fecha_creacion, f.nombre_pila as familia_referente, f.barrio
      FROM reservas r
      JOIN familias f ON f.id = r.familia_referente_id
      ORDER BY r.id DESC
    `).all();
  }

  static create(data) {
    const clean = this.validatePayload({
      ...data,
      estado: data.estado || 'agendada',
      es_simulado: 1
    });
    const info = db.prepare(`
      INSERT INTO reservas (
        comparticion_id, familia_referente_id, visita_vecino_id,
        nombre_vecino, telefono_vecino, horario_elegido, estado,
        fecha_creacion, fecha_actualizacion, es_simulado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(clean.comparticion_id),
      Number(clean.familia_referente_id),
      clean.visita_vecino_id ? Number(clean.visita_vecino_id) : null,
      clean.nombre_vecino,
      clean.telefono_vecino,
      clean.horario_elegido,
      clean.estado,
      clean.fecha_creacion,
      clean.fecha_actualizacion,
      clean.es_simulado
    );
    return { id: info.lastInsertRowid, ...clean };
  }

  static updateEstado(id, nuevoEstado, fechaActualizacion) {
    if (!['agendada', 'hecha', 'firmada'].includes(nuevoEstado)) {
      throw new Error(`[ORM Error] Estado de reserva inválido: ${nuevoEstado}`);
    }
    db.prepare(`
      UPDATE reservas SET estado = ?, fecha_actualizacion = ? WHERE id = ?
    `).run(nuevoEstado, fechaActualizacion, Number(id));
    return this.findById(id);
  }
}

class Recompensa extends BaseModel {
  static tableName = 'recompensas';
  static allowedColumns = [
    'id', 'codigo', 'nombre', 'descripcion', 'disparador',
    'quien_recibe', 'costo_sol_de_casa', 'multiplicador_embudo',
    'costo_por_venta_calculado', 'activa'
  ];

  static findAllActive() {
    return db.prepare('SELECT * FROM recompensas WHERE activa = 1 ORDER BY id ASC').all();
  }

  static findActiveByDisparador(disparador) {
    return db.prepare(`
      SELECT id, nombre, quien_recibe, costo_sol_de_casa
      FROM recompensas
      WHERE disparador = ? AND activa = 1
    `).all(String(disparador));
  }

  static create(data) {
    const clean = this.validatePayload({ ...data, activa: 1 });
    const info = db.prepare(`
      INSERT INTO recompensas (
        codigo, nombre, descripcion, disparador, quien_recibe,
        costo_sol_de_casa, multiplicador_embudo, costo_por_venta_calculado, activa
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clean.codigo,
      clean.nombre,
      clean.descripcion,
      clean.disparador,
      clean.quien_recibe,
      Number(clean.costo_sol_de_casa),
      Number(clean.multiplicador_embudo),
      Number(clean.costo_por_venta_calculado),
      clean.activa
    );
    return { id: info.lastInsertRowid, ...clean };
  }
}

class MovimientoRecompensa extends BaseModel {
  static tableName = 'movimientos_recompensa';
  static allowedColumns = [
    'id', 'familia_id', 'recompensa_id', 'reserva_id',
    'evento', 'costo', 'fecha', 'es_simulado'
  ];

  static findDetailedByFamiliaId(familiaId) {
    return db.prepare(`
      SELECT m.id, m.evento, m.costo, m.fecha, m.reserva_id,
             r.nombre as recompensa_nombre, r.quien_recibe, r.disparador,
             res.nombre_vecino
      FROM movimientos_recompensa m
      JOIN recompensas r ON r.id = m.recompensa_id
      JOIN reservas res ON res.id = m.reserva_id
      WHERE m.familia_id = ?
      ORDER BY m.id DESC
    `).all(Number(familiaId));
  }

  static createOrIgnore({ familia_id, recompensa_id, reserva_id, evento, costo, fecha }) {
    const clean = this.validatePayload({
      familia_id, recompensa_id, reserva_id, evento, costo, fecha, es_simulado: 1
    });
    const info = db.prepare(`
      INSERT OR IGNORE INTO movimientos_recompensa (
        familia_id, recompensa_id, reserva_id, evento, costo, fecha, es_simulado
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(clean.familia_id),
      Number(clean.recompensa_id),
      Number(clean.reserva_id),
      clean.evento,
      Number(clean.costo),
      clean.fecha,
      clean.es_simulado
    );
    return info.changes > 0;
  }

  static sumAllCostos() {
    const row = db.prepare('SELECT SUM(costo) as total FROM movimientos_recompensa').get();
    return Number((row?.total || 0).toFixed(2));
  }
}

/**
 * Ejecuta una función dentro de una transacción atómica de base de datos del ORM
 */
function runInTransaction(fn) {
  const tx = db.transaction(fn);
  return tx();
}

module.exports = {
  BaseModel,
  Familia,
  AhorroMensual,
  Comparticion,
  VisitaVecino,
  HorarioDisponible,
  Reserva,
  Recompensa,
  MovimientoRecompensa,
  runInTransaction
};

