/**
 * @fileoverview Registra ferramentas de navegação do mapa, geolocalização e exportação KMZ.
 * @requires Mapa, DOM e módulos PlanMilT carregados previamente.
 */
            /**
             * Aguarda a duração especificada antes de continuar a execução.
             * @param {number} ms - Duração da espera em milissegundos.
             */
            function delay(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            }



            // Geolocalização do usuário
            window.PlanMilT.geolocation.attach({
                map,
                button: document.getElementById('locateMeButton'),
                leaflet: L,
                showError: message => alert(message)
            });






            // Adiciona um ouvinte de evento ao botão de exportação para KMZ
            window.PlanMilT.kmzExport.attach({
                map,
                drawnItems,
                layerRegistry,
                button: document.getElementById('exportKMZ'),
                zipArchive: JSZip,
                sweetAlert: Swal,
                captureCanvas: html2canvas
            });










                // Seleciona os elementos necessários
                var toolbar = document.querySelector('.map-toolbar');
                var drawToolbar = document.querySelectorAll('.leaflet-draw-toolbar');
                var printButton = document.querySelector('.leaflet-control-browser-print');
                var layersControl = document.querySelector('.leaflet-control-layers'); // Seleciona o controle de camadas
                var toggleControlsBtn = document.getElementById('toggleControlsBtn'); // Seleciona o botão de desativar controles
                var freehandButton = freehandControl.getContainer();
                var tacticalGraphicButton = tacticalGraphicsControl.getContainer();
                var measureToggleButton; // Botão de medir distâncias e áreas
                var translateButton = document.querySelector('.google-translate-control'); // Seleciona o botão de tradução

                if (window.innerWidth <= 600) {
                    toolbar.style.display = 'none';
                    drawToolbar.forEach(function(toolbar) {
                        toolbar.style.display = 'none';
                    });
                    if (printButton) printButton.style.display = 'none';
                    if (layersControl) layersControl.style.display = 'none'; // Ocultar controle de camadas
                    if (freehandButton) freehandButton.style.display = 'none'; // Ocultar botão de desenho à mão livre
                    if (tacticalGraphicButton) tacticalGraphicButton.style.display = 'none';
                    if (measureToggleButton) measureToggleButton.style.display = 'none'; // Ocultar botão de medição
                    if (translateButton) translateButton.style.display = 'none'; // Ocultar botão de tradução
                } else {
                    toolbar.style.display = 'flex';
                    drawToolbar.forEach(function(toolbar) {
                        toolbar.style.display = 'block';
                    });
                    if (printButton) printButton.style.display = 'block';
                    if (layersControl) layersControl.style.display = 'block'; // Mostrar controle de camadas
                    if (freehandButton) freehandButton.style.display = 'block'; // Mostrar botão de desenho à mão livre
                    if (tacticalGraphicButton) tacticalGraphicButton.style.display = 'block';
                    if (measureToggleButton) measureToggleButton.style.display = 'block'; // Mostrar botão de medição
                    if (translateButton) translateButton.style.display = 'block'; // Mostrar botão de tradução
                    if (toggleControlsBtn) {
                        toggleControlsBtn.style.display = 'block';
                        toggleControlsBtn.textContent = 'Ocultar Controles';
                    }
                }

                document.getElementById('toggleControlsBtn').addEventListener('click', function() {
                    if (toolbar.style.display === 'none' || toolbar.style.display === '') {
                        toolbar.style.display = 'flex';
                        drawToolbar.forEach(function(toolbar) {
                            toolbar.style.display = 'block'; // Mostrar controles de desenho
                        });
                        if (printButton) printButton.style.display = 'block'; // Mostrar botão de imprimir
                        if (layersControl) layersControl.style.display = 'block'; // Mostrar controle de camadas
                        if (freehandButton) freehandButton.style.display = 'block'; // Mostrar botão de desenho à mão livre
                        if (tacticalGraphicButton) tacticalGraphicButton.style.display = 'block';
                        if (measureToggleButton) measureToggleButton.style.display = 'block'; // Mostrar botão de medição
                        if (translateButton) translateButton.style.display = 'block'; // Mostrar botão de tradução
                        this.textContent = 'Ocultar Controles';
                    } else {
                        toolbar.style.display = 'none';
                        drawToolbar.forEach(function(toolbar) {
                            toolbar.style.display = 'none'; // Ocultar controles de desenho
                        });
                        if (printButton) printButton.style.display = 'none'; // Ocultar botão de imprimir
                        if (layersControl) layersControl.style.display = 'none'; // Ocultar controle de camadas
                        if (freehandButton) freehandButton.style.display = 'none'; // Ocultar botão de desenho à mão livre
                        if (tacticalGraphicButton) tacticalGraphicButton.style.display = 'none';
                        if (measureToggleButton) measureToggleButton.style.display = 'none'; // Ocultar botão de medição
                        if (translateButton) translateButton.style.display = 'none'; // Ocultar botão de tradução
                        this.textContent = 'Mostrar Controles';
                    }
                });





                var customLayers = {}; // Objeto para armazenar as camadas adicionadas dinamicamente

                /**
                 * Carrega a lista de serviços de informação geográfica disponíveis.
                 */
                function getSigsData() {
                    return window.PlanMilT.apiClient.getJson('php/endpoints/sigs.php')
                        .catch(error => {
                            console.error('Erro ao carregar a lista de SIGs:', error);
                            Swal.fire('Erro!', 'Não foi possível carregar a lista de SIGs.', 'error');
                            return [];
                        });
                }

                /**
                 * Carrega e interpreta a lista de camadas de um serviço WMS.
                 * @param {string} wmsURL - URL base do serviço WMS.
                 */
                function getWMSLayers(wmsURL) {
                    return window.PlanMilT.mapLayers.getWMSLayers(wmsURL, {
                        apiClient: window.PlanMilT.apiClient,
                        onError: error => {
                            console.error('Erro ao obter camadas WMS:', error);
                            Swal.fire('Erro!', 'Não foi possível obter as camadas do servidor WMS.', 'error');
                        }
                    });
                }



                /**
                 * Cria, registra e adiciona ao mapa uma camada WMS selecionada.
                 * @param {string} wmsURL - URL base do serviço WMS.
                 * @param {string} layerName - Nome identificador da camada.
                 * @param {string} layerTitle - Título legível da camada.
                 */
                function addWMSLayerToMap(wmsURL, layerName, layerTitle) {
                    var layer = L.tileLayer.wms(wmsURL, {
                        layers: layerName,
                        format: 'image/png',
                        transparent: true,
                        version: '1.1.1'
                    });

                    // Adiciona a camada ao mapa e ao controle de camadas
                    addNewOverlayLayer(layerTitle, layer);

                    // Armazena a camada em customLayers para referência futura
                    customLayers[layerTitle] = layer;
                }












                // Variável global para armazenar as tarefas
