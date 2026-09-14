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
