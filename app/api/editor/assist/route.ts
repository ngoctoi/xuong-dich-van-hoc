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
  splitTranslatedBodyIntoParagraphs,
} from '@/lib/block-engine';
import { normalizeVietnameseText } from '@/lib/storage';

interface DirtyBlockTarget {
  id: string;
  source: string;
  translation: string;
  contextBefore?: string;
  contextAfter?: string;
}

type AssistAction =
  | 'polish'
  | 'fix_pronouns'
  | 'fix_qa'
  | 'alternatives'
  | 'translate_title'
  | 'block_cleanup'
  | 'realign_chapter'
  | 'custom';

export async function POST(req: NextRequest) {
  return withHeartbeatStream(req, async () => {
    const reqId =
      req.headers.get('x-mhc-request-id') || createRequestId('ai_editor');
    const routeStartMs = Date.now();
    let selectedModel = 'gemini-flash-latest';
    let cleanFallbackModel: string | undefined;
    let resolvedThinkingLevel = normalizeThinkingLevel('high');
    let actionForTrace: string = 'polish';

    try {
      geminiKeyPool.syncFromRequest(req);
      const body = await req.json();
    const {
      action = 'polish',
      selectedText = '',
      surroundingContext = '',
      rawReference = '',
      titleRaw = '',
      rawContent = '',
      titleTranslated = '',
      translatedContent = '',
      pronounRule = '',
      systemInstruction = '',
      customPrompt = '',
      includeGlossary = false,
      glossary = [],
      targets = [],
      chapterNumber,
      model,
      fallbackModel,
      thinkingLevel,
    } = body as {
      action: AssistAction;
      selectedText?: string;
      surroundingContext?: string;
      rawReference?: string;
      titleRaw?: string;
      rawContent?: string;
      titleTranslated?: string;
      translatedContent?: string;
      pronounRule?: string;
      systemInstruction?: string;
      customPrompt?: string;
      includeGlossary?: boolean;
      glossary?: GlossaryEntry[];
      targets?: DirtyBlockTarget[];
      chapterNumber?: number;
      model?: string;
      fallbackModel?: string;
      thinkingLevel?: string;
    };

    actionForTrace = action;
    resolvedThinkingLevel = normalizeThinkingLevel(thinkingLevel);

    selectedModel =
      typeof model === 'string' && model.trim()
        ? model.trim()
        : 'gemini-flash-latest';

    cleanFallbackModel =
      typeof fallbackModel === 'string' && fallbackModel.trim()
        ? fallbackModel.trim()
        : undefined;

    logger.info(
      'AI_EDITOR',
      `▶ Bắt đầu AI Editor (action=${action}, model=${selectedModel}, thinkingLevel=${resolvedThinkingLevel}, targets=${targets?.length || 0}, selectedTextChars=${selectedText.length || translatedContent.length})`,
      {
        reqId,
        action,
        chapterNumber,
        targetsCount: targets?.length || 0,
        selectedTextChars: selectedText.length || translatedContent.length,
        includeGlossary,
        selectedModel,
        fallbackModel: cleanFallbackModel,
        thinkingLevel: resolvedThinkingLevel,
      },
      reqId
    );

    let glossaryNote = '';
    if (includeGlossary && Array.isArray(glossary) && glossary.length > 0) {
      const combinedSource =
        action === 'block_cleanup'
          ? targets.map((t) => t.source || '').join('\n')
          : action === 'realign_chapter'
            ? `${titleRaw}\n${rawContent}`
            : `${rawReference}\n${selectedText}`;
      const combinedTranslated =
        action === 'block_cleanup'
          ? targets
              .map(
                (t) =>
                  `${t.contextBefore || ''} ${t.translation || ''} ${t.contextAfter || ''}`
              )
              .join('\n')
          : action === 'realign_chapter'
            ? `${titleTranslated}\n${translatedContent}`
            : `${selectedText}\n${surroundingContext}`;
      const contextual = buildContextualGlossaryPromptSection(
        glossary,
        combinedSource,
        combinedTranslated,
        chapterNumber
      );
      glossaryNote = contextual.promptSection;
    }

    const editorialPersonaNote = systemInstruction.trim()
      ? `\n[CHỈ DẪN BIÊN TẬP CỦA DỰ ÁN]:\n${systemInstruction.trim()}`
      : '';

    const systemPrompt = `Bạn là Biên Tập Viên Tiểu Thuyết Trung - Việt cao cấp của Mặc Hương Các Studio.
Quy tắc bắt buộc:
- Biên tập, dịch bù chữ Hán sót, khử từ tiếng Anh lọt vào câu ('but', 'however', 'and'...) và chuốt văn phong tiếng Việt mượt mà.
- Không tự ý cắt bỏ tình tiết, giữ nguyên bố cục đoạn văn theo yêu cầu.
- Quy tắc xưng hô áp dụng: ${pronounRule || 'Theo đúng ngữ cảnh cổ trang / tiên hiệp'}.${editorialPersonaNote}${glossaryNote}`;

    // MODE 0: Full-Chapter Re-Alignment & Editorial (`realign_chapter` — used when chapter has QA Block Misalignment or Full-Chapter Structured Polish)
    if (action === 'realign_chapter') {
      if (!rawContent || !rawContent.trim()) {
        return NextResponse.json(
          { error: 'Chương thiếu nguyên bản tiếng Trung (rawContent) để căn chỉnh lại đoạn 1:1.' },
          { status: 400 }
        );
      }

      const rawBlocks = splitRawIntoBlocks(titleRaw, rawContent);
      const expectedBlockIds = rawBlocks.map((b) => b.id);
      const rawBodyCount = Math.max(0, rawBlocks.length - 1);
      const draftParagraphs = splitTranslatedBodyIntoParagraphs(
        translatedContent,
        rawBodyCount,
        'auto'
      );

      const fullRealignSystemPrompt = `${systemPrompt}

QUY TẮC BẮT BUỘC KHI BIÊN TẬP & CĂN CHỈNH LẠI TOÀN CHƯƠNG (CHAPTER-REALIGN-BLOCKS-V1):
1. Chương này đang được gửi TOÀN BỘ (gồm danh sách "rawBlocks" nguyên tác tiếng Trung có mã cố định "TITLE", "P0001".."P${String(rawBodyCount).padStart(4, '0')}" và bản dịch tiếng Việt hiện có "existingVietnameseDraft").
2. Lý do gửi cả chương: Bản dịch tiếng Việt hiện tại có ${draftParagraphs.length} đoạn trong khi nguyên tác có ${rawBodyCount} đoạn (bị lệch nhịp đoạn ở giữa/cuối chương), hoặc cần biên tập đồng bộ toàn chương.
3. Nhiệm vụ của bạn:
   - Đối chiếu toàn bộ "rawBlocks" với "existingVietnameseDraft" từ đầu đến cuối chương.
   - Tận dụng tối đa câu chữ, từ vựng và văn phong đã dịch tốt trong "existingVietnameseDraft", nhưng PHÂN BỔ LẠI (tách đoạn bị gộp, gộp đoạn bị tách thừa, hoặc dịch bù phần nguyên tác bị bỏ sót) sao cho kết quả trả về khớp CHÍNH XÁC 1:1 với từng mã "id" ("TITLE", "P0001", "P0002"...) của "rawBlocks".
   - TUYỆT ĐỐI KHÔNG dịch lặp lại nội dung ở cuối chương, KHÔNG bỏ sót hay thêm bớt bất kỳ mã ID nào.
   - Dọn sạch 100% chữ Hán còn sót, xóa từ tiếng Anh chêm sai ('but', 'however', 'and'...) và chuốt mượt câu văn tiếng Việt. Mỗi "translation" là 1 đoạn duy nhất không chứa ký tự xuống dòng (\\n).`;

      const wirePayload = JSON.stringify(
        {
          schema: 'chapter-realign-edit-v1',
          chapterNumber: chapterNumber || 1,
          expectedBlockCount: rawBlocks.length,
          rawBodyBlockCount: rawBodyCount,
          draftBodyParagraphCount: draftParagraphs.length,
          rawBlocks: rawBlocks.map((b) => ({
            id: b.id,
            source: b.source,
          })),
          existingVietnameseDraft: {
            title: titleTranslated || '',
            paragraphs: draftParagraphs.map((text, idx) => ({
              draftOrder: `DRAFT_${String(idx + 1).padStart(4, '0')}`,
              text,
            })),
          },
        },
        null,
        2
      );

      const idPropertySchema: Record<string, unknown> = {
        type: 'string',
        description:
          'Mã định danh block nguyên gốc (TITLE, P0001, P0002...). Phải khớp 1:1 với rawBlocks.',
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
            system_instruction: fullRealignSystemPrompt,
            input: wirePayload,
            generation_config: buildInteractionGenerationConfig(
              resolvedThinkingLevel,
              { temperature: 0.25 }
            ),
            response_format: {
              type: 'object',
              properties: {
                blocks: {
                  type: 'array',
                  description:
                    'Danh sách đầy đủ các block đã biên tập và căn chỉnh 1:1 theo đúng thứ tự rawBlocks (bắt đầu bằng TITLE, tiếp theo là P0001, P0002...).',
                  items: {
                    type: 'object',
                    properties: {
                      id: idPropertySchema,
                      translation: {
                        type: 'string',
                        description:
                          'Bản tiếng Việt đã căn chỉnh đúng vị trí ID và biên tập sạch chữ Hán / lỗi QA (1 đoạn duy nhất, không chứa ký tự xuống dòng).',
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
          endpoint: '/api/editor/assist',
          label: `realign_chapter #${chapterNumber || 1} (${rawBlocks.length} blocks • draft=${draftParagraphs.length} • thinking=${resolvedThinkingLevel})`,
          signal: req.signal,
        }
      );

      const rawJson = safeParseInteractionJson<{
        blocks?: Array<{ id: string; translation: string }>;
      }>(extractInteractionText(interaction), `RealignChapter[${reqId}]`);

      const cleanedBlocks = (rawJson.blocks || []).map((b) => ({
        id: String(b.id || '').trim(),
        translation: normalizeVietnameseText(String(b.translation || ''))
          .replace(/\r?\n+/g, ' ')
          .trim(),
      }));

      const materialized = materializeBlocksToChapter(
        cleanedBlocks,
        rawBlocks,
        chapterNumber || 1
      );

      const routeDurationMs = Date.now() - routeStartMs;
      const debugTrace: ServerDebugTrace = {
        reqId,
        endpoint: '/api/editor/assist',
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
          action,
          chapterNumber,
          rawBlocks: rawBlocks.length,
          draftParagraphs: draftParagraphs.length,
          thinkingLevel: resolvedThinkingLevel,
        },
        outputSummary: {
          returnedBlocks: cleanedBlocks.length,
          isAligned: materialized.alignment.isAligned,
          missingIdsCount: materialized.missingIds.length,
        },
        attempts,
      };

      logger.info(
        'AI_EDITOR',
        `✔ Hoàn tất Biên tập & Căn chỉnh toàn Chương #${chapterNumber || 1}: ${materialized.alignment.translatedBlockCount}/${materialized.alignment.rawBlockCount} đoạn (aligned=${materialized.alignment.isAligned}) sau ${(routeDurationMs / 1000).toFixed(2)}s`,
        {
          reqId,
          chapterNumber,
          isAligned: materialized.alignment.isAligned,
          modelUsed,
          thinkingLevel: resolvedThinkingLevel,
        },
        reqId,
        routeDurationMs
      );

      return NextResponse.json({
        titleTranslated: materialized.titleTranslated,
        translatedContent: materialized.translatedContent,
        alignment: materialized.alignment,
        missingIds: materialized.missingIds,
        emptyIds: materialized.emptyIds,
        modelUsed,
        thinkingLevelUsed: resolvedThinkingLevel,
        didFallback,
        keyUsed: keyIndexUsed,
        totalKeys,
        debugTrace,
      });
    }

    // MODE 1: Targeted Block-ID AI Cleanup (`block_cleanup` — returns `{ updates: [{ id, translation }] }`)
    if (action === 'block_cleanup') {
      if (!Array.isArray(targets) || targets.length === 0) {
        return NextResponse.json(
          { error: 'Không có Block ID nào cần dọn lỗi.' },
          { status: 400 }
        );
      }

      const targetIds = targets.map((t) => t.id);

      const wirePayload = JSON.stringify(
        {
          schema: 'block-cleanup-v1',
          instruction:
            'Chỉ sửa các block nằm trong danh sách targets bên dưới. Loại bỏ triệt để chữ Hán còn sót, xóa từ tiếng Anh chêm sai (như "but", "however", "and"), dịch bù nếu draft đang trống dựa trên source tiếng Trung, và giữ nguyên văn mạch (prevDraft/nextDraft). Trả về đúng mã id của từng target.',
          targets,
        },
        null,
        2
      );

      const idPropertySchema: Record<string, unknown> = {
        type: 'string',
        description: 'Mã Block ID (TITLE, P0001, P0002...).',
      };
      if (targetIds.length <= 64) {
        idPropertySchema.enum = targetIds;
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
            system_instruction: systemPrompt,
            input: wirePayload,
            generation_config: buildInteractionGenerationConfig(
              resolvedThinkingLevel,
              { temperature: 0.2 }
            ),
            response_format: {
              type: 'object',
              properties: {
                updates: {
                  type: 'array',
                  description:
                    'Danh sách các block đã được làm sạch tương ứng 1:1 với các id trong targets.',
                  items: {
                    type: 'object',
                    properties: {
                      id: idPropertySchema,
                      translation: {
                        type: 'string',
                        description:
                          'Bản tiếng Việt hoàn chỉnh, sạch 100% Hán tự và từ tiếng Anh thừa, không xuống dòng.',
                      },
                    },
                    required: ['id', 'translation'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['updates'],
              additionalProperties: false,
            },
          });
        },
        selectedModel,
        cleanFallbackModel,
        {
          reqId,
          endpoint: '/api/editor/assist',
          label: `block_cleanup (${targets.length} blocks • thinking=${resolvedThinkingLevel})`,
          signal: req.signal,
        }
      );

      const rawJson = safeParseInteractionJson<{
        updates?: Array<{ id: string; translation: string }>;
      }>(extractInteractionText(interaction), `BlockCleanup[${reqId}]`);
      const cleanedUpdates = (rawJson.updates || []).map((u) => ({
        id: String(u.id || '').trim(),
        translation: normalizeVietnameseText(String(u.translation || ''))
          .replace(/\r?\n+/g, ' ')
          .trim(),
      }));

      const routeDurationMs = Date.now() - routeStartMs;
      const debugTrace: ServerDebugTrace = {
        reqId,
        endpoint: '/api/editor/assist',
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
          action,
          targetsCount: targets.length,
          thinkingLevel: resolvedThinkingLevel,
        },
        outputSummary: { updatesCount: cleanedUpdates.length },
        attempts,
      };

      return NextResponse.json({
        updates: cleanedUpdates,
        modelUsed,
        thinkingLevelUsed: resolvedThinkingLevel,
        didFallback,
        keyUsed: keyIndexUsed,
        totalKeys,
        debugTrace,
      });
    }

    if (!selectedText.trim()) {
      return NextResponse.json(
        { error: 'Vui lòng chọn hoặc nhập đoạn văn cần biên tập.' },
        { status: 400 }
      );
    }

    // MODE 2: 3 Alternative Phrasings
    if (action === 'alternatives') {
      const promptText = `Hãy đưa ra 3 phương án diễn đạt tiếng Việt khác nhau (1: Giàu chất cổ phong/tiên hiệp; 2: Tự nhiên, gãy gọn, hiện đại dễ đọc; 3: Giàu cảm xúc, nhấn mạnh khí thế/nội tâm) cho đoạn văn sau:

[ĐOẠN VĂN CẦN GỢI Ý]:
${selectedText}

${rawReference ? `[NGUYÊN BẢN TIẾNG TRUNG THAM CHIẾU]:\n${rawReference}\n` : ''}
${surroundingContext ? `[NGỮ CẢNH XUNG QUANH]:\n${surroundingContext}` : ''}`;

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
            system_instruction: systemPrompt,
            input: promptText,
            generation_config: buildInteractionGenerationConfig(
              resolvedThinkingLevel,
              { temperature: 0.65 }
            ),
            response_format: {
              type: 'object',
              properties: {
                alternatives: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '3 phương án viết lại đoạn văn.',
                },
              },
              required: ['alternatives'],
              additionalProperties: false,
            },
          });
        },
        selectedModel,
        cleanFallbackModel,
        {
          reqId,
          endpoint: '/api/editor/assist',
          label: `alternatives (thinking=${resolvedThinkingLevel})`,
          signal: req.signal,
        }
      );

      const parsed = safeParseInteractionJson<{
        alternatives?: string[];
      }>(extractInteractionText(interaction), `Alternatives[${reqId}]`);
      const routeDurationMs = Date.now() - routeStartMs;
      return NextResponse.json({
        alternatives: (parsed.alternatives || []).map((s) =>
          normalizeVietnameseText(s)
        ),
        modelUsed,
        thinkingLevelUsed: resolvedThinkingLevel,
        didFallback,
        keyUsed: keyIndexUsed,
        totalKeys,
        debugTrace: {
          reqId,
          endpoint: '/api/editor/assist',
          startedAt: new Date(routeStartMs).toISOString(),
          totalDurationMs: routeDurationMs,
          requestedModel: selectedModel,
          fallbackModel: cleanFallbackModel,
          modelUsed,
          thinkingLevelUsed: resolvedThinkingLevel,
          didFallback,
          keyIndexUsed,
          totalPoolKeys: totalKeys,
          attempts,
        } satisfies ServerDebugTrace,
      });
    }

    // MODE 3: Single-Passage or Full-Chapter Editorial Action
    let taskInstruction = '';
    if (action === 'polish') {
      taskInstruction =
        'Hãy biên tập, chuốt lại câu chữ tiếng Việt dưới đây cho thật mượt mà, thoát ý, giàu nhạc điệu văn học mà vẫn giữ nguyên 100% ý nghĩa và số đoạn văn.';
    } else if (action === 'fix_pronouns') {
      taskInstruction = `Hãy kiểm tra và đồng bộ lại toàn bộ đại từ xưng hô trong đoạn văn dưới đây theo chuẩn "${
        pronounRule || 'Ta - Ngươi / Huynh - Đệ'
      }" phù hợp ngữ cảnh nhân vật.`;
    } else if (action === 'fix_qa') {
      taskInstruction =
        'Hãy quét và dịch sạch toàn bộ các chữ Hán (ký tự Trung Quốc) còn sót hoặc các từ tiếng Anh bị lọt vô duyên (như "but", "and", "however") trong văn bản dưới đây sang tiếng Việt tự nhiên. Giữ nguyên số dòng/đoạn.';
    } else if (action === 'translate_title') {
      taskInstruction =
        'Hãy dịch tiêu đề chương này sang tiếng Việt thật hay, chuẩn phong cách tiểu thuyết (Định dạng: Chương X: Tên chương).';
    } else {
      taskInstruction =
        customPrompt.trim() ||
        'Hãy biên tập lại đoạn văn dưới đây cho mượt mà hơn.';
    }

    const promptText = `${taskInstruction}

[VĂN BẢN CẦN XỬ LÝ]:
${selectedText}

${rawReference ? `[NGUYÊN BẢN TIẾNG TRUNG ĐỐI CHIẾU]:\n${rawReference}\n` : ''}
${surroundingContext ? `[NGỮ CẢNH XUNG QUANH]:\n${surroundingContext}` : ''}`;

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
          system_instruction: systemPrompt,
          input: promptText,
          generation_config: buildInteractionGenerationConfig(
            resolvedThinkingLevel,
            { temperature: 0.3 }
          ),
          response_format: {
            type: 'object',
            properties: {
              editedText: {
                type: 'string',
                description: 'Văn bản sau khi đã biên tập hoàn chỉnh.',
              },
            },
            required: ['editedText'],
            additionalProperties: false,
          },
        });
      },
      selectedModel,
      cleanFallbackModel,
      {
        reqId,
        endpoint: '/api/editor/assist',
        label: `assist:${action} (thinking=${resolvedThinkingLevel})`,
        signal: req.signal,
      }
    );

    const parsed = safeParseInteractionJson<{
      editedText?: string;
    }>(extractInteractionText(interaction), `Assist:${action}[${reqId}]`);

    const routeDurationMs = Date.now() - routeStartMs;
    return NextResponse.json({
      resultText: normalizeVietnameseText(parsed.editedText || selectedText),
      modelUsed,
      thinkingLevelUsed: resolvedThinkingLevel,
      didFallback,
      keyUsed: keyIndexUsed,
      totalKeys,
      debugTrace: {
        reqId,
        endpoint: '/api/editor/assist',
        startedAt: new Date(routeStartMs).toISOString(),
        totalDurationMs: routeDurationMs,
        requestedModel: selectedModel,
        fallbackModel: cleanFallbackModel,
        modelUsed,
        thinkingLevelUsed: resolvedThinkingLevel,
        didFallback,
        keyIndexUsed,
        totalPoolKeys: totalKeys,
        attempts,
      } satisfies ServerDebugTrace,
    });
  } catch (err) {
    const routeDurationMs = Date.now() - routeStartMs;
    const message =
      err instanceof Error ? err.message : 'Lỗi khi gọi trợ lý biên tập AI.';
    const isPoolExhausted = message.includes('[POOL_EXHAUSTED_429]');
    const isRetryableFreshPipe =
      Boolean((err as { retryableFreshPipe?: boolean }).retryableFreshPipe) ||
      message.includes('[CLIENT_RETRY_FRESH_PIPE]');
    const errWithTrace = err as Error & {
      attempts?: KeyAttemptTrace[];
    };

    const debugTrace: ServerDebugTrace = {
      reqId,
      endpoint: '/api/editor/assist',
      startedAt: new Date(routeStartMs).toISOString(),
      totalDurationMs: routeDurationMs,
      requestedModel: selectedModel,
      fallbackModel: cleanFallbackModel,
      thinkingLevelUsed: resolvedThinkingLevel,
      totalPoolKeys: geminiKeyPool.getPoolStatus(selectedModel).totalConfiguredKeys,
      inputSummary: { action: actionForTrace },
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
      'AI_EDITOR',
      `✖ Lỗi tại /api/editor/assist (${actionForTrace}) sau ${(routeDurationMs / 1000).toFixed(2)}s: ${message}`,
      {
        reqId,
        action: actionForTrace,
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

