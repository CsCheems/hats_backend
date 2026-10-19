-- 91 · Artículos de maqueta. SOLO DESARROLLO — no correr en producción.
--
-- GENERADO a partir de backend/mock/catalog.js (ya retirado) el día que el
-- inventario se mudó a Supabase. Las marcas, los títulos y los precios son
-- ficticios, igual que en aquel archivo. Los doce `en_portada` conservan el mismo
-- slug que frontend/src/data/products.js, que la portada sigue leyendo en local.
--
-- Requiere 06–09. El estado ya no se escribe: «borrador» es publicado = false y
-- «agotado» sale solo de stock = 0, así que los 37 conservan el estado que tenían.
--
-- Se puede correr más de una vez: lo que ya existe se salta.

begin;

-- ─── Marcas ────────────────────────────────────────────────────────────────

insert into public.marcas (slug, nombre, orden)
values
  ('bishop-cole', 'Bishop & Cole', 1),
  ('canon-hats', 'Cañón Hats', 2),
  ('broncoware', 'Broncoware', 3),
  ('ferreria-norte', 'Ferrería del Norte', 4),
  ('sabinal-denim', 'Sabinal Denim', 5),
  ('old-cavalry', 'Old Cavalry', 6)
on conflict do nothing;

-- ─── Qué marca trabaja qué categoría ───────────────────────────────────────
-- Exactamente los pares que aparecen en el inventario.

insert into public.marca_categorias (marca_id, categoria_id)
select m.id, c.id
from (values
  ('bishop-cole', 'botas'),
  ('bishop-cole', 'cinturones'),
  ('bishop-cole', 'abrigos'),
  ('canon-hats', 'sombreros'),
  ('broncoware', 'hebillas'),
  ('broncoware', 'monturas'),
  ('broncoware', 'accesorios'),
  ('ferreria-norte', 'cinturones'),
  ('ferreria-norte', 'hebillas'),
  ('ferreria-norte', 'monturas'),
  ('sabinal-denim', 'camisas'),
  ('sabinal-denim', 'abrigos'),
  ('sabinal-denim', 'denim'),
  ('sabinal-denim', 'accesorios'),
  ('old-cavalry', 'botas'),
  ('old-cavalry', 'sombreros'),
  ('old-cavalry', 'cinturones'),
  ('old-cavalry', 'monturas'),
  ('old-cavalry', 'accesorios')
) as par (marca, categoria)
join public.marcas m on m.slug = par.marca
join public.categorias c on c.slug = par.categoria
on conflict do nothing;

-- ─── Artículos ─────────────────────────────────────────────────────────────
-- Con su folio original, para que el SKU de cada uno siga siendo el mismo.
-- La fecha es la de «actualizado» del mock, a mediodía de Monterrey.

insert into public.productos
  (slug, categoria_id, marca_id, folio, titulo, descripcion, precio, stock,
   publicado, en_portada, creado_en, actualizado_en)
select
  v.slug, c.id, m.id, v.folio, v.titulo, v.descripcion, v.precio, v.stock,
  v.publicado, v.en_portada, v.fecha, v.fecha
