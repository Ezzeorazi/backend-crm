const Contacto = require('../models/Contacto');

const obtenerClientes = async (req, res) => {
  try {
    const clientes = await Contacto.find({ empresaId: req.empresaId, tipo: 'cliente' }).sort({ createdAt: -1 });
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener clientes', error: error.message });
  }
};

const crearCliente = async (req, res) => {
  try {
    // si el frontend no envía tipo, lo asignamos aquí
    const tipo = req.body.tipo || ['cliente'];
    const cliente = new Contacto({ ...req.body, tipo, empresaId: req.empresaId });
    const guardado = await cliente.save();
    res.status(201).json(guardado);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al crear cliente', error: error.message });
  }
};

const obtenerCliente = async (req, res) => {
  try {
    const cliente = await Contacto.findOne({ _id: req.params.id, empresaId: req.empresaId, tipo: 'cliente' });
    if (!cliente) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    res.json(cliente);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener cliente', error: error.message });
  }
};

const actualizarCliente = async (req, res) => {
  try {
    const actualizado = await Contacto.findOneAndUpdate(
      { _id: req.params.id, empresaId: req.empresaId, tipo: 'cliente' },
      req.body,
      { new: true, runValidators: true }
    );
    if (!actualizado) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar cliente', error: error.message });
  }
};

const eliminarCliente = async (req, res) => {
  try {
    const eliminado = await Contacto.findOneAndDelete({ _id: req.params.id, empresaId: req.empresaId, tipo: 'cliente' });
    if (!eliminado) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    res.json({ mensaje: 'Cliente eliminado' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar cliente', error: error.message });
  }
};

module.exports = { obtenerClientes, crearCliente, obtenerCliente, actualizarCliente, eliminarCliente };
