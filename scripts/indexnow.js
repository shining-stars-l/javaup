#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const DEFAULT_KEY_STORE = '.indexnow/key.txt';

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
  const trailingSlashMatch = content.match(/\btrailingSlash:\s*(true|false)/);
  if (!urlMatch) {
    throw new Error(`未在 ${configPath} 找到 url 配置`);
  }
  return {
    siteUrl: urlMatch[1].trim(),
    baseUrl: baseUrlMatch ? baseUrlMatch[1].trim() : '/',
    trailingSlash: trailingSlashMatch ? trailingSlashMatch[1] === 'true' : undefined,
  };
}

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl || baseUrl === '/') {
    return '/';
  }
  const withLeading = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

function parseFrontmatterSlugContent(content) {
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

function buildUrl({siteUrl, baseUrl, slug, trailingSlash}) {
  if (/^https?:\/\//i.test(slug)) {
    const externalUrl = new URL(slug);
    if (trailingSlash === true && externalUrl.pathname !== '/' && !externalUrl.pathname.endsWith('/')) {
      externalUrl.pathname = `${externalUrl.pathname}/`;
    }
    return externalUrl.toString();
  }

  const normalizedBase = normalizeBaseUrl(baseUrl);
  let pathname = slug.startsWith('/') ? slug : `/${slug}`;
  if (normalizedBase !== '/') {
    const baseNoTail = normalizedBase.slice(0, -1);
    if (!pathname.startsWith(`${baseNoTail}/`) && pathname !== baseNoTail) {
      pathname = `${baseNoTail}${pathname}`;
    }
  }
  if (trailingSlash === true && pathname !== '/' && !pathname.endsWith('/')) {
    pathname = `${pathname}/`;
  } else if (trailingSlash === false && pathname.length > 1) {
    pathname = pathname.replace(/\/+$/, '');
  }
  return new URL(pathname, siteUrl).toString();
}

function runGit(args, {trim = true} = {}) {
  const output = execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  return trim ? output.trim() : output;
}

function resolveDefaultRange() {
  try {
    runGit(['rev-parse', '--verify', 'HEAD~1']);
    return {from: 'HEAD~1', to: 'HEAD'};
  } catch (error) {
    return {from: null, to: 'HEAD'};
  }
}

function listChangedDocEntries(docsDir, from, to) {
  if (!from) {
    return [];
  }
  const relativeDocsDir = path.relative(process.cwd(), docsDir).replace(/\\/g, '/');
  const raw = runGit(
    ['diff', '--name-status', '-z', '--find-renames', from, to, '--', relativeDocsDir],
    {trim: false}
  );
  const tokens = raw.split('\0');
  const entries = [];

  for (let index = 0; index < tokens.length; ) {
    const status = tokens[index++];
    if (!status) {
      continue;
    }
    if (status.startsWith('R') || status.startsWith('C')) {
      const oldPath = tokens[index++];
      const newPath = tokens[index++];
      if (/\.(md|mdx)$/i.test(oldPath) || /\.(md|mdx)$/i.test(newPath)) {
        entries.push({status: status[0], oldPath, newPath});
      }
      continue;
    }
    const filePath = tokens[index++];
    if (!/\.(md|mdx)$/i.test(filePath)) {
      continue;
    }
    entries.push({
      status: status[0],
      oldPath: status.startsWith('A') ? null : filePath,
      newPath: status.startsWith('D') ? null : filePath,
    });
  }
  return entries;
}

function parseSlugAtRef(ref, filePath) {
  const content = runGit(['show', `${ref}:${filePath}`], {trim: false});
  return parseFrontmatterSlugContent(content);
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

function validateKey(key) {
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
    throw new Error('IndexNow key 必须为 8~128 位，只能包含字母、数字和连字符');
  }
  return key;
}

function resolveKey({rootDir, args, allowGenerate = false}) {
  const storePath = path.resolve(rootDir, args.keyStore || DEFAULT_KEY_STORE);
  let key = args.key || process.env.INDEXNOW_KEY;
  let source = args.key ? '--key' : process.env.INDEXNOW_KEY ? 'INDEXNOW_KEY 环境变量' : null;

  if (!key && fs.existsSync(storePath)) {
    key = readFile(storePath).trim();
    source = storePath;
  }
  if (!key && allowGenerate) {
    key = crypto.randomBytes(16).toString('hex');
    source = '自动生成';
  }
  if (!key) {
    throw new Error(
      `没有找到 IndexNow key。请先执行 npm run indexnow:key，或设置 INDEXNOW_KEY 环境变量。默认保存位置: ${storePath}`
    );
  }

  return {key: validateKey(String(key).trim()), source, storePath};
}

function persistKey({key, storePath}) {
  ensureDir(path.dirname(storePath));
  fs.writeFileSync(storePath, `${key}\n`, {encoding: 'utf8', mode: 0o600});
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
      `keyLocation 内容与本地 key 不一致。期望: ${key}，实际: ${content || '(空)'}，地址: ${keyLocation}`
    );
  }
}

function generateAllUrls({sitemapPath}) {
  if (!fs.existsSync(sitemapPath)) {
    throw new Error(`没有找到 ${sitemapPath}，请先执行 npm run build`);
  }
  const sitemap = readFile(sitemapPath);
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)]
    .map((match) => match[1].replace(/&amp;/g, '&').trim())
    .filter(Boolean);
  if (urls.length === 0) {
    throw new Error(`sitemap 中没有 URL: ${sitemapPath}`);
  }
  return {scanned: urls.length, skipped: [], urls: unique(urls)};
}

