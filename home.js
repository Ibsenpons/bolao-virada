/* Resumo inicial da edição 2026 — deriva números exclusivamente de BOLAO. */
(() => {
  "use strict";
  if (typeof BOLAO === "undefined") return;
  const el=id=>document.getElementById(id);
  const participants=Array.isArray(BOLAO.participantes)?BOLAO.participantes.filter(p=>p.pago===true&&Number(p.cotas)>0):[];
  const shares=participants.reduce((sum,p)=>sum+(Number.isFinite(Number(p.cotas))?Number(p.cotas):0),0);
  const games=Array.isArray(BOLAO.jogos)?BOLAO.jogos.length:0;
  const put=(id,val)=>{const n=el(id);if(n)n.textContent=val};
  put("kpiParticipantes",participants.length.toLocaleString("pt-BR"));
  put("kpiCotas",shares.toLocaleString("pt-BR"));
  put("kpiJogos",games.toLocaleString("pt-BR"));

  // Fechar menu de seções ao escolher qualquer link.
  const more=document.querySelector(".nav-more");
  if(more)more.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener("click",()=>{more.open=false}));
})();
