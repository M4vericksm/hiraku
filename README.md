# Hiraku ひらく

> Leitor de mangás com catálogo de fontes online e leitura offline no dispositivo.

O Hiraku é composto por um **backend FastAPI**, que isola as fontes externas
(scraping, APIs, normalização, proxy de imagens), e um **frontend SvelteKit**,
que consome essa API. A biblioteca, o progresso de leitura e os capítulos
baixados ficam apenas no dispositivo — o servidor só consulta as fontes e serve
as imagens.

Produção: https://m4vericksm.github.io/hiraku/

## Funcionalidades

- **Catálogo** — busca por fonte ou em todas as fontes disponíveis
- **Biblioteca** — grade de capas com busca, filtros (em andamento / concluído /
  não iniciado) e ordenação
- **Continuar Lendo** — retoma direto no último capítulo aberto
- **Leitor** — modos horizontal (LTR/RTL) e scroll vertical contínuo, com zoom
  por pinch/atalho, navegação por teclado e toque, e virada de página que avança
  para o próximo capítulo no limite
- **Download offline** — capítulos salvos no dispositivo via IndexedDB e lidos
  dentro do app sem rede
- **Progresso por capítulo** — posição salva automaticamente e marcação de lido
- **Gerenciamento de downloads** — tamanho ocupado, remoção individual e limpeza
  geral nas configurações
- **Temas** — Ink, Neon e Paper

## Stack

| Camada       | Tecnologia                              |
| ------------ | --------------------------------------- |
| Backend      | FastAPI + httpx + Pydantic v2           |
| Frontend     | SvelteKit 2 + Svelte 5 (runes)          |
| Estilização  | Tailwind CSS v4 + clsx + tailwind-merge |
| Ícones       | lucide-svelte                           |
| Testes       | pytest (backend) + Vitest/jsdom (front) |
| Persistência | localStorage + IndexedDB                |
| Deploy       | GitHub Actions + GitHub Pages           |

## Fontes

As fontes são adapters isolados, um módulo por fonte, atrás do contrato
`SourceAdapter`. Adicionar uma fonte não exige tocar no resto do sistema.

| Fonte      | Acesso        |
| ---------- | ------------- |
| MangaDex   | API pública   |
| MangaLivre | Scraping HTML |

## Proxy de imagens

Parte das fontes serve imagens sem cabeçalho CORS. Elas aparecem normalmente em
`<img>`, mas o `fetch()` usado no download offline é bloqueado pelo navegador.
Por isso o backend expõe `GET /image?url=…`, que:

- aceita apenas hosts de uma allowlist (fecha SSRF e uso como proxy aberto);
- envia o `Referer` esperado por cada fonte;
- limita a resposta a 20 MB.

O `CatalogService` reescreve para o proxy **apenas** as URLs que precisam — o
MangaDex já envia CORS, então suas imagens seguem diretas, sem salto extra.

## Estrutura

```text
backend/
├── app/
│   ├── api/routes.py        # endpoints HTTP
│   ├── core/config.py       # configuracoes
│   ├── domain/schemas.py    # modelos de entrada/saida
│   ├── services/
│   │   ├── catalog.py       # orquestracao + cache TTL
│   │   └── images.py        # allowlist e fetch do proxy
│   └── sources/
│       ├── base.py          # contrato SourceAdapter
│       ├── registry.py      # registro de fontes
│       ├── normalization.py # capitulos, titulos e ordenacao
│       ├── mangadex.py
│       └── mangalivre.py
└── tests/

src/
├── routes/
│   ├── +page.svelte                            # Biblioteca
│   ├── catalog/                                # Busca nas fontes
│   ├── manga/[source]/[id]/                    # Detalhe + capitulos
│   ├── reader/[source]/[id]/[chapter]/         # Leitor
│   └── settings/                               # Configuracoes + downloads
└── lib/
    ├── services/
    │   ├── api.ts          # cliente do backend
    │   └── offline.ts      # IndexedDB de paginas baixadas
    ├── stores/
    │   └── manga.svelte.ts # biblioteca reativa
    └── utils.ts
```

## Onde ficam os dados

| Dado               | Onde fica                                   |
| ------------------ | ------------------------------------------- |
| Biblioteca         | `localStorage`, chave `hiraku-library`      |
| Páginas baixadas   | `IndexedDB`, DB `hiraku-offline`            |
| Tema               | `localStorage`, chave `hiraku-theme`        |
| Catálogo e imagens | Consultados no backend, não são armazenados |

## Como rodar

**Pré-requisitos:** Node.js 20+ e Python 3.11+.

```bash
npm install
pip install -r backend/requirements.txt

# Frontend (5173) e backend (8000) juntos
npm run dev:all
```

Acesse `http://localhost:5173`. Para apontar o frontend a outro backend, defina
`VITE_API_BASE`.

## Scripts

| Comando            | Descrição                        |
| ------------------ | -------------------------------- |
| `npm run dev:all`  | Frontend + backend juntos        |
| `npm run dev`      | Só o frontend                    |
| `npm run dev:api`  | Só o backend                     |
| `npm run build`    | Build de produção                |
| `npm run preview`  | Preview do build                 |
| `npm run check`    | Verificação de tipos Svelte + TS |
| `npm run lint`     | ESLint + Prettier check          |
| `npm run format`   | Formata o código                 |
| `npm run test:run` | Testes do frontend               |
| `npm run coverage` | Relatório de cobertura           |

Testes do backend: `cd backend && python -m pytest`.

## Deploy

O frontend é publicado no **GitHub Pages** a cada push na `master`, via
`.github/workflows/deploy.yml`. O build usa `BASE_PATH=/hiraku` e o
`adapter-static` gera `404.html` como fallback de SPA. O backend precisa ser
hospedado à parte.

## Próximos passos

- Postgres para usuários, biblioteca, progresso e downloads.
- Login com JWT.
- Jobs de sincronização com limite de frequência por fonte.
- Cache persistente de páginas com TTL e quota.
- App Android consumindo essa API.

## Decisões importantes

- **Adapters isolados por fonte:** sites quebram, mudam URL e caem; o dano fica
  contido em um módulo.
- **Backend como intermediário:** mantém o cliente simples e resolve CORS,
  hotlink e normalização em um lugar só.
- **Proxy seletivo:** só passa pelo proxy quem precisa, evitando salto extra.
- **Downloads em IndexedDB:** capítulo salvo no dispositivo e lido no app, sem
  exportar arquivos.
- **Falhas de fonte como 502:** distingue "a fonte caiu" de "o Hiraku quebrou".
- **Svelte 5 runes:** estado explícito, sem stores legados.
