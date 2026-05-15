const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../models/Product');

const app     = require('../app');
const Producto = require('../models/Product');

const JWT_SECRET    = 'testsecret';
const empresaId     = 'emp1';
let tokenAdmin;
let tokenInventario;
let tokenVentas;

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  tokenAdmin      = jwt.sign({ id: 'usr1', empresaId, rol: 'admin' },      JWT_SECRET);
  tokenInventario = jwt.sign({ id: 'usr2', empresaId, rol: 'inventario' }, JWT_SECRET);
  tokenVentas     = jwt.sign({ id: 'usr3', empresaId, rol: 'ventas' },     JWT_SECRET);
});

afterEach(() => jest.clearAllMocks());

// ──────────────────────────────────────────────────────────────
// GET /api/productos
// ──────────────────────────────────────────────────────────────
describe('GET /api/productos — obtenerProductos', () => {
  it('200 devuelve lista de productos', async () => {
    const lista = [{ _id: '1', nombre: 'Prod A', empresaId }];
    Producto.find.mockResolvedValue(lista);

    const res = await request(app)
      .get('/api/productos')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(Producto.find).toHaveBeenCalledWith({ empresaId });
  });

  it('401 sin token', async () => {
    const res = await request(app).get('/api/productos');
    expect(res.status).toBe(401);
  });

  it('aislamiento multi-tenant: filtra por empresaId del token', async () => {
    Producto.find.mockResolvedValue([]);
    const tokenOtra = jwt.sign({ id: 'u', empresaId: 'otraEmpresa', rol: 'admin' }, JWT_SECRET);

    await request(app)
      .get('/api/productos')
      .set('Authorization', `Bearer ${tokenOtra}`);

    expect(Producto.find).toHaveBeenCalledWith({ empresaId: 'otraEmpresa' });
    expect(Producto.find).not.toHaveBeenCalledWith({ empresaId });
  });

  it('500 cuando la DB falla', async () => {
    Producto.find.mockRejectedValue(new Error('DB error'));
    const res = await request(app)
      .get('/api/productos')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(500);
    expect(res.body.mensaje).toMatch(/error al obtener/i);
  });
});

