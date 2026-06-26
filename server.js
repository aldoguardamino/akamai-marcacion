const http       = require('http');
const fs         = require('fs');
const path       = require('path');
const { MongoClient } = require('mongodb');

const PORT        = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const GMAIL_USER  = process.env.GMAIL_USER  || 'aguardamino@akamai.com.pe';
const GMAIL_PASS  = process.env.GMAIL_PASS  || 'honj ukik xmmm xpdg';
const RESEND_KEY  = process.env.RESEND_KEY  || 're_QmK18m4c_63LKVvmM33jbM17XcBrv4BtN';
const APP_URL     = process.env.APP_URL     || 'https://akamai-marcacion.onrender.com';

let db = null;

// Jerarquia completa
const WORKERS_DATA = [
  {id:'48221357',ap:'NEYRA RUJEL',nm:'WENDY STEFANNY',gr:'ADMINISTRACION Y COMPRAS',ca:'COORDINADORA DE ADMINISTRACION Y COMPRAS',tu:'09:00 - 18:00',email:'wneyra@akamai.com.pe',jefeEmail:'aguardamino@akamai.com.pe',jefeNombre:'ALDO JESUS GUARDAMINO RIOS',jefeWid:'41318261'},
  {id:'41318261',ap:'GUARDAMINO RIOS',nm:'ALDO JESUS',gr:'ADMINISTRACION Y FINANZAS',ca:'JEFE DE ADMINISTRACION Y FINANZAS',tu:'09:00 - 18:00',email:'aguardamino@akamai.com.pe',jefeEmail:'ngranados@akamai.com.pe',jefeNombre:'NOEL ALONSO GRANADOS SAENZ',jefeWid:'43903530'},
  {id:'72783491',ap:'VASQUEZ CHIPANA',nm:'YANETT NATIVIDAD',gr:'ADMINISTRACION Y FINANZAS',ca:'COORDINADORA DE FINANZAS Y TESORERIA',tu:'09:00 - 18:00',email:'yvasquez@akamai.com.pe',jefeEmail:'aguardamino@akamai.com.pe',jefeNombre:'ALDO JESUS GUARDAMINO RIOS',jefeWid:'41318261'},
  {id:'46261114',ap:'ESPINOZA MONTESINOS',nm:'DALMA NEREA',gr:'COBRANZAS',ca:'ASISTENTE DE ADMINISTRACION DE VENTAS',tu:'09:00 - 18:00',email:'despinoza@akamai.com.pe',jefeEmail:'gsarco@akamai.com.pe',jefeNombre:'GUSTAVO ADOLFO SARCO CUELLAR',jefeWid:'41084859'},
  {id:'41084859',ap:'SARCO CUELLAR',nm:'GUSTAVO ADOLFO',gr:'COBRANZAS',ca:'JEFE DE ADMINISTRACION Y VENTAS',tu:'09:00 - 18:00',email:'gsarco@akamai.com.pe',jefeEmail:'ngranados@akamai.com.pe',jefeNombre:'NOEL ALONSO GRANADOS SAENZ',jefeWid:'43903530'},
  {id:'70447785',ap:'CORDOVA VIDAL',nm:'RAI EDU',gr:'PROYECTOS',ca:'COORDINADOR DE PROYECTOS',tu:'09:00 - 18:00',email:'ecordova@akamai.com.pe',jefeEmail:'nmelendez@akamai.com.pe',jefeNombre:'NATALIA VERONICA MELENDEZ SOTO',jefeWid:'73173155'},
  {id:'43903530',ap:'GRANADOS SAENZ',nm:'NOEL ALONSO',gr:'PROYECTOS',ca:'GERENTE GENERAL',tu:'09:00 - 18:00',email:'ngranados@akamai.com.pe',jefeEmail:'abautista@paladinrp.com',jefeNombre:'ANDRES BAUTISTA',jefeWid:''},
  {id:'73173155',ap:'MELENDEZ SOTO',nm:'NATALIA VERONICA',gr:'PROYECTOS',ca:'JEFE DE PROYECTOS Y NUEVOS NEGOCIOS',tu:'09:00 - 18:00',email:'nmelendez@akamai.com.pe',jefeEmail:'ngranados@akamai.com.pe',jefeNombre:'NOEL ALONSO GRANADOS SAENZ',jefeWid:'43903530'},
  {id:'72726407',ap:'SAAVEDRA VIGO',nm:'MARIANA ROCIO',gr:'PROYECTOS',ca:'ARQUITECTA DE NUEVOS PROYECTOS',tu:'09:00 - 18:00',email:'msaavedra@akamai.com.pe',jefeEmail:'nmelendez@akamai.com.pe',jefeNombre:'NATALIA VERONICA MELENDEZ SOTO',jefeWid:'73173155'},
  {id:'76577354',ap:'TAFUR QUISPE',nm:'ROSA LINDA',gr:'PROYECTOS',ca:'ASISTENTE DE PROYECTOS',tu:'09:00 - 18:00',email:'rtafur@akamai.com.pe',jefeEmail:'nmelendez@akamai.com.pe',jefeNombre:'NATALIA VERONICA MELENDEZ SOTO',jefeWid:'73173155'},
  {id:'74071705',ap:'PEREZ ZAMBRANO',nm:'LESLY MAGNOLIA',gr:'COBRANZAS',ca:'ASISTENTE DE ADMINISTRACION DE VENTAS',tu:'09:00 - 18:00',email:'lzambrano@akamai.com.pe',jefeEmail:'gsarco@akamai.com.pe',jefeNombre:'GUSTAVO ADOLFO SARCO CUELLAR',jefeWid:'41084859'},
  {id:'71526127',ap:'CANO SANCHEZ',nm:'ANDREA KATHERINE',gr:'ADMINISTRACION Y FINANZAS',ca:'ASISTENTE DE ADMINISTRACION Y FINANZAS',tu:'09:00 - 18:00',email:'acano@akamai.com.pe',jefeEmail:'aguardamino@akamai.com.pe',jefeNombre:'ALDO JESUS GUARDAMINO RIOS',jefeWid:'41318261'},
];

