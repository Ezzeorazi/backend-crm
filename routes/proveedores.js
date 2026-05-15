// Rutas de proveedores. Usan proveedorController.js y se manejan en las vistas de proveedores
const express = require('express');
const router = express.Router();
const {
  obtenerProveedores,
  crearProveedor,
  obtenerProveedor,
  actualizarProveedor,
  eliminarProveedor,
  importarProveedores
} = require('../controllers/proveedorController');

const { verificarToken } = require('../middleware/authMiddleware');

// Todos los roles pueden acceder a este módulo
router.get('/', verificarToken, obtenerProveedores);
router.post('/', verificarToken, crearProveedor);
router.get('/:id', verificarToken, obtenerProveedor);
router.put('/:id', verificarToken, actualizarProveedor);
router.delete('/:id', verificarToken, eliminarProveedor);
router.post('/importar', verificarToken, importarProveedores);

module.exports = router;
