// Sirve sitio/ del worktree y, bajo /escenario/, el decorado que alimenta
// las vistas reales con un hogar de ejemplo. Nada de esto vive en el repo.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// `fileURLToPath` y no `.pathname`: la carpeta del proyecto lleva un espacio
// («Controle Wallet») y `.pathname` lo deja como %20.
const RAIZ = process.env.RAIZ || fileURLToPath(new URL('../../sitio/', import.meta.url));
const ESC = fileURLToPath(new URL('.', import.meta.url));
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
http.createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    let cuerpo, archivo;
    if (ruta === '/escenario/') {
      const idx = await readFile(join(RAIZ, 'app/index.html'), 'utf8');
      cuerpo = idx.replace(/<script type="module" src="\/app\/app\.js"><\/script>/,
        `<script type="importmap">{"imports":{"/app/datos/historico.js":"/escenario/historico-falso.js"}}</script>
<script type="module" src="/escenario/escena.js"></script>`);
      archivo = 'x.html';
    } else if (ruta.startsWith('/escenario/')) {
      archivo = join(ESC, ruta.slice('/escenario/'.length));
      cuerpo = await readFile(archivo);
    } else {
      archivo = join(RAIZ, ruta.endsWith('/') ? ruta + 'index.html' : ruta);
      cuerpo = await readFile(archivo);
    }
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream',
                         'Cache-Control': 'no-store' });
    res.end(cuerpo);
  } catch { res.writeHead(404); res.end('no'); }
}).listen(process.env.PUERTO || 8790);
