import { NextRequest, NextResponse } from 'next/server';
import {
  buildInteractionGenerationConfig,
  extractInteractionText,
  geminiKeyPool,
  normalizeThinkingLevel,
  safeParseInteractionJson,
  withHeartbeatStream,
} from '@/lib/gemini-server';
import {
  createRequestId,
  KeyAttemptTrace,
  logger,
  ServerDebugTrace,
} from '@/lib/logger';
import { GlossaryEntry } from '@/lib/types';
import {
  buildContextualGlossaryPromptSection,
  materializeBlocksToChapter,
  splitRawIntoBlocks,
} from '@/lib/block-engine';
import { normalizeVietnameseText } from '@/lib/storage';

const DEFAULT_TRANSLATION_SYSTEM_PROMPT = `Bạn là Dịch Giả Tiểu Thuyết Trung Quốc (Hán Việt / Tiên Hiệp / Huyền Huyễn / Ngôn Tình / Đô Thị) chuyên nghiệp hàng đầu.
Nhiệm vụ của bạn là dịch trọn vẹn từng Block ID của chương truyện tiếng Trung sang tiếng Việt mượt mà, giàu hình ảnh văn học, đúng ngữ cảnh và xưng hô.

QUY TẮC BẮT BUỘC (STRUCTURED BLOCKS-V1):
1. Đầu vào được cung cấp dưới dạng JSON gồm các Block có mã định danh cố định: "TITLE" (tiêu đề chương) và "P0001", "P0002", ... (từng đoạn văn).
2. Bắt buộc trả về đúng chuẩn JSON Schema gồm mảng "blocks", trong đó MỖI phần tử {"id", "translation"} khớp chính xác 1:1 với "id" của đầu vào.
3. KHÔNG ĐƯỢC gộp 2 block làm 1, KHÔNG ĐƯỢC tách 1 block thành 2, KHÔNG ĐƯỢC bỏ sót bất kỳ mã ID nào.
4. Mỗi "translation" là một đoạn văn đơn, KHÔNG chứa ký tự xuống dòng (\\n).
5. TUYỆT ĐỐI KHÔNG để sót bất kỳ chữ Hán (ký tự Trung Quốc) nào trong kết quả tiếng Việt.
6. TUYỆT ĐỐI KHÔNG chêm từ tiếng Anh vô duyên (như "but", "however", "and", "so", "well", "ok"...) vào câu văn tiếng Việt.
7. Tiêu đề chương (block "TITLE") dịch chuẩn định dạng "Chương X: [Tên chương tiếng Việt]".`;

