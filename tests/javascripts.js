const assert = require('assert');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

// Setup para carregar o HTML
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

// Configura o JSDOM
const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });
const window = dom.window;

describe('Index.html JavaScript Tests', () => {
    it('Mapa é inicializado corretamente', () => {
        assert.ok(window.map, 'Mapa não foi inicializado.');
    });

    it('Botão "toggleControlsBtn" existe no DOM', () => {
        const button = window.document.getElementById('toggleControlsBtn');
        assert.ok(button, 'Botão toggleControlsBtn não foi encontrado.');
    });

    it('Função de tradução Google existe', () => {
        assert.ok(window.googleTranslateElementInit, 'Função googleTranslateElementInit não foi definida.');
    });

    it('Controle de medidas está disponível no mapa', () => {
        const measureControl = window.document.querySelector('.leaflet-control-measure');
        assert.ok(measureControl, 'Controle de medidas não está presente.');
    });

    it('Toolbar personalizada foi adicionada ao mapa', () => {
        const toolbar = window.document.querySelector('.map-toolbar');
        assert.ok(toolbar, 'Toolbar personalizada não foi adicionada ao mapa.');
    });
});
