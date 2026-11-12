# PlanMilT (pt-br)

**PlanMilT** é uma aplicação web projetada para auxiliar no planejamento de operações militares no nível tático. Esta aplicação foi desenvolvida pelo Capitão de Comunicações Barbosa Oliveira durante o Curso de Aperfeiçoamento de Oficiais da Escola de Aperfeiçoamento de Oficiais, com o objetivo de apoiar o ensino do planejamento de operações militares no nível tático.

## Descrição

O PlanMilT utiliza a biblioteca **Leaflet** e ferramentas de **Sistema de Informação Geográfica (SIG)** para oferecer funcionalidades interativas, como:

- Criação de desenhos no mapa (linhas, polígonos, círculos e marcadores);
- Polígonos, retângulos e círculos oferecem preenchimento sólido, em X, diagonal ou pontos. Os pontos são apenas um estilo visual, sem significado doutrinário atribuído pelo aplicativo: consulte a medida específica na APP-6 antes de usá-los como simbologia militar. Ao cancelar o seletor, o desenho mantém seu estilo inicial;
- O último estado do mapa é guardado automaticamente no IndexedDB deste navegador e recuperado ao abrir o aplicativo: desenhos editáveis, coberturas, sugestões, camadas presentes e sua visibilidade, imagens carregadas e enquadramento. As alterações são agrupadas por aproximadamente meio segundo; o armazenamento pode ser limitado ou apagado pelo navegador, portanto continue salvando planejamentos no servidor. Se houver erro ou falta de espaço, um aviso é exibido e a cópia anterior não é substituída. O estado local é separado por instalação; em abas simultâneas prevalece a última gravação. Links compartilhados adicionam suas camadas ao rascunho restaurado;
- No primeiro salvamento manual após abrir ou recarregar a página, é possível habilitar o salvamento automático no servidor. Enquanto estiver ativo, o botão de salvar fica verde. O aplicativo verifica alterações nos desenhos e coberturas a cada 15 segundos e as envia ao identificador do último salvamento manual; camadas e imagens externas não fazem parte desse envio. A opção dura até recarregar a página. O salvamento é pausado ao carregar desenhos para edição, ao cancelar a confirmação de desenho vazio ou quando ocorre uma falha; salve manualmente para retomá-lo. Como não há controle de conflito no servidor, alterações no mesmo planejamento feitas em outra aba ou dispositivo podem ser sobrescritas;
- A recuperação inclui cópias locais das imagens já autorizadas, inclusive protegidas por senha, sem guardar senha ou token. Essas cópias e os desenhos ficam acessíveis a quem usar o mesmo perfil do navegador, inclusive após alteração da senha no servidor; remova as camadas ou limpe os dados do site em computadores compartilhados. Camadas WMS são novamente consultadas no serviço remoto; URLs que contenham credenciais não são guardadas e impedem a atualização do rascunho até a camada ser removida;
- Inclusão de gráficos táticos doutrinários (FM 1-02.2 / APP-06) com apoio da biblioteca `@zaes/tactical-graphics`, preservando as ferramentas nativas do Leaflet Draw; limites permitem escolher de 1 a 100 símbolos igualmente espaçados e editar seus nomes, escalão e quantidade clicando na linha. Para aproveitar uma linha desenhada à mão livre ou pela ferramenta de linha, selecione “Limite” no menu de estilo e configure o limite; ao cancelar a configuração, a linha é mantida. Em zooms afastados, símbolos próximos podem se sobrepor e as lacunas podem se unir;
- O seletor destaca até dez gráficos táticos mais criados neste navegador. O catálogo de camadas abre com até 50 camadas WMS adicionadas recentemente; escolha uma categoria para ver as recomendações ou pesquise no catálogo. Sem histórico, mostra as recomendações. Esses históricos ficam no `localStorage`, isolados por caminho de instalação, e podem ser apagados ao limpar os dados do navegador; não incluem desenhos nem URLs de serviços;
- Em “Limites”, selecione “Ponto de coordenação”, clique no centro e arraste como ao desenhar um círculo. O diâmetro pode variar de 1 a 100.000 m e a cor é a selecionada para desenho.
- Na exportação KMZ, limites, gráficos táticos, linhas tracejadas ou pontilhadas e áreas com preenchimento em X, diagonal ou pontos são imagens PNG transparentes georreferenciadas, inclusive fora da área visível. Linhas e áreas sólidas permanecem vetoriais, preservando a cor, a opacidade e os furos das áreas. Textos formatados continuam exportados como rótulos KML simples; sua formatação não é preservada. As imagens mantêm a escala do zoom de exportação e podem perder nitidez quando ampliadas; ao reimportar, são imagens não editáveis. Para limitar memória, a exportação admite até 64 × 1024² pixels rasterizados no total: caso exceda, afaste o zoom e tente novamente. Desenhos rasterizados que cruzam o antimeridiano ou se aproximam dos limites de ±85° são recusados;
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
- Extensões PHP PDO SQLite (`pdo_sqlite`), cURL (`curl`) e zlib habilitadas.
- Módulos Apache `mod_rewrite` e autorização para regras `.htaccess` (`AllowOverride All`, ou as permissões equivalentes para `FileInfo`, `AuthConfig` e `Options`).
- Permissão de leitura e escrita no arquivo `bd.db` e em seu diretório para o usuário do Apache.
- Permissão de escrita em `SRTM3/` para receber arquivos de elevação.

