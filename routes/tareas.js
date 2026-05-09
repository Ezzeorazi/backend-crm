const express = require('express');
const router = express.Router();

const {
  obtenerTareas,
  obtenerTarea,
  crearTarea,
  actualizarTarea,
  eliminarTarea,
  agregarComentario
} = require('../controllers/tareaController');

const { verificarToken, permitirRoles } = require('../middleware/authMiddleware');

router.get('/', verificarToken, obtenerTareas);
router.get('/:id', verificarToken, obtenerTarea);
router.post('/', verificarToken, permitirRoles('admin', 'produccion', 'soporte'), crearTarea);
router.put('/:id', verificarToken, permitirRoles('admin', 'produccion', 'soporte'), actualizarTarea);
router.delete('/:id', verificarToken, permitirRoles('admin', 'produccion'), eliminarTarea);
router.post('/:id/comentarios', verificarToken, agregarComentario);

module.exports = router;
