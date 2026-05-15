const express = require('express');
const router  = express.Router();
const { check } = require('express-validator');
const { verificarToken } = require('../middleware/authMiddleware');
const { validar }        = require('../middleware/validationMiddleware');
const {
  obtenerClientes,
  crearCliente,
  obtenerCliente,
  actualizarCliente,
  eliminarCliente,
  importarClientes
} = require('../controllers/clienteController');

router.get('/',    verificarToken, obtenerClientes);
router.get('/:id', verificarToken, obtenerCliente);

router.post(
  '/',
  verificarToken,
  [
    check('nombre', 'El nombre es obligatorio').not().isEmpty(),
    check('email').optional({ checkFalsy: true }).isEmail().withMessage('Email inválido'),
    check('telefono').optional().isString()
  ],
  validar,
  crearCliente
);

router.put(
  '/:id',
  verificarToken,
  [
    check('email').optional({ checkFalsy: true }).isEmail().withMessage('Email inválido'),
    check('telefono').optional().isString()
  ],
  validar,
  actualizarCliente
);

router.delete('/:id', verificarToken, eliminarCliente);
router.post('/importar', verificarToken, importarClientes);

module.exports = router;
