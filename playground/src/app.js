import express from 'express';
import { randomUUID } from 'node:crypto';
import * as concurrency from './routes/concurrency.js';
import * as errors from './routes/errors.js';
import * as files from './routes/files.js';
import * as performance_ from './routes/performance.js';
import * as data from './routes/data.js';
import * as security from './routes/security/index.js';
import * as jobs from './routes/jobs.js';
import * as reliability from './routes/reliability.js';

// Each module exports `docs`; this is the single source of truth for the endpoint list.
export const modules = [
  ['02 Event loop & concurrency', concurrency],
  ['04 Error handling & health', errors],
  ['05 Files & streams', files],
  ['06 Performance', performance_],
  ['07 Database & caching', data],
  ['08 Security & rate limiting', security],
  ['09 Background jobs', jobs],
  ['10/11 Reliability, metrics, memory leaks', reliability],
];

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// request id + structured access log + metrics
app.use((req, res, next) => {
  req.id = req.get('x-request-id') ?? randomUUID();
  res.set('x-request-id', req.id);
  const start = performance.now();
  res.on('finish', () => {
    const ms = Math.round(performance.now() - start);
    reliability.metrics.total++;
    reliability.metrics.byStatus[res.statusCode] = (reliability.metrics.byStatus[res.statusCode] ?? 0) + 1;
    reliability.metrics.durationMsSum += ms;
    console.log(JSON.stringify({ level: 'info', requestId: req.id, method: req.method, url: req.originalUrl, status: res.statusCode, ms }));
  });
  next();
});

app.get('/', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const endpoints = modules.flatMap(([section, m]) =>
    m.docs.map(([method, path, description, topic]) => ({ section, method, path, description, readMore: topic })));
  if (req.accepts(['json', 'html']) === 'html' && req.query.format !== 'json') {
    const rows = endpoints.map((e) => `<tr><td>${e.section}</td><td><b>${e.method}</b></td><td><code>${e.path}</code></td><td>${e.description}</td></tr>`).join('');
    return res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Node.js Interview Playground</title>
<style>body{font:14px system-ui;margin:2rem}td,th{border-bottom:1px solid #ddd;padding:6px 10px;text-align:left;vertical-align:top}code{background:#f3f3f3;padding:2px 4px}</style>
<h1>Node.js Interview Playground</h1><p>${endpoints.length} endpoints. Base URL: ${base}. JSON: <a href="/?format=json">/?format=json</a></p>
<table><tr><th>Topic</th><th>Method</th><th>Path</th><th>What it demonstrates</th></tr>${rows}</table>`);
  }
  res.json({ baseUrl: base, count: endpoints.length, endpoints });
});

app.use('/concurrency', concurrency.router);
app.use('/', errors.router);
app.use('/files', files.router);
app.use('/perf', performance_.router);
app.use('/', data.router);
app.use('/', security.router);
app.use('/jobs', jobs.router);
app.use('/', reliability.router);

app.use(errors.notFound);
app.use(errors.errorHandler); // LAST
