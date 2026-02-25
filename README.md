# L-Read 📚 专业文献精读工作台

一个基于 AI 的学术论文深度阅读分析工具。上传 PDF 论文，关联代码仓库，自动生成多维度结构化精读笔记。

## ✨ 核心功能

- **PDF 智能解析** — 通过 MinerU 云端服务将论文 PDF 转换为结构化 Markdown
- **代码仓库关联** — 支持 GitHub URL 克隆或本地项目路径关联，自动构建文件索引
- **多模块 AI 分析** — 四大精读维度并行生成：
  - 🏗️ 框架图解读 — 基于视觉模型解析论文架构图
  - 📐 公式讲解 — 基于视觉模型逐步拆解数学公式
  - 💻 代码精读 — 结合仓库代码深入分析实现细节
  - 🎓 导师模拟提问 — 综合前三个模块输出，模拟导师视角提问
- **笔记预览与编辑** — Markdown + KaTeX 数学公式实时渲染，支持在线编辑保存
- **项目管理** — 标签分类（方法创新 / 理论分析 / 实验评估 / 工程实现 / 应用研究 / 综述调研）
- **一键导出** — 打包下载全部分析产物（ZIP）
- **多 LLM 支持** — 兼容 OpenAI GPT / Google Gemini / 任意 OpenAI 兼容接口

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3 + FastAPI + SQLite |
| 前端 | 原生 JavaScript (ES Modules) + TailwindCSS |
| PDF 解析 | MinerU 云端服务 |
| LLM | OpenAI / Gemini / OpenAI-Compatible |
| 数学渲染 | KaTeX |
| Markdown | Marked.js + DOMPurify |

## 📁 项目结构

```
L-Read/
├── apps/
│   ├── api/                    # 后端 (FastAPI)
│   │   ├── app/
│   │   │   ├── main.py         # 应用入口
│   │   │   ├── routes/         # API 路由
│   │   │   ├── services/       # 业务逻辑（任务编排、仓库处理）
│   │   │   ├── prompts/        # LLM 提示词模板
│   │   │   └── db.py           # SQLite 数据库操作
│   │   ├── requirements.txt
│   │   └── .env.example
│   └── web/                    # 前端 (原生 JS)
│       ├── index.html
│       ├── app.js              # 前端入口
│       └── src/
│           ├── api/            # HTTP 请求封装
│           ├── controller/     # 页面控制器
│           ├── views/          # 视图渲染
│           ├── state/          # 状态管理
│           └── ui/             # UI 组件
├── data/                       # 运行时数据
│   ├── app.db                  # SQLite 数据库
│   └── jobs/                   # 任务产物目录
├── scripts/
│   └── smoke_check.py          # 集成冒烟测试
├── env/                        # 本地 Python 解释器
└── start.bat                   # 一键启动脚本
```

## 📋 前置要求

- **操作系统**：Windows（项目通过 `start.bat` 启动）
- **Python 3.11+**：项目已内置可用解释器与依赖环境（`env\python.exe`）
- **Git**：如需克隆 GitHub 仓库，需要系统安装 Git
- **MinerU Token**：用于 PDF 云端解析，需自行申请
- **LLM API Key**：至少配置以下之一：
  - OpenAI API Key（GPT 系列）
  - Google Gemini API Key
  - 任意 OpenAI 兼容接口的 API Key

## 🚀 安装与配置

### 1. 获取项目

```bash
git clone https://github.com/Nightrail9/L-Read.git
cd L-Read
```

### 2. 创建环境配置文件

```bash
copy apps\api\.env.example apps\api\.env
```

### 3. 编辑环境变量

用文本编辑器打开 `apps\api\.env`，填写必要的密钥：

```ini
# ---- 必填项 ----

# MinerU PDF 解析服务 Token
MINERU_TOKEN=your_mineru_token_here

# LLM 提供商：gpt / gemini / openai-compatible
LLM_PROVIDER=gpt

# 根据选择的 LLM_PROVIDER 填写对应密钥：

# 如果使用 GPT：
GPT_API_KEY=your_openai_key_here
GPT_BASE_URL=https://api.openai.com/v1

# 如果使用 Gemini：
GEMINI_API_KEY=your_gemini_key_here

# 如果使用 OpenAI 兼容接口：
OPENAI_COMPAT_API_KEY=your_key_here
OPENAI_COMPAT_BASE_URL=https://your-provider.com/v1
```