from (values
  ('botas-laredo', 'botas', 'bishop-cole', 1, 'Botas camperas «Laredo»',
   'Punta cuadrada, cuero graso, suela cosida.',
   4290, 24, true, true, timestamptz '2026-08-28 12:00 America/Monterrey'),
  ('botas-ropera-nogal', 'botas', 'bishop-cole', 2, 'Bota ropera «Nogal»',
   'Caña alta bordada, tacón cubano, horma estrecha.',
   5180, 11, true, false, timestamptz '2026-08-14 12:00 America/Monterrey'),
  ('botas-avestruz-sonora', 'botas', 'bishop-cole', 3, 'Bota de avestruz «Sonora»',
   'Avestruz de bulbo entero, punta ranchera, suela de cuero.',
   9750, 3, true, false, timestamptz '2026-09-01 12:00 America/Monterrey'),
  ('botas-trabajo-mezquite', 'botas', 'old-cavalry', 4, 'Bota de trabajo «Mezquite»',
   'Casquillo de acero, entresuela antiderrapante, cuero graso.',
   2980, 46, true, false, timestamptz '2026-07-22 12:00 America/Monterrey'),
  ('botines-ranchero', 'botas', 'bishop-cole', 5, 'Botín de elástico «Ranchero»',
   'Elástico lateral, tirador trasero, suela de goma cosida.',
   3640, 0, true, false, timestamptz '2026-08-19 12:00 America/Monterrey'),
  ('fieltro-durango', 'sombreros', 'canon-hats', 1, 'Fieltro 6X «Durango»',
   'Copa cattleman, falda de 4", cinta de crin.',
   3150, 18, true, true, timestamptz '2026-08-30 12:00 America/Monterrey'),
  ('palma-sinaloa', 'sombreros', 'old-cavalry', 2, 'Palma tejida «Sinaloa»',
   'Palma tejida a mano, copa lisa, barbiquejo de cuero.',
   890, 62, true, false, timestamptz '2026-06-30 12:00 America/Monterrey'),
  ('fieltro-4x-chihuahua', 'sombreros', 'canon-hats', 3, 'Fieltro 4X «Chihuahua»',
   'Copa pinchada, falda de 3½", cinta de vaqueta.',
   2240, 9, true, false, timestamptz '2026-08-05 12:00 America/Monterrey'),
  ('texana-monterrey', 'sombreros', 'canon-hats', 4, 'Texana de lana «Monterrey»',
   'Lana prensada, copa cattleman, forro de raso.',
   1470, 5, true, false, timestamptz '2026-09-02 12:00 America/Monterrey'),
  ('palma-jornalero', 'sombreros', 'old-cavalry', 5, 'Palma de faena «Jornalero»',
   'Palma abierta, falda ancha, ventilación en la copa.',
   460, 88, false, false, timestamptz '2026-09-03 12:00 America/Monterrey'),
  ('fieltro-2x-sabinas', 'sombreros', 'canon-hats', 6, 'Fieltro 2X «Sabinas»',
   'Fieltro de lana 2X, copa gus, cinta grosgrain.',
   1180, 27, true, false, timestamptz '2026-09-04 12:00 America/Monterrey'),
  ('fieltro-10x-rancho-viejo', 'sombreros', 'canon-hats', 7, 'Fieltro 10X «Rancho Viejo»',
   'Mezcla de liebre 10X, copa pinchada, falda de 4".',
   5900, 8, true, false, timestamptz '2026-08-18 12:00 America/Monterrey'),
  ('fieltro-100x-presidente', 'sombreros', 'canon-hats', 8, 'Fieltro 100X «Presidente»',
   'Pelo de liebre 100X, forro de seda, cinta trenzada.',
   12400, 3, true, false, timestamptz '2026-07-30 12:00 America/Monterrey'),
  ('fieltro-1000x-herencia', 'sombreros', 'canon-hats', 9, 'Fieltro 1000X «Herencia»',
   'Castor 1000X, armado a mano, toquilla de plata.',
   24800, 1, true, false, timestamptz '2026-09-03 12:00 America/Monterrey'),
  ('cinturon-sierra-alta', 'cinturones', 'ferreria-norte', 1, 'Cinturón labrado «Sierra Alta»',
   'Vaqueta labrada a mano, 38 mm, hebilla intercambiable.',
   1180, 31, true, true, timestamptz '2026-08-27 12:00 America/Monterrey'),
  ('cinturon-piteado-jalisco', 'cinturones', 'ferreria-norte', 2, 'Cinturón piteado «Jalisco»',
   'Piteado a mano en ixtle, 40 mm, hebilla de plata.',
   3890, 7, true, false, timestamptz '2026-07-11 12:00 America/Monterrey'),
  ('cinturon-vaqueta-lisa', 'cinturones', 'bishop-cole', 3, 'Cinturón de vaqueta lisa',
   'Vaqueta de una pieza, 35 mm, hebilla de latón.',
   740, 54, true, false, timestamptz '2026-06-18 12:00 America/Monterrey'),
  ('cinturon-trenzado-bravo', 'cinturones', 'old-cavalry', 4, 'Cinturón trenzado «Bravo»',
   'Ocho tiras trenzadas, 38 mm, punta reforzada.',
   1560, 2, true, false, timestamptz '2026-08-31 12:00 America/Monterrey'),
  ('hebilla-campeon-1892', 'hebillas', 'broncoware', 1, 'Hebilla de latón «Campeón 1892»',
   'Fundida en arena, grabada a buril, folio al reverso.',
   890, 40, true, true, timestamptz '2026-08-21 12:00 America/Monterrey'),
  ('espuelas-vaquero', 'hebillas', 'broncoware', 2, 'Espuelas templadas «Vaquero»',
   'Acero templado, rodaja de 10 puntas, correas de vaqueta.',
   1340, 16, true, true, timestamptz '2026-08-24 12:00 America/Monterrey'),
  ('hebilla-plata-charro', 'hebillas', 'ferreria-norte', 3, 'Hebilla de plata «Charro»',
   'Plata .925 repujada, cantoneras a juego, cierre de gancho.',
   4620, 4, true, false, timestamptz '2026-07-29 12:00 America/Monterrey'),
  ('hebilla-toro-bronce', 'hebillas', 'broncoware', 4, 'Hebilla «Toro de bronce»',
   'Bronce macizo, relieve fundido, base de tres puntas.',
   1180, 23, true, false, timestamptz '2026-06-25 12:00 America/Monterrey'),
  ('chaparreras-coahuila', 'monturas', 'old-cavalry', 1, 'Chaparreras «Coahuila»',
   'Corte batwing, remaches de cobre, ala reforzada.',
   5600, 6, true, true, timestamptz '2026-08-16 12:00 America/Monterrey'),
  ('alforja-camino-real', 'monturas', 'old-cavalry', 2, 'Alforja encerada «Camino Real»',
   'Lona encerada, esquineras de cuero, hebillas de latón.',
   2980, 13, true, true, timestamptz '2026-09-01 12:00 America/Monterrey'),
  ('montura-charra-tapatia', 'monturas', 'ferreria-norte', 3, 'Montura charra «Tapatía»',
   'Fuste de madera forrado, cabeza labrada, teja bordada.',
   28400, 2, true, false, timestamptz '2026-08-09 12:00 America/Monterrey'),
  ('montura-vaquera-rodeo', 'monturas', 'ferreria-norte', 4, 'Montura vaquera «Rodeo»',
   'Fuste reforzado, cuerno alto, bastos de vaqueta.',
   19800, 1, true, false, timestamptz '2026-07-04 12:00 America/Monterrey'),
  ('freno-grabado-nogal', 'monturas', 'broncoware', 5, 'Freno grabado «Nogal»',
   'Acero grabado a mano, cañones dulces, riendas de crin.',
   3260, 8, false, false, timestamptz '2026-09-03 12:00 America/Monterrey'),
  ('camisa-mezquite', 'camisas', 'sabinal-denim', 1, 'Camisa vaquera «Mezquite»',
   'Broche de presión, canesú en punta, sarga lavada.',
   980, 72, true, true, timestamptz '2026-08-26 12:00 America/Monterrey'),
  ('camisa-cuadros-arroyo', 'camisas', 'sabinal-denim', 2, 'Camisa de cuadros «Arroyo»',
   'Cuadros teñidos en hilo, canesú recto, algodón cepillado.',
   860, 35, true, false, timestamptz '2026-07-17 12:00 America/Monterrey'),
  ('chaqueta-bisonte', 'abrigos', 'bishop-cole', 1, 'Chaqueta de gamuza «Bisonte»',
   'Flecos en la espalda, forro de manta, ante ámbar.',
   6740, 5, true, true, timestamptz '2026-08-12 12:00 America/Monterrey'),
  ('chamarra-borrego-invierno', 'abrigos', 'sabinal-denim', 2, 'Chamarra de borrego «Invernada»',
   'Forro de borrego, cuello de pana, botonadura metálica.',
   4180, 0, true, false, timestamptz '2026-06-12 12:00 America/Monterrey'),
  ('vaqueros-canon-14oz', 'denim', 'sabinal-denim', 1, 'Vaqueros rectos «Cañón 14 oz»',
   'Mezclilla de telar angosto, corte para bota, crudo.',
   1590, 48, true, true, timestamptz '2026-08-29 12:00 America/Monterrey'),
  ('guantes-herradura', 'accesorios', 'old-cavalry', 1, 'Guantes de faena «Herradura»',
   'Piel de venado, costura interior, puño elástico.',
   620, 58, true, true, timestamptz '2026-08-23 12:00 America/Monterrey'),
  ('paliacate-polvo-rojo', 'accesorios', 'sabinal-denim', 2, 'Paliacate «Polvo Rojo»',
   'Algodón teñido en rama, 55 cm, dobladillo cosido.',
   240, 140, true, true, timestamptz '2026-08-20 12:00 America/Monterrey'),
  ('funda-lazo-crin', 'accesorios', 'old-cavalry', 3, 'Funda de lazo en crin',
   'Crin trenzada, boca reforzada, correa ajustable.',
   980, 12, true, false, timestamptz '2026-07-08 12:00 America/Monterrey'),
  ('bolsa-tabaco-vaqueta', 'accesorios', 'old-cavalry', 4, 'Bolsa de tabaco en vaqueta',
   'Vaqueta curtida al vegetal, jareta de tiento, forro de manta.',
   380, 27, true, false, timestamptz '2026-06-05 12:00 America/Monterrey'),
  ('llavero-herradura-laton', 'accesorios', 'broncoware', 5, 'Llavero de herradura en latón',
   'Latón pulido, herradura miniatura, argolla soldada.',
   150, 4, true, false, timestamptz '2026-09-02 12:00 America/Monterrey')
) as v (slug, categoria, marca, folio, titulo, descripcion, precio, stock, publicado, en_portada, fecha)
join public.categorias c on c.slug = v.categoria
join public.marcas m on m.slug = v.marca
on conflict do nothing;

