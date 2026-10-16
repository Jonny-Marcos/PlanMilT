# Instruções do projeto PlanMilT

## Contexto do projeto

PlanMilT é uma aplicação web de planejamento tático com mapa interativo. A interface usa Leaflet e bibliotecas JavaScript locais para desenho, camadas geográficas, importação/exportação KMZ, edição de imagens, elevação, cálculos de rádio e sequências de tarefas. O backend usa PHP e SQLite.

O idioma da interface e do conteúdo visível ao usuário é português. A instalação consiste em copiar/clonar todos os arquivos para um servidor WAMP/LAMP com Apache e PHP, com permissões e módulos necessários configurados. GitHub Pages não é suportado; seu workflow de publicação foi removido.

## Estado atual

- A aplicação atual tem duas interfaces: `index.html`, shell da aplicação principal, e `criador-tema.html`, editor de imagens sobre o mapa. `css/app.css` contém os estilos próprios principais; há folhas de estilo locais de terceiros em `css/`.
- O `main.js` legado tinha aproximadamente 4.000 linhas. Foi dividido por funcionalidade; o ponto de entrada atual é `js/features/main.js` (488 linhas), dentro da meta de 300–700 linhas. As outras funcionalidades continuam em scripts clássicos globais. A ordem das tags `<script>` em `index.html` é parte do contrato de execução: carregue bibliotecas primeiro, módulos que fornecem dependências em seguida e os consumidores depois. Não reordene sem verificar todos os usos.
- O código JavaScript próprio está em `js/features/`; as bibliotecas importadas estão em `js/library/`, incluindo a distribuição completa do TinyMCE em `js/library/tinymce/`. Os caminhos são referenciados diretamente pelos documentos HTML.
- A organização moveu o código próprio que antes ficava solto em `js/` para `js/features/` (`api-client.js`, `main.js`, `labels.js` e `qgis2web_expressions.js`) e separou as bibliotecas existentes em `js/library/`. Os scripts da aplicação extraídos de `main.js` também foram distribuídos por funcionalidade na pasta `features/`; consulte o inventário abaixo. Preserve avisos/licenças e não reescreva os arquivos de terceiros.
- `js/features/api-client.js` centraliza requisições HTTP, registra respostas bem-sucedidas e problemas de rede/HTTP/API no console do navegador, sem query strings, payloads ou conteúdo bruto de respostas. Use-o também para requisições que precisam interpretar a resposta manualmente.
- Os módulos em `js/features/` têm cabeçalho `@fileoverview` com finalidade e contexto. Funções/métodos nomeados têm documentação JSDoc de propósito e parâmetros; as 180 expressões `fnc_*` de `qgis2web_expressions.js` documentam o contrato `values`/`context`. Callbacks anônimos inline não são documentados individualmente para evitar comentários repetitivos.
- Todo o código PHP da aplicação está em `php/`: endpoints HTTP em `php/endpoints/`, bootstrap em `php/bootstrap.php`, serviços em `php/src/Application/` e infraestrutura em `php/src/Infrastructure/`. Não mantenha PHP da aplicação na raiz.
- As URLs legadas continuam funcionando por regras de rewrite no `.htaccess` da raiz; não existem adaptadores PHP na raiz. `php/.htaccess` bloqueia acesso direto ao bootstrap e às classes internas de `php/src/`, mas permite executar endpoints públicos.
- `php/bootstrap.php` carrega `php/src/Infrastructure/Database/ConnectionFactory.php` para criar a conexão SQLite. O bootstrap usa `PLANMILT_DB_PATH` (padrão `bd.db` na raiz); logs de execução da aplicação aparecem no console do navegador por meio dos resultados HTTP e do cliente JavaScript, sem gravar logs da aplicação em arquivos.
- `php/src/Infrastructure/Database/SchemaMigrator.php` aplica migrações SQLite versionadas por `PRAGMA user_version`: cria índices únicos, renomeia tabelas legadas e, na versão 3, cria `map_layers` e dez categorias de catálogo. Migrações preservam registros; duplicatas ou conflitos interrompem a operação sem exclusão automática. Teste isolado: `tests/php/schema-migrator.test.php`.
- `php/src/Application/TaskSequencesService.php` é o primeiro serviço de aplicação: concentra persistência e regras das ações de sequências (`save`, `load`, `getSequence`, `exists`, `delete`), recebe PDO por injeção e retorna os payloads usados pelo endpoint. `php/endpoints/task-sequences.php` mantém a tradução do POST `action` para o serviço.
- `php/src/Application/DrawingsService.php` concentra leitura/gravação na tabela `drawings` (`load`, `save`), valida hashes de senha e preserva o GeoJSON sem decodificá-lo. `php/endpoints/drawing-load.php` e `drawing-save.php` traduzem as requisições para o serviço; nomes portugueses dos campos HTTP permanecem temporariamente compatíveis.
- `php/src/Application/MapLayerCatalogService.php` importa o snapshot CSV, classifica camadas em dez categorias, mantém até dez recomendações por categoria e pesquisa todo o catálogo. Exclui serviços identificados como regionais e camadas explicitamente localizadas no Distrito Federal, Belo Horizonte ou Rio de Janeiro apenas das recomendações; continuam na busca global. `php/endpoints/map-layer-catalog.php` fornece categorias, filtro opcional `service_id` e busca textual com filtros avançados opcionais `category_code` e `year`; `tools/import-wms-layer-catalog.php` aplica a migração e importa o CSV.
- As recomendações por categoria excluem serviços de abrangência estadual/municipal (nome com sigla de UF entre parênteses, "estadual", "estado d…", "municipal" ou "prefeitura"), privilegiando bases nacionais como IBGE e ANA; esses SIGs continuam acessíveis pela busca e pela seleção direta. Ao selecionar um SIG, todas as camadas dele são listadas (sem limite de 10). Na lista de camadas do mapa, o nome é abreviado para 25 caracteres.
- Ao abrir o catálogo, o frontend usa apenas recomendações locais; ao selecionar um SIG específico, consulta o `GetCapabilities` daquele WMS, ordena pelo maior ano explícito anunciado e mostra até dez camadas; a busca filtra a resposta em memória, sem consultar os outros SIGs.
- `docs/api-contracts.md` registra contratos existentes entre frontend e endpoints, incluindo a migração piloto de `sigs.php`. Atualize-o quando contratos ou caminhos HTTP mudarem.
- O banco usa SQLite; tabelas e colunas atuais estão em inglês. A `SchemaMigrator` renomeia o esquema legado em transação, preservando os dados e índices existentes; nunca exclua tabela sem localizar consumidores e obter confirmação explícita. `created_at` e `updated_at` são os timestamps padrão nas tabelas de aplicação; preservar compatibilidade dos payloads HTTP até que seus consumidores sejam migrados.
- Há testes JavaScript em `tests/js/` executados com `node --test tests/js/*.test.js` e testes PHP isolados para sequências, desenhos, catálogo e migrações em `tests/php/`, incluindo `php tests/php/map-layer-catalog-service.test.php`. Node é ferramenta de desenvolvimento; ainda não há manifests npm/Composer nem runner geral de testes PHP.
- `tools/catalog-wms-layers.php` é uma ferramenta manual de levantamento: lê `sigs` ou `map_services` em modo somente leitura, consulta `GetCapabilities` e uma amostra limitada e diversificada de `GetFeatureInfo` (máximo 200, até 10 por serviço), priorizando o maior ano indicado entre camadas do mesmo tema; gera `storage/wms-layer-review.csv` e não atualiza o banco. O parser em `tools/WmsCapabilitiesParser.php` tem teste isolado em `tests/php/wms-capabilities-parser.test.php`.
- O snapshot não é populado automaticamente pela migração. Execute `tools/import-wms-layer-catalog.php` após gerar o CSV; o importador preserva revisões com `review_status = 'reviewed'` e recalcula no máximo dez posições recomendadas por categoria.

