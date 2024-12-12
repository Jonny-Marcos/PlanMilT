const assert = require('assert');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const fs = require('fs');
const path = require('path');

// Carrega o HTML do index.html
const htmlPath = path.resolve(__dirname, '../index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Simula o ambiente DOM e carrega scripts
const dom = new JSDOM(htmlContent, {
  runScripts: "dangerously", // Necessário para executar scripts
  resources: "usable",       // Carrega recursos como arquivos JS
});

// Espera o carregamento completo
const window = dom.window;

before(function (done) {
  dom.window.addEventListener('load', () => {
    done();
  });
});

// Define o ambiente global para os testes
global.window = window;
global.document = window.document;

// Testes
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
