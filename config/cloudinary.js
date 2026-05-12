const cloudinary = require('cloudinary').v2;

// El SDK auto-configura desde CLOUDINARY_URL si está presente.
// Solo configurar manualmente si se usan variables separadas.
if (!process.env.CLOUDINARY_URL) {
  cloudinary.config({
    cloud_name: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
    api_key:    (process.env.CLOUDINARY_API_KEY    || '').trim(),
    api_secret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
  });
}

cloudinary.config({ secure: true });

module.exports = cloudinary;
