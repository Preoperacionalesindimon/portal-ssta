/* ============================================================
   ats-catalogo.js — Base de conocimiento del ATS interactivo (SSTA-F-007)
   ------------------------------------------------------------
   DE DÓNDE SALE CADA COSA
   - Clasificación de peligros: GTC 45 (2012), Anexo A — Tabla de peligros.
     Siete clases: Biológico, Físico, Químico, Psicosocial, Biomecánico,
     Condiciones de seguridad y Fenómenos naturales.
   - Consecuencias y controles: tomados de los ATS reales de INDIMON
     (Bodega, Reparación caldera aceite térmico, Montaje tanque 20.000 L,
     Modificación tubería zona despacho, Fuga campana tanque 400 m³).
     Se partieron en controles sueltos para poder marcarlos uno por uno,
     pero la redacción es la que ya usan en obra.
   - Jerarquía de controles (GTC 45, numeral 2.8 / Decreto 1072 art.
     2.2.4.6.24): E eliminación · S sustitución · I controles de ingeniería ·
     A controles administrativos, señalización, advertencia · P EPP.

   CÓMO AGREGAR O CAMBIAR ALGO
   Este archivo es solo datos: se puede editar sin tocar la pantalla.
   - Un peligro nuevo: copiar uno de PELIGROS y cambiarle el id.
   - Un control nuevo: agregarlo a la lista `controles` del peligro con su
     letra de jerarquía.
   - Una tarea tipo nueva: agregarla a TAREAS con los ids de sus peligros.
   Después de editar, subir la versión en sw.js (CACHE_NAME) para que los
   celulares la descarguen.
   ============================================================ */

const ATS_FORMATO = {
  titulo: 'ANÁLISIS DE TRABAJO SEGURO',
  // OJO: en los ATS de referencia aparecen dos códigos para este mismo
  // formato (SSTA-F-007 y SSTA-F-046). Confirmar cuál es el vigente en el
  // listado maestro de documentos y dejarlo aquí.
  codigo: 'SSTA-F-007',
  version: '4',
  fecha: '19/10/2016',
  pagina: 'Página: 1 de 1'
};

/* Jerarquía de controles — orden en que se muestran y se imprimen. */
const JERARQUIA = {
  E: { nombre: 'Eliminación', orden: 1 },
  S: { nombre: 'Sustitución', orden: 2 },
  I: { nombre: 'Controles de ingeniería', orden: 3 },
  A: { nombre: 'Controles administrativos', orden: 4 },
  P: { nombre: 'Elementos de protección personal', orden: 5 }
};

/* Las 7 clases de peligro de la GTC 45 (Anexo A), con su descripción
   oficial resumida — se muestra al tocar la clase. */
const CLASES_GTC45 = [
  { id: 'biologico', nombre: 'Biológico', desc: 'Virus, bacterias, hongos, ricketsias, parásitos, picaduras, mordeduras, fluidos o excrementos.' },
  { id: 'fisico', nombre: 'Físico', desc: 'Ruido, iluminación, vibración, temperaturas extremas, presión atmosférica, radiaciones ionizantes y no ionizantes.' },
  { id: 'quimico', nombre: 'Químico', desc: 'Polvos orgánicos e inorgánicos, fibras, líquidos (nieblas y rocíos), gases y vapores, humos metálicos y no metálicos, material particulado.' },
  { id: 'psicosocial', nombre: 'Psicosocial', desc: 'Gestión organizacional, características de la organización del trabajo, del grupo social, condiciones de la tarea, jornada de trabajo.' },
  { id: 'biomecanico', nombre: 'Biomecánico', desc: 'Postura (prolongada, mantenida, forzada), esfuerzo, movimiento repetitivo, manipulación manual de cargas.' },
  { id: 'seguridad', nombre: 'Condiciones de seguridad', desc: 'Mecánico, eléctrico, locativo, tecnológico, accidentes de tránsito, públicos, trabajo en alturas, espacios confinados.' },
  { id: 'natural', nombre: 'Fenómenos naturales', desc: 'Sismo, terremoto, vendaval, inundación, derrumbe, precipitaciones (lluvias, granizadas, heladas).' }
];

/* ============================================================
   PELIGROS
   id        identificador interno (no cambiarlo si ya hay ATS guardados)
   clase     una de CLASES_GTC45
   sub       descriptor de la GTC 45 dentro de la clase
   texto     cómo se imprime en la columna PELIGROS
   efectos   cómo se imprime en la columna CONSECUENCIA
   controles [texto, jerarquía]
   generales controles generales que este peligro agrega a la tarea
   epp       ids de EPP que sugiere para el encabezado
   emergencia ids de equipos de emergencia que sugiere
   claves    palabras que, escritas en la tarea, sugieren este peligro
   ============================================================ */
