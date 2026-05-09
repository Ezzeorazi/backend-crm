const express = require('express');
const router  = express.Router();
const { verificarToken, permitirRoles } = require('../middleware/authMiddleware');
const {
  obtenerOrdenes,
  obtenerOrden,
  crearOrden,
  actualizarOrden,
  recibirOrden,
  eliminarOrden
} = require('../controllers/ordenCompraController');

router.get('/',          verificarToken, obtenerOrdenes);
router.get('/:id',       verificarToken, obtenerOrden);
router.post('/',         verificarToken, permitirRoles('admin', 'compras'), crearOrden);
router.put('/:id',       verificarToken, permitirRoles('admin', 'compras'), actualizarOrden);
router.post('/:id/recibir', verificarToken, permitirRoles('admin', 'compras', 'inventario'), recibirOrden);
router.delete('/:id',    verificarToken, permitirRoles('admin'), eliminarOrden);

module.exports = router;
