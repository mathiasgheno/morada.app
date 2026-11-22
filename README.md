# Morada — Explorador de imóveis

## Builds desktop de teste

Na branch `feature/desktop-builds`, `bun run desktop:build` gera os pacotes nativos do sistema atual. Requer Bun (versão em `.bun-version`), Rust/Cargo e os pré-requisitos do Tauri. `bun install --frozen-lockfile` instala as dependências. No macOS, use `bun run desktop:build --bundles app,dmg`; os resultados ficam em `src-tauri/target/release/bundle/`. O script requer runner nativo da arquitetura escolhida, porque inclui o executável Bun correspondente.

O aplicativo instalado inclui Bun, o servidor, Playwright (sem navegador), as bibliotecas da interface, metrô e a base compacta de estabelecimentos. Não inclui projetos pessoais, favoritos, notas, o mapa grande ou o PBF bruto. O VivaReal continua exigindo Google Chrome instalado; o aplicativo não baixa um navegador automaticamente. O mapa de São Paulo é baixado pelo launcher, com progresso, tamanho e SHA-256 verificados, a partir de uma revisão fixa do repositório público. Downloads incompletos não são usados; é possível tentar novamente.

O servidor escuta somente em `127.0.0.1`, em porta livre, com uma sessão aleatória exclusiva do aplicativo. É iniciado pelo desktop e encerrado ao sair; o serviço também verifica se o processo pai ainda existe. Se não puder iniciar, uma mensagem nativa explica que o HTTP local é necessário e indica o log `servidor.log` na pasta de dados. O app instalado começa sem projetos: importe seu backup pelo launcher. Os dados da cópia de desenvolvimento não são migrados automaticamente.

Pastas de dados do aplicativo instalado:

- macOS: `~/Library/Application Support/app.morada.desktop/`;
- Windows: `%APPDATA%\app.morada.desktop\`;
- Linux: `$XDG_DATA_HOME/app.morada.desktop/` (normalmente `~/.local/share/app.morada.desktop/`).

As pastas contêm `projetos/` e `recursos/`. O modo `desktop:dev` continua usando os projetos locais do repositório, com identidade de WebView separada (`app.morada.desktop.dev`).

A pipeline `.github/workflows/desktop-builds.yml` roda automaticamente nos pushes desta branch. Também define builds manuais por plataforma; o botão de execução manual passa a ficar disponível quando o workflow estiver na branch padrão do GitHub. Valida testes e gera DMGs para Apple Silicon/Intel, NSIS para Windows x64 e AppImage/DEB para Linux x64/ARM64. Os pacotes ficam como artefatos por 14 dias; não há publicação automática de release. Cada variante testa o runtime e a persistência em diretório temporário; no macOS, testa também o Bun já assinado dentro do `.app`. `bun desktop/smoke.mjs` executa essa validação após a preparação.

Estes são pacotes de teste: o macOS recebe assinatura ad hoc, sem notarização Apple, e o Windows ainda não usa Authenticode. Assinatura de distribuição, atualizações automáticas e release pública serão etapas posteriores.

## Índice automático de caminhabilidade

O índice é processado automaticamente ao adicionar imóveis do QuintoAndar ou VivaReal e ao atualizar seus estabelecimentos. O resultado fica em `walkability` no JSON: nota, categorias, raio de 300 m, coordenadas, origem e data dos dados utilizados. Mercados valem 35 pontos, parques 25, farmácias 20 e academias 20, pela presença de pelo menos um local da categoria em até 300 m em linha reta. Dados locais ausentes, com erro ou de outras coordenadas resultam em `null`, não zero.

Os cards e o painel abaixo do mapa mostram a nota automaticamente, sem botão de cálculo e sem nova consulta de rede. Caches antigos de estabelecimentos com raio de 350 m são aproveitados, filtrando os pontos fora dos 300 m; novos cadastros e consultas locais usam 300 m. `bun run update:caminhabilidade --project ID` preenche os índices de um conjunto existente sem consultar serviços externos. Ao abrir um JSON antigo, a interface calcula localmente os índices ainda não salvos.

A ordenação oferece maior e menor caminhabilidade, mantendo índices indisponíveis no fim e respeitando o toggle de favoritos no topo. Os toggles abaixo da ordenação ficam lado a lado quando há espaço e quebram de linha em listas estreitas.

## Projetos e launcher

O launcher oferece “Importar projeto” fora da lista e “Exportar” em cada card. Nas janelas de projeto, `File → Exportar projeto…` (`Cmd/Ctrl+Shift+E`) exporta o projeto ativo; anotações ainda em edição são salvas antes da exportação. No desktop, o diálogo nativo permite escolher o destino. Na web, o navegador baixa o arquivo.

O formato `.morada.json` tem `type: "morada-project"` e `version: 1`. Ele reúne a configuração do projeto, referência opcional, imóveis completos (incluindo anotações, scores, arquivados, status, vídeos, fotos por URL e estabelecimentos já consultados) e favoritos. Campos adicionais são preservados. O mapa e as bases gerais compartilhadas não são duplicados; o backup não baixa os arquivos de mídia dos anúncios. O limite é 50 MB. A importação valida o arquivo inteiro e sempre cria um novo ID, preservando projetos existentes. Rotas: `GET /api/projetos/ID/exportar` e `POST /api/projetos/importar`.

`bun run desktop:dev` abre o launcher em `/launcher.html`. “Novo projeto” cria uma busca vazia; “Duplicar” copia imóveis, favoritos e anotações para uma busca independente. “Configurar” permite alterar o nome e o ponto de referência, inclusive posicionando-o no mapa. São Paulo continua sendo a cidade fixa. No desktop, abrir um projeto cria uma janela própria; abrir o mesmo projeto novamente foca a janela existente. Fechar uma janela de projeto mantém o launcher aberto.

O launcher usa uma janela vertical de 460 × 760 e mantém o logo centralizado acima da lista. “Novo projeto” também está no menu nativo `Projeto`, com `Cmd+N` no macOS e `Ctrl+N` nos demais sistemas. O menu traz o launcher para frente (ou o recria se necessário) e abre o formulário sem interromper uma edição já aberta. Os ícones PNG, ICNS e ICO são derivados de `assets/morada-symbol.svg` com `bun run tauri icon assets/morada-symbol.svg`; o Tauri usa o ICNS no Dock durante o desenvolvimento no macOS.

Uma instalação nova abre o launcher vazio. Crie ou importe um projeto; não existe migração automática nem leitura de imóveis/favoritos na raiz. Projetos locais já existentes são preservados. Cada pasta `projetos/ID/` contém `projeto.json`, `imoveis.json` (incluindo notas e status) e `favoritos.json`. O mapa, metrô e base geral de estabelecimentos permanecem compartilhados. A pasta `projetos/` é ignorada pelo Git: use “Exportar” para guardar seus projetos.

A web em `/` (ou `/index.html`) redireciona para `/launcher.html`. Cada janela ou aba de projeto acessa `/projetos/ID/`, com leituras e gravações isoladas. Rotas antigas como `/api/anotacoes` e arquivos pessoais na raiz não são mais expostos. No desktop, `Projeto → Adicionar imóvel…` (`Cmd+I` / `Ctrl+I`) abre o cadastro na janela ativa. O nome aparece somente no título nativo.

Todos os scripts que leem ou alteram dados pessoais exigem `--project ID`, ou a variável `MORADA_PROJECT_ID`. Sem projeto, ou com ID inexistente, o comando falha antes de acessar os dados ou consultar anúncios. Consulte os IDs em `GET /api/projetos` ou nos nomes das pastas. Exemplos:

```bash
bun run add:imovel 894723967 --project ID
bun run add:imovel:viva-real "URL_DO_ANUNCIO" --project ID
bun run favorito 894723967 --project ID
bun run update:status --project ID
bun run update:videos --project ID
bun run update:estabelecimentos --project ID
bun run update:caminhabilidade --project ID
```

O gerador antigo com IDs pessoais fixos foi removido. Os arquivos pessoais legados (`imoveis.json`, `favoritos.json`, `imoveis-erros.json` e o gerador com IDs fixos) foram removidos também do histórico das branches locais, após validação da reimportação. O histórico de evolução do código foi preservado.

O servidor HTTP local escuta apenas em `127.0.0.1`. No aplicativo instalado, o desktop escolhe uma porta livre e inicia o Bun incluído no pacote; uma falha de inicialização é apresentada em diálogo nativo. No desenvolvimento, a porta continua sendo 1420.

No formulário de projeto, a cidade é fixa em “São Paulo, São Paulo”. Selecionar um ponto no mapa ou alterar suas coordenadas busca um endereço aproximado pela rota local `GET /api/endereco?lat=…&lng=…`, que consulta Photon/OpenStreetMap. A consulta depende de internet, usa fila de uma requisição por segundo e cache em memória. Respostas antigas não sobrescrevem uma seleção nova nem uma edição manual. O servidor do geocodificador pode ser trocado por `MORADA_GEOCODER_URL`. Abrir o seletor de mapa preserva o endereço existente; o preenchimento automático ocorre ao escolher uma localização. Fonte e condições do serviço: https://github.com/komoot/photon.

O ponto de referência é opcional. Novos projetos começam sem referência; marque “Definir ponto de referência” para configurar uma, ou faça isso depois em “Configurar”. Sem referência, não há marcador de trabalho nem ordenação por distância; o mapa enquadra apenas os imóveis. Projetos existentes preservam sua referência.

“Excluir” no card do launcher pede confirmação com o nome do projeto, fecha sua janela e o remove da lista. Os arquivos são movidos para `projetos/.lixeira/`, sem apagar dados compartilhados. “Desfazer” restaura a última exclusão durante a sessão do launcher. Projetos com atualização em andamento não são excluídos até a liberação das travas.

## Desktop com Tauri — desenvolvimento

Na branch `feature/desktop`, execute `bun install` e `bun run desktop:dev` para abrir a aplicação em uma janela Tauri. Requer Bun, Rust/Cargo e as dependências de desenvolvimento do Tauri para seu sistema: https://v2.tauri.app/start/prerequisites/. O launcher também encontra o Cargo instalado em `~/.cargo/bin`.

O Tauri inicia automaticamente o servidor Bun na porta 1420 e aguarda sua disponibilidade. A versão web permanece disponível pelos comandos anteriores, na porta 8000. Fechar a janela encerra a sessão desktop. Os dados pessoais ficam exclusivamente nas pastas de projetos, compartilhadas pela web e pelo desktop.

Para desenvolver, Bun e as ferramentas de build precisam estar instalados. Para o usuário final, os pacotes de teste descritos no início incluem o Bun e o servidor. `desktop/prepare.mjs` monta os recursos em `desktop-resources/` e o binário auxiliar em `src-tauri/binaries/`, sem dados pessoais. Esses diretórios e `desktop-dist/` são ignorados pelo Git.

As anotações agora ficam em `note: { text, updatedAt }` em cada registro do `imoveis.json`, compartilhadas entre web e desktop. A edição salva automaticamente no arquivo pelo servidor Bun, com trava e gravação atômica, preservando outros campos. A interface só informa que salvou após a confirmação do servidor. O botão “Minhas anotações” continua exportando/importando o formato de backup anterior; IDs ausentes são rejeitados sem gravação parcial. Dados antigos no localStorage não são apagados nem importados automaticamente. Fotos, vídeos e consulta de status continuam dependendo de internet; as bibliotecas da interface são locais.

O menu nativo `View → Visual` oferece `Light`, `Dark` e `Sistema` (padrão). A escolha visual é lembrada no localStorage da origem, compartilhada entre suas janelas; as anotações continuam exclusivamente no JSON. Em Sistema, mudanças do sistema operacional são acompanhadas automaticamente. Launcher, projetos e mapas seguem o tema escolhido, com transição de cores de 180 ms e respeito a movimento reduzido; fotos e vídeos não são invertidos.

A interface bloqueia seleção de texto, preservando a edição e seleção nos inputs e textareas. O botão ao lado do ID copia somente o identificador. Anotar, vídeo, anúncio e arquivamento ficam na parte inferior do card. “Arquivar” grava `archived` e `archivedAt` no JSON do projeto; “Desarquivar” reverte esse estado. O toggle “Exibir arquivados” começa desligado e inclui os arquivados na lista e no mapa, respeitando os demais filtros. A rota local `PUT /api/arquivamento` (também sob `/projetos/ID/`) recebe `{ id, archived }` e preserva os outros campos com trava e gravação atômica.

## Cadastro por origem

`bun run update:status --project ID` consulta os anúncios do QuintoAndar (até 5 em paralelo) e grava `statusAnuncio` no `imoveis.json`. O cadastro `add:imovel` inclui esse campo automaticamente. Ele contém `status` (`active`, `inactive` ou `unknown`), `checkedAt`, `lastAttemptAt`, `method` e `error`. HTTP 404/410 confirma indisponibilidade; acesso HTTP 200 à página do imóvel confirma anúncio acessível, não garantia de locação. Falhas de rede, bloqueios e respostas não conclusivas preservam o último status confirmado.

Na abertura, os cards usam imediatamente os status salvos no JSON. A interface consulta o servidor em segundo plano a cada minuto, sem polling de 2 segundos; o servidor consulta apenas os registros cuja última tentativa tem pelo menos um minuto e persiste os resultados com trava e gravação atômica. A execução manual de `update:status` força uma nova consulta. O VivaReal mantém seu status da importação, sem consultas automáticas ao QuintoAndar.

`bun run add:imovel:viva-real "URL_DO_ANUNCIO" --project ID` abre Chrome visível, normaliza o anúncio com o scraper isolado, carrega estabelecimentos locais e acrescenta ao JSON com `origem: "viva-real"` e URL original. Requer Chrome instalado; o Bun resolve o pacote Playwright automaticamente. Anúncios existentes não são duplicados. Uma colisão de ID com outra origem é rejeitada para preservar favoritos e anotações. Bloqueios e falhas da extração preservam a lista. O cadastro antigo segue com `bun run add:imovel ID_DO_IMOVEL --project ID_DO_PROJETO`, usando `origem: "quinto-andar"`.

O status do Viva Real representa o acesso ao anúncio verificado na importação, com data no tooltip, e não a disponibilidade garantida para locação. Não se abre Chrome automaticamente a cada minuto: a checagem periódica e a atualização de vídeos do QuintoAndar ignoram registros Viva Real. Os campos ausentes permanecem nulos.

## Anotações pessoais

“Anotar” em cada card abre um comentário com salvamento automático no campo `note` do imóvel em `imoveis.json`. Texto vazio remove a anotação. “Minhas anotações” permite exportar/importar o backup JSON versionado existente. Conflitos de texto exigem uma decisão antes de substituir; dados existentes são preservados por padrão. O arquivo completo de imóveis também inclui as anotações. Falhas de gravação são apresentadas na modal, que só fecha após confirmar o salvamento. O localStorage não é mais usado para novas anotações.

## Favoritos pessoais

Use `bun run favorito 893631548 --project ID` para marcar, `bun run favorito 893631548 --remove --project ID` para desmarcar e `bun run favorito --list --project ID` para listar. Os IDs ficam em `favoritos.json`, separado dos dados do anúncio, com trava e gravação atômica. Recarregue a página para mostrar as estrelas douradas. Os favoritos sempre aparecem no topo, respeitando a ordenação escolhida dentro dos grupos de favoritos e demais imóveis. O checkbox “Somente favoritos” restringe a lista e o mapa aos favoritos. As estrelas são indicativas, não botões de gravação. Não depende de localStorage nem de endpoint de escrita.

## Base de estabelecimentos offline

Cada categoria aparece em um único chip com total e quantidade 24h. O total inclui os 24h. Nome/total e 24h são botões mutuamente exclusivos: ativar um desativa o outro; clicar no ativo oculta a categoria. Hospitais mostram somente contadores, sem controles de filtro.

Hospitais são extraídos por `amenity=hospital` ou `healthcare=hospital`, sem incluir clínicas automaticamente. Aparecem automaticamente nos estabelecimentos próximos ao selecionar um imóvel, em até 300 m. A seção “O que tem ao redor?” mostra contadores de Hospitais e Hospitais 24h, sem checkbox ou filtro próprio. Os horários são preservados como nas outras categorias; 24h só é confirmado por `opening_hours=24/7`. Isso não confirma a existência de pronto-socorro ou disponibilidade de atendimento. Hospitais não alteram o índice de caminhabilidade.

A base inclui também padarias (`shop=bakery`) e preserva `opening_hours` como `openingHours`. `is24Hours=true` confirma apenas a expressão explícita `24/7`; outras expressões ou horários ausentes ficam não confirmados (`null`). Os filtros 24h usam os mesmos estabelecimentos sem duplicar marcadores. Para mostrar somente 24h, desmarque o filtro geral da categoria. Padarias não alteram os pesos do índice de caminhabilidade. Os horários são um retrato do cadastro OSM, não confirmação em tempo real.

Medição local em 15/11/2026: PBF de 863.683.302 bytes, integridade conferida com o MD5 oficial; extração em 252 s; base final com 14.819 pontos e 1,54 MiB. Consulta dos 28 imóveis: 22,8 ms incluindo primeira leitura, média de 4,8 ms por lote com a base em memória (20 repetições, Bun). São tempos de consulta, sem incluir renderização do mapa ou download inicial.

Os scripts de inclusão e atualização consultam `estabelecimentos-locais.json`, sem rede. A base compacta é extraída do PBF Sudeste da Geofabrik, mantendo hospitais, padarias, academias, farmácias, mercados e parques na caixa geográfica longitude -47.2 a -46.0 / latitude -24.2 a -23.1 (capital e entorno). Imóveis fora dessa cobertura são rejeitados explicitamente. Centros de áreas usam o centro da caixa envolvente, não a entrada do estabelecimento.

Para reconstruir: crie um ambiente com `python3 -m venv .venv`, instale o leitor com `.venv/bin/pip install -r requirements-osm.txt` e execute `.venv/bin/python extrair-estabelecimentos.py dados/sudeste.osm.pbf`. Depois execute `bun run update:estabelecimentos --force --project ID`. O PBF não é versionado; a base compacta pode ser versionada. Fonte: https://download.geofabrik.de/south-america/brazil/sudeste.html · OpenStreetMap contributors, ODbL 1.0. A extração precisa percorrer o PBF e pode consumir memória; as consultas diárias usam somente o JSON compacto. As instruções históricas de fila/429 abaixo referem-se ao fluxo antigo Overpass; o fluxo offline não aplica essas esperas.

`bun run update:estabelecimentos --project ID` é incremental: ignora dados válidos para o raio e coordenadas atuais (inclusive resultados vazios). Use `bun run update:estabelecimentos --force --project ID` para refazer todos após regenerar a base. Cada sucesso é salvo imediatamente; não há espera entre consultas locais. O script mostra a porcentagem pendente e permite interromper com Ctrl+C. Falhas permanecem pendentes para a próxima execução.

Estabelecimentos são consultados antecipadamente com `bun run update:estabelecimentos --project ID` e salvos em `nearbyEstablishments` de cada imóvel (raio de 300 m). A interface lê somente esses dados locais, aproveitando também caches anteriores de 350 m e filtrando os excedentes. O cadastro por ID também tenta carregar os estabelecimentos; falhas ficam registradas para atualização posterior. “Atualizar região” relê os dados carregados na página; após atualizar o arquivo pelo terminal, recarregue a página.

`bun run update:videos --project ID` consulta as mídias de todos os imóveis com até cinco consultas simultâneas. Cada imóvel recebe `video` com `hasVideo` (true/false ou null se não confirmado), `items` (plataforma, ID, URL e estado de processamento), `checkedAt` e eventual `error`. Falhas preservam vídeos previamente conhecidos. Novos cadastros via `bun run add:imovel ID_DO_IMOVEL --project ID_DO_PROJETO` consultam o vídeo automaticamente. O arquivo é gravado atomicamente, usando a mesma trava da inclusão por ID.

Para incluir um imóvel pelo ID completo: `bun run add:imovel 893877048 --project ID`. Consulta o QuintoAndar e acrescenta os dados em `imoveis.json`, preservando os demais imóveis. IDs já cadastrados não são consultados nem alterados. Falhas de rede ou respostas inválidas preservam a lista. Recarregue a interface após a inclusão. Use o cadastro individual no projeto escolhido.

O mapa inclui as expansões cadastradas das linhas 2, 4, 6, 15 e 17, tracejadas. Cada linha pode ser ligada/desligada na legenda do mapa, incluindo seus trechos de expansão. A base classifica essas geometrias como `planned`, sem separar cada trecho em obra dos trechos futuros; por isso a interface usa “expansão prevista / em obras”. Projetos 19, 20 e 22 não são tratados como obras executadas.

A Linha 6–Laranja também é incluída: geometria marcada como `partial` na fonte aparece com indicação de operação parcial; trechos `planned` aparecem tracejados como previstos/em obras. O traçado reflete a classificação da base geográfica, não confirma a abertura de cada estação. Referência sobre a entrega parcial: https://agenciabrasil.ebc.com.br/geral/noticia/2026-07/linha-6-laranja-do-metro-de-sp-inicia-operacao-nesta-sexta-feira.

As linhas de metrô são servidas pelo Bun a partir de `metro.json`, sem consultar Overpass no navegador. O arquivo inclui seis linhas e 86 segmentos operacionais presentes no recorte da fonte (não inclui expansões planejadas). Fonte: https://github.com/roquerodrigo/transporte-sp, geometria da rede baseada em OpenStreetMap (ODbL). É um retrato dos dados da fonte, não uma indicação de funcionamento em tempo real. Para atualizar o arquivo, execute `bun run update:metro`; o download acontece apenas nessa atualização explícita.

## Como executar na web

Execute `bun install` e `bun run dev`, depois abra **http://localhost:8000**. O launcher permite criar ou importar um projeto e abri-lo em outra aba. `bun start` executa sem observar alterações. Não abra os arquivos diretamente com `file://`: a aplicação usa as APIs do servidor Bun.

