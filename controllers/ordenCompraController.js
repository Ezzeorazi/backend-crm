const OrdenCompra = require('../models/OrdenCompra');
const OrdenPago   = require('../models/OrdenPago');
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

    const ordenesPago = await OrdenPago.find({ empresaId: req.empresaId, compraId: orden._id })
      .sort({ createdAt: 1 });

    res.json({ ...orden.toObject(), ordenesPago });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener orden de compra', error: error.message });
  }
};

const crearOrden = async (req, res) => {
  try {
    const {
      proveedor, productos, notas, fechaEstimadaEntrega, iva = 0,
      metodoPago = 'efectivo', condicionPago = 'contado', cuotas = []
    } = req.body;

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

    // Para contado en efectivo/tarjeta/transferencia el pago ya está hecho
    const esPagoInmediato = condicionPago === 'contado' &&
      ['efectivo', 'tarjeta', 'transferencia'].includes(metodoPago);

    const orden = new OrdenCompra({
      empresaId: req.empresaId,
      numero,
      proveedor,
      creadoPor: req.usuario?.id,
      productos: items,
      subtotal,
      iva: ivaCalc,
      total,
      metodoPago,
      condicionPago,
      estadoPago: esPagoInmediato ? 'pagado' : 'pendiente',
      cuotas: condicionPago === 'cuotas' ? cuotas.map((c, i) => ({
        numero:           i + 1,
        monto:            parseFloat(Number(c.monto).toFixed(2)),
        fechaVencimiento: new Date(c.fechaVencimiento),
        estado:           'pendiente',
      })) : [],
      fechaEstimadaEntrega: fechaEstimadaEntrega || undefined,
      notas
    });

    await orden.save();

    // Auto-generar orden de pago si es contado
    if (esPagoInmediato) {
      const numOP = await Contador.siguiente(req.empresaId, 'orden_pago');
      await OrdenPago.create({
        empresaId: req.empresaId,
        numero:    numOP,
        compraId:  orden._id,
        proveedor,
        concepto:  `Pago OC-${String(numero).padStart(5, '0')}`,
        monto:     total,
        fecha:     new Date(),
        metodoPago: metodoPago === 'credito_proveedor' ? 'transferencia' : metodoPago,
        estado:    'ejecutada',
      });
    }

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

// Registrar el pago de una cuota y generar la orden de pago correspondiente
const pagarCuota = async (req, res) => {
  try {
    const { cuotaNumero, metodoPago = 'transferencia', notas = '', fecha } = req.body;
    const orden = await OrdenCompra.findOne({ _id: req.params.id, empresaId: req.empresaId });
    if (!orden) return res.status(404).json({ mensaje: 'Orden de compra no encontrada' });
    if (orden.condicionPago !== 'cuotas') return res.status(400).json({ mensaje: 'La orden no es en cuotas' });

    const cuota = orden.cuotas.find(c => c.numero === Number(cuotaNumero));
    if (!cuota) return res.status(404).json({ mensaje: 'Cuota no encontrada' });
    if (cuota.estado === 'pagada') return res.status(400).json({ mensaje: 'La cuota ya está pagada' });

    cuota.estado    = 'pagada';
    cuota.fechaPago = fecha ? new Date(fecha) : new Date();
    if (notas) cuota.notas = notas;

    const todasPagadas  = orden.cuotas.every(c => c.estado === 'pagada');
    const algunaPagada  = orden.cuotas.some(c => c.estado === 'pagada');
    orden.estadoPago    = todasPagadas ? 'pagado' : algunaPagada ? 'parcial' : 'pendiente';

    await orden.save();

    const numOP = await Contador.siguiente(req.empresaId, 'orden_pago');
    const op = await OrdenPago.create({
      empresaId:   req.empresaId,
      numero:      numOP,
      compraId:    orden._id,
      proveedor:   orden.proveedor,
      concepto:    `Cuota ${cuotaNumero}/${orden.cuotas.length} — OC-${String(orden.numero).padStart(5, '0')}`,
      monto:       cuota.monto,
      fecha:       cuota.fechaPago,
      metodoPago,
      estado:      'ejecutada',
      cuotaNumero: Number(cuotaNumero),
      notas,
    });

    res.json({ orden, ordenPago: op });
  } catch (error) {
    res.status(500).json({ mensaje: error.message });
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

module.exports = { obtenerOrdenes, obtenerOrden, crearOrden, actualizarOrden, recibirOrden, pagarCuota, eliminarOrden };
