-- 11 · Marcas y categorías desde el panel.
--
-- Hasta aquí los catálogos solo se escribían por SQL (09 y 91). Este script le
-- abre la escritura a la administración, con el mismo patrón que 08:
--
--   · RLS por comando con es_admin(): quien no administra no escribe, venga por
--     el backend o hablándole a PostgREST directo.
--   · Grants por columna: `slug` y `orden` solo se escriben al crear. El slug
--     está en las URL de la tienda (?marca=, ?categoria=) y en las del panel, y
--     por eso renombrar no lo cambia.
--   · Funciones security invoker, una transacción por operación, que imponen lo
--     que las llaves no pueden decir solas —no quitar lo que usan los artículos—
--     y fallan con un mensaje-clave que el backend traduce.
--
-- Nada de esto se archiva: se borra, y solo lo que no se usa. «Usar» cuenta los
-- artículos archivados, porque siguen apuntando a su marca y a su categoría.
--
-- Y una puerta pública más, marcas_publicas(): las marcas que la tienda enseña
-- en su menú y en la portada.
--
-- Requiere 01–10.

begin;

-- ─── Topes ─────────────────────────────────────────────────────────────────

-- Un nombre de marca va en el menú del navbar y en la banda de la portada, que
-- tienen el ancho que tienen.
alter table public.marcas
  add constraint marcas_nombre_largo check (length(nombre) <= 40);

alter table public.categorias
  add constraint categorias_nombre_largo check (length(nombre) <= 40);

-- /admin/productos/nuevo es el alta de artículos, y el router lo prefiere sobre
-- /admin/productos/:categoria: una categoría con este slug quedaría tapada.
alter table public.categorias
  add constraint categorias_slug_reservado check (slug <> 'nuevo');

-- ─── RLS: escribe solo la administración ───────────────────────────────────
--
-- Una política por comando y no `for all`: estas tablas ya tienen su política
-- pública de select (06), y dos permisivas para el mismo comando se evalúan las
-- dos en cada fila, que es lo que el advisor de Supabase marca (ver 03).

create policy "marcas: admin crea" on public.marcas
  for insert to authenticated with check ((select public.es_admin()));
create policy "marcas: admin edita" on public.marcas
  for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "marcas: admin borra" on public.marcas
  for delete to authenticated using ((select public.es_admin()));

create policy "categorias: admin crea" on public.categorias
  for insert to authenticated with check ((select public.es_admin()));
create policy "categorias: admin edita" on public.categorias
  for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "categorias: admin borra" on public.categorias
  for delete to authenticated using ((select public.es_admin()));

create policy "marca_categorias: admin crea" on public.marca_categorias
  for insert to authenticated with check ((select public.es_admin()));
create policy "marca_categorias: admin borra" on public.marca_categorias
  for delete to authenticated using ((select public.es_admin()));

create policy "categorias_con_genero: admin crea" on public.categorias_con_genero
  for insert to authenticated with check ((select public.es_admin()));
create policy "categorias_con_genero: admin borra" on public.categorias_con_genero
  for delete to authenticated using ((select public.es_admin()));

create policy "categorias_con_fieltro: admin crea" on public.categorias_con_fieltro
  for insert to authenticated with check ((select public.es_admin()));
create policy "categorias_con_fieltro: admin borra" on public.categorias_con_fieltro
  for delete to authenticated using ((select public.es_admin()));

-- ─── Grants: qué columnas ──────────────────────────────────────────────────

grant insert (slug, nombre, orden) on public.marcas to authenticated;
grant update (nombre) on public.marcas to authenticated;
grant delete on public.marcas to authenticated;

grant insert (slug, nombre, prefijo, orden) on public.categorias to authenticated;
grant update (nombre, prefijo) on public.categorias to authenticated;
grant delete on public.categorias to authenticated;

-- Tablas de pares y de pertenencia: una fila existe o no existe, no se edita.
grant insert, delete on
  public.marca_categorias, public.categorias_con_genero, public.categorias_con_fieltro
to authenticated;

-- ─── La puerta de la tienda ────────────────────────────────────────────────
--
-- security definer por lo mismo que catalogo_publico(): saber qué marcas tienen
-- artículos a la venta obliga a mirar `productos`, y sin sesión no se puede.
-- Devuelve solo slug y nombre, que la tienda ya ve en el catálogo.
--
-- Una marca sin nada publicado no sale: su enlace del menú llevaría a un
-- catálogo vacío.

