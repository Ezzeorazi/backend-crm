const mongoose = require('mongoose');

const productoSchema = new mongoose.Schema({
  empresaId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  nombre:      { type: String, required: true, trim: true },
  sku:         { type: String, required: true, trim: true, uppercase: true },
  descripcion: String,
  stock:       { type: Number, required: true, default: 0, min: 0 },
  stockMinimo: { type: Number, default: 5, min: 0 },
  unidad:      { type: String, default: 'unidad' }, // unidad, kg, litro, m2, hora, etc.
  precio:      { type: Number, required: true, min: 0 },
  costo:       { type: Number, min: 0 },
  impuesto:    { type: Number, default: 21 },         // % IVA
  categoria:   String,
  imagenUrl:   String,
  activo:      { type: Boolean, default: true }
}, {
  timestamps: true
});

// SKU único por empresa
productoSchema.index({ empresaId: 1, sku: 1 },       { unique: true });
productoSchema.index({ empresaId: 1, categoria: 1 });
productoSchema.index({ empresaId: 1, activo: 1 });

module.exports = mongoose.model('Producto', productoSchema);
