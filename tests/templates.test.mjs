import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { migrate } from '../assets/migrate-postgres.template.mjs';
import { migrate as migrateMysql } from '../assets/migrate-mysql.template.mjs';
import { migrate as migrateMongo } from '../assets/migrate-mongodb.template.mjs';
const shutdown = new URL('../assets/graceful-shutdown.template.mjs', import.meta.url).href;
const sha = s => createHash('sha256').update(s).digest('hex');
async function fixture(t, files) {
  const dir = await mkdtemp(join(tmpdir(),'skill-migration-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  for(const [name, sql] of Object.entries(files)) await writeFile(join(dir,name),sql);
  return pathToFileURL(dir+'/');
}
function client(rows=[], failSql) {
  const calls=[];
  return { calls, async query(sql,params) {
    calls.push([sql,params]);
    if(sql.includes('pg_try_advisory_lock')) return {rows:[{locked:true}]};
    if(sql==='SELECT id,checksum FROM _schema_migrations') return {rows};
    if(sql===failSql) throw new Error('Injected query failure');
    return {rows:[]};
  }};
}
test('pending file executes with ledger inside transaction and unlocks',async t=>{
 const dir=await fixture(t,{'001_initial.sql':'SELECT 42;'});const c=client(); await migrate(c,dir);
 const q=c.calls.map(x=>x[0]);
 assert(q.indexOf('BEGIN')<q.indexOf('SELECT 42;'));
 assert(q.indexOf('SELECT 42;')<q.findIndex(x=>x.startsWith('INSERT')));
 assert(q.indexOf('COMMIT')<q.findIndex(x=>x.includes('pg_advisory_unlock')));
});
test('already applied unchanged migration does not repeat SQL',async t=>{
 const sql='SELECT 42;';const dir=await fixture(t,{'001_initial.sql':sql});const c=client([{id:'001_initial.sql',checksum:sha(sql)}]);await migrate(c,dir);
 assert(!c.calls.some(([q])=>q===sql||q==='BEGIN'));
});
test('changed historical file prevents any pending writes',async t=>{
 const dir=await fixture(t,{'001_initial.sql':'SELECT 42;','002_new.sql':'SELECT 43;'});const c=client([{id:'001_initial.sql',checksum:sha('old')}]);
 await assert.rejects(migrate(c,dir),/Changed applied/);assert(!c.calls.some(([q])=>q==='BEGIN'));
 assert(c.calls.at(-1)[0].includes('unlock'));
});
test('missing applied history blocks startup',async t=>{
 const dir=await fixture(t,{'002_new.sql':'SELECT 43;'});const c=client([{id:'001_initial.sql',checksum:'x'}]);
 await assert.rejects(migrate(c,dir),/Missing applied/);assert(!c.calls.some(([q])=>q==='BEGIN'));
});
test('SQL failure rolls back and releases lock',async t=>{
 const sql='SELECT broken;';const dir=await fixture(t,{'001_initial.sql':sql});const c=client([],sql);
 await assert.rejects(migrate(c,dir),/Injected/);
 assert(c.calls.some(([q])=>q==='ROLLBACK'));assert(!c.calls.some(([q])=>q==='COMMIT'));assert(c.calls.at(-1)[0].includes('unlock'));
});
test('invalid SQL filename is rejected rather than silently skipped',async t=>{
 const dir=await fixture(t,{'bad.sql':'SELECT 42;'});const c=client();await assert.rejects(migrate(c,dir),/Invalid migration/);assert.equal(c.calls.length,0);
});
test('duplicate numeric versions are rejected before locking',async t=>{
 const dir=await fixture(t,{'001_a.sql':'SELECT 1;','0001_b.sql':'SELECT 2;'});const c=client();await assert.rejects(migrate(c,dir),/Duplicate/);assert.equal(c.calls.length,0);
});
test('lock contention ends at deadline without running DDL',async t=>{
 const dir=await fixture(t,{'001_a.sql':'SELECT 1;'});const calls=[];const c={async query(q){calls.push(q);return {rows:[{locked:false}]}}};
 await assert.rejects(migrate(c,dir,{lockTimeoutMs:0}),/deadline/);assert.equal(calls.length,1);
});
test('new migration below applied version is rejected',async t=>{
 const dir=await fixture(t,{'001_a.sql':'SELECT 1;','002_b.sql':'SELECT 2;'});const c=client([{id:'002_b.sql',checksum:sha('SELECT 2;')}]);
 await assert.rejects(migrate(c,dir),/Out-of-order/);assert(!c.calls.some(([q])=>q==='BEGIN'));
});
function child(code){return spawnSync(process.execPath,['--input-type=module','-e',`import {installShutdown} from ${JSON.stringify(shutdown)};${code}`],{encoding:'utf8',timeout:5000});}
test('native HTTP request drains before closing pool after SIGTERM',()=>{
 const r=child(`
 import http from 'node:http';
 import { tmpdir } from 'node:os';
 import { join } from 'node:path';
 const events=[];
 const server=http.createServer((req,res)=>{
   events.push('request');
   setTimeout(()=>{events.push('response');res.end('ok');},30);
   setImmediate(()=>process.emit('SIGTERM'));
 });
 server.listen(0,'127.0.0.1',()=>{
   installShutdown({server,pool:{async end(){events.push('pool');console.log(JSON.stringify(events));}},setReady(v){events.push('ready:'+v)}});
   http.get({host:'127.0.0.1',port:server.address().port,agent:false},res=>res.resume()).on('error',err=>{console.error(err);process.exit(2);});
 });`);
 assert.equal(r.status,0,r.stderr);const events=JSON.parse(r.stdout.trim());assert(events.indexOf('response')<events.indexOf('pool'));assert(events.includes('ready:false'));
});
test('repeated signals invoke cleanup once and await workers',()=>{
 const r=child(`let count=0;const events=[];
 installShutdown({server:{close(cb){setTimeout(cb,10)}},pool:{async end(){count++;console.log(JSON.stringify({count,events}));}},setReady(){},stopWorkers:async()=>{await new Promise(r=>setTimeout(r,30));events.push('drained')}});
 process.emit('SIGTERM');process.emit('SIGINT');`);
 assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout.trim()),{count:1,events:['drained']});
});
test('shutdown deadline exits nonzero',()=>{
 const r=child(`installShutdown({server:{close(){}},pool:{async end(){}},setReady(){},timeoutMs:20});process.emit('SIGTERM');`);assert.equal(r.status,1,r.stderr);
});
test('pool cleanup error exits nonzero',()=>{
 const r=child(`installShutdown({server:{close(cb){cb()}},pool:{async end(){throw new Error('failure')}},setReady(){}});process.emit('SIGTERM');`);assert.equal(r.status,1,r.stderr);
});

