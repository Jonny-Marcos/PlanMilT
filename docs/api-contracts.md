# Contratos atuais da API

Este documento registra os contratos observados nos endpoints PHP antes de uma migração completa. As rotas em inglês são os nomes canônicos atuais; as URLs legadas continuam funcionando por rewrite para compatibilidade.

Todo o código PHP da aplicação agora fica sob `php/`. As URLs canônicas abaixo são encaminhadas pelo `.htaccess` da raiz a `php/endpoints/`; URLs antigas permanecem como aliases, sem adaptadores PHP na raiz. Os endpoints também podem ser chamados em `php/endpoints/<arquivo>.php`, relativo ao diretório publicado do app. `php/.htaccess` bloqueia acesso direto a `php/src/` e `php/bootstrap.php`, mas deixa os endpoints públicos disponíveis.

## Endpoints

| Endpoint | Método e entrada | Resposta de sucesso | Comportamento de erro atual |
| --- | --- | --- | --- |
| `/sigs.php` | Qualquer método; não lê parâmetros. | JSON: array de objetos com `Nome` e `URL`. | JSON `{ "error": ... }`; falhas PDO incluem detalhes da exceção e continuam com status HTTP 200. O piloto abaixo padroniza isso. |
| `/symbols/icons.php` | GET; sem parâmetros. | JSON: array de caminhos de ícones SVG relativos à raiz publicada. | Não define status/cabeçalho de erro próprio. |
| `/proxy.php` | GET; requer `url`. Parâmetros adicionais são encaminhados ao serviço remoto. | Corpo e `Content-Type` recebidos do serviço remoto. O status remoto não é encaminhado explicitamente. | Texto simples: 400 sem `url`, 403 para host não permitido, 500 em falha SQLite/cURL. |
| `/drawing-load.php` | POST `application/x-www-form-urlencoded`: `usuario`, `link`. | JSON armazenado na coluna `leaflet`, retornado diretamente. | JSON `{ "error": ... }`; erros de método e PDO não definem status HTTP de erro, e respostas fora do ramo POST podem não definir `Content-Type`. A consulta é delegada a `php/src/Application/DrawingsService.php`. |
| `/drawing-save.php` | POST `application/x-www-form-urlencoded`: `usuario`, `senha`, `link`, `leaflet`. | Texto simples indicando se o desenho foi criado ou atualizado. | Texto simples para senha incorreta, método inválido e falhas; erros PDO incluem detalhes e status permanece 200. A persistência e verificação da senha são delegadas a `php/src/Application/DrawingsService.php`. |
| `/image-load.php` | POST sem `id` lista imagens; POST com `id` aceita `senha` opcional. GET requer `id`. | POST sem id: `{ "images": [{ "id", "descricao" }] }`. POST com id: `{ "url", "bounds", "descricao" }`. GET com id: `{ "descricao", "requiresPassword" }`. | JSON `{ "error": ... }`; erros de método, validação e PDO normalmente permanecem HTTP 200, e exceções PDO podem ser retornadas ao cliente. |
| `/image-save.php` | POST `application/x-www-form-urlencoded`: `imagem` (Data URL), `descricao`, `localizacao`, `data_criacao` opcional, `senha` opcional, `compartilhavel`. | Texto simples confirmando ou recusando a gravação. | Texto simples para método inválido e PDO; exceções PDO incluem detalhes, status permanece 200. |
| `/task-sequences.php` | POST `application/x-www-form-urlencoded`; `action` define a operação. | `save`: `{ "success", "message" }`. `load`: `{ "success", "sequences" }`. `get_sequence`: `{ "success", "sequence", "description" }`. `check_sequence`: `{ "success", "exists" }`. `delete_sequence`: `{ "success", "message" }`. | JSON `{ "success": false, "error": ... }`; respostas de erro normalmente usam HTTP 200. A conexão inicial retorna erro genérico, operações registram detalhes no log. A persistência e validação das operações são delegadas a `php/src/Application/TaskSequencesService.php`; o endpoint preserva a tradução HTTP e os payloads legados. |
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

## Piloto: `sigs.php`

O consumidor atual em `index.html` itera a resposta como array e usa `Nome` e `URL`. A requisição usa o caminho relativo `php/endpoints/sigs.php` para suportar instalação do app na raiz ou em subdiretório. Essa forma de sucesso é preservada para não quebrar a interface.

Contrato adotado para o piloto:

- `GET` bem-sucedido: HTTP 200, `Content-Type: application/json; charset=utf-8`, array atual de `{ "Nome", "URL" }`.
- Método diferente de GET: HTTP 405, cabeçalho `Allow: GET` e JSON `{ "error": "Método não permitido." }`.
- Falha de banco/serialização: HTTP 500 e JSON `{ "error": "Não foi possível carregar a lista de SIGs." }`; o cliente registra endpoint e status no console do navegador, sem payload ou dados internos.

## Direção para a migração

Padronizar os demais endpoints individualmente. Antes de mudar um contrato, localizar seus consumidores, adicionar teste/regressão e preservar temporariamente a URL e o payload de sucesso. Erros legados que hoje usam HTTP 200 devem ser migrados por endpoint e junto do consumidor correspondente.

## Migrações do SQLite

`php/src/Infrastructure/Database/SchemaMigrator.php` é executado pela fábrica de conexão e registra a versão do esquema em `PRAGMA user_version`. A migração 1 cria índices únicos para desenhos (quando o link não é `NULL`) e sequências. A migração 2 renomeia as tabelas e colunas para inglês, preservando os registros e os contratos HTTP legados, e padroniza `created_at`/`updated_at`.

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