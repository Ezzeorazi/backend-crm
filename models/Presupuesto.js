const mongoose = require('mongoose');

const productoItemSchema = new mongoose.Schema({
  producto:  { type: mongoose.Schema.Types.ObjectId, ref: 'Producto' },
  nombre:    { type: String, required: true },  // snapshot
  sku:       String,                             // snapshot
  cantidad:  { type: Number, required: true, min: 1 },
  precio:    { type: Number, required: true, min: 0 },
  descuento: { type: Number, default: 0, min: 0, max: 100 }, // %
  subtotal:  { type: Number, required: true, min: 0 }
}, { _id: false });

const presupuestoSchema = new mongoose.Schema({
  empresaId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  numero:      { type: Number, required: true },
  cliente:     { type: mongoose.Schema.Types.ObjectId, ref: 'Contacto', required: true },
  creadoPor:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  productos:   [productoItemSchema],
  subtotal:    { type: Number, required: true, min: 0 },
  descuento:   { type: Number, default: 0, min: 0 }, // monto global
  iva:         { type: Number, default: 0, min: 0 }, // monto calculado
  ivaPct:      { type: Number, default: 0, min: 0 }, // porcentaje (ej: 16)
  total:       { type: Number, required: true, min: 0 },
  validezDias: { type: Number, default: 30 },
  vencimiento: Date,
  estado: {
    type:    String,
    enum:    ['borrador', 'enviado', 'aceptado', 'rechazado', 'vencido'],
    default: 'borrador'
  },
  notas: String
}, {
  timestamps: true
});

presupuestoSchema.index({ empresaId: 1, numero: 1 }, { unique: true });
presupuestoSchema.index({ empresaId: 1, estado: 1 });
presupuestoSchema.index({ empresaId: 1, cliente: 1 });
presupuestoSchema.index({ empresaId: 1, createdAt: -1 });

module.exports = mongoose.model('Presupuesto', presupuestoSchema);
