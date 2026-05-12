const cloudinary = require('cloudinary').v2;

// Parseo explícito para evitar problemas con espacios invisibles o URLs mal leídas
const cloudName  = (process.env.CLOUDINARY_CLOUD_NAME  || '').trim();
const apiKey     = (process.env.CLOUDINARY_API_KEY      || '').trim();
const apiSecret  = (process.env.CLOUDINARY_API_SECRET   || '').trim();
const urlVar     = (process.env.CLOUDINARY_URL          || '').trim();

// Log de diagnóstico (sin exponer el secret completo)
console.log('[Cloudinary] CLOUDINARY_URL set:', !!urlVar);
console.log('[Cloudinary] cloud_name:', cloudName || '(vacío)');
console.log('[Cloudinary] api_key:', apiKey || '(vacío)');
console.log('[Cloudinary] api_secret length:', apiSecret.length, '| primeros 6:', apiSecret.substring(0, 6));

if (urlVar) {
  // Parseo manual de cloudinary://<api_key>:<api_secret>@<cloud_name>
  try {
    const parsed = new URL(urlVar);
    cloudinary.config({
      cloud_name: parsed.hostname.trim(),
      api_key:    decodeURIComponent(parsed.username).trim(),
      api_secret: decodeURIComponent(parsed.password).trim(),
      secure:     true,
    });
    console.log('[Cloudinary] Config cargada desde CLOUDINARY_URL. cloud_name:', parsed.hostname.trim());
  } catch (e) {
    console.error('[Cloudinary] Error al parsear CLOUDINARY_URL:', e.message);
  }
} else {
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  console.log('[Cloudinary] Config cargada desde variables separadas.');
}

module.exports = cloudinary;
