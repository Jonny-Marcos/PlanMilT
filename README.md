# PlanMilT (pt-br)

**PlanMilT** é uma aplicação web projetada para auxiliar no planejamento de operações militares no nível tático. Esta aplicação foi desenvolvida pelo Capitão de Comunicações Barbosa Oliveira durante o Curso de Aperfeiçoamento de Oficiais da Escola de Aperfeiçoamento de Oficiais, com o objetivo de apoiar o ensino do planejamento de operações militares no nível tático.

## Descrição

O PlanMilT utiliza a biblioteca **Leaflet** e ferramentas de **Sistema de Informação Geográfica (SIG)** para oferecer funcionalidades interativas, como:

- Criação de desenhos no mapa (linhas, polígonos, círculos e marcadores);
- Inclusão de gráficos táticos doutrinários (FM 1-02.2 / APP-06) com apoio da biblioteca `@zaes/tactical-graphics`, preservando as ferramentas nativas do Leaflet Draw;
- Importação e exportação de arquivos no formato **KMZ**;
- Edição de textos diretamente no mapa;
- Medições de áreas e distâncias;
- Personalização de camadas e ícones;
- Ferramentas de busca geoespacial.

O banco de dados utilizado é o **SQLite3**, armazenado no arquivo `bd.db` na raiz do projeto.

## Tecnologias Utilizadas

A aplicação é construída com as seguintes tecnologias e bibliotecas:

- **HTML5**
- **CSS3**
- **JavaScript**
- **Leaflet**
- **Leaflet Draw**
- **Leaflet Geocoder**
- **SweetAlert2**
- **Chart.js**
- **Tinymce**
- **HTML2Canvas**
- **SQLite3**
- **@zaes/tactical-graphics** (bundle local em `js/library/tactical-graphics.min.js`)

## Instalação

### Pré-requisitos

- Servidor WAMP ou LAMP com Apache e PHP 8.3 ou superior.
- Extensões PHP PDO SQLite (`pdo_sqlite`) e cURL (`curl`) habilitadas.
- Módulos Apache `mod_rewrite` e autorização para regras `.htaccess` (`AllowOverride All`, ou as permissões equivalentes para `FileInfo`, `AuthConfig` e `Options`).
- Permissão de leitura e escrita no arquivo `bd.db` e em seu diretório para o usuário do Apache.
- Permissão de escrita em `SRTM3/` para receber arquivos de elevação.

### Instalação no WAMP ou LAMP

1. Copie ou clone todos os arquivos do projeto para um diretório publicado pelo Apache, por exemplo `www/PlanMilT` no WAMP ou `htdocs/PlanMilT` no XAMPP.
2. No `php.ini` usado pelo Apache, habilite `pdo_sqlite` e `curl`. Reinicie o Apache depois de alterar a configuração.
3. Habilite o módulo Apache `mod_rewrite` e permita as diretivas necessárias do `.htaccess` no VirtualHost ou na configuração do servidor.
4. Garanta que o usuário do Apache possa ler os arquivos do projeto e gravar em `bd.db`, no diretório que contém esse banco e em `SRTM3/`.
5. Acesse `http://localhost/PlanMilT/` ou o endereço configurado no servidor.

Antes de atualizar uma instalação existente, faça uma cópia de segurança de `bd.db`. Na primeira conexão ao banco após a atualização, o PlanMilT aplica migrações versionadas que renomeiam tabelas e colunas para inglês, adicionam timestamps, inicializam a conta administrativa e criam as preferências do mapa, preservando os registros existentes. Se encontrar chaves duplicadas que impeçam os índices únicos, a migração falha sem apagar registros; corrija o conflito manualmente após backup e tente novamente.

O painel fica em `http://localhost/PlanMilT/admin.php`. Na primeira instalação, a senha temporária é `12345678`, armazenada no SQLite somente como hash. A exigência de troca inicial está temporariamente desativada em `php/endpoints/admin.php`, mas o painel ainda permite alterá-la. Como a senha inicial é conhecida, troque-a logo no primeiro acesso. O mapa abre por padrão no zoom 12 e centro `-21.5699, -51.2457`, com somente OpenTopo selecionada. No painel, o administrador pode marcar ou desmarcar as demais camadas-base atuais para controlar quais iniciam visíveis. O painel também permite administrar serviços SIG, classificação de camadas WMS, desenhos, metadados de temas, sequências de tarefas e tiles HGT em `SRTM3/`. A remoção de tiles afeta os perfis de elevação da região e não pode ser desfeita. Não mostra hashes de senhas nem o conteúdo binário das imagens; criação de imagens continua no editor de temas. Faça backup do banco antes de exclusões importantes.

Para popular o catálogo de camadas na instalação, execute na raiz do projeto `php tools/catalog-wms-layers.php` e depois `php tools/import-wms-layer-catalog.php`. A primeira etapa consulta os WMS e grava o CSV em `storage/`; a segunda aplica as migrações pendentes e importa o snapshot para `bd.db`. Faça backup antes da primeira importação. Atualizações futuras do catálogo são manuais e mantêm revisões já marcadas como concluídas.

