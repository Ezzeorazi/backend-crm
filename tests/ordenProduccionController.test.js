const request = require('supertest');
const app = require('../app');
const Orden = require('../models/OrdenProduccion');
const jwt = require('jsonwebtoken');

jest.mock('../models/OrdenProduccion');

const empresaId = 'empresa1';
let token;

beforeAll(() => {
  process.env.JWT_SECRET = 'testsecret';
  token = jwt.sign({ empresaId, rol: 'admin' }, process.env.JWT_SECRET);
});

describe('OrdenProduccion API', () => {
  test('✅ Crear orden correctamente', async () => {
    Orden.create.mockResolvedValue({ _id: '1', descripcion: 'Orden Test', empresaId });

    const res = await request(app)
      .post('/api/ordenes')
      .set('Authorization', `Bearer ${token}`)
      .send({ descripcion: 'Orden Test', empresaId });

    expect(res.statusCode).toBe(201);
    expect(res.body.descripcion).toBe('Orden Test');
  });

  test('❌ Crear orden sin descripción', async () => {
    const res = await request(app)
      .post('/api/ordenes')
      .set('Authorization', `Bearer ${token}`)
      .send({ empresaId });

    expect(res.statusCode).toBe(400);
  });

  test('✅ Listar órdenes de la empresa', async () => {
    Orden.find.mockResolvedValue([{ _id: '1', empresaId }]);

    const res = await request(app)
      .get('/api/ordenes')
      .set('Authorization', `Bearer ${token}`)
      .query({ empresaId });

    expect(res.statusCode).toBe(200);
    expect(res.body[0].empresaId).toBe(empresaId);
  });

  test('❌ No listar órdenes de otra empresa', async () => {
    Orden.find.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/ordenes')
      .set('Authorization', `Bearer ${token}`)
      .query({ empresaId: 'otraEmpresa' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});
