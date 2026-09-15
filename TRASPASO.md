# Traspaso del Portal SSTA

Este documento es para **otra persona**: alguien que tenga que hacerse cargo
del portal sin haberlo construido. No repite el README (que explica cómo
desplegar); explica cómo está armado, por qué, y dónde están los peligros.

Si lo estás leyendo porque quien lo mantenía ya no está: **el portal sigue
funcionando solo**. No hay nada que hacer con urgencia. Tómate el tiempo de
leer esto completo antes de tocar nada.

---

## 1. Qué es esto y qué peso tiene

Permisos de trabajo de alto riesgo (alturas, caliente, espacios confinados,
izajes, eléctrico), inspecciones de EPP y registro de personal autorizado,
diligenciados desde el celular en planta.

**No son notas internas.** Son documentos que en Colombia sustentan decisiones
de seguridad y que un inspector del Ministerio de Trabajo puede pedir. Un
permiso sin firmas, o un espacio confinado sin su lectura de gases, es un
problema legal para la empresa y para quien firmó.

Eso condiciona todas las decisiones técnicas que verás. Cuando dudes entre
"rápido" y "que no se pierda un dato", siempre es lo segundo.

---

## 2. Las dos mitades

```
   El celular / la tablet
            │
            ├─── Sitio web (GitHub Pages)  ← este repositorio
            │      formularios, portal, dashboard
            │
            └─── Backends (Google Apps Script)  ← 7 proyectos
                   guardan en Google Sheets y mandan correos
```

Se despliegan **por separado** y por caminos distintos. Es el error más común:
subir el sitio y olvidar el backend, o al revés.

Los `.gs` de `backends/` en este repositorio son la **copia de referencia**.
Si cambias algo en Apps Script, tráelo también aquí o se pierde el historial.

### Los 7 proyectos de Apps Script

| Proyecto | Archivos que tiene |
|---|---|
| Caliente, Alturas, Confinados, Izajes, Eléctrico | `core.gs` (idéntico en los 5) + `config-<tipo>.gs` |
| Inspección de EPP | `backend-epp.gs` |
| Personal autorizado | `backend-personal-autorizado.gs` |

Cada uno tiene su propia hoja de cálculo con las pestañas `Permisos`,
`Firmas`, `Eventos` y (tras auditar) `Auditoria`.

---

## 3. Lo que tienes que entender sí o sí

### Las firmas van aparte del permiso

Una firma es una imagen que pesa decenas de miles de caracteres. Google Sheets
**no admite más de 50.000 caracteres en una celda**. Por eso:

- El navegador exporta la firma a resolución acotada antes de enviarla.
- El backend la parte en trozos si aún no cabe, y los vuelve a unir al leer.
- En el JSON del permiso solo queda una referencia corta (`SIGREF:abc123`).

**Nunca quites ninguna de esas tres piezas.** Sin ellas las firmas se pierden
en silencio: el permiso se guarda, la pantalla dice "Firmado ✓" y la imagen no
queda. Ya pasó, durante semanas, y se descubrió por casualidad.

### El portal verifica cada guardado

Después de guardar, el portal **vuelve a leer el permiso del servidor y
compara**: firmas, ejecutantes, lecturas. Si no coincide, avisa fuerte y no
borra el borrador.

Esto existe porque el sistema perdió datos en silencio tres veces. Es la única
defensa contra que vuelva a pasar sin que nadie se entere. **No la quites
porque "hace una consulta de más".**

### La bitácora es intocable

Cada backend escribe en la pestaña `Eventos` una fila por **cada intento** de
escritura: aplicado, rechazado o duplicado. Incluso los rechazados.

Eso es a propósito: un intento de modificar un permiso ya cerrado es justo lo
que querrías poder demostrar en una investigación. Protege esa pestaña en
Google Sheets y no la borres para "ahorrar espacio".

**Si algo raro pasa, la respuesta casi siempre está ahí.** Así se encontraron
dos de los tres fallos graves.

### El token es público y no tiene arreglo

`config.js` contiene el token que los backends validan, y es un archivo público.
Cualquiera que abra el código del sitio lo ve.

No se puede esconder: el sitio es estático y las peticiones salen sin sesión de
Google. Restringir el despliegue al dominio rompería el portal.

