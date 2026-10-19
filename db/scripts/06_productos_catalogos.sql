-- 06 · Catálogos de producto: categorías, marcas, géneros, fieltros y quién
-- puede combinarse con quién.
--
-- Todo el modelo de producto está en quinta forma normal. Lo que eso significa
-- aquí, en concreto:
--
--   · Cada hecho se guarda UNA vez. «Cañón Hats hace sombreros» es un hecho
--     sobre marcas y categorías, no sobre un sombrero en particular, y por eso
--     vive en marca_categorias y no se deduce de los productos que haya.
--   · Nada que se pueda derivar se guarda: ni el SKU, ni el rótulo «6X», ni el
--     estado «agotado». Guardarlo sería darle a la base la oportunidad de
--     contradecirse.
--   · Las reglas de combinación son LLAVES, no triggers ni código: una bota de
--     una marca que no hace botas no se puede escribir, venga de donde venga.
--
-- Estos catálogos son de lectura pública —la tienda filtra por ellos sin sesión—.
-- Se siembran por SQL (09 y 91) y, desde 11, la administración escribe marcas y
-- categorías desde el panel. Géneros y fieltros siguen siendo solo de SQL.

begin;

-- ─── Categorías ────────────────────────────────────────────────────────────

create table public.categorias (
  id      smallint generated always as identity primary key,
  slug    text     not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre  text     not null unique check (btrim(nombre) <> ''),
  -- La mitad del SKU (RDO-<prefijo>-<folio>). Único, y por eso el SKU también
  -- lo es sin guardarlo.
  prefijo char(3)  not null unique check (prefijo ~ '^[A-Z]{3}$'),
  -- El orden del menú lateral y de los filtros: ni alfabético ni el de alta, el
  -- orden en que se enseña la tienda.
  orden   smallint not null unique check (orden > 0)
);

alter table public.categorias enable row level security;

-- ─── Marcas ────────────────────────────────────────────────────────────────

create table public.marcas (
  id     smallint generated always as identity primary key,
  slug   text     not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre text     not null unique check (btrim(nombre) <> ''),
  orden  smallint not null unique check (orden > 0)
);

alter table public.marcas enable row level security;

-- ─── Géneros ───────────────────────────────────────────────────────────────

create table public.generos (
  id     smallint generated always as identity primary key,
  slug   text     not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre text     not null unique check (btrim(nombre) <> ''),
  orden  smallint not null unique check (orden > 0)
);

alter table public.generos enable row level security;

-- ─── Fieltros ──────────────────────────────────────────────────────────────
--
-- Solo el grado. «6x» y «6X» son el mismo dato escrito de otra forma, y
-- guardarlos junto al 6 permitiría que un día dijeran cosas distintas. El orden
-- de escala es el del número, que tampoco hace falta escribir.

create table public.fieltros (
  id    smallint generated always as identity primary key,
  grado integer  not null unique check (grado > 0)
);

alter table public.fieltros enable row level security;

-- ─── Qué marca trabaja qué categoría ───────────────────────────────────────
--
-- La descomposición de 5FN: el hecho «esta marca hace esta categoría» es
-- independiente de cada producto. productos.(marca_id, categoria_id) apunta
-- aquí con una llave compuesta, así que un producto solo puede combinar una
-- marca con una categoría que la marca tiene declarada.

create table public.marca_categorias (
  marca_id     smallint not null references public.marcas (id) on delete restrict,
  categoria_id smallint not null references public.categorias (id) on delete restrict,
  primary key (marca_id, categoria_id)
);

-- La PK empieza por marca_id; la búsqueda por categoría necesita el suyo.
create index marca_categorias_categoria_id_idx on public.marca_categorias (categoria_id);

alter table public.marca_categorias enable row level security;

-- ─── Qué categorías usan cada atributo ─────────────────────────────────────
--
-- Tablas y no columnas booleanas en `categorias`: una tabla puede ser el
-- destino de una llave foránea, y así productos_genero y productos_fieltro
-- (07) no pueden tener filas de una categoría que no usa ese atributo. Con un
-- booleano, esa regla necesitaría un trigger.

create table public.categorias_con_genero (
  categoria_id smallint primary key references public.categorias (id) on delete cascade
);

alter table public.categorias_con_genero enable row level security;

create table public.categorias_con_fieltro (
  categoria_id smallint primary key references public.categorias (id) on delete cascade
);

alter table public.categorias_con_fieltro enable row level security;

-- ─── Acceso: lectura pública ───────────────────────────────────────────────
--
-- La escritura de marcas y categorías la abre 11, solo para la administración.

create policy "categorias: lectura pública" on public.categorias
  for select to anon, authenticated using (true);
create policy "marcas: lectura pública" on public.marcas
  for select to anon, authenticated using (true);
create policy "generos: lectura pública" on public.generos
  for select to anon, authenticated using (true);
create policy "fieltros: lectura pública" on public.fieltros
  for select to anon, authenticated using (true);
create policy "marca_categorias: lectura pública" on public.marca_categorias
  for select to anon, authenticated using (true);
create policy "categorias_con_genero: lectura pública" on public.categorias_con_genero
  for select to anon, authenticated using (true);
create policy "categorias_con_fieltro: lectura pública" on public.categorias_con_fieltro
  for select to anon, authenticated using (true);

revoke all on
  public.categorias, public.marcas, public.generos, public.fieltros,
  public.marca_categorias, public.categorias_con_genero, public.categorias_con_fieltro
from anon, authenticated;

grant select on
  public.categorias, public.marcas, public.generos, public.fieltros,
  public.marca_categorias, public.categorias_con_genero, public.categorias_con_fieltro
to anon, authenticated;

commit;