#### 可选配置项

<details>
<summary>点击展开完整配置说明</summary>

```ini
# ---- 启动设置 ----
STARTUP_PYTHON_EXE=.\env\python.exe   # Python 解释器路径
STARTUP_APP_PORT=8000                   # 服务端口
STARTUP_OPEN_PATH=/task                 # 启动后自动打开的页面

# ---- 模型设置 ----
GPT_MODEL_TEXT=gpt-4.1-mini            # GPT 文本模型
GPT_MODEL_VISION=gpt-4.1-mini          # GPT 视觉模型
GEMINI_MODEL_TEXT=gemini-2.5-flash     # Gemini 文本模型
GEMINI_MODEL_VISION=gemini-2.5-flash   # Gemini 视觉模型

# ---- LLM 调用参数 ----
MAX_GLOBAL_CONCURRENCY=3               # 全局最大并发 LLM 调用数
MAX_JOB_CONCURRENCY=1                  # 单任务最大并发模块数
LLM_TIMEOUT_CONNECT_SEC=15             # 连接超时（秒）
LLM_TIMEOUT_READ_SEC=600               # 读取超时（秒）
LLM_RETRIES=3                          # 重试次数
LLM_RETRY_BACKOFF_SEC=2                # 重试退避时间（秒）
LLM_MAX_OUTPUT_TOKENS=6000             # 单次最大输出 Token 数
LLM_CONTINUATION_ROUNDS=2              # 长输出续写轮数

# ---- Git 设置 ----
GIT_CLONE_RETRIES=3                    # 克隆重试次数
GIT_CLONE_TIMEOUT_SEC=180              # 克隆超时（秒）
GIT_HTTP_PROXY=                        # HTTP 代理
GIT_HTTPS_PROXY=                       # HTTPS 代理
GIT_SSL_NO_VERIFY=false                # 跳过 SSL 验证

# ---- 仓库索引限制 ----
MAX_FILE_BYTES=5242880                 # 单文件大小上限（5MB）
MAX_TOTAL_BYTES=209715200              # 仓库总大小上限（200MB）
MAX_FILES=2000                         # 最大扫描文件数

# ---- MinerU 设置 ----
MINERU_SKIP_SSL_VERIFY=false           # 跳过 MinerU SSL 验证
MINERU_DOWNLOAD_RETRIES=3              # 下载重试次数
```

</details>

### 4. 启动服务

双击运行项目根目录下的启动脚本：

```bash
start.bat
```

启动脚本会自动完成以下检查：
1. 验证 Python 解释器是否可用
2. 检查 API Key 和 MinerU Token 是否已配置
3. 确认必要的 Python 包已安装
4. 检测端口是否被占用
5. 启动后端服务并自动打开浏览器

启动成功后，浏览器会自动打开 `http://127.0.0.1:8000/task`。

#### 手动启动（可选）

如果不使用 `start.bat`，也可以手动启动后端：

```bash
.\env\python.exe -m uvicorn app.main:app --app-dir apps\api --host 127.0.0.1 --port 8000 --reload
```

然后在浏览器中访问 `http://127.0.0.1:8000`。


## ❓ 常见问题

**Q: 启动时提示 "Missing packages"**

一般情况下无需手动安装依赖（项目已内置所需环境和包）。

若本地环境损坏或被清理，可执行：
```bash
.\env\python.exe -m pip install -r apps\api\requirements.txt
```

**Q: 启动时提示端口被占用**

修改 `apps\api\.env` 中的 `STARTUP_APP_PORT` 为其他端口（如 `8001`），或关闭占用该端口的程序。

**Q: PDF 解析失败**

- 检查 `MINERU_TOKEN` 是否正确配置
- 确认网络可以访问 MinerU 服务
- 如有 SSL 问题，可尝试设置 `MINERU_SKIP_SSL_VERIFY=true`

**Q: Git 克隆超时或失败**

- 如需代理，配置 `GIT_HTTP_PROXY` / `GIT_HTTPS_PROXY`
- 可增大 `GIT_CLONE_TIMEOUT_SEC` 和 `GIT_CLONE_RETRIES`
- 如有 SSL 问题，可设置 `GIT_SSL_NO_VERIFY=true`

**Q: LLM 分析模块超时**

- 增大 `LLM_TIMEOUT_READ_SEC`（默认 600 秒）
- 代码精读模块（module_04）超时后会自动截断上下文重试
