export function destructured({ a, b }: { a: number; b: string }) {
  return `${a}-${b}`;
}

export function withDefault(x: number = 10, label = 'default') {
  return `${label}: ${x}`;
}

export function withRest(...args: number[]) {
  return args.reduce((s, v) => s + v, 0);
}

export async function fetchData(url: string): Promise<string> {
  return `fetched: ${url}`;
}

export function* generateIds(): Generator<number> {
  let id = 0;
  while (true) yield ++id;
}

export class Service {
  [Symbol.iterator]() { return []; }

  static create() { return new Service(); }

  async process(data: string): Promise<void> {
    console.log(data);
  }
}
