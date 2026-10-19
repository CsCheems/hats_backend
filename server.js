const app = require('./app')
const config = require('./config')

// Único sitio que abre el puerto. No monta middleware y no conoce ninguna ruta.

const server = app.listen(config.port, config.host)

// El manejador va antes del anuncio de arranque y no dentro del callback de
// listen: 'error' y 'listening' son los dos asíncronos, y con el orden al revés
// —que es como estaba— un puerto ocupado llegaba a imprimir «API escuchando»
// antes de morir. Ver el comentario de `host` en config/index.js: es el bind a
// una sola interfaz lo que ordena los dos eventos, esto solo lo deja claro.
server.on('error', (error) => {
  if (error.code !== 'EADDRINUSE') throw error

  console.error(
    `El puerto ${config.port} ya está ocupado. Cierra lo que lo tenga tomado o cambia PORT en backend/.env`,
  )
  process.exit(1)
})

server.on('listening', () => {
  console.log(`API escuchando en http://localhost:${config.port}/api`)
})
