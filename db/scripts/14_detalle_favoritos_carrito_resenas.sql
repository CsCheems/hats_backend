-- 14 · Detalle de producto, favoritos, carrito y reseñas.
--
-- Es ADITIVO: solo crea tablas y funciones nuevas, no toca ninguna existente. Por
-- eso sirve a NicolHatsA y a NicolHatsB a la vez, que comparten esta base.
--
-- El mismo criterio de 06–08, sobre todo "cada hecho una vez, nada derivable
-- guardado":
--   · favoritos y carrito_items son tablas de PAREJAS (usuario, producto) cuya
--     llave primaria es la pareja: un artículo no puede estar dos veces en la
--     misma lista. El carrito no guarda precio ni total —salen de `productos`—, y
--     tampoco hay una tabla "carrito" aparte: con una sola bolsa por persona, la
--     bolsa ES el conjunto de sus filas.
--   · resenas guarda lo que dijo cada persona (calificación y texto), una por
--     artículo. El promedio y el conteo no se guardan: se calculan al leer.
--
-- DOS PUERTAS, como el resto. Las tablas quedan cerradas (RLS activo y sin un solo
-- grant a anon ni a authenticated): se entra por funciones. Son security definer
-- porque tienen que cruzarse con `productos`, que no es legible sin ser admin, y
-- cada una comprueba lo suyo —que el artículo esté publicado y no archivado, y
-- que la persona sea quien dice— en vez de fiarse de quien llama.
--
-- Los errores son mensajes-clave, como los de 08, que auth/admin traducen:
--   producto_no_encontrado · producto_agotado · no_autenticado

begin;

-- ─── Tope por artículo en la bolsa ─────────────────────────────────────────
--
-- Una función y no un número repetido: el check de la tabla, las funciones y la
-- cantidad máxima que ofrece el detalle tienen que decir lo mismo.

create function public.max_cantidad()
returns integer
language sql
immutable
set search_path = ''
as $$ select 10 $$;

-- ─── Detalle público de un artículo ────────────────────────────────────────
--
-- Hermana de catalogo_publico() para UN artículo, con lo que la tarjeta no
-- necesita: todas las rutas de la galería en orden (la principal primero) y la
-- cantidad máxima que se puede pedir, que es min(stock, tope). Mostrar «quedan 3»
-- sin enseñar el stock entero es lo único que se publica de él.

create function public.producto_publico(p_slug text)
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
  maximo      integer,
  rutas       text[]
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
    least(p.stock, public.max_cantidad()),
    array(select i.ruta
            from public.producto_imagenes i
           where i.producto_id = p.id
           order by i.orden)
  from public.productos p
  join public.categorias c        on c.id = p.categoria_id
  join public.marcas m            on m.id = p.marca_id
  left join public.productos_genero pg  on pg.producto_id = p.id
  left join public.generos g            on g.id = pg.genero_id
  left join public.productos_fieltro pf on pf.producto_id = p.id
  left join public.fieltros f           on f.id = pf.fieltro_id
  where p.slug = p_slug
    and p.publicado
    and p.archivado_en is null;
$$;

revoke execute on function public.producto_publico(text) from public;
grant execute on function public.producto_publico(text) to anon, authenticated;

-- ─── Favoritos ─────────────────────────────────────────────────────────────

create table public.favoritos (
  usuario_id  uuid   not null references public.perfiles (id) on delete cascade,
  producto_id bigint not null references public.productos (id) on delete cascade,
  creado_en   timestamptz not null default now(),

  primary key (usuario_id, producto_id)
);

-- La llave empieza por usuario, que cubre «los míos»; este cubre el borrado en
-- cascada al archivar o borrar un producto.
create index favoritos_producto_idx on public.favoritos (producto_id);

alter table public.favoritos enable row level security;
revoke all on public.favoritos from anon, authenticated;

-- Mis favoritos, del más reciente al más antiguo y con la forma del catálogo
-- público (más `guardado`). Un artículo que se despublicó o se archivó sigue en la
-- tabla pero no sale: vuelve a aparecer si se vuelve a publicar.
create function public.mis_favoritos()
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
  foto_ruta   text,
  guardado    timestamptz
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
      limit 1),
    fav.creado_en
  from public.favoritos fav
  join public.productos p         on p.id = fav.producto_id
  join public.categorias c        on c.id = p.categoria_id
  join public.marcas m            on m.id = p.marca_id
  left join public.productos_genero pg  on pg.producto_id = p.id
  left join public.generos g            on g.id = pg.genero_id
  left join public.productos_fieltro pf on pf.producto_id = p.id
  left join public.fieltros f           on f.id = pf.fieltro_id
  where fav.usuario_id = (select auth.uid())
    and p.publicado
    and p.archivado_en is null
  order by fav.creado_en desc;
