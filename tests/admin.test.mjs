import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker/admin.mjs';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(new URL('../migrations/0001_admin.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      let values = [];
      const execute = () => sqlite.prepare(sql);
      return {
        bind(...args) { values = args; return this; },
        async first() { return execute().get(...values) ?? null; },
        async all() { return { results: execute().all(...values) }; },
        async run() {
          const result = execute().run(...values);
          return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
        },
      };
    },
  };
  const env = {
    DB: db, ADMIN_EMAILS: 'admin@example.com', ACCESS_AUD: 'expected-aud',
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
  };
  const ctx = email => ({ access: { aud: 'expected-aud', getIdentity: async () => ({ email }) } });
  const call = (path, method = 'GET', data, context = ctx('admin@example.com'), headers = {}) => {
    const request = new Request(`https://preview.example${path}`, {
      method,
      headers: method === 'GET' ? headers : { origin: 'https://preview.example', 'content-type': 'application/json', 'x-requested-with': 'bolao-admin', ...headers },
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(data ?? {}),
    });
    return worker.fetch(request, env, context);
  };
  return { sqlite, env, ctx, call };
}

test('Access e allowlist protegem páginas e API; cabeçalho forjado não substitui ctx.access', async () => {
  const { call, ctx } = fixture();
  assert.equal((await call('/api/admin/state', 'GET', null, {})).status, 403);
  assert.equal((await call('/admin/', 'GET', null, ctx('family@example.com'))).status, 403);
  assert.equal((await call('/api/admin/state', 'GET', null, { access: { aud: 'wrong', getIdentity: async () => ({ email: 'admin@example.com' }) } })).status, 503);
  assert.equal((await call('/api/admin/state')).status, 200);
  assert.equal((await call('/admin/')).status, 200);
  assert.equal((await call('/api/public', 'GET', null, ctx('family@example.com'))).status, 200);
});

test('migração preserva o participante e valor conhecidos sem criar data fictícia', async () => {
  const { call } = fixture();
  const state = await (await call('/api/admin/state')).json();
  assert.equal(state.price_cents, 5000);
  assert.deepEqual(state.participants.map(p => [p.name, p.shares]), [['Ibsen P.', 1]]);
  assert.equal(state.payments[0].confirmed_on, null);
  const visible = await (await call('/api/public')).json();
  assert.equal(visible.received_cents, 5000);
  assert.deepEqual(visible.participants, [{ nome: 'Ibsen P.', cotas: 1, pago: true }]);
});

test('confirmação exige origem, valor e data; cancelamento atualiza a consulta pública', async () => {
  const { call, ctx } = fixture();
  const created = await (await call('/api/admin/participants', 'POST', { name: 'Pessoa Teste', shares: 2 })).json();
  const id = created.id;
  const forged = await call('/api/admin/payments', 'POST', { participant_id: id, amount_cents: 10000, confirmed_on: '2026-11-08' }, ctx('admin@example.com'), { origin: 'https://attacker.example' });
  assert.equal(forged.status, 403);
  assert.equal((await call('/api/admin/payments', 'POST', { participant_id: id, amount_cents: 5000, confirmed_on: '2026-11-08' })).status, 409);
  const payment = await (await call('/api/admin/payments', 'POST', { participant_id: id, amount_cents: 10000, confirmed_on: '2026-11-08' })).json();
  assert.equal((await call('/api/admin/payments', 'POST', { participant_id: id, amount_cents: 10000, confirmed_on: '2026-11-08' })).status, 409);
  assert.equal((await call(`/api/admin/participants/${id}`, 'PATCH', { name: 'Pessoa Teste', shares: 3 })).status, 409);
  let visible = await (await call('/api/public')).json();
  assert.equal(visible.received_cents, 15000);
  assert.equal(visible.participants.length, 2);
  assert.equal((await call(`/api/admin/payments/${payment.id}/void`, 'POST')).status, 200);
  visible = await (await call('/api/public')).json();
  assert.equal(visible.received_cents, 5000);
  assert.equal(visible.participants.length, 1);
});

test('despesas, apostas e comprovantes privados seguem visibilidade esperada', async () => {
  const { call } = fixture();
  assert.equal((await call('/api/admin/expenses', 'POST', { description: 'Papel', amount_cents: 1200, incurred_on: '2026-11-08' })).status, 200);
  assert.equal((await call('/api/admin/bets', 'POST', { numbers: [1, 2, 3, 4, 5, 5], amount_cents: 600, placed_on: '2026-11-08' })).status, 400);
  assert.equal((await call('/api/admin/bets', 'POST', { numbers: [1, 2, 3, 4, 5, 6], amount_cents: 600, placed_on: '2026-11-08' })).status, 200);
  const receipt = await (await call('/api/admin/receipts', 'POST', { title: 'Recibo revisado', kind: 'bet', document_date: '2026-11-08', document_url: 'https://example.com/file.pdf' })).json();
  let visible = await (await call('/api/public')).json();
  assert.equal(visible.expenses.length, 1);
  assert.equal(visible.bets.length, 1);
  assert.equal(visible.receipts.length, 0);
  assert.equal((await call(`/api/admin/receipts/${receipt.id}`, 'PATCH', { reviewed: true })).status, 200);
  visible = await (await call('/api/public')).json();
  assert.equal(visible.receipts.length, 1);
});
