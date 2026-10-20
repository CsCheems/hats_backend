// Gemelo del ApiError de frontend/src/services/http.js.
//
// Las tres claves que viajan en el cuerpo —code, message, field— son exactamente
// las que lee `toApiError` allá, y `field` tiene que traer el nombre del campo
// tal como lo declara `authFields` en frontend/src/data/auth.js: useAuthForm
// hace setErrors({ [error.field]: error.message }) y manda el foco ahí. Un
// `field` mal escrito no rompe nada de forma visible — el mensaje simplemente no
// se pinta bajo ningún campo.
//
// El catálogo va junto aquí y no repartido por los servicios para poder leer de
// una sentada todo lo que la API responde cuando algo sale mal.

class ApiError extends Error {
  constructor({ status = 500, code = 'server_error', message, field = null }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.field = field
  }

  // Un solo error para «ese correo no existe» y «la contraseña está mal»:
  // distinguirlos le confirma a cualquiera qué correos están dados de alta.
  // El mensaje es el mismo que ya daba el mock del frontend.
  static invalidCredentials() {
    return new ApiError({
      status: 401,
      code: 'invalid_credentials',
      message: 'Correo o contraseña incorrectos.',
      field: 'password',
    })
  }

  // Sesión ausente, inventada o caducada. Es 401 como invalidCredentials, pero
  // con code propio a propósito: el frontend tiene que poder separar «tu sesión
  // terminó» —que no es culpa de nada que se acabe de escribir— de «esa
  // contraseña no es», que sí pinta un mensaje bajo un campo. De ahí también
  // que `field` se quede en null.
  static notAuthenticated() {
    return new ApiError({
      status: 401,
      code: 'not_authenticated',
      message: 'Tu sesión terminó. Vuelve a entrar.',
    })
  }

  // «Sé quién eres y esto no te toca». Es un error distinto de notAuthenticated
  // y no una variante suya: ante un 401 el frontend cierra la sesión local y
  // ofrece volver a entrar, que ante un 403 sería exactamente lo contrario de lo
  // que hay que hacer —la sesión está perfectamente bien, el permiso no—.
  // Sin `field`: no hay ningún campo de ningún formulario que corregir.
  static forbidden() {
    return new ApiError({
      status: 403,
      code: 'not_allowed',
      message: 'Tu cuenta no tiene acceso a esta zona.',
    })
  }

  static emailTaken() {
    return new ApiError({
      status: 409,
      code: 'email_taken',
      message: 'Ya existe una cuenta con este correo.',
      field: 'email',
    })
  }

  // El mensaje lo pone quien la lanza porque viene de validation/rules.js, que
  // es donde vive el catálogo de mensajes de validación.
  static invalidField(field, message) {
    return new ApiError({ status: 400, code: 'invalid_field', message, field })
  }

  // Supabase Auth limita los intentos de login y de alta por IP. Sin `field`:
  // no hay nada escrito que corregir, solo esperar.
  static tooManyRequests() {
    return new ApiError({
      status: 429,
      code: 'too_many_requests',
      message: 'Demasiados intentos seguidos. Espera un momento y vuelve a probar.',
    })
  }

  // Un archivo que no es de los tres tipos de imagen admitidos. 415 y no 400:
  // no es un dato mal escrito, es un formato que esta ruta no acepta.
  static unsupportedMediaType(message) {
    return new ApiError({ status: 415, code: 'unsupported_media_type', message, field: 'imagen' })
  }

  // Un archivo que pasa del peso máximo. 413 con `field` para que el panel lo
  // ponga junto a la galería; el 413 genérico del manejador no lo lleva.
  static payloadTooLarge(message) {
    return new ApiError({ status: 413, code: 'payload_too_large', message, field: 'imagen' })
  }

  // Añadir a la bolsa algo sin existencias. 409: la petición está bien escrita,
  // el estado del artículo es lo que no la deja pasar.
  static outOfStock() {
    return new ApiError({ status: 409, code: 'out_of_stock', message: 'Este artículo está agotado.' })
  }

  // Borrar algo que todavía se usa: una marca o una categoría con artículos. 409
  // y no 400, porque no hay nada mal escrito; sin `field` por lo mismo. El
  // mensaje dice qué lo está usando.
  static inUse(message) {
    return new ApiError({ status: 409, code: 'in_use', message })
  }

  static notFound() {
    return new ApiError({
      status: 404,
      code: 'not_found',
      message: 'No encontramos lo que buscabas.',
    })
  }
}

module.exports = ApiError
