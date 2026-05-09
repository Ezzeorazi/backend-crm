const Empresa = require('../models/Empresa');
const User = require('../models/User');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'nimbus-logos',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    public_id: (req, file) => `logo_${req.empresaId}_${Date.now()}`,
  },
});

const uploadLogo = multer({ storage });

const crearEmpresaDemo = async (req, res) => {
  const {
    nombre, plan, colorPrimario,
    tipoOrganizacion, pais, identificadorFiscal, tipoIdentificadorFiscal,
    moneda, ivaDefault,
    nombreUsuario, emailUsuario, contraseña,
  } = req.body;

  // Verificar email duplicado antes de crear nada
  const emailExistente = await User.findOne({ email: emailUsuario.toLowerCase().trim() });
  if (emailExistente) {
    return res.status(409).json({ mensaje: 'Ya existe una cuenta con ese correo electrónico.' });
  }

  let empresaGuardada = null;
  try {
    const empresa = new Empresa({
      nombre,
      plan,
      colorPrimario,
      tipoOrganizacion: tipoOrganizacion || 'empresa',
      pais: pais || 'Argentina',
      identificadorFiscal,
      tipoIdentificadorFiscal,
      configuracion: {
        moneda:     moneda     || 'ARS',
        ivaDefault: ivaDefault != null ? Number(ivaDefault) : 21,
      },
    });
    empresaGuardada = await empresa.save();
  } catch (error) {
    console.error('Error al guardar empresa:', error);
    return res.status(500).json({ mensaje: 'Error al crear la empresa.', error: error.message });
  }

  try {
    const user = new User({
      nombre: nombreUsuario,
      email: emailUsuario,
      contraseña,
      rol: 'admin',
      empresaId: empresaGuardada._id
    });
    await user.save();
  } catch (error) {
    // Rollback: eliminar la empresa si el usuario falla
    await Empresa.findByIdAndDelete(empresaGuardada._id).catch(() => {});
    console.error('Error al guardar usuario admin:', error);
    return res.status(500).json({ mensaje: 'Error al crear el usuario administrador.', error: error.message });
  }

  res.status(201).json({ mensaje: 'Empresa y usuario creados' });
};

const subirLogo = async (req, res) => {
  try {
    const empresa = await Empresa.findById(req.empresaId);
    if (!empresa) {
      return res.status(404).json({ mensaje: 'Empresa no encontrada' });
    }
    if (req.file) {
      const logoPath = req.file.path; // Cloudinary nos devuelve la URL en req.file.path
      empresa.logoUrl = logoPath;
      await empresa.save();
    }
    res.json({ logoUrl: empresa.logoUrl });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al subir logo', error: error.message });
  }
};

module.exports = { crearEmpresaDemo, subirLogo, uploadLogo };
