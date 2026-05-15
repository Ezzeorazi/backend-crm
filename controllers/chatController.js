const { GoogleGenAI } = require('@google/genai');
const Contacto    = require('../models/Contacto');
const Producto    = require('../models/Product');
const Presupuesto = require('../models/Presupuesto');
const Tarea       = require('../models/Tarea');
const Contador    = require('../models/Contador');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `Eres el asistente inteligente de Nimbus CRM. Ayudás a los usuarios a:
1. Entender y usar el sistema CRM
2. Crear registros como clientes, proveedores, presupuestos y tareas usando las herramientas disponibles

## Entidades del sistema

**Clientes y Proveedores** (Contactos)
- Clientes: empresas o personas que compran productos/servicios
- Proveedores: empresas que suministran productos
- Campos: nombre (requerido), email, telefono, razonSocial, cuit, direccion, ciudad, provincia

**Productos**
- Catálogo con nombre, SKU, precio, stock e impuesto (% IVA, default 21%)

**Presupuestos**
- Cotizaciones para clientes con productos/servicios
- Estados: borrador → enviado → aceptado / rechazado / vencido
- Para crear uno: necesitás el cliente y los productos con precios y cantidades

**Ventas**
- Registro de ventas cerradas, generalmente desde un presupuesto aceptado

**Facturas**
- Documentos fiscales ligados a ventas (tipos A, B, C, X)
- Estados: pendiente → pagada / parcial / anulada

**Tareas**
- Actividades y seguimientos
- Tipos: llamada, reunion, email, seguimiento, otro
- Prioridades: alta, media, baja

## Flujo de ventas típico
Crear cliente → Crear presupuesto → Cliente acepta → Registrar venta → Emitir factura

## Instrucciones
- Siempre respondé en español rioplatense (vos, no usted)
- Antes de crear cualquier registro, mostrá los datos que vas a usar y pedí confirmación
- Si el usuario responde "sí", "dale", "confirmado", "ok" u similar, procedé a crear
- Para crear un presupuesto: primero buscá al cliente y los productos, luego mostrá el resumen y pedí confirmación
- Si no encontrás exactamente lo que el usuario pide, mostrá las opciones disponibles
- Sé conciso y amigable
- Si te preguntan cómo hacer algo en el CRM, explicalo en 2-3 pasos simples`;

