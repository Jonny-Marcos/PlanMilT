# PlanMilT (en)

**PlanMilT** is a web application designed to assist in planning military operations at the tactical level. This application was developed by Captain of Communications Barbosa Oliveira during the Officer Improvement Course at the School of Advanced Officers, aiming to support the teaching of tactical military operation planning.

## Description

PlanMilT leverages the **Leaflet** library and **Geographic Information System (GIS)** tools to offer interactive features such as:

- Creating map drawings (lines, polygons, circles, and markers);
- Importing and exporting files in **KMZ** format;
- Editing text directly on the map;
- Measuring areas and distances;
- Layer and icon customization;
- Geospatial search tools.

The application uses an **SQLite3** database named `bd.db`, which stores all planning information locally on the server, ensuring information security through offline storage.

You can test the application at: **[aescoladatatica.fun](http://aescoladatatica.fun)**.

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

- A web server (Apache, Nginx, etc.) with PHP support.
- SQLite3 database.

### Installation Steps

1. Clone the repository or download the files.
2. Place the files in the web server directory.
3. Ensure the `bd.db` database file is in the configured directory.
4. Set the database permissions for read and write access.

### Running Locally

1. Start the web server.
2. Access the application through a browser at the configured address (e.g., `http://localhost/PlanMilT`).

## Features

### User Interface
- **Drawing:** Add polygons, lines, circles, and markers directly to the map.
- **Customization:** Choose colors, icons, and styles for map elements.
- **Import/Export:** Support for KMZ files.
- **Editing:** Modify text and properties of existing elements.

### Security
The application is designed to operate on local servers, ensuring the confidentiality of stored data.

## Contributions
Contributions are welcome! Feel free to open an issue or submit a pull request on the repository.

---

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

O banco de dados utilizado é um **SQLite3** chamado `bd.db`, que armazena todas as informações de planejamento localmente no servidor, garantindo a segurança da informação por meio de armazenamento offline.

É possível testar a aplicação no endereço: **[aescoladatatica.fun](http://aescoladatatica.fun)**.

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

- Servidor web (Apache, Nginx, etc.) com suporte a PHP.
- Banco de dados SQLite3.

### Passos de Instalação

1. Clone o repositório ou faça o download dos arquivos.
2. Coloque os arquivos no diretório do servidor web.
3. Certifique-se de que o arquivo do banco de dados `bd.db` está no diretório configurado.
4. Configure as permissões do banco de dados para leitura e escrita.

### Executando Localmente

1. Inicie o servidor web.
2. Acesse a aplicação pelo navegador no endereço configurado (ex.: `http://localhost/PlanMilT`).

## Funcionalidades

### Interface do Usuário
- **Desenho:** Adicione polígonos, linhas, círculos e marcadores diretamente no mapa.
- **Personalização:** Escolha cores, ícones e estilos para os elementos do mapa.
- **Importação/Exportação:** Suporte para arquivos KMZ.
- **Edição:** Modifique textos e propriedades dos elementos existentes.

### Segurança
A aplicação foi projetada para operar em servidores locais, garantindo a confidencialidade dos dados armazenados.

## Contribuições
Contribuições são bem-vindas! Sinta-se à vontade para abrir uma issue ou enviar um pull request no repositório.

---

© 2024 - Capitão de Comunicações Barbosa Oliveira
