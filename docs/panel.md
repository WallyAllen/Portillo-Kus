# Panel de administración

El estudio edita contenido en `/panel`; cada guardado es un commit en
`WallyAllen/Portillo-Kus` y Workers Builds lo publica. Vive en el mismo Worker que
sirve el sitio, en `worker/`. El Worker no tiene dependencias: sólo APIs de la
plataforma. Las únicas dependencias de Node son de prueba y viven en
`worker/test/vitest/` (ver "Pruebas").

Para el estudio, sin términos técnicos: [guía del panel](guia-del-estudio.md).

## Arquitectura

```
navegador ── /panel/* ──▶ worker/panel/rutas.js   página, estilos, armazón y pantallas (texto)
          ── /api/*   ──▶ worker/api.js           sesión, CSRF y rol en cada pedido
                              ├─ worker/auth.js       contraseñas, sesiones, bloqueo   ─▶ D1
                              ├─ worker/usuarios.js   alta, baja, contraseña nueva      ─▶ D1
                              └─ worker/guardado.js   leer y escribir el contenido      ─▶ API de GitHub
          ── el resto ─▶ dist/ (capa de assets, sin ejecutar el Worker)

GitHub (rama del entorno) ──▶ Workers Builds: build.py --produccion + wrangler deploy ──▶ sitio nuevo
```

- **D1** guarda sólo usuarios, sesiones e intentos de login (`worker/migrations/`).
- **El contenido** vive en el repo: `src/content.*.json`, `src/equipo.json` y
  `portillo-images/`. El panel lo lee y lo escribe con la Git Data API, en un solo
  commit por guardado (ver "Cómo se guarda").
- **Publicación:** el panel sigue `/version.json` hasta ver su commit (ver "Publicación").
- **Validación:** antes de escribir, el Worker repite las reglas de `build.py` y las
  del panel. Lo que rompería la publicación no se commitea.

| Entorno | Worker | Rama | Base D1 | Indexa |
|---|---|---|---|---|
| Producción | `portillo-kus` | `main` | `portillo-panel` | sí |
| Prueba | `portillo-kus-pruebas` | `pruebas` | `portillo-panel-pruebas` | no (`NOINDEX=1`) |
| Local | `wrangler dev --env dev` | GitHub simulado | `.wrangler/` | no |

`vars` y `d1_databases` no se heredan entre entornos de `wrangler.jsonc`: el deploy de
producción no recibe nada de `pruebas`. Lo comprueban `tests/test_panel_reglas.py` y
`wrangler deploy --dry-run` con y sin `--env pruebas`.

## Pasos de Felipe

Requieren sus cuentas. **Hechos el 07/11/2026:** pasos 2, 3, 9 y 10. Las bases
`portillo-panel-pruebas` y `portillo-panel` existen en la cuenta del estudio
(`portillokus.estudio@gmail.com`, `account_id` fijado en `wrangler.jsonc`), con sus
tablas, y sus ids ya están en `wrangler.jsonc`. Producción no lee el bloque de prueba.
Con la base de producción ya declarada, el primer deploy de `main` que incluya el panel
necesita que el token de Workers Builds tenga permiso de D1 (paso 13). Si no lo tiene,
falla el deploy y el sitio sigue con la versión anterior: no se rompe. Los comandos van en la raíz del repo,
en la rama del panel (`claude/panel-1-base-dd3159`) salvo que se diga otra cosa.

**A. Worker de prueba**

1. **Entrar con la cuenta de Cloudflare del estudio** y confirmar que el Worker del
   sitio se llama `portillo-kus`, como `name` en `wrangler.jsonc`. Si no, cambiar
   `name`: el de prueba pasa a llamarse `<name>-pruebas`.

   ```bash
   npx wrangler@4 login
   ```

2. **Crear la base de prueba** y copiar el `database_id` que imprime:

   ```bash
   npx wrangler@4 d1 create portillo-panel-pruebas
   ```

   En `wrangler.jsonc`, dentro de `env.pruebas`, descomentar `d1_databases` (y la coma
   que lo separa de `vars`) y reemplazar `PEGAR_ACA_EL_ID_DE_PRUEBAS`. No es secreto.

   ```bash
   git commit -am "Panel: base D1 del Worker de prueba"
   ```

