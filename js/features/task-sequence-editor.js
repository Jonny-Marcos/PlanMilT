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
                        'verifyRadioLinks': 'Verificar enlaces de rádio e visada entre ícones'
                    };

                    // Variáveis para rastrear o modo de edição
                    let isEditing = false;
                    let editingIndex = null;

                    // HTML para o modal
                    let modalContent = `
<div style="text-align: left; max-height: 80vh; overflow-y: auto; padding: 20px;">

<label for="taskSelect">Selecione uma Tarefa:</label>
<select id="taskSelect" class="swal2-input">
<option value="" disabled ${selectedTask ? '' : 'selected'}>Selecione uma tarefa</option>
${Object.entries(taskOptions).map(([value, text]) => `<option value="${value}" ${selectedTask === value ? 'selected' : ''}>${text}</option>`).join('')}
            </select>
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


                            // Atualiza os parâmetros da tarefa se uma tarefa já estiver selecionada
                            if (selectedTask) {
                                taskParametersDiv.innerHTML = await taskParameters.getHtml(selectedTask, existingParameters);
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
                                // Mostrar parâmetros para a tarefa selecionada
                                taskParametersDiv.innerHTML = await taskParameters.getHtml(selectedTask, existingParameters);
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

                                let paramsHtml = '<ul>';
                                for (const [key, value] of Object.entries(taskParams)) {
                                    paramsHtml += `<li><strong>${key}:</strong> ${value}</li>`;
                                }
                                paramsHtml += '</ul>';

                                Swal.fire({
                                    title: `<i class="fa fa-info-circle"></i> Detalhes da Tarefa`,
                                    html: `<b>${index + 1}. ${taskName}</b><br>${paramsHtml}`,
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
                                taskParametersDiv.innerHTML = await taskParameters.getHtml(selectedTask, existingParameters);
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
