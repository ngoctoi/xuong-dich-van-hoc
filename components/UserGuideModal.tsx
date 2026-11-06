'use client';

import React, { useMemo, useState } from 'react';
import {
  X,
  BookOpenCheck,
  Search,
  Sparkles,
  FileUp,
  Layers,
  Columns,
  ShieldCheck,
  BookOpen,
  Download,
  Terminal,
  Keyboard,
  CheckCircle2,
  Copy,
  Check,
  HelpCircle,
  Cpu,
  Library,
} from 'lucide-react';

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GuideSection {
  id: string;
  title: string;
  badge: string;
  icon: React.ReactNode;
  summary: string;
  highlights: string[];
  steps: {
    heading: string;
    items: string[];
  }[];
  tips?: string[];
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'quickstart',
    title: '1. Quy Trình Nhanh 5 Bước & Không Gian Làm Việc',
    badge: 'Bắt đầu nhanh',
    icon: <Sparkles className="h-4 w-4" />,
    summary:
      'Làm chủ Mặc Hương Các Studio trong 5 bước: Chọn/Tạo truyện -> Nhập chương -> Thiết lập Preset, Thinking Level & Bể 50 Key -> Dịch/Biên tập đa luồng -> Rà soát 1:1, Đọc & Xuất sách EPUB 3.3.',
    highlights: [
      '2 Chế độ trung tâm tinh gọn: Biên tập bản dịch (1:1 Block-ID) & Đọc (Clean Justified Reader)',
      'Tự động cuộn lên đầu chương (Scroll-to-Top) mỗi khi chuyển chương ở cả chế độ Biên tập lẫn Đọc',
      'Lưu trữ bền vững 100% trong IndexedDB kết hợp Bể 50 Key lưu trực tiếp vào dự án',
    ],
    steps: [
      {
        heading: 'Quy trình chuẩn 5 bước từ nguyên tác tiếng Trung đến sách hoàn chỉnh',
        items: [
          'Bước 1 (Thư Viện): Nhấn nút "Thư Viện" ở góc trái trên cùng để chọn bộ truyện mẫu có sẵn (Phàm Nhân Tu Tiên, Đạo Quỷ Dị Tiên, Quỷ Bí Chi Chủ) hoặc tạo bộ truyện mới.',
          'Bước 2 (Nhập Chương): Nhấn "Nhập Chương" ở cột trái để nạp hàng trăm file .TXT, sách .EPUB tiếng Trung, tách 1 file .TXT gộp bằng Regex (có bảng xem trước), hoặc tải từ URL.',
          'Bước 3 (Preset, Thinking Level & 50 Keys): Mở "Preset & Model" để chọn chỉ dẫn dịch (Flash Đa Thể Loại v1.14.0), chọn mức suy luận Thinking Level (minimal / low / medium / high — mặc định high) và nạp danh sách API Key (tối đa 50 Key).',
          'Bước 4 (Hàng Đợi Đa Luồng): Tick chọn các chương ở cột trái -> chọn số luồng (1x–10x) -> nhấn "Dịch Đã Chọn" hoặc "Biên Tập Đã Chọn" (hỗ trợ Tạm dừng / Tiếp tục / Dừng hẳn).',
          'Bước 5 (Biên Tập 1:1, Đọc & Xuất Sách): Rà soát trên bảng khóa dòng 1:1 (TITLE, P0001..Pxxxx), kiểm tra ở chế độ "Đọc", và nhấn "Xuất & Sao lưu" để tải EPUB 3.3 hoặc gói sao lưu .ZIP (Backup v5).',
        ],
      },
      {
        heading: 'Cơ chế tự động cuộn lên đầu chương (Scroll-to-Top)',
        items: [
          'Khi bạn chuyển chương bằng mục lục bên trái, menu thả xuống hoặc nút Chương trước / Chương tiếp, cả khung Biên tập 1:1 lẫn khung Đọc đều tự động cuộn về đầu chương (scrollTop = 0).',
          'Đồng thời, chương đang mở luôn được giữ nằm trong vùng nhìn thấy ở danh sách mục lục bên trái.',
        ],
      },
    ],
    tips: [
      'Dữ liệu chương truyện, từ điển, highlight và cài đặt đọc được lưu tự động ngay trên trình duyệt. Hãy kết hợp xuất gói ".ZIP Backup v5" định kỳ để lưu trữ an toàn.',
    ],
  },
  {
    id: 'library',
    title: '2. Thư Viện Truyện & Biểu Đồ Tiến Độ 3 Tầng',
    badge: 'Thư viện',
    icon: <Library className="h-4 w-4" />,
    summary:
      'Trung tâm quản lý đa dự án tiểu thuyết với Biểu đồ tròn Donut 3 tầng (Đã duyệt • Đã dịch chưa duyệt • Chưa dịch), chế độ Thẻ / Bảng Ma Trận, Ghim ưu tiên và Khôi phục gói .ZIP Backup v5.',
    highlights: [
      'Biểu đồ tròn Donut 3 tầng thống kê trực quan cho Toàn thư viện & Từng bộ truyện',
      '2 Chế độ hiển thị: Dạng Thẻ (Card View) và Bảng Ma Trận Tiến Độ (Table View)',
      'Ghim truyện ⭐, sửa thông tin & ảnh bìa EPUB, nhân bản (Clone) và khôi phục dự án từ file .ZIP',
    ],
    steps: [
      {
        heading: 'Bảng Điều Khiển Tiến Độ Toàn Thư Viện (Biểu đồ Donut 3 tầng)',
        items: [
          'Màu Xanh Ngọc (#1E6F50 — Đã biên tập / Đã duyệt): Số chương đã hoàn thiện biên tập và kiểm duyệt.',
          'Màu Hổ Phách (#D97706 — Đã dịch chưa duyệt): Số chương đã có bản dịch tiếng Việt nhưng chưa qua bước duyệt biên tập.',
          'Màu Xám Giấy (#D6CFC2 — Chưa dịch): Số chương mới nạp nguyên bản tiếng Trung.',
          'Hiển thị chi tiết tỷ lệ % hoàn thành, tổng số chương, tổng số từ tiếng Việt, số mục thuật ngữ Từ điển và số chương đạt chuẩn QA sạch.',
        ],
      },
      {
        heading: 'Thao tác quản trị trên từng dự án truyện',
        items: [
          'Tìm kiếm & Lọc: Tìm theo tên Việt, tên Hán, tác giả, thể loại; lọc theo trạng thái (Tất cả, Đã ghim ⭐, Đang dịch dở, Hoàn thành 100%, Chưa dịch).',
          'Sửa thông tin & Ảnh bìa: Cập nhật tên truyện, tác giả, thể loại, tóm tắt và tải ảnh bìa (tự động nhúng vào sách EPUB 3.3 khi xuất bản).',
          'Nhân bản (Clone) & Khôi phục .ZIP: Sao chép bộ truyện sang bản sao độc lập để thử nghiệm Preset mới, hoặc nạp file .ZIP (Backup v5) để khôi phục toàn diện.',
        ],
      },
    ],
  },
  {
    id: 'import',
    title: '3. Nhập Nguyên Tác (4 Nguồn) & Nhập Bản Dịch Ngoài (.TXT)',
    badge: 'Nhập liệu',
    icon: <FileUp className="h-4 w-4" />,
    summary:
      'Hỗ trợ 4 nguồn nhập chương nguyên tác tự động cấp mã thứ tự 4 chữ số (0000, 0001...) và công cụ Nhập bản dịch cả chương (.TXT) có bảng xem trước ghép đoạn 1:1.',
    highlights: [
      '4 nguồn nguyên tác: Nhiều file .TXT (XXXX_), sách .EPUB, tách 1 file .TXT gộp bằng Regex, hoặc Dán/Tải URL',
      'Tự động giải mã bảng mã tiếng Trung UTF-8, GB18030 và GBK khi tải từ URL',
      'Nhập bản dịch ngoài (.TXT) có bảng Preview đối chiếu từng đoạn TITLE, P0001..Pxxxx',
    ],
    steps: [
      {
        heading: '4 Phương thức Nhập Chương Nguyên Tác (Nút "Nhập Chương" ở cột trái)',
        items: [
          'Tab 1 — Thư mục / Nhiều file .TXT: Chọn hàng trăm file .txt cùng lúc, tự động nhận diện tiền tố thứ tự chương (XXXX_) và tách dòng tiêu đề đầu tiên.',
          'Tab 2 — Sách .EPUB nguyên tác: Đọc chuẩn cấu trúc container.xml -> .opf -> manifest & spine, giữ nguyên thứ tự chương mục của sách gốc.',
          'Tab 3 — Tách 1 file .TXT gộp nhiều chương bằng Regex: Tích hợp mẫu Regex nhận diện "第...章/节/回/卷" hoặc "Chương/Hồi...", có Bảng Xem Trước (Preview) danh sách chương trước khi lưu.',
          'Tab 4 — Dán văn bản hoặc Tải từ URL: Dán nội dung trực tiếp hoặc nhập URL chương truyện (hỗ trợ tự động giải mã UTF-8 / GB18030 / GBK).',
        ],
      },
      {
        heading: 'Nhập Bản Dịch Ngoài Cả Chương (.TXT 1:1)',
        items: [
          'Trong màn hình Biên tập bản dịch, nhấn nút "Nhập bản dịch (.TXT)" trên thanh công cụ chương.',
          'Chọn file .txt hoặc dán nội dung bản dịch có sẵn, bật/tắt tùy chọn "Tự động lấy dòng đầu làm Tiêu đề chương (TITLE)".',
          'Kiểm tra bảng Xem Trước Ghép Đoạn 1:1 (cảnh báo ngay nếu số đoạn tiếng Việt lệch với nguyên tác) rồi nhấn xác nhận áp dụng.',
        ],
      },
    ],
  },
  {
    id: 'models_thinking_keys',
    title: '4. Model Alias, Thinking Level & Bể 50 API Key',
    badge: 'Thinking & 50 Keys',
    icon: <Cpu className="h-4 w-4" />,
    summary:
      'Tự động lấy danh sách mức độ suy luận (minimal, low, medium, high — mặc định high) để tránh ngắt kết nối 300 giây, kết hợp Bể 50 API Key lưu bền vững vào dự án và công cụ Chẩn đoán 5 tuyến API.',
    highlights: [
      'Mức suy luận Thinking Level: minimal • low • medium • high (mặc định: high)',
      'Chọn nhanh Thinking Level ngay tại thanh Hàng Đợi (cột trái) hoặc trong Preset & Model -> Tab 3',
      'Bể 50 API Key lưu bền vững vào dự án (1 Luồng = 1 Key độc lập) + Nút Xóa sạch Key trước khi Public',
    ],
    steps: [
      {
        heading: 'Cơ chế Mức Độ Suy Luận (Thinking Level: minimal, low, medium, high)',
        items: [
          'Hệ thống tự động lấy danh sách mức suy luận từ SDK/API (/api/models) gồm 4 mức: minimal (Tối giản — phản hồi tức thì), low (Thấp — nhanh), medium (Trung bình — cân bằng), và high (Cao — suy luận sâu).',
          'Mặc định khi không chỉnh sửa, hệ thống luôn đặt ở mức "high" để đạt chất lượng dịch thuật và biên tập cao nhất.',
          'Cách xử lý khi gặp chương dài bị ngắt kết nối cổng 300 giây (Gateway Timeout): Chuyển nhanh mức suy luận xuống "medium", "low" hoặc "minimal" ngay trên thanh chọn nhanh ở khung Hàng Đợi cột trái hoặc trong Tab 3 của cửa sổ Preset & Model.',
          'Mức Thinking Level được áp dụng đồng bộ cho cả Dịch chương (/api/translate), Trợ lý Biên tập (/api/editor/assist) và Quét Từ điển (/api/glossary/extract).',
        ],
      },
      {
        heading: 'Bể 50 API Key Lưu Bền Vững & Chẩn Đoán Toàn Diện',
        items: [
          '1 Luồng = 1 Key Độc Lập: Dán tối đa 50 API Key (mỗi dòng 1 Key AIza...). Luồng #1 dùng Key #1, Luồng #2 dùng Key #2... giúp chạy đa luồng 1x–10x mượt mà không lo nghẽn hạn mức.',
          'Lưu bền vững vào Dự án: Key được lưu đồng bộ vào tệp cấu hình dự án trên máy chủ và bộ nhớ trình duyệt. Trước khi chia sẻ hoặc Public dự án, nhấn nút "Xóa sạch Key" để gỡ toàn bộ Key an toàn.',
          'Khóa cứng Model (Strict Model Lock) vs Auto-Fallback: Mặc định khóa cứng Model bạn chọn; khi bật Auto-Fallback, hệ thống mới chuyển sang gemini-3.1-flash-lite nếu toàn bộ Key chạm trần 429.',
          'Chẩn đoán Key & 5 Tuyến API + Xóa Cooldown 429: Kiểm tra sức khỏe từng Key và 5 tuyến API chỉ với 1 cú nhấp chuột, hoặc nhấn "Xóa Cooldown 429" để mở khóa ngay các Key đang chờ nghỉ.',
        ],
      },
    ],
    tips: [
      'Khi dịch các chương siêu dài (trên 6.000–10.000 chữ Hán), chọn mức "medium" hoặc "low" giúp tốc độ trả về nhanh gấp 2–3 lần và loại bỏ hoàn toàn nguy cơ đứt kết nối 300 giây.',
    ],
  },
  {
    id: 'glossary_prescan',
    title: '5. Chỉ Dẫn Dịch (Preset), Từ Điển & Quét Tiền Kỳ Đa Luồng',
    badge: 'Preset & Glossary',
    icon: <BookOpenCheck className="h-4 w-4" />,
    summary:
      'Quản lý Preset chỉ dẫn dịch thuật đa thể loại, Từ điển thuật ngữ lọc ngữ cảnh 0.5ms (mặc định tắt, chỉ gửi khi bật) và Trình quét dựng Từ điển Tiền kỳ Đa luồng (Pre-Scan Builder).',
    highlights: [
      'Tích hợp sẵn 2 Preset chuẩn v1.14.0 (Dịch Mới & Biên Tập AI) + tạo mới/xuất/nhập .MD/.TXT',
      'Lọc Từ điển thông minh 0.5ms theo chương & khoảng chương hiệu lực (Từ chương X -> Y)',
      'Quét dựng Từ điển Tiền kỳ Đa luồng (1–10 chương/gói, 1x–10x luồng) có Tạm dừng / Tiếp tục / Dừng hẳn',
    ],
    steps: [
      {
        heading: 'Từ Điển Thuật Ngữ Thông Minh & 4 Chính Sách Áp Dụng',
        items: [
          'Công tắc Từ điển mặc định TẮT để tiết kiệm token và giữ tốc độ tối đa; khi bật, hệ thống chỉ lọc các thuật ngữ thực sự xuất hiện trong chương đang dịch (kèm các mục ghim Luôn gửi).',
          '4 Chính sách dịch thuật ngữ: Bắt buộc khớp 100% (force), Ưu tiên dùng (prefer), Tùy ngữ cảnh (contextual), và Giữ nguyên Hán Việt/Phiên âm (keep_source).',
          'Hỗ trợ khai báo Biến thể (Aliases), Cách dịch cấm (Forbidden Target) và Khoảng chương hiệu lực (Từ chương X -> Đến chương Y).',
          'Nút "Áp dụng & Thay thế vào các chương đã dịch": Đồng bộ tức thì thuật ngữ mới sửa vào toàn bộ các chương đã dịch trước đó.',
        ],
      },
      {
        heading: 'Trình Quét Dựng Từ Điển Tiền Kỳ Đa Luồng (Pre-Scan Builder)',
        items: [
          'Chọn phạm vi chương cần quét (Tất cả, Đã tick, Khoảng chương Từ X -> Y, hoặc Chương đang mở).',
          'Chọn số chương gộp mỗi gói AI (1–10 chương/gói) và số luồng chạy song song (1x–10x).',
          'Hỗ trợ đầy đủ 3 nút điều khiển: Tạm dừng (Pause), Tiếp tục (Resume) và Dừng hẳn (Hard Stop). Nếu chạm giới hạn 429, trình quét tự động Tạm dừng (Auto-Pause) để bảo toàn danh sách chương chưa quét.',
        ],
      },
    ],
  },
  {
    id: 'batch_queue',
    title: '6. Hàng Đợi Dịch & Biên Tập AI Đa Luồng (1x–10x)',
    badge: 'Đa luồng 1x–10x',
    icon: <Layers className="h-4 w-4" />,
    summary:
      'Vận hành hàng đợi Dịch Mới hoặc Biên Tập AI từ 1x đến 10x luồng song song, tích hợp thanh chọn nhanh Thinking Level, điều khiển Tạm dừng / Tiếp tục / Dừng hẳn và khôi phục chương lỗi 1-Click.',
    highlights: [
      '2 chế độ hàng loạt: Dịch Đã Chọn (Dịch mới 100%) & Biên Tập Đã Chọn (Chuốt mượt + sửa xưng hô)',
      'Điều khiển 3 trạng thái: Tạm dừng (Pause) • Tiếp tục (Resume) • Dừng hẳn / Hủy ngay (Hard Stop)',
      'Tự động Tạm dừng (Auto-Pause) khi hết hạn mức 429 & Thanh 1-Click chạy lại chương lỗi / chương kẹt',
    ],
    steps: [
      {
        heading: 'Cách chạy Hàng Đợi Dịch & Biên Tập Đa Luồng ở cột trái',
        items: [
          'Tick chọn các chương cần xử lý (có thể dùng nút "Tất cả", "Chưa dịch", "Có lỗi QA", hoặc chọn nhanh theo khoảng "Từ chương X -> Y").',
          'Chọn mức suy luận Thinking Level (minimal / low / medium / high) ngay trên thanh công cụ Hàng Đợi và chọn số luồng song song (1x đến 10x).',
          'Nhấn "Dịch Đã Chọn" để dịch mới hoặc "Biên Tập Đã Chọn": nếu chương đã khớp 1:1 và chỉ sót lỗi nhỏ, hệ thống chỉ gửi các block lỗi; nếu chương bị báo QA Lệch Đoạn, hệ thống tự động gửi TOÀN BỘ CHƯƠNG để AI căn chỉnh lại đúng 1:1 từ đầu đến cuối.',
        ],
      },
      {
        heading: 'Kiểm soát an toàn & Khôi phục lỗi tức thì',
        items: [
          'Tạm dừng (Pause) / Tiếp tục (Resume): Cho phép nghỉ giữa chừng để thêm Key hoặc đổi Model/Thinking Level rồi chạy tiếp ngay vị trí đang dở.',
          'Dừng hẳn (Hard Stop): Ngắt ngay lập tức mọi kết nối mạng đang chạy và trả chương đang xử lý dở về trạng thái an toàn.',
          'Thanh khôi phục 1-Click: Khi có chương lỗi hoặc bị kẹt trạng thái đang xử lý, nhấn nút "Chạy lại N chương lỗi" hoặc "Đặt lại trạng thái" ngay trên thanh cảnh báo màu hổ phách.',
        ],
      },
    ],
  },
  {
    id: 'bilingual_editor',
    title: '7. Biên Tập Song Ngữ 1:1 Block-ID & Trợ Lý AI',
    badge: 'Biên tập 1:1',
    icon: <Columns className="h-4 w-4" />,
    summary:
      'Bảng biên tập khóa dòng 1:1 (TITLE, P0001..Pxxxx) với khung nhập tự giãn chiều cao, thanh công cụ ghim cố định, bộ nút căn chỉnh đoạn (Gộp, Tách, Đẩy, Kéo) và nút AI biên tập tự động căn lại cả chương khi lệch đoạn hoặc dọn sạch các block lỗi.',
    highlights: [
      'Khóa cứng từng cặp đoạn văn Nguyên tác (Trái) — Bản dịch (Phải) theo mã TITLE, P0001..Pxxxx',
      'Thanh công cụ ghim cố định: Undo/Redo 60 bước, Chuẩn hóa câu, Lọc Block lỗi, Tìm & Thay thế trong chương',
      'Tự động gửi CẢ CHƯƠNG để căn lại 1:1 nếu bị QA Lệch Đoạn, hoặc chỉ gửi riêng các Block lỗi nếu đã khớp 1:1',
    ],
    steps: [
      {
        heading: 'Các công cụ căn chỉnh cấu trúc đoạn 1:1 ngay trên từng dòng Pxxxx',
        items: [
          'Gộp ↓: Gộp đoạn tiếng Việt hiện tại với đoạn kế tiếp bên dưới (kéo các đoạn dưới lên 1 nhịp).',
          'Tách ↵ (hoặc nhấn Ctrl + Enter tại vị trí con trỏ): Tách đoạn đang chọn thành 2 đoạn độc lập (đẩy các đoạn dưới xuống 1 nhịp).',
          'Đẩy ↓ / Kéo ↑: Chèn 1 ô trống để đẩy các đoạn dưới xuống 1 nhịp, hoặc xóa ô dịch dư để kéo các đoạn dưới lên 1 nhịp.',
          'Xóa Hán & AI Dịch Block: Xóa sạch chữ Hán còn sót trong đoạn chỉ với 1 click, hoặc yêu cầu AI dịch lại riêng đoạn Pxxxx đó.',
        ],
      },
      {
        heading: 'Trợ lý AI Tinh Chỉnh: Gửi Cả Chương Khi Lệch Đoạn vs Dọn Riêng Block Lỗi',
        items: [
          'Khi chương bị báo QA Lệch Đoạn (số đoạn dịch khác số đoạn gốc): Nhấn "AI biên tập" (hoặc "AI Căn Lại & Biên Tập Cả Chương") sẽ tự động gửi TOÀN BỘ CHƯƠNG (nguyên tác + bản dịch hiện có) để AI phân bổ, tách/gộp lại khớp chính xác 1:1 từng mã P0001..Pxxxx mà không bị dịch lặp đoạn cuối.',
          'Khi chương đã khớp đoạn 1:1: Nhấn "AI Dọn Block Lỗi" sẽ chỉ gom riêng các đoạn còn sót chữ Hán / lọt tiếng Anh gửi cho AI làm sạch nhanh trong 1 lượt.',
          'Trợ lý vùng bôi đen: Bôi đen câu chữ bất kỳ rồi nhấn "Chuốt mượt", "Sửa xưng hô", "3 Gợi ý" hoặc "Lệnh AI..." để yêu cầu AI sửa theo ý muốn.',
        ],
      },
    ],
  },
  {
    id: 'qa_search',
    title: '8. Kiểm Định Chất Lượng (QA Scanner) & Tìm Toàn Văn',
    badge: 'QA & Tìm kiếm',
    icon: <ShieldCheck className="h-4 w-4" />,
    summary:
      'Hệ thống tự động quét kiểm định chất lượng theo thời gian thực (Sót chữ Hán, Rò rỉ tiếng Anh, Lệch đoạn 1:1, Từ cấm & Lệch thuật ngữ) kết hợp công cụ Tìm kiếm & Thay thế toàn bộ chương.',
    highlights: [
      'Tô sáng trực tiếp vị trí từ lỗi ngay dưới từng đoạn văn Pxxxx có cảnh báo',
      'Tùy biến bật/tắt từng quy tắc kiểm định QA và danh sách từ cấm riêng',
      'Tìm Kiếm Toàn Văn & Thay Thế Hàng Loạt Chương (hỗ trợ Regex, nhảy tới chương & tick chọn chương khớp)',
    ],
    steps: [
      {
        heading: '4 Nhóm tiêu chí kiểm định tự động của QA Scanner',
        items: [
          '1. Sót chữ Hán (Residual Chinese): Phát hiện mọi ký tự CJK còn sót trong tiêu đề và nội dung dịch.',
          '2. Rò rỉ tiếng Anh (English Leak): Bắt các từ tiếng Anh hiện đại do AI vô tình sinh ra trong văn cảnh cổ trang/tiên hiệp.',
          '3. Lệch cấu trúc đoạn 1:1 (Block Alignment): Cảnh báo khi có đoạn nguyên tác bị bỏ trống bản dịch.',
          '4. Từ cấm & Thuật ngữ bắt buộc (Banned Words & Glossary): Phát hiện từ nằm trong danh sách cấm hoặc dịch sai thuật ngữ bắt buộc.',
        ],
      },
      {
        heading: 'Tìm Kiếm Toàn Văn & Thay Thế Hàng Loạt (Nút "Tìm Toàn Văn" ở cột trái)',
        items: [
          'Tra cứu từ khóa tiếng Việt hoặc chữ Hán xuyên suốt toàn bộ chương, các chương đã tick, hoặc chương hiện tại.',
          'Nhấn vào kết quả để nhảy thẳng tới chương đó, nhấn "Tick chọn các chương khớp", hoặc chuyển sang tab Thay Thế để sửa đồng loạt.',
        ],
      },
    ],
  },
  {
    id: 'reader',
    title: '9. Chế Độ Đọc Sạch (Justify), Màu HEX/RGB & Highlight',
    badge: 'Đọc & Highlight',
    icon: <BookOpen className="h-4 w-4" />,
    summary:
      'Không gian đọc sách căn đều hai lề (justify) chuẩn xuất bản, tùy chỉnh màu nền/chữ HEX & RGB, nạp font chữ cá nhân (.ttf/.otf/.woff2), đánh dấu Highlight 3 màu kèm ghi chú và lưu Bookmark.',
    highlights: [
      'Căn đều hai lề (text-align: justify) + tùy chỉnh cỡ chữ, giãn dòng, khoảng cách đoạn và độ rộng trang',
      '4 giao diện mẫu + bảng chọn màu HEX/RGB tự do + nạp Font chữ cá nhân (.ttf/.otf/.woff2)',
      'Bôi đen văn bản để tạo Highlight 3 màu kèm Ghi chú & Lưu vị trí đọc (Bookmark % cuộn trang)',
    ],
    steps: [
      {
        heading: 'Tùy biến giao diện đọc & Font cá nhân',
        items: [
          'Chuyển sang chế độ "Đọc" ở thanh công cụ trên cùng, nhấn biểu tượng Bảng màu (hoặc nút "Màu & Font" ở cuối chương).',
          'Chọn 1 trong 4 mẫu giấy cổ điển (Giấy Tuyên Thành, Trắng Sứ, Xanh Trúc, Đêm Mặc Huyền) hoặc nhập mã màu HEX/RGB tùy ý.',
          'Nhấn "Tải Font (.ttf/.otf/.woff2)" để nạp font chữ yêu thích từ máy tính vào trình đọc.',
        ],
      },
      {
        heading: 'Sổ Tay Highlight 3 Màu & Lưu Vị Trí Đọc (Bookmark)',
        items: [
          'Khi đang đọc, bôi đen bất kỳ câu chữ nào để thanh Highlight hiện ra -> nhập ghi chú (tùy chọn) -> chọn màu Vàng Hổ Phách, Xanh Ngọc Bích hoặc Đỏ Chu Sa.',
          'Nhấn "Sổ Tay Highlight" ở góc phải thanh phụ để xem lại toàn bộ trích dẫn và ghi chú.',
          'Nhấn "Lưu vị trí đọc" để lưu lại chương và % vị trí cuộn trang; nhấn "Đọc tiếp Chương #..." để nhảy về đúng vị trí đang đọc dở.',
        ],
      },
    ],
  },
  {
    id: 'export_backup',
    title: '10. Xuất Sách EPUB 3.3, TXT & Sao Lưu Dự Án .ZIP (v5)',
    badge: 'EPUB 3.3 & Backup',
    icon: <Download className="h-4 w-4" />,
    summary:
      'Đóng gói sách điện tử EPUB 3.3 chuẩn quốc tế (tự động dịch tiêu đề thiếu bằng AI, nhúng ảnh bìa, mục lục tự động, căn đều 2 lề), xuất ZIP TXT, TXT gộp và Sao lưu/Khôi phục toàn bộ dự án bằng gói .ZIP Backup v5.',
    highlights: [
      'Tự động phát hiện & dịch toàn bộ tiêu đề chương còn thiếu sang tiếng Việt bằng AI trước khi xuất sách',
      'Xuất sách điện tử .EPUB 3.3, gói .ZIP chứa từng file .TXT (XXXX_), hoặc 1 file .TXT gộp toàn truyện',
      'Sao lưu & Khôi phục toàn diện dự án theo chuẩn .ZIP Backup v5 (gồm chương, từ điển, preset, bìa & font)',
    ],
    steps: [
      {
        heading: 'Tab 1 — Xuất Sách Đọc (EPUB 3.3 / ZIP TXT / TXT Gộp)',
        items: [
          'Nhấn nút "Xuất & Sao lưu" ở góc phải trên cùng.',
          'Nếu còn chương chưa dịch tiêu đề tiếng Việt, nhấn nút "Dịch tự động N tiêu đề chương bằng AI" ngay trong cửa sổ Xuất.',
          'Chọn định dạng (EPUB 3.3, ZIP chứa các file TXT, hoặc 1 file TXT gộp), chọn phạm vi chương và chế độ trình bày (Chỉ Tiếng Việt hoặc Song ngữ Trung - Việt xen kẽ từng đoạn).',
        ],
      },
      {
        heading: 'Tab 2 — Sao Lưu & Khôi Phục Dự Án Toàn Diện (.ZIP Backup v5)',
        items: [
          'Nhấn "Tải Gói Sao Lưu Dự Án (.ZIP v5)" để đóng gói toàn bộ tiểu thuyết, chương mục, từ điển, highlight, ảnh bìa và font cá nhân thành 1 file .zip duy nhất.',
          'Để khôi phục trên máy khác, chỉ cần mở Tab 2 (hoặc cửa sổ Thư Viện) và chọn file .zip Backup v5 đã lưu.',
        ],
      },
    ],
  },
  {
    id: 'terminal_shortcuts',
    title: '11. System Terminal Thời Gian Thực & Phím Tắt',
    badge: 'Terminal & Phím tắt',
    icon: <Terminal className="h-4 w-4" />,
    summary:
      'Theo dõi trực tiếp mọi gói tin AI, thời gian phản hồi, Model thực tế (modelUsed), mức suy luận (thinkingLevelUsed) và trạng thái Key Pool qua System Terminal (Ctrl + `) cùng hệ thống phím tắt.',
    highlights: [
      'System Terminal hợp nhất nhật ký Client & Server theo thời gian thực (mở nhanh bằng Ctrl + `)',
      'Hiển thị rõ modelUsed, thinkingLevelUsed, thời gian xử lý (ms) và Key đang cấp phát cho từng luồng',
      'Tích hợp bộ phím tắt toàn cục giúp thao tác biên tập và chuyển chương cực nhanh',
    ],
    steps: [
      {
        heading: 'Sử dụng System Terminal & Chẩn Đoán Kỹ Thuật',
        items: [
          'Nhấn nút "Terminal" ở góc phải dưới màn hình hoặc nhấn tổ hợp phím Ctrl + ` để bật/tắt bảng điều khiển.',
          'Lọc nhật ký theo phân hệ (TRANSLATE, AI_EDITOR, GLOSSARY_EXTRACT, KEY_POOL,QA, IMPORT_EXPORT) hoặc theo mức độ (INFO, SUCCESS, WARN, ERROR).',
          'Bấm mở rộng từng bản ghi để xem chi tiết Trace kỹ thuật (Model yêu cầu, Model thực tế, Mức suy luận Thinking Level, Key Mask và độ trễ).',
        ],
      },
      {
        heading: 'Bảng Phím Tắt Toàn Cục',
        items: [
          'Ctrl + S (hoặc Cmd + S): Lưu ngay chương đang biên tập vào cơ sở dữ liệu.',
          'Ctrl + Z / Ctrl + Y: Hoàn tác (Undo) / Làm lại (Redo) trong bảng biên tập 1:1.',
          'Ctrl + Enter: Tách đoạn văn (Block Pxxxx) đang đặt con trỏ thành 2 đoạn độc lập tại đúng vị trí con trỏ.',
          'Alt + Mũi tên Trái / Alt + Mũi tên Phải: Chuyển nhanh sang Chương trước / Chương tiếp theo (tự động cuộn lên đầu chương).',
          'Ctrl + `: Bật / Tắt ngăn kéo System Terminal thời gian thực.',
        ],
      },
    ],
  },
];

