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

            window.PlanMilT.mapPointInfo.attach({
                map,
                leaflet: L,
                projection: proj4,
                apiClient: window.PlanMilT.apiClient
            });






            // Adiciona um ouvinte de evento ao botão de exportação para KMZ
            window.PlanMilT.kmzExport.attach({
                map,
                drawnItems,
                layerRegistry,
                button: document.getElementById('exportKMZ'),
                zipArchive: JSZip,
                sweetAlert: Swal,
                captureCanvas: html2canvas,
                boundaryLayout: tacticalGraphics.getBoundaryLayout
            });










                // Seleciona os elementos necessários
                var toolbar = document.querySelector('.map-toolbar');
                var printButton = document.querySelector('.leaflet-control-browser-print');
                var layersControl = document.querySelector('.leaflet-control-layers'); // Seleciona o controle de camadas
                var toggleControlsBtn = document.getElementById('toggleControlsBtn'); // Seleciona o botão de desativar controles
                var freehandButton = freehandControl.getContainer();
                var tacticalGraphicButton = tacticalGraphicsControl.getContainer();
                var measureToggleButton; // Botão de medir distâncias e áreas
                var translateButton = document.querySelector('.google-translate-control'); // Seleciona o botão de tradução
                var toggleControlsLabel = document.getElementById('toggleControlsLabel');
                var toggleControlsIcon = document.getElementById('toggleControlsIcon');
                var controlsHidden = window.innerWidth <= 600;

                /**
                 * Atualiza a visibilidade dos controles e o estado acessível do botão.
                 * @param {boolean} hidden - Indica se os controles devem ficar ocultos.
                 */
                function setControlsHidden(hidden) {
                    controlsHidden = hidden;
                    toolbar.classList.toggle('controls-hidden', hidden);
                    document.querySelectorAll('.leaflet-draw-toolbar').forEach(function(drawToolbar) {
                        drawToolbar.style.display = hidden ? 'none' : 'block';
                    });
                    [printButton, layersControl, freehandButton, tacticalGraphicButton, measureToggleButton, translateButton]
                        .forEach(function(control) {
                            if (control) control.style.display = hidden ? 'none' : 'block';
                        });
                    var label = hidden ? 'Mostrar controles' : 'Ocultar controles';
                    toggleControlsLabel.textContent = label;
                    toggleControlsIcon.className = hidden ? 'fas fa-eye' : 'fas fa-eye-slash';
                    toggleControlsBtn.title = label;
                    toggleControlsBtn.setAttribute('aria-pressed', String(hidden));
                }

                setControlsHidden(controlsHidden);
                toggleControlsBtn.addEventListener('click', function() {
                    setControlsHidden(!controlsHidden);
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
