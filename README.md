# Morada — Explorador de imóveis

## Desktop com Tauri — primeiro protótipo

Na branch `feature/desktop`, execute `bun install` e `bun run desktop:dev` para abrir a aplicação em uma janela Tauri. Requer Bun, Rust/Cargo e as dependências de desenvolvimento do Tauri para seu sistema: https://v2.tauri.app/start/prerequisites/. O launcher também encontra o Cargo instalado em `~/.cargo/bin`.

O Tauri inicia automaticamente o servidor Bun na porta 1420 e aguarda sua disponibilidade. A versão web permanece disponível pelos comandos anteriores, na porta 8000. Fechar a janela encerra a sessão desktop. Os arquivos de imóveis, favoritos, mapa e estabelecimentos continuam nos caminhos atuais e não são removidos ou migrados.

Esta etapa valida a execução local; ainda não é uma distribuição independente. O servidor Bun e as ferramentas precisam estar instalados. A preparação de assets para build é uma cópia privada dos dados atuais em `desktop-dist/`, ignorada pelo Git, e o empacotamento está desativado. A versão de produção ainda precisa integrar a API de anúncios, o auxiliar Bun e o armazenamento próprio antes de ser distribuída. Não publique essa cópia com seus imóveis.

As anotações do navegador não são migradas automaticamente: o armazenamento da webview é separado. Exporte em “Minhas anotações” na versão web e importe na janela desktop se quiser transferi-las. Bibliotecas de CDN, fotos, vídeos e consulta de status continuam dependendo de internet.

O tema claro/escuro acompanha automaticamente a preferência do sistema operacional (`prefers-color-scheme`), inclusive quando ela muda com o site aberto. O mapa local usa o estilo correspondente do Protomaps; fotos e vídeos não são invertidos. Não há preferência manual salva no navegador.

## Cadastro por origem

`bun run add:imovel:viva-real "URL_DO_ANUNCIO"` abre Chrome visível, normaliza o anúncio com o scraper isolado, carrega estabelecimentos locais e acrescenta ao JSON com `origem: "viva-real"` e URL original. Requer Chrome instalado; o Bun resolve o pacote Playwright automaticamente. Anúncios existentes não são duplicados. Uma colisão de ID com outra origem é rejeitada para preservar favoritos e anotações. Bloqueios e falhas da extração preservam a lista. O cadastro antigo segue com `bun run add:imovel ID`, usando `origem: "quinto-andar"`.

O status do Viva Real representa o acesso ao anúncio verificado na importação, com data no tooltip, e não a disponibilidade garantida para locação. Não se abre Chrome automaticamente a cada minuto: a checagem periódica e a atualização de vídeos do QuintoAndar ignoram registros Viva Real. Os campos ausentes permanecem nulos.

## Anotações pessoais

“Anotar” em cada card abre um comentário com salvamento automático no localStorage (`morada.notes.v1`), separado do JSON da API. Texto vazio remove a anotação. “Minhas anotações” permite exportar/importar backup JSON versionado. Conflitos de texto exigem uma decisão antes de substituir; dados existentes são preservados por padrão. O armazenamento pertence à origem (protocolo, domínio e porta), normalmente sobrevive a reinícios, mas pode ser apagado pelo navegador. Exporte backups regularmente; o arquivo pode conter informações pessoais. Falhas de armazenamento são apresentadas na modal e não confirmadas como salvamento.

## Favoritos pessoais

Use `bun run favorito 893631548` para marcar, `bun run favorito 893631548 --remove` para desmarcar e `bun run favorito --list` para listar. Os IDs ficam em `favoritos.json`, separado dos dados do anúncio, com trava e gravação atômica. Recarregue a página para mostrar as estrelas douradas. Os favoritos sempre aparecem no topo, respeitando a ordenação escolhida dentro dos grupos de favoritos e demais imóveis. O checkbox “Somente favoritos” restringe a lista e o mapa aos favoritos. As estrelas são indicativas, não botões de gravação. Não depende de localStorage nem de endpoint de escrita.

## Base de estabelecimentos offline

Cada categoria aparece em um único chip com total e quantidade 24h. O total inclui os 24h. Nome/total e 24h são botões mutuamente exclusivos: ativar um desativa o outro; clicar no ativo oculta a categoria. Hospitais mostram somente contadores, sem controles de filtro.

Hospitais são extraídos por `amenity=hospital` ou `healthcare=hospital`, sem incluir clínicas automaticamente. Aparecem automaticamente nos estabelecimentos próximos ao selecionar um imóvel, em até 350 m. A seção “O que tem ao redor?” mostra contadores de Hospitais e Hospitais 24h, sem checkbox ou filtro próprio. Os horários são preservados como nas outras categorias; 24h só é confirmado por `opening_hours=24/7`. Isso não confirma a existência de pronto-socorro ou disponibilidade de atendimento. Hospitais não alteram o índice de caminhabilidade.