3. **Crear las tablas de prueba:**

   ```bash
   npx wrangler@4 d1 migrations apply DB --remote --env pruebas
   ```

4. **Crear la rama `pruebas` en GitHub** con el código del panel:

   ```bash
   git push origin claude/panel-1-base-dd3159:pruebas
   ```

5. **Crear el Worker de prueba** en el dashboard: Workers & Pages → Create → Import a
   repository → `WallyAllen/Portillo-Kus`.
   - Nombre: `portillo-kus-pruebas` (tiene que coincidir con el de `wrangler.jsonc`).
   - Rama de producción (Settings → Build → Branch control): `pruebas`. Desmarcar
     **Enable Preview Builds**.
   - Build command: `python -m pip install -r requirements.txt && python src/build.py --produccion`
   - Deploy command: `npx wrangler deploy --env pruebas`
   - Build variables: `NOINDEX=1`. Es del build, no del Worker: genera `noindex` y
     `Disallow: /`.
   - API token: el que propone Workers Builds. Si el deploy falla por D1, ver la
     comprobación 5.

   En el Worker de producción, en la misma pantalla, desmarcar **Enable Preview Builds**:
   si no, cada guardado del panel de prueba en `pruebas` dispara un build del Worker de
   producción.

6. **Token de GitHub de prueba:** GitHub → Settings → Developer settings →
   Fine-grained tokens. Resource owner: el dueño del repo. Repository access: sólo
   `WallyAllen/Portillo-Kus`. Permissions: **Contents: Read and write**, nada más.
   Anotar el vencimiento. Un token fine-grained no se limita a una rama: lo que hace que
   el de prueba escriba sólo en `pruebas` es `GITHUB_BRANCH` en `wrangler.jsonc`.

   ```bash
   npx wrangler@4 secret put GITHUB_TOKEN --env pruebas
   ```

7. **Primer admin de prueba.** Pide la contraseña sin mostrarla (mínimo 12 caracteres):

   ```bash
   node scripts/crear-admin.mjs --usuario felipe --nombre "Felipe" --remote --env pruebas
   ```

8. **Correr las comprobaciones reales** de la sección siguiente. Si alguna falla, no
   seguir con producción.

**B. Producción**

9. **Crear la base de producción** y copiar el `database_id`:

   ```bash
   npx wrangler@4 d1 create portillo-panel
   ```

   Descomentar el bloque `d1_databases` de arriba de `wrangler.jsonc` y reemplazar
   `PEGAR_ACA_EL_ID`.

   ```bash
   git commit -am "Panel: base D1 de producción"
   ```

10. **Crear las tablas:**

    ```bash
    npx wrangler@4 d1 migrations apply DB --remote
    ```

11. **Token de producción**, otro distinto del de prueba y con los mismos permisos:

    ```bash
    npx wrangler@4 secret put GITHUB_TOKEN
    ```

12. **Primer admin de producción:**

    ```bash
    node scripts/crear-admin.mjs --usuario felipe --nombre "Felipe" --remote
    ```

13. **Permisos de D1 del token de Workers Builds de producción:** si la comprobación 5
    obligó a sumar D1 en el Worker de prueba, hacer lo mismo en el de producción antes
    del merge.

14. **Mergear a `main`** cuando Felipe lo decida: es un deploy a producción. Se mergea la
    rama del panel, **nunca `origin/pruebas`**, que trae los cambios de contenido de
    prueba.

    ```bash
    git checkout main
    ```

    ```bash
    git pull origin main
    ```

    ```bash
    git merge --no-ff claude/panel-1-base-dd3159
    ```

    ```bash
    git push origin main
    ```

15. **Desde ahí, `main` recibe commits desde GitHub** cada vez que el estudio guarda.
    Antes de trabajar en local, `git pull`. Si un push se rechaza por estar atrasado,
    `git pull` y repetir; **nunca `--force` sobre `main`**: borraría lo que cargó el
    estudio. Para actualizar el Worker de prueba con código nuevo, `git push origin
    <rama>:pruebas`. Si se rechaza por los guardados de prueba, ahí sí se pueden
    descartar con `git push --force-with-lease origin <rama>:pruebas`.

## Comprobaciones reales en el Worker de prueba

