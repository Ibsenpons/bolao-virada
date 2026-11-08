import { validTeamDomain, verifyAccessToken } from './access.mjs';

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
const fail = (message, status) => json({ error: message }, status);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const positiveInt = (value, max = 100000000) => Number.isSafeInteger(value) && value > 0 && value <= max;
const clean = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
const idOf = value => /^[1-9]\d*$/.test(value || '') ? Number(value) : null;
const safeUrl = value => typeof value === 'string' && value.length <= 1000 &&
  (value === '' || /^https:\/\/[^\s<>"']+$/.test(value));

async function bodyOf(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('JSON_REQUIRED');
  if (Number(request.headers.get('content-length')) > 16384) throw new Error('BODY_TOO_LARGE');
  const body = await request.text();
  if (body.length > 16384) throw new Error('BODY_TOO_LARGE');
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_JSON');
    return parsed;
  } catch { throw new Error('INVALID_JSON'); }
}
function mutationAllowed(request) {
  return request.headers.get('origin') === new URL(request.url).origin &&
    request.headers.get('x-requested-with') === 'bolao-admin';
}
async function all(db, sql) { return (await db.prepare(sql).all()).results; }
async function price(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'share_price_cents'").first();
  return Number(row?.value);
}
async function adminState(db) {
  const [participants, payments, expenses, bets, receipts] = await Promise.all([
    all(db, 'SELECT id, name, shares, created_at FROM participants ORDER BY id'),
    all(db, 'SELECT id, participant_id, amount_cents, confirmed_on, status, note, created_at FROM payments ORDER BY id DESC'),
    all(db, 'SELECT id, description, amount_cents, incurred_on FROM expenses ORDER BY id DESC'),
    all(db, 'SELECT id, numbers_json, amount_cents, placed_on FROM bets ORDER BY id DESC'),
    all(db, 'SELECT id, title, kind, document_url, document_date, reviewed FROM receipts ORDER BY id DESC'),
  ]);
  return { price_cents: await price(db), participants, payments, expenses, bets, receipts };
}
async function publicState(db) {
  const [participants, totals, expenses, bets, receipts] = await Promise.all([
    all(db, `SELECT p.name, p.shares FROM participants p JOIN payments pay ON pay.participant_id = p.id
      WHERE pay.status = 'confirmed' ORDER BY p.name COLLATE NOCASE`),
    db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS amount_cents FROM payments WHERE status = 'confirmed'").first(),
    all(db, 'SELECT description, amount_cents, incurred_on FROM expenses ORDER BY id'),
    all(db, 'SELECT numbers_json FROM bets ORDER BY id'),
    all(db, `SELECT title, document_url, document_date FROM receipts
      WHERE reviewed = 1 AND document_url != '' ORDER BY id`),
  ]);
  return {
    price_cents: await price(db), received_cents: totals.amount_cents,
    participants: participants.map(p => ({ nome: p.name, cotas: p.shares, pago: true })),
    expenses: expenses.map(e => ({ descricao: e.description, valor: e.amount_cents / 100, data: e.incurred_on })),
    bets: bets.map(b => ({ dezenas: JSON.parse(b.numbers_json) })),
    receipts: receipts.map(r => ({ titulo: r.title, url: r.document_url, data: r.document_date })),
  };
}
async function handleApi(request, env, path) {
  if (!env.DB) return fail('Banco D1 não configurado.', 503);
  const db = env.DB;
  if (path === '/api/public' && request.method === 'GET') return json(await publicState(db));
  if (path === '/api/admin/state' && request.method === 'GET') return json(await adminState(db));
  if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) return fail('Método não permitido.', 405);
  if (!mutationAllowed(request)) return fail('Origem inválida.', 403);
  const input = request.method === 'DELETE' ? {} : await bodyOf(request);
  let result;
  if (path === '/api/admin/settings' && request.method === 'PATCH') {
    if (!positiveInt(input.price_cents, 10000000)) return fail('Valor da cota inválido.', 400);
    await db.prepare("UPDATE settings SET value = ? WHERE key = 'share_price_cents'").bind(String(input.price_cents)).run();
  } else if (path === '/api/admin/participants' && request.method === 'POST') {
    const name = clean(input.name, 120);
    if (!name || !positiveInt(input.shares, 1000)) return fail('Nome ou cotas inválidos.', 400);
    result = await db.prepare('INSERT INTO participants (name, shares) VALUES (?, ?)').bind(name, input.shares).run();
  } else if (/^\/api\/admin\/participants\/\d+$/.test(path) && request.method === 'PATCH') {
    const id = idOf(path.split('/').at(-1));
    const name = clean(input.name, 120);
    if (!id || !name || !positiveInt(input.shares, 1000)) return fail('Nome ou cotas inválidos.', 400);
    const current = await db.prepare('SELECT shares FROM participants WHERE id = ?').bind(id).first();
    if (!current) return fail('Participante não encontrado.', 404);
    const paid = await db.prepare("SELECT id, amount_cents, confirmed_on FROM payments WHERE participant_id = ? AND status = 'confirmed'").bind(id).first();
    if (input.payment === undefined) {
      if (paid && current.shares !== input.shares) return fail('Atualize o pagamento junto com as cotas.', 409);
      await db.prepare('UPDATE participants SET name = ?, shares = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(name, input.shares, id).run();
    } else {
      const payment = input.payment;
      if (!payment || typeof payment !== 'object' || Array.isArray(payment) ||
        !['confirmed', 'pending'].includes(payment.status) || payment.id !== (paid?.id ?? null))
        return fail('Os dados mudaram. Atualize a página e tente novamente.', 409);
      if (payment.status === 'confirmed') {
        if (!positiveInt(payment.amount_cents) ||
          !(validDate(payment.confirmed_on) || (payment.confirmed_on === null && paid)))
          return fail('Informe um valor válido e a data conferida do novo pagamento.', 400);
      } else if (payment.amount_cents !== null || payment.confirmed_on !== null) {
        return fail('Pagamento pendente inválido.', 400);
      }
      const changed = paid && payment.status === 'confirmed' &&
        (paid.amount_cents !== payment.amount_cents || paid.confirmed_on !== payment.confirmed_on);
      const statements = [db.prepare('UPDATE participants SET name = ?, shares = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(name, input.shares, id)];
      if (paid && (payment.status === 'pending' || changed))
        statements.push(db.prepare("UPDATE payments SET status = 'voided', voided_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'confirmed'").bind(paid.id));
      if (payment.status === 'confirmed' && (!paid || changed))
        statements.push(db.prepare("INSERT INTO payments (participant_id, amount_cents, confirmed_on, status, note) VALUES (?, ?, ?, 'confirmed', ?)")
          .bind(id, payment.amount_cents, payment.confirmed_on, paid ? `Correção do pagamento #${paid.id}` : ''));
      await db.batch(statements);
    }
  } else if (path === '/api/admin/payments' && request.method === 'POST') {
    const id = input.participant_id;
    if (!positiveInt(id) || !positiveInt(input.amount_cents) || !validDate(input.confirmed_on)) return fail('Confirmação inválida.', 400);
    const participant = await db.prepare('SELECT shares FROM participants WHERE id = ?').bind(id).first();
    if (!participant) return fail('Participante não encontrado.', 404);
    if (input.amount_cents !== participant.shares * await price(db)) return fail('Valor diferente das cotas. Revise antes de confirmar.', 409);
    const existing = await db.prepare("SELECT id FROM payments WHERE participant_id = ? AND status = 'confirmed'").bind(id).first();
    if (existing) return fail('Pagamento já confirmado.', 409);
    result = await db.prepare("INSERT INTO payments (participant_id, amount_cents, confirmed_on, status) VALUES (?, ?, ?, 'confirmed')")
      .bind(id, input.amount_cents, input.confirmed_on).run();
  } else if (/^\/api\/admin\/payments\/\d+\/void$/.test(path) && request.method === 'POST') {
    const id = idOf(path.split('/')[4]);
    result = await db.prepare("UPDATE payments SET status = 'voided', voided_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'confirmed'").bind(id).run();
    if (!result.meta.changes) return fail('Confirmação não encontrada.', 404);
  } else if (path === '/api/admin/expenses' && request.method === 'POST') {
    const description = clean(input.description, 200);
    if (!description || !positiveInt(input.amount_cents) || !validDate(input.incurred_on)) return fail('Despesa inválida.', 400);
    result = await db.prepare('INSERT INTO expenses (description, amount_cents, incurred_on) VALUES (?, ?, ?)')
      .bind(description, input.amount_cents, input.incurred_on).run();
  } else if (/^\/api\/admin\/expenses\/\d+$/.test(path) && request.method === 'DELETE') {
    result = await db.prepare('DELETE FROM expenses WHERE id = ?').bind(idOf(path.split('/').at(-1))).run();
    if (!result.meta.changes) return fail('Despesa não encontrada.', 404);
  } else if (path === '/api/admin/bets' && request.method === 'POST') {
    const numbers = input.numbers;
    if (!Array.isArray(numbers) || numbers.length < 6 || numbers.length > 20 ||
      !numbers.every(n => Number.isInteger(n) && n >= 1 && n <= 60) || new Set(numbers).size !== numbers.length ||
      !positiveInt(input.amount_cents) || !validDate(input.placed_on)) return fail('Aposta inválida.', 400);
    result = await db.prepare('INSERT INTO bets (numbers_json, amount_cents, placed_on) VALUES (?, ?, ?)')
      .bind(JSON.stringify(numbers.slice().sort((a, b) => a - b)), input.amount_cents, input.placed_on).run();
  } else if (/^\/api\/admin\/bets\/\d+$/.test(path) && request.method === 'DELETE') {
    result = await db.prepare('DELETE FROM bets WHERE id = ?').bind(idOf(path.split('/').at(-1))).run();
    if (!result.meta.changes) return fail('Aposta não encontrada.', 404);
  } else if (path === '/api/admin/receipts' && request.method === 'POST') {
    const title = clean(input.title, 200);
    if (!title || !['bet', 'expense', 'other'].includes(input.kind) || !validDate(input.document_date) || !safeUrl(input.document_url)) return fail('Comprovante inválido.', 400);
    result = await db.prepare('INSERT INTO receipts (title, kind, document_url, document_date) VALUES (?, ?, ?, ?)')
      .bind(title, input.kind, input.document_url, input.document_date).run();
  } else if (/^\/api\/admin\/receipts\/\d+$/.test(path) && request.method === 'PATCH') {
    const id = idOf(path.split('/').at(-1));
    if (typeof input.reviewed !== 'boolean') return fail('Revisão inválida.', 400);
    const receipt = await db.prepare('SELECT document_url FROM receipts WHERE id = ?').bind(id).first();
    if (!receipt) return fail('Comprovante não encontrado.', 404);
    if (input.reviewed && !receipt.document_url) return fail('Informe um link antes da publicação.', 409);
    await db.prepare('UPDATE receipts SET reviewed = ? WHERE id = ?').bind(input.reviewed ? 1 : 0, id).run();
  } else if (/^\/api\/admin\/receipts\/\d+$/.test(path) && request.method === 'DELETE') {
    result = await db.prepare('DELETE FROM receipts WHERE id = ?').bind(idOf(path.split('/').at(-1))).run();
    if (!result.meta.changes) return fail('Comprovante não encontrado.', 404);
  } else return fail('Rota não encontrada.', 404);
  return json({ ok: true, id: result?.meta?.last_row_id ?? null });
}

export function createAdminWorker(testKeys) {
  return { async fetch(request, env) {
    const path = new URL(request.url).pathname;
    try {
      if (!validTeamDomain(env.ACCESS_TEAM_DOMAIN) || !env.ACCESS_AUD) return fail('Cloudflare Access não configurado.', 503);
      const identity = await verifyAccessToken(request.headers.get('Cf-Access-Jwt-Assertion'), env, testKeys);
      if (!identity) return fail('Acesso pelo Cloudflare Access obrigatório.', 403);
      const isAdmin = path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/');
      if (isAdmin) {
        const allowed = String(env.ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
        if (!allowed.length) return fail('Administração não configurada.', 503);
        if (!allowed.includes(identity.email.trim().toLowerCase())) return fail('Acesso administrativo negado.', 403);
      }
      if (path.startsWith('/api/')) return await handleApi(request, env, path);
      if (path === '/admin') return Response.redirect(new URL('/admin/', request.url), 308);
      if (request.method !== 'GET' && request.method !== 'HEAD') return fail('Método não permitido.', 405);
      if (!env.ASSETS) return fail('Arquivos estáticos não configurados.', 503);
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      if (path.startsWith('/admin/')) {
        headers.set('Cache-Control', 'no-store');
        headers.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
      }
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      if (['JSON_REQUIRED', 'BODY_TOO_LARGE', 'INVALID_JSON'].includes(error?.message)) return fail('JSON inválido ou muito grande.', 400);
      console.error('Admin request failed', error);
      return fail('Falha interna. Nenhuma confirmação foi exibida.', 500);
    }
  } };
}

export default createAdminWorker();
