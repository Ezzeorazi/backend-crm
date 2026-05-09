const MovimientoStock = require('../models/MovimientoStock');
const Producto        = require('../models/Product');

const registrarMovimiento = async (tipo, req, res) => {
  try {
    const { productoId, cantidad, motivo, notas } = req.body;
    const prod = await Producto.findOne({ _id: productoId, empresaId: req.empresaId });
    if (!prod) return res.status(404).json({ mensaje: 'Producto no encontrado' });

    if (tipo === 'salida' && cantidad > prod.stock) {
      return res.status(400).json({ mensaje: `Stock insuficiente (disponible: ${prod.stock})` });
    }

    const stockAnterior = prod.stock;
    prod.stock += tipo === 'entrada' ? cantidad : -cantidad;
    await prod.save();

    const movimiento = await MovimientoStock.create({
      empresaId:       req.empresaId,
      productoId,
      tipo,
      cantidad,
      stockAnterior,
      stockResultante: prod.stock,
      motivo:          motivo || (tipo === 'entrada' ? 'compra' : 'ajuste_manual'),
      origen:          { tipo: 'Manual' },
      usuarioId:       req.usuario.id,
      notas
    });

    res.status(201).json(movimiento);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al registrar movimiento', error: error.message });
  }
};

const registrarEntrada = (req, res) => registrarMovimiento('entrada', req, res);
const registrarSalida  = (req, res) => registrarMovimiento('salida',  req, res);

const obtenerMovimientos = async (req, res) => {
  try {
    const { productoId, tipo, desde, hasta } = req.query;
    const filtro = { empresaId: req.empresaId };
    if (productoId) filtro.productoId = productoId;
    if (tipo)       filtro.tipo = tipo;
    if (desde || hasta) {
      filtro.createdAt = {};
      if (desde) filtro.createdAt.$gte = new Date(desde);
      if (hasta) filtro.createdAt.$lte = new Date(hasta);
    }

    const movimientos = await MovimientoStock.find(filtro)
      .populate('productoId', 'nombre sku')
      .populate('usuarioId',  'nombre')
      .sort({ createdAt: -1 });

    res.json(movimientos);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener movimientos', error: error.message });
  }
};

const productosStockBajo = async (req, res) => {
  try {
    const productos = await Producto.find({
      empresaId: req.empresaId,
      activo: true,
      $expr: { $lt: ['$stock', '$stockMinimo'] }
    }).sort({ stock: 1 });
    res.json(productos);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener productos', error: error.message });
  }
};

const productosSinMovimientos = async (req, res) => {
  try {
    const dias = parseInt(req.params.dias, 10);
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - dias);

    const productosConMovs = await MovimientoStock.distinct('productoId', {
      empresaId: req.empresaId,
      createdAt: { $gte: fechaLimite }
    });

    const productos = await Producto.find({
      empresaId: req.empresaId,
      activo: true,
      _id: { $nin: productosConMovs }
    });

    res.json(productos);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error en el reporte', error: error.message });
  }
};

const evolucionStock = async (req, res) => {
  try {
    const { productoId } = req.params;
    const movimientos = await MovimientoStock.find({ empresaId: req.empresaId, productoId })
      .sort({ createdAt: 1 });
    res.json(movimientos);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener evolución', error: error.message });
  }
};

module.exports = {
  registrarEntrada,
  registrarSalida,
  obtenerMovimientos,
  productosStockBajo,
  productosSinMovimientos,
  evolucionStock
};