O servidor suporta HTTP Range para ler somente os trechos necessários do mapa local de 99 MB. Fotos, vídeos, cadastro de anúncios, geocodificação e atualização de status dependem de internet; a consulta aos estabelecimentos já processados é local.

## Estrutura

```text
ap-viva-sp/
├── launcher.html          # entrada e gerenciamento de projetos
├── index.html             # interface de um projeto
├── projetos/ID/           # dados pessoais locais, ignorados pelo Git
│   ├── projeto.json
│   ├── imoveis.json
│   └── favoritos.json
├── server.ts              # HTTP local e APIs por projeto
├── sao-paulo.pmtiles      # mapa compartilhado
├── estabelecimentos-locais.json
├── metro.json
├── src/
└── testes/
```

O arquivo `imoveis.exemplo.json` é apenas uma referência fictícia de formato; não é carregado automaticamente. Para transportar dados, use o backup completo `.morada.json`, preservando configuração, favoritos, notas e os demais campos dos imóveis.

### Índice de caminhabilidade: não é o Walk Score oficial

“Consultar Walk Score” abre o link externo no navegador padrão do sistema pelo Tauri. Na versão web, mantém a abertura normal em nova aba. Essa ação apenas consulta o site externo; o índice calculado localmente continua independente.

O índice é uma aproximação independente com dados públicos do OSM, calculada automaticamente:

| Categoria | Peso |
| --- | ---: |
| Mercado | 35% |
| Parque | 25% |
| Farmácia | 20% |
| Academia | 20% |

Cada categoria pontua somente quando há ao menos um estabelecimento em até **300 m**, em linha reta. Categoria sem local mapeado dentro desse raio recebe zero. A nota soma as contribuições ponderadas das quatro categorias. Sem uma base local válida, o índice fica indisponível.

**Limitações importantes:** este índice **não mede distância real a pé**, calçadas, topografia, travessias, iluminação, segurança, tempo de caminhada, qualidade dos estabelecimentos nem cobertura incompleta do OpenStreetMap. Não equivale e não pode ser apresentado como o Walk Score oficial. O link externo apenas abre o site oficial para consulta, sem garantir pontuação para imóveis no Brasil.

Referências: [Walk Score API](https://www.walkscore.com/professional/api.php), [metodologia do Walk Score](https://www.walkscore.com/methodology).

## Fontes, custos e limites

| Componente | Tecnologia / serviço | Condição |
| --- | --- | --- |
| Mapa interativo | [Leaflet 1.9.4](https://leafletjs.com/) | Open source (BSD-2-Clause), incluído localmente |
| Mapa base | PMTiles local / Protomaps | Arquivo compartilhado, leitura parcial por HTTP Range |
| Estabelecimentos e metrô | Bases locais derivadas do OpenStreetMap | Compartilhadas pelos projetos, sem consulta por seleção |
| Caminhabilidade | Algoritmo local simples com dados OSM | Sem chave, não é Walk Score oficial |
| HTML / CSS / JS | Recursos nativos do navegador | Sem dependências de build |

O código, o mapa e os dados de estabelecimentos são servidos localmente. Os recursos externos descritos acima continuam exigindo internet.

Dados de mapas: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). Respeite a atribuição e condições de uso. O Leaflet é de código aberto; a API oficial do Walk Score é proprietária e não foi copiada.

## Testes

Requer Node.js recente (apenas para rodar testes; **não** para executar o site):

```bash
npm test
```

## Personalizar

- Pesos, raio e regra do índice: `src/geo.mjs`;
- Nomes dos campos extraídos do JSON: `src/data.mjs`;
- Cores, fontes, cards e layout: `style.css`;
- Interface e comportamento: `index.html` e `src/app.mjs`.

## Licença

Código de exemplo do projeto: MIT (`LICENSE`). Dados e mapas de terceiros permanecem sujeitos às suas respectivas licenças e políticas.
