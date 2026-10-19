-- 02 · Usuarios: perfiles y direcciones.
--
-- Las credenciales las guarda Supabase Auth en auth.users. Aquí no se repiten ni
-- el correo ni la contraseña: tenerlos en dos sitios sería redundancia, y el día
-- que alguien cambiara su correo en Auth, el de aquí mentiría.
--
--   auth.users 1──1 perfiles 1──N direcciones N──1 estados N──1 paises
--
-- `direcciones` no lleva pais_id a propósito: el país se obtiene a través del
-- estado, y guardarlo aquí sería una dependencia transitiva.
--
-- Las políticas RLS están en 03_rls_usuarios.sql; RLS se activa aquí, junto a
-- cada tabla, así que entre este script y el siguiente las tablas quedan
-- cerradas del todo y no abiertas.

begin;

-- Un valor atómico: el enum no rompe ninguna forma normal y ahorra una tabla con
-- dos filas. Añadir un rol más es un `alter type … add value`.
create type public.rol_usuario as enum ('cliente', 'admin');

create table public.perfiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  nombre         text not null check (btrim(nombre) <> ''),
  apellido       text not null check (btrim(apellido) <> ''),
  -- Se guarda solo con dígitos. El formulario acepta «81 1234 5678»; quien
  -- inserta normaliza (lo hace el trigger de alta) y este check lo garantiza.
  telefono       text not null check (telefono ~ '^\d{10}$'),
  rol            public.rol_usuario not null default 'cliente',
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.perfiles enable row level security;

create table public.direcciones (
  id             bigint generated always as identity primary key,
  usuario_id     uuid     not null references public.perfiles (id) on delete cascade,
  estado_id      smallint not null references public.estados (id) on delete restrict,
  codigo_postal  text     not null check (codigo_postal ~ '^\d{5}$'),
  colonia        text     not null check (btrim(colonia) <> ''),
  calle          text     not null check (btrim(calle) <> ''),
  numero         text     not null check (btrim(numero) <> ''),
  predeterminada boolean  not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.direcciones enable row level security;

create index direcciones_usuario_id_idx on public.direcciones (usuario_id);
create index direcciones_estado_id_idx on public.direcciones (estado_id);

-- Como mucho una dirección predeterminada por persona. El índice parcial lo
-- impone la base de datos; si fuera una regla del backend, dos peticiones
-- simultáneas la romperían.
create unique index direcciones_una_predeterminada_idx
  on public.direcciones (usuario_id)
  where predeterminada;

-- ─── actualizado_en ────────────────────────────────────────────────────────

create function public.tocar_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger perfiles_actualizado_en
  before update on public.perfiles
  for each row execute function public.tocar_actualizado_en();

create trigger direcciones_actualizado_en
  before update on public.direcciones
  for each row execute function public.tocar_actualizado_en();

-- ─── Alta: auth.users → perfiles (+ dirección) ─────────────────────────────
--
-- Supabase Auth inserta en auth.users y este trigger crea el perfil en la misma
-- transacción: si el perfil no se puede crear, el alta entera falla y no quedan
-- cuentas sin perfil. Los datos llegan en la metadata de signUp
-- (options.data), con estas claves:
--
--   nombre, apellido, telefono                          — obligatorias
--   estado_id, codigo_postal, colonia, calle, numero    — la dirección, opcional
--
-- El rol se escribe A MANO como 'cliente' y nunca se lee de la metadata: la
-- metadata la manda el navegador y cualquiera la puede escribir. Es el mismo
-- candado que tenía users.store.create.
--
-- security definer porque quien dispara el trigger es el rol de Auth, que no
-- tiene permisos sobre public; search_path vacío para que nadie pueda colarle un
-- objeto con el mismo nombre en otro esquema.

create function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.perfiles (id, nombre, apellido, telefono, rol)
  values (
    new.id,
    btrim(meta ->> 'nombre'),
    btrim(meta ->> 'apellido'),
    regexp_replace(meta ->> 'telefono', '\D', '', 'g'),
    'cliente'
  );

  if meta ? 'estado_id' then
    insert into public.direcciones
      (usuario_id, estado_id, codigo_postal, colonia, calle, numero, predeterminada)
    values (
      new.id,
      (meta ->> 'estado_id')::smallint,
      regexp_replace(meta ->> 'codigo_postal', '\D', '', 'g'),
      btrim(meta ->> 'colonia'),
      btrim(meta ->> 'calle'),
      btrim(meta ->> 'numero'),
      true
    );
  end if;

  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- Las funciones de trigger no deben poder llamarse por RPC.
revoke execute on function public.crear_perfil_nuevo_usuario() from public, anon, authenticated;
revoke execute on function public.tocar_actualizado_en() from public, anon, authenticated;

-- ─── Permisos por columna ──────────────────────────────────────────────────
--
-- RLS decide QUÉ FILAS se pueden tocar; estos grants deciden QUÉ COLUMNAS. Una
-- política de update no puede impedir que alguien cambie su propio `rol` en su
-- propia fila; el grant sí. El rol solo cambia con public.asignar_rol() (03) o
-- con service_role.
--
-- anon no tiene nada que hacer en estas tablas: sin permiso, la API responde
-- «permission denied» en vez de una lista vacía.

revoke all on public.perfiles, public.direcciones from anon, authenticated;

grant select on public.perfiles to authenticated;
grant update (nombre, apellido, telefono) on public.perfiles to authenticated;

grant select, delete on public.direcciones to authenticated;
grant insert (usuario_id, estado_id, codigo_postal, colonia, calle, numero, predeterminada)
  on public.direcciones to authenticated;
grant update (estado_id, codigo_postal, colonia, calle, numero, predeterminada)
  on public.direcciones to authenticated;
grant usage on sequence public.direcciones_id_seq to authenticated;

commit;