const PELIGROS = [
  /* ── Condiciones de seguridad ───────────────────────────── */
  {
    id: 'loc', clase: 'seguridad', sub: 'Locativo',
    texto: 'Superficies de trabajo irregulares, condiciones de orden y aseo.',
    efectos: 'Golpes, esguinces, torceduras, fracturas, contusiones.',
    controles: [
      ['Mantener orden y aseo permanente del área de trabajo', 'E'],
      ['Transitar por senderos autorizados', 'A'],
      ['Inspección visual del área de trabajo y señalización de la misma', 'A'],
      ['Niveles de iluminación óptimos para tránsito seguro por pasillos y áreas de circulación', 'I'],
      ['Uso de EPP adecuado (botas de seguridad con puntera)', 'P']
    ],
    epp: ['botas'], claves: ['orden', 'aseo', 'inspeccion', 'area', 'ingreso', 'recorrido']
  },
  {
    id: 'loc_objetos', clase: 'seguridad', sub: 'Locativo',
    texto: 'Caída de objetos y herramientas, almacenamiento de materiales.',
    efectos: 'Golpes, fracturas, heridas, contusiones a trabajadores y terceros.',
    controles: [
      ['Almacenamiento organizado de materiales en racks o zonas designadas, sin sobreapilar', 'I'],
      ['Uso de bolsa porta herramientas y amarre de herramientas con cuerda de vida', 'I'],
      ['Delimitación y señalización del área bajo el punto de trabajo', 'A'],
      ['Prohibido el tránsito de personal bajo el punto de trabajo', 'A'],
      ['Uso de casco de seguridad con barbuquejo', 'P']
    ],
    epp: ['casco'], claves: ['almacen', 'rack', 'estanteria', 'apilar', 'caida de objetos']
  },
  {
    id: 'loc_derrame', clase: 'seguridad', sub: 'Locativo',
    texto: 'Superficies resbaladizas por derrames de aceite, penetrantes o químicos.',
    efectos: 'Caídas, golpes, contusiones, quemaduras por derrames calientes.',
    controles: [
      ['Controlar derrames de inmediato con material absorbente (kit antiderrames)', 'I'],
      ['Demarcar y señalizar el área de trabajo', 'A'],
      ['Uso de botas de seguridad con suela antideslizante', 'P']
    ],
    epp: ['botas'], emergencia: ['antiderrames'], claves: ['derrame', 'aceite', 'resbal', 'lubric']
  },
  {
    id: 'mec_manual', clase: 'seguridad', sub: 'Mecánico',
    texto: 'Uso de herramienta manual.',
    efectos: 'Machucones, heridas, golpes con o por objetos, pellizcos, atrapamiento de manos, cuerpos extraños en ojos, fracturas, luxaciones, amputaciones.',
    controles: [
      ['Inspección preoperacional de la herramienta; retirar la que esté en mal estado', 'A'],
      ['Mantenimiento preventivo de herramientas', 'A'],
      ['Personal calificado y con experiencia para realizar la labor', 'A'],
      ['Uso de guantes de vaqueta y gafas de seguridad', 'P']
    ],
    epp: ['g_vaqueta', 'gafas'], claves: ['llave', 'martillo', 'desarme', 'desmont', 'ajust', 'ensambl', 'armado', 'tornill', 'torque', 'mecanic']
  },
  {
    id: 'mec_rotativa', clase: 'seguridad', sub: 'Mecánico',
    texto: 'Uso de herramienta eléctrica rotativa (pulidora, motortool, grata, lijadora): proyección de partículas, disco roto o suelto.',
    efectos: 'Heridas cortantes, laceraciones, amputaciones, cuerpos extraños en ojos, golpes, fracturas.',
    controles: [
      ['Usar disco certificado y en buen estado; verificar apriete del disco antes de operar', 'I'],
      ['Herramienta con guarda de protección instalada', 'I'],
      ['Inspección preoperacional de la herramienta', 'A'],
      ['Demarcar y señalizar el área de trabajo', 'A'],
      ['Uso de careta de pulir, gafas de seguridad, guantes de vaqueta, peto y mangas en vaqueta', 'P']
    ],
    epp: ['careta_pulir', 'gafas', 'g_vaqueta', 'peto'], claves: ['pulid', 'pulir', 'motortool', 'motor tool', 'grata', 'lijad', 'lijar', 'desbast', 'esmeril', 'corte', 'cortar', 'bisel', 'brill', 'abrasiv', 'rotosfera']
  },
  {
    id: 'mec_taladro', clase: 'seguridad', sub: 'Mecánico',
    texto: 'Uso de taladro: broca giratoria, atrapamiento de ropa o guantes, rotura de broca.',
    efectos: 'Heridas cortantes, laceraciones, amputación de dedos, cuerpos extraños en ojos, golpes.',
    controles: [
      ['Verificar estado de la broca (sin fisuras ni desgaste) y asegurarla en el portabrocas', 'I'],
      ['No usar guantes holgados ni ropa suelta cerca de partes giratorias', 'A'],
      ['Inspección preoperacional del taladro', 'A'],
      ['Uso de careta de pulir o gafas de seguridad y guantes de vaqueta', 'P']
    ],
    epp: ['gafas', 'g_vaqueta'], claves: ['taladr', 'perfor', 'broca', 'agujero', 'anclaje quimico', 'chazo']
  },
  {
    id: 'mec_lamina', clase: 'seguridad', sub: 'Mecánico',
    texto: 'Manejo de láminas y piezas metálicas: bordes cortantes, peso.',
    efectos: 'Cortes, laceraciones, amputaciones, golpes, heridas por bordes cortantes.',
    controles: [
      ['Proteger bordes cortantes con cinta o tapones', 'I'],
      ['Asegurar la lámina contra deslizamiento durante el corte', 'I'],
      ['Uso de guantes de vaqueta, mangas de vaqueta y botas de seguridad con puntera', 'P']
    ],
    epp: ['g_vaqueta', 'peto', 'botas'], claves: ['lamina', 'parche', 'plancha', 'chapa', 'rolad', 'conform', 'trazad']
  },
  {
    id: 'mec_izaje', clase: 'seguridad', sub: 'Mecánico',
    texto: 'Izaje de cargas: falla del diferencial, eslingas o ganchos; carga suspendida.',
    efectos: 'Caída de carga, golpes, aplastamiento, atrapamiento, daños a la propiedad, muerte.',
    controles: [
      ['Uso de equipos de izaje certificados, sin superar la capacidad nominal', 'I'],
      ['Uso de cuerdas guía para controlar la carga', 'I'],
      ['Plan de izaje y personal capacitado y certificado', 'A'],
      ['Inspección preoperacional y tarjeta de operación del diferencial, eslingas, ganchos y grilletes', 'A'],
      ['Anclaje adecuado de la carga a izar y de los puntos de anclaje', 'A'],
      ['Delimitación del radio de izaje; prohibido el paso de personal bajo carga suspendida', 'A'],
      ['Trabajo en equipo y comunicación asertiva durante la maniobra', 'A'],
      ['Uso de casco con barbuquejo, guantes y botas con puntera', 'P']
    ],
    generales: ['Permiso de trabajo de izaje de cargas', 'Plan de izaje'],
    epp: ['casco', 'g_vaqueta', 'botas'], claves: ['izaj', 'izar', 'diferencial', 'polipasto', 'grua', 'portico', 'eslinga', 'grillete', 'montacarga', 'levant']
  },
  {
    id: 'energia', clase: 'seguridad', sub: 'Mecánico / Tecnológico',
    texto: 'Liberación de energía residual (agua, vapor, aire comprimido o eléctrica) por bloqueo inadecuado.',
    efectos: 'Quemaduras térmicas (vapor), golpe de fluido a presión, lesiones oculares, descargas eléctricas.',
    controles: [
      ['Aplicar procedimiento de bloqueo y etiquetado (LOTO) sobre las líneas a intervenir', 'I'],
      ['Purga, drenaje y despresurización completa de las líneas antes de intervenir', 'E'],
      ['Verificación de energía cero antes de iniciar; doble verificación por el supervisor', 'A'],
      ['Notificar el bloqueo al personal del cliente', 'A'],
      ['Uso de careta de protección facial y guantes', 'P']
    ],
    generales: ['Bloqueo y etiquetado de energías (LOTO)'],
    epp: ['gafas', 'g_vaqueta'], claves: ['bloqueo', 'loto', 'energia residual', 'energia cero', 'energizad', 'linea de vapor', 'purga', 'despresur', 'valvula', 'intervenir la linea']
  },
  {
    id: 'electrico', clase: 'seguridad', sub: 'Eléctrico',
    texto: 'Descargas eléctricas por uso de herramienta eléctrica y extensiones.',
    efectos: 'Descargas eléctricas, electrocución, quemaduras en distintos grados, incendio, muerte.',
    controles: [
      ['Usar extensiones certificadas y en buen estado, con conexión a tierra verificada', 'I'],
      ['Inspección preoperacional de cable, enchufe y cuerpo de la herramienta', 'A'],
      ['Mantenimiento preventivo de herramientas eléctricas', 'A'],
      ['No operar herramienta eléctrica en superficies húmedas', 'A'],
      ['Uso de botas dieléctricas y casco dieléctrico', 'P']
    ],
    epp: ['botas', 'casco'], claves: ['electric', 'extension', 'pulid', 'taladr', 'motortool', 'lijad', 'toma', 'tablero']
  },
  {
    id: 'electrico_sold', clase: 'seguridad', sub: 'Eléctrico',
    texto: 'Descarga eléctrica por contacto con el circuito de soldadura.',
    efectos: 'Electrocución, paro cardiorrespiratorio, quemaduras eléctricas, muerte.',
    controles: [
      ['Equipo de soldar conectado a tierra; cables y porta-electrodo en buen estado y aislados', 'I'],
      ['No enrollar el cable alrededor del cuerpo; no tocar partes conductoras energizadas', 'A'],
      ['Inspección preoperacional del equipo de soldar', 'A'],
      ['Usar guantes para soldador secos', 'P']
    ],
    epp: ['g_soldador'], claves: ['sold', 'smaw', 'gtaw', 'gmaw', 'tig', 'mig', 'electrodo', 'punte']
  },
  {
    id: 'tec_caliente', clase: 'seguridad', sub: 'Tecnológico',
    texto: 'Trabajo en caliente: chispas, salpicaduras y proyección de escoria (incendio, explosión).',
    efectos: 'Quemaduras de primer, segundo y tercer grado, incendio, explosión, muerte.',
    controles: [
      ['Retirar todo tipo de combustibles en un radio de 10 metros', 'E'],
      ['Cubrir con mantas ignífugas lo que no se pueda retirar; instalar mamparas o cortafuegos', 'I'],
      ['Mantener extintor multipropósito A,B,C disponible en el punto de trabajo', 'I'],
      ['Verificar ausencia de vapores inflamables antes de iniciar', 'A'],
      ['Señalizar y demarcar la zona de trabajo en caliente', 'A'],
      ['Vigía de seguridad durante y 30 minutos después del trabajo en caliente', 'A'],
      ['Personal competente para realizar la actividad', 'A'],
      ['Uso de careta de soldar o de pulir, guantes para soldador, peto, mangas y chaqueta en vaqueta', 'P']
    ],
    generales: ['Permiso de trabajo en caliente', 'Vigía de trabajo en caliente'],
    epp: ['careta_soldar', 'g_soldador', 'peto'], emergencia: ['extintor'],
    claves: ['sold', 'caliente', 'pulid', 'corte', 'oxicorte', 'chispa', 'esmeril', 'desbast', 'motortool', 'grata', 'bisel', 'fabricacion']
  },
  {
    id: 'tec_gas', clase: 'seguridad', sub: 'Tecnológico',
    texto: 'Manejo de cilindros de gas combustible y oxígeno (acetileno, propano): fuga, incendio, explosión.',
    efectos: 'Explosión, incendio, quemaduras graves, destrucción de equipos e instalaciones, muerte.',
    controles: [
      ['Mantener los cilindros asegurados en posición vertical, con capuchón cuando no estén en uso', 'I'],
      ['Válvulas antirretroceso (arrestallamas) instaladas en el equipo', 'I'],
      ['Inspeccionar mangueras, válvulas y reguladores; verificar fugas con agua jabonosa', 'A'],
      ['No usar aceite ni grasa en conexiones de oxígeno', 'A'],
      ['Personal capacitado en manejo de equipos oxicombustibles', 'A'],
      ['Extintor multipropósito cerca del área', 'I']
    ],
    generales: ['Permiso de trabajo en caliente', 'Inspección de equipos de gas antes del inicio'],
    epp: ['careta_soldar', 'g_soldador', 'peto'], emergencia: ['extintor'],
    claves: ['soplete', 'oxicorte', 'acetileno', 'propano', 'oxigeno', 'cilindro', 'precalent', 'gas combustible', 'gas propano']
  },
  {
    id: 'tec_inflamable', clase: 'seguridad', sub: 'Tecnológico',
    texto: 'Inflamabilidad de aerosoles, solventes o pinturas cerca de fuentes de calor.',
    efectos: 'Incendio, quemaduras, explosión.',
    controles: [
      ['Retirar fuentes de calor e ignición del área antes de aplicar', 'E'],
      ['No aplicar cerca de trabajos en caliente simultáneos ni sobre superficies calientes', 'A'],
      ['Almacenar los productos en recipiente cerrado y etiquetado', 'A'],
      ['Mantener extintor multipropósito cerca', 'I']
    ],
    epp: [], emergencia: ['extintor'], claves: ['tinta', 'penetrante', 'aerosol', 'solvente', 'thinner', 'pintur', 'inflamab', 'desengras']
  },
  {
    id: 'tec_presion', clase: 'seguridad', sub: 'Tecnológico',
    texto: 'Sistemas a presión: pruebas neumáticas o hidrostáticas, riesgo de fuga o ruptura.',
    efectos: 'Explosión, golpe por fluido o fragmentos, quemaduras, daños materiales severos, muerte.',
    controles: [
      ['Verificar hermeticidad de todas las uniones antes de presurizar', 'A'],
      ['Presurizar de forma gradual y controlada; vigilar manómetros e indicadores de temperatura', 'A'],
      ['Manómetros calibrados y válvula de alivio en el sistema', 'I'],
      ['Señalizar y demarcar el área de prueba; nadie cerca de zonas de alta presión', 'A'],
      ['Personal autorizado y capacitado para la prueba', 'A'],
      ['Uso de careta de protección facial y guantes', 'P']
    ],
    epp: ['gafas'], claves: ['presion', 'presuriz', 'neumatic', 'hidrostat', 'prueba de presion', 'psi', 'nitrogeno', 'caldera']
  },
  {
    id: 'transito', clase: 'seguridad', sub: 'Accidentes de tránsito',
    texto: 'Tránsito de vehículos y montacargas en el área de trabajo.',
    efectos: 'Golpes, heridas, fracturas, atropellamiento.',
    controles: [
      ['Transitar por las zonas establecidas para el tránsito de peatones', 'A'],
      ['Prelación al peatón; uso de controladores viales para ingreso y salida de vehículos', 'A'],
      ['Respetar la velocidad máxima permitida (10 km/h)', 'A'],
      ['Vehículos con requisitos de seguridad al día (SOAT, técnico-mecánica, licencia)', 'A'],
      ['Uso de chaleco reflectivo', 'P']
    ],
    epp: ['chaleco'], claves: ['montacarga', 'vehiculo', 'transito', 'camion', 'descarg', 'despacho', 'recepcion', 'cargue', 'ingreso']
  },
  {
    id: 'publico', clase: 'seguridad', sub: 'Públicos',
    texto: 'Robos, atracos, asaltos, desorden público en desplazamientos o trabajos en sitio.',
    efectos: 'Lesiones, estrés, pérdida de bienes.',
    controles: [
      ['Desplazamientos en grupo por rutas y horarios establecidos', 'A'],
      ['No portar objetos de valor a la vista; reportar novedades al supervisor', 'A']
    ],
    claves: ['desplaz', 'calle', 'via publica', 'exterior']
  },
  {
    id: 'alturas', clase: 'seguridad', sub: 'Trabajo en alturas',
    texto: 'Trabajo en alturas (andamio, escalera, techo o plataforma): caída de personas a diferente nivel.',
    efectos: 'Caída de alturas, fractura de huesos largos, politraumatismo, muerte.',
    controles: [
      ['Andamio certificado, completo (plataformas, barandas, rodapiés) y nivelado; tarjeta verde antes de su uso', 'I'],
      ['Garantizar puntos de anclaje certificados y línea de vida', 'I'],
      ['Anclaje permanente el 100% del tiempo; doble aseguramiento con eslinga de posicionamiento', 'A'],
      ['Inspección preoperacional del andamio y del EPCC', 'A'],
      ['Coordinador de alturas durante la ejecución de la actividad', 'A'],
      ['Personal idóneo y certificado para trabajo en alturas, con EMO con énfasis en alturas', 'A'],
      ['Delimitación del área de trabajo y comunicación asertiva', 'A'],
      ['Uso obligatorio y adecuado del EPCC: arnés de cuerpo entero, eslingas con absorbedor, casco con barbuquejo', 'P']
    ],
    generales: ['Permiso de trabajo en alturas', 'Coordinador de alturas', 'EMO con énfasis en alturas'],
    epp: ['arnes', 'eslinga', 'posicionamiento', 'casco'], emergencia: ['rescate_alturas'],
    claves: ['altura', 'andamio', 'escalera', 'techo', 'plataforma', 'linea de vida', 'tie-off', 'tie off', 'anclaje', 'elevador', 'cubierta', 'metros']
  },
  {
    id: 'confinados', clase: 'seguridad', sub: 'Espacios confinados',
    texto: 'Trabajo en espacio confinado: atmósfera peligrosa (deficiencia de oxígeno, gases), acceso restringido.',
    efectos: 'Asfixia, vértigo, pérdida del sentido, cefalea, intoxicación, muerte.',
    controles: [
      ['Medición de atmósfera antes de ingresar y cada 30 minutos durante la tarea; el medidor queda con la persona entrante', 'A'],
      ['Ventilación forzada / uso de extractor de aire', 'I'],
      ['Vigía (acompañamiento permanente) en la entrada y método de comunicación establecido', 'A'],
      ['Tomar descansos de 10 minutos cada hora', 'A'],
      ['Personal calificado para trabajo en espacios confinados, con examen específico para la labor', 'A'],
      ['Elementos de emergencia y rescate en sitio', 'I'],
      ['Uso de protección respiratoria adecuada a la atmósfera medida', 'P']
    ],
    generales: ['Permiso de trabajo en espacios confinados', 'Vigía de espacios confinados'],
    epp: ['resp', 'arnes'], emergencia: ['rescate_confinados'],
    claves: ['confinad', 'interior del tanque', 'dentro del tanque', 'manhole', 'recamara', 'boca de visita', 'silo', 'foso']
  },

  /* ── Físico ─────────────────────────────────────────────── */
  {
    id: 'ruido', clase: 'fisico', sub: 'Ruido',
    texto: 'Exposición a ruido por operación de herramientas y propio del área de trabajo.',
    efectos: 'Fatiga auditiva, hipoacusia, sordera, pitidos en el oído, dolor de cabeza.',
    controles: [
      ['Mantenimiento preventivo de las herramientas', 'I'],
      ['Toma de descansos y pausas periódicas; limitar el tiempo de exposición', 'A'],
      ['Uso de protección auditiva (tipo copa o de inserción)', 'P']
    ],
    epp: ['aud_copa', 'aud_ins'], claves: ['pulid', 'motortool', 'taladr', 'grata', 'esmeril', 'martill', 'ruido', 'compresor', 'lijad', 'desbast', 'corte']
  },
  {
    id: 'vibracion', clase: 'fisico', sub: 'Vibración',
    texto: 'Vibraciones mano-brazo por uso de herramientas eléctricas.',
    efectos: 'Síndrome de vibración mano-brazo, parestesias, tendinitis.',
    controles: [
      ['Apoyar la herramienta en superficie cuando sea posible', 'I'],
      ['Limitar el tiempo de exposición a vibraciones; pausas periódicas y rotación de tareas', 'A'],
      ['Uso de guantes de vaqueta', 'P']
    ],
    epp: ['g_vaqueta'], claves: ['pulid', 'taladr', 'motortool', 'grata', 'lijad', 'percutor', 'desbast', 'esmeril']
  },
  {
    id: 'rad_soldadura', clase: 'fisico', sub: 'Radiación no ionizante',
    texto: 'Radiación ultravioleta e infrarroja del arco de soldadura.',
    efectos: 'Quemaduras oculares (fotoqueratitis), quemaduras en piel, cáncer de piel.',
    controles: [
      ['Instalar mamparas para proteger a personas cercanas del arco', 'I'],
      ['Señalizar la zona de soldadura', 'A'],
      ['Uso de careta de soldador con filtro adecuado al proceso (sombra 10-12 SMAW/GMAW, 8-10 GTAW)', 'P'],
      ['Uso de peto, mangas y chaqueta en vaqueta; piel cubierta', 'P']
    ],
    epp: ['careta_soldar', 'peto'], claves: ['sold', 'smaw', 'gtaw', 'gmaw', 'tig', 'mig', 'arco', 'punte']
  },
  {
    id: 'rad_solar', clase: 'fisico', sub: 'Radiación no ionizante',
    texto: 'Radiación UV generada por el sol en trabajos a la intemperie.',
    efectos: 'Irritación de piel y ojos, deshidratación, agotamiento, posibilidad de cáncer de piel.',
    controles: [
      ['Instalar sombra o carpa en el punto de trabajo cuando sea posible', 'I'],
      ['Hidratación permanente y toma de descansos', 'A'],
      ['Uso de bloqueador solar, ropa de manga larga y gafas oscuras', 'P']
    ],
    epp: ['gafas'], claves: ['solar', 'al sol', 'bajo el sol', 'intemperie', 'exterior', 'techo', 'cubierta', 'aire libre', 'patio']
  },
  {
    id: 'temperatura', clase: 'fisico', sub: 'Temperaturas extremas',
    texto: 'Contacto con superficies, piezas o fluidos a alta temperatura.',
    efectos: 'Quemaduras de primer, segundo o tercer grado, golpe de calor, deshidratación.',
    controles: [
      ['Esperar enfriamiento a temperatura segura antes de manipular', 'E'],
      ['Verificar temperatura con pirómetro, termómetro infrarrojo o crayón térmico antes de tocar', 'A'],
      ['Precaución al manipular piezas recién soldadas o cortadas', 'A'],
      ['Uso de guantes de vaqueta o para soldador', 'P']
    ],
    epp: ['g_vaqueta'], claves: ['caliente', 'caldera', 'vapor', 'aceite termico', 'precalent', 'soplete', 'temperatura', 'horno', 'recien soldad']
  },
  {
    id: 'iluminacion', clase: 'fisico', sub: 'Iluminación',
    texto: 'Iluminación deficiente en el punto de trabajo.',
    efectos: 'Fatiga visual, trastornos visuales, dolor de cabeza, caídas y golpes por baja visibilidad.',
    controles: [
      ['Uso de linterna o iluminación portátil adecuada', 'I'],
      ['Programar las tareas críticas con luz suficiente', 'A']
    ],
    claves: ['noche', 'nocturn', 'oscur', 'interior del tanque', 'inspeccion visual', 'iluminac']
  },

  /* ── Químico ────────────────────────────────────────────── */
  {
    id: 'humos', clase: 'quimico', sub: 'Humos metálicos, gases y vapores',
    texto: 'Inhalación de humos metálicos y gases de soldadura.',
    efectos: 'Fiebre de humos metálicos, enfermedades respiratorias, neumoconiosis, intoxicación, muerte.',
    controles: [
      ['Ventilación forzada o extracción localizada de humos', 'I'],
      ['No soldar sobre superficies con aceite o pintura sin limpieza previa', 'A'],
      ['Uso de protección respiratoria media cara con filtros para humos metálicos (Ref. 2097)', 'P']
    ],
    epp: ['resp', 'f2097'], claves: ['sold', 'smaw', 'gtaw', 'gmaw', 'tig', 'mig', 'humo', 'oxicorte', 'punte']
  },
  {
    id: 'particulado', clase: 'quimico', sub: 'Material particulado',
    texto: 'Inhalación de polvos metálicos y material particulado por corte, desbaste o pulido.',
    efectos: 'Irritación de vías respiratorias, enfermedades respiratorias, neumoconiosis, irritación ocular.',
    controles: [
      ['Ventilación del área de trabajo', 'I'],
      ['Recolección del polvo metálico y limpieza del área al terminar', 'A'],
      ['Uso de protección respiratoria media cara con filtros Ref. 2097 y gafas de seguridad', 'P']
    ],
    epp: ['resp', 'f2097', 'gafas'], claves: ['pulid', 'desbast', 'lijad', 'lijar', 'grata', 'corte', 'motortool', 'esmeril', 'polvo', 'abrasiv', 'brill', 'sandblast']
  },
  {
    id: 'vapores', clase: 'quimico', sub: 'Gases y vapores',
    texto: 'Inhalación de vapores de solventes, pinturas, aceite térmico o productos químicos.',
    efectos: 'Irritación de vías respiratorias, mareos, cefalea, intoxicación, enfermedades respiratorias.',
    controles: [
      ['Ventilación del área de trabajo', 'I'],
      ['Ficha de datos de seguridad (SDS) de los productos disponible en el área; etiquetado de sustancias', 'A'],
      ['No fumar ni comer durante la aplicación', 'A'],
      ['Uso de protección respiratoria media cara con filtros para vapores orgánicos (Ref. 6003)', 'P']
    ],
    epp: ['resp', 'f6003'], claves: ['pintur', 'solvente', 'thinner', 'tinta', 'penetrante', 'aceite', 'quimic', 'vapor', 'decapad', 'desengras', 'resina']
  },
  {
    id: 'quimico_piel', clase: 'quimico', sub: 'Líquidos',
    texto: 'Contacto dérmico y ocular con químicos (penetrantes, desengrasantes, decapantes, pinturas).',
    efectos: 'Dermatitis, irritación de piel y ojos, quemaduras químicas.',
    controles: [
      ['Ficha de datos de seguridad (SDS) disponible y etiquetado de las sustancias', 'A'],
      ['Lavado de manos al terminar; no comer en el área', 'A'],
      ['Uso de guantes de nitrilo y gafas de seguridad', 'P']
    ],
    epp: ['g_nitrilo', 'gafas'], claves: ['quimic', 'tinta', 'penetrante', 'desengras', 'decapad', 'pintur', 'acido', 'limpieza quimica', 'pasivad']
  },

  /* ── Biomecánico ────────────────────────────────────────── */
  {
    id: 'cargas', clase: 'biomecanico', sub: 'Manipulación manual de cargas',
    texto: 'Manipulación manual de cargas y esfuerzo físico.',
    efectos: 'Lesiones musculoesqueléticas, lumbalgias, traumatismo de columna, hernias discales, inguinales y umbilicales.',
    controles: [
      ['Uso de medios mecánicos (patines, gatos, montacargas) cuando la carga supere 25 kg', 'I'],
      ['Aplicar procedimiento de manejo manual de cargas; no superar 25 kg por persona', 'A'],
      ['Trabajo en equipo para cargas pesadas (mínimo 2 personas)', 'A'],
      ['Pausas activas', 'A']
    ],
    claves: ['carga', 'cargue', 'descarg', 'traslad', 'recepcion', 'despacho', 'alistamiento', 'material', 'lamina', 'tubo', 'tuberia', 'montaje', 'andamio', 'mover']
  },
  {
    id: 'posturas', clase: 'biomecanico', sub: 'Postura',
    texto: 'Posturas inadecuadas, forzadas o prolongadas.',
    efectos: 'Lesiones musculoesqueléticas, lumbalgias, dolor cervical, tendinitis, úlceras varicosas.',
    controles: [
      ['Pausas activas e higiene postural', 'A'],
      ['Rotación de tareas cuando la actividad sea prolongada', 'A'],
      ['Adoptar posturas ergonómicas; apoyo de la herramienta cuando sea posible', 'A']
    ],
    claves: ['postur', 'inspeccion', 'sold', 'pulid', 'agachad', 'de pie', 'rodillas', 'prolongad']
  },

  /* ── Biológico / Psicosocial / Fenómenos naturales ──────── */
  {
    id: 'biologico', clase: 'biologico', sub: 'Virus, bacterias, hongos',
    texto: 'Virus, bacterias, hongos.',
    efectos: 'Enfermedades infectocontagiosas, alergias.',
    controles: [
      ['Lavado frecuente de manos; hidratación con agua potable', 'A'],
      ['Uso de tapabocas si presenta síntomas asociados a resfriados', 'P']
    ],
    claves: ['charla', 'pausa', 'inspeccion', 'orden', 'aseo', 'basura', 'residuo', 'agua residual', 'ptar', 'ptai']
  },
  {
    id: 'psicosocial', clase: 'psicosocial', sub: 'Jornada de trabajo / condiciones de la tarea',
    texto: 'Jornada de trabajo extensa y complejidad de la tarea.',
    efectos: 'Fatiga física y mental, estrés, ansiedad, falta de concentración.',
    controles: [
      ['Adecuar la carga y el ritmo de trabajo; pausas programadas', 'A'],
      ['Socialización del plan de trabajo y comunicación asertiva', 'A']
    ],
    claves: ['jornada', 'turno', 'noche', 'complej', 'urgente', 'parada de planta']
  },
  {
    id: 'natural', clase: 'natural', sub: 'Sismo, vendaval, precipitaciones',
    texto: 'Sismos, terremotos, inundaciones, precipitaciones, vendavales, granizadas.',
    efectos: 'Caídas, atrapamiento, heridas, golpes, contusiones, mareos, desmayos.',
    controles: [
      ['Suspender la actividad ante condición climática adversa (lluvia, tormenta eléctrica, vendaval)', 'E'],
      ['Aplicar plan de emergencias: ruta de evacuación, brigadistas y divulgación del punto de encuentro', 'A']
    ],
    claves: ['charla', 'inspeccion', 'techo', 'intemperie', 'exterior', 'altura', 'andamio', 'patio']
  }
];

