import { Router } from 'express';
import express from 'express';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, mkdir, readdir, readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { createGzip } from 'node:zlib';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, intParam } from '../lib/common.js';

export const router = Router();
const DOC = '05-file-handling-and-streams/large-files-and-streams.md';
const DIR = path.resolve(import.meta.dirname, '../../tmp');
const MAX_UPLOAD = 200 * 1024 * 1024;
export const docs = [
  ['POST', '/files/upload (Content-Type: application/octet-stream)', 'Streams the body to disk with pipeline + size limit (constant memory).', DOC + ' Q1'],
  ['GET', '/files', 'Lists uploaded files.', DOC + ' Q1'],
  ['GET', '/files/download/:name?gzip=1', 'Streams a file to the client (optionally gzip) with path-traversal protection.', DOC + ' Q2'],
  ['GET', '/files/generate?mb=100', 'Streams 100 MB of generated data without buffering it.', DOC + ' Q2'],
  ['GET', '/files/memory-demo?mode=stream|buffer&mb=50', 'Measures peak heap while processing a generated file both ways.', DOC + ' Q2'],
];

router.post('/upload', async (req, res) => {
  if (!req.is('application/octet-stream')) throw new AppError(415, 'BAD_TYPE', 'Use Content-Type: application/octet-stream');
  const declared = Number(req.get('content-length') ?? 0);
  if (declared > MAX_UPLOAD) throw new AppError(413, 'TOO_LARGE', `Max ${MAX_UPLOAD} bytes`);

  await mkdir(DIR, { recursive: true });
  const name = `${randomUUID()}.bin`; // never trust the client filename
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length;
      bytes > MAX_UPLOAD ? cb(new AppError(413, 'TOO_LARGE', `Max ${MAX_UPLOAD} bytes`)) : cb(null, chunk);
    },
  });
  try {
    await pipeline(req, limiter, createWriteStream(path.join(DIR, name)));
  } catch (err) {
    await import('node:fs/promises').then((fs) => fs.rm(path.join(DIR, name), { force: true })); // clean partial file
    throw err;
  }
  res.status(201).json({ name, bytes, rssMB: Math.round(process.memoryUsage().rss / 1048576) });
});

router.get('/', async (_req, res) => {
  const names = (await readdir(DIR)).filter((n) => n !== '.gitkeep');
  res.json(await Promise.all(names.map(async (n) => ({ name: n, bytes: (await stat(path.join(DIR, n))).size }))));
});

router.get('/download/:name', async (req, res) => {
  const file = path.resolve(DIR, req.params.name);
  if (!file.startsWith(DIR + path.sep)) throw new AppError(400, 'BAD_PATH', 'Invalid file name'); // ../ protection
  const s = await stat(file).catch(() => null);
  if (!s?.isFile()) throw new AppError(404, 'NOT_FOUND', 'No such file');
  res.type('application/octet-stream');
  if (req.query.gzip) {
    res.set('Content-Encoding', 'gzip');
    await pipeline(createReadStream(file), createGzip(), res);
  } else {
    res.set('Content-Length', s.size);
    await pipeline(createReadStream(file), res);
  }
});

const generator = (mb) => Readable.from((async function* () {
  const chunk = Buffer.alloc(1024 * 1024, 'x');
  for (let i = 0; i < mb; i++) yield chunk; // Readable.from respects backpressure
})());

router.get('/generate', async (req, res) => {
  const mb = intParam(req.query.mb, 100, { min: 1, max: 2000 });
  res.type('application/octet-stream').set('X-Generated-MB', String(mb));
  await pipeline(generator(mb), res);
});

router.get('/memory-demo', async (req, res) => {
  const mb = intParam(req.query.mb, 50, { min: 1, max: 500 });
  const mode = req.query.mode === 'buffer' ? 'buffer' : 'stream';
  global.gc?.();
  const before = process.memoryUsage().rss;
  let peak = before;
  const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 5);
  let total = 0;
  if (mode === 'buffer') {
    const chunks = [];
    for await (const c of generator(mb)) chunks.push(Buffer.from(c)); // copies: whole file in RAM
    total = Buffer.concat(chunks).length;
  } else {
    for await (const c of generator(mb)) total += c.length; // chunk then forget
  }
  clearInterval(timer);
  peak = Math.max(peak, process.memoryUsage().rss);
  res.json({ mode, processedMB: total / 1048576, extraPeakRssMB: Math.round((peak - before) / 1048576),
    note: 'Buffer mode memory grows with file size; stream mode stays ~flat.' });
});
