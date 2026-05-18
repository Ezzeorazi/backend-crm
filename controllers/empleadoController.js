const Empleado = require('../models/Empleado');

// Obtener todos los empleados de la empresa
const obtenerEmpleados = async (req, res) => {
  try {
    const { busqueda, estado } = req.query;
    let query = { empresaId: req.empresaId };

    if (estado) {
      query.estado = estado;
    }

    if (busqueda) {
      const regex = new RegExp(busqueda, 'i');
      query.$or = [
        { nombre: regex },
        { apellido: regex },
        { cargo: regex },
        { dni: regex }
      ];
    }

    const empleados = await Empleado.find(query).sort({ nombre: 1, apellido: 1 });
    res.json(empleados);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener empleados', error: error.message });
  }
};

// Obtener un empleado por ID
const obtenerEmpleado = async (req, res) => {
  try {
    const empleado = await Empleado.findOne({ _id: req.params.id, empresaId: req.empresaId });
    if (!empleado) {
      return res.status(404).json({ mensaje: 'Empleado no encontrado' });
    }
    res.json(empleado);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener empleado', error: error.message });
  }
};

// Crear empleado
const crearEmpleado = async (req, res) => {
  try {
    const datos = req.body;
    datos.empresaId = req.empresaId; // Seguridad: forzar empresa actual

    const nuevoEmpleado = new Empleado(datos);
    const guardado = await nuevoEmpleado.save();

    res.status(201).json(guardado);
  } catch (error) {
    res.status(400).json({ mensaje: 'Error al crear empleado', error: error.message });
  }
};

// Actualizar empleado
const actualizarEmpleado = async (req, res) => {
  try {
    const actualizado = await Empleado.findOneAndUpdate(
      { _id: req.params.id, empresaId: req.empresaId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!actualizado) {
      return res.status(404).json({ mensaje: 'Empleado no encontrado' });
    }

    res.json(actualizado);
  } catch (error) {
    res.status(400).json({ mensaje: 'Error al actualizar empleado', error: error.message });
  }
};

// Eliminar empleado (hard delete, considerar soft delete en un futuro si hay historial de pagos)
const eliminarEmpleado = async (req, res) => {
  try {
    const eliminado = await Empleado.findOneAndDelete({ _id: req.params.id, empresaId: req.empresaId });
    if (!eliminado) {
      return res.status(404).json({ mensaje: 'Empleado no encontrado' });
    }
    res.json({ mensaje: 'Empleado eliminado' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar empleado', error: error.message });
  }
};

module.exports = {
  obtenerEmpleados,
  obtenerEmpleado,
  crearEmpleado,
  actualizarEmpleado,
  eliminarEmpleado
};
