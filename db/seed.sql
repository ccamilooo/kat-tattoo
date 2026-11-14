-- ============================================================
--  KAT TATTOO STUDIO - DATOS INICIALES (SEED)
--  Equipo real, servicios y galería oficiales del estudio.
--  Los IDs (ART-, SVC-, GAL-, CLI-, APT-) los genera el trigger.
-- ============================================================

-- ARTISTAS
INSERT INTO artists (name, specialty, bio, image_url, instagram) VALUES
(
    'Nataly Arguello',
    'Artista Plástica & Tatuadora',
    'Tatuadora con 10 años de trayectoria y artista plástica con 5 años de experiencia, es cofundadora y propietaria de Kat Tattoo junto a Pedro García. Especializada en Neotradicional, Fine Line, Full Color y Blackwork, su propuesta integra la sensibilidad de las artes plásticas para crear diseños 100% originales creados desde cero. Su enfoque se caracteriza por una sólida lectura del cuerpo, logrando piezas únicas de alta expresividad y trazo preciso que fluyen orgánicamente con la anatomía y el movimiento de cada persona.',
    '/Imagenes/Artistas/nataly.jpg',
    NULL
),
(
    'Pedro García',
    'Artista Plástico & Tatuador',
    'Artista plástico con más de 12 años de trayectoria en la pintura en gran formato (óleo y acrílico) y 6 años de experiencia como tatuador profesional. Cofundador y propietario del estudio Kat Tattoo junto a Nataly Arguello. Especializado en Surrealismo en las modalidades de Full Color y Black & Grey. Su propuesta se distingue por la creación de diseños de autor 100% personalizados desde cero, caracterizados por el dinamismo, la profundidad visual y una integración precisa con la anatomía y el movimiento natural del cuerpo.',
    '/Imagenes/Artistas/pedro.jpg',
    NULL
),
(
    'Elsy Arias',
    'Body Piercer Profesional',
    'Perforadora corporal profesional con 8 años de experiencia y formación constante en seminarios especializados. Su trabajo combina una estricta aplicación de normas de bioseguridad y asepsia con una dedicada asesoría anatómica personalizada, guiando a cada persona hacia las perforaciones que mejor se adaptan a su cuerpo para garantizar procesos seguros, excelente cicatrización y total armonía estética.',
    '/Imagenes/Artistas/elsy.jpg',
    NULL
),
(
    'Sharlot Ramírez',
    'Studio Manager & Atención al Cliente',
    'Encargada de la coordinación de citas, la logística y la atención al cliente en Kat Tattoo. Su trabajo garantiza una agenda organizada, una atención cálida y personalizada desde el primer contacto, y un espacio siempre impecable para que la experiencia de cada cliente sea perfecta de principio a fin.',
    '/Imagenes/Artistas/sharlot.jpg',
    NULL
);

-- SERVICIOS
INSERT INTO services (name, description, base_price, duration_minutes, image_url, display_order) VALUES
('Blackwork',   'Diseños realizados principalmente con tinta negra, caracterizados por contrastes marcados, líneas definidas y composiciones de gran impacto visual.', 400000.00, 180, '/Imagenes/servicios/black.png', 1),
('Color',       'Tatuajes llenos de color y personalidad, utilizando diferentes tonalidades para crear composiciones llamativas y llenas de vida.', 500000.00, 240, '/Imagenes/servicios/color.png', 2),
('Minimalista', 'Diseños realizados con líneas finas y delicadas, ideales para composiciones minimalistas que requieren precisión y atención al detalle.', 200000.00, 120, '/Imagenes/servicios/minimalista.png', 3),
('Piercing',    'Servicios de piercing enfocados en la expresión personal y estética, realizados con cuidado y atención durante cada procedimiento.', 80000.00, 30, '/Imagenes/servicios/piercing.png', 4),
('Pinturas',    'Obras realizadas por los artistas de KAT Tattoo Studio, donde exploran diferentes técnicas y estilos para expresar su creatividad más allá del tatuaje.', 350000.00, 90, '/Imagenes/servicios/pintura.png', 5);

-- GALERÍA (asigna cada tatuaje a Nataly o Pedro)
INSERT INTO gallery (title, category, description, image_url, price_from, artist_id, is_featured) VALUES
('Geisha',            'Blackwork', 'Blackwork tradicional japonés.',            '/Imagenes/tattoo1.jpg', 300.00, (SELECT id FROM artists WHERE name = 'Nataly Arguello'), TRUE),
('Estilo Anime',      'Anime',     'Diseño en parejas inspirado en anime.',     '/Imagenes/tattoo2.jpg', 250.00, (SELECT id FROM artists WHERE name = 'Nataly Arguello'), FALSE),
('Pez Koi',           'Blackwork', 'Koi negro con olas tradicionales.',         '/Imagenes/tattoo3.jpg', 400.00, (SELECT id FROM artists WHERE name = 'Nataly Arguello'), TRUE),
('Diseño delicado',   'Fine Line', 'Trazo fino y detallado.',                   '/Imagenes/tattoo4.jpg', 180.00, (SELECT id FROM artists WHERE name = 'Nataly Arguello'), FALSE),
('Lagarto realista',  'Realista',  'Realismo en escala de grises.',             '/Imagenes/tattoo5.jpg', 320.00, (SELECT id FROM artists WHERE name = 'Pedro García'),   FALSE),
('Calavera',          'Blackwork', 'Ilustración blackwork.',                    '/Imagenes/tattoo6.jpg', 280.00, (SELECT id FROM artists WHERE name = 'Pedro García'),   FALSE),
('Flor minimalista',  'Fine Line', 'Flor a línea fina.',                        '/Imagenes/tattoo7.jpg', 150.00, (SELECT id FROM artists WHERE name = 'Nataly Arguello'), TRUE),
('Diseño en parejas', 'Color',     'Pareja de mariposas a color.',              '/Imagenes/tattoo8.jpg', 350.00, (SELECT id FROM artists WHERE name = 'Pedro García'),   FALSE);

-- CLIENTE DE EJEMPLO
INSERT INTO clients (name, email, phone) VALUES
('Cliente Demo', 'demo@kattattoo.com', '+57 304 524 2783');

-- CITA DE EJEMPLO
INSERT INTO appointments (client_id, service_id, artist_id, appointment_date, status, notes)
SELECT
    (SELECT id FROM clients WHERE email = 'demo@kattattoo.com'),
    (SELECT id FROM services WHERE name = 'Blackwork'),
    (SELECT id FROM artists  WHERE name = 'Nataly Arguello'),
    NOW() + INTERVAL '7 days',
    'pending',
    'Ejemplo de cita generada por el seed.'
WHERE NOT EXISTS (SELECT 1 FROM appointments);
