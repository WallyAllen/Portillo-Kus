# Panel de administración

El estudio edita contenido en `/panel`; cada guardado es un commit en
`WallyAllen/Portillo-Kus` y Workers Builds lo publica. Vive en el mismo Worker que
sirve el sitio, en `worker/`. No hay `package.json` ni dependencias: sólo APIs de la
plataforma, así Workers Builds sigue corriendo los mismos comandos de siempre.

Estado: base, login y guardado. Las pantallas de contenido, idiomas y usuarios
vienen después; hoy el panel sólo muestra Inicio.

## Antes de mergear a `main`

**Mergear sin hacer esto no rompe nada:** el sitio se sigue publicando igual,
`/panel` carga y `/api/*` responde 503 "todavía no está configurado". Comprobado
con `wrangler deploy --dry-run` y con `wrangler dev` sin base.

Para que el panel funcione hay que hacer, una sola vez, con la sesión de Cloudflare
de la cuenta del estudio:

1. **Confirmar el nombre del Worker.** `name` en `wrangler.jsonc` sigue siendo el
   provisorio `portillo-kus`; tiene que coincidir con el de Cloudflare.
2. **Crear la base D1** y copiar el `database_id` que imprime:

   ```bash
   npx wrangler@4 d1 create portillo-panel
   ```

3. **Pegar el id:** en `wrangler.jsonc`, descomentar el bloque `d1_databases` de
   arriba y reemplazar `PEGAR_ACA_EL_ID`. No es secreto; va commiteado.
4. **Crear las tablas:**

   ```bash
   npx wrangler@4 d1 migrations apply DB --remote
   ```

5. **Crear el token de GitHub:** GitHub → Settings → Developer settings →
   Fine-grained tokens. Resource owner: el dueño del repo. Repository access: sólo
   `WallyAllen/Portillo-Kus`. Permissions: **Contents: Read and write**, nada más.
   Anotar cuándo vence: al vencer, guardar da error hasta cargar otro.
6. **Cargar el token como secreto**, nunca en el repo:

   ```bash
   npx wrangler@4 secret put GITHUB_TOKEN
   ```

7. **Crear el primer admin.** Pide la contraseña sin mostrarla (mínimo 12 caracteres):

   ```bash
   node scripts/crear-admin.mjs --usuario felipe --nombre "Felipe" --remote
   ```

8. **Mergear a `main` y pushear** cuando Felipe lo decida: es un deploy a producción.

### Comprobar en el primer deploy

Lo siguiente no se puede probar en local. Si algo falla, el sitio no se afecta:

- [ ] **Entrar a `/panel`.** Si el login da error 1102 (*Worker exceeded CPU*), ver
      "Costo del login" abajo.
- [ ] Probar el build: si Workers Builds se queja por permisos de D1, revisar los
      permisos del token de la pestaña Build del Worker.
- [ ] `https://portillokusestudio.com/version.json` debe mostrar un sha real, no `local`.
- [ ] Guardar un cambio real y ver "Publicando…" → "Publicado".
- [ ] Workers Builds debe tardar menos de 5 minutos: si no, el panel dice "Hubo un
      problema" aunque después se publique.

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
| Qué se puede escribir | Sólo `src/content.<idioma>.json`, `src/equipo.json` e imágenes JPG, PNG o WebP de hasta 5 MB en `portillo-images/`, en `worker/guardado.js`. Aunque el token pueda más, el panel no toca código |

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

Hasta que exista la pantalla de usuarios:

```bash
npx wrangler@4 d1 execute DB --remote --command="DELETE FROM login_attempts WHERE usuario = 'felipe'"
```

```bash
npx wrangler@4 d1 execute DB --remote --command="UPDATE users SET activo = 0 WHERE usuario = 'felipe'"
```

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
   el límite es de 50 subpedidos.

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

## Sumar una pantalla

1. Crear `worker/panel/cliente/pantallas/<nombre>.js` (ver `inicio.js`). `render`
   recibe el contenedor y `{ usuario, api, guardar }`; `guardar` ya muestra el aviso
   de publicación.
2. Importarla y agregarla a `PANTALLAS` en `cliente/app.js`.
3. Importarla y agregarla a `ARCHIVOS` en `worker/panel/rutas.js`, con ruta
   `/panel/pantallas/<nombre>.js`.
4. Una ruta nueva de API es una entrada en `RUTAS` de `worker/api.js`.

`soloAdmin: true` sólo oculta la pantalla: la ruta de API también tiene que comprobar
`sesion.usuario.rol`.

## Probar en local

Necesita Node 22.7 o superior y `dist/` generado. No toca Cloudflare ni GitHub.

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
publicación y sitio estático. Usa los puertos 8787, 8788 y 8790.

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