/* ============================================================
   CONTROLES GENERALES — encabezan la columna de medidas de cada tarea
   ("Generales: ..."), igual que en sus ATS.
   ============================================================ */
const GENERALES_BASE = [
  'Charla de seguridad',
  'Supervisión SSTA',
  'EMO periódico o de ingreso',
  'Socialización del plan de trabajo',
  'Divulgación del ATS',
  'Diligenciamiento de preoperacionales de los equipos a usar',
  'Verificación de condiciones de salud'
];
const GENERALES_EXTRA = [
  'Permiso de trabajo en caliente',
  'Vigía de trabajo en caliente',
  'Permiso de trabajo en alturas',
  'Coordinador de alturas',
  'EMO con énfasis en alturas',
  'Permiso de trabajo en espacios confinados',
  'Vigía de espacios confinados',
  'Permiso de trabajo de izaje de cargas',
  'Plan de izaje',
  'Permiso de trabajo eléctrico',
  'Bloqueo y etiquetado de energías (LOTO)',
  'Inspección de equipos de gas antes del inicio',
  'Verificación de certificación del soldador',
  'Ficha de datos de seguridad (SDS) disponible en el área',
  'Charla de seguridad conjunta con el cliente'
];

const RESPONSABLES = [
  'Coordinador de Producción',
  'Supervisor de obra',
  'Personal SSTA',
  'Personal operativo',
  'Coordinador de alturas',
  'Vigía de trabajo en caliente',
  'Soldador calificado',
  'Personal del cliente'
];