## Mapa dos arquivos da aplicação

### Frontend próprio: `js/features/`

Os arquivos seguintes são código da aplicação (não bibliotecas vendorizadas):

- Inicialização e mapa: `main.js` inicializa mapa, toolbar, cor e desenho; `map-setup.js` prepara camadas e controles; `map-layers.js` consulta/interpreta capacidades WMS; `map-tools.js` registra ferramentas de navegação; `map-popups.js` ajusta popups e limites de impressão; `labels.js` gerencia rótulos; `layer-management.js` gerencia camadas dinâmicas e consultas de feições; `shared-layers.js` carrega e compartilha camadas; `tactical-graphics-catalog.js` traduz o catálogo e exibe somente gráficos com simbologia geométrica distinta das primitivas nativas, além de separar os dez mais comuns; `tactical-graphics.js` oferece seletor com busca, filtro por seção e exemplo SVG, e liga o bundle local `@zaes/tactical-graphics` ao Leaflet Draw, atualizando uma prévia GeoJSON temporária ao mover o cursor; `help-and-planning.js` apresenta ajuda e envia sugestões de planejamento.
- Desenhos e intercâmbio: `drawing-geometry.js` contém geometria pura; `freehand-drawing.js` registra desenho livre; `drawing-storage.js` salva desenhos; `drawing-loading.js` carrega desenhos persistidos; `kmz-import.js` importa KMZ/KML; `kmz-export.js` converte para KML e gera KMZ.
- Imagens: `image-overlays.js` localiza imagens e as exibe como sobreposições.
- Elevação: `elevation-profile.js` fornece cálculos puros de amostragem e linha de visada; `elevation-tools.js` integra perfis e imagens georreferenciadas.
- Localização e rádio: `geolocation.js` controla rastreamento no mapa; `radio-planning.js` simula enlaces de rádio e visada ótica.
- Tarefas e sequências: `task-execution.js` executa tarefas e apresenta progresso; `task-parameters.js` monta/valida formulários; `task-terrain-analysis.js` analisa elevação; `task-icon-placement.js` posiciona ícones; `task-line-planning.js` cria linhas; `task-coverage-planning.js` planeja cobertura; `task-radio-links.js` verifica enlaces entre ícones; `task-radio-operations.js` estima lacunas em grade, verifica enlaces amostrados em rotas, sugere posições para repetidoras e compara os presets RF/óticos; `task-sequence-storage.js` persiste sequências; `task-sequence-editor.js` edita/reordena sequências; `task-sequence-controls.js` liga o controle de planejamento ao editor.
- A tarefa de lacunas aceita resolução desejada a partir de 10 m e pode ampliá-la automaticamente para respeitar limites de cálculo. A tarefa de repetidoras calcula o contorno de cobertura RF/ótica de cada unidade selecionada nas camadas de desenho e de sugestões em 72 radiais, ajustando a resolução para limitar a amostragem a 25 mil pontos por unidade; identifica as interseções e valida os locais candidatos com o serviço de enlaces. O usuário informa os tipos a cobrir, o ícone da repetidora, o preset RF/ótico, o alcance máximo, a altura comum das antenas, o máximo de posições (1–40) e a distância mínima entre elas. Os padrões de compatibilidade são dez posições e 500 m; distância mínima zero desativa a separação.
- O editor apresenta propósito, preparação e resultado esperado de cada tarefa; os seletores de tipos de ícone são limitados aos marcadores existentes na camada escolhida e mostram suas quantidades. As tarefas de enlace, lacunas de cobertura, comunicação em rota, sugestão de repetidoras e comparação de presets aceitam altura comum de antena que substitui as alturas TX/RX do preset nas duas pontas do enlace. Nas análises RF/óticas, ajuste o mapa para enquadrar a região de interesse antes de executar.
- Suporte à interface e exportação: `icon-selector.js` seleciona ícones; `api-client.js` centraliza HTTP e registra respostas e falhas no console do navegador; `qgis2web_expressions.js` fornece expressões usadas pelo exportador QGIS.

