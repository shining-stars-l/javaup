#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {execSync} = require('child_process');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, {recursive: true});
}

function parseSiteConfig(configPath) {
  const content = readFile(configPath);
  const urlMatch = content.match(/\burl:\s*['"]([^'"]+)['"]/);
  const baseUrlMatch = content.match(/\bbaseUrl:\s*['"]([^'"]+)['"]/);
  if (!urlMatch) {
    throw new Error(`未在 ${configPath} 找到 url 配置`);
  }
  return {
    siteUrl: urlMatch[1].trim(),
    baseUrl: baseUrlMatch ? baseUrlMatch[1].trim() : '/',
  };
}

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl || baseUrl === '/') {
    return '/';
  }
  const withLeading = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

function parseFrontmatterSlug(filePath) {
  const content = readFile(filePath);
  if (!content.startsWith('---')) {
    return null;
  }
  const end = content.indexOf('\n---', 3);
  if (end === -1) {
    return null;
  }
  const frontmatter = content.slice(3, end);
  const slugMatch = frontmatter.match(/^\s*slug:\s*(.+)$/m);
  if (!slugMatch) {
    return null;
  }
  let slug = slugMatch[1].trim();
  if ((slug.startsWith('"') && slug.endsWith('"')) || (slug.startsWith("'") && slug.endsWith("'"))) {
    slug = slug.slice(1, -1).trim();
  }
  return slug || null;
}

function buildUrl({siteUrl, baseUrl, slug}) {
  if (/^https?:\/\//i.test(slug)) {
    return slug;
  }
  const normalizedBase = normalizeBaseUrl(baseUrl);
  let pathname = slug.startsWith('/') ? slug : `/${slug}`;
  if (normalizedBase !== '/') {
    const baseNoTail = normalizedBase.slice(0, -1);
    if (!pathname.startsWith(`${baseNoTail}/`) && pathname !== baseNoTail) {
      pathname = `${baseNoTail}${pathname}`;
    }
  }
  return new URL(pathname, siteUrl).toString();
}

function listAllDocFiles(docsDir) {
  const result = [];
  const stack = [docsDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, {withFileTypes: true});
    entries.forEach((entry) => {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
        result.push(fullPath);
      }
    });
  }
  return result.sort();
}