### Instalação no WAMP ou LAMP

1. Copie ou clone todos os arquivos do projeto para um diretório publicado pelo Apache, por exemplo `www/PlanMilT` no WAMP ou `htdocs/PlanMilT` no XAMPP.
2. No `php.ini` usado pelo Apache, habilite `pdo_sqlite`, `curl` e zlib quando necessário. Reinicie o Apache depois de alterar a configuração.
3. Habilite o módulo Apache `mod_rewrite` e permita as diretivas necessárias do `.htaccess` no VirtualHost ou na configuração do servidor.
4. Garanta que o usuário do Apache possa ler os arquivos do projeto e gravar em `bd.db`, no diretório que contém esse banco e em `SRTM3/`.
5. Acesse `http://localhost/PlanMilT/` ou o endereço configurado no servidor.

Antes de atualizar uma instalação existente, faça uma cópia de segurança de `bd.db`. Na primeira conexão ao banco após a atualização, o PlanMilT aplica migrações versionadas que renomeiam tabelas e colunas para inglês, adicionam timestamps, inicializam a conta administrativa e criam as preferências do mapa, preservando os registros existentes. Se encontrar chaves duplicadas que impeçam os índices únicos, a migração falha sem apagar registros; corrija o conflito manualmente após backup e tente novamente.

O painel fica em `http://localhost/PlanMilT/admin.php`. Na primeira instalação, a senha temporária é `12345678`, armazenada no SQLite somente como hash. A exigência de troca inicial está temporariamente desativada em `php/endpoints/admin.php`, mas o painel ainda permite alterá-la. Como a senha inicial é conhecida, troque-a logo no primeiro acesso. O mapa abre por padrão no zoom 12 e centro `-21.5699, -51.2457`, com somente OpenTopo selecionada. No painel, o administrador pode marcar ou desmarcar as demais camadas-base atuais para controlar quais iniciam visíveis. As listas administrativas permitem pesquisa por texto, campo e correspondência parcial ou exata. Em arquivos de elevação, é possível pesquisar tiles e enviar até dez arquivos HGT SRTM1/SRTM3 por vez (até 120 MiB no total); arquivos existentes não são substituídos e arquivos inválidos são rejeitados. Para uploads, configure o PHP do Apache com `upload_max_filesize` de pelo menos 25 MiB, `post_max_size` de pelo menos 128 MiB e `max_file_uploads` de pelo menos 10. O painel também permite administrar serviços SIG, classificação de camadas WMS, desenhos, metadados de temas, sequências de tarefas e tiles em `SRTM3/`. A remoção de tiles afeta os perfis de elevação da região e não pode ser desfeita. Não mostra hashes de senhas nem o conteúdo binário das imagens; criação de imagens continua no editor de temas. Faça backup do banco antes de exclusões importantes.

