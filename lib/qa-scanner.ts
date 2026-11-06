import {
  Chapter,
  GlossaryEntry,
  QAIssue,
  QAReport,
  QAValidationRules,
} from './types';

export const DEFAULT_QA_VALIDATION_RULES: QAValidationRules = {
  minLengthRatio: 0.35,
  maxLengthRatio: 5.0,
  maxHanCharacters: 0,
  repeatedParagraphThreshold: 3,
  checkAbruptEnding: false,
};

/**
 * Valid unaccented Vietnamese words (thanh ngang) that share ASCII spelling with English words
 * (e.g. "in" in "giấy in", "then" in "cài then", "than" in "than thở", "the" in "áo the",
 * "to" in "to lớn", "do" in "tự do", "so" in "so sánh", "no" in "ăn no", "an" in "bình an",
 * "my" in "họa my", "la/ma/ba/ca/da/ga/ha/na/ra/sa/ta/va/xa", "can/man/ban/tan/van/lan/dan/gan/han/san",
 * "men/len/sen/ken/khen/ghen/chen/phen/ven/xen/den/ben/hen/nen/ren/ten", "tin/xin/pin",
 * "con/son/non/lon/mon/ton/bon/don", "long/song/trong/dong/cong/bong/hong/mong/nong/phong/rong/thong/vong/xong",
 * "hang/sang/mang/vang/lang/bang/nang/tang/trang", "nhung/chung/cung/dung/sung/tung/hung/vung/bung/lung/trung/xung",
 * "anh/nhanh/xanh/lanh/canh/danh/thanh/tranh/quanh", "minh/linh/kinh/tinh/binh/dinh/sinh/hinh/vinh/chinh/khinh/thinh/ninh/xinh",
 * "em/nem/xem/lem/tem/hem/kem/mem/rem/them", "tim/im/kim/lim/phim/chim/sim/ghim",
 * "tu/lu/ngu/khu/thu/chu/du/phu/su/vu/xu/ru/bu/mu/nu/cu/gu/hu",
 * "bay/cay/gay/hay/lay/may/nay/say/tay/vay/xay/thay/chay/quay",
 * "ai/tai/vai/sai/hai/mai/nai/lai/gai/khai/thai/trai/nhai/chai/phai",
 * "ao/bao/cao/dao/giao/hao/khao/lao/mao/nao/sao/tao/thao/trao/vao/xao",
 * "au/bau/cau/dau/lau/mau/nau/rau/sau/tau/thau/trau").
 * These words have legitimate meanings in Vietnamese and must NEVER be flagged as English leaks by default.
 */
