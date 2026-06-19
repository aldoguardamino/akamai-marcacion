const http       = require('http');
const fs         = require('fs');
const path       = require('path');
const { MongoClient } = require('mongodb');

const PORT        = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const GMAIL_USER  = process.env.GMAIL_USER  || 'aldo.guardamino@gmail.com';
const GMAIL_PASS  = process.env.GMAIL_PASS  || 'honj ukik xmmm xpdg';
const APP_URL     = process.env.APP_URL     || 'https://akamai-marcacion.onrender.com';

let db = null;

async function conectarDB() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db('akamai');
    console.log('MongoDB conectado OK');
  } catch(e) { console.error('Error MongoDB:', e.message); }
}

// ── Helpers DB ────────────────────────────────────────────────────────────────
async function getRegs() {
  if(!db) return [];
  try { return await db.collection('marcaciones').find({}).toArray(); }
  catch(e) { return []; }
}
async function addReg(marca) {
  if(!db) throw new Error('Sin conexion');
  await db.collection('marcaciones').insertOne(marca);
}
async function existeReg(wid, f, t) {
  if(!db) return false;
  return !!(await db.collection('marcaciones').findOne({ wid, f, t }));
}
async function getVacaciones(filtro={}) {
  if(!db) return [];
  try { return await db.collection('vacaciones').find(filtro).toArray(); }
  catch(e) { return []; }
}
async function getFirmas() {
  if(!db) return [];
  try { return await db.collection('firmas').find({}).toArray(); }
  catch(e) { return []; }
}

// ── Envío de correo via Gmail SMTP manual ─────────────────────────────────────
function enviarCorreo(to, subject, htmlBody) {
  return new Promise((resolve, reject) => {
    try {
      const net  = require('net');
      const tls  = require('tls');
      const b64  = (s) => Buffer.from(s).toString('base64');

      const host = 'smtp.gmail.com';
      const port = 465;

      const socket = tls.connect(port, host, { rejectUnauthorized: false }, () => {
        let step = 0;
        const cmds = [
          `EHLO akamai\r\n`,
          `AUTH LOGIN\r\n`,
          b64(GMAIL_USER) + '\r\n',
          b64(GMAIL_PASS.replace(/\s/g,'')) + '\r\n',
          `MAIL FROM:<${GMAIL_USER}>\r\n`,
          `RCPT TO:<${to}>\r\n`,
          `DATA\r\n`,
          `From: Sistema Akamai <${GMAIL_USER}>\r\nTo: ${to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${htmlBody}\r\n.\r\n`,
          `QUIT\r\n`
        ];

        socket.on('data', (d) => {
          const resp = d.toString();
          console.log('SMTP:', resp.slice(0,80));
          if(resp.match(/^[23]/m) || resp.includes('220') || resp.includes('334') || resp.includes('235') || resp.includes('354') || resp.includes('250') || resp.includes('221')) {
            if(step < cmds.length) {
              socket.write(cmds[step++]);
            } else {
              socket.destroy();
              resolve(true);
            }
          } else if(resp.match(/^[45]/m)) {
            socket.destroy();
            reject(new Error('SMTP error: ' + resp.slice(0,100)));
          }
        });

        socket.on('error', reject);
        socket.on('close', () => resolve(true));
      });

      socket.on('error', reject);
    } catch(e) { reject(e); }
  });
}

