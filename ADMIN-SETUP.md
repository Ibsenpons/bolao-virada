# Painel administrativo — preparação para implantação

Esta implementação fica na ramificação `feat/painel-admin-d1-2026-11-08`, criada a partir de `cloudflare-acesso-privado`. A `main`, o GitHub Pages e o Worker ativo não devem receber estas alterações antes de aprovação específica.

## O que já está no código

- O painel em `/admin/` cadastra participantes, confirma ou cancela pagamentos, altera o valor das novas cotas e registra despesas, apostas e metadados de comprovantes.
- O Worker valida criptograficamente o JWT enviado pelo Cloudflare Access em todas as rotas, incluindo assinatura, emissor (`ACCESS_TEAM_DOMAIN`), público (`ACCESS_AUD`) e validade. Em `/admin/` e `/api/admin/*`, ele também compara o e-mail autenticado com `ADMIN_EMAILS`, no servidor. Um cabeçalho forjado não concede permissão.
- O D1 guarda participantes, pagamentos, valores, despesas, apostas e comprovantes. A migração inicial reproduz somente o registro que já estava no HTML público. Correções e novos registros confirmados pelo organizador foram aplicados nos bancos privados, sem publicar esses dados no Git. A data de pagamento original continua vazia porque não foi informada.
- O site lê `/api/public` no Worker e mostra apenas pagamentos confirmados e links de comprovantes marcados como revisados. No GitHub Pages, a página original ainda funciona com os dados já publicados no HTML.
- Os comprovantes são links para arquivos externos, não uploads. A criação é privada; a publicação exige uma ação separada de revisão. O operador deve remover dados pessoais do arquivo e conferir as permissões do destino antes de publicar.

## Estado do preview em 08/11/2026

- O Worker separado `bolao-virada-admin-preview` está disponível em [sua página administrativa](https://bolao-virada-admin-preview.ibsen-pons.workers.dev/admin/). Ele foi implantado manualmente, fora da ramificação que publica o Worker ativo.
- O D1 separado `bolao-virada-admin-preview` recebeu a migração inicial e depois registros inseridos pelo organizador. Ele contém dados reais e uma aposta de exemplo; não deve ser copiado integralmente para produção.
- Uma aplicação Cloudflare Access cobre o Worker de preview inteiro com a política existente “Participantes do Bolão”. Uma requisição sem sessão para `/admin/` foi redirecionada à tela de login; a autorização administrativa também é verificada no servidor.
- O segredo `ADMIN_EMAILS` foi configurado no Worker de preview sem ser gravado no Git.
- A interface foi conferida localmente nas larguras de 390 e 320 pixels: formulários legíveis, tabelas com rolagem própria e sem rolagem horizontal da página. O painel e o site de preview carregaram com a sessão real do administrador. Uma despesa descartável foi criada e excluída; não restou despesa. Os fluxos de participantes e pagamentos também foram exercitados pelo organizador no preview.

## Preparação do Worker ativo, ainda sem implantação

- Um D1 definitivo, separado e ainda não vinculado ao Worker ativo, contém apenas os registros que o organizador confirmou. A aposta de exemplo não foi importada. Há exportações privadas dos dois bancos fora do Git e uma ramificação de segurança do código ativo.
- A aplicação Access do Worker ativo já protege seus URLs de produção e preview com a política “Participantes do Bolão”. O painel também verificará no servidor a lista `ADMIN_EMAILS`, que ainda precisa ser configurada como segredo no Worker ativo.
- Os builds automáticos de ramificações de preview foram desativados; o Worker de preview manual continua disponível. A configuração de produção e o build do painel estão nesta ramificação de revisão, mas a ramificação ligada ao Worker ativo ainda não recebeu essas mudanças.
- O pacote de produção passou em `wrangler deploy --dry-run`. Nenhuma implantação ativa foi feita.

## Preparação isolada antes de qualquer publicação

1. Manter os builds de preview de novas ramificações desativados enquanto esta PR contiver a vinculação do D1 definitivo. Não usar `cloudflare-acesso-privado` para testes de código, pois ela está ligada ao deploy automático do Worker ativo.
2. Usar um D1 de preview separado do banco definitivo. Novos dados registrados no preview precisam ser classificados e migrados seletivamente antes da implantação ativa.
3. Copiar `wrangler.admin.example.jsonc` para `wrangler.admin.jsonc` (ignorado pelo Git), substituir `PREENCHER_UUID_D1_PREVIEW` pelo UUID do banco e manter o nome de Worker de preview separado. Nunca apontar o preview para `bolao-virada`.
4. Configurar uma aplicação Cloudflare Access no **Worker de preview** cobrindo todas as rotas, inclusive `/admin/`, `/api/*` e assets. Configurar `ACCESS_TEAM_DOMAIN` com o domínio da equipe, `ACCESS_AUD` com o Audience Tag dessa aplicação e `ADMIN_EMAILS` com o e-mail do administrador, como variáveis do Worker. Não gravar e-mails privados ou tokens no repositório. O Access pode admitir familiares no site, mas o Worker só admitirá e-mails listados na administração.
5. Instalar as dependências com `npm ci` e gerar os arquivos de preview com `npm run build:admin`. Aplicar a migração **localmente** com `npx wrangler d1 migrations apply DB --local --config wrangler.admin.jsonc` e iniciar `npx wrangler dev --config wrangler.admin.jsonc`. O teste local de fluxo usa JWTs assinados e chaves temporárias em `npm test`; `wrangler dev` sem um JWT real retorna 403. A proteção real deve ser conferida no Worker de preview após configurar o Access.
6. Se a publicação de um Worker de preview separado for aprovada, aplicar a migração no D1 de preview com `npx wrangler d1 migrations apply DB --remote --config wrangler.admin.jsonc`. Configurar Access para todo o Worker de preview e verificar: familiar autorizado vê o site, mas recebe 403 em `/admin/` e `/api/admin/state`; administrador consegue cadastrar e confirmar um registro descartável; cotas e arrecadação mudam no site; cancelamento remove a confirmação da visão pública; comprovante novo não aparece até revisão; tela estreita mantém formulários utilizáveis.

## Aprovação para implantação ativa

Antes de mesclar esta PR, conferir novamente que os dados do D1 definitivo correspondem aos registros reais e que nenhum cadastro novo ficou apenas no preview. A implantação exige autorização específica para: configurar `ADMIN_EMAILS` como segredo no Worker ativo, mesclar a PR na ramificação de implantação automática e conferir o resultado. Registrar a versão ativa anterior para possível retorno. Um teste sem sessão deve ir para o login; o administrador deve acessar `/admin/`; outros participantes devem receber 403 na administração; o site deve refletir apenas os dados reais. O `wrangler.jsonc` alterado nesta PR ainda não está no Worker ativo.

O GitHub Pages e o repositório continuam públicos. O HTML antigo contém o nome abreviado, a cota e a chave Pix já publicados. A migração para D1 **não apaga essa exposição anterior**; a retirada do Pages e a revisão do histórico do Git são decisões separadas.

## Verificações locais

```sh
node --test tests/admin.test.mjs
node --check worker/admin.mjs
node --check admin/admin.js
node scripts/build-cloudflare.mjs
npx wrangler deploy --dry-run
```

Referências: [validação de JWT do Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [limite de `ctx.access` com Static Assets](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [assets com `run_worker_first`](https://developers.cloudflare.com/workers/static-assets/binding/), [migrações D1](https://developers.cloudflare.com/d1/reference/migrations/).
