export type SkillDef = {
 id: string
 name: string
 description: string
 systemPrompt: string
 guidance: string
 appliesTo: string[]
 enabled: boolean
 agentFlow?: string[]
}

export const SKILL_FLOWS = {
 topic: ['Intent', 'Architect', 'Source/NotebookLM', 'Judge', 'VisualCurator', 'Artist', 'Student', 'Reviewer', 'Word'],
 quiz: ['Intent', 'Architect', 'QuizPlanner', 'Examiner', 'Judge', 'Word'],
 test: ['Intent', 'Examiner', 'Judge', 'Reviewer', 'Word'],
 solve: ['Read/Extract', 'Solver', 'Judge', 'Reviewer', 'Word'],
 review: ['Read/Extract', 'Reviewer', 'Judge', 'Word'],
}

export const DEFAULT_SKILLS: SkillDef[] = [
 { id: 'websearch-first', name: 'WebSearch ưu tiên', description: 'Ưu tiên tìm tài liệu/bài tập thật trên web trước khi tự soạn', systemPrompt: 'Khi task soạn mới không có NotebookLM/tài liệu nguồn riêng, phải ưu tiên gọi web_search để tìm nguồn tài liệu, ví dụ, dạng bài, bài tập thật trên web. Chỉ tự soạn sau khi đã có nguồn web hoặc web_search thất bại. Nguồn web chỉ là tham khảo; Judge vẫn phải kiểm đúng lớp, đúng đáp án, không sao chép nguyên văn.', guidance: 'Áp dụng cho topic/test. Tool cần bật: web_search.', appliesTo: ['topic', 'test'], agentFlow: ['Source/NotebookLM'], enabled: true },
 { id: 'slash-es-create', name: '/es-create', description: 'Soạn chuyên đề đầy đủ (lý thuyết + ví dụ + bài tập + đáp án)', systemPrompt: 'Quy trình /es-create là flow đầy đủ, không phải tóm tắt. Bắt buộc gọi đủ chuỗi sub-agent: Intent đọc yêu cầu → Architect lập khung kiến thức/mục tiêu/ràng buộc lớp → Source/NotebookLM/WebSearch lấy nguồn nếu có, ưu tiên nguồn tài liệu và bài tập thật trên mạng khi không có NotebookLM → Judge kiểm ranh giới chương trình, độ đúng, không vượt lớp → VisualCurator quyết định hình minh hoạ nếu cần → Artist tạo hình/TikZ hoặc lấy ảnh thật từ web/Openverse/Wikimedia nếu phù hợp → Student ước lượng độ khó/thời lượng → Reviewer rà soát lỗi kiến thức/đáp án/trình bày → Word xuất file .docx. Kết quả phải có lý thuyết rõ, ví dụ mẫu, bài tập phân tầng, đáp án/lời giải, và ghi chú dạy học nếu phù hợp.', guidance: '/es-create <chủ đề> [lớp N] [môn] [--summary] [--special "..."]', appliesTo: ['topic'], agentFlow: SKILL_FLOWS.topic, enabled: true },
 { id: 'slash-es-quiz', name: '/es-quiz', description: 'Soạn quiz bằng flow tối giản Architect → QuizPlanner → Examiner → Judge', systemPrompt: 'Quy trình quiz là pipeline riêng, tối giản, KHÔNG dùng pipeline soạn chuyên đề, KHÔNG viết lý thuyết, KHÔNG tạo ví dụ hàng loạt. Sub-agent bắt buộc theo đúng thứ tự: Intent đọc yêu cầu (đọc quizCount/totalScore/timeMinutes/grade/subject/topic) → Architect (HERMES_ARCHITECT_MODEL) chốt ranh giới kiến thức TUYỆT ĐỐI, mục tiêu, danh sách thuật ngữ CẤM DÙNG theo lớp → QuizPlanner (model mạnh) CHỈ lập KHUNG dạng bài cho từng câu (loại câu, điểm, dạng bài, dữ kiện dự kiến, bẫy, năng lực), TUYỆT ĐỐI không viết đề bài hoàn chỉnh, không tạo đáp án/lời giải/hints, PHẢI tôn trọng ranh giới Architect → Examiner (model khá) biến mỗi dạng bài trong khung.md thành câu hỏi hoàn chỉnh: chọn số liệu cụ thể, viết đề, tạo đáp án, hints, lời giải; phải giữ đúng loại câu, trắc nghiệm mới có A/B/C/D, điền đáp án và tự luận không được có đáp án dạng A/B/C/D; TUYỆT ĐỐI không dùng thuật ngữ/phương pháp vượt ranh giới Architect → Judge kiểm ranh giới lớp, đáp án, tổng điểm, đúng số quiz/số câu, so với ranh giới Architect → Word xuất file. TUYỆT ĐỐI KHÔNG dùng BCNN/bội chung nhỏ nhất/mẫu số chung nhỏ nhất/số nguyên tố cùng nhau cho Lớp 5. Không dùng phép chia phân số cho Lớp 5. QuizPlanner phải kiểm tra từng dạng bài được giao có vi phạm ranh giới Architect không TRƯỚC KHI ghi vào khung.md. Examiner phải kiểm tra ranh giới Architect TRƯỚC KHI viết câu hỏi. Số quiz LUÔN đúng bằng quizCount từ UI.', guidance: 'Dùng module quiz với số quiz/tổng điểm/thời gian trên composer. Tool run_skill phải dùng skill="quiz" và truyền quizCount/totalScore/timeMinutes.', appliesTo: ['quiz'], agentFlow: SKILL_FLOWS.quiz, enabled: true },
 { id: 'slash-es-test', name: '/es-test', description: 'Soạn đề kiểm tra (trắc nghiệm + điền + tự luận) kèm biểu điểm', systemPrompt: 'Quy trình /es-test là flow đề kiểm tra hoàn chỉnh. Bắt buộc sub-agent: Intent → Examiner lập cấu trúc đề/ma trận/câu hỏi → Judge kiểm đáp án, mức độ, ranh giới lớp → Reviewer rà chất lượng, biểu điểm, lỗi trình bày → Word xuất file .docx. Đề phải có trắc nghiệm, điền đáp án, tự luận nếu bật; có đáp án và biểu điểm rõ.', guidance: '/es-test [chủ đề] [lớp N] [môn] [mc=10] [fill=5] [essay=3] [diem=6]', appliesTo: ['test'], agentFlow: SKILL_FLOWS.test, enabled: true },
 { id: 'slash-es-solve', name: '/es-solve', description: 'Giải chi tiết mọi câu trong tài liệu', systemPrompt: 'Quy trình /es-solve phải chạy đầy đủ, không tóm tắt. Bắt buộc sub-agent: Read/Extract đọc toàn bộ tài liệu → Solver giải từng câu đầy đủ bước → Judge kiểm đáp án/đơn vị/ràng buộc lớp → Reviewer rà lỗi và độ rõ → Word xuất file. Không bỏ câu; nếu file có ảnh/sơ đồ/bảng phải phân tích nội dung nhìn thấy nếu trích xuất được; lời giải phải đủ chi tiết để học sinh hiểu.', guidance: '/es-solve <đường dẫn tài liệu> [lớp N] [môn]', appliesTo: ['solve'], agentFlow: SKILL_FLOWS.solve, enabled: true },
 { id: 'slash-es-review', name: '/es-review', description: 'Nhận xét / thẩm định tài liệu (điểm mạnh, lỗi, cải thiện)', systemPrompt: 'Quy trình /es-review phải chạy đầy đủ. Bắt buộc sub-agent: Read/Extract đọc tài liệu → Reviewer nhận xét cấu trúc, độ phù hợp, lỗi → Judge kiểm sai kiến thức/vượt lớp/đáp án → Word xuất báo cáo. Báo cáo phải nêu điểm mạnh, lỗi cụ thể, mức nghiêm trọng, cách sửa, và khuyến nghị cải thiện.', guidance: '/es-review <đường dẫn tài liệu> [lớp N] [môn]', appliesTo: ['review'], agentFlow: SKILL_FLOWS.review, enabled: true },
 { id: 'slash-help', name: '/help', description: 'Xem hướng dẫn các lệnh', systemPrompt: 'Dùng /help khi cần xem hướng dẫn lệnh.', guidance: '/help', appliesTo: ['topic', 'quiz', 'test', 'solve', 'review'], agentFlow: ['Intent'], enabled: true },
]

export function withDefaultSkills(items: SkillDef[]) {
 const byId = new Map(items.map(x => [x.id, x]))
 return [...DEFAULT_SKILLS.map(s => ({ ...s, ...(byId.get(s.id) || {}) })), ...items.filter(x => !DEFAULT_SKILLS.some(s => s.id === x.id))]
}
