const mongoose = require('mongoose');

async function fix() {
  await mongoose.connect('mongodb+srv://admin:tuclave123@crm-saas.lfdlffh.mongodb.net/?retryWrites=true&w=majority&appName=crm-saas');
  console.log('Connected');
  try {
    await mongoose.connection.collection('empresas').dropIndex('subdominio_1');
    console.log('Index subdominio_1 dropped successfully!');
  } catch(e) {
    console.log('Error dropping index (maybe already dropped?):', e.message);
  }
  process.exit(0);
}

fix();
