// Call after server.listen(); stopWorkers must prevent new jobs and await active ones.
export function installShutdown({ server, pool, setReady, stopWorkers = async () => {}, timeoutMs = 25000 }) {
  let closing;
  const close = () => closing ??= (async () => {
    setReady(false);
    const deadline = setTimeout(() => {
      server.closeAllConnections?.();
      process.exit(1);
    }, timeoutMs);
    try {
      // Stop accepting HTTP immediately; drain workers and requests before pool.end().
      const httpDone = new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
      server.closeIdleConnections?.();
      await Promise.all([httpDone, stopWorkers()]);
      await pool.end();
      process.exitCode = 0;
    } catch {
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
      if (process.exitCode === 1) process.exit(1);
    }
  })();
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
  return close;
}