// ── Generar PDF de vacaciones (HTML que se convierte en PDF en el cliente) ────
function generarHTMLVacaciones(sol, firmaWorker, firmaJefe, logoB64) {
  const fmtFecha = (f) => {
    if(!f) return '';
    const [y,m,d] = f.split('-');
    return `${d}/${m}/${y}`;
  };

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #fff; padding: 40px; max-width: 700px; margin: 0 auto; }
  .header { display: flex; align-items: center; margin-bottom: 20px; }
  .logo { width: 80px; margin-right: 30px; }
  .title { font-size: 22px; font-weight: 700; text-decoration: underline; flex: 1; text-align: center; }
  .info-table { width: 100%; margin-bottom: 20px; border-collapse: collapse; }
  .info-table td { padding: 4px 8px; border-bottom: 1px solid #000; }
  .info-table .label { font-weight: 700; width: 180px; }
  .vac-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  .vac-table th, .vac-table td { border: 1px solid #000; padding: 6px 10px; text-align: center; font-weight: 700; }
  .vac-table th { background: #f0f0f0; }
  .nota { font-size: 10px; font-style: italic; margin-bottom: 20px; }
  .retorno { display: flex; align-items: center; gap: 20px; margin-bottom: 30px; font-weight: 700; border: 1px solid #000; padding: 8px 12px; display: inline-flex; }
  .firma-section { display: flex; justify-content: space-between; margin-top: 20px; gap: 40px; }
  .firma-box { flex: 1; text-align: center; }
  .firma-img { height: 80px; max-width: 180px; object-fit: contain; display: block; margin: 0 auto 4px; }
  .firma-nombre { font-family: 'Dancing Script', cursive; font-size: 16px; color: #1a1a6e; }
  .firma-linea { border-top: 1px solid #000; margin: 6px 0 4px; }
  .firma-label { font-weight: 700; font-size: 10px; }
  .jefe-box { border: 1px solid #000; padding: 16px; margin-top: 30px; }
  .jefe-box .title2 { font-weight: 700; margin-bottom: 20px; font-size: 11px; }
  .fecha-line { margin-top: 16px; font-size: 11px; }
  .nota-final { border: 1px solid #000; padding: 8px; margin-top: 12px; font-size: 10px; font-style: italic; }
  .aprobado-stamp { color: #15803d; font-size: 13px; font-weight: 700; border: 2px solid #15803d; display: inline-block; padding: 2px 10px; border-radius: 4px; margin-bottom: 8px; }
</style>
</head>
<body>
  <div class="header">
    <img class="logo" src="data:image/png;base64,${logoB64}" alt="Akamai">
    <div class="title">FORMATO DE VACACIONES</div>
  </div>

  <table class="info-table">
    <tr><td class="label">APELLIDOS Y NOMBRES:</td><td>${sol.apellidos} ${sol.nombres}</td></tr>
    <tr><td class="label">CARGO:</td><td>${sol.cargo}</td></tr>
    <tr><td class="label">AREA:</td><td>${sol.area}</td></tr>
    <tr><td class="label">DNI:</td><td>${sol.dni}</td></tr>
  </table>

  <table class="vac-table">
    <tr><th colspan="3">DESCANSO VACACIONAL</th></tr>
    <tr><th>N° DE DIAS</th><th>Desde</th><th>Hasta</th></tr>
    <tr><td>${sol.dias}</td><td>${fmtFecha(sol.desde)}</td><td>${fmtFecha(sol.hasta)}</td></tr>
  </table>

  <p class="nota">Firmo el presente registro de adelanto de vacaciones como constancia del goce de descanso vacacional, dejando aclarado que mi pago correspondiente esta consignado en mi boleta de pago</p>

  <div style="margin-bottom:24px">
    <table style="border-collapse:collapse">
      <tr>
        <td style="border:1px solid #000;padding:6px 12px;font-weight:700">FECHA RETORNO</td>
        <td style="border:1px solid #000;padding:6px 20px;font-weight:700">${fmtFecha(sol.retorno)}</td>
      </tr>
    </table>
  </div>

  <div class="firma-section">
    <div class="firma-box">
      ${firmaWorker ? `<img class="firma-img" src="${firmaWorker}" alt="firma">` : '<div style="height:80px"></div>'}
      <div class="firma-nombre">${sol.nombres} ${sol.apellidos}</div>
      <div class="firma-linea"></div>
      <div class="firma-label">Firma del trabajador</div>
    </div>
  </div>

  <div class="jefe-box" style="margin-top:30px">
    <div class="jefe-title" style="font-weight:700;margin-bottom:16px">GERENTE O JEFE DE ÁREA</div>
    ${sol.estado === 'aprobado' ? `
    <div style="text-align:center">
      <div class="aprobado-stamp">✓ APROBADO</div>
      ${firmaJefe ? `<img class="firma-img" src="${firmaJefe}" alt="firma jefe">` : ''}
      <div class="firma-nombre">${sol.jefeNombre || ''}</div>
      <div class="firma-linea"></div>
      <div class="firma-label">Firma de conformidad</div>
    </div>
    <div class="fecha-line">Fecha: ${fmtFecha(sol.fechaAprobacion || '')}</div>
    ` : '<div style="height:80px"></div><div class="fecha-line">Fecha:_________________________</div>'}
  </div>

  <div class="nota-final">Nota: Este documento deberá ser remitido antes del descanso vacacional</div>
</body>
</html>`;
}

// ── Jefes por área ────────────────────────────────────────────────────────────
const JEFES = {
  'ADMINISTRACION Y COMPRAS':  { nombre: 'ALDO JESUS GUARDAMINO RIOS', email: 'aguardamino@akamai.com.pe', wid: '41318261' },
  'ADMINISTRACION Y FINANZAS': { nombre: 'ALDO JESUS GUARDAMINO RIOS', email: 'aguardamino@akamai.com.pe', wid: '41318261' },
  'COBRANZAS':                 { nombre: 'GUSTAVO ADOLFO SARCO CUELLAR', email: 'gsarco@akamai.com.pe', wid: '41084859' },
  'PROYECTOS':                 { nombre: 'NATALIA VERONICA MELENDEZ SOTO', email: 'nmelendez@akamai.com.pe', wid: '73173155' },
};

// ── HTTP ──────────────────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function jsonResp(res, code, obj) {
  cors(res); res.writeHead(code, {'Content-Type':'application/json'}); res.end(JSON.stringify(obj));
}
function serveHTML(res, filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    cors(res); res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(content);
  } catch(e) { res.writeHead(404); res.end('Not found'); }
}

function generarCSV(regs, workers) {
  const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  function fGeo(f) {
    const [y,mo,d] = f.split('-').map(Number);
    const dt = new Date(y,mo-1,d);
    const i = dt.getDay()===0?6:dt.getDay()-1;
    return `${DIAS[i]} ${String(d).padStart(2,'0')}-${String(mo).padStart(2,'0')}-${y}`;
  }
  function fmtHT(eh,sh) {
    if(!eh||!sh) return '';
    const t2d = t => { const [h,m]=t.split(':').map(Number); return (h*60+m)/1440; };
    let d=t2d(sh)-t2d(eh); if(d<0)d+=1;
    const m=Math.round(d*1440);
    return `${Math.floor(m/60)}h ${m%60}m`;
  }
  const headers=['Apellidos','Nombre','Identificador','Grupo','Fecha','Permiso','Turno','Entró','Salió','H. Trabajadas','Estado','Cargo'];
  const rows=[headers.map(h=>`"${h}"`).join(',')];
  workers.forEach(w => {
    const wr=regs.filter(r=>r.wid===w.id);
    const fechas=[...new Set(wr.map(r=>r.f))].sort();
    fechas.forEach(f => {
      const e=wr.find(r=>r.f===f&&r.t==='entrada');
      const s=wr.find(r=>r.f===f&&r.t==='salida');
      const perm=(e&&e.p)||(s&&s.p)||'Ninguno';
      const estado=e&&s?'Completo':e?'En turno':'Sin marcar';
      const row=[w.ap,w.nm,w.id,w.gr,fGeo(f),perm,w.tu,e?e.h:'',s?s.h:'',fmtHT(e&&e.h,s&&s.h),estado,w.ca||''];
      rows.push(row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
    });
  });
  return '\uFEFF'+rows.join('\r\n');
}

const server = http.createServer(async (req, res) => {
  const url    = req.url.split('?')[0];
  const method = req.method;

  if(method==='OPTIONS'){cors(res);res.writeHead(200);res.end();return;}

  // Páginas HTML
  if(method==='GET'&&(url==='/'||url==='/trabajador'||url==='/trabajador.html'))
    return serveHTML(res, path.join(__dirname,'trabajador.html'));
  if(method==='GET'&&(url==='/admin'||url==='/administrador'||url==='/administrador.html'))
    return serveHTML(res, path.join(__dirname,'administrador.html'));

  // Logo
  if(method==='GET'&&url==='/logo'){
    try {
      const img=fs.readFileSync(path.join(__dirname,'logo.png'));
      cors(res); res.writeHead(200,{'Content-Type':'image/png'}); res.end(img);
    } catch(e){res.writeHead(404);res.end();}
    return;
  }

  // ── API marcaciones ──────────────────────────────────────────────────────────
  if(method==='GET'&&url==='/api/registros'){
    const regs=await getRegs();
    const clean=regs.map(r=>{const{_id,...rest}=r;return rest;});
    return jsonResp(res,200,{regs:clean});
  }

  if(method==='POST'&&url==='/api/marcar'){
    let body=''; req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const marca=JSON.parse(body);
        if(await existeReg(marca.wid,marca.f,marca.t))
          return jsonResp(res,409,{error:'Ya registraste '+marca.t+' hoy'});
        marca.id=Date.now();
        await addReg(marca);
        return jsonResp(res,200,{ok:true});
      }catch(e){return jsonResp(res,400,{error:e.message});}
    });return;
  }

  if(method==='POST'&&url==='/api/editar'){
    let body=''; req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const{wid,fechaOriginal,nuevaFecha,entrada,salida}=JSON.parse(body);
        await db.collection('marcaciones').deleteMany({wid,f:fechaOriginal});
        if(entrada) await db.collection('marcaciones').insertOne({id:Date.now(),wid,f:nuevaFecha,h:entrada,t:'entrada',p:'Ninguno'});
        if(salida)  await db.collection('marcaciones').insertOne({id:Date.now()+1,wid,f:nuevaFecha,h:salida,t:'salida',p:'Ninguno'});
        return jsonResp(res,200,{ok:true});
      }catch(e){return jsonResp(res,400,{error:e.message});}
    });return;
  }

  if(method==='POST'&&url==='/api/eliminar'){
    let body=''; req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const{wid,fecha}=JSON.parse(body);
        const r=await db.collection('marcaciones').deleteMany({wid,f:fecha});
        return jsonResp(res,200,{ok:true,deleted:r.deletedCount});
      }catch(e){return jsonResp(res,400,{error:e.message});}
    });return;
  }

  if(method==='POST'&&url==='/api/exportar'){
    let body=''; req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const{workers,filtroFecha,filtroGrupo}=JSON.parse(body);
        let regs=await getRegs();
        if(filtroFecha) regs=regs.filter(r=>r.f===filtroFecha);
        if(filtroGrupo) regs=regs.filter(r=>r.gr===filtroGrupo);
        const csv=generarCSV(regs,workers);
        const fecha=new Date().toISOString().slice(0,10).replace(/-/g,'');
        cors(res);
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="Asistencia_${fecha}.csv"`});
        res.end(csv,'utf8');
      }catch(e){jsonResp(res,400,{error:e.message});}
    });return;
  }

  // ── API firmas ───────────────────────────────────────────────────────────────
  if(method==='POST'&&url==='/api/firma/guardar'){
    let body=''; req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const{wid,email,firmaBase64}=JSON.parse(body);
        await db.collection('firmas').updateOne({wid},{$set:{wid,email,firma:firmaBase64,updated:Date.now()}},{upsert:true});
        return jsonResp(res,200,{ok:true});
      }catch(e){return jsonResp(res,400,{error:e.message});}
    });return;
  }

  if(method==='GET'&&url.startsWith('/api/firma/')){
    const wid=url.split('/').pop();
    try{
      const f=await db.collection('firmas').findOne({wid});
      return jsonResp(res,200,{firma:f?f.firma:null,email:f?f.email:null});
    }catch(e){return jsonResp(res,500,{error:e.message});}
  }

  // ── API vacaciones ───────────────────────────────────────────────────────────
  if(method==='GET'&&url==='/api/vacaciones'){
    try{
      const vacs=await getVacaciones();
      const clean=vacs.map(v=>{const{_id,...r}=v;return r;});
      return jsonResp(res,200,{vacaciones:clean});
    }catch(e){return jsonResp(res,500,{error:e.message});}
  }

  if(method==='POST'&&url==='/api/vacaciones/solicitar'){
    let body=''; req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const sol=JSON.parse(body);
        sol.id='vac_'+Date.now();
        sol.estado='pendiente';
        sol.fechaSolicitud=new Date().toISOString().slice(0,10);
        await db.collection('vacaciones').insertOne(sol);

        // Email al jefe
        const jefe=JEFES[sol.area];
        if(jefe){
          const html=`
          <div style="font-family:Arial;padding:20px;max-width:500px">
            <img src="${APP_URL}/logo" style="width:60px;margin-bottom:16px"><br>
            <h2 style="color:#1a1a2e">Nueva solicitud de vacaciones</h2>
            <p><b>${sol.nombres} ${sol.apellidos}</b> ha solicitado vacaciones:</p>
            <table style="border-collapse:collapse;margin:16px 0;width:100%">
              <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Desde</td><td style="padding:6px;border:1px solid #e2e8f0">${sol.desde}</td></tr>
              <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Hasta</td><td style="padding:6px;border:1px solid #e2e8f0">${sol.hasta}</td></tr>
              <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Días</td><td style="padding:6px;border:1px solid #e2e8f0">${sol.dias}</td></tr>
              <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Retorno</td><td style="padding:6px;border:1px solid #e2e8f0">${sol.retorno}</td></tr>
            </table>
            <a href="${APP_URL}/admin" style="background:#00adef;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">
              Ir al panel para aprobar
            </a>
            <p style="margin-top:16px;font-size:12px;color:#64748b">Entra al panel admin → pestaña Vacaciones → Solicitudes pendientes</p>
          </div>`;
          try{ await enviarCorreo(jefe.email,'Solicitud de vacaciones - '+sol.nombres+' '+sol.apellidos,html); }
          catch(e){ console.error('Error email jefe:',e.message); }
        }
        return jsonResp(res,200,{ok:true,id:sol.id});
      }catch(e){return jsonResp(res,400,{error:e.message});}
    });return;
  }

  if(method==='POST'&&url==='/api/vacaciones/aprobar'){
    let body=''; req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const{id,jefeNombre,jefeWid}=JSON.parse(body);
        const hoy=new Date().toISOString().slice(0,10);
        await db.collection('vacaciones').updateOne({id},{$set:{estado:'aprobado',jefeNombre,jefeWid,fechaAprobacion:hoy}});
        const sol=await db.collection('vacaciones').findOne({id});

        // Obtener firmas
        const firmaWorkerDoc=await db.collection('firmas').findOne({wid:sol.wid});
        const firmaJefeDoc  =await db.collection('firmas').findOne({wid:jefeWid});
        const logoB64=fs.existsSync(path.join(__dirname,'logo.png'))?fs.readFileSync(path.join(__dirname,'logo.png')).toString('base64'):'';

        const htmlPDF=generarHTMLVacaciones(
          {...sol,estado:'aprobado',jefeNombre,fechaAprobacion:hoy},
          firmaWorkerDoc?firmaWorkerDoc.firma:null,
          firmaJefeDoc  ?firmaJefeDoc.firma:null,
          logoB64
        );

        // Guardar HTML del PDF en MongoDB
        await db.collection('vacaciones').updateOne({id},{$set:{htmlPDF}});

        // Email al trabajador
        const firmaDoc=await db.collection('firmas').findOne({wid:sol.wid});
        if(firmaDoc&&firmaDoc.email){
          const html=`
          <div style="font-family:Arial;padding:20px;max-width:500px">
            <img src="${APP_URL}/logo" style="width:60px;margin-bottom:16px"><br>
            <h2 style="color:#15803d">✓ Vacaciones aprobadas</h2>
            <p>Hola <b>${sol.nombres}</b>, tus vacaciones han sido aprobadas.</p>
            <table style="border-collapse:collapse;margin:16px 0;width:100%">
              <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Desde</td><td style="padding:6px;border:1px solid #e2e8f0">${sol.desde}</td></tr>
              <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Hasta</td><td style="padding:6px;border:1px solid #e2e8f0">${sol.hasta}</td></tr>
              <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Retorno</td><td style="padding:6px;border:1px solid #e2e8f0">${sol.retorno}</td></tr>
              <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Aprobado por</td><td style="padding:6px;border:1px solid #e2e8f0">${jefeNombre}</td></tr>
            </table>
            <p style="margin-top:16px;font-size:12px;color:#64748b">Ingresa al portal para descargar tu documento de vacaciones firmado.</p>
            <a href="${APP_URL}" style="background:#00adef;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;margin-top:8px">
              Descargar documento
            </a>
          </div>`;
          try{ await enviarCorreo(firmaDoc.email,'✓ Vacaciones aprobadas - Akamai',html); }
          catch(e){ console.error('Error email trabajador:',e.message); }
        }
        return jsonResp(res,200,{ok:true,htmlPDF});
      }catch(e){return jsonResp(res,400,{error:e.message});}
    });return;
  }

  if(method==='POST'&&url==='/api/vacaciones/rechazar'){
    let body=''; req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const{id,motivo,jefeNombre}=JSON.parse(body);
        await db.collection('vacaciones').updateOne({id},{$set:{estado:'rechazado',motivoRechazo:motivo,jefeNombre}});
        const sol=await db.collection('vacaciones').findOne({id});
        const firmaDoc=await db.collection('firmas').findOne({wid:sol.wid});
        if(firmaDoc&&firmaDoc.email){
          const html=`<div style="font-family:Arial;padding:20px"><img src="${APP_URL}/logo" style="width:60px;margin-bottom:16px"><br><h2 style="color:#dc2626">Solicitud de vacaciones rechazada</h2><p>Hola <b>${sol.nombres}</b>, tu solicitud de vacaciones del ${sol.desde} al ${sol.hasta} ha sido rechazada.</p>${motivo?`<p><b>Motivo:</b> ${motivo}</p>`:''}<p>Comunícate con tu jefe directo para más información.</p></div>`;
          try{ await enviarCorreo(firmaDoc.email,'Solicitud de vacaciones - Akamai',html); }
          catch(e){ console.error('Error email:',e.message); }
        }
        return jsonResp(res,200,{ok:true});
      }catch(e){return jsonResp(res,400,{error:e.message});}
    });return;
  }

  if(method==='GET'&&url.startsWith('/api/vacaciones/pdf/')){
    const id=url.split('/').pop();
    try{
      const sol=await db.collection('vacaciones').findOne({id});
      if(!sol||!sol.htmlPDF){return jsonResp(res,404,{error:'No encontrado'});}
      cors(res); res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(sol.htmlPDF);
    }catch(e){return jsonResp(res,500,{error:e.message});}
    return;
  }

  res.writeHead(404); res.end('Not found');
});

conectarDB().then(()=>{
  server.listen(PORT,'0.0.0.0',()=>{ console.log('Servidor OK puerto '+PORT); });
});
