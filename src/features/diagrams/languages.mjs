export const supportedDiagramLanguages = [
  'actdiag',
  'blockdiag',
  'bpmn',
  'bytefield',
  'c4plantuml',
  'ditaa',
  'dot',
  'erd',
  'excalidraw',
  'graphviz',
  'mermaid',
  'nomnoml',
  'nwdiag',
  'packetdiag',
  'pikchr',
  'plantuml',
  'rackdiag',
  'seqdiag',
  'svgbob',
  'umlet',
  'vega',
  'vegalite',
  'wavedrom',
];

const supportedDiagramLanguageSet = new Set(supportedDiagramLanguages);

export function isDiagramLanguage(language) {
  return supportedDiagramLanguageSet.has(String(language ?? '').trim().toLowerCase());
}
