# Teste de acesso pelo Playwright MCP

Em 17/11/2026, o MCP oficial `@playwright/mcp@latest` foi instalado no cache npm e registrado globalmente no Codex como `playwright`, com o comando `npx -y @playwright/mcp@latest --isolated`.

O teste foi feito por um cliente MCP local via stdio, usando `initialize`, `tools/list`, `browser_navigate` e `browser_evaluate`. Navegador: Chrome com perfil isolado, sem cookies pessoais e sem técnicas de disfarce de automação. O navegador foi fechado após o teste.

Anúncio: https://www.vivareal.com.br/imovel/apartamento-2-quartos-consolacao-centro-sao-paulo-45m2-aluguel-RS2800-id-2909076148/?source=favorites

## Resultado observado

- Requisição HTTP direta: bloqueio 403.
- Chrome headless via MCP: bloqueio 403, “Sorry, you have been blocked”.
- Chrome visível via MCP: anúncio acessível, com dados lidos do DOM e scripts JSON-LD presentes.

Dados visíveis confirmados:

| Campo | Valor |
|---|---|
| ID | 2909076148 |
| Endereço | Rua Frei Caneca, 645 — Consolação, São Paulo/SP |
| Área | 45 m² |
| Quartos | 2 |
| Banheiros | 2 |
| Vagas | 0 |
| Aluguel | R$ 2.800/mês |
| Condomínio | R$ 735/mês |
| IPTU exibido | R$ 90 |
| Total exibido | R$ 3.625 |
| Galeria | 38 fotos |
| Aceita animais | Sim |

Esta prova confirma a possibilidade de ler dados pelo navegador visível nesse teste, mas não garante acesso headless ou continuidade de acesso futuro. Não houve integração com `imoveis.json`, alteração do scraper existente nem importação do anúncio. A normalização completa das fotos, coordenadas e demais campos ainda deve ser validada antes da integração.
