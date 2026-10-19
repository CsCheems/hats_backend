-- 01 · Catálogos de ubicación: países y estados.
--
-- Existen para que la dirección cumpla la tercera forma normal. Si `direcciones`
-- guardara el país y el estado como texto, el país dependería del estado y no de
-- la dirección (Nuevo León → México), que es justo la dependencia transitiva que
-- 3NF prohíbe; y «Nuevo León», «nuevo leon» y «N.L.» acabarían siendo tres
-- estados distintos.
--
-- RLS se activa en el mismo script que crea cada tabla, para que no haya un solo
-- instante en que la tabla exista expuesta por la API sin él.
--
-- Son de lectura pública: el formulario de alta necesita la lista antes de que
-- exista una sesión. No hay políticas de escritura; los catálogos solo los toca
-- service_role (que se salta RLS) o quien corre estos scripts.

begin;

create table public.paises (
  id         smallint generated always as identity primary key,
  codigo_iso char(2) not null unique check (codigo_iso ~ '^[A-Z]{2}$'),
  nombre     text    not null unique check (btrim(nombre) <> '')
);

alter table public.paises enable row level security;

create table public.estados (
  id      smallint generated always as identity primary key,
  pais_id smallint not null references public.paises (id) on delete restrict,
  -- Clave INEGI de la entidad (01–32 en México). Texto y no número: el cero a la
  -- izquierda es parte de la clave.
  clave   text     not null check (clave ~ '^\d{2}$'),
  nombre  text     not null check (btrim(nombre) <> ''),
  -- Estos dos únicos empiezan por pais_id, así que también sirven de índice para
  -- la llave foránea: no hace falta crear uno aparte.
  unique (pais_id, clave),
  unique (pais_id, nombre)
);

alter table public.estados enable row level security;

create policy "paises: lectura pública"
  on public.paises for select
  to anon, authenticated
  using (true);

create policy "estados: lectura pública"
  on public.estados for select
  to anon, authenticated
  using (true);

-- Permisos explícitos en vez de confiar en los privilegios por defecto del
-- esquema public: la API solo puede leer. RLS ya lo impediría sin política, pero
-- así un intento de escritura dice «permission denied» en lugar de fallar en
-- silencio con cero filas.
revoke all on public.paises, public.estados from anon, authenticated;
grant select on public.paises, public.estados to anon, authenticated;

commit;
