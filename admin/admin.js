(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = cents => (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const day = value => value ? value.split('-').reverse().join('/') : 'Data não informada';
  const cents = value => Math.round(Number(value) * 100);
  let state;
  let editingParticipantId = null;
  let editingPayment = null;
  function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
  async function api(path, method = 'GET', data) {
    const response = await fetch(path, {
      method, credentials: 'same-origin',
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Requested-With': 'bolao-admin' },
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(data ?? {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Erro ${response.status}`);
    return result;
  }
  async function refresh(note = '') {
    state = await api('/api/admin/state');
    render();
    $('panel').hidden = false;
    syncNewParticipant();
    message(note);
  }
  async function act(path, method, data, note) {
    try { await api(path, method, data); await refresh(note); }
    catch (error) { message(error.message, true); }
  }
  function render() {
    const active = state.payments.filter(p => p.status === 'confirmed');
    const paidIds = new Set(active.map(p => p.participant_id));
    const paidParticipants = state.participants.filter(p => paidIds.has(p.id));
    const received = active.reduce((sum, p) => sum + p.amount_cents, 0);
    const spent = state.expenses.reduce((sum, e) => sum + e.amount_cents, 0);
    $('sumPeople').textContent = paidParticipants.length;
    $('sumShares').textContent = paidParticipants.reduce((sum, p) => sum + p.shares, 0);
    $('sumReceived').textContent = money(received);
    $('sumExpenses').textContent = money(spent);
    $('sumBalance').textContent = money(received - spent);
    $('priceForm').elements.price.value = (state.price_cents / 100).toFixed(2);
    $('participantsBody').innerHTML = state.participants.length ? state.participants.map(p => {
      const payment = active.find(row => row.participant_id === p.id);
      const action = payment
        ? `<span class="badge">Confirmado · ${money(payment.amount_cents)} · ${day(payment.confirmed_on)}</span>`
        : '<span class="badge pending">Aguardando conferência</span>';
      const controls = payment
        ? `<button class="secondary" data-action="void" data-id="${payment.id}">Cancelar confirmação</button>`
        : `<input type="date" aria-label="Data do pagamento de ${esc(p.name)}" data-date="${p.id}"><button data-action="confirm" data-id="${p.id}">Confirmar ${money(p.shares * state.price_cents)}</button>`;
      return `<tr><td><strong>${esc(p.name)}</strong></td><td>${p.shares}</td><td>${action}</td><td><div class="row-actions"><button class="secondary" data-action="edit-participant" data-id="${p.id}">Editar</button>${controls}</div></td></tr>`;
    }).join('') : '<tr><td colspan="4" class="empty">Nenhum participante.</td></tr>';
    $('expensesBody').innerHTML = state.expenses.length ? state.expenses.map(e => `<tr><td>${esc(e.description)}</td><td>${day(e.incurred_on)}</td><td>${money(e.amount_cents)}</td><td><div class="row-actions"><button class="danger" data-action="delete-expense" data-id="${e.id}">Excluir</button></div></td></tr>`).join('') : '<tr><td colspan="4" class="empty">Nenhuma despesa registrada.</td></tr>';
    $('betsBody').innerHTML = state.bets.length ? state.bets.map(b => `<tr><td>${esc(JSON.parse(b.numbers_json).map(n => String(n).padStart(2, '0')).join(' · '))}</td><td>${day(b.placed_on)}</td><td>${money(b.amount_cents)}</td><td><div class="row-actions"><button class="danger" data-action="delete-bet" data-id="${b.id}">Excluir</button></div></td></tr>`).join('') : '<tr><td colspan="4" class="empty">Nenhuma aposta registrada.</td></tr>';
    $('receiptsBody').innerHTML = state.receipts.length ? state.receipts.map(r => `<tr><td><strong>${esc(r.title)}</strong><br><span class="muted">${esc(r.document_url || 'Sem link')}</span></td><td>${day(r.document_date)}</td><td><span class="badge ${r.reviewed ? '' : 'pending'}">${r.reviewed ? 'Revisado e visível' : 'Privado'}</span></td><td><div class="row-actions"><button class="secondary" data-action="review" data-id="${r.id}">${r.reviewed ? 'Ocultar' : 'Publicar após revisão'}</button><button class="danger" data-action="delete-receipt" data-id="${r.id}">Excluir</button></div></td></tr>`).join('') : '<tr><td colspan="4" class="empty">Nenhum comprovante registrado.</td></tr>';
  }
  function onForm(id, makeRequest) {
    $(id).addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form));
      try {
        const [path, method, payload, note] = makeRequest(values);
        await api(path, method, payload);
        form.reset();
        await refresh(note);
      } catch (error) { message(error.message, true); }
    });
  }
  onForm('priceForm', v => ['/api/admin/settings', 'PATCH', { price_cents: cents(v.price) }, 'Valor da cota atualizado.']);
  const participantForm = $('participantForm');
  function localToday() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
  }
  function syncNewParticipant() {
    const f = participantForm.elements;
    if (!f.date.value) f.date.value = localToday();
    f.date.required = f.confirmed.checked;
    f.date.disabled = !f.confirmed.checked;
    f.email.disabled = !f.confirmed.checked;
    $('participantTotal').textContent = state ? money(Number(f.shares.value || 0) * state.price_cents) : '';
  }
  participantForm.addEventListener('input', syncNewParticipant);
  participantForm.addEventListener('change', syncNewParticipant);
  participantForm.addEventListener('submit', async event => {
    event.preventDefault();
    const f = participantForm.elements;
    const name = f.name.value.trim(), shares = Number(f.shares.value);
    const paid = f.confirmed.checked, date = f.date.value, email = f.email.value.trim();
    const amount = shares * state.price_cents;
    if (!name || !Number.isInteger(shares) || shares < 1 || shares > 1000) return;
    if (paid && !confirm('Confirma o pagamento de ' + money(amount) + ' para ' + name + '?')) return;
    const button = participantForm.querySelector('button');
    const note = $('participantMessage');
    button.disabled = true;
    let stage = 'cadastro';
    try {
      const before = await api('/api/admin/state');
      if (paid && before.price_cents !== state.price_cents) {
        await refresh();
        syncNewParticipant();
        note.textContent = 'O valor da cota mudou. Confira o total antes de continuar.';
        return;
      }
      await api('/api/admin/participants', 'POST', {name, shares});
      stage = 'identificação';
      participantForm.reset();
      syncNewParticipant();
      if (!paid) { note.textContent = 'Participante cadastrado sem pagamento.'; await refresh(); return; }
      const after = await api('/api/admin/state');
      const oldIds = new Set(before.participants.map(p => p.id));
      const matches = after.participants.filter(p => !oldIds.has(p.id) && p.name === name && p.shares === shares);
      if (matches.length !== 1) throw new Error('Não foi possível identificar o novo cadastro com segurança.');
      stage = 'pagamento';
      await api('/api/admin/payments', 'POST', {participant_id: matches[0].id, amount_cents: amount, confirmed_on: date});
      stage = 'acesso';
      if (email) await api('/api/admin/access', 'POST', {action:'add', email});
      stage = 'concluído';
      note.textContent = email ? 'Participante, pagamento e acesso confirmados.' : 'Participante e pagamento confirmados.';
      await refresh();
      if (email) await refreshAccess();
    } catch(error) {
      note.textContent = stage === 'acesso' ? 'Pagamento registrado. Acesso pendente: ' + error.message + '. Tente somente pelo Controle de acesso.' : stage === 'concluído' ? 'Operação concluída; atualize a página para conferir.' : 'Não repita o cadastro antes de conferir a lista. Etapa: ' + stage + '. ' + error.message;
      if (stage === 'acesso') { $('accessForm').elements.email.value = email; }
      try { await refresh(); } catch (_) {}
    } finally { button.disabled = false; }
  });
  onForm('expenseForm', v => ['/api/admin/expenses', 'POST', { description: v.description, amount_cents: cents(v.amount), incurred_on: v.date }, 'Despesa registrada.']);
  onForm('betForm', v => ['/api/admin/bets', 'POST', { numbers: v.numbers.split(/[\s,;]+/).filter(Boolean).map(Number), amount_cents: cents(v.amount), placed_on: v.date }, 'Aposta registrada.']);
  onForm('receiptForm', v => ['/api/admin/receipts', 'POST', { title: v.title, kind: v.kind, document_date: v.date, document_url: v.url.trim() }, 'Comprovante registrado como privado.']);
  const editDialog = $('participantDialog');
  const editForm = $('participantEditForm');
  function syncPaymentFields() {
    const confirmed = editForm.elements.paymentStatus.value === 'confirmed';
    $('paymentEditFields').hidden = !confirmed;
    editForm.elements.amount.disabled = !confirmed;
    editForm.elements.amount.required = confirmed;
    editForm.elements.date.disabled = !confirmed;
    editForm.elements.date.required = confirmed && !editingPayment;
    $('paymentDateHint').hidden = !editingPayment;
  }
  editForm.elements.paymentStatus.addEventListener('change', syncPaymentFields);
  $('closeParticipantDialog').addEventListener('click', () => editDialog.close());
  $('cancelParticipantEdit').addEventListener('click', () => editDialog.close());
  editForm.addEventListener('submit', async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(editForm));
    const confirmed = values.paymentStatus === 'confirmed';
    const payload = {
      name: values.name,
      shares: Number(values.shares),
      payment: {
        id: editingPayment?.id ?? null,
        status: confirmed ? 'confirmed' : 'pending',
        amount_cents: confirmed ? cents(values.amount) : null,
        confirmed_on: confirmed ? (values.date || null) : null,
      },
    };
    const saveButton = editForm.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    try {
      await api(`/api/admin/participants/${editingParticipantId}`, 'PATCH', payload);
      editDialog.close();
      await refresh('Participante e pagamento atualizados.');
    } catch (error) {
      $('participantEditMessage').textContent = error.message;
      $('participantEditMessage').hidden = false;
      if (!editDialog.open) message(error.message, true);
    } finally { saveButton.disabled = false; }
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = Number(button.dataset.id);
    const action = button.dataset.action;
    if (action === 'confirm') {
      const participant = state.participants.find(p => p.id === id);
      const date = document.querySelector(`[data-date="${id}"]`).value;
      if (!date) return message('Informe a data conferida do pagamento.', true);
      return act('/api/admin/payments', 'POST', { participant_id: id, amount_cents: participant.shares * state.price_cents, confirmed_on: date }, 'Pagamento confirmado.');
    }
    if (action === 'edit-participant') {
      const p = state.participants.find(row => row.id === id);
      editingParticipantId = id;
      editingPayment = state.payments.find(row => row.participant_id === id && row.status === 'confirmed') ?? null;
      editForm.elements.name.value = p.name;
      editForm.elements.shares.value = p.shares;
      editForm.elements.paymentStatus.value = editingPayment ? 'confirmed' : 'pending';
      editForm.elements.amount.value = editingPayment ? (editingPayment.amount_cents / 100).toFixed(2) : (p.shares * state.price_cents / 100).toFixed(2);
      editForm.elements.date.value = editingPayment?.confirmed_on ?? '';
      $('participantEditMessage').hidden = true;
      syncPaymentFields();
      return editDialog.showModal();
    }
    if (action === 'review') {
      const r = state.receipts.find(row => row.id === id);
      if (!r.reviewed && !confirm('Você conferiu o arquivo e ocultou todos os dados pessoais antes de tornar o link visível?')) return;
      return act(`/api/admin/receipts/${id}`, 'PATCH', { reviewed: !r.reviewed }, r.reviewed ? 'Comprovante ocultado.' : 'Comprovante revisado e publicado.');
    }
    const targets = {
      void: [`/api/admin/payments/${id}/void`, 'POST', 'Cancelar esta confirmação de pagamento?'],
      'delete-expense': [`/api/admin/expenses/${id}`, 'DELETE', 'Excluir esta despesa?'],
      'delete-bet': [`/api/admin/bets/${id}`, 'DELETE', 'Excluir esta aposta?'],
      'delete-receipt': [`/api/admin/receipts/${id}`, 'DELETE', 'Excluir este comprovante?'],
    };
    if (targets[action] && confirm(targets[action][2])) return act(targets[action][0], targets[action][1], undefined, 'Registro atualizado.');
  });
  async function refreshAccess() {
    try {
      const result = await api('/api/admin/access');
      $('accessList').replaceChildren(...result.emails.map(email => { const li = document.createElement('li'); li.textContent = email; return li; }));
      $('accessMessage').textContent = result.emails.length + ' e-mails autorizados.';
    } catch(error) { $('accessMessage').textContent = error.message; }
  }
  $('accessForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.elements.email.value.trim();
    if (!confirm('Confirma o pagamento e a autorização de ' + email + '?')) return;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      await api('/api/admin/access','POST',{action:'add',email});
      form.reset();
      await refreshAccess();
    } catch(error) { $('accessMessage').textContent = error.message; }
    finally { button.disabled = false; }
  });
  refreshAccess();
  refresh().catch(error => message(error.message, true));
})();
