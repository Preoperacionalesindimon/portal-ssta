# Portal SSTA — INDIMON

Permisos de trabajo e inspecciones de seguridad, diligenciados desde el celular
o la tablet en planta. Funciona sin señal y sincroniza cuando vuelve la conexión.

**Sitio:** https://preoperacionalesindimon.github.io/portal-ssta/

---

> **¿Te estás haciendo cargo de esto sin haberlo construido?** Lee primero
> [TRASPASO.md](TRASPASO.md): explica cómo está armado, por qué, y dónde están
> los peligros.

## Cómo está armado

Son **dos mitades** que se despliegan por separado:

| | Qué es | Dónde vive | Cómo se actualiza |
|---|---|---|---|
| **Sitio web** | Los formularios, el portal, el dashboard | Este repositorio → GitHub Pages | Subiendo los archivos al repositorio |
| **Backends** | Guardado en Google Sheets y envío de correos | Proyectos de Google Apps Script | Copiando y pegando en cada proyecto |

Los `.gs` de la carpeta `backends/` **son la copia de referencia**. Cuando
cambies algo en Apps Script, trae el cambio también aquí — si no, se pierde el
historial y no hay a qué volver si algo se rompe.

### Archivos del sitio

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Portada con el buscador y las categorías |
| `dashboard.html` | Permisos abiertos, cerrados y EPP pendiente de reponer |
| `permiso-*.html` | Los 5 formularios de permiso (solo su parte propia) |
| `permiso-core.js` | Toda la lógica compartida de los 5 permisos |
| `inspeccion-epp.html` | Inspección de EPP (SSTA-F-006) |
| `ats.html` | ATS interactivo (SSTA-F-007): tareas una a una, peligros GTC 45, controles, firmas e impresión con la forma del Excel |
| `backends/backend-ats.gs` | Backend del ATS (hoja propia) |
| `pruebas/simulador-apps-script.js` | Ejecuta los backends `.gs` en Node para probarlos sin Google |
| `ats-catalogo.js` | **Base de conocimiento del ATS**: peligros, consecuencias, controles, tareas tipo, EPP, herramientas. Se edita sin tocar la pantalla |
| `logo-indimon.png` | Logo del encabezado de los formatos impresos |
| `personal-autorizado.html` | Anexo de personal autorizado |
| `common.js` | Firmas, modo sin conexión, cola de envíos, banner de actualización |
| `common.css` | Sistema de diseño: colores, tipografía, componentes compartidos |
| `config.js` | **Token y URLs de los backends** |
| `sw.js` | Service Worker: caché y funcionamiento sin señal |
| `manifest.json` | Permite instalar el portal como app |

### Backends

```
backends/
├── permisos/
│   ├── core.gs              ← IDÉNTICO en los 5 proyectos de permisos
│   ├── config-caliente.gs   ← lo único propio de cada uno
│   ├── config-alturas.gs
│   ├── config-confinados.gs
│   ├── config-izajes.gs
│   └── config-electrico.gs
├── backend-epp.gs
└── backend-personal-autorizado.gs
```

Los cinco permisos comparten `core.gs`. Antes cada uno tenía su propia copia
completa de ~700 líneas y solo se diferenciaban en cuatro textos de correo:
cualquier arreglo había que aplicarlo cinco veces, y bastaba olvidar uno para
que ese permiso se quedara atrás sin que nadie lo notara.

---

## Antes de subir nada: correr las pruebas

```bash
node pruebas/pruebas.js
```

Tarda dos segundos y revisa 130 cosas: que las firmas no se pierdan, que las
listas del EPP coincidan entre navegador y servidor, que el token sea el mismo
en todas partes, que no falte ningún archivo en la caché, que todo compile.

**Si algo sale en rojo, no subas.** Estas pruebas existen por el bug de las
firmas: durante semanas se guardaron permisos sin firma porque el PNG superaba
el máximo de una celda de Google Sheets. Nada fallaba a la vista —la pantalla
decía "Firmado ✓"— y se descubrió por casualidad revisando un permiso viejo.

