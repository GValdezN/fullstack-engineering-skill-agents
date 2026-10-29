import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepare } from '../scripts/run-smoke.mjs';
async function workspace(t){const dir=await mkdtemp(join(tmpdir(),'skill-preparation-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
test('prepared fixture resolves canonical scripts, config and lockfiles',async t=>{
 const dir=join(await workspace(t),'app');await prepare(dir);
 for(const [fixture,canonical] of [
 ['apps/api/scripts/migrate.mjs','migrate-postgres.template.mjs'],
 ['apps/api/scripts/wait-db.mjs','wait-db.template.mjs'],
 ['apps/api/entrypoint.mjs','entrypoint.template.mjs'],
 ['apps/web/next.config.mjs','next.config.template.mjs']
 ]) assert.equal(await readFile(join(dir,fixture),'utf8'),await readFile(new URL('../assets/'+canonical,import.meta.url),'utf8'));
 for(const role of ['apps/api','apps/web','qa']){
  const pkg=JSON.parse(await readFile(join(dir,role,'package.json'),'utf8'));
  const lock=JSON.parse(await readFile(join(dir,role,'package-lock.json'),'utf8'));
  assert.deepEqual(lock.packages[''].dependencies,pkg.dependencies);
 }
});
test('preparation refuses to overwrite existing files',async t=>{
 const dir=await workspace(t);await writeFile(join(dir,'keep.txt'),'original');
 await assert.rejects(prepare(dir),/must not exist/);
 assert.equal(await readFile(join(dir,'keep.txt'),'utf8'),'original');
});
test('bug evaluation produces faulty source in isolated checkout',async t=>{
 const dir=join(await workspace(t),'bug');
 const script=fileURLToPath(new URL('../scripts/prepare-evaluation.mjs',import.meta.url));
 const r=spawnSync(process.execPath,[script,'existing-bug',dir],{encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);
 const source=await readFile(join(dir,'apps/api/server.mjs'),'utf8');
 assert(source.includes("catch{throw new Error('invalid JSON')}"));
 assert(!source.includes("catch{return reply(400,{error:'invalid JSON'})}"));
});
