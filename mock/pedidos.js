// Pedidos de maqueta de los últimos treinta días.
//
// Es lo único del panel que sigue inventado del todo. Todo lo demás —cuántos
// productos hay, cuánto se vendió, cuánto entró— se DERIVA de estas filas y del
// inventario en Supabase, en services/admin.service.js. Escribir «148 pedidos» como
// número suelto es cómodo hasta que alguien añade una fila aquí y el resumen
// deja de cuadrar con la lista que tiene debajo; entonces el panel miente, que
// es lo peor que puede hacer un panel.
//
// `total` va en pesos y como número, igual que los precios del catálogo.
//
// Los cancelados cuentan como pedido pero no como venta ni como ingreso. Esa
// distinción vive en el servicio, no aquí: este archivo son datos.

const pedidos = [
  { folio: 'NHT-2609', cliente: 'Marisol Treviño', fecha: '2026-09-04', articulos: 2, total: 5470, estado: 'pendiente' },
  { folio: 'NHT-2608', cliente: 'Ignacio Sada', fecha: '2026-09-03', articulos: 1, total: 3150, estado: 'pendiente' },
  { folio: 'NHT-2607', cliente: 'Norma Quiroga', fecha: '2026-09-02', articulos: 3, total: 2010, estado: 'enviado' },
  { folio: 'NHT-2606', cliente: 'Beto Lozano', fecha: '2026-09-01', articulos: 1, total: 9750, estado: 'enviado' },
  { folio: 'NHT-2605', cliente: 'Cecilia Rangel', fecha: '2026-08-30', articulos: 4, total: 6340, estado: 'entregado' },
  { folio: 'NHT-2604', cliente: 'Hilario Peña', fecha: '2026-08-28', articulos: 2, total: 1520, estado: 'entregado' },
  { folio: 'NHT-2603', cliente: 'Adriana Solís', fecha: '2026-08-27', articulos: 1, total: 28400, estado: 'entregado' },
  { folio: 'NHT-2602', cliente: 'Rubén Villarreal', fecha: '2026-08-25', articulos: 5, total: 3890, estado: 'cancelado' },
  { folio: 'NHT-2601', cliente: 'Lupita Cantú', fecha: '2026-08-23', articulos: 2, total: 4290, estado: 'entregado' },
  { folio: 'NHT-2600', cliente: 'Fermín Ovalle', fecha: '2026-08-21', articulos: 3, total: 2760, estado: 'entregado' },
  { folio: 'NHT-2599', cliente: 'Sofía Menchaca', fecha: '2026-08-19', articulos: 1, total: 6740, estado: 'entregado' },
  { folio: 'NHT-2598', cliente: 'Gerardo Ibarra', fecha: '2026-08-17', articulos: 6, total: 4180, estado: 'entregado' },
  { folio: 'NHT-2597', cliente: 'Paulina Zúñiga', fecha: '2026-08-14', articulos: 2, total: 1770, estado: 'cancelado' },
  { folio: 'NHT-2596', cliente: 'Óscar Garza', fecha: '2026-08-12', articulos: 1, total: 5600, estado: 'entregado' },
  { folio: 'NHT-2595', cliente: 'Diana Arriaga', fecha: '2026-08-09', articulos: 3, total: 2340, estado: 'entregado' },
  { folio: 'NHT-2594', cliente: 'Nicolás Herrera', fecha: '2026-08-06', articulos: 2, total: 19800, estado: 'entregado' },
]

// El periodo anterior, para poder decir «+18% respecto al mes pasado». Estos
// tres SÍ son números escritos a mano, y no hay forma de que no lo sean: son un
// pasado del que no se guardan las filas. Van juntos y aparte para que se lean
// como lo que son.
const periodoAnterior = {
  pedidos: 13,
  ventas: 27,
  ingresos: 88140,
}

module.exports = { pedidos, periodoAnterior }