Requiere Node.js instalado. No necesita instalar nada más.

---

## Desplegar el sitio web

1. Corre las pruebas (arriba).
2. **Si tocaste `common.js`, `common.css`, `config.js`, `permiso-core.js`, un
   `.html` o un ícono → sube `CACHE_NAME` en `sw.js`.**

   ```js
   const CACHE_NAME = 'ssta-portal-v36';   // ← v37, v38…
   ```

   Sin esto los celulares siguen mostrando la versión vieja indefinidamente,
   aunque los archivos nuevos ya estén publicados. Ya nos pasó: pensamos que un
   arreglo no servía cuando en realidad nunca llegó al dispositivo.
3. Sube los archivos al repositorio. GitHub Pages publica en uno o dos minutos.
4. En el celular, abre el portal: sale el banner **"Hay una versión nueva"**.
   Acéptalo. Hasta que no lo aceptes, sigues con la versión anterior.

---

## Desplegar un backend

### Un permiso (caliente, alturas, confinados, izajes, eléctrico)

Cada permiso es un proyecto de Apps Script con **dos archivos**:

1. Abre el proyecto → pega el contenido de `backends/permisos/core.gs` en el
   archivo `core.gs`. **Sin editar nada**: es el mismo texto para los cinco.
2. El archivo `config-<tipo>.gs` casi nunca cambia. Solo si cambia el nombre
   del formato o hay que rotar el token.
3. **Implementar → Gestionar implementaciones → ✏️ Editar → Versión: Nueva
   versión → Implementar.**

> ⚠️ **Nunca uses "Nueva implementación".** Eso genera una URL distinta y toca
> actualizar `config.js` con la nueva. "Nueva versión" conserva la URL.

Despliega **uno primero**, pruébalo, y sigue con los otros cuatro. Así, si algo
sale mal, solo hay que revertir uno.

### EPP o Personal autorizado

Igual, pero es un solo archivo (`backend-epp.gs` / `backend-personal-autorizado.gs`).

### ATS (primera vez)

El ATS tiene su propia hoja de cálculo. Solo se hace una vez:

1. En Google Drive, **crear una hoja de cálculo nueva** (por ejemplo "ATS SSTA-F-007 — Registro").
2. En esa hoja: **Extensiones → Apps Script**. Borrar lo que haya y pegar
   todo `backends/backend-ats.gs`. Guardar.
3. **Implementar → Nueva implementación → ⚙️ Aplicación web.**
   Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**.
   Implementar y autorizar los permisos que pida Google.
4. Copiar la URL que termina en `/exec` y pegarla en `config.js`, en
   `BACKENDS.ats.url`.
5. Probar abriendo en el navegador: `<URL>?action=ping&token=<API_TOKEN>`.
   Debe responder `{"ok":true,"servicio":"ATS SSTA-F-007"}`.
6. Subir `config.js` al sitio (y el resto de archivos de la versión).

Las pestañas (ATS, Datos, Firmas, Peligros, Eventos) se crean solas con el
primer guardado. Para cambios posteriores del `.gs`: **Nueva versión**, nunca
"Nueva implementación" (ver arriba).

### Si es la primera vez que se despliega

Al ejecutarse, Google pide autorizar permisos (hojas de cálculo y envío de
correo). Es normal: acepta con la cuenta que debe aparecer como remitente de
los correos automáticos.

---

## ATS interactivo: cómo mantener la base de conocimiento

Todo lo que el ATS sugiere sale de `ats-catalogo.js`. Es solo datos, así que
se puede ajustar sin tocar la pantalla:

- **Agregar un control** a un peligro: añadirlo a su lista `controles` con la
  letra de jerarquía (E eliminación, S sustitución, I ingeniería,
  A administrativo, P EPP).
- **Agregar un peligro**: copiar uno existente, darle un `id` nuevo y
  asignarle una de las 7 clases de la GTC 45.
- **Agregar una tarea tipo**: añadirla a `TAREAS` con los ids de sus peligros
  y, si aplica, las tareas que suelen seguirla (`siguiente`).