A base inclui também padarias (`shop=bakery`) e preserva `opening_hours` como `openingHours`. `is24Hours=true` confirma apenas a expressão explícita `24/7`; outras expressões ou horários ausentes ficam não confirmados (`null`). Os filtros 24h usam os mesmos estabelecimentos sem duplicar marcadores. Para mostrar somente 24h, desmarque o filtro geral da categoria. Padarias não alteram os pesos do índice de caminhabilidade. Os horários são um retrato do cadastro OSM, não confirmação em tempo real.

Medição local em 15/11/2026: PBF de 863.683.302 bytes, integridade conferida com o MD5 oficial; extração em 252 s; base final com 14.819 pontos e 1,54 MiB. Consulta dos 28 imóveis: 22,8 ms incluindo primeira leitura, média de 4,8 ms por lote com a base em memória (20 repetições, Bun). São tempos de consulta, sem incluir renderização do mapa ou download inicial.

Os scripts de inclusão e atualização consultam `estabelecimentos-locais.json`, sem rede. A base compacta é extraída do PBF Sudeste da Geofabrik, mantendo hospitais, padarias, academias, farmácias, mercados e parques na caixa geográfica longitude -47.2 a -46.0 / latitude -24.2 a -23.1 (capital e entorno). Imóveis fora dessa cobertura são rejeitados explicitamente. Centros de áreas usam o centro da caixa envolvente, não a entrada do estabelecimento.

Para reconstruir: crie um ambiente com `python3 -m venv .venv`, instale o leitor com `.venv/bin/pip install -r requirements-osm.txt` e execute `.venv/bin/python extrair-estabelecimentos.py dados/sudeste.osm.pbf`. Depois execute `bun run update:estabelecimentos --force`. O PBF não é versionado; a base compacta pode ser versionada. Fonte: https://download.geofabrik.de/south-america/brazil/sudeste.html · OpenStreetMap contributors, ODbL 1.0. A extração precisa percorrer o PBF e pode consumir memória; as consultas diárias usam somente o JSON compacto. As instruções históricas de fila/429 abaixo referem-se ao fluxo antigo Overpass; o fluxo offline não aplica essas esperas.

`bun run update:estabelecimentos` é incremental: ignora dados válidos para o raio e coordenadas atuais (inclusive resultados vazios). Use `bun run update:estabelecimentos --force` para refazer todos após regenerar a base. Cada sucesso é salvo imediatamente; não há espera entre consultas locais. O script mostra a porcentagem pendente e permite interromper com Ctrl+C. Falhas permanecem pendentes para a próxima execução.

Estabelecimentos são consultados antecipadamente com `bun run update:estabelecimentos` e salvos em `nearbyEstablishments` de cada imóvel (raio de 350 m). A interface lê somente esses dados locais. O cadastro por ID também tenta carregar os estabelecimentos; falhas ficam registradas para atualização posterior. “Atualizar região” relê os dados carregados na página; após atualizar o arquivo pelo terminal, recarregue a página.

`bun run update:videos` consulta as mídias de todos os imóveis com até cinco consultas simultâneas. Cada imóvel recebe `video` com `hasVideo` (true/false ou null se não confirmado), `items` (plataforma, ID, URL e estado de processamento), `checkedAt` e eventual `error`. Falhas preservam vídeos previamente conhecidos. Novos cadastros via `bun run add:imovel ID` consultam o vídeo automaticamente. O arquivo é gravado atomicamente, usando a mesma trava da inclusão por ID.

Para incluir um imóvel pelo ID completo: `bun run add:imovel 893877048`. Consulta o QuintoAndar e acrescenta os dados em `imoveis.json`, preservando os demais imóveis. IDs já cadastrados não são consultados nem alterados. Falhas de rede ou respostas inválidas preservam a lista. Recarregue a interface após a inclusão. O comando `gerar-imoveis.js` substitui a lista inteira; use o novo comando para inclusões individuais.

O mapa inclui as expansões cadastradas das linhas 2, 4, 6, 15 e 17, tracejadas. Cada linha pode ser ligada/desligada na legenda do mapa, incluindo seus trechos de expansão. A base classifica essas geometrias como `planned`, sem separar cada trecho em obra dos trechos futuros; por isso a interface usa “expansão prevista / em obras”. Projetos 19, 20 e 22 não são tratados como obras executadas.

