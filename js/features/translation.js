/**
 * @fileoverview Controla o carregamento opcional do Google Tradutor nos mapas.
 * @exports window.PlanMilT.translation
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.translation = (() => {
    let settings = null;
    let ready = false;
    const targets = ['google_translate_element', 'image_editor_google_translate_element'];

    /**
     * Inicializa os controles existentes depois que o serviço estiver disponível.
     */
    function initialize() {
        if (!settings?.enabled || !window.google?.translate?.TranslateElement) return;
        ready = true;
        const options = { pageLanguage: 'pt-br' };
        if (settings.languages.length) options.includedLanguages = settings.languages.join(',');
        targets.forEach(id => {
            const element = document.getElementById(id);
            if (!element) return;
            if (!element.dataset.initialized) {
                new window.google.translate.TranslateElement(options, id);
                element.dataset.initialized = 'true';
            }
            element.hidden = false;
            const hidden = id === 'google_translate_element'
                && document.getElementById('toggleControlsBtn')?.getAttribute('aria-pressed') === 'true';
            element.style.display = hidden ? 'none' : 'block';
        });
    }

    window.googleTranslateElementInit = initialize;

    return Object.freeze({
        /**
         * Aplica a configuração pública e só requisita o script quando autorizado.
         * @param {{enabled: boolean, languages: string[]}} config - Preferências do administrador.
         */
        configure(config) {
            if (!config || typeof config.enabled !== 'boolean' || !Array.isArray(config.languages)
                || !config.languages.every(language => typeof language === 'string')) {
                console.error('[PlanMilT][Tradução] Configuração de tradução inválida.');
                return;
            }
            settings = config;
            if (!settings.enabled) {
                ready = false;
                targets.forEach(id => {
                    const element = document.getElementById(id);
                    if (element) element.hidden = true;
                });
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
            script.onerror = () => console.error('[PlanMilT][Tradução] Não foi possível carregar o Google Tradutor.');
            document.head.appendChild(script);
        },
        /**
         * Indica se os controles de tradução estão disponíveis.
         * @returns {boolean} Verdadeiro após a inicialização do serviço.
         */
        isReady() {
            return ready;
        }
    });
})();
