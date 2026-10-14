# Instruções do projeto PlanMilT

## Contexto do projeto

PlanMilT é uma aplicação web de planejamento tático com mapa interativo. A interface usa Leaflet e bibliotecas JavaScript locais para desenho, camadas geográficas, importação/exportação KMZ, edição de imagens, elevação, cálculos de rádio e sequências de tarefas. O backend usa PHP e SQLite.

O idioma da interface e do conteúdo visível ao usuário é português. A instalação oficial consiste em copiar/clonar o repositório para um servidor LAMP ou XAMPP já configurado com Apache e PHP. Docker é experimental e serve para desenvolvimento/aprendizado. GitHub Pages não é suportado; seu workflow de publicação foi removido.

## Estado atual

- A aplicação atual tem duas interfaces: `index.html`, shell da aplicação principal, e `criador-tema.html`, editor de imagens sobre o mapa. `css/app.css` contém os estilos próprios principais; há folhas de estilo locais de terceiros em `css/`.
- O `main.js` legado tinha aproximadamente 4.000 linhas. Foi dividido por funcionalidade; o ponto de entrada atual é `js/features/main.js` (488 linhas), dentro da meta de 300–700 linhas. As outras funcionalidades continuam em scripts clássicos globais. A ordem das tags `<script>` em `index.html` é parte do contrato de execução: carregue bibliotecas primeiro, módulos que fornecem dependências em seguida e os consumidores depois. Não reordene sem verificar todos os usos.
- O código JavaScript próprio está em `js/features/`; as bibliotecas importadas estão em `js/library/`, incluindo a distribuição completa do TinyMCE em `js/library/tinymce/`. Os caminhos são referenciados diretamente pelos documentos HTML.
- A organização moveu o código próprio que antes ficava solto em `js/` para `js/features/` (`api-client.js`, `main.js`, `labels.js` e `qgis2web_expressions.js`) e separou as bibliotecas existentes em `js/library/`. Os scripts da aplicação extraídos de `main.js` também foram distribuídos por funcionalidade na pasta `features/`; consulte o inventário abaixo. Preserve avisos/licenças e não reescreva os arquivos de terceiros.
- `js/features/api-client.js` centraliza requisições JSON/texto e registra erros de rede, HTTP/API e JSON inválido no console. Os registros indicam método, endpoint sem query string e status disponível, sem payloads nem conteúdo bruto de respostas.
- Os módulos em `js/features/` têm cabeçalho `@fileoverview` com finalidade e contexto. Funções/métodos nomeados têm documentação JSDoc de propósito e parâmetros; as 180 expressões `fnc_*` de `qgis2web_expressions.js` documentam o contrato `values`/`context`. Callbacks anônimos inline não são documentados individualmente para evitar comentários repetitivos.
- As implementações dos endpoints PHP ficam em `php/endpoints/`; os arquivos históricos da raiz e `symbols/icons.php` são adaptadores finos que preservam as URLs já usadas pelos clientes. `php/.htaccess` bloqueia acesso HTTP direto às implementações.
- `bootstrap.php` carrega os serviços PHP compartilhados em `src/Infrastructure/`: `Database/ConnectionFactory.php` cria a conexão SQLite; `Logging/Logger.php` fornece logging. O bootstrap usa `PLANMILT_DB_PATH` (padrão `bd.db` na raiz) e `PLANMILT_LOG_DIR` (padrão diretório temporário do sistema). O Docker experimental coloca as classes em `/var/www/planmilt/src`, fora do document root, e monta o banco em `/var/lib/planmilt/bd.db`.
- `php/src/Application/TaskSequencesService.php` é o primeiro serviço de aplicação: concentra persistência e regras das ações de sequências (`save`, `load`, `getSequence`, `exists`, `delete`), recebe PDO e logger por injeção e retorna os payloads usados pelo endpoint legado. `php/endpoints/tasks.php` mantém a tradução do POST `action` para o serviço.
- `docs/api-contracts.md` registra contratos existentes entre frontend e endpoints, incluindo a migração piloto de `get_sigs.php`. Atualize-o quando contratos ou caminhos HTTP mudarem.
- O banco SQLite tem tabelas e campos históricos em português e inglês. Preservar compatibilidade com dados implantados é requisito; não apagar, recriar ou renomear dados automaticamente.
- Há testes JavaScript em `tests/js/` executados com `node --test tests/js/*.test.js` (última validação do frontend: 40/40) e um teste PHP isolado de sequências em `tests/php/task-sequences-service.test.php`, executado com `php tests/php/task-sequences-service.test.php`. Node é ferramenta de desenvolvimento; ainda não há manifests npm/Composer nem runner geral de testes PHP.

