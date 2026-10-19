const cors = require('cors')
const express = require('express')
const config = require('./config')
const errorHandler = require('./middleware/errorHandler')
const notFound = require('./middleware/notFound')
const routes = require('./routes')

// Composición de la aplicación: monta el middleware, cuelga la API y cierra con
// los dos manejadores finales. No abre el puerto —eso es de server.js— para que
// la app se pueda montar sin escuchar en ninguno.

const app = express()

// Origen explícito y credentials, NUNCA '*'. http.js manda credentials:'include'
// y el navegador descarta de plano una respuesta con comodín en ese modo, aunque
// hoy no viaje ninguna cookie: basta el modo de la petición. Y el fallo se ve
// desde el cliente como code:'network', con un mensaje que no menciona CORS.
app.use(cors({ origin: config.corsOrigin, credentials: true }))

// 10 kB. El alta son doce campos de texto; lo que pase de ahí no es un
// formulario de este sitio. Lo que se rechace por tamaño sale como 413 desde
// errorHandler.
app.use(express.json({ limit: '10kb' }))

app.use('/api', routes)

// El orden es lo único que hace que estos dos funcionen: cae en notFound lo que
// ningún router reclamó, y en errorHandler todo error —lanzado o pasado a
// next()— venga de donde venga.
app.use(notFound)
app.use(errorHandler)

module.exports = app
