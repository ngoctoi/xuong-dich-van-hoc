# Xưởng Dịch Hán Việt — Tài liệu hoạt động chi tiết

Ngày đối chiếu/cập nhật: **25/10/2026**. Ứng dụng **1.14.2**, source commit `786eebbb0ca7ce1ec004e32660653235e75962b4` (trước lượt sửa tài liệu này).

Đây là hướng dẫn hành vi thực tế của code hiện tại, đi cùng [PLAN dựng lại](../plan.md). Các phần thân đã cập nhật theo **AI streaming trực tiếp**; không cần ghép một đính chính ở đầu với mô tả background cũ ở dưới. Chỗ nào nói GET/poll/nối lại/cleanup đều phải đọc theo nhãn **legacy**.

Những thay đổi đã hợp nhất:

- 1.13.0: dịch/biên tập/quét dùng Interactions direct stream, không phục hồi output tác vụ mới sau reload; deadline request 10 phút.
- 1.13.1: hàng đợi dịch nhả worker khi chờ key/quota; tự pause sau 5 phút kẹt quota không có tiến triển xử lý.
- 1.14.0: pool tối đa 50 key, concurrency vẫn tối đa 10, lọc khoảng prefix thực sự.
- 1.14.1–1.14.2: preset mặc định cô đọng và cờ `autoUpdate` bảo vệ bản import/nhân bản.
- Hai file review mới **giữ trọn bản cũ + bổ sung mục 16**, chưa được đưa vào mặc định. Mục 8 phân biệt đầy đủ default/backup/review.

