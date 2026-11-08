import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createAdminWorker } from '../worker/admin.mjs';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';

async function fixture() {
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
    ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
    ASSETS: { fetch: async request => new URL(request.url).pathname === '/admin/index.html'
      ? new Response(null, { status: 307, headers: { location: '/admin/' } })
      : new Response('asset', { status: 200 }) },
  };
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  Object.assign(jwk, { kid: 'test-key', alg: 'RS256', use: 'sig' });
  const worker = createAdminWorker(createLocalJWKSet({ keys: [jwk] }));
  const token = (email, audience = 'expected-aud') => new SignJWT({ email, type: 'app' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(env.ACCESS_TEAM_DOMAIN).setAudience(audience).setIssuedAt().setNotBefore('0s').setExpirationTime('1h').sign(privateKey);
  const adminToken = await token('admin@example.com');
  const familyToken = await token('family@example.com');
  const wrongAudienceToken = await token('admin@example.com', 'wrong-aud');
  const call = (path, method = 'GET', data, jwt = adminToken, headers = {}) => {
    const request = new Request(`https://preview.example${path}`, {
      method,
      headers: method === 'GET'
        ? { 'Cf-Access-Jwt-Assertion': jwt, ...headers }
        : { 'Cf-Access-Jwt-Assertion': jwt, origin: 'https://preview.example', 'content-type': 'application/json', 'x-requested-with': 'bolao-admin', ...headers },
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(data ?? {}),
    });
    return worker.fetch(request, env);
  };
  return { sqlite, env, call, adminToken, familyToken, wrongAudienceToken };
}

test('assinatura, audiência e lista de e-mails protegem páginas e API', async () => {
  const { call, adminToken, familyToken, wrongAudienceToken } = await fixture();
  assert.equal((await call('/api/admin/state', 'GET', null, '')).status, 403);
  assert.equal((await call('/admin/', 'GET', null, familyToken)).status, 403);
  assert.equal((await call('/api/admin/state', 'GET', null, wrongAudienceToken)).status, 403);
  assert.equal((await call('/api/admin/state', 'GET', null, adminToken.slice(0, -1) + 'x')).status, 403);
  assert.equal((await call('/api/admin/state')).status, 200);
  assert.equal((await call('/admin/')).status, 200);
  assert.equal((await call('/api/public', 'GET', null, familyToken)).status, 200);
});

test('migração preserva o participante e valor conhecidos sem criar data fictícia', async () => {
  const { call } = await fixture();
  const state = await (await call('/api/admin/state')).json();
  assert.equal(state.price_cents, 5000);
  assert.deepEqual(state.participants.map(p => [p.name, p.shares]), [['Ibsen P.', 1]]);
  assert.equal(state.payments[0].confirmed_on, null);
  const visible = await (await call('/api/public')).json();
  assert.equal(visible.received_cents, 5000);
  assert.deepEqual(visible.participants, [{ nome: 'Ibsen P.', cotas: 1, pago: true }]);
});

test('confirmação exige origem, valor e data; cancelamento atualiza a consulta pública', async () => {
  const { call } = await fixture();
  const created = await (await call('/api/admin/participants', 'POST', { name: 'Pessoa Teste', shares: 2 })).json();
  const id = created.id;
  const forged = await call('/api/admin/payments', 'POST', { participant_id: id, amount_cents: 10000, confirmed_on: '2026-11-08' }, undefined, { origin: 'https://attacker.example' });
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
  const { call } = await fixture();
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