- **Código del formato**: `ATS_FORMATO.codigo`. En los ATS de referencia
  aparecen SSTA-F-007 y SSTA-F-046 para el mismo formato; dejar aquí el
  vigente según el listado maestro.

Después de editar: `node pruebas/pruebas.js` (revisa que no queden
referencias rotas) y subir `CACHE_NAME` en `sw.js`.

### Cómo guarda el ATS

- Mientras se diligencia, todo queda como **borrador en el dispositivo**.
- **☁️ Guardar** lo sube al servidor con un código `ATS-AAAAMMDD-NNNNNN`,
  vuelve a leerlo y compara que haya llegado completo (tareas, peligros,
  participantes y firmas). Se puede guardar las veces que haga falta: cada
  guardado es una versión nueva y queda en la bitácora ("Eventos").
- **Sin señal**: queda en la cola y se sube solo cuando vuelve la conexión.
- **Dos dispositivos con el mismo ATS**: si uno guardó una versión más nueva,
  el otro recibe un aviso en vez de borrarle las firmas; puede abrir la del
  servidor o, confirmando, sobrescribir.
- **📁 Abrir** lista los ATS guardados. También se abre directo con
  `ats.html?code=ATS-...`.
- **Gente que llega después a la obra**: botón «👷 Llegó más gente» (en
  Participantes), «+ Personal» en 📁 Abrir, o el enlace/QR
  `ats.html?code=ATS-...&agregar=1` que se puede mandar por WhatsApp. Ese modo
  solo SUMA personas al ATS del servidor (no toca tareas ni firmas, y no choca
  con quien lo esté editando). Cada persona queda con la hora de ingreso y
  con la constancia de que se le socializó el ATS; en la hoja impresa aparece
  como «(ingresó dd-mm hh:mm · ATS socializado)». Si la cédula ya está, no se
  duplica.

Hojas del backend: **ATS** (una fila por ATS, para consultar), **Datos** (el
contenido completo, troceado porque un ATS grande no cabe en una celda),
**Firmas**, **Peligros** (una fila por peligro con su clase GTC 45 y cuántos
controles de cada jerarquía: sirve para indicadores) y **Eventos**.

Mantenimiento: en el editor de Apps Script están `auditarIntegridad`
(revisa todos los ATS: firmas perdidas, participantes sin firma, peligros sin
controles) e `investigarATS` (historia completa de un código; cambiar
`CODIGO_A_INVESTIGAR` antes de ejecutar).

## Tareas de mantenimiento

### Rotar el token

El mismo token vive en **8 sitios**: `config.js` y los 7 archivos de backend.
El riesgo no es el cambio, sino la ventana en que unos ya tienen el nuevo y
otros no — con la caché de por medio, eso puede durar días. Por eso va en tres
fases:

**Fase 1 — el backend acepta los dos.** En cada backend:

```js
const API_TOKEN = 'EL_NUEVO';
const API_TOKEN_ANTERIOR = 'EL_VIEJO';        // temporal
function checkToken_(token) {
  return token === API_TOKEN || token === API_TOKEN_ANTERIOR;
}
```

Despliega como "Nueva versión". Todo sigue funcionando igual.

**Fase 2 — el sitio pasa al nuevo.** Cambia `API_TOKEN` en `config.js`, sube
`CACHE_NAME` y publica. Los dispositivos van migrando a medida que se conectan.

Espera unos días. Para saber si ya nadie usa el viejo, mira la hoja **Eventos**
de cada backend: si no aparecen rechazos nuevos por `Token inválido`, listo.

**Fase 3 — retirar el viejo.** Borra `API_TOKEN_ANTERIOR` y el `|| token ===`
del `checkToken_`. Despliega de nuevo.

*Cuándo rotar:* si alguien con acceso al código deja el equipo, si el token
quedó expuesto, o por higiene cada 6-12 meses.

### Auditar lo que ya está guardado

Revisa permiso por permiso lo que YA está en las hojas y dice cuál quedó
incompleto por los fallos que se corrigieron después. No modifica nada.

