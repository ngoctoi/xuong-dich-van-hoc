import { Chapter, ChapterAlignment, GlossaryEntry, TranslationBlock } from './types';
import { findEnglishLeaksInText } from './qa-scanner';

const CJK_TEST_REGEX = /[\u4E00-\u9FFF\u3400-\u4DBF]/;

/**
 * Split a chapter's raw title and raw body into structured blocks:
 * - TITLE: The chapter title
 * - P0001, P0002...: Body blocks (separated by blank lines if present, otherwise by non-empty lines)
 */
export function splitRawIntoBlocks(
  titleRaw: string,
  rawContent: string
): TranslationBlock[] {
  const cleanTitle = (titleRaw || '').replace(/\r?\n/g, ' ').trim();
  const blocks: TranslationBlock[] = [
    {
      id: 'TITLE',
      source: cleanTitle || '第1章',
    },
  ];

  const normalized = (rawContent || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return blocks;
  }

  // Check if body uses blank lines between paragraphs
  const hasBlankLineSeparators = /\n\s*\n/.test(normalized);
  const rawParagraphs = hasBlankLineSeparators
    ? normalized
        .split(/\n\s*\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
    : normalized
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean);

  rawParagraphs.forEach((src, idx) => {
    const blockId = `P${String(idx + 1).padStart(4, '0')}`;
    blocks.push({
      id: blockId,
      source: src,
    });
  });

  return blocks;
}

/**
 * Split translated body text into paragraph blocks matching the raw block structure.
 * Preserves explicit empty block slots marked with '\u200B' so clearing or inserting
 * an empty block in Bilingual Block-ID Editor never shifts subsequent blocks.
 */
export function splitTranslatedBodyIntoParagraphs(
  translatedContent: string,
  expectedCount?: number,
  mode: 'auto' | 'blank_line' | 'single_line' = 'auto'
): string[] {
  const normalized = (translatedContent || '').replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
  if (!normalized.trim()) return [];

  const cleanSlot = (p: string) => p.replace(/\u200B/g, '').replace(/^\n+|\n+$/g, '');

  const byBlankLines = normalized
    .split(/\n[ \t]*\n+/)
    .filter((p) => p.trim().length > 0 || p.includes('\u200B'))
    .map(cleanSlot);
  const bySingleLines = normalized
    .split('\n')
    .filter((p) => p.trim().length > 0 || p.includes('\u200B'))
    .map(cleanSlot);

  if (mode === 'blank_line') return byBlankLines;
  if (mode === 'single_line') return bySingleLines;

  // Auto mode: prefer the split strategy that matches expectedCount or has closer count
  if (expectedCount !== undefined && expectedCount > 0) {
    if (byBlankLines.length === expectedCount) return byBlankLines;
    if (bySingleLines.length === expectedCount) return bySingleLines;
    const diffBlank = Math.abs(byBlankLines.length - expectedCount);
    const diffSingle = Math.abs(bySingleLines.length - expectedCount);
    return diffBlank <= diffSingle ? byBlankLines : bySingleLines;
  }

  return byBlankLines.length > 1 ? byBlankLines : bySingleLines;
}

/**
 * Serialize an array of translated body paragraphs back into chapter translatedContent,
 * preserving empty slots via '\u200B' so 1:1 Block ID indices never collapse or shift.
 */
export function serializeBodyBlocksToContent(
  bodyParagraphs: string[],
  trimEdges = false
): string {
  const sanitized = bodyParagraphs.map((p) => {
    const base = (p || '').replace(/\u200B/g, '').replace(/\r?\n+/g, ' ');
    return trimEdges ? base.trim() : base;
  });
  // If every single block is empty, return empty string
  if (sanitized.every((p) => p.trim().length === 0)) {
    return '';
  }
  return sanitized.map((p) => (p.trim().length > 0 ? p : '\u200B')).join('\n\n');
}