// Jefes (pueden aprobar vacaciones)
const JEFES_WID = ['41318261','41084859','73173155','43903530'];

async function conectarDB() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db('akamai');
    console.log('MongoDB conectado OK');
    // Iniciar proceso de recordatorios cada hora
    setInterval(enviarRecordatorios, 60 * 60 * 1000);
  } catch(e) { console.error('Error MongoDB:', e.message); }
}

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

// Enviar recordatorios a jefes por solicitudes pendientes > 48 horas
async function enviarRecordatorios() {
  if(!db) return;
  try {
    const ahora = Date.now();
    const limite = 48 * 60 * 60 * 1000;

    // Recordatorio paso 1: pendientes de jefe directo
    const vacs1 = await db.collection('vacaciones').find({estado:'pendiente'}).toArray();
    for(const v of vacs1) {
      const fechaSol = new Date(v.fechaSolicitud).getTime();
      if(ahora - fechaSol > limite) {
        const w = WORKERS_DATA.find(x => x.id === v.wid);
        if(w && w.jefeEmail) {
          const html = `<div style="font-family:Arial;padding:20px;max-width:500px">
            <h2 style="color:#dc2626">Recordatorio: Solicitud de vacaciones pendiente</h2>
            <p>Tienes una solicitud de vacaciones pendiente de aprobacion de <b>${v.nombres} ${v.apellidos}</b> desde hace mas de 48 horas.</p>
            <table style="border-collapse:collapse;margin:16px 0;width:100%">
              <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Desde</td><td style="padding:6px;border:1px solid #e2e8f0">${v.desde}</td></tr>
              <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Hasta</td><td style="padding:6px;border:1px solid #e2e8f0">${v.hasta}</td></tr>
              <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Dias</td><td style="padding:6px;border:1px solid #e2e8f0">${v.dias}</td></tr>
            </table>
            <a href="${APP_URL}" style="background:#00adef;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">
              Ir al sistema para aprobar
            </a>
          </div>`;
          try { await enviarCorreo(w.jefeEmail, 'RECORDATORIO: Solicitud de vacaciones pendiente - ' + v.nombres, html); }
          catch(e) { console.error('Error recordatorio paso1:', e.message); }
        }
      }
    }

    // Recordatorio paso 2: aprobado_jefe pendiente de Noel > 48 horas
    const vacs2 = await db.collection('vacaciones').find({estado:'aprobado_jefe'}).toArray();
    const noelData = WORKERS_DATA.find(x => x.id === '43903530');
    for(const v of vacs2) {
      const fechaAprob = new Date(v.fechaAprobacion).getTime();
      if(ahora - fechaAprob > limite && noelData) {
        const html = `<div style="font-family:Arial;padding:20px;max-width:500px">
          <h2 style="color:#dc2626">Recordatorio: Segunda aprobación pendiente</h2>
          <p>Hola <b>Noel</b>, tienes una solicitud de vacaciones pendiente de tu aprobación como Gerente General desde hace más de 48 horas.</p>
          <table style="border-collapse:collapse;margin:16px 0;width:100%">
            <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Trabajador</td><td style="padding:6px;border:1px solid #e2e8f0">${v.nombres} ${v.apellidos}</td></tr>
            <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Desde</td><td style="padding:6px;border:1px solid #e2e8f0">${v.desde}</td></tr>
            <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Hasta</td><td style="padding:6px;border:1px solid #e2e8f0">${v.hasta}</td></tr>
            <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Aprobado por</td><td style="padding:6px;border:1px solid #e2e8f0">${v.jefeNombre}</td></tr>
          </table>
          <a href="${APP_URL}" style="background:#1e40af;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">
            Ir al sistema para aprobar
          </a>
        </div>`;
        try { await enviarCorreo(noelData.email, 'RECORDATORIO: Segunda aprobación pendiente - ' + v.nombres, html); }
        catch(e) { console.error('Error recordatorio paso2:', e.message); }
      }
    }
  } catch(e) { console.error('Error recordatorios:', e.message); }
}

