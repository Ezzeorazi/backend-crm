const mongoose = require('mongoose');

const etapaSchema = new mongoose.Schema({
  nombre:      { type: String, required: true },
  estado: {
    type:    String,
    enum:    ['pendiente', 'en_progreso', 'completada'],
    default: 'pendiente'
  },
  responsable: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  fechaInicio: Date,
  fechaFin:    Date,
  notas:       String
}, { _id: false });

const ordenProduccionSchema = new mongoose.Schema({
  empresaId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  numero:     { type: Number, required: true },
  producto:   { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
  cantidad:   { type: Number, required: true, min: 1 },
  ventaId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Venta' },
  creadoPor:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  estadoGeneral: {
    type:    String,
    enum:    ['borrador', 'en_proceso', 'pausada', 'completada', 'cancelada'],
    default: 'borrador'
  },
  etapas:          [etapaSchema],
  fechaEstimada:   Date,
  observaciones:   String
}, {
  timestamps: true
});

// numero único por empresa
ordenProduccionSchema.index({ empresaId: 1, numero: 1 },         { unique: true });
ordenProduccionSchema.index({ empresaId: 1, estadoGeneral: 1 });
ordenProduccionSchema.index({ empresaId: 1, producto: 1 });

module.exports = mongoose.model('OrdenProduccion', ordenProduccionSchema);