/* ============================================================
   ENCABEZADO: opciones seleccionables
   ============================================================ */
const CENTROS_COSTO = ['INDIMON', 'Mayekawa', 'Buen Café', 'Encajes', 'Gaseosas Lux / Postobón', 'Coca-Cola ECLA', 'Quala Tocancipá', 'Gascol Centro'];

const PERMISOS = [
  { id: 'caliente', nombre: 'Caliente', peligros: ['tec_caliente'] },
  { id: 'alturas', nombre: 'Alturas', peligros: ['alturas', 'loc_objetos'] },
  { id: 'confinados', nombre: 'Espacios confinados', peligros: ['confinados'] },
  { id: 'izaje', nombre: 'Izaje de cargas', peligros: ['mec_izaje'] },
  { id: 'electrico', nombre: 'Eléctrico', peligros: ['electrico', 'energia'] }
];

const EPP = [
  { id: 'casco', nombre: 'Casco dieléctrico de seguridad con barbuquejo', base: true },
  { id: 'gafas', nombre: 'Gafas de seguridad claras y/u oscuras', base: true },
  { id: 'aud_ins', nombre: 'Protector auditivo de inserción', base: true },
  { id: 'aud_copa', nombre: 'Protector auditivo tipo copa' },
  { id: 'g_vaqueta', nombre: 'Guantes de vaqueta', base: true },
  { id: 'g_nitrilo', nombre: 'Guantes de nitrilo' },
  { id: 'g_soldador', nombre: 'Guantes para soldador' },
  { id: 'careta_pulir', nombre: 'Careta de pulir (soporte basculante y visor contra impactos)' },
  { id: 'careta_soldar', nombre: 'Careta de soldador' },
  { id: 'resp', nombre: 'Protección respiratoria media cara' },
  { id: 'f2097', nombre: 'Filtros Ref. 2097 (humos metálicos y partículas)' },
  { id: 'f6003', nombre: 'Filtros Ref. 6003 (vapores orgánicos)' },
  { id: 'peto', nombre: 'Peto, mangas y chaqueta en vaqueta' },
  { id: 'botas', nombre: 'Botas de cuero con puntera de acero y dieléctricas', base: true },
  { id: 'dotacion', nombre: 'Dotación: pantalón y camisa en jean/drill', base: true },
  { id: 'arnes', nombre: 'Arnés de cuerpo entero certificado' },
  { id: 'eslinga', nombre: 'Doble eslinga con absorbedor de energía' },
  { id: 'posicionamiento', nombre: 'Líneas de vida de restricción y posicionamiento' },
  { id: 'chaleco', nombre: 'Chaleco reflectivo' },
  { id: 'tapabocas', nombre: 'Tapabocas' }
];

