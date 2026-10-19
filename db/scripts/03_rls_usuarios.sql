-- 03 · Políticas RLS de usuarios.
--
-- Todas van dirigidas a `authenticated`; anon no tiene permisos sobre estas
-- tablas (02). auth.uid() se envuelve en un (select …) como recomienda Supabase:
-- así Postgres lo evalúa una vez por consulta y no una vez por fila.
--
-- Recordatorio: service_role se salta RLS. Si el backend usa esa llave, estas
-- políticas no le aplican y la responsabilidad de filtrar vuelve a ser suya.

begin;

-- ─── ¿Es admin quien pregunta? ─────────────────────────────────────────────
--
-- security definer para esquivar la recursión: una política de `perfiles` que
-- consultara `perfiles` volvería a disparar sus propias políticas. La función
-- lee la tabla como su dueño, sin RLS, y solo responde sí o no sobre quien hace
-- la petición, así que no filtra datos de nadie.
--
-- El rol se lee en cada petición y no del JWT: quitarle el rol a alguien surte
-- efecto en su siguiente consulta, no cuando caduque su token.

create function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles
    where id = (select auth.uid())
      and rol = 'admin'
  );
$$;

revoke execute on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

-- ─── perfiles ──────────────────────────────────────────────────────────────
--
-- Sin política de insert: los perfiles solo nacen del trigger de alta. Sin
-- política de delete: un perfil desaparece en cascada al borrar la cuenta en
-- auth.users.

-- Una sola política con OR en lugar de dos permisivas: Postgres evalúa todas las
-- permisivas en cada fila, y el advisor de Supabase avisa por ello.
create policy "perfiles: leer el propio, o todos si es admin"
  on public.perfiles for select
  to authenticated
  using (id = (select auth.uid()) or (select public.es_admin()));

-- Qué columnas se pueden cambiar lo deciden los grants de 02 (no incluyen `rol`).
create policy "perfiles: editar el propio"
  on public.perfiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ─── direcciones ───────────────────────────────────────────────────────────

create policy "direcciones: leer las propias, o todas si es admin"
  on public.direcciones for select
  to authenticated
  using (usuario_id = (select auth.uid()) or (select public.es_admin()));

create policy "direcciones: crear las propias"
  on public.direcciones for insert
  to authenticated
  with check (usuario_id = (select auth.uid()));

create policy "direcciones: editar las propias"
  on public.direcciones for update
  to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

create policy "direcciones: borrar las propias"
  on public.direcciones for delete
  to authenticated
  using (usuario_id = (select auth.uid()));

-- ─── Cambio de rol ─────────────────────────────────────────────────────────
--
-- La única vía para cambiar un rol desde la API. Un admin no puede quitarse el
-- rol a sí mismo: la tienda se quedaría sin nadie que la administre y no habría
-- forma de arreglarlo sin entrar a la base de datos.

create function public.asignar_rol(p_usuario uuid, p_rol public.rol_usuario)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede asignar roles'
      using errcode = '42501';
  end if;

  if p_usuario = (select auth.uid()) and p_rol <> 'admin' then
    raise exception 'No puedes quitarte el rol de administrador'
      using errcode = '42501';
  end if;

  update public.perfiles set rol = p_rol where id = p_usuario;

  if not found then
    raise exception 'No existe ese usuario'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.asignar_rol(uuid, public.rol_usuario) from public, anon;
grant execute on function public.asignar_rol(uuid, public.rol_usuario) to authenticated;

commit;
