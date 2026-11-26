# Manual de usuario

Este manual se completa en T12 con capturas de cada pantalla. Lo que sigue ya describe el sistema tal
como funciona hoy; las capturas llevan el nombre del archivo al lado para que no se pierdan.

## 1. Quién puede hacer qué

| Acción | Administrador | Docente | Público (sin cuenta) |
|---|---|---|---|
| Ver talleres y ejecuciones | Sí | Sí | Sí |
| Crear y editar talleres | Sí | Sí | No |
| Eliminar talleres | Sí | No | No |
| Gestionar recetas, documentos y videos | Sí | Sí | No |
| Registrar ejecuciones | Sí | Sí | No |
| Crear usuarios y cambiar roles | Sí | No | No |
| Ver auditoría | Sí | No | No |

## 2. Entrar al sistema

1. Abrir la dirección de la plataforma en el navegador (computador o celular).
2. Tocar **Ingresar**.
3. Escribir el usuario y la contraseña que entregó la administración.
4. Al entrar se abre el **Panel principal**.

Si la contraseña no coincide, el sistema no dice si el usuario existe: muestra el mismo mensaje en los
dos casos. Si la cuenta está desactivada, lo dice explícitamente.

Para salir: botón **Salir** en la esquina superior derecha.

## 3. Panel principal

Muestra:

- Total de talleres registrados y cuántos están planificados, en ejecución y finalizados.
- Los últimos talleres ejecutados, con fecha y cantidad de participantes.
- Los talleres recién creados, con su estado.
- Accesos directos a **Nuevo taller**, **Consultar talleres** y **Registrar ejecución**.

## 4. Talleres

### Crear

1. Panel → **Nuevo taller**.
2. Completar nombre (obligatorio, mínimo 3 caracteres), temática (obligatoria), descripción, fecha
   planificada y estado.
3. **Guardar**. Si falta algo, el sistema lo dice en rojo arriba del formulario y no guarda nada.

### Buscar y filtrar

En **Talleres** se puede escribir parte del nombre o de la temática y filtrar por estado. El listado
muestra cuántas recetas y cuántas ejecuciones tiene cada taller.

### Editar y eliminar

- **Editar** abre el mismo formulario con los datos cargados.
- **Eliminar** (solo administración) borra el taller **y todo lo asociado**: recetas vinculadas,
  documentos, videos y ejecuciones. Pide confirmación antes de hacerlo.

## 5. Recetas

*(T5 — Francisco Puelles)*

Cada receta tiene un código único, un nombre, una descripción y el enlace de su ficha en PDF. Una misma
receta se puede asociar a varios talleres: se registra una sola vez y se reutiliza.

## 6. Documentos y videos

*(T7 y T8 — Goran Almendra)*

- **Documentos**: se sube un PDF de hasta 10 MB, se le pone un nombre y se asocia a un taller o a una
  receta. El tipo y el contenido del archivo se validan. Se puede leer dentro del navegador, sin
  descargarlo; solo se ve con sesión iniciada.
- **Videos**: en el apartado Videos, registra el nombre, el enlace de YouTube o Vimeo, una descripción
  opcional y el taller o receta asociado. No se sube el video a la plataforma: se guarda el enlace.
  Los videos asociados aparecen en el detalle del taller con su reproductor integrado.

## 7. Ejecuciones

*(T6 — Francisco Puelles)*

Documenta lo que realmente pasó:

- Fecha de la ejecución.
- Taller al que corresponde.
- Cantidad de participantes (número, sin nombres).
- Observaciones (opcional): qué faltó, qué funcionó, qué cambiar.
- Video de la sesión (opcional).

Al guardar, la ejecución aparece en el panel y en el sitio público.

## 8. Usuarios (solo administración)

1. **Usuarios** → **Nuevo usuario**.
2. Nombre completo, nombre de usuario (sin espacios), rol y contraseña de al menos 8 caracteres.
3. **Guardar**. El usuario nuevo ya puede entrar con esa contraseña.

Para desactivar una cuenta sin borrarla: editar, desmarcar **Cuenta activa**, guardar. Una cuenta
desactivada conserva su historial pero no puede entrar.

El sistema no permite que la administración desactive su propia cuenta: evita quedarse fuera.

## 9. Auditoría (solo administración)

Lista las últimas 100 acciones: quién, qué hizo, sobre qué registro y cuándo. No se puede editar ni
borrar desde la aplicación.

## 10. Problemas frecuentes

| Síntoma | Qué hacer |
|---|---|
| "El usuario o la contraseña no coinciden" | Revisar mayúsculas y la distribución del teclado. Pedir a la administración que restablezca la clave. |
| "Tu cuenta está desactivada" | Pedir a la administración que la reactive. |
| El formulario vuelve con un mensaje rojo | Corregir lo que indica el mensaje; el sistema no guardó nada. |
| No aparece la sección Usuarios | La cuenta es de rol docente: esa sección es solo de administración. |

## Capturas pendientes (T12)

- [ ] `img/login.png` — pantalla de ingreso.
- [ ] `img/panel.png` — panel con datos reales.
- [ ] `img/talleres-lista.png` — listado con filtro.
- [ ] `img/taller-form.png` — formulario con un error visible.
- [ ] `img/recetas.png`, `img/documentos.png`, `img/videos.png`, `img/ejecuciones.png`.
- [ ] `img/celular-panel.png` — panel a 390 px de ancho.
