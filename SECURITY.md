# Segurança

## Como reportar uma vulnerabilidade

Não abra issue pública. Use **Security → Report a vulnerability** neste
repositório (aviso privado do GitHub). Inclua o que conseguiu fazer, os passos
para reproduzir e o impacto que você enxerga.

Respondo assim que possível e aviso quando a correção estiver no ar.

## Escopo

- API: `https://hiraku-api.yoopix.com.br`
- Frontend: `https://m4vericksm.github.io/hiraku/`

Fora do escopo: os sites das fontes (scans), ataques de negação de serviço por
volume e testes que gerem carga alta na API.

## O que já está em vigor

- Proxy de imagens com allowlist de hosts, bloqueio de rede interna e de SVG,
  limite de tamanho e resposta com CSP `sandbox`.
- Limite de requisições por IP e de bytes no proxy.
- API em container sem root, rootfs somente leitura, rede e túnel próprios.
- Testes, lint e auditoria de dependências em todo PR; Dependabot semanal.
