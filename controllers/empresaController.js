const Empresa = require('../models/Empresa');
const User = require('../models/User');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { sendMail } = require('../utils/mailer');
const crypto = require('crypto');

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
    nombreUsuario, emailUsuario, contraseña, whatsapp,
  } = req.body;

  // Validaciones requeridas
  if (!whatsapp || !String(whatsapp).trim()) {
    return res.status(400).json({ mensaje: 'El número de WhatsApp es obligatorio para poder contactarte en caso de urgencia.' });
  }

  // Verificar email duplicado antes de crear nada
  const emailExistente = await User.findOne({ email: emailUsuario.toLowerCase().trim() });
  if (emailExistente) {
    return res.status(409).json({ mensaje: 'Ya existe una cuenta con ese correo electrónico.' });
  }

  // Número limpio para link de WhatsApp (solo dígitos)
  const whatsappLimpio = String(whatsapp).replace(/\D/g, '');

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
      telefono: whatsapp,
      whatsapp,
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

  let userGuardado = null;
  try {
    const verificationToken = crypto.randomBytes(20).toString('hex');
    const user = new User({
      nombre: nombreUsuario,
      email: emailUsuario,
      contraseña,
      rol: 'admin',
      empresaId: empresaGuardada._id,
      verificationToken
    });
    userGuardado = await user.save();

    const frontendUrl = process.env.CORS_ORIGIN || 'http://localhost:5173';
    const verifyUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/auth/verify-email/${verificationToken}`;

    await sendMail({
      to: emailUsuario,
      subject: 'Verificá tu email para activar tu cuenta de Nimbus CRM',
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
          <h2 style="color:#4f46e5">¡Hola ${nombreUsuario}! Te damos la bienvenida a Nimbus CRM 👋</h2>
          <p>Para poder iniciar sesión y usar tu nueva cuenta, por favor verificá tu dirección de email haciendo clic en el siguiente enlace:</p>
          <div style="text-align:center;margin:30px 0">
            <a href="${verifyUrl}" style="background-color:#4f46e5;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">Verificar Email</a>
          </div>
          <p>Si el botón no funciona, podés copiar y pegar este enlace en tu navegador:</p>
          <p style="word-break:break-all;color:#64748b;font-size:14px;">${verifyUrl}</p>
          <p>Si no fuiste vos quien creó esta cuenta, podés ignorar este correo.</p>
        </div>
      `
    });
  } catch (error) {
    // Rollback: eliminar la empresa si el usuario falla
    await Empresa.findByIdAndDelete(empresaGuardada._id).catch(() => {});
    if (userGuardado) await User.findByIdAndDelete(userGuardado._id).catch(() => {});
    console.error('Error al guardar usuario admin o enviar email:', error);
    return res.status(500).json({ mensaje: 'Error al crear el usuario administrador o enviar el email.', error: error.message });
  }

  // Notificación al owner de la plataforma
  if (process.env.ADMIN_NOTIFY_EMAIL && process.env.SMTP_USER) {
    const fecha = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
    sendMail({
      to: process.env.ADMIN_NOTIFY_EMAIL,
      subject: '🆕 Nueva cuenta — Nimbus CRM',
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
          <h2 style="color:#4f46e5">Nueva cuenta registrada 🎉</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
            <tr><td style="padding:6px 0;color:#64748b;width:140px">Empresa</td><td><strong>${nombre}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Tipo</td><td>${tipoOrganizacion === 'autonomo' ? 'Autónomo / Freelancer' : 'Empresa / PYME'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">País</td><td>${pais || 'Argentina'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Plan</td><td>${plan || 'free'}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Admin</td><td>${nombreUsuario}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Email</td><td><a href="mailto:${emailUsuario}">${emailUsuario}</a></td></tr>
            <tr><td style="padding:6px 0;color:#64748b">WhatsApp</td><td>${whatsapp}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b">Fecha</td><td>${fecha}</td></tr>
          </table>
          <a href="https://wa.me/${whatsappLimpio}" target="_blank"
            style="display:inline-block;background:#25D366;color:white;font-weight:600;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px">
            📱 Abrir chat de WhatsApp
          </a>
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
      empresa.onboarding.logo = true; // Marcar paso de onboarding
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

    empresa.onboarding.perfil = true; // Marcar paso de onboarding

    await empresa.save();
    res.json(empresa);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar empresa', error: error.message });
  }
};

const reclamarRecompensaOnboarding = async (req, res) => {
  try {
    const empresa = await Empresa.findById(req.empresaId);
    if (!empresa) return res.status(404).json({ mensaje: 'Empresa no encontrada' });

    if (empresa.onboarding.recompensaReclamada) {
      return res.status(400).json({ mensaje: 'La recompensa ya fue reclamada' });
    }

    const { perfil, logo, venta } = empresa.onboarding;
    if (!perfil || !logo || !venta) {
      return res.status(400).json({ mensaje: 'Aún no completaste todos los pasos del onboarding' });
    }

    // Dar recompensa: Restar 10 usos de Harry para este mes (lo que da 10 mensajes gratis adicionales)
    if (empresa.chatStats && empresa.chatStats.usos > 0) {
      empresa.chatStats.usos = Math.max(0, empresa.chatStats.usos - 10);
    }

    empresa.onboarding.recompensaReclamada = true;
    await empresa.save();

    res.json({ mensaje: '¡Recompensa reclamada! 10 mensajes de Harry añadidos a tu cuenta.', empresa });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al reclamar recompensa', error: error.message });
  }
};

module.exports = { crearEmpresaDemo, subirLogo, uploadLogo, obtenerEmpresa, actualizarEmpresa, reclamarRecompensaOnboarding };