Para popular o catálogo de camadas na instalação, execute na raiz do projeto `php tools/catalog-wms-layers.php` e depois `php tools/import-wms-layer-catalog.php`. A primeira etapa consulta os WMS e grava o CSV em `storage/`; a segunda aplica as migrações pendentes e importa o snapshot para `bd.db`. Faça backup antes da primeira importação. Atualizações futuras do catálogo são manuais e mantêm revisões já marcadas como concluídas.

Não há um arquivo de configuração PHP específico do projeto: ajuste os limites de upload e execução no `php.ini` ativo do servidor conforme a necessidade e reinicie o Apache. Falhas das requisições da aplicação são exibidas no console do navegador; erros internos do PHP permanecem sujeitos à configuração de diagnóstico do servidor.

## Funcionalidades

### Interface do Usuário
- **Boas-vindas e ajuda:** Na abertura, a tela inicial apresenta uma dica aleatória e até dez planejamentos salvos ou carregados neste navegador, com acesso direto ao carregamento em edição ou como camada. A opção “Aparecer mensagem de boas-vindas ao abrir” pode ser alterada na própria tela ou em Ajuda. O botão de ajuda abre um guia organizado por assuntos e permite reabrir as boas-vindas e os recentes. A lista e a preferência ficam no `localStorage` desta instalação, sem senhas nem cópias dos desenhos, e podem ser apagadas ao limpar os dados do navegador. Links compartilhados são processados antes da tela inicial; ela não interrompe um diálogo já aberto.
- **Mapa:** Ocupa a área disponível da janela, sem ocultar as barras do navegador. Use o ícone de olho na barra de ferramentas para ocultar ou mostrar os controles; em telas pequenas eles começam ocultos, mas o ícone permanece disponível. Os ícones dos controles diminuem progressivamente conforme a largura da tela.
- **Visualizador 3D:** Use o ícone de cubo ao lado de Ajuda para abrir a visualização integrada somente leitura e “Voltar ao mapa” para retornar à edição. Escolha OpenTopoMap (padrão) ou BDGEx - CTM50: desenhos, ícones, sugestões de planejamento e coberturas de rádio visíveis são incorporados à imagem da camada-base sobre o relevo SRTM. Outras imagens e camadas não são incluídas; ícones externos a outro domínio não são suportados. Ative as camadas desejadas no mapa 2D antes de abrir ou atualizar o 3D. Arraste para orbitar, arraste com o botão do meio para deslocar e use a roda para aproximar; no touch, use um dedo para orbitar e dois dedos para deslocar ou pinçar. O exagero vertical vai de 1× a 10× (padrão 5×). “Ajustar zoom da camada-base” começa no zoom do mapa 2D e permite solicitar tiles mais detalhados sem mudar a câmera. A imagem final continua limitada a 2048 pixels por lado; acima de 256 tiles, confirme o carregamento, que pode ser demorado. Fechar o 3D ou atualizar cancela as requisições em andamento. “Atualizar” usa novamente o enquadramento do mapa 2D. O terreno limita-se a uma área de até 5° por eixo; tiles ausentes são baixados automaticamente usando o fluxo de elevação existente, que oferece upload se o download falhar. Se o upload for cancelado, os tiles ainda ausentes são informados e as amostras faltantes interpoladas. O navegador busca os tiles diretamente, sem proxy: os serviços recebem a região solicitada e precisam permitir CORS. Falhas são exibidas no visualizador.
- Em telas pequenas, use “Ocultar controles” no visualizador 3D para liberar espaço e “Mostrar controles” para acessá-los novamente. Atribuições, avisos e erros permanecem visíveis.
- **Dados do ponto:** Clique com o botão direito no mapa ou mantenha o toque pressionado no celular para consultar coordenadas WGS84 em graus decimais, graus/minutos/segundos e UTM, além da elevação dos arquivos SRTM locais. A opção Street View abre o Google Maps em outra aba e envia a coordenada selecionada ao Google; a disponibilidade de imagens depende da cobertura do serviço.
- **Arquivos de elevação:** Quando faltar um tile, a aplicação tenta baixá-lo automaticamente da [Mapzen Terrain Tiles na AWS](https://registry.opendata.aws/terrain-tiles/); se falhar, oferece upload manual. A consulta revela ao provedor a região aproximada do tile (1° × 1°). O serviço combina SRTM e outras fontes, com [atribuições e licenças específicas](https://github.com/tilezen/joerd/blob/master/docs/attribution.md); não é exclusivamente uma base da NASA. A grade de 30 m é subamostrada para 90 m, sem substituir arquivos existentes. O download requer acesso HTTPS externo, cURL, zlib e escrita em `SRTM3/`; é limitado a 32 tiles por operação e a 1 GiB de arquivos HGT no diretório. A função é acessível a todos os usuários da aplicação.
- **Predição de cobertura:** Em “Predição de Enlace”, escolha a resolução angular: Pequena (Rápida), com 72 radiais; Média (Padrão), com 180; ou Alta (Lenta), com 360. A opção aplica-se à área de cobertura RF e ótica, não ao enlace ponto a ponto. A análise mostra o andamento das radiais e uma estimativa do tempo dessa etapa. A consulta inicial de elevação e a exibição final não possuem estimativa de duração.
- **Salvamento de coberturas:** Novas predições manuais são desenhadas diretamente em PNG transparente georreferenciado e salvas com o planejamento; o KMZ inclui a imagem automaticamente, independentemente da captura opcional do mapa. Clique em uma nova cobertura RF para consultar a potência recebida aproximada em dBm da amostra mais próxima. As amostras são salvas com o planejamento e compartilhadas com ele, mas não são incluídas no KMZ. Imagens RF antigas não contêm os valores: para consultá-los, refaça a predição. No modo ótico, o popup mantém a resolução radial. A cor RF representa a margem sobre a sensibilidade. Coberturas antigas em polígonos permanecem compatíveis e não são convertidas. São usados até 200 passos por radial: com 72, 180 ou 360 radiais, o máximo é, respectivamente, 14.472, 36.180 ou 72.360 pontos, incluindo os centros. Em 100 km, o espaçamento ao longo de cada radial é de 500 m para todas as opções; a escolha aumenta a precisão angular, não a precisão ao longo das radiais. A resolução adaptativa reduz o custo, mas pode omitir detalhes do relevo; a imagem tem 1024 × 1024 pixels. Áreas que cruzem o antimeridiano ou ultrapassem 85° de latitude são recusadas. Muitas imagens ainda podem ultrapassar `post_max_size` ou outros limites do servidor.
- **Penetração/Difração:** Na cobertura RF e na sugestão de repetidoras, escolha Alta (Otimista), Média (Equilibrada) ou Baixa (Pessimista); sequências antigas usam Média. O mesmo cenário é usado nos contornos e na validação dos enlaces das repetidoras. A visada ótica continua independente dessa escolha.

  O modelo RF é uma aproximação terrestre, não calibrada: combina perda em espaço livre com difração pelo obstáculo dominante (aproximação de gume de faca) e uma perda ambiental fixa. As faixas são HF (3 a <30 MHz), VHF (30 a <300 MHz), UHF (300 a <3.000 MHz) e SHF (3.000 a <30.000 MHz). A perda ambiental básica para Alta/Média/Baixa é 2/6/12 dB, multiplicada respectivamente por 0,5/0,75/1/1,3 nas quatro faixas; a perda de difração é multiplicada por 0,7/1/1,3 conforme o cenário. Não são modeladas propagação ionosférica ou onda de superfície em HF, edificações, vegetação, clima ou múltiplos obstáculos. O resultado não garante cobertura real e deve ser validado em campo; a ferramenta geométrica de cobertura por raio não é uma análise RF.
- **Desenho:** Adicione polígonos, linhas, círculos e marcadores diretamente no mapa.
- **Selecionar ícone:** Os ícones existentes estão divididos em Amigo e Inimigo e, em cada grupo, por Infantaria, Cavalaria, Artilharia, Engenharia, Logística, Comunicações e Aviação. Ícones ainda não classificados aparecem ao abrir sua afiliação; os ícones de C2 aparecem em Comunicações como grupo comum, sem afiliação presumida. Os caminhos dos ícones e os planejamentos existentes não mudam.
- **Criar ícone:** Use “Criar ícone” para escolher uma categoria e um ícone central ou exemplo doutrinário do Portal de Simbologia Militar e ajustar afiliação, escalão, situação e modificadores. Em “Amplificadores textuais”, informe opcionalmente designação, subordinação, informações adicionais, GDH, credibilidade, localização, altitude/profundidade e velocidade; o gerador posiciona os textos ao redor do símbolo conforme seu tipo. A busca ignora acentos. O gerador e os catálogos brasileiros são locais e funcionam sem internet; incluem extensões brasileiras de SIDC. Após confirmar, use a ferramenta de marcador e escolha “Ícone”; os ícones existentes continuam disponíveis. A bandeja “Ícones gerados anteriormente”, no criador e no seletor de ícones, guarda automaticamente até 100 configurações distintas neste navegador, sem sincronização; as mais antigas saem da bandeja ao atingir o limite. Os modelos brasileiros salvos anteriormente também aparecem inicialmente, sem apagar os dados originais. Limpar os dados do navegador pode apagar a bandeja; excluir um item dela não remove símbolos do mapa. Clique em um ícone criado na camada de desenho para editá-lo. O planejamento salvo contém imagem e dados de edição; camadas compartilhadas exibem a imagem e o KMZ inclui PNGs posicionados. Ao importar KMZ, os símbolos são imagens não editáveis. O gerador é uma adaptação dos arquivos compilados do [Portal de Simbologia Militar](https://simbologia.eb.mil.br/), sob a licença em `js/library/simbologia/LICENCE.txt`; consulte o portal e a doutrina aplicável para validação.
  Em “Buscar tipo”, a pesquisa filtra a categoria e o catálogo selecionados; os resultados aparecem em ordem alfabética em “Tipo de símbolo”. Se o tipo atual não estiver entre eles, selecione um resultado ou limpe a busca antes de confirmar.
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
Para atualizar o bundle local da biblioteca de gráficos táticos, execute `npm install` e depois `npm run build:tactical-graphics`. O comando `npm run build:brazilian-symbols` reconstrói o adaptador e o catálogo compacto de ícones a partir dos arquivos do portal em `js/library/simbologia/`; ele verifica a versão esperada do bundle e falha caso ela mude.

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
- PHP PDO SQLite (`pdo_sqlite`), cURL (`curl`) and zlib extensions enabled.
- Apache `mod_rewrite` and permission to use `.htaccess` rules (`AllowOverride All`, or equivalent permissions for `FileInfo`, `AuthConfig` and `Options`).
- Read and write access to `bd.db` and its parent directory for the Apache user.
- Write access to `SRTM3/` for elevation file uploads and downloads.

### Installation on WAMP or LAMP

1. Copy or clone all project files into a directory published by Apache, such as WAMP's `www/PlanMilT` or XAMPP's `htdocs/PlanMilT`.
2. Enable `pdo_sqlite`, `curl` and zlib as needed in the `php.ini` used by Apache, then restart Apache.
3. Enable Apache's `mod_rewrite` module and allow the required `.htaccess` directives in the VirtualHost or server configuration.
4. Ensure the Apache user can read the project files and write to `bd.db`, its containing directory, and `SRTM3/`.
5. Open `http://localhost/PlanMilT/` or the address configured on the server.

Back up `bd.db` before updating an existing installation. On the first database connection after the update, PlanMilT applies versioned migrations that rename tables and columns to English, add timestamps, initialize the administrator account, and create map preferences while preserving existing records. If duplicate keys prevent unique indexes, migration fails without deleting records; resolve the conflict manually after backing up, then retry.

The administration panel is available at `http://localhost/PlanMilT/admin.php`. A temporary `12345678` password is stored only as a SQLite password hash. The initial password-change requirement is temporarily disabled in `php/endpoints/admin.php`, but the panel still allows changing the password. Since the initial password is known, change it on your first login. By default, the map opens at zoom 12 and center `-21.5699, -51.2457`, with only OpenTopo selected. The administrator can select or clear the other existing base layers to control which ones start visible. Administrative lists support text search by field with partial or exact matching. Elevation tiles can be searched and up to ten valid SRTM1/SRTM3 HGT files uploaded at once (up to 120 MiB total); existing tiles are not overwritten and invalid files are rejected. For uploads, configure the Apache PHP runtime with `upload_max_filesize` of at least 25 MiB, `post_max_size` of at least 128 MiB, and `max_file_uploads` of at least 10. The panel also manages SIG services, WMS layer classification, drawings, theme metadata, task sequences, and HGT tiles in `SRTM3/`. Removing tiles affects elevation profiles for that area and cannot be undone. It does not reveal password hashes or image binary data; create images in the theme editor. Back up the database before important deletions.

To populate the layer catalog, run `php tools/catalog-wms-layers.php` and then `php tools/import-wms-layer-catalog.php` from the project root. The first step queries the WMS services and writes a CSV under `storage/`; the second applies pending migrations and imports the snapshot into `bd.db`. Back up the database before the first import. Catalog refreshes are manual and preserve reviews marked complete.

There is no project-specific PHP configuration file; adjust upload and execution limits in the server's active `php.ini` as needed, then restart Apache. Application request failures appear in the browser console; internal PHP diagnostics remain subject to the server's own configuration.

## Features

### User Interface
- **Drawing:** Add polygons, lines, circles, and markers directly to the map.
- **3D viewer:** Use the cube icon beside Help to open an integrated read-only view and “Voltar ao mapa” to return to editing. Select OpenTopoMap (default) or BDGEx - CTM50: visible drawings, icons, planning suggestions and radio coverage are incorporated into the base image over SRTM terrain. Other images and layers are excluded; cross-origin icons are not supported. Enable the desired layers in the 2D map before opening or refreshing the 3D view. Drag to orbit, middle-drag to pan and use the wheel to zoom; on touch devices use one finger to orbit and two to pan or pinch. Vertical exaggeration ranges from 1× to 10× (default 5×). “Ajustar zoom da camada-base” starts at the 2D map zoom and requests more detailed tiles without moving the camera. The final image is still limited to 2048 pixels per side; requests above 256 tiles require confirmation and can take a long time. Closing or refreshing the viewer cancels pending requests. “Atualizar” uses the current 2D map extent. The terrain is limited to five degrees per axis; missing tiles are downloaded automatically using the existing elevation workflow, with manual upload offered if downloads fail. Remaining missing tiles are reported and missing samples interpolated. The browser requests tiles directly without a proxy: providers receive the requested region and must allow CORS. Failures are reported in the viewer.
- On small screens, use “Ocultar controles” in the 3D viewer to free space and “Mostrar controles” to reopen them. Attribution, warnings and errors remain visible.
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
