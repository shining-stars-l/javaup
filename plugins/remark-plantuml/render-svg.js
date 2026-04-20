import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {deflateRawSync} from 'node:zlib';

const DEFAULT_SERVER = 'https://www.plantuml.com/plantuml';
const PLANTUML_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const DOCS_DIR = path.resolve(process.cwd(), 'docs');
const GENERATED_PUBLIC_DIR = '/generated/plantuml';
const GENERATED_OUTPUT_DIR = path.resolve(
  process.cwd(),
  'static/generated/plantuml',
);
const DEFAULT_RENDER_CONCURRENCY = 4;
const PLANTUML_BLOCK_PATTERN = /```(?:plantuml|puml)(?:[^\n]*)\n([\s\S]*?)\n```/gim;
const inflightAssets = new Map();
const renderQueue = [];
let activeRenderCount = 0;
let outputDirectoryPromise;
let cleanupPromise;

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

function normalizePlantUmlCode(code) {
  return code.replace(/\r\n?/g, '\n').trimEnd();
}

function createDiagramHash(code) {
  return createHash('sha256').update(code, 'utf8').digest('hex').slice(0, 20);
}

function getRenderConcurrency() {
  const value = Number.parseInt(
    process.env.PLANTUML_RENDER_CONCURRENCY || '',
    10,
  );

  if (Number.isFinite(value) && value > 0) {
    return value;
  }

  return DEFAULT_RENDER_CONCURRENCY;
}

function isMarkdownFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return extension === '.md' || extension === '.mdx';
}

async function walkDirectory(directoryPath) {
  let entries = [];

  try {
    entries = await fs.readdir(directoryPath, {withFileTypes: true});
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return walkDirectory(entryPath);
      }

      if (entry.isFile() && isMarkdownFile(entryPath)) {
        return [entryPath];
      }

      return [];
    }),
  );

  return nestedFiles.flat();
}

function collectPlantUmlCodeBlocks(content) {
  const blocks = [];
  PLANTUML_BLOCK_PATTERN.lastIndex = 0;

  for (const match of content.matchAll(PLANTUML_BLOCK_PATTERN)) {
    blocks.push(normalizePlantUmlCode(match[1] || ''));
  }

  return blocks;
}

async function collectExpectedGeneratedFiles() {
  const markdownFiles = await walkDirectory(DOCS_DIR);
  const expectedFiles = new Set();

  await Promise.all(
    markdownFiles.map(async (filePath) => {
      const content = await fs.readFile(filePath, 'utf8');

      collectPlantUmlCodeBlocks(content).forEach((code) => {
        expectedFiles.add(`${createDiagramHash(code)}.svg`);
      });
    }),
  );

  return expectedFiles;
}

function ensureOutputDirectory() {
  if (!outputDirectoryPromise) {
    outputDirectoryPromise = fs.mkdir(GENERATED_OUTPUT_DIR, {recursive: true});
  }

  return outputDirectoryPromise;
}

async function cleanupGeneratedAssets() {
  await ensureOutputDirectory();

  const [expectedFiles, existingEntries] = await Promise.all([
    collectExpectedGeneratedFiles(),
    fs.readdir(GENERATED_OUTPUT_DIR, {withFileTypes: true}),
  ]);

  const obsoleteFiles = existingEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.svg'))
    .map((entry) => entry.name)
    .filter((fileName) => !expectedFiles.has(fileName));

  await Promise.all(
    obsoleteFiles.map((fileName) =>
      fs.unlink(path.join(GENERATED_OUTPUT_DIR, fileName)),
    ),
  );
}

export function preparePlantUmlAssets() {
  if (!cleanupPromise) {
    cleanupPromise = cleanupGeneratedAssets().catch((error) => {
      cleanupPromise = undefined;
      throw error;
    });
  }

  return cleanupPromise;
}

function runNextRenderTask() {
  while (
    activeRenderCount < getRenderConcurrency() &&
    renderQueue.length > 0
  ) {
    const {task, resolve, reject} = renderQueue.shift();
    activeRenderCount += 1;

    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        activeRenderCount -= 1;
        runNextRenderTask();
      });
  }
}