No se pueden probar en local: `wrangler dev` y las pruebas de vitest no aplican los
límites de producción. Hacerlas antes del paso 9, en
`https://portillo-kus-pruebas.<subdominio>.workers.dev/panel`.

| # | Qué se hace | Qué se espera | Si falla |
|---|---|---|---|
| 1 | **CPU del login en el plan Free.** Entrar y salir 6 veces seguidas, y mirar Observability del Worker → CPU time de `POST /api/login` | Entra siempre. Cada login usa unos 100 ms de CPU | Error 1102 (*Worker exceeded CPU*): decide Felipe entre Workers Paid y bajar `ITERACIONES` (ver "Costo del login") |
| 2 | **Tope de PBKDF2.** El mismo login | Entra. Ningún log dice *iteration counts above 100000* | Ese mensaje significa que el hash no se está calculando en tramos: no mergear y revisar `TRAMO_MAXIMO` en `worker/auth.js` |
| 3 | **Guardado real con la API de GitHub.** Textos → cambiar "Paso 1" → Guardar | Aparece un commit `Panel (Felipe): Textos: Paso 1` en la rama `pruebas`, nunca en `main`; la barra de abajo pasa de "Publicando en el sitio…" a "Listo, ya se ve en el sitio" | 500 y en logs 401 o 403 de GitHub: el token venció o le faltan permisos. 404: `GITHUB_REPO` o el dueño del token. Si apareciera en `main`: borrar el token en GitHub y revisar `GITHUB_BRANCH` |
| 4 | **`WORKERS_CI_COMMIT_SHA` en un build real.** Abrir `/version.json` tras el build de la comprobación 3 | `{"sha": "<el commit de la comprobación 3>"}` | Dice `local`: Workers Builds no pasó la variable. El sitio funciona, pero el panel dice "Hubo un problema" a los 5 minutos. Revisar el log del build y `src/build.py` |
| 5 | **Permisos de D1 del token de Workers Builds.** Mirar el log del primer build con la base descomentada | El deploy termina y lista `env.DB (portillo-panel-pruebas)` | Error de autenticación al hacer el deploy: en Settings → Build → API token, sumarle **Account → D1 → Edit** y reintentar |
| 6 | **noindex.** Ver el código fuente de la portada y abrir `/robots.txt` | `<meta name="robots" content="noindex, nofollow">` y `Disallow: /` | Falta la variable `NOINDEX=1` del build (paso 5) |
| 7 | **Tiempo de publicación.** Medir desde Guardar hasta "Publicado" | Menos de 5 minutos | Si tarda más, el aviso dice "Hubo un problema" aunque después publique: subir `CINCO_MINUTOS` en `cliente/app.js` |

## Usuarios

Pantalla **Usuarios**, sólo para admin. La API comprueba el rol en cada pedido, no la
pantalla.

- **Crear:** nombre, usuario y qué puede hacer (`admin` o `editor`). El Worker genera
  una contraseña provisoria de 16 caracteres, la guarda con `hashContrasena` y la
  muestra **una sola vez**. No queda en D1 ni en los logs: `api.js` sólo registra el
  mensaje de error, nunca el cuerpo. Hay que pasársela a la persona por un medio privado.
- **Desactivar** cierra sus sesiones en el mismo momento. **Reactivar** le devuelve el
  acceso con la contraseña que tenía.
- **Nueva contraseña** reemplaza la anterior, cierra sus sesiones y borra sus intentos
  fallidos: también sirve para desbloquear a alguien.
- **El último admin activo no se puede desactivar.** La condición va en la misma
  sentencia SQL: dos admins que se desactivan a la vez no dejan el panel sin ninguno.
- **Primer acceso con clave provisoria:** el usuario debe elegir una contraseña de
  al menos 15 caracteres antes de editar. El cambio cierra todas sus sesiones.
  Las cuentas existentes mantienen su clave hasta que se restablezca desde Usuarios.
  Antes de desplegar esta versión, aplicar la migración D1 `0002_clave_provisoria.sql`
  en la base de cada entorno.
- Sin pantalla, desde la terminal:

  ```bash
  npx wrangler@4 d1 execute DB --remote --command="DELETE FROM login_attempts WHERE usuario = 'felipe'"
  ```

  `scripts/crear-admin.mjs` crea un usuario con la contraseña que se elija; es la
  única forma de crear el primero.

