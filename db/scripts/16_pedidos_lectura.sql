-- 16 · Pedidos, de lectura: «Mis pedidos» y el panel.
--
-- Va DESPUÉS del 15 y no lo modifica: reutiliza sus tablas y su `desglose`. Es
-- aditivo salvo por un `create or replace` de `mi_pedido`, que conserva firma y
-- columnas (solo cambia de dónde lee), así que NicolHatsB no se entera.
--
-- Qué es un «pedido» para quien lo mira: uno PAGADO (`pagado_en` no es nulo). Los
-- apartados sin pagar y los que la tarjeta rechazó son intentos, no pedidos; no
-- salen en «Mis pedidos» ni en el panel, y el stock que apartaron ya volvió. Un
-- pedido pagado que luego se cancela sí sale, como cancelado.
--
-- Mismo criterio de siempre: las tablas siguen cerradas y se entra por funciones
-- security definer. Las del panel comprueban `es_admin()` ellas mismas —no se
-- fían de que el backend lo haya hecho antes— y fallan con `no_autorizado`.
--
-- Mensajes-clave nuevos: no_autorizado · pedido_no_encontrado · estado_invalido
-- · transicion_invalida.

begin;

-- ─── El detalle de un pedido, una sola vez ─────────────────────────────────
--
-- Un tipo compuesto para no escribir veintisiete columnas tres veces. Lo usan el
-- detalle interno y el del panel.
create type public.pedido_detalle as (
  id              bigint,
  usuario_id      uuid,
  cliente         text,
  email           text,
  folio           text,
  estado          text,
  creado_en       timestamptz,
  pagado_en       timestamptz,
  destinatario    text,
  telefono        text,
  pais            text,
  estado_nombre   text,
  codigo_postal   text,
  colonia         text,
  calle           text,
  numero          text,
  referencias     text,
  pago_referencia text,
  pago_ultimos4   text,
  unidades        integer,
  articulos       numeric,
  envio           numeric,
  base            numeric,
  iva             numeric,
  total           numeric,
  iva_tasa        numeric,
  items           jsonb
);

-- INTERNA (no se concede a nadie): un pedido sin mirar de quién es. Quien la
-- llama —mi_pedido, mis_pedidos, admin_pedido— pone su propio filtro. Lleva el
-- nombre y el correo del cliente para el panel; el correo vive en auth.users y no
-- se copia a ninguna tabla de public.
create function public.detalle_pedido(p_id bigint)
returns setof public.pedido_detalle
language sql
stable
security definer
set search_path = ''
as $$
  with lineas as (
    select
      pi.pedido_id,
      sum(pi.cantidad)::integer as unidades,
      sum(pi.cantidad * pi.precio) as articulos,
      jsonb_agg(
        jsonb_build_object(
          'slug', pr.slug,
          'categoria', c.slug,
          'titulo', pr.titulo,
          'precio', pi.precio,
          'cantidad', pi.cantidad,
          'foto_ruta', (select i.ruta
                          from public.producto_imagenes i
                         where i.producto_id = pr.id
                         order by i.orden
                         limit 1)
        )
        order by pr.titulo
      ) as items
    from public.pedido_items pi
    join public.productos pr on pr.id = pi.producto_id
    join public.categorias c on c.id = pr.categoria_id
    where pi.pedido_id = p_id
    group by pi.pedido_id
  )
  select
    pe.id,
    pe.usuario_id,
    btrim(pf.nombre || ' ' || pf.apellido),
    au.email::text,
    'NHT-' || lpad(pe.id::text, 5, '0'),
    pe.estado::text,
    pe.creado_en,
    pe.pagado_en,
    pe.destinatario,
    pe.telefono,
    pa.nombre,
    es.nombre,
    pe.codigo_postal,
    pe.colonia,
    pe.calle,
    pe.numero,
    pe.referencias,
    pe.pago_referencia,
    pe.pago_ultimos4,
    l.unidades,
    d.articulos,
    d.envio,
    d.base,
    d.iva,
    d.total,
    pe.iva_tasa,
    l.items
  from public.pedidos pe
  join public.perfiles pf on pf.id = pe.usuario_id
  join auth.users au on au.id = pe.usuario_id
  join public.estados es on es.id = pe.estado_id
  join public.paises pa on pa.id = es.pais_id
  join lineas l on l.pedido_id = pe.id
  cross join lateral public.desglose(l.articulos, pe.envio, pe.iva_tasa) d
  where pe.id = p_id;
$$;

