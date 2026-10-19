# Contratos atuais da API

Este documento registra os contratos observados nos endpoints PHP antes de uma migração completa. As rotas em inglês são os nomes canônicos atuais; as URLs legadas continuam funcionando por rewrite para compatibilidade.

Todo o código PHP da aplicação agora fica sob `php/`. As URLs canônicas abaixo são encaminhadas pelo `.htaccess` da raiz a `php/endpoints/`; URLs antigas permanecem como aliases, sem adaptadores PHP na raiz. Os endpoints também podem ser chamados em `php/endpoints/<arquivo>.php`, relativo ao diretório publicado do app. `php/.htaccess` bloqueia acesso direto a `php/src/` e `php/bootstrap.php`, mas deixa os endpoints públicos disponíveis.

## Endpoints

| Endpoint | Método e entrada | Resposta de sucesso | Comportamento de erro atual |
| --- | --- | --- | --- |
| `php/endpoints/map-layer-catalog.php` | GET opcional `q` para busca literal global, `service_id` para filtrar SIG e, somente com `q`, `category_code` e `year` para filtrar categoria e ano (`uncategorized`/`none` selecionam registros sem classificação/data). | Sem filtros: dez categorias com até dez recomendações cada e lista de SIGs `{ id, name, url }`. Com `service_id`: até dez sugestões por categoria daquele SIG. Com `q`: até 100 resultados e `totalResults`, combinável com os filtros avançados; busca nome, título, resumo, palavras-chave, atributos/amostra GetFeatureInfo e SIG. Serviços de abrangência local/estadual e camadas com referência explícita ao DF, Belo Horizonte ou Rio de Janeiro não entram nas recomendações, mas permanecem na busca. O seletor só consulta `GetCapabilities` do serviço escolhido pelo usuário; ordena camadas pelo maior ano explícito publicado e mostra até dez, sem consultar WMS quando “Todos os SIGs” está selecionado. | HTTP 400 para busca acima de 256 bytes, SIG, categoria ou ano inválidos, ou filtros avançados sem `q`; HTTP 405 para método inválido; HTTP 500 com mensagem genérica em falha de catálogo. A migração cria as tabelas, mas a população é feita manualmente pelo importador CSV. |
| `/sigs.php` | Qualquer método; não lê parâmetros. | JSON: array de objetos com `Nome` e `URL`. | JSON `{ "error": ... }`; falhas PDO incluem detalhes da exceção e continuam com status HTTP 200. O piloto abaixo padroniza isso. |
| `/symbols/icons.php` | GET; sem parâmetros. | JSON: array de caminhos de ícones SVG relativos à raiz publicada. | Não define status/cabeçalho de erro próprio. |
| `/proxy.php` | GET; requer `url`. Parâmetros adicionais são encaminhados ao serviço remoto. | Corpo e `Content-Type` recebidos do serviço remoto. O status remoto não é encaminhado explicitamente. | Texto simples: 400 sem `url`, 403 para host não permitido, 500 em falha SQLite/cURL. |
| `/drawing-load.php` | POST `application/x-www-form-urlencoded`: `usuario`, `link`. | JSON armazenado na coluna `leaflet`, retornado diretamente. | JSON `{ "error": ... }`; erros de método e PDO não definem status HTTP de erro, e respostas fora do ramo POST podem não definir `Content-Type`. A consulta é delegada a `php/src/Application/DrawingsService.php`. |
| `/drawing-save.php` | POST `application/x-www-form-urlencoded`: `usuario`, `senha`, `link`, `leaflet`. | Texto simples indicando se o desenho foi criado ou atualizado. | Texto simples para senha incorreta, método inválido e falhas; erros PDO incluem detalhes e status permanece 200. A persistência e verificação da senha são delegadas a `php/src/Application/DrawingsService.php`. |
| `/image-load.php` | POST sem `id` lista imagens; POST com `id` aceita `senha` opcional. Para edição, POST com `id`, `modo=edicao` e `senha` opcional exige autenticação se o registro tiver senha, inclusive quando compartilhado. GET requer `id`. | POST sem id: `{ "images": [{ "id", "descricao" }] }`. POST com id: `{ "url", "bounds", "descricao", "compartilhavel" }`. GET com id: `{ "descricao", "requiresPassword" }`. | JSON `{ "error": ... }`; erros de método, validação e PDO normalmente permanecem HTTP 200. No fluxo de edição, senha incorreta ou ausente retorna a mensagem genérica existente. |
| `/image-save.php` | POST `application/x-www-form-urlencoded`: `imagem` (Data URL), `descricao`, `localizacao`, `data_criacao` opcional, `senha` opcional, `compartilhavel`. Para atualizar: adicionar `id` e `senha_atual`; `senha` passa a ser a nova senha opcional. | Texto simples: `Imagem salva com sucesso!` para criação ou `Imagem atualizada com sucesso!` para edição. Ao atualizar, nome, imagem, limites e compartilhamento são substituídos; senha existente é mantida se `senha` estiver vazia. | Texto simples para método inválido, validação e autenticação; falha PDO retorna mensagem genérica e HTTP 500. |
| `/task-sequences.php` | POST `application/x-www-form-urlencoded`; `action` define a operação. | `save`: `{ "success", "message" }`. `load`: `{ "success", "sequences" }`. `get_sequence`: `{ "success", "sequence", "description" }`. `check_sequence`: `{ "success", "exists" }`. `delete_sequence`: `{ "success", "message" }`. | JSON `{ "success": false, "error": ... }`; respostas de erro normalmente usam HTTP 200. A conexão inicial retorna erro genérico, operações registram detalhes no log. A persistência e validação das operações são delegadas a `php/src/Application/TaskSequencesService.php`; o endpoint preserva a tradução HTTP e os payloads legados. |
| `/admin.php` | GET entrega a interface e cria sessão/CSRF. POST JSON com `action` e token `csrf`: `login`, `change_password`, `logout`, `list`, `get`, `save`, `delete`, `get_settings`, `save_settings`, `list_files` ou `delete_file`. | Login retorna `mustChangePassword`; listagem retorna até 100 registros por página; `get` entrega somente campos editáveis; gravação retorna `{ "id" }`; exclusão retorna `{ "success": true }`. Preferências retornam `mapDefaults` com `defaultLayers`, `center` e `zoom`; gerenciamento de elevação lista metadados e remove arquivos `.hgt` geograficamente válidos somente em `SRTM3/`. | HTTP 400 para entrada inválida, 401 sem sessão, 403 para CSRF ou, quando `PLANMILT_REQUIRE_ADMIN_PASSWORD_CHANGE` estiver ativa, uso antes da troca inicial; 405 para método inválido, 413 para corpo acima de 6 MiB e 500 genérico para falha interna. A senha inicial `12345678` é armazenada como hash. A exigência de troca está temporariamente desativada pela constante, mas o fluxo permanece disponível para reativação e a senha pode ser alterada no painel. O acesso ao banco é limitado a `map_services`, `map_layers`, `drawings`, `images`, `task_sequences` e `app_settings`; hashes e BLOBs não são retornados. Excluir um SIG remove suas camadas do catálogo na mesma transação. |
| `/map-settings.php` | GET, sem parâmetros; endpoint público usado na inicialização do mapa. | JSON `{ "defaultLayers": string[], "center": [latitude, longitude] \| null, "zoom": number \| null }`; a resposta contém somente preferências não confidenciais. | HTTP 405 para método inválido e HTTP 500 com mensagem genérica quando não for possível consultar as preferências. |
| `/elevation-profile.php` | POST JSON: `{ "points": [{ "latitude", "longitude" }] }`. | HTTP 200 e array JSON de `{ "latitude", "longitude", "elevation" }`, com elevações numéricas. | JSON `{ "error": "Arquivos de elevação faltando", "missingTiles": [...] }` em HTTP 400 quando um ou mais tiles HGT não existem; o frontend de rádio oferece upload e repete o cálculo. Dados ausentes/inválidos usam HTTP 400 e diretório SRTM ausente HTTP 500. Todas as respostas usam `Content-Type: application/json; charset=utf-8`. |
| `/elevation-data.php` | GET com `minLat`, `maxLat`, `minLon`, `maxLon`. | Array JSON de `{ "lat", "lon", "elevation" }`. | JSON `{ "error": ... }`, opcionalmente `missingTiles`; parâmetros inválidos/área grande/tiles ausentes usam HTTP 400, falha interna HTTP 500. |
| `/elevation-upload.php` | POST multipart: `files[]` e `missingTiles` como array JSON serializado. Cada arquivo deve corresponder ao tile informado e ter tamanho SRTM1/SRTM3 permitido. | JSON `{ "success": true }`. | JSON `{ "success": false, "message": ... }`; erros de método, validação e upload não definem status HTTP de erro de forma consistente. |

