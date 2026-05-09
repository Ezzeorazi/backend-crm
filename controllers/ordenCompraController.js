const OrdenCompra = require('../models/OrdenCompra');
const Producto    = require('../models/Product');
const MovimientoStock = require('../models/MovimientoStock');
const Contador    = require('../models/Contador');

const obtenerOrdenes = async (req, res) => {
  try {
    const ordenes = await OrdenCompra.find({ empresaId: req.empresaId })
      .populate('proveedor', 'nombre razonSocial')
      .populate('creadoPor', 'nombre')
      .sort({ createdAt: -1 });
    res.json(ordenes);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener órdenes de compra', error: error.message });
  }
};

const obtenerOrden = async (req, res) => {
  try {
    const orden = await OrdenCompra.findOne({ _id: req.params.id, empresaId: req.empresaId })
      .populate('proveedor', 'nombre razonSocial email cuit telefono')
      .populate('creadoPor', 'nombre');
    if (!orden) return res.status(404).json({ mensaje: 'Orden de compra no encontrada' });
    res.json(orden);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener orden de compra', error: error.message });
  }
};

const crearOrden = async (req, res) => {
  try {
    const { proveedor, productos, notas, fechaEstimadaEntrega, iva = 0 } = req.body;

    // Completar snapshots desde los productos
    const items = [];
    for (const item of productos) {
      const prod = item.producto
        ? await Producto.findOne({ _id: item.producto, empresaId: req.empresaId })
        : null;
      items.push({
        producto: prod?._id || undefined,
        nombre:   item.nombre || prod?.nombre || 'Producto',
        sku:      item.sku    || prod?.sku    || '',
        cantidad: item.cantidad,
        precio:   item.precio,
        subtotal: parseFloat((item.precio * item.cantidad).toFixed(2))
      });
    }

    const subtotal = parseFloat(items.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
    const ivaCalc  = parseFloat((subtotal * (iva / 100)).toFixed(2));
    const total    = parseFloat((subtotal + ivaCalc).toFixed(2));
    const numero   = await Contador.siguiente(req.empresaId, 'orden_compra');

    const orden = new OrdenCompra({
      empresaId: req.empresaId,
      numero,
      proveedor,
      creadoPor: req.usuario?.id,
      productos: items,
      subtotal,
      iva: ivaCalc,
      total,
      fechaEstimadaEntrega: fechaEstimadaEntrega || undefined,
      notas
    });

    await orden.save();
    res.status(201).json(orden);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al crear orden de compra', error: error.message });
  }
};

const actualizarOrden = async (req, res) => {
  try {
    const orden = await OrdenCompra.findOneAndUpdate(
      { _id: req.params.id, empresaId: req.empresaId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!orden) return res.status(404).json({ mensaje: 'Orden de compra no encontrada' });
    res.json(orden);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar orden de compra', error: error.message });
  }
};

// Al marcar como recibida, actualiza el stock de cada producto
const recibirOrden = async (req, res) => {
  const session = await OrdenCompra.startSession();
  session.startTransaction();
  try {
    const orden = await OrdenCompra.findOne({ _id: req.params.id, empresaId: req.empresaId }).session(session);
    if (!orden) throw new Error('Orden de compra no encontrada');
    if (orden.estado === 'recibida') throw new Error('La orden ya fue recibida');

    for (const item of orden.productos) {
      if (!item.producto) continue;
      const prod = await Producto.findById(item.producto).session(session);
      if (!prod) continue;
      const stockAnterior = prod.stock;
      prod.stock += item.cantidad;
      await prod.save({ session });

      await MovimientoStock.create([{
        empresaId:       req.empresaId,
        productoId:      prod._id,
        tipo:            'entrada',
        cantidad:        item.cantidad,
        stockAnterior,
        stockResultante: prod.stock,
        motivo:          'compra',
        origen:          { tipo: 'OrdenCompra', referenciaId: orden._id },
        usuarioId:       req.usuario?.id
      }], { session });
    }

    orden.estado = 'recibida';
    await orden.save({ session });
    await session.commitTransaction();
    res.json(orden);
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ mensaje: error.message });
  } finally {
    session.endSession();
  }
};

const eliminarOrden = async (req, res) => {
  try {
    const orden = await OrdenCompra.findOneAndDelete({ _id: req.params.id, empresaId: req.empresaId });
    if (!orden) return res.status(404).json({ mensaje: 'Orden de compra no encontrada' });
    res.json({ mensaje: 'Orden de compra eliminada' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar orden de compra', error: error.message });
  }
};

module.exports = { obtenerOrdenes, obtenerOrden, crearOrden, actualizarOrden, recibirOrden, eliminarOrden };
