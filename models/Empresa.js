const mongoose = require('mongoose');

const configuracionSchema = new mongoose.Schema({
  moneda:          { type: String, default: 'ARS' },
  tipoCambio:      { type: Number, default: 1 },
  idioma:          { type: String, default: 'es' },
  ivaDefault:      { type: Number, default: 21 },
  tipoFacturacion: { type: String, enum: ['A', 'B', 'C', 'X'], default: 'B' }
}, { _id: false });

const empresaSchema = new mongoose.Schema({
  nombre:       { type: String, required: true, trim: true },
  razonSocial:  { type: String, trim: true },
  // Tipo de organización: empresa (con personería jurídica) o autónomo/freelancer
  tipoOrganizacion: {
    type:    String,
    enum:    ['empresa', 'autonomo'],
    default: 'empresa'
  },
  // Identificador fiscal genérico (CUIT, RFC, RUT, NIT, RUC, CNPJ, etc. según país)
  identificadorFiscal:      { type: String, trim: true },
  tipoIdentificadorFiscal:  { type: String, trim: true }, // label del campo según país y tipo
  cuit:         { type: String, trim: true }, // campo legacy — usar identificadorFiscal
  email:        { type: String, trim: true, lowercase: true },
  telefono:     String,
  whatsapp:     { type: String, trim: true },
  direccion:    String,
  ciudad:       String,
  provincia:    String,
  pais:         { type: String, default: 'Argentina' },
  sector:       String,
  logoUrl:      String,
  colorPrimario: { type: String, default: '#3B82F6' },
  plan: {
    type:    String,
    enum:    ['free', 'starter', 'pro', 'enterprise'],
    default: 'free'
  },
  chatStats: {
    mes:  { type: String, default: '' },   // formato "YYYY-MM"
    usos: { type: Number, default: 0 }
  },
  estado: {
    type:    String,
    enum:    ['activo', 'inactivo', 'suspendido'],
    default: 'activo'
  },
  configuracion: { type: configuracionSchema, default: () => ({}) }
}, {
  timestamps: true
});

module.exports = mongoose.model('Empresa', empresaSchema);
