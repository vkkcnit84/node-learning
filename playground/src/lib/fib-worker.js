// Runs inside a Worker Thread (CPU-bound work off the main event loop).
import { parentPort, workerData } from 'node:worker_threads';

const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));
parentPort.postMessage({ result: fib(workerData.n), thread: 'worker' });
