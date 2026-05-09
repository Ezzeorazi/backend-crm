const Factura  = require('../models/Factura');
const Pago     = require('../models/Pago');
const Venta    = require('../models/Venta');
const Contador = require('../models/Contador');

const obtenerFacturas = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = { empresaId: req.empresaId };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const facturas = await Factura.find(query)
      .populate('cliente', 'nombre razonSocial')
      .populate('venta', 'numero total')
      .sort({ createdAt: -1 });
    res.json(facturas);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener facturas', error: error.message });
  }
};

const obtenerFactura = async (req, res) => {
  try {
    const factura = await Factura.findOne({ _id: req.params.id, empresaId: req.empresaId })
      .populate('cliente', 'nombre razonSocial email cuit direccion')
      .populate('venta');
    if (!factura) return res.status(404).json({ mensaje: 'Factura no encontrada' });
    res.json(factura);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener factura', error: error.message });
  }
};

const crearFactura = async (req, res) => {
  try {
    const { venta: ventaId, tipo = 'B', notas, vencimiento } = req.body;

    // Obtener la venta para derivar cliente y montos
    const venta = await Venta.findOne({ _id: ventaId, empresaId: req.empresaId })
      .populate('cliente', 'nombre razonSocial email cuit direccion');
    if (!venta) return res.status(404).json({ mensaje: 'Venta no encontrada' });

    const cliente = venta.cliente;

    const numero   = await Contador.siguiente(req.empresaId, 'factura');
    const subtotal = req.body.subtotal ?? venta.subtotal;
    const iva      = req.body.iva      ?? venta.iva;
    const total    = req.body.total    ?? venta.total;

    const factura = new Factura({
      empresaId: req.empresaId,
      numero,
      tipo,
      venta:     ventaId,
      cliente:   cliente._id,
      clienteSnapshot: {
        nombre:      cliente.nombre,
        razonSocial: cliente.razonSocial,
        cuit:        cliente.cuit,
        direccion:   cliente.direccion,
        email:       cliente.email
      },
      subtotal,
      descuento: req.body.descuento ?? venta.descuento ?? 0,
      iva,
      total,
      vencimiento: vencimiento || undefined,
      notas
    });

    const guardada = await factura.save();
    res.status(201).json(guardada);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al crear factura', error: error.message });
  }
};

const actualizarFactura = async (req, res) => {
  try {
    const actualizada = await Factura.findOneAndUpdate(
      { _id: req.params.id, empresaId: req.empresaId },
      req.body,
      { new: true }
    );
    if (!actualizada) return res.status(404).json({ mensaje: 'Factura no encontrada' });
    res.json(actualizada);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar factura', error: error.message });
  }
};

const eliminarFactura = async (req, res) => {
  try {
    const eliminada = await Factura.findOneAndDelete({ _id: req.params.id, empresaId: req.empresaId });
    if (!eliminada) return res.status(404).json({ mensaje: 'Factura no encontrada' });
    await Pago.deleteMany({ factura: eliminada._id });
    res.json({ mensaje: 'Factura eliminada' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar factura', error: error.message });
  }
};

module.exports = { obtenerFacturas, obtenerFactura, crearFactura, actualizarFactura, eliminarFactura };
