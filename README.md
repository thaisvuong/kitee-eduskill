# KientreAAA — cài đặt 1 lệnh

Ứng dụng web soạn tài liệu/đề kiểm tra/lời giải/nhận xét bằng AI. Bạn chỉ cần:
- 1 máy Mac/Linux có internet
- 1 API key (OpenRouter/OpenAI/Gemini/Claude — chỉ cần **1** cái)

## Cài đặt (1 lệnh)

```bash
git clone https://github.com/thaisvuong/kientreaaa.git
cd kientreaaa
./install.sh
```

Script sẽ:

1. Cài **Node.js 22 LTS** (nếu chưa có)
2. Cài **9router** — cổng LLM để nhập key AI
3. Cài & build **Kientre web app**
4. Mở trình duyệt vào giao diện 9router để bạn dán API key
5. Khởi động Kientre tại `http://localhost:3100`

## Sau khi cài xong

- Cần chạy lại: `npm start`
- Đổi cấu hình: sửa `.env.local` rồi khởi động lại
- Cập nhật code mới: `git pull && npm run build`

## Yêu cầu

- macOS hoặc Linux (Windows dùng WSL2)
- Có kết nối internet
- Có ít nhất 1 API key hợp lệ (miễn phí OpenRouter cũng chạy được)

## Giấy phép

MIT
