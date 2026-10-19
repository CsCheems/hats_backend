-- 07 · Productos, sus atributos por categoría y su galería.
--
--   categorias ─┬─ productos ─┬─ productos_genero ── generos
--   marcas ─────┘  (marca,    ├─ productos_fieltro ── fieltros
--   marca_categorias ┘ categ.)└─ producto_imagenes
--
-- Lo que NO se guarda, y dónde se obtiene (vista `inventario`, 08):
--   · el SKU      → 'RDO-' || categorias.prefijo || '-' || folio
--   · el estado   → borrador si no está publicado, agotado si el stock es 0,
--                   activo en los demás casos
--   · la principal de la galería → la imagen de menor `orden`
--
-- Género y fieltro no son columnas con null: son tablas aparte, porque solo
-- existen para algunas categorías. Sus llaves compuestas hacen imposible un
-- género en un cinturón o un fieltro en una bota, y un trigger diferido (abajo)
-- hace imposible una bota SIN género.
--
-- RLS se activa aquí; las políticas, las vistas y las funciones están en 08.
-- Hasta entonces, las tablas quedan cerradas del todo.

begin;

-- ─── Productos ─────────────────────────────────────────────────────────────

create table public.productos (
  id             bigint generated always as identity primary key,
  -- El identificador público: la portada y las rutas del bucket lo usan, y por
  -- eso no cambia al editar el título.
  slug           text     not null unique
                   check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  categoria_id   smallint not null references public.categorias (id) on delete restrict,
  marca_id       smallint not null,
  -- Número dentro de su categoría. Lo asigna el trigger de abajo; la API no
  -- puede escribirlo (grants de 08).
  folio          integer  not null check (folio > 0),
  titulo         text     not null check (btrim(titulo) <> '' and length(titulo) <= 120),
  descripcion    text     not null check (btrim(descripcion) <> '' and length(descripcion) <= 600),
  -- En pesos. numeric y no float: un precio no admite redondeos binarios.
  precio         numeric(10, 2) not null check (precio > 0),
  stock          integer  not null check (stock >= 0),
  publicado      boolean  not null default false,
  en_portada     boolean  not null default false,
  -- Archivar en vez de borrar: la fila se conserva para cuando los pedidos
  -- vivan en la base y tengan que seguir apuntando a lo que se vendió.
  archivado_en   timestamptz,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  -- Con el prefijo único por categoría, esto hace único al SKU sin guardarlo.
  constraint productos_folio_por_categoria unique (categoria_id, folio),
  -- Destino de las llaves compuestas de productos_genero y productos_fieltro.
  constraint productos_id_categoria unique (id, categoria_id),
  -- La regla de marcas: solo combinaciones que la marca tiene declaradas.
  constraint productos_marca_trabaja_categoria
    foreign key (marca_id, categoria_id)
    references public.marca_categorias (marca_id, categoria_id)
    on delete restrict
);

create index productos_marca_categoria_idx on public.productos (marca_id, categoria_id);

alter table public.productos enable row level security;

-- ─── Género (solo categorías que lo usan) ──────────────────────────────────
--
-- `categoria_id` repite la del producto a propósito: es lo que permite las dos
-- llaves. La primera la ata al producto (y la arrastra si cambia de
-- categoría); la segunda exige que esa categoría use género. Si un producto
-- pasa a una categoría sin género, el cascade choca con la segunda llave y la
-- escritura falla, que es exactamente lo que tiene que pasar.

create table public.productos_genero (
  producto_id  bigint   primary key,
  categoria_id smallint not null
                 references public.categorias_con_genero (categoria_id) on delete restrict,
  genero_id    smallint not null references public.generos (id) on delete restrict,

  constraint productos_genero_producto
    foreign key (producto_id, categoria_id)
    references public.productos (id, categoria_id)
    on update cascade on delete cascade
);

create index productos_genero_categoria_idx on public.productos_genero (categoria_id);
create index productos_genero_genero_idx on public.productos_genero (genero_id);

alter table public.productos_genero enable row level security;

-- ─── Fieltro (solo categorías que lo admiten; opcional dentro de ellas) ────

create table public.productos_fieltro (
  producto_id  bigint   primary key,
  categoria_id smallint not null
                 references public.categorias_con_fieltro (categoria_id) on delete restrict,
  fieltro_id   smallint not null references public.fieltros (id) on delete restrict,

  constraint productos_fieltro_producto
    foreign key (producto_id, categoria_id)
    references public.productos (id, categoria_id)
    on update cascade on delete cascade
);

