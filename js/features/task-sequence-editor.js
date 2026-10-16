/**
 * @fileoverview Apresenta, edita, reordena e executa tarefas que compõem uma sequência de planejamento.
 * @exports window.PlanMilT.taskSequenceEditor
 * @requires Estado de tarefas, armazenamento, parâmetros, mapa e SweetAlert injetados
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.taskSequenceEditor = Object.freeze({
    /**
     * Conecta estado, armazenamento e interface para editar uma sequência de tarefas.
     * @param {Object} dependencies - Dependências externas necessárias para inicializar o módulo.
     * @param {Function} dependencies.getTasks - Função que fornece a lista atual de tarefas.
     * @param {Function} dependencies.setTasks - Função que substitui a lista atual de tarefas.
     * @param {Object} dependencies.taskParameters - Controlador dos formulários de parâmetros das tarefas.
     * @param {Function} dependencies.getStorage - Função que fornece o armazenamento da sequência.
     * @param {Function} dependencies.drawSelectionArea - Função que permite selecionar uma área no mapa.
     * @param {Function} dependencies.executeSequence - Função que executa a sequência de tarefas.
     * @param {Object} dependencies.sweetAlert - Interface SweetAlert para confirmação, carregamento e notificações.
     */
    attach({ getTasks, setTasks, taskParameters, getStorage, drawSelectionArea, executeSequence, sweetAlert }) {
        const Swal = sweetAlert;
        let existingParameters = {};
        let selectedTask = '';

                /**
                 * Conduz a criação e execução de uma sequência de planejamento.
                 */
                async function startPlanning() {
                    // Pergunta ao usuário se deseja limpar a camada de planejamento
                    const { isConfirmed } = await Swal.fire({
                        title: 'Limpar Camada de Planejamento',
                        text: 'Deseja limpar a camada de planejamento antes de iniciar um novo planejamento?',
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: 'Sim',
                        cancelButtonText: 'Não'
                    });

                    if (isConfirmed) {
                        planejamentoLayer.clearLayers();
                        console.info('[PlanMilT][Planejamento] Camada de planejamento limpa.');
                    }

                    // Inicia a definição de tarefas em uma única tela
                    await defineTasksInSingleScreen();
                }


                // Função para definir tarefas na tela
                /**
                 * Apresenta o fluxo de edição da sequência de tarefas em uma tela.
                 */
                async function defineTasksInSingleScreen() {
                    // Obter os tipos de tarefas disponíveis
                    const taskOptions = {
                        'findHighestPoint': 'Encontrar o ponto mais alto próximo a um ícone',
                        'placeIcons': 'Colocar múltiplos ícones em locais que atendam a certos critérios',
                        'drawLinesBetweenIcons': 'Desenhar linhas entre ícones do mesmo tipo',
                        'connectDifferentIcons': 'Conectar ícones diferentes com linhas',
                        'drawCoverageArea': 'Desenhar área de cobertura com ícone central',
                        'verifyRadioLinks': 'Verificar enlaces de rádio e visada entre ícones',
                        'identifyCoverageGaps': 'Identificar lacunas de cobertura RF/visada',
                        'checkRouteCommunication': 'Verificar comunicação ao longo de uma rota',
                        'suggestRepeaterPositions': 'Sugerir posições para repetidores',
                        'compareRadioPresets': 'Comparar presets de rádio e visada'
                    };
                    const taskDescriptions = {
                        findHighestPoint: {
                            purpose: 'Localiza o ponto de maior elevação perto de um ícone de referência e permite posicionar novos ícones a partir dessa referência.',
                            setup: 'Tenha na camada escolhida os ícones de referência e deixe visível no mapa a área a analisar. O alcance define a distância máxima de busca a partir de cada ícone.',
                            result: 'Adiciona à sugestão de planejamento os pontos encontrados e os novos ícones configurados.'
                        },
                        placeIcons: {
                            purpose: 'Distribui vários ícones em locais da área que atendam ao critério de elevação definido.',
                            setup: 'Enquadre no mapa a área a analisar e escolha o critério de elevação e a distância mínima entre posições.',
                            result: 'Adiciona os ícones posicionados à sugestão de planejamento.'
                        },
                        drawLinesBetweenIcons: {
                            purpose: 'Cria conexões entre ícones do mesmo tipo, respeitando distâncias e limites de conexões.',
                            setup: 'Coloque pelo menos dois ícones do tipo escolhido na camada selecionada e deixe visível no mapa a área desejada.',
                            result: 'Desenha as linhas aceitas na sugestão de planejamento.'
                        },
                        connectDifferentIcons: {
                            purpose: 'Conecta dois tipos de ícones diferentes, limitando o número de conexões por unidade.',
                            setup: 'Coloque os dois tipos de ícone na camada escolhida e ajuste a área visível do mapa para a região de interesse.',
                            result: 'Desenha conexões entre os dois grupos na sugestão de planejamento.'
                        },
                        drawCoverageArea: {
                            purpose: 'Seleciona posições centrais para cobrir os tipos de ícone escolhidos dentro de um raio.',
                            setup: 'Tenha os ícones a cobrir na camada selecionada e enquadre a região de interesse no mapa. Configure também o raio de cobertura.',
                            result: 'Adiciona ícones centrais e polígonos aproximados de cobertura.'
                        },
                        verifyRadioLinks: {
                            purpose: 'Analisa cada par de unidades do tipo selecionado e classifica os enlaces segundo um preset RF ou ótico.',
                            setup: 'Os dois tipos de ícone devem existir na camada escolhida e estar dentro da área visível do mapa. Escolha um preset e a distância máxima.',
                            result: 'Desenha enlaces viáveis em verde e falhos em vermelho, com distância, sinal e obstrução no popup.'
                        },
                        identifyCoverageGaps: {
                            purpose: 'Estima a cobertura RF ou de visada em uma grade e aponta células que nenhuma estação selecionada consegue alcançar.',
                            setup: 'Coloque as estações na camada escolhida e enquadre no mapa a área a avaliar. A resolução desejada pode ser definida a partir de 10 m; limites de cálculo podem aumentá-la automaticamente.',
                            result: 'Desenha células cobertas em verde e lacunas estimadas em vermelho na sugestão de planejamento.'
                        },
                        checkRouteCommunication: {
                            purpose: 'Verifica se os pontos de uma ou mais linhas de rota mantêm enlace com pelo menos uma estação próxima.',
                            setup: 'Na mesma camada, desenhe a rota como linha e coloque os marcadores das estações. Deixe visível no mapa o trecho que deseja avaliar.',
                            result: 'Marca amostras com comunicação estimada em verde e falhas em vermelho; a distância entre amostras é configurável.'
                        },
                        suggestRepeaterPositions: {
                            purpose: 'Busca automaticamente locais para uma repetidora que consiga alcançar unidades de dois grupos.',
                            setup: 'Coloque os ícones dos dois grupos na camada escolhida e enquadre a região de interesse no mapa. Defina o espaçamento dos locais avaliados, o alcance de cada enlace e o preset de rádio ou visada.',
                            result: 'Adiciona até dez posições recomendadas com o ícone de repetidora escolhido; a melhor posição aparece primeiro.'
                        },
                        compareRadioPresets: {
                            purpose: 'Avalia os mesmos pares de unidades com todos os presets RF e óticos e facilita comparar quais configurações atendem.',
                            setup: 'Os dois tipos de ícone devem existir na camada escolhida e estar na área visível do mapa. Defina a distância máxima; são comparados até 30 pares.',
                            result: 'Desenha cada par e mostra no popup a viabilidade e o sinal estimado de cada preset.'
                        }
                    };

                    // Variáveis para rastrear o modo de edição
                    let isEditing = false;
                    let editingIndex = null;

                    // HTML para o modal
                    let modalContent = `
<style>
#taskParameters .task-parameter-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 16px;
    margin-top: 12px;
}
#taskParameters .task-parameter-description,
#taskParameters .task-parameter-status {
    grid-column: 1 / -1;
    margin: 0;
}
#taskParameters .task-parameter-description {
    color: #4b5563;
    font-size: 13px;
    line-height: 1.45;
}
#taskParameters .task-parameter-field {
    display: grid;
    align-content: start;
    gap: 5px;
    min-width: 0;
}
#taskParameters .task-parameter-field label {
    display: block;
    margin: 0;
    color: #303846;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
}
#taskParameters .task-parameter-field label i {
    width: 16px;
    margin-right: 5px;
    color: #435f88;
    text-align: center;
}
#taskParameters .task-parameter-form .swal2-input {
    box-sizing: border-box;
    width: 100% !important;
    max-width: 100%;
    height: 40px;
    margin: 0 !important;
    padding: 0 10px;
    border: 1px solid #c5cad2;
    border-radius: 6px;
    font-size: 14px;
}
#taskParameters .task-parameter-status {
    color: #4b5563;
    font-size: 12px;
    line-height: 1.4;
}
@media (max-width: 640px) {
    #taskParameters .task-parameter-form {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
<div style="text-align: left; max-height: 80vh; overflow-y: auto; padding: 20px;">

<label for="taskSelect">Selecione uma Tarefa:</label>
<select id="taskSelect" class="swal2-input">
<option value="" disabled ${selectedTask ? '' : 'selected'}>Selecione uma tarefa</option>
${Object.entries(taskOptions).map(([value, text]) => `<option value="${value}" ${selectedTask === value ? 'selected' : ''}>${text}</option>`).join('')}
            </select>
<div id="taskDescription" role="status" style="margin: 8px 0 14px; padding: 12px; border-left: 4px solid #435f88; background: #f3f6fa; color: #303846; font-size: 13px; line-height: 1.5;"></div>
<div id="taskParameters" style="margin-top: 10px;"></div>
<button id="addTaskButton" class="swal2-confirm swal2-styled" style="margin-top: 10px;"><i class="fa fa-plus"></i> Adicionar Tarefa</button>
<button id="clearTasksButton" class="swal2-cancel swal2-styled" style="margin-top: 10px; margin-left: 10px;"><i class="fa fa-trash"></i> Limpar Tarefa(s)</button>
<hr>
<h3>Sequência de Tarefas:</h3>
<div id="taskSequenceList"></div>
<hr>
<div style="display: flex; justify-content: space-between; margin-top: 10px;">
<button id="saveSequenceButton" class="swal2-confirm swal2-styled" style="flex: 1; margin-right: 10px;"><i class="fa fa-save"></i> Salvar Sequência</button>
<button id="loadSequenceButton" class="swal2-confirm swal2-styled" style="flex: 1; margin-right: 10px;"><i class="fa fa-folder-open"></i> Carregar Sequência</button>
<button id="executeSequenceButton" class="swal2-confirm swal2-styled" style="flex: 1;"><i class="fa fa-play"></i> Executar Sequência</button>
<button id="deleteSequenceButton" class="swal2-confirm swal2-styled" style="flex: 1; margin-left: 10px;"><i class="fa fa-trash"></i> Deletar Sequência</button>

            </div>

            </div>
`;

                    // Mostrar o modal
                    await Swal.fire({
                        title: '<i class="fa fa-tasks"></i> Planejamento de Tarefas',
                        html: modalContent,
                        width: '80%', // Define a largura do modal para 80% da viewport
                        showConfirmButton: false,
                        showCancelButton: true,
                        cancelButtonText: '<i class="fa fa-times"></i> Cancelar',
                        allowOutsideClick: false,
                        didOpen: async () => {
                            const popup = Swal.getPopup();
                            const taskSelect = popup.querySelector('#taskSelect');
                            const taskParametersDiv = popup.querySelector('#taskParameters');
                            const addTaskButton = popup.querySelector('#addTaskButton');
                            const taskSequenceList = popup.querySelector('#taskSequenceList');
                            const saveSequenceButton = popup.querySelector('#saveSequenceButton');
                            const loadSequenceButton = popup.querySelector('#loadSequenceButton'); // Novo botão
                            const executeSequenceButton = popup.querySelector('#executeSequenceButton');
                            const deleteSequenceButton = popup.querySelector('#deleteSequenceButton');
                            const clearTasksButton = popup.querySelector('#clearTasksButton');
                            const taskDescriptionDiv = popup.querySelector('#taskDescription');

                            function updateTaskDescription(taskName) {
                                const description = taskDescriptions[taskName];
                                if (!description) {
                                    taskDescriptionDiv.innerHTML = `
Selecione uma tarefa para ver para que serve, o que preparar no mapa e qual resultado será criado.
<br><strong>Área de análise:</strong> quando a tarefa pedir para enquadrar uma região, o cálculo considera a área visível do mapa no momento da execução.
<br><strong>Camada de sugestões:</strong> se for usar itens já existentes nessa camada como entrada, escolha <em>Não</em> na confirmação de limpeza exibida antes deste painel.`;
                                    return;
                                }
                                taskDescriptionDiv.innerHTML = `
<strong>Para que serve:</strong> ${description.purpose}<br>
<strong>Antes de executar:</strong> ${description.setup}<br>
<strong>Resultado:</strong> ${description.result}`;
                            }

                            async function renderTaskParameters(taskName, parameters) {
                                taskParametersDiv.innerHTML = await taskParameters.getHtml(taskName, parameters);
                                if (typeof taskParameters.bind === 'function') {
                                    taskParameters.bind(taskName, taskParametersDiv);
                                }
                            }

                            // Atualiza os parâmetros da tarefa se uma tarefa já estiver selecionada
                            if (selectedTask) {
                                updateTaskDescription(selectedTask);
                                await renderTaskParameters(selectedTask, existingParameters);
                            } else {
                                updateTaskDescription('');
                            }

                            // Função para atualizar a lista de tarefas
                            /**
                             * Atualiza a lista visual de tarefas da sequência.
                             */
                            function updateTaskSequenceList() {
                                if (getTasks().length === 0) {
                                    taskSequenceList.innerHTML = '<p>Nenhuma tarefa adicionada.</p>';
                                } else {
                                    taskSequenceList.innerHTML = getTasks().map((task, index) => {
                                        if (!task || !task.task || !task.parameters) {
                                            console.error('[PlanMilT][Sequências] Tarefa incompleta na lista.', { index });
                                            return '';
                                        }
                                        return `<div style="margin-bottom: 10px;">
<b>${index + 1}. ${taskOptions[task.task]}</b>
<button data-index="${index}" class="viewTaskButton" style="margin-left: 5px; cursor: pointer;"><i class="fa fa-info-circle"></i></button>
<button data-index="${index}" class="editTaskButton" style="margin-left: 5px; cursor: pointer;"><i class="fa fa-edit"></i></button>
<button data-index="${index}" class="removeTaskButton" style="margin-left: 5px; cursor: pointer;"><i class="fa fa-trash"></i></button>
            </div>`;
                                    }).join('');
                                    // Adicionar eventos para os botões de visualizar, editar e remover
                                    taskSequenceList.querySelectorAll('.viewTaskButton').forEach(button => {
                                        button.addEventListener('click', (e) => {
                                            const index = e.target.closest('button').getAttribute('data-index');
                                            viewTask(index);
                                        });
                                    });
                                    taskSequenceList.querySelectorAll('.editTaskButton').forEach(button => {
                                        button.addEventListener('click', async (e) => {
                                            const index = e.target.closest('button').getAttribute('data-index');
                                            await editTask(index);
                                        });
                                    });
                                    taskSequenceList.querySelectorAll('.removeTaskButton').forEach(button => {
                                        button.addEventListener('click', (e) => {
                                            const index = e.target.closest('button').getAttribute('data-index');
                                            removeTask(index);
                                        });
                                    });
                                }
                            }

                            // Chama a atualização inicial da lista
                            updateTaskSequenceList();

                            // Evento ao mudar a seleção de tarefa
                            taskSelect.addEventListener('change', async () => {
                                selectedTask = taskSelect.value;
                                existingParameters = {}; // Reset existing parameters
                                updateTaskDescription(selectedTask);
                                await renderTaskParameters(selectedTask, existingParameters);
                            });

                            // Evento ao clicar em "Adicionar/Atualizar Tarefa"
                            addTaskButton.addEventListener('click', async () => {
                                if (!selectedTask) {
                                    await Swal.fire('Aviso', 'Selecione uma tarefa antes de adicionar.', 'warning');
                                    return;
                                }
                                // Coletar parâmetros da tarefa
                                const parameterValues = await taskParameters.getValues(selectedTask, existingParameters);
                                if (parameterValues) {
                                    if (isEditing && editingIndex !== null) {
                                        // Atualizar a tarefa existente
                                        getTasks()[editingIndex] = {
                                            task: selectedTask,
                                            parameters: parameterValues
                                        };
                                        isEditing = false;
                                        editingIndex = null;
                                        addTaskButton.innerHTML = '<i class="fa fa-plus"></i> Adicionar Tarefa';
                                    } else {
                                        // Adicionar nova tarefa à sequência
                                        getTasks().push({
                                            task: selectedTask,
                                            parameters: parameterValues
                                        });
                                    }
                                    // Limpar seleção
                                    taskSelect.value = '';
                                    taskParametersDiv.innerHTML = '';
                                    updateTaskDescription('');
                                    existingParameters = {};
                                    selectedTask = '';
                                    // Atualizar a lista de tarefas
                                    updateTaskSequenceList();
                                    // Manter o modal aberto
                                }
                            });

                            // Evento ao clicar em "Salvar Sequência"
                            saveSequenceButton.addEventListener('click', async () => {
                                if (getTasks().length === 0) {
                                    Swal.fire('Aviso', 'Adicione pelo menos uma tarefa antes de salvar.', 'warning');
                                    return;
                                }
                                await getStorage().saveTaskSequence();
                            });

                            // Evento ao clicar em "Carregar Sequência"
                            loadSequenceButton.addEventListener('click', async () => {
                                await getStorage().loadTaskSequences();
                                // Atualizar a lista de tarefas após carregar
                                updateTaskSequenceList();
                                // Exibir o modal novamente para manter o fluxo
                                defineTasksInSingleScreen();
                            });


                            deleteSequenceButton.addEventListener('click', async () => {
                                await getStorage().deleteTaskSequence();
                                // Exibir o modal novamente para manter o fluxo
                                defineTasksInSingleScreen();
                            });

                            // Evento ao clicar em "Executar Sequência"
                            executeSequenceButton.addEventListener('click', async () => {
                                if (getTasks().length === 0) {
                                    Swal.fire('Aviso', 'Adicione pelo menos uma tarefa antes de executar.', 'warning');
                                    return;
                                }
                                await executeSequence();
                                Swal.close(); // Fecha o modal após executar
                            });

                            // Função para visualizar detalhes da tarefa
                            /**
                             * Apresenta os detalhes da tarefa no índice informado.
                             * @param {number} index - Índice da tarefa ou elemento na lista.
                             */
                            function viewTask(index) {
                                const task = getTasks()[index];
                                if (!task) {
                                    Swal.fire('Erro', 'Tarefa não encontrada.', 'error');
                                    return;
                                }
                                const taskName = taskOptions[task.task];
                                const taskParams = task.parameters;

                                if (!taskName || !taskParams) {
                                    Swal.fire('Erro', 'Detalhes da tarefa estão incompletos.', 'error');
                                    return;
                                }

                                const parameterLabels = {
                                    iconLayer: 'Camada de origem',
                                    iconType: 'Tipo de ícone',
                                    iconType1: 'Ícone de origem / grupo 1',
                                    iconType2: 'Ícone de destino / grupo 2',
                                    stationIcon: 'Ícone das estações',
                                    repeaterIcon: 'Ícone da repetidora sugerida',
                                    repeaterIconUrl: 'Ícone da repetidora sugerida',
                                    radioPreset: 'Preset de rádio/visada',
                                    maxDistance: 'Distância máxima (km)',
                                    cellSizeKm: task.task === 'suggestRepeaterPositions'
                                        ? 'Espaçamento da grade (km)'
                                        : task.task === 'identifyCoverageGaps'
                                            ? 'Resolução desejada da grade (m)'
                                            : 'Resolução da grade (km)',
                                    sampleInterval: 'Intervalo entre amostras (km)',
                                    numberOfNewIcons: 'Quantidade de novos ícones',
                                    maxDistanceBetweenNewIcons: 'Distância entre novos ícones (km)',
                                    maxConnectionsPerIcon: 'Máximo de conexões por ícone',
                                    maxConnectionsSource: 'Máximo de conexões na origem',
                                    maxConnectionsTarget: 'Máximo de conexões no destino',
                                    minDistanceBetweenIcons: 'Distância mínima entre ícones (m)',
                                    minDistanceBetweenLines: 'Distância mínima entre linhas (m)',
                                    connectionCriterion: 'Critério de conexão',
                                    radius: 'Raio de cobertura (km)',
                                    iconTypesToCover: 'Tipos de ícones a cobrir',
                                    iconToInsert: 'Ícone a inserir',
                                    iconUrl: 'Ícone a inserir',
                                    criteria: 'Critério de elevação',
                                    coverageLayer: 'Camada dos ícones a cobrir',
                                    maxNumberOfIcons: 'Quantidade máxima de ícones'
                                };
                                const layerLabels = {
                                    drawnItems: 'Camada de Desenho Atual',
                                    planningSuggestions: 'Sugestão de Planejamento'
                                };
                                const escapeHtml = value => String(value)
                                    .replaceAll('&', '&amp;')
                                    .replaceAll('<', '&lt;')
                                    .replaceAll('>', '&gt;')
                                    .replaceAll('"', '&quot;')
                                    .replaceAll("'", '&#039;');
                                const formatValue = (key, value) => {
                                    if (value === null || value === undefined || value === '') return '';
                                    if (key === 'iconLayer' || key === 'coverageLayer') {
                                        return layerLabels[value] || escapeHtml(value);
                                    }
                                    if (key === 'radioPreset') {
                                        return escapeHtml(taskParameters.getPresetLabel?.(value) || value);
                                    }
                                    if (key === 'connectionCriterion') {
                                        return value === 'closest' ? 'Ícones mais próximos' : 'Ícones mais distantes';
                                    }
                                    if (key === 'cellSizeKm' && task.task === 'identifyCoverageGaps') {
                                        return `${escapeHtml(Number(value) * 1000)} m`;
                                    }
                                    if (key === 'criteria') return `${escapeHtml(value)} m`;
                                    if (key.toLowerCase().includes('icon') && typeof value === 'string') {
                                        return escapeHtml(value.substring(value.lastIndexOf('/') + 1).split('.')[0]);
                                    }
                                    if (Array.isArray(value)) {
                                        return escapeHtml(value.map(item => String(item).substring(String(item).lastIndexOf('/') + 1).split('.')[0]).join(', '));
                                    }
                                    if (typeof value === 'object') return escapeHtml(JSON.stringify(value));
                                    return escapeHtml(value);
                                };
                                const paramsHtml = Object.entries(taskParams)
                                    .map(([key, value]) => {
                                        const displayValue = formatValue(key, value);
                                        return displayValue
                                            ? `<li><strong>${parameterLabels[key] || key}:</strong> ${displayValue}</li>`
                                            : '';
                                    })
                                    .filter(Boolean)
                                    .join('');
                                const description = taskDescriptions[task.task];
                                const safeTaskName = escapeHtml(taskName);

                                Swal.fire({
                                    title: `<i class="fa fa-info-circle"></i> Detalhes da Tarefa`,
                                    html: `
<div style="text-align:left; line-height:1.5">
<b>${index + 1}. ${safeTaskName}</b>
${description ? `<p><strong>Para que serve:</strong> ${description.purpose}</p><p><strong>Antes de executar:</strong> ${description.setup}</p><p><strong>Resultado:</strong> ${description.result}</p>` : ''}
<strong>Parâmetros:</strong><ul>${paramsHtml || '<li>Nenhum parâmetro adicional.</li>'}</ul>
</div>`,
                                    icon: 'info',
                                    confirmButtonText: '<i class="fa fa-check"></i> Fechar',
                                    allowOutsideClick: false
                                }).then(() => {
                                    // Reabrir o modal principal após fechar os detalhes
                                    defineTasksInSingleScreen();
                                });
                            }

                            // Função para editar uma tarefa na sequência
                            /**
                             * Abre a edição dos parâmetros da tarefa no índice informado.
                             * @param {number} index - Índice da tarefa ou elemento na lista.
                             */
                            async function editTask(index) {
                                const task = getTasks()[index];
                                if (!task) {
                                    Swal.fire('Erro', 'Tarefa não encontrada.', 'error');
                                    return;
                                }
                                existingParameters = task.parameters;
                                selectedTask = task.task;
                                isEditing = true;
                                editingIndex = index;
                                // Mostrar os parâmetros da tarefa para edição
                                updateTaskDescription(selectedTask);
                                await renderTaskParameters(selectedTask, existingParameters);
                                // Atualizar o botão para "Atualizar Tarefa"
                                addTaskButton.innerHTML = '<i class="fa fa-sync-alt"></i> Atualizar Tarefa';
                                // Atualizar a seleção no select
                                taskSelect.value = selectedTask;
                            }

                            // Função para remover uma tarefa da sequência
                            /**
                             * Remove do estado da sequência a tarefa indicada pelo índice.
                             * @param {number} index - Índice da tarefa ou elemento na lista.
                             */
                            function removeTask(index) {
                                Swal.fire({
                                    title: 'Confirmar Remoção',
                                    text: 'Tem certeza de que deseja remover esta tarefa?',
                                    icon: 'warning',
                                    showCancelButton: true,
                                    confirmButtonText: '<i class="fa fa-trash"></i> Remover',
                                    cancelButtonText: '<i class="fa fa-times"></i> Cancelar'
                                }).then((result) => {
                                    if (result.isConfirmed) {
                                        getTasks().splice(index, 1);
                                        updateTaskSequenceList();
                                        Swal.fire('Removido!', 'A tarefa foi removida.', 'success').then(() => {
                                            // Reabrir o modal principal após remover
                                            defineTasksInSingleScreen();
                                        });
                                    }
                                });
                            }

                            // Evento ao clicar em "Limpar tarefa(s)"
                            clearTasksButton.addEventListener('click', async () => {
                                // Confirmar a ação com o usuário
                                const result = await Swal.fire({
                                    title: 'Confirmar Limpeza',
                                    text: 'Tem certeza de que deseja remover todas as tarefas atuais?',
                                    icon: 'warning',
                                    showCancelButton: true,
                                    confirmButtonText: '<i class="fa fa-trash"></i> Limpar',
                                    cancelButtonText: '<i class="fa fa-times"></i> Cancelar'
                                });

                                if (result.isConfirmed) {
                                    // Limpar a sequência de tarefas
                                    setTasks([]);
                                    // Atualizar a lista de tarefas na interface
                                    updateTaskSequenceList();
                                    // Resetar as seleções e parâmetros
                                    taskSelect.value = '';
                                    taskParametersDiv.innerHTML = '';
                                    updateTaskDescription('');
                                    existingParameters = {};
                                    selectedTask = '';
                                    isEditing = false;
                                    editingIndex = null;
                                    addTaskButton.innerHTML = '<i class="fa fa-plus"></i> Adicionar Tarefa';
                                    // Log da ação
                                    addToLog('Todas as tarefas foram removidas.');
                                    defineTasksInSingleScreen();
                                }
                            });
                        }
                    });
                }

        return Object.freeze({ startPlanning, defineTasksInSingleScreen });
    }
});