## Rotar el token de GitHub

Al vencer, guardar da "Hubo un problema" y en los logs aparece un 401 de GitHub. Para
cambiarlo, antes o después de que venza:

1. Crear un token nuevo con los mismos permisos (paso 6).
2. Cargarlo; reemplaza al anterior y rige desde el pedido siguiente:

   ```bash
   npx wrangler@4 secret put GITHUB_TOKEN
   ```

   Para el de prueba, con `--env pruebas`.
3. Guardar un cambio para probarlo, y recién después borrar el token viejo en GitHub.

## Deshacer un cambio

**Desde el panel.** *Historial → Volver a la versión anterior* deshace la última
publicación del panel (el commit `Panel (` más reciente de los últimos 30) con un commit
nuevo que deja sus archivos como estaban en su padre, traducciones pendientes
incluidas. Lo hacen `versionAnterior` y `restaurarVersion` en `worker/guardado.js`
(`GET /api/anterior`, `POST /api/restaurar`). Se niega, con el motivo en el diálogo,
si:

- después de ese commit otro tocó alguno de sus archivos (nunca pisa nada);
- tocó algo fuera de lo que escribe el panel, o es un merge;
- tocó traducciones y quien pide es una cuenta de edición;
- el resultado no pasa `validarRepo`.

Las fotos vuelven con el mismo blob, sin bajarlas ni subirlas. Una foto que ese commit
agregó (un abogado nuevo) queda en el repo. Volver atrás también es un commit
`Panel (`: hacerlo dos veces rehace lo deshecho. El panel sólo lo ofrece sin cambios
sin publicar en la pantalla. Pruebas: `worker/test/historial.test.mjs`.

**A mano.** Cada guardado es un commit `Panel (Nombre): descripción`, así que también
se deshace con `git revert`, que crea otro commit y no borra historia:

```bash
git pull origin main
```

```bash
git log --oneline --grep="Panel (" -20
```

```bash
git revert <sha>
```

```bash
git push origin main
```

Workers Builds republica en unos minutos. El revert también devuelve las traducciones
pendientes al estado anterior, porque van en el mismo commit. Si un guardado posterior
tocó el mismo archivo, `git revert` puede dar conflicto: a veces es más simple volver a
escribir el texto desde el panel. Una foto reemplazada se recupera igual, con el revert
del commit que la cambió.

## Git: el panel escribe en `main`

Una vez en uso, `main` en GitHub avanza con cada guardado. Antes de trabajar en local:
`git pull`. Un push con la rama atrasada lo rechaza GitHub; **nunca usar `--force`**:
borraría lo que cargó el estudio.

## Seguridad

| Qué | Cómo |
|---|---|
| Contraseñas | PBKDF2-SHA256, sal de 16 bytes, 210000 iteraciones (ver abajo) |
| Sesión | 7 días fijos. Cookie `__Host-panel_sesion`: HttpOnly, Secure, SameSite=Strict. En D1 sólo está el hash del token |
| CSRF | Toda escritura exige `Origin` igual al sitio, `Content-Type: application/json` y, con sesión, `X-CSRF-Token` |
| Bloqueo | 5 fallos por usuario en 15 minutos; también 20 por IP, para que no se prueben muchos usuarios. Conteo atómico: pedidos en paralelo no lo saltean. Un bloqueado no gasta CPU |
| Usuario desactivado | Pierde el acceso en el pedido siguiente |
| Encabezados | `_headers` no se aplica a lo que genera el Worker: noindex, CSP y demás están en `worker/http.js`. Además, `Disallow` en `robots.txt` |
| Qué se puede escribir | Sólo `src/content.<idioma>.json` (y ahí, la lista de `src/panel-campos.json`), `src/equipo.json` y fotos JPEG de hasta 5 MB con los nombres de "Pantallas de contenido", en `worker/guardado.js`. Aunque el token pueda más, el panel no toca código |
| Roles | Un `editor` sólo lee y escribe el español. `admin` además traduce y maneja usuarios. Un rol desconocido o ausente cuenta como `editor`. Se comprueba en la API |

### Por qué 210000 en tramos

