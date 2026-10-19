-- 08 · Quién ve y quién escribe productos.
--
-- Hay DOS puertas, y ninguna es la tabla:
--
--   · La tienda entra por catalogo_publico(): una función que devuelve solo
--     columnas públicas de lo publicado. Con la publishable key —que es
--     pública por definición— nadie puede leer `stock`, un borrador o un
--     archivado, aunque se salte el backend y le hable a PostgREST directo.
--
--   · El panel entra por la vista `inventario` y por las funciones de
--     escritura, con el JWT de la administradora. Las tablas solo dejan pasar a
--     quien es_admin(), y las funciones corren con los permisos de quien llama,
--     así que no abren nada que RLS no abra ya.
--
-- Borrar un producto no existe: no hay política ni grant de delete sobre
-- `productos`. Se archiva.

begin;

-- ─── RLS: solo administración ──────────────────────────────────────────────

create policy "productos: admin lee" on public.productos
  for select to authenticated using ((select public.es_admin()));
create policy "productos: admin crea" on public.productos
  for insert to authenticated with check ((select public.es_admin()));
create policy "productos: admin edita" on public.productos
  for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy "productos_genero: admin" on public.productos_genero
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy "productos_fieltro: admin" on public.productos_fieltro
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy "producto_imagenes: admin" on public.producto_imagenes
  for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- ─── Grants: qué columnas ──────────────────────────────────────────────────
--
-- `folio`, `creado_en` y `actualizado_en` no se escriben desde la API: los
-- ponen los triggers. `slug` se escribe al crear y nunca más.

revoke all on
  public.productos, public.productos_genero, public.productos_fieltro, public.producto_imagenes
from anon, authenticated;

grant select on public.productos to authenticated;
grant insert (slug, categoria_id, marca_id, titulo, descripcion, precio, stock, publicado, en_portada)
  on public.productos to authenticated;
grant update (categoria_id, marca_id, titulo, descripcion, precio, stock, publicado, en_portada, archivado_en)
  on public.productos to authenticated;

grant select, insert, update, delete on public.productos_genero, public.productos_fieltro
  to authenticated;

grant select, delete on public.producto_imagenes to authenticated;
grant insert (producto_id, ruta, orden) on public.producto_imagenes to authenticated;
grant update (orden) on public.producto_imagenes to authenticated;

-- ─── Vista del panel ───────────────────────────────────────────────────────
--
-- security_invoker: la vista aplica el RLS de QUIEN CONSULTA. Una clienta que
-- la pida ve cero filas; sin esa opción, la vista leería como su dueño y lo
-- enseñaría todo.
--
-- Aquí se derivan las tres cosas que no se guardan: el SKU, el estado y la
-- principal de la galería.

create view public.inventario
with (security_invoker = true)
as
select
  p.slug,
  'RDO-' || c.prefijo || '-' || lpad(p.folio::text, 3, '0') as sku,
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
  -- La fecha tal como se ve en la tienda, no en UTC: a las 20:00 de Monterrey
  -- ya es mañana en Greenwich.
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

revoke all on public.inventario from anon, authenticated;
grant select on public.inventario to authenticated;

-- ─── La puerta de la tienda ────────────────────────────────────────────────
--
-- security definer, a propósito y al revés que la vista: la tienda necesita
-- leer productos sin sesión, y las tablas no dejan. La función es lo que se
-- publica, y lo que devuelve es una lista blanca: ni stock, ni folio, ni
-- fechas, ni borradores, ni archivados. `disponible` viaja resumido en un
-- booleano.

