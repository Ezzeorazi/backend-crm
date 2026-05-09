const mongoose = require('mongoose');

const pagoSchema = new mongoose.Schema({
  empresaId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  factura:       { type: mongoose.Schema.Types.ObjectId, ref: 'Factura', required: true },
  monto:         { type: Number, required: true, min: 0 },
  metodo: {
    type: String,
    enum: [
      'efectivo',
      'transferencia',
      'cheque',
      'tarjeta_credito',
      'tarjeta_debito',
      'mercadopago',
      'otro'
    ],
    required: true
  },
  referencia:    String, // Nº cheque, ID transferencia, comprobante, etc.
  notas:         String,
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

pagoSchema.index({ empresaId: 1, factura: 1 });
pagoSchema.index({ empresaId: 1, createdAt: -1 });

module.exports = mongoose.model('Pago', pagoSchema);
