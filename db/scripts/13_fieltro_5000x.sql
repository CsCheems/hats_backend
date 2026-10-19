-- 13 · Fieltro 5000X: un grado más en la escala y un sombrero que lo use.
--
-- La escala X vive en `fieltros` (solo el grado; «5000x» se deriva). El menú
-- «Fieltro» del navbar, las casillas del catálogo y el select del panel salen de
-- esa tabla, así que insertar el grado basta para que aparezca en los tres.
--
-- El sombrero de muestra evita que la entrada del menú lleve a un catálogo
-- vacío. Se puede correr más de una vez: lo que ya existe se salta.

begin;

insert into public.fieltros (grado)
values (5000)
on conflict do nothing;

insert into public.productos
  (slug, categoria_id, marca_id, folio, titulo, descripcion, precio, stock,
   publicado, en_portada, creado_en, actualizado_en)
select
  'fieltro-patriarca', c.id, m.id, 9, 'Fieltro 5000X «Patriarca»',
  'Castor 5000X, forro de seda, armado a mano.', 38500, 2,
  true, false,
  timestamptz '2026-10-19 12:00 America/Monterrey',
  timestamptz '2026-10-19 12:00 America/Monterrey'
from public.categorias c
cross join public.marcas m
where c.slug = 'fieltro' and m.slug = 'nicol-hats'
on conflict do nothing;

insert into public.productos_fieltro (producto_id, categoria_id, fieltro_id)
select p.id, p.categoria_id, f.id
from public.productos p
join public.fieltros f on f.grado = 5000
where p.slug = 'fieltro-patriarca'
on conflict do nothing;

commit;
