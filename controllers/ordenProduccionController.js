const OrdenProduccion = require('../models/OrdenProduccion');
const Contador        = require('../models/Contador');

// Derivar estadoGeneral de las etapas cuando no se proporciona explícitamente
const derivarEstado = (etapas = []) => {
  if (!etapas.length)                                     return 'borrador';
  if (etapas.every(e => e.estado === 'completada'))       return 'completada';
  if (etapas.some(e => e.estado === 'en_progreso'))       return 'en_proceso';
  return 'borrador';
};

const obtenerOrdenes = async (req, res) => {
  try {
    const ordenes = await OrdenProduccion.find({ empresaId: req.empresaId })
      .populate('producto', 'nombre sku')
      .populate('creadoPor', 'nombre')
      .sort({ createdAt: -1 });
    res.json(ordenes);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener órdenes', error: error.message });
  }
};

const obtenerOrden = async (req, res) => {
  try {
    const orden = await OrdenProduccion.findOne({ _id: req.params.id, empresaId: req.empresaId })
      .populate('producto', 'nombre sku precio')
      .populate('etapas.responsable', 'nombre')
      .populate('creadoPor', 'nombre');
    if (!orden) return res.status(404).json({ mensaje: 'Orden no encontrada' });
    res.json(orden);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener orden', error: error.message });
  }
};

const crearOrden = async (req, res) => {
  try {
    const numero = await Contador.siguiente(req.empresaId, 'orden_produccion');
    const orden = new OrdenProduccion({
      ...req.body,
      numero,
      empresaId: req.empresaId,
      creadoPor: req.usuario?.id
    });
    // Derivar estado si no viene en el body
    if (!req.body.estadoGeneral) {
      orden.estadoGeneral = derivarEstado(orden.etapas);
    }
    await orden.save();
    res.status(201).json(orden);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al crear orden', error: error.message });
  }
};

const actualizarOrden = async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.etapas && !data.estadoGeneral) {
      data.estadoGeneral = derivarEstado(data.etapas);
    }
    const orden = await OrdenProduccion.findOneAndUpdate(
      { _id: req.params.id, empresaId: req.empresaId },
      data,
      { new: true, runValidators: true }
    );
    if (!orden) return res.status(404).json({ mensaje: 'Orden no encontrada' });
    res.json(orden);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar orden', error: error.message });
  }
};

const eliminarOrden = async (req, res) => {
  try {
    const orden = await OrdenProduccion.findOneAndDelete({ _id: req.params.id, empresaId: req.empresaId });
    if (!orden) return res.status(404).json({ mensaje: 'Orden no encontrada' });
    res.json({ mensaje: 'Orden eliminada' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar orden', error: error.message });
  }
};

module.exports = { obtenerOrdenes, obtenerOrden, crearOrden, actualizarOrden, eliminarOrden };