## Mapa dos arquivos da aplicação

### Frontend próprio: `js/features/`

Os arquivos seguintes são código da aplicação (não bibliotecas vendorizadas):

- Inicialização e mapa: `main.js` inicializa mapa, toolbar, cor e desenho; `map-setup.js` prepara camadas e controles; `map-layers.js` consulta/interpreta capacidades WMS; `map-tools.js` registra ferramentas de navegação; `map-popups.js` ajusta popups e limites de impressão; `labels.js` gerencia rótulos; `layer-management.js` gerencia camadas dinâmicas e consultas de feições; `shared-layers.js` carrega e compartilha camadas; `help-and-planning.js` apresenta ajuda e envia sugestões de planejamento.
- Desenhos e intercâmbio: `drawing-geometry.js` contém geometria pura; `freehand-drawing.js` registra desenho livre; `drawing-storage.js` salva desenhos; `drawing-loading.js` carrega desenhos persistidos; `kmz-import.js` importa KMZ/KML; `kmz-export.js` converte para KML e gera KMZ.
- Imagens: `image-overlays.js` localiza imagens e as exibe como sobreposições.
- Elevação: `elevation-profile.js` fornece cálculos puros de amostragem e linha de visada; `elevation-tools.js` integra perfis e imagens georreferenciadas.
- Localização e rádio: `geolocation.js` controla rastreamento no mapa; `radio-planning.js` simula enlaces de rádio e visada ótica.
- Tarefas e sequências: `task-execution.js` executa tarefas e apresenta progresso; `task-parameters.js` monta/valida formulários; `task-terrain-analysis.js` analisa elevação; `task-icon-placement.js` posiciona ícones; `task-line-planning.js` cria linhas; `task-coverage-planning.js` planeja cobertura; `task-sequence-storage.js` persiste sequências; `task-sequence-editor.js` edita/reordena sequências; `task-sequence-controls.js` liga o controle de planejamento ao editor.
- Suporte à interface e exportação: `icon-selector.js` seleciona ícones; `api-client.js` centraliza HTTP e logs de erro; `qgis2web_expressions.js` fornece expressões usadas pelo exportador QGIS.

### Bibliotecas e assets

- `js/library/`: JavaScript de terceiros, incluindo Leaflet e plugins, Turf, Chart.js, JSZip, jQuery, Fabric, html2canvas, SweetAlert2, proj4 e TinyMCE. `js/library/tinymce/` contém a distribuição do TinyMCE e seus plugins/temas.
- `css/`: CSS da aplicação (`app.css`), folhas de estilo de terceiros, ícones/fontes e imagens usados pelos controles. Não editar ou substituir arquivos vendorizados como parte de uma mudança localizada no código próprio.
- `symbols/`: ícones de unidades e símbolos, consumidos pelo mapa e pelos endpoints de símbolos.
- `SRTM3/`: tiles de elevação utilizados pelos serviços de perfil/consulta de elevação.

### Backend PHP existente

Os adaptadores PHP da raiz preservam os pontos de entrada HTTP existentes. As implementações correspondentes ficam em `php/endpoints/`:

- `carregar.php` e `salvar.php`: carregam e persistem desenhos/planejamentos.
- `carregar-imagem.php` e `salvar-imagem.php`: listam/carregam imagens e persistem dados de imagem.
- `tasks.php`: operações de salvar, listar, obter, verificar e excluir sequências de tarefas.
- `get_elevation_data.php`, `elevation_profile.php` e `upload_elevation_files.php`: consulta/amostragem de elevação e upload de arquivos/tiles de elevação.
- `get_sigs.php`: fornece a lista de SIGs/camadas ao frontend.
- `proxy.php`: proxy de requisições externas, incluindo uso por serviços de mapa; requer revisão cuidadosa de destinos, redirecionamentos, limites e protocolos.
- `icons.php`: fornece os ícones disponíveis em `symbols/`; seu adaptador continua em `symbols/icons.php`.
- `php/.htaccess`: impede que implementações incluídas por adaptadores sejam invocadas diretamente via HTTP.

`bootstrap.php` e `src/Infrastructure/` permanecem na raiz por enquanto; os endpoints migrados carregam o bootstrap por caminho explícito e localizam `SRTM3/` a partir da raiz do projeto.
- `src/Infrastructure/Database/ConnectionFactory.php` e `src/Infrastructure/Logging/Logger.php`: implementação compartilhada da infraestrutura PHP; não são endpoints.