/* Herramientas, agrupadas como en sus ATS. */
const HERRAMIENTAS = [
  { grupo: 'Herramientas eléctricas', items: ['Pulidoras', 'Motor tool', 'Lijadoras', 'Rotosfera', 'Grata eléctrica', 'Taladro para metal', 'Taladro de árbol', 'Taladro percutor', 'Taladro magnético', 'Cortadora orbital', 'Extensiones eléctricas'] },
  { grupo: 'Soldadura y corte', items: ['Equipo de soldar SMAW', 'Equipo de soldar TIG', 'Equipo de soldar MIG', 'Equipo de oxicorte', 'Soplete', 'Cilindros de gas', 'Discos de corte y desbaste'] },
  { grupo: 'Herramientas manuales', items: ['Llaves expansivas', 'Llaves mixtas', 'Llaves fijas', 'Martillos', 'Pinzas', 'Hombre solo', 'Destornilladores', 'Ratches', 'Flexómetro', 'Escuadras', 'Niveles', 'Limas', 'Boquilleras'] },
  { grupo: 'Herramientas mecánicas', items: ['Gato estibador', 'Gato hidráulico', 'Patines', 'Roladora', 'Prensa hidráulica', 'Montacargas'] },
  { grupo: 'Trabajo en alturas', items: ['EPCC completo', 'Líneas de vida', 'Puntos de anclaje certificados', 'Conectores de anclaje (Tie-Off)', 'Andamio certificado', 'Andamio multidireccional', 'Escalera tipo tijera', 'Plataforma elevadora'] },
  { grupo: 'Izaje', items: ['Diferencial (polipasto)', 'Grúa tipo pórtico', 'Eslingas', 'Ganchos y grilletes certificados', 'Cuerdas guía'] },
  { grupo: 'Medición y END', items: ['Tintas penetrantes', 'Pirómetro', 'Crayón térmico', 'Multímetro', 'Medidor de atmósferas (multigás)', 'Extractor de aire', 'Manómetro'] },
  { grupo: 'Bloqueo y señalización', items: ['Tarjetas y candados de bloqueo (LOTO)', 'Extintor multipropósito', 'Manta ignífuga', 'Cinta y conos de delimitación'] },
  { grupo: 'Complementaria', items: ['Polines de madera', 'Estibas', 'Manilas', 'Prensas mordazas', 'Burros niveladores'] }
];

