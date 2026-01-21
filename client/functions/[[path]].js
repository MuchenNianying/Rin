export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  console.log('Request path:', url.pathname);
  
  if (url.pathname === '/sitemap.xml' || url.pathname === '/seo/sitemap.xml') {
    console.log('Matching sitemap path, redirecting...');
    // Dynamically construct server domain from client domain
    const clientDomain = url.hostname;
    const serverDomain = clientDomain.replace(/^/, 'server.');
    const sitemapUrl = `https://${serverDomain}/sitemap.xml`;
    console.log('Redirecting to:', sitemapUrl);
    return Response.redirect(sitemapUrl, 301);
  }
  
  return context.next();
}
