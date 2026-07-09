import type {
  Usuario, Tienda, Producto, Landing, ClientePerfil,
  Chat, Pedido, Vendedora, Bot, ConfigIA, Valoracion, Reclamo, Beneficio
} from '../types'

export const DEPARTAMENTOS_PERU = [
  'Lima', 'Arequipa', 'Cusco', 'La Libertad', 'Piura', 'Lambayeque',
  'Junín', 'Áncash', 'Cajamarca', 'Puno', 'Loreto', 'Tacna',
  'Ica', 'San Martín', 'Huánuco', 'Ayacucho', 'Ucayali', 'Apurímac',
  'Moquegua', 'Pasco', 'Tumbes', 'Madre de Dios', 'Huancavelica', 'Amazonas',
]

export const BENEFICIOS: Beneficio[] = [
  { id: 'b1', nombre: 'Contraentrega sin adelanto', descripcion: 'Paga cuando recibas tu pedido, sin dar adelanto.', scoreRequerido: 50 },
  { id: 'b2', nombre: 'Prioridad en despacho', descripcion: 'Tu pedido sale primero que otros en la misma zona.', scoreRequerido: 75 },
  { id: 'b3', nombre: 'Ofertas exclusivas', descripcion: 'Acceso anticipado a promociones y precios especiales.', scoreRequerido: 90 },
]