A Linha 6–Laranja também é incluída: geometria marcada como `partial` na fonte aparece com indicação de operação parcial; trechos `planned` aparecem tracejados como previstos/em obras. O traçado reflete a classificação da base geográfica, não confirma a abertura de cada estação. Referência sobre a entrega parcial: https://agenciabrasil.ebc.com.br/geral/noticia/2026-07/linha-6-laranja-do-metro-de-sp-inicia-operacao-nesta-sexta-feira.

As linhas de metrô são servidas pelo Bun a partir de `metro.json`, sem consultar Overpass no navegador. O arquivo inclui seis linhas e 86 segmentos operacionais presentes no recorte da fonte (não inclui expansões planejadas). Fonte: https://github.com/roquerodrigo/transporte-sp, geometria da rede baseada em OpenStreetMap (ODbL). É um retrato dos dados da fonte, não uma indicação de funcionamento em tempo real. Para atualizar o arquivo, execute `bun run update:metro`; o download acontece apenas nessa atualização explícita.

Projeto **100% front-end**, feito com HTML, CSS e JavaScript moderno, sem framework, sem compilação, sem banco e sem chave de API. Exibe imóveis de um JSON local, permite ordenar por preço/disponibilidade, comparar imóveis num mapa e consultar estabelecimentos e rotas de metrô do OpenStreetMap.