### Bibliotecas e assets

- `js/library/`: JavaScript de terceiros, incluindo Leaflet e plugins, Turf, Chart.js, JSZip, jQuery, Fabric, html2canvas, SweetAlert2, proj4, TinyMCE e o bundle local `tactical-graphics.min.js` (gerado por `npm run build:tactical-graphics` a partir de `@zaes/tactical-graphics`; exporta nomes e metadados de categorias). `js/library/tinymce/` contém a distribuição do TinyMCE e seus plugins/temas.
- `css/`: CSS da aplicação (`app.css`), folhas de estilo de terceiros, ícones/fontes e imagens usados pelos controles. Não editar ou substituir arquivos vendorizados como parte de uma mudança localizada no código próprio.
- `symbols/`: ícones de unidades e símbolos, consumidos pelo mapa e pelos endpoints de símbolos.
- `SRTM3/`: tiles de elevação utilizados pelos serviços de perfil/consulta de elevação.

### Backend PHP existente

Todo o PHP da aplicação fica em `php/`. Os endpoints públicos ficam em `php/endpoints/`; regras no `.htaccess` da raiz encaminham as URLs legadas sem manter scripts PHP adaptadores na raiz:

- `drawing-load.php` e `drawing-save.php`: carregam e persistem desenhos/planejamentos; as URLs antigas continuam funcionando por rewrite.
- `image-load.php` e `image-save.php`: listam/carregam imagens e persistem dados de imagem.
- `task-sequences.php`: operações de salvar, listar, obter, verificar e excluir sequências de tarefas.
- `map-layer-catalog.php`: recomendações categorizadas e busca textual global no catálogo de camadas WMS.
- `elevation-data.php`, `elevation-profile.php` e `elevation-upload.php`: consulta/amostragem de elevação e upload de arquivos/tiles de elevação.
- `sigs.php`: fornece a lista de SIGs/camadas ao frontend.
- `proxy.php`: proxy de requisições externas, incluindo uso por serviços de mapa; requer revisão cuidadosa de destinos, redirecionamentos, limites e protocolos.
- `icons.php`: fornece os ícones disponíveis em `symbols/`; a URL histórica `/symbols/icons.php` é reescrita para esse endpoint.
- `php/bootstrap.php`: carrega os serviços compartilhados.
- `php/src/Infrastructure/Database/ConnectionFactory.php`: conexão SQLite.
- `php/src/Infrastructure/Database/SchemaMigrator.php`: migrações versionadas para nomes ingleses, timestamps e índices únicos, sem exclusão automática de dados.
- `php/.htaccess`: bloqueia o bootstrap e as classes internas; endpoints permanecem públicos.

