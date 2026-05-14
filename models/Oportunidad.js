const mongoose = require('mongoose');

const actividadSchema = new mongoose.Schema({
  tipo:         { type: String, enum: ['llamada', 'email', 'reunion', 'tarea', 'otro'], default: 'tarea' },
  titulo:       { type: String, required: true },
  nota:         String,
  fechaLimite:  Date,
  responsable:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completada:   { type: Boolean, default: false },
  completadaEn: Date,
}, { timestamps: true });

const logSchema = new mongoose.Schema({
  descripcion: { type: String, required: true },
  usuario:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const oportunidadSchema = new mongoose.Schema({
  empresaId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  titulo:         { type: String, required: true, trim: true },
  contacto:       { type: mongoose.Schema.Types.ObjectId, ref: 'Contacto' },
  responsable:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  creadoPor:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  etapa: {
    type:    String,
    enum:    ['nuevo', 'calificado', 'propuesta', 'negociacion', 'ganado', 'perdido'],
    default: 'nuevo',
  },
  tipo: {
    type:    String,
    enum:    ['lead', 'oportunidad'],
    default: 'lead',
  },
  valorEstimado:  { type: Number, default: 0, min: 0 },
  probabilidad:   { type: Number, default: 10, min: 0, max: 100 },
  fechaCierre:    Date,
  motivoPerdida: {
    type: String,
    enum: ['precio', 'competencia', 'no_interesado', 'sin_respuesta', 'otro'],
  },
  fuente: {
    type: String,
    enum: ['manual', 'formulario_web', 'email', 'referido', 'evento', 'otro'],
    default: 'manual',
  },
  notas:       String,
  actividades: [actividadSchema],
  log:         [logSchema],
  // Referencias a documentos generados
  presupuestos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Presupuesto' }],
  ventas:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'Venta' }],
}, {
  timestamps: true,
});

// Probabilidad por defecto según etapa
const PROB_POR_ETAPA = {
  nuevo:       10,
  calificado:  25,
  propuesta:   50,
  negociacion: 75,
  ganado:      100,
  perdido:     0,
};

oportunidadSchema.pre('save', function (next) {
  if (this.isModified('etapa')) {
    this.probabilidad = PROB_POR_ETAPA[this.etapa] ?? this.probabilidad;
  }
  next();
});

oportunidadSchema.index({ empresaId: 1, etapa: 1 });
oportunidadSchema.index({ empresaId: 1, responsable: 1 });
oportunidadSchema.index({ empresaId: 1, contacto: 1 });
oportunidadSchema.index({ empresaId: 1, tipo: 1 });
oportunidadSchema.index({ empresaId: 1, createdAt: -1 });

module.exports = mongoose.model('Oportunidad', oportunidadSchema);
