# Instruções do projeto PlanMilT

## Contexto do projeto

PlanMilT é uma aplicação web de planejamento tático com mapa interativo. A interface usa Leaflet e bibliotecas JavaScript locais para desenho, camadas geográficas, importação/exportação KMZ, edição de imagens, elevação, cálculos de rádio e sequências de tarefas. O backend usa PHP e SQLite.

O idioma da interface e do conteúdo visível ao usuário é português. A instalação oficial consiste em copiar/clonar o repositório para um servidor LAMP ou XAMPP já configurado com Apache e PHP. Docker é experimental e serve para desenvolvimento/aprendizado. GitHub Pages não é suportado; seu workflow de publicação foi removido.

## Estado atual

- `index.html` agora é um shell HTML com aproximadamente 140 linhas. O legado JavaScript principal foi movido para `js/main.js` sem reescrita; esse arquivo ainda contém milhares de linhas e estado compartilhado. O CSS principal está em `css/app.css`.
- `criador-tema.html` contém outra interface com CSS e JavaScript embutidos para trabalhar com imagens sobre o mapa.
- `js/api-client.js` centraliza respostas JSON e texto; `js/features/map-layers.js` contém o carregamento/parsing WMS; `js/features/map-setup.js` inicializa camadas-base, registry e controles; `js/features/elevation-profile.js` contém cálculos do perfil; `js/features/geolocation.js` gerencia rastreamento; `js/features/drawing-geometry.js` fornece geometria pura; `js/features/freehand-drawing.js` encapsula desenho livre; `js/features/icon-selector.js` mantém o seletor e o estado do ícone escolhido; `js/features/kmz-export.js` contém exportação KMZ, conversão GeoJSON-KML e captura opcional BDGEx; `js/features/radio-planning.js` contém a interface e os cálculos de predição RF/ótica. `js/main.js` carrega as integrações e funcionalidades legadas ainda não extraídas.
- `docs/api-contracts.md` registra os contratos legados dos endpoints e a migração piloto de `get_sigs.php`.
- Scripts PHP na raiz implementam operações de desenhos, imagens, tarefas, elevação, serviços de mapa e proxy. Muitos endpoints acessam SQLite e geram suas próprias respostas.
- Os endpoints carregam `bootstrap.php`, que carrega a fábrica SQLite e o logger compartilhados. No Docker, as classes em `src/` ficam em `/var/www/planmilt/src`, fora do document root; localmente, o bootstrap usa `src/` na raiz do projeto.
- `ConnectionFactory` aceita `PLANMILT_DB_PATH` e, por padrão, usa `bd.db` na raiz do repositório. `Logger` aceita `PLANMILT_LOG_DIR` e, por padrão, grava no diretório temporário do sistema.
- O Docker experimental monta `bd.db` em `/var/lib/planmilt/bd.db`; logs de aplicação e tiles de elevação usam volumes persistentes. `php.ini` é usado pelo container, não substitui a configuração PHP do servidor LAMP/XAMPP.
- Bibliotecas de terceiros estão armazenadas localmente em `js/`, `css/` e outras pastas de assets. Arquivos como `js/clustering.js` incluem código de terceiros; preserve os avisos de licença e não os trate como código da aplicação.
- O banco SQLite usa tabelas e campos com nomes históricos em português e inglês. A compatibilidade com os dados existentes é importante.
- Há testes JavaScript iniciais em `tests/js/`, executados com o runner nativo `node:test`; Node.js é necessário apenas para desenvolvimento. Ainda não há manifests Composer/npm.

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
- `public/api/`: entrada dos endpoints. Controladores traduzem HTTP para chamadas da aplicação e produzem respostas HTTP.
- `src/Application/`: casos de uso e coordenação das operações.
- `src/Domain/`: regras puras de domínio quando houver complexidade suficiente para justificar essa camada.
- `src/Infrastructure/Database/`: conexão SQLite e repositórios PDO.
- `storage/`: banco, logs e arquivos gravados, sempre fora do webroot.
- `tests/`: testes unitários e de integração.

No frontend, dividir o JavaScript por funcionalidade e carregar um ponto de entrada, por exemplo `main.js`. Cada módulo deve receber explicitamente as dependências necessárias, como mapa, camadas e cliente HTTP; evite introduzir novos globais. Migre handlers inline para eventos registrados pelos módulos. Mantenha as bibliotecas atuais enquanto a aplicação é modularizada.

No backend, centralizar criação da conexão PDO, configuração, validação de entrada, serialização JSON e tratamento de erros. Manter SQLite e PDO inicialmente; não adicionar ORM por padrão. Uma rota consistente, como `/api/v1/drawings`, `/api/v1/images` e `/api/v1/task-sequences`, é um destino possível, não requisito para uma primeira alteração. Preserve temporariamente os endpoints existentes ou forneça adaptadores enquanto os consumidores são migrados.

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