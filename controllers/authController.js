const User = require('../models/User');
const jwt  = require('jsonwebtoken');

const loginUsuario = async (req, res) => {
  const { email, contraseña } = req.body;

  try {
    // Busca globalmente por email; en multi-tenant el email puede repetirse entre empresas
    // pero en la práctica cada persona tiene un email único.
    const usuario = await User.findOne({ email: email.toLowerCase().trim() });
    if (!usuario) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    if (!usuario.activo) {
      return res.status(403).json({ mensaje: 'Usuario desactivado. Contactá al administrador.' });
    }

    if (!usuario.emailVerificado) {
      return res.status(403).json({ mensaje: 'Debes verificar tu email antes de iniciar sesión. Revisá tu bandeja de entrada o spam.' });
    }

    const passwordValida = await usuario.compararPassword(contraseña);
    if (!passwordValida) {
      return res.status(401).json({ mensaje: 'Contraseña incorrecta' });
    }

    // Actualizar último acceso
    usuario.ultimoAcceso = new Date();
    await usuario.save();

    const token = jwt.sign(
      { id: usuario._id, rol: usuario.rol, empresaId: usuario.empresaId },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      mensaje: 'Login exitoso',
      token,
      usuario: {
        id:        usuario._id,
        nombre:    usuario.nombre,
        email:     usuario.email,
        rol:       usuario.rol,
        avatar:    usuario.avatar,
        empresaId: usuario.empresaId
      }
    });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error en el login', error: error.message });
  }
};

const crypto = require('crypto');
const nodemailer = require('nodemailer');

const olvidePassword = async (req, res) => {
  const { email } = req.body;
  
  try {
    const usuario = await User.findOne({ email: email.toLowerCase().trim() });
    if (!usuario) {
      // Siempre devolvemos éxito para evitar fuga de información de usuarios registrados
      return res.json({ mensaje: 'Si el correo existe, recibirás instrucciones.' });
    }

    // Generar token aleatorio
    const resetToken = crypto.randomBytes(20).toString('hex');
    
    // Guardar token hasheado en la base de datos para mayor seguridad
    usuario.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    usuario.resetPasswordExpire = Date.now() + 30 * 60 * 1000; // 30 minutos

    await usuario.save();

    // Crear URL de reseteo apuntando al frontend
    const resetUrl = `${process.env.CORS_ORIGIN || 'http://localhost:5173'}/reset-password/${resetToken}`;

    const mensaje = `Has solicitado restablecer tu contraseña. Haz click en el siguiente enlace:\n\n${resetUrl}\n\nSi no solicitaste esto, ignora este correo.`;

    try {
      if (process.env.SMTP_HOST && process.env.SMTP_USER) {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });

        await transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@nimbus-crm.com',
          to: usuario.email,
          subject: 'Restablecer contraseña - Nimbus CRM',
          text: mensaje
        });
      } else {
        // Fallback para desarrollo si no hay SMTP configurado
        console.log(`\n\n[DEV] Enlace de recuperación para ${usuario.email}: \n${resetUrl}\n\n`);
      }

      res.json({ mensaje: 'Si el correo existe, recibirás instrucciones.' });
    } catch (err) {
      usuario.resetPasswordToken = undefined;
      usuario.resetPasswordExpire = undefined;
      await usuario.save();
      console.error('Error al enviar correo:', err);
      res.status(500).json({ mensaje: 'Error al enviar el correo' });
    }

  } catch (error) {
    res.status(500).json({ mensaje: 'Error al procesar solicitud', error: error.message });
  }
};

const restablecerPassword = async (req, res) => {
  try {
    // Hashear el token recibido por parámetro para compararlo con el de la BD
    const resetPasswordToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const usuario = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!usuario) {
      return res.status(400).json({ mensaje: 'El token es inválido o ha expirado' });
    }

    // Setear la nueva contraseña
    usuario.contraseña = req.body.contraseña;
    usuario.resetPasswordToken = undefined;
    usuario.resetPasswordExpire = undefined;

    await usuario.save();

    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al restablecer contraseña', error: error.message });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const usuario = await User.findOne({ verificationToken: token });

    if (!usuario) {
      // Usamos el HTML de Nimbus para dar una respuesta bonita o redirigimos
      return res.status(400).send('<h1>Enlace inválido o expirado.</h1><p>Contactá a soporte.</p>');
    }

    usuario.emailVerificado = true;
    usuario.activo = true;
    usuario.verificationToken = undefined;
    await usuario.save();

    const frontendUrl = process.env.CORS_ORIGIN || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?verified=true`);
  } catch (error) {
    console.error('Error al verificar email:', error);
    res.status(500).send('<h1>Error interno al verificar email</h1>');
  }
};

module.exports = { loginUsuario, olvidePassword, restablecerPassword, verifyEmail };
