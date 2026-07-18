# KientreAAA context

- Repo: `/Users/nguyenthaivuong/KientreAAA`
- Local app: `http://localhost:3100`
- Engine: `kientre-engine/`

## Core rules
- Quiz module: có tài liệu/NotebookLM thì bám nguồn; không có thì tự soạn.
- Skills = prompt-pack dài, không phải tool list.
- Agent phải ưu tiên `run_skill`, không lạc sang flow ngắn.
- Chat chỉ nên hiện process flow/sub-agent, không dump raw tool output dài.
- NotebookLM có toggle bật/tắt trên composer.

## Done
- Composer đổi sang nút chức năng theo module.
- Quiz settings đưa ra ngoài composer.
- Tab Skills redesign: prompt dài, module áp dụng, `agentFlow`.
- Skills hiện thành nút bấm cho người dùng, không cần gõ lệnh `/`.
- NotebookLM header bỏ badge số lớn; có bar trên composer khi bật.
- Có thể bỏ tick để không dùng NotebookLM.
- Agent chat dùng process bar ngang theo sub-agent.
- Agent flow bị ép theo module/skill và ưu tiên `run_skill`.

## Important files
- `src/app/page.tsx`
- `src/app/globals.css`
- `src/app/api/agent/route.ts`
- `src/app/api/skills/route.ts`
- `src/lib/defaultSkills.ts`
- `kientre-engine/agent/loop.mjs`
- `scripts/probe-agent-flow.mjs`

## Verify
- `npm run typecheck`
- `npm run build`
- `node scripts/probe-agent-flow.mjs`

## Notes for next chat
- Test flow thực tế của quiz/topic/solve/review với dữ liệu thật.
- Nếu UI cũ còn hiện: restart server rồi hard refresh.
