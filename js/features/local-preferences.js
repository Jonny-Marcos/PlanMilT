/**
 * @fileoverview Guarda neste navegador valores mais usados, preferências de interface e o rascunho do formulário de tarefas.
 * @exports window.PlanMilT.localPreferences
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.localPreferences = (() => {
    const key = `planmilt.preferences.v1:${new URL('.', window.location.href).pathname}`;
    const maxValuesPerField = 20;
    const maxFieldLength = 2000;

    const usageValidators = {
        taskRadioPreset: value => typeof value === 'string' && value.length > 0 && value.length <= 64,
        taskAntennaHeight: value => Number.isFinite(value) && value >= 0 && value <= 1000,
        manualRadioPreset: value => typeof value === 'string' && value.length > 0 && value.length <= 64,
        manualAntennaHeight: value => Number.isFinite(value) && value >= 0 && value <= 1000,
        manualResolution: value => [72, 180, 360].includes(value)
    };
    const uiValidators = {
        selectedLayer: value => typeof value === 'string' && value.length <= 200,
        transparency: value => Number.isFinite(value) && value >= 0 && value <= 100,
        controlsHidden: value => typeof value === 'boolean',
        catalogCategory: value => typeof value === 'string' && value.length <= 64
    };

    const radioFormNumbers = ['freq', 'txPower', 'txGain', 'txHeight', 'rxGain', 'rxHeight', 'rxSens', 'radius'];
    const radioFormMap = { mode: ['coverage', 'ptp'], penetration: ['high', 'medium', 'low'] };

    /**
     * Valida e normaliza os ajustes do formulário manual de rádio.
     * @param {Object} form - Valores candidatos.
     * @returns {Object|null} Ajustes válidos ou nulo.
     */
    function sanitizeRadioForm(form) {
        if (!form || typeof form !== 'object' || typeof form.presetId !== 'string' || form.presetId.length > 64) return null;
        const clean = { presetId: form.presetId };
        for (const name of radioFormNumbers) {
            if (!Number.isFinite(form[name]) || Math.abs(form[name]) > 1e6) return null;
            clean[name] = form[name];
        }
        for (const [name, allowed] of Object.entries(radioFormMap)) {
            if (!allowed.includes(form[name])) return null;
            clean[name] = form[name];
        }
        if (![72, 180, 360].includes(form.radialCount)) return null;
        clean.radialCount = form.radialCount;
        return clean;
    }

    /**
     * Cria a estrutura vazia das preferências.
     * @returns {Object} Preferências sem uso registrado.
     */
    function emptyData() {
        return { usage: {}, ui: {}, draft: null, radioForms: {}, radioLast: null };
    }

    /**
     * Lê as preferências locais; dados inválidos são descartados com aviso no console.
     * @returns {Object} Preferências válidas ou uma estrutura vazia.
     */
    function read() {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return emptyData();
            const data = JSON.parse(raw);
            if (!data || typeof data.usage !== 'object' || typeof data.ui !== 'object' || !data.usage || !data.ui) {
                throw new Error('Preferências locais inválidas.');
            }
            return { usage: data.usage, ui: data.ui, draft: data.draft || null, radioForms: data.radioForms && typeof data.radioForms === 'object' ? data.radioForms : {}, radioLast: data.radioLast || null };
        } catch (error) {
            console.error('[PlanMilT][Preferências] Não foi possível ler as preferências locais.', { name: error?.name });
            return emptyData();
        }
    }

    /**
     * Persiste as preferências sem interromper o fluxo em caso de falha.
     * @param {Object} data - Preferências atualizadas.
     */
    function write(data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error('[PlanMilT][Preferências] Não foi possível salvar as preferências locais.', { name: error?.name });
        }
    }

    /**
     * Informa se um campo de formulário deve ser guardado no rascunho.
     * @param {Object} element - Campo DOM.
     * @returns {boolean} Verdadeiro para campos identificados e não sensíveis.
     */
    function isDraftField(element) {
        const type = String(element.type || '').toLowerCase();
        return Boolean(element.id) && !['button', 'submit', 'file', 'password'].includes(type);
    }

    /**
     * Lê os valores dos campos de um formulário pelo id.
     * @param {Object} root - Elemento que contém os campos.
     * @returns {Object} Valores por id; campos muito longos são omitidos.
     */
    function captureFields(root) {
        const fields = {};
        for (const element of Array.from(root.querySelectorAll('input[id], select[id], textarea[id]'))) {
            if (!isDraftField(element)) continue;
            const type = String(element.type || '').toLowerCase();
            let value;
            if (type === 'checkbox' || type === 'radio') value = Boolean(element.checked);
            else if (element.multiple) value = Array.from(element.selectedOptions || []).map(option => option.value);
            else value = String(element.value ?? '');
            if (JSON.stringify(value).length <= maxFieldLength) fields[element.id] = value;
        }
        return fields;
    }

    /**
     * Preenche os campos de um formulário com valores guardados, na ordem do DOM.
     * @param {Object} root - Elemento que contém os campos.
     * @param {Object} fields - Valores por id obtidos de `captureFields`.
     */
    function applyFields(root, fields) {
        for (const element of Array.from(root.querySelectorAll('input[id], select[id], textarea[id]'))) {
            if (!isDraftField(element) || !Object.prototype.hasOwnProperty.call(fields, element.id)) continue;
            const value = fields[element.id];
            const type = String(element.type || '').toLowerCase();
            if (type === 'checkbox' || type === 'radio') {
                if (typeof value === 'boolean') element.checked = value;
            } else if (element.multiple) {
                if (Array.isArray(value)) {
                    for (const option of Array.from(element.options || [])) option.selected = value.includes(option.value);
                }
            } else if (typeof value === 'string') {
                if (element.options && !Array.from(element.options).some(option => option.value === value)) continue;
                element.value = value;
                const preview = root.querySelector(`[id="${element.id}Image"]`);
                if (preview && type === 'hidden') preview.src = value;
            }
            if (element.tagName === 'SELECT') element.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    return Object.freeze({
        captureFields,
        applyFields,
        /**
         * Registra o uso de um valor, mantendo contagem limitada por campo.
         * @param {string} field - Campo conhecido de `usageValidators`.
         * @param {string|number} value - Valor utilizado.
         */
        recordUse(field, value) {
            if (!usageValidators[field]?.(value)) return;
            const data = read();
            const values = Array.isArray(data.usage[field]) ? data.usage[field] : [];
            const previous = values.find(item => item.value === value);
            const others = values.filter(item => item.value !== value);
            const next = [{ value, count: previous ? Math.min(Number.MAX_SAFE_INTEGER, previous.count + 1) : 1 }, ...others];
            data.usage[field] = next.length > maxValuesPerField
                ? [...next].sort((a, b) => b.count - a.count).slice(0, maxValuesPerField)
                : next;
            write(data);
        },
        /**
         * Retorna o valor mais usado; em empate, o mais recente.
         * @param {string} field - Campo conhecido de `usageValidators`.
         * @param {*} [fallback] - Valor quando não há histórico válido.
         * @returns {*} Valor mais usado ou o padrão informado.
         */
        mostUsed(field, fallback) {
            const validator = usageValidators[field];
            const values = read().usage[field];
            if (!validator || !Array.isArray(values)) return fallback;
            let best;
            for (const item of values) {
                if (!item || !validator(item.value) || !Number.isSafeInteger(item.count)) continue;
                if (!best || item.count > best.count) best = item;
            }
            return best ? best.value : fallback;
        },
        /**
         * Lê uma preferência de interface.
         * @param {string} name - Preferência conhecida de `uiValidators`.
         * @param {*} [fallback] - Valor quando não há preferência válida.
         * @returns {*} Preferência guardada ou o padrão informado.
         */
        getUi(name, fallback) {
            const value = read().ui[name];
            return uiValidators[name]?.(value) ? value : fallback;
        },
        /**
         * Guarda uma preferência de interface.
         * @param {string} name - Preferência conhecida de `uiValidators`.
         * @param {*} value - Novo valor.
         */
        setUi(name, value) {
            if (!uiValidators[name]?.(value)) return;
            const data = read();
            data.ui[name] = value;
            write(data);
        },
        /**
         * Guarda o rascunho do formulário de parâmetros de uma tarefa.
         * @param {string} task - Identificador da tarefa.
         * @param {Object} fields - Valores de `captureFields`.
         */
        setDraft(task, fields) {
            if (typeof task !== 'string' || !task || !fields || typeof fields !== 'object') return;
            const data = read();
            data.draft = { task, fields };
            write(data);
        },
        /**
         * Retorna o rascunho do formulário, se houver.
         * @returns {{task: string, fields: Object}|null} Rascunho válido ou nulo.
         */
        getDraft() {
            const draft = read().draft;
            return draft && typeof draft.task === 'string' && draft.fields && typeof draft.fields === 'object'
                ? draft : null;
        },
        /**
         * Guarda os ajustes do formulário manual de rádio para o preset usado.
         * @param {Object} form - Valores do formulário, com `presetId`.
         */
        setRadioForm(form) {
            const clean = sanitizeRadioForm(form);
            if (!clean) return;
            const data = read();
            data.radioForms[clean.presetId] = clean;
            data.radioLast = clean.presetId;
            write(data);
        },
        /**
         * Retorna os ajustes guardados de um preset ou, sem argumento, os do último preset usado.
         * @param {string} [presetId] - Preset desejado.
         * @returns {Object|null} Ajustes válidos ou nulo se o usuário nunca ajustou o preset.
         */
        getRadioForm(presetId) {
            const data = read();
            const id = presetId === undefined ? data.radioLast : presetId;
            return typeof id === 'string' && Object.prototype.hasOwnProperty.call(data.radioForms, id)
                ? sanitizeRadioForm(data.radioForms[id]) : null;
        },
        /** Descarta o rascunho do formulário. */
        clearDraft() {
            const data = read();
            if (!data.draft) return;
            data.draft = null;
            write(data);
        }
    });
})();
