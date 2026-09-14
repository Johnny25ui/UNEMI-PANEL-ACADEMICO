import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename=fileURLToPath(import.meta.url); const __dirname=path.dirname(__filename);
const ROOT=path.join(__dirname,'..'); const DATA_DIR=path.join(ROOT,'data'); const DATA_FILE=path.join(DATA_DIR,'activities.json');
fs.mkdirSync(DATA_DIR,{recursive:true}); if(!fs.existsSync(DATA_FILE))fs.writeFileSync(DATA_FILE,'[]');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.ico':'image/x-icon'};
const read=()=>{try{return JSON.parse(fs.readFileSync(DATA_FILE,'utf8'))}catch{return[]}}; const save=x=>fs.writeFileSync(DATA_FILE,JSON.stringify(x,null,2));
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
function send(res,status,data,type='application/json'){res.writeHead(status,{...headers,'Content-Type':type});res.end(type.startsWith('application/json')?JSON.stringify(data):data)}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}})})}
const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,headers);return res.end()}
  try{
    if(req.url==='/api/activities'&&req.method==='GET')return send(res,200,read());
    if(req.url==='/api/activities'&&req.method==='POST'){
      const x=await body(req); if(!x.course||!x.title)return send(res,400,{error:'course y title son obligatorios'});
      const items=read(); const n={id:x.id||`${Date.now()}-${Math.random().toString(16).slice(2)}`,course:String(x.course).trim(),title:String(x.title).trim(),type:x.type||'Actividad',dueDate:x.dueDate||'',url:x.url||'',status:x.status||'Pendiente',createdAt:x.createdAt||new Date().toISOString(),source:x.source||'Manual',notes:x.notes||'',reminderMinutes:Number.isFinite(Number(x.reminderMinutes))?Number(x.reminderMinutes):1440};
      const exists=items.some(a=>a.id===n.id||(a.url&&n.url&&a.url===n.url)); if(!exists){items.unshift(n);save(items)} return send(res,exists?200:201,{added:!exists,activity:n});
    }
    const m=req.url.match(/^\/api\/activities\/([^/]+)$/);
    if(m&&req.method==='PATCH'){const items=read();const i=items.findIndex(a=>a.id===decodeURIComponent(m[1]));if(i<0)return send(res,404,{error:'No encontrada'});const x=await body(req);items[i]={...items[i],...x,id:items[i].id};save(items);return send(res,200,items[i])}
    if(m&&req.method==='DELETE'){save(read().filter(a=>a.id!==decodeURIComponent(m[1])));res.writeHead(204,headers);return res.end()}
    let file=req.url.split('?')[0]; if(file==='/')file='/index.html'; const full=path.normalize(path.join(ROOT,'public',file)); if(!full.startsWith(path.join(ROOT,'public')))return send(res,403,{error:'Forbidden'}); if(fs.existsSync(full)&&fs.statSync(full).isFile())return send(res,200,fs.readFileSync(full),mime[path.extname(full)]||'application/octet-stream');
    send(res,404,{error:'Not found'});
  }catch(e){send(res,500,{error:'Server error',detail:e.message})}
});
server.listen(3000,()=>console.log('UNEMI Panel disponible en http://localhost:3000'));
