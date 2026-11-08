# Implantação privada no Cloudflare Workers

Esta ramificação prepara a implantação, sem modificar o site publicado no GitHub Pages.

## Configuração no Cloudflare

- Repositório: `Ibsenpons/bolao-virada`
- Ramificação de produção do Worker (fase de testes): `cloudflare-acesso-privado`
- Nome do Worker: `bolao-virada`
- Comando de build: `node scripts/build-cloudflare.mjs`
- Comando de implantação: `npx wrangler deploy`
- Preview builds: desativar inicialmente
- Cloudflare Access: proteger **todo o tráfego**, com uma política restritiva antes de implantar.

O arquivo `wrangler.jsonc` entrega apenas o conteúdo da pasta temporária `dist/`.
O script de build copia arquivos explicitamente autorizados. Nenhum dado sensível,
segredo, backup, chave de API ou comprovante privado deve ser incluído nessa lista.

## Limites importantes

- O GitHub Pages atual **continua público**, mesmo após proteger o endereço do Worker.
- O repositório GitHub **continua público**; o conteúdo do `index.html`, inclusive os
  registros existentes e a chave Pix publicada, ainda pode ser consultado.
- Esta etapa **não** cria o painel administrativo nem um banco de dados.
- Antes de tornar o bolão realmente privado, migrar dados pessoais para armazenamento
  protegido, revisar arquivos e histórico do Git e desabilitar GitHub Pages.
- Não publicar a nova versão antes de verificar a política de acesso e o build.

## Testes locais

Execute `node scripts/build-cloudflare.mjs` na raiz do repositório e confira
os arquivos produzidos em `dist/`. Depois teste o deploy protegido em Cloudflare
e os acessos pelo Safari/iPad e Edge/Windows.
