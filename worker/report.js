// POST /api/report  - "Report a problem" from the billing app.
// Runs on Cloudflare next to the app (worker/index.js routes /api/report here). It holds the Linear key,
// so the key never ships inside the app. Settings on the "billing" Worker:
//   LINEAR_API_KEY   a Linear personal API key - a Secret, set in the dashboard (Settings > Variables and Secrets)
//   LINEAR_TEAM_ID   the Linear team the issues go to - set in wrangler.jsonc
// Optional: LINEAR_PROJECT_ID to file them under one project.

const MAX_TEXT = 4000;
// the billing-tool team (BIL). Used when the dashboard setting is missing or not a valid team ID.
const DEFAULT_TEAM_ID = '081e99c0-3483-4b35-a7bd-200b350e92ec';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// settings pasted into the dashboard can carry spaces, quotes or line breaks: tidy them
const tidy = (v) => String(v || '').trim().replace(/^["']+|["']+$/g, '').trim();

export async function handleReport(request, env) {
  const key = tidy(env.LINEAR_API_KEY);
  const team = UUID.test(tidy(env.LINEAR_TEAM_ID)) ? tidy(env.LINEAR_TEAM_ID) : DEFAULT_TEAM_ID;
  if (!key) return json({ ok: false, error: 'not_configured', missing: ['LINEAR_API_KEY'] }, 503);
  env = Object.assign({}, env, { LINEAR_API_KEY: key, LINEAR_TEAM_ID: team });
  let r;
  try { r = await request.json(); } catch (e) { return json({ ok: false, error: 'bad_json' }, 400); }
  const text = clean(r.text, MAX_TEXT);
  if (!text) return json({ ok: false, error: 'empty' }, 400);
  const kind = r.kind === 'idea' ? 'idea' : 'problem';
  const who = clean(r.name, 80) || 'Office';
  const id = clean(r.id, 40);   // the app's own report id: a report sent twice makes one issue

  const title = (kind === 'idea' ? 'Idea: ' : 'Problem: ') + firstLine(text, 80);
  const ctx = r.context || {};
  const lines = [
    text, '', '---',
    '**From:** ' + who + ' · ' + (kind === 'idea' ? 'Feature request' : 'Problem report'),
    '**When:** ' + clean(r.when, 40),
    ctx.screen ? '**Screen:** ' + clean(ctx.screen, 80) : '',
    ctx.bill ? '**Bill:** ' + clean(ctx.bill, 200) : '',
    '**App version:** ' + clean(r.version, 40) + ' · ' + (r.queued ? 'sent later (was offline)' : 'sent right away'),
    ctx.browser ? '**Browser:** ' + clean(ctx.browser, 200) : '',
    id ? '`report:' + id + '`' : ''
  ].filter(Boolean);

  // already filed? (the app retries after a lost connection)
  if (id) {
    const found = await linear(env, `query($q:String!){ searchIssues(term:$q, first:10){ nodes{ identifier url description } } }`, { q: 'report:' + id }).catch(() => null);
    // Linear search is fuzzy: only an issue that really carries this exact report id counts as the same report
    const tag = '`report:' + id + '`';
    const hit = found && found.data && found.data.searchIssues && found.data.searchIssues.nodes.find(n => String(n.description || '').includes(tag));
    if (hit) return json({ ok: true, issue: hit.identifier, url: hit.url, duplicate: true });
  }

  const input = { teamId: env.LINEAR_TEAM_ID, title, description: lines.join('\n') };
  if (env.LINEAR_PROJECT_ID) input.projectId = env.LINEAR_PROJECT_ID;
  const res = await linear(env, `mutation($input: IssueCreateInput!){ issueCreate(input:$input){ success issue{ identifier url } } }`, { input })
    .catch(e => ({ errors: [{ message: String(e) }] }));
  const out = res && res.data && res.data.issueCreate;
  if (!out || !out.success) return json({ ok: false, error: 'linear', detail: (res && res.errors && res.errors[0] && res.errors[0].message) || '' }, 502);
  return json({ ok: true, issue: out.issue.identifier, url: out.issue.url });
}

async function linear(env, query, variables) {
  const r = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: env.LINEAR_API_KEY },
    body: JSON.stringify({ query, variables })
  });
  return r.json();
}
function clean(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max); }
function firstLine(t, max) { const l = t.split('\n')[0].trim(); return l.length > max ? l.slice(0, max - 1) + '…' : l; }
function json(o, status = 200) { return new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
