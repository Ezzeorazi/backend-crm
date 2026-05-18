const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  nombre:     { type: String, required: true, trim: true },
  empresaId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  email:      { type: String, required: true, trim: true, lowercase: true },
  contraseña: { type: String, required: true },
  rol: {
    type:    String,
    enum:    ['admin', 'ventas', 'compras', 'inventario', 'rrhh', 'produccion', 'soporte'],
    default: 'ventas'
  },
  activo:       { type: Boolean, default: false }, // Se activa al verificar el email
  emailVerificado: { type: Boolean, default: false },
  verificationToken: String,
  avatar:       String,
  telefono:     String,
  ultimoAcceso: Date,
  resetPasswordToken: String,
  resetPasswordExpire: Date
}, {
  timestamps: true
});

// email único por empresa (multi-tenant)
userSchema.index({ empresaId: 1, email: 1 }, { unique: true });
userSchema.index({ empresaId: 1, rol:   1 });
userSchema.index({ empresaId: 1, activo: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('contraseña')) return next();
  const salt = await bcrypt.genSalt(10);
  this.contraseña = await bcrypt.hash(this.contraseña, salt);
  next();
});

userSchema.methods.compararPassword = async function (passwordIngresada) {
  return bcrypt.compare(passwordIngresada, this.contraseña);
};

module.exports = mongoose.model('User', userSchema);