workerd tiene un tope de 100000 iteraciones por llamada a PBKDF2
(`DEFAULT_MAX_PBKDF2_ITERATIONS`). **`wrangler dev` no lo aplica**: una llamada de
210000 pasa en local y puede fallar recién en producción, sin nadie que pueda entrar.
Por eso `worker/auth.js` encadena tramos: 100000 + 100000 + 10000, cada uno con la
salida del anterior como clave. El trabajo total para quien ataca es el pedido, pero
el resultado no coincide con un PBKDF2 de 210000 de otra herramienta. Hasta 100000 sí
es el estándar. Las iteraciones van en el hash: cambiarlas no invalida a los usuarios.

### Costo del login

Cada intento cuesta unos 100 ms de CPU (medido con `wrangler dev` en la PC de
desarrollo). El plan Free de Workers tiene un límite de **10 ms por pedido**, con
una tolerancia para excesos infrecuentes que Cloudflare no cuantifica. Un login es
infrecuente, así que es probable que entre, pero no se pudo probar.
Si aparece el error 1102 hay dos salidas, y la decisión es de Felipe:

- Workers Paid (USD 5 por mes, a verificar): no cambia nada del código.
- Bajar `ITERACIONES` en `worker/auth.js` y volver a crear los usuarios: gratis,
  pero una contraseña filtrada se adivina más rápido.

### Desbloquear o desactivar a alguien

Desde la pantalla Usuarios: ver "Usuarios" arriba.

## Cómo se guarda

`POST /api/guardar` con `{ base, descripcion, archivos: [{ ruta, texto } | { ruta, base64 }] }`.
`base` es el commit que devolvió `GET /api/archivo?ruta=…&ref=…` al leer.

1. Se comprueba que las rutas sean editables y que las imágenes lo sean de verdad.
2. Si `main` avanzó desde `base`: si tocó alguno de estos archivos, **409** con
   `conflicto: [rutas]` y no se escribe nada. Si tocó otros, el cambio entra arriba.
3. Se valida el resultado **contra el `main` de ese momento**, no contra `base`:
   422 con `errores: [textos]`.
4. Un único commit con todo junto (Git Data API), con mensaje
   `Panel (Nombre): descripción`, usuario y archivos.
5. Se mueve la rama **sin force**. Si alguien guardó en ese instante, se repite una
   vez desde el paso 1; si no alcanza, 409. Con el plan Free no entran más reintentos:
   el límite es de 50 subpedidos. El peor caso hoy (traducir a cuatro idiomas con una
   base vieja y una carrera) lo cubre una prueba, gracias a que `RepoGitHub` no lee dos
   veces la misma versión ni sube dos veces el mismo contenido durante un pedido.

## Traducciones pendientes

Editar el español no obliga a traducir en el momento: el sitio muestra el español en los
otros idiomas hasta que un admin cargue la traducción en la pantalla Traducciones.

`src/traducciones-pendientes.json` lo escribe sólo el servidor:

```json
{"pendientes": {"hero.sub": {"fecha": "2026-11-07T12:00:00.000Z", "viejo": {"en": "…", "pt": "…"}}}}
```

La clave es la de `content.*.json` o `equipo:<id>.<campo>`. Un idioma está pendiente
mientras figura en `viejo`, que guarda el español de su última traducción válida: si el
texto se edita dos veces, sigue siendo el primero. El texto nuevo no se guarda: sale de
`content.es.json`. El archivo no se publica en `dist/`.

**Cuándo se ve el español** (`src/traducciones.py`, copiado en `worker/traducciones.js`):

| El texto del idioma | Resultado |
|---|---|
| Vacío o con `[PENDIENTE]` | Español |
| Con la clave y el idioma en la lista | Español, aunque tenga un texto propio |
| Falta la clave, y está en la lista | Español |
| Falta la clave, y no está en la lista | Falla el build: es un error de programación |
| Sobra la clave | Falla el build, esté o no en la lista |

Si **el español** está vacío o con `[PENDIENTE]`, ningún idioma lo tapa: el bloque
`<!--si:clave-->` sigue oculto en todos y `--produccion` falla donde fallaba. Con la lista
vacía, el `dist/` sale idéntico byte a byte.

Un fragmento en español lleva `lang="es"` para lectores de pantalla y traductores: un
`<span lang="es">`, o el atributo en el `<p>` de cargo y biografía. No se marca dentro de
un atributo, `<title>`, `<script>` o `<style>`, que no admiten marcado.

