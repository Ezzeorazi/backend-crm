const mongoose = require('mongoose');

// Snapshot del cliente al momento de emitir — requerido para PDFs y auditoría
const clienteSnapshotSchema = new mongoose.Schema({
  nombre:      String,
  razonSocial: String,
  cuit:        String,
  direccion:   String,
  email:       String
}, { _id: false });

const facturaSchema = new mongoose.Schema({
  empresaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  numero:    { type: Number, required: true },
  tipo:      { type: String, enum: ['A', 'B', 'C', 'X'], default: 'B' },
  venta:     { type: mongoose.Schema.Types.ObjectId, ref: 'Venta', required: true },
  cliente:   { type: mongoose.Schema.Types.ObjectId, ref: 'Contacto', required: true },
  clienteSnapshot: { type: clienteSnapshotSchema, default: () => ({}) },
  subtotal:  { type: Number, required: true, min: 0 },
  descuento: { type: Number, default: 0, min: 0 },
  iva:       { type: Number, required: true, min: 0 },
  total:     { type: Number, required: true, min: 0 },
  estado: {
    type:    String,
    enum:    ['pendiente', 'pagada', 'parcial', 'anulada'],
    default: 'pendiente'
  },
  vencimiento: Date,
  notas:       String
}, {
  timestamps: true
});

// numero único por empresa
facturaSchema.index({ empresaId: 1, numero: 1 }, { unique: true });
facturaSchema.index({ empresaId: 1, estado: 1 });
facturaSchema.index({ empresaId: 1, cliente: 1 });
facturaSchema.index({ empresaId: 1, createdAt: -1 });

module.exports = mongoose.model('Factura', facturaSchema);
