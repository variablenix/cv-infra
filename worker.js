export default {
  async fetch(request, env) {
    // Fetches the specific PDF from your R2 bucket binding
    const object = await env.MY_BUCKET.get('Anthony_Klein_Resume.pdf');

    if (object === null) {
      return new Response('Resume Not Found in Bucket', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    
    // SRE Logic: Force the browser to render the PDF natively
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', 'inline');
    headers.set('Cache-Control', 'public, max-age=3600');

    return new Response(object.body, { headers });
  },
};

