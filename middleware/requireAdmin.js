const authService = require('../services/auth.service')
const ApiError = require('../utils/ApiError')

/**
 * El filtro de permiso. Va SIEMPRE detrás de requireAuth y nunca en su lugar:
 * lee `req.session` y `req.userId`, que es lo que aquel deja puesto, así que solo
 * puede funcionar en esa posición. Encadenados dan la respuesta correcta a cada
 * caso —401 sin sesión, 403 con sesión sin permiso—, que es justo la distinción
 * que el frontend necesita para no cerrarle la sesión a quien la tiene buena.
 *
 * Pregunta por la persona al servicio y no al almacén, como dice requireAuth:
 * este archivo es una pieza de permiso, no de usuarios, y no debería saber cómo
 * se guarda una fila.
 *
 * El rol se relee de la base en cada petición en vez de tomarse del JWT. Es una
 * consulta de más, y a cambio quitarle el rol a alguien surte efecto en la
 * petición siguiente y no cuando le caduque el token.
 *
 * Sin try/catch, como los controladores: Express 5 propaga a next() el rechazo
 * de un manejador async.
 */
async function requireAdmin(req, res, next) {
  const user = await authService.me(req.session.accessToken, { id: req.userId, email: req.email })

  if (user.rol !== 'admin') throw ApiError.forbidden()

  next()
}

module.exports = requireAdmin