function enqueueRender(task) {
  return new Promise((resolve, reject) => {
    renderQueue.push({task, resolve, reject});
    runNextRenderTask();
  });
}

async function fileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() && stats.size > 0;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

function isSvgDocument(content) {
  return /^\s*(<\?xml[\s\S]*?\?>\s*)?<svg[\s>]/i.test(content);
}

async function renderWithPlantUmlServer(code) {
  const baseUrl = (process.env.PLANTUML_SERVER || DEFAULT_SERVER).replace(
    /\/$/,
    '',
  );
  const requestUrl = `${baseUrl}/svg/${encodePlantUml(code)}`;
  const response = await fetch(requestUrl, {
    headers: {
      accept: 'image/svg+xml,text/plain;q=0.9,*/*;q=0.1',
    },
  });

  if (!response.ok) {
    throw new Error(
      `PlantUML server request failed: ${response.status} ${response.statusText}`,
    );
  }

  const svg = await response.text();

  if (!isSvgDocument(svg)) {
    throw new Error('PlantUML server returned non-SVG content.');
  }

  return svg;
}

function renderWithLocalJar(code, jarPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'java',
      [
        '-Djava.awt.headless=true',
        '-jar',
        jarPath,
        '-tsvg',
        '-pipe',
        '-charset',
        'UTF-8',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (exitCode) => {
      if (exitCode !== 0) {
        reject(
          new Error(
            `PlantUML local renderer exited with code ${exitCode}: ${stderr.trim()}`,
          ),
        );
        return;
      }

      if (!isSvgDocument(stdout)) {
        reject(
          new Error(
            `PlantUML local renderer returned non-SVG content: ${stderr.trim()}`,
          ),
        );
        return;
      }

      resolve(stdout);
    });

    child.stdin.end(code);
  });
}

function getConfiguredPlantUmlJarPath() {
  const jarPath = process.env.PLANTUML_JAR_PATH?.trim();
  return jarPath ? path.resolve(jarPath) : null;
}

function shouldDisableServerFallback() {
  return process.env.PLANTUML_DISABLE_SERVER_FALLBACK === 'true';
}

async function renderSvg(code) {
  const configuredJarPath = getConfiguredPlantUmlJarPath();

  if (configuredJarPath) {
    try {
      return await renderWithLocalJar(code, configuredJarPath);
    } catch (error) {
      if (shouldDisableServerFallback()) {
        throw error;
      }
    }
  }

  return renderWithPlantUmlServer(code);
}

async function writeSvgAsset(code, filePath) {
  await preparePlantUmlAssets();
  await ensureOutputDirectory();

  if (await fileExists(filePath)) {
    return;
  }

  const svg = await enqueueRender(() => renderSvg(code));
  await fs.writeFile(filePath, svg, 'utf8');
}

export async function ensurePlantUmlSvgAsset(code) {
  const normalizedCode = normalizePlantUmlCode(code);
  const diagramHash = createDiagramHash(normalizedCode);
  const fileName = `${diagramHash}.svg`;
  const filePath = path.join(GENERATED_OUTPUT_DIR, fileName);
  const publicPath = `${GENERATED_PUBLIC_DIR}/${fileName}`;

  if (!inflightAssets.has(diagramHash)) {
    const assetPromise = writeSvgAsset(normalizedCode, filePath)
      .then(() => publicPath)
      .catch((error) => {
        inflightAssets.delete(diagramHash);

        const offlineHelp = getConfiguredPlantUmlJarPath()
          ? ''
          : ' Set PLANTUML_JAR_PATH to a local plantuml.jar for fully offline rendering.';

        throw new Error(
          `Failed to generate PlantUML SVG for ${publicPath}: ${error.message}.${offlineHelp}`,
        );
      });

    inflightAssets.set(diagramHash, assetPromise);
  }

  return inflightAssets.get(diagramHash);
}