### Aliases de compatibilidade

Os caminhos antigos continuam sendo encaminhados para os endpoints canônicos:

| URL legada | Endpoint atual |
| --- | --- |
| `/carregar.php` | `/drawing-load.php` |
| `/salvar.php` | `/drawing-save.php` |
| `/carregar-imagem.php` | `/image-load.php` |
| `/salvar-imagem.php` | `/image-save.php` |
| `/tasks.php` | `/task-sequences.php` |
| `/elevation_profile.php` | `/elevation-profile.php` |
| `/get_elevation_data.php` | `/elevation-data.php` |
| `/upload_elevation_files.php` | `/elevation-upload.php` |
| `/get_sigs.php` | `/sigs.php` |

O frontend mantém `/carregar.php` e `/salvar.php` para as operações de desenhos enquanto instalações publicadas não tiverem necessariamente recebido as rotas canônicas novas. O `.htaccess` da raiz encaminha esses aliases aos arquivos atuais em `php/endpoints/`; ao implantar uma versão nova, publique também esse `.htaccess` e os endpoints PHP.

O painel `/admin.php` é encaminhado pelo `.htaccess` para `php/endpoints/admin.php`. A autenticação do painel não substitui a avaliação de autenticação/autorização dos demais endpoints públicos; instalações expostas à internet devem revisar separadamente as rotas legadas de escrita.

