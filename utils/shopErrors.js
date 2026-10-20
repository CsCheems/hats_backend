const ApiError = require('./ApiError')

// Los mensajes-clave que lanzan las funciones de db/scripts/14, traducidos al
// catálogo de errores de la API. La base los dice con una palabra porque no sabe
// de HTTP; aquí se decide qué estado y qué texto les toca.
//
// Si llegan hasta aquí es que el estado del artículo cambió entre que la persona
// abrió la página y pulsó —se despublicó, se agotó—, así que son errores de uso
// normal y no de programación.
const ERRORES = {
  producto_no_encontrado: () => ApiError.notFound(),
  producto_agotado: () => ApiError.outOfStock(),
  no_autenticado: () => ApiError.notAuthenticated(),
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
    throw ERRORES[error?.message]?.() ?? error
  }
}

module.exports = { guard }
