# Cẩm Nang Vận Hành Toàn Diện — Mặc Hương Các Studio

Chào mừng bạn đến với **Mặc Hương Các Studio** — không gian làm việc tích hợp chuyên biệt dành cho dịch giả, biên tập viên và độc giả tiểu thuyết Trung - Việt (Tiên hiệp, Huyền huyễn, Khoa huyễn, Đô thị, Võng du, Lịch sử, Cổ đại, Đam mỹ, Ngôn tình, Dị giới...).

Tài liệu này được cập nhật đồng bộ 100% với luồng hoạt động thực tế của hệ thống: từ quản lý **Thư viện truyện kèm Biểu đồ tiến độ 3 tầng**, **Nhập liệu đa định dạng & Nhập bản dịch ngoài 1:1**, **Mức độ suy luận AI (`Thinking Level`: `minimal` • `low` • `medium` • `high` — mặc định `high`)**, **Bể 50 API Key lưu bền vững vào dự án**, **Quét dựng Từ điển Tiền kỳ Đa luồng (Pre-Scan)**, **Hàng đợi Dịch & Biên tập AI Đa luồng (Tạm dừng / Tiếp tục / Dừng hẳn)**, **Biên tập Song ngữ 1:1 khóa dòng Block-ID (`TITLE`, `P0001`..`Pxxxx`)**, **Kiểm định chất lượng QA đa tiêu chí**, **Chế độ Đọc sạch (Justify)** đến **Đóng gói sách điện tử EPUB 3.3 & Sao lưu Dự án `.ZIP` (Backup v5)**.

---

