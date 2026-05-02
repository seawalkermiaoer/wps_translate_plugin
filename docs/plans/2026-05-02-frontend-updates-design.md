# WPS 翻译插件前端更新设计规范 (2026-05-02)

## 1. 概述
对现有的 WPS 翻译插件进行前端改造，增加多语言 UI 支持、修改文案、引入多模式翻译（全文 vs 单页）以及强化 API 协议中的项目配置标识。本次更新仅修改前端页面及 API 通信数据结构，暂不修改 Node.js 后端核心逻辑。

## 2. 国际化 (i18n) 设计
- **判定机制**：使用 WPS JSAPI 的 `wps.Application.Language` 来判断客户端语言。
  - 如果语言代码为 `2052` (中文简体)，则启动中文 UI。
  - 否则回退到默认的英文 UI。
- **渲染策略**：在 `taskpane.js` 中维护一个全局字典 `i18nDict`，页面加载时通过查询特定 class 或 id 的 DOM 元素批量替换其 `textContent`。

## 3. 界面文案修改
- 移除大标题中的 "Powered by LLM"。
- 主标题统一定义为 "AI Smart Translation"（英文）和 "AI 智能翻译"（中文）。

## 4. 新增「翻译单页」模式
### 4.1 UI 布局
- 在配置面板下方提供两种翻译模式的入口。
- **模式 A（全文）**：保留原本的蓝色主按钮，配以全文图标。
- **模式 B（单页）**：新增一行布局，左侧为页码输入框（`<input type="number" min="1">`，默认值 1），右侧为次级按钮「翻译指定页」，配以单页图标。
- 两个按钮均绑定到核心的启动函数，但传入不同的 `mode` 参数。

### 4.2 WPS 页面获取策略
- 目前 `serializeParagraph` 是按文档的所有段落遍历的。
- 引入新的判断：通过 `paragraph.Range.Information(wps.Enum.wdActiveEndPageNumber)` 获取该段落所在的页码。
- 如果当前为单页模式，且段落所在页码不等于目标页码，则 `shouldSkipParagraph` 视其为 true，跳过该段落。

## 5. 完善配置项与 API Payload
### 5.1 Project ID 输入框
- 在原本的 Backend URL 下方增加 Project ID 的文本输入框。
- **必填校验**：在触发翻译前拦截校验，如果 Project ID 为空，则飘红提示用户 "Project ID is required" / "请输入项目 ID"，并终止翻译。

### 5.2 API 协议升级
- `taskpane.js` 中的 `sendTranslationRequest` 将在 payload 的顶层补充以下字段：
  - `projectId` (string)：用户填写的 Project ID。
  - `mode` (string)：`"full_document"` 或 `"single_page"`。
  - `pageNumber` (number)：如果为 `single_page`，则附带页码数字，否则为 null 或不传。
  - `targetLang` (string)：预留字段，由于目前默认英译中且只做了 i18n，暂时硬编码传递 `"en"` 或跟随未来需求。