const EMERGENCIA = [
  { id: 'botiquin', nombre: 'Botiquín de primeros auxilios', base: true },
  { id: 'camilla', nombre: 'Camilla', base: true },
  { id: 'extintor', nombre: 'Extintor multipropósito A,B,C', base: true },
  { id: 'brigadistas', nombre: 'Brigadistas', base: true },
  { id: 'rescate_alturas', nombre: 'Kit de rescate en alturas' },
  { id: 'rescate_confinados', nombre: 'Equipo de rescate para espacios confinados (trípode, arnés, línea)' },
  { id: 'antiderrames', nombre: 'Kit antiderrames' },
  { id: 'lavaojos', nombre: 'Lavaojos portátil' }
];

const AMBIENTAL = [
  { id: 'separacion', nombre: 'Separación en la fuente y clasificación de residuos, con disposición final en el centro de acopio', base: true },
  { id: 'punto_eco', nombre: 'Disposición en puntos ecológicos (chatarra metálica, colillas de electrodo, escoria, empaques)' },
  { id: 'respel', nombre: 'Residuos peligrosos (trapos con aceite, envases de químicos, filtros) en recipiente rotulado para gestor autorizado' },
  { id: 'no_vertim', nombre: 'Evitar el vertimiento de residuos al suelo o a fuentes hídricas' },
  { id: 'derrames', nombre: 'Control de derrames con kit antiderrames' },
  { id: 'polvo', nombre: 'Recolección del polvo metálico generado' }
];

/* ============================================================
   TAREAS TIPO
   Cada una trae el nombre y la descripción como aparecen en sus ATS, los
   peligros que la acompañan y las tareas que normalmente siguen (para
   sugerir la próxima). `herr` sugiere herramientas para el encabezado.
   ============================================================ */