/**
 * Materialize an array of `{ id, translation }` blocks returned by Gemini (blocks-v1)
 * in strict raw block ID order, validating missing/duplicate/empty blocks.
 */
export function materializeBlocksToChapter(
  returnedBlocks: { id: string; translation: string }[],
  expectedRawBlocks: TranslationBlock[],
  chapterNumber: number
): {
  titleTranslated: string;
  translatedContent: string;
  alignment: ChapterAlignment;
  missingIds: string[];
  duplicateIds: string[];
  emptyIds: string[];
} {
  const map = new Map<string, string>();
  const duplicateIds: string[] = [];
  const emptyIds: string[] = [];

  for (const item of returnedBlocks || []) {
    if (!item || typeof item.id !== 'string') continue;
    const id = item.id.trim();
    const text = typeof item.translation === 'string' ? item.translation.trim() : '';
    if (map.has(id)) {
      duplicateIds.push(id);
    }
    if (!text) {
      emptyIds.push(id);
    }
    map.set(id, text);
  }

  const missingIds: string[] = [];
  for (const expected of expectedRawBlocks) {
    if (!map.has(expected.id)) {
      missingIds.push(expected.id);
    }
  }

  let titleTranslated = (map.get('TITLE') || '').replace(/\r?\n/g, ' ').trim();
  if (!titleTranslated) {
    titleTranslated = `Chương ${chapterNumber}`;
  }

  const bodyTranslations: string[] = [];
  const blockEnds: number[] = [];
  let cursor = 0;

  const expectedBodyBlocks = expectedRawBlocks.filter((b) => b.id !== 'TITLE');
  expectedBodyBlocks.forEach((b, idx) => {
    const val = (map.get(b.id) || '').trim();
    if (val) {
      bodyTranslations.push(val);
      cursor += val.length;
      blockEnds.push(cursor);
      if (idx < expectedBodyBlocks.length - 1) {
        cursor += 2; // "\n\n"
      }
    }
  });

  const translatedContent = bodyTranslations.join('\n\n');
  const rawBodyCount = expectedBodyBlocks.length;
  const translatedBodyCount = bodyTranslations.length;
  const isAligned =
    missingIds.length === 0 &&
    emptyIds.length === 0 &&
    rawBodyCount === translatedBodyCount;

  return {
    titleTranslated,
    translatedContent,
    alignment: {
      version: 1,
      rawBlockCount: rawBodyCount,
      translatedBlockCount: translatedBodyCount,
      isAligned,
      blockEnds,
    },
    missingIds,
    duplicateIds,
    emptyIds,
  };
}

export interface AlignedBlockPair {
  id: string; // "TITLE" | "P0001" | "P0002"...
  index: number; // -1 for TITLE, 0..N-1 for body
  source: string;
  translation: string;
  hasChinese: boolean;
  hasEnglishLeak: boolean;
  leakedEnglishWords?: string[];
  isMissingTranslation: boolean;
}

/**
 * Build 1:1 aligned pairs between Raw blocks and Translated blocks for a chapter,
 * flagging which specific Block IDs contain residual Chinese or leaked English words.
 */
