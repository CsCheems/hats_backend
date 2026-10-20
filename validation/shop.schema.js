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

module.exports = { addToCartSchema, setCartSchema, reviewSchema }
