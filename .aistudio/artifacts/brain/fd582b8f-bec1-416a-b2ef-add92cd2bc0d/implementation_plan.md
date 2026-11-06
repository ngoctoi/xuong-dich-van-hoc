# Mặc Hương Các Studio — Kế Hoạch Nâng Cấp Kiến Trúc Chọn Lọc (v2.0)

Bản kế hoạch nâng cấp này tích hợp những tinh hoa thực chiến từ hệ thống *Xưởng Dịch Hán Việt (v1.14.2)* vào kiến trúc hiện tại của **Mặc Hương Các**, tập trung vào **Structured Output theo Block ID (`TITLE`, `P0001`...)**, **Phát hiện chương lỗi đa tiêu chí để Dịch lại hoặc Biên tập AI theo từng đoạn lỗi**, **Tách đôi Thư viện Preset Dịch & Biên tập AI (Glossary mặc định tắt)**, **Nhập bản dịch `.TXT` ngoài có Preview ghép đoạn**, **Highlight & Ghi chú trong Trình đọc**, và **Sao lưu/Phục hồi dự án `.ZIP Backup v5` kèm Ảnh bìa EPUB**.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Toàn bộ các lựa chọn của bạn đã được chuẩn hóa thành quy tắc kiến trúc cốt lõi dưới đây:

- **1. Structured Output theo Block ID (`blocks-v1`) & Dọn lỗi chính xác từng đoạn (`updates`)**:
  - **Khi dịch chương (`1 Request = 1 Chương`)**: Tách nguyên văn chương tiếng Trung thành mảng các khối định danh `blocks: [{ id: "TITLE", source }, { id: "P0001", source }, ...]` và khóa chặt `responseSchema` của Gemini để bắt buộc trả về đúng từng `id`. Nhờ vậy bản dịch luôn khớp đoạn 1:1 với bản gốc và phát hiện được ngay nếu AI bỏ sót đoạn hoặc làm lệch cấu trúc.
  - **Khi Biên tập bằng AI**: Hỗ trợ cả **Biên tập AI toàn chương (`{ translation }`)** và **AI Dọn lỗi Hán / Từ tiếng Anh / Lệch đoạn theo Block ID (`{ updates: [{ id, translation }] }`)** — chỉ gửi đúng những block bị lỗi kèm 1 block ngữ cảnh liền kề, giữ nguyên tuyệt đối 100% các đoạn văn đã dịch sạch.
- **2. Bộ Kiểm Định Chất Lượng (QA) Đa Tiêu Chí & Đưa Đi Dịch Lại / Biên Tập AI Hàng Loạt**:
  - Tự động phát hiện và phân loại các chương lỗi: **(a) Còn sót chữ Hán**, **(b) Lọt từ tiếng Anh (`"But"`, `"and"`, `"the"`, `"with"`, `"however"`...)**, **(c) Không khớp số đoạn (`Block ID Mismatch` giữa Raw và Dịch)**, **(d) Tỷ lệ độ dài bất thường (`minLengthRatio` / `maxLengthRatio`)**, **(e) Lặp đoạn văn**, **(f) Dừng cụt giữa câu**, và **(g) Tiêu đề sai chuẩn `Chương N: ...`**.
  - Tại bảng chương hoặc thanh QA, người dùng có thể lọc nhanh các chương bị lỗi, bấm **Chỉ chọn kết quả lọc** rồi đưa thẳng vào **Dịch lại hàng loạt** hoặc **Biên tập AI hàng loạt**.
- **3. Hai Thư Viện Preset Instructions Độc Lập (Phụ lục A & B) & Bảng Glossary Mặc Định TẮT**:
  - Tách riêng **Thư viện Preset Dịch** và **Thư viện Preset Biên Tập AI** (tích hợp sẵn bộ quy tắc chuẩn hóa từ Phụ lục A & B: bảo toàn ngoặc `【】《》「」`, chuẩn xác mốc nghĩa `未必` = "chưa chắc", `差点死了` = "suýt chết", tháo cấu trúc `的/把/被`, bản đồ giọng văn theo thể loại).
  - **Bảng Glossary mặc định TẮT (`includeGlossary: false`)** ở cả luồng Dịch và Biên tập AI để tiết kiệm token và tránh nhiễu; chỉ khi người dùng chủ động gạt nút **Bật gửi kèm Glossary** thì hệ thống mới đính kèm các thuật ngữ đang kích hoạt vào `systemInstruction`.
