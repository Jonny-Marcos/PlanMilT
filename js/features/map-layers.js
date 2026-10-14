/**
 * @fileoverview Interpreta respostas de capacidades WMS e consulta camadas via proxy.
 * @exports window.PlanMilT.mapLayers
 * @requires window.PlanMilT.apiClient
 */
window.PlanMilT.mapLayers = Object.freeze({
    /**
     * Converte o XML GetCapabilities em camadas ordenadas por título.
     * @param {string} xmlText - Conteúdo XML retornado pelo serviço WMS.
     * @param {typeof DOMParser} [Parser=DOMParser] - Parser de XML, substituível nos testes.
     * @returns {Array<{Name: string, Title: string}>} Camadas com nome e título.
     * @throws {Error} Quando a resposta contém XML inválido.
     */
    parseWMSCapabilities(xmlText, Parser = DOMParser) {
        const xmlDocument = new Parser().parseFromString(xmlText, 'application/xml');

        if (xmlDocument.getElementsByTagName('parsererror').length > 0) {
            throw new Error('Resposta de capacidades WMS inválida.');
        }

        const layers = [];
        const layerNodes = xmlDocument.getElementsByTagName('Layer');

        for (let index = 1; index < layerNodes.length; index++) {
            const layerNode = layerNodes[index];
            const nameNode = layerNode.getElementsByTagName('Name')[0];
            const titleNode = layerNode.getElementsByTagName('Title')[0];

            if (nameNode) {
                layers.push({
                    Name: nameNode.textContent,
                    Title: titleNode ? titleNode.textContent : nameNode.textContent
                });
            }
        }

        return layers.sort((first, second) => {
            const firstTitle = first.Title.toLowerCase();
            const secondTitle = second.Title.toLowerCase();

            if (firstTitle < secondTitle) return -1;
            if (firstTitle > secondTitle) return 1;
            return 0;
        });
    },

    /**
     * Consulta GetCapabilities pelo proxy e interpreta as camadas retornadas.
     * @param {string} wmsURL - URL base do serviço WMS.
     * @param {Object} dependencies - Dependências de rede e tratamento de erros.
     * @param {Object} dependencies.apiClient - Cliente que fornece getText(url).
     * @param {Function} dependencies.onError - Callback que recebe falhas da consulta.
     * @returns {Promise<Array<{Name: string, Title: string}>|null>} Camadas ordenadas ou null após falha.
     */
    async getWMSLayers(wmsURL, { apiClient, onError }) {
        const capabilitiesURL = '/proxy.php?url=' + encodeURIComponent(`${wmsURL}?service=WMS&request=GetCapabilities`);

        try {
            const xmlText = await apiClient.getText(capabilitiesURL);
            return this.parseWMSCapabilities(xmlText);
        } catch (error) {
            onError(error);
            return null;
        }
    }
});