Os endpoints carregam `php/bootstrap.php` por caminho explícito e localizam `SRTM3/` a partir da raiz do projeto.

### Testes e documentação

- `tests/js/`: testes de regressão para cliente HTTP, geometria, perfil de elevação, desenho livre, geolocalização, seletor de ícones, exportação KMZ, WMS, configuração do mapa, planejamento de rádio, parâmetros e armazenamento de sequências.
- `docs/api-contracts.md`: inventário dos contratos HTTP existentes; use-o para orientar a migração PHP sem quebrar clientes.
- `.github/copilot-instructions.md`: este guia de arquitetura, estrutura, convenções e estado do trabalho.
- `php/src/Application/TaskSequencesService.php`: lógica de aplicação das sequências, independente da requisição HTTP.
- `php/src/Application/DrawingsService.php`: lógica de leitura e persistência de desenhos, independente da requisição HTTP.
- `tests/php/task-sequences-service.test.php` e `tests/php/drawings-service.test.php`: regressões dos serviços com SQLite em memória.

## Continuação da modularização e documentação PHP

As implementações estão organizadas em `php/`; regras de rewrite preservam as URLs legadas sem arquivos PHP de aplicação na raiz. `TaskSequencesService` e `DrawingsService` já foram extraídos para `php/src/Application/`. Continue refatorando os demais grupos e documente funções, parâmetros, entradas, saídas, erros e dependências. Antes de alterar contratos ou implementação:

1. Leia `docs/api-contracts.md`, os endpoints relevantes e seus chamadores em `js/features/`, `index.html` e `criador-tema.html`. Registre método HTTP, parâmetros, autenticação, formatos JSON, códigos de status, efeitos no SQLite e arquivos acessados.
2. Adicione ou preserve testes de regressão dos contratos e fluxos prioritários antes de reescrever implementação. Use os endpoints atuais como comportamento de referência, incluindo peculiaridades necessárias à compatibilidade.
3. Preserve as regras de rewrite da raiz enquanto clientes dependerem das URLs legadas. `php/endpoints/` são pontos de entrada públicos; `php/src/` e `php/bootstrap.php` devem permanecer inacessíveis diretamente via HTTP.
4. Garanta que endpoints carreguem `php/bootstrap.php` e resolvam `php/src/Infrastructure/`, banco, uploads e `SRTM3/` por caminhos/configuração explícitos, sem depender do diretório de trabalho do processo. Erros de aplicação devem ser retornados no contrato HTTP/JSON para que o frontend os registre no console; não crie arquivos de log da aplicação.
5. Documente o propósito de cada arquivo e de cada função PHP relevante, incluindo parâmetros, tipos, retorno/JSON, erros e efeitos colaterais. Mantenha comentários em português, nomes novos em inglês e PHP compatível com o runtime LAMP/XAMPP suportado.
6. Preserve SQLite e SQL parametrizado. Use inglês em tabelas/colunas do esquema migrado; preserve nomes de campos e formatos já usados nos contratos HTTP até migrar seus consumidores. Não faça uma migração para framework/ORM nem altere todos os endpoints de uma só vez.
7. Depois de cada conjunto, rode `php -l` nos arquivos PHP alterados, testes relevantes e verificações de caminhos/contratos. Atualize `docs/api-contracts.md`, este arquivo e o README quando o comportamento ou a instalação mudarem.

