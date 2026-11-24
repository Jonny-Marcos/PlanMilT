/**
 * @fileoverview Oferece rastreamento opcional de operações demoradas sem registrar dados de entrada.
 * @exports window.PlanMilT.debugLogger
 */
(() => {
    window.PlanMilT = window.PlanMilT || {};

    let enabled = true;
    const safeDetailKeys = new Set([
        'source', 'offlineOnly', 'zoom', 'sceneVersion', 'cacheCount', 'tileCount',
        'tilesCompleted', 'cacheMisses', 'opaqueTiles', 'responseType', 'responseStatus',
        'responseOk', 'cacheResult', 'errorName', 'requiredTileCount', 'availableTileCount',
        'missingTileCount', 'terrainCacheCount', 'cachedTileCount', 'opaqueTileCount',
        'failedTileCount', 'terrainSampleCount'
    ]);

    function isSafeIdentifier(value) {
        return typeof value === 'string' && /^[a-zA-Z0-9._-]{1,64}$/.test(value);
    }

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
         * Registra um evento com somente os campos escalares explicitamente permitidos.
         * @param {string} event - Identificador estático do evento.
         * @param {Object} [details] - Metadados operacionais sem dados do usuário.
         */
        log(event, details = {}) {
            if (!enabled || !isSafeIdentifier(event)) return;

            const safeDetails = {};
            for (const [key, value] of Object.entries(details)) {
                if (!safeDetailKeys.has(key)) continue;
                if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
                    safeDetails[key] = value;
                } else if (isSafeIdentifier(value)) {
                    safeDetails[key] = value;
                }
            }
            console.debug('[PlanMilT][Debug] Evento.', { event, ...safeDetails });
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