create function public.marcas_publicas()
returns table (slug text, nombre text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.slug, m.nombre
    from public.marcas m
   where exists (
     select 1
       from public.productos p
      where p.marca_id = m.id
        and p.publicado
        and p.archivado_en is null
   )
   order by m.orden;
$$;

revoke execute on function public.marcas_publicas() from public;
grant execute on function public.marcas_publicas() to anon, authenticated;

-- ─── Escritura ─────────────────────────────────────────────────────────────
--
-- Mensajes-clave: 'marca_no_encontrada', 'marca_duplicada',
-- 'marca_sin_categorias', 'categorias_desconocidas', 'marca_categoria_en_uso',
-- 'marca_en_uso', 'categoria_no_encontrada', 'categoria_duplicada',
-- 'prefijo_ocupado', 'prefijo_fijo', 'genero_fijo', 'fieltro_fijo' y
-- 'categoria_en_uso'. El backend lo comprueba todo antes para poder nombrar el
-- campo; esto es la última palabra.
--
-- `p_crear` separa el alta de la edición, igual que en guardar_producto: un
-- alta sobre un slug ocupado dice que ya existe en vez de sobrescribirlo.

-- Nombre y categorías que trabaja. Las categorías llegan completas, no como
-- diferencia: lo que no venga se quita, salvo que la marca tenga artículos ahí.
create function public.guardar_marca(
  p_crear      boolean,
  p_slug       text,
  p_nombre     text,
  p_categorias text[]
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_marca      smallint;
  v_pedidas    integer;
  v_categorias smallint[];
begin
  select count(distinct pedida) into v_pedidas from unnest(p_categorias) as pedida;

  if v_pedidas = 0 then
    raise exception 'marca_sin_categorias' using errcode = 'P0001';
  end if;

  select array_agg(c.id) into v_categorias
    from public.categorias c
   where c.slug = any (p_categorias);

  if coalesce(cardinality(v_categorias), 0) <> v_pedidas then
    raise exception 'categorias_desconocidas' using errcode = 'P0001';
  end if;

  select id into v_marca from public.marcas where slug = p_slug for update;

  if not p_crear and v_marca is null then
    raise exception 'marca_no_encontrada' using errcode = 'P0002';
  end if;

  -- Sin distinguir mayúsculas: «broncoware» y «Broncoware» serían la misma
  -- marca dos veces en el menú.
  if (p_crear and v_marca is not null)
     or exists (
       select 1
         from public.marcas m
        where lower(m.nombre) = lower(btrim(p_nombre))
          and m.id is distinct from v_marca
     ) then
    raise exception 'marca_duplicada' using errcode = '23505';
  end if;

  if p_crear then
    -- La nueva va al final. El candado serializa dos altas a la vez: sin él las
    -- dos calcularían el mismo máximo y una chocaría con el único de `orden`.
    perform pg_advisory_xact_lock(hashtext('marcas.orden'));

    insert into public.marcas (slug, nombre, orden)
    select p_slug, btrim(p_nombre), coalesce(max(m.orden), 0) + 1
      from public.marcas m
    returning id into v_marca;
  else
    -- Archivados incluidos: la llave compuesta de productos sigue apuntando al
    -- par, y borrarlo fallaría de todas formas. Así el error dice por qué.
    if exists (
      select 1
        from public.productos p
       where p.marca_id = v_marca
         and not (p.categoria_id = any (v_categorias))
    ) then
      raise exception 'marca_categoria_en_uso' using errcode = '23503';
    end if;

    update public.marcas set nombre = btrim(p_nombre) where id = v_marca;

    delete from public.marca_categorias
     where marca_id = v_marca
       and not (categoria_id = any (v_categorias));
  end if;

  insert into public.marca_categorias (marca_id, categoria_id)
  select v_marca, unnest(v_categorias)
  on conflict do nothing;

  return p_slug;
end;
$$;

create function public.borrar_marca(p_slug text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_marca smallint;
begin
  select id into v_marca from public.marcas where slug = p_slug for update;

  if v_marca is null then
    raise exception 'marca_no_encontrada' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.productos p where p.marca_id = v_marca) then
    raise exception 'marca_en_uso' using errcode = '23503';
  end if;

  delete from public.marca_categorias where marca_id = v_marca;
  delete from public.marcas where id = v_marca;
end;
$$;

-- Nombre, prefijo del SKU y qué atributos usa.
--
-- Con artículos —archivados incluidos— dos cosas quedan fijas: el prefijo, que
-- ya está en todos sus SKU, y el género, que cada artículo ya tiene o no tiene.
-- Activarlo dejaría artículos sin género en una categoría que lo exige, y el
-- trigger de 07 no se entera, porque vigila productos, no categorías. El
-- fieltro es opcional dentro de la categoría: se puede activar siempre, y
-- quitarlo solo si ningún artículo lo lleva.
--
-- La edición bloquea la fila de la categoría. Dar de alta un artículo en ella
-- toma un `key share` de esa misma fila por la llave foránea, así que un alta
-- simultánea espera a que esto termine —o esto a ella— y la comprobación de
-- «tiene artículos» nunca llega tarde.
create function public.guardar_categoria(
  p_crear          boolean,
  p_slug           text,
  p_nombre         text,
  p_prefijo        text,
  p_lleva_genero   boolean,
  p_admite_fieltro boolean
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_categoria  smallint;
  v_prefijo    text;
  v_con_genero boolean;
begin
  select id, prefijo into v_categoria, v_prefijo
    from public.categorias
   where slug = p_slug
     for update;

  if not p_crear and v_categoria is null then
    raise exception 'categoria_no_encontrada' using errcode = 'P0002';
  end if;

  if (p_crear and v_categoria is not null)
     or exists (
       select 1
         from public.categorias c
        where lower(c.nombre) = lower(btrim(p_nombre))
          and c.id is distinct from v_categoria
     ) then
    raise exception 'categoria_duplicada' using errcode = '23505';
  end if;

  if exists (
    select 1
      from public.categorias c
     where c.prefijo = upper(p_prefijo)
       and c.id is distinct from v_categoria
  ) then
    raise exception 'prefijo_ocupado' using errcode = '23505';
  end if;

  if p_crear then
    perform pg_advisory_xact_lock(hashtext('categorias.orden'));

    insert into public.categorias (slug, nombre, prefijo, orden)
    select p_slug, btrim(p_nombre), upper(p_prefijo), coalesce(max(c.orden), 0) + 1
      from public.categorias c
    returning id into v_categoria;
  else
    if exists (select 1 from public.productos p where p.categoria_id = v_categoria) then
      if upper(p_prefijo) <> v_prefijo then
        raise exception 'prefijo_fijo' using errcode = 'P0001';
      end if;

      select exists (
        select 1 from public.categorias_con_genero g where g.categoria_id = v_categoria
      ) into v_con_genero;

      if p_lleva_genero <> v_con_genero then
        raise exception 'genero_fijo' using errcode = 'P0001';
      end if;
    end if;

    if not p_admite_fieltro and exists (
      select 1 from public.productos_fieltro f where f.categoria_id = v_categoria
    ) then
      raise exception 'fieltro_fijo' using errcode = 'P0001';
    end if;

    update public.categorias
       set nombre  = btrim(p_nombre),
           prefijo = upper(p_prefijo)
     where id = v_categoria;
  end if;

  if p_lleva_genero then
    insert into public.categorias_con_genero (categoria_id) values (v_categoria)
    on conflict do nothing;
  else
    delete from public.categorias_con_genero where categoria_id = v_categoria;
  end if;

  if p_admite_fieltro then
    insert into public.categorias_con_fieltro (categoria_id) values (v_categoria)
    on conflict do nothing;
  else
    delete from public.categorias_con_fieltro where categoria_id = v_categoria;
  end if;

  return p_slug;
end;
$$;

create function public.borrar_categoria(p_slug text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_categoria smallint;
begin
  select id into v_categoria from public.categorias where slug = p_slug for update;

  if v_categoria is null then
    raise exception 'categoria_no_encontrada' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.productos p where p.categoria_id = v_categoria) then
    raise exception 'categoria_en_uso' using errcode = '23503';
  end if;

  -- Sin artículos, lo que cuelga de ella es pura declaración: qué marcas la
  -- trabajan y qué atributos usa. Se borra aquí, con los permisos de quien
  -- llama, en vez de dejárselo a la cascada.
  delete from public.marca_categorias where categoria_id = v_categoria;
  delete from public.categorias_con_genero where categoria_id = v_categoria;
  delete from public.categorias_con_fieltro where categoria_id = v_categoria;
  delete from public.categorias where id = v_categoria;
end;
$$;

revoke execute on function
  public.guardar_marca(boolean, text, text, text[]),
  public.borrar_marca(text),
  public.guardar_categoria(boolean, text, text, text, boolean, boolean),
  public.borrar_categoria(text)
from public, anon;

grant execute on function
  public.guardar_marca(boolean, text, text, text[]),
  public.borrar_marca(text),
  public.guardar_categoria(boolean, text, text, text, boolean, boolean),
  public.borrar_categoria(text)
to authenticated;

commit;
