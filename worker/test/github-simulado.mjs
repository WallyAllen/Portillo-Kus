// Un GitHub en memoria con lo que usa worker/github.js. Nunca habla con GitHub de verdad.
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const sha = () => randomBytes(20).toString('hex');

export class GitHubSimulado {
  // archivos: { ruta: texto }
  constructor(archivos = {}, { token = 'token-de-prueba' } = {}) {
    this.token = token;
    this.blobs = new Map();
    this.arboles = new Map();
    this.commits = new Map();
    this.pedidos = [];
    this.antesDeMover = null; // gancho: simula que otra persona guarda justo antes del PATCH
    const arbol = new Map(Object.entries(archivos).map(([ruta, texto]) => [ruta, this.crearBlob(Buffer.from(texto))]));
    this.head = this.crearCommit(arbol, [], 'Estado inicial');
  }

  crearBlob(contenido) {
    const id = sha();
    this.blobs.set(id, contenido);
    return id;
  }

  crearCommit(arbol, padres, mensaje, autor = null) {
    const id = sha();
    const arbolId = sha();
    this.arboles.set(arbolId, arbol);
    this.commits.set(id, { arbol: arbolId, padres, mensaje, autor });
    return id;
  }

  arbolDe(commit) {
    return this.arboles.get(this.commits.get(commit).arbol);
  }

  // Otra persona guarda directamente en la rama.
  avanzar(ruta, texto, mensaje = 'Otro cambio') {
    const arbol = new Map(this.arbolDe(this.head));
    arbol.set(ruta, this.crearBlob(Buffer.from(texto)));
    this.head = this.crearCommit(arbol, [this.head], mensaje);
    return this.head;
  }

  leerEnHead(ruta) {
    const id = this.arbolDe(this.head).get(ruta);
    return id ? this.blobs.get(id) : null;
  }

  ancestros(commit) {
    const vistos = new Set();
    const pila = [commit];
    while (pila.length) {
      const actual = pila.pop();
      if (!vistos.has(actual)) {
        vistos.add(actual);
        pila.push(...this.commits.get(actual).padres);
      }
    }
    return vistos;
  }

  comparar(desde, hasta) {
    if (!this.commits.has(desde) || !this.commits.has(hasta)) return null;
    const status = desde === hasta ? 'identical'
      : this.ancestros(hasta).has(desde) ? 'ahead'
        : this.ancestros(desde).has(hasta) ? 'behind' : 'diverged';
    const [a, b] = [this.arbolDe(desde), this.arbolDe(hasta)];
    const rutas = new Set([...a.keys(), ...b.keys()]);
    const files = [...rutas].filter((r) => a.get(r) !== b.get(r)).map((filename) => ({ filename }));
    return { status, files };
  }

  responder(metodo, ruta, consulta, cuerpo, aceptar) {
    const [, repo] = ruta.match(/^\/repos\/[^/]+\/[^/]+(\/.*)$/) || [];
    if (!repo) return [404, {}];
    let m;
    if (metodo === 'GET' && repo === '/git/ref/heads/main') return [200, { object: { sha: this.head } }];
    if (metodo === 'GET' && (m = repo.match(/^\/compare\/([0-9a-f]+)\.\.\.([0-9a-f]+)$/))) {
      const resultado = this.comparar(m[1], m[2]);
      return resultado ? [200, resultado] : [404, {}];
    }
    if (metodo === 'GET' && (m = repo.match(/^\/contents\/(.+)$/))) {
      const camino = decodeURIComponent(m[1]);
      const arbol = this.arbolDe(consulta.get('ref'));
      if (!arbol) return [404, {}];
      if (arbol.has(camino)) {
        const contenido = this.blobs.get(arbol.get(camino));
        return [200, aceptar.includes('raw') ? contenido : { sha: arbol.get(camino), content: contenido.toString('base64') }];
      }
      const nombres = [...arbol.keys()].filter((r) => r.startsWith(`${camino}/`)).map((r) => ({ name: r.slice(camino.length + 1) }));
      return nombres.length ? [200, nombres] : [404, {}];
    }
    if (metodo === 'GET' && repo === '/commits') {
      // Primer padre, del más nuevo al más viejo, como la lista de GitHub para una rama lineal.
      const lista = [];
      for (let id = consulta.get('sha'); id && lista.length < Number(consulta.get('per_page') || 30);) {
        const commit = this.commits.get(id);
        if (!commit) return [404, {}];
        lista.push({
          sha: id,
          parents: commit.padres.map((p) => ({ sha: p })),
          commit: { message: commit.mensaje, committer: { date: commit.fecha ?? '2026-11-01T12:00:00Z' } },
        });
        [id] = commit.padres;
      }
      return [200, lista];
    }
    if (metodo === 'POST' && repo === '/git/blobs') {
      return [201, { sha: this.crearBlob(Buffer.from(cuerpo.content, cuerpo.encoding === 'base64' ? 'base64' : 'utf8')) }];
    }
    if (metodo === 'GET' && (m = repo.match(/^\/git\/commits\/([0-9a-f]+)$/))) {
      const commit = this.commits.get(m[1]);
      return commit ? [200, { tree: { sha: commit.arbol } }] : [404, {}];
    }
    if (metodo === 'POST' && repo === '/git/trees') {
      const arbol = new Map(this.arboles.get(cuerpo.base_tree));
      for (const entrada of cuerpo.tree) arbol.set(entrada.path, entrada.sha);
      const id = sha();
      this.arboles.set(id, arbol);
      return [201, { sha: id }];
    }
    if (metodo === 'POST' && repo === '/git/commits') {
      const id = sha();
      this.commits.set(id, { arbol: cuerpo.tree, padres: cuerpo.parents, mensaje: cuerpo.message, autor: cuerpo.author });
      return [201, { sha: id }];
    }
    if (metodo === 'PATCH' && repo === '/git/refs/heads/main') {
      if (this.antesDeMover) {
        const gancho = this.antesDeMover;
        this.antesDeMover = null;
        gancho();
      }
      if (cuerpo.force !== false || !this.ancestros(cuerpo.sha).has(this.head)) return [422, { message: 'Update is not a fast forward' }];
      this.head = cuerpo.sha;
      return [200, {}];
    }
    return [404, {}];
  }

  iniciar(puerto = 0) {
    this.servidor = createServer((pedido, respuesta) => {
      const partes = [];
      pedido.on('data', (p) => partes.push(p));
      pedido.on('end', () => {
        const url = new URL(pedido.url, 'http://x');
        this.pedidos.push(`${pedido.method} ${url.pathname}`);
        let estado;
        let salida;
        if (pedido.headers.authorization !== `Bearer ${this.token}`) [estado, salida] = [401, {}];
        else if (!pedido.headers['user-agent']) [estado, salida] = [403, {}];
        else {
          const cuerpo = partes.length ? JSON.parse(Buffer.concat(partes).toString()) : null;
          [estado, salida] = this.responder(pedido.method, url.pathname, url.searchParams, cuerpo, pedido.headers.accept || '');
        }
        respuesta.statusCode = estado;
        // Las pruebas pueden pausar el proceso mientras corre el build de Python.
        respuesta.setHeader('Connection', 'close');
        respuesta.end(Buffer.isBuffer(salida) ? salida : JSON.stringify(salida));
      });
    });
    return new Promise((resolver) => {
      this.servidor.listen(puerto, '127.0.0.1', () => resolver(`http://127.0.0.1:${this.servidor.address().port}`));
    });
  }

  cerrar() {
    this.servidor.closeAllConnections();
    return new Promise((resolver) => this.servidor.close(resolver));
  }
}