const TAREAS = [
  { id: 'inspeccion', nombre: 'Ingreso de personal y herramientas, inspección de área para identificar los peligros asociados a las tareas',
    desc: 'Se efectúa una inspección preventiva del área de trabajo para identificar y documentar los peligros existentes que podrían afectar la seguridad y salud de los trabajadores durante la realización de sus tareas.',
    peligros: ['loc', 'posturas', 'cargas', 'biologico', 'natural'], siguiente: ['pausas'], inicio: 1,
    claves: ['inspeccion de area', 'ingreso', 'recorrido'] },
  { id: 'pausas', nombre: 'Pausas activas y charla de seguridad',
    desc: 'Al inicio de la jornada se realizan pausas activas (estiramiento y activación muscular). Después, el supervisor SSTA dirige la charla de seguridad sobre los riesgos y protocolos de las tareas del día.',
    peligros: ['loc', 'posturas', 'biologico', 'natural'], siguiente: ['divulgacion'], inicio: 2,
    claves: ['pausa', 'charla'] },
  { id: 'divulgacion', nombre: 'Divulgación del ATS, diligenciamiento de permisos e inspección preoperacional de equipos y herramientas',
    desc: 'Se socializa el ATS con todo el personal, se diligencian los permisos de trabajo requeridos y se inspeccionan los equipos y herramientas verificando su operatividad y condición.',
    peligros: ['loc', 'posturas', 'biologico', 'natural'], inicio: 3,
    siguiente: ['descargue', 'recepcion', 'loto', 'andamio', 'fabricacion'],
    claves: ['divulgacion', 'permiso', 'preoperacional'] },
  { id: 'recepcion', nombre: 'Recepción, alistamiento y despacho de materiales, consumibles, fabricaciones y herramientas',
    desc: 'Recepción de materiales entrantes, verificación contra órdenes de compra, descarga y almacenamiento en racks o zonas designadas; alistamiento y despacho con montacargas, patines hidráulicos, eslingas y trabajo en equipo.',
    peligros: ['loc', 'loc_objetos', 'cargas', 'posturas', 'mec_manual', 'transito', 'mec_izaje', 'ruido', 'biologico', 'natural'],
    herr: ['Montacargas', 'Patines', 'Eslingas', 'Gato estibador'], siguiente: ['fabricacion', 'orden'],
    claves: ['recepcion', 'alistamiento', 'despacho', 'bodega', 'almacen', 'embalaje'] },
  { id: 'descargue', nombre: 'Descargue de materiales y herramientas',
    desc: 'Descargue con montacargas en el área designada y traslado al interior mediante patines.',
    peligros: ['mec_manual', 'psicosocial', 'loc', 'transito', 'natural', 'cargas', 'posturas'],
    herr: ['Montacargas', 'Patines'], siguiente: ['andamio', 'portico', 'fabricacion'],
    claves: ['descargue', 'descargar', 'montacargas'] },
  { id: 'loto', nombre: 'Bloqueo de energías, purga y despresurización de líneas (LOTO)',
    desc: 'Previo a la intervención se bloquean, purgan y despresurizan las líneas de agua, vapor, aire o energía eléctrica a intervenir, verificando energía cero.',
    peligros: ['energia', 'temperatura', 'loc', 'posturas'],
    herr: ['Tarjetas y candados de bloqueo (LOTO)', 'Manómetro'], siguiente: ['corte', 'andamio'],
    claves: ['bloqueo', 'loto', 'purga', 'despresur', 'energia cero'] },
  { id: 'andamio', nombre: 'Armado de andamio para trabajo en altura',
    desc: 'Armado del andamio certificado con plataformas completas, barandas, rodapiés y escalera interna; nivelado, arriostrado y anclado. Inspección final del coordinador de alturas y tarjeta verde.',
    peligros: ['alturas', 'loc_objetos', 'mec_manual', 'loc', 'cargas'],
    herr: ['Andamio multidireccional', 'EPCC completo', 'Llaves mixtas', 'Niveles'], siguiente: ['linea_vida', 'acceso_altura'],
    claves: ['armado de andamio', 'andamio'] },
  { id: 'linea_vida', nombre: 'Instalación de conectores de anclaje (Tie-Off) y línea de vida horizontal',
    desc: 'El personal certificado asciende de forma segura y monta los conectores de anclaje y una línea de vida horizontal certificada anclada a un punto fijo.',
    peligros: ['alturas', 'loc_objetos', 'mec_manual', 'posturas'],
    herr: ['Conectores de anclaje (Tie-Off)', 'Líneas de vida', 'Puntos de anclaje certificados'], siguiente: ['acceso_altura'],
    claves: ['linea de vida', 'tie-off', 'tie off', 'anclaje'] },
  { id: 'acceso_altura', nombre: 'Acceso seguro al punto de trabajo en altura e inspección inicial',
    desc: 'Ascenso por el medio de acceso, conectado de forma permanente al sistema contra caídas, y evaluación visual del estado del punto a intervenir.',
    peligros: ['alturas', 'loc_objetos', 'rad_solar', 'posturas', 'natural'],
    siguiente: ['desarme', 'corte', 'desbaste'], claves: ['acceso', 'techo', 'ascenso', 'subir'] },
  { id: 'portico', nombre: 'Armado de grúa tipo pórtico',
    desc: 'Descarga y ubicación de las partes de la grúa en el área de ensamble; armado con andamio y herramientas manuales, uniones mecánicas que garanticen la integridad estructural.',
    peligros: ['mec_manual', 'psicosocial', 'loc', 'alturas', 'cargas', 'posturas', 'natural'],
    herr: ['Grúa tipo pórtico', 'Andamio multidireccional', 'Llaves mixtas'], siguiente: ['izaje'],
    claves: ['portico', 'grua'] },
  { id: 'izaje', nombre: 'Izaje y montaje mecánico con diferencial o grúa',
    desc: 'Con apoyo del diferencial o la grúa y eslingas certificadas se izan y posicionan las piezas, complementando con montaje manual en elementos livianos.',
    peligros: ['mec_izaje', 'loc_objetos', 'cargas', 'posturas', 'loc'],
    herr: ['Diferencial (polipasto)', 'Eslingas', 'Ganchos y grilletes certificados', 'Cuerdas guía'], siguiente: ['soldadura', 'tuberia'],
    claves: ['izaje', 'izar', 'diferencial', 'montaje mecanico'] },
  { id: 'desarme', nombre: 'Desarme o desmontaje con herramienta manual',
    desc: 'Desmontaje del equipo o componente con herramientas de mano (llaves fijas, expansivas, rachet) para inspeccionar y determinar la reparación.',
    peligros: ['mec_manual', 'posturas', 'cargas', 'loc'],
    herr: ['Llaves fijas', 'Llaves expansivas', 'Ratches'], siguiente: ['desbaste', 'inspeccion_visual'],
    claves: ['desarme', 'desmontaje', 'desmontar', 'desarmar'] },
  { id: 'corte', nombre: 'Corte con pulidora o motortool',
    desc: 'Corte del material o tubería con pulidora angular o motortool y limpieza de la zona de corte.',
    peligros: ['mec_rotativa', 'tec_caliente', 'ruido', 'vibracion', 'particulado', 'electrico', 'posturas'],
    herr: ['Pulidoras', 'Motor tool', 'Discos de corte y desbaste', 'Extensiones eléctricas', 'Extintor multipropósito'], siguiente: ['desbaste', 'soldadura'],
    claves: ['corte', 'cortar', 'motortool'] },
  { id: 'desbaste', nombre: 'Desbaste, pulido, lijado y limpieza con grata',
    desc: 'Desbaste y limpieza mecánica de la zona con pulidora, lijadora, motortool o grata para retirar pintura, óxido, escoria o material contaminado hasta exponer metal sano.',
    peligros: ['mec_rotativa', 'tec_caliente', 'ruido', 'vibracion', 'particulado', 'electrico', 'posturas'],
    herr: ['Pulidoras', 'Lijadoras', 'Grata eléctrica', 'Discos de corte y desbaste'], siguiente: ['soldadura', 'tintas', 'pintura'],
    claves: ['desbast', 'pulid', 'lijad', 'grata', 'bisel', 'brill', 'esmeril', 'abrasiv'] },
  { id: 'taladro', nombre: 'Perforación con taladro',
    desc: 'Perforación con taladro y broca adecuada al material, para anclajes, alivio de tensiones o uniones.',
    peligros: ['mec_taladro', 'ruido', 'vibracion', 'particulado', 'electrico', 'posturas'],
    herr: ['Taladro para metal', 'Taladro percutor', 'Extensiones eléctricas'], siguiente: ['soporteria', 'soldadura'],
    claves: ['taladr', 'perfor', 'agujero'] },
  { id: 'soporteria', nombre: 'Instalación de soportería anclada',
    desc: 'Ubicación, nivelación y anclaje de soportes mediante taladro y anclajes mecánicos.',
    peligros: ['mec_taladro', 'mec_manual', 'ruido', 'electrico', 'loc_objetos', 'posturas'],
    herr: ['Taladro percutor', 'Niveles', 'Flexómetro'], siguiente: ['tuberia', 'soldadura'],
    claves: ['soporte', 'mensula', 'soporteria'] },
  { id: 'precalentamiento', nombre: 'Precalentamiento con soplete',
    desc: 'Precalentamiento de la zona de la junta con soplete de gas, verificando la temperatura con crayón térmico o pirómetro.',
    peligros: ['tec_gas', 'temperatura', 'vapores', 'tec_caliente'],
    herr: ['Soplete', 'Cilindros de gas', 'Pirómetro', 'Crayón térmico'], siguiente: ['soldadura'],
    claves: ['precalent', 'soplete'] },
  { id: 'oxicorte', nombre: 'Corte con oxicorte',
    desc: 'Corte de material con equipo oxicombustible.',
    peligros: ['tec_gas', 'tec_caliente', 'humos', 'temperatura', 'rad_soldadura'],
    herr: ['Equipo de oxicorte', 'Cilindros de gas', 'Extintor multipropósito'], siguiente: ['desbaste', 'soldadura'],
    claves: ['oxicorte'] },
  { id: 'soldadura', nombre: 'Soldadura (SMAW, GTAW o GMAW)',
    desc: 'Personal soldador calificado ejecuta la soldadura aplicando los parámetros del procedimiento (WPS): amperaje, voltaje, velocidad de avance y temperatura entre pasadas.',
    peligros: ['tec_caliente', 'rad_soldadura', 'humos', 'electrico_sold', 'temperatura', 'posturas'],
    herr: ['Equipo de soldar SMAW', 'Equipo de soldar TIG', 'Extintor multipropósito', 'Manta ignífuga'], siguiente: ['desbaste', 'tintas', 'pintura'],
    claves: ['sold', 'smaw', 'gtaw', 'gmaw', 'tig', 'mig'] },
  { id: 'fabricacion', nombre: 'Fabricación metalmecánica en taller (corte, perforación, pulido, soldadura)',
    desc: 'Trabajo en caliente: trazado, corte, perforaciones, pulido, brillado y soldadura. Limpieza con trabajo químico y procesos abrasivos.',
    peligros: ['loc', 'cargas', 'posturas', 'tec_caliente', 'mec_manual', 'mec_rotativa', 'ruido', 'electrico', 'humos', 'particulado', 'biologico', 'natural'],
    herr: ['Pulidoras', 'Equipo de soldar SMAW', 'Taladro para metal', 'Extensiones eléctricas', 'Prensas mordazas'], siguiente: ['pintura', 'presion', 'orden'],
    claves: ['fabricacion', 'fabricar', 'taller', 'skid', 'tanque', 'recipiente', 'plataforma', 'guarda', 'bandeja', 'escalera', 'manifold', 'caja'] },
  { id: 'tuberia', nombre: 'Montaje de tubería',
    desc: 'Presentación, alineación y fijación de tramos de tubería sobre la soportería instalada, para su posterior soldadura o acople.',
    peligros: ['cargas', 'mec_manual', 'loc_objetos', 'posturas', 'loc'],
    herr: ['Llaves mixtas', 'Niveles', 'Flexómetro'], siguiente: ['soldadura', 'presion'],
    claves: ['tuberia', 'tubo', 'ruteo', 'linea'] },
  { id: 'tornilleria', nombre: 'Sustitución de tornillería y aplicación de torque',
    desc: 'Retiro de la tornillería antigua y reemplazo por tornillos, tuercas y arandelas nuevos, aplicando el torque técnico con herramientas manuales.',
    peligros: ['mec_manual', 'posturas', 'loc'],
    herr: ['Llaves mixtas', 'Ratches'], siguiente: ['inspeccion_visual'],
    claves: ['tornill', 'torque', 'perno', 'tuerca'] },
  { id: 'inspeccion_visual', nombre: 'Inspección visual y control de calidad',
    desc: 'Verificación visual y técnica de la reparación (cordones de soldadura, torque, estado del metal base), con registro fotográfico.',
    peligros: ['posturas', 'temperatura', 'iluminacion', 'loc'],
    herr: ['Pirómetro'], siguiente: ['tintas', 'desmontaje_andamio', 'orden'],
    claves: ['inspeccion visual', 'control de calidad', 'verificacion', 'localizar'] },
  { id: 'tintas', nombre: 'Ensayo de tintas penetrantes (END)',
    desc: 'Limpieza de la superficie, aplicación del penetrante, tiempo de penetración, limpieza del exceso y aplicación del revelador para verificar ausencia de fisuras y discontinuidades.',
    peligros: ['vapores', 'quimico_piel', 'tec_inflamable', 'temperatura', 'posturas', 'loc_derrame'],
    herr: ['Tintas penetrantes', 'Pirómetro'], siguiente: ['soldadura', 'presion', 'orden'],
    claves: ['tinta', 'penetrante', 'ensayo no destructivo', 'ensayos no destructivos'] },
  { id: 'pintura', nombre: 'Aplicación de pintura o recubrimiento',
    desc: 'Preparación de superficie y aplicación de pintura o recubrimiento de protección.',
    peligros: ['vapores', 'quimico_piel', 'tec_inflamable', 'posturas', 'loc_derrame'],
    siguiente: ['orden'], claves: ['pintur', 'recubrim', 'anticorros'] },
  { id: 'quimico', nombre: 'Limpieza química, decapado o pasivado',
    desc: 'Limpieza de piezas con productos químicos (desengrasantes, decapantes o pasivantes) según la ficha de seguridad.',
    peligros: ['quimico_piel', 'vapores', 'loc_derrame', 'posturas'],
    siguiente: ['orden'], claves: ['decapad', 'pasivad', 'limpieza quimica', 'desengras'] },
  { id: 'presion', nombre: 'Prueba de presión (neumática o hidrostática)',
    desc: 'Presurización gradual del equipo o línea con aire, nitrógeno o agua hasta la presión de prueba, verificando estanqueidad y ausencia de fugas.',
    peligros: ['tec_presion', 'ruido', 'loc', 'loc_derrame'],
    herr: ['Manómetro'], siguiente: ['orden'], claves: ['prueba', 'presion', 'presuriz', 'neumatic', 'hidrostat'] },
  { id: 'confinado', nombre: 'Ingreso y trabajo en espacio confinado',
    desc: 'Medición de atmósfera, ventilación, ingreso con vigía en la entrada y ejecución de la tarea dentro del espacio confinado.',
    peligros: ['confinados', 'posturas', 'temperatura', 'iluminacion', 'psicosocial'],
    herr: ['Medidor de atmósferas (multigás)', 'Extractor de aire'], siguiente: ['soldadura', 'desbaste', 'inspeccion_visual'],
    claves: ['confinad', 'interior del tanque', 'dentro del tanque', 'manhole'] },
  { id: 'desmontaje_andamio', nombre: 'Desmontaje de andamio y sistemas de protección contra caídas',
    desc: 'Desmontaje seguro, ordenado y en secuencia inversa de la línea de vida, los conectores de anclaje y el andamio, módulo por módulo.',
    peligros: ['alturas', 'loc_objetos', 'mec_manual', 'cargas', 'loc'],
    herr: ['EPCC completo', 'Llaves mixtas'], siguiente: ['orden'], claves: ['desmontaje de andamio', 'desarme de andamio'] },
  { id: 'mantenimiento', nombre: 'Mantenimiento interno de bodega',
    desc: 'Arreglo y adecuación de cajones portaherramientas, mesas de trabajo, escaleras, carros porta cilindros, carpas y activos en general.',
    peligros: ['loc', 'cargas', 'posturas', 'tec_caliente', 'mec_manual', 'ruido', 'electrico', 'particulado'],
    siguiente: ['orden'], claves: ['mantenimiento', 'adecuacion', 'arreglo', 'reparacion de activos'] },
  { id: 'orden', nombre: 'Orden y aseo', fin: true,
    desc: 'Retiro de residuos (virutas, restos de soldadura, empaques), limpieza del área, recolección y almacenamiento de herramientas verificando su estado, y retiro de la señalización una vez el área sea segura.',
    peligros: ['loc', 'cargas', 'posturas', 'biologico', 'natural'],
    claves: ['orden', 'aseo', 'limpieza', '5s'] }
];

