# WPS AI Smart Translation Plugin

> 🚀 一款基于 WPS Web Add-in 框架的 AI 智能翻译插件，支持一键全文中译英，精准保留加粗、斜体、颜色、下划线等富文本格式。

---

## 功能特性

- ✅ **一键全文翻译**：点击功能区按钮，自动翻译整篇文档
- ✅ **格式精准保留**：加粗、斜体、颜色、下划线、删除线，翻译后原样保留
- ✅ **实时进度显示**：段落计数 + 进度条，翻译过程一目了然
- ✅ **随时取消**：可随时中断翻译进程
- ✅ **一键撤销**：翻译结果不满意，一键恢复原文
- ✅ **智能分块**：长文档自动分块处理，避免 Token 超限
- ✅ **上下文一致性**：前后批次传递翻译上下文，确保术语统一
- ✅ **容错降级**：标签丢失时自动重试（最多3次），最终降级为纯文本翻译

---

## 项目结构

```
wps_translate_plugin/
├── client/                    # WPS 插件前端
│   ├── index.html             # 插件宿主页面
│   ├── main.js                # 功能区控制器
│   ├── ribbon.xml             # WPS 功能区定义
│   ├── taskpane.html          # 任务面板 UI
│   ├── taskpane.css           # 样式
│   ├── taskpane.js            # 核心翻译引擎
│   ├── util.js                # 工具函数（标签解析、颜色转换等）
│   └── package.json           # 插件 Manifest
│
└── server/                    # Node.js 后端服务
    ├── server.js              # Express 入口
    ├── package.json
    ├── .env.example           # 环境变量模板
    ├── routes/
    │   └── translate.js       # 翻译路由（重试 + 降级逻辑）
    ├── services/
    │   └── llm.js             # LLM 客户端 + Prompt 工程 + 标签校验
    └── utils/
        └── chunker.js         # 分块计算工具
```

---

## 快速上手

### 1. 后端服务

```bash
cd server/
cp .env.example .env
# 编辑 .env，填入你的 LLM API Key
```

**.env 关键配置**：
```env
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL=qwen-plus
PORT=3000
```

> 支持任何 OpenAI 兼容 API：阿里云 DashScope (Qwen)、OpenAI、等。

```bash
npm install
npm run dev    # 开发模式（nodemon 热重载）
npm start      # 生产模式
```

验证服务是否正常：
```bash
curl http://localhost:3000/api/health
# {"status":"ok","model":"qwen-plus","timestamp":"..."}
```

### 2. WPS 插件安装

1. 打开 WPS Office
2. 进入**插件管理** → **本地插件** → 选择 `client/package.json`
3. 功能区会出现 **"AI Translation"** 选项卡
4. 点击 **"Translate Full Document"** 打开任务面板

---

## 技术架构

```
WPS 客户端插件 (HTML/CSS/JS)
    │
    │  序列化：段落 → <r1>标签文本</r1>
    │  HTTP POST
    ▼
Node.js 中间件服务 (Express)
    │  - 标签校验 + 指数退避重试（最多3次）
    │  - 降级模式（剥离标签返回纯文本）
    │  - OpenAI 兼容 API 调用
    ▼
大语言模型 (Qwen / GPT-4o / Claude)
    │  精确保留 XML 标签的高质量翻译
    ▼
Node.js 中间件服务
    │
    │  HTTP 200 响应
    ▼
WPS 客户端插件
    │  反序列化：<r1>cloud computing</r1> → 写入文档 + 恢复格式
    ▼
翻译完成，格式完整
```

---

## API 接口

### `GET /api/health`
健康检查。

### `POST /api/v1/translate/document-chunk`
翻译一个文档块（多个段落）。

**请求体**：
```json
{
  "documentId": "doc_xxx",
  "chunkIndex": 0,
  "context": "上一批次最后一段的翻译结果（可选）",
  "payload": [
    {
      "paragraphId": "p_001",
      "text": "本协议由<r1>甲方</r1>与<r2>乙方</r2>签署。",
      "styleDictionary": {
        "r1": { "bold": true, "color": "#FF0000" },
        "r2": { "bold": true, "underline": true }
      }
    }
  ]
}
```

**响应**：
```json
{
  "status": "success",
  "chunkIndex": 0,
  "results": [
    {
      "paragraphId": "p_001",
      "translatedText": "This agreement is signed by <r1>Party A</r1> and <r2>Party B</r2>.",
      "tagValidation": true
    }
  ]
}
```

---

## V1.0 范围说明

| 功能 | V1.0 状态 |
|---|---|
| 正文段落翻译 | ✅ 支持 |
| 富文本格式保留（加粗/斜体/颜色/下划线/删除线）| ✅ 支持 |
| 进度条 + 取消 + 撤销 | ✅ 支持 |
| 表格内容翻译 | ❌ 暂不支持（自动跳过）|
| 页眉/页脚 | ❌ 暂不支持（自动跳过）|
| 公式 / 图片 | ❌ 暂不支持 |
| 用户鉴权 / 限流 | ❌ 暂不支持 |
