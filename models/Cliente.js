/*
 * DEPRECADO — usar Contacto directamente.
 * Este shim mantiene compatibilidad mientras se migran los controllers.
 * Filtrar clientes: Contacto.find({ empresaId, tipo: 'cliente' })
 */
module.exports = require('./Contacto');
