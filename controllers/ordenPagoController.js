const OrdenPago = require('../models/OrdenPago');

const obtenerOrdenesPago = async (req, res) => {
  try {
    const ops = await OrdenPago.find({ empresaId: req.empresaId })
      .populate('compraId', 'numero total')
      .populate('proveedor', 'nombre razonSocial')
      .sort({ createdAt: -1 });
    res.json(ops);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener órdenes de pago', error: error.message });
  }
};

const obtenerOrdenPago = async (req, res) => {
  try {
    const op = await OrdenPago.findOne({ _id: req.params.id, empresaId: req.empresaId })
      .populate('compraId', 'numero total productos proveedor')
      .populate('proveedor', 'nombre razonSocial email');
    if (!op) return res.status(404).json({ mensaje: 'Orden de pago no encontrada' });
    res.json(op);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener orden de pago', error: error.message });
  }
};

const actualizarOrdenPago = async (req, res) => {
  try {
    const allowed = ['estado', 'fecha', 'notas', 'metodoPago'];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    const op = await OrdenPago.findOneAndUpdate(
      { _id: req.params.id, empresaId: req.empresaId },
      update,
      { new: true, runValidators: true }
    );
    if (!op) return res.status(404).json({ mensaje: 'Orden de pago no encontrada' });
    res.json(op);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar orden de pago', error: error.message });
  }
};

module.exports = { obtenerOrdenesPago, obtenerOrdenPago, actualizarOrdenPago };