const FULL_MARKDOWN_CONTENT = `# Cẩm Nang Vận Hành Toàn Diện — Mặc Hương Các Studio

Chào mừng bạn đến với **Mặc Hương Các Studio** — không gian làm việc tích hợp chuyên biệt dành cho dịch giả, biên tập viên và độc giả tiểu thuyết Trung - Việt.

## 1. Quy Trình Nhanh 5 Bước & Không Gian Làm Việc
1. **Bước 1 (Thư Viện)**: Nhấn **Thư Viện** để chọn bộ truyện mẫu hoặc tạo dự án truyện mới.
2. **Bước 2 (Nhập Chương)**: Nhấn **Nhập Chương** để nạp nhiều file .TXT, sách .EPUB, tách 1 file .TXT gộp bằng Regex, hoặc tải từ URL.
3. **Bước 3 (Preset, Thinking Level & 50 Keys)**: Mở **Preset & Model** để chọn chỉ dẫn dịch, chọn mức suy luận **Thinking Level** (\`minimal\`, \`low\`, \`medium\`, \`high\` — mặc định \`high\`), và nạp tối đa 50 API Key.
4. **Bước 4 (Hàng Đợi Đa Luồng)**: Tick chọn chương -> chọn số luồng (\`1x–10x\`) -> nhấn **Dịch Đã Chọn** hoặc **Biên Tập Đã Chọn**.
5. **Bước 5 (Biên Tập 1:1, Đọc & Xuất Sách)**: Rà soát trên bảng khóa dòng 1:1 (\`TITLE\`, \`P0001\`..\`Pxxxx\`), kiểm tra ở chế độ **Đọc**, và nhấn **Xuất & Sao lưu** để tải sách \`.EPUB 3.3\` hoặc gói sao lưu \`.ZIP (Backup v5)\`.
- **Tự động cuộn lên đầu chương (Scroll-to-Top)**: Mỗi khi đổi chương ở cả chế độ **Biên tập bản dịch** lẫn **Đọc**, khung nội dung đều tự động cuộn về đầu chương (\`scrollTop = 0\`).

## 2. Thư Viện Truyện & Biểu Đồ Tiến Độ 3 Tầng
- **Biểu đồ tròn Donut 3 tầng**: Thống kê trực quan số chương **Đã biên tập / Đã duyệt** (Xanh ngọc), **Đã dịch chưa duyệt** (Hổ phách) và **Chưa dịch** (Xám giấy) cho toàn thư viện và từng bộ truyện.
- Hỗ trợ chuyển đổi giữa **Chế độ Thẻ (Card View)** và **Bảng Ma Trận (Table View)**, Ghim ưu tiên ⭐, Sửa thông tin & Ảnh bìa EPUB, Nhân bản (Clone) và Khôi phục từ gói \`.ZIP Backup v5\`.

## 3. Nhập Nguyên Tác (4 Nguồn) & Nhập Bản Dịch Ngoài (.TXT 1:1)
- **4 nguồn nhập nguyên tác**: (1) Nhiều file \`.txt\` theo tiền tố \`XXXX_\`, (2) Sách \`.epub\` tiếng Trung, (3) Tách 1 file \`.txt\` gộp bằng Regex có bảng Preview, (4) Dán văn bản hoặc tải trực tiếp từ URL (tự động giải mã UTF-8, GB18030, GBK).
- **Nhập bản dịch ngoài (.TXT)**: Nạp file \`.txt\` bản dịch vào chương đang mở với bảng Xem Trước Ghép Đoạn 1:1 (\`TITLE\`, \`P0001\`..\`Pxxxx\`).

## 4. Cấu Hình Model Alias, Thinking Level & Bể 50 API Key
- **Model Alias**: \`gemini-flash-latest\` (khuyên dùng), \`gemini-3.8-flash\`, \`gemini-4-argon\`, \`gemini-3.1-flash-lite\` và nhập mã Model tùy chỉnh.
- **Mức độ suy luận (\`Thinking Level\`: \`minimal\` • \`low\` • \`medium\` • \`high\`)**:
  - Tự động lấy danh sách mức suy luận từ SDK/API (\`/api/models\`), **mặc định là \`high\`**.
  - Khi gặp chương quá dài dễ bị ngắt kết nối cổng 300 giây, hãy chọn nhanh \`medium\`, \`low\` hoặc \`minimal\` ngay trên thanh Hàng Đợi cột trái hoặc trong \`Preset & Model -> Tab 3\`.
- **Bể 50 API Key lưu bền vững vào dự án**: Hỗ trợ tối đa 50 Key (\`1 Luồng = 1 Key Độc Lập\`), nút **Xóa sạch Key** trước khi Public, **Chẩn đoán Key & 5 Tuyến API**, và **Xóa Cooldown 429**.

## 5. Chỉ Dẫn Dịch (Preset), Từ Điển (Glossary) & Quét Tiền Kỳ Đa Luồng
- **Từ điển thông minh lọc ngữ cảnh 0.5ms**: Mặc định công tắc Từ điển TẮT; khi bật chỉ gửi các thuật ngữ xuất hiện trong chương và nằm trong khoảng chương hiệu lực (\`Từ chương X -> Y\`).
- **Trình Quét Dựng Từ Điển Tiền Kỳ Đa Luồng (Pre-Scan Builder)**: Quét theo gói \`1–10 chương/gói\`, chạy \`1x–10x\` luồng, hỗ trợ **Tạm dừng / Tiếp tục / Dừng hẳn** và tự động Tạm dừng khi chạm trần 429.

## 6. Hàng Đợi Dịch & Biên Tập AI Đa Luồng (1x–10x)
- Hỗ trợ **Dịch Đã Chọn** (Dịch mới 100%) và **Biên Tập Đã Chọn** (Chuốt mượt + sửa xưng hô + dọn chữ Hán).
- Trang bị nút **Tạm dừng (Pause)**, **Tiếp tục (Resume)**, **Dừng hẳn (Hard Stop)**, tự động Tạm dừng khi hết hạn mức 429 và thanh **1-Click Chạy lại chương lỗi / Đặt lại chương kẹt**.

## 7. Biên Tập Song Ngữ 1:1 Khóa Dòng Block-ID & Trợ Lý AI
- Khóa dòng 1:1 theo mã \`TITLE\`, \`P0001\`..\`Pxxxx\` với khung nhập tự giãn chiều cao và thanh công cụ ghim cố định.
- Công cụ căn chỉnh đoạn: \`Gộp ↓\`, \`Tách ↵\` (\`Ctrl + Enter\`), \`Đẩy ↓\`, \`Kéo ↑\`, \`Xóa Hán\`, \`AI Dịch Block\`.
- Nút **AI biên tập (N)** tự động dọn sạch toàn bộ các block có lỗi trong chương chỉ với 1 click (kèm nút Hủy tức thì).

## 8. Kiểm Định Chất Lượng (QA Scanner) & Tìm / Thay Thế Toàn Văn
- Tự động phát hiện: (1) Sót chữ Hán, (2) Rò rỉ tiếng Anh (\`English Leak\`), (3) Lệch đoạn 1:1, (4) Vi phạm từ cấm & thuật ngữ bắt buộc.
- Công cụ **Tìm Toàn Văn** hỗ trợ tìm kiếm & thay thế hàng loạt xuyên suốt bộ truyện (có Regex).

## 9. Chế Độ Đọc Sạch (Justify), Màu HEX/RGB, Font Cá Nhân & Highlight
- Trình bày văn bản căn đều hai lề (\`justify\`), tùy biến màu HEX/RGB, nạp font \`.ttf/.otf/.woff2\`, đánh dấu Highlight 3 màu kèm ghi chú và lưu vị trí đọc (Bookmark).

## 10. Xuất Sách Điện Tử EPUB 3.3, TXT & Sao Lưu Dự Án .ZIP (Backup v5)
- Tự động phát hiện và dịch tiêu đề chương còn thiếu bằng AI trước khi xuất sách.
- Xuất sách chuẩn **EPUB 3.3** (có ảnh bìa, mục lục tự động, CSS justify), **ZIP TXT**, **TXT Gộp**, hoặc gói **Sao lưu Dự án toàn diện \`.ZIP\` (Backup v5)**.

## 11. System Terminal Thời Gian Thực (\`Ctrl + \`\`) & Phím Tắt
- Nhấn \`Ctrl + \`\` để mở System Terminal theo dõi nhật ký Client + Server, \`modelUsed\`, \`thinkingLevelUsed\` và trạng thái Key Pool.
- Phím tắt: \`Ctrl + S\` (Lưu), \`Ctrl + Z/Y\` (Undo/Redo), \`Ctrl + Enter\` (Tách đoạn), \`Alt + ←/→\` (Chuyển chương).
`;