export function buildChapterBlockPairs(
  chapter: Pick<
    Chapter,
    'titleRaw' | 'rawContent' | 'titleTranslated' | 'translatedContent'
  >,
  customBannedWords: string[] = []
): {
  pairs: AlignedBlockPair[];
  rawBodyBlockCount: number;
  translatedBodyBlockCount: number;
  isBlockCountMatched: boolean;
} {
  const rawBlocks = splitRawIntoBlocks(chapter.titleRaw, chapter.rawContent);
  const rawBodyBlocks = rawBlocks.filter((b) => b.id !== 'TITLE');
  const viBodyParagraphs = splitTranslatedBodyIntoParagraphs(
    chapter.translatedContent,
    rawBodyBlocks.length,
    'auto'
  );

  const pairs: AlignedBlockPair[] = [];

  // 1. TITLE block
  const titleVi = (chapter.titleTranslated || '').trim();
  const titleEngLeaks = findEnglishLeaksInText(titleVi, customBannedWords);
  pairs.push({
    id: 'TITLE',
    index: -1,
    source: rawBlocks[0]?.source || chapter.titleRaw,
    translation: titleVi,
    hasChinese: CJK_TEST_REGEX.test(titleVi),
    hasEnglishLeak: titleEngLeaks.length > 0,
    leakedEnglishWords: titleEngLeaks,
    isMissingTranslation: !titleVi,
  });

  // 2. Body blocks P0001..Pxxxx
  const maxLen = Math.max(rawBodyBlocks.length, viBodyParagraphs.length);
  for (let i = 0; i < maxLen; i++) {
    const id = rawBodyBlocks[i]?.id || `P${String(i + 1).padStart(4, '0')}`;
    const src = rawBodyBlocks[i]?.source || '';
    const tr = viBodyParagraphs[i] || '';
    const blockEngLeaks = tr ? findEnglishLeaksInText(tr, customBannedWords) : [];
    pairs.push({
      id,
      index: i,
      source: src,
      translation: tr,
      hasChinese: Boolean(tr && CJK_TEST_REGEX.test(tr)),
      hasEnglishLeak: blockEngLeaks.length > 0,
      leakedEnglishWords: blockEngLeaks,
      isMissingTranslation: Boolean(src && !tr),
    });
  }

  return {
    pairs,
    rawBodyBlockCount: rawBodyBlocks.length,
    translatedBodyBlockCount: viBodyParagraphs.length,
    isBlockCountMatched:
      viBodyParagraphs.length > 0 &&
      rawBodyBlocks.length === viBodyParagraphs.length,
  };
}

/**
 * Extract only the dirty target blocks (blocks with residual Chinese, English leak, or missing translation)
 * along with contextBefore and contextAfter for targeted AI Block ID cleanup (`{ updates }`).
 */
export function extractDirtyBlockTargets(
  chapter: Pick<
    Chapter,
    'titleRaw' | 'rawContent' | 'titleTranslated' | 'translatedContent'
  >,
  customBannedWords: string[] = []
): {
  targets: {
    id: string;
    source: string;
    translation: string;
    contextBefore?: string;
    contextAfter?: string;
  }[];
  allPairs: AlignedBlockPair[];
  isBlockCountMatched: boolean;
  rawBodyBlockCount: number;
  translatedBodyBlockCount: number;
} {
  const {
    pairs,
    isBlockCountMatched,
    rawBodyBlockCount,
    translatedBodyBlockCount,
  } = buildChapterBlockPairs(chapter, customBannedWords);
  const targets: {
    id: string;
    source: string;
    translation: string;
    contextBefore?: string;
    contextAfter?: string;
  }[] = [];

  pairs.forEach((pair, idx) => {
    if (pair.hasChinese || pair.hasEnglishLeak || pair.isMissingTranslation) {
      const prev = idx > 0 ? pairs[idx - 1]?.translation : undefined;
      const next = idx < pairs.length - 1 ? pairs[idx + 1]?.translation : undefined;
      targets.push({
        id: pair.id,
        source: pair.source,
        translation: pair.translation,
        contextBefore: prev,
        contextAfter: next,
      });
    }
  });

  return {
    targets,
    allPairs: pairs,
    isBlockCountMatched,
    rawBodyBlockCount,
    translatedBodyBlockCount,
  };
}

/**
 * Apply targeted block `{ id, translation }` updates back into the chapter without altering untouched blocks.
 */
