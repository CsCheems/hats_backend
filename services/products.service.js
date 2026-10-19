const catalog = require('./catalog.store')

// El escaparate público. Igual que admin.service: no conoce req ni res, no elige
// status a mano y se podría llamar mañana desde un script.
//
// DEVUELVE EL CATÁLOGO VISIBLE ENTERO Y NO FILTRA NADA, y esa es la decisión de
// diseño de este archivo. Filtrar es cosa del cliente, por tres razones:
//
//   · Son unas decenas de artículos, unos 10 kB. Trocearlos cuesta más de lo
//     que ahorra.
//   · El deslizador de precio responde al arrastre, y una petición por píxel
//     movido sería una tienda que se siente rota.
//   · Las cuentas de las casillas se calculan sobre el catálogo entero y no
//     sobre lo ya filtrado —si no, filtrar esconde lo que te estás perdiendo—,
//     así que el servidor tendría que mandar la foto completa de todas formas.
//
// El día que esto sea una tienda de verdad entran aquí `?categoria=` y
// `?pagina=`, y el useMemo del cliente se queda igual: filtra lo que le llegue.

async function catalogo() {
  const { items, facetas } = await catalog.publicCatalog()

  return { items, facetas, total: items.length }
}

module.exports = { catalogo }
