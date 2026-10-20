-- 17 · Cancelar un pedido pagado, por quien lo compró.
--
-- Va después del 15 y el 16 y es ADITIVO: una sola función nueva.
--
-- REGLA DE NEGOCIO: un pedido se puede cancelar mientras NO se haya enviado. Es
-- decir, solo en estado `pendiente` (pagado, sin enviar). Enviado, entregado o ya
-- cancelado: no. Es la misma regla que ya aplica el panel (`admin_cambiar_estado`,
-- 16), y tiene que seguir siendo una sola: si cambia, cambia en las dos.
--
-- Cancelar devuelve las piezas al stock en la misma transacción. El reembolso del
-- cobro NO se hace aquí, porque la base no sabe hablar con la pasarela: la función
-- devuelve la referencia del cobro y el backend le pide el reembolso.
--
-- Mensajes-clave (los mismos de siempre): no_autenticado · pedido_no_encontrado ·
-- transicion_invalida (ya enviado, entregado o cancelado).

begin;

create function public.cancelar_mi_pedido(p_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario    uuid := (select auth.uid());
  v_estado     public.pedido_estado;
  v_referencia text;
begin
  if v_usuario is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;

  -- Se bloquea la fila: si el panel lo está marcando como enviado a la vez, uno
  -- espera al otro y el segundo ve el estado ya cambiado.
  select pe.estado, pe.pago_referencia into v_estado, v_referencia
  from public.pedidos pe
  where pe.id = p_id
    and pe.usuario_id = v_usuario
    and pe.pagado_en is not null
  for update;

  if not found then
    raise exception 'pedido_no_encontrado' using errcode = 'P0002';
  end if;

  if v_estado <> 'pendiente' then
    raise exception 'transicion_invalida' using errcode = 'P0001';
  end if;

  update public.pedidos set estado = 'cancelado' where id = p_id;

  update public.productos p
     set stock = p.stock + pi.cantidad
    from public.pedido_items pi
   where pi.pedido_id = p_id
     and p.id = pi.producto_id;

  return v_referencia;
end;
$$;

revoke execute on function public.cancelar_mi_pedido(bigint) from public, anon, authenticated;
grant execute on function public.cancelar_mi_pedido(bigint) to authenticated;

commit;