export function applyBlockUpdatesToChapter(
  allPairs: AlignedBlockPair[],
  updates: { id: string; translation: string }[],
  fallbackTitle: string
): {
  titleTranslated: string;
  translatedContent: string;
  alignment: ChapterAlignment;
} {
  const updateMap = new Map<string, string>();
  for (const u of updates || []) {
    if (u && typeof u.id === 'string' && typeof u.translation === 'string') {
      const trimmed = u.translation.trim();
      if (trimmed) {
        updateMap.set(u.id.trim(), trimmed);
      }
    }
  }

  let titleTranslated = fallbackTitle;
  const bodyBlocks: string[] = [];
  const blockEnds: number[] = [];
  let cursor = 0;

  const bodyPairs = allPairs.filter((p) => p.id !== 'TITLE');
  for (const pair of allPairs) {
    if (pair.id === 'TITLE') {
      if (updateMap.has('TITLE')) {
        titleTranslated = updateMap.get('TITLE')!.replace(/\r?\n/g, ' ').trim();
      } else if (pair.translation) {
        titleTranslated = pair.translation;
      }
    }
  }

  bodyPairs.forEach((pair, idx) => {
    const finalTr = updateMap.has(pair.id)
      ? updateMap.get(pair.id)!
      : pair.translation || '';
    bodyBlocks.push(finalTr);
    const slotLen = finalTr.length || 1;
    cursor += slotLen;
    blockEnds.push(cursor);
    if (idx < bodyPairs.length - 1) {
      cursor += 2;
    }
  });

  const rawCount = bodyPairs.filter((p) => p.source.length > 0).length;
  const nonEmptyTranslatedCount = bodyBlocks.filter(
    (b) => b.replace(/\u200B/g, '').trim().length > 0
  ).length;
  return {
    titleTranslated,
    translatedContent: serializeBodyBlocksToContent(bodyBlocks),
    alignment: {
      version: 1,
      rawBlockCount: rawCount,
      translatedBlockCount: nonEmptyTranslatedCount,
      isAligned:
        rawCount === bodyBlocks.length && nonEmptyTranslatedCount === rawCount,
      blockEnds,
    },
  };
}

/**
 * Extract all normalized Chinese surface forms for a GlossaryEntry:
 * - Supports inline pipe/slash separation in `sourceTerm` (e.g., "青云宗 | 青雲宗" or "韩立 | 韩老魔")
 * - Merges with `entry.aliases` array
 * - Applies Unicode NFC normalization (ISO/TBX best practice for CJK text)
 */
