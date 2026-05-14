const express = require('express');
const router  = express.Router();
const { check } = require('express-validator');
const { validar } = require('../middleware/validationMiddleware');
const { verificarToken, permitirRoles } = require('../middleware/authMiddleware');

const {
  obtenerOportunidades,
  obtenerOportunidad,
  crearOportunidad,
  actualizarOportunidad,
  eliminarOportunidad,
  agregarActividad,
  completarActividad,
  eliminarActividad,
  vincularDocumento,
} = require('../controllers/oportunidadController');

// CRUD principal
router.get('/',    verificarToken, obtenerOportunidades);
router.get('/:id', verificarToken, obtenerOportunidad);

router.post(
  '/',
  verificarToken,
  permitirRoles('admin', 'ventas'),
  [check('titulo', 'El título es requerido').notEmpty()],
  validar,
  crearOportunidad,
);

router.put(
  '/:id',
  verificarToken,
  permitirRoles('admin', 'ventas'),
  validar,
  actualizarOportunidad,
);

router.delete('/:id', verificarToken, permitirRoles('admin'), eliminarOportunidad);

// Actividades
router.post(
  '/:id/actividades',
  verificarToken,
  permitirRoles('admin', 'ventas'),
  [check('titulo', 'El título de la actividad es requerido').notEmpty()],
  validar,
  agregarActividad,
);

router.patch(
  '/:id/actividades/:actividadId/completar',
  verificarToken,
  completarActividad,
);

router.delete(
  '/:id/actividades/:actividadId',
  verificarToken,
  permitirRoles('admin', 'ventas'),
  eliminarActividad,
);

// Vinculación de presupuestos / ventas generados desde la oportunidad
router.patch(
  '/:id/vincular',
  verificarToken,
  permitirRoles('admin', 'ventas'),
  vincularDocumento,
);

module.exports = router;
