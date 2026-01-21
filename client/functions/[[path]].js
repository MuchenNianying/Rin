export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  if (url.pathname === '/sitemap.xml' || url.pathname === '/seo/sitemap.xml') {
    // Dynamically construct server domain from client domain
    const clientDomain = url.hostname;
    const serverDomain = clientDomain.replace(/^/, 'server.');
    const sitemapUrl = `https://${serverDomain}/sitemap.xml`;
    return Response.redirect(sitemapUrl, 301);
  }
  
  return context.next();
}
