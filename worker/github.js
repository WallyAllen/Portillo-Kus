// Lectura y escritura del repo con la API de GitHub. No sabe nada del sitio: las reglas
// de qué se puede guardar están en guardado.js. Necesita un token con permiso de contents.
export class ErrorGitHub extends Error {
  constructor(metodo, ruta, estado) {
    super(`GitHub respondió ${estado} a ${metodo} ${ruta}`);
    this.estado = estado;
  }
}

const rutaUrl = (ruta) => ruta.split('/').map(encodeURIComponent).join('/');

export class RepoGitHub {
  constructor(env) {
    if (!env.GITHUB_TOKEN) throw new Error('Falta el secreto GITHUB_TOKEN');
    this.token = env.GITHUB_TOKEN;
    this.rama = env.GITHUB_BRANCH || 'main';
    this.base = `${env.GITHUB_API_URL || 'https://api.github.com'}/repos/${env.GITHUB_REPO}`;
  }

  async pedir(metodo, ruta, { cuerpo, aceptar = 'application/vnd.github+json', toleradas = [] } = {}) {
    const respuesta = await fetch(this.base + ruta, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: aceptar,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'portillo-kus-panel', // GitHub rechaza los pedidos sin User-Agent
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (toleradas.includes(respuesta.status)) return { estado: respuesta.status };
    if (!respuesta.ok) throw new ErrorGitHub(metodo, ruta, respuesta.status);
    return { estado: respuesta.status, respuesta };
  }

  async pedirJson(metodo, ruta, cuerpo) {
    return (await (await this.pedir(metodo, ruta, { cuerpo })).respuesta.json());
  }

  async head() {
    return (await this.pedirJson('GET', `/git/ref/heads/${this.rama}`)).object.sha;
  }

  // Devuelve el texto del archivo en esa versión, o null si no existe.
  async leer(ruta, ref) {
    const { respuesta } = await this.pedir('GET', `/contents/${rutaUrl(ruta)}?ref=${ref}`, {
      aceptar: 'application/vnd.github.raw+json', toleradas: [404],
    });
    return respuesta ? respuesta.text() : null;
  }

  async listar(carpeta, ref) {
    const { respuesta } = await this.pedir('GET', `/contents/${rutaUrl(carpeta)}?ref=${ref}`, { toleradas: [404] });
    return respuesta ? (await respuesta.json()).map((entrada) => entrada.name) : [];
  }

  async comparar(desde, hasta) {
    const { respuesta } = await this.pedir('GET', `/compare/${desde}...${hasta}`, { toleradas: [404] });
    return respuesta ? respuesta.json() : null;
  }

  // Archivos que cambiaron de desde a hasta, o null si no se puede afirmar nada: hasta no
  // desciende de desde (historia reescrita) o la lista viene cortada (GitHub corta en 300).
  async archivosCambiados(desde, hasta) {
    const comparacion = await this.comparar(desde, hasta);
    if (comparacion?.status !== 'ahead' || comparacion.files.length >= 300) return null;
    return comparacion.files.flatMap((f) => (f.previous_filename ? [f.filename, f.previous_filename] : [f.filename]));
  }

  // true si el commit ya está contenido en la versión hasta.
  async contiene(hasta, commit) {
    const comparacion = await this.comparar(commit, hasta);
    return comparacion?.status === 'ahead' || comparacion?.status === 'identical';
  }

  // Un único commit con todos los archivos juntos. Todavía no mueve la rama.
  // archivos: [{ ruta, texto } | { ruta, base64 }]
  async crearCommit({ padre, archivos, mensaje, autor }) {
    const entradas = await Promise.all(archivos.map(async ({ ruta, texto, base64 }) => {
      const blob = await this.pedirJson('POST', '/git/blobs',
        base64 !== undefined ? { content: base64, encoding: 'base64' } : { content: texto, encoding: 'utf-8' });
      return { path: ruta, mode: '100644', type: 'blob', sha: blob.sha };
    }));
    const commitPadre = await this.pedirJson('GET', `/git/commits/${padre}`);
    const arbol = await this.pedirJson('POST', '/git/trees', { base_tree: commitPadre.tree.sha, tree: entradas });
    const commit = await this.pedirJson('POST', '/git/commits', {
      message: mensaje, tree: arbol.sha, parents: [padre], author: autor, committer: autor,
    });
    return commit.sha;
  }

  // Sin force: si la rama se movió mientras tanto, GitHub responde 422 y devuelve false.
  async moverRama(sha) {
    const { estado } = await this.pedir('PATCH', `/git/refs/heads/${this.rama}`, {
      cuerpo: { sha, force: false }, toleradas: [422],
    });
    return estado !== 422;
  }
}
