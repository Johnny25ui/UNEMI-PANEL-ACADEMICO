# UNEMI Panel Académico — MVP

## Qué incluye
- Panel web responsive.
- Conteo de tareas pendientes, próximas y completadas.
- Búsqueda y filtros.
- Enlaces directos a actividades.
- API local con almacenamiento JSON.
- Extensión Chrome/Edge MVP que detecta enlaces típicos de Moodle y los envía al panel.

## Ejecutar
1. Instala Node.js 20+.
2. Abre esta carpeta en PowerShell.
3. Ejecuta `npm install`.
4. Ejecuta `npm start`.
5. Abre `http://localhost:3000`.

## Extensión
En Chrome/Edge abre `chrome://extensions` o `edge://extensions`, activa modo desarrollador y carga la carpeta `extension/` como extensión sin empaquetar.

## Importante
El extractor incluido es genérico. Para conectarlo correctamente a tu Aula Virtual UNEMI hay que ajustar los selectores y, si hace falta, el método de detección según la página real y las notificaciones disponibles. No pide ni guarda credenciales.

## Sincronización automática con Aula Virtual UNEMI

La extensión de Chrome/Edge incluida en `extension/` detecta actividades Moodle visibles en `https://aulagradob.unemi.edu.ec/` y las envía al panel de Render.

### Configuración en Render

Agrega una variable de entorno nueva:

- `SYNC_KEY`: usa una clave larga y privada distinta de `ADMIN_KEY`.

Luego vuelve a desplegar el servicio.

### Instalar la extensión

1. Abre `chrome://extensions/` o `edge://extensions/`.
2. Activa **Modo desarrollador**.
3. Elige **Cargar descomprimida** y selecciona la carpeta `extension`.
4. En los detalles de la extensión abre **Opciones de extensión**.
5. Deja como panel `https://unemi-panel-academico.onrender.com` y pega el mismo valor de `SYNC_KEY` configurado en Render.
6. Guarda y recarga una pestaña del Aula Virtual UNEMI.

Mientras el navegador esté abierto y tu sesión del Aula Virtual esté iniciada, la extensión escanea al cargar, cuando cambia la página y cada 30 segundos. Si una actividad ya existe, actualiza título, tipo o fecha límite sin duplicarla.

> La extensión no guarda ni envía tu contraseña del Aula Virtual. Si la computadora está apagada o no hay una sesión iniciada, no puede leer actividades privadas del Moodle.
