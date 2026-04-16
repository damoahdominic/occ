/**
 * Proxy URL Utilities
 *
 * Helper functions for constructing and manipulating gateway proxy URLs.
 * These utilities handle path addition/removal and URL normalization
 * for various proxy configurations.
 */

/**
 * Add path to base proxy URL
 *
 * Combines a base proxy URL with a dashboard path, handling:
 * - Trailing slashes on base URL
 * - Leading slashes on path
 * - Query parameters and fragments
 *
 * @param baseUrl - Base proxy URL (e.g., "http://localhost:18790/" or "https://gateway.example.com/openclaw")
 * @param path - Path to add (e.g., "/dashboard" or "/config")
 * @param search - Query string (e.g., "?tab=network")
 * @param hash - Fragment/hash (e.g., "token=abc123")
 * @returns Merged URL or empty string if baseUrl is invalid
 *
 * @example
 * addPathToUrl("http://localhost:18790/", "/dashboard") => "http://localhost:18790/dashboard"
 * addPathToUrl("https://api.example.com/openclaw/", "/dashboard") => "https://api.example.com/openclaw/dashboard"
 */
export function addPathToUrl(baseUrl: string, path: string, search = '', hash = ''): string {
  try {
    const url = new URL(baseUrl);
    // Remove trailing slash from base path
    const basePath = url.pathname.replace(/\/$/, '');
    // Ensure path starts with /
    const addPath = path.startsWith('/') ? path : `/${path}`;
    // Combine paths
    url.pathname = basePath + addPath;
    if (search) url.search = search;
    if (hash) url.hash = hash;
    return url.toString();
  } catch {
    return '';
  }
}

/**
 * Remove trailing slash from URL path
 *
 * Normalizes URLs by removing trailing slashes while preserving:
 * - Root path (returns "/" not empty string)
 * - Query parameters
 * - Fragments
 *
 * @param urlStr - URL to normalize
 * @returns URL without trailing slash, or original URL if invalid
 *
 * @example
 * removeTrailingSlash("http://localhost:18790/dashboard/") => "http://localhost:18790/dashboard"
 * removeTrailingSlash("http://localhost:18790/") => "http://localhost:18790"
 */
export function removeTrailingSlash(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    url.pathname = url.pathname.replace(/\/$/, '') || '/';
    return url.toString();
  } catch {
    return urlStr;
  }
}

/**
 * Normalize URL path by removing duplicate slashes
 *
 * Fixes malformed URLs with duplicate slashes in the path component.
 *
 * @param urlStr - URL to normalize
 * @returns URL with normalized path, or original URL if invalid
 *
 * @example
 * normalizePath("http://localhost:18790//api//v1") => "http://localhost:18790/api/v1"
 */
export function normalizePath(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    // Remove duplicate slashes in path
    url.pathname = url.pathname.replace(/\/+/g, '/');
    return url.toString();
  } catch {
    return urlStr;
  }
}

/**
 * Parse and merge dashboard URL with proxy URL
 *
 * Takes a dashboard URL (from "docker exec openclaw dashboard") and
 * merges it with a configured proxy URL, preserving:
 * - Authentication tokens
 * - Path components
 * - Query parameters
 *
 * @param dashboardUrl - URL returned from gateway dashboard command
 * @param proxyUrl - Configured proxy URL (if any)
 * @returns Merged URL for browser navigation
 *
 * @example
 * // With proxyUrl configured
 * mergeDashboardWithProxy(
 *   "http://127.0.0.1:18789/#token=abc123",
 *   "https://gateway.example.com/"
 * ) => "https://gateway.example.com/#token=abc123"
 *
 * // Without proxyUrl (port rewriting)
 * mergeDashboardWithProxy(
 *   "http://127.0.0.1:18789/#token=abc123",
 *   undefined,
 *   { containerPort: 18789, hostPort: 18790 }
 * ) => "http://127.0.0.1:18790/#token=abc123"
 */
export function mergeDashboardWithProxy(
  dashboardUrl: string,
  proxyUrl?: string,
  portMapping?: { containerPort: number; hostPort: number }
): string {
  if (!dashboardUrl) return '';

  // If proxy URL is configured, use it
  if (proxyUrl && proxyUrl.length > 0) {
    try {
      const dashUri = new URL(dashboardUrl);
      // Merge path, search, hash from dashboard URL into proxy URL
      const mergedUrl = new URL(
        `${dashUri.pathname}${dashUri.search}${dashUri.hash}`,
        proxyUrl
      );
      return mergedUrl.toString();
    } catch {
      // Invalid proxyUrl — fall through to port rewriting
    }
  }

  // Fallback: rewrite container port to host port
  if (portMapping) {
    const { containerPort, hostPort } = portMapping;
    return dashboardUrl
      .replace(new RegExp(`localhost:${containerPort}`, 'g'), `localhost:${hostPort}`)
      .replace(new RegExp(`127\\.0\\.0\\.1:${containerPort}`, 'g'), `127.0.0.1:${hostPort}`);
  }

  return dashboardUrl;
}
