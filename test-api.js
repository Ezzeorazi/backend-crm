const https = require('https');

const data = JSON.stringify({
  nombre: 'Test3',
  tipoOrganizacion: 'empresa',
  pais: 'Argentina',
  identificadorFiscal: '',
  tipoIdentificadorFiscal: 'CUIT',
  moneda: 'ARS',
  ivaDefault: 21,
  nombreUsuario: 'Admin',
  emailUsuario: 'admin55@test.com',
  contraseña: 'password123'
});

const options = {
  hostname: 'nimbus-m6nv.onrender.com',
  port: 443,
  path: '/api/empresas',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);

  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
