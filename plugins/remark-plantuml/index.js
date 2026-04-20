import {ensurePlantUmlSvgAsset, preparePlantUmlAssets} from './render-svg.js';

const PLANTUML_LANGUAGES = new Set(['plantuml', 'puml']);
const META_PATTERN = /(\w+)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;

function parseMetaAttributes(meta = '') {
  const attributes = {};
  let match;

  META_PATTERN.lastIndex = 0;

  while ((match = META_PATTERN.exec(meta)) !== null) {
    const [, key, doubleQuoted, singleQuoted, bareValue] = match;
    attributes[key] = doubleQuoted || singleQuoted || bareValue || '';
  }

  return attributes;
}

function extractTitle(metaAttributes, code) {
  if (metaAttributes.title) {
    return metaAttributes.title;
  }

  const codeTitleMatch = code.match(/^\s*title\s+(.+?)\s*$/im);
  if (codeTitleMatch) {
    return codeTitleMatch[1].trim();
  }

  return 'PlantUML 图';
}

function createPlantUmlNode(codeNode, src) {
  const metaAttributes = parseMetaAttributes(codeNode.meta);
  const title = extractTitle(metaAttributes, codeNode.value);
  const jsxAttributes = [
    {
      type: 'mdxJsxAttribute',
      name: 'src',
      value: src,
    },
    {
      type: 'mdxJsxAttribute',
      name: 'title',
      value: title,
    },
  ];

  for (const attributeName of ['width', 'maxWidth', 'align']) {
    if (metaAttributes[attributeName]) {
      jsxAttributes.push({
        type: 'mdxJsxAttribute',
        name: attributeName,
        value: metaAttributes[attributeName],
      });
    }
  }

  return {
    type: 'mdxJsxFlowElement',
    name: 'PlantUML',
    attributes: jsxAttributes,
    children: [],
    data: {
      _mdxExplicitJsx: true,
    },
    position: codeNode.position,
  };
}

async function transformChildren(children) {
  if (!Array.isArray(children)) {
    return;
  }

  const tasks = [];

  for (let index = 0; index < children.length; index += 1) {
    const node = children[index];

    if (
      node?.type === 'code' &&
      PLANTUML_LANGUAGES.has((node.lang || '').toLowerCase())
    ) {
      tasks.push(
        ensurePlantUmlSvgAsset(node.value).then((src) => {
          children[index] = createPlantUmlNode(node, src);
        }),
      );
      continue;
    }

    tasks.push(transformChildren(node?.children));
  }

  await Promise.all(tasks);
}

export default function plantUmlRemarkPlugin() {
  const assetsReady = preparePlantUmlAssets();

  return async (tree) => {
    await assetsReady;
    await transformChildren(tree.children);
  };
}
