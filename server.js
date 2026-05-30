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
    res.writeHead(404); res.end('Not found');
  }
}

// Generar CSV con formato Excel (separado por comas, con BOM UTF-8)
function generarCSV(regs, workers) {
  const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  function fGeo(f) {
    const [y,mo,d] = f.split('-').map(Number);
    const dt = new Date(y, mo-1, d);
    const i = dt.getDay() === 0 ? 6 : dt.getDay()-1;
    return `${DIAS[i]} ${String(d).padStart(2,'0')}-${String(mo).padStart(2,'0')}-${y}`;
  }
  function fmtHT(eh, sh) {
    if(!eh || !sh) return '';
    const t2d = t => { const [h,m] = t.split(':').map(Number); return (h*60+m)/1440; };
    let d = t2d(sh) - t2d(eh); if(d < 0) d += 1;
    const m = Math.round(d * 1440);
    return `${Math.floor(m/60)}h ${m%60}m`;
  }

  const headers = ['Apellidos','Nombre','Identificador','Grupo','Fecha','Permiso','Turno','Entró','Salió','H. Trabajadas','Estado','Cargo'];
  const rows = [headers.map(h => `"${h}"`).join(',')];

  workers.forEach(w => {
    const wr = regs.filter(r => r.wid === w.id);
    const fechas = [...new Set(wr.map(r => r.f))].sort();
    fechas.forEach(f => {
      const e = wr.find(r => r.f===f && r.t==='entrada');
      const s = wr.find(r => r.f===f && r.t==='salida');
      const perm = (e&&e.p)||(s&&s.p)||'Ninguno';
      const estado = e&&s?'Completo':e?'En turno':'Sin marcar';
      const row = [
        w.ap, w.nm, w.id, w.gr,
        fGeo(f), perm, w.tu,
        e ? e.h : '',
        s ? s.h : '',
        fmtHT(e&&e.h, s&&s.h),
        estado,
        w.ca || ''
      ];
      rows.push(row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
    });
  });

  return '\uFEFF' + rows.join('\r\n'); // BOM + CRLF
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

  // API exportar Excel (CSV real que Excel abre perfectamente)
  if (method === 'POST' && url === '/api/exportar') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { workers, filtroFecha, filtroGrupo } = JSON.parse(body);
        let regs = readData().regs;

        // Aplicar filtros
        if (filtroFecha) regs = regs.filter(r => r.f === filtroFecha);
        if (filtroGrupo) regs = regs.filter(r => r.gr === filtroGrupo);

        const csv = generarCSV(regs, workers);
        const fecha = new Date().toISOString().slice(0,10).replace(/-/g,'');
        const fname = `Asistencia_${fecha}.csv`;

        cors(res);
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fname}"`,
          'Content-Length': Buffer.byteLength(csv, 'utf8')
        });
        res.end(csv, 'utf8');
      } catch(e) {
        jsonResp(res, 400, { error: e.message });
      }
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Servidor OK puerto ' + PORT);
});