export default function UserGuideModal({ isOpen, onClose }: UserGuideModalProps) {
  const [activeSectionId, setActiveSectionId] = useState<string>(GUIDE_SECTIONS[0].id);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedMarkdown, setCopiedMarkdown] = useState<boolean>(false);

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return GUIDE_SECTIONS;
    return GUIDE_SECTIONS.filter((sec) => {
      const inTitle = sec.title.toLowerCase().includes(q);
      const inSummary = sec.summary.toLowerCase().includes(q);
      const inHighlights = sec.highlights.some((h) => h.toLowerCase().includes(q));
      const inSteps = sec.steps.some(
        (st) =>
          st.heading.toLowerCase().includes(q) ||
          st.items.some((it) => it.toLowerCase().includes(q))
      );
      return inTitle || inSummary || inHighlights || inSteps;
    });
  }, [searchQuery]);

  const currentSection = useMemo(() => {
    return (
      filteredSections.find((s) => s.id === activeSectionId) ||
      filteredSections[0] ||
      GUIDE_SECTIONS[0]
    );
  }, [filteredSections, activeSectionId]);

  if (!isOpen) return null;

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(FULL_MARKDOWN_CONTENT);
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2200);
    } catch {
      // Fallback ignored
    }
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([FULL_MARKDOWN_CONTENT], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'HUONG_DAN_SU_DUNG_MAC_HUONG_CAC_STUDIO.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-xs sm:p-5">
      <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[#E5DEC9] bg-[#FBF8F1] text-[#1C1917] shadow-2xl">
        {/* Top Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5DEC9] bg-[#F3EFE6] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#8C2D19] text-white shadow-xs">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-lg font-bold text-[#1C1917]">
                  Cẩm Nang Vận Hành Toàn Diện — Mặc Hương Các Studio
                </h2>
                <span className="rounded-md bg-[#8C2D19]/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#8C2D19]">
                  11 Chuyên Mục • Đồng Bộ Luồng Hiện Tại
                </span>
              </div>
              <p className="text-xs text-[#605A52]">
                Hướng dẫn chi tiết từ Nhập liệu, Thinking Level (minimal/low/medium/high), Bể 50 Key, Hàng đợi Đa luồng đến Biên tập 1:1 &amp; Xuất EPUB 3.3
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyMarkdown}
              className="flex items-center gap-1.5 rounded-lg border border-[#D6CFC2] bg-white px-3 py-1.5 text-xs font-medium text-[#1C1917] transition hover:bg-[#F3EFE6]"
              title="Sao chép toàn bộ nội dung hướng dẫn dạng Markdown"
            >
              {copiedMarkdown ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#1E6F50]" />
                  <span className="text-[#1E6F50]">Đã chép Markdown</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-[#605A52]" />
                  <span>Chép tài liệu (.MD)</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadMarkdown}
              className="flex items-center gap-1.5 rounded-lg bg-[#8C2D19] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#722211]"
              title="Tải file HUONG_DAN_SU_DUNG.md về máy tính"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Tải File .MD</span>
            </button>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#605A52] transition hover:bg-[#E5DEC9]/60 hover:text-[#1C1917]"
              aria-label="Đóng hướng dẫn"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body Layout: Left Navigation + Right Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar TOC */}
          <aside className="flex w-72 shrink-0 flex-col border-r border-[#E5DEC9] bg-[#F3EFE6]/70">
            <div className="border-b border-[#E5DEC9] p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#605A52]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm tính năng (VD: thinking, 50 key, epub...)"
                  className="w-full rounded-lg border border-[#D6CFC2] bg-white py-1.5 pr-7 pl-8 text-xs text-[#1C1917] placeholder:text-[#605A52]/70 focus:border-[#8C2D19] focus:outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-xs text-[#605A52] hover:text-[#1C1917]"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto p-2.5">
              {filteredSections.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#605A52]">
                  Không tìm thấy mục hướng dẫn nào khớp với từ khóa &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                filteredSections.map((section) => {
                  const isActive = section.id === currentSection.id;
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSectionId(section.id)}
                      className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition ${
                        isActive
                          ? 'bg-[#8C2D19] text-white shadow-xs'
                          : 'text-[#1C1917] hover:bg-[#E5DEC9]/60'
                      }`}
                    >
                      <span
                        className={`mt-0.5 shrink-0 ${
                          isActive ? 'text-white' : 'text-[#8C2D19]'
                        }`}
                      >
                        {section.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold">
                          {section.title}
                        </div>
                        <span
                          className={`mt-1 inline-block rounded px-1.5 py-0.5 font-mono text-[10px] ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-[#E5DEC9] text-[#605A52]'
                          }`}
                        >
                          {section.badge}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-[#E5DEC9] bg-[#F3EFE6] px-3.5 py-2.5 text-[11px] text-[#605A52]">
              Mẹo: Nhấn <kbd className="rounded border border-[#D6CFC2] bg-white px-1.5 py-0.5 font-mono text-[10px] text-[#1C1917]">Ctrl + `</kbd> bất kỳ lúc nào để mở <strong>System Terminal</strong>.
            </div>
          </aside>

          {/* Right Detailed Content */}
          <main className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-3xl space-y-6">
              {/* Section Banner */}
              <div className="rounded-xl border border-[#E5DEC9] bg-[#F3EFE6]/80 p-5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#8C2D19] px-2.5 py-1 font-mono text-xs font-semibold text-white">
                    {currentSection.icon}
                    {currentSection.badge}
                  </span>
                </div>
                <h3 className="mt-2.5 font-serif text-xl font-bold text-[#1C1917]">
                  {currentSection.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#605A52]">
                  {currentSection.summary}
                </p>

                {/* Key Highlights */}
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {currentSection.highlights.map((hl, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] p-2.5 text-xs text-[#1C1917]"
                    >
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1E6F50]" />
                      <span className="leading-snug font-medium">{hl}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detailed Step-by-Step Blocks */}
              <div className="space-y-4">
                {currentSection.steps.map((stepGroup, groupIdx) => (
                  <div
                    key={groupIdx}
                    className="rounded-xl border border-[#E5DEC9] bg-white p-5 shadow-2xs"
                  >
                    <h4 className="font-serif text-base font-bold text-[#8C2D19]">
                      {stepGroup.heading}
                    </h4>
                    <ul className="mt-3 space-y-2.5">
                      {stepGroup.items.map((item, itemIdx) => (
                        <li
                          key={itemIdx}
                          className="flex items-start gap-2.5 text-xs leading-relaxed text-[#1C1917] sm:text-sm"
                        >
                          <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#8C2D19]/12 font-mono text-[10px] font-bold text-[#8C2D19]">
                            {itemIdx + 1}
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {/* Pro Tips if available */}
              {currentSection.tips && currentSection.tips.length > 0 && (
                <div className="rounded-xl border border-[#1E6F50]/30 bg-[#1E6F50]/8 p-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#1E6F50]">
                    💡 Kinh nghiệm vận hành thực tế
                  </div>
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[#1C1917]">
                    {currentSection.tips.map((tip, idx) => (
                      <li key={idx}>• {tip}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Modal Footer Navigation */}
        <div className="flex items-center justify-between border-t border-[#E5DEC9] bg-[#F3EFE6] px-5 py-3">
          <div className="text-xs text-[#605A52]">
            Đang xem mục{' '}
            <strong className="text-[#1C1917]">
              {GUIDE_SECTIONS.findIndex((s) => s.id === currentSection.id) + 1} /{' '}
              {GUIDE_SECTIONS.length}
            </strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const idx = GUIDE_SECTIONS.findIndex((s) => s.id === currentSection.id);
                if (idx > 0) setActiveSectionId(GUIDE_SECTIONS[idx - 1].id);
              }}
              disabled={GUIDE_SECTIONS.findIndex((s) => s.id === currentSection.id) <= 0}
              className="rounded-lg border border-[#D6CFC2] bg-white px-3 py-1.5 text-xs font-medium text-[#1C1917] transition hover:bg-[#E5DEC9]/50 disabled:opacity-40"
            >
              ← Mục trước
            </button>
            <button
              onClick={() => {
                const idx = GUIDE_SECTIONS.findIndex((s) => s.id === currentSection.id);
                if (idx < GUIDE_SECTIONS.length - 1) {
                  setActiveSectionId(GUIDE_SECTIONS[idx + 1].id);
                }
              }}
              disabled={
                GUIDE_SECTIONS.findIndex((s) => s.id === currentSection.id) >=
                GUIDE_SECTIONS.length - 1
              }
              className="rounded-lg bg-[#8C2D19] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#722211] disabled:opacity-40"
            >
              Mục tiếp theo →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
