import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import worker from '../worker.js';

const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
const policy = 'public, max-age=300, s-maxage=900';
const pdf = '%PDF-1.7 synthetic resume';

afterEach(() => {
  if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
  else delete globalThis.caches;
});

function fixture({ metadata = {}, missing = false, legacy = false } = {}) {
  const stored = new Map();
  const reads = [];
  const matches = [];
  const writes = [];
  const pending = [];
  const cache = {
    async match(key) {
      matches.push(key.url);
      return stored.get(key.url)?.clone();
    },
    async put(key, response) {
      writes.push(key.url);
      stored.set(key.url, response);
    },
  };
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: cache } });
  const state = { body: pdf };
  const env = {
    MY_BUCKET: {
      async get(key) {
        reads.push(key);
        if (missing || (legacy && key === 'resume.pdf')) return null;
        return {
          body: new Response(state.body).body,
          writeHttpMetadata(headers) {
            for (const [name, value] of Object.entries(metadata)) headers.set(name, value);
          },
        };
      },
    },
  };
  const ctx = { waitUntil(promise) { pending.push(promise); } };
  return {
    cache, stored, reads, matches, writes, state, env, ctx,
    async fetch(path = '/view-pdf', options = {}) {
      const response = await worker.fetch(new Request(new URL(path, 'https://cv.example.test'), options), env, ctx);
      await Promise.all(pending.splice(0));
      return response;
    },
  };
}

test('public PDF hits reuse the stream and preserve PDF metadata without another R2 read', async () => {
  const f = fixture({ metadata: { 'Content-Language': 'en' } });
  for (let i = 0; i < 2; i++) {
    const response = await f.fetch();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'application/pdf');
    assert.equal(response.headers.get('Content-Disposition'), 'inline');
    assert.equal(response.headers.get('Content-Language'), 'en');
    assert.equal(response.headers.get('Cache-Control'), policy);
    assert.equal(await response.text(), pdf);
  }
  assert.deepEqual(f.reads, ['resume.pdf']);
  assert.equal(f.writes.length, 1);
});

test('HTML is cached separately from the PDF and hosts do not share keys', async () => {
  const f = fixture();
  const wrapper = await f.fetch('/');
  assert.match(await wrapper.text(), /<iframe src="\/view-pdf"/);
  assert.match(wrapper.headers.get('Content-Type'), /^text\/html/);
  assert.equal(wrapper.headers.get('Cache-Control'), policy);
  await f.fetch('/');
  await f.fetch('/view-pdf');
  await f.fetch('https://other.example.test/view-pdf');
  assert.equal(f.stored.size, 3);
  assert.equal(f.reads.length, 2);
});

test('the existing production-object fallback continues to work and its response is cached', async () => {
  const f = fixture({ legacy: true });
  assert.equal(await (await f.fetch()).text(), pdf);
  assert.equal(f.reads.length, 2);
  assert.equal(f.reads[0], 'resume.pdf');
  assert.equal(await (await f.fetch()).text(), pdf);
  assert.equal(f.reads.length, 2);
});

for (const [name, value] of [
  ['Authorization', 'Bearer synthetic-token'],
  ['Cookie', 'session=synthetic'],
  ['Range', 'bytes=0-10'],
  ['If-Match', '"synthetic"'],
  ['If-None-Match', '"synthetic"'],
  ['If-Modified-Since', 'Wed, 01 Jan 2025 00:00:00 GMT'],
  ['If-Unmodified-Since', 'Wed, 01 Jan 2025 00:00:00 GMT'],
  ['If-Range', '"synthetic"'],
  ['Cache-Control', 'no-cache'],
  ['Cache-Control', 'no-store'],
  ['Pragma', 'no-cache'],
]) {
  test(`${name}: ${value} bypasses both reads and writes of a warm edge cache`, async () => {
    const f = fixture();
    await f.fetch();
    f.state.body = 'replacement PDF bytes';
    const response = await f.fetch('/view-pdf', { headers: { [name]: value } });
    assert.equal(await response.text(), f.state.body);
    assert.equal(f.matches.length, 1);
    assert.equal(f.writes.length, 1);
    assert.equal(f.reads.length, 2);
  });
}

test('query-string requests bypass a warm cache', async () => {
  const f = fixture();
  await f.fetch();
  f.state.body = 'replacement';
  assert.equal(await (await f.fetch('/view-pdf?download=1')).text(), 'replacement');
  assert.equal(f.matches.length, 1);
  assert.equal(f.writes.length, 1);
});

for (const method of ['HEAD', 'POST', 'PUT', 'DELETE']) {
  test(`${method} bypasses the cache`, async () => {
    const f = fixture();
    await f.fetch('/view-pdf', { method });
    assert.equal(f.matches.length, 0);
    assert.equal(f.writes.length, 0);
  });
}

test('unknown routes and missing PDFs are not cached', async () => {
  const f = fixture({ missing: true });
  for (const path of ['/missing', '/view-pdf', '/view-pdf']) {
    assert.equal((await f.fetch(path)).status, 404);
  }
  assert.equal(f.writes.length, 0);
});

for (const control of ['private', 'no-store', 'no-cache', 'Public, PRIVATE="Content-Type"']) {
  test(`R2 Cache-Control ${control} is preserved and not stored`, async () => {
    const f = fixture({ metadata: { 'Cache-Control': control } });
    for (let i = 0; i < 2; i++) {
      const response = await f.fetch();
      assert.equal(response.headers.get('Cache-Control'), control);
      assert.equal(await response.text(), pdf);
    }
    assert.equal(f.writes.length, 0);
    assert.equal(f.reads.length, 2);
  });
}

for (const [name, value] of [['Set-Cookie', 'session=synthetic'], ['Vary', '*'], ['Vary', 'Accept-Language']]) {
  test(`responses with ${name}: ${value} are not stored under a shared key`, async () => {
    const f = fixture({ metadata: { [name]: value } });
    const response = await f.fetch();
    assert.equal(response.headers.get(name), value);
    assert.equal(f.writes.length, 0);
  });
}

test('an unexpected cached error is ignored rather than made public and returned', async () => {
  const f = fixture();
  f.stored.set('https://cv.example.test/view-pdf', new Response('old error', { status: 404 }));
  const response = await f.fetch();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), pdf);
  assert.equal(f.reads.length, 1);
});

test('cache-read failure still delivers the PDF', async () => {
  const f = fixture();
  f.cache.match = async () => { throw new Error('synthetic cache failure'); };
  assert.equal(await (await f.fetch()).text(), pdf);
});

test('asynchronous cache-write rejection still delivers the PDF', async () => {
  const f = fixture();
  f.cache.put = async () => { throw new Error('synthetic cache failure'); };
  assert.equal(await (await f.fetch()).text(), pdf);
});

test('synchronous cache-write failure still delivers the PDF', async () => {
  const f = fixture();
  f.cache.put = () => { throw new Error('synthetic cache failure'); };
  assert.equal(await (await f.fetch()).text(), pdf);
});

test('unavailable cache storage still delivers the PDF', async () => {
  const f = fixture();
  Object.defineProperty(globalThis, 'caches', { configurable: true, get() { throw new Error('synthetic cache failure'); } });
  assert.equal(await (await f.fetch()).text(), pdf);
});

test('R2 failures propagate without storing a response', async () => {
  const f = fixture();
  f.env.MY_BUCKET.get = async () => { throw new Error('synthetic R2 failure'); };
  await assert.rejects(f.fetch(), /synthetic R2 failure/);
  assert.equal(f.writes.length, 0);
});