export const VIETNAMESE_HOMOGRAPH_WORDS = new Set<string>([
  'in',
  'then',
  'than',
  'the',
  'them',
  'an',
  'on',
  'to',
  'do',
  'so',
  'no',
  'be',
  'me',
  'he',
  'we',
  'hi',
  'my',
  'by',
  'la',
  'ma',
  'ba',
  'ca',
  'da',
  'ga',
  'ha',
  'na',
  'pa',
  'ra',
  'sa',
  'ta',
  'va',
  'xa',
  'am',
  'em',
  'im',
  'om',
  'um',
  'ai',
  'oi',
  'ui',
  'ao',
  'eo',
  'au',
  'eu',
  'iu',
  'uu',
  'ay',
  'uy',
  'can',
  'man',
  'ban',
  'tan',
  'van',
  'lan',
  'dan',
  'gan',
  'han',
  'san',
  'pan',
  'fan',
  'men',
  'len',
  'sen',
  'ken',
  'khen',
  'ghen',
  'chen',
  'phen',
  'ven',
  'xen',
  'den',
  'ben',
  'hen',
  'nen',
  'ren',
  'ten',
  'tin',
  'xin',
  'pin',
  'min',
  'nin',
  'rin',
  'vin',
  'con',
  'son',
  'non',
  'lon',
  'mon',
  'ton',
  'bon',
  'don',
  'gon',
  'hon',
  'von',
  'chon',
  'ngon',
  'thon',
  'tron',
  'xon',
  'un',
  'bun',
  'cun',
  'dun',
  'gun',
  'hun',
  'lun',
  'mun',
  'nun',
  'pun',
  'run',
  'sun',
  'tun',
  'vun',
  'xun',
  'long',
  'song',
  'trong',
  'dong',
  'cong',
  'bong',
  'gong',
  'hong',
  'mong',
  'nong',
  'phong',
  'rong',
  'thong',
  'vong',
  'xong',
  'ong',
  'hang',
  'sang',
  'mang',
  'vang',
  'lang',
  'bang',
  'nang',
  'tang',
  'trang',
  'khang',
  'ngang',
  'quang',
  'hoang',
  'loang',
  'toang',
  'khoang',
  'dang',
  'gang',
  'phang',
  'rang',
  'thang',
  'xang',
  'chang',
  'giang',
  'ang',
  'nhung',
  'chung',
  'cung',
  'dung',
  'sung',
  'tung',
  'hung',
  'vung',
  'bung',
  'lung',
  'khung',
  'trung',
  'phung',
  'xung',
  'ung',
  'ngung',
  'rung',
  'thung',
  'anh',
  'nhanh',
  'xanh',
  'lanh',
  'canh',
  'danh',
  'thanh',
  'tranh',
  'quanh',
  'oanh',
  'doanh',
  'khoanh',
  'banh',
  'chanh',
  'ganh',
  'hanh',
  'manh',
  'nanh',
  'phanh',
  'ranh',
  'sanh',
  'tanh',
  'vanh',
  'minh',
  'linh',
  'kinh',
  'tinh',
  'binh',
  'dinh',
  'sinh',
  'hinh',
  'vinh',
  'chinh',
  'khinh',
  'thinh',
  'ninh',
  'rinh',
  'xinh',
  'inh',
  'nem',
  'xem',
  'lem',
  'tem',
  'hem',
  'kem',
  'mem',
  'rem',
  'tim',
  'kim',
  'lim',
  'phim',
  'chim',
  'sim',
  'ghim',
  'dim',
  'mim',
  'nim',
  'rim',
  'dam',
  'cam',
  'gam',
  'ham',
  'lam',
  'nam',
  'ram',
  'sam',
  'tam',
  'tham',
  'giam',
  'nham',
  'kham',
  'tram',
  'xam',
  'bom',
  'com',
  'dom',
  'gom',
  'hom',
  'lom',
  'mom',
  'nom',
  'rom',
  'som',
  'tom',
  'vom',
  'xom',
  'tu',
  'lu',
  'ngu',
  'khu',
  'thu',
  'chu',
  'du',
  'phu',
  'su',
  'vu',
  'xu',
  'ru',
  'bu',
  'mu',
  'nu',
  'cu',
  'gu',
  'hu',
  'bay',
  'cay',
  'gay',
  'hay',
  'lay',
  'may',
  'nay',
  'say',
  'tay',
  'vay',
  'xay',
  'thay',
  'chay',
  'quay',
  'tai',
  'vai',
  'sai',
  'hai',
  'mai',
  'nai',
  'lai',
  'gai',
  'khai',
  'thai',
  'trai',
  'nhai',
  'chai',
  'phai',
  'bao',
  'cao',
  'dao',
  'giao',
  'hao',
  'khao',
  'lao',
  'mao',
  'nao',
  'sao',
  'tao',
  'thao',
  'trao',
  'vao',
  'xao',
  'bau',
  'cau',
  'dau',
  'lau',
  'mau',
  'nau',
  'rau',
  'sau',
  'tau',
  'thau',
  'trau',
  'keo',
  'leo',
  'meo',
  'neo',
  'ngheo',
  'nheo',
  'pheo',
  'reo',
  'seo',
  'teo',
  'theo',
  'treo',
  'veo',
  'xeo',
  'keu',
  'leu',
  'meu',
  'neu',
  'reu',
  'seu',
  'teu',
  'theu',
  'treu',
  'veu',
  'xeu',
  'chia',
  'lia',
  'mia',
  'nia',
  'ria',
  'tia',
  'via',
  'xia',
  'kia',
  'bia',
  'dia',
  'dua',
  'cua',
  'mua',
  'nua',
  'sua',
  'thua',
  'trua',
  'vua',
  'xua',
  'chua',
  'khua',
  'nhua',
  'phua',
  'rua',
  'tua',
  'bo',
  'co',
  'cho',
  'go',
  'ho',
  'kho',
  'lo',
  'mo',
  'nho',
  'pho',
  'ro',
  'tho',
  'tro',
  'vo',
  'xo',
  'bi',
  'chi',
  'di',
  'ghi',
  'gi',
  'khi',
  'li',
  'mi',
  'nghi',
  'nhi',
  'phi',
  'ri',
  'si',
  'thi',
  'ti',
  'tri',
  'vi',
  'xi',
  'hy',
  'ky',
  'ly',
  'ny',
  'quy',
  'sy',
  'thy',
  'ty',
  'vy',
  'xy',
]);

