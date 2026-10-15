# Imperio Shop · Verificación de cuentas de Discord

Sitio de verificación con **antifraude** (VPN, multicuentas, centros de datos) que
entrega automáticamente el **rol de verificado** en el servidor de Discord.

Está preparado para **Cloudflare Workers**.

---

## ⚠️ Lee esto primero: cómo se publica

En Cloudflare hay **dos formas** de subir un proyecto, y solo una sirve aquí:

| Forma | ¿Sirve? | Por qué |
|---|---|---|
| Arrastrar archivos a «Cargar e implementar» | ❌ **No** | Ese cargador **no compila**. Tu web es React + TypeScript: necesita compilarse antes, y además lleva servidor. Si lo intentas, sale el aviso *«Este cargador aún no admite proyectos que requieran un proceso de compilación»*. |
| **Conectar el repositorio de GitHub** | ✅ **Sí** | Cloudflare compila solo cada vez que subes cambios. Es el método de esta guía. |

Por eso **no** se sube la carpeta arrastrando: se conecta el repositorio.

---

## Puesta en marcha

### Paso 1 · Conectar el repositorio

El proyecto ya está en GitHub:

**https://github.com/angelvicente1298-arch/imperio-verify-cloudflare**

1. Entra en <https://dash.cloudflare.com> → **Workers & Pages**
2. **Create** → **Workers** → **Connect to Git**
3. Autoriza GitHub y elige el repositorio `imperio-verify-cloudflare`
4. En la configuración del proyecto pon exactamente:

| Campo | Valor |
|---|---|
| **Build command** | `pnpm build` |
| **Deploy command** | `npx wrangler deploy` |
| **Root directory** | *(déjalo vacío)* |

5. **Deploy**

Cuando termine te dará la dirección, algo como:

```
https://imperio-verify-web.TU-USUARIO.workers.dev
```

> **Nota sobre la rama:** debe publicar la rama `main`.

### Paso 2 · Cargar las claves (secretos)

Sin esto la verificación no puede hablar con Discord. En Cloudflare:
**tu Worker → Settings → Variables and Secrets → Add → Secret**

Añade una por una (el valor se pega al crearla):

| Nombre | De dónde se saca |
|---|---|
| `DISCORD_CLIENT_ID` | Developer Portal → OAuth2 → Client ID |
| `DISCORD_CLIENT_SECRET` | Developer Portal → OAuth2 → Client Secret |
| `DISCORD_BOT_TOKEN` | Developer Portal → Bot → Reset Token |
| `DISCORD_GUILD_ID` | ID de tu servidor de Discord |
| `DISCORD_VERIFIED_ROLE_ID` | ID del rol de verificado |
| `DISCORD_EXTRA_ROLE_IDS` | Roles extra separados por comas (opcional) |
| `PANEL_USER` | Usuario del panel privado |
| `PANEL_PASSWORD` | Contraseña del panel privado |
| `PANEL_SESSION_SECRET` | Texto largo y aleatorio |
| `JWT_SECRET` | Texto largo y aleatorio |

Para generar un texto aleatorio:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Después de añadirlos, vuelve a **Deploy** (o haz un cambio cualquiera) para que
el Worker los reciba.

### Paso 3 · Autorizar la dirección en Discord (¡importante!)

Discord solo permite volver a las direcciones que están apuntadas. Si no lo
haces verás **«redirect_uri de OAuth2 no válido»**.

1. <https://discord.com/developers/applications> → tu app
2. **OAuth2 → Redirects → Add Redirect**
3. Pega la dirección **exacta** de Cloudflare, **sin barra al final**:

```
https://imperio-verify-web.TU-USUARIO.workers.dev
```

4. **Save Changes**

Y dile al proyecto cuál es ese dominio, para que la web vuelva ahí desde Discord.
En Cloudflare: **tu Worker → Settings → Variables and Secrets** → añade la
variable (esta es **texto normal**, no secreto):

| Nombre | Valor |
|---|---|
| `DISCORD_ALLOWED_DOMAINS` | `imperio-verify-web.TU-USUARIO.workers.dev` |

Vuelve a publicar y listo.

> **¿Y el dominio viejo?** El proyecto venía usando
> `imperioshop-mhfz2s3t.manus.space`. Si quieres conservarlo, añade los dos
> separados por coma: `dominio-nuevo.workers.dev,imperioshop-mhfz2s3t.manus.space`
> y apunta **los dos** en Discord.

---

## Alternativa: publicar con `wrangler deploy`

Si prefieres no usar GitHub, puedes publicar desde tu ordenador. Necesitas
Node.js 20 o superior:

```bash
# 1. Entrar en Cloudflare (solo la primera vez)
npx wrangler login

# 2. Instalar y publicar
pnpm install
pnpm deploy
```

`pnpm deploy` compila la web y sube todo. Al terminar te devuelve la dirección
del sitio.

Para cargar las claves por terminal, en lugar de por el panel web:

