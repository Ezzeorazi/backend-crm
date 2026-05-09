// Rutas de usuarios. Usan userController.js
// Rutas de usuarios.
// Reciben solicitudes del frontend y llaman al userController.
// Protegidas por authMiddleware para verificar permisos.
const express = require('express');
const router = express.Router();
const {
  obtenerUsuarios,
  crearUsuario,
  obtenerUsuarioPorId,
  actualizarUsuario,
  cambiarPasswordPerfil,
  eliminarUsuario
} = require('../controllers/userController');
const { verificarToken } = require('../middleware/authMiddleware');
const { check } = require('express-validator');
const { validar } = require('../middleware/validationMiddleware');

router.get('/', verificarToken, obtenerUsuarios);
router.post(
  '/',
  verificarToken,
  [
    check('nombre', 'El nombre es obligatorio').not().isEmpty(),
    check('email', 'Email inválido').isEmail(),
    check('contraseña', 'La contraseña debe tener al menos 6 caracteres').isLength({ min: 6 }),
    check('rol', 'Rol inválido').isIn(['admin', 'ventas', 'compras', 'inventario', 'rrhh', 'produccion', 'soporte'])
  ],
  validar,
  crearUsuario
);
router.get('/:id', verificarToken, obtenerUsuarioPorId);
router.put('/perfil/password', verificarToken, cambiarPasswordPerfil);
router.put('/:id', verificarToken, actualizarUsuario);
router.delete('/:id', verificarToken, eliminarUsuario);

module.exports = router;
