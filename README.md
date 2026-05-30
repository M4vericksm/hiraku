# Hiraku ひらく

> Biblioteca pessoal e leitor de mangás em PDF direto no navegador — sem servidor, sem nuvem.

Hiraku é uma aplicação web progressiva que transforma seus arquivos PDF de mangá em uma biblioteca organizada, com leitor completo e persistência 100% local. Nenhum dado sai do seu dispositivo.

## Funcionalidades

- **Biblioteca** — grade de capas com busca em tempo real, filtros (em andamento / concluído / não iniciado) e ordenação
- **Continuar Lendo** — acesso rápido aos últimos títulos abertos
- **Importação em lote** — arraste vários PDFs de uma só vez
- **Leitor versátil** — três modos: horizontal LTR, horizontal RTL (mangá japonês) e scroll vertical contínuo
- **Controles ricos** — zoom via Ctrl+scroll ou pinch, navegação por teclado e toque, barra de progresso clicável e fullscreen
- **Capítulos / bookmarks** — sidebar com índice de capítulos extraído automaticamente do PDF
- **Séries** — agrupe volumes e navegue entre eles em sequência
- **Metadados** — busque e edite título, autor, descrição e capa
- **Backup** — exporte e importe sua biblioteca completa em JSON
- **Tema** — alterne entre modo claro e escuro
- **Privacidade total** — armazenamento via `localStorage` e `IndexedDB`; zero requisições a servidores externos

## Stack

| Camada | Tecnologia |
|--------|------------|
| Framework | SvelteKit 2 |
| Linguagem | TypeScript |
| Estilo | Tailwind CSS |
| PDF Engine | PDF.js (pdfjs-dist) |
| Ícones | Lucide Svelte |
| Build | Vite |
| Testes | Vitest + Coverage |
| Linting | ESLint + Prettier |
| Deploy | GitHub Pages via GitHub Actions |

## Estrutura

```
src/
├── routes/
│   ├── +page.svelte          # Biblioteca principal
│   ├── +layout.svelte        # Layout global
│   ├── manga/[id]/           # Detalhes do mangá
│   ├── series/[id]/          # Detalhes de série
│   ├── reader/[id]/          # Leitor de PDF
│   └── settings/             # Configurações
└── lib/
    ├── components/
    │   ├── BulkImportModal.svelte      # Importação em lote
    │   ├── MetadataSearchModal.svelte  # Busca de metadados
    │   └── ThemeSwitcher.svelte        # Alternância de tema
    ├── services/
    │   ├── pdf.ts            # Renderização de páginas via PDF.js
    │   ├── persistence.ts    # IndexedDB — capas e file handles
    │   └── metadata.ts       # Parsing e busca de metadados
    ├── stores/
    │   └── manga.svelte.ts   # Estado global da biblioteca
    └── utils.ts
```

## Como rodar

**Pré-requisitos:** Node.js 20+ e npm.

```bash
# Instalar dependências
npm install

# Servidor de desenvolvimento
npm run dev
```

Acesse `http://localhost:5173`.

```bash
# Build de produção
npm run build

# Preview do build
npm run preview
```

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run preview` | Preview do build |
| `npm run check` | Verificação de tipos Svelte + TS |
| `npm run lint` | ESLint + Prettier check |
| `npm run format` | Formata o código |
| `npm run test` | Testes em modo watch |
| `npm run test:run` | Testes uma única vez |
| `npm run coverage` | Relatório de cobertura |

## Deploy

O deploy acontece automaticamente no **GitHub Pages** a cada push na branch `master`, via `.github/workflows/deploy.yml`. Para disparar manualmente, acesse **Actions → Deploy to GitHub Pages → Run workflow**.
