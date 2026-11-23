# Copias de seguridad de HondoTrastero

El destino verificado en `config.js` es **`zdohjcvmhluhalwbrphn`**, del repositorio `gs1lvan/HondoTrastero`.

## Activación

La creación y comprobación de ZIP funciona con las tablas actuales. Para habilitar la restauración y las lecturas consistentes, ejecutar **una vez** `04_copias_seguridad.sql` en el editor SQL del proyecto **zdohjcvmhluhalwbrphn**. No modifica tablas, datos ni políticas de acceso. Crea dos funciones que respetan los permisos del usuario conectado (`SECURITY INVOKER`). Se puede repetir.

La función de restauración comprueba que el proyecto indicado por la aplicación y el emisor de la sesión autenticada corresponden a ese proyecto. No acepta una sesión de otro proyecto. Si se migra legítimamente la aplicación, hay que revisar y actualizar este destino explícitamente.

## Uso

En **Administrar → Copias de seguridad**:

1. **Crear copia completa** reúne todos los registros accesibles a la cuenta, el catálogo de categorías, las fotos vinculadas y las preferencias de este dispositivo. Al terminar, pulsar **Descargar copia completa** y guardar el ZIP fuera del dispositivo si se desea otra copia.
2. **Comprobar o restaurar un ZIP** valida los archivos, los tamaños, los hashes SHA-256, la versión, el servidor, la cuenta, los recuentos y las relaciones entre registros. No modifica datos.
3. Para restaurar, preparar y descargar primero una **copia del estado actual**. Confirmar que se ha guardado y escribir **RESTAURAR**. Se muestran los recuentos de ambas versiones.
4. Las fotografías se suben a rutas nuevas y se vuelven a descargar para comprobarlas. Después se sustituye el inventario en una sola transacción. Un cambio concurrente respecto de la copia previa cancela la operación; hay que volver a preparar esa copia.
5. Si se pierde la conexión al enviar la restauración, la aplicación conserva su intención en IndexedDB. Al volver a entrar, **Comprobar resultado pendiente** distingue una restauración completada del estado anterior. Si hay cambios posteriores, pide revisar el inventario antes de empezar otra restauración.

La aplicación solicita una copia previa descargada, pero un navegador no puede certificar que el usuario haya conservado el archivo. Por eso también se exige su confirmación explícita.

## Alcance y límites

- Una copia corresponde a **la cuenta que la crea y su inventario accesible**, sin depender del buscador, filtros ni paginación de la vista. La política actual de Supabase determina qué registros puede ver y recuperar esa cuenta. No se utiliza una clave administrativa en el navegador.
- Se conservan identificadores, relaciones, palabras clave, descripciones y los demás campos de las filas. Los disparadores del servidor pueden actualizar fechas de modificación al restaurar.
- El catálogo de categorías es compartido. Se añaden las categorías que falten; las categorías existentes y sus nombres se mantienen. No se borran categorías compartidas que no estén en la copia. Un conflicto con la restricción de nombres únicos aborta la transacción.
- No se incluyen usuarios de Auth, contraseñas, tokens, políticas, esquema SQL, claves, archivos huérfanos del almacenamiento ni configuración interna de Supabase. La recuperación completa de infraestructura necesita además una copia técnica del servicio.
- La restauración sustituye el inventario visible; no combina inventarios ni restaura en otra cuenta/proyecto.
- Las fotos actuales no se sobrescriben ni se borran durante la restauración. Las fotos anteriores y las de intentos fallidos pueden quedar sin referencia y ocupar almacenamiento. No eliminarlas automáticamente: una respuesta perdida podría corresponder a una restauración que sí terminó.
- Procesamiento del ZIP en memoria: límite de **512 MB** de contenido, fotos de hasta **20 MB** y `datos.json` de hasta **25 MB**. Para inventarios mayores conviene un proceso de copia en servidor.
- No son copias programadas: el usuario debe descargar el ZIP. Los hashes detectan daños, pero no son una firma de autenticidad ni cifran el archivo. El ZIP contiene datos y fotos privados.
- JSZip 3.10.1 se sirve desde `vendor/`, con su licencia; no se carga dinámicamente desde terceros.

## Validación

Pruebas de formato y flujo, sin acceder a datos reales:

```sh
node --test tests/backup.test.cjs
```

La prueba SQL utiliza PostgreSQL mediante PGlite en memoria y aplica también el catálogo y sus disparadores reales del repositorio. Comprueba restauración, reversión completa, aislamiento entre usuarios, rechazo de otro proyecto, referencias, fotografías ausentes, concurrencia y activación repetible. Instalar `@electric-sql/pglite` en un directorio de pruebas externo al sitio y exponerlo mediante `NODE_PATH`:

```sh
NODE_PATH=/ruta/dependencias/node_modules node --test tests/restore-sql.test.cjs
```

Las pruebas de interfaz usan JSDOM en ese mismo directorio de dependencias:

```sh
NODE_PATH=/ruta/dependencias/node_modules node --test tests/backup-ui.test.cjs
```

Estas pruebas no ejecutan ninguna restauración sobre el inventario de producción. Antes de usar la restauración en producción, activar el SQL en el proyecto correcto y conservar una copia descargada.
