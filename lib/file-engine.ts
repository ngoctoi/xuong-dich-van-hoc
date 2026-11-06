import JSZip from 'jszip';
import { Chapter, NovelProject } from './types';

/**
 * Decode an ArrayBuffer into text, auto-detecting UTF-8 vs GB18030/GBK
 * (very common for Chinese raw .txt files).
 */
export function decodeChineseTextBuffer(buffer: ArrayBuffer): string {
  const uint8 = new Uint8Array(buffer);
  // Check UTF-8 BOM
  if (uint8.length >= 3 && uint8[0] === 0xef && uint8[1] === 0xbb && uint8[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(uint8.subarray(3));
  }
  // Check UTF-16LE / UTF-16BE BOM
  if (uint8.length >= 2 && uint8[0] === 0xff && uint8[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(uint8.subarray(2));
  }
  if (uint8.length >= 2 && uint8[0] === 0xfe && uint8[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(uint8.subarray(2));
  }
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    return utf8Decoder.decode(uint8);
  } catch {
    try {
      const gbkDecoder = new TextDecoder('gb18030');
      return gbkDecoder.decode(uint8);
    } catch {
      return new TextDecoder('utf-8').decode(uint8);
    }
  }
}

export const decodeSmartTextBuffer = decodeChineseTextBuffer;

/**
 * Remove duplicate first-line chapter title if the .txt body starts with the exact same title.
 */
export function cleanRawChapterBody(rawText: string, titleRaw: string): string {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd());

  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }

  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    const cleanTitle = titleRaw.trim();
    if (
      firstLine === cleanTitle ||
      firstLine.replace(/[！!？?。，,\s]/g, '') ===
        cleanTitle.replace(/[！!？?。，,\s]/g, '')
    ) {
      lines.shift();
      while (lines.length > 0 && lines[0].trim() === '') {
        lines.shift();
      }
    }
  }

  return lines.join('\n').trim();
}

/**
 * Parse a filename like "0001_第1章 他惊人的毅力并无观众.txt"
 * extracting orderPrefix ("0001"), chapterNumber (1), and titleRaw ("第1章 他惊人的毅力并无观众").
 */
export function parsePrefixedFileName(
  fileName: string,
  fallbackIndex: number
): {
  orderPrefix: string;
  chapterNumber: number;
  titleRaw: string;
} {
  const baseName = fileName.replace(/\.txt$/i, '').trim();
  const match = baseName.match(/^(\d{1,6})[_.\-\s]+(.+)$/);

  if (match) {
    const prefix = match[1].padStart(4, '0');
    const restTitle = match[2].trim();
    // Try extracting chapter number from 第X章 or prefix
    const chNumMatch = restTitle.match(/第(\d+)[章回节卷]/);
    const chapterNumber = chNumMatch ? parseInt(chNumMatch[1], 10) : parseInt(match[1], 10);
    return {
      orderPrefix: prefix,
      chapterNumber: Number.isNaN(chapterNumber) ? fallbackIndex : chapterNumber,
      titleRaw: restTitle,
    };
  }

  // Fallback if no numeric prefix before _
  const numStart = baseName.match(/^(\d+)/);
  const orderNumber = numStart ? parseInt(numStart[1], 10) : fallbackIndex;
  return {
    orderPrefix: String(orderNumber).padStart(4, '0'),
    chapterNumber: orderNumber,
    titleRaw: baseName,
  };
}

/**
 * Parse a folder or multi-selection of .TXT files (XXXX_Title.txt).
 */
