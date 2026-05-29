const http = require('http');
const fs   = require('fs');
const path = require('path');

// Railway asigna el puerto via variable de entorno PORT
const PORT = process.env.PORT || 3000;

const DATA_FILE = '/tmp/marcaciones.json';

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ regs: [] }, null, 2));
}

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch(e) { return { regs: [] }; }
}
function writeData(d) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }
  catch(e) { console.error('Error escribiendo datos:', e.message); }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function jsonResp(res, code, obj) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}
function serveHTML(res, filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    cors(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
  } catch(e) {
    console.error('Error sirviendo archivo:', filePath, e.message);
    res.writeHead(404);
    res.end('Archivo no encontrado: ' + filePath);
  }
}

const server = http.createServer((req, res) => {
  const url    = req.url.split('?')[0];
  const method = req.method;

  console.log(method, url);

  if (method === 'OPTIONS') { cors(res); res.writeHead(200); res.end(); return; }

  if (method === 'GET' && (url === '/' || url === '/trabajador' || url === '/trabajador.html'))
    return serveHTML(res, path.join(__dirname, 'trabajador.html'));

  if (method === 'GET' && (url === '/admin' || url === '/administrador' || url === '/administrador.html'))
    return serveHTML(res, path.join(__dirname, 'administrador.html'));

  if (method === 'GET' && url === '/api/registros')
    return jsonResp(res, 200, readData());

  if (method === 'POST' && url === '/api/marcar') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const marca = JSON.parse(body);
        const data  = readData();
        const existe = data.regs.find(r =>
          r.wid === marca.wid && r.f === marca.f && r.t === marca.t
        );
        if (existe) return jsonResp(res, 409, { error: 'Ya registraste ' + marca.t + ' hoy' });
        marca.id = Date.now();
        data.regs.push(marca);
        writeData(data);
        console.log('MARCA:', marca.nm, marca.ap, '-', marca.t.toUpperCase(), marca.h);
        return jsonResp(res, 200, { ok: true });
      } catch(e) {
        console.error('Error en /api/marcar:', e.message);
        return jsonResp(res, 400, { error: e.message });
      }
    });
    return;
  }

  res.writeHead(404); res.end('No encontrado');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('Servidor Akamai iniciado OK');
  console.log('Puerto: ' + PORT);
  console.log('Archivos en: ' + __dirname);
  console.log('trabajador.html existe: ' + fs.existsSync(path.join(__dirname, 'trabajador.html')));
  console.log('administrador.html existe: ' + fs.existsSync(path.join(__dirname, 'administrador.html')));
  console.log('=================================');
});
