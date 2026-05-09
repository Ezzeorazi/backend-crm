/*
 * DEPRECADO — usar Contacto directamente.
 * Este shim mantiene compatibilidad mientras se migran los controllers.
 * Filtrar proveedores: Contacto.find({ empresaId, tipo: 'proveedor' })
 */
module.exports = require('./Contacto');