export async function parseFolderTxtFiles(
  files: File[],
  novelId: string,
  existingCount = 0
): Promise<Chapter[]> {
  const txtFiles = files.filter((f) => f.name.toLowerCase().endsWith('.txt'));

  // Sort by filename natural numeric order first
  txtFiles.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );

  const chapters: Chapter[] = [];
  for (let i = 0; i < txtFiles.length; i++) {
    const file = txtFiles[i];
    const buffer = await file.arrayBuffer();
    const fullText = decodeChineseTextBuffer(buffer);
    const { orderPrefix, chapterNumber, titleRaw } = parsePrefixedFileName(
      file.name,
      existingCount + i + 1
    );

    // If titleRaw doesn't look like a chapter title and first line does, check first line
    const firstNonEmptyLine =
      fullText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0) || titleRaw;

    const finalTitleRaw =
      titleRaw && titleRaw.length > 0 ? titleRaw : firstNonEmptyLine;
    const cleanedBody = cleanRawChapterBody(fullText, finalTitleRaw);

    chapters.push({
      id: `ch-${novelId}-${orderPrefix}-${Date.now()}-${i}`,
      novelId,
      orderPrefix,
      chapterNumber,
      fileNameOriginal: file.name,
      titleRaw: finalTitleRaw,
      titleTranslated: '',
      rawContent: cleanedBody,
      translatedContent: '',
      charCount: cleanedBody.replace(/\s+/g, '').length,
      status: 'raw',
      updatedAt: Date.now(),
    });
  }

  chapters.sort((a, b) =>
    a.orderPrefix.localeCompare(b.orderPrefix, undefined, { numeric: true })
  );
  return chapters;
}

export interface RegexSplitPreviewItem {
  orderPrefix: string;
  chapterNumber: number;
  titleRaw: string;
  rawContent: string;
  charCount: number;
  warning?: string;
}

/**
 * Split a single merged .TXT file into chapters using a custom user Regex.
 */
export function splitMergedTxtByRegex(
  fullText: string,
  regexPattern: string,
  startOrderIndex = 1
): {
  items: RegexSplitPreviewItem[];
  error?: string;
} {
  let lineRegex: RegExp;
  try {
    lineRegex = new RegExp(regexPattern, 'u');
  } catch (err) {
    return {
      items: [],
      error: `Biểu thức Regex không hợp lệ: ${(err as Error).message}`,
    };
  }

  const lines = fullText.replace(/\r\n/g, '\n').split('\n');
  const rawChapters: { title: string; bodyLines: string[] }[] = [];
  let currentChapter: { title: string; bodyLines: string[] } | null = null;
  const prologueLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length <= 120 && lineRegex.test(trimmed)) {
      if (currentChapter) {
        rawChapters.push(currentChapter);
      } else if (prologueLines.join('\n').trim().length > 80) {
        rawChapters.push({
          title: '第0章 序章 / Mở đầu',
          bodyLines: [...prologueLines],
        });
      }
      currentChapter = { title: trimmed, bodyLines: [] };
    } else {
      if (currentChapter) {
        currentChapter.bodyLines.push(line);
      } else {
        prologueLines.push(line);
      }
    }
  }

  if (currentChapter) {
    rawChapters.push(currentChapter);
  } else if (rawChapters.length === 0 && fullText.trim().length > 0) {
    rawChapters.push({
      title: '第1章 Toàn văn',
      bodyLines: lines,
    });
  }

  const items: RegexSplitPreviewItem[] = rawChapters.map((ch, idx) => {
    const isZeroPrologue = idx === 0 && ch.title.includes('第0章');
    const num = isZeroPrologue ? 0 : startOrderIndex + (rawChapters[0]?.title.includes('第0章') ? idx - 1 : idx);
    const orderPrefix = String(Math.max(0, num)).padStart(4, '0');
    const body = ch.bodyLines.join('\n').trim();
    const charCount = body.replace(/\s+/g, '').length;

    let warning: string | undefined;
    if (charCount < 100) {
      warning = 'Chương quá ngắn (< 100 chữ) — Có thể dòng tiêu đề bị tách nhầm';
    } else if (charCount > 15000) {
      warning = 'Chương rất dài (> 15.000 chữ) — Có thể sót tiêu đề chương bị lỗi raw';
    }

    return {
      orderPrefix,
      chapterNumber: Math.max(0, num),
      titleRaw: ch.title,
      rawContent: body,
      charCount,
      warning,
    };
  });

  return { items };
}

/**
 * Parse an uploaded .EPUB file on the client using JSZip.
 */