## Piloto: `sigs.php`

O consumidor atual em `index.html` itera a resposta como array e usa `Nome` e `URL`. A requisição usa o caminho relativo `php/endpoints/sigs.php` para suportar instalação do app na raiz ou em subdiretório. Essa forma de sucesso é preservada para não quebrar a interface.

Contrato adotado para o piloto:

- `GET` bem-sucedido: HTTP 200, `Content-Type: application/json; charset=utf-8`, array atual de `{ "Nome", "URL" }`.
- Método diferente de GET: HTTP 405, cabeçalho `Allow: GET` e JSON `{ "error": "Método não permitido." }`.
- Falha de banco/serialização: HTTP 500 e JSON `{ "error": "Não foi possível carregar a lista de SIGs." }`; o cliente registra endpoint e status no console do navegador, sem payload ou dados internos.

## Direção para a migração

Padronizar os demais endpoints individualmente. Antes de mudar um contrato, localizar seus consumidores, adicionar teste/regressão e preservar temporariamente a URL e o payload de sucesso. Erros legados que hoje usam HTTP 200 devem ser migrados por endpoint e junto do consumidor correspondente.

## Migrações do SQLite

`php/src/Infrastructure/Database/SchemaMigrator.php` é executado pela fábrica de conexão e registra a versão do esquema em `PRAGMA user_version`. A migração 1 cria índices únicos para desenhos (quando o link não é `NULL`) e sequências. A migração 2 renomeia as tabelas e colunas para inglês, preservando os registros e os contratos HTTP legados, e padroniza `created_at`/`updated_at`. A migração 3 cria `map_layers` e `map_layer_categories` e cadastra dez categorias fixas; ela não inventa camadas. A migração 4 cria a conta singleton de administração com hash temporário da senha `12345678`, exige troca e cria o armazenamento de tentativas de login. A migração 5 cria as preferências do mapa. A migração 6 define zoom 12 e centro `[-21.5699, -51.2457]`. A migração 7 troca a seleção inicial antiga de todas as camadas-base para somente `OpenTopo`, preservando preferências personalizadas. O painel permite escolher quais das camadas-base existentes ficam inicialmente selecionadas. Execute `php tools/catalog-wms-layers.php` para coletar o snapshot WMS em `storage/wms-layer-review.csv` e `php tools/import-wms-layer-catalog.php` para importar o CSV no SQLite. A busca consulta todo o catálogo; cada categoria exibe no máximo dez recomendações.

