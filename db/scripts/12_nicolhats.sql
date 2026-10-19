-- 12 · Adaptación de la base a Nicol Hats: una sola marca, solo sombreros.
--
-- Se corre UNA vez sobre la base que dejaron 01–11 y 90–91 (la de Rincón del
-- Oeste), con el respaldo de backup/ ya hecho. Lo que cambia:
--
--   · el inventario de Rincón del Oeste se vacía y se siembra el de sombreros;
--   · las seis marcas se sustituyen por una, y las nueve categorías por cuatro
--     (palma, lona, fieltro, infantil);
--   · el SKU pasa de RDO-… a NHT-… (es lo único derivado que llevaba el nombre
--     de la tienda, y vive en la vista `inventario`).
--
-- El modelo no se toca. «Una sola marca» sigue siendo un dato en `marcas`, no un
-- cambio de esquema: así la tienda no pierde nada si algún día vende dos.
-- Las cuentas (auth.users, perfiles, direcciones) y los países no se tocan.
--
-- Todo en una transacción: o queda la tienda nueva, o la base sigue como estaba.

begin;

-- ─── 1 · Vaciar el inventario ──────────────────────────────────────────────
-- En orden de dependencia. Se borra de verdad porque estos artículos son de
-- maqueta; en producción los productos se archivan (no hay delete para el panel).

delete from public.producto_imagenes;
delete from public.productos_genero;
delete from public.productos_fieltro;
delete from public.productos;

-- ─── 2 · Vaciar los catálogos de Rincón del Oeste ──────────────────────────

delete from public.marca_categorias;
delete from public.marcas;
delete from public.categorias_con_genero;
delete from public.categorias_con_fieltro;
delete from public.categorias;

-- ─── 3 · SKU de Nicol Hats ─────────────────────────────────────────────────
-- Misma vista y mismas columnas que en 08; solo cambia el prefijo del SKU, así
-- que `create or replace` conserva los grants y el security_invoker.

create or replace view public.inventario
with (security_invoker = true)
as
select
  p.slug,
  'NHT-' || c.prefijo || '-' || lpad(p.folio::text, 3, '0') as sku,
  p.folio,
  c.slug                                                  as categoria,
  p.titulo,
  p.descripcion,
  p.precio,
  m.slug                                                  as marca,
  g.slug                                                  as genero,
  f.grado::text || 'x'                                    as fieltro,
  p.stock,
  case
    when not p.publicado then 'borrador'
    when p.stock = 0     then 'agotado'
    else 'activo'
  end                                                     as estado,
  p.publicado,
  p.en_portada,
  (p.actualizado_en at time zone 'America/Monterrey')::date as actualizado,
  p.archivado_en is not null                              as archivado,
  (select i.ruta
     from public.producto_imagenes i
    where i.producto_id = p.id
    order by i.orden
    limit 1)                                              as foto_ruta,
  c.orden                                                 as categoria_orden
from public.productos p
join public.categorias c        on c.id = p.categoria_id
join public.marcas m            on m.id = p.marca_id
left join public.productos_genero pg  on pg.producto_id = p.id
left join public.generos g            on g.id = pg.genero_id
left join public.productos_fieltro pf on pf.producto_id = p.id
left join public.fieltros f           on f.id = pf.fieltro_id;

-- ─── 4 · Categorías, marca y qué hace la marca ─────────────────────────────

insert into public.categorias (slug, nombre, prefijo, orden)
values
  ('palma',    'Palma',    'PAL', 1),
  ('lona',     'Lona',     'LON', 2),
  ('fieltro',  'Fieltro',   'FIE', 3),
  ('infantil', 'Infantil', 'INF', 4);

-- Ningún sombrero lleva género; solo el fieltro admite grado (la palma y la lona
-- no se miden en X).
insert into public.categorias_con_fieltro (categoria_id)
select id from public.categorias where slug = 'fieltro';

insert into public.marcas (slug, nombre, orden)
values ('nicol-hats', 'Nicol Hats', 1);

insert into public.marca_categorias (marca_id, categoria_id)
select m.id, c.id from public.marcas m cross join public.categorias c;

-- ─── 5 · Artículos de maqueta (30) ─────────────────────────────────────────
-- Nombres, descripciones y precios ficticios. Los doce `en_portada` son los que
-- la portada leerá cuando deje de tener los suyos en local.

