const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = '/tmp/marcaciones.json';

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ regs: [] }));
}

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch(e) { return { regs: [] }; }
}
function writeData(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d));
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
    res.writeHead(404);
    res.end('Not found: ' + filePath);
  }
}

const server = http.createServer((req, res) => {
  const url    = req.url.split('?')[0];
  const method = req.method;

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
        return jsonResp(res, 200, { ok: true });
      } catch(e) {
        return jsonResp(res, 400, { error: e.message });
      }
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Servidor OK puerto ' + PORT);
});
