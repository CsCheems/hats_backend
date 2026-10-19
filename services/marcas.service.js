const catalog = require('./catalog.store')

// Las marcas que enseña la tienda: el menú «Marcas» del navbar y la banda de
// talleres de la portada. Igual que ubicaciones.service: no conoce req ni res y
// no elige status a mano.
//
// Solo las que tienen algún artículo publicado. Una marca recién dada de alta
// aparece cuando lo tenga; antes, su enlace llevaría a un catálogo vacío.

async function list() {
  return { marcas: await catalog.publicBrands() }
}

module.exports = { list }
