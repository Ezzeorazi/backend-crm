const mongoose = require('mongoose');

const productoItemSchema = new mongoose.Schema({
  producto:  { type: mongoose.Schema.Types.ObjectId, ref: 'Producto' },
  nombre:    { type: String, required: true },   // snapshot — no se pierde si el producto cambia
  sku:       String,                              // snapshot
  cantidad:  { type: Number, required: true, min: 1 },
  precio:    { type: Number, required: true, min: 0 },
  descuento: { type: Number, default: 0, min: 0, max: 100 }, // %
  subtotal:  { type: Number, required: true, min: 0 }
}, { _id: false });

const ventaSchema = new mongoose.Schema({
  empresaId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  numero:      { type: Number, required: true },
  cliente:     { type: mongoose.Schema.Types.ObjectId, ref: 'Contacto', required: true },
  presupuesto: { type: mongoose.Schema.Types.ObjectId, ref: 'Presupuesto' },
  creadoPor:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  productos:   [productoItemSchema],
  subtotal:    { type: Number, required: true, min: 0 },
  descuento:   { type: Number, default: 0, min: 0 },
  iva:         { type: Number, default: 0, min: 0 },
  total:       { type: Number, required: true, min: 0 },
  estado: {
    type:    String,
    enum:    ['pendiente', 'procesando', 'completado', 'cancelado'],
    default: 'pendiente'
  },
  notas: String
}, {
  timestamps: true
});

ventaSchema.index({ empresaId: 1, numero: 1 },    { unique: true });
ventaSchema.index({ empresaId: 1, estado: 1 });
ventaSchema.index({ empresaId: 1, cliente: 1 });
ventaSchema.index({ empresaId: 1, createdAt: -1 });

module.exports = mongoose.model('Venta', ventaSchema);
