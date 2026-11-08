/* Indicadores e prestação de contas — atualização manual, sem serviços externos. */
(() => {
  "use strict";
  if (typeof BOLAO === "undefined") return;
  const byId = id => document.getElementById(id);
  const money = n => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const safe = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const date = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v.split("-").reverse().join("/") : "Não informada";
  const paid = (BOLAO.participantes || []).filter(p => p.pago === true);
  const pending = (BOLAO.participantes || []).filter(p => p.pago !== true);
  const shares = rows => rows.reduce((acc,p) => acc + (Number.isFinite(Number(p.cotas)) && Number(p.cotas)>0 ? Number(p.cotas) : 0),0);
  const paidShares = shares(paid);
  const pendingShares = shares(pending);
  const received = paidShares * BOLAO.valorCota;
  const toReceive = pendingShares * BOLAO.valorCota;
  const expenses = Array.isArray(BOLAO.despesas) ? BOLAO.despesas.filter(d => Number.isFinite(Number(d.valor)) && Number(d.valor) >= 0) : [];
  const spent = expenses.reduce((sum,d) => sum + Number(d.valor), 0);
  const put = (id, value) => { const node=byId(id); if(node) node.textContent=value; };
  put("kpiCotas", String(paidShares));
  put("kpiCotasDetalhe", pendingShares + (pendingShares===1 ? " cota pendente" : " cotas pendentes"));
  put("kpiArrecadado", money(received));
  put("kpiJogos", String((BOLAO.jogos || []).length));
  put("kpiPremio", BOLAO.premioEstimado);
  put("finArrecadado", money(received));
  put("finPendente", money(toReceive));
  put("finGasto", money(spent));
  put("finSaldo", money(received - spent));

  const expTarget = byId("tabelaDespesas");
  if(expTarget) expTarget.innerHTML = expenses.length
    ? '<table><thead><tr><th>Despesa</th><th>Data</th><th class="num2">Valor</th></tr></thead><tbody>' +
      expenses.map(d => '<tr><td>' + safe(d.descricao || "Despesa") + '</td><td>' +
      safe(date(d.data)) + '</td><td class="num2">' + money(Number(d.valor)) + '</td></tr>').join("") +
      '</tbody></table>'
    : '<p class="empty-state">Nenhuma despesa foi cadastrada. Isso não significa necessariamente que não houve gastos.</p>';

  const documents = Array.isArray(BOLAO.comprovantes) ? BOLAO.comprovantes : [];
  const safeUrl = url => typeof url === "string" &&
    (/^https:\/\/[^\s"'<>]+$/.test(url) || /^\.\/(?!.*\.\.)[^\s"'<>]+$/.test(url));
  const docsTarget = byId("listaComprovantes");
  if(docsTarget) docsTarget.innerHTML = documents.length
    ? '<ul class="document-list">' + documents.map(d =>
        '<li><span class="doc-icon" aria-hidden="true"><svg class="ui-icon"><use href="#i-doc"></use></svg></span><div><strong>' +
        safe(d.titulo || "Comprovante") + '</strong><small>' + safe(date(d.data)) +
        '</small></div>' +
        (safeUrl(d.url) ? '<a href="' + safe(d.url) +
          '" target="_blank" rel="noopener noreferrer">Abrir arquivo</a>' :
          '<span>Arquivo indisponível</span>') + '</li>').join("") + '</ul>'
    : '<p class="empty-state">Os comprovantes poderão aparecer aqui após conferência e ocultação de dados pessoais.</p>';
})();

/* Âncoras e retorno ao topo — não altera os dados do bolão. */
(() => {
  "use strict";
  const nav = document.querySelector(".quick-nav");
  const back = document.getElementById("backToTop");
  if (!nav || !back) return;
  const anchors = Array.from(nav.querySelectorAll('a[href^="#"]'));
  const highlight = () => {
    const hash = window.location.hash;
    anchors.forEach(a => {
      const active = hash.length > 1 && a.getAttribute("href") === hash;
      a.classList.toggle("is-active", active);
      if (active) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
  };
  const updateBack = () => {
    back.classList.toggle("is-visible", window.scrollY > 360);
  };
  window.addEventListener("hashchange", highlight);
  window.addEventListener("scroll", updateBack, { passive:true });
  highlight();
  updateBack();
})();
