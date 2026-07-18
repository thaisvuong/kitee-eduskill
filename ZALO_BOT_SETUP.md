# Zalo bot riêng cho Kientre / profile `cmkitee`

## Kết nối hiện tại

Profile `cmkitee` đã được cấu hình để kết nối bot Zalo cá nhân theo cùng kiểu profile chính: **Zalo Bot Creator / Bot Platform**, dùng duy nhất một token dạng `numeric_id:secret`.

Không dùng Zalo OA flow. Không cần app secret. Không cần public callback để nhận tin nhắn nếu dùng long-polling.

API được adapter dùng:

```text
https://bot-api.zaloplatforms.com/bot<TOKEN>/<method>
```

Các method chính:

```text
getMe
getUpdates
sendMessage
sendChatAction
```

## Vị trí token

Token thật nằm trong file bảo mật profile-local:

```text
/Users/nguyenthaivuong/.hermes/profiles/cmkitee/.env
```

Biến môi trường:

```env
ZALO_BOT_TOKEN=...
```

Bản tham chiếu trong workspace:

```text
/Users/nguyenthaivuong/Desktop/HermesWorkSpace/Kientre/zalo-bridge/.env
```

Không commit, không gửi token qua chat.

## Plugin adapter

Plugin riêng của profile:

```text
/Users/nguyenthaivuong/.hermes/profiles/cmkitee/plugins/zalo/
```

Các file chính:

```text
plugin.yaml
adapter.py
__init__.py
```

Config profile:

```text
/Users/nguyenthaivuong/.hermes/profiles/cmkitee/config.yaml
```

Đoạn liên quan:

```yaml
plugins:
 enabled:
  - zalo
platforms:
 zalo:
  enabled: true
  extra:
   poll_timeout: 30
zalo_bot:
 enabled: true
 mode: bot_creator_polling
 api_base: https://bot-api.zaloplatforms.com
```

## Xác minh đã chạy

Đã kiểm tra token bằng `getMe`:

```text
ok: true
bot: Bot Kiến Chuyên môn
account_type: BASIC
```

Đã kiểm tra long-poll `getUpdates`:

```text
HTTP 200
ok: false
error_code: 408
description: Request timeout
```

`408 Request timeout` ở đây là trạng thái bình thường khi chưa có tin nhắn mới.

Gateway profile `cmkitee` đã chạy thủ công bằng:

```bash
hermes -p cmkitee gateway run --force
```

Log xác nhận:

```text
Connecting to zalo...
[zalo] Connected bot Bot Kiến Chuyên môn (BASIC)
✓ zalo connected
```

## Bảo mật / allowlist

Hiện đang bật tạm:

```env
ZALO_ALLOW_ALL_USERS=true
```

Sau khi bạn gửi tin nhắn thử vào bot và log ghi nhận Zalo user ID/chat ID, nên đổi sang:

```env
ZALO_ALLOW_ALL_USERS=false
ZALO_ALLOWED_USERS=<zalo-user-id-của-bạn>
```

rồi restart gateway.

## Webhook bridge cũ

Route webhook cũ vẫn có thể dùng làm fallback:

```text
http://127.0.0.1:8754/p/cmkitee/webhooks/zalo-kientre
```

Nhưng với token dạng `numeric_id:secret`, cách đúng hiện tại là adapter long-polling `bot_creator_polling` ở trên.
