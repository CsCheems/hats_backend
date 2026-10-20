const { guard } = require('../utils/shopErrors')
const store = require('./shop.store')

// La bolsa de la persona que pidió.
//
// Lo que se calcula aquí y no se guarda: las unidades y el total. El precio es el
// de HOY, el que tenga el artículo al pedir la bolsa; guardar el de cuando se
// añadió sería una copia que dejaría de coincidir con la tienda en cuanto alguien
// editara el artículo. Lo que no está disponible se enseña pero no suma.

const aPesos = (valor) => Math.round(valor * 100) / 100

async function view(accessToken) {
  const items = await guard(store.cart(accessToken))
  const vigentes = items.filter((item) => item.disponible)

  return {
    items,
    unidades: vigentes.reduce((suma, item) => suma + item.cantidad, 0),
    total: aPesos(vigentes.reduce((suma, item) => suma + item.precio * item.cantidad, 0)),
  }
}

// Devuelven la bolsa entera tras el cambio: es lo que el navbar y la página
// necesitan, y evita que el cliente tenga que pedirla otra vez. `cantidad` es la
// que quedó del artículo tocado, que puede ser menor que la pedida (se recorta a
// las existencias).
async function add(accessToken, slug, { cantidad }) {
  const quedo = await guard(store.saveInCart(accessToken, slug, Number(cantidad), true))

  return { ...(await view(accessToken)), cantidad: quedo }
}

async function set(accessToken, slug, { cantidad }) {
  const quedo = await guard(store.saveInCart(accessToken, slug, Number(cantidad), false))

  return { ...(await view(accessToken)), cantidad: quedo }
}

async function remove(accessToken, slug) {
  await guard(store.removeFromCart(accessToken, slug))

  return view(accessToken)
}

module.exports = { view, add, set, remove }