- **4. Nhập Bản Dịch Ngoài (`.TXT` / Clipboard) Vào Chương Kèm Preview Ghép Đoạn**:
  - Trong Trình biên tập, bổ sung hộp thoại **Nhập bản dịch hoàn chỉnh (`.TXT`)** cho chương đang mở: hỗ trợ chọn chế độ tách đoạn (Tự động khớp số block Raw / Theo dòng trống / Theo từng dòng), hiển thị bảng **Preview đối chiếu số block Raw vs. Dịch** (cảnh báo nếu thừa/thiếu đoạn hoặc lệch tiêu đề), áp dụng vào bản nháp (có hỗ trợ `Undo`) trước khi bấm Lưu.
- **5. Trình Đọc Tích Hợp Highlight 3 Màu, Ghi Chú (`Notes`) & Tự Lưu Vị Trí Đọc**:
  - Hỗ trợ bôi đen đoạn văn trong Trình đọc để tô sáng 3 màu (`Vàng Hổ Phách / Amber`, `Xanh Ngọc Bích / Jade`, `Xanh Thanh Hoa / Blue`) kèm ghi chú cá nhân, tự động neo theo văn bản (`quote + offset`) và lưu vị trí cuộn đọc dở (`scroll progress + bookmark`) của từng bộ truyện.
- **6. Sao Lưu & Phục Hồi Toàn Bộ Dự Án (`.ZIP Backup v5`) + Ảnh Bìa EPUB (`cover.png/jpg`)**:
  - Cho phép tải ảnh bìa EPUB (`cover.png` / `cover.jpg`) lưu bền vững theo dự án để nhúng vào `OEBPS/cover.xhtml` khi xuất W3C EPUB 3.3.
  - Bổ sung chức năng **Sao lưu & Phục hồi Dự án (`.ZIP Backup v5`)** chứa trọn vẹn `manifest.json`, `source/`, `translation/`, lịch sử chỉnh sửa, cả 2 thư viện Preset Dịch & Biên tập, Glossary, Highlights, Font cá nhân và Ảnh bìa EPUB.

---

## 1. Overview & Core Concept

