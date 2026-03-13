import {deflateRawSync} from 'node:zlib';

const PLANTUML_LANGUAGES = new Set(['plantuml', 'puml']);
const DEFAULT_SERVER = 'https://www.plantuml.com/plantuml';
const PLANTUML_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const META_PATTERN = /(\w+)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;

function encode6bit(value) {
  return PLANTUML_ALPHABET.charAt(value & 0x3f);
}

function append3bytes(byte1, byte2, byte3) {
  const c1 = byte1 >> 2;
  const c2 = ((byte1 & 0x03) << 4) | (byte2 >> 4);
  const c3 = ((byte2 & 0x0f) << 2) | (byte3 >> 6);
  const c4 = byte3 & 0x3f;

  return (
    encode6bit(c1) +
    encode6bit(c2) +
    encode6bit(c3) +
    encode6bit(c4)
  );
}

function encodePlantUml(code) {
  const compressed = deflateRawSync(Buffer.from(code, 'utf8'));
  let encoded = '';

  for (let index = 0; index < compressed.length; index += 3) {
    const byte1 = compressed[index];
    const byte2 = index + 1 < compressed.length ? compressed[index + 1] : 0;
    const byte3 = index + 2 < compressed.length ? compressed[index + 2] : 0;
    encoded += append3bytes(byte1, byte2, byte3);
  }

  return encoded;
}

function parseMetaAttributes(meta = '') {
  const attributes = {};
  let match;

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

function createPlantUmlNode(codeNode) {
  const encoded = encodePlantUml(codeNode.value);
  const server = process.env.PLANTUML_SERVER || DEFAULT_SERVER;
  const src = `${server.replace(/\/$/, '')}/svg/${encoded}`;
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

function transformChildren(children) {
  if (!Array.isArray(children)) {
    return;
  }

  for (let index = 0; index < children.length; index += 1) {
    const node = children[index];

    if (
      node?.type === 'code' &&
      PLANTUML_LANGUAGES.has((node.lang || '').toLowerCase())
    ) {
      children[index] = createPlantUmlNode(node);
      continue;
    }

    transformChildren(node?.children);
  }
}

export default function plantUmlRemarkPlugin() {
  return (tree) => {
    transformChildren(tree.children);
  };
}
