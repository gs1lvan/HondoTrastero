# PROYECTO TRASTERO
## Prompt maestro — Versión 0.7

### 1. Objetivo
Desarrollar una aplicación web responsive denominada **Trastero** para inventariar y localizar objetos almacenados en viviendas, trasteros y vehículos. Debe permitir responder: ¿Tengo este objeto? ¿Dónde está? ¿Qué objetos tengo en una ubicación? Inspiración visual y funcional: **Honda Despensa**. Prioridad a altas rápidas desde móvil.

### 2. Arquitectura
- Frontend: HTML, CSS y JavaScript.
- Repositorio: GitHub. Publicación: GitHub Pages.
- Base de datos SQL: mismo servicio que Honda Despensa, pendiente de confirmar.
- Dos usuarios autenticados, ambos administradores.
- Diseño responsive; consulta y administración diferenciadas.
- Los datos se almacenan en backend, no en HTML. Fotografías en almacenamiento protegido.

### 3. Ubicaciones
Seis grupos y nueve ubicaciones concretas:
- **A — Trasteros:** Trastero 27, Trastero 28, Trastero 29.
- **B — Casa principal:** Casa, Trastero de la casa.
- **C — Segunda vivienda:** Casa situada aproximadamente a 500 km.
- **D — Camper:** Camper.
- **E — Maletero Xsara:** Maletero Xsara.
- **F — Maletero Mégane:** Maletero Mégane.

Cada objeto pertenece a una única ubicación concreta. No se usan sububicaciones, estanterías, armarios ni cajas. Ubicaciones administrables.

### 4. Modelo de inventario
Cada registro corresponde a un objeto físico individual.
- Obligatorios: identificador único automático, nombre, categoría y ubicación.
- Opcionales: una fotografía como máximo y campo libre **Detalles** (observaciones, averías, préstamos, explicaciones).
- Automáticos: fechas de creación y última modificación.
- No existe campo cantidad; se permiten nombres repetidos, objetos equivalentes y duplicados. Cada registro se modifica o elimina individualmente; no hay fusión automática.

### 5. Categorías
Categorías configurables y ordenadas alfabéticamente, al igual que los objetos. Iniciales propuestas: Bricolaje, Decoración, Deportes, Electrónica, Herramientas, Informática, Jardinería, Libros y Ropa.

**Pendiente:** decidir si un objeto admite una o varias categorías.

### 6. Frontend — Consulta
- Cabecera con usuario conectado; buscador general; filtros independientes de ubicación y categoría; listado agrupado por categorías; fotografía opcional; detalles consultables; acceso rápido para añadir.
- Sin filtros: inventario completo. Solo ubicación o solo categoría: resultados correspondientes. Ambos: intersección. El buscador actúa dentro de los resultados filtrados.
- Filtros sin recarga de página.

**Pendiente:** concretar presentación del listado, alcance de búsqueda y modo de abrir la ficha.

### 7. Alta rápida — Cámara primero
1. Pulsar **Añadir objeto**.
2. Intentar abrir cámara según compatibilidad y permisos del dispositivo.
3. Tomar foto o continuar sin ella.
4. Mostrar vista previa y formulario compacto.
5. Completar ubicación, categoría y nombre obligatorios; detalles opcionales.
6. Guardar y confirmar; el objeto aparece en el inventario.

La foto es opcional; se podrá repetir, sustituir o elegir de galería. Si no hay cámara o permisos, continuar sin foto. Evitar registros incompletos y duplicados por doble pulsación. Optimizar para uso con una mano.

### 8. Memoria de ubicación en altas consecutivas — CONFIRMADO
- Durante una secuencia de altas del mismo usuario y dispositivo, recordar y preseleccionar la última ubicación utilizada.
- Ejemplo: después de guardar un objeto en **Trastero 27**, el siguiente formulario tendrá **Trastero 27** preseleccionado.
- El usuario podrá cambiarla libremente.
- Al iniciar una sesión de altas independiente, se podrá solicitar de nuevo la ubicación.
- Esta preferencia no modifica la ubicación de objetos ya guardados.

**Pendiente:** definir si después de guardar se ofrecen los botones **Añadir otro** y **Terminar**.

### 9. Edición posterior
Se podrán modificar nombre, ubicación, categoría, detalles y fotografía (añadir, sustituir o eliminar). La edición mantiene el identificador del registro y actualiza el backend sin crear otro objeto.

### 10. Administración
Ambos usuarios podrán añadir, editar y eliminar objetos (con confirmación), gestionar ubicaciones, categorías, fotografías y consultar todo el inventario. Los cambios sobre un objeto no afectarán a otros con el mismo nombre.

### 11. Seguridad
Dos usuarios autorizados inicialmente, con permisos completos. Autenticación y autorización en backend. Sin contraseñas en JavaScript. Proteger datos y fotografías mediante controles de acceso.

### 12. Diseño
Inspiración en Honda Despensa; interfaz limpia, compacta, mobile-first, tema oscuro configurable, buscador y filtros visibles, márgenes uniformes y controles esenciales. Mostrar Detalles cuando existan.

### 13. Plan de desarrollo
**No programar hasta cerrar decisiones funcionales y modelo de datos.**
1. Cerrar ubicaciones y categorías.
2. Definir buscador, listado y ficha.
3. Diseñar modelo SQL.
4. Diseñar frontend.
5. Implementar cámara y alta rápida con memoria de ubicación.
6. Implementar edición y administración.
7. Configurar autenticación y permisos.
8. Integrar fotografías.
9. Publicar mediante GitHub Pages.
10. Probar con inventario real.

**Principio rector:** máxima sencillez para fotografiar, identificar y localizar cada objeto con el mínimo número de acciones.
