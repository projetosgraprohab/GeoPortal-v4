/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resolves a public static asset path so that it works reliably across all environments:
 * - Local Vite dev server (http://localhost:3000/)
 * - Cloud Run preview / production root domains (https://ais-dev-...run.app/)
 * - GitHub Pages subpaths (https://<username>.github.io/<repo-name>/)
 * - Custom domains or reverse proxies
 */
export function getAssetUrl(path: string): string {
  if (!path) return '';

  // Return full HTTP/HTTPS, data, or blob URLs as-is
  if (/^(?:https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }

  // Strip leading slashes, dot-slashes, or backslashes: e.g. "/data/foo.json" -> "data/foo.json"
  const cleanPath = path.replace(/^(\.?[\\/])+/, '');

  // 1. Check Vite's configured BASE_URL (injected at build time or dev time)
  const viteBase = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL
    : './';

  // If Vite's base is an absolute subpath (e.g. "/meu-geoportal/" or full URL):
  if (viteBase.startsWith('/') && viteBase !== '/') {
    const normalized = viteBase.endsWith('/') ? viteBase : `${viteBase}/`;
    return `${normalized}${cleanPath}`;
  }

  // 2. In browser environments where Vite base is relative ("./" or "/"):
  // Compute the repository or directory base path from window.location
  if (typeof window !== 'undefined' && window.location) {
    let basePath = window.location.pathname || '/';

    // If pathname ends with a file (e.g. /index.html or /404.html), strip the filename
    if (/\/[^/]+\.[a-zA-Z0-9]+$/i.test(basePath)) {
      basePath = basePath.substring(0, basePath.lastIndexOf('/') + 1);
    } else if (!basePath.endsWith('/')) {
      basePath += '/';
    }

    return `${window.location.origin}${basePath}${cleanPath}`;
  }

  return `./${cleanPath}`;
}

/**
 * Robust fetch for public assets with multi-tier fallback support.
 * Ensures assets load even if hosted under unusual subpaths or proxy configurations.
 */
export async function fetchPublicAsset(path: string, options?: RequestInit): Promise<Response> {
  const cleanPath = path.replace(/^(\.?[\\/])+/, '');
  const primaryUrl = getAssetUrl(cleanPath);

  try {
    const res = await fetch(primaryUrl, options);
    if (res.ok) {
      return res;
    }
  } catch (err) {
    console.warn(`[AssetFetcher] Falha na URL primária (${primaryUrl}):`, err);
  }

  // Fallback 1: Direct relative path ./cleanPath
  try {
    const relUrl = `./${cleanPath}`;
    const resRel = await fetch(relUrl, options);
    if (resRel.ok) {
      return resRel;
    }
  } catch {}

  // Fallback 2: Direct root path /cleanPath
  try {
    const rootUrl = `/${cleanPath}`;
    const resRoot = await fetch(rootUrl, options);
    if (resRoot.ok) {
      return resRoot;
    }
  } catch {}

  // If all attempts failed, throw a descriptive error
  throw new Error(`Não foi possível carregar o arquivo estático "${cleanPath}". Verifique se o arquivo está na pasta public/${cleanPath}.`);
}

/**
 * Fetches and parses a public GeoJSON or JSON file safely,
 * preventing HTML 404 responses from throwing cryptic JSON.parse errors.
 */
export async function fetchPublicJson<T = any>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchPublicAsset(path, {
    ...options,
    headers: {
      'Accept': 'application/json, application/vnd.geo+json',
      ...(options?.headers || {})
    }
  });

  const text = await response.text();
  const trimmed = text.trim();

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    throw new Error(`O arquivo retornado para "${path}" não é um JSON/GeoJSON válido (pode ser página 404 HTML).`);
  }

  return JSON.parse(text) as T;
}
