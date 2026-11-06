import { NextRequest, NextResponse } from 'next/server';
import { decodeChineseTextBuffer } from '@/lib/file-engine';
import { createRequestId, logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const reqId = createRequestId('URL');
  const startMs = Date.now();
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      logger.warn('FETCH_URL', 'URL không hợp lệ khi tải chương', { url }, reqId);
      return NextResponse.json(
        { error: 'URL không hợp lệ. Vui lòng nhập đường dẫn bắt đầu bằng http:// hoặc https://' },
        { status: 400 }
      );
    }

    logger.info('FETCH_URL', `Đang tải trang truyện từ URL: ${url}`, { url }, reqId);

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      logger.warn(
        'FETCH_URL',
        `Tải trang thất bại (HTTP ${response.status})`,
        { url, httpStatus: response.status, durationMs: Date.now() - startMs },
        reqId
      );
      return NextResponse.json(
        { error: `Không thể tải trang truyện (Mã HTTP ${response.status}).` },
        { status: 400 }
      );
    }

    const buffer = await response.arrayBuffer();
    const html = decodeChineseTextBuffer(buffer);

    // Extract title
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const rawTitle = (h1Match?.[1] || titleTagMatch?.[1] || '第1章 Chương mới')
      .replace(/<[^>]+>/g, '')
      .split(/[-_|—]/)[0]
      .trim();

    // Remove script/style/nav/footer
    const cleanedHtml = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n');

    const plainLines = cleanedHtml
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&ldquo;/g, '“')
      .replace(/&rdquo;/g, '”')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Keep lines that look like story content (contain CJK or punctuation)
    const storyLines = plainLines.filter(
      (l) => /[\u4E00-\u9FFF]/.test(l) && !/上一章|下一章|目录|加入书签|推荐票|手机阅读/.test(l)
    );

    const rawContent = (storyLines.length > 3 ? storyLines : plainLines).join('\n');

    logger.info(
      'FETCH_URL',
      `Tải chương thành công: "${rawTitle}" (${rawContent.length} ký tự, ${Date.now() - startMs}ms)`,
      {
        url,
        titleRaw: rawTitle,
        charLength: rawContent.length,
        durationMs: Date.now() - startMs,
      },
      reqId
    );

    return NextResponse.json({
      titleRaw: rawTitle,
      rawContent,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi khi trích xuất chương từ URL.';
    logger.error(
      'FETCH_URL',
      `Lỗi trích xuất chương từ URL (${Date.now() - startMs}ms): ${message}`,
      error,
      reqId
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
