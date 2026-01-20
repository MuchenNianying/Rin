export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  if (url.pathname === '/sitemap.xml') {
    const sitemapUrl = `${url.origin}/seo/sitemap.xml`;
    return Response.redirect(sitemapUrl, 301);
  }
  
  return context.next();
}
