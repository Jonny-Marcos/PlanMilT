# PlanMilT Symbols

Biblioteca JavaScript estática para consultar e renderizar símbolos militares adaptados ao Exército Brasileiro e gráficos táticos no navegador. Não requer framework, importação de módulos, servidor ou chamadas externas em tempo de execução.

## Instalação

Copie `planmilt-symbols.js` para uma pasta pública do seu site e inclua-o antes dos scripts que o utilizam:

```html
<script src="assets/planmilt-symbols.js"></script>
```

O arquivo define a API global `window.PlanMilTSymbols`. Para uso em outro projeto, distribua também este README e `LICENSE-SIMBOLOGIA.txt`; os avisos de licença dos componentes incluídos também estão preservados no bundle.

## Utilização

Renderize um SIDC e use a imagem gerada em um elemento HTML:

```html
<img id="military-symbol" alt="Símbolo militar">
<script src="assets/planmilt-symbols.js"></script>
<script>
    const result = PlanMilTSymbols.renderSymbol('10031000001211000000');
    document.getElementById('military-symbol').src = result.dataUrl;
</script>
```

`renderSymbol(sidc, options)` também aceita um objeto `{ sidc, options }`. Retorna o SIDC, o mecanismo utilizado, o SVG, um `data:` URL e as dimensões e âncora do símbolo. SIDCs padrão são renderizados por MilSymbols; as extensões brasileiras usam a adaptação do Portal de Simbologia Militar.

Outras funções disponíveis:

- `listSymbols({ category, includeExamples })`: lista símbolos e exemplos do catálogo brasileiro.
- `findSymbol(sidc)`: encontra uma entrada do catálogo por SIDC.
- `getExtensions(category)`: retorna os modificadores brasileiros da categoria.
- `openSymbolCreator({ initial })`: abre uma tela independente para escolher, personalizar e gerar um símbolo.
- `listTacticalGraphics(frequentNames)`: retorna o catálogo de gráficos táticos agrupado em seções.
- `renderTacticalGraphic(feature)`: renderiza uma feição GeoJSON de gráfico tático.

O criador usa um diálogo HTML nativo e não depende da interface do PlanMilT, Leaflet ou SweetAlert2. A Promise retorna `null` ao cancelar ou um objeto com `config`, `svg`, `dataUrl`, dimensões e âncora ao gerar:

```js
(async () => {
    const result = await PlanMilTSymbols.openSymbolCreator();
    if (result) {
        document.querySelector('#symbol-preview').src = result.dataUrl;
        console.log(result.config.sidc);
    }
})();
```

Consulte `planmilt-symbols.js` para os avisos de licença completos e o contrato da API. O bundle é autossuficiente; a doutrina aplicável deve ser consultada para validar o uso operacional dos símbolos.

## Reconstrução no repositório PlanMilT

Com Node.js e as dependências do projeto instaladas, execute `npm run build:planmilt-symbols` na raiz do repositório. As fontes usadas apenas para reconstrução ficam em `tools/planmilt-symbols-source/`; não são necessárias para utilizar a distribuição.

## Créditos e licenças

- **Portal de Simbologia Militar do Exército Brasileiro:** [simbologia.eb.mil.br](https://simbologia.eb.mil.br/) — a adaptação brasileira e as extensões de SIDC são derivadas de seus arquivos compilados. Consulte [LICENSE-SIMBOLOGIA.txt](./LICENSE-SIMBOLOGIA.txt).
- **MilSymbols:** renderização dos SIDCs padrão. Projeto e licença MIT identificados no aviso incluído no bundle.
- **@zaes/tactical-graphics:** catálogo e renderização de gráficos táticos; os avisos de licença estão incluídos no bundle.
- **PlanMilT:** composição e adaptações desta distribuição. Os avisos dos componentes originais foram mantidos no bundle.

---

# PlanMilT Symbols (English)

A static JavaScript library to browse and render military symbols adapted for the Brazilian Army and tactical graphics in the browser. It requires no framework, module imports, server, or runtime network requests.

## Installation

Copy `planmilt-symbols.js` to a publicly served directory on your website and include it before scripts that use it:

```html
<script src="assets/planmilt-symbols.js"></script>
```

The file exposes the global API `window.PlanMilTSymbols`. When redistributing the library, include this README and `LICENSE-SIMBOLOGIA.txt`; license notices for included components are also preserved in the bundle.

## Usage

Render an SIDC and use the generated image in an HTML element:

```html
<img id="military-symbol" alt="Military symbol">
<script src="assets/planmilt-symbols.js"></script>
<script>
    const result = PlanMilTSymbols.renderSymbol('10031000001211000000');
    document.getElementById('military-symbol').src = result.dataUrl;
</script>
```

`renderSymbol(sidc, options)` also accepts an object `{ sidc, options }`. It returns the SIDC, rendering engine, SVG, a `data:` URL, and the symbol dimensions and anchor. Standard SIDCs are rendered by MilSymbols; Brazilian extensions use the adaptation of the Brazilian Army Symbol Portal.

Other available functions:

- `listSymbols({ category, includeExamples })`: lists symbols and examples from the Brazilian catalog.
- `findSymbol(sidc)`: finds a catalog entry by SIDC.
- `getExtensions(category)`: returns Brazilian modifiers for a category.
- `openSymbolCreator({ initial })`: opens a standalone screen to select, customize, and generate a symbol.
- `listTacticalGraphics(frequentNames)`: returns the tactical graphics catalog grouped into sections.
- `renderTacticalGraphic(feature)`: renders a tactical-graphic GeoJSON feature.

The creator uses a native HTML dialog and does not depend on the PlanMilT UI, Leaflet, or SweetAlert2. Its Promise resolves to `null` when cancelled, or to an object containing `config`, `svg`, `dataUrl`, dimensions, and anchor when a symbol is generated:

```js
(async () => {
    const result = await PlanMilTSymbols.openSymbolCreator();
    if (result) {
        document.querySelector('#symbol-preview').src = result.dataUrl;
        console.log(result.config.sidc);
    }
})();
```

See `planmilt-symbols.js` for complete license notices and the API contract. The bundle is self-contained; consult applicable doctrine to validate operational use of the symbols.

## Rebuilding in the PlanMilT repository

With Node.js and the project dependencies installed, run `npm run build:planmilt-symbols` from the repository root. Build-only source files are kept in `tools/planmilt-symbols-source/`; they are not required to use the distribution.

## Credits and licenses

- **Brazilian Army Military Symbology Portal:** [simbologia.eb.mil.br](https://simbologia.eb.mil.br/) — the Brazilian adaptation and SIDC extensions are derived from its compiled files. See [LICENSE-SIMBOLOGIA.txt](./LICENSE-SIMBOLOGIA.txt).
- **MilSymbols:** renders standard SIDCs. The project and its MIT license are identified in the notice included in the bundle.
- **@zaes/tactical-graphics:** tactical graphic catalog and rendering; license notices are included in the bundle.
- **PlanMilT:** bundle composition and adaptations in this distribution. Original component notices are preserved in the bundle.
