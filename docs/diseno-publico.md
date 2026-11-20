# Diseño del sitio público: tres variantes en revisión

Estado al **2026-11-20**. Hay tres implementaciones del sitio público (`/` y `/talleres`) en ramas
separadas, las tres con la suite en verde y las tres corriendo en el servidor para compararlas. **Ninguna
está mergeada en `main`: la elección de cuál queda no está tomada.**

## Las tres variantes

| # | Variante | Rama | Preview (red local) | Qué la distingue |
|---|---|---|---|---|
| A | **Carpetas por temática** | `feat/diseno-fichero-carpetas` | <http://192.168.1.112:8093> | Una carpeta por temática en dos columnas, portada compacta con el resumen en línea y fichas con hueco de foto |
| B | **Índice de archivo** | `feat/diseno-fichero-indice` | <http://192.168.1.112:8096> | Cabecera en tinta oscura, pestañas por temática pegadas al costado y una fila por taller con número de ficha y campos alineados |
| C | **Híbrido** | `feat/diseno-fichero-publico` | <http://192.168.1.112:8097> | Carpetas de a una columna (se entiende de un vistazo) con las fichas de campos etiquetados del índice |

La demo de la presentación sigue en <http://192.168.1.112:8099> y corre desde `demo/t5-mas-t11`
(esta entrega + el PR #9 de recetas encima), con el **diseño anterior**: no se le aplicó ninguna de las
tres variantes porque no hay elección.

## Qué comparten las tres

- Los datos salen de las mismas consultas: `app/routes/publico.js` agrega `participantes` (por
  subconsulta, para no multiplicar filas con los otros joins), `ejecuciones` y `recetas` por taller, y el
  resumen cuenta planificados y en ejecución además de finalizados.
- Los colores de estado y los sellos son los mismos tokens que ya usaba el proyecto.
- Los límites son los mismos:
  - **La foto está vacía** (`sin foto`): se llena cuando T7 (Goran) traiga la subida desde el móvil.
  - **La ficha del taller no es clickeable**: esa ruta es S12/T9 de Francisco.
  - **El enlace a recetas** aparece cuando el PR #9 de T5 esté en `main`.
  - En la variante B las pestañas **no filtran**: son enlaces al listado general. Falta `?tematica=` en
    la ruta y un `WHERE` si esa variante queda.

## Cómo se verifica

```bash
# En el servidor, con la app ya construida en cada carpeta:
cd /opt/data/repos/creando-sabores && docker compose logs app --tail 30   # demo de la presentación
docker ps --filter name=creando                                          # las tres variantes + demo + base

# La suite completa, sin depender de las variantes (Node 20 + PostgreSQL 16):
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/creando_test \
  docker run --rm --network host -v /opt/data/work/creando-test/app:/app -w /app \
  -e DATABASE_URL -e SESSION_SECRET=secreto -e NODE_ENV=test node:20 npm test
```

Medido el 2026-11-20: **41 pruebas en verde** en las tres ramas; las tres responden 200 en su puerto y
en la red local.

## Qué queda por decidir

1. Qué variante gana (`A`, `B` o `C`).
2. Si gana B, si se le devuelve el hueco de foto que pide el SRS y si las pestañas pasan a filtrar.
3. Si el rediseño entra en la demo de la presentación antes de que termine el curso.
4. Abrir el PR de la variante elegida; las otras dos ramas se descartan.

El detalle de tareas, responsables y specs está en `odd/tasks/creando-sabores.md`.
