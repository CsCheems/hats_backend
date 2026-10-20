-- 15 · Pedidos: de la bolsa al pago.
--
-- Es ADITIVO, como el 14: solo crea tipos, tablas y funciones nuevas, no toca
-- ninguna existente. Por eso sirve a NicolHatsA y a NicolHatsB a la vez.
--
-- El mismo criterio de siempre, "cada hecho una vez, nada derivable guardado":
--   · `pedidos` guarda lo que NO se puede volver a calcular: a dónde se manda
--     (copiado, porque la dirección guardada de la persona puede editarse o
--     borrarse y el pedido no debe cambiar con ella), cuánto costó el envío y
--     qué tasa de IVA regía ese día, y el pago.
--   · `pedido_items` guarda el PRECIO de cada artículo al comprar: el de hoy
--     puede ser otro, y un pedido que cambia de total solo no es un pedido.
--   · NO se guardan ni el subtotal, ni el IVA, ni el total, ni el folio: salen de
--     las líneas, del envío y de la tasa (función `desglose`) y del id. El título
--     del artículo tampoco se copia; se lee de `productos`, que nunca se borra.
--
-- PRECIOS CON IVA INCLUIDO. El precio de un artículo es el que paga quien compra,
-- como manda la ley en México. El IVA no se SUMA al final: se SACA del total. El
-- envío también lleva IVA, así que la base es (artículos + envío) / (1 + tasa).
--
-- DOS PUERTAS, como el resto: las tablas quedan cerradas (RLS activo y sin un
-- grant) y se entra por funciones security definer que leen auth.uid() del JWT.
--
-- Los errores son mensajes-clave, como los de 14, que traduce utils/shopErrors.js:
--   no_autenticado · bolsa_vacia · stock_insuficiente (detail: el título)
--   total_cambio (detail: el total de ahora) · pedido_no_encontrado
--
-- ─── LIMITACIÓN CONOCIDA, a leer antes de cobrar de verdad ─────────────────
-- `confirmar_pago` la llama el backend con el JWT de la persona, igual que todo,
-- porque este proyecto no usa service_role. Eso significa que quien hable con
-- PostgREST a mano podría marcar SU pedido como pagado sin pagar. Con la pasarela
-- simulada no hay dinero que proteger; antes de conectar una real, la
-- confirmación tiene que salir de un webhook firmado por la pasarela, no de la
-- sesión de quien compra.

begin;

-- ─── Reglas de dinero ──────────────────────────────────────────────────────
--
-- Funciones y no números repetidos, como max_cantidad(): la bolsa, el pedido y
-- lo que enseña la pantalla tienen que decir lo mismo.

create function public.tasa_iva()
returns numeric language sql immutable set search_path = ''
as $$ select 0.16 $$;

-- Envío: tarifa fija, gratis a partir de un monto de artículos.
create function public.envio_tarifa()
returns numeric language sql immutable set search_path = ''
as $$ select 199 $$;

create function public.envio_gratis_desde()
returns numeric language sql immutable set search_path = ''
as $$ select 2500 $$;

-- Cuánto tiempo se aparta el stock de un pedido que no se pagó.
create function public.minutos_reserva()
returns integer language sql immutable set search_path = ''
as $$ select 30 $$;

