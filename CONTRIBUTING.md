# Cómo contribuir

## Antes de escribir código

1. Clona, levanta el proyecto con el README y corre `npm test`. Si la suite no está en
   verde antes de tus cambios, avísalo antes de tocar nada.
2. Si el requerimiento no está claro, se discute antes de implementar, no después.

## Ramas y commits

- Una rama por tema: `feat/nombre-corto`, `fix/nombre-corto`.
- `main` se mantiene siempre desplegable; no se commitea directo sin revisar.
- Commits en **Conventional Commits**, en español y en imperativo:

```
feat(recetas): agregar código único y vínculo a talleres
fix(talleres): corregir la fecha que se corría un día en el listado
docs(readme): explicar las herramientas externas
test(ejecuciones): cubrir participantes negativos
```

Sin atribuciones a herramientas ni firmas automáticas: el commit va a nombre de quien lo
hizo.

## Antes de abrir el cambio

- `npm test` en verde.
- Si tocaste la cabecera, las tablas o los listados, revisa la interfaz a 320, 390, 768,
  1024 y 1440 px de ancho: nada debe cortarse ni pisarse.