**Registro.** `guardarCambios` compara el texto en la rama con lo que queda después de
guardar, y suma la lista al mismo commit. Las pantallas no tienen que hacer nada, y si el
texto no cambió no se registra nada. Un idioma sale de la lista si recibe un texto real o
si el español vuelve a lo que ya estaba traducido. La lista no cuenta para los conflictos:
se recalcula sobre el último `main`.

**La baja es por idioma**, no por clave. Si hiciera falta completar todos los idiomas, ruso
y chino, que no se publican, trabarían a inglés y portugués. Traducción y baja van en un
solo commit. Lo que se escribe en la pantalla da de baja el idioma aunque sea el texto que
ya estaba, para cuando el cambio en español no pide otra traducción: por eso los campos
arrancan vacíos y hay un botón "Usar la actual".

**Abogados.** Cada uno tiene un `id` en `equipo.json`, porque la posición cambia al sacar a
alguien. El panel exige que exista, sea único y cumpla `^[a-z0-9-]{1,40}$`: **una pantalla
que cree abogados tiene que generarlo**, y no cambiarlo después.

**Permisos, comprobados en la API:**

| | `admin` | Otro rol |
|---|---|---|
| `GET` y `POST /api/traducciones` | Sí | 403 |
| `content.es.json` | Lee y escribe | Lee y escribe |
| `content.<otro idioma>.json` | Lee y escribe | 403 |
| `equipo.json` | Completo | Recibe sólo `es`; al guardar se reponen los otros idiomas de la rama |
| `traducciones-pendientes.json` por `/api/archivo` o `/api/guardar` | 422 | 422 |

### Publicación

El build escribe `dist/version.json` con `WORKERS_CI_COMMIT_SHA`, la variable de
[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).
Sin esa variable dice `{"sha": "local"}`, que nunca coincide: un deploy manual se ve
como "no publicado" y no como un commit que no es. El archivo se revalida siempre
(`src/headers.py`).

`GET /api/publicacion?commit=` lo compara. También da "publicado" si lo servido
**contiene** al commit: dos guardados seguidos publican sólo el último, y sin esto el
primero marcaría un problema falso. El panel consulta cada 10 segundos y, a los 5
minutos sin coincidencia, avisa. El aviso sobrevive a recargar la página.

### Reglas duplicadas

`worker/validacion.js` copia en JS las reglas de `build.py --produccion`, porque el
Worker no corre Python. Python manda. Tres cosas detectan una desincronización, todas
dentro de `python -m unittest discover -s tests`:

- `tests/casos_validacion.json`: los mismos casos contra el build real y contra el JS
  (este lado, con `node --test`). Cada regla nueva suma un caso.
- `worker/reglas.json` se compara con las constantes de Python (idiomas, campos,
  claves que genera el build).
- `huellaPython` en `reglas.json`: un hash del código Python de las reglas. Si cambia,
  la prueba falla hasta revisar el JS y actualizarla, también cuando el cambio no
  afectaba a las reglas.

Donde el build fallaría por un dato con forma rara, el panel es más estricto: esos
casos llevan `"estricto": true` y sólo corren en JS.

## Pantallas de contenido

**Lista cerrada.** Lo único de `content.*.json` que se edita está en
`src/panel-campos.json`: los textos (clave, rótulo simple y largo máximo), las
reseñas y las fotos de servicios. Para sumar un texto, se agrega ahí; las pruebas
comprueban que la clave exista y que su largo alcance. `worker/campos.js` lo hace
cumplir en `/api/guardar`, comparando contra la rama: una clave fuera de la lista da
422 con **cualquier rol, también admin**. Ninguna pantalla necesita más, y una
excepción abriría de nuevo el riesgo del script. Para cambiar otro texto se edita el
repo.

**Caracteres.** El build no escapa los textos: el servidor rechaza `<` en todo
`content.*.json` que entra por el panel, traducciones incluidas. En un texto usado
dentro de un atributo, como la descripción de una foto, también rechaza `"`.
`equipo.json` sí se escapa al armar la página. Su LinkedIn tiene que empezar con
`https://www.linkedin.com/in/`, también en un borrador. El largo máximo se aplica al
español; una traducción puede ser más larga.