![Mapas abertos](https://img.shields.io/badge/Mapa-OpenStreetMap-4B8B64) ![Licença do código](https://img.shields.io/badge/Código-MIT-blue)

## Como executar (mais simples)

1. Coloque o seu arquivo `imoveis.json` na raiz do projeto (ao lado de `index.html`).
2. Abra um terminal na pasta do projeto e execute:

   ```bash
   bun run dev
   ```

3. Abra **http://localhost:8000** no navegador.

O Bun reinicia o servidor automaticamente quando seu código muda. Atualize a página para ver alterações na interface. O servidor suporta HTTP Range para ler apenas os trechos necessários de `sao-paulo.pmtiles`, sem baixar os 99 MB a cada consulta. O mapa usa esse arquivo local; bibliotecas e consultas de estabelecimentos ainda precisam de internet. Use `bun start` para executar sem observar alterações.

> Não abra o HTML diretamente usando `file://`: o navegador normalmente bloqueia o `fetch()` de arquivos locais. Use um servidor HTTP como no exemplo.

Se `imoveis.json` não existir, a interface usa **`imoveis.exemplo.json`**, com **seis imóveis totalmente fictícios** em São Paulo para demonstração. Você também pode clicar em **Importar JSON** e selecionar um arquivo no navegador, sem copiá-lo para a pasta.

## Estrutura

```text
ap-viva-sp/
├── index.html             # interface
├── style.css              # responsividade e identidade visual
├── imoveis.exemplo.json   # demonstração fictícia
├── imoveis.json           # SEU arquivo real (adicionar aqui)
├── src/
│   ├── app.mjs            # UI, mapa, importação, filtros e chamadas de dados
│   ├── data.mjs           # normalização, preços, datas e ordenação
│   └── geo.mjs            # Overpass, metrô, estabelecimentos e índice
└── testes/
    └── projeto.test.mjs   # testes de dados e cálculos
```

## O que é aceito como `imoveis.json`?

O importador suporta:

- Array simples: `[{ "id": 123, "rentPrice": 2500, ... }]`;
- Objeto encapsulado: `{ "imoveis": [...] }`, `{ "properties": [...] }`, `{ "data": [...] }`, `{ "data": { "properties": [...] } }`;
- Objeto indexado por identificador: `{ "893877048": { ... }, "894920424": { ... } }`;
- Objetos aninhados com nomes de campos comuns do QuintoAndar.

**Exemplo mínimo:**

```json
[
  {
    "id": 893877048,
    "propertyType": "Apartamento",
    "street": "Rua Exemplo",
    "neighborhood": "Pinheiros",
    "city": "São Paulo",
    "state": "SP",
    "latitude": -23.5612,
    "longitude": -46.6962,
    "rentPrice": 3600,
    "condoFee": 700,
    "area": 60,
    "bedrooms": 2,
    "availableFrom": "2026-12-15"
  }
]
```

Os dados do exemplo acima são apenas ilustrativos. A interface tenta identificar variações de nomes, como `rent`, `rentPrice`, `salePrice`, `location.latitude`, `address.neighborhood`, `availableDate`, `possibleMovingDate`, `availabilityDate` etc. Entretanto, a estrutura do endpoint do QuintoAndar pode mudar: se o seu JSON tiver outros campos, adapte as listas de nomes em `src/data.mjs`.

Datas aceitas: `YYYY-MM-DD`, ISO 8601 ou `DD/MM/YYYY`. Se não houver data, o imóvel ficará **no fim** das ordenações por disponibilidade. Se houver `availabilityType: "IMMEDIATE"`, a disponibilidade será exibida como imediata. Quando houver apenas `daysToVacate`, a data calculada será **assinalada como previsão**.

Imóveis sem coordenadas ainda aparecem na lista, mas não podem ter índice calculado nem localização no mapa. A ferramenta **não inventa localização** e não tenta geocodificar endereços aproximados automaticamente.

## Funcionalidades

- Pesquisa por bairro, código, título ou endereço;
- Ordenação por menor preço, maior preço, disponibilidade mais próxima e mais distante;
- Seleção por card ou marcador no mapa;
- Camada de rotas de **metrô / VLT** (`route=subway` ou `route=light_rail`) com cores publicadas no OpenStreetMap; como alternativa, mostra trilhos cadastrados (`railway=subway` / `light_rail`);
- Estabelecimentos em **500 m em linha reta**: academias, farmácias, mercados e parques, com filtros por categoria;
- Índice próprio de caminhabilidade de 0 a 100, calculado sob demanda;
- Link para consultar o site oficial do Walk Score;
- Importação manual de JSON sem enviar o arquivo a um servidor próprio.

### Índice de caminhabilidade: não é o Walk Score oficial

A API oficial do **Walk Score** exige chave, integração via servidor, e documenta suporte a **Estados Unidos e Canadá** — portanto não foi integrada diretamente num front-end brasileiro. O botão **Calcular índice** calcula uma aproximação independente com dados públicos do OSM:

| Categoria | Peso |
| --- | ---: |
| Mercado | 35% |
| Parque | 25% |
| Farmácia | 20% |
| Academia | 20% |

Para cada categoria é considerada a distância em linha reta até o estabelecimento cadastrado mais próximo. Até **300 m** dá 100 pontos para a categoria; depois a pontuação cai linearmente até **0 a 1.500 m**. Categoria sem local mapeado recebe zero. A pontuação final é a média ponderada, arredondada para inteiro.

**Limitações importantes:** este índice **não mede distância real a pé**, calçadas, topografia, travessias, iluminação, segurança, tempo de caminhada, qualidade dos estabelecimentos nem cobertura incompleta do OpenStreetMap. Não equivale e não pode ser apresentado como o Walk Score oficial. O link externo apenas abre o site oficial para consulta, sem garantir pontuação para imóveis no Brasil.

Referências: [Walk Score API](https://www.walkscore.com/professional/api.php), [metodologia do Walk Score](https://www.walkscore.com/methodology).

## Fontes, custos e limites

| Componente | Tecnologia / serviço | Condição |
| --- | --- | --- |
| Mapa interativo | [Leaflet 1.9.4](https://leafletjs.com/) | Open source (BSD-2-Clause) via CDN |
| Mapa base | [OpenStreetMap Tiles](https://operations.osmfoundation.org/policies/tiles/) | Gratuito para uso leve, sujeito à política de uso; requer internet |
| Estabelecimentos e metrô | [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) | Servidores comunitários gratuitos, limitados, sujeitos a falhas e indisponibilidade |
| Caminhabilidade | Algoritmo local simples com dados OSM | Sem chave, não é Walk Score oficial |
| HTML / CSS / JS | Recursos nativos do navegador | Sem dependências de build |

O código é servido localmente, **mas o mapa e as consultas ao OpenStreetMap exigem acesso à internet**. As consultas Overpass são serializadas, limitadas por raio e com fallback de servidor. Mesmo assim, serviços públicos podem responder com timeout ou rate limit. Não use esse arranjo para produção com tráfego alto sem hospedar serviços próprios/usar provedores compatíveis com as licenças.

Dados de mapas: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). Respeite a atribuição e condições de uso. O Leaflet é de código aberto; a API oficial do Walk Score é proprietária e não foi copiada.

## Testes

Requer Node.js recente (apenas para rodar testes; **não** para executar o site):

```bash
node --test testes/projeto.test.mjs
```

## Personalizar

- Pesos, raio e regra do índice: `src/geo.mjs`;
- Nomes dos campos extraídos do JSON: `src/data.mjs`;
- Cores, fontes, cards e layout: `style.css`;
- Interface e comportamento: `index.html` e `src/app.mjs`.

## Licença

Código de exemplo do projeto: MIT (`LICENSE`). Dados e mapas de terceiros permanecem sujeitos às suas respectivas licenças e políticas.