/**
 * Pure English words that DO NOT exist and have NO meaning in Vietnamese.
 * Words that have valid Vietnamese meanings (such as "in", "then", "than", "the", "to", "do", "so", "no", "an", "my"...)
 * are strictly excluded from this list.
 */
export const DEFAULT_ENGLISH_GLITCH_WORDS = [
  'but',
  'and',
  'or',
  'nor',
  'for',
  'yet',
  'with',
  'from',
  'that',
  'this',
  'these',
  'those',
  'have',
  'has',
  'had',
  'having',
  'which',
  'what',
  'when',
  'where',
  'while',
  'whom',
  'whose',
  'whether',
  'whereas',
  'whereby',
  'their',
  'there',
  'they',
  'would',
  'could',
  'should',
  'might',
  'must',
  'shall',
  'will',
  'about',
  'above',
  'across',
  'after',
  'against',
  'along',
  'among',
  'around',
  'before',
  'behind',
  'below',
  'beneath',
  'beside',
  'besides',
  'between',
  'beyond',
  'despite',
  'down',
  'during',
  'except',
  'inside',
  'into',
  'onto',
  'outside',
  'over',
  'through',
  'throughout',
  'toward',
  'towards',
  'under',
  'underneath',
  'until',
  'upon',
  'within',
  'without',
  'however',
  'suddenly',
  'meanwhile',
  'moreover',
  'therefore',
  'furthermore',
  'nevertheless',
  'nonetheless',
  'although',
  'though',
  'because',
  'unless',
  'since',
  'always',
  'never',
  'often',
  'sometimes',
  'usually',
  'perhaps',
  'maybe',
  'probably',
  'possibly',
  'actually',
  'really',
  'very',
  'quite',
  'rather',
  'almost',
  'already',
  'enough',
  'still',
  'even',
  'only',
  'just',
  'also',
  'both',
  'either',
  'neither',
  'each',
  'every',
  'other',
  'another',
  'such',
  'much',
  'many',
  'most',
  'more',
  'some',
  'something',
  'anything',
  'nothing',
  'everything',
  'someone',
  'anyone',
  'everyone',
  'nobody',
  'somebody',
  'anybody',
  'himself',
  'herself',
  'itself',
  'themselves',
  'myself',
  'yourself',
  'ourselves',
  'your',
  'yours',
  'make',
  'like',
  'time',
  'know',
  'take',
  'people',
  'good',
  'look',
  'come',
  'think',
  'back',
  'first',
  'well',
  'want',
  'give',
];

const CJK_REGEX = /[\u4E00-\u9FFF\u3400-\u4DBF]+/g;
const AI_REFUSAL_OR_INTRO_REGEX =
  /^(?:tôi không thể|xin lỗi|dưới đây là bản dịch|bản dịch như sau|here is the translation)/i;