$$;

-- Idempotente: marcar dos veces es marcar una.
create function public.agregar_favorito(p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario  uuid := (select auth.uid());
  v_producto bigint;
begin
  if v_usuario is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;

  select id into v_producto
  from public.productos
  where slug = p_slug and publicado and archivado_en is null;

  if v_producto is null then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;

  insert into public.favoritos (usuario_id, producto_id)
  values (v_usuario, v_producto)
  on conflict do nothing;
end;
$$;

-- Quitar sí funciona aunque el artículo ya no esté publicado: es la forma de
-- limpiar una lista. Y tampoco falla si no estaba: el resultado es el mismo.
create function public.quitar_favorito(p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;

  delete from public.favoritos fav
  using public.productos p
  where p.id = fav.producto_id
    and p.slug = p_slug
    and fav.usuario_id = v_usuario;
end;
$$;

-- ─── Carrito ───────────────────────────────────────────────────────────────

create table public.carrito_items (
  usuario_id     uuid     not null references public.perfiles (id) on delete cascade,
  producto_id    bigint   not null references public.productos (id) on delete cascade,
  cantidad       smallint not null check (cantidad between 1 and public.max_cantidad()),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  primary key (usuario_id, producto_id)
);

create index carrito_items_producto_idx on public.carrito_items (producto_id);

create trigger carrito_items_actualizado_en
  before update on public.carrito_items
  for each row execute function public.tocar_actualizado_en();

alter table public.carrito_items enable row level security;
revoke all on public.carrito_items from anon, authenticated;

-- Mi bolsa, con el precio de HOY (no el de cuando lo añadí: no se guarda). Un
-- artículo despublicado o archivado no sale. `maximo` es lo que se puede pedir
-- ahora: si el stock bajó por debajo de la cantidad, la bolsa lo enseña y quien
-- compra decide.
create function public.mi_carrito()
returns table (
  slug       text,
  categoria  text,
  titulo     text,
  precio     numeric,
  disponible boolean,
  foto_ruta  text,
  cantidad   integer,
  maximo     integer
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
    p.precio,
    p.stock > 0,
    (select i.ruta
       from public.producto_imagenes i
      where i.producto_id = p.id
      order by i.orden
      limit 1),
    ci.cantidad::integer,
    least(p.stock, public.max_cantidad())
  from public.carrito_items ci
  join public.productos p  on p.id = ci.producto_id
  join public.categorias c on c.id = p.categoria_id
  where ci.usuario_id = (select auth.uid())
    and p.publicado
    and p.archivado_en is null
  order by ci.actualizado_en desc;
$$;

-- Una sola función para las dos cosas que se hacen con la cantidad: SUMAR (el
-- botón «Añadir» del detalle) y FIJAR (cambiarla desde la bolsa; 0 quita el
-- artículo). Devuelve la cantidad que quedó, que puede ser menor que la pedida:
-- se recorta a min(stock, tope) en vez de rechazar, porque la persona quiere el
-- máximo disponible, no un error.
create function public.guardar_en_carrito(p_slug text, p_cantidad integer, p_sumar boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario  uuid := (select auth.uid());
  v_producto bigint;
  v_stock    integer;
  v_actual   integer;
  v_nueva    integer;
begin
  if v_usuario is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;

  select id, stock into v_producto, v_stock
  from public.productos
  where slug = p_slug and publicado and archivado_en is null;

  if v_producto is null then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;

  select cantidad into v_actual
  from public.carrito_items
  where usuario_id = v_usuario and producto_id = v_producto;

  v_nueva := case when p_sumar then coalesce(v_actual, 0) + p_cantidad else p_cantidad end;

  if v_nueva <= 0 then
    delete from public.carrito_items where usuario_id = v_usuario and producto_id = v_producto;
    return 0;
  end if;

  if v_stock = 0 then
    raise exception 'producto_agotado' using errcode = 'P0001';
  end if;

  v_nueva := least(v_nueva, v_stock, public.max_cantidad());

  insert into public.carrito_items (usuario_id, producto_id, cantidad)
  values (v_usuario, v_producto, v_nueva)
  on conflict (usuario_id, producto_id) do update set cantidad = excluded.cantidad;

  return v_nueva;
end;
$$;

create function public.quitar_del_carrito(p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;

  delete from public.carrito_items ci
  using public.productos p
  where p.id = ci.producto_id
    and p.slug = p_slug
    and ci.usuario_id = v_usuario;
end;
$$;

-- ─── Reseñas ───────────────────────────────────────────────────────────────

create table public.resenas (
  id             bigint generated always as identity primary key,
  producto_id    bigint   not null references public.productos (id) on delete cascade,
  usuario_id     uuid     not null references public.perfiles (id) on delete cascade,
  calificacion   smallint not null check (calificacion between 1 and 5),
  texto          text     not null check (btrim(texto) <> '' and length(texto) <= 1000),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  -- Una reseña por persona y artículo; opinar otra vez la edita.
  constraint resenas_una_por_persona unique (producto_id, usuario_id)
);

create trigger resenas_actualizado_en
  before update on public.resenas
  for each row execute function public.tocar_actualizado_en();

alter table public.resenas enable row level security;
revoke all on public.resenas from anon, authenticated;

-- Las reseñas de un artículo publicado, públicas. El autor sale como «Rosa Í.»:
-- nombre y la inicial del apellido, nunca el correo ni el teléfono.
create function public.resenas_publicas(p_slug text)
returns table (
  id           bigint,
  calificacion smallint,
  texto        text,
  autor        text,
  creado       date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.calificacion,
    r.texto,
    pf.nombre || ' ' || left(pf.apellido, 1) || '.',
    (r.creado_en at time zone 'America/Monterrey')::date
  from public.resenas r
  join public.productos p  on p.id = r.producto_id
  join public.perfiles pf  on pf.id = r.usuario_id
  where p.slug = p_slug
    and p.publicado
    and p.archivado_en is null
  order by r.creado_en desc;
$$;

revoke execute on function public.resenas_publicas(text) from public;
grant execute on function public.resenas_publicas(text) to anon, authenticated;

-- La mía de este artículo, para rellenar el formulario al volver a opinar.
create function public.mi_resena(p_slug text)
returns table (
  calificacion smallint,
  texto        text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.calificacion, r.texto
  from public.resenas r
  join public.productos p on p.id = r.producto_id
  where p.slug = p_slug
    and r.usuario_id = (select auth.uid());
$$;

create function public.guardar_resena(p_slug text, p_calificacion integer, p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario  uuid := (select auth.uid());
  v_producto bigint;
begin
  if v_usuario is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;

  select id into v_producto
  from public.productos
  where slug = p_slug and publicado and archivado_en is null;

  if v_producto is null then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;

  insert into public.resenas (producto_id, usuario_id, calificacion, texto)
  values (v_producto, v_usuario, p_calificacion, btrim(p_texto))
  on conflict (producto_id, usuario_id)
  do update set calificacion = excluded.calificacion, texto = excluded.texto;
end;
$$;

create function public.borrar_resena(p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;

  delete from public.resenas r
  using public.productos p
  where p.id = r.producto_id
    and p.slug = p_slug
    and r.usuario_id = v_usuario;
end;
$$;

-- ─── Quién puede llamar a qué ──────────────────────────────────────────────
--
-- Todo se cierra primero y se abre después, función por función. Las dos de
-- lectura pública (producto_publico, resenas_publicas) ya se abrieron arriba.

revoke execute on function
  public.max_cantidad(),
  public.mis_favoritos(),
  public.agregar_favorito(text),
  public.quitar_favorito(text),
  public.mi_carrito(),
  public.guardar_en_carrito(text, integer, boolean),
  public.quitar_del_carrito(text),
  public.mi_resena(text),
  public.guardar_resena(text, integer, text),
  public.borrar_resena(text)
from public, anon;

grant execute on function
  public.max_cantidad(),
  public.mis_favoritos(),
  public.agregar_favorito(text),
  public.quitar_favorito(text),
  public.mi_carrito(),
  public.guardar_en_carrito(text, integer, boolean),
  public.quitar_del_carrito(text),
  public.mi_resena(text),
  public.guardar_resena(text, integer, text),
  public.borrar_resena(text)
to authenticated;

commit;