### Testes e documentação

- `tests/js/`: testes de regressão para cliente HTTP, geometria, perfil de elevação, desenho livre, geolocalização, seletor de ícones, exportação KMZ, WMS, configuração do mapa, planejamento de rádio, parâmetros e armazenamento de sequências.
- `docs/api-contracts.md`: inventário dos contratos HTTP existentes; use-o para orientar a migração PHP sem quebrar clientes.
- `.github/copilot-instructions.md`: este guia de arquitetura, estrutura, convenções e estado do trabalho.
- `php/src/Application/TaskSequencesService.php`: lógica de aplicação das sequências, independente da requisição HTTP.
- `tests/php/task-sequences-service.test.php`: regressões do serviço com SQLite em memória.

## Continuação da modularização e documentação PHP

As implementações já foram organizadas em `php/endpoints/`, com adaptadores preservando as URLs. `TaskSequencesService` é a primeira extração de lógica para `php/src/Application/`. Continue refatorando gradualmente os demais grupos, extraindo serviços onde houver responsabilidades reutilizáveis, e documente funções, parâmetros, entradas, saídas, erros e dependências. Antes de alterar contratos ou implementação:

1. Leia `docs/api-contracts.md`, os endpoints relevantes e seus chamadores em `js/features/`, `index.html` e `criador-tema.html`. Registre método HTTP, parâmetros, autenticação, formatos JSON, códigos de status, efeitos no SQLite e arquivos acessados.
2. Adicione ou preserve testes de regressão dos contratos e fluxos prioritários antes de reescrever implementação. Use os endpoints atuais como comportamento de referência, incluindo peculiaridades necessárias à compatibilidade.
3. Preserve os adaptadores raiz enquanto consumidores atuais ou clientes implantados dependerem das URLs antigas. `php/endpoints/` contém implementações incluídas pelos adaptadores e não deve ser acessível diretamente via HTTP.
4. Garanta que endpoints movidos ainda carreguem o bootstrap e resolvam `src/Infrastructure/`, banco, logs, uploads e `SRTM3/` por caminhos/configuração explícitos, sem depender do diretório de trabalho do processo.
5. Documente o propósito de cada arquivo e de cada função PHP relevante, incluindo parâmetros, tipos, retorno/JSON, erros e efeitos colaterais. Mantenha comentários em português, nomes novos em inglês e PHP compatível com o runtime LAMP/XAMPP suportado.
6. Preserve SQLite, SQL parametrizado, nomes históricos de tabelas/campos e formatos já usados pelo frontend. Não faça uma migração para framework/ORM nem altere todos os endpoints de uma só vez; trabalhe por funcionalidade e mantenha a aplicação executável.
7. Depois de cada conjunto, rode `php -l` nos arquivos PHP alterados, testes relevantes e verificações de caminhos/contratos. Atualize `docs/api-contracts.md`, este arquivo e o README quando o comportamento ou a instalação mudarem.

Trate esta seção como referência inicial. Confirme o estado real dos arquivos e chamadas antes de cada alteração.

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
  logs/
