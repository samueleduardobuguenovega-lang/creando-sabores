// Genera las miniaturas que faltan.
//
// La galería pública no necesita la foto de 1600 px: con 480 px de ancho sobra,
// también en pantallas de doble densidad. Las fotos subidas antes de que
// existiera la miniatura no la tienen, así que este comando las completa una vez
// y se puede volver a correr cuando se importen archivos por fuera del panel.
//
//   npm run miniaturas            completa las que faltan
//   npm run miniaturas -- --todo   las rehace todas
'use strict';

const { pool } = require('./db');
const archivos = require('./archivos');

async function main() {
  const rehacerTodo = process.argv.includes('--todo');
  const { rows } = await pool.query(
    `SELECT id, nombre, tipo_mime, archivo, contenido
       FROM documento
      WHERE tipo_mime LIKE 'image/%'
        AND contenido IS NOT NULL
        AND eliminado_en IS NULL
        ${rehacerTodo ? '' : 'AND miniatura IS NULL'}
      ORDER BY id`
  );

  console.log(`${rows.length} foto(s) por procesar.`);
  let hechas = 0;
  let sinCambio = 0;
  let antes = 0;
  let despues = 0;

  for (const fila of rows) {
    const liviana = await archivos.miniatura(fila.contenido, fila.tipo_mime, fila.archivo);
    if (!liviana) {
      sinCambio += 1;
      console.log(`  ${fila.id} ${fila.nombre}: sin miniatura (no gana peso o falta magick)`);
      continue;
    }

    await pool.query('UPDATE documento SET miniatura = $1 WHERE id = $2', [liviana, fila.id]);
    hechas += 1;
    antes += fila.contenido.length;
    despues += liviana.length;
    console.log(
      `  ${fila.id} ${fila.nombre}: ${archivos.describirTamano(fila.contenido.length)}` +
        ` -> ${archivos.describirTamano(liviana.length)}`
    );
  }

  const ahorro = antes > 0 ? Math.round((1 - despues / antes) * 100) : 0;
  console.log(`Listo: ${hechas} miniatura(s), ${sinCambio} sin cambios, ${ahorro}% menos peso.`);
}

main()
  .then(() => pool.end())
  .catch((error) => {
    console.error('No se pudieron generar las miniaturas:', error.message);
    pool.end().finally(() => process.exit(1));
  });
