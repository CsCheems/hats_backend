const { guard } = require('../utils/shopErrors')
const store = require('./shop.store')

// Las reseñas de un artículo. Lo público (leerlas) no necesita sesión; escribir,
// editar y borrar la suya sí, y la base impone que sea UNA por persona y artículo.
//
// El promedio y el conteo se calculan al leer y no se guardan: son derivables de
// las filas, y una cifra guardada dejaría de coincidir con ellas en la primera
// reseña editada.

const ESTRELLAS = [5, 4, 3, 2, 1]

function resumen(resenas) {
  const total = resenas.length

  return {
    total,
    // Un decimal («4.3»), o null sin reseñas: 0 sería una calificación.
    promedio: total ? Math.round((resenas.reduce((suma, r) => suma + r.calificacion, 0) / total) * 10) / 10 : null,
    // De 5 a 1, para pintar las barras en el orden en que se leen.
    distribucion: ESTRELLAS.map((estrellas) => ({
      estrellas,
      cantidad: resenas.filter((r) => r.calificacion === estrellas).length,
    })),
  }
}

async function list(slug) {
  const resenas = await guard(store.reviews(slug))

  return { resenas, resumen: resumen(resenas) }
}

async function mine(accessToken, slug) {
  return { resena: await guard(store.myReview(accessToken, slug)) }
}

async function save(accessToken, slug, { calificacion, texto }) {
  await guard(store.saveReview(accessToken, slug, { calificacion: Number(calificacion), texto }))

  return mine(accessToken, slug)
}

async function remove(accessToken, slug) {
  await guard(store.deleteReview(accessToken, slug))
}

module.exports = { list, mine, save, remove }