- **What It Does**: Nâng cấp **Mặc Hương Các** thành một hệ thống dịch thuật, kiểm định chất lượng (QA), biên tập đối chiếu theo từng Block ID và xuất bản sách điện tử cấp độ xuất bản chuyên nghiệp.
- **Target Audience / Persona**: Dịch giả, biên tập viên văn học mạng Trung – Việt và người đọc cần kiểm soát chặt chẽ chất lượng hàng nghìn chương truyện mà không lo sót chữ Hán, lọt từ tiếng Anh, lệch đoạn hay mất dữ liệu khi chuyển máy.
- **Key Value**:
  - **Khớp đoạn 100% nhờ giao thức Block ID (`TITLE`, `P0001`...)**: Loại bỏ triệt để tình trạng AI tự ý gộp hoặc bỏ sót đoạn văn ở cuối chương dài.
  - **Sửa lỗi QA thông minh theo từng Block**: Khi chương chỉ lỗi ở 2 đoạn văn, AI chỉ sửa đúng 2 mã `Pxxxx` đó thay vì phải dịch lại cả chương 4.000 chữ.
  - **Kiểm soát ngữ cảnh tuyệt đối**: Tách biệt hoàn toàn Preset Dịch và Preset Biên tập AI; Glossary mặc định tắt và chỉ gửi khi người dùng bật.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Quản lý 2 Thư viện Preset & Bật/Tắt Glossary**: Mở bảng *Instructions & Glossary* -> Chọn tab *Preset Dịch* hoặc *Preset Biên Tập AI* (nhập/xuất `.md`, nhân bản, chỉnh sửa) -> Công tắc **Gửi kèm Glossary trong Request** mặc định ở trạng thái **TẮT** (chỉ gửi khi gạt BẬT).
  2. **Dịch chương theo chuẩn `blocks-v1`**: Chọn chương -> Hệ thống tự động tách nguyên văn thành `TITLE`, `P0001`, `P0002`... -> Gửi 1 request duy nhất với `ThinkingLevel.HIGH` và `maxOutputTokens: 65536` -> Kiểm tra đủ ID -> Ghép lại thành văn bản và lưu mảng ánh xạ `alignment` (`blockEnds`).
  3. **Rà soát QA mở rộng & Xử lý chương lỗi hàng loạt**: Tại thanh lọc chương hoặc bảng *Kiểm định QA*, lọc theo: `Còn Hán hoặc Tiếng Anh`, `Lệch số đoạn (Block Mismatch)`, `Tỷ lệ độ dài bất thường`, `Lặp đoạn`, hoặc `Dừng giữa câu` -> Bấm **Chỉ chọn kết quả lọc** -> Chọn **Dịch lại các chương lỗi** hoặc **Chạy Biên tập AI hàng loạt (Dọn theo Block ID / Chuốt toàn chương)**.
  4. **Đối chiếu theo Block ID & Nhập bản dịch ngoài (`.TXT`)**: Trong *Biên Tập Studio* hoặc *Đối Chiếu Song Ngữ*, từng hàng hiển thị nhãn `TITLE`, `P0001`, `P0002` căn thẳng hàng giữa tiếng Trung và tiếng Việt. Bấm **Nhập bản dịch ngoài (.TXT)** để nạp một bản dịch có sẵn bên ngoài vào chương hiện tại kèm màn hình Preview kiểm tra độ khớp đoạn.
  5. **Đọc sách, Tô sáng (Highlight) & Ghi chú**: Trong *Đọc Sạch (Justify)*, bôi đen câu văn bất kỳ để gắn Highlight 3 màu (`Amber`, `Jade`, `Blue`) và viết ghi chú; mở ngăn *Ghi chú & Đánh dấu* bên phải để nhảy nhanh tới vị trí đã đánh dấu; tự động nhớ vị trí cuộn khi mở lại chương.
  6. **Đóng gói Bìa EPUB 3.3 & Sao lưu `.ZIP Backup v5`**: Trong hộp thoại *Xuất Bản & Sao Lưu*, tải lên ảnh bìa EPUB (`cover.png/jpg`), xuất sách `.epub` chuẩn W3C EPUB 3.3, hoặc xuất/khôi phục gói **`.ZIP Backup v5`** toàn dự án.
- **Visual Identity & Theme**:
  - Giữ vững phong cách **Warm Paper & Scholarly Ink (Giấy Tuyên Chỉ & Mặc Hương)** hiện tại (`#FBF8F1`, `#F3EFE6`, điểm nhấn Chu Sa `#8C2D19`, Thanh Ngọc `#1E6F50`, Hổ Phách `#B45309`).
  - Mọi con số thống kê, mã chương `0001`, mã đoạn `P0001` và tỷ lệ độ dài đều dùng font monospace tabular numerals (`JetBrains Mono`, `tabular-nums`) để căn thẳng cột tuyệt đối.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Áp dụng Structured Output theo Block ID (`blocks-v1`) nhưng vẫn giữ `1 Request = 1 Chương`**
  - *Chosen Approach*: Tách chương tiếng Trung thành mảng `{ id: "TITLE" | "P0001"..., source: string }` trước khi gửi lên `/api/translate`, yêu cầu Gemini trả về `{ blocks: [{ id, translation }] }`, kiểm tra đủ và đúng thứ tự ID rồi ghép lại thành văn bản hoàn chỉnh kèm metadata `alignment`.
  - *Why*: Vẫn tuân thủ tuyệt đối nguyên tắc 1 request trọn 1 chương, nhưng khắc phục hoàn toàn việc AI tự ý gộp đoạn làm lệch khung đối chiếu song ngữ và giúp phát hiện ngay nếu AI bỏ sót bất kỳ đoạn nào.
