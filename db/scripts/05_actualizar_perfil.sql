-- 05 · Edición del perfil: datos personales y dirección en una sola transacción.
--
-- Son dos tablas, y desde la API serían dos peticiones: si la segunda fallara,
-- la persona vería su nombre cambiado y su dirección no, sin forma de saberlo.
-- Una función hace de las dos escrituras una sola transacción.
--
-- SECURITY INVOKER, a propósito y al revés que es_admin(): corre con los
-- permisos de quien la llama, así que RLS y los grants por columna de 02 siguen
-- mandando. Esta función no puede cambiar un rol ni tocar la fila de otra
-- persona, porque quien la llama tampoco puede. No es una puerta nueva; es un
-- atajo por las que ya existían.
--
-- No resuelve el estado a partir de texto ni valida formatos: eso lo hace el
-- backend, con los mensajes que el formulario sabe pintar. Los check de las
-- tablas siguen siendo la última palabra.

begin;

create function public.actualizar_perfil(
  p_nombre        text,
  p_apellido      text,
  p_telefono      text,
  p_estado_id     smallint,
  p_codigo_postal text,
  p_colonia       text,
  p_calle         text,
  p_numero        text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  yo uuid := (select auth.uid());
begin
  if yo is null then
    raise exception 'Hace falta una sesión para editar el perfil'
      using errcode = '42501';
  end if;

  update public.perfiles
  set nombre   = btrim(p_nombre),
      apellido = btrim(p_apellido),
      telefono = regexp_replace(p_telefono, '\D', '', 'g')
  where id = yo;

  if not found then
    raise exception 'No existe el perfil de esta cuenta'
      using errcode = 'P0002';
  end if;

  update public.direcciones
  set estado_id     = p_estado_id,
      codigo_postal = regexp_replace(p_codigo_postal, '\D', '', 'g'),
      colonia       = btrim(p_colonia),
      calle         = btrim(p_calle),
      numero        = btrim(p_numero)
  where usuario_id = yo
    and predeterminada;

  -- Una cuenta sin dirección predeterminada —creada sin ella, o que la borró—
  -- la gana aquí, en vez de perder en silencio lo que acaba de escribir.
  if not found then
    insert into public.direcciones
      (usuario_id, estado_id, codigo_postal, colonia, calle, numero, predeterminada)
    values (
      yo,
      p_estado_id,
      regexp_replace(p_codigo_postal, '\D', '', 'g'),
      btrim(p_colonia),
      btrim(p_calle),
      btrim(p_numero),
      true
    );
  end if;
end;
$$;

revoke execute on function public.actualizar_perfil(text, text, text, smallint, text, text, text, text)
  from public, anon;
grant execute on function public.actualizar_perfil(text, text, text, smallint, text, text, text, text)
  to authenticated;

commit;
