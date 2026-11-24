# File Handling and Streams

## Q1. How would you handle uploading and processing large files?

### 1. Interview Question
"Users need to upload 2 GB videos / 500 MB CSVs. How do you design this in Node/Express?"

### 2. Simple Explanation
Never load the file into memory. **Stream** it: read a chunk, process it, write it, repeat. Memory stays flat (~64 KB chunks) regardless of file size. Even better, don't send the bytes through your server at all.

### 3. Real-World Scenario
`multer.memoryStorage()` on a 1 GB upload × 20 concurrent users = 20 GB RAM → OOM crash. Rewriting to stream to S3 made memory constant.

### 4. How to Implement
Option A — **Direct-to-storage (preferred for huge files)**
1. Client asks API for a **pre-signed URL** (S3 multipart upload).
2. Client uploads straight to S3 (resumable, parallel parts).
3. S3 event / client callback notifies API; push a job to a queue.
4. Worker processes the file asynchronously; status endpoint or webhook reports progress.

Option B — **Stream through your server**
1. Use `busboy` (or multer with disk storage) and enforce `limits` (size, file count, mime).
2. `pipeline()` the incoming stream → (optional transform) → destination.
3. Handle `aborted` requests and errors; clean up temp files.
4. Return `202 Accepted` + job id for slow processing.

Always: validate type by content (magic bytes), set size limits, scan for malware, store with random names, never trust the client filename.

### 5. Code Example
Stream a CSV upload, parse row by row, never buffering the file:
```js
import busboy from 'busboy';
import { pipeline } from 'node:stream/promises';
import { parse } from 'csv-parse';
import { Writable } from 'node:stream';

app.post('/import', (req, res, next) => {
  const bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: 500 * 1024 * 1024 } });
  let rows = 0;

  bb.on('file', (_field, file, info) => {
    if (info.mimeType !== 'text/csv') { file.resume(); return next(new AppError(415, 'BAD_TYPE', 'CSV only')); }
    file.on('limit', () => next(new AppError(413, 'TOO_LARGE', 'File too large')));

    pipeline(
      file,
      parse({ columns: true }),
      new Writable({
        objectMode: true,
        highWaterMark: 100,
        async write(row, _enc, cb) {            // backpressure: cb called when DB insert done
          try { await insertRow(row); rows++; cb(); } catch (e) { cb(e); }
        },
      })
    ).then(() => res.status(201).json({ rows })).catch(next);
  });

  req.pipe(bb);
});
```
Pre-signed URL (AWS SDK v3):
```js
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: `uploads/${randomUUID()}`, ContentType }), { expiresIn: 300 });
res.json({ url });
```

### 6. Trade-offs
| Approach | Pros | Cons |
|---|---|---|
| Pre-signed direct upload | Zero load on your servers, resumable | More moving parts, post-upload validation needed |
| Stream via server | Full control, simple clients | Server bandwidth + connections held open |
| Buffer in memory | Simplest | Crashes on big/concurrent files |

### 7. Common Mistakes
- `memoryStorage`, `fs.readFile`, or `req.body` for big files.
- Using `.pipe()` without error handling (leaks fds); use `pipeline`.
- Ignoring backpressure (`write()` return value).
- Trusting `Content-Type` / file extension.
- Processing synchronously in the request → timeouts. Use `202` + queue.
- Not cleaning up temp files on abort.

### 8. Interview Answer
"For large files I avoid buffering: either the client uploads directly to S3 with a pre-signed multipart URL and I process it asynchronously through a queue, or I stream through the server using busboy and `stream.pipeline`, enforcing size and type limits and respecting backpressure. I return 202 with a job ID and let a worker do the heavy processing."

### 9. Follow-up Questions
- How do you resume a failed upload (tus protocol, S3 multipart)?
- How do you show upload progress?
- How do you virus-scan uploads?
- How would you process a 10 GB file without running out of memory?

---

## Q2. Streams vs Buffers — when do you use which?

### 1. Interview Question
"What is the difference between a Buffer and a Stream, and when does it matter?"

### 2. Simple Explanation
- **Buffer**: the whole data in memory at once (a chunk of raw bytes).
- **Stream**: data arrives in small pieces over time; you process each piece and forget it.
Think: downloading a movie fully before watching (buffer) vs Netflix playing while downloading (stream).

```
Buffer:  [disk] ──► [ 1 GB in RAM ] ──► process ──► respond
Stream:  [disk] ─chunk─► process ─chunk─► respond   (RAM ≈ 64 KB)
```

### 3. Real-World Scenario
Serving a 3 GB log export. `res.send(await fs.readFile(f))` crashes; `createReadStream(f).pipe(res)` works with ~constant memory.

### 4. How to Implement
- Small, need whole thing (JSON < few MB, hashing a token, small images): Buffer is fine.
- Large, unknown size, or incremental (files, DB cursors, HTTP proxying, compression): Stream.
- Compose with `pipeline` so errors propagate and resources close.

### 5. Code Example
```js
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

app.get('/export/:name', async (req, res, next) => {
  try {
    const file = safePath(req.params.name);            // prevent ../ traversal
    const { size } = await stat(file);
    res.set({ 'Content-Type': 'text/csv', 'Content-Encoding': 'gzip' });
    await pipeline(createReadStream(file), createGzip(), res);
  } catch (e) { next(e); }
});

// Range support for video: use res.sendFile (handles Range, ETag) or parse req.headers.range
// and createReadStream(file, { start, end }) with 206 Partial Content.
```
Streaming DB rows to the client:
```js
import QueryStream from 'pg-query-stream';
const q = client.query(new QueryStream('SELECT * FROM events'));
res.type('application/x-ndjson');
await pipeline(q, async function* (rows) { for await (const r of rows) yield JSON.stringify(r) + '\n'; }, res);
```

### 6. Trade-offs
- Streams: constant memory, lower time-to-first-byte; harder error handling, can't random-access or easily retry mid-way.
- Buffers: simple and fast for small data; memory grows with size × concurrency.

### 7. Common Mistakes
- `.pipe()` chains with no error handlers.
- Ignoring backpressure (writing faster than the consumer reads).
- Setting `Content-Length` wrong while compressing.
- Path traversal on user-provided file names.
- Not handling client disconnect (`req.on('close')`).

### 8. Interview Answer
"A Buffer holds the full data in memory; a stream processes it in chunks. For small payloads buffers are simpler. For large or continuous data I use streams with `pipeline`, so memory stays constant and backpressure and errors are handled. Memory cost with buffers scales with file size times concurrent users, which is what usually causes production crashes."

### 9. Follow-up Questions
- What is backpressure and how does `pipeline` handle it?
- Readable vs Writable vs Transform vs Duplex?
- Object mode vs binary mode?
- Why `for await...of` on a stream?