Antes de criar os índices, a migração verifica dados existentes. Se encontrar duplicatas ou tabelas legadas e novas coexistindo, interrompe sem excluir ou alterar registros; a instalação deve ser respaldada e corrigida antes de tentar novamente. Os nomes atuais são `drawings`, `images`, `map_services` e `task_sequences`. Os campos legados dos formulários e respostas HTTP permanecem para compatibilidade. Timestamps sem equivalente histórico recebem o instante da migração; `images.created_at` e timestamps já existentes em sequências são preservados.

Novos timestamps gerados pelo servidor usam UTC (`datetime('now')`); valores históricos aceitos pelo campo legado `data_criacao` são preservados. Atualizações de desenhos e sequências renovam `updated_at`. O teste `php tests/php/schema-migrator.test.php` verifica migração idempotente, renomeação, preservação de conteúdo, restrições e interrupção segura em caso de duplicatas.

Mapeamento das tabelas migradas:

| Tabela | Colunas principais |
| --- | --- |
| `drawings` | `id`, `username`, `password_hash`, `geojson`, `link`, `created_at`, `updated_at` |
| `images` | `id`, `image`, `location`, `description`, `password_hash`, `is_shared`, `created_at`, `updated_at` |
| `map_services` | `id`, `name`, `url`, `created_at`, `updated_at` |
| `task_sequences` | `id`, `name`, `password_hash`, `sequence`, `description`, `created_at`, `updated_at` |

## Serviço de sequências de tarefas

`php/src/Application/TaskSequencesService.php` contém a lógica da tabela `task_sequences` (campos `password_hash`, `created_at` e `updated_at`) e recebe `PDO`. Os métodos públicos são:

- `save(name, password, sequence, description)`: cria uma sequência ou atualiza uma existente se a senha corresponder.
- `load()`: lista os nomes em ordem alfabética.
- `getSequence(name)`: devolve a sequência decodificada e sua descrição.
- `exists(name)`: informa se uma sequência está cadastrada.
- `delete(name, password)`: exclui a sequência após validar a senha.

Todos os métodos retornam arrays com os campos legados `success`, `message`, `sequences`, `sequence`, `description`, `exists` ou `error`. A serialização JSON e o campo POST `action` permanecem em `php/endpoints/task-sequences.php`.

Teste de regressão isolado, usando SQLite em memória:

```sh
php tests/php/task-sequences-service.test.php
```

## Serviço de desenhos

`php/src/Application/DrawingsService.php` encapsula a consulta e persistência na tabela `drawings`, recebendo uma conexão `PDO`:

- `load(user, link)`: devolve o JSON bruto armazenado em `geojson`, ou `null` se não houver registro.
- `save(user, password, link, geojson)`: cria um registro com hash em `password_hash` ou atualiza um registro existente após validar a senha; renova `updated_at` e devolve as mensagens de texto legadas.

Os endpoints `drawing-load.php` e `drawing-save.php` continuam traduzindo HTTP para o serviço e preservam campos, formatos de sucesso e respostas históricas. As URLs antigas são mantidas como aliases. Teste isolado:

```sh
php tests/php/drawings-service.test.php
```

## Serviço de imagens

`php/src/Application/ImagesService.php` persiste imagens na tabela `images`, recebendo `PDO`. `save(image, description, location, password, isShared, imageId, currentPassword, createdAt)` cria um tema ou atualiza um registro específico. Atualizações verificam a senha atual do registro, mantêm a senha anterior quando nenhuma nova senha é informada e atualizam `updated_at`. `image-load.php` habilita autenticação obrigatória durante edição por meio de `modo=edicao`, inclusive para temas compartilhados; o carregamento legado para exibição continua com o comportamento anterior.

O editor integrado lista temas, solicita a senha ao editar temas protegidos, mantém a credencial somente em memória enquanto o editor está aberto e permite renomear o tema ou substituir sua senha ao salvar. Teste isolado da persistência:

```sh
php tests/php/images-service.test.php
```