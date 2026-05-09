const mongoose = require('mongoose');

const movimientoStockSchema = new mongoose.Schema({
  empresaId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  productoId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
  tipo: {
    type:     String,
    enum:     ['entrada', 'salida', 'ajuste'],
    required: true
  },
  cantidad:        { type: Number, required: true },   // positivo siempre; tipo indica dirección
  stockAnterior:   { type: Number, required: true },   // stock antes del movimiento
  stockResultante: { type: Number, required: true },   // stock después del movimiento
  motivo: {
    type:     String,
    enum:     ['venta', 'compra', 'ajuste_manual', 'produccion', 'devolucion', 'merma', 'transferencia'],
    required: true
  },
  // qué documento origina este movimiento (trazabilidad completa)
  origen: {
    tipo:         { type: String, enum: ['Venta', 'OrdenCompra', 'OrdenProduccion', 'Manual'] },
    referenciaId: { type: mongoose.Schema.Types.ObjectId }
  },
  usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notas:     String
}, {
  timestamps: true
});

movimientoStockSchema.index({ empresaId: 1, productoId: 1, createdAt: -1 });
movimientoStockSchema.index({ empresaId: 1, createdAt: -1 });
movimientoStockSchema.index({ empresaId: 1, motivo: 1 });

module.exports = mongoose.model('MovimientoStock', movimientoStockSchema);
