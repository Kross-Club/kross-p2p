import type {
  Usuario, Tienda, Producto, Landing, ClientePerfil,
  Chat, Pedido, Vendedora, Bot, ConfigIA, Valoracion, Reclamo, Beneficio
} from '../types'

export const BENEFICIOS: Beneficio[] = [
  { id: 'b1', nombre: 'Contraentrega sin adelanto', descripcion: 'Paga cuando recibas tu pedido, sin dar adelanto.', scoreRequerido: 50 },
  { id: 'b2', nombre: 'Prioridad en despacho', descripcion: 'Tu pedido sale primero que otros en la misma zona.', scoreRequerido: 75 },
  { id: 'b3', nombre: 'Ofertas exclusivas', descripcion: 'Acceso anticipado a promociones y precios especiales.', scoreRequerido: 90 },
]

export const USUARIOS: Usuario[] = [
  { id: 'u1', nombre: 'María López', tipo: 'comprador', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=maria' },
  { id: 'u2', nombre: 'Carlos Quispe', tipo: 'comprador', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=carlos' },
  { id: 'u3', nombre: 'Rosa Mamani', tipo: 'comprador', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=rosa' },
  { id: 'u4', nombre: 'Diego Ramos', tipo: 'vendedor', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=diego', tiendaId: 't1' },
  { id: 'u5', nombre: 'Lía Torres', tipo: 'vendedor', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lia', tiendaId: 't2' },
  { id: 'u6', nombre: 'Valeria Chávez', tipo: 'vendedora', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=valeria', tiendaId: 't1' },
  { id: 'u7', nombre: 'Sofía Mendoza', tipo: 'vendedora', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sofia', tiendaId: 't1' },
]

export const TIENDAS: Tienda[] = [
  { id: 't1', nombre: 'Freskas - Bebidas Naturales', dueno_id: 'u4', logo: '🥤', descripcion: 'Bebidas 100% naturales sin azúcar añadida, directo a tu puerta en Lima.' },
  { id: 't2', nombre: 'TechPeru Accesorios', dueno_id: 'u5', logo: '📱', descripcion: 'Accesorios de tecnología originales con garantía y envío a todo Lima.' },
]

export const PRODUCTOS: Producto[] = [
  { id: 'p1', tiendaId: 't1', nombre: 'Limonada Frozen Premium', descripcion: 'Limonada frozen de limón sutil con menta fresca. Sin azúcar, 100% natural. Ideal para el verano limeño.', precio: 12, imagenes: ['🍋'], estado: 'activo', landingId: 'l1' },
  { id: 'p2', tiendaId: 't1', nombre: 'Jugo Verde Detox', descripcion: 'Mezcla de espinaca, pepino, manzana verde y jengibre. Energía total desde las 7am.', precio: 14, imagenes: ['🥒'], estado: 'activo', landingId: 'l2' },
  { id: 'p3', tiendaId: 't1', nombre: 'Pack Semana Saludable', descripcion: '5 bebidas variadas para toda la semana. Escoge tus sabores favoritos.', precio: 55, imagenes: ['🎒'], estado: 'activo', landingId: 'l3' },
  { id: 'p4', tiendaId: 't1', nombre: 'Maracuyá Sour Natural', descripcion: 'La clásica combinación de maracuyá con un toque de limón. Solo frutas frescas.', precio: 11, imagenes: ['🍹'], estado: 'inactivo', landingId: 'l4' },
  { id: 'p5', tiendaId: 't2', nombre: 'Cargador Inalámbrico 15W', descripcion: 'Carga rápida inalámbrica compatible con iPhone y Android. Incluye cable USB-C.', precio: 45, imagenes: ['⚡'], estado: 'activo', landingId: 'l5' },
  { id: 'p6', tiendaId: 't2', nombre: 'Audífonos Bluetooth Pro', descripcion: 'Sonido estéreo cristalino, 8 horas de batería. Perfectos para el trabajo y el gym.', precio: 89, imagenes: ['🎧'], estado: 'activo', landingId: 'l6' },
  { id: 'p7', tiendaId: 't2', nombre: 'Case iPhone 15 Antigolpes', descripcion: 'Protección militar anti-caída. Disponible en 6 colores. Envío gratis a Lima.', precio: 25, imagenes: ['📱'], estado: 'activo', landingId: 'l7' },
  { id: 'p8', tiendaId: 't2', nombre: 'Cable USB-C a Lightning', descripcion: 'Cable de carga rápida certificado MFi. 1 metro, trenzado de nylon.', precio: 18, imagenes: ['🔌'], estado: 'inactivo', landingId: 'l8' },
]

export const LANDINGS: Landing[] = [
  {
    id: 'l1', productoId: 'p1',
    titulo: '🍋 Limonada Frozen Premium - Freskas',
    descripcionLarga: '¡La limonada frozen más rica de Lima! Hecha con limón sutil recién exprimido, menta fresca y hielo granizado. Sin azúcar añadida, sin preservantes. Solo lo mejor para ti. Delivery en Miraflores, San Isidro, Surco, La Molina y más distritos.',
    recomendaciones: [
      { id: 'r1', nombre: 'Paola V.', texto: '¡Riquísima! La pedí para mi oficina en San Isidro y llegó súper fría. Definitivamente vuelvo a pedir 🥰', estrellas: 5, fecha: '2024-12-10' },
      { id: 'r2', nombre: 'Javier M.', texto: 'La mejor limonada frozen que he probado en Lima. Sin azúcar y con bastante limón, tal como me gusta.', estrellas: 5, fecha: '2024-12-08' },
      { id: 'r3', nombre: 'Carla S.', texto: 'Llegó en 40 minutos a Surco. El sabor es increíble. Ya la pedí 3 veces esta semana jaja', estrellas: 4, fecha: '2024-12-05' },
    ],
    ofertas: [
      { nombre: '1 Limonada', precio: 12, descripcion: 'Una limonada frozen grande (500ml)' },
      { nombre: '2 Limonadas', precio: 22, descripcion: 'Dos limonadas con S/2 de descuento' },
      { nombre: 'Pack x4', precio: 40, descripcion: 'Cuatro limonadas, ahorra S/8' },
    ],
    faq: [
      { pregunta: '¿Hacen delivery?', respuesta: 'Sí, delivery a Miraflores, San Isidro, Surco, La Molina, Barranco y Chorrillos. Tiempo aprox. 30-50 min.' },
      { pregunta: '¿Aceptan Yape?', respuesta: 'Sí aceptamos Yape, Plin, transferencia bancaria y efectivo contraentrega.' },
      { pregunta: '¿Es contraentrega?', respuesta: 'Sí, puedes pagar cuando recibas tu pedido. También aceptamos pago anticipado.' },
      { pregunta: '¿Tienen sabores?', respuesta: 'Por ahora solo tenemos limonada frozen de limón sutil con menta. ¡Pronto más sabores!' },
    ],
    aprobadoPorKross: true,
    estadoAprobacion: 'aprobado',
  },
  {
    id: 'l2', productoId: 'p2',
    titulo: '🥒 Jugo Verde Detox - Freskas',
    descripcionLarga: 'Empieza tu día con energía total. Nuestro Jugo Verde Detox está hecho con espinaca fresca, pepino, manzana verde y jengibre. Ideal para limpiar tu cuerpo y tener energía desde temprano.',
    recomendaciones: [
      { id: 'r4', nombre: 'Ana P.', texto: 'Lo tomo cada mañana desde hace 2 semanas y me siento con más energía. ¡Gracias Freskas!', estrellas: 5, fecha: '2024-12-09' },
      { id: 'r5', nombre: 'Luis B.', texto: 'Sabor diferente pero muy rico. Me ayuda a no sentir antojo de dulces en la mañana.', estrellas: 4, fecha: '2024-12-07' },
    ],
    ofertas: [
      { nombre: '1 Jugo Verde', precio: 14, descripcion: 'Un jugo verde detox (400ml)' },
      { nombre: '3 Jugos Verde', precio: 38, descripcion: 'Tres jugos con S/4 de descuento' },
    ],
    faq: [
      { pregunta: '¿Hacen delivery?', respuesta: 'Sí, delivery a distritos de Lima moderna. Tiempo aprox. 30-50 min.' },
      { pregunta: '¿Aceptan Yape?', respuesta: '¡Claro! Yape, Plin, transferencia o efectivo.' },
      { pregunta: '¿Es contraentrega?', respuesta: 'Sí, pagas cuando llega tu pedido.' },
    ],
    aprobadoPorKross: true,
    estadoAprobacion: 'aprobado',
  },
  {
    id: 'l3', productoId: 'p3',
    titulo: '🎒 Pack Semana Saludable - Freskas',
    descripcionLarga: 'El pack perfecto para tu semana. 5 bebidas naturales que tú eliges: limonadas frozen, jugos verdes, agua de coco, maracuyá y más. Un precio especial para que cuides tu salud todos los días.',
    recomendaciones: [
      { id: 'r6', nombre: 'Milagros T.', texto: 'Lo pedí para toda la familia. Llegó puntual y bien empaquetado. Excelente servicio.', estrellas: 5, fecha: '2024-12-11' },
    ],
    ofertas: [
      { nombre: 'Pack 5 bebidas', precio: 55, descripcion: 'Elige 5 bebidas de nuestro menú (ahorra S/10)' },
    ],
    faq: [
      { pregunta: '¿Puedo elegir sabores?', respuesta: 'Sí, cuéntanos en el chat cuáles 5 bebidas quieres.' },
      { pregunta: '¿Aceptan Yape?', respuesta: 'Sí, Yape, Plin, transferencia o efectivo.' },
    ],
    aprobadoPorKross: false,
    estadoAprobacion: 'pendiente_aprobacion',
  },
  { id: 'l4', productoId: 'p4', titulo: 'Maracuyá Sour Natural', descripcionLarga: '', recomendaciones: [], ofertas: [], faq: [], aprobadoPorKross: false, estadoAprobacion: 'pendiente_aprobacion' },
  {
    id: 'l5', productoId: 'p5',
    titulo: '⚡ Cargador Inalámbrico 15W - TechPeru',
    descripcionLarga: 'Carga tu celular sin cables con nuestra base de carga rápida de 15W. Compatible con iPhone 8 en adelante, Samsung Galaxy, Xiaomi y todos los Android con carga inalámbrica. Incluye cable USB-C.',
    recomendaciones: [
      { id: 'r7', nombre: 'Roberto A.', texto: 'Carga rapidísimo, en 1 hora tenía el celu al 100%. El producto llegó bien embalado.', estrellas: 5, fecha: '2024-12-08' },
      { id: 'r8', nombre: 'Fernanda L.', texto: 'Muy buena calidad para el precio. Lo uso en la oficina y en casa.', estrellas: 4, fecha: '2024-12-06' },
    ],
    ofertas: [
      { nombre: 'Cargador solo', precio: 45, descripcion: 'Base de carga inalámbrica 15W con cable USB-C' },
      { nombre: 'Cargador + Case', precio: 65, descripcion: 'Cargador inalámbrico + case compatible con tu modelo' },
    ],
    faq: [
      { pregunta: '¿Hacen delivery?', respuesta: 'Sí, delivery a toda Lima. Tiempo aprox. 1-2 días hábiles.' },
      { pregunta: '¿Aceptan Yape?', respuesta: 'Sí, Yape, Plin, tarjeta o efectivo.' },
      { pregunta: '¿Es contraentrega?', respuesta: 'Sí, pagas al recibir tu pedido.' },
      { pregunta: '¿Tiene garantía?', respuesta: 'Sí, 6 meses de garantía contra defectos de fábrica.' },
    ],
    aprobadoPorKross: true,
    estadoAprobacion: 'aprobado',
  },
  {
    id: 'l6', productoId: 'p6',
    titulo: '🎧 Audífonos Bluetooth Pro - TechPeru',
    descripcionLarga: 'Sonido estéreo de alta definición con conexión Bluetooth 5.0. Hasta 8 horas de música continua. Diseño ergonómico para el gym, el trabajo o el transporte público.',
    recomendaciones: [
      { id: 'r9', nombre: 'Marco S.', texto: 'Los uso en el gym todos los días. Muy cómodos y la batería dura bastante.', estrellas: 5, fecha: '2024-12-10' },
    ],
    ofertas: [
      { nombre: 'Audífonos Pro', precio: 89, descripcion: 'Audífonos Bluetooth Pro con estuche de transporte' },
    ],
    faq: [
      { pregunta: '¿Hacen delivery?', respuesta: 'Sí, delivery a todo Lima en 1-2 días hábiles.' },
      { pregunta: '¿Aceptan Yape?', respuesta: 'Yape, Plin, tarjeta o efectivo.' },
      { pregunta: '¿Es contraentrega?', respuesta: 'Sí, disponible contraentrega.' },
    ],
    aprobadoPorKross: true,
    estadoAprobacion: 'aprobado',
  },
  { id: 'l7', productoId: 'p7', titulo: 'Case iPhone 15', descripcionLarga: '', recomendaciones: [], ofertas: [{ nombre: 'Case', precio: 25, descripcion: 'Case antigolpes' }], faq: [], aprobadoPorKross: true, estadoAprobacion: 'aprobado' },
  { id: 'l8', productoId: 'p8', titulo: 'Cable USB-C', descripcionLarga: '', recomendaciones: [], ofertas: [], faq: [], aprobadoPorKross: true, estadoAprobacion: 'aprobado' },
]

export const CLIENTES: ClientePerfil[] = [
  { id: 'c1', usuarioId: 'u1', nombre: 'María López', direccion: 'Jr. Ucayali 342, Miraflores', score: 20, puntos: 200 },
  { id: 'c2', usuarioId: 'u2', nombre: 'Carlos Quispe', direccion: 'Av. Angamos Este 1250, Surco', score: 65, puntos: 650 },
  { id: 'c3', usuarioId: 'u3', nombre: 'Rosa Mamani', direccion: 'Calle Los Ficus 890, San Isidro', score: 92, puntos: 920 },
]

export const VENDEDORAS: Vendedora[] = [
  { id: 'v1', nombre: 'Valeria Chávez', tiendaId: 't1', alcance: 'todos', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=valeria' },
  { id: 'v2', nombre: 'Sofía Mendoza', tiendaId: 't1', alcance: 'solo_asignados', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sofia' },
]

export const CHATS: Chat[] = [
  {
    id: 'ch1', clienteId: 'c1', tiendaId: 't1', vendedoraAsignadaId: 'v1', productoId: 'p1', estado: 'activo',
    mensajes: [
      {
        id: 'm1', autor: 'bot', tipo: 'audio',
        contenido: { duracion: '0:42', url: '#' },
        timestamp: '2024-12-11T10:00:00Z'
      },
      {
        id: 'm2', autor: 'bot', tipo: 'precios',
        contenido: [
          { nombre: '1 Limonada', precio: 12, descripcion: 'Una limonada frozen grande (500ml)' },
          { nombre: '2 Limonadas', precio: 22, descripcion: 'Dos limonadas con S/2 de descuento' },
          { nombre: 'Pack x4', precio: 40, descripcion: 'Cuatro limonadas, ahorra S/8' },
        ],
        timestamp: '2024-12-11T10:00:05Z'
      },
      {
        id: 'm3', autor: 'bot', tipo: 'botones',
        contenido: {
          pregunta: '¿Tienes alguna duda?',
          opciones: ['¿Hacen delivery?', 'Formas de pago', '¿Es contraentrega?', '¿Tienen otros sabores?'],
          respuestas: {
            '¿Hacen delivery?': 'Sí, delivery a Miraflores, San Isidro, Surco, La Molina, Barranco y Chorrillos. Tiempo aprox. 30-50 min. 🛵',
            'Formas de pago': 'Aceptamos Yape 💚, Plin, transferencia bancaria y efectivo contraentrega. ¡El que más te guste!',
            '¿Es contraentrega?': 'Sí puedes pagar cuando recibas tu pedido. Sin adelanto necesario. 👌',
            '¿Tienen otros sabores?': 'Por ahora tenemos limonada frozen y jugo verde detox. ¡Pronto más sabores! 🍹'
          }
        },
        timestamp: '2024-12-11T10:00:10Z'
      },
      {
        id: 'm4', autor: 'cliente', tipo: 'texto',
        contenido: '¿Hacen delivery a Miraflores?',
        timestamp: '2024-12-11T10:05:00Z'
      },
      {
        id: 'm5', autor: 'vendedor', tipo: 'texto',
        contenido: '¡Hola María! Sí, hacemos delivery a Miraflores en aprox. 30-40 minutos 🛵 ¿Te animas con una limonada?',
        timestamp: '2024-12-11T10:06:00Z'
      },
    ]
  },
  {
    id: 'ch2', clienteId: 'c2', tiendaId: 't1', vendedoraAsignadaId: 'v1', productoId: 'p2', estado: 'activo',
    mensajes: [
      {
        id: 'm6', autor: 'bot', tipo: 'audio',
        contenido: { duracion: '0:38', url: '#' },
        timestamp: '2024-12-10T09:00:00Z'
      },
      {
        id: 'm7', autor: 'bot', tipo: 'precios',
        contenido: [
          { nombre: '1 Jugo Verde', precio: 14, descripcion: 'Un jugo verde detox (400ml)' },
          { nombre: '3 Jugos Verde', precio: 38, descripcion: 'Tres jugos con S/4 de descuento' },
        ],
        timestamp: '2024-12-10T09:00:05Z'
      },
      {
        id: 'm8', autor: 'cliente', tipo: 'texto',
        contenido: 'Quiero el pack de 3 jugos verdes para mañana',
        timestamp: '2024-12-10T09:10:00Z'
      },
      {
        id: 'm9', autor: 'vendedor', tipo: 'texto',
        contenido: 'Perfecto Carlos! Te lo tenemos listo mañana a las 7am 💪 ¿Tu dirección en Surco sigue siendo Av. Angamos Este 1250?',
        timestamp: '2024-12-10T09:12:00Z'
      },
      {
        id: 'm10', autor: 'cliente', tipo: 'texto',
        contenido: 'Sí, esa dirección está bien. Lo pago por Yape',
        timestamp: '2024-12-10T09:15:00Z'
      },
    ]
  },
  {
    id: 'ch3', clienteId: 'c3', tiendaId: 't2', vendedoraAsignadaId: null, productoId: 'p5', estado: 'activo',
    mensajes: [
      {
        id: 'm11', autor: 'bot', tipo: 'audio',
        contenido: { duracion: '0:55', url: '#' },
        timestamp: '2024-12-09T15:00:00Z'
      },
      {
        id: 'm12', autor: 'bot', tipo: 'precios',
        contenido: [
          { nombre: 'Cargador solo', precio: 45, descripcion: 'Base de carga inalámbrica 15W con cable USB-C' },
          { nombre: 'Cargador + Case', precio: 65, descripcion: 'Cargador inalámbrico + case compatible' },
        ],
        timestamp: '2024-12-09T15:00:05Z'
      },
      {
        id: 'm13', autor: 'cliente', tipo: 'texto',
        contenido: '¿Es compatible con iPhone 13?',
        timestamp: '2024-12-09T15:05:00Z'
      },
      {
        id: 'm14', autor: 'vendedor', tipo: 'texto',
        contenido: 'Hola Rosa! Sí, es 100% compatible con iPhone 13, 14 y 15. Carga a 15W máximo ⚡',
        timestamp: '2024-12-09T15:07:00Z'
      },
      {
        id: 'm15', autor: 'cliente', tipo: 'texto',
        contenido: 'Perfecto! Lo quiero. ¿Cuándo llega?',
        timestamp: '2024-12-09T15:09:00Z'
      },
      {
        id: 'm16', autor: 'vendedor', tipo: 'texto',
        contenido: '¡Genial! Lo despachamos hoy y llega mañana a San Isidro. Puedes pagar contraentrega 👍',
        timestamp: '2024-12-09T15:10:00Z'
      },
    ]
  },
]

export const PEDIDOS: Pedido[] = [
  {
    id: 'ped1', clienteId: 'c1', productoId: 'p1', tiendaId: 't1', chatId: 'ch1', etapa: 'asesorando',
    historial: [
      { etapa: 'nuevo', fecha: '2024-12-11T10:00:00Z' },
      { etapa: 'asesorando', fecha: '2024-12-11T10:06:00Z' },
    ]
  },
  {
    id: 'ped2', clienteId: 'c2', productoId: 'p2', tiendaId: 't1', chatId: 'ch2', etapa: 'confirmo',
    historial: [
      { etapa: 'nuevo', fecha: '2024-12-10T09:00:00Z' },
      { etapa: 'asesorando', fecha: '2024-12-10T09:10:00Z' },
      { etapa: 'confirmo', fecha: '2024-12-10T09:15:00Z' },
    ]
  },
  {
    id: 'ped3', clienteId: 'c3', productoId: 'p5', tiendaId: 't2', chatId: 'ch3', etapa: 'entregado',
    clienteMarcoRecibido: true,
    historial: [
      { etapa: 'nuevo', fecha: '2024-12-09T15:00:00Z' },
      { etapa: 'asesorando', fecha: '2024-12-09T15:05:00Z' },
      { etapa: 'confirmo', fecha: '2024-12-09T15:09:00Z' },
      { etapa: 'despacho', fecha: '2024-12-09T16:00:00Z' },
      { etapa: 'ruta', fecha: '2024-12-10T08:00:00Z' },
      { etapa: 'destino', fecha: '2024-12-10T10:00:00Z' },
      { etapa: 'entregado', fecha: '2024-12-10T10:30:00Z' },
    ]
  },
  {
    id: 'ped4', clienteId: 'c1', productoId: 'p6', tiendaId: 't2', chatId: 'ch1', etapa: 'cancelado',
    motivoCancelacion: 'No contestó en 1 semana tras varios recordatorios',
    historial: [
      { etapa: 'nuevo', fecha: '2024-12-01T10:00:00Z' },
      { etapa: 'asesorando', fecha: '2024-12-01T10:05:00Z' },
      { etapa: 'cancelado', fecha: '2024-12-08T09:00:00Z' },
    ]
  },
  {
    id: 'ped5', clienteId: 'c2', productoId: 'p7', tiendaId: 't2', chatId: 'ch2', etapa: 'ruta',
    historial: [
      { etapa: 'nuevo', fecha: '2024-12-11T08:00:00Z' },
      { etapa: 'asesorando', fecha: '2024-12-11T08:10:00Z' },
      { etapa: 'confirmo', fecha: '2024-12-11T08:30:00Z' },
      { etapa: 'despacho', fecha: '2024-12-11T10:00:00Z' },
      { etapa: 'ruta', fecha: '2024-12-11T11:00:00Z' },
    ]
  },
]

export const BOTS: Bot[] = [
  {
    id: 'bot1', tiendaId: 't1', nombre: 'Bot Bienvenida Freskas',
    pasos: [
      {
        id: 'paso1',
        pregunta: '¿Tienes alguna duda?',
        opciones: ['¿Hacen delivery?', 'Formas de pago', '¿Es contraentrega?', '¿Tienen otros sabores?'],
        respuestas: {
          '¿Hacen delivery?': 'Sí, delivery a Miraflores, San Isidro, Surco, La Molina, Barranco y Chorrillos.',
          'Formas de pago': 'Aceptamos Yape, Plin, transferencia bancaria y efectivo contraentrega.',
          '¿Es contraentrega?': 'Sí, pagas cuando recibes tu pedido. Sin adelanto.',
          '¿Tienen otros sabores?': 'Por ahora tenemos limonada frozen y jugo verde. ¡Pronto más sabores!',
        }
      }
    ]
  }
]

export const CONFIGS_IA: ConfigIA[] = [
  {
    id: 'ia1', tiendaId: 't1', estado: 'activo',
    instrucciones: 'Eres la asistente de Freskas. Somos una marca de bebidas naturales sin azúcar en Lima. Nuestros precios van desde S/11 a S/55. Siempre responde de forma amigable y en tono cercano. Menciona Yape como opción de pago.',
    recontacto: {
      intencion: 'Reactivar clientes que preguntaron pero no confirmaron pedido',
      mensajeAbridor: 'Hola [nombre] 👋 ¡Te extrañamos por aquí! Tenemos una limonada con tu nombre... ¿Se te antoja una fresquita hoy? 🍋',
    }
  }
]

export const VALORACIONES: Valoracion[] = [
  { id: 'val1', productoId: 'p1', clienteId: 'c3', estrellas: 5, comentario: 'Riquísima, llegó súper fría. Sin duda la pediré de nuevo.', fecha: '2024-12-10' },
  { id: 'val2', productoId: 'p5', clienteId: 'c3', estrellas: 5, comentario: 'Cargador excelente, compatible con mi iPhone 13. Llegó bien embalado.', fecha: '2024-12-10' },
]

export const RECLAMOS: Reclamo[] = [
  { id: 'rec1', pedidoId: 'ped4', clienteId: 'c1', motivo: 'El pedido llegó tarde y el producto estaba derramado', estado: 'resuelto', fecha: '2024-12-08' },
]
