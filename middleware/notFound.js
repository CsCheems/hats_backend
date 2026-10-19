const ApiError = require('../utils/ApiError')

// Cae aquí lo que ningún router reclamó. No responde: pasa el error a next()
// para que el cuerpo lo escriba un solo sitio —errorHandler— y un 404 llegue al
// cliente con la misma forma { code, message, field } que cualquier otro fallo.
//
// Va después de app.use('/api', routes) y antes de errorHandler; ese orden es
// todo lo que hace que funcione.
function notFound(req, res, next) {
  next(ApiError.notFound())
}

module.exports = notFound
