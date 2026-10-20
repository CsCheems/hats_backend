// El folio de un pedido es «NHT-» y su id con ceros («NHT-00012»): no se guarda,
// sale del id (db/scripts/15). Este es el único sitio que hace el camino de
// vuelta, para que la tienda y el panel acepten exactamente lo mismo.

const FOLIO = /^NHT-(\d{1,9})$/i

/** El id de un folio, o null si lo que llegó por la URL no es un folio. */
function parseFolio(folio) {
  const match = FOLIO.exec(folio)

  return match ? Number(match[1]) : null
}

module.exports = { parseFolio }
