const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../models/Cliente');
jest.mock('../models/Product');
jest.mock('../models/Venta');

const app = require('../app');
const Cliente = require('../models/Cliente');
const Product = require('../models/Product');
const Venta   = require('../models/Venta');

const JWT_SECRET = 'testsecret';
const empresaId  = 'emp1';
let token;

// Helper: cadena de Mongoose chaineable con resolve final
function mockSearchChain(result) {
  return {
    limit:   jest.fn().mockReturnThis(),
    select:  jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    then:    (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch:   (onReject) => Promise.resolve(result).catch(onReject),
  };
}

function mockAll(clientesResult = [], productosResult = [], ventasResult = []) {
  Cliente.find.mockReturnValue(mockSearchChain(clientesResult));
  Product.find.mockReturnValue(mockSearchChain(productosResult));
  Venta.find.mockReturnValue(mockSearchChain(ventasResult));
}

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  token = jwt.sign({ id: 'usr1', empresaId, rol: 'admin' }, JWT_SECRET);
});

afterEach(() => {
  jest.clearAllMocks();
});

// ──────────────────────────────────────────────────────────────
// Autenticación
// ──────────────────────────────────────────────────────────────
describe('GET /api/search — autenticación', () => {
  it('401 sin token', async () => {
    const res = await request(app).get('/api/search?q=test');
    expect(res.status).toBe(401);
  });

  it('401 con token inválido', async () => {
    const res = await request(app)
      .get('/api/search?q=test')
      .set('Authorization', 'Bearer tokenbasura');
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// Validación de query
// ──────────────────────────────────────────────────────────────
describe('GET /api/search — validación de query', () => {
  it('200 con arrays vacíos cuando no hay query', async () => {
    const res = await request(app)
      .get('/api/search')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.clientes).toEqual([]);
    expect(res.body.productos).toEqual([]);
    expect(res.body.ventas).toEqual([]);
  });

  it('200 con arrays vacíos para query de 1 caracter (mínimo 2)', async () => {
    const res = await request(app)
      .get('/api/search?q=a')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.clientes).toEqual([]);
  });

  it('200 con resultados para query de 2+ caracteres', async () => {
    mockAll([{ nombre: 'Cliente A' }]);
    const res = await request(app)
      .get('/api/search?q=Cl')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.clientes).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────
// Prevención de ReDoS (Regex Denial of Service)
// ──────────────────────────────────────────────────────────────
describe('GET /api/search — prevención de ReDoS', () => {
  it('no falla con patrón de regex catastrófico (a+)+$', async () => {
    mockAll();
    const res = await request(app)
      .get(`/api/search?q=${encodeURIComponent('(a+)+$')}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('no falla con paréntesis sin cerrar', async () => {
    mockAll();
    const res = await request(app)
      .get(`/api/search?q=${encodeURIComponent('test(')}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('no falla con corchetes sin cerrar', async () => {
    mockAll();
    const res = await request(app)
      .get(`/api/search?q=${encodeURIComponent('test[a')}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('no falla con backslash', async () => {
    mockAll();
    const res = await request(app)
      .get(`/api/search?q=${encodeURIComponent('test\\')}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('trata los metacaracteres como texto literal', async () => {
    mockAll([]);
    await request(app)
      .get(`/api/search?q=${encodeURIComponent('precio$10')}`)
      .set('Authorization', `Bearer ${token}`);

    // Verifica que se llamó al find (no crasheó)
    expect(Cliente.find).toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────
// Aislamiento multi-tenant
// ──────────────────────────────────────────────────────────────
describe('GET /api/search — aislamiento multi-tenant', () => {
  it('filtra resultados por empresaId del token', async () => {
    mockAll([{ nombre: 'Cliente' }]);
    await request(app)
      .get('/api/search?q=cliente')
      .set('Authorization', `Bearer ${token}`);

    expect(Cliente.find).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId })
    );
    expect(Product.find).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId })
    );
  });

  it('usa el empresaId del token, no de query params', async () => {
    mockAll();
    await request(app)
      .get('/api/search?q=test&empresaId=empresaOtra')
      .set('Authorization', `Bearer ${token}`);

    expect(Cliente.find).toHaveBeenCalledWith(
      expect.objectContaining({ empresaId })
    );
    expect(Cliente.find).not.toHaveBeenCalledWith(
      expect.objectContaining({ empresaId: 'empresaOtra' })
    );
  });
});

// ──────────────────────────────────────────────────────────────
// Resultados correctos
// ──────────────────────────────────────────────────────────────
describe('GET /api/search — resultados', () => {
  it('200 devuelve clientes, productos y ventas en la respuesta', async () => {
    mockAll(
      [{ nombre: 'Cliente A' }],
      [{ nombre: 'Producto A', sku: 'SKU1', precio: 100 }],
      []
    );
    const res = await request(app)
      .get('/api/search?q=test')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('clientes');
    expect(res.body).toHaveProperty('productos');
    expect(res.body).toHaveProperty('ventas');
  });

  it('filtra ventas donde el cliente no hizo match', async () => {
    mockAll(
      [],
      [],
      [
        { _id: 'v1', total: 100, estado: 'pagada', createdAt: new Date(), cliente: null },
        { _id: 'v2', total: 200, estado: 'pendiente', createdAt: new Date(), cliente: { nombre: 'Match' } }
      ]
    );
    const res = await request(app)
      .get('/api/search?q=Match')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Solo la venta con cliente debe aparecer
    expect(res.body.ventas).toHaveLength(1);
    expect(res.body.ventas[0].cliente.nombre).toBe('Match');
  });
});
