-- 10 · Bucket de imágenes de producto en Supabase Storage.
--
-- PÚBLICO para leer: la tienda pinta las fotos con su URL pública, sin sesión y
-- sin firmar nada. Eso no abre la escritura: subir, reemplazar y borrar pasan
-- por las políticas de abajo, que solo dejan a quien es_admin(). El backend
-- sube con el JWT de la administradora, así que estas políticas le aplican.
--
-- El bucket mismo impone el tamaño y el tipo. El backend comprueba lo mismo
-- antes —y además la firma de bytes del archivo—, pero esta es la última
-- palabra, también para quien le hable a Storage directo.
--
-- Se puede correr más de una vez: el bucket se ajusta y las políticas se
-- reemplazan.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects es de todos los buckets: cada política se limita al suyo.

drop policy if exists "productos: admin sube" on storage.objects;
create policy "productos: admin sube" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'productos' and (select public.es_admin()));

-- Leer por la API de Storage (no por la URL pública) también es solo del
-- admin: remove() la necesita para encontrar el objeto que va a borrar.
drop policy if exists "productos: admin lee objetos" on storage.objects;
create policy "productos: admin lee objetos" on storage.objects
  for select to authenticated
  using (bucket_id = 'productos' and (select public.es_admin()));

drop policy if exists "productos: admin reemplaza" on storage.objects;
create policy "productos: admin reemplaza" on storage.objects
  for update to authenticated
  using (bucket_id = 'productos' and (select public.es_admin()))
  with check (bucket_id = 'productos' and (select public.es_admin()));

drop policy if exists "productos: admin borra" on storage.objects;
create policy "productos: admin borra" on storage.objects
  for delete to authenticated
  using (bucket_id = 'productos' and (select public.es_admin()));

commit;
