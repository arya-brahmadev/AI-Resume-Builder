import type { VercelRequest, VercelResponse } from '@vercel/node';

const upstream = (process.env.APPDEPLOY_API_ORIGIN || 'https://resumate-eu6i0y.v2.appdeploy.ai').replace(/\/$/, '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = Array.isArray(req.query.path) ? req.query.path.join('/') : (typeof req.query.path === 'string' ? req.query.path : '');
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path' || value == null) continue;
    if (Array.isArray(value)) value.forEach(v => query.append(key, v));
    else query.set(key, value);
  }

  const url = `${upstream}/api/${path}${query.toString() ? `?${query.toString()}` : ''}`;
  const headers: Record<string, string> = {};
  for (const name of ['content-type', 'accept', 'authorization']) {
    const value = req.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }

  try {
    const response = await fetch(url, {
      method: req.method || 'GET',
      headers,
      body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : JSON.stringify(req.body ?? {}),
    });

    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);
    res.status(response.status).send(await response.text());
  } catch (error) {
    console.error('Backend proxy error', error);
    res.status(502).json({ error: 'Backend service unavailable' });
  }
}