const checker = new URL('../scripts/check-delivery.mjs', import.meta.url);
async function project(t) {
 const dir=await mkdtemp(join(tmpdir(),'skill-delivery-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const {mkdir}=await import('node:fs/promises');
 for(const f of ['docker-compose.yml','.env.example','.gitignore','README.md'])await writeFile(join(dir,f),'# synthetic fixture');
 for(const role of ['web','api']){await mkdir(join(dir,role));await writeFile(join(dir,role,'Dockerfile'),'FROM scratch');await writeFile(join(dir,role,'.dockerignore'),'.env');}
 const healthcheck={test:['CMD','synthetic-health']};
 const config={services:{web:{build:{context:'./web'},healthcheck},api:{build:{context:'./api'},healthcheck},db:{healthcheck,volumes:[{type:'volume',source:'db_data',target:'/data'}]}},volumes:{db_data:{}}};
 config.services.web.networks={edge:{}};
 config.services.api.networks={edge:{},data:{}};
 config.services.db.networks={data:{}};
 config.networks={edge:{},data:{internal:true}};
 config.services.web.ports=[{host_ip:'127.0.0.1',published:'3100',target:3000}];
 config.services.web.depends_on={api:{condition:'service_healthy'}};
 config.services.api.depends_on={db:{condition:'service_healthy'}};
 return {dir,config};
}
async function check(p){await writeFile(join(p.dir,'config.json'),JSON.stringify(p.config));return spawnSync(process.execPath,[fileURLToPath(checker),p.dir,'--compose-json','config.json'],{encoding:'utf8'});}
test('delivery checker identifies its PASS as static evidence only',async t=>{
 const p=await project(t);const r=await check(p);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/static delivery checks ONLY/);assert.match(r.stdout,/NOT VERIFIED/);
});
test('delivery checker rejects empty health command',async t=>{
 const p=await project(t);p.config.services.web.healthcheck={test:[]};const r=await check(p);assert.equal(r.status,1);assert.match(r.stderr,/Missing active healthcheck/);
});
test('delivery checker rejects published DB port and missing Dockerfile',async t=>{
 const p=await project(t);p.config.services.db.ports=[{published:'5432',target:5432}];await rm(join(p.dir,'api','Dockerfile'));const r=await check(p);assert.equal(r.status,1);assert.match(r.stderr,/should not publish ports/);assert.match(r.stderr,/Missing file/);
});

function mysqlClient(rows=[], lockSuccess=true) {
  const calls=[];
  return { calls, async query(sql, params) {
    calls.push([sql, params]);
    if (sql === 'SELECT DATABASE() AS dbName') return [[{ dbName: 'synthetic' }]];
    if (typeof sql === 'string' && sql.includes('GET_LOCK')) return [[{ locked: lockSuccess ? 1 : 0 }]];
    if (typeof sql === 'string' && sql.includes('SELECT id, checksum FROM _schema_migrations')) return [rows];
    return [[]];
  }};
}

test('mysql pending file executes with GET_LOCK and ledger', async t => {
  const dir = await fixture(t, { '001_initial.sql': 'SELECT 42;' });
  const c = mysqlClient();
  await migrateMysql(c, dir);
  const q = c.calls.map(x => x[0]);
  assert(q.some(x => x.includes('GET_LOCK')));
  assert(q.includes('SELECT 42;'));
  assert(q.some(x => x.includes('RELEASE_LOCK')));
});

test('mysql lock deadline rejection', async t => {
  const dir = await fixture(t, { '001_initial.sql': 'SELECT 42;' });
  const c = mysqlClient([], false);
  await assert.rejects(migrateMysql(c, dir, { lockTimeoutSeconds: 0 }), /lock deadline/);
});

function mongoDb(applied=[], lockSuccess=true) {
  const calls=[];
  return {
    calls,
    collection(name) {
      if (name === '_migration_locks') {
        return {
          async updateOne(filter, update, opts) {
            calls.push(['lock', filter, update]);
            if (!lockSuccess) return { upsertedCount: 0, modifiedCount: 0 };
            return { upsertedCount: 1, modifiedCount: 0 };
          }
        };
      }
      if (name === '_schema_migrations') {
        return {
          find() {
            return { async toArray() { return applied; } };
          },
          async insertOne(doc) {
            calls.push(['insert', doc]);
          }
        };
      }
      return {};
    }
  };
}

test('mongodb executes up(db) and registers migration', async t => {
  let upCalled = false;
  const dir = await fixture(t, {
    '001_setup.mjs': 'export async function up(db) { db.calls.push(["up_invoked"]); }'
  });
  const db = mongoDb();
  await migrateMongo(db, dir);
  assert(db.calls.some(x => x[0] === 'up_invoked'));
  assert(db.calls.some(x => x[0] === 'insert' && x[1]._id === '001_setup.mjs'));
});

const entrypoint = fileURLToPath(new URL('../assets/entrypoint.template.mjs', import.meta.url));
async function startup(t, scripts = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'skill-entrypoint-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  await mkdir(join(dir, 'scripts'));
  for (const [name, code] of Object.entries(scripts)) await writeFile(join(dir, 'scripts', name + '.mjs'), code);
  return dir;
}
function boot(cwd, command = [process.execPath, '-e', 'console.log("app")'], env = {}) {
  return spawnSync(process.execPath, [entrypoint, ...command], {
    cwd, encoding:'utf8', timeout:5000, env:{...process.env, SEED_DEMO:'false', ...env}
  });
}
test('entrypoint initializes in order before running app', async t => {
  const dir = await startup(t, {'wait-db':'console.log("wait")', migrate:'console.log("migrate")'});
  const r = boot(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.trim().split(/\r?\n/), ['wait','migrate','app']);
});
test('entrypoint rejects missing initialization scripts', async t => {
  const r = boot(await startup(t));
  assert.notEqual(r.status, 0);
  assert(!r.stdout.includes('app'));
});
test('migration failure prevents app startup and preserves exit code', async t => {
  const r = boot(await startup(t, {'wait-db':'', migrate:'process.exit(7)'}));
  assert.equal(r.status, 7, r.stderr);
  assert(!r.stdout.includes('app'));
});
test('production demo seed is rejected before initialization', async t => {
  const r = boot(await startup(t, {'wait-db':'console.log("wait")', migrate:''}), undefined,
    {NODE_ENV:'production', SEED_DEMO:'true'});
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, '');
});
test('entrypoint reports command spawn errors', async t => {
  const r = boot(await startup(t, {'wait-db':'', migrate:''}), ['nonexistent-skill-command-12345']);
  assert.notEqual(r.status, 0);
});
test('Node entrypoint accepts CRLF when invoked explicitly with node', async t => {
  const dir = await startup(t, {'wait-db':'', migrate:''});
  const crlf = join(dir, 'entrypoint.mjs');
  await writeFile(crlf, (await readFile(entrypoint, 'utf8')).replace(/\r?\n/g, '\r\n'));
  const r = spawnSync(process.execPath, [crlf, process.execPath, '-e', 'console.log("app")'],
    {cwd:dir, encoding:'utf8', timeout:5000});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /app/);
});
test('entrypoint forwards SIGTERM to app for graceful shutdown', {skip:process.platform === 'win32'}, async t => {
  const dir = await startup(t, {'wait-db':'', migrate:''});
  const r = spawn(process.execPath, [entrypoint, process.execPath, '-e',
    'process.on("SIGTERM",()=>{console.log("drained");process.exit(0)});console.log("ready");setInterval(()=>{},1000)'],
    {cwd:dir, stdio:['ignore','pipe','pipe']});
  t.after(() => r.kill('SIGKILL'));
  let output = '';
  const closed = new Promise((resolve, reject) => {
    r.on('error', reject);
    r.on('close', code => resolve(code));
  });
  const deadline = setTimeout(() => r.kill('SIGKILL'), 5000);
  try {
    r.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('ready') && !output.includes('drained')) r.kill('SIGTERM');
    });
    assert.equal(await closed, 143);
    assert.match(output, /drained/);
  } finally { clearTimeout(deadline); }
});