export async function POST(req: NextRequest) {
  return withHeartbeatStream(req, async () => {
    const reqId =
      req.headers.get('x-mhc-request-id') || createRequestId('translate');
    const routeStartMs = Date.now();
    let selectedModel = 'gemini-flash-latest';
    let cleanFallbackModel: string | undefined;
    let resolvedThinkingLevel = normalizeThinkingLevel('high');
    let chapterNumForTrace = 1;
    let expectedBlocksCount = 0;
    let rawCharCount = 0;

    try {
      geminiKeyPool.syncFromRequest(req);
      const body = await req.json();
    const {
      titleRaw = '',
      rawContent = '',
      chapterNumber = 1,
      model,
      fallbackModel,
      thinkingLevel,
      systemInstruction = '',
      includeGlossary = false,
      glossary = [],
    } = body as {
      titleRaw: string;
      rawContent: string;
      chapterNumber?: number;
      model?: string;
      fallbackModel?: string;
      thinkingLevel?: string;
      systemInstruction?: string;
      includeGlossary?: boolean;
      glossary?: GlossaryEntry[];
    };

    chapterNumForTrace = chapterNumber;
    rawCharCount = rawContent.length;
    resolvedThinkingLevel = normalizeThinkingLevel(thinkingLevel);

    if (!rawContent || !rawContent.trim()) {
      logger.warn(
        'TRANSLATE',
        `✖ Từ chối dịch Chương #${chapterNumber}: rawContent trống.`,
        { reqId, chapterNumber },
        reqId
      );
      return NextResponse.json(
        { error: 'Nội dung chương nguyên tác (rawContent) đang trống.' },
        { status: 400 }
      );
    }

    selectedModel =
      typeof model === 'string' && model.trim()
        ? model.trim()
        : 'gemini-flash-latest';

    cleanFallbackModel =
      typeof fallbackModel === 'string' && fallbackModel.trim()
        ? fallbackModel.trim()
        : undefined;

    // Build deterministic 1:1 Block-ID input (TITLE, P0001, P0002...)
    const rawBlocks = splitRawIntoBlocks(titleRaw, rawContent);
    const expectedBlockIds = rawBlocks.map((b) => b.id);
    expectedBlocksCount = expectedBlockIds.length;

    // Optional Dynamic Context-Aware Glossary injection (DEFAULT OFF — only active when user enables includeGlossary)
    let glossarySection = '';
    let matchedGlossaryCount = 0;
    if (includeGlossary && Array.isArray(glossary) && glossary.length > 0) {
      const contextual = buildContextualGlossaryPromptSection(
        glossary,
        `${titleRaw}\n${rawContent}`,
        '',
        chapterNumber
      );
      glossarySection = contextual.promptSection;
      matchedGlossaryCount = contextual.matchedCount;
    }

    logger.info(
      'TRANSLATE',
      `▶ Bắt đầu dịch Chương #${chapterNumber} ("${titleRaw.slice(0, 40)}") — ${rawBlocks.length} blocks, ${rawContent.length} ký tự Hán, Glossary=${includeGlossary ? `BẬT (${matchedGlossaryCount} mục khớp)` : 'TẮT'}, model=${selectedModel}, thinkingLevel=${resolvedThinkingLevel}`,
      {
        reqId,
        chapterNumber,
        titleRaw,
        blockCount: rawBlocks.length,
        rawChars: rawContent.length,
        includeGlossary,
        matchedGlossaryCount,
        selectedModel,
        fallbackModel: cleanFallbackModel,
        thinkingLevel: resolvedThinkingLevel,
      },
      reqId
    );

    const customInstructionSection = systemInstruction.trim()
      ? `\n\n[CHỈ DẪN PHONG CÁCH & XƯNG HÔ RIÊNG CỦA BỘ TRUYỆN]:\n${systemInstruction.trim()}`
      : '';

    const fullSystemPrompt = `${DEFAULT_TRANSLATION_SYSTEM_PROMPT}${customInstructionSection}${glossarySection}`;

    const wireInputJson = JSON.stringify(
      {
        schema: 'blocks-v1',
        chapterNumber,
        expectedBlockCount: rawBlocks.length,
        blocks: rawBlocks.map((b) => ({
          id: b.id,
          source: b.source,
        })),
      },
      null,
      2
    );

    const idPropertySchema: Record<string, unknown> = {
      type: 'string',
      description:
        'Mã định danh block nguyên gốc (TITLE, P0001, P0002...). Phải khớp 1:1 với input.',
    };
    if (expectedBlockIds.length <= 64) {
      idPropertySchema.enum = expectedBlockIds;
    }

    const {
      result: interaction,
      keyIndexUsed,
      totalKeys,
      modelUsed,
      didFallback,
      attempts,
    } = await geminiKeyPool.executeWithKeyRotation(
      async (ai, slotInfo) => {
        return await ai.interactions.create({
          model: slotInfo.activeModel,
          store: false,
          system_instruction: fullSystemPrompt,
          input: wireInputJson,
          generation_config: buildInteractionGenerationConfig(
            resolvedThinkingLevel,
            { temperature: 0.3 }
          ),
          response_format: {
            type: 'object',
            properties: {
              blocks: {
                type: 'array',
                description:
                  'Danh sách đầy đủ các block đã dịch theo đúng thứ tự nguyên văn, bắt đầu bằng TITLE rồi đến P0001, P0002...',
                items: {
                  type: 'object',
                  properties: {
                    id: idPropertySchema,
                    translation: {
                      type: 'string',
                      description:
                        'Bản dịch tiếng Việt mượt mà của block này (1 đoạn duy nhất, không chứa ký tự xuống dòng).',
                    },
                  },
                  required: ['id', 'translation'],
                  additionalProperties: false,
                },
              },
            },
            required: ['blocks'],
            additionalProperties: false,
          },
        });
      },
      selectedModel,
      cleanFallbackModel,
      {
        reqId,
        endpoint: '/api/translate',
        label: `Chapter #${chapterNumber} (${rawBlocks.length} blocks • thinking=${resolvedThinkingLevel})`,
        signal: req.signal,
      }
    );

    const rawText = extractInteractionText(interaction).trim();
    const parsed = safeParseInteractionJson<{
      blocks?: Array<{ id: string; translation: string }>;
    }>(rawText, `TranslateChapter#${chapterNumber}[${reqId}]`);

    const returnedBlocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
    const materialized = materializeBlocksToChapter(
      returnedBlocks,
      rawBlocks,
      chapterNumber
    );

    const routeDurationMs = Date.now() - routeStartMs;
    const debugTrace: ServerDebugTrace = {
      reqId,
      endpoint: '/api/translate',
      startedAt: new Date(routeStartMs).toISOString(),
      totalDurationMs: routeDurationMs,
      requestedModel: selectedModel,
      fallbackModel: cleanFallbackModel,
      modelUsed,
      thinkingLevelUsed: resolvedThinkingLevel,
      didFallback,
      keyIndexUsed,
      totalPoolKeys: totalKeys,
      inputSummary: {
        chapterNumber,
        expectedBlocksCount: rawBlocks.length,
        rawCharCount: rawContent.length,
        includeGlossary,
        matchedGlossaryCount,
        thinkingLevel: resolvedThinkingLevel,
      },
      outputSummary: {
        returnedBlocksCount: returnedBlocks.length,
        translatedCharCount: materialized.translatedContent.length,
      },
      attempts,
    };

    logger.info(
      'TRANSLATE',
      `✔ Hoàn tất dịch Chương #${chapterNumber} qua ${modelUsed} (thinking=${resolvedThinkingLevel}, Key #${keyIndexUsed}/${totalKeys}) — ${returnedBlocks.length}/${rawBlocks.length} blocks trong ${(routeDurationMs / 1000).toFixed(2)}s`,
      {
        reqId,
        chapterNumber,
        modelUsed,
        thinkingLevelUsed: resolvedThinkingLevel,
        keyIndexUsed,
        returnedBlocksCount: returnedBlocks.length,
        expectedBlocksCount: rawBlocks.length,
        routeDurationMs,
      },
      reqId,
      routeDurationMs
    );

    return NextResponse.json({
      titleTranslated: normalizeVietnameseText(materialized.titleTranslated),
      translatedContent: normalizeVietnameseText(materialized.translatedContent),
      alignment: materialized.alignment,
      modelUsed,
      thinkingLevelUsed: resolvedThinkingLevel,
      didFallback,
      keyUsed: keyIndexUsed,
      totalKeys,
      matchedGlossaryCount,
      debugTrace,
    });
  } catch (err) {
    const routeDurationMs = Date.now() - routeStartMs;
    const message =
      err instanceof Error ? err.message : 'Lỗi không xác định khi dịch chương.';
    const isPoolExhausted = message.includes('[POOL_EXHAUSTED_429]');
    const isRetryableFreshPipe =
      Boolean((err as { retryableFreshPipe?: boolean }).retryableFreshPipe) ||
      message.includes('[CLIENT_RETRY_FRESH_PIPE]');
    const errWithTrace = err as Error & {
      attempts?: KeyAttemptTrace[];
    };

    const debugTrace: ServerDebugTrace = {
      reqId,
      endpoint: '/api/translate',
      startedAt: new Date(routeStartMs).toISOString(),
      totalDurationMs: routeDurationMs,
      requestedModel: selectedModel,
      fallbackModel: cleanFallbackModel,
      thinkingLevelUsed: resolvedThinkingLevel,
      totalPoolKeys: geminiKeyPool.getPoolStatus(selectedModel).totalConfiguredKeys,
      inputSummary: {
        chapterNumber: chapterNumForTrace,
        expectedBlocksCount,
        rawCharCount,
      },
      attempts: errWithTrace?.attempts || [],
      errorDetail: {
        name: err instanceof Error ? err.name : 'Error',
        message,
        stackPreview:
          err instanceof Error && err.stack
            ? err.stack.split('\n').slice(0, 5).join('\n')
            : undefined,
      },
    };

    logger.error(
      'TRANSLATE',
      `✖ Lỗi dịch Chương #${chapterNumForTrace} sau ${(routeDurationMs / 1000).toFixed(2)}s: ${message}`,
      {
        reqId,
        chapterNumber: chapterNumForTrace,
        isPoolExhausted,
        isRetryableFreshPipe,
        debugTrace,
      },
      reqId,
      routeDurationMs
    );

    return NextResponse.json(
      {
        error: message
          .replace('[POOL_EXHAUSTED_429] ', '')
          .replace('[CLIENT_RETRY_FRESH_PIPE] ', ''),
        poolExhausted429: isPoolExhausted,
        retryableFreshPipe: isRetryableFreshPipe,
        debugTrace,
      },
      { status: isPoolExhausted ? 429 : isRetryableFreshPipe ? 503 : 500 }
    );
  }
  });
}