export function getEntrySourceForms(entry: Pick<GlossaryEntry, 'sourceTerm' | 'aliases'>): string[] {
  const rawPrimary = (entry.sourceTerm || '').normalize('NFC').trim();
  const inlineParts = rawPrimary
    .split(/[|／/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const aliasParts = Array.isArray(entry.aliases)
    ? entry.aliases
        .map((a) => String(a || '').normalize('NFC').trim())
        .filter(Boolean)
    : [];
  const all = Array.from(new Set([...inlineParts, ...aliasParts]));
  all.sort((a, b) => b.length - a.length);
  return all;
}

/**
 * Temporal Terminology check: returns true if the entry is valid at `chapterNumber`.
 */
export function isEntryValidForChapter(
  entry: Pick<GlossaryEntry, 'chapterFrom' | 'chapterTo'>,
  chapterNumber?: number
): boolean {
  if (chapterNumber === undefined || chapterNumber === null || Number.isNaN(chapterNumber)) {
    return true;
  }
  if (
    typeof entry.chapterFrom === 'number' &&
    entry.chapterFrom > 0 &&
    chapterNumber < entry.chapterFrom
  ) {
    return false;
  }
  if (
    typeof entry.chapterTo === 'number' &&
    entry.chapterTo > 0 &&
    chapterNumber > entry.chapterTo
  ) {
    return false;
  }
  return true;
}

/**
 * Local 0.5ms Context-Aware Glossary Filter (Term Matcher & Rule Engine):
 * Given a novel's full Glossary (even 1,000+ entries), current chapter's Chinese/Vietnamese text,
 * and optional chapterNumber:
 * 1. Normalizes text in Unicode NFC.
 * 2. Filters by Temporal Terminology (`chapterFrom` <= chapterNumber <= `chapterTo`).
 * 3. Matches 100% of enabled entries whose `sourceTerm` or any `aliases` appear in the chapter,
 *    plus any entries marked `pinned: true`.
 * 4. Sorts by Longest-Match First (`天道宗主` > `天道宗` > `天道`) and Policy priority (`force` > `keep_source` > `prefer` > `contextual`).
 */
export function filterContextualGlossary(
  glossary: GlossaryEntry[],
  rawText: string,
  translatedText = '',
  chapterNumber?: number
): {
  matchedEntries: GlossaryEntry[];
  matchedInTextIds: Set<string>;
  matchedInTextCount: number;
  pinnedCount: number;
  totalEnabledCount: number;
} {
  const matchedInTextIds = new Set<string>();
  if (!Array.isArray(glossary) || glossary.length === 0) {
    return {
      matchedEntries: [],
      matchedInTextIds,
      matchedInTextCount: 0,
      pinnedCount: 0,
      totalEnabledCount: 0,
    };
  }

  const enabledList = glossary.filter(
    (g) =>
      g.enabled !== false &&
      g.sourceTerm?.trim() &&
      g.targetTerm?.trim() &&
      isEntryValidForChapter(g, chapterNumber)
  );

  const cleanRaw = (rawText || '').normalize('NFC').trim();
  const cleanTranslatedLower = (translatedText || '')
    .normalize('NFC')
    .trim()
    .toLowerCase();

  const matchedEntries: GlossaryEntry[] = [];
  let matchedInTextCount = 0;
  let pinnedCount = 0;

  for (const entry of enabledList) {
    const forms = getEntrySourceForms(entry);
    const tgtLower = entry.targetTerm.normalize('NFC').trim().toLowerCase();

    const inRaw = Boolean(
      cleanRaw && forms.some((f) => f && cleanRaw.includes(f))
    );
    const inTranslated = Boolean(
      cleanTranslatedLower &&
        (forms.some((f) => f && cleanTranslatedLower.includes(f.toLowerCase())) ||
          (tgtLower.length >= 2 && cleanTranslatedLower.includes(tgtLower)))
    );

    if (inRaw || inTranslated) {
      matchedInTextIds.add(entry.id);
      matchedInTextCount++;
      matchedEntries.push(entry);
    } else if (entry.pinned) {
      pinnedCount++;
      matchedEntries.push(entry);
    }
  }

  // Fallback: if no specific term matched in text and nothing was pinned, take up to 150 enabled entries
  if (matchedEntries.length === 0 && enabledList.length > 0 && !cleanRaw) {
    return {
      matchedEntries: enabledList.slice(0, 150),
      matchedInTextIds,
      matchedInTextCount: 0,
      pinnedCount: 0,
      totalEnabledCount: enabledList.length,
    };
  }

  const policyWeight = (p?: GlossaryEntry['policy']) => {
    if (!p || p === 'force') return 4;
    if (p === 'keep_source') return 3;
    if (p === 'prefer') return 2;
    return 1;
  };

  // Sort Longest-Match first so compound terms ("天道宗主") precede substrings ("天道宗", "天道"), then by policy weight
  matchedEntries.sort((a, b) => {
    const aMaxLen = Math.max(
      ...getEntrySourceForms(a).map((s) => s.length),
      a.sourceTerm.trim().length
    );
    const bMaxLen = Math.max(
      ...getEntrySourceForms(b).map((s) => s.length),
      b.sourceTerm.trim().length
    );
    if (bMaxLen !== aMaxLen) return bMaxLen - aMaxLen;
    return policyWeight(b.policy) - policyWeight(a.policy);
  });

  return {
    matchedEntries,
    matchedInTextIds,
    matchedInTextCount,
    pinnedCount,
    totalEnabledCount: enabledList.length,
  };
}

function formatEntryRuleLine(g: GlossaryEntry, isCharacterGroup: boolean): string {
  const forms = getEntrySourceForms(g);
  const canonical = forms[0] || g.sourceTerm.trim();
  const extraAliases = forms.slice(1);
  const aliasNote =
    extraAliases.length > 0 ? ` (Biến thể/Biệt danh: ${extraAliases.join(', ')})` : '';

  const policy = g.policy || 'force';
  const policyTag =
    policy === 'keep_source'
      ? ' [GIỮ NGUYÊN GỐC]'
      : policy === 'contextual'
        ? ' [TÙY NGỮ CẢNH]'
        : policy === 'prefer'
          ? ' [ƯU TIÊN]'
          : '';

  const forbiddenList = Array.isArray(g.forbiddenTranslations)
    ? g.forbiddenTranslations.map((f) => f.trim()).filter(Boolean)
    : [];
  const forbiddenTag =
    forbiddenList.length > 0
      ? ` [TUYỆT ĐỐI CẤM DỊCH LÀ: ${forbiddenList.join(', ')}]`
      : '';

  const temporalTag =
    g.chapterFrom || g.chapterTo
      ? ` [Hiệu lực Ch.${g.chapterFrom || 1}–${g.chapterTo || '∞'}]`
      : '';

  const targetDisplay =
    policy === 'keep_source' ? canonical : g.targetTerm.trim();

  if (isCharacterGroup) {
    return `- "${canonical}"${aliasNote} => "${targetDisplay}"${policyTag}${
      g.notes?.trim() ? ` [Vai vế / Xưng hô: ${g.notes.trim()}]` : ''
    }${forbiddenTag}${temporalTag}`;
  }

  return `- "${canonical}"${aliasNote} => "${targetDisplay}"${policyTag}${
    g.notes?.trim() ? ` (${g.notes.trim()})` : ''
  }${forbiddenTag}${temporalTag}`;
}

/**
 * Formats contextually matched Glossary entries into two structured prompt sections
 * (Character & Pronoun Matrix + Terminology Codex) when `includeGlossary === true`.
 */
export function buildContextualGlossaryPromptSection(
  glossary: GlossaryEntry[],
  rawText: string,
  translatedText = '',
  chapterNumber?: number
): {
  promptSection: string;
  matchedCount: number;
  totalEnabledCount: number;
} {
  const { matchedEntries, totalEnabledCount } = filterContextualGlossary(
    glossary,
    rawText,
    translatedText,
    chapterNumber
  );

  if (matchedEntries.length === 0) {
    return {
      promptSection: '',
      matchedCount: 0,
      totalEnabledCount,
    };
  }

  const characterAndPronounEntries = matchedEntries.filter(
    (g) =>
      g.category === 'character' ||
      g.category === 'pronoun' ||
      g.category === 'title'
  );
  const worldAndTermEntries = matchedEntries.filter(
    (g) =>
      g.category !== 'character' &&
      g.category !== 'pronoun' &&
      g.category !== 'title'
  );

  const sections: string[] = [];

  if (characterAndPronounEntries.length > 0) {
    const charLines = characterAndPronounEntries
      .map((g) => formatEntryRuleLine(g, true))
      .join('\n');
    sections.push(
      `[MA TRẬN NHÂN VẬT, DANH HIỆU & XƯNG HÔ TRONG CHƯƠNG — BẮT BUỘC TUÂN THỦ 100% (Ưu tiên từ ghép dài hơn trước)]:\n${charLines}`
    );
  }

  if (worldAndTermEntries.length > 0) {
    const termLines = worldAndTermEntries
      .map((g) => formatEntryRuleLine(g, false))
      .join('\n');
    sections.push(
      `[TỪ ĐIỂN THUẬT NGỮ, ĐỊA DANH, CẢNH GIỚI & CÔNG PHÁP TRONG CHƯƠNG — BẮT BUỘC NHẤT QUÁN]:\n${termLines}`
    );
  }

  return {
    promptSection: `\n\n${sections.join('\n\n')}`,
    matchedCount: matchedEntries.length,
    totalEnabledCount,
  };
}