test('mysql unchanged history is skipped and changed history blocks SQL', async t => {
  const sql='SELECT 42;'; const dir=await fixture(t, {'001_initial.sql':sql});
  const c=mysqlClient([{id:'001_initial.sql',checksum:sha(sql)}]);
  await migrateMysql(c,dir);
  assert(!c.calls.some(([q])=>q===sql));
  const bad=mysqlClient([{id:'001_initial.sql',checksum:sha('different')}]);
  await assert.rejects(migrateMysql(bad,dir), /Changed applied/);
  assert(!bad.calls.some(([q])=>q===sql));
  assert(bad.calls.at(-1)[0].includes('RELEASE_LOCK'));
});
test('mysql SQL failure does not record completion and releases lock', async t => {
  const dir=await fixture(t, {'001_initial.sql':'SELECT broken;'});
  const c=mysqlClient(); const query=c.query.bind(c);
  c.query=async (q,p)=> { if(q==='SELECT broken;') throw new Error('DDL failed'); return query(q,p); };
  await assert.rejects(migrateMysql(c,dir), /DDL failed/);
  assert(!c.calls.some(([q])=>q.startsWith('INSERT')));
  assert(c.calls.at(-1)[0].includes('RELEASE_LOCK'));
});
test('mongodb lock contention expires without running migrations', async t => {
  const dir=await fixture(t, {'001_setup.mjs':'export async function up() {}'});
  const db=mongoDb([],false);
  await assert.rejects(migrateMongo(db,dir,{lockTimeoutMs:0}), /deadline/);
  assert(!db.calls.some(([op])=>op==='insert'));
});
test('mongodb unexpected lock errors fail immediately', async t => {
  const dir=await fixture(t, {'001_setup.mjs':'export async function up() {}'});
  const db={collection(){return {async updateOne(){throw new Error('permission denied')}}}};
  await assert.rejects(migrateMongo(db,dir), /permission denied/);
});
test('mongodb failed migration is not recorded and unlocks', async t => {
  const dir=await fixture(t, {'001_setup.mjs':'export async function up() { throw new Error("migration failed"); }'});
  const db=mongoDb();
  await assert.rejects(migrateMongo(db,dir), /migration failed/);
  assert(!db.calls.some(([op])=>op==='insert'));
  assert.equal(db.calls.at(-1)[2].$set.locked,false);
});
test('next config generates standalone output and same-origin destination', async () => {
  const {default:config}=await import('../assets/next.config.template.mjs');
  const previous=process.env.API_INTERNAL_URL;
  try {
    process.env.API_INTERNAL_URL='http://api:4567';
    assert.equal(config.output,'standalone');
    assert.deepEqual(await config.rewrites(),[{source:'/api/:path*',destination:'http://api:4567/api/:path*'}]);
  } finally {
    if(previous===undefined) delete process.env.API_INTERNAL_URL;
    else process.env.API_INTERNAL_URL=previous;
  }
});