## MỤC LỤC NHANH
1. [Quy Trình Nhanh 5 Bước & Kiến Trúc Không Gian Làm Việc](#1-quy-trình-nhanh-5-bước--kiến-trúc-không-gian-làm-việc)
2. [Thư Viện Truyện & Bảng Điều Khiển Tiến Độ Toàn Thư Viện](#2-thư-viện-truyện--bảng-điều-khiển-tiến-độ-toàn-thư-viện)
3. [Nhập Chương Nguyên Tác (4 Nguồn) & Nhập Bản Dịch Ngoài (.TXT 1:1)](#3-nhập-chương-nguyên-tác-4-nguồn--nhập-bản-dịch-ngoài-txt-11)
4. [Cấu Hình Model Alias, Mức Suy Luận (`Thinking Level`), Bể 50 Key & Chẩn Đoán](#4-cấu-hình-model-alias-mức-suy-luận-thinking-level-bể-50-key--chẩn-đoán)
5. [Chỉ Dẫn Dịch Thuật (Preset), Từ Điển (Glossary) & Quét Tiền Kỳ Đa Luồng (Pre-Scan)](#5-chỉ-dẫn-dịch-thuật-preset-từ-điển-glossary--quét-tiền-kỳ-đa-luồng-pre-scan)
6. [Hàng Đợi Dịch & Biên Tập AI Đa Luồng (1x–10x, Pause / Resume / Hard Stop)](#6-hàng-đợi-dịch--biên-tập-ai-đa-luồng-1x10x-pause--resume--hard-stop)
7. [Biên Tập Song Ngữ 1:1 Khóa Dòng Block-ID & Trợ Lý AI Tinh Chỉnh](#7-biên-tập-song-ngữ-11-khóa-dòng-block-id--trợ-lý-ai-tinh-chỉnh)
8. [Kiểm Định Chất Lượng Đa Tiêu Chí (QA Scanner) & Tìm / Thay Thế Toàn Văn](#8-kiểm-định-chất-lượng-đa-tiêu-chí-qa-scanner--tìm--thay-thế-toàn-văn)
9. [Chế Độ Đọc Sạch (Justify), Màu HEX/RGB, Font Cá Nhân & Sổ Tay Highlight](#9-chế-độ-đọc-sạch-justify-màu-hexrgb-font-cá-nhân--sổ-tay-highlight)
10. [Xuất Sách Điện Tử EPUB 3.3, ZIP TXT, TXT Gộp & Sao Lưu Dự Án `.ZIP` (Backup v5)](#10-xuất-sách-điện-tử-epub-33-zip-txt-txt-gộp--sao-lưu-dự-án-zip-backup-v5)
11. [System Terminal Thời Gian Thực (`Ctrl + \``) & Bảng Phím Tắt Toàn Cục](#11-system-terminal-thời-gian-thực-ctrl----bảng-phím-tắt-toàn-cục)

---

## 1. Quy Trình Nhanh 5 Bước & Kiến Trúc Không Gian Làm Việc

### 1.1. Quy trình nhanh 5 bước cho người mới bắt đầu
1. **Bước 1 — Chọn hoặc Tạo bộ truyện**: Nhấn nút **Thư Viện** trên thanh công cụ trên cùng để chọn bộ mẫu có sẵn (*Phàm Nhân Tu Tiên*, *Đạo Quỷ Dị Tiên*, *Quỷ Bí Chi Chủ*) hoặc tạo dự án truyện mới.
2. **Bước 2 — Nhập chương nguyên tác**: Nhấn **Nhập Chương** để nạp hàng trăm file `.txt`, sách `.epub`, tách 1 file `.txt` gộp bằng Regex, hoặc tải trực tiếp từ URL.
3. **Bước 3 — Thiết lập Preset, Mức suy luận (`Thinking Level`) & Key Pool**: Mở **Preset & Model** để chọn bộ chỉ dẫn dịch (*Flash Đa Thể Loại v1.14.0* hoặc *Biên Tập AI*), chọn mức suy luận (`minimal` / `low` / `medium` / `high` — mặc định `high`), và nạp danh sách API Key (tối đa 50 Key) nếu chạy đa luồng tốc độ cao.
4. **Bước 4 — Quét Từ Điển (tùy chọn) & Chạy Hàng Đợi Dịch / Biên Tập**: Tick chọn các chương ở cột trái -> chọn số luồng (`1x`–`10x`) -> nhấn **Dịch Đã Chọn** hoặc **Biên Tập Đã Chọn**.
5. **Bước 5 — Rà soát 1:1, Đọc & Xuất sách**: Chỉnh sửa chi tiết trên bảng **Biên tập bản dịch 1:1**, kiểm tra ở chế độ **Đọc**, và nhấn **Xuất & Sao lưu** để tải sách `.EPUB 3.3` hoặc gói sao lưu `.ZIP` (Backup v5).

### 1.2. Kiến trúc 2 Chế Độ Trung Tâm & Tự Động Cuộn Đầu Chương
Giao diện chính được tinh giản tối đa vào 2 chế độ chuyển đổi tức thì ở chính giữa thanh công cụ trên cùng:
- **Biên tập bản dịch (1:1 Block-ID)**: Bảng song ngữ khóa dòng 1:1 giữa nguyên bản tiếng Trung và bản dịch tiếng Việt (`TITLE`, `P0001`, `P0002`...), kèm khung nhập tự giãn chiều cao, thanh công cụ ghim cố định và bộ công cụ căn chỉnh đoạn văn.
- **Đọc (Clean Justified Reader)**: Trình đọc sách chuyên nghiệp căn đều hai lề (`justify`), hỗ trợ tùy biến màu nền/màu chữ HEX/RGB, nạp font cá nhân (`.ttf/.otf/.woff2`), đánh dấu Highlight 3 màu kèm ghi chú và lưu vị trí đọc (Bookmark).
- **Tự động cuộn lên đầu chương (`Scroll-to-Top`)**: Mỗi khi bạn chuyển đổi sang chương khác (bằng danh sách bên trái, menu thả xuống hay nút *Chương trước / Chương tiếp*), cả khung **Biên tập bản dịch** lẫn khung **Đọc** đều tự động cuộn mượt về đầu chương (`scrollTop = 0`), đồng thời giữ chương đang chọn luôn nằm trong vùng nhìn thấy ở cột mục lục bên trái.

---

## 2. Thư Viện Truyện & Bảng Điều Khiển Tiến Độ Toàn Thư Viện

Nhấn nút **Thư Viện** ở góc trái trên cùng để mở trung tâm quản lý toàn bộ dự án truyện:

### 2.1. Bảng Điều Khiển Tiến Độ Toàn Thư Viện (Biểu Đồ Tròn Donut 3 Tầng)
Ngay đầu cửa sổ Thư Viện là bảng tổng hợp trực quan cho cả **Toàn bộ thư viện** lẫn **Từng bộ truyện**:
- **Biểu đồ tròn Donut 3 tầng màu**:
  - **Màu Xanh Ngọc (`#1E6F50`) — Đã biên tập / Đã duyệt**: Số chương đã hoàn thiện biên tập và kiểm duyệt.
  - **Màu Hổ Phách (`#D97706`) — Đã dịch (Chưa duyệt)**: Số chương đã có bản dịch tiếng Việt nhưng chưa qua bước duyệt biên tập.
  - **Màu Xám Giấy (`#D6CFC2`) — Chưa dịch (Nguyên bản)**: Số chương mới nạp nguyên tác tiếng Trung.
- Hiển thị đầy đủ tỷ lệ phần trăm hoàn thành toàn thư viện, tổng số chương, tổng số từ tiếng Việt, số mục thuật ngữ Từ điển và số chương đạt chuẩn QA sạch 100%.

### 2.2. Chế Độ Xem Thẻ (Card View) & Bảng Ma Trận (Table View)
- **Tìm kiếm, Lọc & Sắp xếp**: Tìm theo tên truyện, tên Hán tự, tác giả, thể loại; lọc theo trạng thái (*Tất cả*, *Đã ghim ⭐*, *Đang dịch dở*, *Hoàn thành 100%*, *Chưa dịch*); sắp xếp theo *Mới cập nhật*, *Tiến độ dịch %*, *Tổng số chương*, *Số lượng từ*, hoặc *Tên A-Z*.
- **Thao tác quản trị trên từng bộ truyện**:
  - **Ghim ưu tiên (⭐)**: Đưa bộ truyện đang làm việc lên đầu danh sách.
  - **Sửa thông tin & Ảnh bìa**: Cập nhật tên tiếng Việt, tên nguyên tác, tác giả, thể loại, mô tả tóm tắt và tải ảnh bìa (dùng làm bìa sách EPUB 3.3).
  - **Nhân bản (Clone)**: Sao chép toàn bộ chương, từ điển và thiết lập sang một bản sao độc lập để thử nghiệm văn phong dịch mới.
  - **Khôi phục Dự án từ gói `.ZIP` (Backup v5)**: Nạp trực tiếp file `.zip` sao lưu để khôi phục nguyên trạng bộ truyện từ máy khác.

---

## 3. Nhập Chương Nguyên Tác (4 Nguồn) & Nhập Bản Dịch Ngoài (.TXT 1:1)

### 3.1. Nhập Chương Nguyên Tác (Nút `Nhập Chương` ở cột trái)
Hỗ trợ **4 phương thức nhập liệu thông minh**, tự động cấp mã thứ tự 4 chữ số (`0000`, `0001`, `0002`...) để không bao giờ đảo lộn thứ tự chương:
1. **Tab 1 — Thư mục / Nhiều file `.TXT`**:
   - Chọn hàng trăm file `.txt` cùng lúc (ví dụ: `0001_Chương 1.txt`, `0002_Chương 2.txt`).
   - Tự động nhận diện số chương từ tiền tố tên file (`XXXX_`) và bóc tách dòng tiêu đề đầu tiên.
2. **Tab 2 — Sách điện tử `.EPUB` nguyên tác**:
   - Đọc cấu trúc `container.xml` -> `.opf` -> `manifest` & `spine` chuẩn quốc tế, giữ đúng thứ tự chương mục của sách gốc tiếng Trung.
3. **Tab 3 — Tách 1 file `.TXT` lớn gộp nhiều chương (Regex + Bảng Xem Trước)**:
   - Dành cho file `.txt` chứa cả bộ truyện.
   - Hỗ trợ mẫu Regex mặc định nhận diện `第...章/节/回/卷` hoặc `Chương/Hồi/Quyển...` và cho phép tùy chỉnh Regex riêng.
   - Có **Bảng Xem Trước (Preview)** hiển thị danh sách các chương sau khi tách trước khi nhấn xác nhận lưu.
4. **Tab 4 — Dán Văn Bản Trực Tiếp hoặc Tải Từ URL**:
   - Dán nhanh nội dung 1 chương lẻ hoặc dán đường dẫn URL chương truyện.
   - Máy chủ tự động giải mã bảng mã tiếng Trung (**UTF-8, GB18030, GBK**) để không bao giờ bị lỗi font chữ Hán.

### 3.2. Nhập Bản Dịch Ngoài Cả Chương (`.TXT` 1:1)
Khi đang ở màn hình **Biên tập bản dịch**, nhấn nút **Nhập bản dịch (.TXT)** trên thanh công cụ chương để nạp bản dịch có sẵn từ bên ngoài:
- Hỗ trợ chọn file `.txt` hoặc dán văn bản trực tiếp.
- Tùy chọn **Tự động lấy dòng đầu tiên làm Tiêu đề chương (`TITLE`)**.
- Hiển thị **Bảng Xem Trước Ghép Đoạn 1:1 (`TITLE`, `P0001`..`Pxxxx`)** và cảnh báo ngay nếu số đoạn văn tiếng Việt lệch với số đoạn nguyên tác tiếng Trung.

---

## 4. Cấu Hình Model Alias, Mức Suy Luận (`Thinking Level`), Bể 50 Key & Chẩn Đoán

Nhấn nút **Preset & Model** trên thanh công cụ trên cùng và chuyển sang **Tab 3: Model, Thinking & Quản Lý Key Pool (50 Keys)**:

### 4.1. Danh sách Model Alias Chuẩn Hóa
Hệ thống kết nối trực tiếp với `@google/genai` Interactions API và cung cấp các cấu hình Model tối ưu:
- **`gemini-flash-latest` (Khuyên dùng mặc định)**: Tốc độ cao, văn phong tiếng Việt mượt mà, ổn định cho cả dịch thuật lẫn biên tập hàng loạt.
- **`gemini-3.8-flash`**: Thế hệ Flash mới cân bằng giữa tốc độ xử lý và khả năng bám sát ngữ cảnh chương dài.
- **`gemini-4-argon`**: Mô hình suy luận chuyên sâu cho các chương văn chương cổ điển, thơ phú hoặc cấu trúc phức tạp.
- **`gemini-3.1-flash-lite` (Tốc độ siêu nhanh / Model dự phòng)**: Phản hồi cực nhanh, đồng thời đóng vai trò model dự phòng khi bật chế độ Auto-Fallback.
- **Nhập mã Model tùy chỉnh**: Cho phép gõ trực tiếp bất kỳ tên model nào khả dụng trên tài khoản của bạn.

### 4.2. Cơ Chế Mức Độ Suy Luận AI (`Thinking Level`: `minimal` • `low` • `medium` • `high`)
- **Tự động đồng bộ từ SDK & API (`/api/models`)**: Hệ thống tự động lấy danh sách các mức `ThinkingLevel` chuẩn từ SDK (`minimal`, `low`, `medium`, `high`).
- **Mặc định là `high` (Suy luận sâu)**: Khi bạn không chỉnh sửa, hệ thống luôn để mặc định ở mức **`high`** để đảm bảo chất lượng dịch thuật và biên tập sâu sắc nhất.
- **Giải pháp chống ngắt kết nối cổng 300 giây (Gateway Timeout)**:
  - Với các chương rất dài hoặc phức tạp, mức `high` có thể khiến mô hình suy nghĩ lâu và chạm ngưỡng giới hạn 300 giây của cổng mạng.
  - Bạn có thể chuyển nhanh sang **`medium`** (Cân bằng), **`low`** (Nhanh) hoặc **`minimal`** (Tối giản suy luận — phản hồi tức thì) ở **2 vị trí**:
    1. **Thanh chọn nhanh `Thinking` ngay trong khung Hàng Đợi (cột trái)**: Bấm đổi tức thì giữa `minimal | low | medium | high` trước hoặc trong khi dịch.
    2. **Thẻ cấu hình chi tiết trong `Preset & Model -> Tab 3`**: Xem mô tả chi tiết từng mức suy luận.
- Mức `Thinking Level` đã chọn được áp dụng đồng nhất cho tất cả tác vụ AI: **Dịch chương (`/api/translate`)**, **Trợ lý Biên tập & Làm sạch Block (`/api/editor/assist`)**, và **Quét Từ điển Tiền kỳ (`/api/glossary/extract`)**.

### 4.3. Bể 50 API Key Lưu Bền Vững Vào Dự Án & Phân Luồng 1:1
- **1 Luồng = 1 Key Độc Lập**: Khi bạn nạp nhiều API Key (tối đa **50 Key**, mỗi dòng 1 Key `AIza...`), luồng #1 dùng Key #1, luồng #2 dùng Key #2... giúp nhân tốc độ dịch lên gấp 5–10 lần mà không bị nghẽn hạn mức trên một Key duy nhất.
- **Lưu bền vững vào Dự án (Server Project Pool)**: Danh sách Key được lưu trực tiếp vào tệp cấu hình dự án trên máy chủ kết hợp bộ nhớ trình duyệt, giúp bạn tải lại trang hoặc khởi động lại vẫn giữ nguyên 50 Key.
- **Nút "Xóa sạch Key" an toàn**: Trước khi chia sẻ hoặc Public dự án cho người khác, chỉ cần nhấn **Xóa sạch Key** để gỡ toàn bộ Key khỏi cả máy chủ lẫn trình duyệt.
- **Chế độ Khóa Cứng Model (`Strict Model Lock`) vs Tự Động Chuyển Tiếp Dự Phòng (`Auto-Fallback`)**:
  - **Mặc định (Tắt Auto-Fallback)**: Khóa cứng 100% vào đúng Model bạn đã chọn.
  - **Bật Auto-Fallback**: Khi tất cả Key trên Model chính đều chạm giới hạn `429 Quota`, hệ thống mới tự động chuyển sang model dự phòng `gemini-3.1-flash-lite`.
- **Công cụ Chẩn Đoán Toàn Diện (`Chẩn đoán Key & 5 Tuyến API`) & `Xóa Cooldown 429`**:
  - Kiểm tra sức khỏe từng Key trong bể và xác thực trực tiếp 5 tuyến tính năng (*Danh sách Model*, *Dịch thuật*, *Trợ lý Biên tập*, *Quét Từ điển*, *Tải URL*).
  - Nút **Xóa Cooldown 429** giúp mở khóa ngay lập tức các Key đang trong thời gian chờ nghỉ sau khi bạn vừa thêm Key mới hoặc đổi hạn mức.

---

## 5. Chỉ Dẫn Dịch Thuật (Preset), Từ Điển (Glossary) & Quét Tiền Kỳ Đa Luồng (Pre-Scan)

Mở **Preset & Model** để quản lý bộ quy tắc dịch thuật và từ điển nhất quán cho từng bộ truyện:

### 5.1. Chỉ Dẫn Dịch Thuật & Biên Tập (Tab 1)
- Tích hợp sẵn 2 bộ chỉ dẫn chuẩn:
  1. **Dịch Trung - Việt | Flash Đa Thể Loại v1.14.0**: Quy chuẩn hóa đại từ nhân xưng, văn phong dịch mượt, giữ nhịp điệu tiểu thuyết mạng và chống dịch sót chữ Hán.
  2. **Biên Tập Trung - Việt | Flash Đa Thể Loại v1.14.0**: Dành riêng cho chế độ **Biên Tập AI**, tập trung chuốt câu tiếng Việt tự nhiên mà không làm sai lệch nguyên tác.
- Bạn có thể tạo thêm không giới hạn Preset riêng cho từng thể loại (Tiên hiệp, Đô thị, Khoa huyễn, Đam mỹ...), xuất/nhập Preset ra file `.md` hoặc `.txt`.

### 5.2. Từ Điển Thuật Ngữ Thông Minh & Lọc Ngữ Cảnh 0.5ms (Tab 2)
- **Công tắc Đính kèm Từ điển (Mặc định TẮT)**: Bạn hoàn toàn chủ động quyết định có gửi Từ điển vào Prompt hay không bằng nút bật/tắt ngay trên thanh công cụ hoặc trong Tab Từ điển.
- **Tối ưu Lọc Ngữ Cảnh 0.5ms (Context-Aware Filtering)**: Dù từ điển của bộ truyện có tới 5.000 mục từ, trước khi dịch mỗi chương hệ thống chỉ trích xuất những thuật ngữ **thực sự xuất hiện trong văn bản chương đó** (cộng với các mục được ghim *Luôn gửi*) và nằm trong **Khoảng chương hiệu lực (`Từ chương X -> Đến chương Y`)**.
- **Chính sách dịch thuật ngữ 4 cấp độ**:
  - `force` (*Bắt buộc khớp 100%*), `prefer` (*Ưu tiên dùng*), `contextual` (*Tùy ngữ cảnh*), `keep_source` (*Giữ nguyên Hán Việt/Phiên âm*).
- Hỗ trợ khai báo **Biến thể / Từ đồng nghĩa (`Aliases`)**, **Cách dịch cấm (`Forbidden Target`)** để QA Scanner tự động bắt lỗi, và nút **Áp dụng & Thay thế đồng loạt vào các chương đã dịch**.

### 5.3. Trình Quét Dựng Từ Điển Tiền Kỳ Đa Luồng (Pre-Scan Builder)
Trước khi dịch một bộ truyện mới hoặc một卷 (quyển) mới, bạn có thể dùng khung **Quét & Dựng Từ Điển Tiền Kỳ Đa Luồng** ngay trong Tab 2:
- **Chọn phạm vi quét**: *Tất cả chương*, *Các chương đã tick*, *Khoảng chương (Từ chương X đến chương Y)*, hoặc *Chương đang mở*.
- **Cấu hình hiệu năng**: Tùy chọn **Số chương gộp mỗi gói AI (`1–10 chương/gói`)** và **Số luồng chạy song song (`1x–10x`)**, sử dụng đúng mức `Thinking Level` đang chọn.
- **Điều khiển 3 trạng thái & Tự động bảo vệ 429**:
  - Hỗ trợ **Tạm dừng (Pause)**, **Tiếp tục (Resume)** và **Dừng hẳn (Hard Stop)** bất kỳ lúc nào.
  - Nếu toàn bộ Key chạm trần `429 Quota`, hệ thống **tự động Tạm dừng (Auto-Pause)** và giữ nguyên các gói chương chưa quét để bạn nhấn **Tiếp tục** sau mà không mất dữ liệu.

---

## 6. Hàng Đợi Dịch & Biên Tập AI Đa Luồng (1x–10x, Pause / Resume / Hard Stop)

Ở cột mục lục bên trái, khung **Hàng Đợi Đa Luồng** cho phép xử lý hàng chục đến hàng trăm chương tự động:

### 6.1. Hai Chế Độ Chạy Hàng Loạt Độc Lập
1. **Dịch Đã Chọn (`Dịch Mới 100%`)**: Dịch từ nguyên bản tiếng Trung sang tiếng Việt cho các chương đã tick chọn, khóa khớp cấu trúc dòng `1:1` (`TITLE`, `P0001`..`Pxxxx`).
2. **Biên Tập Đã Chọn (`Biên Tập AI Thông Minh 2 Cơ Chế`)**:
   - **Với chương đã khớp đoạn 1:1 nhưng còn sót lỗi cục bộ**: Chỉ gửi riêng các Block ID bị sót chữ Hán / lọt tiếng Anh (`block_cleanup`) để làm sạch siêu tốc.
   - **Với chương bị báo QA Lệch Đoạn (hoặc chuốt đồng bộ cả chương)**: Hệ thống **tự động gửi TOÀN BỘ CHƯƠNG (`realign_chapter`)** gồm đầy đủ nguyên bản `TITLE`, `P0001`..`Pxxxx` kèm toàn bộ bản dịch hiện có để AI đối chiếu từ đầu đến cuối, phân bổ tách/gộp lại khớp chuẩn 1:1 từng đoạn và dọn sạch lỗi QA (tránh tuyệt đối hiện tượng dịch lặp đoạn cuối do lệch nhịp ở giữa chương).

### 6.2. Chọn Nhanh `Thinking Level` & Điều Khiển Hàng Đợi Thời Gian Thực
- **Thanh chọn nhanh `Thinking`**: Ngay dưới thanh tiến độ Hàng Đợi, bạn có thể bấm chọn trực tiếp `minimal`, `low`, `medium`, hoặc `high` (mặc định `high`). Nếu gặp chương quá dài dễ bị ngắt kết nối 300 giây, hãy chuyển sang `medium` hoặc `low`.
- **Bộ nút điều khiển 3 trạng thái**:
  - **Tạm dừng (Pause)**: Dừng nhận chương mới, chờ luồng đang chạy hoàn tất an toàn.
  - **Tiếp tục (Resume)**: Chạy tiếp ngay các chương còn lại trong hàng đợi.
  - **Dừng hẳn / Hủy ngay (Hard Stop)**: Ngắt toàn bộ các luồng mạng đang chạy ngay lập tức và trả các chương đang xử lý dở về trạng thái ban đầu.
- **Thanh Khôi Phục Nhanh 1-Click**: Khi có chương báo lỗi hoặc bị kẹt trạng thái đang xử lý, một thanh công cụ màu hổ phách sẽ xuất hiện ngay ở cột trái cho phép **Chạy lại các chương lỗi** hoặc **Đặt lại trạng thái chương kẹt** chỉ với 1 cú nhấp chuột.

---

## 7. Biên Tập Song Ngữ 1:1 Khóa Dòng Block-ID & Trợ Lý AI Tinh Chỉnh

Chế độ **Biên tập bản dịch** được thiết kế theo mô hình bảng khóa dòng `1:1` chuyên nghiệp:

### 7.1. Bảng Khóa Dòng 1:1 (`TITLE`, `P0001`..`Pxxxx`) & Thanh Công Cụ Ghim Cố Định
- Mỗi đoạn văn nguyên bản tiếng Trung ở cột trái được gắn một mã định danh cố định (`TITLE`, `P0001`, `P0002`...) và khóa ngang hàng 1:1 với ô nhập tiếng Việt tương ứng ở cột phải.
- Ô nhập tiếng Việt tự động giãn chiều cao theo độ dài văn bản; nhấn `Backspace` ở đầu ô không bao giờ làm nhảy hay gộp nhầm sang đoạn văn phía trên.
- **Thanh công cụ ghim cố định (Pinned Stationary Toolbar)**: Luôn nằm cố định phía trên bảng biên tập khi bạn cuộn trang, bao gồm:
  - **Hoàn tác / Làm lại (`Undo / Redo` — tối đa 60 bước)**, **Sao chép / Cắt / Dán**, **Chuẩn hóa dấu câu tiếng Việt**.
  - **Bộ lọc hiển thị**: Xem **Tất cả đoạn (`Tất cả`)** hoặc chỉ lọc riêng **Các đoạn có cảnh báo lỗi (`Block lỗi`)** để rà soát siêu tốc.
  - **Tìm & Thay thế nhanh trong chương (`Tìm & Thay`)**: Hỗ trợ tìm kiếm và thay thế tức thì ngay trong chương đang mở.

### 7.2. Bộ Công Cụ Căn Chỉnh Đoạn Văn & Trợ Lý AI Thông Minh
Trên mỗi dòng đoạn văn (`Pxxxx`) và trên thanh công cụ có đầy đủ các thao tác xử lý nhanh:
- **Căn chỉnh cấu trúc đoạn 1:1**:
  - `Gộp ↓`: Gộp đoạn hiện tại với đoạn kế tiếp bên dưới (kéo các đoạn dưới lên 1 nhịp).
  - `Tách ↵` (hoặc phím tắt `Ctrl + Enter` tại vị trí con trỏ): Tách đoạn đang chọn thành 2 đoạn độc lập (đẩy các đoạn dưới xuống 1 nhịp).
  - `Đẩy ↓`: Chèn 1 ô trống tại vị trí hiện tại để đẩy các đoạn dịch bên dưới xuống 1 nhịp.
  - `Kéo ↑`: Xóa ô dịch dư tại vị trí hiện tại để kéo các đoạn dịch bên dưới lên 1 nhịp.
  - `Xóa Hán`: Quét và xóa tức thì các ký tự chữ Hán còn sót trong đoạn hoặc toàn chương.
  - `AI Dịch Block`: Dịch lại riêng đoạn văn `Pxxxx` đang chọn bằng AI mà không ảnh hưởng tới các đoạn khác.
- **Nút `AI biên tập` / `AI Căn Lại & Biên Tập Cả Chương` (Tự động nhận diện Lệch Đoạn — Có Nút Hủy 1-Click)**:
  - **Khi chương bị báo QA Lệch Đoạn (`Lệch X/Y đoạn`)**: Nút sẽ tự động gửi **TOÀN BỘ CHƯƠNG (`realign_chapter`)** gồm toàn bộ nguyên tác và bản dịch hiện có để AI phân bổ, tách/gộp lại đúng 1:1 từng mã `TITLE`, `P0001`..`Pxxxx` từ đầu đến cuối chương.
  - **Khi chương đã khớp 1:1 và chỉ có vài Block lỗi**: Nút chỉ gom riêng các đoạn lỗi đó (`block_cleanup`) gửi cho AI xử lý nhanh trong một lượt rồi ghép trả lại đúng vị trí `Pxxxx`. Bạn có thể nhấn **Hủy** bất cứ lúc nào nếu muốn dừng ngay.
- **Trợ lý AI theo vùng bôi đen**: Bôi đen một câu/đoạn bất kỳ rồi nhấn **Chuốt mượt**, **Sửa xưng hô**, **3 Gợi ý**, hoặc **Lệnh AI...** để tinh chỉnh theo ý muốn.

---

## 8. Kiểm Định Chất Lượng Đa Tiêu Chí (QA Scanner) & Tìm / Thay Thế Toàn Văn

### 8.1. Bộ Quét Kiểm Định Chất Lượng Tự Động (QA Scanner)
Mỗi khi dịch xong hoặc khi bạn gõ biên tập, hệ thống tự động quét kiểm định và hiển thị huy hiệu trạng thái ngay trên từng chương và từng đoạn `Pxxxx`:
1. **Sót chữ Hán (`Residual Chinese`)**: Phát hiện và tô sáng chính xác vị trí ký tự CJK còn sót lại trong tiêu đề hoặc nội dung tiếng Việt.
2. **Rò rỉ từ tiếng Anh của AI (`English Leak`)**: Bắt các từ tiếng Anh do AI vô tình chèn vào văn cảnh cổ trang/tiên hiệp (như `system`, `level`, `boss`, `skill`, `ok`, `sorry`... trừ các từ viết tắt hợp lệ).
3. **Lệch cấu trúc đoạn 1:1 (`Block Alignment`)**: Cảnh báo khi có đoạn nguyên tác chưa được dịch hoặc số đoạn bị lệch.
4. **Vi phạm Từ cấm & Cách dịch cấm trong Từ điển (`Banned Words & Glossary Violations`)**: Kiểm tra danh sách từ cấm tùy chỉnh và các mục `Forbidden Target` hoặc `force` trong Từ điển.

### 8.2. Tìm Kiếm Toàn Văn & Thay Thế Hàng Loạt Chương (`Tìm Toàn Văn`)
Nhấn nút **Tìm Toàn Văn** ở cột trái để mở công cụ tra cứu xuyên suốt toàn bộ bộ truyện:
- Tìm kiếm theo **Bản dịch tiếng Việt**, **Nguyên bản tiếng Trung**, hoặc **Cả hai**.
- Hỗ trợ phân biệt chữ hoa/thường (`Case Sensitive`), biểu thức chính quy (`Regex`), lọc phạm vi (*Toàn bộ chương*, *Các chương đã tick*, *Chương đang mở*).
- Cho phép **Nhảy tới chương khớp từ khóa**, **Tick chọn toàn bộ các chương chứa từ khóa**, hoặc **Thay thế đồng loạt (Bulk Replace)** kèm quét lại QA tự động.

---

## 9. Chế Độ Đọc Sạch (Justify), Màu HEX/RGB, Font Cá Nhân & Sổ Tay Highlight

Chuyển sang chế độ **Đọc** ở thanh trên cùng để tận hưởng trải nghiệm đọc sách hoàn chỉnh:
- **Căn đều hai lề (`text-align: justify`) & Thụt đầu dòng**: Văn bản được trình bày chuẩn sách in với khoảng cách đoạn, cỡ chữ, chiều cao dòng và độ rộng trang đọc tùy chỉnh linh hoạt.
- **Tùy biến Màu Sắc HEX / RGB & 4 Giao Diện Mẫu**: Chọn nhanh *Giấy Tuyên Thành*, *Trắng Sứ Thanh Nhã*, *Xanh Trúc Dịu Mắt*, *Đêm Mặc Huyền* hoặc tự chọn mã màu nền / màu chữ HEX & RGB theo sở thích.
- **Tải Font Chữ Cá Nhân (`.ttf`, `.otf`, `.woff2`)**: Nạp trực tiếp file font từ máy tính vào trình duyệt (lưu bền vững trong IndexedDB) để đọc truyện và nhúng vào sách EPUB.
- **Đánh Dấu Highlight 3 Màu, Ghi Chú & Lưu Vị Trí Đọc (Bookmark)**:
  - Bôi đen bất kỳ câu chữ nào khi đang đọc để đánh dấu bằng 3 màu (*Vàng Hổ Phách*, *Xanh Ngọc Bích*, *Đỏ Chu Sa*) kèm ghi chú cá nhân và quản lý tập trung trong **Sổ Tay Highlight**.
  - Nhấn **Lưu vị trí đọc** để ghi nhớ chính xác chương và tỷ lệ phần trăm cuộn trang; nhấn **Đọc tiếp Chương #...** để quay lại đúng dòng đang đọc dở.

---

## 10. Xuất Sách Điện Tử EPUB 3.3, ZIP TXT, TXT Gộp & Sao Lưu Dự Án `.ZIP` (Backup v5)

Nhấn nút **Xuất & Sao lưu** ở góc phải trên cùng để mở trung tâm xuất bản và sao lưu dữ liệu:

### 10.1. Tab 1 — Xuất Sách Đọc (EPUB 3.3 / ZIP TXT / TXT Gộp)
- **Tự động kiểm tra & Dịch tiêu đề chương còn thiếu**: Trước khi xuất sách, hệ thống tự động thống kê các chương chưa có tiêu đề tiếng Việt hoặc còn sót chữ Hán ở tiêu đề, cho phép nhấn **Dịch tự động toàn bộ tiêu đề thiếu bằng AI** chỉ với 1 cú nhấp chuột.
- **Quản lý Ảnh Bìa Sách EPUB**: Tải ảnh bìa từ máy tính để nhúng trực tiếp làm trang bìa (`cover.xhtml`) cho sách điện tử.
- **3 Định dạng xuất bản chuyên nghiệp**:
  1. **Sách điện tử `.EPUB 3.3` chuẩn quốc tế**: Có mục lục tự động (`nav.xhtml` + `toc.ncx`), trang thông tin sách, ảnh bìa và CSS căn đều hai lề (`justify`), tương thích hoàn hảo với Apple Books, Kindle (Send-to-Kindle), Kobo, Moon+ Reader, Google Play Books.
  2. **Gói `.ZIP` chứa từng file `.TXT` theo chương**: Đặt tên chuẩn thứ tự `0001_Chương_1.txt`, `0002_Chương_2.txt`...
  3. **1 File `.TXT` Gộp Toàn Bộ Truyện**: Ghép toàn bộ các chương thành một tệp văn bản duy nhất có phân cách chương rõ ràng.
- Hỗ trợ chọn phạm vi xuất (*Toàn bộ chương*, *Chỉ các chương đã dịch*, *Chỉ các chương đang tick chọn*) và chế độ trình bày (*Chỉ Tiếng Việt sạch* hoặc *Song ngữ Trung - Việt xen kẽ từng đoạn*).

### 10.2. Tab 2 — Sao Lưu & Khôi Phục Dự Án Toàn Diện `.ZIP` (Backup v5)
- **Xuất Gói Sao Lưu Dự Án `.ZIP` (Backup v5)**: Đóng gói toàn bộ dữ liệu bộ truyện vào một tệp `.zip` có cấu trúc thư mục rõ ràng (`backup-manifest.json`, `project/novel.json`, `chapters/`, `glossary/`, `presets/`, `assets/` bao gồm cả ảnh bìa và font chữ cá nhân).
- **Khôi Phục Dự Án Từ Gói `.ZIP`**: Chọn tệp `.zip` Backup v5 để khôi phục 100% chương truyện, trạng thái duyệt, từ điển, highlight và cài đặt đọc trên bất kỳ thiết bị nào.

---

## 11. System Terminal Thời Gian Thực (`Ctrl + \``) & Bảng Phím Tắt Toàn Cục

### 11.1. System Terminal & Bảng Chẩn Đoán Kỹ Thuật (`Ctrl + \``)
Nhấn nút **Terminal** ở góc phải dưới màn hình (hoặc phím tắt `Ctrl + \``) để mở bảng theo dõi hệ thống thời gian thực:
- **Nhật ký hợp nhất (Client + Server API)**: Hiển thị chi tiết từng yêu cầu dịch thuật, biên tập, quét từ điển, thời gian phản hồi (`ms`), Model thực tế đã dùng (`modelUsed`), mức suy luận (`thinkingLevelUsed`), luồng Key nào được cấp phát (`keyMask`) và trạng thái Cooldown.
- **Nút Chẩn Đoán Nhanh 1-Click**: Kiểm tra tức thì kết nối `/api/models`, `/api/logs` và sao chép toàn bộ nhật ký kỹ thuật ra Clipboard.

### 11.2. Bảng Phím Tắt Toàn Cục
| Phím tắt | Chức năng thực thi |
| :--- | :--- |
| **`Ctrl + S`** (hoặc `Cmd + S`) | Lưu ngay chương đang biên tập vào cơ sở dữ liệu trình duyệt (IndexedDB) |
| **`Ctrl + Z` / `Ctrl + Y`** | Hoàn tác (Undo) / Làm lại (Redo) thao tác chỉnh sửa trong bảng biên tập 1:1 |
| **`Ctrl + Enter`** | Tách đoạn văn (`Block Pxxxx`) đang đặt con trỏ thành 2 đoạn tại đúng vị trí con trỏ |
| **`Alt + ←` / `Alt + →`** | Chuyển nhanh sang **Chương trước** / **Chương tiếp theo** (tự động cuộn lên đầu chương) |
| **`Ctrl + \``** | Bật / Tắt ngăn kéo **System Terminal** theo dõi nhật ký AI và mạng thời gian thực |
