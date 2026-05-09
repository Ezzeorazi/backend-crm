const User = require('../models/User');

const obtenerUsuarios = async (req, res) => {
  try {
    const usuarios = await User.find({ empresaId: req.empresaId }).select('-contraseña').sort({ createdAt: -1 });
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener usuarios', error: error.message });
  }
};

const crearUsuario = async (req, res) => {
  try {
    const { nombre, email, contraseña, rol, telefono } = req.body;

    // Email único por empresa
    const existe = await User.findOne({ empresaId: req.empresaId, email: email.toLowerCase().trim() });
    if (existe) {
      return res.status(400).json({ mensaje: 'Ya existe un usuario con ese email en tu empresa.' });
    }

    const nuevo = new User({ nombre, email, contraseña, rol, telefono, empresaId: req.empresaId });
    await nuevo.save();

    res.status(201).json({ ...nuevo.toObject(), contraseña: undefined });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al crear usuario', error: error.message });
  }
};

const obtenerUsuarioPorId = async (req, res) => {
  try {
    const usuario = await User.findOne({ _id: req.params.id, empresaId: req.empresaId }).select('-contraseña');
    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    res.json(usuario);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al buscar usuario', error: error.message });
  }
};

const actualizarUsuario = async (req, res) => {
  try {
    // No permitir cambio de contraseña por esta ruta
    const { contraseña, ...datos } = req.body;
    const actualizado = await User.findOneAndUpdate(
      { _id: req.params.id, empresaId: req.empresaId },
      datos,
      { new: true, runValidators: true }
    ).select('-contraseña');

    if (!actualizado) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar usuario', error: error.message });
  }
};

const cambiarPasswordPerfil = async (req, res) => {
  try {
    const { contrasenaActual, nuevaContrasena } = req.body;
    
    // Necesitamos traer la contraseña vieja para compararla, por ende agregamos select('+contraseña')
    // Asumiendo que req.usuario.id viene del authMiddleware (en el controlador original se usa req.usuario.id o req.usuario._id? En authMiddleware se asigna req.usuario = decodificado. El JWT contiene {id, rol, empresaId}).
    // Usaremos req.usuario.id
    const usuario = await User.findById(req.usuario.id);
    if (!usuario) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    const esCorrecta = await usuario.compararPassword(contrasenaActual);
    if (!esCorrecta) {
      return res.status(401).json({ mensaje: 'La contraseña actual es incorrecta' });
    }

    usuario.contraseña = nuevaContrasena;
    await usuario.save(); // esto disparará el pre-save hook de bcrypt

    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al cambiar la contraseña', error: error.message });
  }
};

const eliminarUsuario = async (req, res) => {
  try {
    const eliminado = await User.findOneAndDelete({ _id: req.params.id, empresaId: req.empresaId });
    if (!eliminado) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    res.json({ mensaje: 'Usuario eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar usuario', error: error.message });
  }
};

module.exports = { obtenerUsuarios, crearUsuario, obtenerUsuarioPorId, actualizarUsuario, cambiarPasswordPerfil, eliminarUsuario };