const TOOL_DECLARATIONS = [
  {
    name: 'buscar_clientes',
    description: 'Busca clientes por nombre o razón social. Usarlo antes de crear un presupuesto para obtener el ID del cliente.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Nombre o razón social del cliente a buscar' }
      },
      required: ['query']
    }
  },
  {
    name: 'buscar_productos',
    description: 'Busca productos por nombre o SKU. Usarlo para obtener IDs y precios al armar un presupuesto.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Nombre o SKU del producto a buscar' }
      },
      required: ['query']
    }
  },
  {
    name: 'crear_cliente',
    description: 'Crea un nuevo cliente en el CRM. Solo llamar después de que el usuario confirme los datos.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nombre:      { type: 'STRING', description: 'Nombre o nombre comercial del cliente (requerido)' },
        email:       { type: 'STRING', description: 'Email de contacto' },
        telefono:    { type: 'STRING', description: 'Teléfono de contacto' },
        razonSocial: { type: 'STRING', description: 'Razón social o nombre legal de la empresa' },
        cuit:        { type: 'STRING', description: 'CUIT sin guiones' },
        direccion:   { type: 'STRING', description: 'Dirección postal' },
        ciudad:      { type: 'STRING', description: 'Ciudad' },
        provincia:   { type: 'STRING', description: 'Provincia' },
        notas:       { type: 'STRING', description: 'Notas adicionales' }
      },
      required: ['nombre']
    }
  },
  {
    name: 'crear_proveedor',
    description: 'Crea un nuevo proveedor en el CRM. Solo llamar después de que el usuario confirme los datos.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nombre:      { type: 'STRING', description: 'Nombre del proveedor (requerido)' },
        email:       { type: 'STRING', description: 'Email de contacto' },
        telefono:    { type: 'STRING', description: 'Teléfono de contacto' },
        razonSocial: { type: 'STRING', description: 'Razón social' },
        cuit:        { type: 'STRING', description: 'CUIT sin guiones' },
        direccion:   { type: 'STRING', description: 'Dirección' },
        notas:       { type: 'STRING', description: 'Notas adicionales' }
      },
      required: ['nombre']
    }
  },
  {
    name: 'crear_presupuesto',
    description: 'Crea un nuevo presupuesto en estado borrador. Solo llamar después de que el usuario confirme. Los items deben incluir datos obtenidos de buscar_productos.',
    parameters: {
      type: 'OBJECT',
      properties: {
        clienteId:  { type: 'STRING', description: 'ID del cliente (obtenido de buscar_clientes)' },
        items: {
          type: 'ARRAY',
          description: 'Lista de productos del presupuesto',
          items: {
            type: 'OBJECT',
            properties: {
              productoId: { type: 'STRING', description: 'ID del producto (obtenido de buscar_productos)' },
              nombre:     { type: 'STRING', description: 'Nombre del producto (snapshot)' },
              sku:        { type: 'STRING', description: 'SKU del producto (snapshot)' },
              cantidad:   { type: 'NUMBER', description: 'Cantidad' },
              precio:     { type: 'NUMBER', description: 'Precio unitario' },
              descuento:  { type: 'NUMBER', description: 'Descuento en porcentaje (0-100), default 0' }
            },
            required: ['nombre', 'cantidad', 'precio']
          }
        },
        validezDias: { type: 'NUMBER', description: 'Días de validez del presupuesto (default 30)' },
        descuento:   { type: 'NUMBER', description: 'Descuento global en monto (default 0)' },
        ivaPct:      { type: 'NUMBER', description: 'Porcentaje de IVA a aplicar (ej: 21, default 0)' },
        notas:       { type: 'STRING', description: 'Notas o condiciones del presupuesto' }
      },
      required: ['clienteId', 'items']
    }
  },
  {
    name: 'crear_tarea',
    description: 'Crea una nueva tarea o recordatorio. Solo llamar después de que el usuario confirme.',
    parameters: {
      type: 'OBJECT',
      properties: {
        titulo:          { type: 'STRING', description: 'Título de la tarea (requerido)' },
        descripcion:     { type: 'STRING', description: 'Descripción detallada' },
        tipo:            { type: 'STRING', description: 'Tipo: llamada, reunion, email, seguimiento, otro (default: otro)' },
        prioridad:       { type: 'STRING', description: 'Prioridad: alta, media, baja (default: media)' },
        fechaVencimiento:{ type: 'STRING', description: 'Fecha de vencimiento en formato ISO 8601 (ej: 2026-05-20)' }
      },
      required: ['titulo']
    }
  }
];