[Repository GitHub riêng tư](https://github.com/Sefany2723/Xuong-Dich-Han-Viet) lưu source, không lưu dữ liệu truyện/key/database của người dùng. Đẩy source, chạy local và phát hành website là ba việc riêng; tài liệu này không xác nhận một deployment mới.

Tài liệu không khẳng định quota, giá, danh sách model hay retention Google ở tương lai. Không có API key thật trong ví dụ. Lượt cập nhật này chỉ sửa hai tài liệu, không đổi code/preset đang dùng hoặc dữ liệu truyện.

## Mục lục

1. [Cách đọc và các nguyên tắc quan trọng](#nguyen-tac)
2. [Các khái niệm cần phân biệt](#khai-niem)
3. [Kiến trúc tổng thể và nơi dữ liệu đi qua](#kien-truc)
4. [Dự án local, cloud và dung lượng](#luu-tru)
5. [Tạo, mở, sao chép và xóa dự án](#du-an)
6. [Nhập nguyên văn và quản lý thứ tự chương](#nhap-chuong)
7. [Chọn chương, lọc và sắp xếp](#chon-chuong)
8. [Hai thư viện system instruction](#instructions)
9. [Danh sách model, alias và khóa model](#models)
10. [Pool API key, mã hóa và chọn key](#api-key)
11. [Một lượt dịch từ đầu đến cuối](#vong-doi-dich)
12. [Structured output và đối chiếu block ID](#block-id)
13. [Hàng đợi, số luồng và ba nút điều khiển](#hang-doi)
14. [Trạng thái chương, trạng thái duyệt và tác vụ đang chạy](#trang-thai)
15. [Lỗi API, cooldown và giới hạn thử lại](#loi-api)
16. [Sau gián đoạn, dịch lại, legacy cleanup và đồng bộ](#phuc-hoi)
17. [Từ điển thủ công và quét bằng AI](#tu-dien)
18. [Biên tập thủ công, tìm/thay thế và sửa raw](#bien-tap-tay)
19. [Nhập một bản dịch hoàn chỉnh vào trình biên tập](#nhap-ban-dich)
20. [Revision, active, ghim, so sánh và provenance](#revision)
21. [Biên tập AI toàn chương và theo block](#bien-tap-ai)
22. [Kiểm tra chất lượng và các bộ lọc](#chat-luong)
23. [Duyệt tay, ép duyệt và điều kiện xuất bản](#duyet-xuat-ban)
24. [Xuất TXT, ZIP và EPUB](#dinh-dang-xuat)
25. [Backup và phục hồi](#backup)
26. [Trình đọc](#trinh-doc)
27. [Nhật ký, diagnostic và cách đọc số liệu](#diagnostic)
28. [Tính nhất quán, nhiều tab và các lớp bảo vệ](#dong-bo)
29. [Bảo mật và quyền riêng tư](#bao-mat)
30. [Các quy trình sử dụng mẫu](#quy-trinh)
31. [Chẩn đoán các tình huống thường gặp](#chan-doan)
32. [Giới hạn, ngoại lệ và điểm chưa được bảo đảm](#gioi-han)
33. [Phụ lục kỹ thuật: cấu trúc dữ liệu, API, cấu hình và kiểm thử](#ky-thuat)
34. [Bảng thay đổi so với kế hoạch cũ và bản đồ mã nguồn](#doi-chieu)

<a id="nguyen-tac"></a>
## 1. Cách đọc và các nguyên tắc quan trọng

### 1.1. Nếu chỉ muốn vận hành

Đọc các mục 4–10 để thiết lập; 11–16 để hiểu hàng đợi; 18–25 để sửa, duyệt và xuất bản. Mục 30 có quy trình thao tác cụ thể. Khi gặp lỗi, dùng mục 31 trước khi đổi key, đổi model hoặc dịch lại hàng loạt.

### 1.2. Nếu muốn triển khai lại hoặc sửa code sau này

Đọc thêm các mục 3, 12, 14–16, 28, 32–34. Đây là các phần giải thích vì sao không nên gộp trạng thái chương, trạng thái request và trạng thái duyệt thành một biến duy nhất.

### 1.3. Mười hai nguyên tắc cốt lõi

1. **Một chương là một đơn vị dịch.** Dịch mới gửi toàn bộ chương trong một interaction, được đóng gói thành các block có ID. Không chia một chương thành nhiều request dịch nhỏ.
2. **Chỉ xoay key, không tự hạ model.** Model đã chọn được giữ cho lượt chạy; không chuyển từ Flash sang Flash Lite khi gặp hạn mức.
3. **Một lần sinh nội dung khác với một HTTP request.** Đường mới có metadata model và một POST stream; GET/poll/cancel/DELETE chỉ dành cho background legacy.
4. **Số luồng là trần song song, không phải cam kết luôn đủ luồng.** Key bận, cooldown, lưu dữ liệu, tạm dừng và Google xếp hàng đều có thể làm số thực tế thấp hơn.
5. **Dịch xong không đồng nghĩa đã duyệt.** Hoàn thành là kết quả xử lý; duyệt là quyết định của người dùng đối với bản đang dùng.
6. **Duyệt không xóa cảnh báo.** Nó ghi nhận rằng người dùng chấp nhận nội dung dù có thể còn dấu hiệu cần kiểm tra.
7. **Draft, revision và active là ba thứ khác nhau.** Gõ chữ chưa tạo revision. Lưu mới tạo bản lưu. Active quyết định nội dung đang dùng.
8. **Biên tập AI không tự chạy sau dịch.** Người dùng phải mở chức năng, chọn phạm vi và bấm chạy. Tự active kết quả là một tùy chọn khác với tự chạy AI.
9. **Ngắt nhận không chứng minh Google đã hủy.** Direct mất stream/timeout thì nhả slot, không nối lại output. Bấm Ngắt chỉ dừng nhận phía app; lượt cũ có thể còn tiêu quota.
10. **Cleanup không xóa chương/revision và không dành cho direct mới.** Nó bảo trì interaction background legacy; đồng bộ lịch sử/nội dung là công việc khác.
11. **128 MiB là ngân sách cảnh báo của giao diện.** Không phải hạn mức cứng mỗi dự án, cũng không phải phép đo chính xác quota IndexedDB/D1/R2.
12. **Backup không chứa API key.** Khôi phục ở trình duyệt hoặc tên miền mới không tự có lại pool key đã nhập.

<a id="khai-niem"></a>
## 2. Các khái niệm cần phân biệt

| Khái niệm | Ý nghĩa trong ứng dụng |
|---|---|
| Dự án dịch / workspace | Một bộ truyện với chương, preset, từ điển, cấu hình, lịch sử và tài sản đi kèm. |
| Google API Project | Project phía Google mà một key thuộc về. Không phải dự án truyện trong ứng dụng. |
| Credential / slot | Một mục key trong pool, gồm alias, fingerprint, nguồn key và trạng thái sử dụng. |
| Raw / nguyên văn | Nội dung tiếng Trung đang được lưu cho chương. Có thể đã được người dùng sửa so với file nhập ban đầu. |
| Prefix | Số đứng trước dấu `_` trong tên file; dùng làm thứ tự chính. |
| Chapter ID | ID nội bộ của bản ghi chương, không phải số chương và không phải ID block. |
| Block ID | `TITLE`, `P0001`, `P0002`… trong một chương, dùng ghép raw với phần dịch tương ứng. |
| Run | Một đợt chạy hàng đợi trên danh sách chương đã chốt. Có thể có các snapshot theo lô từ điển. |
| Attempt | Một lần thử gửi dịch, có thể thành công, bị từ chối, mất kết nối hoặc được bỏ theo dõi. |
| Interaction ID / providerInteractionId | Legacy interactionId dùng đọc/hủy/xóa. providerInteractionId của direct chỉ diagnostic, không có resume handle. |
| Automation job | Hồ sơ biên tập/quét: snapshot, tiến độ, kết quả. Direct checkpoint không đồng nghĩa có thể phục hồi stream; recovery chỉ cho legacy. |
| Draft | Bản nháp đang sửa trên giao diện. Chưa phải bản lưu bền vững nếu chưa bấm lưu. |
| Revision | Một bản nội dung dịch được lưu cùng metadata nguồn gốc. |
| Active revision | Revision đang được sử dụng làm bản dịch hiện hành. |
| Review state | `Chưa duyệt`, `Cần xem lại` hoặc `Đã duyệt`; độc lập với trạng thái dịch. |
| Warning | Dấu hiệu kỹ thuật: còn Hán tự, tỷ lệ dài bất thường, lặp đoạn… Không phải kết luận chắc chắn dịch sai. |
| Outbox / chờ đồng bộ | Bản ghi đã lưu cục bộ nhưng còn cần gửi metadata lên cloud. |
| Lease / khóa điều phối | Quyền tạm thời cho một phiên được điều phối công việc, giảm nguy cơ nhiều tab gửi trùng. |
| Provenance | Thông tin truy vết: raw hash, preset, glossary hash, model, key alias, bản cơ sở, thời điểm. |

Một chương có thể cùng lúc là **Hoàn thành + Cần xem lại + có cảnh báo**, hoặc **Hoàn thành + Đã duyệt + vẫn có cảnh báo**. Đây không phải mâu thuẫn.

<a id="kien-truc"></a>
## 3. Kiến trúc tổng thể và nơi dữ liệu đi qua

### 3.1. Các lớp chính

```text
Trình duyệt
  ├─ React: chương, hàng đợi, biên tập, chất lượng, đọc, xuất bản
  ├─ Dexie / IndexedDB: local, cache cloud, checkpoints, key mã hóa
  ├─ localStorage: tùy chọn và vị trí đọc
  ├─ Web Worker: xuất bản/backup, tìm toàn truyện
  └─ Bộ điều phối trong tab
       │ POST đang mở: progress / heartbeat / result / error
       ▼
API ứng dụng — Next App Router qua Vinext / Vite
  ├─ Xác thực, owner, payload/model/key reference
  ├─ Cloud repository: D1 metadata + R2 nội dung/tài sản
  └─ @google/genai → Interactions create (direct stream)
       ▼
Google xử lý → trả sự kiện → server chuẩn hóa NDJSON → browser lưu
```

Ứng dụng dùng Next App Router nhưng lệnh dev/build là **Vinext**, dựa trên Vite và runtime tương thích Cloudflare. Terminal hiện [vite] không phải dấu hiệu chạy nhầm dự án.

### 3.2. Ai điều phối và điều gì xảy ra khi đóng tab?

Tab chọn chương, giữ concurrency, chọn key và nhận/lưu kết quả. Không có daemon server tự chạy hết truyện.

- Tab/kết nối cần mở cả để gửi chương mới **và nhận stream đang chạy**.
- Đóng tab/reload/mất stream của tác vụ direct: không có cơ chế mở lại để tự lấy output.
- Google có thể vẫn xử lý sau khi app ngắt; không suy đã dừng tính quota.
- Lúc mở lại, app giữ các nội dung đã lưu, xóa trạng thái live trong memory và chiếu lượt dịch dang dở chưa có revision về failed. Không hồi sinh “10 luồng đang chạy” chỉ từ 10 record cũ.
- Browser ngủ/đóng băng tab có thể làm hiển thị timeout chậm hơn đồng hồ thực. Mốc timeout là giới hạn logic khi engine còn hoạt động.

Background recovery còn trong source chỉ để xử lý **dữ liệu cũ trước đường direct**, không phải hành vi mặc định của bản này.

### 3.3. Các chế độ AI dùng cùng nền tảng nào?

| Tác vụ | Route POST streaming | Kết quả bên trong frame result |
|---|---|---|
| Dịch toàn chương | /api/interactions | JSON blocks, đủ ID raw |
| AI edit toàn chương | /api/editor/interactions | JSON translation chứa cả chương |
| Dọn Hán / “But” theo ID | /api/editor/interactions | JSON updates cho các ID mục tiêu |
| Quét glossary | /api/glossary/extract | JSON terms theo schema |

Cả ba đường dùng Interactions v1beta: background:false, store:false, stream:true, thinking high, output limit theo metadata (fallback 65.536), maxRetries:0 ở SDK để app quản lý retry. Không generateContent, không tự hạ model. Tất cả schema này khác nhau, không tráo parser.

Stream Google được server đọc và chuẩn hóa thành **NDJSON** cho browser. Một stream có thể gửi nhiều frame nhưng vẫn là một POST sinh nội dung, không phải request dịch mỗi token/block.

### 3.4. Local có nghĩa là nội dung không ra khỏi máy không?

Không. Local nghĩa là không dùng D1/R2 làm kho nội dung dự án. Khi người dùng bấm AI, payload cần thiết vẫn qua proxy và Google. store:false nghĩa là app không tạo interaction lưu để nối lại theo thiết kế hiện tại; không phải cam kết thay mặt Google rằng không có log hoặc xử lý dữ liệu nào khác.

Nhập TXT, gõ tay, regex chất lượng, find/replace, nhập bản dịch ngoài và xuất bản không tự gọi AI. Cleanup thường lệ không còn áp dụng cho direct; legacy background/store:true có quy trình dọn riêng.

<a id="luu-tru"></a>
## 4. Dự án local, cloud và dung lượng

### 4.1. Bảng lưu trữ

| Dữ liệu | Dự án local | Dự án cloud |
|---|---|---|
| Metadata dự án/chương | IndexedDB | D1 và cache IndexedDB |
| Raw đã giải mã | IndexedDB | R2 và cache khi tải về |
| Bytes file gốc lúc nhập | Không có kho bytes gốc riêng trong adapter local | Có lưu bytes gốc khi nhập cloud |
| Nội dung bản dịch/revision | IndexedDB | R2, metadata D1, cache IndexedDB |
| Preset và từ điển | IndexedDB | D1 và cache IndexedDB |
| Attempts, runs, automation jobs | IndexedDB | D1 và checkpoint/outbox cục bộ |
| Font riêng, bìa EPUB | Blob trong IndexedDB | R2 + metadata D1 + cache |
| Highlight | IndexedDB | Cloud và cache |
| Font đang chọn, màu, vị trí đọc, bookmark vị trí | localStorage theo dự án | Vẫn là tùy chọn theo thiết bị/trình duyệt; được đưa vào backup |
| Key người dùng nhập | Mã hóa cục bộ theo dự án | Cũng mã hóa cục bộ, không đưa pool key lên D1/R2 |
| Key server secret | Môi trường server nếu được cấu hình | Môi trường server, không trả giá trị thật cho browser |

### 4.2. Phân biệt tên miền, địa chỉ và cổng

IndexedDB và localStorage thuộc **origin** của website. Những địa chỉ sau không dùng chung kho local:

- `http://localhost:3000`;
- `http://127.0.0.1:3000`;
- `http://localhost:3001`;
- tên miền Sites của website.

Đổi cổng hoặc đổi từ `localhost` sang `127.0.0.1` có thể khiến giao diện trông như không còn dự án local/key. Không nên vội kết luận dữ liệu đã bị xóa. Hãy mở lại đúng origin cũ hoặc chuyển bằng backup.

Cloud phụ thuộc danh tính và website đang kết nối. Dự án cloud của website/tài khoản cũ không tự xuất hiện trong một website mới chỉ vì mã nguồn giống nhau.

### 4.3. 128 MiB có phải trần cứng không?

Không. `PROJECT_STORAGE_BUDGET_BYTES` bằng `128 × 1024 × 1024` byte, phục vụ thanh “Ngân sách dự án”. Vượt mốc này không có nghĩa ứng dụng chủ động cấm lưu.

Phép ước tính cộng các thành phần như:

- `byteSize` của raw;
- độ dài UTF-8 của bản dịch hiện hành;
- nội dung revision không active;
- JSON của preset/từ điển;
- font và bìa.

Đây không phải phép đo tổng dung lượng vật lý. Nó không phản ánh đầy đủ index database, metadata nội bộ, bản raw bytes và raw decoded cùng tồn tại, cache của trình duyệt hoặc dữ liệu tạm khi đóng ZIP.

Vẫn có giới hạn thật ở các lớp khác: dung lượng ổ đĩa, quota browser, quyền lưu của browser, giới hạn request, RAM và tài nguyên hosting. Không nên hiểu “không chặn ở 128 MiB” thành “lưu vô hạn”.

### 4.4. Vì sao bản dịch và revision làm dung lượng tăng nhanh?

Revision lưu **toàn bộ nội dung**, không chỉ phần khác biệt. Một chương có raw, active translation và nhiều bản AI/manual có thể tiêu tốn gấp nhiều lần kích thước file gốc. Tiếng Việt, chữ Hán và token có tỷ lệ byte khác nhau; không thể suy ra dung lượng dịch bằng đúng dung lượng raw.

Mốc “năm revision AI thường” không giới hạn toàn bộ lịch sử ở năm bản. Manual và pinned được bảo vệ khỏi tự dọn; active cũng không bị xóa tự động. Chi tiết ở mục 20.

### 4.5. Có phải cloud và local tự đồng bộ hai chiều không?

Không. Một dự án chọn một chế độ lưu. Cache IndexedDB của dự án cloud là phần hỗ trợ thao tác/phục hồi, không biến nó thành một dự án local độc lập tự đồng bộ hai chiều.

Muốn chuyển chế độ, dùng tạo bản sao sang chế độ khác hoặc backup → import. Hai dự án sau khi sao chép có ID và lịch sử phát triển riêng; sửa một bên không tự sửa bên kia.

### 4.6. Nguyên tắc giữ an toàn dữ liệu

Backup trước khi xóa dự án, đổi trình duyệt/profile, xóa dữ liệu website, chuyển tên miền hoặc sửa raw hàng loạt. Với cloud, đừng đóng máy ngay khi giao diện còn báo đã lưu cục bộ nhưng chờ đồng bộ. Không dùng trạng thái “đã có chữ trên màn hình” làm bằng chứng duy nhất rằng cloud đã commit.

<a id="du-an"></a>
## 5. Tạo, mở, sao chép và xóa dự án

### 5.1. Khởi động workspace

Ứng dụng đọc runtime, kho local và danh sách cloud; chọn workspace phù hợp từ các dự án có thể truy cập. Logic khởi động loại các dự án đang xóa và không mặc định coi cache của một cloud project mất quyền truy cập là một cloud project còn hợp lệ.

Ở trình duyệt mới, dữ liệu local và key cục bộ chưa tồn tại. Nếu dùng đúng website và đúng danh tính, cloud có thể nạp metadata trước, rồi nạp nội dung chương khi cần. Đây là lý do số chương có thể xuất hiện trước khi mọi raw/revision đã được tải vào browser.

### 5.2. Tạo dự án mới

Dự án mới có bộ preset mặc định, cấu hình mặc định, từ điển và chương riêng. Đổi mặc định trong mã nguồn không đồng nghĩa thay toàn bộ thư viện preset của dự án cũ; tuy nhiên, ứng dụng có migration cho một số preset/mẫu cũ được nhận diện. Xem ngoại lệ cụ thể ở mục 8.6.

Cấu hình nổi bật lúc tạo mới:

- model dịch và biên tập: alias Flash mặc định của ứng dụng;
- concurrency dịch: 3;
- concurrency biên tập AI: 3;
- dựng từ điển tự động: tắt;
- chính sách xuất bản: `review-ready`;
- validator: ngưỡng mặc định ở mục 22.

### 5.3. Mở/chuyển dự án

Ứng dụng hạn chế chuyển khi đang có hàng đợi, request đang gửi hoặc AI biên tập, nhằm tránh kết quả của dự án này bị áp dụng vào giao diện dự án khác. Nếu có bản nháp chưa lưu, cần xử lý cảnh báo bỏ draft trước khi chuyển.

Pool key được tải theo ID dự án. Ma trận sức khỏe tạm thời không phải bảng quota vĩnh viễn; việc mở lại dự án có thể khởi tạo lại trạng thái sức khỏe trong phiên.

### 5.4. Sao chép dự án

Bản sao gồm nội dung, preset, từ điển, revision và các tài sản được chức năng sao chép hỗ trợ; các ID liên quan được ánh xạ lại. Đây không phải thao tác chuyển địa chỉ của cùng một project.

Trong cùng browser, chức năng copy có thể sao chép pool key cục bộ sang dự án mới bằng cơ chế vault. Điều này **khác với backup ZIP**: ZIP không mang API key.

Đừng dựa vào bản sao để tiếp tục một interaction đang chạy. Việc sao chép phục vụ nội dung và cấu hình, không phải nhân bản công việc phía Google.

### 5.5. Xóa cloud theo từng phần

Xóa dự án là thao tác phá hủy có xác nhận. Với cloud, quy trình gồm:

1. Ghi dấu “đang xóa” trước khi bắt đầu; không cho autosave hồi sinh project.
2. Server kiểm tra quyền sở hữu và xung đột với tác vụ/lease.
3. Dọn R2 theo các batch giới hạn, mỗi lần tối đa 100 object.
4. Khi nội dung R2 đã được dọn, dọn metadata D1 trong transaction phù hợp.
5. Giữ tombstone xóa hoàn tất để chống một request cũ tạo lại dữ liệu.
6. Client dọn cache và pool key cục bộ của đúng dự án; sau đó trở về thư viện.

Không gộp việc “xóa xong” với việc “tải thành công dự án kế tiếp”. Nhờ vậy lỗi mạng khi mở workspace khác không khiến dự án vừa xóa trông như vẫn đang treo ở bước xóa.

### 5.6. Nếu đóng tab hoặc dừng chờ giữa lúc xóa

Một phần dữ liệu có thể đã bị xóa. Nút tiếp tục xóa dùng để hoàn tất phần còn lại; nó không khôi phục dữ liệu. Dừng chờ ở browser cũng không bảo đảm request DELETE phía server chưa thực hiện.

Không tự tạo lại project có cùng ID để “sửa treo”. Hãy giữ dấu xóa và tiếp tục quy trình. Chỉ backup đã có trước đó mới là đường phục hồi nội dung bị xóa.

### 5.7. Xóa local

Dọn các bảng liên quan trong IndexedDB theo project/chapter: chương, preset, từ điển, attempts, revisions, jobs, highlight, font, cover, pool key… Không xóa toàn bộ database của các dự án khác.

Khóa mã hóa thiết bị dùng chung có thể vẫn được giữ để các pool còn lại tiếp tục giải mã. Đây không phải dấu hiệu pool của dự án đã xóa vẫn còn dùng được.

<a id="nhap-chuong"></a>
## 6. Nhập nguyên văn và quản lý thứ tự chương

### 6.1. Dạng tên file và tiêu đề

Ví dụ:

```text
Tên file: 0000_第0章 赤心巡天世界地图设定文稿.txt
Dòng đầu không rỗng: 第0章 赤心巡天世界地图设定文稿
```

Parser lấy prefix bằng `^(\d+)_`. Không bắt buộc đúng bốn chữ số; `12_...txt`, `0012_...txt` đều có prefix 12. Chữ số thêm zero chỉ giúp tên file dễ nhìn.

Dòng đầu **không rỗng** được đọc bằng mẫu `^第(\d+)章\s*(.*)$`. Khoảng trắng sau chữ `章` được chấp nhận, kể cả nhiều khoảng trắng mà JavaScript nhận diện qua `\s`. Parser này dùng số Ả Rập; không tự hiểu `第一章` thành chương 1.

Thứ tự chạy và xuất chủ yếu theo prefix số, không theo thời gian upload, thứ tự file picker hoặc thứ tự chương hoàn thành.

### 6.2. Cách nhập và encoding

Hỗ trợ chọn nhiều file, chọn thư mục, kéo thả; chỉ nhận file có đuôi `.txt` không phân biệt hoa/thường. Các encoding giao diện hỗ trợ gồm UTF-8, UTF-16 và các lựa chọn GB18030/Big5 qua `TextDecoder`.

BOM UTF-8/UTF-16 được nhận diện để chọn cách giải mã phù hợp. Chỉ BOM bị bỏ khỏi source text; bước nhập raw không tự sửa câu chữ hoặc chuẩn hóa toàn bộ newline.

Giải mã không đặt chế độ fatal. Nếu chọn sai encoding, có thể nhận ký tự thay thế `�` thay vì một exception. Hãy dùng preview encoding; preview chỉ là một phần đầu văn bản, không phải toàn bộ chương.

### 6.3. Những thông tin được tạo

Mỗi chương có filename, prefix, tiêu đề raw, số chương trong tiêu đề, encoding, kích thước bytes, số ký tự, token ước tính, byte hash, request hash, source text, thời điểm và trạng thái ban đầu.

- `byteHash`: SHA-256 bytes file nhập ban đầu.
- `requestHash`: SHA-256 source text sau giải mã/bỏ BOM.
- Hai hash không nhất thiết giống nhau, đặc biệt với encoding khác UTF-8 hoặc BOM.
- Token ước tính là công thức nội bộ, không phải kết quả tokenizer chính thức của Google.

Công thức ước tính hiện tại: khoảng `ceil(số ký tự Hán × 1,15 + số ký tự còn lại / 3,7)`, tối thiểu 1. Không dùng nó để khẳng định chính xác TPM hoặc hóa đơn.

### 6.4. File trùng, prefix trùng và thiếu chương là ba tình huống khác nhau

| Tình huống | Hành vi |
|---|---|
| Trùng filename đã có | Bỏ qua khi nhập; không dùng file mới để âm thầm ghi đè raw cũ. |
| Trùng byte hash | Bỏ qua, kể cả tên file khác. |
| Hai file khác tên/nội dung nhưng cùng prefix | Có thể nhập, sau đó đánh dấu xung đột thứ tự. |
| Không có prefix hợp lệ | Xung đột thứ tự; cần sửa trước khi dịch/xuất. |
| Prefix khác số trong dòng tiêu đề | Xung đột thứ tự. |
| File rỗng | Có thể thành bản ghi để báo lỗi/cảnh báo; không phải raw dùng được để dịch. |
| Thiếu một số prefix giữa min và max | Cảnh báo khoảng trống; không tự tạo chương thiếu. |

Xung đột loại chương khỏi hàng đợi và xuất bản cho đến khi xử lý. Khoảng trống không có nghĩa phải đánh lại số tất cả chương. Chẳng hạn có 100, 101, 103 thì có thể giữ đúng số và tìm lại chương 102 sau.

### 6.5. Có thể thêm chương mới liên tục không?

Có. Nhập các file mới với prefix phù hợp. Ứng dụng ghép vào dự án rồi sắp xếp lại, không buộc số chương đứng yên ở số lượng ban đầu.

Nếu tác giả sửa lại một chương cũ có cùng filename, import thông thường sẽ bỏ qua tên trùng. Muốn thay nguyên văn đã có, dùng sửa raw có chủ đích; không dùng import như chức năng đồng bộ file hai chiều.

### 6.6. Vì sao đã đếm đủ file nhưng còn đang nhập?

Import có nhiều pha:

1. Đọc/giải mã/hash từng file.
2. Lưu dữ liệu vào IndexedDB.
3. Với cloud: gửi nội dung lên server theo batch 25 chương, tối đa bốn batch song song.
4. Ghi nhận kết quả và bỏ trạng thái đang nhập trong `finally`.

Đếm đủ 2.839 file có thể mới phản ánh pha đọc đã xong. Cần xem nhãn pha lưu/đồng bộ. Nếu cloud lỗi, thông báo phân biệt “đã lưu trên máy” với “cloud chưa đồng bộ hết”; không được coi hai tình huống là tương đương.

Đối với nạp nội dung cloud về sau, client chia request theo tối đa 25 chương hoặc khoảng 8 MiB raw metadata ước tính, dùng tối đa ba worker tải nội dung.

### 6.7. Nội dung truyện không tự thành mã nguồn

Import vào workspace trình duyệt không có nghĩa commit truyện vào Git. Nguồn ứng dụng và dữ liệu truyện là hai loại dữ liệu riêng. Tuy nhiên backup ZIP chứa nội dung thật và cần được giữ riêng tư.

<a id="chon-chuong"></a>
## 7. Chọn chương, lọc và sắp xếp

### 7.1. Ba thao tác độc lập

- **Lọc:** thay đổi những hàng đang nhìn thấy.
- **Sort:** đổi thứ tự trình bày của các hàng.
- **Chọn:** đánh dấu `selected` để xác định phạm vi thao tác.

Lọc không tự chọn kết quả; sort không tự dịch chương. Đổi bộ lọc không mặc nhiên bỏ các chương đã chọn nhưng đang bị ẩn.

### 7.2. Ý nghĩa các nút chọn

| Thao tác | Kết quả |
|---|---|
| Chọn một checkbox | Thêm/bỏ một chương trong tập đã chọn. |
| Shift-click trong bảng chương | Chọn/bỏ một dải hàng theo thao tác và thứ tự hiển thị hiện tại. |
| Chọn tất cả | Chọn toàn bộ chương trong phạm vi chức năng đó, không chỉ phần bảng đang cuộn nhìn thấy. |
| Bỏ tất cả | Bỏ đánh dấu toàn bộ. |
| Chọn đang lọc | Thêm các kết quả lọc vào tập đã chọn; giữ lựa chọn ngoài bộ lọc. |
| Bỏ đang lọc | Bỏ những chương khớp lọc; giữ các lựa chọn khác. |
| Chỉ chọn kết quả lọc | Thay thế tập chọn bằng đúng kết quả lọc; bỏ mọi lựa chọn ngoài đó. |
| Đảo lựa chọn | Mục được chọn thành không chọn; mục không chọn thành được chọn trong phạm vi thao tác. |
| Chọn/bỏ khoảng prefix | Áp dụng theo giá trị prefix từ X đến Y, bao gồm hai đầu. |
| Lọc khoảng | Chỉ hiển thị chương có prefix trong khoảng; kết hợp từ khóa/trạng thái, cuộn về đầu kết quả. Không thay checkbox. |

Ví dụ đang chọn chương 1–10, lọc ra chương 100–105:

- “Chọn đang lọc” → chọn 16 chương: 1–10 và 100–105.
- “Chỉ chọn kết quả lọc” → còn đúng sáu chương 100–105.

Đây là khác biệt rất quan trọng khi từ trang chất lượng chuyển sang AI biên tập hoặc dịch lại theo “Đã chọn”.

### 7.3. Khoảng có bao gồm chương 0 không?

Có. Khoảng `0–10` gồm 11 chương nếu đủ prefix. Khoảng `100–160` gồm 61 chương. Nhập hai đầu đảo nhau được chuẩn hóa về min/max.

Nhập Từ/Đến rồi bấm **Lọc khoảng** hoặc Enter để áp dụng. Không áp dụng khi mới gõ;
hai ô phải đủ số nguyên 0–9.999.999, ô trống không được coi là 0. Count và khoảng đang
lọc xuất hiện dưới thanh công cụ. **Bỏ lọc khoảng** chỉ xóa điều kiện prefix, giữ
từ khóa/trạng thái. Lọc không tự bỏ chương đã chọn bên ngoài khoảng; bấm Bỏ tất cả
rồi Chọn đang lọc nếu chỉ muốn chọn đúng tập kết quả hiện tại. Chọn khoảng/Bỏ khoảng
vẫn tác động checkbox theo prefix, độc lập với các bộ lọc khác.

Đổi filter/sort hoặc áp dụng lại khoảng đưa bảng về đầu và reset mốc Shift-click; cập nhật selection/tiến độ không tự kéo cuộn. Chuyển project xóa khoảng lọc cũ. Không có kết quả lọc khác với chưa nhập truyện.

Khoảng dùng prefix, không dùng “hàng thứ X” của danh sách sau lọc. Nếu thiếu prefix 103 thì chọn 100–105 chỉ có năm chương thực tế; ứng dụng không sinh chương 103.

### 7.4. Tập chọn được dùng chung

Trang chương, chất lượng và các hộp chọn phạm vi dùng trạng thái chọn trên chương. Khi chuyển từ chất lượng sang biên tập, hãy nhìn tổng số “Đã chọn”; nó có thể bao gồm chương đang bị bộ lọc che đi.

Tập chương của một run được chốt khi bấm bắt đầu. Chọn thêm chương trong lúc run đang chạy không có nghĩa chương đó được tự chèn vào run hiện tại. Muốn chạy một phạm vi mới, đợi/dừng run rồi bắt đầu lượt mới.

### 7.5. Sort theo model

Sort model dựa trên metadata model của chương, giúp nhóm các chương có nhãn model tương tự. Nó không phải truy vấn toàn bộ lịch sử revision.

Muốn biết “chương này từng bị Flash Lite xử lý hay chưa”, phải xem provenance của các revision, không chỉ nhãn hiện tại. Chương có thể có nhiều revision từ nhiều model; manual revision không dùng LLM. Một số trường metadata chương còn phản ánh lượt xử lý gần nhất ngay cả khi active manual được giữ lại; mục 20 giải thích giới hạn này.

<a id="instructions"></a>
## 8. Hai thư viện system instruction

### 8.1. Dịch và biên tập là hai preset độc lập

Ứng dụng có thư viện instruction dịch và thư viện instruction biên tập AI riêng. Mỗi bên có nội dung, tên, bản được chọn và thao tác import/export riêng.

- Chọn preset dịch không tự thay preset biên tập.
- Biên tập AI không ghép toàn bộ preset dịch vào instruction của mình.
- Quét từ điển có prompt trích xuất chuyên dụng trong code; không lấy một trong hai preset làm nhiệm vụ dịch/biên tập.
- Chọn “mục tiêu biên tập” không cắt preset thành một đoạn nhỏ; vẫn gửi đầy đủ preset biên tập đang chọn, rồi bổ sung mục tiêu của lượt đó.

### 8.2. Ba cặp preset, không nhầm bản review với default

| Vai trò | Bản dịch | Bản biên tập |
|---|---|---|
| Default code 1.14.1, vẫn đang là mặc định | [dich-truyen-flash-interactions.md](../presets/dich-truyen-flash-interactions.md) | [bien-tap-ai-flash-interactions.md](../presets/bien-tap-ai-flash-interactions.md) |
| Nguyên bản dài 1.14.0 để quay lại | [backup/dich-truyen-flash-1.14.0.md](../presets/backup/dich-truyen-flash-1.14.0.md) | [backup/bien-tap-ai-flash-1.14.0.md](../presets/backup/bien-tap-ai-flash-1.14.0.md) |
| Bản cũ giữ nguyên + bổ sung, để review/import thử | [dich-truyen-flash-ban-cu-bo-sung.review.md](../presets/review/dich-truyen-flash-ban-cu-bo-sung.review.md) | [bien-tap-ai-flash-ban-cu-bo-sung.review.md](../presets/review/bien-tap-ai-flash-ban-cu-bo-sung.review.md) |

Default 7.392/9.058 ký tự khớp `lib/flash-presets.ts`, hai file mặc định và phụ lục A–B của PLAN. Các file backup/review không tự được đọc thành default và chưa thay preset của dự án người dùng.

Bản review giữ toàn bộ 15 mục cũ, thêm mục 16 về ngữ nghĩa, mức chắc chắn/cường độ/thời-thể, cú pháp Việt, quan hệ/xưng hô không tự bịa, giữ hình ảnh/hàm ý và văn phong đặc thù. Biên tập nhấn mạnh chỉ sửa trong phạm vi cần. Dịch tăng từ 15.549 lên 17.513 ký tự (+12,6%); biên tập từ 17.639 lên 19.707 (+11,7%). Số ký tự không phải số token; chưa phải kết luận chất lượng hoặc tốc độ tốt hơn.

Cả ba cặp giữ tiêu đề chương, raw kể cả “rác”, bracket, tên/xưng hô/thể loại và giao thức tương ứng. Dịch mới trả `blocks-v1`; AI edit toàn chương trả `translation`; Hán/But trả `updates`.

README cũ trong thư mục presets vẫn có đoạn mô tả dịch trả `{"translation":"..."}`; không dùng đoạn đó thay hợp đồng `blocks-v1` trong code/file preset. Lượt này chỉ cập nhật hai tài liệu được yêu cầu, không tự sửa các file preset hoặc README khác.

### 8.3. Effective instruction trên UI và payload thực tế

Đối với dịch:

```text
Preset dịch đang chọn
    + glossary đang bật
    = effective instruction được chụp cho run/lô
    + giao thức blocks-v1 ở lớp server
    + response_format/schema của request
    = hợp đồng gửi Gemini thực tế
```

Đối với biên tập:

```text
Preset biên tập đang chọn
    + glossary đang bật
    + giao thức theo ID nếu là dọn Hán/But
    + schema output theo tác vụ
    + mục tiêu/yêu cầu bổ sung trong input
```

Preview instruction không phải bản dump hoàn chỉnh của mọi field HTTP. Phần giao thức JSON do ứng dụng thêm để giải mã, ghép ID và kiểm tra kết quả. Đây là ràng buộc kỹ thuật của định dạng, khác với việc âm thầm đưa thêm một preset văn phong khác.

Nếu preset cũ yêu cầu “chỉ trả văn bản thuần”, giao thức dịch mới nói rõ nó thay định dạng cũ bằng JSON theo ID. Nên import preset tương thích để tránh mệnh lệnh xung đột; không xóa schema trong code chỉ để làm preview ngắn hơn.

### 8.4. Sửa preset có tác động đến run đang chạy không?

Model, instruction, glossary và các thông tin phục vụ run được chụp vào snapshot; interaction đã gửi không đổi nội dung vì người dùng sửa một ô trên UI sau đó.

Trong run có quét glossary theo lô, mỗi lô có snapshot riêng sau khi hợp nhất kết quả quét. Lô sau có thể dùng từ điển đã mở rộng từ lô trước. Đó là hành vi chủ động của pipeline, không phải cập nhật ngẫu nhiên instruction của request đang chạy.

Không nên gọi snapshot hiện tại là “lưu mọi thứ tuyệt đối”: `RunSnapshot` chưa có trường lưu đầy đủ ngưỡng validator. Validator dùng cấu hình project mà luồng xử lý đọc tại thời điểm xử lý liên quan; truy vết ngưỡng chất lượng không hoàn chỉnh như truy vết instruction/model.

### 8.5. Glossary gửi đi có được lọc theo raw không?

Cần phân biệt ba đường:

| Đường xử lý | Mục từ điển được gửi |
|---|---|
| Dịch | Các term đang `enabled`, có source và target, từ glossary snapshot. Không lọc riêng theo từng raw chương. |
| Biên tập AI | Glossary đang bật được ghép vào instruction. Kể cả dọn ít block vẫn có thể mang phần instruction/glossary này. |
| Quét glossary | Chọn các term hiện có mà `source` xuất hiện trực tiếp trong raw, tối đa 250 term làm tham chiếu. |

Không có vector database, embedding search hay RAG ngữ nghĩa ở đây. Việc quét dùng `includes` là so khớp chuỗi trực tiếp, không phải truy hồi gần nghĩa.

Hệ quả thực tế: nếu glossary đang bật rất lớn, request dọn một vài block vẫn không nhất thiết có input cực nhỏ. Có thể tắt term không cần thiết, nhưng mọi thay đổi phải được cân nhắc để giữ thống nhất tên riêng.

### 8.6. Import, nhân bản và giữ phiên bản sau reload

Hai thư viện có cờ metadata `InstructionPreset.autoUpdate`:

- Thiếu cờ được hiểu true để tương thích dữ liệu cũ.
- **Import MD/TXT/JSON và nhân bản đặt false.** Migration không sửa nội dung bản này sau reload, dù tên giống default.
- Cờ được giữ qua Dexie, cloud, backup/restore và sao chép dự án. D1 có hai cột `auto_update`, migration `0008_sudden_dreadnoughts.sql`, default true.
- Không chèn marker “không nâng cấp” vào nội dung gửi AI.

Với autoUpdate cho phép, app còn migration các default cũ được so khớp cụ thể; 1.14.1 so nội dung sau chuẩn hóa newline/trim, không dựa tên. Bản tùy chỉnh không bị thay đại trà, nhưng nhánh template dịch legacy có marker/câu mẫu vẫn cần lưu ý. Không suy rằng mọi preset cũ đều tuyệt đối bất biến nếu nó vẫn cho autoUpdate.

Cách thử bản dự phòng/review: export preset đang dùng để giữ bản riêng → import file đúng thư viện Dịch hoặc Biên tập → xác nhận preset được chọn → chạy phạm vi nhỏ mới. Import tạo/chọn bản mới, giữ default để đổi lại; reload không tự nâng bản vừa import lên default cô đọng. Không đổi request/snapshot đã bắt đầu, raw hoặc revision.

Đổi default code không tự là sự đồng ý thay toàn bộ preset riêng của mọi dự án. Hai file review hiện chỉ là phương án để người dùng lựa chọn.

<a id="models"></a>
## 9. Danh sách model, alias và khóa model

### 9.1. Không còn danh sách đóng năm/sáu model như kế hoạch đầu

Ứng dụng có catalog lấy từ API model bằng credential hiện có, kết hợp các alias khởi động:

- `gemini-flash-latest`;
- `gemini-flash-lite-latest`;
- `gemini-pro-latest`.

Catalog lọc các model văn bản phù hợp, loại các họ image/audio/TTS/live/embedding và các tên không đúng dạng cho phép. Model khai báo rõ không hỗ trợ thinking cũng không được dùng theo chính sách hiện tại.

Thứ tự hiển thị ưu tiên **Flash → Flash Lite → Pro**. Trong họ, alias và số phiên bản được dùng để sắp xếp. Đây là thứ tự lựa chọn trên UI, **không phải danh sách fallback khi chạy**.

### 9.2. Alias là gì?

Alias là tên định tuyến do nhà cung cấp quản lý. Chọn `gemini-flash-latest` nghĩa là khóa **chuỗi model request** đó, không đóng băng vĩnh viễn một phiên bản backend mà alias trỏ tới.

Revision lưu cả model được yêu cầu và model được response báo lại khi có. Nếu muốn tái lập chính xác hơn, dùng ID phiên bản cụ thể được tài khoản hỗ trợ; ngay cả vậy kết quả AI vẫn không được cam kết giống byte-for-byte.

### 9.3. Khóa model trong một đợt chạy

Ví dụ chọn model A và 20 key:

```text
model A + key 01
model A + key 02
...
model A + key 20
```

Không có bước tự đổi thành model B khi các key của A không dùng được. Tùy lỗi, app chờ cooldown hoặc báo thất bại. Muốn đổi model, người dùng chọn model khác cho một lượt chạy tiếp theo.

Model dịch, model biên tập và model quét glossary có thể khác nhau. Chọn Flash cho dịch không bắt buộc glossary cũng dùng Flash. Nhãn `auto` còn tồn tại trong một số cấu trúc tương thích cũ chỉ giải quyết thành một model đã chọn; nó không khôi phục chiến thuật xoay hạ model cũ.

### 9.4. Thinking và output limit

Các request tạo nội dung gửi `thinking_level: "high"`. Output limit lấy từ metadata model; fallback trong code là 65.536 khi không có metadata limit.

Không có temperature/top_p/top_k/tool/grounding/candidate count tùy chỉnh trong luồng này. Thinking high có thể làm request ngắn vẫn mất thời gian; output limit lớn là mức tối đa cho phép, không buộc model xuất đủ số token đó.

Giá trị fallback không chứng minh mọi model đều có cùng giới hạn đầu vào/đầu ra hoặc cùng cách tính thinking token. Không dùng con số này thay tài liệu/quota thực tế của project Google.

### 9.5. Ma trận sức khỏe đo được gì?

Kiểm tra key/model chủ yếu đọc metadata model (`models.get`). Nó xác nhận một phần khả năng xác thực/truy cập metadata, không tạo thử một chương dịch.

Vì vậy ma trận xanh **không bảo đảm**:

- project còn đủ quota tạo nội dung;
- tài khoản được phép sinh nội dung với model/structured schema và cấu hình đang chọn;
- request nội dung cụ thể không bị safety chặn;
- mạng sẽ ổn định trong suốt POST stream;
- model thực sự xử lý request dài với tốc độ mong muốn.

Dashboard Google còn quota và ứng dụng báo lỗi cũng không đủ để kết luận SDK hỏng hoặc tài khoản hỏng; phải đọc lỗi của đúng POST/interaction, đúng model và đúng key.

<a id="api-key"></a>
## 10. Pool API key, mã hóa và chọn key

### 10.1. Tối đa 50 slot

Ứng dụng hỗ trợ tối đa 50 API project/key trong pool sử dụng (tổng key UI và server). Có thể nhập từng ô hoặc dán danh sách mỗi dòng một key; bộ nhập loại dòng trống, hỗ trợ kiểm tra trùng và tôn trọng số slot còn lại. Pool cũ giữ nguyên khi nâng cấp; thêm key không tự tăng số luồng hoặc quota Google.

Alias như “API Project 01” là nhãn người dùng đặt, không phải thông tin xác nhận từ Google rằng key đó thuộc một project độc lập.

### 10.2. Hai nguồn credential

| Nguồn | Cách sử dụng |
|---|---|
| Key nhập trên UI | Giá trị nằm trong bộ nhớ khi chạy; gửi bằng header `X-Session-Gemini-Key`, không đặt vào JSON body. Có thể lưu mã hóa cục bộ để lần sau khỏi nhập lại. |
| Server secret | `GEMINI_API_KEY_01`…`GEMINI_API_KEY_50`; `GEMINI_API_KEY` làm fallback cho slot 1. Frontend chỉ biết slot/alias, không nhận giá trị secret. |

Các tên `session` trong type là nguồn key nhập phía trình duyệt; không còn đồng nghĩa “chỉ tồn tại trong RAM, đóng tab là mất” như kế hoạch rất sớm.

### 10.3. Lưu pool theo dự án

Pool nhập tay được mã hóa bằng AES-GCM 256-bit trước khi lưu IndexedDB. Mỗi lần mã hóa có IV ngẫu nhiên; project ID được dùng làm dữ liệu ràng buộc. Khóa mã hóa là `CryptoKey` không extractable được lưu cục bộ.

Nhờ đó reload đúng origin/browser có thể lấy lại pool tối đa 50 key mà không phải nhập lại từng ô. Nhưng:

- đổi browser/profile/origin không tự có pool;
- xóa dữ liệu website có thể làm mất cả ciphertext và khóa giải mã;
- backup ZIP không chứa ciphertext/key;
- cloud không đồng bộ key UI sang máy khác;
- bảo vệ mã hóa at-rest không chống được mọi mã độc/XSS đang chạy trong cùng origin và có quyền sử dụng ứng dụng.

Fingerprint SHA-256 rút gọn dùng nhận diện key trùng và tìm lại đúng credential cho interaction cũ. Fingerprint không phải key, không thể dùng một mình để gọi Google.

### 10.4. Chọn key khi chạy nhiều luồng

Các credential hợp lệ được xếp ưu tiên theo:

1. Ít request đang dùng hơn.
2. Ít token ước tính đang được giữ hơn.
3. Lâu chưa được sử dụng hơn.
4. Slot để phá hòa.

Lúc giữ một key cho request mới, code chỉ lấy key đang rảnh (`activeRequests === 0`), tăng số giữ chỗ ngay trước khi nhường điều khiển bất đồng bộ. Vì vậy hai worker không cùng nhìn thấy một key rảnh rồi cùng lấy nó trong cùng bộ điều phối.

Ví dụ 5 luồng và 20 credential hợp lệ: năm worker đầu thường lấy năm credential khác nhau. Worker xong nhả key; lượt kế tiếp ưu tiên key rảnh theo tiêu chí trên. Không có quy tắc cố định “luồng 1 mãi dùng key 1”.

Nếu chỉ có ba key dùng được thì đặt 10 luồng không tạo được 10 request độc lập cùng lúc. Phần còn lại chờ key.

### 10.5. Key khác nhau có chắc là quota khác nhau?

Không. Ứng dụng phát hiện trùng giá trị key nhưng không tự xác minh hai key khác chuỗi thuộc hai Google project khác nhau. Việc đặt hai alias khác nhau không tách quota.

Không dùng danh sách slot làm phép đo quota chính xác. Bộ chọn key là bộ điều phối theo tín hiệu nhận được, không phải bản sao dashboard quota của Google.

### 10.6. Giữ key bao lâu?

Key được giữ lúc gửi/nhận stream và xử lý/lưu kết quả theo workflow; luôn release khi nhánh đó kết thúc. Request lỗi hoặc bị ngắt không giữ key chờ nối lại direct. Chờ key/quota của hàng đợi dịch trả chương về pending, không giữ worker.

Cleanup provider chỉ có với background legacy, được tách sang queue bảo trì để không giữ luồng dịch. Nhả key cục bộ/abort nhận không khẳng định Google đã ngừng xử lý; lần thử mới có thể vẫn tiêu quota trong khi lượt cũ còn ở provider.

### 10.7. Giới hạn tốc độ gửi trong code

Bộ submit gate dùng khóa theo **cặp credential–model**, khoảng cách tối thiểu bình thường 250 ms. Nó không cố ý tuần tự hóa mọi key bằng một khóa model toàn cục.

Quota/cooldown có bộ chờ riêng. 250 ms không phải cam kết RPM cho phép và không vượt qua được hạn mức nhà cung cấp.

<a id="vong-doi-dich"></a>
## 11. Một lượt dịch từ đầu đến cuối

### 11.1. Trước khi gửi

1. Lấy danh sách selected đủ điều kiện, chốt phạm vi và sort prefix.
2. Chụp model, instruction, glossary, credential refs và concurrency vào run/lô.
3. Lấy raw hiện tại/hash; tạo TITLE và các ID P0001… cho toàn chương.
4. Xét quyền điều phối/lease, pause/stop, attempt cũ. Direct failed không bị coi như background đang chờ nối lại.
5. Reserve một key rảnh nguyên tử; không lấy key đang được tác vụ khác giữ.
6. Lưu checkpoint submitting với executionMode=direct, sourceRequestHash, outputFormat và định danh lượt.

Không xóa raw/active/revisions cũ trước POST. Nếu chưa có key rảnh/cooldown, hàng đợi dịch nhả worker về pending, không để mỗi chương ngủ giữ một luồng.

### 11.2. Tại API server

Server kiểm user/payload/owner, lấy source và snapshot phù hợp với local/cloud; lấy metadata model với giới hạn 15 giây trong đường sinh nội dung. Sau đó gọi Interactions create trực tiếp:

- model khóa đúng lựa chọn;
- input JSON blocks của toàn chương;
- system instruction nằm riêng;
- response schema theo danh sách ID;
- thinking_level=high, max_output_tokens theo metadata hoặc 65.536;
- background=false, store=false, stream=true;
- SDK không tự retry ẩn;
- tổng deadline server 10 phút, tính cả bước metadata.

Không dùng chương trước/sau, không tự chunk, không thêm công cụ hay sampling. Quét/AI edit dùng cùng transport nhưng payload/schema riêng.

### 11.3. POST trả một stream, không trả “vé chờ nối lại”

Server mở application/x-ndjson. Browser đọc progress, heartbeat, result và error cho đến khi có kết quả terminal hoặc lỗi. Khi HTTP 200 đã mở stream, provider vẫn có thể trả lỗi bên trong frame error; 200 không đủ kết luận thành công.

Nếu Google cung cấp providerInteractionId, app giữ làm metadata diagnostic. ID này **không** được dùng để dựng lại observer background hay hứa lấy output sau reload.

### 11.4. Nhận tiến độ, heartbeat và giới hạn chờ

- Progress phản ánh trạng thái provider thực sự được adapter nhận.
- Heartbeat khoảng 15 giây chỉ chứng minh kết nối app còn phát tín hiệu.
- Client timeout toàn lượt 10 phút 15 giây; không reset theo mỗi chunk.
- Client idle timeout 45 giây không nhận byte; heartbeat làm mới idle nhưng không kéo dài deadline tổng.
- Mất stream, EOF trước terminal hoặc timeout: báo lỗi, nhả key/worker. Không lưu bản dịch đang nhận dở và không tự POST lại cùng chương.

Đây không phải polling 2 giây/phiên quan sát 30 phút. Các mốc đó chỉ thuộc reader legacy ở mục 16.

### 11.5. Khi nhận kết quả hoàn chỉnh

Adapter chỉ lấy text từ model_output, không ghép thought summary/signature; xử lý delta/terminal tránh lặp. Kết quả completed có text mới đi tiếp:

1. Parse structured JSON; kiểm ID lạ/trùng/thiếu, block rỗng, TITLE một dòng.
2. Kiểm raw hash còn đúng; nối nội dung theo thứ tự **ID raw**, tạo alignment.
3. Tính quality warnings.
4. Lưu revision và cập nhật active theo guard; cập nhật chapter/attempt/UI thống nhất.
5. Với cloud, commit phần nội dung lên cloud; metadata lịch sử có outbox riêng.
6. Release key/worker, refill chương tiếp.

Truncated, safety, invalid output hoặc empty output không được lưu như thành công. Kết quả đến muộn không đè raw/manual/lượt mới hơn. Lượt direct không xếp DELETE cleanup provider sau commit.

### 11.6. Khi đã có nội dung nhưng cloud còn lỗi

Có thể revision đã lưu local nhưng cloud content hoặc metadata chưa nhận. Giữ bản local, hiển thị lỗi đồng bộ đúng loại và không biến nó thành request AI còn chạy.

Nút Đồng bộ lịch sử chỉ phục vụ metadata attempts/jobs, không phải cam kết sửa mọi lỗi raw/revision/config. Xem thông báo lưu, kiểm tra lại cloud và giữ backup/bản local trước khi đóng/xóa dữ liệu. Không dùng Nối lại AI direct hoặc tự dịch thêm lần nữa để chữa lỗi lưu trữ.

<a id="block-id"></a>
## 12. Structured output và đối chiếu block ID

### 12.1. Raw được tách như thế nào?

- Dòng không rỗng đầu tiên → `TITLE`.
- Nếu phần thân có dòng trống phân cách → mỗi cụm đoạn là một block.
- Nếu phần thân không có dòng trống phân cách → mỗi dòng không rỗng là một block.
- Block được trim ở biên; dòng trống không có nội dung không trở thành một ID riêng.
- Thân chương lần lượt là `P0001`, `P0002`…

Điều này bảo toàn đơn vị nội dung cho dịch/đối chiếu, không phải bảo toàn từng byte whitespace trong file gốc. Raw được lưu vẫn là raw đã nhập/sửa; input gửi Gemini là JSON có cấu trúc, không còn là string nguyên file byte-for-byte.

### 12.2. Ví dụ input và output

Input minh họa:

```json
{
  "blocks": [
    { "id": "TITLE", "source": "第1章 归来" },
    { "id": "P0001", "source": "他推开门。" },
    { "id": "P0002", "source": "屋内很安静。" }
  ]
}
```

Output minh họa:

```json
{
  "blocks": [
    { "id": "TITLE", "translation": "Chương 1: Trở về" },
    { "id": "P0001", "translation": "Hắn đẩy cửa bước vào." },
    { "id": "P0002", "translation": "Trong nhà rất yên tĩnh." }
  ]
}
```

App lấy các giá trị `translation`, không lưu dấu ngoặc JSON vào TXT/EPUB. Content được nối bằng `\n\n`; alignment giữ các offset kết thúc block để về sau không phải đoán ranh giới từ số dòng trống.

### 12.3. Những kiểm tra bắt buộc

Schema ràng buộc số phần tử bằng số block và giới hạn ID cho phép. Client vẫn kiểm tra thêm:

- JSON đọc được và đúng trường;
- mỗi ID đúng một lần;
- không có ID lạ;
- không thiếu ID nào;
- translation không rỗng sau khi xét whitespace/ký tự vô hình được xử lý;
- `TITLE` không chứa nhiều dòng;
- raw hash còn đúng.

Nếu response đưa các ID đúng nhưng thứ tự mảng đảo, app vẫn sắp lại **theo ID raw**. Nếu AI gán sai ý nghĩa vào ID đúng, schema không thể tự phát hiện hết; người dùng vẫn cần đối chiếu nội dung.

### 12.4. Một ID có nhiều đoạn con được không?

Có. Ví dụ `P0002.translation` chứa hai đoạn con ngăn bởi dòng trống vẫn chỉ là một block P0002. Backspace/Enter trong ô đó chỉ thay nội dung bên trong block, không tự làm tăng/giảm ID phía raw.

Hai cột ở cùng hàng chia sẻ ID. Chiều cao hàng theo nội dung nên hai bên luôn được đối chiếu ở cùng đơn vị; không đòi mỗi bên có cùng số dòng hiển thị do font và độ dài khác nhau.

### 12.5. ID có cố định vĩnh viễn không?

Không. ID được tạo từ cấu trúc raw hiện tại của chương. Chèn/bỏ một đoạn raw có thể làm các ID phía sau dịch chuyển. `sourceRequestHash` giúp phát hiện rằng alignment cũ không còn thuộc raw mới.

Nếu thay raw làm thay đổi số/thứ tự đoạn đáng kể, dịch lại theo raw mới là cách đáng tin hơn việc cưỡng ép alignment cũ. Code không có cơ chế hiểu ngữ nghĩa để tự nối lại mọi đoạn qua mọi lần raw thay đổi.

### 12.6. Bản dịch cũ không có alignment

App vẫn mở được. Nó tạo alignment tạm theo vị trí, không phải nhờ một LLM tự căn chỉnh:

- Có nhiều đoạn dịch hơn slot raw: phân bổ các đoạn dịch vào slot còn lại.
- Có ít đoạn dịch hơn: phân bố theo vị trí, có thể để một số ô trống.
- Một block raw có thể nhận nhiều đoạn dịch.

Đây là fallback cho dữ liệu legacy, không phải chứng nhận hai cột đã khớp nghĩa. Cần rà soát trước khi dùng chế độ AI dọn từng ID, vì AI chỉ thấy raw được app ghép với target đó.

Nhập bản dịch hoàn chỉnh từ ngoài dùng quy tắc ghép riêng, mô tả ở mục 19; không nên đánh đồng với fallback legacy.

### 12.7. Structured output giải quyết và không giải quyết điều gì?

Giải quyết tốt việc kiểm tra cấu trúc, thiếu ID, trùng ID, block trống và thứ tự ghép kỹ thuật của lượt dịch mới.

Không bảo đảm:

- AI không lược ý trong một translation không rỗng;
- tên riêng/xưng hô luôn đúng;
- JSON hợp lệ đồng nghĩa bản dịch đúng;
- raw cũ và raw mới tự căn chỉnh;
- AI biên tập toàn chương giữ nguyên ranh giới cũ hoàn hảo;
- request sẽ nhanh hơn, không gặp safety hay không bị rate limit.

<a id="hang-doi"></a>
## 13. Hàng đợi, số luồng và ba nút điều khiển

### 13.1. Chương nào được nhận khi bấm Bắt đầu?

Chương phải nằm trong tập đã chọn, không xung đột thứ tự và có trạng thái đủ điều kiện. Chương completed có bản đang dùng được bỏ qua; muốn dịch lại cần chuẩn bị Dịch lại. Failed/cancelled thông thường có thể nhận trực tiếp ở lần Start mới.

Attempt direct dở chưa có revision sau mất stream/reload không khóa chương vào Nối lại vô hạn. Chỉ record background legacy unresolved mới cần kiểm tra/bỏ theo dõi riêng. Nhãn Failed không làm mất active cũ.

Run chốt danh sách lúc bắt đầu; chọn thêm trong bảng không âm thầm mở rộng phạm vi đang chạy. Chương lỗi không tự quay lại cuối chính run đó liên tục.

### 13.2. Pool được bổ sung liên tục, không đợi xong batch 10

Chọn 0–100, 10 luồng: 0–9 có thể bắt đầu; chương 3 xong thì 10 vào ngay nếu có key/slot, không chờ 0–9 hoàn tất hết.

Bộ điều phối giữ pending và active. Chương thiếu key/cooldown trả về pending, nhả worker để xét chương khác. Số lần submit và credential đã loại của chương vẫn giữ trong run; không được reset 150 lần chỉ vì yield. Một coordinator chung chờ tín hiệu (nhịp kiểm khoảng 250 ms), không có 10 worker ngủ chờ quota.

Không có phép màu nếu mọi key đều cooldown: nhảy sang chương khác cũng không tạo quota mới. Khi đó bộ đếm đang chạy có thể về 0, số Đang chờ còn nhiều, và quota watch có thể tự pause như mục 13.10.

### 13.3. Ngoại lệ: lô glossary có hàng rào giữa các giai đoạn

Glossary off: rolling pool trên toàn danh sách. Glossary suggest/auto: quét lô → hợp nhất → chốt snapshot → dịch lô → lô tiếp.

Trong pha dịch từng lô vẫn refill liên tục. Nhưng chưa phải scan N+1 chồng lấn với dịch N xuyên mọi lô. Số worker scan tối đa 5 và batch size khác concurrency. Cơ chế yield/quota watch 5 phút ở đây áp dụng **pha dịch**, không bảo đảm quét và AI edit dùng cùng scheduler mới.

### 13.4. Vì sao đặt 10 mà số đang chạy vẫn dao động?

10 là trần. Chương hoàn tất, đang lưu, nguồn cloud chưa nạp, key chưa rảnh, quota/cooldown, pipeline scan và số chương còn lại đều ảnh hưởng.

waiting-key/cooldown/paused không được tính thành tác vụ sống. Dịch đã gửi có thể ở provider-queued/running/saving; đó là các pha thật, không chỉ lúc token đang được sinh. Cần xem phase/log, không sửa bộ đếm cho luôn bằng slider.

Sau cải tiến, riêng chương **chờ key/quota trong hàng đợi dịch không giữ worker**. AI edit/quét có vòng xử lý riêng, không suy toàn bộ hành vi này từ hàng đợi dịch sang hai chức năng kia.

### 13.5. Tạm dừng

Chặn claim/submit mới, kể cả qua gate ngay trước POST. Các stream đã gửi vẫn nhận và lưu kết quả. Run còn trong memory để Tiếp tục, phạm vi vẫn là danh sách đã chốt.

Nếu reload/đóng tab trong lúc pause, không thể tiếp tục nhận stream cũ bằng nút Tiếp tục. Đây là pause bộ điều phối đang mở, không phải pause model tại Google.

### 13.6. Dừng sau lượt

Không gửi thêm chương; đợi stream hiện tại kết thúc/lưu rồi đóng run, trở về Bắt đầu. Không yêu cầu Google cancel những lượt đang gửi.

Chương chưa submit bị dừng bởi user có thể mang cancelled với lý do chưa gửi. Start mới dùng selection và eligibility hiện hành; failed/cancelled hợp lệ được nhận, completed bị bỏ qua.

### 13.7. Ngắt đang chạy

Tên thao tác hiện tại là **Ngắt đang chạy**; các ảnh/tài liệu cũ có thể gọi Hủy đang chạy.

App chặn submit mới và abort POST/response body đang nhận để phản hồi nhanh, nhả slot. Kết quả đã hoàn thành/lưu giữ nguyên. Lượt đang nhận bị ngắt có thể mang cancelled với thông điệp ngắt phía app.

Không đợi Google xác nhận cancel, và **không khẳng định Google đã ngừng xử lý hay tính quota**. Đường direct không gửi thêm cancel/GET để phục hồi output. Nếu chạy lại chương đó, đó là lần sinh nội dung mới. Cancel theo ID chỉ còn cho background legacy.

### 13.8. Bảng so sánh nhanh

| Thao tác | Gửi chương mới | Lượt direct đã gửi | Sau đó |
|---|---|---|---|
| Tạm dừng | Không | Nhận/lưu tiếp | Tiếp tục cùng run trong tab |
| Dừng sau lượt | Không | Chờ nhận/lưu xong | Run kết thúc; Start mới |
| Ngắt đang chạy | Không | Ngắt nhận ngay phía app | Nhả slot, không bảo đảm Google hủy |
| Tự pause vì quota | Không sau mốc chờ | Stream hiện tại vẫn chạy/lưu | Tiếp tục sau khi kiểm tra quota |

### 13.9. Dừng tự động không phải user hủy

Mất lease, lỗi storage hoặc guard an toàn không được gắn cancelled cho chương chưa submit; giữ queued và báo lý do. Không giả tất cả đã hủy chỉ vì run kết thúc.

Code còn ngân sách bất định max(10, concurrency × 2) cho outcome abandoned/unknown-submit của các đường tương ứng. Nhánh direct hiện trả failed, nên không diễn giải “20 lỗi mạng direct chắc chắn dừng run”. Đây khác quota watch và khác deadline một POST.

### 13.10. Chờ quota tối đa bao lâu trước khi tự pause?

Khi tất cả key còn dùng được của model khóa đều cooldown (không chỉ bận), bắt đầu đồng hồ chung. Nếu sau **5 phút** chưa có tiến triển AI xử lý trở lại thì run tự tạm dừng.

- Hết thời gian cooldown chỉ cho phép thăm dò. Một probe lại nhận 429 hoặc heartbeat không reset đồng hồ.
- Progress running thực sự/hoàn thành là tiến triển; key khỏe đang bận không bị tính là hết quota.
- Không hạ model; không chuyển chương chưa gửi thành failed/cancelled chỉ vì pause này.
- Request đang chạy vẫn có timeout 10 phút riêng và được lưu khi hoàn tất.
- Tiếp tục hoặc pause/resume chủ động reset đồng hồ chờ chung, **không xóa Retry-After/cooldown**.

Vì vậy một chương queued không có “10 phút sinh nội dung” nếu chưa gửi. Nó phụ thuộc key/pause/scope; giới hạn 5 phút là cơ chế tạm dừng **toàn hàng đợi dịch khi kẹt quota**, không phải mỗi chương hết 5 phút tự dịch hoặc tự fail.

<a id="trang-thai"></a>
## 14. Trạng thái chương, trạng thái duyệt và tác vụ đang chạy

### 14.1. Sáu trạng thái chính của chương

| Nhãn | Giá trị | Ý nghĩa |
|---|---|---|
| Chưa dịch | `imported` | Sẵn sàng cho lượt mới, hoặc được đưa về trạng thái này bằng Dịch lại. Vẫn có thể giữ revision cũ. |
| Đang chờ | `queued` | Đang chờ lượt/key/quota hoặc chưa được gửi khi run dừng tự động. |
| Đang dịch | `running` | Tóm tắt một lượt dịch đang được xử lý; xem pha chi tiết để biết đang gửi, Google xử lý hay lưu. |
| Hoàn thành | `completed` | Có kết quả được lưu; không đồng nghĩa đã duyệt hoặc cloud đã đồng bộ mọi metadata. |
| Thất bại | `failed` | Lượt dịch không đạt kết quả dùng được, hoặc bị kết thúc theo chính sách quan sát; có thể vẫn giữ active cũ. |
| Đã hủy | `cancelled` | User ngắt nhận direct/dừng phần chưa gửi; hoặc provider cancelled ở legacy. Phải đọc lý do, không tự suy Google đã dừng. |

Các enum cũ như `cooldown`, `recoverable`, `saving`, `unknown-submit` vẫn có thể có trong backup/checkpoint/API để tương thích và truy vết. Giao diện chính chuẩn hóa chúng về sáu trạng thái; không xóa lịch sử kỹ thuật chỉ để giảm số nhãn.

### 14.2. Ba trạng thái duyệt

| Nhãn | Điều kiện/ý nghĩa chính |
|---|---|
| Chưa duyệt | Bản hiện tại chưa được người dùng chấp nhận; thường không có cảnh báo sau khi lưu. |
| Cần xem lại | Có cảnh báo hoặc lý do cần kiểm tra, ví dụ raw đã đổi so với active. |
| Đã duyệt | Người dùng đã chấp nhận bản hiện tại bằng duyệt tay/ép duyệt. |

Đổi active hoặc lưu một bản dịch mới thường đặt lại reviewState theo warnings. Duyệt một bản cũ không có nghĩa mọi bản mới về sau tự được duyệt.

### 14.3. “Có cảnh báo” là thuộc tính, không phải một trạng thái duyệt thứ tư

Nó đơn giản là `warnings.length > 0`. Duyệt không xóa mảng warnings. Vì vậy:

- lọc Cần xem lại sẽ không còn thấy một chương vừa được duyệt;
- lọc Có cảnh báo vẫn thấy chương đó nếu warning chưa được sửa/tính lại;
- badge Đã duyệt có thể mang biểu tượng cảnh báo và tooltip số warning;
- một chương không warning vẫn có thể Chưa duyệt;
- raw thay đổi có thể tạo lý do Cần xem lại dù warning đã được tính lại khác đi.

### 14.4. Pha của tác vụ sống

| Pha nội bộ | Nhãn chi tiết | Tính vào bộ đếm LLM đang xử lý? |
|---|---|---|
| `paused` | Tạm dừng gửi mới | Không |
| `waiting-key` | Chờ key rảnh | Không |
| `cooldown` | Chờ quota | Không |
| `submitting` | Đang gửi | Có |
| `provider-queued` | Google đang xếp hàng | Có |
| `running` | Google đang xử lý | Có |
| `reconnecting` | Mất kết nối · đang kiểm tra lại (chỉ observer legacy) | Có, chỉ khi observer thực sự sống |
| `saving` | Đang lưu kết quả | Có, khi worker còn ở pha lưu |
| `cancelling` | Đang ngắt nhận kết quả; legacy có thể xử lý cancel riêng | Có khi engine vẫn xử lý; không giữ vô hạn |

Bộ đếm tổng bao gồm dịch, biên tập và quét glossary. Phần riêng hàng đợi phản ánh công việc của hàng đợi, không được suy rằng mọi tác vụ AI đều là dịch chương.

Một attempt lịch sử đang chờ xử lý lại không tự chiếm một luồng sống sau khi watcher đã kết thúc. Ngược lại, provider-queued vẫn là công việc thật dù chưa sinh token, nên có thể được tính đang xử lý.

### 14.5. Vì sao vẫn cần trạng thái chi tiết bên trong?

Nếu chỉ giữ “đang dịch” và “xong”, ứng dụng không biết:

- POST chưa gửi hay đã gửi nhưng mất response;
- executionMode là direct hay legacy; providerInteractionId chỉ diagnostic hay interactionId thật sự đọc được;
- output đã lưu cục bộ nhưng chưa commit cloud;
- user ngắt nhận phía app, dừng trước submit hay legacy được provider xác nhận cancelled;
- lượt cũ đã bị bỏ theo dõi hay vẫn được phép áp kết quả.

Đơn giản hóa UI là gom cách trình bày, không loại bỏ dữ kiện an toàn. Nhiều trạng thái trong database không tự làm Interactions API bất ổn; lỗi xảy ra khi các lớp cập nhật không nhất quán hoặc giữ worker sai.

### 14.6. Ví dụ đọc đúng

| Tình huống | Cách hiểu |
|---|---|
| Hoàn thành + Cần xem lại | Có bản dịch, cần xem warning trước khi chấp nhận. |
| Hoàn thành + Đã duyệt + 2 warning | Người dùng chấp nhận hai dấu hiệu đó; không phải validator quên chạy. |
| Thất bại nhưng vẫn đọc được bản dịch | Lượt mới lỗi; active của lượt cũ vẫn được giữ. |
| Hoàn thành + chờ đồng bộ cloud | Đã có nội dung cục bộ; cần bảo trì/đồng bộ, không cần dịch lại ngay. |
| Thất bại direct + chưa rõ kết quả gửi | Không tự POST lại trong lượt đó; user có thể chọn Start mới, biết lượt cũ có thể còn tiêu quota. |
| Sẵn sàng, LLM đang xử lý = 0, còn cleanup | Không có worker AI sống; còn công việc bảo trì. |

<a id="loi-api"></a>
## 15. Lỗi API, cooldown và giới hạn thử lại

### 15.1. Phân loại theo lỗi thực tế

Code dùng cả HTTP status và thông điệp đã được xử lý để phân loại. Vì một số lỗi key/model có thể trả HTTP 400, chỉ nhìn số 400 là chưa đủ.

| Nhóm lỗi | Xử lý chính |
|---|---|
| `auth`, thường 401 hoặc thông điệp API key invalid/revoked | Khóa credential trong phiên; thử credential khác của cùng model. |
| `permission`, thường 403 hoặc yêu cầu billing/free-tier restriction | Vô hiệu cặp key–model; không tự hạ model. |
| `model`, thường 404/model unavailable | Vô hiệu cặp key–model; thử key khác cho model đã chọn. |
| `rate-limit` / `quota-project`, thường 429 | Cooldown cặp, tôn trọng Retry-After nếu có; chọn key khác hoặc đợi key khả dụng. |
| `network` / `server`, HTTP rõ như 408/5xx | Thử lại tạm thời có giới hạn; sau đó xoay key cùng model. |
| `invalid-input` | Báo lỗi request; không chia chương tự động để đoán sửa. |
| `context`, `truncated`, `safety`, `empty-output`, `invalid-output` | Lỗi nội dung/kết quả; không retry mù quáng hoặc chunk ngầm. |
| Direct POST mất stream/chưa rõ được nhận chưa | Failed + chi tiết bất định, nhả key/worker; không tự POST trùng. Legacy có unknown-submit riêng. |

`permission` hiện là lỗi theo **cặp**. Không còn quy tắc “cứ 403 là khóa vĩnh viễn cả project cho mọi model” của kế hoạch đầu.

### 15.2. Retry-After và backoff

Nếu có thời gian retry hợp lệ, code dùng nó với giới hạn tối đa một ngày. Nếu thiếu, backoff hàm chung tăng trần từ 2 giây lên tối đa 60 giây và thêm ngẫu nhiên, tối thiểu 500 ms.

Submit gate còn có cửa sổ chống gửi dồn riêng cho cặp key–model khi gặp 429. Hai cơ chế phục vụ hai mục đích: trạng thái sức khỏe/cooldown và nhịp tiếp nhận POST.

Không phải “nghỉ một phút chắc chắn quota hồi”. Nếu đó là quota ngày hoặc quyền tài khoản, cooldown hết cũng có thể tiếp tục lỗi. Tăng số luồng khi mọi key đều bị cùng một hạn chế không làm vấn đề biến mất.

### 15.3. Giới hạn submit

Hằng số hiện tại `MAX_SUBMIT_ATTEMPTS` là **150**, suy ra từ 50 slot × 3. Đây là giới hạn code cho một vòng xử lý chương, không phải quota Google và không phải số lần suốt đời của chương qua mọi lần người dùng dịch lại.

Đối với lỗi tạm thời của một cặp, vòng xử lý có tối đa ba lần gửi trong nhánh retry tương ứng: lần đầu và tối đa hai lần thử lại. Các quyết định khác như 429, auth, model hoặc terminal interaction có nhánh chuyển key riêng; không nên đọc “150” thành cam kết dùng mỗi key đúng ba lần trong mọi tình huống.

### 15.4. Hết key khả dụng khác với hết mọi quota Google

“Không còn cặp khả dụng” nghĩa là bộ điều phối không tìm được cặp đủ điều kiện theo trạng thái và các key đã thử trong run. Có thể do:

- key bị tắt/khóa;
- model không được phép với key;
- lỗi lặp lại đã đánh dấu cặp;
- toàn bộ key đang cooldown;
- key trùng hoặc không có giá trị;
- dữ liệu sức khỏe trong phiên cần kiểm tra lại.

Nó không chứng minh mọi project trên dashboard đã hết token. Model vẫn bị khóa; ứng dụng không âm thầm sử dụng model thấp hơn để che vấn đề này.

### 15.5. Các timeout quan trọng

| Đường direct hiện tại | Mốc trong code |
|---|---:|
| Lấy metadata model trong generation adapter | 15 giây, nằm trong deadline server |
| Server toàn POST/stream, kể cả metadata | 10 phút |
| Client deadline tổng nhận kết quả | 10 phút 15 giây |
| Heartbeat từ server | Khoảng 15 giây |
| Client idle không nhận byte | 45 giây |
| Quota watch của hàng đợi dịch | 5 phút kẹt quota không có tiến triển thực → tự pause |
| Preflight attempts legacy trước Dịch lại | Khoảng 10 giây tổng |
| Helper workspace cloud | Mặc định 25 giây, một số đường có mốc riêng |

Deadline tổng không reset theo từng chunk/heartbeat. Idle timeout và quota watch là hai cơ chế khác. Metadata/catalog/health ngoài đường generation không mặc nhiên có deadline 15 giây này.

**Chỉ cho legacy:** SDK GET/cancel/DELETE 30 giây; client GET 35 giây; poll 2 giây; tối đa 6 lỗi đọc/90 giây mất khả năng đọc/30 phút phiên quan sát/60 giây sau cancel. Những con số này không dùng để trả lời “một chương direct Đang dịch chờ bao lâu”.

Hết thời gian hoặc mất stream không chứng minh output limit/safety/Google hủy. Error được báo theo thông tin thật và nhả slot; không lưu partial content. Tab bị ngủ có thể cập nhật UI muộn hơn deadline thực.

<a id="phuc-hoi"></a>
## 16. Sau gián đoạn, dịch lại, legacy cleanup và đồng bộ

### 16.1. Phân biệt các thao tác

| Việc | Áp dụng hiện tại | Có sinh nội dung mới không? |
|---|---|---|
| Nhận stream | POST direct đang mở | Là chính lượt đã gửi |
| Bắt đầu với failed/cancelled hợp lệ | Lượt mới theo selection và config hiện tại | Có |
| Dịch lại theo phạm vi | Chuẩn bị imported + selected, giữ revisions | Chưa; phải bấm Start |
| Nối lại | Chỉ background/store:true legacy | GET ID cũ không tạo lại; job legacy có thể chạy phần chưa gửi |
| Cleanup | Dọn provider object legacy khi an toàn | Không tạo dịch mới |
| Đồng bộ lịch sử | Đẩy metadata attempts/jobs còn pending | Không |

### 16.2. Direct bị gián đoạn hoặc reload

Tác vụ mới dùng executionMode=direct. Sau reload:

- Registry đang chạy trong memory được làm mới, không dựng ảo từ lịch sử.
- Lượt dịch chưa có revision trở thành failed theo projection; không bị history direct chặn Start vào vòng Nối lại.
- Revision đã lưu vẫn giữ, kể cả active cũ của chương có lượt mới lỗi.
- Automation job direct dở không nằm trong danh sách có thể resume. Status lịch sử có thể còn đang dở để diagnostic; không có nghĩa giữ slot sống.
- providerInteractionId không phải resume handle.

Muốn làm lại: chọn chương còn cần và Start/chạy AI edit/quét mới. Không có nhận lại output direct cũ tự động, kể cả mạng quay lại sau vài phút.

### 16.3. Nối lại background legacy và ngoại lệ job

Legacy có interactionId dùng GET bằng credential cũ: server slot còn cấu hình hoặc key UI đúng fingerprint trong vault/nhập lại. Đổi sang key khỏe bất kỳ không đọc được job thuộc key/project cũ.

GET không tạo lại generation của ID đó, nhưng không nên hứa mọi HTTP đọc đều không có giới hạn provider. Một job editorial legacy có thể nối phần có ID rồi gửi **chương chưa từng submit** bằng direct. Khi ấy có POST mới cho phần chưa chạy, không phải duplicate ID đã đọc.

Không tự resume legacy hoặc tính nó active chỉ vì mở app. Chỉ bộ theo dõi thực sự chạy mới có live task. Nếu không có key/không xác nhận được thì báo rõ và cho quyết định bỏ theo dõi, không giữ worker mãi.

### 16.4. Không lấy được kết quả direct thì làm gì?

Mất stream, EOF trước terminal, timeout hoặc lỗi output đều kết thúc lượt, nhả worker/key và giữ raw/revisions cũ. Chương kế tiếp có thể chạy. Không có “chờ thử lại/nối lại” chiếm slot vô hạn.

App không tự gửi lại cùng chương khi POST chưa rõ kết quả; lần Start mới do user là quyết định sinh nội dung mới. Google có thể đã nhận và vẫn đang xử lý lượt cũ — tốc độ phản hồi của nút Ngắt không phải bằng chứng hết quota tiêu thụ.

### 16.5. Chưa biết POST đã đến đâu

Ngay cả có ID chẩn đoán, direct không dùng GET cứu stream. Chi tiết lỗi bất định giữ trong attempt/diagnostic; status chương failed không chứng minh Google chưa nhận.

429/408/5xx có phản hồi xác định có policy cooldown/retry riêng. Lỗi mạng không phản hồi/unknown-submit không được đánh đồng với retry HTTP rõ. Background legacy unknown-submit giữ gate/abandon riêng để tránh gửi chồng ngoài ý muốn.

### 16.6. Dịch lại làm gì chính xác?

Dùng cho một chương mở hoặc phạm vi đã chọn ở editor/Quality; giữ đúng tính năng chọn phạm vi trước đây.

1. Kiểm tra công việc sống và xác định chapter IDs.
2. Direct failed chưa có revision không cần GET providerInteractionId.
3. Với legacy unresolved, kiểm tra hữu hạn khoảng 10 giây. Nếu không xác nhận được, hỏi bỏ theo dõi lượt cũ, nêu rủi ro quota/kết quả muộn.
4. Cập nhật marker attempt cũ ở local/cloud khi cần, giữ lịch sử/ID legacy phục vụ cleanup.
5. Đưa chương về Chưa dịch (imported), đánh selected=true, xóa lỗi hiện hành phù hợp.
6. Không xóa raw, bản dịch active hoặc revisions; không tự bỏ lựa chọn khác ngoài phạm vi.
7. Chưa gọi AI. Người dùng bấm Bắt đầu trong hàng đợi mới tạo run.

Nếu failed/cancelled bình thường đã selected, Start nhận được thì không cần qua Dịch lại. Completed cần Dịch lại để eligibility không bỏ qua. Một bản active manual có thể vẫn được bảo vệ khi AI trả bản mới.

### 16.7. Cleanup tại sao không xóa chương nào?

Cleanup **không phải** xóa truyện, xóa revision hay reset failed. Lượt direct mới store:false không xếp cleanup provider thường lệ.

Nó chỉ phục vụ hồ sơ background legacy: lưu/đồng bộ kết quả cần giữ, cancel/kiểm tra terminal nếu policy cần, rồi DELETE provider object khi an toàn. Bị thiếu key, provider còn chạy, cloud commit lỗi hoặc mạng lỗi thì còn pending. Giữ marker để retry, không xóa bằng cách bỏ dấu vết lịch sử.

### 16.8. Cleanup có giữ luồng dịch không?

Không. Queue cleanup legacy có concurrency riêng 2; metadata outbox riêng tối đa 3. Chúng không dùng reservation generation và không cộng vào bộ đếm AI đang xử lý.

Không hứa server dọn được job dùng key UI khi browser không cung cấp key. Mất origin/profile có thể mất vault/key; fingerprint không thay được key thật.

### 16.9. Đồng bộ lịch sử và nội dung là hai việc khác

Attempt/job checkpoint có outbox local; các update được gộp theo ID, updatedAt đơn điệu, ACK cũ không xóa pending mới. Đồng bộ lịch sử không tạo generation, không đổi active/duyệt.

Revision/raw/preset/config có đường lưu riêng. Không suy bấm Đồng bộ lịch sử là cloud đã nhận mọi byte nội dung. Nếu đã lưu local nhưng cloud lỗi, bảo vệ bản local, xem thông báo và kiểm tra cloud/backup trước khi xóa cache hoặc chuyển máy. Không dùng AI lần nữa chỉ để chữa lỗi đồng bộ.

<a id="tu-dien"></a>
## 17. Từ điển thủ công và quét bằng AI

### 17.1. Các loại thuật ngữ hiện có

Chín category cố định:

1. Nhân vật.
2. Địa danh.
3. Tông môn.
4. Cảnh giới.
5. Công pháp.
6. Pháp bảo.
7. Chức danh.
8. Xưng hô.
9. Khác.

Kế hoạch đầu từng nói category tùy chỉnh; union hiện tại là chín loại trên, không nên mô tả chức năng category tự do là đã có.

Mỗi term gồm source, target, category, note, bật/tắt; term LLM còn có origin, review status, confidence, evidence và dấu vết chương phát hiện.

### 17.2. Thêm tay và import

Có thể quản lý tay, import/export CSV/JSON. Term source là dạng nguyên văn cần nhận diện, target là dạng Việt thống nhất. Note dùng ghi ngoại lệ/ngữ cảnh. Nên xử lý cùng source nhưng target khác trước khi bật đồng loạt.

Khi ghép instruction, các term enabled có source/target được đưa vào dạng ánh xạ. Tắt term không xóa nó; chỉ không sử dụng trong instruction mới. Đổi term không sửa hồi tố các bản dịch đã lưu.

### 17.3. Ba chế độ automation

| Chế độ | Quét AI? | Tự đưa đề xuất vào glossary đang dùng? |
|---|---|---|
| Tắt | Không | Không |
| Chỉ đề xuất | Có | Đề xuất mới chờ duyệt, mặc định không bật |
| Tự động có kiểm soát | Có | Chỉ tự nhận term đủ confidence và không xung đột |

Mặc định tắt. Model quét mặc định alias Flash Lite, độc lập model dịch. Cỡ lô mặc định 20, phạm vi chuẩn hóa 1–50. Ngưỡng confidence mặc định 0,9, cho phép 0,5–1.

### 17.4. “20 chương/lô” không phải một request gom 20 chương

Chọn 100–160 có 61 chương. Cỡ lô 20 tạo bốn lô:

| Lô | Chương | Số lượt quét ban đầu nếu không có cache/lỗi | Số lượt dịch ban đầu |
|---|---|---:|---:|
| 1 | 100–119 | 20 | 20 |
| 2 | 120–139 | 20 | 20 |
| 3 | 140–159 | 20 | 20 |
| 4 | 160 | 1 | 1 |
| Tổng | 61 chương | 61 | 61 |

Nếu quét và dịch đủ cả 61 chương, không reuse kết quả đã lưu, dự kiến **122 lượt tạo nội dung** trước retry; không phải “quét ba lần” hoặc “quét bốn request”. Metadata là HTTP riêng; progress/heartbeat nằm trong POST stream. Poll/cleanup chỉ thuộc legacy.

### 17.5. Pipeline trong một lô

```text
Raw của các chương trong lô
  → quét từng chương, tối đa 5 worker
  → tập hợp đề xuất
  → hợp nhất theo thứ tự chương
  → lưu glossary / chốt snapshot lô
  → dịch từng chương bằng cùng snapshot đó
  → lô tiếp theo
```

Số worker quét là min giữa concurrency dịch, 5, số credential và số chương lô. Vì vậy đặt dịch 10 luồng không khiến bước quét glossary dùng 10 worker.

Đề xuất trong lô được hợp nhất theo prefix để tránh thứ tự response nhanh/chậm làm từ điển đổi ngẫu nhiên.

### 17.6. Prompt quét chứa gì?

Raw của đúng một chương, cùng các term đã có mà source xuất hiện trong raw, tối đa 250 term tham chiếu. Prompt trích xuất yêu cầu thuật ngữ có ý nghĩa cho truyện, không tràn lan từ thông thường; output schema giới hạn tối đa 120 đề xuất/request.

Quét này không dịch toàn chương. Thinking vẫn high. Không dùng RAG, không lấy raw chương trước/sau làm nguồn ngữ cảnh tự động.

### 17.7. Hợp nhất đề xuất

Source/target được chuẩn hóa phục vụ so sánh trùng: NFC, trim, so khớp dạng chữ thường. Các điểm chính:

- source/target trống bị loại;
- source không chứa Hán tự không được nhận theo luồng đề xuất này;
- cặp source–target đã có không nhân đôi vô hạn;
- source đã có target khác tạo đề xuất xung đột chờ duyệt, không ghi đè term cũ;
- term mới đủ confidence và không xung đột có thể tự được chấp nhận trong mode auto;
- mode suggest giữ đề xuất mới pending/disabled;
- một đề xuất LLM pending đã có có thể được cập nhật confidence/evidence cao hơn theo điều kiện trong code.

Confidence là điểm LLM tự báo, không phải xác suất được đo độc lập. Auto-accept giúp tiết kiệm thao tác, không thay thế rà soát thuật ngữ quan trọng.

### 17.8. Nếu quét một chương lỗi hoặc reload

Ghi lỗi quét, giữ proposals đã có và có thể dịch bằng glossary snapshot hiện hữu; scan lỗi không bắt buộc làm dịch chương đó thất bại.

Lượt quét mới là direct: ngắt/mất stream không có ID để nối lại, job dở không nằm trong danh sách resume sau reload. Không sửa các request dịch đã gửi bằng một kết quả glossary về muộn.

Kết quả quét **đã lưu** có inputHash từ raw hash/model/currentTerms. Nếu hash còn khớp và proposals chưa consumed, có thể reuse không gọi AI thêm; merge xong đánh consumed. Reuse proposals không phải khôi phục stream. Chỉ background legacy còn ID recovery/cleanup.

### 17.9. Cách vận hành dễ kiểm soát

Với truyện mới: có thể chạy lô đầu ở mode suggest để rà tên riêng; chấp nhận term quan trọng rồi mới dùng auto có kiểm soát. Đây là cách sử dụng chức năng hiện có, không phải chế độ mới tự động được bật.

Với truyện đang dịch ổn: để off vẫn dùng glossary thủ công đang bật trong instruction dịch; “off” chỉ tắt **quét AI bổ sung**, không tắt toàn bộ từ điển.

<a id="bien-tap-tay"></a>
## 18. Biên tập thủ công, tìm/thay thế và sửa raw

### 18.1. Mở chương chưa dịch

Có thể mở để xem raw. Cột dịch có thể trống; người dùng được phép tự viết/dán một bản dịch rồi lưu manual revision. Không cần từng có một revision AI mới được biên tập.

Không thể duyệt một chương chưa có active revision hợp lệ cho thao tác duyệt. UI không cho lưu toàn bộ draft rỗng thành active. Tuy nhiên một bản tay có chữ nhưng sai tiêu đề vẫn có thể được lưu kèm warning; lưu không đồng nghĩa vượt mọi điều kiện xuất bản.

### 18.2. Bản nháp không phải autosave revision

Các thay đổi qua gõ chữ, paste, cut, find/replace chỉ tác động draft. Nút Lưu revision là mốc tạo manual revision mới.

Ví dụ cần sửa ba tên:

1. Thay tất cả “A” thành “B”.
2. Thay tất cả “C” thành “D”.
3. Sửa tay một câu.
4. Bấm Lưu revision một lần.

Kết quả là một manual revision, không phải một revision cho mỗi lần replace. Undo/redo phục vụ thao tác trước khi lưu, không đòi tạo bản lưu liên tục.

### 18.3. Bộ công cụ raw và dịch riêng

Mỗi phía có trạng thái nháp, undo/redo và thao tác tìm/thay thế riêng. Chọn sửa raw không làm nút thay thế tự sửa nhầm phía bản dịch.

Các công cụ gồm undo, redo, copy, cut/paste theo vùng chọn hoặc ngữ cảnh editor, tìm trước/sau, thay vị trí hiện tại, thay tất cả trong chương/phía đang sửa, khôi phục bản đã lưu. Clipboard có thể cần quyền browser; nếu nút paste bị chặn, dùng Ctrl+V trong ô phù hợp.

Undo/redo là lịch sử trong phiên editor, giữ tối đa khoảng 100 snapshot cho mỗi phía. Nó không phải lịch sử vĩnh viễn có thể phục hồi sau reload.

### 18.4. Phạm vi find/replace

Các tùy chọn có phân biệt hoa/thường, nguyên từ, regex và bao gồm dòng title. Khi tắt “gồm dòng title”, tìm/thay thế không tác động dòng không rỗng đầu tiên.

- “Thay vị trí này” sửa match đang chọn.
- “Thay tất cả trong chương” sửa các match trong draft chương hiện tại ở phía đang chỉnh.
- Không có nghĩa tự thay toàn bộ 2.000 chương trong dự án.
- Không tự lưu revision hoặc tự duyệt sau mỗi replace.

Trong chế độ regex, Replace All dùng quy tắc replacement của JavaScript, có thể dùng capture như `$1`. Chế độ không regex coi chuỗi thay là literal. Regex không hợp lệ hiện lỗi thay vì âm thầm chạy một pattern khác.

Tìm theo “nguyên từ” dùng biên chữ/số Unicode, không chỉ ranh giới ASCII. Đây là tìm chuỗi, không phải tìm gần nghĩa hoặc dịch thuật.

### 18.5. Cuộn và phóng lớn

Editor có vùng cuộn nội dung riêng; toolbar/tìm-thay thế được giữ ở phần làm việc để không phải cuộn về đầu trang mới sử dụng được. Có thể phóng lớn raw, dịch hoặc cả hai; chế độ phóng lớn vẫn dùng cùng draft và công cụ, không tạo một bản nội dung độc lập.

Đóng phóng lớn không tương đương Lưu. Escape thu/đóng vùng phóng lớn theo handler UI. Khi còn draft chưa lưu và đổi chương/rời editor, ứng dụng có cảnh báo bỏ thay đổi; browser cũng có cảnh báo trước unload khi hỗ trợ.

### 18.6. Khôi phục active khác với quay lại revision cũ

- “Khôi phục active”: bỏ những thay đổi chưa lưu trong draft và đưa draft về nội dung active đang có.
- “Dùng bản này” trong lịch sử: thay bản active bằng revision được chọn.
- Undo: lùi một thao tác draft gần nhất.

Ba thao tác không tương đương. Muốn quay lại bản dịch ngày hôm qua phải chọn đúng revision, không bấm undo với hy vọng undo xuyên các lần reload.

### 18.7. Sửa và lưu raw

Raw lưu trực tiếp, không tạo revision raw. Trước khi sửa raw, cần dừng hàng đợi/AI biên tập; code chặn lưu raw khi còn tác vụ liên quan đang chạy.

Khi lưu:

1. Kiểm tra raw không rỗng và không vượt 4.500.000 ký tự.
2. Tính lại tiêu đề raw, số chương, số ký tự, token ước tính, request hash.
3. Đánh giá lại xung đột thứ tự.
4. Giữ filename/prefix và metadata bytes file nhập ban đầu; chúng không tự biến thành “file gốc mới”.
5. Nếu đã có bản dịch, giữ active, đặt Cần xem lại và thông báo raw đã thay đổi.
6. Không tự gọi dịch lại.

Với cloud, lưu raw mới cần server xác nhận trước khi cập nhật thành công phía client. Nếu thất bại, xử lý thông báo; đừng chỉ dựa vào chữ đang gõ trong textarea.

Do không có raw revisions, muốn khôi phục nguyên văn cũ phải có file gốc/backup hoặc bản sao khác. Undo còn trong phiên không thay thế backup.

### 18.8. Raw mới làm lệch block thì sao?

Alignment gắn với source hash. Thay số/thứ tự đoạn làm alignment cũ không còn được chứng thực. Không tự coi một revision cũ có cùng số đoạn là chắc chắn khớp raw mới.

Nếu chỉ sửa một ký tự ở cùng vị trí, có thể rà và chỉnh tay. Nếu thay cả phiên bản raw/đoạn, nên chuẩn bị Dịch lại theo raw mới rồi kiểm tra kết quả structured ID mới.

<a id="nhap-ban-dich"></a>
## 19. Nhập một bản dịch hoàn chỉnh vào trình biên tập

### 19.1. Mục đích

Cho phép dùng bản dịch lấy từ ngoài ứng dụng hoặc do người dùng tự viết, thay vì dán lần lượt từng block. Chức năng chỉ xử lý cục bộ, không gửi AI khi bấm xem trước/áp dụng.

Input phải là bản dịch **một chương**, gồm title và thân chương. File TXT tối đa 10 MiB. Có thể dán trực tiếp, đọc clipboard hoặc chọn file và encoding.

### 19.2. Quy trình

1. Mở đúng chương cần nhập.
2. Chọn Nhập bản dịch cả chương.
3. Dán văn bản hoặc tải TXT.
4. Chọn cách tách: tự động, theo dòng trống hoặc theo từng dòng.
5. Xem preview số block, title và cảnh báo lệch số lượng.
6. Xác nhận cảnh báo nếu có và áp dụng vào draft.
7. Rà hai cột, sửa vị trí nếu cần.
8. Bấm Lưu revision; lúc này mới có manual revision active.

Đọc file xong không tự thay draft. Áp dụng draft xong cũng chưa lưu revision. Có thể Undo việc áp dụng khi vẫn trong phiên editor.

### 19.3. Quy tắc ghép

- Chuẩn hóa BOM/newline của **bản dịch nhập** cho xử lý.
- Dòng không rỗng đầu là title.
- Auto ưu tiên kiểu tách có số phần thân bằng số block raw; nếu không, chọn theo cấu trúc dòng trống hiện hữu.
- Gán lần lượt từ `P0001`.
- Thiếu đoạn dịch: các slot raw cuối có thể để trống.
- Thừa đoạn dịch: phần thừa được giữ ở block cuối, không vứt bỏ nội dung.

Đây là đối chiếu vị trí, không phải căn chỉnh ngữ nghĩa. Một số lượng block bằng nhau vẫn có thể ghép sai nếu bản dịch ngoài đã bỏ đoạn quảng cáo, gộp hai đoạn hoặc đổi vị trí lời tác giả.

### 19.4. Những cảnh báo cần xem

Sai mẫu title/sai số chương, số đoạn không khớp, ký tự lỗi encoding và raw không đủ cấu trúc đều cần kiểm tra. Preview nhập có thể chấp nhận biến thể dấu hai chấm rộng để nhận diện; validator/xuất bản vẫn yêu cầu dạng chuẩn `Chương N: ...` với dấu `:` thông thường. Nên sửa về dạng chuẩn trước khi lưu/xuất.

<a id="revision"></a>
## 20. Revision, active, ghim, so sánh và provenance

### 20.1. Có giống Git không?

Giống ở ý tưởng giữ nhiều bản để quay lại, khác ở cách lưu và khả năng quản lý. Mỗi revision giữ full content; không có branch/merge/cherry-pick như Git, không tự lưu diff từng ký tự và không phải mọi lần gõ đều tạo commit.

Nguồn revision:

- `ai`: dịch bằng LLM;
- `ai-edit`: biên tập bằng LLM;
- `manual`: người dùng bấm lưu bản nháp.

### 20.2. Khi nào bản mới tự active?

| Nguồn bản mới | Quy tắc |
|---|---|
| Manual save | Bản mới được active; các active cũ tắt. |
| Dịch AI | Thường active nếu không có active manual được bảo vệ. |
| Dịch AI khi đang giữ manual | Lưu thêm AI revision, giữ nội dung manual active. |
| AI EDIT, tắt tự active | Chỉ lưu đề xuất. |
| AI EDIT, bật tự active | Chỉ active nếu vượt các điều kiện an toàn ở mục 21. |
| Áp lại kết quả đã lưu / recovery legacy | Tái xử lý idempotent phần còn thiếu; không tự active lại bản mà người dùng đã đổi sau đó. Không có nối lại output direct sau reload. |

Vì vậy “revision mới nhất luôn active” là sai. Active là cờ quyết định riêng. Trong dữ liệu bất thường có nhiều active, helper chọn bản active mới nhất; đó là cơ chế đọc phòng thủ, không phải chính sách auto-active mọi bản.

### 20.3. Năm bản AI thường nghĩa là gì?

Khi thêm revision AI/AI EDIT, app xem các bản không manual và không pinned, sắp mới nhất trước, giữ nhóm năm bản gần nhất; những bản cũ hơn chỉ bị dọn nếu không active.

Hệ quả:

- có thể thấy hơn năm revision;
- manual không bị tự xóa để nhường chỗ cho AI;
- pinned không bị tự dọn theo giới hạn này;
- active cũ vẫn được bảo vệ kể cả nằm ngoài nhóm năm mới nhất;
- không cần xóa revision để “mở chỗ” mới tiếp tục edit tay;
- nhiều manual/pinned có thể tăng dung lượng không giới hạn ở con số năm.

### 20.4. Ghim để làm gì?

Ghim giúp bảo vệ khỏi tự dọn và là điều kiện ngăn AI EDIT tự thay active của bản cơ sở đang ghim. Nó không biến nội dung thành bất biến và không đồng nghĩa đã duyệt.

Không nên hiểu “ghim” là lệnh khóa tuyệt đối mọi đường đổi active: người dùng vẫn có thể chọn bản khác; cơ chế dịch AI mới bảo vệ active manual theo quy tắc riêng. Pin không phải một quyền truy cập hay khóa chống chỉnh sửa.

### 20.5. Xóa revision

Chỉ xóa được revision không active, có xác nhận. Ghim không miễn trừ thao tác xóa rõ ràng của người dùng; bảo vệ ghim chủ yếu áp dụng với tự dọn/auto-activation.

Muốn xóa bản đang active phải chọn một revision khác làm active trước. Vì vậy với chương có một active cuối cùng, nút xóa revision không phải đường xóa sạch bản dịch. Xóa cả chương/dự án là thao tác khác, có phạm vi phá hủy lớn hơn.

Xóa revision không có thùng rác nội bộ. Chỉ backup/bản sao có sẵn mới giúp phục hồi nội dung đã xóa.

### 20.6. So sánh với bản nào?

Nút So sánh mở nội dung revision được chọn cạnh **bản active hiện hành của chương**. Không phải tự so với revision ngay trước nó và không phải so với draft chưa lưu.

Giao diện hiện là hai vùng văn bản để đối chiếu, không phải bộ diff Git gạch đỏ/xanh đến từng ký tự. Nếu chọn chính bản active để so, hai bên có thể giống nhau.

### 20.7. Provenance lưu gì?

Metadata có thể gồm:

- ID revision, chương và thời điểm tạo;
- nguồn manual/ai/ai-edit;
- model response và model được request;
- alias credential;
- base revision ID;
- source request hash;
- preset ID/tên và instruction hash;
- glossary hash;
- warnings tại lúc lưu/tính lại;
- alignment metadata;
- pinned/active.

Hash giúp nhận biết hai cấu hình/nội dung có khác nhau, không phục hồi nguyên văn từ hash. Một revision manual vẫn có thể ghi hash/preset hiện hành để truy vết môi trường, nhưng điều đó không có nghĩa LLM đã tạo revision manual đó.

Dữ liệu legacy có thể thiếu một số trường. Không tự suy diễn model hoặc preset từ tên file khi trường không tồn tại.

### 20.8. Nhãn model trên chương có phải nguồn sự thật tuyệt đối?

Không cho mọi câu hỏi lịch sử. Metadata chương là bản tóm tắt; trong nhánh AI dịch xong nhưng giữ manual active, một số field model/usage trên chương vẫn được cập nhật từ lượt AI gần nhất.

Muốn xác minh model của **bản active**, đọc revision active. Muốn xác minh “từng dùng Lite không”, xem toàn bộ revisions/attempts còn lưu. Sort model ở bảng là công cụ nhóm nhanh, không thay provenance.

### 20.9. Lịch sử cập nhật sau lưu

Sau khi thêm/đổi/xóa/ghim revision, ứng dụng tăng tín hiệu refresh để editor đọc lại lịch sử. Không cần chủ đích thoát chương rồi vào lại mới thấy bản lưu. Nếu xảy ra, đó là biểu hiện cần chẩn đoán, không phải hành vi thiết kế.

### 20.10. TXT active lấy bản nào?

Nút TXT active ở editor lấy bản dịch hiện hành được lưu trên chương, không lấy draft đang gõ và không lấy revision chỉ đang mở ở bảng so sánh. Muốn tải nội dung vừa sửa, phải lưu/đặt đúng bản làm active trước.

Nút tải đơn lẻ này phục vụ thao tác editor, không áp toàn bộ preflight xuất bản hàng loạt. Có thể tải một bản còn warning để đọc/sửa bên ngoài.

<a id="bien-tap-ai"></a>
## 21. Biên tập AI toàn chương và theo block

### 21.1. Chỉ chạy thủ công

Chức năng không nối tự động vào cuối hàng đợi dịch. Người dùng chọn phạm vi, mục tiêu, model, số luồng, yêu cầu bổ sung rồi bấm chạy.

“Mặc định tắt AI biên tập” nên hiểu là không có workflow tự gọi AI sau dịch. Trong hộp chạy thủ công, checkbox **tự dùng kết quả đạt kiểm tra làm active hiện mặc định bật**; đó là lựa chọn áp dụng kết quả, không phải lịch chạy tự động.

Không chạy biên tập đồng thời với hàng đợi dịch trong cùng giao diện. Khi draft/raw còn sửa chưa lưu, nút AI của editor bị chặn để tránh gửi một bản khác với bản người dùng đang thấy.

### 21.2. Điều kiện từng chương

Cần có chương, active revision, raw và active translation không rỗng. Các chương không đủ điều kiện được bỏ qua và thống kê skipped; không tự biến draft chưa lưu thành input AI.

Với dọn Hán/But, nếu không có target block nào thì bỏ qua, không gửi request chỉ để nhận lại nội dung y nguyên.

### 21.3. Sáu mục tiêu

| Mục tiêu | Phạm vi input |
|---|---|
| Sửa lỗi chính tả & ngữ pháp | Raw toàn chương + active toàn chương + warnings/yêu cầu liên quan. |
| Làm câu tiếng Việt mượt hơn | Toàn chương. |
| Đồng bộ thuật ngữ & xưng hô | Toàn chương, kèm glossary trong instruction. |
| Xử lý cảnh báo kiểm tra hiện tại | Toàn chương và danh sách cảnh báo. |
| Loại bỏ chữ Hán / “But” theo block ID | Chỉ target block cùng ngữ cảnh liền kề theo cấu trúc bên dưới. |
| Yêu cầu tùy chỉnh | Toàn chương, bổ sung yêu cầu người dùng. |

Preset biên tập được gửi đầy đủ cho mọi mục tiêu. Mục tiêu là chỉ thị trọng tâm, không phải cắt bỏ các mục còn lại trong preset.

### 21.4. Dọn Hán/But gửi chính xác phần nào?

App dựng các block từ raw + active alignment. Target là block có **ít nhất một Hán tự hoặc từ `But` đứng độc lập**, không phân biệt hoa/thường.

Mỗi target mang:

- ID;
- raw của đúng block đó;
- bản dịch của đúng block đó;
- bản dịch block trước/sau làm ngữ cảnh khi có.

Không gửi raw cả chương ở nhánh này. Tuy vậy vẫn có full preset biên tập, glossary đang bật, hướng dẫn kỹ thuật và context. Nếu một raw block rất dài hoặc nhiều block cùng lỗi, request vẫn lớn.

**Một chương có nhiều target được gom trong một request**, không phải mỗi ID là một request. Một chương vừa có Hán vừa có But vẫn là một chương trong filter và một lượt xử lý theo phạm vi; block có cả hai không bị nhân đôi.

### 21.5. Output theo ID là thay cả block, không phải diff từng từ

```json
{
  "updates": [
    { "id": "P0007", "translation": "Toàn bộ nội dung mới của block P0007." },
    { "id": "P0018", "translation": "Toàn bộ nội dung mới của block P0018." }
  ]
}
```

App yêu cầu đủ các ID target, không nhận ID ngoài target hoặc ID trùng. Các block sạch không nằm trong updates được giữ nguyên khi ghép kết quả.

Với biên tập toàn chương, output là `{"translation":"..."}` chứa toàn bộ bản đã sửa; không phải hệ thống patch kiểu IDE. Sau đó alignment được dựng lại từ nội dung theo cơ chế hiện có. Không nên kỳ vọng toàn chương giữ mapping chắc như dịch mới `blocks-v1` nếu AI tự đổi đoạn.

### 21.6. Biên tập có chạy song song không?

Có, concurrency riêng 1–10, mặc định 3. Pool worker lấy chương mới khi một chương hoàn tất; dùng model đã chọn chung cho đợt đó và chỉ xoay key.

Chọn model trong hộp áp dụng cho tất cả chương thuộc đợt đã chốt, không tự xen model mạnh/yếu theo từng chương. Model tác vụ phụ có thể khác model dịch, kể cả dùng Lite để tiết kiệm khi tài khoản thực tế hỗ trợ.

### 21.7. Điều kiện tự active kết quả

Bật checkbox không đồng nghĩa mọi response sẽ active. Code kiểm tra:

1. Có base revision.
2. Base không pinned.
3. Active hiện tại vẫn là base đó.
4. Raw hash không đổi từ lúc gửi.
5. Candidate không giống hệt base.
6. Không có chuỗi cảnh báo mới so với base.
7. Số Hán tự không tăng.
8. Số từ But không tăng.
9. Riêng cleanup: có cải thiện Hán/But, Hán còn lại không vượt ngưỡng project và But bằng 0.

Không đạt thì vẫn có thể lưu AI EDIT revision để xem, giữ active cũ và ghi lý do. Đạt thì active mới nhưng **không tự duyệt**; reviewState được tính theo warnings.

Đây là hàng rào heuristic, không kiểm định ngữ nghĩa. “Không có cảnh báo mới” là so các chuỗi warning, không phải hệ thống đánh giá chất lượng văn học. Một thay đổi sai nghĩa vẫn có thể vượt kiểm tra kỹ thuật.

### 21.8. Tại sao dọn vài chữ vẫn chậm?

Payload target có thể ít, nhưng vẫn có metadata model, full preset/glossary enabled, raw của các target, context tham chiếu, thinking high, provider queue, key/cooldown, stream và commit. Output ít không bảo đảm latency thấp.

Dọn Hán/But gửi **một request/chương gồm toàn bộ target ID của chương**, không một request cho từng block. Không gửi toàn chương khi đúng mode này, nhưng glossary không tự lọc nhỏ theo raw. Muốn xác minh dùng số target/mode han-cleanup và diagnostic phù hợp, không đoán chỉ từ thời gian. Không hạ thinking để tăng tốc ngầm.

### 21.9. Ngắt biên tập và giới hạn recovery

Ngắt chặn chương mới, abort POST/response body đang nhận; không chờ Google cancel. Giữ mọi AI EDIT revision đã commit và các bản active cũ. Job mới ghi executionMode=direct, stopRequested/finished IDs/snapshot phục vụ trạng thái và truy vết, không phục hồi stream đã mất.

Sau reload không tự nối lại direct job; chọn phạm vi còn cần và chạy thủ công mới. Revision ID gắn job/chapter hỗ trợ idempotency trong xử lý một job, không biến một POST mất kết quả thành có thể GET lại.

Nếu local revision đã lưu nhưng cloud commit lỗi, báo đúng lỗi lưu và giữ bản local; metadata outbox không phải bảo đảm content đã lên cloud. Chỉ job background legacy còn đường Nối lại ID cũ/tiếp phần chưa submit.

### 21.10. Giới hạn riêng của output editing

Parser cleanup kiểm tra ID nhưng không có toàn bộ kiểm tra “mọi block không rỗng” nghiêm như decoder dịch `blocks-v1`. Toàn chương lại dùng wrapped string. Do đó không nên quảng bá mọi đường AI là có cùng bảo đảm chống block rỗng/lệch.

Nếu dùng tự active, vẫn nên kiểm tra mẫu một số chương sau mỗi đợt, đặc biệt các bản legacy chưa có alignment đáng tin.

<a id="chat-luong"></a>
## 22. Kiểm tra chất lượng và các bộ lọc

### 22.1. Validator chạy ở đâu?

Chạy khi nhận bản dịch hợp lệ, lưu manual, lưu AI EDIT và khi người dùng áp ngưỡng/kiểm tra lại toàn dự án. Nó không dùng thêm một LLM để chấm điểm; đây là kiểm tra quy tắc trên chuỗi và metadata.

Hai lớp khác nhau:

- **Lỗi cứng:** không nhận được bản dùng được, JSON/ID lỗi, output rỗng, truncated/safety… Có thể không tạo revision.
- **Warning:** vẫn lưu bản dịch, nhưng đề nghị xem lại.

### 22.2. Các ngưỡng theo dự án

| Thiết lập | Mặc định | Khoảng chuẩn hóa |
|---|---:|---:|
| Tỷ lệ độ dài tối thiểu | 0,35 | 0,1–2 |
| Tỷ lệ độ dài tối đa | 5 | Tối thiểu lớn hơn min 0,1; tối đa 10 |
| Số Hán tự được cho phép | 0 | 0–100 |
| Ngưỡng lặp đoạn | 3 | 2–10 |
| Kiểm tra dừng giữa câu | Tắt | Bật/tắt |

Thay con số trong form rồi áp dụng/kiểm tra lại mới tính lại warnings các bản đang có. Dropdown lọc không tự sinh warning mà rule chưa bật.

### 22.3. Danh sách kiểm tra chi tiết

| Kiểm tra | Điều kiện thực tế |
|---|---|
| Title sai mẫu | Dòng không rỗng đầu sau xử lý title dẫn xuất không khớp `Chương N: Tên`. |
| Sai số chương | Số trong title khác số raw kỳ vọng. Khi xuất còn kiểm tra khớp prefix. |
| Còn chữ Hán | Số ký tự Unicode Han lớn hơn `maxHanCharacters`. |
| Markdown fence | Có chuỗi ba backtick ``` trong output. Dấu ba chấm không phải code fence. |
| Lời dẫn/từ chối AI | Một số mẫu ở đầu dòng, như “tôi không thể”, “xin lỗi”, “dưới đây là bản dịch”, “bản dịch như sau”. |
| Tỷ lệ bất thường | `output.length / source.length` nằm ngoài ngưỡng. Đây là độ dài string, không phải tỷ lệ token/byte. |
| Chỉ có title | Không thấy thân bài sau dòng tiêu đề. |
| Lặp đoạn | Đoạn thân bài dài hơn 80 ký tự sau chuẩn hóa whitespace xuất hiện giống nhau ít nhất ngưỡng đã chọn. |
| Dừng giữa câu | Chỉ khi bật; thân dài hơn 120 ký tự và ký tự kết thúc không thuộc nhóm dấu kết được chấp nhận. |
| Output trùng hoàn toàn | Có bản dịch chương khác giống toàn bộ content; kiểm tra lúc nhận kết quả hoặc revalidate. |
| Dấu hiệu thứ tự/raw | Các warning metadata như xung đột hoặc raw đã sửa cũng có thể xuất hiện. |

Rule dừng giữa câu chấp nhận nhiều dấu kết, gồm `. ! ? … 。 ！ ？ : ;`, nháy/dấu đóng ngoặc và dấu gạch tương ứng trong code. Nó không hiểu ngữ pháp đầy đủ, vì vậy mặc định tắt để giảm false positive.

### 22.4. “But” được kiểm tra theo cách riêng

Filter và cleanup dùng từ độc lập `/\bbut\b/i`:

- `But`, `but`, `BUT` có thể khớp;
- `But,` hoặc `But.` có thể khớp;
- `button` không khớp;
- không chỉ xét đầu câu;
- không cần câu tiếng Anh dài hoặc điểm tin cậy ngôn ngữ;
- không phát hiện đầy đủ mọi tiếng Anh khác.

Đây là tín hiệu rà soát theo lỗi thường gặp của dự án. Tên riêng/URL/mã có But hợp lệ vẫn có thể bị chọn. Không nên nói “mọi kết quả ở filter đều là dịch sai chắc chắn”.

**Điểm tinh tế:** But được tìm trực tiếp trong content cho trang chất lượng, chưa được thêm thành warning chuẩn trong `validateTranslation`. Một chương chỉ có But có thể xuất hiện ở ô Hán/But nhưng không tăng tổng warning hoặc tự chuyển Cần xem lại vì riêng But đó. Chính sách xuất mặc định cũng dựa warnings, nên không tự chặn mọi But-only chapter.

### 22.5. Filter mặc định và điều kiện OR

Mặc định mở trang ở **Còn Hán hoặc “But”**. Chương khớp nếu có warning Hán hoặc tìm thấy But trong bản dịch. Một chương có cả hai chỉ tính một lần, không phải hai dòng hay hai chương.

Phần Hán dựa trên warning đã tính, chịu ảnh hưởng ngưỡng và lần kiểm tra gần nhất. AI cleanup lại kiểm tra trực tiếp Hán trong từng block. Nếu cho phép năm Hán tự, chương còn hai Hán tự có thể không nằm trong filter Hán nhưng cleanup thủ công vẫn thấy target.

### 22.6. Ý nghĩa các filter khác

| Filter | Nội dung |
|---|---|
| Mọi cảnh báo | Những chương có translation và `warnings.length > 0`, không phải mọi chương trong truyện. |
| Chưa duyệt | Hoàn thành và reviewState unreviewed. |
| Cần xem lại | reviewState needs-review, có bản dịch. |
| Đã duyệt nhưng có cảnh báo | approved và còn warning. |
| Tiêu đề / số chương | Warning về title hoặc số chương. |
| Tỷ lệ độ dài | Warning tỷ lệ output/source. |
| Output trùng | Warning trùng toàn bộ output giữa chương. |
| Dừng giữa câu | Warning đã tạo bởi rule tương ứng; không phải bật rule bằng cách chọn filter. |
| Cảnh báo khác | Warning không được các nhóm tên ở trên nhận diện. |

“Cảnh báo khác” có thể là lặp đoạn, code fence, lời dẫn/từ chối AI, nội dung chỉ có title, raw thay đổi… Không thể kết luận lý do chỉ bằng nhãn nhóm; phải đọc chuỗi warning cụ thể.

### 22.7. Lặp bao nhiêu lần thì bị cảnh báo?

Mặc định cùng một đoạn đủ dài xuất hiện ít nhất ba lần. Chỉ vài chữ điệp lại hoặc một đoạn ngắn không đủ điều kiện. Đoạn cần giống nhau sau chuẩn hóa whitespace, không phải “ý nghĩa giống nhau”.

“…” hoặc “...” không bị tính là code fence; có thể liên quan rule khác hoặc là dấu kết hợp lệ. Không suy từ nhãn Cảnh báo khác rằng nội dung chắc có Markdown.

### 22.8. Kiểm tra lại có gọi AI không?

Không. Nó nạp bản dịch cần thiết, chạy validator, nhóm output trùng, cập nhật warning/title/review metadata và đồng bộ cloud.

Các chương đã approved vẫn giữ approved trong lượt revalidate; warnings được cập nhật. Chương chưa approved được chuyển needs-review/unreviewed theo kết quả và dấu raw cũ. Revalidate không tự sửa chữ, không tạo một bản dịch AI mới.

### 22.9. Chọn và thao tác từ trang chất lượng

Có thể chọn từng hàng, thêm/bỏ kết quả đang lọc, chỉ chọn kết quả lọc; rồi:

- mở chương để biên tập tay;
- đưa phạm vi vào AI biên tập;
- chuẩn bị Dịch lại;
- ép duyệt phạm vi hoặc các kết quả lọc;
- ép duyệt toàn dự án nếu chủ động chấp nhận rủi ro.

Lọc chỉ điều kiện chất lượng. Các thao tác downstream vẫn kiểm tra điều kiện riêng: không active thì không AI edit/duyệt, xung đột thì không được dùng theo cách bình thường.

<a id="duyet-xuat-ban"></a>
## 23. Duyệt tay, ép duyệt và điều kiện xuất bản

### 23.1. Duyệt một chương làm gì?

Ghi `reviewState = approved` cho bản hiện tại sau khi kiểm tra có active, nội dung/title và không xung đột. Không tạo nội dung mới, không gọi LLM, không tự sửa warning.

Nếu vừa sửa draft, phải Lưu revision trước rồi duyệt. Duyệt không có nghĩa chấp nhận một draft chưa được đưa thành active. UI và dữ liệu revision cần cập nhật đồng bộ sau lưu; nếu báo không có active dù vừa lưu, cần chẩn đoán thay vì bấm liên tục và dịch lại.

### 23.2. Ép duyệt

Ép duyệt là ghi nhận chấp nhận hàng loạt, không phải vượt mọi ràng buộc dữ liệu. Vẫn cần active, nội dung/title và thứ tự không xung đột. Chương không đủ điều kiện được bỏ qua và báo số lượng.

Một title có chữ chưa chắc đúng cấu trúc xuất bản; đường duyệt kiểm tra sự hiện diện không thay thế preflight title nghiêm ở xuất bản. Duyệt xong vẫn có thể bị loại nếu title không đúng `Chương N: ...`/sai prefix.

Nút ở chất lượng và nút ở editor có cùng ý nghĩa duyệt; khác cách chọn phạm vi. Không có loại “duyệt mạnh hơn” chỉ vì bấm ở trang chất lượng.

### 23.3. Ba chính sách xuất bản

| Policy | Tên/ý nghĩa | Chưa duyệt, không warning | Có warning, chưa duyệt | Đã duyệt, còn warning |
|---|---|---:|---:|---:|
| `review-ready` | Mặc định: bản không warning hoặc warning đã được chấp nhận | Có | Không | Có |
| `approved-only` | Chỉ bản đã duyệt | Không | Không | Có |
| `all-active` | Bỏ điều kiện duyệt/warning để xuất bản hiện hành | Có | Có | Có |

“Có” trong bảng vẫn phải vượt điều kiện nền: có nội dung, title hợp lệ, không xung đột, thuộc phạm vi được xuất.

### 23.4. Điều kiện nền không được bỏ qua bởi ép duyệt

1. Nếu bật chỉ xuất đã chọn, chương phải selected.
2. Không orderingConflict.
3. Có bản dịch dùng được; cloud có thể cần hydrate trước khi có content.
4. Title theo `Chương N: Tên chương` và số khớp prefix khi có prefix.
5. Vượt điều kiện policy.

Preflight có thể coi chương completed chưa tải content là ứng viên, sau đó tải content và loại bản rỗng. Đừng coi số ứng viên metadata là bằng chứng mọi byte đã tải thành công.

### 23.5. Không thể diễn đạt điều kiện xuất chỉ bằng nhãn Hoàn thành

Helper xuất không đơn giản yêu cầu `lifecycleStatus === completed`. Nếu một lượt dịch lại thất bại nhưng còn bản dịch active cũ hợp lệ, bản đó vẫn có thể xuất theo policy.

Ngược lại, Hoàn thành nhưng title sai hoặc warning chưa duyệt có thể bị loại. Active hiện hành mới là nội dung mục tiêu; chapter translation là cache nội dung dùng bởi xuất/reader, cần được đồng bộ đúng với active.

`review-ready` dựa **warnings**, không chặn riêng mọi `needs-review` có warnings rỗng. But-only cũng là ngoại lệ đã nêu. Nếu muốn mọi chương phải được người dùng chấp nhận rõ ràng, chọn `approved-only`.

### 23.6. Duyệt không sửa nguyên nhân

Nếu warning còn Hán và bạn ép duyệt, EPUB có thể vẫn chứa Hán. Nếu chữ But là tiếng Anh hợp lệ từ raw, có thể chấp nhận thay vì bắt AI đổi. Quyết định này là kiểm duyệt nội dung của người dùng; app lưu dấu để về sau vẫn biết còn warning.

<a id="dinh-dang-xuat"></a>
## 24. Xuất TXT, ZIP và EPUB

### 24.1. Nguồn nội dung xuất

Xuất dùng bản dịch hiện hành lưu trên chương, được quản lý cùng active revision; không dùng draft chưa lưu hoặc tự chọn revision mới nhất theo thời gian. Các thao tác active/commit cần hoàn tất trước khi xuất.

Các dạng xuất hàng loạt dùng cùng lựa chọn policy/phạm vi ở trang Xuất bản. Chúng không tự gọi AI sửa lại title hoặc dịch chương thiếu.

### 24.2. TXT một chương

Nút TXT active tải UTF-8, mặc định có BOM. Tên dựa trên tên file nguồn đã làm sạch và thêm hậu tố `_vi.txt`. Nội dung là bản hiện hành, không có vỏ JSON structured output.

Đây là đường tải nhanh từ editor, có thể dùng để xem/sửa cả bản còn cảnh báo; không phải quy trình xuất sách đã qua toàn bộ preflight.

### 24.3. TXT gộp

- Sắp theo prefix số.
- Có phần đầu từ tên truyện/tác giả/dịch giả nếu có.
- Giữ số chương trong title, không đánh số lại từ 1.
- Nối các chương bằng khoảng cách dòng.
- UTF-8 có BOM theo worker xuất hiện tại.

Nếu chỉ xuất chương 321–500 thì title vẫn là Chương 321…500, không trở thành Chương 1…180.

### 24.4. ZIP chương lẻ

Mỗi chapter là một TXT. Tên có dạng prefix được padding tối thiểu bốn chữ số cộng translated title đã sanitize. Nếu tên trùng sau sanitize, thêm suffix để tránh ghi đè trong ZIP.

Tùy chọn `report.csv` chứa tên source, tên export, model, credential alias, status và warnings. Nó không có API key. Alias và tên chương vẫn là metadata có thể riêng tư khi chia sẻ.

CSV được quote/escape dấu nháy; người dùng vẫn nên thận trọng khi mở dữ liệu nhập từ bên ngoài bằng bảng tính có khả năng thực thi công thức.

### 24.5. EPUB

Ứng dụng tạo EPUB reflowable theo cấu trúc EPUB 3. UI gọi EPUB 3.3; thuộc tính OPF vẫn dùng `version="3.0"` theo cấu trúc file hiện tại, không phải file ZIP ngẫu nhiên đổi đuôi.

```text
mimetype                      ← entry đầu, không nén
META-INF/container.xml
EPUB/package.opf
EPUB/nav.xhtml                ← mục lục
EPUB/title.xhtml              ← trang tên sách
EPUB/styles/book.css
EPUB/text/chapter-1.xhtml
EPUB/text/chapter-2.xhtml
...
EPUB/images/cover.png|jpg      ← nếu có bìa
EPUB/cover.xhtml               ← nếu có bìa
```

Manifest khai báo tài nguyên; spine quyết định thứ tự đọc: bìa nếu có, trang tên, mục lục, các chương theo prefix.

### 24.6. TOC lấy từ đâu?

Title dẫn xuất từ dòng không rỗng đầu của bản dịch hiện hành được dùng cho `<h1>` và link TOC. Thân chương bắt đầu sau dòng title, tránh in title hai lần trong cùng nội dung chương.

Ví dụ:

```text
Chương 0: Bản thảo thiết lập bản đồ thế giới Xích Tâm Tuần Thiên

Nội dung chương...
```

TOC dùng nguyên title trên. Không dùng filename raw làm tên chương nếu translated title hợp lệ đã có.

CSS mục lục đặt `list-style: none`, không in thêm một cột số danh sách tự động 1, 2, 3… cạnh “Chương N”. Nhờ vậy tránh số dài bốn chữ số bị cắt bên trái theo kiểu cũ. Trình đọc EPUB bên ngoài vẫn có thể áp style riêng; file đã xuất từ phiên bản cũ không tự thay đổi khi website được cập nhật, cần xuất lại.

### 24.7. Nội dung được escape và chia XHTML

Ký tự `& < > " '` được escape cho XML. Thân bài tách theo dòng trống thành `<p>`; newline bên trong một đoạn được đổi thành `<br/>`. Điều này giữ bố cục đọc, không đưa mã JSON ID vào truyện.

EPUB không chứa một editor tương tác. Highlight, màu nền reader, font upload và bookmark của ứng dụng không tự trở thành CSS/font nhúng trong EPUB. Gói hiện tại dùng CSS sách riêng với font serif.

### 24.8. Bìa EPUB

Nhận PNG/JPEG được kiểm tra chữ ký file, tối đa 20 MiB. Bìa lưu theo project: IndexedDB ở local; cloud có metadata và file R2. Đóng tab rồi mở lại đúng workspace không phải nhập lại bìa như một file input tạm thuần túy.

Bìa được đưa vào backup và dùng lúc xuất EPUB. Upload bìa không tự xuất một EPUB mới; phải chạy xuất sau khi đổi.

### 24.9. Worker và RAM

Đóng TXT gộp/ZIP/EPUB/backup được thực hiện qua Web Worker để giảm khóa UI. Thanh tiến độ là các mốc công đoạn, không phải phép đo chính xác từng byte nén.

Worker không làm dung lượng RAM biến mất: source/content/revisions và Blob/ZIP vẫn có thể cùng tồn tại. App cảnh báo khi ước tính gói xuất trên 250 MiB. Đây là cảnh báo, không phải hạn mức cứng hay bảo đảm máy yếu sẽ xuất được mọi bộ truyện.

### 24.10. Không nhầm kiểm tra cấu trúc với chứng nhận mọi thiết bị

Các test kiểm tra thứ tự/escaping/cấu trúc gói. Tài liệu này không khẳng định đã chạy EPUBCheck mới hoặc đã thử mọi app đọc trong lần viết tài liệu. Khi cần phát hành rộng, nên kiểm tra file xuất thực tế với công cụ/thiết bị mục tiêu.

<a id="backup"></a>
## 25. Backup và phục hồi

### 25.1. Backup khác xuất bản

Xuất bản lấy nội dung đủ điều kiện đọc. Backup nhằm giữ workspace để tiếp tục làm việc: cả chương chưa dịch, thất bại, có cảnh báo, đã hủy, không được chọn hoặc chưa được duyệt đều cần được giữ.

Không dùng một EPUB/TXT gộp như bản backup đầy đủ vì chúng mất raw, revisions, preset, glossary và liên kết nội bộ.

### 25.2. Cấu trúc backup hiện tại

Format `xuong-dich-han-viet-backup`, version 5:

```text
manifest.json
source/<chapter-id>.txt
translation/<chapter-id>.txt
revisions/<revision-id>.txt
reader-fonts/<font-id>.woff2|ttf|otf
cover/cover.png|jpg
```

Manifest chứa project, metadata chương/revision, preset dịch, preset biên tập, glossary, highlight, font metadata và settings được hỗ trợ.

Nội dung raw trong `source` là **source text đã giải mã hiện hành**, không phải đảm bảo phục hồi byte-for-byte của file UTF-16/GB18030 ban đầu. Giữ riêng thư mục raw gốc nếu cần bảo toàn chính xác encoding/bytes.

### 25.3. Những gì có trong backup

- Toàn bộ chương thuộc workspace được thu thập.
- Raw hiện hành và active translation nếu có.
- Revisions còn lưu, gồm cờ active/pinned và provenance.
- Hai thư viện preset.
- Glossary, trạng thái đề xuất/bật tắt.
- Cấu hình project, model, concurrency, validator và policy trong các cấu trúc được ghi.
- Bìa, font upload, highlight.
- Tùy chọn reader và tiến độ/bookmark cục bộ nếu đọc được.

### 25.4. Những gì không có

- API key thật hoặc ciphertext pool key.
- CryptoKey thiết bị.
- Server secrets.
- Toàn bộ attempts/runs/events/automation jobs như một checkpoint phục hồi nhà cung cấp đầy đủ.
- Trạng thái kết nối sống, Web Locks hoặc lease đang giữ.
- Mọi phiên bản raw đã từng sửa.
- Những revision đã bị xóa/tự dọn trước lúc backup.

Do đó backup phục vụ nội dung/cấu hình, không phải “di chuyển tất cả request đang chạy sang máy khác”. Nên tạo khi hàng đợi đã ổn định và đồng bộ xong.

### 25.5. Phục hồi tạo dự án gì?

Import backup tạo **dự án local mới**, tên có hậu tố phục hồi, ID project/chapter/preset/revision/font được ánh xạ lại theo cấu trúc. Không mặc định ghi đè dự án hiện tại.

Thiếu preset trong backup cũ thì bổ sung mặc định phù hợp. Metadata model/cấu hình được chuẩn hóa để đọc dữ liệu cũ. Font và bìa được kiểm tra định dạng khi phục hồi.

Sau import:

1. Kiểm tra số chương, raw, active và revisions mẫu.
2. Kiểm tra preset đang chọn và model.
3. Nhập/cấu hình lại key.
4. Kiểm tra title/order/quality.
5. Nếu muốn cloud, tạo bản sao sang cloud theo chức năng chuyển chế độ.

### 25.6. Lưu ý với backup lớn hoặc mất mạng

Backup cloud cần tải nội dung/revisions chưa có trong cache. Helper hydrate có đường fallback giữ dữ liệu local khi lỗi mạng; vì vậy không nên coi việc tải được một ZIP là bằng chứng chắc chắn từng content chưa cache đã được lấy đủ.

Trước khi chuyển máy hoặc xóa dự án, nên thử phục hồi ZIP trong workspace mới và kiểm tra số lượng/nội dung mẫu, nhất là các chương chưa từng mở trên máy đó. Đây là bước kiểm chứng, không phải vì backup cố tình loại chương chưa duyệt.

Chỉ import backup từ nguồn tin cậy. Bộ đọc dùng JSZip/manifest ứng dụng; không phải hệ thống cách ly hoàn chỉnh cho archive lạ khổng lồ hoặc được thiết kế gây cạn RAM.

<a id="trinh-doc"></a>
## 26. Trình đọc

### 26.1. Tách biệt với editor

Reader để đọc active content, tìm, copy, highlight, ghi chú và lưu vị trí. Không có replace/edit nội dung truyện trong reader. Muốn sửa thì mở chương trong biên tập.

Reader không đòi mọi chương phải approved giống policy xuất `approved-only`. Nó có thể đọc bản hiện hành còn warning; việc đọc không tự duyệt.

### 26.2. Bố cục

- Mục lục bên trái, có lọc và vùng cuộn riêng, danh sách virtualized.
- Nội dung ở giữa, chuyển chương trước/sau, đọc toàn màn hình.
- Công cụ bên phải, tìm trong chương, highlight/copy và thiết lập hiển thị.

Tiêu đề dài có thể được rút gọn trong danh sách; đó là cách hiển thị, không cắt nội dung title lưu/export. Mục lục và phần nội dung phải cuộn độc lập theo khung hiện tại.

### 26.3. Font

Các lựa chọn sẵn: Lora, Inter, Roboto, Noto Sans, Noto Serif, Literata, STIX Two Text, Source Serif 4.

Font riêng hỗ trợ WOFF2, TTF, OTF, tối đa 8 MiB mỗi file. App kiểm tra extension và chữ ký định dạng; không chỉ tin tên file. Font lưu theo dự án và có thể đi theo backup; chọn font không sửa nội dung truyện.

Font thiếu glyph tiếng Việt/Hán có thể rơi về font fallback của hệ thống. Upload thành công không chứng minh font bao phủ mọi ký tự. Người dùng chịu trách nhiệm quyền sử dụng font khi phân phối tài sản.

### 26.4. Hiển thị

| Tùy chọn | Mặc định | Khoảng UI |
|---|---:|---:|
| Cỡ chữ | 18 px | 13–30 px |
| Giãn dòng | 1,85 | 1,4–2,4 |
| Độ rộng nội dung | 780 px | 560–1.100 px, còn chịu khung responsive |
| Giãn đoạn | 0,65 em | 0–2,5 em |
| Căn chữ | Trái | Trái hoặc justify |

Preset màu: Giấy ấm, Trắng, Sepia, Xanh dịu, Tối. Có custom màu chữ/nền qua picker và giá trị màu được hỗ trợ, gồm hex/rgb. Thiết lập áp dụng reader, không tự đổi CSS EPUB.

### 26.5. Tìm trong chương và toàn truyện

Tìm trong chương dùng bản hiện hành, hiển thị match và nút trước/sau. Tìm toàn truyện tải nội dung cần thiết rồi chạy trong Web Worker theo các batch 150 chương, trả số lần khớp và một đoạn trích cho mỗi chương có kết quả.

Tìm toàn truyện không phải RAG, không gọi LLM và không sửa văn bản. Với cloud lớn, thời gian tải content có thể nhiều hơn thời gian tìm chuỗi. Nếu chưa tải đủ nội dung do mất kết nối, không nên suy “không có kết quả” thành chắc chắn toàn truyện không chứa từ đó.

### 26.6. Highlight và ghi chú

Highlight lưu quote, offset, màu, ghi chú và metadata revision/hash khi có. Khi active thay đổi:

1. Nếu quote vẫn đúng ở offset cũ, giữ nguyên.
2. Nếu không, tìm quote trong content mới và chọn vị trí gần offset cũ nhất.
3. Nếu không còn quote, đánh dấu không ghép được thay vì tô ngẫu nhiên một đoạn khác.

Tìm lại quote không phải căn chỉnh ngữ nghĩa. Nếu cùng câu xuất hiện nhiều lần, vị trí gần nhất có thể không phải ý định ban đầu; cần kiểm tra highlight được ghép lại.

### 26.7. Vị trí đọc và bookmark

Lưu chương đọc gần nhất, tỷ lệ vị trí trong chương và bookmark theo project trong localStorage. Nếu nội dung/cỡ chữ thay đổi, tỷ lệ vị trí không đảm bảo trỏ đúng một câu tuyệt đối.

Các sở thích/vị trí này mang tính thiết bị. Cloud content có thể dùng ở máy khác, nhưng không nên kỳ vọng mọi scroll position tự đồng bộ như một dịch vụ đọc sách chuyên dụng. Backup có thể mang theo dữ liệu reader được hỗ trợ.

<a id="diagnostic"></a>
## 27. Nhật ký, diagnostic và cách đọc số liệu

### 27.1. Nhật ký hoạt động

Ghi các sự kiện như nhập file, bắt đầu/kết thúc run, key/model được dùng, thất bại, quét từ điển, tạo revision, active/duyệt và công việc bảo trì. UI giữ danh sách gần đây, giới hạn 200 event trong state hiển thị.

Log không cố ghi toàn raw, output, system instruction hoặc API key. Tuy nhiên tên truyện/chương, alias key, Interaction ID, thời điểm và lỗi vẫn có thể là thông tin riêng tư.

### 27.2. Diagnostic JSON

Diagnostic gồm:

- format và thời điểm export;
- project ID, storage mode, số chương;
- mỗi chương: ID, filename, prefix, lifecycle, review state, error, warnings, model, key alias, attempt count;
- attempts của các chương, bỏ credentialRef khỏi bản xuất diagnostic;
- các event đang giữ.

Nó **không phải backup**: không chứa toàn nội dung/revision để phục hồi truyện. Nó cũng chưa phải bản dump đầy đủ mọi automation job/runtime phase; đôi khi cần thêm thời điểm, thao tác vừa bấm và loại tác vụ để giải thích lỗi biên tập/quét.

### 27.3. Đọc attempt theo chuỗi thời gian

Ví dụ:

```text
attempt 1 → key 01 → 429 → cooldown
attempt 2 → key 02 → POST direct → progress/heartbeat → result completed
revision → lưu local → cloud content commit → metadata sync nếu cần
không có poll/DELETE thường lệ cho attempt direct
```

Cùng một chương có hai attempt không đồng nghĩa có hai bản dịch được dùng. Một attempt bị từ chối có thể không tạo output; một output có thể được lưu revision nhưng không active.

### 27.4. Thời gian tổng không chỉ là thời gian model sinh chữ

Tổng thời gian gồm chờ admission/key, source/cloud, metadata model, POST, provider queue, thinking, stream output, validate và lưu. Metadata nền có thể tiếp tục sau khi nội dung xong; poll/cleanup latency chỉ thuộc đường legacy.

Không lấy “thời điểm bấm Bắt đầu đến event cuối” chia số chương để suy tốc độ sinh token của model. Muốn đo chính xác phải phân tích các mốc tương ứng và điều kiện key/model, không chỉ nhìn một con số UI.

### 27.5. Những thông tin nên gửi khi báo lỗi

Loại dự án local/cloud; URL/origin đang dùng; model đã chọn; concurrency; có bật glossary không; thời điểm; prefix bị lỗi; thao tác trước đó; diagnostic đã kiểm tra riêng tư. Không cần gửi lại API key vào log hoặc ảnh chụp công khai.

<a id="dong-bo"></a>
## 28. Tính nhất quán, nhiều tab và các lớp bảo vệ

### 28.1. Trạng thái lưu bền vững khác tác vụ sống

IndexedDB/D1 giữ history/checkpoints; aiTasks trong React chỉ giữ việc engine đang điều phối trong phiên. Boot không phục hồi registry từ stored running/recoverable.

Direct đang dở chưa có revision được chiếu về failed ở chương, không chặn Start bằng unresolved gate. Job editorial/glossary direct không được count pending resume. Một số status kỹ thuật vẫn còn trong history để chẩn đoán, không phải đã hồi sinh request.

Legacy có ID chỉ active khi observer thực sự chạy. Revision đã lưu, pending metadata và cleanup không biến thành luồng AI. Phải đọc executionMode trước khi diễn giải “còn ID” là cần nối lại.

### 28.2. Attempt mới nhất mới được chi phối chương

Code chọn attempt mới nhất theo startedAt, dùng updatedAt phá hòa. Một update của attempt cũ không được ghi đè trạng thái chương đang thuộc attempt mới hơn. Attempt abandoned bị loại khỏi quyền áp kết quả.

Nếu output đã thành revision, marker saving/cleanup không làm mất bản dịch hoặc chuyển nó về “đang dịch” vô hạn.

### 28.3. Chống cập nhật cloud cũ đè mới

Checkpoint dùng timestamp tăng đơn điệu ngay cả hai cập nhật rơi vào cùng millisecond. Hàng sync gộp theo ID, server có kiểm tra thứ tự metadata, client chỉ xóa pending nếu bản vừa ACK vẫn là bản mới nhất.

Đây là lý do cần giữ attempts/jobs có pending sync dù nội dung đã completed. Xóa chúng quá sớm chỉ để giao diện sạch có thể làm cloud hồi về trạng thái cũ khi mở máy khác.

### 28.4. Khóa trong trình duyệt

Hàng đợi dùng Web Locks theo project ID khi browser hỗ trợ. Nếu không có, luồng bắt đầu dịch có fallback BroadcastChannel để bầu phiên điều phối và phát heartbeat. Nếu không có cả hai, không có cùng mức bảo vệ đa tab.

Không giả định mọi nút phụ đều có một khóa phân tán toàn cục giống nhau. Thực hành an toàn vẫn là chỉ dùng một tab để điều phối một dự án khi đang dịch/biên tập.

### 28.5. Lease cloud

Run cloud lấy D1 lease; run dịch thông thường TTL 45 giây, gia hạn khoảng 20 giây. Một số phiên phục hồi dùng TTL 90 giây. Mất quyền lease thì dừng submit mới, không bịa rằng Google đã hủy tất cả công việc.

Lease chống nhiều phiên điều phối cùng project, không thể thu hồi một POST đã được Google nhận trước đó. Mất mạng cũng có thể làm quyền điều phối hết hạn trong khi provider vẫn chạy.

### 28.6. Cloud không phải cộng tác real-time hoàn chỉnh

Có cache, hydrate và đồng bộ theo hành động; không phải CRDT/editor nhiều người cùng sửa với hợp nhất ký tự. Hai browser sửa cùng revision/preset có thể tạo tình huống cần làm mới và đối chiếu.

Những thao tác manual save/approve/pin có đường thông báo “đã lưu local nhưng cloud chưa nhận” riêng, không nên hiểu mọi loại dữ liệu đều đã có outbox tự sửa tuyệt đối. Đồng bộ lịch sử tập trung attempts/jobs; nội dung/config còn có quy trình riêng.

### 28.7. Xóa project và request đến muộn

Tombstone và owner checks ngăn autosave đến muộn tái tạo dự án đã xóa. Quy trình xóa không chỉ xóa một hàng `projects` rồi bỏ mặc R2; nó dọn nội dung có giới hạn và giữ thông tin tiến độ để tiếp tục.

Điều đó không đồng nghĩa thao tác xóa cloud đã gửi cancel tới mọi interaction Google có thể tồn tại. Trước khi xóa dự án, dừng/ngắt tác vụ và xử lý lưu/đồng bộ; nếu còn legacy thì xử lý cleanup phù hợp. Direct abort không khẳng định provider đã dừng, và xóa dự án không phải lệnh hủy Google.

<a id="bao-mat"></a>
## 29. Bảo mật và quyền riêng tư

### 29.1. Xác thực và owner

Production lấy danh tính từ header xác thực do môi trường Sites cung cấp; owner ID được suy ra từ danh tính. Cloud route kiểm tra project/chapter thuộc owner trước khi đọc/ghi.

Đây không phải app tự triển khai đăng nhập/mật khẩu. Khi đưa sang hạ tầng khác phải có lớp xác thực/proxy đáng tin và chặn giả mạo header. Không public một server development dùng danh tính fallback rồi nghĩ nó vẫn owner-only.

### 29.2. Key

- Không hard-code key vào source/preset.
- Không đặt key trong URL query string.
- UI key đi qua header riêng tới server và được gửi cho Google đúng mục đích tạo/đọc tác vụ.
- Backend không trả server secret thật cho UI.
- Metadata chỉ dùng alias/fingerprint/reference khi có thể.
- Backup/export/diagnostic không phải phương tiện chuyển key.

Nếu key đã bị chia sẻ công khai hoặc không còn tin cậy, thay/thu hồi ở nơi cấp key. Đổi alias trong ứng dụng không thu hồi key thật.

### 29.3. Dữ liệu truyện

Cloud lưu nội dung trên hosting; local giữ nội dung trong browser nhưng gửi phần cần xử lý cho AI khi chạy. Direct dùng store:false, không tạo đường đọc lại/cleanup của app. Không suy từ cờ này rằng Google không có chính sách xử lý/log riêng. Background legacy có cleanup có kiểm soát, không cam kết xóa mọi log hệ thống bên thứ ba.

Không ghi raw/output/preset vào log thông thường không có nghĩa backup, clipboard, screenshot hay export đã được ẩn danh. Chúng chứa dữ liệu thật.

### 29.4. Nội dung truyện là dữ liệu, không phải chỉ thị điều hành ứng dụng

Protocol/preset yêu cầu xem text trong source như dữ liệu cần dịch, không thực hiện các câu “bỏ qua hướng dẫn” nằm trong truyện. AI không được cấp tool filesystem/web/terminal trong luồng dịch; schema chỉ nhận text phù hợp tác vụ.

Tuy nhiên model vẫn có thể hiểu sai, từ chối hoặc tạo output không đạt. Schema là kiểm soát cấu trúc, không phải bằng chứng chống mọi prompt injection ngữ nghĩa.

### 29.5. Trình duyệt và mã hóa

Vault mã hóa giảm lưu plaintext trên ổ đĩa theo đường app chủ động, nhưng code đang chạy cùng origin phải giải mã để sử dụng key. Máy bị chiếm quyền/browser extension độc hại/XSS là các rủi ro riêng không được giải quyết chỉ bằng cờ nonextractable.

Nên giữ backup ở nơi riêng tư, bảo vệ tài khoản Sites và thiết bị, không dùng profile công cộng để lưu pool key dài hạn.

<a id="quy-trinh"></a>
## 30. Các quy trình sử dụng mẫu

### 30.1. Dịch chay một phạm vi mới

1. Mở đúng project/origin.
2. Nhập raw, kiểm tra encoding, prefix và khoảng thiếu.
3. Chọn preset dịch phù hợp `blocks-v1`.
4. Tắt quét glossary tự động nếu chỉ muốn dịch chay; glossary đã bật vẫn được sử dụng.
5. Chọn đúng model, nạp key, đặt concurrency.
6. Bỏ lựa chọn cũ nếu không muốn lẫn phạm vi.
7. Chọn prefix X–Y, kiểm tra số chương bao gồm hai đầu.
8. Bắt đầu, theo dõi pha thực tế chứ không chỉ con số luồng.
9. Khi xong, mở chất lượng, đọc mẫu, duyệt hoặc chỉnh sửa.
10. Xử lý đồng bộ còn dở (cleanup nếu còn legacy), backup rồi xuất bản.

### 30.2. Thêm chương tác giả mới ra

1. Giữ prefix đúng số tiếp theo.
2. Import file mới, không ghi đè chương cũ bằng cách dùng cùng filename.
3. Kiểm tra có gap/duplicate không.
4. Chỉ chọn chương mới hoặc dùng trạng thái Chưa dịch.
5. Chạy với preset/glossary/model đang muốn áp dụng.
6. Xuất lại EPUB nếu muốn bộ sách có chương mới; EPUB cũ không tự cập nhật.

### 30.3. Dọn nhiều chương Hán/But bằng AI

1. Áp ngưỡng validator và kiểm tra lại khi cần.
2. Vào chất lượng, chọn Còn Hán hoặc “But”.
3. Dùng Chỉ chọn kết quả lọc nếu muốn loại lựa chọn cũ ngoài nhóm.
4. Mở AI biên tập theo Đã chọn.
5. Chọn mục tiêu Loại bỏ chữ Hán / “But” theo block ID.
6. Chọn model cố định, số luồng phù hợp và tùy chọn tự active.
7. Chạy; app gửi mỗi chương một request gồm toàn bộ target của chương đó.
8. Xem số tự active, số giữ đề xuất, số skipped/lỗi.
9. Rà các bản bị giữ lại; không ép active chỉ vì chúng mới hơn.
10. Duyệt tay hoặc ép duyệt nhóm đã chấp nhận; kiểm tra filter lại.

### 30.4. Chấp nhận hàng loạt warning tỷ lệ dài

1. Lọc Tỷ lệ độ dài.
2. Đọc mẫu raw/dịch để xác nhận không thiếu nội dung hoặc lặp vô nghĩa.
3. Nếu ngưỡng đang không phù hợp, sửa ngưỡng và revalidate trước.
4. Nếu vẫn muốn giữ warning nhưng chấp nhận nội dung, ép duyệt đúng kết quả lọc.
5. Dùng policy review-ready hoặc approved-only theo nhu cầu.

Không tăng ngưỡng chỉ để làm sạch số warning mà chưa xem nguyên nhân. Duyệt là quyết định nội dung; đổi ngưỡng là quyết định tiêu chí kiểm tra, hai thao tác khác nhau.

### 30.5. Cần đi đột xuất

- Muốn nghỉ ngắn, tiếp tục đúng run trong tab: Tạm dừng.
- Muốn kết thúc run hiện tại nhưng giữ các lượt đang xử lý: Dừng sau lượt.
- Muốn ngừng nhận ngay: Ngắt đang chạy; giữ kết quả đã lưu nhưng không có xác nhận Google hủy.

Trước khi đóng tab, đợi stream/lưu/đồng bộ nếu muốn giữ kết quả. Direct không tự nhận lại output sau mở lại; đóng tab/ngắt không bảo đảm provider ngừng.

### 30.6. Thử lại các chương Thất bại

1. Đảm bảo không có run/biên tập đang hoạt động.
2. Lọc Thất bại.
3. Chỉ chọn kết quả lọc hoặc chọn từng chương.
4. Direct failed/cancelled đủ điều kiện: Bắt đầu tạo lượt mới; lượt mất stream cũ có thể vẫn tiêu quota.
5. Chỉ nếu là background legacy unresolved: Nối lại ID cũ hoặc Dịch lại với xác nhận bỏ theo dõi.
6. Giữ active/revisions cũ; không xóa raw để “reset”.

### 30.7. Thay raw một chương

1. Backup/file gốc còn giữ.
2. Dừng hàng đợi/biên tập.
3. Sửa raw, lưu raw; đọc cảnh báo ảnh hưởng active.
4. Kiểm tra title/prefix.
5. Nếu thay cấu trúc đáng kể, chuẩn bị Dịch lại rồi Bắt đầu.
6. Nếu active manual cũ được giữ, xem AI revision mới và chủ động Dùng bản này khi phù hợp.

### 30.8. Dán bản dịch làm ngoài ứng dụng

1. Chọn đúng chương.
2. Nhập bản dịch cả chương, không dán cả truyện gộp.
3. Chọn encoding/split mode.
4. Kiểm tra title, số block và phần dư/thiếu.
5. Áp dụng draft, sửa mapping bằng mắt khi cần.
6. Lưu manual revision, duyệt, xuất.

### 30.9. Muốn đọc nhanh, chấp nhận rủi ro

Chọn phạm vi có nội dung/title/order hợp lệ, dùng ép duyệt hoặc policy all-active theo ý định. Xem preflight để biết chương nào vẫn bị loại. Cách này không chữa lỗi và không bỏ được điều kiện nền như title/prefix; nó chỉ bỏ hoặc đáp ứng hàng rào chấp nhận warning.

### 30.10. Chuyển từ website cũ sang website mới

1. Trên website cũ, đợi lưu/đồng bộ ổn định.
2. Xuất backup, giữ thêm raw gốc.
3. Mở website mới, import backup thành local mới.
4. Kiểm tra nội dung/revisions/preset/glossary/bìa/font.
5. Nạp lại key vì origin khác.
6. Nếu muốn cloud mới, sao chép sang cloud.
7. Chỉ xóa dự án cũ sau khi xác minh bản mới đủ dữ liệu.

Không trông chờ `project_id` trong source tự chuyển D1/R2 giữa hai tài khoản.

### 30.11. Muốn biết từng dùng model yếu không

Sort model để rà nhanh, sau đó xem revisions và provenance. Active có thể là AI EDIT từ model khác với bản dịch gốc. Backup chứa các revisions còn giữ nên có thể dùng kiểm kê offline; nó không chứa lịch sử đã bị prune/xóa.

Không suy “cột model hiện tại không có Lite” thành “chưa bao giờ dùng Lite”.

### 30.12. Muốn lấy lại một bản trước khi AI sửa

Mở lịch sử, So sánh với active, chọn đúng revision rồi Dùng bản này. Việc đổi active đặt lại review theo warnings của bản đó; nếu cần xuất theo approved-only thì duyệt lại. Không cần dịch lại chỉ để quay về nội dung đã có.

<a id="chan-doan"></a>
## 31. Chẩn đoán các tình huống thường gặp

| Hiện tượng | Những điều cần kiểm tra trước | Không nên làm ngay |
|---|---|---|
| Ma trận xanh nhưng mọi chương lỗi | Lỗi POST/stream/terminal, model cố định, quyền/schema, quota đúng project và payload. Health metadata không thử generation. | Tự kết luận mọi key hỏng hoặc tự hạ model ngầm. |
| Đặt 10 luồng nhưng số nhảy 1–10 | Pha thật, key rảnh, nguồn cloud, scan tối đa 5, refill; chờ quota dịch đã yield chứ không giữ worker. | Đổi bộ đếm để luôn hiện 10. |
| Dịch mới vừa bắt đầu đã dừng | Lỗi lease/lưu, thiếu credential/model, legacy unresolved, nguyên nhân stop/pause trong log; không tự quy direct checkpoint là cần nối lại. | Chỉ sửa nhãn chương rồi bỏ qua lịch sử request. |
| Chương Thất bại không được lấy | selected, ordering conflict, run/lease khác, legacy unresolved; direct dở chưa có revision không phải resume gate. | Xóa raw/revisions để ép reset. |
| Hoàn thành không được xuất | Policy, selected, title/number, warning chưa duyệt, content cloud chưa tải. | Chỉ đổi lifecycle trong database. |
| Đã duyệt vẫn còn chấm than | Warning được giữ có chủ đích; xem tooltip và nội dung cụ thể. | Coi đây là lỗi duyệt rồi bấm nhiều lần. |
| Hán/But nhiều hơn tổng warning | But là kiểm tra content riêng, chưa phải warning domain chuẩn. | Cộng hai ô như các nhóm độc lập tuyệt đối. |
| AI EDIT xong nhưng bản đọc không đổi | Tắt auto-active hoặc guard giữ lại: pinned/base/raw đổi/new warning/Hán/But chưa sạch. | Dịch lại cả chương chỉ vì chưa active. |
| Revision mới không xuất hiện | Save có hoàn tất không, lỗi cloud/local, đang mở đúng chương, trạng thái refresh. | Giả định mỗi gõ phím đã được lưu revision. |
| TXT không giống chữ đang sửa | Nút tải active, không tải draft. | Nghĩ export lấy sai revision khi chưa lưu. |
| Raw–dịch lệch hàng về ý nghĩa | Alignment legacy, raw đã đổi, bản ngoài thiếu đoạn, AI toàn chương đổi đoạn. | Chỉ làm hai cột bằng chiều cao rồi coi đã khớp nghĩa. |
| Dọn một block vẫn chậm | Block dài, nhiều target, full preset/glossary, thinking high, provider queue, stream/commit. | Suy chắc chắn đang gửi lại toàn raw. |
| Cleanup không giảm hết | Chỉ legacy: đúng key, terminal, cloud commit, network, marker sync. Direct mới không cần DELETE thường lệ. | Xóa ID lịch sử hoặc xóa chương để làm số về 0. |
| Sẵn sàng nhưng còn công việc bảo trì | Pending cleanup/sync khác với tác vụ sống. | Cộng toàn bộ marker lịch sử vào “đang chạy”. |
| Chương bị Đã hủy dù không bấm hủy | Lý do user-stop/user-cancel, direct abort, provider legacy hoặc metadata cũ; tự dừng phải giữ queued cho phần chưa gửi. | Mặc định mọi cancelled đều do người dùng. |
| Nhập đủ số file nhưng spinner còn | Pha lưu IndexedDB hoặc upload cloud; thông báo sync thất bại. | Import lại liên tục gây thao tác chồng. |
| Mở địa chỉ khác mất project/key | Origin, port, browser/profile và tài khoản/site. | Xóa database “trống” hoặc tạo nhiều project trùng để dò. |
| Dev terminal không quay về prompt | Server đang phục vụ; route có thể chỉ compile khi truy cập. | Coi một tiến trình server sống là build bị treo. |
| Xóa cloud còn dở | Tombstone/progress, lease, request timeout; dùng tiếp tục xóa. | Xóa bừa thư mục cache/source hoặc tạo lại ID đang xóa. |

### 31.1. Cách kiểm tra tốc độ không làm tăng rủi ro

Chạy một phạm vi nhỏ đã biết độ dài, giữ model/preset/glossary cố định, ghi concurrency và số key dùng được. So pha thời gian chờ key, Google queue, chạy, lưu. Chỉ thay một cấu hình mỗi lần để biết nguyên nhân.

Không có cam kết “Flash luôn dịch một chương trong X giây” trong code. 10 luồng chỉ giúp xử lý nhiều chương nếu tài nguyên và nhà cung cấp cho phép; thời gian chương dài nhất, thinking và lỗi nền vẫn ảnh hưởng tổng.

### 31.2. Khi nghi lỗi code

Giữ diagnostic, prefix, thời điểm và thao tác tái hiện. Với lỗi save/approve, ghi rõ đang sửa draft hay active, source manual/AI, cloud có báo commit thành công không. Với lỗi API, phân biệt metadata, POST mở stream, frame error, terminal/parser và lưu. Chỉ legacy mới có poll/cancel/cleanup.

Sửa bộ hiển thị trước khi xác minh dữ liệu có thể che lỗi. Ngược lại, nhìn một badge cũ cũng không đủ để kết luận Google còn đang chạy.

<a id="gioi-han"></a>
## 32. Giới hạn, ngoại lệ và điểm chưa được bảo đảm

Đây là các giới hạn quan sát từ mã nguồn, không phải tính năng mới được thêm trong tài liệu:

1. Tab/kết nối phải hoạt động để gửi và nhận direct stream; chưa có daemon dịch hay phục hồi output direct sau reload.
2. Không có tự hạ model, kể cả khi mọi key của model đang chọn bị chặn.
3. Catalog/health không phải phép đo quota sinh nội dung đầy đủ.
4. Một alias không đóng băng backend model vĩnh viễn.
5. Chưa có TPM token bucket chính xác theo project Google; số token trong UI là ước tính và phản ứng quota chủ yếu dựa lỗi nhận được.
6. Không xác minh được hai chuỗi key khác nhau có thực sự thuộc hai Google project độc lập.
7. Direct mất phản hồi không thể GET phục hồi, kể cả có providerInteractionId chẩn đoán; thử mới do user có thể tiêu quota chồng với lượt cũ.
8. Nhả worker/abort không chứng minh Google đã kết thúc. Budget abandoned/unknown-submit legacy không phải cơ chế dừng tất cả lỗi direct; quota auto-pause chỉ cho hàng đợi dịch.
9. Chỉ job biên tập legacy có Nối lại; có thể gửi tiếp phần chưa chạy. Direct job dở không tự tiếp tục sau reload.
10. Không phải mọi nơi có label failed đều là cùng một loại lỗi retry được.
11. Dịch/biên tập gửi glossary enabled, không có lọc term theo raw riêng từng request như một hệ RAG.
12. Glossary scan có giới hạn schema/payload; số term tối đa cho kho cloud không đồng nghĩa có thể gửi tất cả vào mọi endpoint.
13. Schema dịch bảo vệ mapping hình thức, không bảo đảm đúng nghĩa/tên/xưng hô.
14. AI EDIT toàn chương dùng wrapped text và căn lại đoạn; không có bảo đảm ID chặt như dịch mới.
15. Parser dọn target ID chưa kiểm tra mọi trường hợp block rỗng như decoder dịch.
16. Alignment legacy và nhập bản ngoài là heuristic vị trí; không tự suy luận ngữ nghĩa căn hàng.
17. Sửa raw không có lịch sử raw revisions; ID/offset cũ có thể mất hiệu lực.
18. Rule chất lượng có false positive/false negative. But không phải bộ nhận diện tiếng Anh toàn diện.
19. But-only chưa tự trở thành warning chuẩn, nên cần hiểu đúng filter và xuất bản.
20. Review state không phải cờ bất biến của revision xuyên mọi lần đổi active; quay lại bản cũ có thể cần duyệt lại.
21. Model label trên chapter có thể phản ánh lượt gần nhất; revision provenance đáng tin hơn cho câu hỏi bản active do ai tạo.
22. Bộ đếm/storage là phép đo phục vụ UI, không phải quota/hóa đơn/đảm bảo cloud đã nhận mọi byte.
23. Backup không chứa key và không khôi phục mọi interaction đang chạy.
24. Backup raw là decoded text hiện hành, không thay bản lưu bytes gốc trên ổ đĩa của người dùng.
25. Hydrate cloud có fallback cache khi lỗi; trước xóa/chuyển máy cần kiểm chứng backup.
26. Chưa có cộng tác nhiều editor real-time với merge xung đột ký tự.
27. D1/cloud sync không phải một transaction xuyên browser–D1–R2–Google; checkpoint/guard xử lý các điểm gãy, nhưng người dùng vẫn phải xem thông báo pending.
28. Năm AI revisions thường không giới hạn tổng dung lượng khi có nhiều manual/pinned.
29. Ngân sách 128 MiB không chống hết lỗi hết RAM/quota browser.
30. UI gọi EPUB 3.3 không phải bằng chứng mọi file xuất đã được EPUBCheck/ứng dụng đọc bên ngoài chứng nhận trong từng lần chạy.

Những giới hạn này không được “sửa” trong lượt viết tài liệu. Chúng được ghi để vận hành đúng và giúp lựa chọn công việc tiếp theo dựa trên hiện trạng.

<a id="ky-thuat"></a>
## 33. Phụ lục kỹ thuật: cấu trúc dữ liệu, API, cấu hình và kiểm thử

### 33.1. Stack khai báo

| Thành phần | Phiên bản/phạm vi trong package.json |
|---|---|
| React / React DOM | 19.2.6 |
| Next | 16.2.6 |
| Vinext | 0.0.50 |
| Vite | 8.0.13 |
| TypeScript | 5.9.3 |
| @google/genai | `^2.16.0` |
| Dexie | `^4.4.4` |
| Zod | `^4.4.3` |
| Drizzle ORM | 0.45.2 |
| JSZip | `^3.10.1` |
| Vitest | `^4.1.10` |
| Node yêu cầu | `>=22.13.0` |

Phiên bản có dấu `^` là phạm vi khai báo, không khẳng định package cài thực tế luôn đúng bản số đầu. Dùng lockfile khi triển khai lại; không tùy tiện nâng mọi dependency chỉ để tái hiện mốc này.

### 33.2. Các nhóm bản ghi chính

| Nhóm | Vai trò |
|---|---|
| projects | Metadata truyện, chế độ lưu, active instruction, settings, glossary automation. |
| chapters | Identity, raw hash, source/content cache, title, lifecycle/review/warnings, metadata lượt xử lý. |
| presets / editorialPresets | Hai thư viện instruction, autoUpdate (thiếu=true); import/duplicate=false. |
| glossary | Thuật ngữ, category, enabled, nguồn và trạng thái đề xuất. |
| runs | Snapshot instruction/glossary/model/credential refs và danh sách chương. |
| attempts | Client request ID, executionMode, providerInteractionId direct chỉ diagnostic hoặc interactionId legacy, model/key ref, trạng thái/error/usage/revision/outbox/cleanup legacy. |
| revisions | Full content, source, active/pinned, warnings, alignment, provenance. |
| automationJobs | Snapshot quét/biên tập, executionMode, phần hoàn tất/còn lại, stopRequested/outbox; active ID phục hồi chỉ legacy. |
| events | Nhật ký tóm tắt. |
| credentialPools / vaultKeys | Chỉ local: ciphertext pool và khóa thiết bị. |
| readerHighlights / readerFonts / epubCovers | Tài sản đọc và xuất bản. |
| interactionCleanup / cleanup metadata | Dọn provider background legacy còn dở; không tạo cho direct mới. |
| scheduler_leases | Quyền điều phối cloud có hạn thời gian. |
| project_deletions | Tombstone, lease và tiến độ xóa cloud. |

D1 lưu một số trường mở rộng trong JSON metadata/usage/snapshot chứ không có một cột SQL riêng cho mọi property TypeScript. Dexie cũng có các schema version để nâng database local cũ.

### 33.3. Liên kết quan trọng

```text
Project
  ├─ Chapters
  │    ├─ Revisions ── active flag / baseRevisionId / alignment
  │    └─ Attempts ── runId / executionMode / providerInteractionId hoặc legacy interactionId
  ├─ Runs ── instruction + glossary + model snapshot
  ├─ Automation jobs ── chapterIds + base revisions + snapshot/checkpoints (không resume direct)
  ├─ Translation presets / Editorial presets / Glossary
  └─ Highlights / Fonts / EPUB cover
```

Không dùng prefix làm khóa chính duy nhất: người dùng có thể sửa prefix, còn chapter ID vẫn phải giữ liên kết revisions/attempts.

### 33.4. API công việc AI

| Route | Mục đích |
|---|---|
| `GET /api/runtime` | Tên/version app, người dùng, model bootstrap, server slots, giới hạn code. |
| `POST /api/models` | Catalog model theo credential. |
| `POST /api/credentials/test` | Kiểm tra metadata/key. |
| `POST /api/model-health/check` | Kiểm tra matrix metadata các cặp. |
| `POST /api/interactions` | Direct NDJSON: dịch toàn chương theo blocks-v1. |
| `GET /api/interactions/:id` | Đọc trạng thái/output background legacy, không đọc lại direct. |
| `POST /api/interactions/:id/cancel` | Yêu cầu hủy background legacy. |
| `DELETE /api/interactions/:id` | Xóa interaction legacy khi đã lưu an toàn. |
| `POST /api/editor/interactions` | Direct NDJSON: biên tập toàn chương hoặc target IDs. |
| `POST /api/glossary/extract` | Direct NDJSON: quét thuật ngữ một chương. |

Các route AI kiểm tra user/payload. Key UI ở header, không nằm trong JSON ví dụ. Request đọc/cancel/delete cần thông tin chọn đúng credential; Interaction ID một mình không thay quyền truy cập của key Google.

### 33.5. Các nhóm API cloud

| Route/nhóm | Vai trò |
|---|---|
| `/api/cloud/projects` | Liệt kê/tạo project của owner. |
| `/api/cloud/projects/:id` | Metadata project và xóa theo batch. |
| `.../workspace` | Hai nhóm preset và glossary. |
| `.../chapters` | Metadata/import chương theo batch. |
| `.../content` | Nạp raw/translation và revisions khi yêu cầu. |
| `.../chapters/:chapterId` | Cập nhật chương và commit revision. |
| `.../chapters/:chapterId/source` | Sửa source có chủ đích. |
| `.../chapters/:chapterId/revisions` | Đọc/đổi metadata/xóa revision. |
| `.../chapters/approve` | Duyệt phạm vi đủ điều kiện. |
| `.../chapters/retry` | Đặt lại phạm vi và abandon attempts cũ có kiểm soát. |
| `.../runs`, `.../attempts`, `.../automation-jobs` | Lưu/đọc điều phối và phục hồi. |
| `.../events` | Nhật ký. |
| `.../lease` | Lấy/gia hạn/nhả quyền điều phối. |
| `.../highlights`, `.../fonts`, `.../cover` | Metadata/tài sản đọc và bìa, kèm endpoint file tương ứng. |

Route là giao diện nội bộ ứng dụng, không phải tài liệu hứa một API công khai ổn định cho bên thứ ba. Khi sửa schema cần kiểm tra cả local, cloud, backup và recovery.

### 33.6. Một số giới hạn ứng dụng cần biết

| Giới hạn | Giá trị ở mốc khảo sát | Không được nhầm với |
|---|---:|---|
| Credential slots | 50 | 50 project độc lập được Google xác minh |
| Concurrency dịch/biên tập | 1–10 | Số request chắc chắn `in_progress` |
| Worker quét glossary | Tối đa 5 | Batch size glossary |
| Batch glossary | 1–50, mặc định 20 | Số chương trong một POST duy nhất |
| Tổng submit một vòng chương | 150 | Quota/ngày hoặc tổng suốt đời chương |
| Local raw payload / lưu raw | 4.500.000 ký tự | Context token limit model |
| System instruction payload | 500.000 ký tự | Input token budget thực tế |
| Translation cho request biên tập | 6.000.000 ký tự | Output limit token |
| Custom instruction biên tập | 10.000 ký tự | Kích thước preset |
| File nhập bản dịch ngoài | 10 MiB | Giới hạn cả bộ truyện |
| Font upload | 8 MiB/file | Dung lượng project |
| Ảnh bìa | 20 MiB/file | Hạn mức R2 tổng |
| Workspace cloud | Tối đa 100 preset mỗi nhóm, 20.000 term trong schema | Khả năng gửi cùng số term ở mọi endpoint AI |
| currentTerms trong route quét | Tối đa 5.000 term trước lọc prompt | Số term tham chiếu thật: tối đa 250 khớp raw |
| Output đề xuất glossary | Tối đa 120 term/request | Bảo đảm model tìm đủ mọi term |
| Ngân sách UI project | 128 MiB | Trần lưu thật |
| Cảnh báo gói xuất lớn | Trên khoảng 250 MiB ước tính | Tự động hủy export |

Các giới hạn ký tự và token không quy đổi bằng một tỷ lệ cố định. Request vẫn có thể bị model từ chối dù chưa chạm giới hạn ký tự của app.

### 33.7. Chạy local để dùng hoặc phát triển

Mở PowerShell tại thư mục mã nguồn. Cài dependency theo lockfile lần đầu, sau đó chạy dev:

```powershell
npm ci
npm run dev -- --host 127.0.0.1 --port 3000
```

Có thể dán hai dòng cùng lúc vào PowerShell; chúng chạy lần lượt. Nhưng chỉ cần `npm ci` khi cần cài/khôi phục dependencies, không cần mỗi lần mở ứng dụng.

Lệnh dev là server sống, không kết thúc sau khi hiện URL. Mở **URL thật terminal in ra**. Vinext/Vite có thể compile route khi browser truy cập lần đầu; có dòng log mới lúc mở browser không tự chứng minh server trước đó bị treo.

Giữ nguyên origin dùng dữ liệu local. Nếu port đã bận, kiểm tra đúng server đang chạy trước khi chọn port mới; đổi port tạo kho IndexedDB khác. Không kill toàn bộ Node trên máy một cách mù quáng vì có thể ảnh hưởng công việc khác.

Chỉ nên dùng local mode khi chạy dev nếu chưa thiết lập/kiểm thử đầy đủ DB/BUCKET và migrations của môi trường dev. Localhost không phải quyền truy cập trực tiếp vào cloud production. Dev không nên public ra mạng vì có danh tính fallback phục vụ phát triển.

Ctrl+C dừng server dev. Nó không đồng nghĩa gửi cancel thành công cho mọi interaction Google đã tạo.

### 33.8. Kiểm tra source trước khi build/phát hành

Các script có sẵn:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run verify` chạy chuỗi typecheck, lint, test và build. `npm run start` chạy chế độ production; không được coi là thay thế trực tiếp dev trên localhost vì production đòi xác thực Sites phù hợp.

Lượt cập nhật ngày **25/10/2026** chỉ sửa hai tài liệu Markdown. Đã chạy toàn bộ `npm test`: **414 test qua, 54 file test qua**; có các nhóm direct stream/abort/timeout, queue/quota, 50 credential, state/retry, presets, quality, export và storage.

Lần đầu bị lỗi `EPERM` ở cache tạm Windows sandbox trước khi test chạy. Chạy lại ngoài sandbox thành công; cảnh báo deprecation `module.register()` không phải test failure. Không chỉnh code để bỏ qua test.

Đã kiểm tra liên kết nội bộ/mục lục/code fence, `git diff --check`, phụ lục preset khớp default và hai bản review giữ nguyên phần nội dung cũ. Không dùng key thật/gọi Gemini, không build/deploy website, không chạy EPUBCheck hoặc browser E2E trong lượt này. Không coi test mock thành xác nhận quota/tốc độ hoặc tình trạng production hiện tại.

### 33.9. Hosting và migrations

`.openai/hosting.json` khai báo binding D1 `DB`, R2 `BUCKET` và Sites project ID. `vite.config.ts` nối Vinext, plugin Sites và Cloudflare runtime; không có file `wrangler.jsonc` gốc để mặc định sửa theo một hướng dẫn không thuộc dự án này.

Schema D1 ở `db/schema.ts`, migrations đã lưu trong thư mục `drizzle`; mốc hiện tại có `0008_sudden_dreadnoughts.sql` thêm `auto_update` cho cả hai thư viện preset. Không chạy DDL tạo/đổi bảng tùy tiện trong từng API request; migration là công việc triển khai có chủ đích.

Khi triển khai lại ở Sites:

1. Xác minh đúng tài khoản, đúng project ID và chế độ private/owner-only.
2. Giữ mã nguồn, lockfile và migrations cùng mốc tương thích.
3. Build và kiểm thử trước khi đưa source lên.
4. Đảm bảo có binding DB/BUCKET và áp migration cần thiết theo quy trình hosting.
5. Cấu hình server secrets nếu muốn; để trống vẫn có đường nhập key UI.
6. Không đưa `.env` chứa key, thư mục browser data hay backup truyện vào source package.
7. Kiểm tra deployment thành công và workspace thực tế sau phát hành.
8. Không tự chuyển owner hoặc xóa site cũ để giải quyết lỗi project mới không thấy dữ liệu.

Hướng dẫn này mô tả yêu cầu kiến trúc; không thay quy trình Sites cụ thể của phiên bản công cụ đang được sử dụng sau này.

### 33.9a. Lấy source từ GitHub khác với chuyển dữ liệu truyện

Source nằm ở [repository riêng tư Sefany2723/Xuong-Dich-Han-Viet](https://github.com/Sefany2723/Xuong-Dich-Han-Viet). Cần tài khoản có quyền đọc:

```powershell
git clone https://github.com/Sefany2723/Xuong-Dich-Han-Viet.git
cd Xuong-Dich-Han-Viet
npm ci
npm run dev -- --host 127.0.0.1 --port 3000
```

Không chèn access token/API key vào lệnh hoặc URL. Git clone mang code/preset/tests/migrations, không mang nội dung local, vault, D1/R2 hay server secrets. Muốn chuyển truyện phải backup/import, giữ đúng origin hoặc nạp lại key trên nơi mới.

Push GitHub không tự là phát hành Sites; project ID trong hosting config cũng không cấp quyền site cho tài khoản mới. Kiểm tra deployment riêng khi được yêu cầu. Lượt cập nhật tài liệu này chưa tự push hay deploy.

### 33.10. Cách cập nhật tài liệu sau mỗi lần đổi code

Đổi queue: cập nhật mục 11–16, 28, tests state/retry/control. Đổi preset/protocol: cập nhật mục 8, 12, 21, preset tương ứng và tests compatibility. Đổi storage/schema: cập nhật mục 4–5, 25, 33 và thử backup/recovery. Đổi validator/export: cập nhật mục 22–24 và bảng policy.

Luôn ghi ngày/commit mới. Không chỉ tăng version app rồi giả định mọi đoạn README đều đã đúng. Các câu có chữ “luôn”, “không bao giờ”, “tất cả” phải đối chiếu các nhánh lỗi/legacy trước khi giữ lại.

<a id="doi-chieu"></a>
## 34. Bảng thay đổi so với kế hoạch cũ và bản đồ mã nguồn

### 34.1. Những điểm không nên sao chép nguyên từ PLAN/README cũ

| Mô tả cũ | Hiện trạng cần dùng khi tái triển khai |
|---|---|
| Chỉ năm model khóa cứng | Catalog metadata + alias, lọc model văn bản phù hợp. |
| Model mạnh hết 10 key thì hạ model | 50 slot, khóa model, chỉ xoay key. |
| Key UI chỉ ở memory | Key UI có vault AES-GCM theo project trong IndexedDB. |
| Stable v1, preview v1beta | Transport hiện dùng v1beta cho Interactions. |
| Input dịch là raw string nguyên file | Raw toàn chương được đóng gói JSON blocks theo ID; vẫn một interaction/chương. |
| Dịch trả một string/translation chung | Dịch mới trả mảng blocks-v1; full editorial vẫn wrapped translation. |
| Output contract văn phong cố định trong preview | Preset văn phong do người dùng quản lý; wire/schema vẫn bắt buộc theo tác vụ. |
| Các trạng thái kỹ thuật đều là badge chính | Sáu trạng thái chương; runtime phase và attempt giữ chi tiết riêng. |
| Đang chạy chỉ đếm in_progress | Đếm pha gửi/provider queue/chạy/lưu/ngắt, observer reconnect chỉ legacy; không đếm chờ key/quota/pause. |
| Tạo background rồi poll mọi tác vụ mới | Direct background:false/store:false/stream:true; không lấy lại output sau reload, GET chỉ legacy. |
| Timeout tự coi đã hủy | Timeout direct là failed; user Ngắt có cancelled phía app nhưng không khẳng định Google hủy. |
| Dịch lại chỉ reset chapter | Có xử lý cả attempts cũ, xác nhận bỏ theo dõi và chặn kết quả muộn. |
| Nối lại mọi job sau reload | Chỉ legacy; GET không tạo lại ID cũ nhưng job legacy có thể gửi tiếp phần chưa chạy. |
| Revision mới nhất luôn active | Có guard manual/pinned/base/raw/quality và tùy chọn auto-active AI EDIT. |
| Năm revision là trần tuyệt đối | Chỉ dọn AI thường; manual/pinned/active được bảo vệ theo quy tắc. |
| Duyệt xóa warning | Duyệt giữ warning, đổi review state. |
| Chỉ chương Hoàn thành mới xuất | Policy + nội dung/title/order/phạm vi; có thể dùng active cũ khi lượt mới lỗi. |
| Hán và tiếng Anh là hai filter riêng | Một filter OR Hán/But; But là tín hiệu trực tiếp, không detector tiếng Anh tổng quát. |
| Toàn bộ glossary được lọc theo raw | Chỉ context của quét glossary lọc như vậy; dịch/biên tập dùng enabled terms. |
| 20 chương/lô là một request quét | Một request quét/chương; batch phục vụ snapshot/pipeline. |
| 128 MB là trần project | Ngân sách cảnh báo/ước tính UI, không phải trần cứng. |
| Backup mang đủ mọi thứ để nối lại AI | Backup nội dung/cấu hình, không mang key hay đầy đủ attempts/jobs. |
| Cloud delete xóa một lần rồi mở project khác | Batch R2 + tombstone + dọn metadata/cache, có tiếp tục xóa. |
| Tìm/replace mỗi lần lưu revision | Chỉ sửa draft; bấm Lưu mới tạo manual revision. |
| Chờ quota nằm ngủ trong từng worker | Hàng đợi dịch yield pending; 5 phút kẹt quota không tiến triển thì tự pause, không hạ model. |
| Mọi preset import giống default đều bị nâng cấp | Import/duplicate autoUpdate:false, giữ nội dung và cờ qua reload/cloud/backup. |
| File review mới tự thay preset mặc định | Default vẫn cô đọng 1.14.1; backup và bản dài + mục16 chỉ dùng khi user import/chọn. |

### 34.2. Bản đồ mã nguồn để kiểm chứng

Các liên kết dưới đây trỏ tới file đang tồn tại trong repository; số dòng có thể đổi sau khi sửa code.

| Chủ đề | Nguồn chính |
|---|---|
| Kiểu dữ liệu, defaults, parser, validator, phân loại lỗi | [lib/domain.ts](../lib/domain.ts) |
| Điều phối tổng, UI, import, queue, recovery, save, export | [app/TranslatorStudio.tsx](../app/TranslatorStudio.tsx) |
| Catalog/alias | [lib/model-catalog.ts](../lib/model-catalog.ts) |
| Chọn/giữ key, submit gate | [lib/scheduler.ts](../lib/scheduler.ts) |
| Payload dịch | [lib/gemini-request.ts](../lib/gemini-request.ts) |
| Transport SDK/metadata/output/error | [lib/server/gemini.ts](../lib/server/gemini.ts) |
| Direct stream/deadline/abort và output accumulator | [lib/direct-ai.ts](../lib/direct-ai.ts), [lib/interaction-stream.ts](../lib/interaction-stream.ts) |
| Poll/điều khiển chỉ dành cho legacy | [lib/interaction-lifecycle.ts](../lib/interaction-lifecycle.ts) |
| Structured translation | [lib/translation-blocks.ts](../lib/translation-blocks.ts) |
| Căn block/target cleanup | [lib/aligned-editor.ts](../lib/aligned-editor.ts) |
| Queue stop/refill và pending/quota watch | [lib/translation-queue-policy.ts](../lib/translation-queue-policy.ts), [lib/translation-dispatch.ts](../lib/translation-dispatch.ts) |
| Attempt retry/abandon/cleanup | [lib/translation-retry.ts](../lib/translation-retry.ts) |
| Main state và checkpoint | [lib/task-state.ts](../lib/task-state.ts), [lib/task-recovery.ts](../lib/task-recovery.ts) |
| Runtime activity/counts | [lib/ai-activity.ts](../lib/ai-activity.ts) |
| Background work/coalescing | [lib/async-control.ts](../lib/async-control.ts) |
| Badge/filter trạng thái | [lib/chapter-status.ts](../lib/chapter-status.ts) |
| Chọn phạm vi/dịch lại | [lib/chapter-actions.ts](../lib/chapter-actions.ts) |
| Nội dung hai preset mặc định | [lib/flash-presets.ts](../lib/flash-presets.ts) |
| Instruction dịch mặc định/migration | [lib/default-instruction.ts](../lib/default-instruction.ts) |
| Instruction biên tập mặc định/migration | [lib/default-editorial-instruction.ts](../lib/default-editorial-instruction.ts) |
| Prompt/schema editorial | [lib/editorial.ts](../lib/editorial.ts) |
| Guard auto-active | [lib/editorial-activation.ts](../lib/editorial-activation.ts) |
| Glossary extraction/merge | [lib/glossary-automation.ts](../lib/glossary-automation.ts) |
| Tìm/thay thế/search | [lib/editor-tools.ts](../lib/editor-tools.ts) |
| Import bản dịch hoàn chỉnh | [lib/translation-import.ts](../lib/translation-import.ts), [app/TranslationImportDialog.tsx](../app/TranslationImportDialog.tsx) |
| Lưu raw | [lib/source-editor.ts](../lib/source-editor.ts) |
| Active revision helper | [lib/revisions.ts](../lib/revisions.ts) |
| Quality filter/But | [lib/quality.ts](../lib/quality.ts), [lib/text-signals.ts](../lib/text-signals.ts), [app/QualitySection.tsx](../app/QualitySection.tsx) |
| Điều kiện xuất | [lib/publishing.ts](../lib/publishing.ts) |
| TXT/ZIP/EPUB/backup | [lib/exporters.ts](../lib/exporters.ts), [app/export-worker.ts](../app/export-worker.ts) |
| Reader | [app/ReaderSection.tsx](../app/ReaderSection.tsx), [app/reader-search-worker.ts](../app/reader-search-worker.ts) |
| Font/highlight/cover | [lib/reader-fonts.ts](../lib/reader-fonts.ts), [lib/reader-highlights.ts](../lib/reader-highlights.ts), [lib/epub-cover.ts](../lib/epub-cover.ts) |
| Local database | [lib/local-db.ts](../lib/local-db.ts) |
| Vault | [lib/key-vault.ts](../lib/key-vault.ts), [lib/key-vault-crypto.ts](../lib/key-vault-crypto.ts) |
| Auth/server slots | [lib/server/auth.ts](../lib/server/auth.ts), [lib/server/credentials.ts](../lib/server/credentials.ts) |
| Cloud database/object storage | [lib/server/cloud-store.ts](../lib/server/cloud-store.ts), [db/schema.ts](../db/schema.ts) |
| Bootstrap/request/delete project | [lib/workspace-bootstrap.ts](../lib/workspace-bootstrap.ts), [lib/workspace-request.ts](../lib/workspace-request.ts), [lib/project-deletion.ts](../lib/project-deletion.ts) |
| Ước tính dung lượng | [lib/project-storage.ts](../lib/project-storage.ts) |
| Runtime/build | [package.json](../package.json), [vite.config.ts](../vite.config.ts), [.openai/hosting.json](../.openai/hosting.json) |
| Tóm tắt kiến trúc trạng thái | [docs/task-state.md](task-state.md) |

### 34.3. Phạm vi kiểm chứng của tài liệu

Nội dung được đối chiếu với các module, route và nhánh UI tại mốc source đầu tài liệu; kết quả kiểm thử cập nhật ghi tại mục 33.8. Không dùng API key thật, không tạo request dịch/biên tập/quét có trả phí, không chỉnh sửa nội dung người dùng, không phát hành lại website.

Khi có khác biệt giữa mô tả và một phiên bản code về sau, cần lấy code/test của phiên bản đó làm căn cứ và cập nhật tài liệu. Không lấy câu trả lời trong hội thoại cũ làm ràng buộc lấn át một thay đổi đã được người dùng yêu cầu triển khai sau đó.

---

**Tóm tắt vận hành:** chọn dự án/model/preset → chọn đúng chương → một POST stream toàn chương theo ID → nhận terminal và lưu revision có kiểm tra → xử lý warning/active → duyệt theo mức chấp nhận → xuất theo policy → backup và xử lý đồng bộ. Direct gián đoạn thì thử mới có chủ đích; nối lại/cleanup chỉ cho legacy. Mỗi bước có trách nhiệm riêng; gộp chúng thành một nhãn “xong” sẽ làm mất những thông tin cần thiết để vận hành an toàn.





