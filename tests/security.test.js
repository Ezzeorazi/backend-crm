/**
 * Tests de seguridad HTTP: CORS, headers de Helmet, admin route, rate limiting.
 * Se carga app DESPUÉS de configurar las variables de entorno necesarias.
 */

// Configurar CORS_ORIGIN antes de cargar app.js
process.env.CORS_ORIGIN  = 'https://nimbuscrm.netlify.app,http://localhost:5173';
process.env.JWT_SECRET   = 'testsecret';
process.env.ADMIN_SECRET = 'admin-secret-test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');

// ──────────────────────────────────────────────────────────────
// CORS
// ──────────────────────────────────────────────────────────────
describe('Seguridad — CORS', () => {
  it('acepta origin permitido (producción)', async () => {
    const res = await request(app)
      .get('/api/status')
      .set('Origin', 'https://nimbuscrm.netlify.app');
    expect(res.headers['access-control-allow-origin']).toBe('https://nimbuscrm.netlify.app');
  });

  it('acepta origin permitido (localhost dev)', async () => {
    const res = await request(app)
      .get('/api/status')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('NO acepta origin malicioso', async () => {
    const res = await request(app)
      .get('/api/status')
      .set('Origin', 'https://atacante.com');
    // El origin atacante nunca debe aparecer en el header de respuesta
    expect(res.headers['access-control-allow-origin']).not.toBe('https://atacante.com');
  });

  it('acepta requests sin Origin (Postman, server-to-server, same-origin)', async () => {
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
  });

  it('NO refleja automáticamente cualquier origin con credentials', async () => {
    // Vulnerabilidad clásica: origin reflejado + credentials permite CSRF
    const res = await request(app)
      .get('/api/status')
      .set('Origin', 'https://cualquier-origen.com');
    expect(res.headers['access-control-allow-origin']).not.toBe('https://cualquier-origen.com');
  });
});

// ──────────────────────────────────────────────────────────────
// Headers de Helmet (seguridad HTTP)
// ──────────────────────────────────────────────────────────────
describe('Seguridad — Headers HTTP (Helmet)', () => {
  it('incluye X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/api/status');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('incluye X-Frame-Options para prevenir clickjacking', async () => {
    const res = await request(app).get('/api/status');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('no expone X-Powered-By (fingerprinting de tecnología)', async () => {
    const res = await request(app).get('/api/status');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────
// Admin route — autenticación por secret header
// ──────────────────────────────────────────────────────────────
describe('Seguridad — Ruta /api/admin', () => {
  it('401 sin el header x-admin-secret', async () => {
    const res = await request(app).get('/api/admin/empresas');
    expect(res.status).toBe(401);
    expect(res.body.mensaje).toMatch(/no autorizado/i);
  });

  it('401 con secret incorrecto', async () => {
    const res = await request(app)
      .get('/api/admin/empresas')
      .set('x-admin-secret', 'secreto-equivocado');
    expect(res.status).toBe(401);
  });

  it('un JWT de usuario normal no da acceso a /api/admin/empresas', async () => {
    const token = jwt.sign({ id: 'u', empresaId: 'e', rol: 'admin' }, process.env.JWT_SECRET);
    const res = await request(app)
      .get('/api/admin/empresas')
      .set('Authorization', `Bearer ${token}`);
    // Debe seguir requiriendo x-admin-secret
    expect(res.status).toBe(401);
  });

  it('PATCH /api/admin/empresa/:id/plan rechaza planes inválidos', async () => {
    const res = await request(app)
      .patch('/api/admin/empresa/emp1/plan')
      .set('x-admin-secret', process.env.ADMIN_SECRET)
      .send({ plan: 'ultra-premium-falso' });
    expect(res.status).toBe(400);
    expect(res.body.mensaje).toMatch(/plan inválido/i);
  });
});

// ──────────────────────────────────────────────────────────────
// Sanitización NoSQL (mongo-sanitize)
// ──────────────────────────────────────────────────────────────
describe('Seguridad — Sanitización NoSQL', () => {
  it('rechaza intento de inyección NoSQL en login (campo con $)', async () => {
    // Con express-mongo-sanitize activo, los campos con $ se limpian
    // Resultado: email se convierte en undefined → falla validación o devuelve 400/404
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email:      { $gt: '' },  // intento de inyección NoSQL
        contraseña: '123456'
      });
    // No debe devolver 200 (no debe autenticar)
    expect(res.status).not.toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────
// Healthcheck
// ──────────────────────────────────────────────────────────────
describe('GET /api/status', () => {
  it('200 sin autenticación (healthcheck público)', async () => {
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
