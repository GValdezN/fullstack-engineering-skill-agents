#!/usr/bin/env node
import { resolve, join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { prepare } from './run-smoke.mjs';
const [scenario,target]=process.argv.slice(2);
if(!['existing-bug','change-database'].includes(scenario)||!target){
 console.error('Usage: node prepare-evaluation.mjs existing-bug|change-database NEW_DIRECTORY');process.exit(2);
}
await prepare(resolve(target));
if(scenario==='existing-bug'){
 const file=join(resolve(target),'apps/api/server.mjs');
 const source=await readFile(file,'utf8');
 const corrected="catch{return reply(400,{error:'invalid JSON'})}";
 if(!source.includes(corrected))throw new Error('Bug fixture no longer matches source');
 await writeFile(file,source.replace(corrected,"catch{throw new Error('invalid JSON')}"));
}
console.log('Prepared isolated evaluation workspace; no agent invocation or Docker run performed');
