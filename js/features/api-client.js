/**
 * @fileoverview Centraliza chamadas HTTP do frontend, valida respostas e registra falhas de rede, HTTP e formato sem expor payloads ou query strings.
 * @exports window.PlanMilT.apiClient
 * @requires fetch do navegador
 */
(() => {
    window.PlanMilT = window.PlanMilT || {};

    /**
     * Registra um diagnóstico HTTP seguro com método, endpoint e detalhes públicos.
     * @param {string} url - URL ou caminho relativo do endpoint/recurso.
     * @param {Object} options - Opções adicionais que personalizam a operação.
     * @param {Object} details - Detalhes seguros para anexar ao registro do problema.
     */
    function logRequestProblem(url, options, details) {
        const endpoint = String(url).split(/[?#]/, 1)[0];
        const method = (options && options.method ? options.method : 'GET').toUpperCase();

        console.error('[PlanMilT][API] Problema na requisição.', {
            method,
            endpoint,
            ...details
        });
    }

    /**
     * Redige valores de query string de uma mensagem de erro antes do log.
     * @param {Error} error - Erro recebido durante a operação.
     */
    function getSafeErrorMessage(error) {
        const message = error instanceof Error ? error.message : String(error);
        return message.replace(/([?&][^=&#\s]+)=([^&#\s]*)/g, '$1=[redigido]');
    }

    window.PlanMilT.apiClient = Object.freeze({
        /**
         * Envia um objeto JSON e devolve os dados JSON da resposta.
         * @param {string} url - URL ou caminho relativo do endpoint/recurso.
         * @param {Object} payload - Dados a enviar no corpo da requisição.
         * @param {Object} options - Opções adicionais que personalizam a operação.
         * @returns {Promise<*>} Dados interpretados da resposta JSON.
         */
        async postJson(url, payload, options = {}) {
            return this.getJson(url, {
                ...options,
                method: 'POST',
                headers: {
                    ...(options.headers || {}),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
        },

        /**
         * Busca o endpoint e devolve o corpo da resposta como texto.
         * @param {string} url - URL ou caminho relativo do endpoint/recurso.
         * @param {Object} options - Opções adicionais que personalizam a operação.
         * @returns {Promise<string>} Corpo da resposta em texto.
         */
        async getText(url, options) {
            let response;
            try {
                response = await fetch(url, options);
            } catch (error) {
                logRequestProblem(url, options, {
                    problem: 'Falha de rede.',
                    errorName: error.name,
                    errorMessage: getSafeErrorMessage(error)
                });
                throw error;
            }

            let text;
            try {
                text = await response.text();
            } catch (error) {
                logRequestProblem(url, options, {
                    problem: 'Falha ao ler a resposta.',
                    status: response.status,
                    errorName: error.name,
                    errorMessage: getSafeErrorMessage(error)
                });
                throw error;
            }

            if (!response.ok) {
                const error = new Error(`Falha na requisição (HTTP ${response.status}).`);
                logRequestProblem(url, options, {
                    problem: error.message,
                    status: response.status
                });
                throw error;
            }

            return text;
        },

        /**
         * Busca o endpoint e interpreta o corpo da resposta como JSON.
         * @param {string} url - URL ou caminho relativo do endpoint/recurso.
         * @param {Object} options - Opções adicionais que personalizam a operação.
         * @returns {Promise<*>} Dados interpretados da resposta JSON.
         */
        async getJson(url, options) {
            let response;
            try {
                response = await fetch(url, options);
            } catch (error) {
                logRequestProblem(url, options, {
                    problem: 'Falha de rede.',
                    errorName: error.name,
                    errorMessage: getSafeErrorMessage(error)
                });
                throw error;
            }

            let data;

            try {
                data = await response.json();
            } catch (error) {
                const invalidJsonError = new Error(`Resposta JSON inválida (HTTP ${response.status}).`);
                logRequestProblem(url, options, {
                    problem: invalidJsonError.message,
                    status: response.status,
                    parseErrorName: error.name
                });
                throw invalidJsonError;
            }

            const errorMessage = data && typeof data === 'object' && !Array.isArray(data) ? data.error : null;

            if (!response.ok || errorMessage) {
                const error = new Error(errorMessage || `Falha na requisição (HTTP ${response.status}).`);
                logRequestProblem(url, options, {
                    problem: error.message,
                    status: response.status
                });
                throw error;
            }

            return data;
        }
    });
})();