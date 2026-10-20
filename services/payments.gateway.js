const crypto = require('node:crypto')
const ApiError = require('../utils/ApiError')
const { MESSAGES } = require('../validation/rules')

// La pasarela de pago. Hoy es SIMULADA, y este archivo es el único que lo sabe:
// pedidos.service llama a `charge` y `refund` y no conoce a ningún proveedor. El
// día que haya Stripe o Mercado Pago, se reescribe esto y nada más.
//
// El servidor nunca ve el número de una tarjeta. Lo que recibe es un TOKEN que
// fabricó el navegador (frontend/src/services/pagos.js); con una pasarela real
// sería el que devuelve su SDK. El de la simulación es `sim_` y los últimos
// cuatro dígitos, y de ellos sale el resultado, igual que las tarjetas de prueba
// de las pasarelas de verdad:
//
//   terminada en 0002 → la rechaza el banco
//   terminada en 9995 → sin fondos
//   cualquier otra    → cobro aprobado
//
// Un cargo simulado no mueve dinero ni deja nada que deshacer, pero `refund` está
// porque pedidos.service lo llama cuando el cobro salió y el pedido no se pudo
// confirmar, y esa llamada tiene que existir en la pasarela real.

const TOKEN = /^sim_(\d{4})$/

const RECHAZOS = {
  '0002': 'Tu banco rechazó la tarjeta. Prueba con otra.',
  '9995': 'La tarjeta no tiene fondos suficientes. Prueba con otra.',
}

/**
 * Cobra `monto` pesos al medio de pago que representa `token`. Devuelve la
 * referencia del cargo y los últimos cuatro dígitos, que es todo lo que se
 * guarda. Un rechazo es un ApiError 402 con su campo.
 */
async function charge({ token }) {
  const match = TOKEN.exec(token)

  if (!match) throw ApiError.invalidField('tarjetaNumero', MESSAGES.tarjeta)

  const ultimos4 = match[1]

  if (RECHAZOS[ultimos4]) throw ApiError.paymentDeclined(RECHAZOS[ultimos4])

  return { referencia: `sim_${crypto.randomUUID()}`, ultimos4 }
}

// Devuelve un cobro. En la simulación no hay nada que devolver.
async function refund() {}

module.exports = { charge, refund }
