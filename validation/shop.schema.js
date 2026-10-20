// Esquemas de cuerpo de la tienda: la bolsa y las reseñas. Espejo de lo que
// declara frontend/src/data/shop.js, y en el mismo orden por la misma razón que
// los demás: validate se detiene en el primer campo que falla.
//
// Las cantidades y la calificación viajan como TEXTO, igual que el precio y el
// stock de un artículo: validate lee cadenas, y es el servicio quien las
// convierte a número una vez validadas.

// Añadir a la bolsa: sumar al menos una pieza a lo que ya hay.
const addToCartSchema = {
  fields: [{ name: 'cantidad', format: 'cantidad' }],
}

// Cambiar la cantidad desde la bolsa: 0 quita el artículo.
const setCartSchema = {
  fields: [{ name: 'cantidad', format: 'cantidadFijar' }],
}

const reviewSchema = {
  fields: [
    { name: 'calificacion', format: 'calificacion' },
    { name: 'texto', format: 'resena' },
  ],
}

// Pagar: contacto y dirección de envío (en el orden de la pantalla, que es el del
// alta), si se guarda la dirección, el total que la persona vio y el token de la
// tarjeta. `referencias` es opcional; `guardar` es un booleano JSON, no un texto.
//
// El total viaja como texto, como los precios: el servidor lo compara con el que
// él calcula y se niega a cobrar si no coinciden. Del token solo se exige que
// venga; qué forma tiene lo decide la pasarela.
const checkoutSchema = {
  fields: [
    { name: 'destinatario', format: 'destinatario' },
    { name: 'telefono', format: 'telefono' },
    { name: 'pais' },
    { name: 'estado' },
    { name: 'codigoPostal', format: 'codigoPostal' },
    { name: 'colonia' },
    { name: 'calle' },
    { name: 'numero' },
    { name: 'referencias', format: 'referencias', optional: true },
    { name: 'guardar', type: 'boolean' },
    { name: 'total', format: 'monto' },
    { name: 'token', trim: false },
  ],
}

module.exports = { addToCartSchema, setCartSchema, reviewSchema, checkoutSchema }