create function public.costo_envio(p_articulos numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_articulos <= 0 or p_articulos >= public.envio_gratis_desde() then 0
    else public.envio_tarifa()
  end
$$;

-- El desglose de un total con IVA incluido. Una sola fórmula para la bolsa, el
-- pedido y la confirmación. `iva` es el total menos la base (y no base × tasa)
-- para que base + iva sea SIEMPRE el total al centavo.
create function public.desglose(p_articulos numeric, p_envio numeric, p_tasa numeric)
returns table (articulos numeric, envio numeric, base numeric, iva numeric, total numeric)
language sql
immutable
set search_path = ''
as $$
  select
    p_articulos,
    p_envio,
    round((p_articulos + p_envio) / (1 + p_tasa), 2),
    (p_articulos + p_envio) - round((p_articulos + p_envio) / (1 + p_tasa), 2),
    p_articulos + p_envio
$$;

-- ─── Tablas ────────────────────────────────────────────────────────────────

-- `por_pagar` es el apartado: el stock ya se descontó pero el pago no se ha
-- confirmado. Los otros cuatro son los del panel de pedidos.
create type public.pedido_estado as enum
  ('por_pagar', 'pendiente', 'enviado', 'entregado', 'cancelado');

create table public.pedidos (
  id             bigint generated always as identity primary key,
  -- restrict y no cascade: un pedido es un hecho contable, no se va con la cuenta.
  usuario_id     uuid not null references public.perfiles (id) on delete restrict,
  estado         public.pedido_estado not null default 'por_pagar',

  -- A quién y a dónde. `estado_id` es el estado geográfico (el país sale de él);
  -- `estado` de arriba es la situación del pedido.
  destinatario   text     not null check (btrim(destinatario) <> '' and length(destinatario) <= 120),
  telefono       text     not null check (telefono ~ '^\d{10}$'),
  estado_id      smallint not null references public.estados (id) on delete restrict,
  codigo_postal  text     not null check (codigo_postal ~ '^\d{5}$'),
  colonia        text     not null check (btrim(colonia) <> ''),
  calle          text     not null check (btrim(calle) <> ''),
  numero         text     not null check (btrim(numero) <> ''),
  referencias    text     check (referencias is null or (btrim(referencias) <> '' and length(referencias) <= 200)),

  envio          numeric(10, 2) not null check (envio >= 0),
  iva_tasa       numeric(4, 3)  not null check (iva_tasa >= 0),

  -- El pago: los tres juntos o ninguno. Solo se guardan la referencia de la
  -- pasarela y los últimos cuatro dígitos; el número de tarjeta nunca llega aquí.
  pago_referencia text,
  pago_ultimos4   text check (pago_ultimos4 ~ '^\d{4}$'),
  pagado_en       timestamptz,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint pedidos_pago_completo check (
    (pagado_en is null) = (pago_referencia is null)
    and (pagado_en is null) = (pago_ultimos4 is null)
  ),
  -- Un pedido por pagar no está pagado, y uno en camino o entregado sí.
  constraint pedidos_estado_y_pago check (
    (estado <> 'por_pagar' or pagado_en is null)
    and (estado not in ('pendiente', 'enviado', 'entregado') or pagado_en is not null)
  )
);

create index pedidos_usuario_idx on public.pedidos (usuario_id, creado_en desc);
create index pedidos_estado_id_idx on public.pedidos (estado_id);
-- Para encontrar los apartados vencidos sin recorrer todos los pedidos.
create index pedidos_por_pagar_idx on public.pedidos (creado_en) where estado = 'por_pagar';

create trigger pedidos_actualizado_en
  before update on public.pedidos
  for each row execute function public.tocar_actualizado_en();

alter table public.pedidos enable row level security;
revoke all on public.pedidos from anon, authenticated;

create table public.pedido_items (
  pedido_id   bigint   not null references public.pedidos (id) on delete cascade,
  producto_id bigint   not null references public.productos (id) on delete restrict,
  -- El precio de ESE día, con IVA incluido.
  precio      numeric(10, 2) not null check (precio > 0),
  cantidad    smallint not null check (cantidad between 1 and public.max_cantidad()),

  primary key (pedido_id, producto_id)
);

create index pedido_items_producto_idx on public.pedido_items (producto_id);

alter table public.pedido_items enable row level security;
revoke all on public.pedido_items from anon, authenticated;

-- ─── Resumen de la bolsa ───────────────────────────────────────────────────
--
-- Lo que se va a pagar si se compra ahora, desglosado. Cuenta solo lo que se
-- puede comprar (publicado y con existencias), igual que el total de la bolsa.
-- `envio_gratis_desde` viaja para poder decir cuánto falta.
create function public.resumen_bolsa()
returns table (
  unidades           integer,
  articulos          numeric,
  envio              numeric,
  base               numeric,
  iva                numeric,
  total              numeric,
  tasa               numeric,
  envio_gratis_desde numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with bolsa as (
    select
      coalesce(sum(ci.cantidad), 0)::integer as unidades,
      coalesce(sum(ci.cantidad * p.precio), 0) as articulos
    from public.carrito_items ci
    join public.productos p on p.id = ci.producto_id
    where ci.usuario_id = (select auth.uid())
      and p.publicado
      and p.archivado_en is null
      and p.stock > 0
  )
  select
    b.unidades,
    d.articulos,
    d.envio,
    d.base,
    d.iva,
    d.total,
    public.tasa_iva(),
    public.envio_gratis_desde()
  from bolsa b
  cross join lateral public.desglose(b.articulos, public.costo_envio(b.articulos), public.tasa_iva()) d;
$$;

-- ─── Apartar y liberar ─────────────────────────────────────────────────────

-- Cancela un pedido por pagar y devuelve sus piezas al stock. Interna: no se
-- concede a nadie; la llaman las funciones de abajo, que ya comprobaron de quién
-- es el pedido. Un pedido que ya no está por pagar no se toca, así que llamarla
-- dos veces no devuelve el stock dos veces.
create function public.liberar_pedido(p_pedido bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pedidos set estado = 'cancelado'
  where id = p_pedido and estado = 'por_pagar';

  if found then
    update public.productos p
       set stock = p.stock + pi.cantidad
      from public.pedido_items pi
     where pi.pedido_id = p_pedido
       and p.id = pi.producto_id;
  end if;
end;
$$;

-- Crea el pedido con lo que hay en la bolsa y APARTA el stock, todo en una
-- transacción. Recibe el total que la persona vio (`p_total_esperado`): si entre
-- el resumen y el pago cambió un precio o una tarifa, no se cobra una cifra que
-- nadie aceptó.
--
-- Antes de apartar libera los apartados vencidos de cualquiera y los abandonados
-- de quien llama, para que un intento fallido no deje piezas retenidas.
-- Devuelve el id; el folio sale de él.
create function public.crear_pedido(
  p_destinatario    text,
  p_telefono        text,
  p_estado_id       smallint,
  p_codigo_postal   text,
  p_colonia         text,
  p_calle           text,
  p_numero          text,
  p_referencias     text,
  p_total_esperado  numeric
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario   uuid := (select auth.uid());
  v_linea     record;
  v_hay       boolean := false;
  v_articulos numeric := 0;
  v_envio     numeric;
  v_total     numeric;
  v_pedido    bigint;
begin
  if v_usuario is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;

  -- Una compra a la vez por persona: un doble clic no aparta dos veces.
  perform pg_advisory_xact_lock(hashtextextended(v_usuario::text, 15));

  perform public.liberar_pedido(pe.id)
  from public.pedidos pe
  where pe.estado = 'por_pagar'
    and (pe.usuario_id = v_usuario
         or pe.creado_en < now() - make_interval(mins => public.minutos_reserva()));

  -- Se bloquean las filas de los artículos mientras se comprueba el stock; en
  -- orden de id para que dos compras simultáneas no se esperen en círculo. Lo que
  -- está agotado se queda en la bolsa sin comprarse, como dice la propia bolsa:
  -- «no se incluye en el total».
  for v_linea in
    select ci.producto_id, ci.cantidad, p.titulo, p.precio, p.stock
    from public.carrito_items ci
    join public.productos p on p.id = ci.producto_id
    where ci.usuario_id = v_usuario
      and p.publicado
      and p.archivado_en is null
      and p.stock > 0
    order by p.id
    for update of p
  loop
    v_hay := true;

    if v_linea.stock < v_linea.cantidad then
      raise exception 'stock_insuficiente' using errcode = 'P0001', detail = v_linea.titulo;
    end if;

    v_articulos := v_articulos + v_linea.cantidad * v_linea.precio;
  end loop;

  if not v_hay then
    raise exception 'bolsa_vacia' using errcode = 'P0001';
  end if;

  v_envio := public.costo_envio(v_articulos);
  v_total := v_articulos + v_envio;

  if p_total_esperado is distinct from v_total then
    raise exception 'total_cambio' using errcode = 'P0001', detail = v_total::text;
  end if;

  insert into public.pedidos
    (usuario_id, destinatario, telefono, estado_id, codigo_postal, colonia, calle,
     numero, referencias, envio, iva_tasa)
  values
    (v_usuario, btrim(p_destinatario), p_telefono, p_estado_id, p_codigo_postal,
     btrim(p_colonia), btrim(p_calle), btrim(p_numero), nullif(btrim(p_referencias), ''),
     v_envio, public.tasa_iva())
  returning id into v_pedido;

  insert into public.pedido_items (pedido_id, producto_id, precio, cantidad)
  select v_pedido, ci.producto_id, p.precio, ci.cantidad
  from public.carrito_items ci
  join public.productos p on p.id = ci.producto_id
  where ci.usuario_id = v_usuario
    and p.publicado
    and p.archivado_en is null
    and p.stock > 0;

  update public.productos p
     set stock = p.stock - pi.cantidad
    from public.pedido_items pi
   where pi.pedido_id = v_pedido
     and p.id = pi.producto_id;

  return v_pedido;
end;
$$;

-- Marca el pedido como pagado y vacía de la bolsa lo que se compró. Si el
-- apartado venció y se liberó mientras tanto, no hay pedido que confirmar y el
-- backend devuelve el cobro.
create function public.confirmar_pago(p_pedido bigint, p_referencia text, p_ultimos4 text)
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

  update public.pedidos
     set estado = 'pendiente',
         pagado_en = now(),
         pago_referencia = p_referencia,
         pago_ultimos4 = p_ultimos4
   where id = p_pedido
     and usuario_id = v_usuario
     and estado = 'por_pagar';

  if not found then
    raise exception 'pedido_no_encontrado' using errcode = 'P0002';
  end if;

  delete from public.carrito_items ci
  using public.pedido_items pi
  where pi.pedido_id = p_pedido
    and ci.usuario_id = v_usuario
    and ci.producto_id = pi.producto_id;
end;
$$;

-- El pago se rechazó o se abandonó: libera lo apartado. Solo el dueño, y solo si
-- sigue por pagar (liberar_pedido no toca lo demás).
create function public.cancelar_pedido(p_pedido bigint)
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

  perform public.liberar_pedido(pe.id)
  from public.pedidos pe
  where pe.id = p_pedido and pe.usuario_id = v_usuario;
end;
$$;

-- ─── Leer un pedido ────────────────────────────────────────────────────────
--
-- Uno mío, con su dirección, sus líneas y el desglose. El folio es el id con
-- ceros; el desglose se calcula con la tasa y el envío DE ESE PEDIDO.
create function public.mi_pedido(p_id bigint)
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
  join public.estados es on es.id = pe.estado_id
  join public.paises pa on pa.id = es.pais_id
  join lineas l on l.pedido_id = pe.id
  cross join lateral public.desglose(l.articulos, pe.envio, pe.iva_tasa) d
  where pe.id = p_id
    and pe.usuario_id = (select auth.uid());
$$;

-- ─── Quién puede llamar a qué ──────────────────────────────────────────────
--
-- Todo se cierra primero y se abre después. Las reglas de dinero y liberar_pedido
-- no se abren a nadie: las llaman las demás funciones, que corren como su dueño.

revoke execute on function
  public.tasa_iva(),
  public.envio_tarifa(),
  public.envio_gratis_desde(),
  public.minutos_reserva(),
  public.costo_envio(numeric),
  public.desglose(numeric, numeric, numeric),
  public.liberar_pedido(bigint),
  public.resumen_bolsa(),
  public.crear_pedido(text, text, smallint, text, text, text, text, text, numeric),
  public.confirmar_pago(bigint, text, text),
  public.cancelar_pedido(bigint),
  public.mi_pedido(bigint)
from public, anon, authenticated;

grant execute on function
  public.resumen_bolsa(),
  public.crear_pedido(text, text, smallint, text, text, text, text, text, numeric),
  public.confirmar_pago(bigint, text, text),
  public.cancelar_pedido(bigint),
  public.mi_pedido(bigint)
to authenticated;

commit;