Trate esta seção como referência inicial. Confirme o estado real dos arquivos e chamadas antes de cada alteração.

## Padrão de UX para seletores em modal (SweetAlert2)

O acesso ao seletor de gráficos táticos é um controle Leaflet (`tactical-graphics.js` → `createControl`, ícone `fa-shield-alt`, título "Simbologia militar") posicionado em `topleft` logo abaixo do desenho à mão livre; `map-tools.js` o mostra/oculta junto com os demais controles. Não existe mais botão "Gráfico tático" na toolbar.

Referência: o catálogo "Adicionar camada" (`LAYER_CATALOG_STYLES` em `js/features/layer-management.js`) e o seletor de "Gráfico Tático" (`PICKER_STYLES` em `js/features/tactical-graphics.js`). Para criar outro seletor com a mesma aparência:

1. **Embuta os estilos no próprio modal**: constante de CSS em template string, injetada como `html: '<style>' + STYLES + '</style>' + ...`. Não dependa de `css/app.css` para o visual do modal: o navegador mantém CSS/JS em cache e o usuário vê um modal sem estilo (fontes serifadas, SVGs enormes). O `app.css` também tem regras globais de `.swal2-popup` (largura 90%, `select` com 100%, título 18px) que interferem.
2. **Escopo e prioridade**: prefixe tudo com o id do seletor (`#tacticalGraphicPicker …`) e use `customClass: { popup: 'meu-modal' }` com `.swal2-popup.meu-modal{width:min(820px,calc(100vw - 28px))!important;padding:20px!important}`. Use `!important` apenas na largura/padding do popup e no tamanho de SVGs.
3. **Estrutura**: filtros compactos no topo (rótulo 13px/600 acima de input/select de 40px, borda `#c5cad2`, raio 6px); lista rolável (`height:min(45vh,380px)`, borda `#d3d8e0`); uma linha por item (`<label>` com `display:flex`, `border-bottom:1px solid #e1e5eb`, hover `#f3f6fa`, selecionado `#e6edf7` + `box-shadow:inset 3px 0 0 #435f88`); títulos de seção sticky (12px, maiúsculas, fundo `#f4f6f9`); barra de resumo "Selecionado: …" no rodapé (`#eef1f5`).
4. **Linha**: controle à esquerda (radio ou checkbox 17px, `accent-color:#435f88`), nome 14px/600 e miniatura à direita em caixa fixa (64×40, `overflow:hidden`) com o SVG forçado a `60×36`. Miniaturas devem aparecer sem precisar selecionar o item.
5. **Cache**: sempre que mudar JS/CSS do modal, acrescente/atualize `?v=` na tag `<script>`/`<link>` de `index.html` e ajuste o teste que confere a versão (`tests/js/layer-management.test.js`).
6. **Testes**: o DOM falso de `tests/js/tactical-graphics.test.js` não tem `querySelector` nem `classList.toggle`; ao mudar a estrutura, mantenha os ids (`tacticalGraphicCategory`, `tacticalGraphicSearch`, `tacticalGraphicResults`, `tacticalGraphicSelection`) e atualize os índices de filhos.

## Direção arquitetural

Evoluir para um **monólito modular**, mantendo uma aplicação e uma implantação simples. Não iniciar uma reescrita total nem introduzir um framework ou ORM sem uma necessidade concreta.

Separar gradualmente os arquivos públicos, a lógica da aplicação e os dados persistidos. Uma possível estrutura de destino é:

```text
public/
  index.html
  theme-builder.html
  assets/
    css/
    js/
      main.js
      core/
      features/
        drawings/
        import-export/
        images/
        elevation/
        radio-planning/
        task-sequences/
        map-layers/
      services/
      vendor/
  api/
src/
  Http/
  Application/
  Domain/
  Infrastructure/
    Database/
storage/
  database/
tests/
```

Responsabilidades esperadas:

- `public/`: documentos, assets e pontos de entrada HTTP que precisam ser servidos pelo Apache.
- `public/api/`: possível organização futura de endpoints caso a estrutura `public/` seja adotada.
- `src/Application/`: casos de uso e coordenação das operações.
- `src/Domain/`: regras puras de domínio quando houver complexidade suficiente para justificar essa camada.
- `php/src/Infrastructure/Database/`: conexão SQLite e repositórios PDO.
- `storage/`: banco e arquivos gravados, sempre fora do webroot.
- `tests/`: testes unitários e de integração.

No frontend, dividir o JavaScript por funcionalidade e carregar um ponto de entrada, por exemplo `main.js`. Cada módulo deve receber explicitamente as dependências necessárias, como mapa, camadas e cliente HTTP; evite introduzir novos globais. Migre handlers inline para eventos registrados pelos módulos. Mantenha as bibliotecas atuais enquanto a aplicação é modularizada.

No backend, centralizar criação da conexão PDO, configuração, validação de entrada, serialização JSON e tratamento de erros. Manter SQLite e PDO inicialmente; não adicionar ORM por padrão. Uma rota consistente, como `/api/v1/drawings`, `/api/v1/images` e `/api/v1/task-sequences`, é um destino possível, não requisito para uma primeira alteração. Preserve temporariamente os endpoints e as URLs legadas enquanto os consumidores são migrados, mantendo a compatibilidade por rewrite no `.htaccess`, sem recriar adaptadores PHP na raiz.

**Próxima prioridade:** extrair e testar gradualmente os serviços de imagens e elevação, mantendo contratos e rewrites de compatibilidade. A estrutura `public/api/` e as rotas `/api/v1/...` acima são possibilidades futuras, ainda não adotadas; não as implemente sem solicitação explícita.

## Convenções de idioma e nomes

- Use inglês para novos nomes de arquivos, diretórios, rotas, variáveis, funções, métodos, classes e propriedades de dados novos.
- Preserve português nos textos da interface, mensagens destinadas ao usuário e comentários do código.
- Escreva comentários curtos que expliquem intenção, regra de negócio ou restrição; não repita literalmente o que a instrução seguinte já expressa.
- Em JavaScript, use `camelCase` para variáveis e funções e nomes de arquivo em `kebab-case`.
- Em PHP, use classes `PascalCase`, métodos e variáveis `camelCase`, namespaces coerentes e autoload PSR-4 quando a extração de classes começar.
- Não renomeie em massa endpoints, tabelas ou colunas existentes. Atualize consumidores e dados por migrações explícitas, com compatibilidade temporária quando necessário.
- Não misture refatoração de código próprio com atualizações de bibliotecas vendorizadas.

## Plano incremental de migração

### 1. Estabelecer uma base segura e verificável

- Manter a instalação WAMP/LAMP por cópia de todos os arquivos do repositório como método de implantação. As orientações devem contemplar Apache, PHP, extensões, permissões e configuração do servidor local, sem depender de empacotamento ou de infraestrutura adicional.
- Configurar o Apache para não servir `bd.db`, logs, `.git`, `.github`, configurações locais ou código interno. Sempre que possível, configure o document root para `public/`; caso a instalação mantenha a raiz do repositório no webroot, use regras Apache explícitas e documentadas para negar arquivos e diretórios internos.
- O `.htaccess` atual usa `mod_rewrite`, `Require` e `Options`; documente e verifique `mod_rewrite` e permissões Apache `AllowOverride` adequadas. Não remova nem torne condicionais as regras de proteção sem fornecer uma alternativa equivalente.
- Garantir que o usuário do Apache tenha escrita apenas nos arquivos/diretórios necessários, incluindo o SQLite e `SRTM3/`, sem permissões recursivas no repositório inteiro.
- O workflow do GitHub Pages foi removido; não recrie publicação estática sem uma nova decisão explícita.
- Preserve dados de banco e arquivos de usuário ao reorganizar o armazenamento. Não apague nem reescreva dados ou histórico automaticamente.
- Registrar os contratos atuais entre frontend e endpoints e criar testes de regressão para os fluxos prioritários antes de mudar suas implementações.
- Requerer uma versão PHP ainda suportada no servidor alvo e validar compatibilidade com a versão disponível no WAMP/LAMP.

### 2. Modularizar o frontend