const TERMINAL_PUNCTUATION_REGEX =
  /[.!?…？！。:;”"’')）\]】》〉—~-]$/u;

export function buildEnglishLeakRegex(customWords: string[] = []): RegExp {
  const safeDefaults = DEFAULT_ENGLISH_GLITCH_WORDS.filter(
    (w) => !VIETNAMESE_HOMOGRAPH_WORDS.has(w.toLowerCase())
  );
  const safeCustom = customWords
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 2 && !VIETNAMESE_HOMOGRAPH_WORDS.has(w));
  const allWords = Array.from(new Set([...safeDefaults, ...safeCustom]));
  const escaped = allWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(
    `(?<![\\p{L}\\p{N}_])(${escaped.join('|')})(?![\\p{L}\\p{N}_])`,
    'giu'
  );
}

export function findEnglishLeaksInText(
  text: string,
  customWords: string[] = []
): string[] {
  if (!text || !text.trim()) return [];
  const regex = buildEnglishLeakRegex(customWords);
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m[0]) {
      found.push(m[0]);
    }
  }
  return Array.from(new Set(found));
}

function countRawBlocks(rawContent: string): number {
  const normalized = (rawContent || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return 0;
  const hasBlankLines = /\n\s*\n/.test(normalized);
  return hasBlankLines
    ? normalized
        .split(/\n\s*\n+/)
        .map((p) => p.trim())
        .filter(Boolean).length
    : normalized
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean).length;
}

function countTranslatedBlocks(
  translatedContent: string,
  expectedRawCount: number
): number {
  const normalized = (translatedContent || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return 0;
  const byBlankLines = normalized
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const bySingleLines = normalized
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);

  if (byBlankLines.length === expectedRawCount) return byBlankLines.length;
  if (bySingleLines.length === expectedRawCount) return bySingleLines.length;
  const diffBlank = Math.abs(byBlankLines.length - expectedRawCount);
  const diffSingle = Math.abs(bySingleLines.length - expectedRawCount);
  return diffBlank <= diffSingle ? byBlankLines.length : bySingleLines.length;
}