// ──────────────────────────────────────────────────────────────
// GET /api/productos/:id
// ──────────────────────────────────────────────────────────────
describe('GET /api/productos/:id — obtenerProducto', () => {
  it('200 devuelve el producto cuando existe', async () => {
    const prod = { _id: '1', nombre: 'Prod A', empresaId };
    Producto.findOne.mockResolvedValue(prod);

    const res = await request(app)
      .get('/api/productos/1')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(Producto.findOne).toHaveBeenCalledWith({ _id: '1', empresaId });
  });

  it('404 cuando no existe', async () => {
    Producto.findOne.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/productos/noexiste')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
    expect(res.body.mensaje).toMatch(/no encontrado/i);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/productos — crearProducto
// ──────────────────────────────────────────────────────────────
describe('POST /api/productos — crearProducto', () => {
  const bodyValido = { nombre: 'Prod A', sku: 'SKU1', stock: 10, precio: 100 };

  it('201 crea producto correctamente', async () => {
    Producto.mockImplementation((data) => ({
      ...data,
      save: jest.fn().mockResolvedValue(true)
    }));

    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(bodyValido);

    expect(res.status).toBe(201);
  });

  it('empresaId siempre viene del token, no del body', async () => {
    Producto.mockImplementation((data) => ({
      ...data,
      save: jest.fn().mockResolvedValue(true)
    }));

    await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ ...bodyValido, empresaId: 'empresaMaliciosa' });

    const argConstructor = Producto.mock.calls[0][0];
    expect(argConstructor.empresaId).toBe(empresaId);
    expect(argConstructor.empresaId).not.toBe('empresaMaliciosa');
  });

  it('400 sin nombre', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ sku: 'SKU1', stock: 10, precio: 100 });
    expect(res.status).toBe(400);
  });

  it('400 sin SKU', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nombre: 'Prod A', stock: 10, precio: 100 });
    expect(res.status).toBe(400);
  });

  it('400 con stock negativo', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nombre: 'Prod A', sku: 'SKU1', stock: -1, precio: 100 });
    expect(res.status).toBe(400);
  });

  it('201 cuando rol inventario crea', async () => {
    Producto.mockImplementation((data) => ({
      ...data,
      save: jest.fn().mockResolvedValue(true)
    }));

    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${tokenInventario}`)
      .send(bodyValido);

    expect(res.status).toBe(201);
  });

  it('403 cuando rol ventas intenta crear', async () => {
    const res = await request(app)
      .post('/api/productos')
      .set('Authorization', `Bearer ${tokenVentas}`)
      .send(bodyValido);
    expect(res.status).toBe(403);
  });

  it('401 sin token', async () => {
    const res = await request(app)
      .post('/api/productos')
      .send(bodyValido);
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────
// PUT /api/productos/:id — actualizarProducto
// ──────────────────────────────────────────────────────────────
describe('PUT /api/productos/:id — actualizarProducto', () => {
  it('200 actualiza correctamente', async () => {
    const actualizado = { _id: '1', nombre: 'Actualizado', empresaId };
    Producto.findOneAndUpdate.mockResolvedValue(actualizado);

    const res = await request(app)
      .put('/api/productos/1')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nombre: 'Actualizado' });

    expect(res.status).toBe(200);
    expect(Producto.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '1', empresaId },
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('404 cuando no existe', async () => {
    Producto.findOneAndUpdate.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/productos/noexiste')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nombre: 'X' });
    expect(res.status).toBe(404);
    expect(res.body.mensaje).toMatch(/no encontrado/i);
  });

  it('403 cuando rol ventas intenta actualizar', async () => {
    const res = await request(app)
      .put('/api/productos/1')
      .set('Authorization', `Bearer ${tokenVentas}`)
      .send({ nombre: 'X' });
    expect(res.status).toBe(403);
  });

  it('200 cuando rol inventario actualiza', async () => {
    Producto.findOneAndUpdate.mockResolvedValue({ _id: '1', empresaId });
    const res = await request(app)
      .put('/api/productos/1')
      .set('Authorization', `Bearer ${tokenInventario}`)
      .send({ nombre: 'X' });
    expect(res.status).toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/productos/:id — eliminarProducto
// ──────────────────────────────────────────────────────────────
describe('DELETE /api/productos/:id — eliminarProducto', () => {
  it('200 elimina correctamente', async () => {
    Producto.findOneAndDelete.mockResolvedValue({ _id: '1', nombre: 'Prod A' });
    const res = await request(app)
      .delete('/api/productos/1')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(Producto.findOneAndDelete).toHaveBeenCalledWith({ _id: '1', empresaId });
  });

  it('404 cuando no existe', async () => {
    Producto.findOneAndDelete.mockResolvedValue(null);
    const res = await request(app)
      .delete('/api/productos/noexiste')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(404);
    expect(res.body.mensaje).toMatch(/no encontrado/i);
  });

  it('403 cuando rol inventario intenta eliminar (solo admin puede)', async () => {
    const res = await request(app)
      .delete('/api/productos/1')
      .set('Authorization', `Bearer ${tokenInventario}`);
    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────
// POST /api/productos/importar — importarProductos
// ──────────────────────────────────────────────────────────────
describe('POST /api/productos/importar — importarProductos', () => {
  const listaProductos = [
    { nombre: 'Prod A', sku: 'SKU1', precio: 100, stock: 10 },
    { nombre: 'Prod B', sku: 'SKU2', precio: 200, stock: 5 }
  ];

  it('200 importa lista de productos', async () => {
    Producto.insertMany.mockResolvedValue([{ _id: '1' }, { _id: '2' }]);

    const res = await request(app)
      .post('/api/productos/importar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(listaProductos);

    expect(res.status).toBe(200);
    expect(res.body.insertados).toBe(2);
  });

  it('empresaId siempre viene del token en la importación', async () => {
    Producto.insertMany.mockResolvedValue([{ _id: '1' }]);

    await request(app)
      .post('/api/productos/importar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send([{ nombre: 'Prod A', sku: 'SKU1', precio: 100, stock: 10, empresaId: 'empresaMaliciosa' }]);

    const insertados = Producto.insertMany.mock.calls[0][0];
    expect(insertados.every(p => p.empresaId === empresaId)).toBe(true);
  });

  it('201 cuando rol inventario importa', async () => {
    Producto.insertMany.mockResolvedValue([{ _id: '1' }]);
    const res = await request(app)
      .post('/api/productos/importar')
      .set('Authorization', `Bearer ${tokenInventario}`)
      .send([{ nombre: 'Prod A', sku: 'SKU1', precio: 100, stock: 10 }]);
    expect(res.status).toBe(200);
  });

  it('403 cuando rol ventas intenta importar', async () => {
    const res = await request(app)
      .post('/api/productos/importar')
      .set('Authorization', `Bearer ${tokenVentas}`)
      .send(listaProductos);
    expect(res.status).toBe(403);
  });

  it('500 cuando la DB falla al insertar', async () => {
    Producto.insertMany.mockRejectedValue(new Error('DB error'));
    const res = await request(app)
      .post('/api/productos/importar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(listaProductos);
    expect(res.status).toBe(500);
  });
});
