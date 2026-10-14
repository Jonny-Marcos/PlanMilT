/**
 * @fileoverview Conecta o botão de planejamento automático ao editor de sequências de tarefas.
 * @requires DOM e taskEditor inicializados no escopo legado.
 */
                document.getElementById('startPlanning').addEventListener('click', async function () {
                    const startButton = document.getElementById('startPlanning');

                    // Desabilita o botão para evitar novos cliques
                    startButton.disabled = true;

                    try {
                        await taskEditor.startPlanning(); // Aguarda a conclusão da sequência de tarefas
                    } catch (error) {
                        console.error('Erro na execução da sequência de tarefas:', error);
                    } finally {
                        // Reabilita o botão após a conclusão
                        startButton.disabled = false;
                    }
                });








                // Função para deletar uma sequência de tarefas
                var taskSequenceStorage = window.PlanMilT.taskSequenceStorage.attach({
                    getTasks: () => taskSequence,
                    setTasks: tasks => { taskSequence = tasks; },
                    renderTasks: () => taskEditor.defineTasksInSingleScreen(),
                    sweetAlert: Swal,
                    request: window.PlanMilT.apiClient.request
                });
                var deleteTaskSequence = taskSequenceStorage.deleteTaskSequence;
                var saveTaskSequence = taskSequenceStorage.saveTaskSequence;
                var loadTaskSequences = taskSequenceStorage.loadTaskSequences;
                var loadTaskSequenceDetails = taskSequenceStorage.loadTaskSequenceDetails;