export function scanChapterQA(
  chapter: Pick<
    Chapter,
    | 'titleRaw'
    | 'titleTranslated'
    | 'rawContent'
    | 'translatedContent'
    | 'status'
    | 'alignment'
  > & { chapterNumber?: number },
  customBannedWords: string[] = [],
  rules: QAValidationRules = DEFAULT_QA_VALIDATION_RULES,
  glossary: GlossaryEntry[] = []
): QAReport {
  const issues: QAIssue[] = [];
  let residualChineseCount = 0;
  let leakedEnglishCount = 0;
  let glossaryViolationCount = 0;

  const isTranslatedOrEdited =
    chapter.status === 'translated' ||
    chapter.status === 'edited' ||
    Boolean(chapter.translatedContent && chapter.translatedContent.trim().length > 0);

  if (!isTranslatedOrEdited) {
    return {
      hasIssues: false,
      residualChineseCount: 0,
      leakedEnglishCount: 0,
      untranslatedTitle: false,
      blockMismatch: false,
      rawBlockCount: countRawBlocks(chapter.rawContent || ''),
      translatedBlockCount: 0,
      lengthRatio: 0,
      lengthRatioAbnormal: false,
      repeatedParagraphCount: 0,
      abruptEnding: false,
      codeFenceFound: false,
      glossaryViolationCount: 0,
      issues: [],
      scannedAt: Date.now(),
    };
  }

  const titleTrimmed = (chapter.titleTranslated || '').trim();
  const titleHasChinese = CJK_REGEX.test(titleTrimmed);
  CJK_REGEX.lastIndex = 0;

  const untranslatedTitle =
    !titleTrimmed ||
    titleTrimmed === (chapter.titleRaw || '').trim() ||
    titleHasChinese;

  if (untranslatedTitle) {
    issues.push({
      id: 'qa-title-untranslated',
      type: 'untranslated_title',
      match: titleTrimmed || '(Trống)',
      lineIndex: -1,
      blockId: 'TITLE',
      contextSnippet: `Tiêu đề chương chưa dịch sạch: "${titleTrimmed || chapter.titleRaw}"`,
    });
  }

  if (titleHasChinese) {
    let m: RegExpExecArray | null;
    CJK_REGEX.lastIndex = 0;
    while ((m = CJK_REGEX.exec(titleTrimmed)) !== null) {
      residualChineseCount += m[0].length;
      issues.push({
        id: `qa-cjk-title-${m.index}`,
        type: 'chinese_residual',
        match: m[0],
        lineIndex: -1,
        blockId: 'TITLE',
        contextSnippet: titleTrimmed,
      });
    }
  }

  const englishRegex = buildEnglishLeakRegex(customBannedWords);
  if (titleTrimmed) {
    let em: RegExpExecArray | null;
    englishRegex.lastIndex = 0;
    while ((em = englishRegex.exec(titleTrimmed)) !== null) {
      leakedEnglishCount++;
      issues.push({
        id: `qa-eng-title-${em.index}`,
        type: 'english_leak',
        match: em[0],
        lineIndex: -1,
        blockId: 'TITLE',
        contextSnippet: titleTrimmed,
      });
    }
  }

  const translatedBody = (chapter.translatedContent || '').trim();
  const rawBody = (chapter.rawContent || '').trim();

  // Check Block / Paragraph Count Alignment
  const rawBlockCount =
    chapter.alignment?.rawBlockCount ?? countRawBlocks(rawBody);
  const translatedBlockCount =
    chapter.alignment?.translatedBlockCount ??
    countTranslatedBlocks(translatedBody, rawBlockCount);
  const blockMismatch =
    rawBlockCount > 0 && rawBlockCount !== translatedBlockCount;

  if (blockMismatch) {
    issues.push({
      id: 'qa-block-mismatch',
      type: 'block_mismatch',
      match: `${translatedBlockCount}/${rawBlockCount} đoạn`,
      lineIndex: -1,
      contextSnippet: `Lệch số đoạn văn so với nguyên tác: Bản dịch có ${translatedBlockCount} đoạn, bản gốc có ${rawBlockCount} đoạn.`,
    });
  }

  // Check Length Ratio
  const rawLen = Math.max(1, rawBody.replace(/\s+/g, '').length);
  const viLen = translatedBody.length;
  const lengthRatio = Number((viLen / rawLen).toFixed(2));
  const lengthRatioAbnormal =
    rawBody.length > 100 &&
    (lengthRatio < rules.minLengthRatio || lengthRatio > rules.maxLengthRatio);

  if (lengthRatioAbnormal) {
    issues.push({
      id: 'qa-length-ratio',
      type: 'length_ratio',
      match: `Tỷ lệ ${lengthRatio}x`,
      lineIndex: -1,
      contextSnippet: `Tỷ lệ độ dài bản dịch/nguyên tác bất thường (${lengthRatio}x, ngưỡng chuẩn ${rules.minLengthRatio}x – ${rules.maxLengthRatio}x).`,
    });
  }

  // Check Markdown Code Fence
  let codeFenceFound = false;
  if (translatedBody.includes('```')) {
    codeFenceFound = true;
    issues.push({
      id: 'qa-code-fence',
      type: 'code_fence',
      match: '```',
      lineIndex: -1,
      contextSnippet: 'Phát hiện dấu Markdown code fence (```) lẫn trong bản dịch.',
    });
  }

  const paragraphs = translatedBody
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const normalizedParagraphFreq = new Map<string, number>();
  let repeatedParagraphCount = 0;

  paragraphs.forEach((trimmed, lineIdx) => {
    const blockId = `P${String(lineIdx + 1).padStart(4, '0')}`;

    // Check AI refusal / intro leak on first lines
    if (lineIdx < 2 && AI_REFUSAL_OR_INTRO_REGEX.test(trimmed)) {
      codeFenceFound = true;
      issues.push({
        id: `qa-ai-intro-${lineIdx}`,
        type: 'code_fence',
        match: trimmed.slice(0, 32),
        lineIndex: lineIdx,
        blockId,
        contextSnippet: `Phát hiện lời dẫn/từ chối của AI: "${trimmed.slice(0, 80)}"`,
      });
    }

    // Track repeated long paragraphs (> 80 chars)
    if (trimmed.length > 80) {
      const key = trimmed.replace(/\s+/g, ' ').toLowerCase();
      const nextCount = (normalizedParagraphFreq.get(key) || 0) + 1;
      normalizedParagraphFreq.set(key, nextCount);
      if (nextCount === rules.repeatedParagraphThreshold) {
        repeatedParagraphCount++;
        issues.push({
          id: `qa-repeat-${lineIdx}`,
          type: 'repeated_paragraph',
          match: `Lặp ${nextCount} lần`,
          lineIndex: lineIdx,
          blockId,
          contextSnippet: `Đoạn văn dài bị lặp lại >= ${rules.repeatedParagraphThreshold} lần: "${trimmed.slice(0, 75)}..."`,
        });
      }
    }

    // 1. Check residual Chinese characters
    CJK_REGEX.lastIndex = 0;
    let cm: RegExpExecArray | null;
    while ((cm = CJK_REGEX.exec(trimmed)) !== null) {
      residualChineseCount += cm[0].length;
      const start = Math.max(0, cm.index - 28);
      const end = Math.min(trimmed.length, cm.index + cm[0].length + 28);
      issues.push({
        id: `qa-cjk-${lineIdx}-${cm.index}`,
        type: 'chinese_residual',
        match: cm[0],
        lineIndex: lineIdx,
        blockId,
        contextSnippet:
          (start > 0 ? '...' : '') +
          trimmed.slice(start, end) +
          (end < trimmed.length ? '...' : ''),
      });
    }

    // 2. Check leaked English words (only words that have NO meaning in Vietnamese: "but", "and", "or", "with", "however"...)
    englishRegex.lastIndex = 0;
    let em: RegExpExecArray | null;
    while ((em = englishRegex.exec(trimmed)) !== null) {
      leakedEnglishCount++;
      const start = Math.max(0, em.index - 28);
      const end = Math.min(trimmed.length, em.index + em[0].length + 28);
      issues.push({
        id: `qa-eng-${lineIdx}-${em.index}`,
        type: 'english_leak',
        match: em[0],
        lineIndex: lineIdx,
        blockId,
        contextSnippet:
          (start > 0 ? '...' : '') +
          trimmed.slice(start, end) +
          (end < trimmed.length ? '...' : ''),
      });
    }
  });

  // Check Abrupt Ending (if enabled in rules)
  let abruptEnding = false;
  if (rules.checkAbruptEnding && translatedBody.length > 120 && paragraphs.length > 0) {
    const lastPara = paragraphs[paragraphs.length - 1];
    if (!TERMINAL_PUNCTUATION_REGEX.test(lastPara)) {
      abruptEnding = true;
      issues.push({
        id: 'qa-abrupt-ending',
        type: 'abrupt_ending',
        match: lastPara.slice(-20),
        lineIndex: paragraphs.length - 1,
        blockId: `P${String(paragraphs.length).padStart(4, '0')}`,
        contextSnippet: `Chương kết thúc giữa chừng không có dấu chấm câu: "...${lastPara.slice(-60)}"`,
      });
    }
  }

  // Soft Translation Validator (Glossary Policy & Forbidden Translations Check)
  if (Array.isArray(glossary) && glossary.length > 0 && rawBody.length > 0) {
    const fullRawNfc = `${chapter.titleRaw || ''}\n${rawBody}`.normalize('NFC');
    const fullViLower = `${titleTrimmed}\n${translatedBody}`
      .normalize('NFC')
      .toLowerCase();
    const chNum = chapter.chapterNumber;

    for (const entry of glossary) {
      if (entry.enabled === false || entry.status === 'draft') continue;
      if (
        chNum !== undefined &&
        ((entry.chapterFrom && chNum < entry.chapterFrom) ||
          (entry.chapterTo && chNum > entry.chapterTo))
      ) {
        continue;
      }

      const forms = [
        ...entry.sourceTerm.split(/[|／/]/).map((s) => s.normalize('NFC').trim()),
        ...(entry.aliases || []).map((a) => String(a || '').normalize('NFC').trim()),
      ].filter(Boolean);
      if (forms.length === 0) continue;

      let rawOccurrences = 0;
      for (const form of forms) {
        let pos = 0;
        while ((pos = fullRawNfc.indexOf(form, pos)) !== -1) {
          rawOccurrences++;
          pos += form.length;
        }
      }

      if (rawOccurrences === 0) continue;

      // 1. Check Forbidden Translations
      const forbiddenList = (entry.forbiddenTranslations || [])
        .map((f) => f.normalize('NFC').trim())
        .filter((f) => f.length >= 2);

      for (const bad of forbiddenList) {
        if (fullViLower.includes(bad.toLowerCase())) {
          glossaryViolationCount++;
          const badLineIdx = paragraphs.findIndex((p) =>
            p.toLowerCase().includes(bad.toLowerCase())
          );
          issues.push({
            id: `qa-gl-forbidden-${entry.id}-${bad}`,
            type: 'glossary_violation',
            match: bad,
            lineIndex: badLineIdx,
            blockId:
              badLineIdx >= 0
                ? `P${String(badLineIdx + 1).padStart(4, '0')}`
                : 'TITLE',
            contextSnippet: `Dùng bản dịch cấm kỵ "${bad}" cho "${forms[0]}" (Bắt buộc dịch là: "${entry.targetTerm}").`,
          });
        }
      }

      // 2. Soft Check for Forced Proper Nouns (appears >= 2 times in raw, 0 times in translation)
      const policy = entry.policy || 'force';
      const isCoreProperNoun =
        entry.category === 'character' ||
        entry.category === 'location' ||
        entry.category === 'organization' ||
        entry.category === 'cultivation' ||
        entry.category === 'skill';

      if (policy === 'force' && isCoreProperNoun && rawOccurrences >= 2) {
        const allowedTargets = entry.targetTerm
          .split(/[|／/]/)
          .map((t) => t.normalize('NFC').trim().toLowerCase())
          .filter((t) => t.length >= 2);

        if (
          allowedTargets.length > 0 &&
          !allowedTargets.some((t) => fullViLower.includes(t))
        ) {
          glossaryViolationCount++;
          issues.push({
            id: `qa-gl-missing-${entry.id}`,
            type: 'glossary_violation',
            match: `${forms[0]} ≠ ${entry.targetTerm}`,
            lineIndex: -1,
            contextSnippet: `Thuật ngữ cố định "${forms[0]} => ${entry.targetTerm}" xuất hiện ${rawOccurrences} lần trong bản gốc nhưng vắng mặt trong bản dịch.`,
          });
        }
      }
    }
  }

  const effectiveHanExceeded = residualChineseCount > rules.maxHanCharacters;
  const filteredIssues = effectiveHanExceeded
    ? issues
    : issues.filter((i) => i.type !== 'chinese_residual');

  return {
    hasIssues:
      effectiveHanExceeded ||
      leakedEnglishCount > 0 ||
      untranslatedTitle ||
      blockMismatch ||
      lengthRatioAbnormal ||
      repeatedParagraphCount > 0 ||
      abruptEnding ||
      codeFenceFound ||
      glossaryViolationCount > 0,
    residualChineseCount,
    leakedEnglishCount,
    untranslatedTitle,
    blockMismatch,
    rawBlockCount,
    translatedBlockCount,
    lengthRatio,
    lengthRatioAbnormal,
    repeatedParagraphCount,
    abruptEnding,
    codeFenceFound,
    glossaryViolationCount,
    issues: filteredIssues,
    scannedAt: Date.now(),
  };
}
