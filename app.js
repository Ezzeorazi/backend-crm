require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const logger = require('./utils/logger');
const errorMiddleware = require('./middleware/errorMiddleware');

const app = express();

const corsOptions = {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json());
app.use(mongoSanitize());

const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(
  morgan(morganFormat, {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { mensaje: 'Límite de peticiones excedido, intente más tarde.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { mensaje: 'Demasiados intentos de inicio de sesión, intente más tarde.' }
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);

mongoose.connect(process.env.MONGO_URI)
  .then(() => logger.info('Conectado a MongoDB'))
  .catch(err => logger.error('Error de conexion a MongoDB:', err));

// Ruta de healthcheck (Ping) para mantener el servidor despierto o verificar estado
app.get('/api/status', (req, res) => res.status(200).json({ status: 'ok', server: 'awake' }));

app.use('/api/usuarios', require('./routes/userRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/productos', require('./routes/productRoutes'));
app.use('/api/empresas', require('./routes/empresas'));
app.use('/api/empresa', require('./routes/empresa'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/ventas', require('./routes/ventas'));
app.use('/api/presupuestos', require('./routes/presupuestos'));
app.use('/api/facturas', require('./routes/facturas'));
app.use('/api/pagos', require('./routes/pagos'));
app.use('/api/movimientos', require('./routes/movimientos'));
app.use('/api/tareas', require('./routes/tareas'));
app.use('/api/ordenes',         require('./routes/ordenes'));
app.use('/api/ordenes-compra', require('./routes/ordenCompras'));

app.use(errorMiddleware);

module.exports = app;