tests/
```

Responsabilidades esperadas:

- `public/`: documentos, assets e pontos de entrada HTTP que precisam ser servidos pelo Apache.
- `public/api/`: possível organização futura de endpoints caso a estrutura `public/` seja adotada.
- `src/Application/`: casos de uso e coordenação das operações.
- `src/Domain/`: regras puras de domínio quando houver complexidade suficiente para justificar essa camada.
- `src/Infrastructure/Database/`: conexão SQLite e repositórios PDO.
- `storage/`: banco, logs e arquivos gravados, sempre fora do webroot.
- `tests/`: testes unitários e de integração.

No frontend, dividir o JavaScript por funcionalidade e carregar um ponto de entrada, por exemplo `main.js`. Cada módulo deve receber explicitamente as dependências necessárias, como mapa, camadas e cliente HTTP; evite introduzir novos globais. Migre handlers inline para eventos registrados pelos módulos. Mantenha as bibliotecas atuais enquanto a aplicação é modularizada.

No backend, centralizar criação da conexão PDO, configuração, validação de entrada, serialização JSON e tratamento de erros. Manter SQLite e PDO inicialmente; não adicionar ORM por padrão. Uma rota consistente, como `/api/v1/drawings`, `/api/v1/images` e `/api/v1/task-sequences`, é um destino possível, não requisito para uma primeira alteração. Preserve temporariamente os endpoints existentes ou forneça adaptadores enquanto os consumidores são migrados.

**Próxima prioridade:** extrair e testar gradualmente os serviços de desenhos, imagens e elevação, mantendo contratos e adaptadores. A estrutura `public/api/` e as rotas `/api/v1/...` acima são possibilidades futuras, ainda não adotadas; não as implemente sem solicitação explícita.

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

- Manter a instalação LAMP/XAMPP por cópia do repositório como caminho oficial. Docker Compose é experimental; não torná-lo requisito nem usar sua estrutura de volumes como premissa para a implantação oficial.
- Configurar o Apache para não servir `bd.db`, logs, `.git`, `.github`, configurações locais ou código interno. Sempre que possível, configure o document root para `public/`; caso a instalação mantenha a raiz do repositório no webroot, use regras Apache explícitas e documentadas para negar arquivos e diretórios internos.
- O `.htaccess` atual usa `mod_rewrite`, `Require` e `Options`; documente e verifique `mod_rewrite` e permissões Apache `AllowOverride` adequadas. Não remova nem torne condicionais as regras de proteção sem fornecer uma alternativa equivalente.
- Garantir que o usuário do Apache tenha escrita apenas nos arquivos/diretórios necessários, incluindo o SQLite e `SRTM3/`, sem permissões recursivas no repositório inteiro.
- O workflow do GitHub Pages foi removido; não recrie publicação estática sem uma nova decisão explícita.
- Antes de mover ou retirar do controle de versão `bd.db` e logs existentes, confirmar como preservar os dados e se o histórico precisa de tratamento. Não apagar nem reescrever dados ou histórico automaticamente.
- Registrar os contratos atuais entre frontend e endpoints e criar testes de regressão para os fluxos prioritários antes de mudar suas implementações.
- Requerer uma versão PHP ainda suportada no servidor alvo e validar compatibilidade com a versão disponível no LAMP/XAMPP. A imagem experimental usa PHP 8.4, mas isso não define o runtime oficial.

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
- Registrar detalhes técnicos somente em logs privados; devolver mensagens de erro seguras e estáveis ao cliente.

### 4. Consolidar contratos e qualidade

- Documentar métodos, parâmetros, formatos de sucesso e erro dos endpoints.
- Adicionar testes para validação de requisições, persistência SQLite e regras geoespaciais/de rádio relevantes.
- Adicionar verificações automatizadas compatíveis com as ferramentas adotadas, como `php -l`, testes PHP e lint JavaScript.
- Atualizar o README com instalação LAMP/XAMPP, extensões, permissões, configuração por ambiente, backup e comandos de validação. Documentar Docker separadamente como opção experimental.

## Segurança e operação

- Nunca disponibilize diretamente o arquivo SQLite ou logs por HTTP. Mesmo quando os dados não forem confidenciais, eles precisam de proteção contra alteração, exclusão, exposição acidental e perda.
- Não conceda permissões de escrita recursivas à aplicação inteira. Mantenha código somente para leitura pelo usuário do servidor web e limite escrita a `storage/`.
- Revise o proxy para restringir protocolos e destinos, validar redirecionamentos e definir limites de tempo e tamanho de resposta.
- Revise uploads com validação de nome e formato por allowlist, limite de quantidade/tamanho e controles de escrita no destino.
- Não exponha mensagens de exceção, caminhos locais ou configuração em respostas de produção.
- Coloque segredos e configuração específica do ambiente em variáveis de ambiente; não os registre no Git.
- Considere autenticação, autorização e proteção contra abuso segundo o modo real de publicação. Não presuma que um endpoint é privado apenas por usar Docker ou SQLite.

## Orientações para mudanças futuras

- Antes de remover ou renomear algo, localize todos os consumidores, endpoints, links, dados e dependências relacionados.
- Prefira alterações pequenas, orientadas a uma funcionalidade, e preserve o comportamento existente salvo requisito explícito em contrário.
- Não faça reformat, renomeação global ou limpeza de bibliotecas de terceiros como parte de uma mudança localizada.
- Em alterações de API ou banco, considere dados existentes e compatibilidade com versões já implantadas.
- Para cada mudança, rode primeiro o teste ou lint mais próximo da área alterada; depois execute as verificações adicionais relevantes.
- Atualize estas instruções e a documentação do projeto quando decisões arquiteturais forem efetivamente adotadas ou quando o estado descrito mudar.