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
     */
    attach({ apiClient, sweetAlert, radioPresets = [] }) {
        const Swal = sweetAlert;

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


                        default:
                            Swal.fire('Erro', 'Tarefa desconhecida', 'error');
                            return null;
                                        }
                }

        return Object.freeze({
            getHtml: getTaskParametersHtml,
            getValues: getTaskParametersValues
        });
    }
});