function generateChangedUrls({docsDir, sitemapPath, from, to, siteUrl, baseUrl, trailingSlash}) {
  if (!from) {
    return generateAllUrls({sitemapPath});
  }

  const entries = listChangedDocEntries(docsDir, from, to);
  const skipped = [];
  const urls = [];
  for (const entry of entries) {
    if (entry.oldPath) {
      const oldSlug = parseSlugAtRef(from, entry.oldPath);
      if (oldSlug) {
        urls.push(buildUrl({siteUrl, baseUrl, slug: oldSlug, trailingSlash}));
      } else {
        skipped.push(`${from}:${entry.oldPath}`);
      }
    }
    if (entry.newPath) {
      const newSlug = parseSlugAtRef(to, entry.newPath);
      if (newSlug) {
        urls.push(buildUrl({siteUrl, baseUrl, slug: newSlug, trailingSlash}));
      } else {
        skipped.push(`${to}:${entry.newPath}`);
      }
    }
  }
  return {scanned: entries.length, skipped, urls: unique(urls)};
}

async function main() {
  const [command = 'help', ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const rootDir = process.cwd();
  const docsDir = path.resolve(rootDir, args.docsDir || 'docs');
  const configPath = path.resolve(rootDir, args.config || 'docusaurus.config.js');
  const sitemapPath = path.resolve(rootDir, args.sitemap || 'build/sitemap.xml');
  const outputPath = path.resolve(rootDir, args.output || '.indexnow/changed-urls.txt');
  const outputFormat = args.format === 'json' ? 'json' : 'text';
  const endpoint = args.endpoint || 'https://api.indexnow.org/indexnow';
  const defaultRange = resolveDefaultRange();
  const from = args.from || defaultRange.from;
  const to = args.to || defaultRange.to;

  if (command === 'help') {
    console.log(`用法:
  npm run indexnow:key
  npm run indexnow:urls -- --from HEAD~1 --to HEAD
  npm run indexnow:urls -- --all
  npm run indexnow:submit -- --input .indexnow/changed-urls.txt [--dryRun]
  npm run indexnow:publish -- --from HEAD~1 --to HEAD [--dryRun]
  npm run indexnow:publish -- --all [--dryRun]

key 读取顺序:
  1. --key 参数
  2. INDEXNOW_KEY 环境变量
  3. .indexnow/key.txt
  4. key 命令在都不存在时自动生成新 key

说明:
  - npm run build 会在 Docusaurus 构建完成后，把 key 文件写入 build/<key>.txt。
  - --all 直接读取 build/sitemap.xml，确保首页和全部规范 URL 都包含在内。
  - urls/publish 默认同时读取 Git 变更前后的 slug，改名和删除时会包含旧 URL。
  - publish 正式提交前会验证线上 https://javaup.chat/<key>.txt。
  - IndexNow 只通知 Bing 等支持方重新抓取，不能替代旧 URL 到新 URL 的 301。`);
    return;
  }

  if (command === 'key') {
    const resolved = resolveKey({rootDir, args, allowGenerate: true});
    persistKey(resolved);
    const filePath = path.resolve(rootDir, args.file || `build/${resolved.key}.txt`);
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${resolved.key}\n`, 'utf8');
    console.log(`IndexNow key 来源: ${resolved.source}`);
    console.log(`持久保存位置: ${resolved.storePath}`);
    console.log(`构建产物 key 文件: ${filePath}`);
    console.log(`部署后校验地址: https://javaup.chat/${resolved.key}.txt`);
    return;
  }

  if (command === 'urls') {
    const siteConfig = parseSiteConfig(configPath);
    const result = args.all
      ? generateAllUrls({sitemapPath})
      : generateChangedUrls({
          docsDir,
          sitemapPath,
          from,
          to,
          siteUrl: args.siteUrl || siteConfig.siteUrl,
          baseUrl: args.baseUrl || siteConfig.baseUrl,
          trailingSlash: siteConfig.trailingSlash,
        });
    writeUrls(outputPath, result.urls, outputFormat);
    console.log(`扫描文档/变更数: ${result.scanned}`);
    console.log(`生成 URL 数: ${result.urls.length}`);
    console.log(`跳过无 slug 记录数: ${result.skipped.length}`);
    console.log(`输出文件: ${outputPath}`);
    result.skipped.forEach((item) => console.log(`- 无 slug: ${item}`));
    return;
  }

  if (command === 'submit' || command === 'publish') {
    const resolved = resolveKey({rootDir, args});
    let urls = [];
    if (command === 'submit') {
      urls = readUrls(path.resolve(rootDir, args.input || outputPath));
    } else {
      const siteConfig = parseSiteConfig(configPath);
      const result = args.all
        ? generateAllUrls({sitemapPath})
        : generateChangedUrls({
            docsDir,
            sitemapPath,
            from,
            to,
            siteUrl: args.siteUrl || siteConfig.siteUrl,
            baseUrl: args.baseUrl || siteConfig.baseUrl,
            trailingSlash: siteConfig.trailingSlash,
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
    const keyLocation = args.keyLocation || `${firstUrl.origin}/${resolved.key}.txt`;
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

    console.log(`IndexNow key 来源: ${resolved.source}`);
    if (!dryRun && !skipVerify) {
      console.log(`校验 keyLocation: ${keyLocation}`);
      await verifyKeyLocation({keyLocation, key: resolved.key});
      console.log('keyLocation 校验通过。');
    }

    const total = await submitIndexNow({
      endpoint,
      host,
      key: resolved.key,
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
