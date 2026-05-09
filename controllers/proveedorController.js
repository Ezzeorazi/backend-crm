const Contacto = require('../models/Contacto');

const obtenerProveedores = async (req, res) => {
  try {
    const proveedores = await Contacto.find({ empresaId: req.empresaId, tipo: 'proveedor' }).sort({ createdAt: -1 });
    res.json(proveedores);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener proveedores', error: error.message });
  }
};

const crearProveedor = async (req, res) => {
  try {
    const tipo = req.body.tipo || ['proveedor'];
    const proveedor = new Contacto({ ...req.body, tipo, empresaId: req.empresaId });
    const guardado = await proveedor.save();
    res.status(201).json(guardado);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al crear proveedor', error: error.message });
  }
};

const obtenerProveedor = async (req, res) => {
  try {
    const proveedor = await Contacto.findOne({ _id: req.params.id, empresaId: req.empresaId, tipo: 'proveedor' });
    if (!proveedor) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
    res.json(proveedor);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener proveedor', error: error.message });
  }
};

const actualizarProveedor = async (req, res) => {
  try {
    const actualizado = await Contacto.findOneAndUpdate(
      { _id: req.params.id, empresaId: req.empresaId, tipo: 'proveedor' },
      req.body,
      { new: true, runValidators: true }
    );
    if (!actualizado) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar proveedor', error: error.message });
  }
};

const eliminarProveedor = async (req, res) => {
  try {
    const eliminado = await Contacto.findOneAndDelete({ _id: req.params.id, empresaId: req.empresaId, tipo: 'proveedor' });
    if (!eliminado) return res.status(404).json({ mensaje: 'Proveedor no encontrado' });
    res.json({ mensaje: 'Proveedor eliminado' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar proveedor', error: error.message });
  }
};

module.exports = { obtenerProveedores, crearProveedor, obtenerProveedor, actualizarProveedor, eliminarProveedor };
