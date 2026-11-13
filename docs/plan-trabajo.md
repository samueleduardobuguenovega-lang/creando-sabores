# Plan de trabajo

Equipo de tres. Cada persona es dueña de módulos completos para que nadie dependa de esperar al otro, y
para que un conflicto de merge sea la excepción y no la regla.

## Reparto

| Persona | Módulos | Tareas |
|---|---|---|
| **Francisco Puelles** | Recetas, ejecuciones, adaptabilidad | T5, T6, T9 |
| **Goran Almendra** | Documentos PDF, videos, datos demo y QA | T7, T8, T10 |
| **Samuel Bugueño** | Base, usuarios/roles, panel, talleres, entrega | T1, T2, T3, T4, T11, T12 |
| **Jorge Ponce (tutor)** | Revisión de hitos | H1, H2, H3 |

Por qué así: T1–T4 fijan el patrón (ruta → validación → consulta → vista → prueba). Con ese slice ya
funcionando nadie inventa su propia forma de hacer las cosas, y los tres módulos restantes son
independientes entre sí: se pueden hacer en cualquier orden después de T4.

## Orden recomendado

```
Semana 1   T1 T2 T3 T4 (hechas) ─┬─ H1 con el tutor: alcance y modelo
                                 │
Semana 2   T5 recetas ───────────┼─ T7 documentos  ── T8 videos
           T6 ejecuciones ───────┘
                                 │
Semana 3   T9 adaptabilidad ─────┴─ H2: demo con talleres + recetas + ejecuciones
           T10 datos demo y QA
                                 │
Semana 4   T11 CI y despliegue ──┴─ T12 manual y presentación ── H3: entrega
```

Las fechas exactas las fija el tutor en H1; esta tabla es el orden, no el calendario.

## Ramas

- `main` siempre funcionando: nadie empuja directo.
- Una rama por tarea: `feat/t5-recetas`, `feat/t6-ejecuciones`, `feat/t7-documentos`, `feat/t8-videos`,
  `feat/t9-pwa`, `feat/t10-datos-demo`, `feat/t11-ci`.
- Si hay que arreglar algo de `main`: `fix/descripcion-corta`.
- Un PR por tarea, contra `main`, con el número de spec en el título:
  `feat(recetas): CRUD y vínculo con talleres (S7)`.

## Archivos que se comparten

Casi todo es de un solo dueño. Los dos puntos de contacto son:

1. **`app/routes/admin.js`** — contiene el mapa `PENDIENTES`, que solo existe mientras un módulo no está
   hecho. Al terminar T5, T6, T7 o T8 se borra la entrada correspondiente y se monta el router nuevo. Es
   un cambio de tres líneas: se hace en el mismo PR del módulo.
2. **`app/public/css/estilos.css`** — lo toca Francisco en T9. Si alguien más necesita un estilo, se lo
   pide en vez de editarlo en paralelo.

Cuando un módulo empieza: se crea su archivo de rutas, sus vistas y su archivo de pruebas. No se edita
el archivo de otro módulo.

## Definición de "terminado"

Una tarea está lista cuando:

1. Cumple su spec (`S#` en `odd/tasks/creando-sabores.md`) con al menos una prueba de integración que la
   demuestre y que pase en verde.
2. `npm test` completo pasa en verde.
3. La pantalla se revisó a 390 px (teléfono) y a 1280 px (computador).
4. Las validaciones muestran un mensaje en español que dice qué corregir, no un error técnico.
5. El aviso de "módulo en construcción" de ese módulo ya no aparece.
6. El PR está revisado por otra persona del equipo.

## Reuniones

- **Semana 1 — H1**: revisar alcance, modelo de datos y este reparto con el tutor.
- **Semana 3 — H2**: demo funcional. Se muestra el circuito completo, no diapositivas.
- **Semana 4 — H3**: entrega. Manual, pruebas en verde y respaldo funcionando.

Entre hitos: estado por el grupo con dos líneas (qué hice, qué me bloquea). Sin reunión si no hay bloqueo.

## Reparto de la defensa

Si la actividad termina en presentación, cada uno expone lo que construyó:

- Francisco: recetas y ejecuciones, y por qué la receta se reutiliza en varios talleres.
- Goran: manejo de archivos y por qué un PDF no queda público.
- Samuel: modelo de datos, roles y auditoría; qué se prueba y qué no.
