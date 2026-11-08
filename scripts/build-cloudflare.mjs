// Gera somente os arquivos públicos do site para Cloudflare Workers.
// Nunca publique o diretório inteiro do repositório: futuramente ele poderá conter dados privados.
import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'dist');

// Lista explícita: novos recursos visuais precisam ser adicionados após revisão.
const publicFiles = [
  'index.html',
  'dashboard.css',
  'home.css',
  'dashboard.js',
  'assets/fonts/manrope-latin-variable.woff2',
  'assets/logo-bilhao-manrope-vetorial.svg',
  'assets/pix-megada-virada26.png',
];

await rm(output, { recursive: true, force: true });
for (const file of publicFiles) {
  const source = join(root, file);
  const destination = join(output, file);
  const metadata = await stat(source);
  if (!metadata.isFile()) throw new Error(`Arquivo público inválido: ${file}`);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}
console.log(`Cloudflare: ${publicFiles.length} arquivos públicos copiados para dist/.`);