async function ejecutarHerramienta(nombre, args, empresaId, usuarioId) {
  switch (nombre) {
    case 'buscar_clientes': {
      const clientes = await Contacto.find({
        empresaId,
        tipo: 'cliente',
        $or: [
          { nombre:      { $regex: args.query, $options: 'i' } },
          { razonSocial: { $regex: args.query, $options: 'i' } }
        ]
      }).select('_id nombre razonSocial email cuit').limit(5).lean();
      return clientes.length > 0
        ? { clientes }
        : { clientes: [], mensaje: `No se encontraron clientes con "${args.query}"` };
    }

    case 'buscar_productos': {
      const productos = await Producto.find({
        empresaId,
        activo: true,
        $or: [
          { nombre: { $regex: args.query, $options: 'i' } },
          { sku:    { $regex: args.query, $options: 'i' } }
        ]
      }).select('_id nombre sku precio impuesto unidad stock').limit(5).lean();
      return productos.length > 0
        ? { productos }
        : { productos: [], mensaje: `No se encontraron productos con "${args.query}"` };
    }

    case 'crear_cliente': {
      const cliente = new Contacto({ ...args, tipo: ['cliente'], empresaId });
      const guardado = await cliente.save();
      return { exito: true, id: guardado._id.toString(), nombre: guardado.nombre };
    }

    case 'crear_proveedor': {
      const proveedor = new Contacto({ ...args, tipo: ['proveedor'], empresaId });
      const guardado = await proveedor.save();
      return { exito: true, id: guardado._id.toString(), nombre: guardado.nombre };
    }

    case 'crear_presupuesto': {
      const { clienteId, items, validezDias = 30, descuento = 0, ivaPct = 0, notas } = args;

      const productosConSubtotal = items.map(item => {
        const sub = parseFloat((item.cantidad * item.precio * (1 - (item.descuento || 0) / 100)).toFixed(2));
        return {
          producto:  item.productoId || undefined,
          nombre:    item.nombre,
          sku:       item.sku || '',
          cantidad:  item.cantidad,
          precio:    item.precio,
          descuento: item.descuento || 0,
          subtotal:  sub
        };
      });

      const subtotal   = parseFloat(productosConSubtotal.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
      const ivaCalc    = parseFloat((subtotal * (ivaPct / 100)).toFixed(2));
      const total      = parseFloat((subtotal - descuento + ivaCalc).toFixed(2));
      const vencimiento = new Date();
      vencimiento.setDate(vencimiento.getDate() + validezDias);

      const numero = await Contador.siguiente(empresaId, 'presupuesto');

      const presupuesto = new Presupuesto({
        empresaId,
        numero,
        cliente:    clienteId,
        creadoPor:  usuarioId,
        productos:  productosConSubtotal,
        subtotal,
        descuento,
        iva:        ivaCalc,
        ivaPct,
        total,
        validezDias,
        vencimiento,
        estado:     'borrador',
        notas
      });

      const guardado = await presupuesto.save();
      return { exito: true, id: guardado._id.toString(), numero: guardado.numero, total: guardado.total };
    }

    case 'crear_tarea': {
      const { titulo, descripcion, tipo = 'otro', prioridad = 'media', fechaVencimiento } = args;
      const tarea = new Tarea({
        empresaId,
        titulo,
        descripcion,
        tipo,
        prioridad,
        fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : undefined,
        creadoPor:        usuarioId,
        estado:           'pendiente'
      });
      const guardada = await tarea.save();
      return { exito: true, id: guardada._id.toString(), titulo: guardada.titulo };
    }

    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

const enviarMensaje = async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ mensaje: 'Se requiere el array de mensajes' });
    }

    // Historial: todos los mensajes menos el último
    const history = messages.slice(0, -1).map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const lastMessage = messages[messages.length - 1].content;

    const chat = ai.chats.create({
      model: 'gemini-2.0-flash',
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        temperature: 0.7,
        maxOutputTokens: 1024
      },
      history
    });

    let response = await chat.sendMessage({ message: lastMessage });

    // Loop para manejar function calling (máx 5 iteraciones)
    for (let i = 0; i < 5; i++) {
      const calls = response.functionCalls;
      if (!calls || calls.length === 0) break;

      const functionResponseParts = [];
      for (const call of calls) {
        const output = await ejecutarHerramienta(
          call.name,
          call.args,
          req.empresaId,
          req.usuario?.id
        );
        functionResponseParts.push({
          functionResponse: { name: call.name, response: output }
        });
      }

      response = await chat.sendMessage({ message: functionResponseParts });
    }

    res.json({ content: response.text });

  } catch (error) {
    console.error('Error en chatController:', error);
    res.status(500).json({ mensaje: 'Error al procesar el mensaje', error: error.message });
  }
};

module.exports = { enviarMensaje };
