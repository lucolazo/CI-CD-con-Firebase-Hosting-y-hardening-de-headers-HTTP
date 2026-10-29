# Informe de Práctica · CI/CD con Firebase Hosting y Hardening de Headers HTTP

**Asignatura:** Programación Avanzada · 2026  
**Alumno / Equipo:** Ana Lucía Colazo  
**Repositorio:** [https://github.com/lucolazo/CI-CD-con-Firebase-Hosting-y-hardening-de-headers-HTTP](https://github.com/lucolazo/CI-CD-con-Firebase-Hosting-y-hardening-de-headers-HTTP)  
**URL de Producción:** `https://practica-cicd-cursos.web.app`

---

## 1. Entregables

| #   | Entregable                                                  | Valor / Enlace                                                                                                                                                                   |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Link al repo (público)                                      | [https://github.com/lucolazo/CI-CD-con-Firebase-Hosting-y-hardening-de-headers-HTTP](https://github.com/lucolazo/CI-CD-con-Firebase-Hosting-y-hardening-de-headers-HTTP) |
| 2   | URL de producción                                           | `https://practica-cicd-cursos.web.app`                                                                                                                                           |
| 3   | Link al PR mergeado con comentario del bot y URL de preview | PR #1 (hardening): https://github.com/lucolazo/CI-CD-con-Firebase-Hosting-y-hardening-de-headers-HTTP/pull/1 · PR #2 (título, A6): https://github.com/lucolazo/CI-CD-con-Firebase-Hosting-y-hardening-de-headers-HTTP/pull/2                                                                                  |
| 4   | Salida de `check-headers.mjs` antes (B1) y después (B5)     | Registradas en la sección 2 de este documento                                                                                                                                     |
| 5   | Respuestas a las preguntas de reflexión                     | Respondidas en la sección 3 de este documento                                                                                                                                    |

---

## 2. Mediciones de Headers HTTP (`check-headers.mjs`)

### 2.1. Medición inicial (B1): producción antes del hardening

Workflow de producción sobre el primer commit (`9e31aa5`, sin headers en `firebase.json`). Comando:

```bash
node scripts/check-headers.mjs https://practica-cicd-cursos.web.app
```

```text
▶ HTML: https://practica-cicd-cursos.web.app/
  status 200
  ✘ content-security-policy (falta)
  ✔ strict-transport-security: max-age=31556926; includeSubDomains; preload
  ✘ x-content-type-options (falta)
  ✘ x-frame-options (falta)
  ✘ referrer-policy (falta)
  ✘ permissions-policy (falta)
  · cache-control: max-age=3600

▶ Asset estático: /_next/static/chunks/1x6obpmlu1_c2.js
  ✘ cache-control: max-age=3600

❌ 6 control(es) pendiente(s).
```

**securityheaders.com (inicial): nota D.** Solo `Strict-Transport-Security` en verde; faltaban CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy y Permissions-Policy.

_Diagnóstico:_ el único header presente es el HSTS, que Firebase Hosting agrega por defecto. El `Cache-Control` por defecto (`max-age=3600`) se aplicaba igual al HTML y a los assets, lo que impide cachear un año los archivos con hash y mantiene el HTML en caché una hora, de modo que un deploy o un rollback tardaría hasta una hora en verse.

---

### 2.2. Medición final (B5)

**Preview del PR #1** (`https://practica-cicd-cursos--pr1-feat-hardening-juxyawfb.web.app`, commit `673e9a3`):

```text
▶ HTML: https://practica-cicd-cursos--pr1-feat-hardening-juxyawfb.web.app/
  status 200
  ✔ content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'self' https://picsum.photos …
  ✔ strict-transport-security: max-age=31556926; includeSubDomains; preload
  ✔ x-content-type-options: nosniff
  ✔ x-frame-options: DENY
  ✔ referrer-policy: strict-origin-when-cross-origin
  ✔ permissions-policy: camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=(), serial=(), bluetooth=(), acc…
  · cache-control: public, max-age=0, must-revalidate

▶ Asset estático: /_next/static/chunks/1x6obpmlu1_c2.js
  ✔ cache-control: public, max-age=31536000, immutable

✅ Todos los controles pasaron.
```

En el navegador del preview: la imagen de portada se ve, el filtro de `/cursos` responde y la consola no muestra ningún `Refused to...`.

**Producción, después del merge y de todo el ciclo A6:**

```text
▶ HTML: https://practica-cicd-cursos.web.app/
  status 200
  ✔ content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'self' https://picsum.photos …
  ✔ strict-transport-security: max-age=31556926; includeSubDomains; preload
  ✔ x-content-type-options: nosniff
  ✔ x-frame-options: DENY
  ✔ referrer-policy: strict-origin-when-cross-origin
  ✔ permissions-policy: camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=(), serial=(), bluetooth=(), acc…
  · cache-control: public, max-age=0, must-revalidate

▶ Asset estático: /_next/static/chunks/1x6obpmlu1_c2.js
  ✔ cache-control: public, max-age=31536000, immutable

✅ Todos los controles pasaron.
```

**securityheaders.com (final): nota A.** Los seis headers en verde. La nota queda limitada a A por la advertencia de `'unsafe-inline'` en `script-src` (ver pregunta 4).

**Comparación:** de D con 6 controles pendientes a A con todos los controles aprobados; el `Cache-Control` pasó de `max-age=3600` en todo a inmutable por un año en `/_next/static/**` y revalidación en el HTML.

**Hallazgos durante las pruebas:**

- Firebase Hosting impone su propio `Strict-Transport-Security` (`max-age=31556926`) y pisa el valor configurado en `firebase.json` (`max-age=31536000`). El valor efectivo sigue siendo de aproximadamente un año, con `includeSubDomains; preload`.
- En Brave, la consola avisa `Unrecognized feature: 'browsing-topics'` en `Permissions-Policy`. El feature es válido en Chrome; el aviso aparece porque Brave no implementa esa API. No afecta el funcionamiento.
- Se detectó y quitó `interest-cohort` de la `Permissions-Policy`, porque es un feature obsoleto (FLoC) que los navegadores ya no reconocen.
- `favicon.ico` devuelve 404 porque la app no tiene favicon. Es inofensivo y no está relacionado con la CSP.

---

## 3. Ciclo completo y rollback (A6)

| Paso | Evidencia |
|---|---|
| Primer deploy a `live` (sin headers) | Commit `9e31aa5`. Firebase: versión `9c6c1f`, 29/10/26 19:22. |
| PR #1 (hardening) mergeado | Merge commit `b54eca9`. Footer de producción: `Versión b54eca9`, `Rama main`. Firebase: versión `3acaa7`, 20:27. |
| PR #2 (título) abierto | Rama `feat/titulo`, commit `0fbafac`. El preview `pr2-feat-titulo` mostró el título nuevo ("Catálogo de Cursos 2026") mientras producción seguía con el título viejo y `b54eca9`: los entornos están aislados. |
| PR #2 mergeado | Footer de producción: `Versión 84eecfa`, `Rama main`, título "Catálogo de Cursos 2026". Firebase: versión `cf5da8`, 20:41. |
| Rollback desde la consola de Firebase | Hosting → Release history → rollback a la versión `3acaa7`. Queda registrado en el historial como una nueva versión `3acaa7` (29/10/26 20:51) hecha por `anaacolazo@gmail.com`. Producción volvió a mostrar el título original, "Bienvenidos al Catálogo de Cursos". |
| Promoción de preview a live, sin recompilar | `npx firebase hosting:clone practica-cicd-cursos:pr2-feat-titulo practica-cicd-cursos:live` → `Site practica-cicd-cursos channel pr2-feat-titulo has been cloned to site practica-cicd-cursos channel live.` |
| Footer de producción tras el clone | Título "Catálogo de Cursos 2026", `Versión 0fbafac`, `Rama feat/titulo`, Build: 2026-10-29T23:38:03Z. Coincide con el commit de la rama del PR #2 y no con el merge commit de `main` (`84eecfa`), lo que confirma que no hubo recompilación. |

**Qué muestra la trazabilidad:** el footer permite saber exactamente qué commit está en cada entorno. Tras el `hosting:clone`, producción sirve el build del preview, compilado con el commit de la rama (`0fbafac`) y no con el merge commit de `main` (`84eecfa`). El contenido es equivalente, pero el SHA del footer cambia, lo que prueba que no hubo recompilación: se promovió el mismo artefacto que se había revisado en el preview.

## 4. Respuestas a las Preguntas de Reflexión

### Pregunta 1

**¿Por qué el preview tiene vencimiento? ¿Qué riesgos tendría un preview que no vence nunca?**

**Respuesta:**  
Los entornos de preview son recursos efímeros diseñados estrictamente para validar cambios durante la revisión de un Pull Request antes de su integración a la rama principal.

Riesgos de previews permanentes (sin vencimiento):

1. **Seguridad y reducción de superficie de ataque:** Los previews contienen versiones en desarrollo, potencialmente inestables, con dependencias desactualizadas o funcionalidades a medio terminar. Si no expiran, permanecen indexables o accesibles públicamente en internet por tiempo indefinido, convirtiéndose en un vector de ataque.
2. **Agotamiento de cuotas y costos operativos:** En Firebase Hosting (y plataformas serverless en general), existen límites en la cantidad de canales de vista previa activos por proyecto (Firebase impone un tope por sitio; consultar el valor vigente en la documentación de cuotas) y cuotas de almacenamiento y transferencia. Previews acumulados saturarían la cuota del proyecto, bloqueando futuros despliegues del equipo.
3. **Obsolescencia operativa y confusión:** Canales de ramas viejas o descartadas confunden a equipos de QA y desarrollo, quienes podrían probar sobre URLs obsoletas creyendo que reflejan el estado actual del producto.

---

### Pregunta 2

**¿Qué diferencia hay entre desplegar y liberar? ¿Dónde aparece cada concepto en este flujo?**

**Respuesta:**

- **Desplegar (_Deploy_):** Es el proceso técnico de empaquetar, subir y poner a disposición una versión de la aplicación en una infraestructura determinada (un canal o servidor), lista para responder solicitudes pero no necesariamente visible al público general.
- **Liberar (_Release_):** Es el acto funcional o de negocio de exponer esa versión específica a los usuarios finales de producción, canalizando hacia ella el tráfico real.

**Aparición en este flujo:**

- _Despliegue:_ Ocurre automáticamente en cada Pull Request cuando GitHub Actions compila el export estático y lo publica en un canal temporal de preview (`Preview channel`). La app está desplegada, pero no liberada a los clientes.
- _Liberación:_ Ocurre cuando el cambio se mergea a `main` y se publica en el canal `live`, o cuando desde la consola de Firebase se ejecuta un **Rollback** (o mediante `npx firebase hosting:clone <PROJECT_ID>:<CANAL> <PROJECT_ID>:live`). En estos dos últimos casos, se libera una versión ya desplegada de forma instantánea y sin recompilar.

---

### Pregunta 3

**¿Por qué la clave de la service account va en un secreto y no en el repo? ¿Qué podría hacer alguien que la obtenga? ¿Cómo limitarías el daño?**

**Respuesta:**

- **Por qué debe ir en un secreto:** La clave privada JSON de una cuenta de servicio es una credencial de máquina a máquina no interactiva que otorga acceso programático directo a las APIs de Google Cloud sin requerir 2FA. Subirla a un repositorio (incluso privado) expone la credencial a fugas accidentales, accesos indebidos de colaboradores o escaneos automáticos de bots maliciosos.
- **Qué podría hacer un atacante:** Con esa credencial, un atacante podría desfigurar el sitio web en producción (_defacement_), alojar contenido malicioso o phishing para infectar a los usuarios, eliminar despliegues existentes causando una denegación de servicio (DoS), agotar las cuotas del proyecto y, si la cuenta posee permisos excesivos (p. ej. `Editor` u `Owner`), acceder a bases de datos Firestore, Storage o instancias Cloud en el mismo proyecto de Google Cloud.
- **Cómo limitar el daño:**
  1. _Principio de mínimo privilegio:_ Asignar a la cuenta de servicio únicamente el rol `Firebase Hosting Admin` (o roles específicos de hosting) en lugar de roles amplios como `Editor`.
  2. _Workload Identity Federation:_ En entornos empresariales modernos, se recomienda configurar OpenID Connect (OIDC) entre GitHub Actions y Google Cloud para autenticarse sin necesidad de almacenar claves JSON estáticas y duraderas en GitHub Secrets.
  3. _Rotación y monitoreo:_ Rotar periódicamente las claves y configurar alertas en Cloud Logging / Cloud Audit Logs ante actividades inusuales de despliegue.
  4. _Plan de revocación:_ Ante cualquier indicio de filtración, revocar la clave de inmediato en IAM y purgar la caché de la CDN.

---

### Pregunta 4

**La CSP rompió la app: ¿por qué? ¿Qué opciones evaluaste y qué costo de seguridad tiene cada una?**

**Respuesta:**

- **Por qué se rompió la app:**
  1. _Filtro de cursos (`/cursos`):_ Next.js (con export estático) genera etiquetas `<script>` inline en el HTML para inicializar el runtime de Turbopack/Webpack (`_R_`) y para inyectar el payload de hidratación de React Server Components (`self.__next_f.push(...)`). Al aplicar la CSP restrictiva inicial (`script-src 'self'`), el navegador bloqueó estos scripts inline por defecto, impidiendo que React hidratara el árbol de componentes del cliente (`FiltroCursos.tsx`). Esto dejó los botones de filtro y el campo de búsqueda totalmente inoperativos.
  2. _Imagen de portada (`/`):_ La imagen referenciada en `app/page.tsx` (`https://picsum.photos/...`) responde con una redirección HTTP 302 hacia `https://fastly.picsum.photos/...`. Con `img-src 'self'`, el navegador bloqueó tanto el origen inicial como el destino del redirect.

- **Opciones evaluadas y sus costos de seguridad:**
  - _Opción A: Permitir `'unsafe-inline'` en `script-src`._
    - _Evaluación:_ Solución estándar para sitios estáticos generados por frameworks modernos sin backend. Permite el funcionamiento inmediato de Next.js.
    - _Costo de seguridad:_ Disminuye la efectividad de CSP contra ataques Cross-Site Scripting (XSS), ya que si un atacante consigue inyectar HTML arbitrario en la página, el navegador ejecutará cualquier script malicioso inyectado sin distinción.
  - _Opción B: Uso de nonces criptográficos (`'nonce-<random>'`)._
    - _Evaluación:_ Es la mejor práctica cuando hay un servidor activo, generando un token pseudoaleatorio por cada petición HTTP.
    - _Costo de seguridad y limitación técnica:_ Es **incompatible con el export estático puro en Firebase Hosting Spark**, dado que en un CDN de archivos pre-renderizados no existe un runtime de backend que genere nonces dinámicos por solicitud HTTP. Requeriría migrar a una arquitectura con SSR (Cloud Run / Firebase App Hosting) con tarjeta de crédito.
  - _Opción C: Lista blanca de Hashes SHA-256 (`'sha256-...'`) (Nivel Destacado)._
    - _Evaluación:_ Durante el paso de build o mediante un script en el pipeline, se analizan los archivos HTML estáticos generados en `out/`, se extrae el texto exacto de cada `<script>` inline, se calculan sus hashes criptográficos en base64 y se inyectan en la directiva `script-src` de `firebase.json`.
    - _Costo de seguridad:_ Ofrece la máxima seguridad sin relajar a `'unsafe-inline'`. Su costo radica en la complejidad adicional en el pipeline de CI/CD para regenerar y sincronizar los hashes cada vez que cambia el contenido o la versión de Next.js.

---

- **Decisión adoptada (política final en `firebase.json`):**
  - `script-src 'self' 'unsafe-inline'`: **necesario**, porque cada página exportada trae 3 scripts inline (runtime y payload de hidratación de Next.js). Costo: una inyección de HTML podría ejecutar JS; se compensa con `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` y `form-action 'self'`. Se puede eliminar con hashes SHA-256 calculados en el pipeline (ver Desafío Extra).
  - `style-src 'self'`: **sin** `'unsafe-inline'`, porque el HTML generado no contiene `<style>` ni atributos `style=`; el CSS se carga desde un archivo en `/_next/static/`.
  - `img-src 'self' https://picsum.photos https://fastly.picsum.photos`: **solo los dos orígenes exactos** (la imagen de portada redirige de uno al otro). Sin `https:` genérico ni `data:`, que no se usan.
  - `connect-src 'self'` y `font-src 'self'`: la app solo pide recursos de su propio origen.

---

### Pregunta 5

**Para cada header de B2, ¿qué ataque mitiga?**

**Respuesta:**

1. **`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`**
   - _Ataques que mitiga:_ Man-in-the-Middle (MitM), ataques de degradación SSL/TLS (_SSL Stripping_) y escuchas pasivas de red.
   - _Mecanismo:_ Obliga al navegador a comunicarse exclusivamente mediante HTTPS durante el tiempo indicado (`max-age` de 1 año) y en todos sus subdominios, impidiendo conexiones no cifradas aun cuando el usuario ingrese explícitamente `http://`.
   - _Valor efectivo:_ en las mediciones el header llega con `max-age=31556926`, porque Firebase Hosting aplica su propio HSTS y pisa el configurado en `firebase.json`. Sigue siendo de aproximadamente un año.
   - _Nota sobre `preload`:_ solo tiene efecto si el dominio se envía a la lista de preload de los navegadores (`*.web.app` ya está cubierto). En un dominio propio es difícil de revertir, por lo que conviene activarlo recién cuando todo el dominio y sus subdominios sirvan HTTPS.

2. **`X-Content-Type-Options: nosniff`**
   - _Ataques que mitiga:_ Confusión de tipo MIME (_MIME Confusion / MIME Sniffing_) y ejecución de código malicioso disfrazado.
   - _Mecanismo:_ Impide que el navegador intente "adivinar" el contenido de un recurso y lo fuerza a respetar estrictamente el `Content-Type` declarado por el servidor, evitando que archivos de texto plano o imágenes sean interpretados y ejecutados como JavaScript o CSS.

3. **`X-Frame-Options: DENY`**
   - _Ataques que mitiga:_ Clickjacking / UI Redressing.
   - _Mecanismo:_ Prohíbe terminantemente que el sitio sea embebido dentro de marcos (`<iframe>`, `<frame>`, `<object>`) en cualquier dominio externo o propio, evitando que un atacante superponga una capa transparente sobre la web para engañar al usuario y capturar sus interacciones.

4. **`Referrer-Policy: strict-origin-when-cross-origin`**
   - _Ataques que mitiga:_ Fuga involuntaria de información confidencial en la URL (_Information Disclosure_).
   - _Mecanismo:_ En solicitudes del mismo origen envía la URL completa; en solicitudes salientes hacia otros orígenes con HTTPS solo envía el dominio base (origen), suprimiendo rutas privadas, parámetros de consulta o tokens de sesión; y si se navega de HTTPS a HTTP inseguro, no envía ningún referrer.

5. **`Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=(), serial=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), interest-cohort=()`**
   - _Ataques que mitiga:_ Acceso no autorizado o abusivo a APIs sensibles del navegador y hardware del dispositivo (_Privilege Abuse / Tracking_).
   - _Mecanismo:_ Deshabilita explícitamente el acceso a la cámara, micrófono, geolocalización y APIs de rastreo publicitario tanto para el documento principal como para librerías o dependencias de terceros embebidas.

_Adicionales configurados para nivel Destacado:_

- **`Cross-Origin-Opener-Policy: same-origin` (COOP):** Aísla el contexto de navegación en un proceso dedicado, mitigando ataques de canal lateral como _Spectre_ y ataques de control entre ventanas abiertas (`window.opener`).
- **`Cross-Origin-Resource-Policy: same-origin` (CORP):** Impide que orígenes externos carguen o lean los recursos estáticos del sitio mediante `<img>`, `<video>` o `fetch`.

---

### Pregunta 6

**¿Por qué los assets de `/_next/static/` pueden cachearse un año y el HTML no?**

**Respuesta:**

- **Assets versionados (`/_next/static/**`):**  
Next.js compila los bundles de JavaScript, estilos CSS y chunks asignándoles un nombre único basado en el hash del contenido (por ejemplo: `chunks/1l60h6e6h2_ti.css`). Si el código fuente cambia, el hash resultante en el nombre del archivo será obligatoriamente distinto. Como el contenido de una URL dada es completamente inmutable en el tiempo, puede almacenarse en la memoria caché del navegador y en los servidores de borde de la CDN por un año entero (`Cache-Control: public, max-age=31536000, immutable`). Esto elimina descargas innecesarias y maximiza la velocidad de carga.
- **Documentos HTML (`/`, `/cursos`):**  
  Los archivos HTML son la "raíz de navegación" que referencia a los assets versionados mediante etiquetas `<script src="...">` y `<link rel="stylesheet" href="...">`. Si el HTML quedara cacheado por un período prolongado, cuando el equipo realice un nuevo despliegue o un rollback de emergencia, los usuarios seguirían viendo la versión antigua almacenada en su navegador sin enterarse del cambio. Por lo tanto, el HTML debe servirse con `Cache-Control: public, max-age=0, must-revalidate` (o `no-cache`), forzando al navegador a realizar una validación condicional (`ETag` / `If-None-Match`) contra la CDN en cada visita antes de usar la copia local.

---

### Pregunta 7

**Si la app necesitara SSR, ¿qué cambiaría en la arquitectura, en la CSP y en el costo?**

**Respuesta:**

1. **Arquitectura:**  
   No se podría exportar el sitio a archivos HTML planos en `out/` (`output: 'export'`). Se requeriría un servidor de backend en ejecución continua o funciones serverless (como Google Cloud Run o Firebase App Hosting) que reciban cada petición HTTP entrante, ejecuten el código de renderizado de React en el servidor (SSR) y generen el HTML dinámicamente con datos frescos.
2. **Content-Security-Policy (CSP):**  
   La seguridad de la CSP mejoraría sustancialmente. Al existir un proceso en el servidor por cada solicitud, se puede generar criptográficamente un `nonce` único y aleatorio para cada request HTTP. Dicho `nonce` se inyecta simultáneamente en el header `Content-Security-Policy: script-src 'self' 'nonce-xyz'` y en los tags `<script nonce="xyz">`, permitiendo **eliminar por completo `'unsafe-inline'`** sin necesidad de calcular listas estáticas de hashes.
3. **Costo:**  
   Firebase Hosting en el plan gratuito Spark únicamente admite entrega de contenido estático. Alojar un contenedor de SSR en Cloud Run o mediante Firebase App Hosting exige vincular una tarjeta de crédito bajo el plan Blaze (pago por uso), donde se factura por tiempo de CPU/vCPU, uso de memoria RAM, cantidad de peticiones y ancho de banda saliente al superar las cuotas gratuitas mensuales de Google Cloud.

---

### Análisis Adicional · Ciclo Completo y Rollback (A6)

**Pregunta para pensar:** _después del rollback en Firebase Console, `main` sigue teniendo el código nuevo. ¿Qué pasa con el próximo merge? ¿Cómo se resuelve en un equipo real?_

**Lo que se hizo en la práctica:** tras el rollback a la versión `3acaa7`, `main` seguía conteniendo el cambio de título (`84eecfa`). En lugar de revertir el commit, se promovió el preview `pr2-feat-titulo` a producción con `hosting:clone`, de modo que producción volvió a coincidir con `main`. Si en cambio el rollback hubiera sido por un bug, lo correcto habría sido un `git revert` en `main`; de lo contrario, el próximo merge habría vuelto a desplegar el código defectuoso.

**Análisis y resolución:**

- _Qué ocurre:_ El rollback desde la consola de Firebase Hosting únicamente reasigna el puntero de la CDN en producción hacia un release previo en el historial de despliegues. El historial de Git no se ve afectado en absoluto: la rama `main` continúa conteniendo los commits que introdujeron el error. Si posteriormente otro desarrollador abre un PR con otra mejora y se mergea a `main`, el pipeline de CI/CD compilará la versión actual de `main` (que aún contiene el commit defectuoso) y publicará ese build en producción, **re-introduciendo de manera involuntaria el bug que motivó el rollback inicial**.
- _Cómo se resuelve en un equipo profesional:_  
  El rollback en Hosting es una maniobra de mitigación de emergencia inmediata para restablecer la continuidad operativa. Acto seguido, el equipo debe sincronizar el repositorio creando de inmediato un commit de reversión formal en `main` mediante `git revert <commit-sha>` (o un PR de _Revert_). De esta forma, el código en `main` refleja exactamente el estado funcional de producción y el próximo merge no provocará regresiones.

---

### Desafío Extra · Cálculo de Hashes para CSP sin `'unsafe-inline'`

Para eliminar `'unsafe-inline'` en un entorno de export estático, se puede integrar un paso en el pipeline de GitHub Actions inmediatamente después de `npm run build`:

1. Un script Node.js lee recursivamente los archivos `.html` de la carpeta `out/`.
2. Utilizando un parser de HTML (o expresiones regulares), extrae el contenido íntegro de cada elemento `<script>` inline.
3. Calcula el hash SHA-256 codificado en base64 para cada bloque:
   ```javascript
   import crypto from "node:crypto";
   const hash = crypto
     .createHash("sha256")
     .update(scriptContent)
     .digest("base64");
   // Formato resultante: 'sha256-...'
   ```
4. Agrupa todos los hashes únicos y los concatena en la directiva `script-src` dentro de `firebase.json`:
   ```text
   script-src 'self' 'sha256-abc...' 'sha256-xyz...';
   ```
5. Esto permite que el navegador ejecute con total rigurosidad únicamente los scripts inline generados legítimamente por el compilador, neutralizando cualquier intento de inyección XSS de atacantes.