-- ─── Género ────────────────────────────────────────────────────────────────

insert into public.productos_genero (producto_id, categoria_id, genero_id)
select p.id, p.categoria_id, g.id
from (values
  ('botas-laredo', 'caballero'),
  ('botas-ropera-nogal', 'dama'),
  ('botas-avestruz-sonora', 'caballero'),
  ('botas-trabajo-mezquite', 'caballero'),
  ('botines-ranchero', 'dama'),
  ('camisa-mezquite', 'caballero'),
  ('camisa-cuadros-arroyo', 'dama'),
  ('chaqueta-bisonte', 'caballero'),
  ('chamarra-borrego-invierno', 'dama'),
  ('vaqueros-canon-14oz', 'unisex')
) as v (slug, genero)
join public.productos p on p.slug = v.slug
join public.generos g on g.slug = v.genero
on conflict do nothing;

-- ─── Fieltro ───────────────────────────────────────────────────────────────

insert into public.productos_fieltro (producto_id, categoria_id, fieltro_id)
select p.id, p.categoria_id, f.id
from (values
  ('fieltro-durango', 6),
  ('fieltro-4x-chihuahua', 4),
  ('fieltro-2x-sabinas', 2),
  ('fieltro-10x-rancho-viejo', 10),
  ('fieltro-100x-presidente', 100),
  ('fieltro-1000x-herencia', 1000)
) as v (slug, grado)
join public.productos p on p.slug = v.slug
join public.fieltros f on f.grado = v.grado
on conflict do nothing;

commit;
