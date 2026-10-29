import http from 'node:http';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { installShutdown } from './shutdown.mjs';
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL, connectionTimeoutMillis:1500, query_timeout:2000});
pool.on('error', () => {}); // Las consultas y readiness reportan indisponibilidad.
let ready=true;
const server=http.createServer(async(req,res)=>{
 const reply=(status,data)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
 try {
  if(req.url==='/api/health') {
   if(!ready) return reply(503,{ready:false});
   await pool.query('SELECT id FROM notes LIMIT 0'); return reply(200,{ready:true});
  }
  if(req.url==='/api/notes' && req.method==='GET') return reply(200,(await pool.query('SELECT id,text FROM notes ORDER BY id')).rows);
  if(req.url==='/api/notes' && req.method==='POST') {
   let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return reply(413,{error:'too large'});}
   let input;try{input=JSON.parse(body)}catch{return reply(400,{error:'invalid JSON'})}
   if(typeof input.text!=='string'||!input.text.trim()||input.text.length>200)return reply(400,{error:'invalid text'});
   const {rows}=await pool.query('INSERT INTO notes(id,text) VALUES($1,$2) RETURNING id,text',[randomUUID(),input.text]);
   return reply(201,rows[0]);
  }
  reply(404,{error:'not found'});
 }catch{reply(503,{error:'temporarily unavailable'})}
});
server.listen(4000,'0.0.0.0',()=>installShutdown({server,pool,setReady:value=>{ready=value}}));
