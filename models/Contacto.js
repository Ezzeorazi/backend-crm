const mongoose = require('mongoose');

/*
 * Modelo unificado que reemplaza a Cliente y Proveedor.
 * Un mismo contacto puede ser cliente, proveedor, o ambos (array multi-valor).
 * Para filtrar solo clientes:   { empresaId, tipo: 'cliente' }
 * Para filtrar solo proveedores: { empresaId, tipo: 'proveedor' }
 * MongoDB evalúa la igualdad contra arrays de forma nativa (multikey index).
 */
const contactoSchema = new mongoose.Schema({
  empresaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  tipo: {
    type: [{ type: String, enum: ['cliente', 'proveedor'] }],
    required: true,
    validate: {
      validator: v => Array.isArray(v) && v.length > 0,
      message:   'El contacto debe tener al menos un tipo (cliente o proveedor)'
    }
  },
  nombre:      { type: String, required: true, trim: true },
  razonSocial: { type: String, trim: true },
  cuit:        { type: String, trim: true }, // CUIT o CUIL según corresponda
  email:       { type: String, trim: true, lowercase: true },
  telefono:    String,
  empresa:     String,  // nombre comercial (si difiere de razonSocial)
  direccion:   String,
  ciudad:      String,
  provincia:   String,
  pais:        { type: String, default: 'Argentina' },
  notas:       String,
  activo:      { type: Boolean, default: true }
}, {
  timestamps: true
});

contactoSchema.index({ empresaId: 1, tipo: 1 });
contactoSchema.index({ empresaId: 1, activo: 1 });
// índice de texto para búsqueda rápida
contactoSchema.index(
  { empresaId: 1, nombre: 'text', razonSocial: 'text', email: 'text' },
  { name: 'contacto_busqueda' }
);

module.exports = mongoose.model('Contacto', contactoSchema);
