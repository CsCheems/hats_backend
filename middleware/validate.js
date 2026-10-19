const ApiError = require('../utils/ApiError')
const { MESSAGES, FORMAT } = require('../validation/rules')

// Cualquier valor que no sea texto se trata como ausente. No es paranoia: por la
// red puede llegar un `telefono` numérico, que reventaría dentro de .replace, o
// un objeto, que pasaría el «no vacío» y llegaría entero al almacén.
const read = (raw, trim) => {
  if (typeof raw !== 'string') return ''
  return trim ? raw.trim() : raw
}

/**
 * Fábrica de validación: `validate(schema)` devuelve el middleware.
 *
 * Es el único filtro de ruta que hay hoy, y por eso la validación vive en
 * middleware/ y no dentro del servicio: es el precedente exacto del requireAuth
 * que vendrá —se interpone entre el camino y el controlador, deja algo en `req`,
 * y llama a next() o lanza y corta—. Sin él la carpeta se quedaría sin ningún
 * ejemplo de la forma que ese middleware futuro tiene que tener.
 *
 * Los valores limpios van a `req.validated` y NO a `req.body`. Un controlador
 * que lee req.validated no puede leer sin querer un campo que nadie validó: en
 * el cuerpo del alta llega `confirmPassword`, y con curl puede llegar cualquier
 * cosa. La lista blanca deja de depender de la disciplina de quien escriba el
 * servicio.
 */
function validate(schema) {
  const group = new Set(schema.optionalGroup ?? [])

  return (req, res, next) => {
    const body = req.body ?? {}
    const validated = {}

    // Un grupo opcional —las contraseñas de la edición del perfil— es todo o
    // nada: si ninguno de sus campos trae valor, el grupo entero se omite y no
    // aparece en req.validated; si trae uno solo, todos son obligatorios.
    const skipGroup = [...group].every((name) => !read(body[name], false))

    // Se reporta un solo campo, porque la UI solo pinta uno: useForm hace
    // setErrors({ [field]: message }), que reemplaza el objeto de errores
    // entero. De ahí que el orden de schema.fields sea el de la pantalla.
    for (const field of schema.fields) {
      if (skipGroup && group.has(field.name)) continue

      // Un booleano es un booleano JSON y nada más: ni 'true', ni 1, ni la
      // ausencia. Una casilla siempre manda su valor, así que faltar es un
      // cuerpo mal armado.
      if (field.type === 'boolean') {
        if (typeof body[field.name] !== 'boolean') {
          throw ApiError.invalidField(field.name, MESSAGES.required)
        }

        validated[field.name] = body[field.name]
        continue
      }

      // Una lista —las categorías de una marca— es un array de textos, que se
      // recortan y se quedan sin vacíos ni repetidos. Cualquier otra cosa cuenta
      // como lista vacía, y si eso vale o no lo dice el `format` del campo.
      if (field.type === 'list') {
        const raw = Array.isArray(body[field.name]) ? body[field.name] : []
        const lista = [...new Set(raw.map((item) => read(item, true)).filter(Boolean))]
        const message = field.format ? FORMAT[field.format](lista) : null

        if (message) throw ApiError.invalidField(field.name, message)

        validated[field.name] = lista
        continue
      }

      const value = read(body[field.name], field.trim !== false)

      // Un campo `optional` vacío pasa como null, explícito: quien lo lee no
      // tiene que distinguir entre «no vino» y «vino vacío».
      if (!value && field.optional) {
        validated[field.name] = null
        continue
      }

      if (!value) throw ApiError.invalidField(field.name, MESSAGES.required)

      const message = field.format ? FORMAT[field.format](value) : null

      if (message) throw ApiError.invalidField(field.name, message)

      validated[field.name] = value
    }

    if (schema.matchPassword && validated.password !== validated.confirmPassword) {
      throw ApiError.invalidField('confirmPassword', MESSAGES.passwordMismatch)
    }

    req.validated = validated
    next()
  }
}

module.exports = validate