-- Uno mío, pagado o no (el checkout lo lee antes de cobrar). Misma firma y mismas
-- columnas que la del 15; ahora sale de detalle_pedido.
create or replace function public.mi_pedido(p_id bigint)
returns table (
  id            bigint,
  folio         text,
  estado        text,
  creado_en     timestamptz,
  pagado_en     timestamptz,
  destinatario  text,
  telefono      text,
  pais          text,
  estado_nombre text,
  codigo_postal text,
  colonia       text,
  calle         text,
  numero        text,
  referencias   text,
  pago_ultimos4 text,
  unidades      integer,
  articulos     numeric,
  envio         numeric,
  base          numeric,
  iva           numeric,
  total         numeric,
  iva_tasa      numeric,
  items         jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.id, d.folio, d.estado, d.creado_en, d.pagado_en, d.destinatario, d.telefono,
    d.pais, d.estado_nombre, d.codigo_postal, d.colonia, d.calle, d.numero,
    d.referencias, d.pago_ultimos4, d.unidades, d.articulos, d.envio, d.base,
    d.iva, d.total, d.iva_tasa, d.items
  from public.detalle_pedido(p_id) d
  where d.usuario_id = (select auth.uid());
$$;

-- ─── Mis pedidos ───────────────────────────────────────────────────────────
--
-- Los pagados de quien llama, del más reciente al más antiguo. Con sus líneas,
-- para que la lista enseñe las fotos sin pedir cada pedido por separado.
create function public.mis_pedidos()
returns table (
  id        bigint,
  folio     text,
  estado    text,
  creado_en timestamptz,
  pagado_en timestamptz,
  unidades  integer,
  total     numeric,
  items     jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.folio, d.estado, d.creado_en, d.pagado_en, d.unidades, d.total, d.items
  from public.pedidos pe
  cross join lateral public.detalle_pedido(pe.id) d
  where pe.usuario_id = (select auth.uid())
    and pe.pagado_en is not null
  order by pe.pagado_en desc;
$$;

-- ─── Panel ─────────────────────────────────────────────────────────────────

-- Todos los pedidos pagados, o los pagados desde `p_desde`: el resumen del panel
-- pide solo los últimos sesenta días. Sin líneas, que la lista no las enseña.
create function public.admin_pedidos(p_desde timestamptz default null)
returns table (
  id        bigint,
  folio     text,
  estado    text,
  pagado_en timestamptz,
  cliente   text,
  unidades  integer,
  total     numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.es_admin()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  return query
  select d.id, d.folio, d.estado, d.pagado_en, d.cliente, d.unidades, d.total
  from public.pedidos pe
  cross join lateral public.detalle_pedido(pe.id) d
  where pe.pagado_en is not null
    and (p_desde is null or pe.pagado_en >= p_desde)
  order by pe.pagado_en desc;
end;
$$;

-- Un pedido pagado, completo, de quien sea.
create function public.admin_pedido(p_id bigint)
returns setof public.pedido_detalle
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.es_admin()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  return query
  select d.*
  from public.pedidos pe
  cross join lateral public.detalle_pedido(pe.id) d
  where pe.id = p_id
    and pe.pagado_en is not null;
end;
$$;

-- Cambia el estado de un pedido pagado. Las únicas transiciones son las del
-- camino de un pedido, y no hay vuelta atrás:
--
--     pendiente ──▶ enviado ──▶ entregado
--         └───────▶ cancelado       (solo antes de enviarse)
--
-- Cancelar devuelve las piezas al stock. El reembolso del cobro NO se hace aquí:
-- lo pide el backend a la pasarela, que es quien lo sabe hacer.
create function public.admin_cambiar_estado(p_id bigint, p_estado text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual public.pedido_estado;
  v_nuevo  public.pedido_estado;
begin
  if not (select public.es_admin()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  select pe.estado into v_actual
  from public.pedidos pe
  where pe.id = p_id and pe.pagado_en is not null
  for update;

  if not found then
    raise exception 'pedido_no_encontrado' using errcode = 'P0002';
  end if;

  begin
    v_nuevo := p_estado::public.pedido_estado;
  exception when invalid_text_representation then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end;

  if not (
    (v_actual = 'pendiente' and v_nuevo in ('enviado', 'cancelado'))
    or (v_actual = 'enviado' and v_nuevo = 'entregado')
  ) then
    raise exception 'transicion_invalida' using errcode = 'P0001';
  end if;

  update public.pedidos set estado = v_nuevo where id = p_id;

  if v_nuevo = 'cancelado' then
    update public.productos p
       set stock = p.stock + pi.cantidad
      from public.pedido_items pi
     where pi.pedido_id = p_id
       and p.id = pi.producto_id;
  end if;
end;
$$;

-- ─── Quién puede llamar a qué ──────────────────────────────────────────────

revoke execute on function
  public.detalle_pedido(bigint),
  public.mi_pedido(bigint),
  public.mis_pedidos(),
  public.admin_pedidos(timestamptz),
  public.admin_pedido(bigint),
  public.admin_cambiar_estado(bigint, text)
from public, anon, authenticated;

grant execute on function
  public.mi_pedido(bigint),
  public.mis_pedidos(),
  public.admin_pedidos(timestamptz),
  public.admin_pedido(bigint),
  public.admin_cambiar_estado(bigint, text)
to authenticated;

commit;
