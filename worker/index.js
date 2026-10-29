// The "billing" Worker: serves the app from app/ and handles the Report a problem endpoint.
// Only /api/* reaches this code (see run_worker_first in wrangler.jsonc); every other request is a
// static file served straight from app/, exactly as before.
import { handleReport } from './report.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/report') {
      if (request.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'use POST' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
      return handleReport(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};