Não há um arquivo de configuração PHP específico do projeto: ajuste os limites de upload e execução no `php.ini` ativo do servidor conforme a necessidade e reinicie o Apache. Falhas das requisições da aplicação são exibidas no console do navegador; erros internos do PHP permanecem sujeitos à configuração de diagnóstico do servidor.

## Funcionalidades

### Interface do Usuário
- **Desenho:** Adicione polígonos, linhas, círculos e marcadores diretamente no mapa.
- **Gráficos táticos:** Use o botão “Gráfico tático” para abrir o seletor com busca, filtro por seção e uma prévia do símbolo escolhido, no padrão do catálogo de camadas. A designação é opcional e pode ser digitada no próprio seletor, abaixo de “Selecionado:”; durante o desenho, a simbologia e a designação acompanham os vértices e o cursor em uma prévia temporária. O catálogo mantém gráficos com simbologia própria, omite os símbolos simples indicados como substituíveis pelas ferramentas nativas e, nas medidas de coordenação do espaço aéreo, mantém somente “Corredor aéreo”.
- **Personalização:** Escolha cores, ícones e estilos para os elementos do mapa.
- **Administração:** Acesse `admin.php` para consultar e administrar registros selecionados do SQLite; o primeiro acesso usa uma senha temporária que só funciona localmente e exige troca.
- **Criador de tema:** No seletor “Carregar Imagem”, escolha “Criar tema” para começar ou use “Carregar tema” dentro do editor para editar um tema salvo. Temas protegidos exigem a senha atual; ao salvar, é possível manter o nome, renomear ou definir uma nova senha. Envie uma imagem ou solte o arquivo no mapa; arraste-a para posicionar, use os cantos para redimensionar/esticar e a alça superior para girar. Use “Mover mapa” ou os botões em “Controle do mapa” para navegar sem deslocar a imagem. “Redefinir ajustes” também restaura os controles de brilho e contraste.
- **Importação/Exportação:** Suporte para arquivos KMZ.
- **Edição:** Modifique textos e propriedades dos elementos existentes.

### Segurança
A aplicação usa armazenamento local SQLite. O armazenamento local, por si só, não substitui controles de acesso, backup e proteção contra alterações ou perdas.
O login do painel não altera os contratos de autenticação dos endpoints legados da aplicação. Antes de expor o PlanMilT à internet, revise a proteção de cada operação pública de escrita conforme o modo de publicação.

## Contribuições
Contribuições são bem-vindas! Sinta-se à vontade para abrir uma issue ou enviar um pull request no repositório.

### Testes de desenvolvimento
Para atualizar o bundle local da biblioteca de gráficos táticos, execute `npm install` e depois `npm run build:tactical-graphics`.

Node.js é necessário apenas para executar os testes JavaScript: `node --test tests/js/*.test.js`.
Os testes PHP são scripts isolados: `php tests/php/map-layer-catalog-service.test.php`, `php tests/php/schema-migrator.test.php`, `php tests/php/admin-service.test.php`, `php tests/php/task-sequences-service.test.php`, `php tests/php/drawings-service.test.php` e `php tests/php/images-service.test.php`.
Os métodos e formatos atuais dos endpoints estão registrados em [docs/api-contracts.md](docs/api-contracts.md).

---

# PlanMilT (en)

**PlanMilT** is a web application designed to assist in planning military operations at the tactical level. This application was developed by Captain of Communications Barbosa Oliveira (Brazilian Army) during the Officer Improvement Course at the Escola de Aperfeiçoamento de Oficiais (2024), aiming to support the teaching of tactical military operation planning.

## Description

PlanMilT leverages the **Leaflet** library and **Geographic Information System (GIS)** tools to offer interactive features such as:

- Creating map drawings (lines, polygons, circles, and markers);
- Adding doctrinal tactical graphics (FM 1-02.2 / APP-06) powered by `@zaes/tactical-graphics`, while keeping native Leaflet Draw tools available;
- Importing and exporting files in **KMZ** format;
- Editing text directly on the map;
- Measuring areas and distances;
- Layer and icon customization;
- Geospatial search tools.

The application uses **SQLite3**, stored in the `bd.db` file at the project root.

## Technologies Used

The application is built with the following technologies and libraries:

- **HTML5**
- **CSS3**
- **JavaScript**
- **Leaflet**
- **Leaflet Draw**
- **Leaflet Geocoder**
- **SweetAlert2**
- **Chart.js**
- **Tinymce**
- **HTML2Canvas**
- **SQLite3**
- **@zaes/tactical-graphics** (local bundle at `js/library/tactical-graphics.min.js`)

## Installation

### Prerequisites

