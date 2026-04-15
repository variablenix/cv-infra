export default {
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
            <title>Anthony Klein - Resume</title>
            
            <meta property="og:type" content="website">
            <meta property="og:url" content="https://cv.aklein.pro/">
            <meta property="og:title" content="Anthony Klein - Resume">
            <meta property="og:description" content="Senior Systems & Infrastructure Engineer. Cloud architecture, SRE, IAM, and security automation.">
            <meta property="og:image" content="${bashFavicon}">

            <meta name="twitter:card" content="summary">
            <meta name="twitter:title" content="Anthony Klein - Resume">
            <meta name="twitter:description" content="Senior Systems & Infrastructure Engineer. Cloud architecture, SRE, IAM, and security automation.">
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
            <iframe src="/view-pdf" title="Anthony Klein Resume"></iframe>
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
      const object = await env.MY_BUCKET.get('Anthony_Klein_Resume.pdf');
      
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