- Extrair estilos embutidos para arquivos CSS próprios.
- Migrar o script principal por funcionalidade, mantendo a aplicação executável a cada etapa.
- Priorizar limites claros: desenho e camadas, importação/exportação, imagens, elevação, planejamento de rádio e sequências de tarefas.
- Centralizar chamadas HTTP em um cliente de API que normalize caminhos, JSON, status HTTP e erros.
- Substituir gradualmente estado global e handlers inline por dependências explícitas e listeners de eventos.
- Extrair lógica matemática e geoespacial pura para módulos testáveis sem DOM ou mapa.

### 3. Modularizar o backend

- Criar um bootstrap compartilhado para configuração, conexão PDO e respostas HTTP.
- Separar controladores, casos de uso e acesso ao banco sem criar abstrações sem benefício claro.
- Padronizar os endpoints para aceitar entradas validadas e responder JSON com códigos HTTP apropriados.
- Manter SQL parametrizado. Derivar caminhos do banco de configuração explícita, não do diretório de trabalho do processo.
- Retornar erros HTTP/JSON claros nos endpoints para que o frontend registre falhas no console do navegador; não criar arquivos de log da aplicação nem registrar payloads, credenciais ou query strings.

### 4. Consolidar contratos e qualidade

- Documentar métodos, parâmetros, formatos de sucesso e erro dos endpoints.
- Adicionar testes para validação de requisições, persistência SQLite e regras geoespaciais/de rádio relevantes.
- Adicionar verificações automatizadas compatíveis com as ferramentas adotadas, como `php -l`, testes PHP e lint JavaScript.
- Atualizar o README com instalação WAMP/LAMP, extensões, permissões, configuração do PHP no servidor, backup e comandos de validação.

## Segurança e operação

- Nunca disponibilize diretamente o arquivo SQLite, configurações ou logs internos do servidor por HTTP. Mesmo quando os dados não forem confidenciais, eles precisam de proteção contra alteração, exclusão, exposição acidental e perda.
- Não conceda permissões de escrita recursivas à aplicação inteira. Mantenha código somente para leitura pelo usuário do servidor web e limite escrita a `storage/`.
- Revise o proxy para restringir protocolos e destinos, validar redirecionamentos e definir limites de tempo e tamanho de resposta.
- Revise uploads com validação de nome e formato por allowlist, limite de quantidade/tamanho e controles de escrita no destino.
- Não exponha mensagens de exceção, caminhos locais ou configuração em respostas de produção.
- Coloque segredos e configuração específica do ambiente em variáveis de ambiente; não os registre no Git.
- Considere autenticação, autorização e proteção contra abuso segundo o modo real de publicação. Não presuma que um endpoint é privado apenas por usar SQLite.

## Orientações para mudanças futuras

- **Toda alteração de arquitetura deve constar neste `copilot-instructions.md`**, que é o principal documento para balizar o projeto. Registre aqui estrutura, caminhos, contratos e decisões no mesmo conjunto de mudanças que as introduz.
- **Toda alteração deve ter ao menos um teste correspondente em `tests/`** (`tests/js/` ou `tests/php/`) que cubra o comportamento alterado ou adicionado. Inclua o teste no mesmo conjunto de mudanças e execute-o antes de concluir.
- **Ao concluir cada conjunto de alterações, sugira uma mensagem profissional de commit sempre em português** no formato Conventional Commits (`tipo(escopo): descrição`), com tipo e descrição em português e escopo coerente com as mudanças. Não crie o commit sem solicitação explícita.
- O frontend chama `sigs.php` pelo caminho relativo `php/endpoints/sigs.php`, para funcionar quando o app estiver instalado em subdiretório; a URL legada `/sigs.php` continua reescrita no `.htaccess` por compatibilidade.
- Antes de remover ou renomear algo, localize todos os consumidores, endpoints, links, dados e dependências relacionados.
- Prefira alterações pequenas, orientadas a uma funcionalidade, e preserve o comportamento existente salvo requisito explícito em contrário.
- Não faça reformat, renomeação global ou limpeza de bibliotecas de terceiros como parte de uma mudança localizada.
- Em alterações de API ou banco, considere dados existentes e compatibilidade com versões já implantadas.
- Para cada mudança, rode primeiro o teste ou lint mais próximo da área alterada; depois execute as verificações adicionais relevantes.
- Atualize estas instruções e a documentação do projeto quando decisões arquiteturais forem efetivamente adotadas ou quando o estado descrito mudar.