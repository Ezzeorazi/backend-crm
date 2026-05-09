const mongoose = require('mongoose');

const productoItemSchema = new mongoose.Schema({
  producto:  { type: mongoose.Schema.Types.ObjectId, ref: 'Producto' },
  nombre:    { type: String, required: true }, // snapshot
  sku:       String,                           // snapshot
  cantidad:  { type: Number, required: true, min: 1 },
  precio:    { type: Number, required: true, min: 0 },
  subtotal:  { type: Number, required: true, min: 0 }
}, { _id: false });

const ordenCompraSchema = new mongoose.Schema({
  empresaId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  numero:     { type: Number, required: true },
  proveedor:  { type: mongoose.Schema.Types.ObjectId, ref: 'Contacto', required: true },
  creadoPor:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  productos:  [productoItemSchema],
  subtotal:   { type: Number, required: true, min: 0 },
  iva:        { type: Number, default: 0, min: 0 },
  total:      { type: Number, required: true, min: 0 },
  estado: {
    type:    String,
    enum:    ['borrador', 'enviada', 'confirmada', 'recibida_parcial', 'recibida', 'cancelada'],
    default: 'borrador'
  },
  fechaEstimadaEntrega: Date,
  notas: String
}, {
  timestamps: true
});

ordenCompraSchema.index({ empresaId: 1, numero: 1 },    { unique: true });
ordenCompraSchema.index({ empresaId: 1, estado: 1 });
ordenCompraSchema.index({ empresaId: 1, proveedor: 1 });
ordenCompraSchema.index({ empresaId: 1, createdAt: -1 });

module.exports = mongoose.model('OrdenCompra', ordenCompraSchema);
