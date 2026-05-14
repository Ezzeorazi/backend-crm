const Oportunidad = require('../models/Oportunidad');

// Probabilidad por defecto al cambiar etapa (sincronizado con el modelo)
const PROB_POR_ETAPA = {
  nuevo: 10, calificado: 25, propuesta: 50,
  negociacion: 75, ganado: 100, perdido: 0,
};

const obtenerOportunidades = async (req, res) => {
  try {
    const { etapa, tipo, responsable } = req.query;
    const query = { empresaId: req.empresaId };

    if (etapa)       query.etapa       = etapa;
    if (tipo)        query.tipo        = tipo;
    if (responsable) query.responsable = responsable;

    const oportunidades = await Oportunidad.find(query)
      .populate('contacto',   'nombre razonSocial email')
      .populate('responsable', 'nombre email')
      .populate('creadoPor',   'nombre')
      .sort({ createdAt: -1 });

    res.json(oportunidades);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener oportunidades', error: error.message });
  }
};

const obtenerOportunidad = async (req, res) => {
  try {
    const op = await Oportunidad.findOne({ _id: req.params.id, empresaId: req.empresaId })
      .populate('contacto',    'nombre razonSocial email telefono cuit direccion')
      .populate('responsable', 'nombre email')
      .populate('creadoPor',   'nombre')
      .populate('actividades.responsable', 'nombre')
      .populate('log.usuario', 'nombre')
      .populate('presupuestos', 'numero estado total createdAt')
      .populate('ventas',       'numero estado total createdAt');

    if (!op) return res.status(404).json({ mensaje: 'Oportunidad no encontrada' });
    res.json(op);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener oportunidad', error: error.message });
  }
};

const crearOportunidad = async (req, res) => {
  try {
    const {
      titulo, contacto, responsable, etapa, tipo,
      valorEstimado, probabilidad, fechaCierre, fuente, notas,
    } = req.body;

    const op = new Oportunidad({
      empresaId: req.empresaId,
      titulo,
      contacto:      contacto      || undefined,
      responsable:   responsable   || req.usuario?.id,
      creadoPor:     req.usuario?.id,
      etapa:         etapa         || 'nuevo',
      tipo:          tipo          || 'lead',
      valorEstimado: valorEstimado || 0,
      probabilidad:  probabilidad  ?? PROB_POR_ETAPA[etapa || 'nuevo'],
      fechaCierre:   fechaCierre   || undefined,
      fuente:        fuente        || 'manual',
      notas,
    });

    op.log.push({ descripcion: 'Oportunidad creada', usuario: req.usuario?.id });
    await op.save();

    await op.populate([
      { path: 'contacto',   select: 'nombre razonSocial email' },
      { path: 'responsable', select: 'nombre email' },
    ]);

    res.status(201).json(op);
  } catch (error) {
    res.status(400).json({ mensaje: error.message });
  }
};

const actualizarOportunidad = async (req, res) => {
  try {
    const op = await Oportunidad.findOne({ _id: req.params.id, empresaId: req.empresaId });
    if (!op) return res.status(404).json({ mensaje: 'Oportunidad no encontrada' });

    const {
      titulo, contacto, responsable, etapa, tipo,
      valorEstimado, probabilidad, fechaCierre, motivoPerdida, fuente, notas,
    } = req.body;

    const logEntries = [];

    if (etapa && etapa !== op.etapa) {
      logEntries.push(`Etapa cambiada de "${op.etapa}" a "${etapa}"`);
      op.etapa = etapa;
      op.probabilidad = PROB_POR_ETAPA[etapa] ?? op.probabilidad;
    }
    if (responsable && String(responsable) !== String(op.responsable)) {
      logEntries.push('Responsable reasignado');
      op.responsable = responsable;
    }
    if (titulo         !== undefined) op.titulo         = titulo;
    if (contacto       !== undefined) op.contacto       = contacto || undefined;
    if (tipo           !== undefined) op.tipo           = tipo;
    if (valorEstimado  !== undefined) op.valorEstimado  = valorEstimado;
    if (probabilidad   !== undefined && etapa === undefined) op.probabilidad = probabilidad;
    if (fechaCierre    !== undefined) op.fechaCierre    = fechaCierre || undefined;
    if (motivoPerdida  !== undefined) op.motivoPerdida  = motivoPerdida;
    if (fuente         !== undefined) op.fuente         = fuente;
    if (notas          !== undefined) op.notas          = notas;

    for (const desc of logEntries) {
      op.log.push({ descripcion: desc, usuario: req.usuario?.id });
    }

    await op.save();
    await op.populate([
      { path: 'contacto',   select: 'nombre razonSocial email' },
      { path: 'responsable', select: 'nombre email' },
    ]);
    res.json(op);
  } catch (error) {
    res.status(400).json({ mensaje: error.message });
  }
};

