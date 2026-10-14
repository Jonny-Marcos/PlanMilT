window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.apiClient = Object.freeze({
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

    async getText(url, options) {
        const response = await fetch(url, options);
        const text = await response.text();

        if (!response.ok) {
            throw new Error(`Falha na requisição (HTTP ${response.status}).`);
        }

        return text;
    },

    async getJson(url, options) {
        const response = await fetch(url, options);
        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error(`Resposta JSON inválida (HTTP ${response.status}).`);
        }

        const errorMessage = data && typeof data === 'object' && !Array.isArray(data) ? data.error : null;

        if (!response.ok || errorMessage) {
            throw new Error(errorMessage || `Falha na requisição (HTTP ${response.status}).`);
        }

        return data;
    }
});