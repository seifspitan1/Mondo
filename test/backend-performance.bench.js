import http from 'node:http';
import { performance } from 'node:perf_hooks';
import app from '../server.js';
import { defaultProjects, defaultSettings } from '../src/config/defaults.js';
import { signAdminToken, COOKIE_NAME } from '../src/services/auth.service.js';
import { projectSchema } from '../src/schemas/project.schema.js';
import { enquirySchema } from '../src/schemas/enquiry.schema.js';

process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'bench-password-123';
process.env.JWT_SECRET = 'a-super-secret-jwt-key-with-over-32-chars';

async function runBenchmarks() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = signAdminToken('admin');

  console.log('--- STARTING BACKEND PERFORMANCE BENCHMARK ---');

  // Helper for timing fetch
  async function timeRequest(name, url, options, runs = 100) {
    const times = [];
    let lastBody = null;
    let lastStatus = 0;

    // Warm-up
    for (let i = 0; i < 5; i++) {
      await fetch(url, options);
    }

    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      const res = await fetch(url, options);
      const duration = performance.now() - start;
      times.push(duration);
      lastStatus = res.status;
      lastBody = await res.text();
    }

    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = times[0];
    const max = times[times.length - 1];

    console.log(JSON.stringify({
      endpoint: name,
      status: lastStatus,
      payloadBytes: Buffer.byteLength(lastBody),
      runs,
      medianMs: Number(median.toFixed(3)),
      avgMs: Number(avg.toFixed(3)),
      p95Ms: Number(p95.toFixed(3)),
      minMs: Number(min.toFixed(3)),
      maxMs: Number(max.toFixed(3))
    }));
  }

  // 1. /api/v1/load
  await timeRequest('GET /api/v1/load', `${baseUrl}/api/v1/load`, {
    method: 'GET'
  });

  // 2. /api/v1/session (unauthenticated)
  await timeRequest('GET /api/v1/session (unauth)', `${baseUrl}/api/v1/session`, {
    method: 'GET'
  });

  // 3. /api/v1/session (authenticated)
  await timeRequest('GET /api/v1/session (auth)', `${baseUrl}/api/v1/session`, {
    method: 'GET',
    headers: { cookie: `${COOKIE_NAME}=${token}` }
  });

  // 4. POST /api/v1/events
  await timeRequest('POST /api/v1/events', `${baseUrl}/api/v1/events`, {
    method: 'POST',
    headers: { origin: baseUrl, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'project_open', slug: 'cat-battle' })
  });

  // 5. POST /api/v1/save (validation + unconfigured fallback)
  await timeRequest('POST /api/v1/save (project)', `${baseUrl}/api/v1/save`, {
    method: 'POST',
    headers: { origin: baseUrl, cookie: `${COOKIE_NAME}=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'project', data: defaultProjects[0] })
  });

  // 6. POST /api/v1/enquiries (validation + unconfigured fallback)
  await timeRequest('POST /api/v1/enquiries', `${baseUrl}/api/v1/enquiries`, {
    method: 'POST',
    headers: { origin: baseUrl, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      name: 'Bench Lead',
      email: 'bench@example.test',
      discord: '',
      gameUrl: '',
      service: 'Game Thumbnails',
      packageName: 'MONDO LAB',
      goal: 'Benchmark test brief goal description with enough length.',
      budget: '',
      deadline: '',
      consent: true
    })
  });

  // 7. Micro-benchmark for schema validation overhead
  const schemaRuns = 10000;
  const t0 = performance.now();
  for (let i = 0; i < schemaRuns; i++) {
    projectSchema.safeParse(defaultProjects[0]);
  }
  const projectSchemaTime = performance.now() - t0;

  const t1 = performance.now();
  for (let i = 0; i < schemaRuns; i++) {
    enquirySchema.safeParse({
      id: '12345678-1234-1234-1234-123456789abc',
      name: 'Bench Lead',
      email: 'bench@example.test',
      discord: '',
      gameUrl: '',
      service: 'Game Thumbnails',
      packageName: 'MONDO LAB',
      goal: 'Benchmark test brief goal description with enough length.',
      budget: '',
      deadline: '',
      consent: true
    });
  }
  const enquirySchemaTime = performance.now() - t1;

  console.log(JSON.stringify({
    microbenchmark: 'projectSchema.safeParse',
    operations: schemaRuns,
    totalMs: Number(projectSchemaTime.toFixed(3)),
    perOpUs: Number(((projectSchemaTime / schemaRuns) * 1000).toFixed(3))
  }));

  console.log(JSON.stringify({
    microbenchmark: 'enquirySchema.safeParse',
    operations: schemaRuns,
    totalMs: Number(enquirySchemaTime.toFixed(3)),
    perOpUs: Number(((enquirySchemaTime / schemaRuns) * 1000).toFixed(3))
  }));

  server.close();
  console.log('--- BENCHMARK COMPLETED ---');
}

runBenchmarks().catch(console.error);