export async function parseEpubFile(
  file: File,
  novelId: string,
  startIndex = 1
): Promise<{
  bookTitle?: string;
  author?: string;
  chapters: Chapter[];
}> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  // 1. Find OPF path from META-INF/container.xml
  let opfPath = '';
  const containerFile = zip.file('META-INF/container.xml');
  if (containerFile) {
    const containerXml = await containerFile.async('string');
    const match = containerXml.match(/full-path=["']([^"']+)["']/i);
    if (match) opfPath = match[1];
  }

  if (!opfPath) {
    const allFiles = Object.keys(zip.files);
    opfPath = allFiles.find((f) => f.toLowerCase().endsWith('.opf')) || '';
  }

  const opfDir = opfPath.includes('/')
    ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1)
    : '';

  let bookTitle = file.name.replace(/\.epub$/i, '');
  let author = '';
  const orderedHrefs: string[] = [];

  if (opfPath && zip.file(opfPath)) {
    const opfXml = await zip.file(opfPath)!.async('string');
    const parser = new DOMParser();
    const doc = parser.parseFromString(opfXml, 'application/xml');

    const titleEl = doc.querySelector('title, dc\\:title');
    if (titleEl?.textContent) bookTitle = titleEl.textContent.trim();

    const creatorEl = doc.querySelector('creator, dc\\:creator');
    if (creatorEl?.textContent) author = creatorEl.textContent.trim();

    const manifestMap = new Map<string, string>();
    doc.querySelectorAll('manifest > item').forEach((item) => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      const mediaType = item.getAttribute('media-type') || '';
      if (id && href && (mediaType.includes('html') || href.match(/\.(x?html|htm)$/i))) {
        manifestMap.set(id, opfDir + decodeURIComponent(href));
      }
    });

    doc.querySelectorAll('spine > itemref').forEach((ref) => {
      const idref = ref.getAttribute('idref');
      if (idref && manifestMap.has(idref)) {
        orderedHrefs.push(manifestMap.get(idref)!);
      }
    });
  }

  if (orderedHrefs.length === 0) {
    // Fallback: all html/xhtml files sorted naturally
    Object.keys(zip.files)
      .filter((k) => /\.(x?html|htm)$/i.test(k) && !/nav|toc|cover/i.test(k))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .forEach((k) => orderedHrefs.push(k));
  }

  const chapters: Chapter[] = [];
  let chCounter = startIndex;

  for (let i = 0; i < orderedHrefs.length; i++) {
    const href = orderedHrefs[i];
    const zipEntry = zip.file(href) || zip.file(decodeURIComponent(href));
    if (!zipEntry) continue;

    const htmlContent = await zipEntry.async('string');
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // Skip navigation or tiny cover pages
    if (doc.querySelector('nav[epub\\:type="toc"], nav#toc')) continue;

    const headingEl = doc.querySelector('h1, h2, h3, title');
    let titleRaw = headingEl?.textContent?.trim() || '';

    const paragraphs: string[] = [];
    const pElements = doc.querySelectorAll('p, div.paragraph');
    if (pElements.length > 0) {
      pElements.forEach((p) => {
        const t = p.textContent?.trim();
        if (t) paragraphs.push(t);
      });
    } else {
      const bodyText = doc.body?.innerText || doc.body?.textContent || '';
      bodyText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((l) => paragraphs.push(l));
    }

    const rawBody = paragraphs.join('\n').trim();
    if (rawBody.length < 20 && !titleRaw) continue;

    if (!titleRaw) {
      titleRaw = paragraphs[0] || `第${chCounter}章`;
    }

    const cleanedBody = cleanRawChapterBody(rawBody, titleRaw);
    const orderPrefix = String(chCounter).padStart(4, '0');

    chapters.push({
      id: `ch-${novelId}-${orderPrefix}-${Date.now()}-${i}`,
      novelId,
      orderPrefix,
      chapterNumber: chCounter,
      fileNameOriginal: `${orderPrefix}_${titleRaw}.txt`,
      titleRaw,
      titleTranslated: '',
      rawContent: cleanedBody,
      translatedContent: '',
      charCount: cleanedBody.replace(/\s+/g, '').length,
      status: 'raw',
      updatedAt: Date.now(),
    });
    chCounter++;
  }

  return { bookTitle, author, chapters };
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Ensure chapter has a clean Vietnamese title when exporting.
 * Converts basic "第X章" patterns if untranslated or uses existing titleTranslated.
 */