/* Controles de la tarea especial "Plan de rescate" (sus ATS la incluyen como
   una fila más, con pasos de atención en vez de controles de prevención). */
const PLAN_RESCATE = {
  nombre: 'Plan de rescate: alturas, trabajo en caliente, piso y otros',
  pasos: [
    'Informar al jefe inmediato y a SST',
    'Evaluar la situación: verificar si la persona está consciente, respira y tiene pulso',
    'Llamar a emergencias (línea 123) si es necesario',
    'Mantener la calma y tranquilizar a la persona afectada',
    'Evaluar lesiones: heridas, fracturas, quemaduras',
    'Aplicar RCP si la persona no respira o no tiene pulso (solo personal capacitado)',
    'Controlar sangrados con presión directa',
    'Inmovilizar extremidades lesionadas',
    'Esperar la ayuda y seguir sus instrucciones',
    'Traslado a centro médico',
    'Registrar el incidente y analizarlo para prevenir que se repita'
  ]
};

/* ============================================================
   CONDICIONES DE LA TAREA — atajos que agregan de una vez los peligros de
   una condición ("esta tarea se hace en altura"). Si el encabezado del ATS
   ya marca el permiso correspondiente, la condición se resalta.
   ============================================================ */
const CONDICIONES = [
  { id: 'altura', nombre: 'En altura', peligros: ['alturas', 'loc_objetos'], permiso: 'alturas' },
  { id: 'caliente', nombre: 'En caliente', peligros: ['tec_caliente'], permiso: 'caliente' },
  { id: 'confinado', nombre: 'Espacio confinado', peligros: ['confinados'], permiso: 'confinados' },
  { id: 'izaje', nombre: 'Con izaje de cargas', peligros: ['mec_izaje'], permiso: 'izaje' },
  { id: 'electrica', nombre: 'Herramienta eléctrica', peligros: ['electrico', 'ruido'] },
  { id: 'energias', nombre: 'Líneas energizadas o a presión', peligros: ['energia'], permiso: 'electrico' },
  { id: 'quimicos', nombre: 'Con químicos', peligros: ['vapores', 'quimico_piel'] },
  { id: 'intemperie', nombre: 'A la intemperie', peligros: ['rad_solar', 'natural'] },
  { id: 'vehiculos', nombre: 'Cerca de vehículos o montacargas', peligros: ['transito'] }
];