export const USUARIOS: Usuario[] = [
  { id: 'u1', nombre: 'Carmen Flores', tipo: 'comprador', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=carmen' },
  { id: 'u2', nombre: 'Jorge Huanca', tipo: 'comprador', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jorge' },
  { id: 'u3', nombre: 'Lucía Paredes', tipo: 'comprador', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lucia' },
  { id: 'u4', nombre: 'Miguel Ángel Rojas', tipo: 'vendedor', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=miguel', tiendaId: 't1' },
  { id: 'u5', nombre: 'Patricia Solano', tipo: 'vendedor', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=patricia', tiendaId: 't2' },
  { id: 'u6', nombre: 'Valeria Chávez', tipo: 'vendedora', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=valeria', tiendaId: 't1' },
  { id: 'u7', nombre: 'Sofía Mendoza', tipo: 'vendedora', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sofia', tiendaId: 't1' },
]

export const TIENDAS: Tienda[] = [
  { id: 't1', nombre: 'ImportShop Perú', dueno_id: 'u4', logo: '🛍️', descripcion: 'Los mejores productos importados de China para el hogar, cocina y tecnología. Delivery a todo el Perú.' },
  { id: 't2', nombre: 'VidaSana Suplementos', dueno_id: 'u5', logo: '💊', descripcion: 'Suplementos y productos de bienestar importados. Calidad garantizada, precios directos al consumidor.' },
]

export const PRODUCTOS: Producto[] = [
  {
    id: 'p1', tiendaId: 't1', nombre: 'Masajeador eléctrico de cuello y hombros',
    descripcion: 'Masajeador cervical con calor infrarrojo, 8 cabezales rotatorios y 3 velocidades. Alivia el dolor de cuello y tensión muscular en minutos.',
    precio: 79,
    imagenes: [
      'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800&q=80',
      'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=800&q=80',
      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80',
    ],
    estado: 'activo', landingId: 'l1'
  },
  {
    id: 'p2', tiendaId: 't1', nombre: 'Freidora de aire 4.5L sin aceite',
    descripcion: 'Freidora de aire caliente digital con pantalla táctil, 8 programas preestablecidos. Cocina saludable sin aceite y más rápido que el horno.',
    precio: 189,
    imagenes: [
      'https://images.unsplash.com/photo-1585515320310-259814833e62?w=800&q=80',
      'https://images.unsplash.com/photo-1574226516831-e1dff420e562?w=800&q=80',
      'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80',
    ],
    estado: 'activo', landingId: 'l2'
  },
  {
    id: 'p3', tiendaId: 't1', nombre: 'Lámpara LED escritorio plegable con USB',
    descripcion: 'Lámpara de escritorio LED con puerto USB, 3 modos de luz, intensidad regulable y cuello flexible 360°. Ideal para estudiar y trabajar.',
    precio: 45,
    imagenes: [
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80',
      'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=800&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80',
    ],
    estado: 'activo', landingId: 'l3'
  },
  {
    id: 'p4', tiendaId: 't1', nombre: 'Set de cuchillos de cocina 6 piezas',
    descripcion: 'Juego de cuchillos de acero inoxidable alemán con mango ergonómico antideslizante. Incluye soporte de madera de bambú.',
    precio: 65,
    imagenes: [
      'https://images.unsplash.com/photo-1593618998160-e34014e67546?w=800&q=80',
      'https://images.unsplash.com/photo-1605619925104-ee2b1eb9f7ac?w=800&q=80',
      'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80',
    ],
    estado: 'activo', landingId: 'l4'
  },
  {
    id: 'p5', tiendaId: 't2', nombre: 'Colágeno + Vitamina C x 60 cápsulas',
    descripcion: 'Suplemento de colágeno hidrolizado marino con vitamina C, biotina y ácido hialurónico. Piel firme, cabello y uñas fuertes desde adentro.',
    precio: 55,
    imagenes: [
      'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=800&q=80',
      'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&q=80',
      'https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=800&q=80',
    ],
    estado: 'activo', landingId: 'l5'
  },
  {
    id: 'p6', tiendaId: 't2', nombre: 'Faja reductora de neopreno para mujer',
    descripcion: 'Faja abdominal reductora de neopreno con cierre triple ajustable. Acelera la sudoración en la zona abdominal y mejora la postura.',
    precio: 39,
    imagenes: [
      'https://images.unsplash.com/photo-1518310383802-640c2de311b2?w=800&q=80',
      'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=80',
      'https://images.unsplash.com/photo-1581009137042-c552e485697a?w=800&q=80',
    ],
    estado: 'activo', landingId: 'l6'
  },
  {
    id: 'p7', tiendaId: 't1', nombre: 'Auriculares inalámbricos TWS i12',
    descripcion: 'Auriculares TWS Bluetooth 5.0 con estuche de carga, sonido estéreo y cancelación de ruido. Hasta 4 horas de batería más 3 cargas extra.',
    precio: 35,
    imagenes: [
      'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&q=80',
      'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800&q=80',
      'https://images.unsplash.com/photo-1606400082777-ef05f3c5cde2?w=800&q=80',
    ],
    estado: 'activo', landingId: 'l7'
  },
  {
    id: 'p8', tiendaId: 't2', nombre: 'Termómetro digital infrarrojo sin contacto',
    descripcion: 'Termómetro infrarrojo de precisión médica, resultado en 1 segundo, memoria de 32 lecturas y alarma de fiebre. Apto para toda la familia.',
    precio: 49,
    imagenes: [
      'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&q=80',
      'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=800&q=80',
      'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&q=80',
    ],
    estado: 'activo', landingId: 'l8'
  },
]

export const LANDINGS: Landing[] = [
  {
    id: 'l1', productoId: 'p1',
    titulo: '💆 Masajeador Eléctrico de Cuello - Adiós al Dolor en Minutos',
    descripcionLarga: '¿Pasas horas frente a la pantalla y terminas el día con el cuello y hombros destrozados? El Masajeador Cervical Eléctrico de ImportShop Perú fue diseñado para darte alivio real en solo 15 minutos. Con 8 cabezales rotatorios que imitan las manos de un terapeuta profesional, calor infrarrojo para relajar los músculos en profundidad, y 3 niveles de intensidad para que tú elijas. Úsalo en casa, en la oficina o incluso en el carro. Delivery a todo el Perú, pago contraentrega disponible.',
    recomendaciones: [
      { id: 'r1', nombre: 'Giuliana M.', texto: 'Lo compré con desconfianza porque es importado, pero quedé ENCANTADA. Mi cuello estaba rígido por trabajar en casa y ahora lo uso todas las noches. ¡Una maravilla!', estrellas: 5, fecha: '2025-01-15' },
      { id: 'r2', nombre: 'Ricardo S.', texto: 'Compré uno para mi mamá y le encantó tanto que lo usa dos veces al día. El calor infrarrojo relaja de verdad. Llegó en 3 días a Arequipa.', estrellas: 5, fecha: '2025-01-10' },
      { id: 'r3', nombre: 'Paola T.', texto: 'Trabajo 8 horas en computadora y sufría de contracturas. Este masajeador ha sido un antes y un después. Lo recomiendo 100%.', estrellas: 5, fecha: '2025-01-08' },
      { id: 'r4', nombre: 'Augusto V.', texto: 'Buena calidad para el precio. Los cabezales rotan bien fuerte. Preferiría que el cable fuera un poco más largo pero igual es muy bueno.', estrellas: 4, fecha: '2025-01-05' },
    ],
    ofertas: [
      { nombre: '1 Masajeador', precio: 79, descripcion: 'Masajeador cervical con calor + envío gratis' },
      { nombre: 'Pack Pareja ⭐ Más vendido', precio: 139, descripcion: '2 masajeadores — ahorra S/19. Ideal para regalar.' },
      { nombre: 'Pack Familia x3', precio: 195, descripcion: '3 masajeadores — ahorra S/42. ¡El mejor precio!' },
    ],
    faq: [
      { pregunta: '¿Hacen delivery a provincias?', respuesta: 'Sí, enviamos a todo el Perú. Lima: 1-2 días. Provincias: 2-4 días hábiles via Olva o Shalom.' },
      { pregunta: '¿Es contraentrega?', respuesta: 'Sí, disponible contraentrega en Lima. En provincias puedes pagar por Yape o Plin anticipado.' },
      { pregunta: '¿Tiene garantía?', respuesta: 'Sí, 30 días de garantía por defecto de fábrica. Si algo falla te lo cambiamos sin costo.' },
      { pregunta: '¿Funciona con voltaje peruano?', respuesta: 'Sí, funciona con 110V/220V. Viene con adaptador universal.' },
      { pregunta: '¿Aceptan Yape?', respuesta: 'Sí aceptamos Yape, Plin, transferencia bancaria y efectivo contraentrega.' },
    ],
    aprobadoPorKross: true,
    estadoAprobacion: 'aprobado',
  },
  {
    id: 'l2', productoId: 'p2',
    titulo: '🍳 Freidora de Aire 4.5L - Cocina Sano Sin Culpa',
    descripcionLarga: '¿Quieres comer rico sin aceite y sin gastar horas en la cocina? La Freidora de Aire Digital de 4.5L tiene pantalla táctil, 8 programas automáticos (papas fritas, pollo, pescado, tortas y más) y tecnología de circulación de aire caliente que da el mismo crujiente que la fritura profunda pero con hasta 85% menos grasa. Capacidad para 2-4 personas. Perfecta para familias modernas que quieren comer saludable sin sacrificar el sabor.',
    recomendaciones: [
      { id: 'r5', nombre: 'Milagros C.', texto: 'La mejor compra que he hecho este año. Las alitas de pollo quedan perfectas, crujientes por fuera y jugosas por dentro. Mis hijos ya no me piden fast food.', estrellas: 5, fecha: '2025-01-20' },
      { id: 'r6', nombre: 'Fernando B.', texto: 'Hago papas fritas, nuggets, pescado... todo queda riquísimo. Y lavarla es facilísimo. Excelente producto por ese precio.', estrellas: 5, fecha: '2025-01-18' },
      { id: 'r7', nombre: 'Claudia R.', texto: 'Llegó bien embalada a Trujillo en 3 días. La pantalla táctil es muy fácil de usar. Muy contenta con la compra.', estrellas: 5, fecha: '2025-01-12' },
    ],
    ofertas: [
      { nombre: 'Freidora 4.5L', precio: 189, descripcion: 'Freidora digital táctil con 8 programas + recetario' },
      { nombre: 'Freidora + Set Pinzas', precio: 210, descripcion: 'Freidora 4.5L + set de accesorios de cocina' },
    ],
    faq: [
      { pregunta: '¿Sirve para 4 personas?', respuesta: 'Sí, la capacidad de 4.5L es ideal para 2-4 personas. Puedes hacer 500g de papas o un pollo entero pequeño.' },
      { pregunta: '¿Hacen delivery?', respuesta: 'Sí, enviamos a todo el Perú. Lima: 1-2 días. Provincias: 3-5 días.' },
      { pregunta: '¿Es contraentrega?', respuesta: 'Sí, disponible contraentrega en Lima. Provincias pago por Yape anticipado.' },
      { pregunta: '¿Consume mucha luz?', respuesta: 'No, consume 1500W máximo (similar a una secadora de pelo). Ciclos de cocción cortos de 15-25 min.' },
      { pregunta: '¿Tiene garantía?', respuesta: '30 días de garantía. Si presenta algún defecto lo reponemos sin costo.' },
    ],
    aprobadoPorKross: true,
    estadoAprobacion: 'aprobado',
  },
  {
    id: 'l3', productoId: 'p3',
    titulo: '💡 Lámpara LED Escritorio USB - Estudia y Trabaja Sin Cansar los Ojos',
    descripcionLarga: 'Cuida tu vista con la iluminación correcta. La Lámpara LED de Escritorio de ImportShop tiene 3 modos de luz (cálida, neutra, fría), 10 niveles de intensidad, cuello flexible 360° y un puerto USB lateral para cargar tu celular mientras trabajas. Tecnología LED de última generación que no parpadea y no emite luz UV, lo que reduce la fatiga visual hasta en 70%. Ideal para estudiantes, teletrabajadores y cualquiera que pasa muchas horas frente a pantallas.',
    recomendaciones: [
      { id: 'r8', nombre: 'Andrea L.', texto: 'Perfecta para estudiar de noche. La luz es muy suave con los ojos. Me encanta que tenga el cargador USB integrado para el cel.', estrellas: 5, fecha: '2025-01-14' },
      { id: 'r9', nombre: 'Piero M.', texto: 'Buen producto para el precio. La flexibilidad del cuello permite apuntar la luz exactamente donde quieres.', estrellas: 4, fecha: '2025-01-09' },
    ],
    ofertas: [
      { nombre: 'Lámpara LED', precio: 45, descripcion: 'Lámpara LED escritorio + puerto USB cargador' },
      { nombre: 'Pack 2 Lámparas', precio: 80, descripcion: '2 lámparas, una para escritorio y una para mesita de noche' },
    ],
    faq: [
      { pregunta: '¿Funciona con enchufe peruano?', respuesta: 'Sí, funciona con enchufe estándar 110-220V. También puede funcionar vía USB con power bank.' },
      { pregunta: '¿Hacen delivery?', respuesta: 'Sí, delivery a Lima en 1-2 días y a provincias en 3-5 días.' },
      { pregunta: '¿Es contraentrega?', respuesta: 'Sí, contraentrega disponible en Lima.' },
      { pregunta: '¿El USB carga rápido?', respuesta: 'El puerto USB es de 5V/1A, ideal para carga normal de celulares.' },
    ],
    aprobadoPorKross: true,
    estadoAprobacion: 'aprobado',
  },
  {
    id: 'l4', productoId: 'p4',
    titulo: '🔪 Set Cuchillos de Cocina 6 Piezas - Corta Todo con Precisión',
    descripcionLarga: 'Deja atrás los cuchillos baratos que no cortan. El Set de Cuchillos Profesional de 6 piezas de ImportShop Perú está fabricado en acero inoxidable alemán 4Cr13, con hoja ultra afilada y mango ergonómico antideslizante. Incluye: cuchillo chef 20cm, cuchillo pan 20cm, cuchillo deshuesador 15cm, cuchillo utilitario 12cm, pelador y tijeras de cocina. Todo en soporte de madera de bambú. El regalo perfecto para mamá o para renovar tu cocina.',
    recomendaciones: [
      { id: 'r10', nombre: 'Rosa E.', texto: 'Los mejores cuchillos que he tenido. Cortan hasta el tomate sin aplastarlo. El soporte de bambú es muy elegante.', estrellas: 5, fecha: '2025-01-22' },
      { id: 'r11', nombre: 'Carlos A.', texto: 'Lo compré como regalo para mi esposa y quedó encantada. Llegó en una caja muy bien presentada. Vale cada sol.', estrellas: 5, fecha: '2025-01-16' },
    ],
    ofertas: [
      { nombre: 'Set 6 piezas', precio: 65, descripcion: 'Set completo con soporte de bambú' },
    ],
    faq: [
      { pregunta: '¿Son aptos para lavavajillas?', respuesta: 'Recomendamos lavarlos a mano para prolongar su vida útil. El acero es resistente pero el lavado a mano los mantiene mejor.' },
      { pregunta: '¿Hacen delivery?', respuesta: 'Sí, a todo el Perú. Lima 1-2 días, provincias 3-5 días.' },
      { pregunta: '¿Es contraentrega?', respuesta: 'Sí, en Lima. Provincias vía Yape anticipado.' },
    ],
    aprobadoPorKross: true,
    estadoAprobacion: 'aprobado',
  },
  {
    id: 'l5', productoId: 'p5',
    titulo: '✨ Colágeno + Vitamina C - Piel Joven, Cabello Fuerte y Uñas Resistentes',
    descripcionLarga: '¿Notas tu piel opaca, tu cabello débil o tus uñas que se quiebran fácil? El paso del tiempo y el estrés agotan el colágeno de tu cuerpo, y eso se nota. Nuestro suplemento de Colágeno Hidrolizado Marino + Vitamina C + Biotina + Ácido Hialurónico es la fórmula completa para recuperar tu vitalidad desde adentro. 60 cápsulas de alta absorción para 2 meses de tratamiento. Miles de mujeres en Perú ya lo toman todos los días y los resultados hablan solos.',
    recomendaciones: [
      { id: 'r12', nombre: 'Yolanda P.', texto: 'Llevo 6 semanas tomándolo y mi piel está más firme y luminosa. Mis amigas me preguntan qué tratamiento me hago. ¡Solo colágeno!', estrellas: 5, fecha: '2025-01-19' },
      { id: 'r13', nombre: 'Mariela H.', texto: 'Mis uñas solían quebrarse constantemente. Desde que tomo este colágeno están largas y fuertes por primera vez en años.', estrellas: 5, fecha: '2025-01-13' },
      { id: 'r14', nombre: 'Luz K.', texto: 'Ya voy por mi tercer frasco. El cabello lo noto más grueso y con menos caída. Muy buena calidad para este precio.', estrellas: 5, fecha: '2025-01-07' },
      { id: 'r15', nombre: 'Patricia G.', texto: 'Me lo recomendó una amiga. En el primer mes no noté mucho pero en el segundo sí vi diferencia en la piel. Hay que ser constante.', estrellas: 4, fecha: '2025-01-03' },
    ],
    ofertas: [
      { nombre: '1 frasco x 60 cáp.', precio: 55, descripcion: 'Tratamiento de 2 meses' },
      { nombre: 'Pack 3 frascos', precio: 145, descripcion: 'Tratamiento completo de 6 meses, ahorra S/20' },
      { nombre: 'Pack 6 frascos', precio: 270, descripcion: 'Tratamiento de 12 meses, el máximo resultado, ahorra S/60' },
    ],
    faq: [
      { pregunta: '¿Cuándo se ven resultados?', respuesta: 'Los primeros cambios se notan a partir de las 4-6 semanas. Para resultados completos en piel, cabello y uñas se recomienda 3 meses continuos.' },
      { pregunta: '¿Tiene registro DIGEMID?', respuesta: 'Es un suplemento alimenticio importado. Recomendamos consultar con tu médico si tienes condiciones especiales.' },
      { pregunta: '¿Pueden tomarlo hombres?', respuesta: 'Sí, el colágeno es beneficioso para todos. Muchos hombres lo toman para articulaciones y piel.' },
      { pregunta: '¿Hacen delivery?', respuesta: 'Sí, a todo el Perú. Lima en 1-2 días, provincias en 3-5 días.' },
      { pregunta: '¿Aceptan Yape?', respuesta: 'Sí, Yape, Plin, transferencia o efectivo contraentrega en Lima.' },
    ],
    aprobadoPorKross: true,
    estadoAprobacion: 'aprobado',
  },
  {
    id: 'l6', productoId: 'p6',
    titulo: '👙 Faja Reductora Neopreno - Moldea tu Figura y Mejora tu Postura',
    descripcionLarga: 'La Faja Reductora de Neopreno de VidaSana es la favorita de miles de mujeres peruanas. El neopreno de alta densidad aumenta la temperatura corporal en la zona abdominal, acelerando la sudoración y potenciando el efecto de tu ejercicio o actividad diaria. Cierre triple ajustable para mayor compresión, tela interior suave anti-rozadura. Disponible en tallas S, M, L, XL y XXL.',
    recomendaciones: [
      { id: 'r16', nombre: 'Beatriz N.', texto: 'La uso para hacer ejercicio y la diferencia es notable. Se ajusta bien y no se resbala. Muy cómoda para ser de neopreno.', estrellas: 5, fecha: '2025-01-21' },
      { id: 'r17', nombre: 'Sandra M.', texto: 'La llevo puesta al caminar y siento que sudo más en la barriga. La talla M me quedó perfecta para mi talla 38.', estrellas: 4, fecha: '2025-01-11' },
    ],
    ofertas: [
      { nombre: '1 Faja', precio: 39, descripcion: 'Faja reductora neopreno (talla a elegir)' },
      { nombre: 'Pack 2 Fajas', precio: 70, descripcion: '2 fajas para variar en el lavado, ahorra S/8' },
    ],
    faq: [
      { pregunta: '¿Cómo elijo mi talla?', respuesta: 'S: cintura 60-70cm, M: 70-80cm, L: 80-90cm, XL: 90-100cm, XXL: 100-110cm. Si dudas entre dos tallas, elige la mayor.' },
      { pregunta: '¿Se puede lavar?', respuesta: 'Sí, lavar a mano con agua fría y jabón suave. No usar secadora ni plancha.' },
      { pregunta: '¿Hacen delivery?', respuesta: 'Sí, a todo el Perú. Lima 1-2 días, provincias 3-5 días.' },
      { pregunta: '¿Funciona sin hacer ejercicio?', respuesta: 'Aumenta la sudoración durante cualquier actividad. Para mejores resultados combínala con ejercicio y buena alimentación.' },
    ],
    aprobadoPorKross: true,
    estadoAprobacion: 'aprobado',
  },
  {
    id: 'l7', productoId: 'p7',
    titulo: '🎧 Auriculares TWS i12 - Sonido Premium por Precio Increíble',
    descripcionLarga: 'Olvídate de los cables y disfruta de libertad total con los Auriculares Inalámbricos TWS i12 de ImportShop Perú. Bluetooth 5.0 para conexión instantánea y estable, sonido estéreo de alta definición, y un estuche de carga que les da 3 recargas adicionales. Perfectos para el gym, la calle, el trabajo o el transporte. Compatibles con iPhone y Android.',
    recomendaciones: [
      { id: 'r18', nombre: 'Kevin R.', texto: 'Para el precio que tienen, el sonido es muy bueno. Los uso en el gym y no se caen. La batería dura bastante.', estrellas: 5, fecha: '2025-01-17' },
      { id: 'r19', nombre: 'Daniela C.', texto: 'Compraron estos y los de una tienda cara... estos suenan igual o mejor. Excelente relación calidad-precio.', estrellas: 5, fecha: '2025-01-06' },
    ],
    ofertas: [
      { nombre: '1 par TWS i12', precio: 35, descripcion: 'Auriculares + estuche carga + cable USB' },
      { nombre: 'Pack 2 pares', precio: 60, descripcion: '2 pares, uno para ti y uno para regalar, ahorra S/10' },
    ],
    faq: [
      { pregunta: '¿Son compatibles con iPhone?', respuesta: 'Sí, compatibles con iPhone y cualquier Android con Bluetooth.' },
      { pregunta: '¿Cuánto dura la batería?', respuesta: 'Cada auricular dura aprox. 3-4 horas. El estuche carga les da 3 recargas más, total ~12-16 horas de uso.' },
      { pregunta: '¿Son resistentes al agua?', respuesta: 'Tienen resistencia básica al sudor (IPX4), ideales para ejercicio. No sumergir en agua.' },
      { pregunta: '¿Hacen delivery?', respuesta: 'Sí, a todo el Perú. Lima 1-2 días, provincias 3-5 días.' },
    ],
    aprobadoPorKross: true,
    estadoAprobacion: 'aprobado',
  },
  {
    id: 'l8', productoId: 'p8',
    titulo: '🌡️ Termómetro Infrarrojo - Temperatura en 1 Segundo, Sin Contacto',
    descripcionLarga: 'Cuida la salud de tu familia con precisión médica. El Termómetro Digital Infrarrojo de VidaSana da resultado en 1 segundo sin ningún contacto. Pantalla LCD grande, memoria de 32 lecturas, alarma sonora y visual de fiebre (>37.5°C). Mide frente, oído, objetos y líquidos. Apto para bebés, niños y adultos. Indispensable en todo hogar peruano.',
    recomendaciones: [
      { id: 'r20', nombre: 'Cecilia M.', texto: 'Tengo un bebé de 8 meses y este termómetro ha sido un salvavidas. Sin contacto, resultado inmediato. Vale todo lo que cuesta.', estrellas: 5, fecha: '2025-01-23' },
      { id: 'r21', nombre: 'Roberto H.', texto: 'Muy preciso, lo comparé con el del médico y da la misma temperatura. Excelente producto.', estrellas: 5, fecha: '2025-01-15' },
    ],
    ofertas: [
      { nombre: '1 Termómetro', precio: 49, descripcion: 'Termómetro infrarrojo + pilas AAA incluidas' },
      { nombre: 'Pack Familiar x2', precio: 89, descripcion: '2 termómetros, uno para casa y uno para la bolsa, ahorra S/9' },
    ],
    faq: [
      { pregunta: '¿Es preciso para bebés?', respuesta: 'Sí, la medición en frente es la más precisa para bebés. Acercar a 3-5cm de la frente para mejor lectura.' },
      { pregunta: '¿Qué temperatura considera fiebre?', respuesta: 'La alarma se activa a partir de 37.5°C según estándar médico peruano.' },
      { pregunta: '¿Hacen delivery?', respuesta: 'Sí, a todo el Perú. Lima 1-2 días, provincias 3-5 días.' },
      { pregunta: '¿Tiene garantía?', respuesta: 'Sí, 30 días de garantía por defecto de fábrica.' },
      { pregunta: '¿Aceptan Yape?', respuesta: 'Sí, Yape, Plin, transferencia o efectivo contraentrega en Lima.' },
    ],
    aprobadoPorKross: true,
    estadoAprobacion: 'aprobado',
  },
]

export const CLIENTES: ClientePerfil[] = []

export const VENDEDORAS: Vendedora[] = [
  { id: 'u4', nombre: 'Miguel Ángel Rojas', tiendaId: 't1', alcance: 'solo_asignados', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=miguel' },
  { id: 'u5', nombre: 'Patricia Solano',    tiendaId: 't2', alcance: 'solo_asignados', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=patricia' },
  { id: 'u6', nombre: 'Valeria Chávez',     tiendaId: 't1', alcance: 'solo_asignados', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=valeria' },
  { id: 'u7', nombre: 'Sofía Mendoza',      tiendaId: 't1', alcance: 'solo_asignados', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sofia' },
]

export const CHATS: Chat[] = []

export const PEDIDOS: Pedido[] = []

export const BOTS: Bot[] = [
  {
    id: 'bot1', tiendaId: 't1', nombre: 'Bot Bienvenida ImportShop',
    pasos: [
      {
        id: 'paso1',
        pregunta: '¿En qué te podemos ayudar?',
        opciones: ['¿Hacen delivery a provincias?', 'Formas de pago', '¿Es contraentrega?', '¿Tienen garantía?'],
        respuestas: {
          '¿Hacen delivery a provincias?': 'Sí, enviamos a todo el Perú por Olva Courier y Shalom. Lima 1-2 días, provincias 2-4 días.',
          'Formas de pago': 'Aceptamos Yape, Plin, transferencia bancaria y efectivo contraentrega en Lima.',
          '¿Es contraentrega?': 'Sí, en Lima pagas cuando recibes tu pedido. En provincias por Yape anticipado.',
          '¿Tienen garantía?': '30 días de garantía por defecto de fábrica en todos nuestros productos.',
        }
      }
    ]
  }
]

export const CONFIGS_IA: ConfigIA[] = [
  {
    id: 'ia1', tiendaId: 't1', estado: 'activo',
    instrucciones: 'Eres la asistente de ImportShop Perú. Vendemos productos importados de China: masajeadores, freidoras de aire, lámparas LED, cuchillos y auriculares. Precios de S/35 a S/189. Siempre responde de forma amigable y en tono cercano. Menciona Yape como opción de pago. Destaca la garantía de 30 días y el delivery a todo el Perú.',
    recontacto: {
      intencion: 'Reactivar clientes que preguntaron pero no confirmaron pedido',
      mensajeAbridor: 'Hola [nombre] 👋 ¡Te extrañamos! Aún tenemos disponible el producto que te interesó. ¿Quieres que lo reservamos para ti hoy? 🛍️',
    }
  }
]

export const VALORACIONES: Valoracion[] = [
  { id: 'val1', productoId: 'p1', clienteId: 'c3', estrellas: 5, comentario: 'Masajeador excelente, el calor infrarrojo relaja de verdad. Sin duda lo recomiendo.', fecha: '2025-01-20' },
  { id: 'val2', productoId: 'p5', clienteId: 'c3', estrellas: 5, comentario: 'El colágeno es muy bueno. Después de 6 semanas mi piel está mucho más firme.', fecha: '2025-01-20' },
]

export const RECLAMOS: Reclamo[] = [
  { id: 'rec1', pedidoId: 'ped4', clienteId: 'c1', motivo: 'El producto llegó con el cable dañado', estado: 'resuelto', fecha: '2025-01-09' },
]