create function public.catalogo_publico()
returns table (
  slug        text,
  categoria   text,
  titulo      text,
  descripcion text,
  precio      numeric,
  marca       text,
  genero      text,
  fieltro     text,
  disponible  boolean,
  foto_ruta   text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.slug,
    c.slug,
    p.titulo,
    p.descripcion,
    p.precio,
    m.slug,
    g.slug,
    f.grado::text || 'x',
    p.stock > 0,
    (select i.ruta
       from public.producto_imagenes i
      where i.producto_id = p.id
      order by i.orden
      limit 1)
  from public.productos p
  join public.categorias c        on c.id = p.categoria_id
  join public.marcas m            on m.id = p.marca_id
  left join public.productos_genero pg  on pg.producto_id = p.id
  left join public.generos g            on g.id = pg.genero_id
  left join public.productos_fieltro pf on pf.producto_id = p.id
  left join public.fieltros f           on f.id = pf.fieltro_id
  where p.publicado
    and p.archivado_en is null
  order by c.orden, p.folio;
$$;

revoke execute on function public.catalogo_publico() from public;
grant execute on function public.catalogo_publico() to anon, authenticated;

-- ─── Escritura ─────────────────────────────────────────────────────────────
--
-- Todas security invoker: corren con el RLS de quien llama, así que para
-- alguien que no administra fallan en la primera escritura. Existen para que
-- cada operación sea UNA transacción —un producto y su género no pueden quedar
-- a medias— y para que el orden de las operaciones sea siempre el que las
-- llaves compuestas necesitan.
--
-- Los errores esperables salen con un mensaje-clave que el backend traduce:
-- 'categoria_desconocida', 'marca_desconocida', 'genero_desconocido',
-- 'fieltro_desconocido', 'producto_no_encontrado', 'slug_ocupado',
-- 'imagen_no_encontrada' y 'galeria_llena'. El backend valida todo eso antes;
-- esto es la última palabra.

-- `p_crear` separa el alta de la edición, y no es redundante con mirar si el
-- slug existe: sin él, un alta cuyo título generara el slug de otro artículo
-- lo sobrescribiría en silencio. Con él, un alta sobre un slug ocupado falla
-- como violación de unicidad (23505) —el backend prueba el siguiente slug— y
-- una edición de un slug que no existe dice que no lo encuentra.
create function public.guardar_producto(
  p_crear       boolean,
  p_slug        text,
  p_titulo      text,
  p_descripcion text,
  p_precio      numeric,
  p_stock       integer,
  p_categoria   text,
  p_marca       text,
  p_genero      text,
  p_fieltro     text,
  p_publicado   boolean,
  p_en_portada  boolean
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_categoria smallint;
  v_marca     smallint;
  v_genero    smallint;
  v_fieltro   smallint;
  v_id        bigint;
begin
  select id into v_categoria from public.categorias where slug = p_categoria;
  if v_categoria is null then
    raise exception 'categoria_desconocida' using errcode = 'P0001';
  end if;

  select id into v_marca from public.marcas where slug = p_marca;
  if v_marca is null then
    raise exception 'marca_desconocida' using errcode = 'P0001';
  end if;

  if p_genero is not null then
    select id into v_genero from public.generos where slug = p_genero;
    if v_genero is null then
      raise exception 'genero_desconocido' using errcode = 'P0001';
    end if;
  end if;

  if p_fieltro is not null then
    select id into v_fieltro from public.fieltros where grado::text || 'x' = p_fieltro;
    if v_fieltro is null then
      raise exception 'fieltro_desconocido' using errcode = 'P0001';
    end if;
  end if;

  select id into v_id from public.productos where slug = p_slug for update;

  if p_crear and v_id is not null then
    raise exception 'slug_ocupado' using errcode = '23505';
  end if;

  if not p_crear and v_id is null then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;

  if p_crear then
    insert into public.productos
      (slug, categoria_id, marca_id, titulo, descripcion, precio, stock, publicado, en_portada)
    values
      (p_slug, v_categoria, v_marca, btrim(p_titulo), btrim(p_descripcion), p_precio, p_stock,
       p_publicado, p_en_portada)
    returning id into v_id;
  else
    -- Primero se quitan los atributos: si el producto cambia a una categoría
    -- sin género, el cascade de la llave compuesta chocaría con una fila que
    -- ya no le corresponde. Se vuelven a poner abajo, si aplican. Quitar el
    -- género de una bota y no volver a ponerlo lo detiene el trigger diferido.
    delete from public.productos_genero where producto_id = v_id;
    delete from public.productos_fieltro where producto_id = v_id;

    update public.productos
       set categoria_id = v_categoria,
           marca_id     = v_marca,
           titulo       = btrim(p_titulo),
           descripcion  = btrim(p_descripcion),
           precio       = p_precio,
           stock        = p_stock,
           publicado    = p_publicado,
           en_portada   = p_en_portada
     where id = v_id;
  end if;

  if v_genero is not null then
    insert into public.productos_genero (producto_id, categoria_id, genero_id)
    values (v_id, v_categoria, v_genero);
  end if;

  if v_fieltro is not null then
    insert into public.productos_fieltro (producto_id, categoria_id, fieltro_id)
    values (v_id, v_categoria, v_fieltro);
  end if;

  return p_slug;
end;
$$;

create function public.archivar_producto(p_slug text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.productos set archivado_en = coalesce(archivado_en, now()) where slug = p_slug;

  if not found then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
end;
$$;

create function public.restaurar_producto(p_slug text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.productos set archivado_en = null where slug = p_slug;

  if not found then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
end;
$$;

-- ─── Galería ───────────────────────────────────────────────────────────────
--
-- Las tres toman el slug además de la imagen: una imagen de otro producto no
-- se puede tocar por equivocarse de URL. Bloquean la fila del producto para
-- que dos subidas simultáneas no calculen la misma posición.

create function public.agregar_imagen(p_slug text, p_ruta text)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_producto bigint;
  v_total    integer;
  v_imagen   bigint;
begin
  select id into v_producto from public.productos where slug = p_slug for update;
  if v_producto is null then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;

  select count(*) into v_total from public.producto_imagenes where producto_id = v_producto;
  if v_total >= 8 then
    raise exception 'galeria_llena' using errcode = 'P0001';
  end if;

  insert into public.producto_imagenes (producto_id, ruta, orden)
  values (v_producto, p_ruta, v_total + 1)
  returning id into v_imagen;

  return v_imagen;
end;
$$;

-- Devuelve la ruta para que el backend borre el objeto del bucket DESPUÉS de
-- confirmar que la fila ya no está.
create function public.quitar_imagen(p_slug text, p_imagen bigint)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_producto bigint;
  v_orden    smallint;
  v_ruta     text;
begin
  select id into v_producto from public.productos where slug = p_slug for update;

  select i.orden, i.ruta into v_orden, v_ruta
    from public.producto_imagenes i
   where i.id = p_imagen and i.producto_id = v_producto;

  if v_ruta is null then
    raise exception 'imagen_no_encontrada' using errcode = 'P0002';
  end if;

  delete from public.producto_imagenes where id = p_imagen;

  update public.producto_imagenes
     set orden = orden - 1
   where producto_id = v_producto and orden > v_orden;

  return v_ruta;
end;
$$;

-- La elegida pasa a 1 y las que iban delante bajan una posición. Ninguna pasa
-- de su posición actual, así que el tope de 8 nunca se rebasa a medio camino.
create function public.hacer_principal(p_slug text, p_imagen bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_producto bigint;
  v_orden    smallint;
begin
  select id into v_producto from public.productos where slug = p_slug for update;

  select i.orden into v_orden
    from public.producto_imagenes i
   where i.id = p_imagen and i.producto_id = v_producto;

  if v_orden is null then
    raise exception 'imagen_no_encontrada' using errcode = 'P0002';
  end if;

  update public.producto_imagenes
     set orden = case when id = p_imagen then 1 else orden + 1 end
   where producto_id = v_producto and orden <= v_orden;
end;
$$;

revoke execute on function
  public.guardar_producto(boolean, text, text, text, numeric, integer, text, text, text, text, boolean, boolean),
  public.archivar_producto(text),
  public.restaurar_producto(text),
  public.agregar_imagen(text, text),
  public.quitar_imagen(text, bigint),
  public.hacer_principal(text, bigint)
from public, anon;

grant execute on function
  public.guardar_producto(boolean, text, text, text, numeric, integer, text, text, text, text, boolean, boolean),
  public.archivar_producto(text),
  public.restaurar_producto(text),
  public.agregar_imagen(text, text),
  public.quitar_imagen(text, bigint),
  public.hacer_principal(text, bigint)
to authenticated;

commit;
