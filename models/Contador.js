const mongoose = require('mongoose');

/*
 * Genera números de documento auto-incrementales por empresa.
 * Uso: await Contador.siguiente(empresaId, 'venta')  → 1, 2, 3 ...
 * Los tipos válidos son: presupuesto, venta, factura, orden_compra, orden_produccion
 */
const contadorSchema = new mongoose.Schema({
  empresaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  tipo:      { type: String, required: true },
  siguiente: { type: Number, default: 0 }
});

contadorSchema.index({ empresaId: 1, tipo: 1 }, { unique: true });

contadorSchema.statics.siguiente = async function (empresaId, tipo) {
  const doc = await this.findOneAndUpdate(
    { empresaId, tipo },
    { $inc: { siguiente: 1 } },
    { new: true, upsert: true }
  );
  return doc.siguiente;
};

module.exports = mongoose.model('Contador', contadorSchema);