- **Decision 2: AI Biên tập hỗ trợ song song chế độ Toàn chương (`{translation}`) và chế độ Theo Block ID lỗi (`{updates}`)**
  - *Chosen Approach*: Khi người dùng chọn "Dọn chữ Hán & từ tiếng Anh theo Block ID", ứng dụng tự động lọc các block `Pxxxx` chứa ký tự Hán hoặc từ tiếng Anh lọt câu, gửi kèm 1 block ngữ cảnh trước/sau sang `/api/editor/assist`, và chỉ cập nhật đúng những block đó.
  - *Why*: Không làm biến dạng các đoạn văn đã dịch hay và giảm thời gian chờ đợi khi sửa lỗi QA trên hàng chục chương.
- **Decision 3: Bảng Glossary mặc định TẮT (`includeGlossary: false`)**
  - *Chosen Approach*: Đặt giá trị mặc định `includeGlossary = false` cho mọi dự án và hồ sơ Preset (cả Dịch và Biên tập AI), hiển thị công tắc bật/tắt rõ ràng ngay trên thanh công cụ và trong hộp thoại cấu hình.
  - *Why*: Đúng theo yêu cầu của bạn — chỉ khi người dùng chủ động bật mới gửi bảng Glossary đi trong request.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                           MẶC HƯƠNG CÁC STUDIO (NEXT.JS 15)                            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Top Bar: [Brand + Dự Án] ─── [Biên Tập | Đối Chiếu ID | Đọc Sạch] ─── [Công Cụ/Xuất] │
