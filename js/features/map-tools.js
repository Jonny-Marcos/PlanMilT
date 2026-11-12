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
                var mobileMeasureControl = measureControl.getContainer();
                var translateButton = document.querySelector('.google-translate-control'); // Seleciona o botão de tradução
                var toggleControlsLabel = document.getElementById('toggleControlsLabel');
                var toggleControlsIcon = document.getElementById('toggleControlsIcon');
                var controlsHidden = false;
                var mobileLayout = window.matchMedia('(max-width: 600px), (hover: none) and (pointer: coarse)');
                var mobilePanel = '';
                var mobileHidden = false;
                var drawActive = false;
                var freehandActive = false;
                var mobileButtons = toolbar.querySelectorAll('[data-mobile-panel]');
                var mobileToggle = document.getElementById('mobileToggleControls');
                var mobileLayerSlot = toolbar.querySelector('.mobile-layer-slot');
                var layerPlaceholder = document.createComment('Controle de camadas');
                layersControl.parentNode.insertBefore(layerPlaceholder, layersControl);

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

                /**
                 * Atualiza a barra móvel sem recriar controles Leaflet ou camadas.
                 */
                function updateMobileControls() {
                    var panel = mobileHidden ? '' : mobilePanel;
                    toolbar.dataset.mobilePanel = panel;
                    toolbar.classList.toggle('mobile-controls-hidden', mobileHidden);
                    document.body.classList.toggle('mobile-map-draw', panel === 'draw' || drawActive);
                    mobileButtons.forEach(function(button) {
                        button.setAttribute('aria-expanded', String(button.dataset.mobilePanel === panel));
                    });
                    var label = mobileHidden ? 'Mostrar controles' : 'Ocultar controles';
                    mobileToggle.setAttribute('aria-label', label);
                    mobileToggle.title = label;
                    mobileToggle.firstElementChild.className = mobileHidden ? 'fas fa-eye' : 'fas fa-eye-slash';
                    if (freehandButton) freehandButton.style.display = panel === 'draw' || freehandActive ? 'flex' : 'none';
                    if (tacticalGraphicButton) tacticalGraphicButton.style.display = panel === 'draw' ? 'flex' : 'none';
                    [printButton, mobileMeasureControl, translateButton].forEach(function(control) {
                        if (control) control.style.display = panel === 'tools' ? 'block' : 'none';
                    });
                }

                /**
                 * Alterna a disposição móvel e devolve o controle de camadas ao Leaflet no desktop.
                 */
                function updateControlLayout() {
                    document.body.classList.toggle('mobile-map-ui', mobileLayout.matches);
                    if (mobileLayout.matches) {
                        var desktopHidden = controlsHidden;
                        setControlsHidden(false);
                        controlsHidden = desktopHidden;
                        mobileLayerSlot.appendChild(layersControl);
                        updateMobileControls();
                    } else {
                        layerPlaceholder.parentNode.insertBefore(layersControl, layerPlaceholder.nextSibling);
                        document.body.classList.remove('mobile-map-draw');
                        mobileMeasureControl.style.display = '';
                        setControlsHidden(controlsHidden);
                    }
                }

                mobileButtons.forEach(function(button) {
                    button.addEventListener('click', function() {
                        mobilePanel = mobilePanel === button.dataset.mobilePanel ? '' : button.dataset.mobilePanel;
                        updateMobileControls();
                    });
                });
                mobileToggle.addEventListener('click', function() {
                    mobileHidden = !mobileHidden;
                    if (mobileHidden) mobilePanel = '';
                    updateMobileControls();
                });
                map.on('draw:drawstart draw:editstart draw:deletestart', function() {
                    drawActive = true;
                    if (mobileLayout.matches) {
                        mobilePanel = '';
                        updateMobileControls();
                    }
                });
                map.on('draw:drawstop draw:editstop draw:deletestop', function() {
                    drawActive = false;
                    if (mobileLayout.matches) updateMobileControls();
                });
                map.on('planmilt:freehand-mode', function(event) {
                    freehandActive = event.enabled;
                    if (mobileLayout.matches) {
                        if (freehandActive) mobilePanel = '';
                        updateMobileControls();
                    }
                });
                document.addEventListener('keydown', function(event) {
                    if ((event.key === 'Enter' || event.key === ' ')
                        && event.target.matches('.toolbar-icon[role="button"]')) {
                        event.preventDefault();
                        event.target.click();
                    }
                });
                L.DomEvent.disableScrollPropagation(toolbar);
                mobileLayout.addEventListener('change', updateControlLayout);
                updateControlLayout();
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
