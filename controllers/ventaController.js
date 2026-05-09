const Venta    = require('../models/Venta');
const Producto = require('../models/Product');
const MovimientoStock = require('../models/MovimientoStock');
const Contador = require('../models/Contador');

const obtenerVentas = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = { empresaId: req.empresaId };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const ventas = await Venta.find(query)
      .populate('cliente', 'nombre razonSocial email')
      .sort({ createdAt: -1 });
    res.json(ventas);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener ventas', error: error.message });
  }
};

const obtenerVenta = async (req, res) => {
  try {
    const venta = await Venta.findOne({ _id: req.params.id, empresaId: req.empresaId })
      .populate('cliente', 'nombre razonSocial email cuit direccion')
      .populate('creadoPor', 'nombre');
    if (!venta) return res.status(404).json({ mensaje: 'Venta no encontrada' });
    res.json(venta);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener venta', error: error.message });
  }
};

const crearVenta = async (req, res) => {
  const session = await Venta.startSession();
  session.startTransaction();
  try {
    const { cliente, productos, presupuesto, notas, descuento = 0, iva = 0 } = req.body;

    if (!Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ mensaje: 'La venta debe tener al menos un producto.' });
    }

    // Construir items con snapshots y validar stock
    const itemsResueltos = [];
    for (const item of productos) {
      const prod = await Producto.findOne({ _id: item.producto, empresaId: req.empresaId }).session(session);
      if (!prod) throw new Error(`Producto no encontrado: ${item.producto}`);
      if (!prod.activo) throw new Error(`Producto inactivo: ${prod.nombre}`);
      if (prod.stock < item.cantidad) throw new Error(`Stock insuficiente para ${prod.nombre} (disponible: ${prod.stock})`);

      const precio    = item.precio ?? prod.precio;
      const descItem  = item.descuento ?? 0;
      const subtotal  = parseFloat((precio * item.cantidad * (1 - descItem / 100)).toFixed(2));

      itemsResueltos.push({ producto: prod._id, nombre: prod.nombre, sku: prod.sku, cantidad: item.cantidad, precio, descuento: descItem, subtotal });
    }

    // Calcular totales
    const subtotalVenta = parseFloat(itemsResueltos.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
    const ivaCalc       = parseFloat((subtotalVenta * (iva / 100)).toFixed(2));
    const total         = parseFloat((subtotalVenta - descuento + ivaCalc).toFixed(2));

    const numero = await Contador.siguiente(req.empresaId, 'venta');

    const venta = new Venta({
      empresaId:  req.empresaId,
      numero,
      cliente,
      productos:  itemsResueltos,
      presupuesto: presupuesto || undefined,
      creadoPor:  req.usuario?.id,
      subtotal:   subtotalVenta,
      descuento,
      iva:        ivaCalc,
      total,
      notas
    });

    await venta.save({ session });

    // Actualizar stock y registrar movimientos
    for (const item of itemsResueltos) {
      const prod = await Producto.findById(item.producto).session(session);
      const stockAnterior   = prod.stock;
      prod.stock -= item.cantidad;
      await prod.save({ session });

      await MovimientoStock.create([{
        empresaId:       req.empresaId,
        productoId:      item.producto,
        tipo:            'salida',
        cantidad:        item.cantidad,
        stockAnterior,
        stockResultante: prod.stock,
        motivo:          'venta',
        origen:          { tipo: 'Venta', referenciaId: venta._id },
        usuarioId:       req.usuario?.id
      }], { session });
    }

    await session.commitTransaction();
    res.status(201).json(venta);
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ mensaje: error.message });
  } finally {
    session.endSession();
  }
};

const actualizarVenta = async (req, res) => {
  try {
    // Solo permite cambiar estado y notas — los items son inmutables post-creación
    const { estado, notas } = req.body;
    const ventaActualizada = await Venta.findOneAndUpdate(
      { _id: req.params.id, empresaId: req.empresaId },
      { ...(estado && { estado }), ...(notas !== undefined && { notas }) },
      { new: true }
    );
    if (!ventaActualizada) return res.status(404).json({ mensaje: 'Venta no encontrada' });
    res.json(ventaActualizada);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar venta', error: error.message });
  }
};

const eliminarVenta = async (req, res) => {
  try {
    const ventaEliminada = await Venta.findOneAndDelete({ _id: req.params.id, empresaId: req.empresaId });
    if (!ventaEliminada) return res.status(404).json({ mensaje: 'Venta no encontrada' });
    res.json({ mensaje: 'Venta eliminada' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar venta', error: error.message });
  }
};

module.exports = { obtenerVentas, obtenerVenta, crearVenta, actualizarVenta, eliminarVenta };
