/**
 * @fileoverview Monta formulários de parâmetros para tarefas e valida/coleta os valores preenchidos.
 * @exports window.PlanMilT.taskParameters
 * @requires API client e SweetAlert injetados
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.taskParameters = Object.freeze({
    /**
     * Prepara as operações de formulário de parâmetros com as dependências injetadas.
     * @param {Object} dependencies - Dependências externas necessárias para inicializar o módulo.
     * @param {Object} dependencies.apiClient - Cliente compartilhado para chamadas à API.
     * @param {Object} dependencies.sweetAlert - Interface SweetAlert para confirmação, carregamento e notificações.
     * @param {Array<Object>} [dependencies.radioPresets] - Presets de rádio e visada disponíveis.
     * @param {Function} [dependencies.getLayerIconCounts] - Conta marcadores por tipo na camada indicada.
     */
    attach({ apiClient, sweetAlert, radioPresets = [], getLayerIconCounts = () => ({}) }) {
        const Swal = sweetAlert;

                /**
                 * Obtém o catálogo de ícones usado nos novos formulários de rádio.
                 * @returns {Promise<Array<string>>} Caminhos dos ícones disponíveis.
                 */
                async function getRadioTaskIcons() {
                    const icons = await apiClient.getJson('symbols/icons.php').catch(error => {
                        console.error('Erro ao obter ícones para a tarefa de rádio:', error);
                        Swal.fire('Erro', 'Não foi possível obter a lista de ícones.', 'error');
                        return [];
                    });
                    return Array.isArray(icons) ? icons : [];
                }

                /**
                 * Gera opções HTML para os ícones e mantém a escolha atual.
                 * @param {Array<string>} icons - Caminhos dos ícones.
                 * @param {string} selectedIcon - Caminho atualmente selecionado.
                 * @returns {string} Opções do seletor.
                 */
                function getRadioTaskIconOptions(icons, selectedIcon) {
                    return icons.map(icon => {
                        const fileName = icon.substring(icon.lastIndexOf('/') + 1).split('.')[0];
                        const label = `${icon.split('/')[2]}/${fileName}`;
                        return `<option value="${escapeHtml(icon)}" ${selectedIcon === icon ? 'selected' : ''}>${escapeHtml(label)}</option>`;
                    }).join('');
                }

                /**
                 * Codifica texto antes de inseri-lo em conteúdo HTML.
                 * @param {*} value - Valor que será exibido.
                 * @returns {string} Texto seguro para HTML.
                 */
                function escapeHtml(value) {
                    return String(value)
                        .replaceAll('&', '&amp;')
                        .replaceAll('<', '&lt;')
                        .replaceAll('>', '&gt;')
                        .replaceAll('"', '&quot;')
                        .replaceAll("'", '&#039;');
                }

                /**
                 * Retorna o nome amigável de um preset de rádio/visada.
                 * @param {string} presetId - Identificador do preset.
                 * @returns {string} Nome do preset ou o próprio identificador.
                 */
                function getRadioPresetLabel(presetId) {
                    return radioPresets.find(preset => preset.id === presetId)?.label || String(presetId || '');
                }

                /**
                 * Gera opções HTML para os presets RF e óticos.
                 * @param {string} selectedPreset - Identificador previamente selecionado.
                 * @returns {string} Opções do seletor.
                 */
                function getRadioTaskPresetOptions(selectedPreset) {
                    return radioPresets.map(preset => `
<option value="${preset.id}" ${selectedPreset === preset.id || (!selectedPreset && preset.id === 'optical') ? 'selected' : ''}>
${preset.label}
</option>`).join('');
                }

                /**
                 * Gera opções para as camadas disponíveis nas tarefas de rádio.
                 * @param {string} selectedLayer - Identificador da camada previamente selecionada.
                 * @returns {string} Opções do seletor.
                 */
                function getRadioTaskLayerOptions(selectedLayer) {
                    return `
<option value="drawnItems" ${selectedLayer !== 'planningSuggestions' ? 'selected' : ''}>Camada de Desenho Atual</option>
<option value="planningSuggestions" ${selectedLayer === 'planningSuggestions' ? 'selected' : ''}>Sugestão de Planejamento</option>`;
                }

                /**
                 * Atualiza seletores de ícones para exibir apenas tipos presentes na camada escolhida.
                 * @param {string} selectedTask - Identificador da tarefa exibida no formulário.
                 * @param {HTMLElement} root - Elemento DOM que contém os parâmetros da tarefa.
                 * @returns {void}
                 */
                function bindRadioTaskForm(selectedTask, root) {
                    const formConfig = {
                        findHighestPoint: { layer: '#iconLayerSelect', icons: ['#iconType'], previews: { '#iconType': '#iconTypeImage' } },
                        drawLinesBetweenIcons: { layer: '#iconLayerSelect', icons: ['#iconType'] },
                        connectDifferentIcons: {
                            layer: '#iconLayerSelect',
                            icons: ['#iconType1', '#iconType2'],
                            previews: { '#iconType1': '#iconType1Image', '#iconType2': '#iconType2Image' }
                        },
                        drawCoverageArea: { layer: '#coverageLayerSelect', icons: ['#iconTypesToCover'], multiple: ['#iconTypesToCover'] },
                        verifyRadioLinks: { layer: '#linkLayerSelect', icons: ['#linkIconType1', '#linkIconType2'] },
                        identifyCoverageGaps: { layer: '#coverageGapLayer', icons: ['#coverageGapStationIcon'] },
                        checkRouteCommunication: { layer: '#routeRadioLayer', icons: ['#routeStationIcon'] },
                        suggestRepeaterPositions: {
                            layer: '#repeaterLayer',
                            icons: ['#repeaterCandidateIcon', '#repeaterGroup1', '#repeaterGroup2']
                        },
                        compareRadioPresets: { layer: '#compareRadioLayer', icons: ['#compareRadioIcon1', '#compareRadioIcon2'] }
                    }[selectedTask];
                    if (!formConfig || !root) return;

                    const layerSelect = root.querySelector(formConfig.layer);
                    const status = root.querySelector('#radioTaskLayerStatus, #taskLayerStatus');
                    if (!layerSelect) return;

                    const refreshIconOptions = () => {
                        const counts = getLayerIconCounts(layerSelect.value) || {};
                        const icons = Object.entries(counts).filter(([, count]) => count > 0);
                        for (const selector of formConfig.icons) {
                            const select = root.querySelector(selector);
                            if (!select) continue;
                            const previousValues = formConfig.multiple?.includes(selector)
                                ? Array.from(select.selectedOptions || []).map(option => option.value)
                                : [select.value];
                            const availableValues = icons.map(([icon]) => icon);
                            const selectedValues = previousValues.filter(value => availableValues.includes(value));
                            if (selectedValues.length === 0 && icons.length > 0) selectedValues.push(icons[0][0]);
                            select.innerHTML = icons.length > 0
                                ? icons.map(([icon, count]) => {
                                    const fileName = icon.substring(icon.lastIndexOf('/') + 1).split('.')[0];
                                    const label = `${icon.split('/')[2]}/${fileName} (${count} ${count === 1 ? 'disponível' : 'disponíveis'})`;
                                    return `<option value="${escapeHtml(icon)}" ${selectedValues.includes(icon) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
                                }).join('')
                                : '<option value="">Nenhum ícone encontrado nesta camada</option>';
                            if (icons.length === 0) select.value = '';
                            const preview = formConfig.previews?.[selector]
                                ? root.querySelector(formConfig.previews[selector])
                                : null;
                            if (preview && select.value) preview.src = select.value;
                        }

                        if (status) {
                            status.textContent = icons.length > 0
                                ? `${icons.length} tipo${icons.length === 1 ? '' : 's'} de ícone encontrado${icons.length === 1 ? '' : 's'}. Os seletores mostram apenas marcadores desta camada e informam a quantidade disponível.`
                                : 'Nenhum marcador com ícone foi encontrado nesta camada. Escolha outra camada ou adicione os ícones ao mapa antes de executar.';
                        }
                    };

                    layerSelect.addEventListener('change', refreshIconOptions);
                    refreshIconOptions();
                }

                /**
                 * Monta o formulário HTML apropriado para o tipo de tarefa selecionado.
                 * @param {string} selectedTask - Identificador do tipo de tarefa selecionado.
                 * @param {*} existingParameters - Parâmetros já salvos para preencher ou editar.
                 */
                async function getTaskParametersHtml(selectedTask, existingParameters = {}) {
                    switch (selectedTask) {
                        case 'findHighestPoint':
                            // Criar o select para selecionar a camada de origem dos ícones
                            const layerOptionsFind = {
                                'drawnItems': 'Camada de Desenho Atual',
                                'planningSuggestions': 'Sugestão de Planejamento'
                            };
                            const layerSelectHtmlFind = `
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="iconLayerSelect" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-layer-group" style="margin-right: 8px;"></i> Selecione a Camada de Origem dos Ícones:
            </label>
<select id="iconLayerSelect" class="swal2-input" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
${Object.entries(layerOptionsFind).map(([value, text]) => `
<option value="${value}" ${existingParameters.iconLayer === value ? 'selected' : ''}>
${text}
            </option>
`).join('')}
            </select>
            </div>
<div id="taskLayerStatus" role="status" style="margin: 6px 0 12px; font-size: 12px; color: #4b5563;"></div>
`;

                            // Obter a lista de ícones disponíveis para seleção
                            let iconListFind = await apiClient.getJson('symbols/icons.php')
                            .catch(error => {
                                console.error('Erro ao obter a lista de ícones:', error);
                                Swal.fire('Erro', 'Não foi possível obter a lista de ícones.', 'error');
                                return [];
                            });

                            if (!iconListFind || iconListFind.length === 0) {
                                return '<p style="text-align: center;"><i class="fas fa-exclamation-triangle" style="color: #dc3545;"></i> Nenhum ícone disponível.</p>';
                            }

                            // Criar as opções do select com os ícones disponíveis
                            let iconOptionsHtmlFind = '';
                            iconListFind.forEach(icon => {
                                const iconNameWithExtension = icon.substring(icon.lastIndexOf('/') + 1);
                                const iconName = iconNameWithExtension.split('.')[0];
                                iconOptionsHtmlFind += `
<option value="${icon}" ${existingParameters.iconType === icon ? 'selected' : ''}>
${icon.split('/')[2]}/${iconName}
            </option>
`;
                            });

                            // Para selecionar o ícone a ser inserido
                            let iconInsertOptionsHtmlFind = '';
                            iconListFind.forEach(icon => {
                                const iconNameWithExtension = icon.substring(icon.lastIndexOf('/') + 1);
                                const iconName = iconNameWithExtension.split('.')[0];
                                iconInsertOptionsHtmlFind += `
<option value="${icon}" ${existingParameters.iconToInsert === icon ? 'selected' : ''}>
${icon.split('/')[2]}/${iconName}
            </option>
`;
                            });

                            // Adicionar novos campos para quantidade de ícones e distância máxima entre eles
                            const newIconFieldsHtmlFind = `
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="numberOfNewIcons" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-plus-square" style="margin-right: 8px;"></i> Quantos Novos Ícones Deseja Colocar:
            </label>
<input id="numberOfNewIcons" class="swal2-input" type="number" min="1" value="${existingParameters.numberOfNewIcons || 1}" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
            </div>
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 20px;">
<label for="maxDistanceBetweenNewIcons" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-ruler-combined" style="margin-right: 8px;"></i> Distância Máxima entre Novos Ícones (km):
            </label>
<input id="maxDistanceBetweenNewIcons" class="swal2-input" type="number" min="0" step="0.1" value="${existingParameters.maxDistanceBetweenNewIcons || 1}" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
            </div>
`;

                            return `
${layerSelectHtmlFind}
<div id="taskLayerStatus" role="status" style="margin: 6px 0 12px; font-size: 12px; color: #4b5563;"></div>
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="iconType" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-icons" style="margin-right: 8px;"></i> Selecione o Tipo de Ícone Existente:
            </label>
<select id="iconType" class="swal2-input" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;"
onchange="document.getElementById('iconTypeImage').src = this.value">
${iconOptionsHtmlFind}
            </select>
<img id="iconTypeImage" src="${existingParameters.iconType || iconListFind[0]}" alt="Ícone Selecionado" style="width: 24px; height: 24px; margin-left: 10px;">
            </div>
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="maxDistance" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-ruler-horizontal" style="margin-right: 8px;"></i> Distância Máxima (km):
            </label>
<input id="maxDistance" class="swal2-input" type="number" value="${existingParameters.maxDistance || 10}" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
            </div>
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="iconToInsert" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-plus-circle" style="margin-right: 8px;"></i> Selecione o Ícone para Inserir:
            </label>
<select id="iconToInsert" class="swal2-input" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;"
onchange="document.getElementById('iconToInsertImage').src = this.value">
${iconInsertOptionsHtmlFind}
            </select>
<img id="iconToInsertImage" src="${existingParameters.iconToInsert || iconListFind[0]}" alt="Ícone a Inserir" style="width: 24px; height: 24px; margin-left: 10px;">
            </div>
${newIconFieldsHtmlFind}
<div style="display: flex; justify-content: center; margin-top: 10px;">
            </div>
`;


                        case 'placeIcons':
                            // Obter a lista de ícones disponíveis para seleção
                            let iconListPlace = await apiClient.getJson('symbols/icons.php')
                            .catch(error => {
                                console.error('Erro ao obter a lista de ícones:', error);
                                Swal.fire('Erro', 'Não foi possível obter a lista de ícones.', 'error');
                                return [];
                            });

                            if (!iconListPlace || iconListPlace.length === 0) {
                                return '<p style="text-align: center;"><i class="fas fa-exclamation-triangle" style="color: #dc3545;"></i> Nenhum ícone disponível.</p>';
                            }

                            // Criar as opções do select com os ícones disponíveis
                            let iconOptionsHtmlPlace = '';
                            iconListPlace.forEach(icon => {
                                const iconNameWithExtension = icon.substring(icon.lastIndexOf('/') + 1);
                                const iconName = iconNameWithExtension.split('.')[0];
                                iconOptionsHtmlPlace += `
<option value="${icon}" ${existingParameters.iconUrl === icon ? 'selected' : ''}>
${icon.split('/')[2]}/${iconName}
            </option>
`;

                            });

                            // Adicionar novos campos para quantidade máxima de ícones e distância mínima entre eles
                            const newIconFieldsHtmlPlace = `
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="maxNumberOfIcons" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-hashtag" style="margin-right: 8px;"></i> Quantidade Máxima de Ícones a Inserir:
            </label>
<input id="maxNumberOfIcons" class="swal2-input" type="number" min="1" value="${existingParameters.maxNumberOfIcons || 10}" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
            </div>
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 20px;">
<label for="minDistanceBetweenIcons" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-ruler-combined" style="margin-right: 8px;"></i> Distância Mínima entre Ícones (m):
            </label>
<input id="minDistanceBetweenIcons" class="swal2-input" type="number" min="0" step="1" value="${existingParameters.minDistanceBetweenIcons || 100}" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
            </div>
`;

                            return `
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="iconToInsert" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-plus-circle" style="margin-right: 8px;"></i> Selecione o Ícone para Inserir:
            </label>
<select id="iconToInsert" class="swal2-input" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;"
onchange="document.getElementById('iconToInsertImage').src = this.value">
${iconOptionsHtmlPlace}
            </select>
<img id="iconToInsertImage" src="${existingParameters.iconUrl || iconListPlace[0]}" alt="Ícone a Inserir" style="width: 24px; height: 24px; margin-left: 10px;" onerror="this.src='symbols/default.svg'">
            </div>
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="criteria" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-balance-scale" style="margin-right: 8px;"></i> Critério (elevação mínima):
            </label>
<input id="criteria" class="swal2-input" type="number" value="${existingParameters.criteria || 100}" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
            </div>
${newIconFieldsHtmlPlace}
`;


                        case 'drawLinesBetweenIcons':
                            // Obter as camadas disponíveis para selecionar
                            const layerOptionsLines = {
                                'drawnItems': 'Camada de Desenho Atual',
                                'planningSuggestions': 'Sugestão de Planejamento'
                            };
                            const layerSelectHtmlLines = `
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="iconLayerSelect" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-layer-group" style="margin-right: 8px;"></i> Selecione a Camada de Origem dos Ícones:
            </label>
<select id="iconLayerSelect" class="swal2-input" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
${Object.entries(layerOptionsLines).map(([value, text]) => `
<option value="${value}" ${existingParameters.iconLayer === value ? 'selected' : ''}>
${text}
            </option>
`).join('')}
            </select>
            </div>
`;

                            // Obter a lista de ícones disponíveis para seleção
                            let iconListLines = await apiClient.getJson('symbols/icons.php')
                            .catch(error => {
                                console.error('Erro ao obter a lista de ícones:', error);
                                Swal.fire('Erro', 'Não foi possível obter a lista de ícones.', 'error');
                                return [];
                            });

                            if (!iconListLines || iconListLines.length === 0) {
                                return '<p style="text-align: center;"><i class="fas fa-exclamation-triangle" style="color: #dc3545;"></i> Nenhum ícone disponível.</p>';
                            }

                            // Criar as opções do select com os ícones disponíveis (valor completo)
                            let iconOptionsHtmlLines = '';

                            iconListLines.forEach(icon => {
                                const iconNameWithExtension = icon.substring(icon.lastIndexOf('/') + 1);
                                const iconName = iconNameWithExtension.split('.')[0];
                                iconOptionsHtmlLines += `
<option value="${icon}" ${existingParameters.iconType === icon ? 'selected' : ''}>
${icon.split('/')[2]}/${iconName}
            </option>
`;
                            });

                            // Adicionar novos campos para quantidade máxima de ligações e distância mínima entre linhas
                            const newLineFieldsHtml = `
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="maxConnectionsPerIcon" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-network-wired" style="margin-right: 8px;"></i> Quantidade Máxima de Ligações por Ícone:
            </label>
<input id="maxConnectionsPerIcon" class="swal2-input" type="number" min="1" value="${existingParameters.maxConnectionsPerIcon || 3}" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
            </div>
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 20px;">
<label for="minDistanceBetweenLines" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-ruler-combined" style="margin-right: 8px;"></i> Distância Mínima entre Ligações (m):
            </label>
<input id="minDistanceBetweenLines" class="swal2-input" type="number" min="0" step="1" value="${existingParameters.minDistanceBetweenLines || 50}" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
            </div>
`;

                            return `
${layerSelectHtmlLines}
<div id="taskLayerStatus" role="status" style="margin: 6px 0 12px; font-size: 12px; color: #4b5563;"></div>
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="iconType" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-link" style="margin-right: 8px;"></i> Selecione o Tipo de Ícones para Conectar:
            </label>
<select id="iconType" class="swal2-input" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;"
onchange="document.getElementById('iconTypeImage').src = this.value">
${iconOptionsHtmlLines}
            </select>
<img id="iconTypeImage" src="${existingParameters.iconType || iconListLines[0]}" alt="Ícone Selecionado" style="width: 24px; height: 24px; margin-left: 10px;" onerror="this.src='symbols/default.svg'">
            </div>
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="maxDistance" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-ruler-horizontal" style="margin-right: 8px;"></i> Distância Máxima entre Ícones (km):
            </label>
<input id="maxDistance" class="swal2-input" type="number" value="${existingParameters.maxDistance || 10}" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
            </div>
${newLineFieldsHtml}
`;


                        case 'connectDifferentIcons':
                            // Obter as camadas disponíveis para selecionar
                            const layerOptionsConnect = {
                                'drawnItems': 'Camada de Desenho Atual',
                                'planningSuggestions': 'Sugestão de Planejamento'
                            };
                            const layerSelectHtmlConnect = `
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="iconLayerSelect" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-layer-group" style="margin-right: 8px;"></i> Selecione a Camada de Origem dos Ícones:
            </label>
<select id="iconLayerSelect" class="swal2-input" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
${Object.entries(layerOptionsConnect).map(([value, text]) => `
<option value="${value}" ${existingParameters.iconLayer === value ? 'selected' : ''}>
${text}
            </option>
`).join('')}
            </select>
            </div>
`;

                            // Obter a lista de ícones disponíveis para seleção
                            let iconListConnect = await apiClient.getJson('symbols/icons.php')
                            .catch(error => {
                                console.error('Erro ao obter a lista de ícones:', error);
                                Swal.fire('Erro', 'Não foi possível obter a lista de ícones.', 'error');
                                return [];
                            });

                            if (!iconListConnect || iconListConnect.length === 0) {
                                return '<p style="text-align: center;"><i class="fas fa-exclamation-triangle" style="color: #dc3545;"></i> Nenhum ícone disponível.</p>';
                            }

                            // Criar as opções do select com os ícones disponíveis
                            let iconOptionsHtmlConnect1 = '';
                            let iconOptionsHtmlConnect2 = '';
                            iconListConnect.forEach(icon => {
                                const iconNameWithExtension = icon.substring(icon.lastIndexOf('/') + 1);
                                const iconName = iconNameWithExtension.split('.')[0];
                                iconOptionsHtmlConnect1 += `
<option value="${icon}" ${existingParameters.iconType1 === icon ? 'selected' : ''}>
${icon.split('/')[2]}/${iconName}
            </option>
`;
                                iconOptionsHtmlConnect2 += `
<option value="${icon}" ${existingParameters.iconType2 === icon ? 'selected' : ''}>
${icon.split('/')[2]}/${iconName}
            </option>
`;
                            });

                            // Campos de limite de conexões e critério de seleção.
                            const newLineFieldsHtmlConnect = `
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="maxConnectionsSource" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-network-wired" style="margin-right: 8px;"></i> Máximo de conexões por Ícone Fonte (${existingParameters.iconType1 || ''}):
            </label>
<input id="maxConnectionsSource" class="swal2-input" type="number" value="${existingParameters.maxConnectionsSource || 2}" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
            </div>
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="maxConnectionsTarget" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-network-wired" style="margin-right: 8px;"></i> Máximo de conexões por Ícone Alvo (${existingParameters.iconType2 || ''}):
            </label>
<input id="maxConnectionsTarget" class="swal2-input" type="number" value="${existingParameters.maxConnectionsTarget || 8}" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
            </div>
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 20px;">
<label for="connectionCriterion" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-balance-scale" style="margin-right: 8px;"></i> Critério de Conexão:
            </label>
<select id="connectionCriterion" class="swal2-input" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
<option value="closest" ${existingParameters.connectionCriterion === 'closest' ? 'selected' : ''}>
Ícones mais próximos
            </option>
<option value="farthest" ${existingParameters.connectionCriterion === 'farthest' ? 'selected' : ''}>
Ícones mais distantes
            </option>
            </select>
            </div>
`;

                            return `
${layerSelectHtmlConnect}
<div id="taskLayerStatus" role="status" style="margin: 6px 0 12px; font-size: 12px; color: #4b5563;"></div>

<!-- Select para o Primeiro Tipo de Ícone com Imagem -->
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="iconType1" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-layer-group" style="margin-right: 8px;"></i> Selecione o Primeiro Tipo de Ícone:
            </label>
<select id="iconType1" class="swal2-input" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;"
onchange="document.getElementById('iconType1Image').src = this.value">
${iconOptionsHtmlConnect1}
            </select>
<img id="iconType1Image" src="${existingParameters.iconType1 || iconListConnect[0]}" alt="Ícone Selecionado 1" style="width: 24px; height: 24px; margin-left: 10px;" onerror="this.src='symbols/default.svg'">
            </div>

<!-- Select para o Segundo Tipo de Ícone com Imagem -->
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="iconType2" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-layer-group" style="margin-right: 8px;"></i> Selecione o Segundo Tipo de Ícone:
            </label>
<select id="iconType2" class="swal2-input" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;"
onchange="document.getElementById('iconType2Image').src = this.value">
${iconOptionsHtmlConnect2}
            </select>
<img id="iconType2Image" src="${existingParameters.iconType2 || iconListConnect[0]}" alt="Ícone Selecionado 2" style="width: 24px; height: 24px; margin-left: 10px;" onerror="this.src='symbols/default.svg'">
            </div>

<!-- Input para Distância Máxima entre Ícones -->
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="maxDistance" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-ruler-horizontal" style="margin-right: 8px;"></i> Distância Máxima entre Ícones (km):
            </label>
<input id="maxDistance" class="swal2-input" type="number" value="${existingParameters.maxDistance || 10}" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
            </div>

<!-- Inputs para Máximo de Conexões e Critério de Conexão -->
${newLineFieldsHtmlConnect}

`;

                        case 'drawCoverageArea':
                            // Dentro do case 'drawCoverageArea':
                            const layerOptionsCoverage = {
                                'drawnItems': 'Camada de Desenho Atual',
                                'planningSuggestions': 'Sugestão de Planejamento'
                            };

                            // Dentro do case 'drawCoverageArea':

                            const layerSelectHtmlCoverage = `
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="coverageLayerSelect" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-layer-group" style="margin-right: 8px;"></i> Selecione a Camada de Origem dos Desenhos:
            </label>
<select id="coverageLayerSelect" class="swal2-input" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
${Object.entries(layerOptionsCoverage).map(([value, text]) => `
<option value="${value}" ${existingParameters.coverageLayer === value ? 'selected' : ''}>
${text}
            </option>
`).join('')}
            </select>
            </div>
`;

                            // Obter a lista de ícones disponíveis
                            let iconListCoverage = await apiClient.getJson('symbols/icons.php')
                            .catch(error => {
                                console.error('Erro ao obter a lista de ícones:', error);
                                Swal.fire('Erro', 'Não foi possível obter a lista de ícones.', 'error');
                                return [];
                            });

                            if (!iconListCoverage || iconListCoverage.length === 0) {
                                return '<p style="text-align: center;"><i class="fas fa-exclamation-triangle" style="color: #dc3545;"></i> Nenhum ícone disponível.</p>';
                            }

                            // Criar as opções do select com os ícones disponíveis
                            let iconOptionsHtmlCoverage = '';                            
                            iconListCoverage.forEach(icon => {
                                const iconNameWithExtension = icon.substring(icon.lastIndexOf('/') + 1);
                                const iconName = iconNameWithExtension.split('.')[0];
                                iconOptionsHtmlCoverage += `
<option value="${icon}" ${existingParameters.iconUrl === icon ? 'selected' : ''}>
${icon.split('/')[2]}/${iconName}
            </option>
`;
                            });

                            // Criar as opções para os tipos de ícones a cobrir
                            let iconTypesToCoverOptions = '';
                            iconListCoverage.forEach(icon => {
                                const iconNameWithExtension = icon.substring(icon.lastIndexOf('/') + 1);
                                const iconName = iconNameWithExtension.split('.')[0];
                                try{
                                    iconTypesToCoverOptions += `
<option value="${icon}" ${existingParameters.iconTypesToCover.includes(icon) ? 'selected' : ''}>
${icon.split('/')[2]}/${iconName}
            </option>

`;
                                } catch (e) {
                                    iconTypesToCoverOptions += `
<option value="${icon}">
${icon.split('/')[2]}/${iconName}
            </option>

`;
                                }
                            });

                            return `
${layerSelectHtmlCoverage}
<div id="taskLayerStatus" role="status" style="margin: 6px 0 12px; font-size: 12px; color: #4b5563;"></div>

<!-- Select para o Ícone Central com Imagem -->
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="iconToInsert" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-map-marker-alt" style="margin-right: 8px;"></i> Selecione o Ícone Central:
            </label>
<select id="iconToInsert" class="swal2-input" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;"
onchange="document.getElementById('iconToInsertImage').src = this.value">
${iconOptionsHtmlCoverage}
            </select>
<img id="iconToInsertImage" src="${existingParameters.iconUrl || iconListCoverage[0]}" alt="Ícone a Inserir" style="width: 24px; height: 24px; margin-left: 10px;" onerror="this.src='symbols/default.svg'">
            </div>

<!-- Input para Raio da Cobertura -->
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="radius" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-compass" style="margin-right: 8px;"></i> Raio da Cobertura (km):
            </label>
<input id="radius" class="swal2-input" type="number" value="${existingParameters.radius || 10}" style="flex: 1; margin-left: 10px; padding: 5px; border-radius: 4px;">
            </div>

<!-- Select Múltiplo para Tipos de Ícones a Cobrir -->
<div class="form-group" style="display: flex; align-items: center; margin-bottom: 15px;">
<label for="iconTypesToCover" style="flex: 0 0 40%; display: flex; align-items: center; font-weight: bold; font-size: 14px;">
<i class="fas fa-layer-group" style="margin-right: 8px;"></i> Tipos de Ícones a Cobrir (Seleção Múltipla):
            </label>
<select 
id="iconTypesToCover" 
class="swal2-input" 
multiple 
size="10" 
style="
flex: 1; 
margin-left: 10px; 
padding: 5px; 
border-radius: 4px; 
height: auto; /* Permite que a altura seja ajustada automaticamente */
max-height: 300px; /* Define uma altura máxima para evitar que a caixa fique muito grande */
overflow-y: auto; /* Adiciona rolagem vertical se houver muitas opções */
">
${iconTypesToCoverOptions}
            </select>
            </div>
`;

                        case 'verifyRadioLinks': {
                            const iconList = await apiClient.getJson('symbols/icons.php').catch(error => {
                                console.error('Erro ao obter a lista de ícones para enlaces:', error);
                                Swal.fire('Erro', 'Não foi possível obter a lista de ícones para verificar os enlaces.', 'error');
                                return [];
                            });
                            if (!Array.isArray(iconList) || iconList.length === 0) {
                                return '<p style="text-align: center;"><i class="fas fa-exclamation-triangle" style="color: #dc3545;"></i> Nenhum ícone disponível.</p>';
                            }

                            const makeIconOptions = selectedIcon => iconList.map(icon => {
                                const name = icon.substring(icon.lastIndexOf('/') + 1).split('.')[0];
                                const label = `${icon.split('/')[2]}/${name}`;
                                return `<option value="${icon}" ${selectedIcon === icon ? 'selected' : ''}>${label}</option>`;
                            }).join('');
                            const presets = radioPresets.filter(preset => preset && preset.id && preset.label);
                            const presetOptions = presets.map(preset => `
<option value="${preset.id}" ${existingParameters.radioPreset === preset.id || (!existingParameters.radioPreset && preset.id === 'optical') ? 'selected' : ''}>
${preset.label}
</option>`).join('');

                            return `
<div class="form-group">
<label for="linkLayerSelect">Camada de origem dos ícones:</label>
<select id="linkLayerSelect" class="swal2-input">
<option value="drawnItems" ${existingParameters.iconLayer !== 'planningSuggestions' ? 'selected' : ''}>Camada de Desenho Atual</option>
<option value="planningSuggestions" ${existingParameters.iconLayer === 'planningSuggestions' ? 'selected' : ''}>Sugestão de Planejamento</option>
</select>
</div>
<div id="radioTaskLayerStatus" role="status"></div>
<div class="form-group">
<label for="linkIconType1">Ícone de origem:</label>
<select id="linkIconType1" class="swal2-input">${makeIconOptions(existingParameters.iconType1 || iconList[0])}</select>
</div>
<div class="form-group">
<label for="linkIconType2">Ícone de destino:</label>
<select id="linkIconType2" class="swal2-input">${makeIconOptions(existingParameters.iconType2 || iconList[0])}</select>
</div>
<div class="form-group">
<label for="linkRadioPreset">Rádio ou visada:</label>
<select id="linkRadioPreset" class="swal2-input">${presetOptions}</select>
</div>
<div class="form-group">
<label for="linkMaxDistance">Distância máxima entre unidades (km):</label>
<input id="linkMaxDistance" class="swal2-input" type="number" min="0.1" step="0.1" value="${existingParameters.maxDistance || 20}">
</div>
`;
                        }

                        case 'identifyCoverageGaps':
                        case 'checkRouteCommunication':
                        case 'suggestRepeaterPositions':
                        case 'compareRadioPresets': {
                            const icons = await getRadioTaskIcons();
                            if (icons.length === 0) {
                                return '<p style="text-align: center;"><i class="fas fa-exclamation-triangle" style="color: #dc3545;"></i> Nenhum ícone disponível.</p>';
                            }
                            const defaultIcon = icons[0];
                            const layerOptions = getRadioTaskLayerOptions(existingParameters.iconLayer);
                            const stationOptions = getRadioTaskIconOptions(icons, existingParameters.stationIcon || existingParameters.iconType1 || defaultIcon);
                            const sourceOptions = getRadioTaskIconOptions(icons, existingParameters.iconType1 || defaultIcon);
                            const targetOptions = getRadioTaskIconOptions(icons, existingParameters.iconType2 || icons[Math.min(1, icons.length - 1)]);
                            const candidateOptions = getRadioTaskIconOptions(icons, existingParameters.candidateIcon || defaultIcon);
                            const presetOptions = getRadioTaskPresetOptions(existingParameters.radioPreset);

                            if (selectedTask === 'identifyCoverageGaps') {
                                return `
<p>Estima a cobertura em uma grade sobre a área selecionada; células verdes indicam cobertura por ao menos uma estação e vermelhas indicam lacunas. A grade pode ser ampliada automaticamente para limitar o número de cálculos.</p>
<label for="coverageGapLayer">Camada com as estações:</label>
<select id="coverageGapLayer" class="swal2-input">${layerOptions}</select>
<div id="radioTaskLayerStatus" role="status"></div>
<label for="coverageGapStationIcon">Ícone das estações:</label>
<select id="coverageGapStationIcon" class="swal2-input">${stationOptions}</select>
<label for="coverageGapPreset">Rádio ou visada:</label>
<select id="coverageGapPreset" class="swal2-input">${presetOptions}</select>
<label for="coverageGapCellSize">Resolução aproximada da grade (km):</label>
<input id="coverageGapCellSize" class="swal2-input" type="number" min="0.2" step="0.2" value="${existingParameters.cellSizeKm || 2}">
<label for="coverageGapMaxDistance">Alcance máximo para avaliar cada estação (km):</label>
<input id="coverageGapMaxDistance" class="swal2-input" type="number" min="0.1" step="0.5" value="${existingParameters.maxDistance || 20}">
`;
                            }

                            if (selectedTask === 'checkRouteCommunication') {
                                return `
<p>A tarefa amostra as linhas da camada selecionada e verifica se há enlace viável com ao menos uma estação próxima.</p>
<label for="routeRadioLayer">Camada com as estações e rotas:</label>
<select id="routeRadioLayer" class="swal2-input">${layerOptions}</select>
<div id="radioTaskLayerStatus" role="status"></div>
<label for="routeStationIcon">Ícone das estações:</label>
<select id="routeStationIcon" class="swal2-input">${stationOptions}</select>
<label for="routeRadioPreset">Rádio ou visada:</label>
<select id="routeRadioPreset" class="swal2-input">${presetOptions}</select>
<label for="routeRadioMaxDistance">Distância máxima estação-rota (km):</label>
<input id="routeRadioMaxDistance" class="swal2-input" type="number" min="0.1" step="0.5" value="${existingParameters.maxDistance || 20}">
<label for="routeRadioInterval">Intervalo entre amostras (km):</label>
<input id="routeRadioInterval" class="swal2-input" type="number" min="0.1" step="0.1" value="${existingParameters.sampleInterval || 2}">
`;
                            }

                            if (selectedTask === 'suggestRepeaterPositions') {
                                return `
<p>Marque previamente no mapa as posições candidatas usando o ícone escolhido. A tarefa classifica as posições que alcançam os dois grupos.</p>
<label for="repeaterLayer">Camada dos grupos e candidatos:</label>
<select id="repeaterLayer" class="swal2-input">${layerOptions}</select>
<div id="radioTaskLayerStatus" role="status"></div>
<label for="repeaterCandidateIcon">Ícone usado nas posições candidatas:</label>
<select id="repeaterCandidateIcon" class="swal2-input">${candidateOptions}</select>
<label for="repeaterGroup1">Ícone do primeiro grupo:</label>
<select id="repeaterGroup1" class="swal2-input">${sourceOptions}</select>
<label for="repeaterGroup2">Ícone do segundo grupo:</label>
<select id="repeaterGroup2" class="swal2-input">${targetOptions}</select>
<label for="repeaterRadioPreset">Rádio ou visada:</label>
<select id="repeaterRadioPreset" class="swal2-input">${presetOptions}</select>
<label for="repeaterMaxDistance">Alcance máximo de cada enlace (km):</label>
<input id="repeaterMaxDistance" class="swal2-input" type="number" min="0.1" step="0.5" value="${existingParameters.maxDistance || 20}">
`;
                            }

                            return `
<label for="compareRadioLayer">Camada de origem dos ícones:</label>
<select id="compareRadioLayer" class="swal2-input">${layerOptions}</select>
<div id="radioTaskLayerStatus" role="status"></div>
<label for="compareRadioIcon1">Ícone de origem:</label>
<select id="compareRadioIcon1" class="swal2-input">${sourceOptions}</select>
<label for="compareRadioIcon2">Ícone de destino:</label>
<select id="compareRadioIcon2" class="swal2-input">${targetOptions}</select>
<label for="compareRadioMaxDistance">Distância máxima entre unidades (km):</label>
<input id="compareRadioMaxDistance" class="swal2-input" type="number" min="0.1" step="0.5" value="${existingParameters.maxDistance || 20}">
<p>A comparação avalia todos os presets RF e óticos cadastrados para cada par, até 30 pares por execução.</p>
`;
                        }


                        default:
                            return '<p style="text-align: center;"><i class="fas fa-question-circle" style="color: #6c757d;"></i> Tarefa desconhecida.</p>';
                                        }
                }

                /**
                 * Valida e extrai os parâmetros preenchidos para a tarefa selecionada.
                 * @param {string} selectedTask - Identificador do tipo de tarefa selecionado.
                 * @param {*} existingParameters - Parâmetros já salvos para preencher ou editar.
                 */
                async function getTaskParametersValues(selectedTask, existingParameters) {
                    const popup = Swal.getPopup();
                    switch (selectedTask) {
                        case 'findHighestPoint': {
                            const iconLayer = popup.querySelector('#iconLayerSelect').value;
                            const iconType = popup.querySelector('#iconType').value;
                            const maxDistance = parseFloat(popup.querySelector('#maxDistance').value);
                            const iconToInsert = popup.querySelector('#iconToInsert').value;
                            const numberOfNewIcons = parseInt(popup.querySelector('#numberOfNewIcons').value, 10);
                            const maxDistanceBetweenNewIcons = parseFloat(popup.querySelector('#maxDistanceBetweenNewIcons').value);

                            if (!iconLayer || !iconType || isNaN(maxDistance) || !iconToInsert || isNaN(numberOfNewIcons) || isNaN(maxDistanceBetweenNewIcons)) {
                                Swal.fire('Aviso', 'Preencha todos os campos corretamente.', 'warning');
                                return null;
                            }

                            return {
                                iconLayer,
                                iconType,
                                maxDistance,
                                iconToInsert,
                                numberOfNewIcons, // Novo parâmetro
                                maxDistanceBetweenNewIcons, // Novo parâmetro
                                area: existingParameters.area || null
                            };
                        }

                        case 'placeIcons': {
                            const iconUrl = popup.querySelector('#iconToInsert').value;
                            const criteria = parseFloat(popup.querySelector('#criteria').value);
                            const maxNumberOfIcons = parseInt(popup.querySelector('#maxNumberOfIcons').value, 10);
                            const minDistanceBetweenIcons = parseFloat(popup.querySelector('#minDistanceBetweenIcons').value);

                            if (!iconUrl || isNaN(criteria) || isNaN(maxNumberOfIcons) || isNaN(minDistanceBetweenIcons)) {
                                Swal.fire('Aviso', 'Preencha todos os campos corretamente.', 'warning');
                                return null;
                            }

                            return {
                                iconUrl,
                                criteria,
                                maxNumberOfIcons,           // Novo parâmetro
                                minDistanceBetweenIcons,    // Novo parâmetro
                                area: existingParameters.area || null
                            };
                        }

                        case 'drawLinesBetweenIcons': {
                            const iconLayer = popup.querySelector('#iconLayerSelect').value;
                            const iconType = popup.querySelector('#iconType').value;
                            const maxDistance = parseFloat(popup.querySelector('#maxDistance').value);
                            const maxConnectionsPerIcon = parseInt(popup.querySelector('#maxConnectionsPerIcon').value, 10);
                            const minDistanceBetweenLines = parseFloat(popup.querySelector('#minDistanceBetweenLines').value);

                            if (!iconLayer || !iconType || isNaN(maxDistance) || isNaN(maxConnectionsPerIcon) || isNaN(minDistanceBetweenLines)) {
                                Swal.fire('Aviso', 'Preencha todos os campos corretamente.', 'warning');
                                return null;
                            }

                            return {
                                iconLayer,
                                iconType,
                                maxDistance,
                                maxConnectionsPerIcon,     // Novo parâmetro
                                minDistanceBetweenLines,  // Novo parâmetro
                                area: existingParameters.area || null
                            };
                        }

                        case 'connectDifferentIcons': {
                            const iconLayerConnect = popup.querySelector('#iconLayerSelect').value;
                            const iconType1 = popup.querySelector('#iconType1').value;
                            const iconType2 = popup.querySelector('#iconType2').value;
                            const maxDistanceConnect = parseFloat(popup.querySelector('#maxDistance').value);
                            const maxConnectionsSource = parseInt(popup.querySelector('#maxConnectionsSource').value);
                            const maxConnectionsTarget = parseInt(popup.querySelector('#maxConnectionsTarget').value);
                            const connectionCriterion = popup.querySelector('#connectionCriterion').value;

                            if (!iconLayerConnect || !iconType1 || !iconType2 || isNaN(maxDistanceConnect) || isNaN(maxConnectionsSource) || isNaN(maxConnectionsTarget) || !connectionCriterion) {
                                await Swal.fire('Aviso', 'Preencha todos os campos corretamente.', 'warning');
                                return null;
                            }

                            return {
                                iconLayer: iconLayerConnect,
                                iconType1,
                                iconType2,
                                maxDistance: maxDistanceConnect,
                                maxConnectionsSource,
                                maxConnectionsTarget,
                                connectionCriterion,
                                area: existingParameters.area || null
                            };
                        }

                        case 'drawCoverageArea': {
                            const iconUrlCoverage = popup.querySelector('#iconToInsert').value;
                            const radius = parseFloat(popup.querySelector('#radius').value);

                            // Obter a camada selecionada para os desenhos
                            const coverageLayer = popup.querySelector('#coverageLayerSelect').value;

                            // Obter os ícones selecionados para cobrir
                            const iconTypesToCoverSelect = popup.querySelector('#iconTypesToCover');
                            const selectedOptions = Array.from(iconTypesToCoverSelect.selectedOptions);
                            const iconTypesToCover = selectedOptions.map(option => option.value);

                            if (!iconUrlCoverage || isNaN(radius) || !coverageLayer) {
                                await Swal.fire('Aviso', 'Preencha todos os campos corretamente.', 'warning');
                                return null;
                            }

                            return {
                                iconUrl: iconUrlCoverage,
                                radius,
                                iconTypesToCover,
                                coverageLayer, // Adicionado
                                area: existingParameters.area || null
                            };
                        }

                        case 'verifyRadioLinks': {
                            const iconLayer = popup.querySelector('#linkLayerSelect').value;
                            const iconType1 = popup.querySelector('#linkIconType1').value;
                            const iconType2 = popup.querySelector('#linkIconType2').value;
                            const radioPreset = popup.querySelector('#linkRadioPreset').value;
                            const maxDistance = parseFloat(popup.querySelector('#linkMaxDistance').value);
                            const availablePreset = radioPresets.some(preset => preset.id === radioPreset);

                            if (!iconLayer || !iconType1 || !iconType2 || !availablePreset || !Number.isFinite(maxDistance) || maxDistance <= 0) {
                                await Swal.fire('Aviso', 'Selecione os ícones e o perfil de rádio e informe uma distância máxima válida.', 'warning');
                                return null;
                            }

                            return {
                                iconLayer,
                                iconType1,
                                iconType2,
                                radioPreset,
                                maxDistance,
                                area: existingParameters.area || null
                            };
                        }

                        case 'identifyCoverageGaps': {
                            const iconLayer = popup.querySelector('#coverageGapLayer').value;
                            const stationIcon = popup.querySelector('#coverageGapStationIcon').value;
                            const radioPreset = popup.querySelector('#coverageGapPreset').value;
                            const cellSizeKm = parseFloat(popup.querySelector('#coverageGapCellSize').value);
                            const maxDistance = parseFloat(popup.querySelector('#coverageGapMaxDistance').value);
                            if (!iconLayer || !stationIcon || !radioPresets.some(preset => preset.id === radioPreset) ||
                                !Number.isFinite(cellSizeKm) || cellSizeKm < 0.2 ||
                                !Number.isFinite(maxDistance) || maxDistance <= 0) {
                                await Swal.fire('Aviso', 'Informe estações, preset, resolução e alcance válidos.', 'warning');
                                return null;
                            }
                            return { iconLayer, stationIcon, radioPreset, cellSizeKm, maxDistance, area: existingParameters.area || null };
                        }

                        case 'checkRouteCommunication': {
                            const iconLayer = popup.querySelector('#routeRadioLayer').value;
                            const stationIcon = popup.querySelector('#routeStationIcon').value;
                            const radioPreset = popup.querySelector('#routeRadioPreset').value;
                            const maxDistance = parseFloat(popup.querySelector('#routeRadioMaxDistance').value);
                            const sampleInterval = parseFloat(popup.querySelector('#routeRadioInterval').value);
                            if (!iconLayer || !stationIcon || !radioPresets.some(preset => preset.id === radioPreset) ||
                                !Number.isFinite(maxDistance) || maxDistance <= 0 ||
                                !Number.isFinite(sampleInterval) || sampleInterval < 0.1) {
                                await Swal.fire('Aviso', 'Informe estações, preset, alcance e intervalo válidos.', 'warning');
                                return null;
                            }
                            return { iconLayer, stationIcon, radioPreset, maxDistance, sampleInterval, area: existingParameters.area || null };
                        }

                        case 'suggestRepeaterPositions': {
                            const iconLayer = popup.querySelector('#repeaterLayer').value;
                            const candidateIcon = popup.querySelector('#repeaterCandidateIcon').value;
                            const iconType1 = popup.querySelector('#repeaterGroup1').value;
                            const iconType2 = popup.querySelector('#repeaterGroup2').value;
                            const radioPreset = popup.querySelector('#repeaterRadioPreset').value;
                            const maxDistance = parseFloat(popup.querySelector('#repeaterMaxDistance').value);
                            if (!iconLayer || !candidateIcon || !iconType1 || !iconType2 ||
                                !radioPresets.some(preset => preset.id === radioPreset) ||
                                !Number.isFinite(maxDistance) || maxDistance <= 0) {
                                await Swal.fire('Aviso', 'Informe candidatos, os dois grupos, preset e alcance válidos.', 'warning');
                                return null;
                            }
                            return { iconLayer, candidateIcon, iconType1, iconType2, radioPreset, maxDistance, area: existingParameters.area || null };
                        }

                        case 'compareRadioPresets': {
                            const iconLayer = popup.querySelector('#compareRadioLayer').value;
                            const iconType1 = popup.querySelector('#compareRadioIcon1').value;
                            const iconType2 = popup.querySelector('#compareRadioIcon2').value;
                            const maxDistance = parseFloat(popup.querySelector('#compareRadioMaxDistance').value);
                            if (!iconLayer || !iconType1 || !iconType2 || !Number.isFinite(maxDistance) || maxDistance <= 0) {
                                await Swal.fire('Aviso', 'Selecione os ícones e informe uma distância máxima válida.', 'warning');
                                return null;
                            }
                            return { iconLayer, iconType1, iconType2, maxDistance, area: existingParameters.area || null };
                        }


                        default:
                            Swal.fire('Erro', 'Tarefa desconhecida', 'error');
                            return null;
                                        }
                }

        return Object.freeze({
            getHtml: getTaskParametersHtml,
            getValues: getTaskParametersValues,
            bind: bindRadioTaskForm,
            getPresetLabel: getRadioPresetLabel
        });
    }
});