create index productos_fieltro_categoria_idx on public.productos_fieltro (categoria_id);
create index productos_fieltro_fieltro_idx on public.productos_fieltro (fieltro_id);

alter table public.productos_fieltro enable row level security;

-- ─── Galería ───────────────────────────────────────────────────────────────
--
-- La principal no es una columna: es la de `orden` 1. Una bandera `principal`
-- podría quedar en dos filas o en ninguna; un orden único por producto, no.
--
-- El máximo de 8 lo imponen el check y el único juntos: 8 posiciones posibles,
-- una imagen por posición. El único es diferido para poder reordenar dentro de
-- una transacción sin chocar a medio camino.

create table public.producto_imagenes (
  id          bigint generated always as identity primary key,
  producto_id bigint   not null references public.productos (id) on delete cascade,
  -- La ruta del objeto dentro del bucket `productos`: <slug>/<uuid>.<ext>. Nunca
  -- se reutiliza, así que la imagen puede cachearse para siempre.
  ruta        text     not null unique
                check (ruta ~ '^[a-z0-9]+(-[a-z0-9]+)*/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|png|webp)$'),
  orden       smallint not null check (orden between 1 and 8),
  creado_en   timestamptz not null default now(),

  constraint producto_imagenes_orden_unico
    unique (producto_id, orden) deferrable initially deferred
);

alter table public.producto_imagenes enable row level security;

-- ─── Triggers ──────────────────────────────────────────────────────────────

create trigger productos_actualizado_en
  before update on public.productos
  for each row execute function public.tocar_actualizado_en();

-- Folio: el siguiente dentro de la categoría, al crear y al cambiar de
-- categoría —así el SKU se recompone solo—. El candado de transacción por
-- categoría serializa dos altas simultáneas: la segunda espera a que la
-- primera confirme y ve su folio.
--
-- security definer para que el máximo se calcule sobre TODAS las filas,
-- archivadas incluidas, sin depender de lo que RLS le deje ver a quien
-- escribe: un folio no se reutiliza nunca.
create function public.asignar_folio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.categoria_id = old.categoria_id then
    new.folio := old.folio;
    return new;
  end if;

  -- La semilla trae su propio folio; la API no puede mandarlo (grants de 08).
  if tg_op = 'INSERT' and new.folio is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('productos.folio'), new.categoria_id::integer);

  select coalesce(max(p.folio), 0) + 1
    into new.folio
    from public.productos p
   where p.categoria_id = new.categoria_id;

  return new;
end;
$$;

create trigger productos_folio
  before insert or update of categoria_id on public.productos
  for each row execute function public.asignar_folio();

-- Género obligatorio. Una llave no puede exigir que EXISTA una fila en otra
-- tabla, así que esto es un trigger — diferido al final de la transacción,
-- para que se pueda crear el producto y después su género sin fallar entre
-- las dos cosas. Se comprueba al crear o mover un producto y al quitarle el
-- género.
create function public.verificar_genero_obligatorio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_producto bigint;
begin
  -- IF y no CASE: PL/pgSQL resuelve las dos ramas de un CASE contra el registro
  -- de la tabla que disparó, y `productos` no tiene `producto_id`. Cada rama de
  -- un IF solo se prepara cuando se ejecuta.
  if tg_table_name = 'productos' then
    v_producto := new.id;
  else
    v_producto := old.producto_id;
  end if;

  if exists (
    select 1
      from public.productos p
      join public.categorias_con_genero c on c.categoria_id = p.categoria_id
     where p.id = v_producto
       and not exists (select 1 from public.productos_genero g where g.producto_id = p.id)
  ) then
    raise exception 'El producto % pertenece a una categoría que exige género', v_producto
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger productos_exige_genero
  after insert or update of categoria_id on public.productos
  deferrable initially deferred
  for each row execute function public.verificar_genero_obligatorio();

create constraint trigger productos_genero_no_se_quita
  after delete or update on public.productos_genero
  deferrable initially deferred
  for each row execute function public.verificar_genero_obligatorio();

revoke execute on function public.asignar_folio() from public, anon, authenticated;
revoke execute on function public.verificar_genero_obligatorio() from public, anon, authenticated;

commit;
