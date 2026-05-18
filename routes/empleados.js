const express = require('express');
const router = express.Router();
const {
  obtenerEmpleados,
  obtenerEmpleado,
  crearEmpleado,
  actualizarEmpleado,
  eliminarEmpleado
} = require('../controllers/empleadoController');
const { verificarToken, permitirRoles } = require('../middleware/authMiddleware');

// Middleware para verificar autenticación
router.use(verificarToken);

// Solo admin y rrhh deberían poder gestionar empleados
// Para listar, también podría dejarse a la gerencia (admin)
router.use(permitirRoles('admin', 'rrhh'));

router.get('/', obtenerEmpleados);
router.post('/', crearEmpleado);

router.get('/:id', obtenerEmpleado);
router.put('/:id', actualizarEmpleado);
router.delete('/:id', eliminarEmpleado);

module.exports = router;