**Fotos.** El navegador siempre recodifica a JPEG con recorte y 1200 px como máximo
en el lado mayor (calidad 0.85), en `pantallas/imagen.js`. Esto descarta los datos
EXIF y evita subir un archivo cortado. Una foto sin decodificar, como HEIC en un
navegador que no la abre, da un aviso. El servidor verifica la estructura básica del
JPEG y sus dimensiones. Pillow decodifica los píxeles al preparar las variantes durante
el build. Los nombres permitidos son los de `panel-campos.json` y `abogado-<slug>.jpg`,
con el slug del `id` de un abogado de la lista. Por eso corregir un nombre no cambia el archivo.

**Fotos de servicios.** Los nombres siguen escritos en `template.html` y no se
pasaron a un dato: la foto nueva reemplaza el mismo archivo y `version_images` cambia
la URL por el hash. Así, si nadie cambia una foto, el `dist/` queda igual. La
descripción (`alt`) se edita junto con la foto: el servidor no acepta una foto sin una
descripción distinta, porque la anterior dejaría de ser cierta. La descripción entra
en traducciones pendientes como cualquier texto.

**Abogados.** La lista se ordena con Subir y Bajar. Publicar a alguien incompleto
abre su ficha con los avisos junto a cada campo. Eliminar saca la entrada de
`equipo.json` y sus pendientes. **El panel no borra archivos:** la foto vieja queda en
`portillo-images/`, pero el build no copia al `dist/` ninguna `abogado-*` que no use
alguien publicado. Una foto reemplazada se pisa, y queda sólo en el historial de git.

**Vista previa.** `pantallas/vista-abogado.js` copia el marcado de `equipo.render`, y
`tests/test_panel_reglas.py` compara los dos resultados. El CSS no se copia: se lee de
la portada publicada y se aplica en un shadow DOM con una hoja construida, lo que la
CSP del panel admite. Una foto recién guardada no se ve en la vista previa hasta que
termina la publicación.

**Avisos antes de guardar.** `pantallas/revisar.js` repite las reglas del servidor en
lenguaje simple. `worker/test/campos.test.mjs` y `abogados.test.mjs` comparan los dos
sobre los mismos casos.

**Horarios.** Los textos de horario se editan, pero `ESTUDIO["horario"]` en
`build.py`, que alimenta los datos estructurados para buscadores, no. Si cambia el
horario real, hay que actualizarlo en el repo.

## Interfaz

Sigue el modelo del panel de Llegando al Sol con la identidad de Portillo (bordó
`#9B1C31`, Georgia, los colores de `src/template.html`). Piezas en `worker/panel/cliente/`:

- `app.js`: sesión, barra lateral (menú, *Ver la página*, cuenta), encabezado por
  pantalla (`volanta`, `titulo`, `bajada` de cada pantalla) y seguimiento de la
  publicación. Una sesión vencida abre el diálogo `#reingreso` encima: la pantalla y
  lo escrito siguen ahí. Otra cuenta u otro rol al reingresar recarga la página.
- `barra.js`: la barra fija de abajo. La pantalla la usa con
  `barra.usar({ contar, publicar, previa?, etiqueta?, enPausa? })`; muestra
  *Todo publicado*, *N cambios sin publicar*, *Publicando en el sitio…* con progreso,
  *Listo* con *Ver el cambio*, o el problema. Ninguna pantalla tiene su propio botón de
  publicar.
- `pantallas/comun.js`: `campo()` con contador de caracteres, `marcarEditado()` (el
  punto por campo, con texto oculto para lectores de pantalla), `cargando()` (esqueleto
  en lugar de "Cargando…") y `borradorDeFormulario()`: con un borrador guardado, el
  formulario queda en pausa (fieldsets deshabilitados) hasta elegir *Seguir* o
  *Empezar de cero*; si es de otro commit, *Recuperar y revisar* o *Descartar*.
- `previa.js`: *Ver cómo queda*. Abre `/` en un iframe `sandbox="allow-same-origin"`
  (sin scripts) y le aplica encima los textos, reseñas y fotos sin publicar, con
  `textContent` y atributos de imagen. Por eso la CSP del panel suma `frame-src 'self'`;
  el sitio ya admite marcos del mismo origen. Un texto se busca por su valor publicado
  (los de `footer.` y `mobile.` en su zona); si no aparece, el diálogo lo avisa.
  Abogados usa su vista previa propia.
