# PlanMilT (pt-br)

**PlanMilT** é uma aplicação web projetada para auxiliar no planejamento de operações militares no nível tático. Esta aplicação foi desenvolvida pelo Capitão de Comunicações Barbosa Oliveira durante o Curso de Aperfeiçoamento de Oficiais da Escola de Aperfeiçoamento de Oficiais, com o objetivo de apoiar o ensino do planejamento de operações militares no nível tático.

## Descrição

O PlanMilT utiliza a biblioteca **Leaflet** e ferramentas de **Sistema de Informação Geográfica (SIG)** para oferecer funcionalidades interativas, como:

- Criação de desenhos no mapa (linhas, polígonos, círculos e marcadores);
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

Não há um arquivo de configuração PHP específico do projeto: ajuste os limites de upload e execução no `php.ini` ativo do servidor conforme a necessidade e reinicie o Apache. Falhas das requisições da aplicação são exibidas no console do navegador; erros internos do PHP permanecem sujeitos à configuração de diagnóstico do servidor.

## Funcionalidades

### Interface do Usuário
- **Desenho:** Adicione polígonos, linhas, círculos e marcadores diretamente no mapa.
- **Personalização:** Escolha cores, ícones e estilos para os elementos do mapa.
- **Importação/Exportação:** Suporte para arquivos KMZ.
- **Edição:** Modifique textos e propriedades dos elementos existentes.

### Segurança
A aplicação usa armazenamento local SQLite. O armazenamento local, por si só, não substitui controles de acesso, backup e proteção contra alterações ou perdas.

## Contribuições
Contribuições são bem-vindas! Sinta-se à vontade para abrir uma issue ou enviar um pull request no repositório.

### Testes de desenvolvimento
Node.js é necessário apenas para executar os testes JavaScript: `node --test tests/js/*.test.js`.
Os métodos e formatos atuais dos endpoints estão registrados em [docs/api-contracts.md](docs/api-contracts.md).

---

# PlanMilT (en)

**PlanMilT** is a web application designed to assist in planning military operations at the tactical level. This application was developed by Captain of Communications Barbosa Oliveira (Brazilian Army) during the Officer Improvement Course at the Escola de Aperfeiçoamento de Oficiais (2024), aiming to support the teaching of tactical military operation planning.

## Description

PlanMilT leverages the **Leaflet** library and **Geographic Information System (GIS)** tools to offer interactive features such as:

- Creating map drawings (lines, polygons, circles, and markers);
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

There is no project-specific PHP configuration file; adjust upload and execution limits in the server's active `php.ini` as needed, then restart Apache. Application request failures appear in the browser console; internal PHP diagnostics remain subject to the server's own configuration.

## Features

### User Interface
- **Drawing:** Add polygons, lines, circles, and markers directly to the map.
- **Customization:** Choose colors, icons, and styles for map elements.
- **Import/Export:** Support for KMZ files.
- **Editing:** Modify text and properties of existing elements.

### Security
The application uses local SQLite storage. Local deployment alone does not replace access controls, backups, and protection against data loss or modification.

## Contributions
Contributions are welcome! Feel free to open an issue or submit a pull request on the repository.

### Development tests
Node.js is only required to run the JavaScript tests: `node --test tests/js/*.test.js`.
Current endpoint methods and payloads are documented in [docs/api-contracts.md](docs/api-contracts.md).

© 2024-2026 - João Marcos Barbosa Oliveira