```bash
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_GUILD_ID
npx wrangler secret put DISCORD_VERIFIED_ROLE_ID
npx wrangler secret put PANEL_USER
npx wrangler secret put PANEL_PASSWORD
npx wrangler secret put PANEL_SESSION_SECRET
npx wrangler secret put JWT_SECRET
```

Cada comando pide el valor y lo guarda cifrado.

---

## Qué funciona y qué no (base de datos)

El sitio **funciona sin base de datos**: verifica cuentas, entrega el rol y deja
entrar al panel privado.

Lo único que necesita base de datos es **recordar cosas entre visitas**:

| Función | Sin base de datos |
|---|---|
| Verificar y entregar el rol | ✅ Funciona |
| Bloqueo por VPN, centro de datos, correo | ✅ Funciona |
| Antigüedad mínima de la cuenta | ✅ Funciona |
| Panel privado (entrar y ver ajustes) | ✅ Funciona |
| Bloqueo de **multicuentas** por IP o dispositivo | ❌ No (necesita memoria) |
| **Historial** de verificaciones | ❌ No (necesita memoria) |

### Si quieres activar la base de datos

1. Consigue una base **MySQL** (la que ya usabas en Manus/TiDB sirve tal cual)
2. Crea la conexión:

```bash
wrangler hyperdrive create imperio-db \
  --connection-string="mysql://USUARIO:CLAVE@HOST:3306/BASE"
```

3. Abre `wrangler.jsonc`, busca el bloque comentado que empieza con
   `// "hyperdrive"` y déjalo así (con el id que te devolvió el comando):

```jsonc
"hyperdrive": [
  {
    "binding": "HYPERDRIVE",
    "id": "el-id-que-te-devolvio-el-comando"
  }
],
```

4. Sube el cambio a GitHub. Cloudflare republica solo.

---

## El panel privado

No está enlazado en la web: entra quien sabe la dirección.

```
https://TU-DOMINIO/bot
```

Pide el usuario y la contraseña que pusiste en `PANEL_USER` y `PANEL_PASSWORD`.
Desde ahí se cambian los ajustes del antifraude, se ven los miembros y se crean
más accesos para otras personas.

La ruta `/panel` muestra el resumen de verificaciones.

---

## Ajustes del antifraude

Se pueden cambiar desde el panel o en `wrangler.jsonc`:

| Ajuste | Por defecto | Qué hace |
|---|---|---|
| `VERIFY_MIN_ACCOUNT_DAYS` | `5` | Antigüedad mínima de la cuenta de Discord |
| `VERIFY_MAX_ACCOUNTS_PER_IP` | `2` | Cuentas por conexión antes de avisar |
| `VERIFY_MAX_ACCOUNTS_PER_DEVICE` | `2` | Cuentas por dispositivo antes de bloquear |
| `VERIFY_MAX_RISK` | `40` | Puntuación de riesgo que ya no permite entrar |

> **Sobre la IP:** los operadores usan CGNAT, así que mucha gente comparte la
> misma IP pública (habitual en Venezuela). Por eso la IP **solo bloquea con
> abuso claro** (3 veces el límite) y por debajo únicamente avisa. El bloqueo
> duro de multicuentas lo hace el **dispositivo**, que sí identifica a la misma
> persona.

---

## Probar en tu ordenador

```bash
cp .dev.vars.example .dev.vars
# Rellena .dev.vars con tus claves reales
pnpm install
pnpm preview
```

Abre <http://localhost:8787>.

> `.dev.vars` contiene claves: **nunca** se sube al repositorio (ya está en
> `.gitignore`).

---

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm install` | Instala las dependencias |
| `pnpm build` | Compila la web a `dist/public` |
| `pnpm preview` | Compila y arranca todo en local |
| `pnpm deploy` | Compila y publica con Wrangler |
| `pnpm test` | Ejecuta las pruebas |
| `pnpm check` | Comprueba los tipos de TypeScript |

---

## Si algo no funciona

| Síntoma | Causa y solución |
|---|---|
| «Este cargador no admite proyectos que requieran compilación» | Estás arrastrando archivos. Usa **Connect to Git** (Paso 1). |
| El despliegue falla | Revisa que la **Build command** sea `pnpm build` y la **Deploy command** `npx wrangler deploy`. |
| «redirect_uri de OAuth2 no válido» | El dominio no está apuntado en Discord. Paso 3. |
| La verificación no entrega el rol | Faltan secretos, o el bot no tiene permiso de **Gestionar roles**. |
| El bot no puede dar el rol | Su rol debe estar **por encima** del rol de verificado (Discord → Roles). |
| No entra al panel | Usuario o contraseña distintos a `PANEL_USER` / `PANEL_PASSWORD`. |
| No aparece el historial | No hay base de datos. Ver la sección de arriba. |

Para ver los errores en vivo: **tu Worker → Logs** (o `wrangler tail`).

---

## Seguridad

- Las claves van como **secretos** en Cloudflare, nunca en el código.
- Las contraseñas del panel se guardan cifradas (scrypt con sal propia).
- Las sesiones del panel se firman y caducan solas.
- Cada intento de entrada al panel queda registrado con su IP.