En cada backend: editor de Apps Script → elegir `auditarIntegridad` en el
desplegable → **Ejecutar**. Escribe el detalle en una pestaña `Auditoria` y
manda el resumen por correo.

Distingue dos cosas que parecen iguales y no lo son:

- **"sin firma"** — esa persona nunca firmó.
- **"firma con la imagen perdida"** — sí firmó, pero la imagen no llegó a
  guardarse. Es el rastro del fallo de las 50.000 celdas. No se recupera.

Conviene correrla una vez ahora, para saber el tamaño real del daño.

### Vigilar intentos con token inválido

El token está en `config.js`, que es público. **No se puede esconder** con un
sitio estático: restringir el despliegue al dominio de Google rompería el
portal, porque las peticiones salen sin sesión iniciada.

Lo que sí se puede es notarlo. `instalarVigilancia()` — ejecutar **una vez**
en cada backend — revisa la bitácora cada día y avisa por correo si alguien
intentó con un token equivocado. El portal siempre manda el correcto, así que
esos intentos no los causa un trabajador usando la aplicación.

### Cuando las hojas crezcan

Las hojas **Firmas** y **Eventos** crecen sin tope. Con 15 permisos al día son
unas 67.000 filas al año en Firmas. Hoy las búsquedas son dirigidas
(`TextFinder`), así que no es urgente, pero llegado el momento conviene archivar
en otra hoja los permisos cerrados de más de un año.

### Correos y avisos configurados

| Qué | A dónde | Dónde se cambia |
|---|---|---|
| Reposición de EPP | `ana.bohorquez@indimon.com.co` | `CORREOS_REPOSICION` en `backend-epp.gs` |
| Foto para aprobación | WhatsApp +57 317 4045681 | `WA_NUMERO` en `inspeccion-epp.html` |
| Resumen del día | ver el archivo | `CORREOS_RESUMEN` en `backend-epp.gs` |

---

## Decisiones que conviene no deshacer

Cosas que parecen mejorables pero se dejaron así a propósito:

- **Las firmas se exportan a resolución acotada.** Google Sheets no admite más
  de 50.000 caracteres por celda. Sin el tope, las firmas de tablets grandes se
  perdían en silencio.
- **El servidor recalcula qué EPP está en MALO**, no confía en lo que manda el
  navegador. El correo de reposición es el efecto real del formato y debe
  corresponder a lo que quedó guardado.
- **`.radio-row label` sigue dentro de cada `permiso-*.html`.** Tiene la misma
  especificidad que `.field label` y en Espacios Confinados hay radios dentro de
  un `.field`: al centralizarla, cambiaría cómo se ven esas etiquetas.
- **Los `@media` no se centralizan.** Una regla dentro de un `@media` movida a
  global aplicaría siempre, y ese error no se ve hasta que alguien gira el
  celular o imprime.
- **La bitácora (`Eventos`) registra también los intentos rechazados.** Un
  intento de tocar un permiso cerrado es justo lo que uno querría poder
  demostrar después.
- **El pendiente de EPP sale de la última inspección**, no de la suma del
  historial: sumar mostraría como pendiente lo que ya se repuso.

---

## Si algo falla

| Síntoma | Revisar primero |
|---|---|
| Un arreglo "no sirvió" | ¿Subiste `CACHE_NAME`? ¿Aceptaste el banner? |
| Las firmas no aparecen | Hoja **Firmas** del backend: ¿hay filas para ese código? |
| "Token inválido" | ¿Coincide `config.js` con el backend? Lo verifican las pruebas |
| Un permiso no se guarda | Hoja **Eventos**: ahí queda el motivo del rechazo |
| La página no carga sin señal | ¿Está el archivo listado en `sw.js`? Lo verifican las pruebas |

Para diagnosticar en un dispositivo concreto, abre cualquier formulario de
permiso agregando `?debug=1` a la dirección: sale un panel que muestra el estado
real de las firmas y los errores de JavaScript, sin necesidad de consola ni cable.
