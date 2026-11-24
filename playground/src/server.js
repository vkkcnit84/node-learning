import { app } from './app.js';
import { lifecycle } from './routes/errors.js';

const PORT = Number(process.env.PORT ?? 3000);
const server = app.listen(PORT, () => {
  console.log(`Playground ready: http://localhost:${PORT}  (endpoint list at GET /)`);
});

// Timeouts relative to a typical 60s load balancer idle timeout
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.requestTimeout = 120_000;

// Graceful shutdown: flip readiness, stop accepting, finish in-flight, then exit
let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  lifecycle.shuttingDown = true;
  console.log(JSON.stringify({ level: 'info', msg: `${signal} received, draining` }));
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 10_000).unref(); // force exit
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Programmer errors: log and restart (a supervisor like PM2/Kubernetes brings it back)
process.on('uncaughtException', (err) => { console.error(JSON.stringify({ level: 'fatal', msg: err.message, stack: err.stack })); shutdown('uncaughtException'); });
process.on('unhandledRejection', (err) => { console.error(JSON.stringify({ level: 'fatal', msg: String(err) })); shutdown('unhandledRejection'); });
