const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');

beforeAll(() => {
  process.env.JWT_SECRET = 'testsecret';
});

describe('Auth API - casos negativos y expiración', () => {
  test('❌ login con email inexistente', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noexiste@test.com', password: '123456' });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/credenciales/i);
  });

  test('❌ login con password incorrecto', async () => {
    // Crear usuario de prueba en memoria
    await User.create({ email: 'auth@test.com', password: '123456' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auth@test.com', password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/credenciales/i);
  });

  test('❌ email inválido en registro', async () => {
    const res = await request(app)
      .post('/api/auth/registro')
      .send({ nombre: 'Test', email: 'emailinvalido', password: '123456' });

    expect(res.status).toBe(400);
  });

  test('❌ usuario duplicado', async () => {
    await User.create({ email: 'auth@test.com', password: '123456' });

    const res = await request(app)
      .post('/api/auth/registro')
      .send({ nombre: 'Test', email: 'auth@test.com', password: '123456' });

    expect(res.status).toBe(409);
  });

  test('❌ token expirado', async () => {
    const expiredToken = jwt.sign(
      { empresaId: 'empresa1', rol: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' } // token ya expirado
    );

    const res = await request(app)
      .get('/api/protegida')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/token inválido/i);
  });

  test('❌ usuario sin permisos intenta acceder a ruta admin', async () => {
    const token = jwt.sign(
      { empresaId: 'empresa1', rol: 'usuario' },
      process.env.JWT_SECRET
    );

    const res = await request(app)
      .get('/api/admin')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
