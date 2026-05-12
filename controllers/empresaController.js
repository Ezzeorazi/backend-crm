const Empresa = require('../models/Empresa');
const User = require('../models/User');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { sendMail } = require('../utils/mailer');

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Formato no soportado. Usá PNG, JPG o WEBP.'));
  },
});

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

  // Notificación al owner de la plataforma
  if (process.env.ADMIN_NOTIFY_EMAIL && process.env.SMTP_USER) {
    const fecha = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
    sendMail({
      to: process.env.ADMIN_NOTIFY_EMAIL,
      subject: 'Nueva cuenta creada — Nimbus CRM',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#4f46e5">Nueva cuenta registrada</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:6px 0;color:#64748b;width:140px">Empresa</td><td><strong>${nombre}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Plan</td><td>${plan || 'free'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Admin</td><td>${nombreUsuario}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Email</td><td>${emailUsuario}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Fecha</td><td>${fecha}</td></tr>
          </table>
        </div>
      `,
    }).catch(err => console.error('Error al enviar notificación de nueva cuenta:', err.message));
  }

  res.status(201).json({ mensaje: 'Empresa y usuario creados' });
};

const subirLogo = async (req, res) => {
  try {
    const empresa = await Empresa.findById(req.empresaId);
    if (!empresa) return res.status(404).json({ mensaje: 'Empresa no encontrada' });

    if (req.file) {
      const b64 = Buffer.from(req.file.buffer).toString('base64');
      const dataUri = `data:${req.file.mimetype};base64,${b64}`;
      const result = await cloudinary.uploader.upload(dataUri, {
        folder: 'nimbus-logos',
        public_id: `logo_${req.empresaId}`,
        overwrite: true,
      });
      empresa.logoUrl = result.secure_url;
      await empresa.save();
    }

    res.json({ logoUrl: empresa.logoUrl });
  } catch (error) {
    console.error('Error al subir logo:', error);
    res.status(500).json({ mensaje: 'Error al subir logo', error: error.message });
  }
};

const obtenerEmpresa = async (req, res) => {
  try {
    const empresa = await Empresa.findById(req.empresaId);
    if (!empresa) return res.status(404).json({ mensaje: 'Empresa no encontrada' });
    res.json(empresa);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener empresa', error: error.message });
  }
};

const actualizarEmpresa = async (req, res) => {
  try {
    const { nombre, razonSocial, direccion, telefono, colorPrimario, configuracion } = req.body;
    const empresa = await Empresa.findById(req.empresaId);
    
    if (!empresa) return res.status(404).json({ mensaje: 'Empresa no encontrada' });
    
    if (nombre) empresa.nombre = nombre;
    if (razonSocial !== undefined) empresa.razonSocial = razonSocial;
    if (direccion !== undefined) empresa.direccion = direccion;
    if (telefono !== undefined) empresa.telefono = telefono;
    if (colorPrimario) empresa.colorPrimario = colorPrimario;
    
    if (configuracion) {
      if (configuracion.moneda !== undefined) empresa.configuracion.moneda = configuracion.moneda;
      if (configuracion.tipoCambio !== undefined) empresa.configuracion.tipoCambio = configuracion.tipoCambio;
    }

    await empresa.save();
    res.json(empresa);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar empresa', error: error.message });
  }
};

module.exports = { crearEmpresaDemo, subirLogo, uploadLogo, obtenerEmpresa, actualizarEmpresa };
