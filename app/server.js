// Punto de entrada: arranca el servidor HTTP.
const { crearApp } = require('./src/app');

const PUERTO = Number(process.env.PORT || 3000);

crearApp().listen(PUERTO, () => {
  console.log(`Creando Sabores escuchando en http://localhost:${PUERTO}`);
});
