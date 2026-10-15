/**
 * @fileoverview Gerencia camadas WMS dinâmicas, camadas compartilhadas atualizáveis e consulta GetFeatureInfo.
 * @requires Leaflet, proxy.php, API client, mapa e layerRegistry no escopo legado.
 */
                var selectedLayers = []; // Agora é um array para armazenar múltiplos usuários
                var intervalId;     // Variável para armazenar o intervalo de atualização
                var previousGeoJsonData = {}; // Para armazenar o estado anterior da camada carregada

                // Função para gerar um hash de um objeto GeoJSON
                /**
                 * Cria a representação usada para detectar mudanças no GeoJSON.
                 * @param {Object} geoJsonObject - Objeto GeoJSON a validar ou comparar.
                 */
                function generateGeoJsonHash(geoJsonObject) {
                    return JSON.stringify(geoJsonObject);  // Pode usar uma função de hash mais sofisticada, se necessário
                }

                /**
                 * Recarrega as camadas selecionadas e substitui as versões que mudaram.
                 */
                async function reloadLayer() {
                    if (!selectedLayers || selectedLayers.length === 0) {
                        Swal.fire('Nenhum usuário fornecido!', 'Por favor, insira pelo menos um nome de usuário para carregar a camada.', 'warning');
                        return;
                    }

                    for (const layerName of selectedLayers) {
                        try {
                            const response = await window.PlanMilT.apiClient.request("/carregar.php", {
                                method: "POST",
                                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                body: `usuario=${encodeURIComponent(layerName)}`
                            });

                            if (!response.ok) {
                                const errorMessage = await response.text();
                                Swal.fire('Erro no servidor', `Erro ao carregar o usuário ${layerName}: ${errorMessage}`, 'error');
                                continue; // Pula para o próximo usuário
                            }

                            const geoJsonData = await response.json();

                            if (!isValidGeoJson(geoJsonData)) {
                                const errorMessage = typeof geoJsonData === 'string' ? geoJsonData : 'A camada carregada não é um GeoJSON válido.';
                                Swal.fire('Erro', `Erro no usuário ${layerName}: ${errorMessage}`, 'error');
                                continue; // Pula para o próximo usuário
                            }

                            const currentGeoJsonHash = generateGeoJsonHash(geoJsonData);

                            if (currentGeoJsonHash !== previousGeoJsonData[layerName]) {
                                // Se houver mudanças, remover a camada anterior
                                if (layerRegistry[layerName]) {
                                    map.removeLayer(layerRegistry[layerName]);
                                    layerControl.removeLayer(layerRegistry[layerName]); // Remove a camada do controle de camadas
                                    delete layerRegistry[layerName];  // Remove do registro
                                }

                                // Processar os dados do GeoJSON e adicionar ao mapa como camada não-editável
                                const newLayer = L.geoJson(null);

                                L.geoJson(geoJsonData, {
                                    onEachFeature: function (feature, layer) {
                                        if (feature.geometry.type === 'Point' && Object.keys(feature.properties).length === 0) {
                                            var emptyIcon = L.divIcon({ html: '', className: 'empty-icon', iconSize: [0, 0] });
                                            layer.setIcon(emptyIcon);
                                            newLayer.addLayer(layer);
                                        } else if (feature.geometry.type === 'Point' && feature.properties.shape === 'circle') {
                                            var newCircle = L.circle([feature.properties.center[0], feature.properties.center[1]], {
                                                color: feature.properties.color,
                                                fillColor: feature.properties.color,
                                                fillOpacity: 0.5,
                                                radius: feature.properties.radius
                                            });
                                            newLayer.addLayer(newCircle);
                                        } else if (feature.properties.text && feature.geometry.type === 'Point' && !feature.properties.iconUrl) {
                                            var customIcon = L.divIcon({
                                                className: 'custom-text-label',
                                                html: feature.properties.text,
                                                iconSize: [100, 30],
                                                iconAnchor: [15, 15]
                                            });
                                            layer.setIcon(customIcon);
                                            newLayer.addLayer(layer);
                                        } else if (feature.geometry.type === 'Point' && feature.properties.iconUrl) {
                                            var customIcon = L.icon({
                                                iconUrl: feature.properties.iconUrl,
                                                iconSize: [40, 40],
                                                iconAnchor: [15, 15]
                                            });
                                            layer.setIcon(customIcon);
                                            newLayer.addLayer(layer);
                                        } else if (feature.geometry.type === 'LineString' || feature.geometry.type === 'Polygon') {
                                            layer.setStyle({ color: feature.properties.color });
                                            newLayer.addLayer(layer);
                                        }
                                    }
                                });

                                // Atualiza o estado anterior com o novo hash do GeoJSON
                                previousGeoJsonData[layerName] = currentGeoJsonHash;

                                // Adiciona a nova camada ao controle de camadas existente
                                addNewOverlayLayer(layerName, newLayer);

                                // Registra a camada no registry e adiciona ao mapa
                                layerRegistry[layerName] = newLayer;
                                map.addLayer(newLayer);

                                // Exibir popup informando que a camada foi atualizada
                                Swal.fire('Camada Atualizada!', `A camada "${layerName}" foi atualizada com sucesso.`, 'info');
                            }

                        } catch (error) {
                            console.error(`Erro ao atualizar a camada para o usuário ${layerName}:`, error);
                        }
                    }
                }


                // Função para verificar se o objeto é um GeoJSON válido
                /**
                 * Verifica se o objeto tem a estrutura mínima esperada de GeoJSON.
                 * @param {Object} geoJsonObject - Objeto GeoJSON a validar ou comparar.
                 */
                function isValidGeoJson(geoJsonObject) {
                    return geoJsonObject && typeof geoJsonObject === 'object' &&
                        (geoJsonObject.type === 'Feature' || geoJsonObject.type === 'FeatureCollection') &&
                        (geoJsonObject.type === 'FeatureCollection' ? geoJsonObject.features && Array.isArray(geoJsonObject.features) : true);
                }

                // Função para solicitar os nomes dos usuários e configurar o tempo de atualização
                /**
                 * Solicita usuários e intervalo para recarregar camadas periodicamente.
                 */
                function promptUserAndUpdate() {
                    Swal.fire({
                        title: 'Nome(s) de usuário(s)',
                        input: 'text',
                        inputLabel: 'Insira o nome do usuário. Caso existam mais de um, separe os nomes com vírgula. Exemplo: "sca,ge".',
                        inputPlaceholder: 'teste,teste2',
                        showCancelButton: true,
                        confirmButtonText: 'Carregar Camada(s)',
                        preConfirm: (usernameInput) => {
                            if (!usernameInput) {
                                Swal.showValidationMessage('Por favor, insira pelo menos um nome de usuário válido.');
                                return false;
                            }
                            const usernames = usernameInput.split(',').map(name => name.trim()).filter(name => name !== '');
                            if (usernames.length === 0) {
                                Swal.showValidationMessage('Por favor, insira pelo menos um nome de usuário válido.');
                                return false;
                            }
                            return usernames;
                        }
                    }).then((result) => {
                        if (result.isConfirmed) {
                            selectedLayers = result.value;

                            // Solicitar o intervalo de atualização
                            Swal.fire({
                                title: 'Configurar Intervalo de Atualização',
                                input: 'number',
                                inputLabel: 'Intervalo em segundos:',
                                inputPlaceholder: 'Digite o número de segundos',
                                showCancelButton: true,
                                confirmButtonText: 'Iniciar',
                                cancelButtonText: 'Cancelar',
                                preConfirm: (value) => {
                                    const seconds = parseInt(value, 10);
                                    if (isNaN(seconds) || seconds <= 0) {
                                        Swal.showValidationMessage('Por favor, insira um valor válido.');
                                        return false;
                                    }
                                    startAutoReload(seconds);  // Iniciar a atualização automática com o intervalo fornecido
                                }
                            });
                        }
                    });
                }


                // Função para configurar o intervalo de atualização
                /**
                 * Inicia ou reinicia a atualização periódica de camadas.
                 * @param {number} seconds - Intervalo de atualização em segundos.
                 */
                function startAutoReload(seconds) {
                    if (intervalId) {
                        clearInterval(intervalId);  // Limpa o intervalo anterior, se existir
                    }

                    intervalId = setInterval(reloadLayer, seconds * 1000);  // Define o intervalo de atualização
                    document.getElementById('startUpdateButton').style.color = 'green';  // Altera a cor do ícone
                }

                // Event listener para o botão de iniciar a atualização periódica
                document.getElementById('startUpdateButton').addEventListener('click', promptUserAndUpdate);








                // Estilos embutidos para que o seletor não dependa de CSS externo em cache.
                const LAYER_CATALOG_STYLES = `
                    .swal2-popup.layer-catalog-modal{width:min(820px,calc(100vw - 28px))!important;padding:20px!important;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
                    .layer-catalog-modal .swal2-title{font-family:inherit;font-size:22px;font-weight:600;color:#243b5a;padding:0 0 10px;margin:0}
                    .layer-catalog-modal .swal2-html-container{margin:0;padding:0 2px;overflow-x:hidden}
                    #layerCatalogPicker{display:grid;gap:12px;text-align:left;width:100%;font-size:14px}
                    #layerCatalogPicker .layer-catalog-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
                    #layerCatalogPicker .layer-catalog-filters[hidden]{display:none!important}
                    #layerCatalogPicker .layer-catalog-field{display:grid;gap:5px;min-width:0}
                    #layerCatalogPicker .layer-catalog-field>label{display:block;margin:0;font-size:13px;font-weight:600;color:#36404f;text-align:left}
                    #layerCatalogPicker .layer-catalog-field>input,#layerCatalogPicker .layer-catalog-field>select{display:block;width:100%;height:40px;margin:0;padding:6px 10px;border:1px solid #c5cad2;border-radius:6px;box-sizing:border-box;font:inherit;background:#fff;color:#242a33}
                    #layerCatalogPicker .layer-catalog-advanced[hidden]{display:none!important}
                    #layerCatalogPicker .layer-catalog-advanced{border:1px solid #d9dde4;border-radius:6px;padding:8px 10px}
                    #layerCatalogPicker .layer-catalog-advanced>summary{color:#2d4a75;font-size:13px;font-weight:600;cursor:pointer}
                    #layerCatalogPicker .layer-catalog-advanced .layer-catalog-filters{grid-template-columns:repeat(3,minmax(0,1fr));margin-top:10px}
                    #layerCatalogPicker #layerCatalogStatus{min-height:1.3em;font-size:13px;color:#596273}
                    #layerCatalogPicker #layerCatalogResults{display:block;height:min(45vh,380px);overflow-y:auto;overflow-x:hidden;border:1px solid #d3d8e0;border-radius:6px;background:#fff}
                    #layerCatalogPicker .layer-catalog-result{display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border-bottom:1px solid #e1e5eb;cursor:pointer;text-align:left;background:#fff;margin:0}
                    #layerCatalogPicker .layer-catalog-result:last-child{border-bottom:0}
                    #layerCatalogPicker .layer-catalog-result:hover{background:#f3f6fa}
                    #layerCatalogPicker .layer-catalog-result.is-selected{background:#e6edf7;box-shadow:inset 3px 0 0 #435f88}
                    #layerCatalogPicker .layer-catalog-result>input{flex:none;width:17px;height:17px;margin:2px 0 0;accent-color:#435f88}
                    #layerCatalogPicker .layer-catalog-result-content{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1}
                    #layerCatalogPicker .layer-catalog-result-title{font-size:14px;font-weight:600;line-height:1.35;color:#242a33;overflow-wrap:anywhere}
                    #layerCatalogPicker .layer-catalog-result-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
                    #layerCatalogPicker .layer-catalog-result-meta>span{padding:2px 8px;border-radius:10px;background:#eef1f5;color:#4a5568;font-size:12px;line-height:1.4}
                    #layerCatalogPicker .layer-catalog-result-category{background:#e3ecf8!important;color:#2d4a75!important}
                    #layerCatalogPicker .layer-catalog-loading{padding:24px;text-align:center;color:#596273}
                    #layerCatalogPicker .layer-catalog-selection{padding:8px 10px;border-radius:6px;background:#eef1f5;color:#36404f;font-size:13px;font-weight:600}
                    @media(max-width:540px){#layerCatalogPicker .layer-catalog-filters,#layerCatalogPicker .layer-catalog-advanced .layer-catalog-filters{grid-template-columns:minmax(0,1fr)}}
                `;

                function showLayerCatalog() {
                    const selectedLayers = new Map();
                    let searchTimer;
                    let searchGeneration = 0;
                    let serviceLoadGeneration = 0;
                    let isLoadingLiveLayers = false;
                    const endpoint = 'php/endpoints/map-layer-catalog.php';

                    Swal.fire({
                        title: 'Carregando catálogo de camadas',
                        allowOutsideClick: false,
                        allowEscapeKey: false,
                        didOpen: () => Swal.showLoading()
                    });

                    window.PlanMilT.apiClient.getJson(endpoint).then(catalog => {
                        Swal.close();
                        const categories = catalog.categories || [];

                        Swal.fire({
                            title: 'Adicionar camada',
                            html: '<style>' + LAYER_CATALOG_STYLES + '</style>'
                                + '<div id="layerCatalogPicker" class="layer-catalog-picker">'
                                + '<div class="layer-catalog-filters">'
                                + '<div class="layer-catalog-field"><label for="layerCatalogCategory">Categoria</label>'
                                + '<select id="layerCatalogCategory"><option value="all">Todas as categorias</option></select></div>'
                                + '<div class="layer-catalog-field"><label for="layerCatalogService">SIG</label>'
                                + '<select id="layerCatalogService"><option value="">Todos os SIGs</option></select></div>'
                                + '</div>'
                                + '<div class="layer-catalog-field"><label for="layerCatalogSearch">Buscar camadas</label>'
                                + '<input id="layerCatalogSearch" type="search" autocomplete="off" maxlength="100" placeholder="Nome, tema, município ou atributo"></div>'
                                + '<details id="layerCatalogAdvanced" class="layer-catalog-advanced" hidden>'
                                + '<summary>Busca avançada</summary>'
                                + '<div class="layer-catalog-filters">'
                                + '<div class="layer-catalog-field"><label for="layerCatalogAdvancedService">Base</label>'
                                + '<select id="layerCatalogAdvancedService"><option value="">Todas as bases</option></select></div>'
                                + '<div class="layer-catalog-field"><label for="layerCatalogAdvancedCategory">Categoria</label>'
                                + '<select id="layerCatalogAdvancedCategory"><option value="">Todas as categorias</option></select></div>'
                                + '<div class="layer-catalog-field"><label for="layerCatalogAdvancedYear">Ano</label>'
                                + '<select id="layerCatalogAdvancedYear"><option value="">Todos os anos</option></select></div>'
                                + '</div></details>'
                                + '<div id="layerCatalogStatus" role="status"></div>'
                                + '<div id="layerCatalogResults" class="layer-catalog-results" role="group" aria-label="Camadas disponíveis"></div>'
                                + '<div id="layerCatalogSelection" class="layer-catalog-selection" role="status">Nenhuma camada selecionada</div>'
                                + '</div>',
                            showCancelButton: true,
                            confirmButtonText: 'Adicionar camadas',
                            cancelButtonText: 'Cancelar',
                            customClass: { popup: 'layer-catalog-modal' },
                            focusConfirm: false,
                            didOpen: () => {
                                const popup = Swal.getPopup();
                                const categorySelect = popup.querySelector('#layerCatalogCategory');
                                const serviceSelect = popup.querySelector('#layerCatalogService');
                                const catalogFilters = popup.querySelector('.layer-catalog-filters');
                                const searchInput = popup.querySelector('#layerCatalogSearch');
                                const advancedSearch = popup.querySelector('#layerCatalogAdvanced');
                                const advancedServiceSelect = popup.querySelector('#layerCatalogAdvancedService');
                                const advancedCategorySelect = popup.querySelector('#layerCatalogAdvancedCategory');
                                const advancedYearSelect = popup.querySelector('#layerCatalogAdvancedYear');
                                const resultsContainer = popup.querySelector('#layerCatalogResults');
                                const status = popup.querySelector('#layerCatalogStatus');
                                const selectionStatus = popup.querySelector('#layerCatalogSelection');
                                popup.classList.add('layer-catalog-modal');
                                const categoryByServiceLayer = new Map();
                                let liveLayers = null;

                                categories.forEach(category => {
                                    category.layers.forEach(layer => {
                                        categoryByServiceLayer.set(`${layer.serviceId}:${layer.layerName}`, {
                                            code: category.code,
                                            name: category.name,
                                        });
                                    });
                                });

                                const updateSelection = () => {
                                    const count = selectedLayers.size;
                                    selectionStatus.textContent = count === 0
                                        ? 'Nenhuma camada selecionada'
                                        : `${count} ${count === 1 ? 'camada selecionada' : 'camadas selecionadas'}`;
                                    Swal.getConfirmButton().disabled = count === 0;
                                    Swal.getConfirmButton().textContent = count === 0
                                        ? 'Adicionar camadas'
                                        : `Adicionar ${count} ${count === 1 ? 'camada' : 'camadas'}`;
                                };

                                categories.forEach(category => {
                                    const option = document.createElement('option');
                                    option.value = category.code;
                                    option.textContent = category.name;
                                    categorySelect.appendChild(option);
                                });
                                (catalog.services || []).forEach(service => {
                                    const option = document.createElement('option');
                                    option.value = String(service.id);
                                    option.textContent = service.name;
                                    serviceSelect.appendChild(option);
                                    const advancedOption = option.cloneNode(true);
                                    advancedServiceSelect.appendChild(advancedOption);
                                });
                                categories.forEach(category => {
                                    const option = document.createElement('option');
                                    option.value = category.code;
                                    option.textContent = category.name;
                                    advancedCategorySelect.appendChild(option);
                                });
                                const uncategorizedOption = document.createElement('option');
                                uncategorizedOption.value = 'uncategorized';
                                uncategorizedOption.textContent = 'Sem categoria';
                                advancedCategorySelect.appendChild(uncategorizedOption);
                                (catalog.years || []).forEach(yearValue => {
                                    const option = document.createElement('option');
                                    option.value = String(yearValue);
                                    option.textContent = String(yearValue);
                                    advancedYearSelect.appendChild(option);
                                });
                                const noYearOption = document.createElement('option');
                                noYearOption.value = 'none';
                                noYearOption.textContent = 'Sem data identificada';
                                advancedYearSelect.appendChild(noYearOption);

                                const normalizeSearch = value => value.normalize('NFD')
                                    .replace(/[\u0300-\u036f]/g, '')
                                    .toLocaleLowerCase('pt-BR');

                                const getLayerYear = layer => Number(layer.latestYear || layer.LatestYear || 0);

                                const categoryNameForLayer = layer =>
                                    layer.categoryName
                                    || categoryByServiceLayer.get(`${layer.serviceId}:${layer.layerName}`)?.name
                                    || 'Camada WMS';

                                const renderLayers = (layers, message) => {
                                    resultsContainer.replaceChildren();
                                    layers.forEach(layer => {
                                        const serviceId = Number(layer.serviceId);
                                        const key = `${serviceId}:${layer.layerName}`;
                                        const row = document.createElement('label');
                                        row.className = 'layer-catalog-result';
                                        const checkbox = document.createElement('input');
                                        checkbox.type = 'checkbox';
                                        checkbox.checked = selectedLayers.has(key);
                                        checkbox.setAttribute('aria-label', `Selecionar ${layer.title || layer.layerName}`);

                                        const content = document.createElement('span');
                                        content.className = 'layer-catalog-result-content';
                                        const title = document.createElement('span');
                                        title.className = 'layer-catalog-result-title';
                                        title.textContent = layer.title || layer.layerName;

                                        const metadata = document.createElement('span');
                                        metadata.className = 'layer-catalog-result-meta';
                                        const service = document.createElement('span');
                                        service.className = 'layer-catalog-result-service';
                                        service.textContent = layer.serviceName;
                                        const category = document.createElement('span');
                                        category.className = 'layer-catalog-result-category';
                                        category.textContent = categoryNameForLayer(layer);
                                        const year = document.createElement('span');
                                        year.className = 'layer-catalog-result-year';
                                        year.textContent = getLayerYear(layer) > 0
                                            ? `Ano ${getLayerYear(layer)}`
                                            : 'Sem data identificada';
                                        metadata.append(service, category, year);
                                        content.append(title, metadata);
                                        row.append(checkbox, content);
                                        row.classList.toggle('is-selected', checkbox.checked);
                                        checkbox.addEventListener('change', () => {
                                            row.classList.toggle('is-selected', checkbox.checked);
                                            if (checkbox.checked) selectedLayers.set(key, layer);
                                            else selectedLayers.delete(key);
                                            updateSelection();
                                        });
                                        resultsContainer.appendChild(row);
                                    });
                                    status.textContent = message;
                                    updateSelection();
                                };

                                const renderLiveLayers = () => {
                                    if (!Array.isArray(liveLayers)) return;
                                    const query = normalizeSearch(searchInput.value.trim());
                                    const categoryCode = categorySelect.value;
                                    const filtered = liveLayers.filter(layer => {
                                        const category = categoryByServiceLayer.get(`${layer.serviceId}:${layer.layerName}`);
                                        const categoryMatches = categoryCode === 'all' || category?.code === categoryCode;
                                        const searchText = normalizeSearch(`${layer.layerName} ${layer.title}`);
                                        return categoryMatches && (!query || searchText.includes(query));
                                    });
                                    const message = query
                                        ? `${filtered.length} resultados neste SIG, ordenados pelo ano mais recente.`
                                        : `${filtered.length} camadas neste SIG, ordenadas pelo ano mais recente. Use a busca para filtrar.`;
                                    renderLayers(filtered, message);
                                };

                                const renderLocalLayers = () => {
                                    if (isLoadingLiveLayers && serviceSelect.value !== '') {
                                        status.textContent = '';
                                        return;
                                    }
                                    const query = searchInput.value.trim();
                                    const isGlobalSearch = query.length >= 2 && serviceSelect.value === '';
                                    catalogFilters.hidden = isGlobalSearch;
                                    advancedSearch.hidden = !isGlobalSearch;
                                    if (query.length > 0) {
                                        if (query.length < 2) {
                                            renderLayers([], 'Digite pelo menos 2 caracteres para pesquisar.');
                                            return;
                                        }

                                        const generation = ++searchGeneration;
                                        status.textContent = 'Pesquisando em todo o catálogo...';
                                        resultsContainer.replaceChildren();
                                        searchTimer = setTimeout(() => {
                                            const params = new URLSearchParams({ q: query });
                                            if (advancedServiceSelect.value) {
                                                params.set('service_id', advancedServiceSelect.value);
                                            }
                                            if (advancedCategorySelect.value) {
                                                params.set('category_code', advancedCategorySelect.value);
                                            }
                                            if (advancedYearSelect.value) {
                                                params.set('year', advancedYearSelect.value);
                                            }
                                            window.PlanMilT.apiClient.getJson(`${endpoint}?${params.toString()}`)
                                                .then(result => {
                                                    if (generation !== searchGeneration) return;
                                                    const layers = result.results || [];
                                                    const message = result.totalResults > layers.length
                                                        ? `Mostrando ${layers.length} dos ${result.totalResults} resultados.`
                                                        : `${result.totalResults} resultados encontrados.`;
                                                    renderLayers(layers, message);
                                                })
                                                .catch(() => {
                                                    if (generation === searchGeneration) {
                                                        renderLayers([], 'Não foi possível concluir a busca.');
                                                    }
                                                });
                                        }, 250);
                                        return;
                                    }

                                    searchGeneration++;
                                    const categoryCode = categorySelect.value;
                                    const visibleCategories = categoryCode === 'all'
                                        ? categories
                                        : categories.filter(category => category.code === categoryCode);
                                    const layers = visibleCategories.flatMap(category => category.layers.map(layer => ({
                                        ...layer,
                                        latestYear: layer.latestYear || 0,
                                        categoryName: category.name,
                                    })));
                                    renderLayers(layers, '');
                                };

                                const loadSelectedService = async () => {
                                    clearTimeout(searchTimer);
                                    searchInput.value = '';
                                    const generation = ++serviceLoadGeneration;
                                    const serviceId = serviceSelect.value;
                                    if (serviceId === '') {
                                        isLoadingLiveLayers = false;
                                        liveLayers = null;
                                        categorySelect.value = 'all';
                                        renderLocalLayers();
                                        return;
                                    }

                                    const serviceInfo = (catalog.services || []).find(service => String(service.id) === serviceId);
                                    if (!serviceInfo || !serviceInfo.url) {
                                        renderLayers([], 'Este SIG não possui uma URL WMS cadastrada.');
                                        return;
                                    }

                                    liveLayers = null;
                                    isLoadingLiveLayers = true;
                                    categorySelect.value = 'all';
                                    status.textContent = '';
                                    resultsContainer.innerHTML = '<div class="layer-catalog-loading"><span></span>Carregando dados</div>';

                                    let layers;
                                    try {
                                        layers = await window.PlanMilT.mapLayers.getWMSLayers(serviceInfo.url, {
                                            apiClient: window.PlanMilT.apiClient,
                                            onError: error => console.warn('Falha ao consultar o SIG selecionado:', error),
                                        });
                                    } catch (error) {
                                        console.warn('Falha ao consultar o SIG selecionado:', error);
                                        layers = null;
                                    }
                                    if (generation !== serviceLoadGeneration || serviceSelect.value !== serviceId) return;
                                    isLoadingLiveLayers = false;
                                    if (!Array.isArray(layers)) {
                                        liveLayers = [];
                                        renderLayers([], 'Não foi possível consultar as camadas deste SIG.');
                                        return;
                                    }

                                    liveLayers = layers.map(layer => ({
                                        serviceId: Number(serviceId),
                                        serviceName: serviceInfo.name,
                                        serviceUrl: serviceInfo.url,
                                        layerName: layer.Name,
                                        title: layer.Title || layer.Name,
                                        latestYear: layer.LatestYear || 0,
                                    })).sort((first, second) =>
                                        getLayerYear(second) - getLayerYear(first)
                                        || first.title.localeCompare(second.title, 'pt-BR', { sensitivity: 'base' })
                                    );
                                    renderLiveLayers();
                                };

                                categorySelect.addEventListener('change', () => {
                                    clearTimeout(searchTimer);
                                    if (Array.isArray(liveLayers)) renderLiveLayers();
                                    else renderLocalLayers();
                                });

                                serviceSelect.addEventListener('change', () => {
                                    loadSelectedService();
                                });

                                searchInput.addEventListener('input', () => {
                                    clearTimeout(searchTimer);
                                    if (Array.isArray(liveLayers)) {
                                        searchTimer = setTimeout(renderLiveLayers, 120);
                                    } else {
                                        renderLocalLayers();
                                    }
                                });
                                [advancedServiceSelect, advancedCategorySelect, advancedYearSelect].forEach(filter => {
                                    filter.addEventListener('change', () => {
                                        if (searchInput.value.trim().length >= 2 && serviceSelect.value === '') {
                                            clearTimeout(searchTimer);
                                            renderLocalLayers();
                                        }
                                    });
                                });

                                if (categories.length > 0) {
                                    const firstCategory = categories.find(category => category.layers.length > 0) || categories[0];
                                    categorySelect.value = firstCategory.code;
                                    renderLocalLayers();
                                } else {
                                    renderLayers([], 'O catálogo ainda não possui recomendações. Use a busca para localizar camadas.');
                                }
                            },
                            preConfirm: () => {
                                if (selectedLayers.size === 0) {
                                    Swal.showValidationMessage('Selecione uma camada.');
                                    return false;
                                }
                                return Array.from(selectedLayers.values());
                            }
                        }).then(result => {
                            if (result.isConfirmed && Array.isArray(result.value)) {
                                result.value.forEach(layer => {
                                    const fullTitle = layer.title || layer.layerName;
                                    const titleCharacters = Array.from(fullTitle);
                                    const shortTitle = titleCharacters.length > 20
                                        ? `${titleCharacters.slice(0, 19).join('')}…`
                                        : fullTitle;
                                    let overlayName = shortTitle;
                                    for (let copy = 2; layerRegistry[overlayName]; copy++) {
                                        const suffix = ` (${copy})`;
                                        const availableCharacters = 20 - Array.from(suffix).length;
                                        overlayName = `${titleCharacters.slice(0, availableCharacters - 1).join('')}…${suffix}`;
                                    }
                                    addWMSLayerToMap(layer.serviceUrl, layer.layerName, overlayName);
                                });
                            }
                        });
                    }).catch(error => {
                        Swal.close();
                        console.error('Erro ao carregar o catálogo de camadas:', error);
                        Swal.fire('Erro!', 'Não foi possível carregar o catálogo de camadas.', 'error');
                    });
                }

                document.getElementById('addLayerButton').addEventListener('click', showLayerCatalog);





                document.getElementById('removeLayerButton').addEventListener('click', function() {
                    var layerOptions = {};
                    Object.keys(layerRegistry).forEach(layerName => {
                        layerOptions[layerName] = layerName;
                    });

                    if (Object.keys(layerOptions).length === 0) {
                        Swal.fire('Aviso', 'Não há camadas para remover.', 'info');
                        return;
                    }

                    Swal.fire({
                        title: 'Selecione a Camada para Remover',
                        input: 'select',
                        inputOptions: layerOptions,
                        inputPlaceholder: 'Selecione uma Camada',
                        showCancelButton: true,
                    }).then((result) => {
                        if (result.isConfirmed) {
                            var selectedLayerName = result.value;
                            var layer = layerRegistry[selectedLayerName];
                            if (layer) {
                                map.removeLayer(layer); // Remove a camada do mapa
                                layerControl.removeLayer(layer); // Remove a camada do controle de camadas
                                delete layerRegistry[selectedLayerName]; // Remove a camada do registro
                            }
                        }
                    });
                });


                map.on('click', function(e) {
                    var latlng = e.latlng;
                    getFeatureInfoAtPoint(latlng);
                });

                /**
                 * Consulta camadas WMS ativas no ponto clicado e abre o popup de resultado.
                 * @param {*} latlng - Coordenada geográfica Leaflet.
                 */
                function getFeatureInfoAtPoint(latlng) {
                    // Definir as camadas a serem ignoradas
                    const excludedLayers = [
                        layerRegistry["OpenTopo"],
                        layerRegistry["Google Satellite"],
                        layerRegistry["Infraestruturas"],
                        layerRegistry["Quadrículas - UTM"],
                        layerRegistry["BDGEx - CTM50"],
                        layerRegistry["Sugestão de Planejamento"]
                    ];

                    // Obter as camadas WMS ativas, excluindo as camadas ignoradas
                    var activeWMSLayers = [];
                    map.eachLayer(function(layer) {
                        // Verifica se a camada é uma WMS, está ativa no mapa e não está na lista de exclusão
                        if (layer instanceof L.TileLayer.WMS && map.hasLayer(layer) && !excludedLayers.includes(layer)) {
                            activeWMSLayers.push(layer);
                        }
                    });

                    if (activeWMSLayers.length === 0) {
                        return; // Nenhuma camada WMS ativa que não está na lista de exclusão
                    }

                    activeWMSLayers.forEach(function(layer) {
                        var wmsURL = layer._url;
                        var layerNames = layer.wmsParams.layers;

                        var point = map.latLngToContainerPoint(latlng, map.getZoom());
                        var size = map.getSize();

                        var params = {
                            service: 'WMS',
                            request: 'GetFeatureInfo',
                            srs: 'EPSG:4326',
                            styles: '',
                            transparent: true,
                            version: '1.1.1',
                            format: 'image/png',
                            bbox: map.getBounds().toBBoxString(),
                            height: size.y,
                            width: size.x,
                            layers: layerNames,
                            query_layers: layerNames,
                            info_format: 'text/html', // ou 'applicationjson', dependendo do servidor
                            x: Math.round(point.x),
                            y: Math.round(point.y)
                        };

                        // Constrói a string de parâmetros
                        var paramsString = L.Util.getParamString(params, null, true); // O segundo parâmetro é 'null', e o terceiro 'true' para upperCase

                        // Constrói a URL completa do GetFeatureInfo
                        var fullURL = wmsURL + paramsString;

                        // Codifica a URL completa e a passa para o proxy.php
                        var proxyURL = '/proxy.php?url=' + encodeURIComponent(fullURL);

                        window.PlanMilT.apiClient.request(proxyURL)
                            .then(function(response) {
                            return response.text();
                        })
                            .then(function(data) {
                            const mensagemIgnorar = "received wms getfeatureinfo request for unqueryable".toLowerCase();
                            if (data && !data.trim().toLowerCase().includes(mensagemIgnorar)) {
                                // Exibir o popup no mapa com opções personalizadas
                                L.popup({
                                    maxWidth: 500, // Define a largura máxima do popup
                                    minWidth: 200, // Define a largura mínima do popup
                                    closeButton: true, // Exibe o botão de fechar
                                    autoPan: true, // Pan automaticamente para exibir o popup completamente
                                    className: 'custom-popup' // Adiciona uma classe personalizada para o popup
                                })
                                    .setLatLng(latlng)
                                    .setContent('<div class="popup-content">' + data + '</div>')
                                    .openOn(map);
                            }
                        })
                            .catch(function(error) {
                            console.error('Erro ao obter GetFeatureInfo:', error);
                        });

                    });
                }
