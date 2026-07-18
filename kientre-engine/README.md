# 📚 Sub-Hermes — Hướng dẫn sử dụng

Hệ thống soạn tài liệu giáo dục tiểu học đa tác tử (Multi-Agent).

Thư mục: `~/Desktop/Hermes/Sub-Hermes/`

---

## 🚀 Cách dùng nhanh (Slash Commands)

### Mở Terminal, gõ:

```bash
cd ~/Desktop/Hermes/Sub-Hermes
node slash.mjs "/topic Phép nhân lớp 3 toán"
```

### 4 lệnh chính:

| Bạn muốn | Gõ |
|----------|----|
| Soạn **chuyên đề** (lý thuyết + ví dụ + bài tập + đáp án) | `node slash.mjs "/topic <chủ đề> lớp <N> <môn>"` |
| Soạn **đề kiểm tra** (trắc nghiệm + điền + tự luận) | `node slash.mjs "/test <chủ đề> lớp <N> <môn> mc=10 fill=5 essay=3"` |
| **Giải bài** trong file có sẵn (docx/pdf) | `node slash.mjs "/solve <đường dẫn file> lớp <N> <môn>"` |
| **Nhận xét** / thẩm định tài liệu | `node slash.mjs "/review <đường dẫn file> lớp <N> <môn>"` |

### Ví dụ thực tế:

```bash
node slash.mjs "/topic Phân số lớp 4 toán"
node slash.mjs "/topic Chu vi hình chữ nhật lớp 4 toán --summary"
node slash.mjs "/test lớp 5 toán mc=12 fill=4 essay=3"
node slash.mjs "/solve ~/Desktop/de_kiem_tra.docx lớp 4 toán"
node slash.mjs "/review ~/Desktop/bai_tap.docx lớp 4"
```

### Mẹo hay:

- **--summary**: Soạn nhanh (ít lý thuyết, nhiều bài tập)
- **mc= / fill= / essay=**: Số câu trắc nghiệm / điền / tự luận trong đề
- **Alias tiếng Việt**: `/soan` = `/topic`, `/de` = `/test`, `/giai` = `/solve`, `/nhanxet` = `/review`
- **Không ghi gì thêm**: Chạy `node slash.mjs` để vào chế độ **trò chuyện** gõ lệnh liên tục

---

## ⚙️ Cách dùng cũ (CLI)

Nếu quen dùng `cli.mjs`:

```bash
node cli.mjs compose "Phân số" "Lớp 4" "Toán"
node cli.mjs exam '{"grade":"Lớp 5","subject":"Toán","mc":10,"fill":5,"essay":3}'
node cli.mjs solve ~/Desktop/de.docx "Lớp 4" "Toán"
node cli.mjs review ~/Desktop/bai.docx "Lớp 4"
```

---

## 📂 Kết quả ở đâu?

Sau khi chạy xong, tài liệu nằm ở:

```
~/Desktop/Hermes/Sub-Hermes/output/G4_2026-xx-xx_chu-de/
├── G4_..._chu-de.docx      ← Phiếu học tập
├── G4_..._LoiGiai.docx      ← Đáp án riêng
├── final.md           ← Bản markdown
└── images/            ← Ảnh minh họa (nếu có)
```

Tôi thường copy vào `~/Desktop/HermesWorkspace/Sub-Hermes-KetQua/` để tiện xem.

---

## 🤖 Các Agent tham gia

| Agent | Làm gì? |
|-------|---------|
| **Architect** | Lên kế hoạch, chia bài thành các phần nhỏ |
| **Judge** | Kiểm tra kiến thức có đúng lớp, vượt cấp không (rất khắt khe!) |
| **Student** | Giả làm học sinh, ước lượng thời gian làm bài |
| **Artist** | Vẽ hình toán học (TikZ) — cần LaTeX |
| **ImageFetcher** | Tìm ảnh minh họa trên mạng (Openverse, Wikimedia) |
| **Word Designer** | Thiết kế file Word chuyên nghiệp kiểu Ki-Tee |

---

## 💡 Lưu ý quan trọng

1. **Chậm do rate-limit**: Model Gemini free-tier hay bị giới hạn, nhưng hệ thống tự động thử lại. Kiên nhẫn chờ ~1-3 phút.
2. **Ảnh minh họa**: Chủ đề cụ thể (con vật, cây cối) → ảnh đẹp. Chủ đề trừu tượng (hình học, biểu đồ) → cần Artist vẽ = cần LaTeX.
3. **LaTeX (tự vẽ hình)**: Nếu chưa cài, chạy lệnh sau (cần mật khẩu máy Mac):
  ```bash
  sudo installer -pkg /opt/homebrew/Caskroom/basictex/2026.0301/mactex-basictex-20260301.pkg -target /
  eval "$(/usr/libexec/path_helper)"
  sudo tlmgr update --self && sudo tlmgr install pgf standalone dvipng preview
  ```
4. **Lỗi Python**: Nếu gặp lỗi `ImportError`, hệ thống đã được sửa để tự động chọn Python 3.12 và chạy với môi trường sạch.