- Apache with PHP 8.3 or later.
- PHP PDO SQLite (`pdo_sqlite`) and cURL (`curl`) extensions enabled.
- Apache `mod_rewrite` and permission to use `.htaccess` rules (`AllowOverride All`, or equivalent permissions for `FileInfo`, `AuthConfig` and `Options`).
- Read and write access to `bd.db` and its parent directory for the Apache user.
- Write access to `SRTM3/` for elevation file uploads.

### Installation on WAMP or LAMP

1. Copy or clone all project files into a directory published by Apache, such as WAMP's `www/PlanMilT` or XAMPP's `htdocs/PlanMilT`.
2. Enable `pdo_sqlite` and `curl` in the `php.ini` used by Apache, then restart Apache.
3. Enable Apache's `mod_rewrite` module and allow the required `.htaccess` directives in the VirtualHost or server configuration.
4. Ensure the Apache user can read the project files and write to `bd.db`, its containing directory, and `SRTM3/`.
5. Open `http://localhost/PlanMilT/` or the address configured on the server.

Back up `bd.db` before updating an existing installation. On the first database connection after the update, PlanMilT applies versioned migrations that rename tables and columns to English, add timestamps, initialize the administrator account, and create map preferences while preserving existing records. If duplicate keys prevent unique indexes, migration fails without deleting records; resolve the conflict manually after backing up, then retry.

The administration panel is available at `http://localhost/PlanMilT/admin.php`. A temporary `12345678` password is stored only as a SQLite password hash. The initial password-change requirement is temporarily disabled in `php/endpoints/admin.php`, but the panel still allows changing the password. Since the initial password is known, change it on your first login. By default, the map opens at zoom 12 and center `-21.5699, -51.2457`, with only OpenTopo selected. The administrator can select or clear the other existing base layers to control which ones start visible. The panel also manages SIG services, WMS layer classification, drawings, theme metadata, task sequences, and HGT tiles in `SRTM3/`. Removing tiles affects elevation profiles for that area and cannot be undone. It does not reveal password hashes or image binary data; create images in the theme editor. Back up the database before important deletions.

To populate the layer catalog, run `php tools/catalog-wms-layers.php` and then `php tools/import-wms-layer-catalog.php` from the project root. The first step queries the WMS services and writes a CSV under `storage/`; the second applies pending migrations and imports the snapshot into `bd.db`. Back up the database before the first import. Catalog refreshes are manual and preserve reviews marked complete.

There is no project-specific PHP configuration file; adjust upload and execution limits in the server's active `php.ini` as needed, then restart Apache. Application request failures appear in the browser console; internal PHP diagnostics remain subject to the server's own configuration.

## Features

### User Interface
- **Drawing:** Add polygons, lines, circles, and markers directly to the map.
- **Tactical graphics:** Use the “Gráfico tático” button to open a selector with search, section filters, and a preview of the selected symbol, following the layer catalog pattern. Designation is optional and can be entered in the selector below “Selecionado:”; while drawing, symbology and designation follow the vertices and cursor in a temporary preview. The catalog keeps graphics with distinctive symbology, omits simple symbols replaceable by native drawing tools, and retains only “Air corridor” among airspace coordinating measures.
- **Customization:** Choose colors, icons, and styles for map elements.
- **Administration:** Use `admin.php` to review and manage selected SQLite records; the temporary initial password works only locally and must be changed.
- **Theme creator:** Choose “Criar tema” in the image loader to start, or use “Carregar tema” inside the editor to edit a saved theme. Password-protected themes require the current password; when saving, you can keep the name, rename the theme, or set a new password. Upload or drop an image onto the map, then drag it to position, resize/stretch it from the corners, and rotate it using the top handle. Switch to “Mover mapa” or use the “Controle do mapa” buttons to navigate without moving the image. “Redefinir ajustes” also resets brightness and contrast.
- **Import/Export:** Support for KMZ files.
- **Editing:** Modify text and properties of existing elements.

### Security
The application uses local SQLite storage. Local deployment alone does not replace access controls, backups, and protection against data loss or modification.
The panel login does not change authentication contracts of the legacy application endpoints. Before exposing PlanMilT to the public internet, review protection for every public write operation according to the deployment model.

## Contributions
Contributions are welcome! Feel free to open an issue or submit a pull request on the repository.

### Development tests
Rebuild the local tactical graphics bundle with `npm install` followed by `npm run build:tactical-graphics`.
Node.js is only required to run the JavaScript tests: `node --test tests/js/*.test.js`.
PHP tests are isolated scripts: `php tests/php/map-layer-catalog-service.test.php`, `php tests/php/schema-migrator.test.php`, `php tests/php/admin-service.test.php`, `php tests/php/task-sequences-service.test.php`, `php tests/php/drawings-service.test.php`, and `php tests/php/images-service.test.php`.
Current endpoint methods and payloads are documented in [docs/api-contracts.md](docs/api-contracts.md).

© 2024-2026 - João Marcos Barbosa Oliveira
