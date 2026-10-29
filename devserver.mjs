// Local test server: serves app/ and runs functions/api/report.js like Cloudflare does, with Linear faked.
import http from 'http'; import fs from 'fs'; import path from 'path'; import { handleReport } from './worker/report.js';
const ROOT = process.argv[2], PORT = +process.argv[3], LOG = process.argv[4];
const issues = []; let n = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt) => {
  if (String(url).includes('api.linear.app')) {
    const { query, variables } = JSON.parse(opt.body);
    if (query.includes('searchIssues')) { const hit = issues.find(i => i.description.includes(variables.q)); return new Response(JSON.stringify({ data: { searchIssues: { nodes: hit ? [{ identifier: hit.identifier, url: 'x' }] : [] } } })); }
    // like Linear: a team id that isn't a UUID is refused
    if (!/^[0-9a-f-]{36}$/.test(variables.input.teamId)) return new Response(JSON.stringify({ errors: [{ message: 'Argument Validation Error' }] }));
    const i = Object.assign({ identifier: 'DRB-' + (++n) }, variables.input); issues.push(i); fs.mkdirSync(path.dirname(LOG), {recursive:true}); fs.writeFileSync(LOG, JSON.stringify(issues, null, 1));
    return new Response(JSON.stringify({ data: { issueCreate: { success: true, issue: { identifier: i.identifier, url: 'https://linear.app/x/' + i.identifier } } } }));
  }
  return realFetch(url, opt);
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };
http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/report')) {
    let body = ''; for await (const c of req) body += c;
    // settings like the Cloudflare dashboard's; a test can change them by writing <dir of LOG>/env.json
    let env = { LINEAR_API_KEY: 'k', LINEAR_TEAM_ID: '081e99c0-3483-4b35-a7bd-200b350e92ec' };
    try { env = JSON.parse(fs.readFileSync(path.join(path.dirname(LOG), 'env.json'), 'utf8')); } catch (e) {}
    const r = await handleReport(new Request('http://x/api/report', { method: 'POST', body }), env);
    res.writeHead(r.status, { 'Content-Type': 'application/json' }); res.end(await r.text()); return;
  }
  let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
