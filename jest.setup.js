// Variables de entorno necesarias para tests — se ejecuta ANTES de cargar módulos
process.env.JWT_SECRET   = process.env.JWT_SECRET   || 'testsecret';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-groq-key-placeholder';
process.env.MONGO_URI    = process.env.MONGO_URI    || 'mongodb://localhost:27017/nimbus_test';
process.env.CORS_ORIGIN  = process.env.CORS_ORIGIN  || 'http://localhost:5173';
process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin-secret-test';