Lo que hay en su lugar:
- La bitácora deja rastro de todo.
- `revisarIntentosSospechosos()` avisa por correo si alguien prueba con un
  token inválido.
- El procedimiento de rotación en tres fases del README.

No es ideal. Es lo que se puede con esta arquitectura, y conviene que quien
tome decisiones lo sepa.

---

## 4. Antes de tocar nada

```bash
node pruebas/pruebas.js
```

137 comprobaciones, dos segundos. **Córrelas antes y después de cualquier
cambio.** Si algo sale en rojo, no subas.

Sé honesto sobre qué son: la mayoría verifica que ciertas piezas de código
sigan existiendo — protegen contra quitar sin querer algo que costó encontrar,
y contra errores de despliegue. **No garantizan que el sistema funcione bien.**
Probar en un celular real sigue siendo obligatorio.

---

## 5. Los errores que ya cometimos

Para que no los repitas:

**Subir el sitio sin cambiar `CACHE_NAME` en `sw.js`.** Los celulares siguen
con la versión vieja indefinidamente. Perdimos horas creyendo que un arreglo no
servía cuando nunca había llegado al dispositivo.

**Usar "Nueva implementación" en vez de "Nueva versión".** Cambia la URL del
backend y hay que actualizar `config.js`. Siempre "Nueva versión".

**Arreglar algo en un solo sitio.** Casi todos los fallos graves vinieron de
código duplicado: el motor de firmas, el CSS, los cinco backends. Ya está
unificado — **si vas a copiar y pegar algo, para y busca dónde centralizarlo.**

**Guardar datos del envío dentro del permiso.** `firstSave` y `opId` describen
la petición, no el documento. Guardarlos hizo que el servidor confundiera
reenvíos legítimos con reintentos y descartara guardados en silencio.

---

## 6. Diagnóstico rápido

| Síntoma | Primero revisa |
|---|---|
| "El arreglo no sirvió" | ¿Subiste `CACHE_NAME`? ¿Aceptaron el banner? |
| Faltan firmas | Pestaña `Firmas`: ¿hay filas con ese código? |
| No guarda algo | Pestaña `Eventos`: ahí está el motivo del rechazo |
| "Token inválido" | ¿`config.js` coincide con el backend? |
| No funciona sin señal | ¿El archivo está listado en `sw.js`? |

**En un dispositivo concreto:** abre cualquier permiso agregando `?debug=1` a
la dirección. Sale un panel que muestra el estado real de las firmas y los
errores, sin consola ni cable. Se hizo para diagnosticar una tablet en planta.

---

## 7. Mantenimiento periódico

| Cada cuánto | Qué |
|---|---|
| Una vez, y luego si hay dudas | `auditarIntegridad()` en cada backend: revisa lo ya guardado y dice qué quedó incompleto |
| Una vez | `instalarVigilancia()` y `instalarResumenDiario()`: instalan los avisos automáticos |
| Cada 6-12 meses, o si alguien se va | Rotar el token (procedimiento en el README) |
| Cuando guardar se sienta lento | Archivar permisos cerrados de más de un año |

---

## 8. Lo que está pendiente

Con honestidad, para que no lo descubras a golpes:

- **Las hojas crecen sin tope.** Con 15 permisos diarios son ~67.000 filas al
  año solo en `Firmas`. Hoy sobra margen; en un par de años habrá que archivar.
- **El despliegue es manual y de varios pasos.** Funciona porque se hace con
  cuidado. No perdona un día de afán.
- **Se perdieron datos antes de los arreglos.** Corre `auditarIntegridad()`
  para saber cuáles. Los permisos cerrados incompletos no se pueden completar.
- **No hay pruebas de comportamiento real**, solo de estructura.

---

## 9. Si tienes que cambiar algo

1. Corre las pruebas primero, para partir de verde.
2. Haz el cambio en el sitio **centralizado** que corresponda (`common.js`,
   `common.css`, `permiso-core.js`, `core.gs`), nunca copiando en cinco lados.
3. Corre las pruebas otra vez.
4. Sube `CACHE_NAME` si tocaste algo del sitio.
5. Despliega **un backend primero**, pruébalo, y sigue con el resto.
6. Prueba en un celular real: crear, firmar, guardar, cerrar y reabrir.

El paso 6 no es opcional. Los tres fallos graves de este portal pasaron todas
las revisiones de código y solo aparecieron usándolo de verdad.
