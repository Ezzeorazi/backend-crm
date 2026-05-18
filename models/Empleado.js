const mongoose = require('mongoose');

const empleadoSchema = new mongoose.Schema({
  empresaId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  nombre:         { type: String, required: true, trim: true },
  apellido:       { type: String, required: true, trim: true },
  dni:            { type: String, trim: true },
  cuil:           { type: String, trim: true },
  fechaNacimiento:{ type: Date },
  fechaIngreso:   { type: Date, required: true, default: Date.now },
  cargo:          { type: String, required: true, trim: true },
  email:          { type: String, trim: true, lowercase: true },
  telefono:       { type: String, trim: true },
  direccion:      { type: String, trim: true },
  salarioBase:    { type: Number, required: true, min: 0 },
  estado:         { type: String, enum: ['activo', 'inactivo', 'licencia'], default: 'activo' },
  notas:          { type: String },
}, {
  timestamps: true
});

// Índices para búsquedas eficientes
empleadoSchema.index({ empresaId: 1, estado: 1 });
empleadoSchema.index({ empresaId: 1, email: 1 });

module.exports = mongoose.model('Empleado', empleadoSchema);
