# P11 parcial — inventario del dominio

Relevamiento de solo lectura: **10/10/2026**, hora Argentina (UTC−3).
No se cambió DNS, registro, bloqueo, titularidad ni cuenta. No se publicó el sitio.
P11 operativo sigue pendiente de la cuenta del estudio, la decisión del titular y el proveedor.

## Registro y administración

| Dato | Resultado verificado |
| --- | --- |
| Dominio | `portillokusestudio.com` |
| Registrador | easyDNS Technologies Inc., IANA 469 |
| Alta | 13/12/2024, 14:21:44 UTC |
| Vencimiento del registro | **13/12/2026, 14:21:44 UTC** (11:21:44 Argentina) |
| Último cambio | 14/12/2025, 19:56:58 UTC |
| Estado | `clientTransferProhibited` y `clientUpdateProhibited` (RDAP: `client transfer prohibited`, `client update prohibited`) |
| DNSSEC | RDAP `delegationSigned: false`; sin delegación firmada informada |
| NS en el registro | `motorhead.easydns.org`, `nirvana.easydns.net`, `rush.easydns.com` |
| Titular registrante | **[PENDIENTE]** confirmar con proveedor; el RDAP del registro no lo identifica |

Fuente directa: [RDAP de Verisign](https://rdap.verisign.com/com/v1/domain/portillokusestudio.com), respuesta obtenida el 10/10/2026, última actualización de su base `2026-10-10T16:05:04Z`.
El administrador comercial **laofertaylademanda.com / Weebyaa** figura en la nota interna `Pendientes de Portillo Kus` del vault; no se deduce del DNS ni se verificó esa relación con el proveedor en esta tarea.

La transferencia entre registradores está bloqueada. También hay bloqueo de actualización: pedir al proveedor que indique cómo permitirá el cambio de nameservers cuando corresponda. Los significados están en [ICANN, estados EPP](https://www.icann.org/resources/pages/epp-status-codes-2014-06-16-en).

## Registros públicos actuales

Consultas con `Resolve-DnsName` a `1.1.1.1`, contrastadas con `nslookup` a `8.8.8.8`; controles de DMARC/DKIM contra el autoritativo `rush.easydns.com`. TTL observado en las respuestas positivas: **3600 segundos** (puede disminuir por caché).

`@` representa `portillokusestudio.com`.

| Nombre consultado | Tipo | Resultado | Observación |
| --- | --- | --- | --- |
| `@` | NS | `nirvana.easydns.net`, `motorhead.easydns.org`, `rush.easydns.com` | DNS autoritativo en easyDNS |
| `@` | A | `66.45.232.93` | Destino web actual; no acredita que sirva el nuevo sitio |
| `@` | AAAA | Sin respuesta AAAA; SOA en autoridad | NODATA, no IPv6 publicado observado |
| `@` | CNAME | Sin respuesta CNAME; SOA en autoridad | NODATA |
| `@` | MX | Prioridad **0**, `mx-caprica.easydns.com` | Conservar exactamente antes de cualquier delegación |
| `@` | TXT | `google-site-verification=_p3l7msxZtbxZkd0b6Icpm7nByWsoOFwyOK7R7EVf3E` | Conservar exactamente; token DNS público, no contraseña |
| `@` | TXT / SPF | No hay TXT que empiece por `v=spf1` | Ausencia observada; no crear una política sin confirmar proveedor/emisores |
| `www` | CNAME | `portillokusestudio.com` | Alias del dominio raíz |
| `www` | A | CNAME anterior → `66.45.232.93` | El A pertenece al raíz, no es un A propio de www |
| `www` | AAAA | CNAME → raíz sin AAAA | Sin IPv6 observado |
| `www` | NS, MX, TXT | CNAME → registros del raíz | No son registros independientes de www |
| `_dmarc` | TXT, CNAME | NXDOMAIN | No hay política DMARC publicada en ese nombre |

### DKIM

Se consultaron TXT y CNAME de estos **nueve selectores comunes**, todos con resultado NXDOMAIN:

`default`, `google`, `selector1`, `selector2`, `s1`, `s2`, `mail`, `dkim`, `k1`.

Formato consultado: `<selector>._domainkey.portillokusestudio.com`.
Esto no demuestra que no exista DKIM: los selectores son elegidos por cada proveedor y pueden ser otros. Pedir la zona completa y el selector real si hay envío desde el dominio; no considerar esta búsqueda una exportación exhaustiva de la zona.

## Correo: qué se sabe y qué falta

**Hay configuración pública de recepción de correo** por el MX de easyDNS. El servidor `mx-caprica.easydns.com` también aparece en la documentación oficial de [Mailmaps de easyDNS](https://kb.easydns.com/knowledge/mailmaps/), su servicio de reenvío. El MX solo no demuestra que existan casillas o reenvíos activos, quién los recibe ni que el estudio los use. **Uso real: [PENDIENTE]** respuesta de Denis/proveedor.

Antes de mover nameservers, pedir al proveedor:

- Si usan direcciones `@portillokusestudio.com`, cuáles y si son buzones o reenvíos; confirmar que el servicio seguirá vigente aunque cambien DNS o registrador.
- Exportación completa de la zona y configuración de correo, incluidos registros no descubiertos: MX, SPF, DKIM con selectores reales, DMARC, SRV, `mail`, `autodiscover` y verificaciones si existen.
- Para la zona observada, copiar **MX prioridad 0 → `mx-caprica.easydns.com`** y el **TXT de Google exacto** de la tabla. Mantener MX y hosts de correo como DNS only cuando corresponda; una transferencia no traslada los buzones ni la configuración de reenvío.

No sustituir el MX por Gmail por crear un Gmail del estudio: esa cuenta para administrar servicios no implica contratar Google Workspace ni migrar el correo del dominio.
Después de cualquier cambio autorizado, probar recepción y envío con las direcciones reales confirmadas. Esta tarea no envió mensajes ni probó buzones.

## Plan A — Cloudflare: delegación DNS y transferencia de registrador

Son dos operaciones distintas. **Delegar DNS** cambia los NS y puede conservar easyDNS como registrador. **Transferir** lleva el registro a Cloudflare Registrar. Pages con dominio raíz necesita DNS en Cloudflare; el cambio de registrador puede hacerse después.

Requisitos previos: cuenta del estudio verificada, titular y correo de autorización confirmados, zona completa respaldada y continuidad del correo acordada. Crear la zona, copiar los registros y obtener los NS asignados; coordinar su cambio con el proveedor y verificar resolución. El estado `clientUpdateProhibited` debe resolverse para los cambios de registro necesarios.

Para transferir: zona activa en Cloudflare, pago del estudio, elegibilidad sin restricciones de 60 días, retiro de `clientTransferProhibited`, código EPP y aprobación. Pedir el EPP al estar listos; cargarlo directamente, sin guardar secretos en Git. RDAP muestra alta antigua, pero no prueba que no exista un bloqueo administrativo reciente. Transferencia y delegación se coordinan por separado con el proveedor.

Fuente: [transferencia a Cloudflare Registrar](https://developers.cloudflare.com/registrar/get-started/transfer-domain-to-cloudflare/). La activación del sitio se verificará después con TLS, rutas ES/EN/PT, dominio elegido y correo real; no basta ver NS nuevos.

## Plan B — www con CNAME en el DNS actual

Después de crear Pages en la cuenta del estudio, agregar **primero** `www.portillokusestudio.com` en Custom domains. Luego pedir al proveedor que cambie el CNAME de www a la URL real `<proyecto>.pages.dev` entregada por Cloudflare. No inventar ese destino ni hacer el cambio ahora.

Conserva registrador, NS y correo. El dominio raíz seguirá en `66.45.232.93` hasta una acción separada; acordar una redirección HTTPS del raíz a www con el proveedor y verificarla. No asumir que editar www arregla el raíz. Actualizar `SITE_URL` al nombre elegido en la publicación y verificar SSL y todos los idiomas.

Fuente: [dominios personalizados de Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/custom-domains/).

## Plan C — dominio nuevo del estudio

Si el proveedor no coopera o el titular decide cambiarlo, elegir y registrar otro dominio a nombre del estudio, con su cuenta y pago. **Nombre, disponibilidad y precio: [PENDIENTE]**. Preparar DNS y Pages; confirmar si habrá correo en el nuevo dominio y configurar ese servicio antes de publicarlo.

Luego actualizar `SITE_URL`, canonical/hreflang/sitemap y enlaces de perfiles autorizados. Conservar el dominio viejo y sus servicios mientras haya correo o enlaces que dependan de él; la redirección desde el viejo requiere colaboración del proveedor. Tener un dominio nuevo no preserva por sí solo visitas, posicionamiento o recepción del anterior.

## Fecha límite propuesta

**Decidir el plan a más tardar el 13/11/2026**, un mes antes del vencimiento confirmado. Es una recomendación operativa, no una fecha del registrador.
Objetivo: resolver titularidad y continuidad del correo antes de esa fecha y completar la operación o renovar con margen. Cloudflare informa hasta 10 días para transferir; no agotar ese plazo contra el vencimiento. Si el 13/11 no están control y transferencia encaminados, acordar renovación en easyDNS para preservar el dominio, aunque el sitio use el plan B o C.

## Evidencia y repetición

Evidencia de esta sesión: `dns-portillo-evidence.json` (consultas públicas de Cloudflare), `nslookup-portillo-evidence.txt` (Google y autoritativo) y `rdap-portillo-evidence.json` (registro Verisign), guardados en los artefactos de Codex del 10/10/2026. No incluyen códigos EPP ni credenciales.

Comandos de solo lectura (PowerShell):

```powershell
nslookup -type=NS portillokusestudio.com 8.8.8.8
nslookup -type=A portillokusestudio.com 8.8.8.8
nslookup -type=AAAA portillokusestudio.com 8.8.8.8
nslookup -type=CNAME portillokusestudio.com 8.8.8.8
nslookup -type=MX portillokusestudio.com 8.8.8.8
nslookup -type=TXT portillokusestudio.com 8.8.8.8
# Repetir los seis tipos para www.portillokusestudio.com.
nslookup -type=TXT _dmarc.portillokusestudio.com rush.easydns.com
# Repetir TXT y CNAME para cada selector DKIM listado arriba.
Resolve-DnsName -Name portillokusestudio.com -Type MX -Server 1.1.1.1 -DnsOnly
Invoke-RestMethod https://rdap.verisign.com/com/v1/domain/portillokusestudio.com
```

Repetir el inventario justo antes de cualquier modificación autorizada: un relevamiento público de hoy no garantiza que la zona no cambie después. No se solicitaron transferencias de zona (AXFR), accesos privados ni cambios remotos.
