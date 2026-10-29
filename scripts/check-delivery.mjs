#!/usr/bin/env node
// Static evidence only: does not build images, start services or run application tests.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const root = path.resolve(args.shift() || '.');
const opts = { web: 'web', api: 'api', db: 'db', compose: 'docker-compose.yml' };
for (let i = 0; i < args.length; i += 2) {
  const key = args[i]?.replace(/^--/, '');
  if (!['web','api','db','compose','compose-json'].includes(key) || !args[i+1]) {
    console.error('Usage: node check-delivery.mjs ROOT [--web NAME --api NAME --db NAME --compose FILE --compose-json CONFIG_JSON]');
    process.exit(2);
  }
  opts[key] = args[i+1];
}
const errors = [];
const requireFile = (file) => {
  const full = path.resolve(root, file);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) errors.push(`Missing file: ${file}`);
};
for (const file of [opts.compose, '.env.example', '.gitignore', 'README.md']) requireFile(file);
let config;
try {
  if (opts['compose-json']) {
    config = JSON.parse(fs.readFileSync(path.resolve(root, opts['compose-json']), 'utf8'));
  } else {
    const result = spawnSync('docker', ['compose','-f',opts.compose,'config','--format','json'], {
      cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
      console.error('BLOCKED: cannot render Compose config. Check Docker/Compose and local env. Raw output withheld to avoid exposing secrets.');
      for (const error of errors) console.error(error);
      process.exit(errors.length ? 1 : 2);
    }
    config = JSON.parse(result.stdout);
  }
  if (!config || typeof config !== 'object' || !config.services) throw new Error('Missing services');
} catch {
  console.error('Invalid Compose JSON; contents withheld.');
  process.exit(2);
}
const services = config.services;
const roles = ['web','api','db'];
if (new Set(roles.map(r => opts[r])).size !== 3) errors.push('web, api and db must be separate services');
for (const role of roles) {
  const service = services[opts[role]];
  if (!service || typeof service !== 'object') { errors.push(`Missing service for ${role}: ${opts[role]}`); continue; }
  if (service.container_name) errors.push(`Fixed container_name prevents isolated instances: ${opts[role]}`);
  const health = service.healthcheck;
  if (!health || health.disable || !Array.isArray(health.test) || !['CMD','CMD-SHELL'].includes(health.test[0]) || !health.test.slice(1).some(x => typeof x === 'string' && x.trim())) errors.push(`Missing active healthcheck: ${opts[role]}`);
  if (service.privileged || service.network_mode) errors.push(`Unsupported isolation bypass: ${opts[role]}`);
  if (role === 'api' && service.ports?.length) errors.push('Base local API should not publish ports; use an opt-in debug override');
  if (role !== 'db') {
    const build = service.build;
    if (!build) { errors.push(`Missing build for ${opts[role]}`); continue; }
    const context = path.resolve(root, typeof build === 'string' ? build : build.context || '.');
    const rel = path.relative(root, context);
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      errors.push(`Build context outside project: ${opts[role]}`); continue;
    }
    const dockerfile = typeof build === 'object' ? build.dockerfile || 'Dockerfile' : 'Dockerfile';
    requireFile(path.join(context, dockerfile));
    // Dockerfile-specific ignore files override the context-level one.
    if (!fs.existsSync(path.join(context, `${dockerfile}.dockerignore`))) requireFile(path.join(context, '.dockerignore'));
  }
}
// Effective Compose JSON contains explicit networks. Omitted networks mean default.
const networksOf = service => {
  const value = service?.networks;
  return value ? (Array.isArray(value) ? value : Object.keys(value)) : ['default'];
};
const sharesNetwork = (a,b) => networksOf(services[a]).some(n => networksOf(services[b]).includes(n));
for (const [a,b] of [[opts.web,opts.api],[opts.api,opts.db]]) {
  if (services[a] && services[b] && !sharesNetwork(a,b)) errors.push(`No shared network: ${a} -> ${b}`);
}
if (services[opts.web] && services[opts.db] && sharesNetwork(opts.web,opts.db)) errors.push('DB must not share the web network');
function readyPath(from, target, visited = new Set()) {
  if (visited.has(from)) return false;
  visited = new Set([...visited,from]);
  const dependencies = services[from]?.depends_on || {};
  return Object.entries(dependencies).some(([name, dep]) => {
    if (dep?.required === false) return false;
    const condition = dep?.condition;
    if (name === target) return condition === 'service_healthy';
    return ['service_healthy','service_completed_successfully'].includes(condition) && readyPath(name,target,visited);
  });
}
for (const [a,b] of [[opts.web,opts.api],[opts.api,opts.db]]) {
  if (services[a] && services[b] && !readyPath(a,b)) errors.push(`Missing readiness dependency: ${a} -> ${b}`);
}
const web = services[opts.web];
if (web && (!web.ports?.length || web.ports.some(p => typeof p !== 'object' || !['127.0.0.1','::1'].includes(p.host_ip)))) errors.push('Base local web needs explicit loopback published ports');
const db = services[opts.db];
if (db) {
  const named = (db.volumes || []).filter(v => typeof v === 'object' && v.type === 'volume' && v.source);
  if (!named.length) errors.push('DB needs an explicit named persistent volume');
  for (const volume of named) if (!Object.hasOwn(config.volumes || {}, volume.source)) errors.push('DB volume is not declared');
  if (db.ports?.length) errors.push('Base local DB should not publish ports; use an opt-in debug override');
}
for (const group of ['volumes','networks']) {
  for (const value of Object.values(config[group] || {})) {
    if (value?.external) errors.push(`Base local config depends on external ${group}`);
  }
}
if (errors.length) {
  console.error('FAIL: static delivery checks');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('PASS: static delivery checks ONLY. Build, startup, migrations, seed, isolation, persistence and functional tests are NOT VERIFIED by this script.');
