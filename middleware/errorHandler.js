const ApiError = require('../utils/ApiError')

// Lo que no es un ApiError entra al mismo molde antes de responder.
function toApiError(error) {
  if (error instanceof ApiError) return error

  // Las dos formas en que express.json() rechaza un cuerpo. Traen su propio
  // `type`, que es lo que las distingue de un fallo cualquiera.
  if (error?.type === 'entity.parse.failed') {
    return new ApiError({
      status: 400,
      code: 'invalid_json',
      message: 'El cuerpo de la petición no es JSON válido.',
    })
  }

  if (error?.type === 'entity.too.large') {
    return new ApiError({
      status: 413,
      code: 'payload_too_large',
      message: 'El cuerpo de la petición es demasiado grande.',
    })
  }

  return new ApiError({
    status: 500,
    code: 'server_error',
    message: 'Algo se rompió de nuestro lado. Inténtalo de nuevo.',
  })
}

/**
 * El ÚNICO sitio del backend que escribe un cuerpo de error. Todo lo que la API
 * responde cuando algo falla sale de aquí con la misma forma
 * —{ code, message, field }—, que son las tres claves que lee `toApiError` en
 * frontend/src/services/http.js.
 *
 * Los cuatro argumentos son obligatorios aunque `next` no se use: Express
 * distingue el manejador de errores por la aridad de la función, y quitarlo
 * porque «no se usa» lo convierte en middleware corriente sin ningún aviso —los
 * errores dejarían de responderse y la petición se quedaría colgada—. El backend
 * no se lintea (eslint corre desde frontend/), así que nadie avisaría.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  const failure = toApiError(error)

  // La traza va a consola, nunca al cuerpo: un stack en la respuesta cuenta de
  // la casa más de lo que conviene. Solo la de los fallos que no esperábamos —un
  // 401 o un 400 son funcionamiento normal y llenarían la consola de ruido.
  if (failure.status >= 500) console.error(error)

  res.status(failure.status).json({
    code: failure.code,
    message: failure.message,
    field: failure.field,
  })
}

module.exports = errorHandler