for (const [name, mutate, message] of [
 ['unready dependency', p=>{p.config.services.api.depends_on.db.condition='service_started'}, /Missing readiness dependency/],
 ['optional dependency', p=>{p.config.services.api.depends_on.db.required=false}, /Missing readiness dependency/],
 ['disconnected API', p=>{p.config.services.api.networks={other:{}}}, /No shared network/],
 ['web can reach DB', p=>{p.config.services.web.networks.data={}}, /DB must not share/],
 ['published API', p=>{p.config.services.api.ports=[{host_ip:'127.0.0.1',target:4000,published:'4000'}]}, /API should not publish/],
 ['public web', p=>{p.config.services.web.ports[0].host_ip='0.0.0.0'}, /loopback/],
 ['host network', p=>{p.config.services.api.network_mode='host'}, /isolation bypass/],
 ['empty CMD healthcheck', p=>{p.config.services.api.healthcheck={test:['CMD','']}}, /Missing active healthcheck/],
]) test('delivery checker rejects '+name, async t=>{
 const p=await project(t); mutate(p); const r=await check(p);
 assert.equal(r.status,1,r.stderr); assert.match(r.stderr,message);
});
test('delivery checker permits completed migration task before API',async t=>{
 const p=await project(t);
 p.config.services.migrate={depends_on:{db:{condition:'service_healthy'}}};
 p.config.services.api.depends_on={migrate:{condition:'service_completed_successfully'}};
 const r=await check(p);assert.equal(r.status,0,r.stderr);
});
test('delivery checker terminates cyclic dependency traversal',async t=>{
 const p=await project(t);
 p.config.services.api.depends_on={cycle:{condition:'service_healthy'}};
 p.config.services.cycle={depends_on:{api:{condition:'service_healthy'}}};
 const r=await check(p);assert.equal(r.status,1);assert.match(r.stderr,/Missing readiness/);
});