- `historial.js`, `ayuda.js`: el menú Historial, la guía lateral (`?`) y el recorrido
  de tres pasos la primera vez que se abre una pantalla de contenido
  (`localStorage` `portillo-panel:recorrido-visto`).

Fotos se publican juntas desde la barra, hasta 9 por vez (el servidor acepta 10
archivos, uno es el JSON). Las fotos elegidas y el editor de abogados no guardan
borrador: al cerrar la pestaña con cambios ahí, el navegador pregunta.

## Sumar una pantalla

1. Crear `worker/panel/cliente/pantallas/<nombre>.js` (ver `inicio.js`). `render`
   recibe el contenedor y `{ usuario, api, guardar, seguirPublicacion, barra, previa,
   encabezado, pantallas }`; `guardar` ya sigue la publicación en la barra, y
   `seguirPublicacion(commit)` es para otras rutas. Para publicar desde la barra,
   `barra.usar(...)` (ver "Interfaz").
2. Importarla y agregarla a `PANTALLAS` en `cliente/app.js`.
3. Importarla y agregarla a `ARCHIVOS` en `worker/panel/rutas.js`, con ruta
   `/panel/pantallas/<nombre>.js`. Lo mismo para un módulo nuevo de `cliente/`, con
   ruta `/panel/<nombre>.js`.
4. Una ruta nueva de API es una entrada en `RUTAS` de `worker/api.js`.

`soloAdmin: true` en la pantalla sólo la oculta. Para cerrar la API, `soloAdmin: true`
también en su entrada de `RUTAS`.

## Pruebas

Necesitan Node 22.7 o superior y `dist/` generado. No tocan Cloudflare ni GitHub.

```bash
python -m unittest discover -s tests
```

```bash
node --test "worker/test/*.test.mjs"
```

```bash
node worker/test/e2e.mjs
```

La última levanta `wrangler dev`, D1 local en una carpeta temporal y un GitHub
simulado, y recorre login, bloqueo, CSRF, cierre de sesión, guardado, conflictos,
traducciones, permisos por rol, publicación y sitio estático. Usa los puertos 8787, 8788 y 8790.

Las de vitest corren la API dentro de workerd con la configuración de `wrangler.jsonc`
(entorno `dev`), D1 en memoria y el GitHub simulado en el puerto 8792: login, sesión,
CSRF, permisos, validación y usuarios.

```bash
cd worker/test/vitest && npm ci && npx vitest run
```

**Por qué en una subcarpeta.** Workers Builds instala dependencias por su cuenta cuando
encuentra un `package.json`, y su documentación no detalla en qué casos. Con el
directorio raíz en `/` y sin `package.json` en la raíz, el build y el deploy siguen sin
instalar nada; vitest sólo existe en `worker/test/vitest/`. El paquete es
`@cloudflare/vitest-plugin`: `@cloudflare/vitest-pool-workers` es su nombre anterior,
deprecado en npm. Las pruebas de `node --test` siguen: cubren el guardado contra el
GitHub simulado con ganchos (carreras, conteo de subpedidos) que vitest no reemplaza.

**Lo que ninguna prueba local cubre:** el tope de 100000 iteraciones de PBKDF2 y el
límite de CPU no rigen en `wrangler dev` ni en vitest. `auth.test.mjs` simula el tope;
lo real está en "Comprobaciones reales".

## Probar en local a mano

Para mirar el panel a mano, con la base en `.wrangler/`:

```bash
npx wrangler@4 d1 migrations apply DB --local --env dev
```

```bash
node scripts/crear-admin.mjs --usuario prueba --nombre "Prueba" --local --env dev
```

```bash
npx wrangler@4 dev --env dev --var GITHUB_TOKEN:token-de-prueba
```

El entorno `dev` apunta a `http://127.0.0.1:8788`: sin un GitHub simulado ahí, entrar
funciona pero guardar da error. Es lo esperado, y evita escribir en el repo real.
`wrangler deploy` avisa que hay varios entornos definidos: sin `--env` publica el de
siempre, y el aviso no impide el deploy.
