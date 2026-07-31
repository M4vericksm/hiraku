# Hiraku Backend

Backend FastAPI para catalogo, fontes externas e leitura de capitulos por imagens.

O objetivo desta camada e manter o app Android simples: ele conversa com uma API
propria, enquanto o backend isola fontes, normalizacao, cache, sincronizacao e
downloads.

## Decisao inicial

Comecamos com uma fonte real e relativamente estavel: MangaDex, usando a API
publica em vez de scraping HTML. A arquitetura ja aceita multiplas fontes, mas
o sistema fica mais facil de validar com apenas uma no inicio.

## Estrutura

```text
backend/
├── app/
│   ├── api/routes.py             # endpoints HTTP
│   ├── core/config.py            # configuracoes
│   ├── domain/schemas.py         # modelos de entrada/saida
│   ├── services/catalog.py       # orquestracao + cache leve
│   └── sources/
│       ├── base.py               # contrato SourceAdapter
│       ├── registry.py           # registro de fontes
│       ├── normalization.py      # capitulos, titulos e ordenacao
│       └── mangadex.py           # adapter inicial
└── tests/
```

## Rodar localmente

```bash
cd backend
python -m uvicorn app.main:app --reload
```

Endpoints principais:

- `GET /health`
- `GET /sources`
- `GET /manga/search?q=one%20piece`
- `GET /manga/{source}/{source_manga_id}/chapters`
- `GET /chapters/{source}/{source_chapter_id}/pages`

## Proximas camadas

- Postgres para usuarios, biblioteca, progresso e downloads.
- Login com JWT.
- Jobs de sincronizacao com limite de frequencia por fonte.
- Cache persistente de paginas/capitulos com TTL e quota.
- App Android consumindo essa API.