function runGit(command) {
  return execSync(command, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function resolveDefaultRange() {
  try {
    runGit('git rev-parse --verify HEAD~1');
    return {from: 'HEAD~1', to: 'HEAD'};
  } catch (error) {
    return {from: null, to: 'HEAD'};
  }
}

function listChangedDocFiles(docsDir, from, to) {
  const relativeDocsDir = path.relative(process.cwd(), docsDir).replace(/\\/g, '/');
  const rangePart = from ? `${from} ${to}` : to;
  const output = runGit(
    `git diff --name-only --diff-filter=ACMR ${rangePart} -- "${relativeDocsDir}"`
  );
  if (!output) {
    return [];
  }
  return output
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item && /\.(md|mdx)$/i.test(item))
    .map((item) => path.resolve(process.cwd(), item));
}

function unique(items) {
  return [...new Set(items)];
}

function writeUrls(filePath, urls, format) {
  ensureDir(path.dirname(filePath));
  const content = format === 'json' ? `${JSON.stringify(urls, null, 2)}\n` : `${urls.join('\n')}\n`;
  fs.writeFileSync(filePath, content, 'utf8');
}

function readUrls(filePath) {
  const content = readFile(filePath).trim();
  if (!content) {
    return [];
  }
  if (filePath.endsWith('.json')) {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error(`URL 文件格式错误（应为数组）: ${filePath}`);
    }
    return parsed.map((item) => String(item).trim()).filter(Boolean);
  }
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitChunks(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function submitIndexNow({endpoint, host, key, keyLocation, urls, chunkSize, dryRun}) {
  const chunks = splitChunks(urls, chunkSize);
  let total = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (dryRun) {
      console.log(`[dry-run] 第 ${index + 1}/${chunks.length} 批，${chunk.length} 条 URL`);
      continue;
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {'content-type': 'application/json; charset=utf-8'},
      body: JSON.stringify({
        host,
        key,
        keyLocation,
        urlList: chunk,
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`提交失败，HTTP ${response.status}，响应：${text}`);
    }
    total += chunk.length;
    console.log(`第 ${index + 1}/${chunks.length} 批提交成功（${chunk.length} 条）`);
  }
  return dryRun ? urls.length : total;
}

async function verifyKeyLocation({keyLocation, key}) {
  const response = await fetch(keyLocation, {
    method: 'GET',
    headers: {'cache-control': 'no-cache'},
  });
  if (!response.ok) {
    throw new Error(`keyLocation 无法访问，HTTP ${response.status}: ${keyLocation}`);
  }
  const content = (await response.text()).trim();
  if (content !== key) {
    throw new Error(
      `keyLocation 内容与 --key 不一致。期望: ${key}，实际: ${content || '(空)'}，地址: ${keyLocation}`
    );
  }
}

function generateUrls({docsDir, all, from, to, siteUrl, baseUrl}) {
  const files = all ? listAllDocFiles(docsDir) : listChangedDocFiles(docsDir, from, to);
  const skipped = [];
  const urls = [];
  files.forEach((filePath) => {
    const slug = parseFrontmatterSlug(filePath);
    if (!slug) {
      skipped.push(filePath);
      return;
    }
    urls.push(buildUrl({siteUrl, baseUrl, slug}));
  });
  return {
    files,
    skipped,
    urls: unique(urls),
  };
}

async function main() {
  const [command = 'help', ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const rootDir = process.cwd();
  const docsDir = path.resolve(rootDir, args.docsDir || 'docs');
  const configPath = path.resolve(rootDir, args.config || 'docusaurus.config.js');
  const outputPath = path.resolve(rootDir, args.output || '.indexnow/changed-urls.txt');
  const outputFormat = args.format === 'json' ? 'json' : 'text';
  const endpoint = args.endpoint || 'https://api.indexnow.org/indexnow';
  const defaultRange = resolveDefaultRange();
  const from = args.from || defaultRange.from;
  const to = args.to || defaultRange.to;

  if (command === 'help') {
    console.log(`用法:
  node scripts/indexnow.js key --key <INDEXNOW_KEY> [--file build/<key>.txt]
  node scripts/indexnow.js urls [--from HEAD~1 --to HEAD] [--all] [--output .indexnow/changed-urls.txt]
  node scripts/indexnow.js submit --key <INDEXNOW_KEY> [--input .indexnow/changed-urls.txt] [--dryRun] [--skipVerify]
  node scripts/indexnow.js publish --key <INDEXNOW_KEY> [--from HEAD~1 --to HEAD] [--all] [--dryRun] [--skipVerify]

说明:
  - 开源仓库建议 key 文件放 build/，不要放 static 并提交。
  - urls 只负责生成 URL 列表。
  - publish 会先生成 URL 再提交 IndexNow。
  - submit/publish 正式提交前会自动校验 keyLocation 内容是否与 --key 一致。`);
    return;
  }

  if (command === 'key') {
    const key = args.key;
    if (!key) {
      throw new Error('缺少 --key');
    }
    const filePath = path.resolve(rootDir, args.file || `build/${key}.txt`);
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${key}\n`, 'utf8');
    console.log(`已生成 key 文件: ${filePath}`);
    return;
  }

  if (command === 'urls') {
    const {siteUrl, baseUrl} = parseSiteConfig(configPath);
    const result = generateUrls({
      docsDir,
      all: Boolean(args.all),
      from,
      to,
      siteUrl: args.siteUrl || siteUrl,
      baseUrl: args.baseUrl || baseUrl,
    });
    writeUrls(outputPath, result.urls, outputFormat);
    console.log(`扫描文档数: ${result.files.length}`);
    console.log(`生成 URL 数: ${result.urls.length}`);
    console.log(`跳过无 slug 文档数: ${result.skipped.length}`);
    console.log(`输出文件: ${outputPath}`);
    result.skipped.forEach((item) => console.log(`- 无 slug: ${item}`));
    return;
  }

  if (command === 'submit' || command === 'publish') {
    const key = args.key;
    if (!key) {
      throw new Error('缺少 --key');
    }

    let urls = [];
    if (command === 'submit') {
      urls = readUrls(path.resolve(rootDir, args.input || outputPath));
    } else {
      const {siteUrl, baseUrl} = parseSiteConfig(configPath);
      const result = generateUrls({
        docsDir,
        all: Boolean(args.all),
        from,
        to,
        siteUrl: args.siteUrl || siteUrl,
        baseUrl: args.baseUrl || baseUrl,
      });
      urls = result.urls;
      writeUrls(outputPath, urls, outputFormat);
      console.log(`已生成 URL 文件: ${outputPath}（${urls.length} 条）`);
      result.skipped.forEach((item) => console.log(`- 无 slug: ${item}`));
    }

    urls = unique(urls);
    if (urls.length === 0) {
      console.log('没有可提交的 URL，已跳过。');
      return;
    }

    const firstUrl = new URL(urls[0]);
    const host = args.host || firstUrl.host;
    const keyLocation = args.keyLocation || `${firstUrl.origin}/${key}.txt`;
    const chunkSize = Number(args.chunkSize || 1000);
    const dryRun = Boolean(args.dryRun);
    const skipVerify = Boolean(args.skipVerify);

    if (!Number.isInteger(chunkSize) || chunkSize <= 0 || chunkSize > 10000) {
      throw new Error('chunkSize 必须在 1~10000');
    }

    const badHost = urls.find((item) => new URL(item).host !== host);
    if (badHost) {
      throw new Error(`URL host 不一致: ${badHost}`);
    }

    if (!dryRun && !skipVerify) {
      console.log(`校验 keyLocation: ${keyLocation}`);
      await verifyKeyLocation({keyLocation, key});
      console.log('keyLocation 校验通过。');
    }

    const total = await submitIndexNow({
      endpoint,
      host,
      key,
      keyLocation,
      urls,
      chunkSize,
      dryRun,
    });
    if (dryRun) {
      console.log(`[dry-run] 计划提交 ${total} 条 URL`);
    } else {
      console.log(`IndexNow 提交完成，共 ${total} 条 URL`);
    }
    return;
  }

  throw new Error(`不支持的命令: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
