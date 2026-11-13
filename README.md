# Morada — Explorador de imóveis

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
