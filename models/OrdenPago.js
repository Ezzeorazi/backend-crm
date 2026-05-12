const mongoose = require('mongoose');

const ordenPagoSchema = new mongoose.Schema({
  empresaId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  numero:      { type: Number, required: true },
  compraId:    { type: mongoose.Schema.Types.ObjectId, ref: 'OrdenCompra', required: true },
  proveedor:   { type: mongoose.Schema.Types.ObjectId, ref: 'Contacto' },
  concepto:    { type: String, required: true },
  monto:       { type: Number, required: true, min: 0 },
  fecha:       { type: Date, default: Date.now },
  metodoPago:  { type: String, enum: ['efectivo', 'tarjeta', 'transferencia'], required: true },
  estado:      { type: String, enum: ['borrador', 'aprobada', 'ejecutada', 'cancelada'], default: 'borrador' },
  cuotaNumero: Number,
  notas:       String,
}, { timestamps: true });

ordenPagoSchema.index({ empresaId: 1, numero: 1 }, { unique: true });
ordenPagoSchema.index({ empresaId: 1, compraId: 1 });
ordenPagoSchema.index({ empresaId: 1, createdAt: -1 });

module.exports = mongoose.model('OrdenPago', ordenPagoSchema);
