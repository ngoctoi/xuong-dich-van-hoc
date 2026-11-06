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

export async function POST(req: NextRequest) {
  return withHeartbeatStream(req, async () => {
    const reqId =
      req.headers.get('x-mhc-request-id') || createRequestId('glossary_scan');
    const routeStartMs = Date.now();
    let selectedModel = 'gemini-flash-latest';
    let cleanFallbackModel: string | undefined;
    let resolvedThinkingLevel = normalizeThinkingLevel('high');
    let textToScanLength = 0;
    let existingTermsCount = 0;

    try {
      geminiKeyPool.syncFromRequest(req);
      const body = await req.json();
    const {
      rawContent = '',
      sampleText = '',
      model,
      fallbackModel,
      thinkingLevel,
      existingTerms = [],
    } = body as {
      rawContent?: string;
      sampleText?: string;
      model?: string;
      fallbackModel?: string;
      thinkingLevel?: string;
      existingTerms?: string[];
    };

    const textToScan = (rawContent || sampleText || '').trim();
    textToScanLength = textToScan.length;
    existingTermsCount = Array.isArray(existingTerms) ? existingTerms.length : 0;
    resolvedThinkingLevel = normalizeThinkingLevel(thinkingLevel);

    if (!textToScan) {
      logger.warn(
        'GLOSSARY_SCAN',
        '✖ Bỏ qua yêu cầu quét Glossary vì văn bản đầu vào trống.',
        { reqId },
        reqId
      );
      return NextResponse.json(
        { error: 'Không có văn bản tiếng Trung để trích xuất thuật ngữ.' },
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

    const slicedInput = textToScan.slice(0, 45000);

    logger.info(
      'GLOSSARY_SCAN',
      `▶ Bắt đầu quét Glossary trên Server (${slicedInput.length} ký tự Hán, bỏ qua ${existingTermsCount} mục đã có, model=${selectedModel}, thinkingLevel=${resolvedThinkingLevel})`,
      {
        reqId,
        rawTextLength: textToScanLength,
        sentChars: slicedInput.length,
        existingTermsCount,
        selectedModel,
        fallbackModel: cleanFallbackModel,
        thinkingLevel: resolvedThinkingLevel,
      },
      reqId
    );

    const existingHint =
      Array.isArray(existingTerms) && existingTerms.length > 0
        ? `\nQUAN TRỌNG — BỎ QUA các thuật ngữ đã có sẵn trong từ điển sau đây (không trích xuất lại): ${existingTerms
            .slice(0, 350)
            .join(', ')}`
        : '';

    const systemPrompt = `Bạn là Chuyên gia Khảo cứu Hán Việt & Thiết lập Từ Điển Tiền Kỳ (Pre-Translation Termbase Builder) cho hệ thống dịch tiểu thuyết Trung - Việt song song đa luồng.
Nhiệm vụ của bạn là đọc văn bản tiếng Trung (có thể gồm 1 hoặc nhiều chương gộp lại) và trích xuất toàn bộ các danh từ riêng, tên nhân vật, địa danh, cảnh giới, công pháp, thế lực, pháp bảo đặc thù của tác phẩm để các luồng dịch song song sử dụng thống nhất 100%.

QUY TẮC TRÍCH XUẤT CHUẨN:
1. Chỉ trích xuất Danh từ riêng / Thuật ngữ đặc thù của bộ truyện (Cấp 3: Tên người, Tên đất, Tông môn, Cảnh giới đặc thù, Công pháp/Chiêu thức, Pháp bảo/Đan dược, Danh hiệu/Chức vị, Mã hệ thống). KHÔNG trích xuất các từ vựng phổ thông hiển nhiên (như sư huynh, linh thạch, đại đạo...).
2. Bản dịch "targetTerm" phải là âm Hán Việt chuẩn xác hoặc cách dịch chuẩn tiểu thuyết Tiên hiệp / Cổ trang / Đô thị (viết hoa chữ cái đầu mỗi âm tiết đối với tên riêng, VD: "Khương Vọng", "Phong Lâm Thành", "Du Mạch Cảnh").
3. Với phân loại "character" (Nhân vật):
   - "aliases": Nếu trong văn bản nhân vật có tên gọi khác, tự, đạo hiệu, biệt danh (VD: "Hàn Lão Ma", "Khương Thanh Dương"), hãy gom vào mảng "aliases" của cùng nhân vật đó để tránh tách thành 2 người.
   - "notes": BẮT BUỘC ghi rõ Giới tính + Vai vế/Thân phận + Cặp đại từ xưng hô chuẩn trong ngữ cảnh (Ví dụ: "Nam chính, đệ tử đạo viện Phong Lâm Thành; xưng Ta - Ngươi với kẻ địch, Đệ - Sư huynh với Tả Quang Liệt").
4. "policy": Chọn chính sách dịch:
   - "force": Bắt buộc dịch cố định (dùng cho Tên nhân vật, Địa danh, Tông môn, Công pháp, Cảnh giới riêng).
   - "contextual": Tùy ngữ cảnh (dùng cho Danh hiệu/Chức vị hoặc Xưng hô thay đổi theo đối tượng).
   - "keep_source": Giữ nguyên gốc (dùng cho Mã hệ thống đặc biệt như [SSS]).`;

    const prompt = `Hãy quét kỹ văn bản tiếng Trung dưới đây và trích xuất danh sách thuật ngữ + biến thể (aliases) + ma trận nhân vật chuẩn xác nhất cho bộ Từ điển tiền kỳ.${existingHint}

[VĂN BẢN TIẾNG TRUNG CẦN QUÉT]:
${slicedInput}`;

    const {
      result: interaction,
      keyIndexUsed,
      totalKeys,
      modelUsed,
      didFallback,
      attempts,
      totalDurationMs,
    } = await geminiKeyPool.executeWithKeyRotation(
      async (ai, slotInfo) => {
        return await ai.interactions.create({
          model: slotInfo.activeModel,
          store: false,
          system_instruction: systemPrompt,
          input: prompt,
          generation_config: buildInteractionGenerationConfig(
            resolvedThinkingLevel,
            { temperature: 0.2 }
          ),
          response_format: {
            type: 'object',
            properties: {
              terms: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    sourceTerm: {
                      type: 'string',
                      description: 'Từ gốc tiếng Trung chính tắc (chữ Hán).',
                    },
                    targetTerm: {
                      type: 'string',
                      description: 'Bản dịch Hán Việt / Tiếng Việt chuẩn cố định.',
                    },
                    aliases: {
                      type: 'array',
                      items: { type: 'string' },
                      description:
                        'Danh sách các cách viết tiếng Trung khác / biệt danh / đạo hiệu của cùng thực thể này (nếu có, nếu không trả về mảng rỗng []).',
                    },
                    policy: {
                      type: 'string',
                      enum: ['force', 'prefer', 'contextual', 'keep_source'],
                      description:
                        'Chính sách dịch: force (cố định) | prefer (ưu tiên) | contextual (tùy ngữ cảnh) | keep_source (giữ nguyên).',
                    },
                    category: {
                      type: 'string',
                      enum: [
                        'character',
                        'location',
                        'cultivation',
                        'skill',
                        'organization',
                        'item',
                        'title',
                        'pronoun',
                        'other',
                      ],
                      description:
                        'Phân loại: character | location | cultivation | skill | organization | item | title | pronoun | other',
                    },
                    notes: {
                      type: 'string',
                      description:
                        'Ghi chú ngắn gọn về vai trò, giới tính, quan hệ và quy tắc xưng hô.',
                    },
                  },
                  required: [
                    'sourceTerm',
                    'targetTerm',
                    'aliases',
                    'policy',
                    'category',
                    'notes',
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ['terms'],
            additionalProperties: false,
          },
        });
      },
      selectedModel,
      cleanFallbackModel,
      {
        reqId,
        endpoint: '/api/glossary/extract',
        label: `GlossaryPreScan (${slicedInput.length} chars • thinking=${resolvedThinkingLevel})`,
        signal: req.signal,
      }
    );

    const rawOutputText = extractInteractionText(interaction);
    const parsed = safeParseInteractionJson<{
      terms?: Array<{
        sourceTerm: string;
        targetTerm: string;
        aliases?: string[];
        policy?: 'force' | 'prefer' | 'contextual' | 'keep_source';
        category: string;
        notes: string;
      }>;
    }>(rawOutputText, `GlossaryExtract[${reqId}]`);

    const terms = parsed.terms || [];
    const routeDurationMs = Date.now() - routeStartMs;

    const debugTrace: ServerDebugTrace = {
      reqId,
      endpoint: '/api/glossary/extract',
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
        rawTextLength: textToScanLength,
        sentChars: slicedInput.length,
        existingTermsCount,
        thinkingLevel: resolvedThinkingLevel,
      },
      outputSummary: {
        extractedTermsCount: terms.length,
        rawOutputChars: rawOutputText.length,
      },
      attempts,
    };

    logger.info(
      'GLOSSARY_SCAN',
      `✔ Trích xuất thành công ${terms.length} thuật ngữ qua ${modelUsed} (thinking=${resolvedThinkingLevel}, Key #${keyIndexUsed}/${totalKeys}) trong ${(routeDurationMs / 1000).toFixed(2)}s`,
      {
        reqId,
        extractedCount: terms.length,
        modelUsed,
        thinkingLevelUsed: resolvedThinkingLevel,
        keyIndexUsed,
        totalDurationMs,
      },
      reqId,
      routeDurationMs
    );

    return NextResponse.json({
      terms,
      entries: terms,
      modelUsed,
      thinkingLevelUsed: resolvedThinkingLevel,
      didFallback,
      keyUsed: keyIndexUsed,
      totalKeys,
      debugTrace,
    });
  } catch (err) {
    const routeDurationMs = Date.now() - routeStartMs;
    const message =
      err instanceof Error ? err.message : 'Lỗi khi trích xuất Glossary tự động.';
    const isPoolExhausted = message.includes('[POOL_EXHAUSTED_429]');
    const isRetryableFreshPipe =
      Boolean((err as { retryableFreshPipe?: boolean }).retryableFreshPipe) ||
      message.includes('[CLIENT_RETRY_FRESH_PIPE]');
    const errWithTrace = err as Error & {
      attempts?: KeyAttemptTrace[];
    };

    const debugTrace: ServerDebugTrace = {
      reqId,
      endpoint: '/api/glossary/extract',
      startedAt: new Date(routeStartMs).toISOString(),
      totalDurationMs: routeDurationMs,
      requestedModel: selectedModel,
      fallbackModel: cleanFallbackModel,
      thinkingLevelUsed: resolvedThinkingLevel,
      totalPoolKeys: geminiKeyPool.getPoolStatus(selectedModel).totalConfiguredKeys,
      inputSummary: {
        rawTextLength: textToScanLength,
        existingTermsCount,
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
      'GLOSSARY_SCAN',
      `✖ Lỗi tại /api/glossary/extract sau ${(routeDurationMs / 1000).toFixed(2)}s: ${message}`,
      {
        reqId,
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