insert into public.productos
  (slug, categoria_id, marca_id, folio, titulo, descripcion, precio, stock,
   publicado, en_portada, creado_en, actualizado_en)
select
  v.slug, c.id, m.id, v.folio, v.titulo, v.descripcion, v.precio, v.stock,
  v.publicado, v.en_portada, v.fecha, v.fecha
from (values
  -- Palma
  ('palma-laredo',     'palma', 1, 'Palma «Laredo»',          'Copa alta, ala firme y cintillo negro.',                1290, 24, true,  true,  timestamptz '2026-10-01 12:00 America/Monterrey'),
  ('palma-durango',    'palma', 2, 'Palma «Durango»',         'Ala de 3½", tejido natural, ventilación en la copa.',   1150, 31, true,  true,  timestamptz '2026-10-02 12:00 America/Monterrey'),
  ('palma-sinaloa',    'palma', 3, 'Palma «Sinaloa»',         'Tejido cerrado, copa lisa, barbiquejo de cuero.',       1090, 18, true,  true,  timestamptz '2026-09-28 12:00 America/Monterrey'),
  ('palma-tampico',    'palma', 4, 'Palma «Tampico»',         'Ala ancha para el sol de todo el día.',                  980, 40, true,  false, timestamptz '2026-09-20 12:00 America/Monterrey'),
  ('palma-jornalero',  'palma', 5, 'Palma de faena «Jornalero»', 'Palma abierta, ala ancha, uso diario.',               640, 62, true,  false, timestamptz '2026-09-12 12:00 America/Monterrey'),
  ('palma-cosecha',    'palma', 6, 'Palma «Cosecha»',         'Palma clara, copa media, cinta de gros.',                890, 22, true,  false, timestamptz '2026-09-05 12:00 America/Monterrey'),
  ('palma-matamoros',  'palma', 7, 'Palma «Matamoros»',       'Ala recta, copa cattleman, acabado natural.',           1240,  0, true,  false, timestamptz '2026-08-30 12:00 America/Monterrey'),
  ('palma-del-valle',  'palma', 8, 'Palma «Del Valle»',       'Edición de temporada, aún sin publicar.',               1350,  9, false, false, timestamptz '2026-10-05 12:00 America/Monterrey'),
  -- Lona
  ('lona-reynosa',     'lona', 1, 'Lona «Reynosa»',           'Lona reforzada, ala firme, uso diario.',                  980, 36, true,  true,  timestamptz '2026-10-01 12:00 America/Monterrey'),
  ('lona-cadereyta',   'lona', 2, 'Lona «Cadereyta»',         'Copa media y ala firme.',                                1050, 28, true,  true,  timestamptz '2026-09-29 12:00 America/Monterrey'),
  ('lona-nogales',     'lona', 3, 'Lona «Nogales»',           'Lona encerada, resiste la lluvia ligera.',               1120, 14, true,  true,  timestamptz '2026-09-24 12:00 America/Monterrey'),
  ('lona-ojinaga',     'lona', 4, 'Lona «Ojinaga»',           'Copa baja, ala corta, forro de algodón.',                 890, 33, true,  false, timestamptz '2026-09-15 12:00 America/Monterrey'),
  ('lona-camargo',     'lona', 5, 'Lona «Camargo»',           'Cintillo trenzado y copa media.',                         940, 21, true,  false, timestamptz '2026-09-08 12:00 America/Monterrey'),
  ('lona-sabinas',     'lona', 6, 'Lona «Sabinas»',           'Color arena, ala de 3".',                                 920, 47, true,  false, timestamptz '2026-09-01 12:00 America/Monterrey'),
  ('lona-hidalgo',     'lona', 7, 'Lona «Hidalgo»',           'Lona gruesa de trabajo, ala ancha.',                     1060,  8, true,  false, timestamptz '2026-08-26 12:00 America/Monterrey'),
  ('lona-cerralvo',    'lona', 8, 'Lona «Cerralvo»',          'Edición negra con cintillo gris, aún sin publicar.',     1180, 12, false, false, timestamptz '2026-10-05 12:00 America/Monterrey'),
  -- Fieltro
  ('fieltro-monterrey','fieltro', 1, 'Fieltro 6X «Monterrey»',     'Castor, ala recta, forro de raso.',                3490, 18, true,  true,  timestamptz '2026-10-02 12:00 America/Monterrey'),
  ('fieltro-saltillo', 'fieltro', 2, 'Fieltro 10X «Saltillo»',     'Acabado mate, copa pinchada, falda de 4".',        5200,  8, true,  true,  timestamptz '2026-09-30 12:00 America/Monterrey'),
  ('fieltro-chihuahua','fieltro', 3, 'Fieltro 4X «Chihuahua»',     'Copa pinchada, falda de 3½", cinta de vaqueta.',   2240,  9, true,  true,  timestamptz '2026-09-22 12:00 America/Monterrey'),
  ('fieltro-parras',   'fieltro', 4, 'Fieltro 2X «Parras»',        'Fieltro de lana 2X, copa gus, cinta grosgrain.',   1180, 27, true,  false, timestamptz '2026-09-14 12:00 America/Monterrey'),
  ('fieltro-presidente','fieltro', 5, 'Fieltro 100X «Presidente»', 'Pelo de liebre 100X, forro de seda, cinta trenzada.', 12400, 3, true, false, timestamptz '2026-09-03 12:00 America/Monterrey'),
  ('fieltro-herencia', 'fieltro', 6, 'Fieltro 1000X «Herencia»',   'Castor 1000X, armado a mano, toquilla de plata.',  24800,  1, true,  false, timestamptz '2026-08-28 12:00 America/Monterrey'),
  ('fieltro-rancho-viejo','fieltro', 7, 'Fieltro 10X «Rancho Viejo»', 'Mezcla de liebre 10X, copa pinchada, falda de 4".', 5900, 6, true, false, timestamptz '2026-08-20 12:00 America/Monterrey'),
  ('fieltro-coahuila', 'fieltro', 8, 'Fieltro 6X «Coahuila»',      'Castor 6X, copa cattleman, cinta de crin.',        3280,  0, true,  false, timestamptz '2026-08-12 12:00 America/Monterrey'),
  -- Infantil
  ('infantil-potrillo','infantil', 1, 'Palma infantil «Potrillo»', 'Ajuste interior y ala corta.',                      690, 30, true,  true,  timestamptz '2026-10-01 12:00 America/Monterrey'),
  ('infantil-chamaco', 'infantil', 2, 'Lona infantil «Chamaco»',   'Ala corta y barbiquejo elástico.',                  720, 25, true,  true,  timestamptz '2026-09-27 12:00 America/Monterrey'),
  ('infantil-vaquerito','infantil', 3, 'Palma infantil «Vaquerito»', 'Cintillo negro y copa baja.',                      650, 19, true,  true,  timestamptz '2026-09-18 12:00 America/Monterrey'),
  ('infantil-becerro', 'infantil', 4, 'Lona infantil «Becerro»',   'Para la escuela y el rancho.',                      680, 40, true,  false, timestamptz '2026-09-10 12:00 America/Monterrey'),
  ('infantil-charrito','infantil', 5, 'Lana infantil «Charrito»',  'Lana suave, ala de 2½", cinta de grosgrain.',      1190, 11, true,  false, timestamptz '2026-09-02 12:00 America/Monterrey'),
  ('infantil-recluta', 'infantil', 6, 'Palma infantil «Recluta»',  'Primera talla, copa lisa.',                         590,  0, true,  false, timestamptz '2026-08-24 12:00 America/Monterrey')
) as v (slug, categoria, folio, titulo, descripcion, precio, stock, publicado, en_portada, fecha)
join public.categorias c on c.slug = v.categoria
cross join public.marcas m;

insert into public.productos_fieltro (producto_id, categoria_id, fieltro_id)
select p.id, p.categoria_id, f.id
from (values
  ('fieltro-monterrey', 6), ('fieltro-saltillo', 10), ('fieltro-chihuahua', 4),
  ('fieltro-parras', 2), ('fieltro-presidente', 100), ('fieltro-herencia', 1000),
  ('fieltro-rancho-viejo', 10), ('fieltro-coahuila', 6)
) as v (slug, grado)
join public.productos p on p.slug = v.slug
join public.fieltros f on f.grado = v.grado;

commit;
