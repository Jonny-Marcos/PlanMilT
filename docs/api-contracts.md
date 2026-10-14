# Contratos atuais da API

Este documento registra os contratos observados nos endpoints PHP antes de uma migração completa. Os nomes e formatos legados devem continuar funcionando enquanto os consumidores são migrados.

As implementações dos endpoints foram movidas para `php/endpoints/`. Os caminhos desta tabela continuam públicos e são preservados por adaptadores PHP finos na raiz (e em `symbols/icons.php`); os arquivos de implementação não devem ser chamados diretamente. `php/.htaccess` bloqueia o acesso HTTP direto ao diretório, enquanto os adaptadores podem incluí-los internamente.

## Endpoints

| Endpoint | Método e entrada | Resposta de sucesso | Comportamento de erro atual |
| --- | --- | --- | --- |
| `/get_sigs.php` | Qualquer método; não lê parâmetros. | JSON: array de objetos com `Nome` e `URL`. | JSON `{ "error": ... }`; falhas PDO incluem detalhes da exceção e continuam com status HTTP 200. O piloto abaixo padroniza isso. |
| `/symbols/icons.php` | GET; sem parâmetros. | JSON: array de caminhos de ícones SVG relativos à raiz publicada. | Não define status/cabeçalho de erro próprio. |
| `/proxy.php` | GET; requer `url`. Parâmetros adicionais são encaminhados ao serviço remoto. | Corpo e `Content-Type` recebidos do serviço remoto. O status remoto não é encaminhado explicitamente. | Texto simples: 400 sem `url`, 403 para host não permitido, 500 em falha SQLite/cURL. |
| `/carregar.php` | POST `application/x-www-form-urlencoded`: `usuario`, `link`. | JSON armazenado na coluna `leaflet`, retornado diretamente. | JSON `{ "error": ... }`; erros de método e PDO não definem status HTTP de erro, e respostas fora do ramo POST podem não definir `Content-Type`. |
| `/salvar.php` | POST `application/x-www-form-urlencoded`: `usuario`, `senha`, `link`, `leaflet`. | Texto simples indicando se o desenho foi criado ou atualizado. | Texto simples para senha incorreta, método inválido e falhas; erros PDO incluem detalhes e status permanece 200. |
| `/carregar-imagem.php` | POST sem `id` lista imagens; POST com `id` aceita `senha` opcional. GET requer `id`. | POST sem id: `{ "images": [{ "id", "descricao" }] }`. POST com id: `{ "url", "bounds", "descricao" }`. GET com id: `{ "descricao", "requiresPassword" }`. | JSON `{ "error": ... }`; erros de método, validação e PDO normalmente permanecem HTTP 200, e exceções PDO podem ser retornadas ao cliente. |
| `/salvar-imagem.php` | POST `application/x-www-form-urlencoded`: `imagem` (Data URL), `descricao`, `localizacao`, `data_criacao` opcional, `senha` opcional, `compartilhavel`. | Texto simples confirmando ou recusando a gravação. | Texto simples para método inválido e PDO; exceções PDO incluem detalhes, status permanece 200. |
| `/tasks.php` | POST `application/x-www-form-urlencoded`; `action` define a operação. | `save`: `{ "success", "message" }`. `load`: `{ "success", "sequences" }`. `get_sequence`: `{ "success", "sequence", "description" }`. `check_sequence`: `{ "success", "exists" }`. `delete_sequence`: `{ "success", "message" }`. | JSON `{ "success": false, "error": ... }`; respostas de erro normalmente usam HTTP 200. A conexão inicial retorna erro genérico, operações registram detalhes no log. A persistência e validação das operações são delegadas a `php/src/Application/TaskSequencesService.php`; o endpoint preserva a tradução HTTP e os payloads legados. |
| `/elevation_profile.php` | POST JSON: `{ "points": [{ "latitude", "longitude" }] }`. | Array JSON de `{ "latitude", "longitude", "elevation" }`; elevação indisponível aparece como `"N/A"`. | JSON com `error`; dados ausentes/inválidos usam HTTP 400 e diretório SRTM ausente HTTP 500. Alguns ramos de erro não definem `Content-Type`. |
| `/get_elevation_data.php` | GET com `minLat`, `maxLat`, `minLon`, `maxLon`. | Array JSON de `{ "lat", "lon", "elevation" }`. | JSON `{ "error": ... }`, opcionalmente `missingTiles`; parâmetros inválidos/área grande/tiles ausentes usam HTTP 400, falha interna HTTP 500. |
| `/upload_elevation_files.php` | POST multipart: `files[]` e `missingTiles` como array JSON serializado. Cada arquivo deve corresponder ao tile informado e ter tamanho SRTM1/SRTM3 permitido. | JSON `{ "success": true }`. | JSON `{ "success": false, "message": ... }`; erros de método, validação e upload não definem status HTTP de erro de forma consistente. |

## Piloto: `get_sigs.php`

O consumidor atual em `index.html` itera a resposta como array e usa `Nome` e `URL`. Essa forma de sucesso é preservada para não quebrar a interface.

Contrato adotado para o piloto:

- `GET` bem-sucedido: HTTP 200, `Content-Type: application/json; charset=utf-8`, array atual de `{ "Nome", "URL" }`.
- Método diferente de GET: HTTP 405, cabeçalho `Allow: GET` e JSON `{ "error": "Método não permitido." }`.
- Falha de banco/serialização: HTTP 500 e JSON `{ "error": "Não foi possível carregar a lista de SIGs." }`; detalhes técnicos ficam no log, não na resposta.

## Direção para a migração

Padronizar os demais endpoints individualmente. Antes de mudar um contrato, localizar seus consumidores, adicionar teste/regressão e preservar temporariamente a URL e o payload de sucesso. Erros legados que hoje usam HTTP 200 devem ser migrados por endpoint e junto do consumidor correspondente.

## Serviço de sequências de tarefas

`php/src/Application/TaskSequencesService.php` contém a lógica da tabela `task_sequences`; recebe `PDO` e um callback de logging opcional para permitir testes sem banco persistente. Os métodos públicos são:

- `save(name, password, sequence, description)`: cria uma sequência ou atualiza uma existente se a senha corresponder.
- `load()`: lista os nomes em ordem alfabética.
- `getSequence(name)`: devolve a sequência decodificada e sua descrição.
- `exists(name)`: informa se uma sequência está cadastrada.
- `delete(name, password)`: exclui a sequência após validar a senha.

Todos os métodos retornam arrays com os campos legados `success`, `message`, `sequences`, `sequence`, `description`, `exists` ou `error`. A serialização JSON e o campo POST `action` permanecem em `php/endpoints/tasks.php`.

Teste de regressão isolado, usando SQLite em memória:

```sh
php tests/php/task-sequences-service.test.php
```