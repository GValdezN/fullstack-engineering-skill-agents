#!/usr/bin/env node
// Recursos exclusivamente sintéticos, proyecto y directorio únicos por ejecución.
import { cp, mkdir, mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
const skill=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function prepare(target) {
  // No sobrescribir un checkout ni una configuración existente.
  try { await access(target); throw new Error('Preparation target must not exist'); }
  catch(e) { if(e.code!=='ENOENT') throw e; }
  await cp(join(skill,'tests/fixtures/smoke-app'),target,{recursive:true});
  for(const role of ['api','web']) await cp(join(skill,'assets/dockerignore.template'),join(target,'apps',role,'.dockerignore'));
  await cp(join(skill,'assets/gitattributes.template'),join(target,'.gitattributes'));
  await mkdir(join(target,'apps/api/scripts'));
  for(const [source,dest] of [
    ['migrate-postgres.template.mjs','scripts/migrate.mjs'],['wait-db.template.mjs','scripts/wait-db.mjs'],
    ['entrypoint.template.mjs','entrypoint.mjs'],['graceful-shutdown.template.mjs','shutdown.mjs']
  ]) await cp(join(skill,'assets',source),join(target,'apps/api',dest));
  await cp(join(skill,'assets/web.Dockerfile.template'),join(target,'apps/web/Dockerfile'));
  // Resolver ARG del Dockerfile canónico para la fixture concreta.
  const {readFile}=await import('node:fs/promises');
  const dockerfile=join(target,'apps/web/Dockerfile');
  await writeFile(dockerfile,(await readFile(dockerfile,'utf8')).replace('ARG NODE_IMAGE','ARG NODE_IMAGE=node:22-bookworm-slim'));
  await cp(join(skill,'assets/next.config.template.mjs'),join(target,'apps/web/next.config.mjs'));
}
function run(command,args,{cwd,input,timeout=240000,allowFailure=false}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='';let expired=false;
    const timer=setTimeout(()=>{expired=true;child.kill('SIGKILL')},timeout);
    child.stdout.on('data',v=>{stdout+=v;if(stdout.length>16*1024*1024)child.kill('SIGKILL')});
    child.stderr.on('data',v=>{stderr+=v;if(stderr.length>16*1024*1024)child.kill('SIGKILL')});
    child.once('error',e=>{clearTimeout(timer);reject(e)});
    child.once('close',code=>{
      clearTimeout(timer);
      if(expired || (code!==0 && !allowFailure)) reject(new Error(`${command} ${args.slice(0,2).join(' ')} failed (exit ${code}, timeout ${expired}); raw output withheld`));
      else resolve({code,stdout,stderr});
    });
    child.stdin.on('error',()=>{});
    child.stdin.end(input);
  });
}
export async function smoke() {
  const report={startedAt:new Date().toISOString(),runtime:{node:process.version,platform:process.platform},status:'RUNNING',checks:[]};
  const artifactDir=resolve(process.env.SMOKE_ARTIFACT_DIR || join(tmpdir(),'skill-smoke-reports'));
  await mkdir(artifactDir,{recursive:true});
  const id=randomUUID().slice(0,12),project=`skill-smoke-${id}`;
  const scratch=await mkdtemp(join(tmpdir(),'skill-smoke-'));
  const cwd=join(scratch,'app');
  const args=['compose','-p',project,'-f',join(cwd,'docker-compose.yml')];
  const dc=(...cmd)=>run('docker',[...args,...cmd],{cwd});
  const sql=async(q,db='smoke')=>(await dc('exec','-T','db','psql','-v','ON_ERROR_STOP=1','-U','smoke','-d',db,'-Atc',q)).stdout.trim();
  const gate=async(name,fn)=>{try{await fn();report.checks.push({name,status:'PASS'});console.log(`PASS ${name}`)}catch(e){report.checks.push({name,status:'FAIL'});throw e}};
  let touched=false;
  try {
    const daemon=await run('docker',['info','--format','{{.ServerVersion}}'],{allowFailure:true,timeout:15000});
    if(daemon.code!==0){report.status='BLOCKED';throw new Error('Docker daemon unavailable; configure access and rerun')}
    report.dockerVersion=daemon.stdout.trim();
    await prepare(cwd);
    await gate('static-delivery',()=>run(process.execPath,[join(skill,'scripts/check-delivery.mjs'),cwd]));
    await gate('build-and-readiness',async()=>{touched=true;await dc('up','--build','-d','--wait','--wait-timeout','120','web','api','db')});
    const address=(await dc('port','web','3000')).stdout.trim();
    assert.match(address,/^127\.0\.0\.1:\d+$/);
    const base=`http://${address}`;
    const request=(path,options={})=>fetch(base+path,{...options,signal:AbortSignal.timeout(5000)});
    const note=`case-${id}`;
    await gate('browser-api-db',async()=>{
      await dc('run','--build','--rm','-e',`CASE_TEXT=${note}`,'browser');
      assert.equal(await sql(`SELECT count(*) FROM notes WHERE text='${note}'`),'1');
      const invalid=await request('/api/notes',{method:'POST',headers:{'content-type':'application/json'},body:'{"text":""}'});
      assert.equal(invalid.status,400);
    });
    await gate('persistence-after-recreation',async()=>{
      await dc('down'); // Conserva el volumen de esta corrida.
      await dc('up','-d','--wait','--wait-timeout','120','web','api','db');
      assert.equal(await sql(`SELECT count(*) FROM notes WHERE text='${note}'`),'1');
      const newBase='http://'+(await dc('port','web','3000')).stdout.trim();
      const response=await fetch(newBase+'/api/notes',{signal:AbortSignal.timeout(5000)});
      assert.equal(response.status,200);assert((await response.json()).some(n=>n.text===note));
    });
    const current='http://'+(await dc('port','web','3000')).stdout.trim();
    await gate('database-outage-and-reconnect',async()=>{
      const before=(await dc('ps','-q','api')).stdout.trim();
      await dc('stop','db');
      assert.equal((await fetch(current+'/api/health',{signal:AbortSignal.timeout(10000)})).status,503);
      await dc('up','-d','--wait','db');
      let recovered=false;
      for(let i=0;i<30;i++){
        const r=await fetch(current+'/api/health',{signal:AbortSignal.timeout(5000)});
        if(r.ok){recovered=true;break}await delay(1000);
      }
      assert(recovered,'API did not reconnect');
      assert.equal((await dc('ps','-q','api')).stdout.trim(),before);
      assert.equal(await sql(`SELECT count(*) FROM notes WHERE text='${note}'`),'1');
    });
    await gate('backup-restoration',async()=>{
      const dump=(await dc('exec','-T','db','pg_dump','-U','smoke','-d','smoke','--no-owner','--no-acl')).stdout;
      await dc('exec','-T','db','createdb','-U','smoke','restore_check');
      await run('docker',[...args,'exec','-T','db','psql','-v','ON_ERROR_STOP=1','-U','smoke','-d','restore_check'],{cwd,input:dump});
      assert.equal(await sql(`SELECT count(*) FROM notes WHERE text='${note}'`,'restore_check'),'1');
      assert.equal(await sql('SELECT count(*) FROM _schema_migrations','restore_check'),'1');
    });
    await gate('interrupted-migration-and-retry',async()=>{
      const program=`
        import {mkdtemp,copyFile,writeFile} from 'node:fs/promises';
        import {pathToFileURL} from 'node:url';import pg from 'pg';
        import {migrate} from '/app/scripts/migrate.mjs';
        const dir=await mkdtemp('/tmp/skill-migrations-');
        await writeFile('/tmp/skill-migration-dir',dir);
        await copyFile('/app/migrations/001_initial.sql',dir+'/001_initial.sql');
        await writeFile(dir+'/002_interrupted.sql','CREATE TABLE smoke_interrupted(id INT); SELECT pg_sleep(30);');
        const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();
        c.on('error',()=>{});try{await migrate(c,pathToFileURL(dir+'/'))}finally{await c.end()}`;
      // Capturar el rechazo inmediatamente para evitar promesas sin manejar.
      const interrupted=dc('exec','-T','api','node','--input-type=module','-e',program).then(()=>false,()=>true);
      let pid='';
      for(let i=0;i<30;i++){
        pid=await sql("SELECT pid FROM pg_stat_activity WHERE datname='smoke' AND pid<>pg_backend_pid() AND query LIKE '%SELECT pg_sleep(30)%' AND state='active'");
        if(pid)break;await delay(300);
      }
      assert.match(pid,/^\d+$/,'Migration never reached interruption point');
      await sql(`SELECT pg_terminate_backend(${pid})`);
      assert(await interrupted,'Interrupted migration should fail');
      assert.equal(await sql("SELECT to_regclass('smoke_interrupted') IS NULL"),'t');
      assert.equal(await sql("SELECT count(*) FROM _schema_migrations WHERE id='002_interrupted.sql'"),'0');
      const retry=`import {readFile,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import pg from 'pg';import {migrate} from '/app/scripts/migrate.mjs';const dir=await readFile('/tmp/skill-migration-dir','utf8');await writeFile(dir+'/002_interrupted.sql','CREATE TABLE smoke_interrupted(id INT);');const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();try{await migrate(c,pathToFileURL(dir+'/'));await migrate(c,pathToFileURL(dir+'/'))}finally{await c.end()}`;
      await dc('exec','-T','api','node','--input-type=module','-e',retry);
      assert.equal(await sql("SELECT count(*) FROM _schema_migrations WHERE id='002_interrupted.sql'"),'1');
    });
    report.status='PASS';
  }catch(e){
    if(report.status!=='BLOCKED')report.status='FAIL';
    report.error=e.message;
    process.exitCode=report.status==='BLOCKED'?2:1;
    console.error(`${report.status}: ${e.message}`);
  }finally{
    if(touched)try{await dc('down','--volumes','--remove-orphans')}catch{report.cleanup='FAILED';report.status='FAIL';process.exitCode=1}
    report.finishedAt=new Date().toISOString();
    report.project=project;
    report.scratch=cwd;
    await writeFile(join(artifactDir,project+'.json'),JSON.stringify(report,null,2)+'\n');
    // Nunca limpiar otros recursos Docker. Retener checkout en fallo para diagnóstico.
    if(report.status==='PASS')await rm(scratch,{recursive:true,force:true});
    console.log(`Evidence: ${join(artifactDir,project+'.json')}`);
  }
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  if(process.argv[2]==='--prepare' && process.argv[3])await prepare(resolve(process.argv[3]));
  else if(process.argv.length===2)await smoke();
  else {console.error('Usage: node run-smoke.mjs [--prepare NEW_DIRECTORY]');process.exitCode=2}
}
