# CV delivery with Cloudflare Workers and R2

This is the small Cloudflare Worker behind [cv.aklein.pro](https://cv.aklein.pro).

The idea is intentionally simple: keep the PDF in Cloudflare R2, use a Worker to fetch it, and let the browser render it inline. The Worker also provides a lightweight HTML wrapper with the page title, social preview metadata, favicon, and a full-screen PDF iframe.

## How it is set up

The production service is a Cloudflare Worker named `cv-infra` with the custom domain `cv.aklein.pro` attached to it. It has one R2 bucket binding:

| Worker binding | R2 bucket |
| --- | --- |
| `MY_BUCKET` | `aklein-assets` |

The PDF is stored in that bucket as:

```text
Anthony_Klein_Senior_Infrastructure_Engineer.pdf
```

R2 public access is disabled. The Worker reads the object through its binding, so the PDF does not need to be exposed as a public R2 bucket. Requests to `/` receive the HTML wrapper; requests to `/view-pdf` receive the PDF with `Content-Type: application/pdf` and `Content-Disposition: inline`.

## Quick deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/variablenix/cv-infra)

The **Deploy to Cloudflare** button is the quickest way to create your own copy. Cloudflare uses `wrangler.jsonc` to create an R2 bucket named `cv-assets`, bind it to the Worker as `MY_BUCKET`, and deploy the Worker to your account.

The deployment cannot upload a private CV on your behalf, so there is one final manual step:

1. Click **Deploy to Cloudflare** above and complete the Cloudflare setup flow.
2. Open **R2 Object Storage** in the Cloudflare dashboard.
3. Open the newly created `cv-assets` bucket.
4. Upload your PDF using this standard object name:

   ```text
   resume.pdf
   ```

5. Return to **Workers & Pages**, open the new Worker, and optionally attach your own custom domain.
6. Test the Worker URL and its `/view-pdf` path.

The bucket starts with public access disabled. The Worker reads the PDF through the private R2 binding, so the PDF does not need a public bucket URL.

New deployments use `resume.pdf` by default. The current production Worker also recognizes the existing production object name so the live CV continues working without a storage migration.

## Manual setup

If you prefer to configure everything yourself:

1. Create an R2 bucket and upload your PDF as `resume.pdf`.
2. Create a Worker and use `worker.js` as its entry point.
3. Add an R2 bucket binding named `MY_BUCKET` that points to your bucket. The included `wrangler.jsonc` shows the equivalent configuration.
4. Replace the domain, title, description, favicon URL, and PDF object key in `worker.js`.
5. Deploy the Worker and attach a custom domain or route to it.
6. Open both `/` and `/view-pdf` to confirm that the wrapper and the PDF work independently.

The important part of the Worker is the binding lookup:

```js
const object = await env.MY_BUCKET.get('your-resume.pdf');
```

The object is streamed back from R2, which keeps the Worker small and avoids copying the PDF into the repository.

## Files

- `worker.js` — current production Worker.
- `worker_legacy-direct-pdf.js` — the earlier direct-PDF-only Worker, kept as a historical reference.

The older `worker_v2.js` and `worker_v3-preview-tags.js` versions were removed once their useful behavior was consolidated into the current Worker.

## Updating the CV

Upload the replacement PDF to the same R2 object key. Since the Worker looks up the object on each request, the code does not need to change when the CV itself changes.
