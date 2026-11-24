import { Router } from 'express';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { AppError, sleep } from '../lib/common.js';

export const router = Router();
const DOC = '09-background-jobs/background-jobs.md';
export const docs = [
  ['POST', '/jobs/email  {"to":"a@b.com","failTimes":2}', 'Enqueues a job, returns 202 + jobId immediately. failTimes simulates a flaky provider.', DOC + ' Q1'],
  ['GET', '/jobs/:id', 'Job status: queued | active | retrying | completed | failed (with attempt log).', DOC + ' Q1'],
  ['GET', '/jobs', 'Queue stats (waiting/active/completed/failed).', DOC + ' Q1'],
];

const jobs = new Map();
const waiting = [];
const dedupe = new Map(); // idempotency key -> jobId
const CONCURRENCY = 2, MAX_ATTEMPTS = 4, BASE_DELAY = 300;
let active = 0;

function enqueue(job) { waiting.push(job.id); pump(); }

function pump() {
  while (active < CONCURRENCY && waiting.length) {
    const job = jobs.get(waiting.shift());
    active++;
    run(job).finally(() => { active--; pump(); });
  }
}

async function run(job) {
  job.status = 'active';
  job.attempts++;
  try {
    await sleep(300); // pretend to call email provider
    if (job.attempts <= job.data.failTimes) throw new Error(`provider 503 (attempt ${job.attempts})`);
    job.status = 'completed';
    job.log.push(`attempt ${job.attempts}: sent`);
  } catch (err) {
    job.log.push(`attempt ${job.attempts}: ${err.message}`);
    if (job.attempts >= MAX_ATTEMPTS) { job.status = 'failed'; return; }
    job.status = 'retrying';
    const delay = BASE_DELAY * 2 ** (job.attempts - 1);                 // exponential backoff
    setTimeout(() => enqueue(job), delay * (0.5 + Math.random()));     // + jitter
  }
}

router.post('/email', express.json({ limit: '10kb' }), (req, res) => {
  const { to, failTimes = 0, idempotencyKey } = req.body ?? {};
  if (typeof to !== 'string' || !to.includes('@')) throw new AppError(422, 'VALIDATION', 'to must be an email');
  if (idempotencyKey && dedupe.has(idempotencyKey)) {            // same key -> same job, no duplicate email
    return res.status(200).json({ jobId: dedupe.get(idempotencyKey), duplicate: true });
  }
  const job = { id: randomUUID(), status: 'queued', attempts: 0, data: { to, failTimes: Number(failTimes) }, log: [], createdAt: Date.now() };
  jobs.set(job.id, job);
  if (idempotencyKey) dedupe.set(idempotencyKey, job.id);
  enqueue(job);
  res.status(202).location(`/jobs/${job.id}`).json({ jobId: job.id, statusUrl: `/jobs/${job.id}` });
});

router.get('/', (_req, res) => {
  const counts = { queued: 0, active: 0, retrying: 0, completed: 0, failed: 0 };
  for (const j of jobs.values()) counts[j.status]++;
  res.json({ concurrency: CONCURRENCY, maxAttempts: MAX_ATTEMPTS, counts });
});

router.get('/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) throw new AppError(404, 'NOT_FOUND', 'Job not found');
  res.json(job);
});
