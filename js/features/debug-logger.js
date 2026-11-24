/**
 * @fileoverview Oferece rastreamento opcional de operações demoradas sem registrar dados de entrada.
 * @exports window.PlanMilT.debugLogger
 */
(() => {
    window.PlanMilT = window.PlanMilT || {};

    let enabled = true;

    window.PlanMilT.debugLogger = Object.freeze({
        /**
         * Ativa o rastreamento até a página ser recarregada ou desativado manualmente.
         */
        enable() {
            enabled = true;
            console.info('[PlanMilT][Debug] Rastreamento ativado.');
        },

        /**
         * Desativa o rastreamento de novas operações.
         */
        disable() {
            enabled = false;
        },

        /**
         * Registra início, conclusão, duração ou falha de uma operação.
         * @param {string} operation - Identificador estático da operação, sem dados do usuário.
         * @returns {Object} Métodos para concluir ou registrar falha da operação.
         */
        start(operation) {
            if (!enabled) {
                return { finish() {}, fail() {} };
            }

            const startedAt = Date.now();
            let completed = false;
            console.debug('[PlanMilT][Debug] Operação iniciada.', { operation });

            return {
                finish() {
                    if (completed) return;
                    completed = true;
                    console.debug('[PlanMilT][Debug] Operação concluída.', {
                        operation,
                        durationMs: Date.now() - startedAt
                    });
                },
                fail(error) {
                    if (completed) return;
                    completed = true;
                    console.error('[PlanMilT][Debug] Operação falhou.', {
                        operation,
                        durationMs: Date.now() - startedAt,
                        errorName: error instanceof Error ? error.name : 'Error'
                    });
                }
            };
        }
    });
})();