function enviarCorreo(to, subject, htmlBody) {
  return new Promise((resolve, reject) => {
    try {
      const https = require('https');
      const body = JSON.stringify({
        from: 'Sistema Akamai <no-reply@akamai.com.pe>',
        to: [to],
        subject: subject,
        html: htmlBody
      });
      const options = {
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + RESEND_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log('Resend response:', res.statusCode, data.slice(0,100));
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(true);
          } else {
            reject(new Error('Resend error ' + res.statusCode + ': ' + data));
          }
        });
      });
      req.on('error', (e) => {
        console.error('Resend request error:', e.message);
        reject(e);
      });
      req.write(body);
      req.end();
    } catch(e) {
      console.error('enviarCorreo error:', e.message);
      reject(e);
    }
  });
}

function generarHTMLVacaciones(sol, firmaWorker, firmaJefe, logoB64) {
  const fmtF = (f) => { if(!f) return ''; const [y,m,d]=f.split('-'); return `${d}/${m}/${y}`; };
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,sans-serif;font-size:11px;color:#000;background:#fff;padding:40px;max-width:700px;margin:0 auto;}
  .header{display:flex;align-items:center;margin-bottom:20px;}
  .logo{width:80px;margin-right:30px;}
  .title{font-size:22px;font-weight:700;text-decoration:underline;flex:1;text-align:center;}
  .info-table{width:100%;margin-bottom:20px;border-collapse:collapse;}
  .info-table td{padding:4px 8px;border-bottom:1px solid #000;}
  .info-table .label{font-weight:700;width:180px;}
  .vac-table{width:100%;border-collapse:collapse;margin-bottom:20px;}
  .vac-table th,.vac-table td{border:1px solid #000;padding:6px 10px;text-align:center;font-weight:700;}
  .vac-table th{background:#f0f0f0;}
  .nota{font-size:10px;font-style:italic;margin-bottom:20px;}
  .firma-section{display:flex;justify-content:space-between;margin-top:20px;gap:40px;}
  .firma-box{flex:1;text-align:center;}
  .firma-img{height:80px;max-width:180px;object-fit:contain;display:block;margin:0 auto 4px;}
  .firma-linea{border-top:1px solid #000;margin:6px 0 4px;}
  .firma-label{font-weight:700;font-size:10px;}
  .jefe-box{border:1px solid #000;padding:16px;margin-top:30px;}
  .nota-final{border:1px solid #000;padding:8px;margin-top:12px;font-size:10px;font-style:italic;}
  .aprobado-stamp{color:#15803d;font-size:13px;font-weight:700;border:2px solid #15803d;display:inline-block;padding:2px 10px;border-radius:4px;margin-bottom:8px;}
  </style></head><body>
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
    <tr><th>N&deg; DE DIAS</th><th>Desde</th><th>Hasta</th></tr>
    <tr><td>${sol.dias}</td><td>${fmtF(sol.desde)}</td><td>${fmtF(sol.hasta)}</td></tr>
  </table>
  <p class="nota">Firmo el presente registro de adelanto de vacaciones como constancia del goce de descanso vacacional, dejando aclarado que mi pago correspondiente esta consignado en mi boleta de pago</p>
  <div style="margin-bottom:24px">
    <table style="border-collapse:collapse">
      <tr>
        <td style="border:1px solid #000;padding:6px 12px;font-weight:700">FECHA RETORNO</td>
        <td style="border:1px solid #000;padding:6px 20px;font-weight:700">${fmtF(sol.retorno)}</td>
      </tr>
    </table>
  </div>
  <div class="firma-section">
    <div class="firma-box">
      ${firmaWorker ? `<img class="firma-img" src="${firmaWorker}" alt="firma">` : '<div style="height:80px"></div>'}
      <div class="firma-linea"></div>
      <div class="firma-label">Firma del trabajador</div>
      <div style="font-size:10px;margin-top:2px;">${sol.nombres} ${sol.apellidos}</div>
    </div>
  </div>
  <div class="jefe-box" style="margin-top:30px">
    <div style="font-weight:700;margin-bottom:16px">GERENTE O JEFE DE AREA</div>
    ${sol.estado==='aprobado' ? `
    <div style="text-align:center">
      <div class="aprobado-stamp">APROBADO</div>
      ${firmaJefe ? `<img class="firma-img" src="${firmaJefe}" alt="firma jefe">` : ''}
      <div class="firma-linea"></div>
      <div class="firma-label">Firma de conformidad</div>
      <div style="font-size:10px;margin-top:2px;">${sol.jefeNombre||''}</div>
    </div>
    <div style="margin-top:16px;font-size:11px;">Fecha: ${fmtF(sol.fechaAprobacion||'')}</div>
    ` : '<div style="height:80px"></div><div style="margin-top:8px">Fecha:_________________________</div>'}
  </div>
  <div class="nota-final">Nota: Este documento debera ser remitido antes del descanso vacacional</div>
  </body></html>`;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
}
function jsonResp(res, code, obj) {
  cors(res); res.writeHead(code,{'Content-Type':'application/json'}); res.end(JSON.stringify(obj));
}
function serveHTML(res, filePath) {
  try {
    const content = fs.readFileSync(filePath,'utf8');
    cors(res); res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); res.end(content);
  } catch(e) { res.writeHead(404); res.end('Not found'); }
}

function generarCSV(regs, workers) {
  const DIAS=['Lun','Mar','Mie','Jue','Vie','Sab','Dom'];
  function fGeo(f){const[y,mo,d]=f.split('-').map(Number);const dt=new Date(y,mo-1,d);const i=dt.getDay()===0?6:dt.getDay()-1;return`${DIAS[i]} ${String(d).padStart(2,'0')}-${String(mo).padStart(2,'0')}-${y}`;}
  function fmtHT(eh,sh){if(!eh||!sh)return'';const t2d=t=>{const[h,m]=t.split(':').map(Number);return(h*60+m)/1440;};let d=t2d(sh)-t2d(eh);if(d<0)d+=1;const m=Math.round(d*1440);return`${Math.floor(m/60)}h ${m%60}m`;}
  const headers=['Apellidos','Nombre','Identificador','Grupo','Fecha','Permiso','Turno','Entro','Salio','H. Trabajadas','Estado','Cargo'];
  const rows=[headers.map(h=>`"${h}"`).join(',')];
  workers.forEach(w=>{
    const wr=regs.filter(r=>r.wid===w.id);
    const fechas=[...new Set(wr.map(r=>r.f))].sort();
    fechas.forEach(f=>{
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

function generarCSVVacaciones(vacs) {
  const headers=['Trabajador','DNI','Area','Cargo','Desde','Hasta','Dias','Retorno','Estado','Aprobado por','Fecha Aprobacion'];
  const rows=[headers.map(h=>`"${h}"`).join(',')];
  const fmtF=(f)=>{if(!f)return'';const[y,m,d]=f.split('-');return`${d}/${m}/${y}`;};
  vacs.forEach(v=>{
    rows.push([
      `${v.apellidos} ${v.nombres}`,v.dni,v.area,v.cargo||'',
      fmtF(v.desde),fmtF(v.hasta),v.dias,fmtF(v.retorno),
      v.estado,v.jefeNombre||'',fmtF(v.fechaAprobacion||'')
    ].map(x=>`"${String(x).replace(/"/g,'""')}"`).join(','));
  });
  return '\uFEFF'+rows.join('\r\n');
}

async function reconectarDB(intentos){
  intentos=intentos||0;
  try{
    const client=new MongoClient(MONGODB_URI);
    await client.connect();
    db=client.db('akamai');
    console.log('MongoDB conectado OK');
    setInterval(enviarRecordatorios,60*60*1000);
  }catch(e){
    console.error('Error MongoDB (intento '+(intentos+1)+'):',e.message);
    if(intentos<5){
      setTimeout(()=>reconectarDB(intentos+1),(intentos+1)*3000);
    }else{
      console.error('No se pudo conectar a MongoDB. Terminando proceso.');
      process.exit(1);
    }
  }
}

const server = http.createServer(async (req, res) => {
  try{
  const url    = req.url.split('?')[0];
  const method = req.method;

  if(method==='OPTIONS'){cors(res);res.writeHead(200);res.end();return;}

  if(method==='GET'&&(url==='/'||url==='/trabajador'||url==='/trabajador.html'))
    return serveHTML(res,path.join(__dirname,'trabajador.html'));
  if(method==='GET'&&(url==='/admin'||url==='/administrador'||url==='/administrador.html'))
    return serveHTML(res,path.join(__dirname,'administrador.html'));
  if(method==='GET'&&url==='/logo'){
    try{const img=fs.readFileSync(path.join(__dirname,'logo.png'));cors(res);res.writeHead(200,{'Content-Type':'image/png'});res.end(img);}
    catch(e){res.writeHead(404);res.end();}
    return;
  }

  // API workers data (para el portal trabajador)
  if(method==='GET'&&url==='/api/workers'){
    const clean=WORKERS_DATA.map(w=>({id:w.id,ap:w.ap,nm:w.nm,gr:w.gr,ca:w.ca,tu:w.tu,jefeWid:w.jefeWid,jefeNombre:w.jefeNombre,esJefe:['41318261','41084859','73173155','43903530'].includes(w.id)}));
    return jsonResp(res,200,{workers:clean});
  }

  if(method==='GET'&&url==='/api/registros'){
    const regs=await getRegs();
    const clean=regs.map(r=>{const{_id,...rest}=r;return rest;});
    return jsonResp(res,200,{regs:clean});
  }

  if(method==='POST'&&url==='/api/marcar'){
    let body='';req.on('data',d=>body+=d);
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
    let body='';req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const{wid,fechaOriginal,nuevaFecha,entrada,salida}=JSON.parse(body);
        await db.collection('marcaciones').deleteMany({wid,f:fechaOriginal});
        if(entrada)await db.collection('marcaciones').insertOne({id:Date.now(),wid,f:nuevaFecha,h:entrada,t:'entrada',p:'Ninguno'});
        if(salida)await db.collection('marcaciones').insertOne({id:Date.now()+1,wid,f:nuevaFecha,h:salida,t:'salida',p:'Ninguno'});
        return jsonResp(res,200,{ok:true});
      }catch(e){return jsonResp(res,400,{error:e.message});}
    });return;
  }

  if(method==='POST'&&url==='/api/eliminar'){
    let body='';req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const{wid,fecha}=JSON.parse(body);
        const r=await db.collection('marcaciones').deleteMany({wid,f:fecha});
        return jsonResp(res,200,{ok:true,deleted:r.deletedCount});
      }catch(e){return jsonResp(res,400,{error:e.message});}
    });return;
  }

  if(method==='POST'&&url==='/api/exportar'){
    let body='';req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const{workers,filtroFecha,filtroGrupo}=JSON.parse(body);
        let regs=await getRegs();
        if(filtroFecha)regs=regs.filter(r=>r.f===filtroFecha);
        if(filtroGrupo)regs=regs.filter(r=>r.gr===filtroGrupo);
        const csv=generarCSV(regs,workers);
        const fecha=new Date().toISOString().slice(0,10).replace(/-/g,'');
        cors(res);res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="Asistencia_${fecha}.csv"`});
        res.end(csv,'utf8');
      }catch(e){jsonResp(res,400,{error:e.message});}
    });return;
  }

  // Firmas
  if(method==='POST'&&url==='/api/firma/guardar'){
    let body='';req.on('data',d=>body+=d);
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

  // Vacaciones
  if(method==='GET'&&url==='/api/vacaciones'){
    if(!db)return jsonResp(res,503,{error:'DB no disponible'});
    try{
      const vacs=await db.collection('vacaciones').find({}).toArray();
      const clean=vacs.map(v=>{const{_id,...r}=v;return r;});
      return jsonResp(res,200,{vacaciones:clean});
    }catch(e){return jsonResp(res,500,{error:e.message});}
  }

  if(method==='POST'&&url==='/api/vacaciones/solicitar'){
    let body='';req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const sol=JSON.parse(body);
        sol.id='vac_'+Date.now();
        sol.estado='pendiente';
        sol.fechaSolicitud=new Date().toISOString().slice(0,10);
        sol.timestampSolicitud=Date.now();
        await db.collection('vacaciones').insertOne(sol);
        const w=WORKERS_DATA.find(x=>x.id===sol.wid);
        if(w&&w.jefeEmail){
          const html=`<div style="font-family:Arial;padding:20px;max-width:500px">
            <h2 style="color:#1a1a2e">Nueva solicitud de vacaciones</h2>
            <p><b>${sol.nombres} ${sol.apellidos}</b> ha solicitado vacaciones:</p>
            <table style="border-collapse:collapse;margin:16px 0;width:100%">
              <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Desde</td><td style="padding:6px;border:1px solid #e2e8f0">${sol.desde}</td></tr>
              <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Hasta</td><td style="padding:6px;border:1px solid #e2e8f0">${sol.hasta}</td></tr>
              <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Dias</td><td style="padding:6px;border:1px solid #e2e8f0">${sol.dias}</td></tr>
              <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Retorno</td><td style="padding:6px;border:1px solid #e2e8f0">${sol.retorno}</td></tr>
            </table>
            <a href="${APP_URL}" style="background:#00adef;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">
              Entrar al sistema para aprobar
            </a>
            <p style="margin-top:12px;font-size:11px;color:#64748b">Si no aprueba en 48 horas recibira un recordatorio automatico.</p>
          </div>`;
          try{await enviarCorreo(w.jefeEmail,'Solicitud de vacaciones - '+sol.nombres+' '+sol.apellidos,html);}
          catch(e){console.error('Email error:',e.message);}
        }
        return jsonResp(res,200,{ok:true,id:sol.id});
      }catch(e){return jsonResp(res,400,{error:e.message});}
    });return;
  }

  if(method==='POST'&&url==='/api/vacaciones/aprobar'){
    let body='';req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const{id,jefeNombre,jefeWid}=JSON.parse(body);
        const hoy=new Date().toISOString().slice(0,10);
        const sol=await db.collection('vacaciones').findOne({id});
        const esNoel=jefeWid==='43903530';

        if(esNoel){
          // SEGUNDA APROBACIÓN: Noel aprueba → estado final
          await db.collection('vacaciones').updateOne({id},{$set:{estado:'aprobado',noelNombre:jefeNombre,noelWid:jefeWid,fechaAprobacionNoel:hoy}});
          const solFinal=await db.collection('vacaciones').findOne({id});
          const firmaWorkerDoc=await db.collection('firmas').findOne({wid:solFinal.wid});
          const firmaJefeDoc=await db.collection('firmas').findOne({wid:solFinal.jefeWid});
          const logoB64=fs.existsSync(path.join(__dirname,'logo.png'))?fs.readFileSync(path.join(__dirname,'logo.png')).toString('base64'):'';
          const htmlPDF=generarHTMLVacaciones({...solFinal,estado:'aprobado'},firmaWorkerDoc?firmaWorkerDoc.firma:null,firmaJefeDoc?firmaJefeDoc.firma:null,logoB64);
          await db.collection('vacaciones').updateOne({id},{$set:{htmlPDF}});
          const wData=WORKERS_DATA.find(x=>x.id===solFinal.wid);
          const firmaDoc=await db.collection('firmas').findOne({wid:solFinal.wid});
          const emailFinal=(firmaDoc&&firmaDoc.email)||( wData?wData.email:null);
          if(emailFinal){
            const html=`<div style="font-family:Arial;padding:20px;max-width:500px">
              <h2 style="color:#15803d">Vacaciones aprobadas</h2>
              <p>Hola <b>${solFinal.nombres}</b>,</p>
              <p>Tu solicitud de vacaciones ha sido aprobada por tu jefe directo y por la Gerencia General. Por favor ingresa al sistema y descarga el PDF para enviarlo a <b>Gestión Humana</b>.</p>
              <table style="border-collapse:collapse;margin:16px 0;width:100%">
                <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Desde</td><td style="padding:6px;border:1px solid #e2e8f0">${solFinal.desde}</td></tr>
                <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Hasta</td><td style="padding:6px;border:1px solid #e2e8f0">${solFinal.hasta}</td></tr>
                <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Retorno</td><td style="padding:6px;border:1px solid #e2e8f0">${solFinal.retorno}</td></tr>
                <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Aprobado por</td><td style="padding:6px;border:1px solid #e2e8f0">${solFinal.jefeNombre}</td></tr>
                <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Aprobado GG</td><td style="padding:6px;border:1px solid #e2e8f0">${jefeNombre}</td></tr>
              </table>
              <a href="${APP_URL}" style="background:#00adef;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">
                Ingresar al sistema y descargar PDF
              </a>
              <p style="margin-top:16px;color:#64748b;font-size:13px">El documento firmado debe ser enviado a Gestión Humana para su registro.</p>
            </div>`;
            try{await enviarCorreo(emailFinal,'Vacaciones aprobadas por Gerencia - Akamai',html);}
            catch(e){console.error('Email trabajador error:',e.message);}
          }
          return jsonResp(res,200,{ok:true,htmlPDF});

        } else {
          // PRIMERA APROBACIÓN: jefe directo aprueba → notificar a Noel
          await db.collection('vacaciones').updateOne({id},{$set:{estado:'aprobado_jefe',jefeNombre,jefeWid,fechaAprobacion:hoy}});
          const solAct=await db.collection('vacaciones').findOne({id});
          // Enviar email a Noel para segunda aprobación
          const noelData=WORKERS_DATA.find(x=>x.id==='43903530');
          if(noelData){
            const html=`<div style="font-family:Arial;padding:20px;max-width:500px">
              <h2 style="color:#1e40af">Segunda aprobación requerida</h2>
              <p>Hola <b>Noel</b>,</p>
              <p><b>${jefeNombre}</b> ha aprobado la solicitud de vacaciones de <b>${solAct.nombres} ${solAct.apellidos}</b>. Se requiere tu aprobación como Gerente General.</p>
              <table style="border-collapse:collapse;margin:16px 0;width:100%">
                <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Trabajador</td><td style="padding:6px;border:1px solid #e2e8f0">${solAct.nombres} ${solAct.apellidos}</td></tr>
                <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Desde</td><td style="padding:6px;border:1px solid #e2e8f0">${solAct.desde}</td></tr>
                <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Hasta</td><td style="padding:6px;border:1px solid #e2e8f0">${solAct.hasta}</td></tr>
                <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Dias</td><td style="padding:6px;border:1px solid #e2e8f0">${solAct.dias}</td></tr>
                <tr><td style="padding:6px;border:1px solid #e2e8f0;font-weight:700">Aprobado por</td><td style="padding:6px;border:1px solid #e2e8f0">${jefeNombre}</td></tr>
              </table>
              <a href="${APP_URL}" style="background:#1e40af;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">
                Ingresar al sistema para aprobar
              </a>
              <p style="margin-top:16px;color:#64748b;font-size:12px">Si no aprueba en 48 horas recibirá un recordatorio automático.</p>
            </div>`;
            try{await enviarCorreo(noelData.email,'Segunda aprobación - Vacaciones '+solAct.nombres+' '+solAct.apellidos,html);}
            catch(e){console.error('Email Noel error:',e.message);}
          }
          return jsonResp(res,200,{ok:true});
        }
      }catch(e){return jsonResp(res,400,{error:e.message});}
    });return;
  }

  if(method==='POST'&&url==='/api/vacaciones/rechazar'){
    let body='';req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const{id,motivo,jefeNombre,jefeWid}=JSON.parse(body);
        const hoy=new Date().toISOString().slice(0,10);
        await db.collection('vacaciones').updateOne({id},{$set:{estado:'rechazado',motivoRechazo:motivo,jefeNombre,jefeWid,fechaAprobacion:hoy}});
        const sol=await db.collection('vacaciones').findOne({id});
        const wData=WORKERS_DATA.find(x=>x.id===sol.wid);
        const firmaDoc=await db.collection('firmas').findOne({wid:sol.wid});
        const emailFinal=(firmaDoc&&firmaDoc.email)||(wData?wData.email:null);
        if(emailFinal){
          const html=`<div style="font-family:Arial;padding:20px"><h2 style="color:#dc2626">Solicitud de vacaciones rechazada</h2><p>Hola <b>${sol.nombres}</b>, tu solicitud fue rechazada.</p>${motivo?`<p><b>Motivo:</b> ${motivo}</p>`:''}</div>`;
          try{await enviarCorreo(emailFinal,'Vacaciones - Akamai',html);}
          catch(e){console.error('Email error:',e.message);}
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
      cors(res);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(sol.htmlPDF);
    }catch(e){return jsonResp(res,500,{error:e.message});}
    return;
  }

  // Exportar vacaciones a CSV
  if(method==='GET'&&url==='/api/vacaciones/exportar'){
    try{
      const vacs=await db.collection('vacaciones').find({}).sort({fechaSolicitud:-1}).toArray();
      const csv=generarCSVVacaciones(vacs);
      const fecha=new Date().toISOString().slice(0,10).replace(/-/g,'');
      cors(res);res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="Vacaciones_${fecha}.csv"`});
      res.end(csv,'utf8');
    }catch(e){jsonResp(res,400,{error:e.message});}
    return;
  }

  // Endpoint de prueba de email (solo para admin)
  if(method==='GET'&&url==='/api/test-email'){
    enviarCorreo(
      'aguardamino@akamai.com.pe',
      'Test email - Sistema Akamai',
      '<h2>Email de prueba</h2><p>El sistema de correo esta funcionando correctamente con dominio corporativo akamai.com.pe.</p>'
    )
    .then(()=>jsonResp(res,200,{ok:true,msg:'Email enviado a '+GMAIL_USER}))
    .catch(e=>jsonResp(res,500,{error:e.message}));
    return;
  }

  // GET saldo de vacaciones de un trabajador
  if(method==='GET'&&url.startsWith('/api/vacaciones/saldo/')){
    const wid=url.split('/').pop();
    try{
      const saldoDoc=await db.collection('saldos_vac').findOne({wid});
      const diasTotal=saldoDoc?saldoDoc.diasTotal:30;
      const vacs=await db.collection('vacaciones').find({wid,estado:'aprobado'}).toArray();
      const diasUsados=vacs.reduce((s,v)=>s+(parseInt(v.dias)||0),0);
      return jsonResp(res,200,{ok:true,diasTotal,diasUsados,diasDisponibles:diasTotal-diasUsados});
    }catch(e){return jsonResp(res,500,{error:e.message});}
  }

  // POST configurar saldo de un trabajador (solo admin)
  if(method==='POST'&&url==='/api/vacaciones/saldo'){
    let body='';req.on('data',d=>body+=d);req.on('end',async()=>{
      try{
        const{wid,diasTotal}=JSON.parse(body);
        await db.collection('saldos_vac').updateOne({wid},{$set:{wid,diasTotal:parseInt(diasTotal)}},{upsert:true});
        return jsonResp(res,200,{ok:true});
      }catch(e){return jsonResp(res,400,{error:e.message});}
    });return;
  }

  // GET saldos de todos los trabajadores (admin)
  if(method==='GET'&&url==='/api/vacaciones/saldos'){
    try{
      const saldos=await db.collection('saldos_vac').find({}).toArray();
      const vacs=await db.collection('vacaciones').find({estado:'aprobado'}).toArray();
      const result=WORKERS_DATA.map(function(w){
        const s=saldos.find(x=>x.wid===w.id);
        const diasTotal=s?s.diasTotal:30;
        const diasUsados=vacs.filter(v=>v.wid===w.id).reduce((sum,v)=>sum+(parseInt(v.dias)||0),0);
        return{wid:w.id,nombre:w.nm+' '+w.ap,cargo:w.ca,diasTotal,diasUsados,diasDisponibles:diasTotal-diasUsados};
      });
      return jsonResp(res,200,{ok:true,saldos:result});
    }catch(e){return jsonResp(res,500,{error:e.message});}
  }

  res.writeHead(404);res.end('Not found');
  }catch(e){console.error('Handler error:',e.message);if(!res.headersSent){res.writeHead(500);res.end('Server error');}}
});

reconectarDB();
server.listen(PORT,'0.0.0.0',()=>{console.log('Servidor OK puerto '+PORT);});
