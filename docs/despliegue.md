# Publicar la plataforma

## Lo primero: Firebase Hosting no puede servir esta aplicación

Firebase Hosting entrega **archivos estáticos**. Esta plataforma es un servidor Node con Express y
PostgreSQL: cada página se arma en el servidor con datos de la base, y hay sesión, roles y subida de
archivos.

Para correr código de servidor en Firebase hay dos caminos, y los dos exigen el plan **Blaze** (tarjeta
vinculada a la cuenta de facturación), porque usan Cloud Functions o Cloud Run:

> "Cloud Functions for Firebase: Free usage quota, but a Cloud Billing account is required."
> — <https://firebase.google.com/docs/hosting/serverless-overview>

Además, en ninguno de los dos vive una base PostgreSQL: habría que sumar un PostgreSQL externo (Neon,
Supabase) y conectar la función por red.

Traducción práctica: se puede publicar en Firebase, pero no gratis y no sin tarjeta. Y Firebase no aporta
nada especial a esta aplicación salvo el dominio.

## Opción A — Render + PostgreSQL (gratis, sin tarjeta)

El repositorio ya trae `render.yaml`: Render lee ese archivo y crea el servicio y la base juntos.

1. Entrar a <https://render.com/deploy?repo=https://github.com/samueleduardobuguenovega-lang/creando-sabores>
   e iniciar sesión con GitHub.
2. Render muestra el blueprint **creando-sabores**: aceptar.
3. Cuando pida `CLAVE_ADMIN` y `CLAVE_DOCENTE`, escribir claves nuevas (no las de ejemplo).
4. Esperar el primer build (unos 3–5 minutos). Queda una URL `https://creando-sabores.onrender.com`.

Límites que hay que conocer antes de mandar el link:

| Límite | Efecto | Cómo se maneja |
|---|---|---|
| Se duerme a los 15 min sin visitas | La primera visita después tarda ~1 minuto en cargar | Avisar en el grupo: "si no carga al toque, esperen un minuto" |
| La base gratis **expira a los 30 días** | Se pierden los datos | Para la entrega del curso alcanza. Para algo permanente: Neon (gratis, no expira) y cambiar `DATABASE_URL` |
| Disco efímero | Los PDF subidos se pierden en cada reinicio | Afecta a T7: los documentos deben ir a la base (columna `bytea`) o a un almacenamiento externo, no al disco |
| 750 horas por mes | Alcanza para un servicio siempre despierto | No mantener dos servicios gratis en la misma cuenta |

Para usar Neon en vez de la base de Render:

1. Crear un proyecto en <https://neon.tech> (gratis, sin tarjeta) y copiar la cadena de conexión.
2. En Render, editar el servicio y poner esa cadena en `DATABASE_URL`.
3. Quitar el bloque `databases` de `render.yaml` para no crear la base de 30 días.

## Opción B — Firebase con plan Blaze

Solo si se acepta vincular una tarjeta de crédito a la cuenta de Google. El consumo normal entra en la
cuota gratuita, pero el riesgo de una factura no es cero.

Pasos, para el día que se decida:

1. En la consola de Firebase, proyecto nuevo, y pasar el proyecto a Blaze con una cuenta de facturación.
2. Instalar el CLI: `npm install -g firebase-tools` y `firebase login`.
3. Envolver la aplicación en una función `onRequest` (Express se monta tal cual) y declarar en
   `firebase.json` un `rewrite` de Hosting hacia esa función.
4. Crear un PostgreSQL en Neon y pasar su cadena como variable de entorno de la función.
5. `firebase deploy`.

Nada de esto está hecho en el repositorio, porque no se puede probar sin la cuenta y sin el plan. Si se
elige este camino, se agrega `functions/` y `firebase.json` en una tarea propia (T13) y se prueba con el
emulador antes de publicar.

## Antes de mandar el link a cualquier lado

1. **Cambiar las claves de ejemplo.** `admin` / `Admin-2026` está escrito en el README: cualquiera que
   abra el repositorio puede entrar al panel y borrar talleres.
2. **`SESSION_SECRET` propia**, generada con
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. **No subir datos reales** de estudiantes: la plataforma solo guarda cantidades de participantes, y así
   debe quedar.
4. El sitio es público: se puede indexar. Si no se quiere, agregar `robots.txt` con `Disallow: /` (Render
   ya lo hace mientras el servicio está dormido, pero no cuando está despierto).

## Resumen

| Camino | Costo | Tarjeta | Tiempo | Durabilidad |
|---|---|---|---|---|
| Render + Postgres gratis | $0 | No | ~5 min | Base de 30 días |
| Render + Neon gratis | $0 | No | ~10 min | Durable |
| Firebase Blaze + Functions + Neon | $0 dentro de la cuota | **Sí** | ~1 h de trabajo | Durable |
| Firebase Hosting solo | $0 | No | — | No sirve: no ejecuta el servidor |
