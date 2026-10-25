const origin = {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Define the Bash logo as the favicon/asset source
    const bashFavicon = "https://aklein.pro/assets/Bash_Logo_Colored.png";

    // 2. Serve the HTML wrapper to enable custom Favicon + Title + Mobile Icons
    if (url.pathname === '/') {
      return new Response(
        `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AK | Senior Infrastructure Engineer</title>

            <meta property="og:type" content="website">
            <meta property="og:url" content="https://cv.aklein.pro/">
            <meta property="og:title" content="AK | Senior Infrastructure Engineer">
            <meta property="og:description" content="Senior Systems & Infrastructure Engineer. Specializing in IT Operations, SRE, IAM, and automated security infrastructure.">
            <meta property="og:image" content="${bashFavicon}">

            <meta name="twitter:card" content="summary">
            <meta name="twitter:title" content="AK | Senior Infrastructure Engineer">
            <meta name="twitter:description" content="Senior Systems & Infrastructure Engineer. Specializing in IT Operations, SRE, IAM, and automated security infrastructure.">
            <meta name="twitter:image" content="${bashFavicon}">

            <link rel="icon" type="image/png" href="${bashFavicon}">
            <link rel="apple-touch-icon" href="${bashFavicon}">
            <link rel="icon" sizes="192x192" href="${bashFavicon}">

            <style>
              body, html {
                margin: 0;
                padding: 0;
                height: 100%;
                width: 100%;
                overflow: hidden;
                background-color: #323639;
              }
              iframe {
                width: 100%;
                height: 100%;
                border: none;
              }
            </style>
          </head>
          <body>
            <iframe src="/view-pdf" title="AK | Senior Infrastructure Engineer"></iframe>
          </body>
        </html>`,
        {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Link': `<${bashFavicon}>; rel=preload; as=image`
          }
        }
      );
    }

    // 3. The Backend: Deliver the raw PDF to the iframe above
    if (url.pathname === '/view-pdf') {
      // New deployments use the generic key below. The fallback keeps the
      // existing production bucket working without renaming its current PDF.
      const object = await env.MY_BUCKET.get('resume.pdf') ??
        await env.MY_BUCKET.get('Anthony_Klein_Senior_Infrastructure_Engineer.pdf');

      if (object === null) {
        return new Response('Resume Not Found', { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);

      headers.set('Content-Type', 'application/pdf');
      headers.set('Content-Disposition', 'inline');

      return new Response(object.body, { headers });
    }

    return new Response('Not Found', { status: 404 });
  }
};


const publicCacheControl = 'public, max-age=300, s-maxage=900';
const cacheBypassHeaders = [
  'Authorization', 'Cookie', 'Range', 'If-Range', 'If-Match', 'If-None-Match',
  'If-Modified-Since', 'If-Unmodified-Since', 'Cache-Control', 'Pragma'
];

function isPublicResponse(response) {
  if (response.status !== 200 || response.headers.has('Set-Cookie') || response.headers.has('Vary')) {
    return false;
  }
  const directives = (response.headers.get('Cache-Control') || '').split(',')
    .map(value => value.split('=')[0].trim().toLowerCase());
  return !directives.some(value => ['private', 'no-store', 'no-cache'].includes(value));
}

function withPublicCacheControl(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', publicCacheControl);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Cache only the two public CV responses. Private or unusual requests bypass it.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const eligible = request.method === 'GET' &&
      ['/', '/view-pdf'].includes(url.pathname) && !url.search &&
      !cacheBypassHeaders.some(name => request.headers.has(name));
    if (!eligible) return origin.fetch(request, env);
    const key = new Request(url.origin + url.pathname);
    let cache;
    let hit;
    try {
      cache = caches.default;
      hit = await cache.match(key);
    } catch { /* Cache failure must not stop delivery. */ }
    if (hit && isPublicResponse(hit)) return withPublicCacheControl(hit);
    const response = await origin.fetch(request, env);
    if (!isPublicResponse(response)) return response;
    const result = withPublicCacheControl(response);
    if (cache) {
      try {
        ctx.waitUntil(cache.put(key, result.clone()).catch(() => {}));
      } catch { /* Synchronous cache errors must not stop delivery either. */ }
    }
    return result;
  }
};