├───────────────────────────┬────────────────────────────────────────────────────────────┤
│ CỘT TRÁI: QUẢN LÝ CHƯƠNG  │ KHÔNG GIAN LÀM VIỆC CHÍNH (MAIN WORKSPACE)                 │
│                           │                                                            │
│ • Tìm kiếm + Lọc Khoảng   │ 1. BIÊN TẬP STUDIO & ĐỐI CHIẾU BLOCK ID (TITLE, P0001...)  │
│   Prefix (Từ X -> Y)      │    ├─ Thanh công cụ: Undo/Redo, Cut/Copy, Find & Replace   │
│ • Bộ lọc QA Đa Tiêu Chí:  │    ├─ Nút "Nhập Bản Dịch Ngoài (.TXT)" + Preview ghép đoạn │
│   - Còn chữ Hán           │    ├─ Thanh Biên Tập AI (Chọn Preset Biên Tập riêng):      │
│   - Lọt từ Tiếng Anh      │    │   • AI Dọn Hán/Anh theo đúng Block ID lỗi ({updates}) │
│   - Lệch đoạn (Mismatch)  │    │   • AI Chuốt mượt / Sửa xưng hô / Xử lý cảnh báo QA   │
│   - Tỷ lệ dài bất thường  │    └─ Khung soạn thảo 2 cột căn thẳng theo mã P0001..Pxxxx │
│   - Lặp đoạn / Cụt câu    │                                                            │
│ • Chọn tất / Bỏ chọn /    │ 2. TRÌNH ĐỌC SẠCH (CLEAN JUSTIFIED READER)                 │
│   Chỉ chọn kết quả lọc    │    ├─ Preset màu + HEX/RGB + Font Google/Local + Justify   │
│ • Hàng đợi 10x Luồng:     │    ├─ Bôi đen văn bản -> Highlight 3 màu + Ghi chú (Notes) │
│   - Dịch mới / Dịch lại   │    └─ Tự động lưu & khôi phục vị trí đọc (Scroll/Bookmark) │
│   - Biên tập AI hàng loạt │                                                            │
├───────────────────────────┴────────────────────────────────────────────────────────────┤
│                       HỆ THỐNG DỊCH VỤ & API SERVER (/api/*)                           │
│ • /api/translate      : Structured Output `blocks-v1` (Thinking HIGH, 65536 tokens)    │
│ • /api/editor/assist  : Whole-chapter `{translation}` & Block-ID `{updates}`           │
│ • /lib/block-engine   : Tách/ghép `TITLE`, `P0001`..., kiểm tra lệch đoạn & alignment  │
│ • /lib/qa-scanner     : Quét Hán tự, Tiếng Anh, Lệch Block, Tỷ lệ dài, Lặp đoạn        │
│ • /lib/backup-engine  : Xuất/Khôi phục `.ZIP Backup v5` + Đóng gói Bìa EPUB 3.3        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State Updates
1. **Block Alignment (`TranslationBlock` & `ChapterAlignment`)**:
   - Hàm `splitChapterIntoBlocks(titleRaw, rawContent)` tách chương thành `[{ id: 'TITLE', source }, { id: 'P0001', source }, ...]`.
   - Lưu `alignment: { blockCount, rawBlockCount, isAligned, blockEnds }` trên `Chapter` để phát hiện ngay lỗi **Không khớp số đoạn (`block_mismatch`)** nếu bản dịch có số đoạn khác với bản gốc.
2. **Dual Instruction Libraries (`translation` vs `editorial`) & Glossary Toggle**:
   - Mở rộng `InstructionProfile` thêm trường `role: 'translation' | 'editorial'` và `autoUpdate?: boolean`.
   - Khởi tạo sẵn 2 Preset mặc định chuẩn Phụ lục A (Dịch) và Phụ lục B (Biên tập AI).
   - Đặt `includeGlossary: false` làm mặc định cho cả Dịch và Biên tập AI; chỉ gửi danh sách thuật ngữ khi `includeGlossary === true`.
3. **Extended QA Report (`QAReport` & `QAIssue`)**:
   - Mở rộng `QAIssue.type`: `'chinese_residual' | 'english_leak' | 'untranslated_title' | 'block_mismatch' | 'length_ratio' | 'repeated_paragraph' | 'abrupt_ending' | 'code_fence'`.
   - Bổ sung cấu hình ngưỡng QA (`minLengthRatio: 0.35`, `maxLengthRatio: 5.0`, `repeatedParagraphThreshold: 3`, `checkAbruptEnding: false`) và bộ lọc trực tiếp trên Sidebar + thanh công cụ để đưa các chương lỗi đi **Dịch lại** hoặc **Biên tập AI hàng loạt**.
4. **External Translation Import (`TranslationImportModal`)**:
   - Nhận văn bản dán hoặc file `.TXT` (hỗ trợ UTF-8/UTF-16/GB18030), cho phép chọn cách tách đoạn (`auto`, `blank_line`, `single_line`), hiển thị đối chiếu từng mã `TITLE`, `P0001`... giữa Raw và Bản dịch nhập vào, cảnh báo nếu thừa/thiếu đoạn và cập nhật thẳng vào trình biên tập.
5. **Reader Highlights, Notes & Reading Progress (`ReaderHighlight`, `ReadingBookmark`)**:
   - Lưu danh sách `ReaderHighlight` (`id`, `chapterId`, `color: 'amber' | 'jade' | 'blue'`, `quote`, `note`, `paragraphIndex`, `createdAt`) trong IndexedDB và lưu vị trí đọc (`chapterId`, `scrollPercentage`) trong `localStorage`.
6. **Project Backup `.ZIP v5` & EPUB Cover (`coverDataBase64`)**:
   - Thêm trường `coverDataBase64?: string` và `coverMimeType?: string` vào `NovelProject` để nhúng trang bìa `OEBPS/cover.xhtml` + `OEBPS/images/cover.jpg` khi xuất W3C EPUB 3.3.
   - Xây dựng bộ đóng gói và khôi phục `.ZIP Backup v5` (`manifest.json`, `source/`, `translation/`, `presets`, `glossary`, `highlights`, `reader-fonts/`, `cover/`).
