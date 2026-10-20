// Esquemas de cuerpo del panel. Espejo de `productFields`, `brandFields` y
// `categoryFields` en frontend/src/data/admin.js, Y EN EL MISMO ORDEN: validate
// se detiene en el primer campo que falla, y ese tiene que ser el primero que se
// ve en el formulario.
//
// Lo que depende del catálogo de la base —que la categoría exista, que la marca
// la trabaje, que lleve género o fieltro, que un nombre o un prefijo estén
// libres— no se puede decidir aquí: lo decide admin.service con los catálogos en
// la mano, y la base lo vuelve a imponer.

const productSchema = {
  fields: [
    { name: 'titulo', format: 'titulo' },
    { name: 'descripcion', format: 'descripcion' },
    { name: 'categoria' },
    // Opcional: la tienda es de una sola marca y el formulario ya no la pide.
    // Si no llega, admin.service usa la única que hay; si llega, se valida igual.
    { name: 'marca', optional: true },
    // Opcionales aquí porque dependen de la categoría: el servicio exige el
    // género donde hace falta y rechaza los dos donde sobran.
    { name: 'genero', optional: true },
    { name: 'fieltro', optional: true },
    // Llegan como texto, como todo lo que sale de un input; el servicio los
    // convierte a número después de validarlos.
    { name: 'precio', format: 'precio' },
    { name: 'stock', format: 'stock' },
    { name: 'publicado', type: 'boolean' },
    { name: 'enPortada', type: 'boolean' },
  ],
}

// Las categorías viajan completas —las que la marca trabaja después de
// guardar—, no como diferencia: así el cuerpo no depende de lo que el cliente
// creyera que había.
const brandSchema = {
  fields: [
    { name: 'nombre', format: 'nombreCatalogo' },
    { name: 'categorias', type: 'list', format: 'categorias' },
  ],
}

const categorySchema = {
  fields: [
    { name: 'nombre', format: 'nombreCatalogo' },
    { name: 'prefijo', format: 'prefijo' },
    { name: 'llevaGenero', type: 'boolean' },
    { name: 'admiteFieltro', type: 'boolean' },
  ],
}

module.exports = { productSchema, brandSchema, categorySchema }
