const cloudinary = require('cloudinary').v2;

// CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
// El SDK la lee automáticamente; si no está, cae a las variables separadas
if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ secure: true });
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure:     true,
  });
}

module.exports = cloudinary;