const eliminarOportunidad = async (req, res) => {
  try {
    const op = await Oportunidad.findOneAndDelete({ _id: req.params.id, empresaId: req.empresaId });
    if (!op) return res.status(404).json({ mensaje: 'Oportunidad no encontrada' });
    res.json({ mensaje: 'Oportunidad eliminada' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar oportunidad', error: error.message });
  }
};

// ── Actividades ────────────────────────────────────────────────────────────────

const agregarActividad = async (req, res) => {
  try {
    const op = await Oportunidad.findOne({ _id: req.params.id, empresaId: req.empresaId });
    if (!op) return res.status(404).json({ mensaje: 'Oportunidad no encontrada' });

    const { tipo, titulo, nota, fechaLimite, responsable } = req.body;
    op.actividades.push({
      tipo, titulo, nota,
      fechaLimite: fechaLimite || undefined,
      responsable: responsable || req.usuario?.id,
    });
    op.log.push({ descripcion: `Actividad agregada: "${titulo}"`, usuario: req.usuario?.id });
    await op.save();
    res.status(201).json(op.actividades[op.actividades.length - 1]);
  } catch (error) {
    res.status(400).json({ mensaje: error.message });
  }
};

const completarActividad = async (req, res) => {
  try {
    const op = await Oportunidad.findOne({ _id: req.params.id, empresaId: req.empresaId });
    if (!op) return res.status(404).json({ mensaje: 'Oportunidad no encontrada' });

    const actividad = op.actividades.id(req.params.actividadId);
    if (!actividad) return res.status(404).json({ mensaje: 'Actividad no encontrada' });

    actividad.completada   = true;
    actividad.completadaEn = new Date();
    op.log.push({ descripcion: `Actividad completada: "${actividad.titulo}"`, usuario: req.usuario?.id });
    await op.save();
    res.json(actividad);
  } catch (error) {
    res.status(400).json({ mensaje: error.message });
  }
};

const eliminarActividad = async (req, res) => {
  try {
    const op = await Oportunidad.findOne({ _id: req.params.id, empresaId: req.empresaId });
    if (!op) return res.status(404).json({ mensaje: 'Oportunidad no encontrada' });

    const actividad = op.actividades.id(req.params.actividadId);
    if (!actividad) return res.status(404).json({ mensaje: 'Actividad no encontrada' });

    actividad.deleteOne();
    await op.save();
    res.json({ mensaje: 'Actividad eliminada' });
  } catch (error) {
    res.status(400).json({ mensaje: error.message });
  }
};

const vincularDocumento = async (req, res) => {
  try {
    const op = await Oportunidad.findOne({ _id: req.params.id, empresaId: req.empresaId });
    if (!op) return res.status(404).json({ mensaje: 'Oportunidad no encontrada' });

    const { presupuestoId, ventaId } = req.body;

    if (presupuestoId && !op.presupuestos.map(String).includes(String(presupuestoId))) {
      op.presupuestos.push(presupuestoId);
      op.log.push({ descripcion: 'Presupuesto vinculado', usuario: req.usuario?.id });
    }
    if (ventaId && !op.ventas.map(String).includes(String(ventaId))) {
      op.ventas.push(ventaId);
      op.log.push({ descripcion: 'Venta vinculada', usuario: req.usuario?.id });
    }

    await op.save();
    res.json({ mensaje: 'Documento vinculado correctamente' });
  } catch (error) {
    res.status(400).json({ mensaje: error.message });
  }
};

module.exports = {
  obtenerOportunidades,
  obtenerOportunidad,
  crearOportunidad,
  actualizarOportunidad,
  eliminarOportunidad,
  agregarActividad,
  completarActividad,
  eliminarActividad,
  vincularDocumento,
};
