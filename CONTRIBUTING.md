# Cómo contribuir

## Antes de escribir código

1. Lee `odd/tasks/creando-sabores.md`: tu tarea tiene responsable, superficies y criterio de término.
2. Levanta el proyecto (README) y corre `npm test`. Si no está en verde antes de tus cambios, avisa en el
   grupo antes de tocar nada.
3. Si crees que el spec está mal, se discute antes de implementar, no después.

## Ramas y commits

- Rama por tarea: `feat/t5-recetas`, `feat/t6-ejecuciones`, `feat/t7-documentos`, `feat/t8-videos`,
  `feat/t9-pwa`, `feat/t10-datos-demo`, `feat/t11-ci`.
- Nunca commits directos a `main`.
- Commits en **Conventional Commits**, en español y en imperativo:

```
feat(recetas): agregar CRUD con código único y vínculo a talleres
fix(talleres): corregir fecha que se corría un día en el listado
docs(manual): agregar capturas del panel
test(ejecuciones): cubrir participantes negativos
```

Sin atribuciones a herramientas ni firmas automáticas: el commit va a nombre de quien lo hizo.

## Pull requests

- Un PR por tarea. Título con el spec: `feat(recetas): CRUD y vínculo con talleres (S7)`.
- En la descripción: qué se hizo, qué spec cumple, cómo se probó (comandos y captura).
- No se mergea sin `npm test` en verde y sin la revisión de otra persona del equipo.
- El PR que termina un módulo también borra su entrada del mapa `PENDIENTES` en `app/routes/admin.js`,
  para que desaparezca el aviso de "módulo en construcción".

## Estilo de código

- CommonJS (`require`), dos espacios, comillas simples, punto y coma.
- Nombres de funciones y variables en inglés cuando son técnicos (`crearApp`, `query`); textos de pantalla,
  mensajes de error y comentarios **en español**. El usuario final es chileno y tiene que entender todo.
- Los comentarios explican **por qué**, no qué. Si el código se explica solo, no lleva comentario.
- Las validaciones viven en `src/validaciones.js`: si tu módulo necesita una nueva, se agrega ahí y se
  reutiliza, no se copia dentro de la ruta.
- Las consultas siempre con parámetros (`$1`, `$2`). Nunca concatenar texto del usuario en SQL.

## Pruebas

- Cada spec nuevo lleva al menos una prueba de integración por HTTP en `app/tests/`.
- Se prueba el camino bueno y el malo: dato inválido, sin sesión, rol equivocado.
- Las pruebas crean su propio esquema; no dependen del orden entre archivos.

## Antes de pedir revisión

```bash
cd app
npm test
```

Y revisar la pantalla nueva a 390 px de ancho (celular) y a 1280 px (computador). Si no se lee a brillo
de teléfono, no está lista.
