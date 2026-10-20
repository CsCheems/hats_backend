const ApiError = require('./ApiError')

// Los mensajes-clave que lanzan las funciones de db/scripts/14 y 15, traducidos al
// catálogo de errores de la API. La base los dice con una palabra porque no sabe
// de HTTP; aquí se decide qué estado y qué texto les toca.
//
// Si llegan hasta aquí es que el estado de algo cambió entre que la persona
// abrió la página y pulsó —se despublicó un artículo, se agotó, subió el
// precio—, así que son errores de uso normal y no de programación.
//
// Cada traductor recibe el error de la base entera: `details` trae el dato que
// la función adjuntó con `detail =` (el título del artículo que se acabó, por
// ejemplo).
const ERRORES = {
  producto_no_encontrado: () => ApiError.notFound(),
  producto_agotado: () => ApiError.outOfStock(),
  no_autenticado: () => ApiError.notAuthenticated(),

  bolsa_vacia: () => ApiError.cartEmpty(),
  stock_insuficiente: (error) => ApiError.insufficientStock(error.details),
  total_cambio: () => ApiError.totalChanged(),
  pedido_no_encontrado: () => ApiError.notFound(),

  // db/scripts/16, las del panel. `no_autorizado` es la segunda llave: requireAdmin
  // ya habría parado a quien no administra.
  no_autorizado: () => ApiError.forbidden(),
  transicion_invalida: () => ApiError.invalidTransition(),
}

/**
 * Espera una llamada al almacén y, si la base respondió con uno de sus mensajes
 * conocidos, lo cambia por el ApiError que corresponde. Lo que no conoce lo
 * relanza tal cual, y llega al manejador central como un 500.
 */
async function guard(promesa) {
  try {
    return await promesa
  } catch (error) {
    throw ERRORES[error?.message]?.(error) ?? error
  }
}

module.exports = { guard }
