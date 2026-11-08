/* Resumo inicial da edição 2026 — deriva números exclusivamente de BOLAO. */
(() => {
  "use strict";
  if (typeof BOLAO === "undefined") return;
  const el=id=>document.getElementById(id);
  const participants=Array.isArray(BOLAO.participantes)?BOLAO.participantes:[];
  const registered=participants.reduce((sum,p)=>sum+(Number.isFinite(Number(p.cotas))&&Number(p.cotas)>0?Number(p.cotas):0),0);
  const paid=participants.filter(p=>p.pago===true).reduce((sum,p)=>sum+(Number.isFinite(Number(p.cotas))&&Number(p.cotas)>0?Number(p.cotas):0),0);
  const pending=Math.max(0,registered-paid);
  const games=Array.isArray(BOLAO.jogos)?BOLAO.jogos.length:0;
  const put=(id,val)=>{const n=el(id);if(n)n.textContent=val};
  put("kpiParticipantes",participants.length.toLocaleString("pt-BR"));
  put("kpiTotalCotas",registered.toLocaleString("pt-BR"));
  put("kpiCotas",paid.toLocaleString("pt-BR"));
  put("kpiCotasDetalhe",pending+(pending===1?" cota ainda não paga":" cotas ainda não pagas"));
  put("kpiJogos",games.toLocaleString("pt-BR"));

  const percent=registered>0?Math.max(0,Math.min(100,Math.round((paid/registered)*100))):0;
  put("progressoPercentual",registered>0?percent+"%":"—");
  put("progressoLegenda",registered>0?
    paid+" de "+registered+(registered===1?" cota cadastrada marcada como paga":" cotas cadastradas marcadas como pagas"):
    "Nenhuma cota foi cadastrada até agora.");
  const fill=el("progressoFill");if(fill)fill.style.width=percent+"%";
  const bar=el("progressoTrack");if(bar)bar.setAttribute("aria-valuenow",String(percent));

  // Fechar menu de seções ao escolher qualquer link.
  const more=document.querySelector(".nav-more");
  if(more)more.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener("click",()=>{more.open=false}));
})();