export function ensureExportVietnameseTitle(chapter: Chapter): string {
  const translated = (chapter.titleTranslated || '').trim();
  if (translated.length > 0) {
    return translated;
  }
  const raw = (chapter.titleRaw || '').trim();
  const replaced = raw.replace(
    /^第([0-9零一二三四五六七八九十百千万]+)[章回节卷]\s*/,
    `Chương ${chapter.chapterNumber}: `
  );
  return replaced || `Chương ${chapter.chapterNumber}`;
}

/**
 * Generate a strict W3C EPUB 3.3 compliant e-book (.epub Blob).
 * Includes:
 * - Uncompressed `mimetype` as first entry
 * - `META-INF/container.xml`
 * - `OEBPS/package.opf` (version="3.0", dcterms:modified)
 * - `OEBPS/nav.xhtml` (EPUB 3.3 HTML5 Navigation Document with epub:type="toc")
 * - `OEBPS/style.css` (with text-align: justify)
 * - `OEBPS/chapter_XXXX.xhtml` for each chapter
 */
export async function generateEpub33Blob(
  novel: NovelProject,
  chapters: Chapter[],
  mode: 'vi_only' | 'bilingual' = 'vi_only'
): Promise<Blob> {
  const zip = new JSZip();

  // 1. mimetype MUST be first and uncompressed (STORE)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.file('META-INF/container.xml', containerXml);

  // 3. OEBPS/style.css (Always Justify per user requirement)
  const styleCss = `@charset "UTF-8";
body {
  font-family: "Literata", "Noto Serif", Georgia, serif;
  line-height: 1.8;
  margin: 5% 6%;
  color: #1C1917;
  text-align: justify;
  text-justify: inter-word;
}
h1.chapter-title {
  font-size: 1.5em;
  font-weight: 700;
  text-align: center;
  margin: 1.5em 0 1.2em 0;
  line-height: 1.35;
  color: #8C2D19;
  border-bottom: 1px solid #E5DEC9;
  padding-bottom: 0.6em;
}
p {
  text-align: justify;
  text-justify: inter-word;
  text-indent: 1.5em;
  margin: 0 0 0.85em 0;
}
p.raw-cn {
  color: #6B7280;
  font-size: 0.9em;
  text-indent: 0;
  margin-bottom: 0.25em;
}
nav#toc ol {
  list-style-type: none;
  padding-left: 0;
}
nav#toc li {
  margin: 0.5em 0;
}
nav#toc a {
  text-decoration: none;
  color: #1C1917;
}`;
  zip.file('OEBPS/style.css', styleCss);

  // 4. Build Chapter XHTML files & Optional Cover Page
  const manifestItems: string[] = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="css" href="style.css" media-type="text/css"/>`,
  ];
  const spineItems: string[] = [];

  // Embed EPUB Cover if present on NovelProject
  if (novel.coverDataBase64 && novel.coverDataBase64.includes('base64,')) {
    const isPng =
      novel.coverMimeType?.includes('png') ||
      novel.coverDataBase64.startsWith('data:image/png');
    const ext = isPng ? 'png' : 'jpg';
    const mime = isPng ? 'image/png' : 'image/jpeg';
    const base64Raw = novel.coverDataBase64.split('base64,')[1];
    if (base64Raw) {
      zip.file(`OEBPS/images/cover.${ext}`, base64Raw, { base64: true });
      const coverXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi" lang="vi">
<head>
  <meta charset="UTF-8"/>
  <title>Bìa sách - ${escapeXml(novel.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
  <style type="text/css">
    body { margin: 0; padding: 0; text-align: center; }
    .cover-wrap { display: flex; align-items: center; justify-content: center; height: 98vh; }
    .cover-wrap img { max-width: 100%; max-height: 96vh; object-fit: contain; }
  </style>
</head>
<body epub:type="cover">
  <div class="cover-wrap">
    <img src="images/cover.${ext}" alt="${escapeXml(novel.title)}"/>
  </div>
</body>
</html>`;
      zip.file('OEBPS/cover.xhtml', coverXhtml);
      manifestItems.push(
        `<item id="cover-image" href="images/cover.${ext}" media-type="${mime}" properties="cover-image"/>`,
        `<item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>`
      );
      spineItems.push(`<itemref idref="cover-page"/>`);
    }
  }

  spineItems.push(`<itemref idref="nav"/>`);
  const navLinks: string[] = [];

  chapters.forEach((ch, idx) => {
    const fileId = `ch_${ch.orderPrefix}_${idx}`;
    const fileName = `chapter_${ch.orderPrefix}_${idx}.xhtml`;
    const chapterTitleVi = ensureExportVietnameseTitle(ch);

    const viParagraphs = (ch.translatedContent || ch.rawContent || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const rawParagraphs = (ch.rawContent || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    let bodyHtml = '';
    if (mode === 'bilingual') {
      const maxLen = Math.max(viParagraphs.length, rawParagraphs.length);
      for (let i = 0; i < maxLen; i++) {
        if (rawParagraphs[i]) {
          bodyHtml += `    <p class="raw-cn">${escapeXml(rawParagraphs[i])}</p>\n`;
        }
        if (viParagraphs[i]) {
          bodyHtml += `    <p>${escapeXml(viParagraphs[i])}</p>\n`;
        }
      }
    } else {
      bodyHtml = viParagraphs
        .map((p) => `    <p>${escapeXml(p)}</p>`)
        .join('\n');
    }

    const chapterXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi" lang="vi">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(chapterTitleVi)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body epub:type="bodymatter chapter">
  <section>
    <h1 class="chapter-title">${escapeXml(chapterTitleVi)}</h1>
${bodyHtml}
  </section>
</body>
</html>`;

    zip.file(`OEBPS/${fileName}`, chapterXhtml);
    manifestItems.push(
      `<item id="${fileId}" href="${fileName}" media-type="application/xhtml+xml"/>`
    );
    spineItems.push(`<itemref idref="${fileId}"/>`);
    navLinks.push(
      `        <li><a href="${fileName}">${escapeXml(chapterTitleVi)}</a></li>`
    );
  });

  // 5. OEBPS/nav.xhtml (EPUB 3.3 Navigation Document)
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi" lang="vi">
<head>
  <meta charset="UTF-8"/>
  <title>Mục lục - ${escapeXml(novel.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc" role="doc-toc">
    <h1 class="chapter-title">Mục Lục — ${escapeXml(novel.title)}</h1>
    <ol>
${navLinks.join('\n')}
    </ol>
  </nav>
</body>
</html>`;
  zip.file('OEBPS/nav.xhtml', navXhtml);

  // 6. OEBPS/package.opf (W3C EPUB 3.3 Specification)
  const modifiedIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const pubId = `urn:uuid:${novel.id}-${Date.now()}`;
  const packageOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="vi">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${escapeXml(pubId)}</dc:identifier>
    <dc:title>${escapeXml(novel.title)}</dc:title>
    <dc:creator>${escapeXml(novel.author || 'Khuyết danh')}</dc:creator>
    <dc:language>vi</dc:language>
    <dc:description>${escapeXml(novel.description || novel.originalTitle || '')}</dc:description>
    <meta property="dcterms:modified">${modifiedIso}</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine>
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
  zip.file('OEBPS/package.opf', packageOpf);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * Generate a .ZIP archive of individual .TXT files preserving the exact prefix `XXXX_Chương X - Title.txt`
 */
export async function generatePrefixedTxtZipBlob(
  chapters: Chapter[],
  mode: 'vi_only' | 'bilingual' = 'vi_only'
): Promise<Blob> {
  const zip = new JSZip();

  for (const ch of chapters) {
    const titleVi = ensureExportVietnameseTitle(ch);
    const safeTitle = titleVi
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    const fileName = `${ch.orderPrefix}_${safeTitle}.txt`;

    let body = '';
    if (mode === 'bilingual') {
      const viLines = (ch.translatedContent || '').split(/\r?\n/).filter(Boolean);
      const cnLines = (ch.rawContent || '').split(/\r?\n/).filter(Boolean);
      const max = Math.max(viLines.length, cnLines.length);
      const pairs: string[] = [];
      for (let i = 0; i < max; i++) {
        if (cnLines[i]) pairs.push(cnLines[i]);
        if (viLines[i]) pairs.push(viLines[i]);
        pairs.push('');
      }
      body = `${titleVi}\n (${ch.titleRaw})\n\n${pairs.join('\n')}`;
    } else {
      body = `${titleVi}\n\n${(ch.translatedContent || ch.rawContent || '').trim()}\n`;
    }

    zip.file(fileName, body);
  }

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
  });
}

/**
 * Generate a single merged .TXT file for selected chapters.
 */
export function generateMergedTxtBlob(
  novel: NovelProject,
  chapters: Chapter[],
  mode: 'vi_only' | 'bilingual' = 'vi_only'
): Blob {
  const header = `${novel.title.toUpperCase()}\nNguyên tác: ${novel.originalTitle} — Tác giả: ${novel.author}\nSố chương: ${chapters.length}\n========================================\n\n`;

  const blocks = chapters.map((ch) => {
    const titleVi = ensureExportVietnameseTitle(ch);
    if (mode === 'bilingual') {
      return `${titleVi}\n[${ch.titleRaw}]\n\n${(ch.translatedContent || ch.rawContent || '').trim()}\n`;
    }
    return `${titleVi}\n\n${(ch.translatedContent || ch.rawContent || '').trim()}\n`;
  });

  return new Blob([header + blocks.join('\n----------------------------------------\n\n')], {
    type: 'text/plain;charset=utf-8',
  });
}

/**
 * Full Project Backup (.ZIP v5 format compatible with Xưởng Dịch Hán Việt / Mặc Hương Các):
 * Contains manifest.json, source/{id}.txt, translation/{id}.txt, reader-fonts/, cover/, presets, glossary, highlights.
 */
export async function generateProjectBackupZipV5(params: {
  novel: NovelProject;
  chapters: Chapter[];
  instructions: import('./types').InstructionProfile[];
  glossary: import('./types').GlossaryEntry[];
  highlights: import('./types').ReaderHighlight[];
  customFonts: import('./types').CustomFontRecord[];
  readerSettings: import('./types').ReaderSettings;
}): Promise<Blob> {
  const {
    novel,
    chapters,
    instructions,
    glossary,
    highlights,
    customFonts,
    readerSettings,
  } = params;
  const zip = new JSZip();

  let coverFilename = '';
  if (novel.coverDataBase64 && novel.coverDataBase64.includes('base64,')) {
    const isPng =
      novel.coverMimeType?.includes('png') ||
      novel.coverDataBase64.startsWith('data:image/png');
    const ext = isPng ? 'png' : 'jpg';
    coverFilename = `cover/cover.${ext}`;
    const rawBase64 = novel.coverDataBase64.split('base64,')[1];
    if (rawBase64) {
      zip.file(coverFilename, rawBase64, { base64: true });
    }
  }

  for (const ch of chapters) {
    zip.file(
      `source/${ch.id}.txt`,
      `${ch.titleRaw}\n\n${ch.rawContent || ''}`
    );
    if (ch.translatedContent || ch.titleTranslated) {
      zip.file(
        `translation/${ch.id}.txt`,
        `${ch.titleTranslated || ''}\n\n${ch.translatedContent || ''}`
      );
    }
  }

  const fontMetaList = customFonts.map((f) => {
    const base64Part = f.dataBase64.includes('base64,')
      ? f.dataBase64.split('base64,')[1]
      : f.dataBase64;
    zip.file(`reader-fonts/${f.id}_${f.fileName}`, base64Part, {
      base64: true,
    });
    return {
      id: f.id,
      name: f.name,
      fileName: f.fileName,
      mimeType: f.mimeType,
      createdAt: f.createdAt,
    };
  });

  const manifest = {
    format: 'xuong-dich-han-viet-backup',
    version: 5,
    exportedAt: new Date().toISOString(),
    project: {
      ...novel,
      coverDataBase64: undefined, // stored in cover/cover.ext
    },
    presets: instructions.filter((i) => i.role !== 'editorial'),
    editorialPresets: instructions.filter((i) => i.role === 'editorial'),
    glossary,
    readerHighlights: highlights,
    readerFonts: fontMetaList,
    settings: { readerSettings },
    coverFilename,
    chapters: chapters.map((c) => ({
      ...c,
      rawContent: '', // stored in source/{id}.txt
      translatedContent: '', // stored in translation/{id}.txt
    })),
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * Restore a Full Project Backup (.ZIP v5) into a new local NovelProject without overwriting existing projects.
 */
export async function parseProjectBackupZipV5(file: File): Promise<{
  novel: NovelProject;
  chapters: Chapter[];
  glossary: import('./types').GlossaryEntry[];
  instructions: import('./types').InstructionProfile[];
  highlights: import('./types').ReaderHighlight[];
}> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) {
    throw new Error('Gói .ZIP không hợp lệ: Thiếu tệp manifest.json.');
  }

  const manifest = JSON.parse(await manifestEntry.async('string'));
  if (!manifest || !manifest.project || !Array.isArray(manifest.chapters)) {
    throw new Error('Cấu trúc manifest.json trong gói Backup không hợp lệ.');
  }

  const newNovelId = `novel-restore-${Date.now()}`;
  let coverDataBase64: string | undefined;
  let coverMimeType: string | undefined;

  if (manifest.coverFilename && zip.file(manifest.coverFilename)) {
    const b64 = await zip.file(manifest.coverFilename)!.async('base64');
    const isPng = manifest.coverFilename.toLowerCase().endsWith('.png');
    coverMimeType = isPng ? 'image/png' : 'image/jpeg';
    coverDataBase64 = `data:${coverMimeType};base64,${b64}`;
  }

  const restoredNovel: NovelProject = {
    ...manifest.project,
    id: newNovelId,
    title: `${manifest.project.title || 'Dự án'} (Phục hồi)`,
    coverDataBase64,
    coverMimeType,
    includeGlossary: Boolean(manifest.project.includeGlossary),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const chapterIdMap = new Map<string, string>();
  const restoredChapters: Chapter[] = [];

  for (let i = 0; i < manifest.chapters.length; i++) {
    const chMeta = manifest.chapters[i];
    const oldId = chMeta.id;
    const newChId = `ch-${newNovelId}-${chMeta.orderPrefix || String(i).padStart(4, '0')}-${i}`;
    chapterIdMap.set(oldId, newChId);

    let rawContent = chMeta.rawContent || '';
    const srcFile = zip.file(`source/${oldId}.txt`);
    if (srcFile) {
      const fullSrc = await srcFile.async('string');
      rawContent = cleanRawChapterBody(fullSrc, chMeta.titleRaw || '');
    }

    let translatedContent = chMeta.translatedContent || '';
    let titleTranslated = chMeta.titleTranslated || '';
    const trFile = zip.file(`translation/${oldId}.txt`);
    if (trFile) {
      const fullTr = await trFile.async('string');
      const lines = fullTr.replace(/\r\n/g, '\n').split('\n');
      const firstLine = (lines[0] || '').trim();
      if (!titleTranslated && firstLine) {
        titleTranslated = firstLine;
        translatedContent = lines.slice(1).join('\n').trim();
      } else {
        translatedContent = cleanRawChapterBody(fullTr, titleTranslated);
      }
    }

    restoredChapters.push({
      ...chMeta,
      id: newChId,
      novelId: newNovelId,
      titleTranslated,
      rawContent,
      translatedContent,
      charCount: rawContent.replace(/\s+/g, '').length,
      updatedAt: Date.now(),
    });
  }

  const restoredGlossary: import('./types').GlossaryEntry[] = (
    manifest.glossary || []
  ).map((g: import('./types').GlossaryEntry, idx: number) => ({
    ...g,
    id: `gl-${newNovelId}-${Date.now()}-${idx}`,
    novelId: newNovelId,
  }));

  const allPresets = [
    ...(manifest.presets || []),
    ...(manifest.editorialPresets || []),
  ];
  const restoredInstructions: import('./types').InstructionProfile[] =
    allPresets.map((p: import('./types').InstructionProfile) => ({
      ...p,
      autoUpdate: false, // Protect restored presets from auto-overwriting
    }));

  const restoredHighlights: import('./types').ReaderHighlight[] = (
    manifest.readerHighlights || []
  ).map((h: import('./types').ReaderHighlight, idx: number) => ({
    ...h,
    id: `hl-${newNovelId}-${Date.now()}-${idx}`,
    novelId: newNovelId,
    chapterId: chapterIdMap.get(h.chapterId) || h.chapterId,
  }));

  return {
    novel: restoredNovel,
    chapters: restoredChapters,
    glossary: restoredGlossary,
    instructions: restoredInstructions,
    highlights: restoredHighlights,
  };
}

