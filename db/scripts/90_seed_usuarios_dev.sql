-- 90 · Cuentas de maqueta. SOLO DESARROLLO — no correr en producción.
--
-- Las tres cuentas que tenía la maqueta en memoria (backend/mock/users.js, ya
-- retirada), con las mismas contraseñas:
--   rosa@rincondeloeste.mx   Sabinal2026      cliente
--   tomas@rincondeloeste.mx  Broncoware2026   cliente
--   admin@rincondeloeste.mx  Capataz2026      admin
--
-- Se insertan directamente en auth.users y auth.identities, que es lo que haría
-- signUp, con el correo ya confirmado. Los perfiles y las direcciones NO se
-- insertan aquí: los crea el trigger de alta (02) a partir de la metadata, así
-- que esta semilla también sirve para comprobar que ese trigger funciona.
--
-- Los campos de token van como '' y no NULL: el servidor de Auth falla al leer
-- una fila con NULL en ellos.
--
-- Se puede correr más de una vez: una cuenta cuyo correo ya existe se salta.

begin;

do $$
declare
  cuenta record;
  nuevo_id uuid;
begin
  for cuenta in
    select *
    from (values
      ('rosa@rincondeloeste.mx',  'Sabinal2026',    'Rosa',  'Íñiguez',  '8112345678', 'Nuevo León', '64000', 'Centro',    'Padre Mier',       '148'),
      ('tomas@rincondeloeste.mx', 'Broncoware2026', 'Tomás', 'Berrones', '8443219876', 'Coahuila',   '25000', 'Republica', 'Allende',          '712'),
      ('admin@rincondeloeste.mx', 'Capataz2026',    'Elena', 'Cavazos',  '8187654321', 'Nuevo León', '67100', 'Talleres',  'Ruperto Martínez', '35')
    ) as v (email, clave, nombre, apellido, telefono, estado, codigo_postal, colonia, calle, numero)
  loop
    continue when exists (select 1 from auth.users where email = cuenta.email);

    nuevo_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      nuevo_id,
      'authenticated',
      'authenticated',
      cuenta.email,
      extensions.crypt(cuenta.clave, extensions.gen_salt('bf', 10)),
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object(
        'nombre',        cuenta.nombre,
        'apellido',      cuenta.apellido,
        'telefono',      cuenta.telefono,
        'estado_id',     (select id from public.estados where nombre = cuenta.estado),
        'codigo_postal', cuenta.codigo_postal,
        'colonia',       cuenta.colonia,
        'calle',         cuenta.calle,
        'numero',        cuenta.numero
      ),
      now(),
      now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(),
      nuevo_id,
      nuevo_id::text,
      'email',
      jsonb_build_object('sub', nuevo_id::text, 'email', cuenta.email, 'email_verified', true),
      now(),
      now(),
      now()
    );
  end loop;
end;
$$;

-- El trigger siempre da de alta como cliente; el ascenso se hace aquí, que corre
-- como postgres y no pasa por RLS ni por los grants de columna.
update public.perfiles p
set rol = 'admin'
from auth.users u
where u.id = p.id
  and u.email = 'admin@rincondeloeste.mx';

commit;
