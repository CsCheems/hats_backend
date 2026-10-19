-- 09 · Semilla de los catálogos de producto.
--
-- La taxonomía con la que se administra y se filtra la tienda. Las marcas no
-- están aquí: son ficticias, igual que los artículos, y viven en la semilla de
-- desarrollo (91).
--
-- Se puede correr más de una vez sin duplicar nada.

begin;

-- El prefijo es la mitad del SKU y el orden es el del menú: las botas primero,
-- porque son lo que se viene a comprar.
insert into public.categorias (slug, nombre, prefijo, orden)
values
  ('botas',      'Botas',                   'BOT', 1),
  ('sombreros',  'Sombreros',               'SOM', 2),
  ('cinturones', 'Cinturones',              'CIN', 3),
  ('hebillas',   'Hebillas y espuelas',     'HEB', 4),
  ('monturas',   'Monturas y talabartería', 'MON', 5),
  ('camisas',    'Camisas',                 'CAM', 6),
  ('abrigos',    'Chamarras y abrigos',     'ABR', 7),
  ('denim',      'Denim',                   'DEN', 8),
  ('accesorios', 'Accesorios',              'ACC', 9)
on conflict do nothing;

insert into public.generos (slug, nombre, orden)
values
  ('dama',      'Dama',      1),
  ('caballero', 'Caballero', 2),
  ('unisex',    'Unisex',    3)
on conflict do nothing;

-- La escala X del fieltro. El orden es el del número.
insert into public.fieltros (grado)
values (2), (4), (6), (10), (100), (1000)
on conflict do nothing;

-- Calzado y ropa llevan género.
insert into public.categorias_con_genero (categoria_id)
select id from public.categorias where slug in ('botas', 'camisas', 'abrigos', 'denim')
on conflict do nothing;

-- Solo los sombreros admiten fieltro, y dentro de ellos es opcional: la palma y
-- la lana no se miden en X.
insert into public.categorias_con_fieltro (categoria_id)
select id from public.categorias where slug = 'sombreros'
on conflict do nothing;

commit;
