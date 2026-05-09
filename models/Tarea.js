const mongoose = require('mongoose');

const comentarioSchema = new mongoose.Schema({
  texto: { type: String, required: true },
  autor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fecha: { type: Date, default: Date.now }
}, { _id: false });

const tareaSchema = new mongoose.Schema({
  empresaId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  titulo:     { type: String, required: true, trim: true },
  descripcion: String,
  tipo: {
    type:    String,
    enum:    ['llamada', 'reunion', 'email', 'seguimiento', 'otro'],
    default: 'otro'
  },
  asignadoA: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  estado: {
    type:    String,
    enum:    ['pendiente', 'en_progreso', 'completada', 'cancelada'],
    default: 'pendiente'
  },
  prioridad: {
    type:    String,
    enum:    ['alta', 'media', 'baja'],
    default: 'media'
  },
  // referencias opcionales al contexto de la tarea
  contactoId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Contacto' },
  productoId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Producto' },
  ventaId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Venta' },
  fechaInicio:     Date,
  fechaVencimiento: Date,
  comentarios: [comentarioSchema]
}, {
  timestamps: true
});

tareaSchema.index({ empresaId: 1, asignadoA: 1, estado: 1 });
tareaSchema.index({ empresaId: 1, contactoId: 1 });
tareaSchema.index({ empresaId: 1, fechaVencimiento: 1, estado: 1 });

module.exports = mongoose.model('Tarea', tareaSchema);
