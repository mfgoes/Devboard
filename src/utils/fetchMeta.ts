/** Fetch OpenGraph metadata via a public CORS proxy */
export async function fetchMeta(url: string): Promise<{ title?: string; description?: string; image?: string; siteName?: string }> {
  try {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(6000) });
    const html = await res.text();

    const get = (property: string): string | undefined => {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
      const m2 = html.match(re);
      if (m2) return m2[1];
      const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i');
      const m3 = html.match(re2);
      return m3?.[1];
    };

    const title = get('og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const description = get('og:description') || get('description');
    const image = get('og:image');
    const siteName = get('og:site_name');

    return { title: title?.trim(), description: description?.trim(), image, siteName };
  } catch {
    return {};
  }
}
