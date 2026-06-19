// Provincias y distritos principales de Perú por departamento
export const GEO_PERU: Record<string, Record<string, string[]>> = {
  Lima: {
    Lima: [
      'Ate', 'Barranco', 'Breña', 'Carabayllo', 'Chorrillos', 'Cieneguilla',
      'Comas', 'El Agustino', 'Independencia', 'Jesús María', 'La Molina',
      'La Victoria', 'Lince', 'Los Olivos', 'Lurigancho', 'Lurín', 'Magdalena del Mar',
      'Miraflores', 'Pachacámac', 'Pueblo Libre', 'Puente Piedra', 'Rímac',
      'San Borja', 'San Isidro', 'San Juan de Lurigancho', 'San Juan de Miraflores',
      'San Luis', 'San Martín de Porres', 'San Miguel', 'Santa Anita', 'Santiago de Surco',
      'Surquillo', 'Villa El Salvador', 'Villa María del Triunfo',
    ],
    Callao: ['Bellavista', 'Callao', 'Carmen de La Legua', 'La Perla', 'La Punta', 'Mi Perú', 'Ventanilla'],
    Huaral: ['Huaral', 'Chancay', 'Aucallama'],
    Cañete: ['San Vicente de Cañete', 'Mala', 'Asia', 'Chilca'],
    Huarochirí: ['Matucana', 'Chosica', 'Chaclacayo'],
    Barranca: ['Barranca', 'Supe', 'Pativilca'],
  },
  Arequipa: {
    Arequipa: [
      'Arequipa', 'Alto Selva Alegre', 'Cayma', 'Cerro Colorado', 'Characato',
      'Hunter', 'José Luis Bustamante y Rivero', 'Mariano Melgar', 'Miraflores',
      'Paucarpata', 'Sachaca', 'Socabaya', 'Tiabaya', 'Uchumayo', 'Yanahuara',
    ],
    Camaná: ['Camaná', 'Ocoña', 'Samuel Pastor'],
    Caylloma: ['Chivay', 'Cabanaconde'],
  },
  Cusco: {
    Cusco: ['Cusco', 'San Jerónimo', 'San Sebastián', 'Santiago', 'Wanchaq'],
    'La Convención': ['Quillabamba', 'Echarati'],
    Urubamba: ['Urubamba', 'Ollantaytambo', 'Machu Picchu'],
    Calca: ['Calca', 'Pisac'],
  },
  'La Libertad': {
    Trujillo: ['Trujillo', 'El Porvenir', 'Florencia de Mora', 'Huanchaco', 'La Esperanza', 'Laredo', 'Moche', 'Salaverry', 'Víctor Larco Herrera'],
    Pacasmayo: ['Pacasmayo', 'San Pedro de Lloc', 'Guadalupe'],
    Chepén: ['Chepén', 'Pacanga'],
  },
  Piura: {
    Piura: ['Piura', 'Castilla', 'Catacaos', 'Cura Mori', 'El Tallán', 'La Arena', 'La Unión', 'Tambogrande'],
    Sullana: ['Sullana', 'Bellavista', 'Marcavelica', 'Querecotillo', 'Salitral'],
    Paita: ['Paita', 'Amotape', 'Colán', 'Tamarindo'],
    Talara: ['Pariñas', 'El Alto', 'La Brea'],
  },
  Lambayeque: {
    Chiclayo: ['Chiclayo', 'Chongoyape', 'Eten', 'José Leonardo Ortiz', 'La Victoria', 'Monsefú', 'Pimentel', 'Pomalca', 'Reque', 'Santa Rosa'],
    Lambayeque: ['Lambayeque', 'Íllimo', 'Jayanca', 'Mórrope', 'Olmos', 'Pacora'],
    Ferreñafe: ['Ferreñafe', 'Incahuasi', 'Pueblo Nuevo'],
  },
  Junín: {
    Huancayo: ['Huancayo', 'Chilca', 'El Tambo', 'Huancán', 'Junín', 'Pilcomayo', 'San Agustín de Cajas'],
    Satipo: ['Satipo', 'Mazamari', 'Pangoa'],
    Tarma: ['Tarma', 'Acobamba', 'La Oroya'],
  },
  Áncash: {
    Huaraz: ['Huaraz', 'Independencia', 'Jangas', 'La Libertad', 'Olleros', 'Pira'],
    Santa: ['Chimbote', 'Coishco', 'Moro', 'Nepeña', 'Nuevo Chimbote', 'Samanco'],
    Casma: ['Casma', 'Buenavista Alta'],
  },
  Cajamarca: {
    Cajamarca: ['Cajamarca', 'Baños del Inca', 'Jesús', 'Llacanora', 'Los Baños del Inca'],
    Jaén: ['Jaén', 'Bellavista', 'Colasay', 'Huabal'],
    Chota: ['Chota', 'Cochabamba'],
  },
  Puno: {
    Puno: ['Puno', 'Acora', 'Amantaní', 'Atuncolla', 'Capachica', 'Chucuito', 'Coata', 'Huata', 'Mañazo', 'Pichacani', 'Platería', 'San Antonio', 'Tiquillaca', 'Vilque'],
    Juliaca: ['Juliaca', 'Cabana', 'Caracoto'],
    Azángaro: ['Azángaro', 'Achaya', 'Arapa'],
  },
  Loreto: {
    Maynas: ['Iquitos', 'Alto Nanay', 'Fernando Lores', 'Indiana', 'Las Amazonas', 'Mazan', 'Napo', 'Punchana', 'Torres Causana'],
    Requena: ['Requena', 'Alto Tapiche', 'Jenaro Herrera'],
    Ucayali: ['Contamana', 'Inahuaya', 'Padre Márquez'],
  },
  Tacna: {
    Tacna: ['Tacna', 'Alto de la Alianza', 'Calana', 'Ciudad Nueva', 'Coronel Gregorio Albarracín', 'Inclán', 'Palca', 'Pocollay', 'Sama'],
    Tarata: ['Tarata', 'Chucatamani'],
  },
  Ica: {
    Ica: ['Ica', 'La Tinguiña', 'Los Aquijes', 'Ocucaje', 'Pachacutec', 'Parcona', 'Pueblo Nuevo', 'Salas', 'San José de Los Molinos', 'Subtanjalla', 'Tate', 'Yauca del Rosario'],
    Nazca: ['Nazca', 'Changuillo', 'El Ingenio', 'Marcona', 'Vista Alegre'],
    Pisco: ['Pisco', 'Humay', 'Independencia', 'Paracas', 'San Andrés', 'San Clemente', 'Túpac Amaru Inca'],
  },
  'San Martín': {
    'San Martín': ['Tarapoto', 'Alberto Leveau', 'Cacatachi', 'Chazuta', 'Chipurana', 'El Porvenir', 'Huimbayoc', 'Juan Guerra', 'La Banda de Shilcayo', 'Morales', 'Papaplaya', 'San Antonio', 'Sauce'],
    Moyobamba: ['Moyobamba', 'Calzada', 'Habana', 'Jepelacio', 'Soritor', 'Yantalo'],
    Rioja: ['Rioja', 'Awajun', 'Elías Soplin Vargas', 'Nueva Cajamarca', 'Pardo Miguel'],
  },
  Huánuco: {
    Huánuco: ['Huánuco', 'Amarilis', 'Chinchao', 'Churubamba', 'Margos', 'Quisqui', 'San Francisco de Cayran', 'San Pedro de Chaulán', 'Santa María del Valle', 'Yarumayo'],
    'Leoncio Prado': ['Tingo María', 'Daniel Alomía Robles', 'Hermílio Valdizán', 'José Crespo y Castillo', 'Luyando', 'Mariano Dámaso Beraún'],
  },
  Ayacucho: {
    Huamanga: ['Ayacucho', 'Acocro', 'Acos Vinchos', 'Carmen Alto', 'Chiara', 'Jesús Nazareno', 'Ocros', 'Pacaycasa', 'Quinua', 'San José de Ticllas', 'San Juan Bautista', 'Santiago de Pischa', 'Socos', 'Tambillo'],
    Huanta: ['Huanta', 'Ayahuanco', 'Huamanguilla', 'Iguain', 'Llochegua', 'Luricocha', 'Santillana', 'Sivia'],
  },
  Ucayali: {
    'Coronel Portillo': ['Pucallpa', 'Callería', 'Campo Verde', 'Iparía', 'Masisea', 'Nueva Requena', 'Yarinacocha'],
    Atalaya: ['Raymondi', 'Sepahua', 'Tahuanía', 'Yurúa'],
  },
  Apurímac: {
    Abancay: ['Abancay', 'Chacoche', 'Circa', 'Curahuasi', 'Huanipaca', 'Lambrama', 'Pichirhua', 'San Pedro de Cachora', 'Tamburco'],
    Andahuaylas: ['Andahuaylas', 'Andarapa', 'Chiara', 'Huancarama', 'Huancaray', 'Kaquiabamba', 'San Jerónimo', 'Talavera', 'Turpo'],
  },
  Moquegua: {
    'Mariscal Nieto': ['Moquegua', 'Carumas', 'Cuchumbaya', 'Samegua', 'San Cristóbal', 'Torata'],
    Ilo: ['Ilo', 'El Algarrobal', 'Pacocha'],
  },
  Pasco: {
    Pasco: ['Chaupimarca', 'Huachón', 'Huariaca', 'Huayllay', 'Ninacaca', 'Pallanchacra', 'Paucartambo', 'San Francisco de Asís de Yarusyacán', 'Santa Ana de Tusi', 'Simón Bolívar', 'Ticlacayán', 'Tinyahuarco', 'Vicco', 'Yanacancha'],
    Oxapampa: ['Oxapampa', 'Chontabamba', 'Huancabamba', 'Palcazú', 'Pozuzo', 'Puerto Bermúdez', 'Villa Rica'],
  },
  Tumbes: {
    Tumbes: ['Tumbes', 'Corrales', 'La Cruz', 'Pampas de Hospital', 'San Jacinto', 'San Juan de la Virgen'],
    Zarumilla: ['Zarumilla', 'Aguas Verdes', 'Matapalo', 'Papayal'],
  },
  'Madre de Dios': {
    Tambopata: ['Tambopata', 'Inambari', 'Laberinto', 'Las Piedras'],
    Manu: ['Manu', 'Fitzcarrald', 'Madre de Dios', 'Huepetuhe'],
  },
  Huancavelica: {
    Huancavelica: ['Huancavelica', 'Acobambilla', 'Acoria', 'Conayca', 'Cuenca', 'Huachocolpa', 'Huayllahuara', 'Izcuchaca', 'Laria', 'Manta', 'Mariscal Cáceres', 'Moya', 'Nuevo Occoro', 'Palca', 'Pilchaca', 'Vilca', 'Yauli'],
  },
  Amazonas: {
    Chachapoyas: ['Chachapoyas', 'Asunción', 'Balsas', 'Cheto', 'Chiliquín', 'Chuquibamba', 'Granada', 'Huancas', 'La Jalca', 'Leimebamba', 'Levanto', 'Magdalena', 'Mariscal Castilla', 'Molinopampa', 'Montevideo', 'Olleros', 'Quinjalca', 'San Francisco de Daguas', 'San Isidro de Maino', 'Soloco', 'Sonche'],
    Bagua: ['Bagua', 'Aramango', 'Copallin', 'El Parco', 'Imaza', 'La Peca'],
  },
}
