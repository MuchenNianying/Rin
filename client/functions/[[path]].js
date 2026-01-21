export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  if (url.pathname === '/sitemap.xml') {
    // Redirect to server's sitemap endpoint
    const sitemapUrl = `https://server.mcny.dpdns.org/seo/sitemap.xml`;
    return Response.redirect(sitemapUrl, 301);
  }
  
  return context.next();
}
