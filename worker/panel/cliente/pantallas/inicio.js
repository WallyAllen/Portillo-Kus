// Pantalla de bienvenida. Es también el ejemplo mínimo de una pantalla (ver cliente/app.js).
export default {
  id: 'inicio',
  titulo: 'Inicio',
  render(contenedor, { usuario }) {
    const titulo = document.createElement('h1');
    titulo.textContent = `Hola, ${usuario.nombre}`;
    const texto = document.createElement('p');
    texto.textContent = 'Todavía no hay secciones para editar.';
    const tarjeta = document.createElement('section');
    tarjeta.className = 'tarjeta';
    tarjeta.append(titulo, texto);
    contenedor.append(tarjeta);
  },
};
