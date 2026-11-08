# Implantação privada no Cloudflare Workers

Esta ramificação prepara a implantação, sem modificar o site publicado no GitHub Pages.

## Configuração no Cloudflare

- Repositório: `Ibsenpons/bolao-virada`
- Ramificação de produção do Worker (fase de testes): `cloudflare-acesso-privado`
- Nome do Worker: `bolao-virada`
- Comando de build: `node scripts/build-cloudflare.mjs`
- Comando de implantação: `npx wrangler deploy`
- Preview builds: desativados em 08/11/2026; o preview manual separado permanece disponível
- Cloudflare Access: proteger **todo o tráfego**, com uma política restritiva antes de implantar.

Nesta ramificação de revisão, o arquivo `wrangler.jsonc` prepara o painel e o D1 definitivo; a ramificação ativa ainda usa a configuração anterior.
O script de build copia arquivos explicitamente autorizados. Nenhum dado sensível,
segredo, backup, chave de API ou comprovante privado deve ser incluído nessa lista.

## Limites importantes

- O GitHub Pages atual **continua público**, mesmo após proteger o endereço do Worker.
- O repositório GitHub **continua público**; o conteúdo do `index.html`, inclusive os
  registros existentes e a chave Pix publicada, ainda pode ser consultado.
- A implantação ativa **ainda não** inclui o painel administrativo nem o banco de dados. A proposta está nesta PR e em `ADMIN-SETUP.md`; mesclá-la aciona implantação automática e exige aprovação específica.
- Antes de tornar o bolão realmente privado, migrar dados pessoais para armazenamento
  protegido, revisar arquivos e histórico do Git e desabilitar GitHub Pages.
- Antes de iniciar a implantação, configurar Cloudflare Access para proteger todo o tráfego.
- A implantação do preview separado foi testada em 08/11/2026. O Worker ativo permanece na versão anterior até aprovação específica.

## Testes locais

Execute `node scripts/build-cloudflare.mjs` na raiz do repositório e confira
os arquivos produzidos em `dist/`. Depois teste o deploy protegido em Cloudflare
e os acessos pelo Safari/iPad e Edge/Windows.
