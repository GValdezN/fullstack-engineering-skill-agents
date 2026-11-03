import * as fs from 'node:fs/promises';
import defaultExport, { named } from './some-module';

export function doWork() {
  return fs.readFile('/dev/null');
}
