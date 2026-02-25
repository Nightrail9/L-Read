# 文献精读工作台

本项目采用统一前后端结构：

- 后端：FastAPI（任务编排、PDF 抽取、仓库索引、模块输出）
- 前端：静态页面（由后端同源托管）

## 目录结构

- `apps/api`：后端代码与配置模板
- `apps/web`：前端页面和脚本
- `data`：运行时数据（任务产物、数据库等）
- `start.bat`：一键检测并启动

## 首次使用（必须先完成）

### 1) 使用项目内置 Python 解释器

- 本项目默认使用根目录的 `env\python.exe`
- 启动、安装依赖、校验命令都请使用同一个解释器

### 2) 先手动安装依赖包

首次使用前必须先手动安装依赖：

```bash
".\env\python.exe" -m pip install -r apps/api/requirements.txt
```

### 3) 配置后端 `.env`

```bash
copy apps/api/.env.example apps/api/.env
```

编辑 `apps/api/.env`，至少填写：

- `LLM_PROVIDER`（`gpt` / `gemini` / `openai-compatible`）
- 与 provider 对应的 key（见下表）
- `MINERU_TOKEN`

Provider 与 Key 对照：

- `gpt`：`GPT_API_KEY`（也可用 `OPENAI_API_KEY`）
- `gemini`：`GEMINI_API_KEY`
- `openai-compatible`：`OPENAI_COMPAT_API_KEY`

### 4) 在后端配置启动参数

编辑 `apps/api/.env`，确保以下配置正确：

- `STARTUP_PYTHON_EXE`：Python 解释器相对路径（建议使用项目内置解释器）
- `STARTUP_APP_PORT`：启动端口（可选，默认 `8000`）
- `STARTUP_OPEN_PATH`：启动后自动打开的页面路径（可选，默认 `/task`）

例如：

```env
STARTUP_PYTHON_EXE=.\env\python.exe
STARTUP_APP_PORT=8000
STARTUP_OPEN_PATH=/task
```

## 启动项目

双击根目录 `start.bat`。

脚本会执行以下检测：

1. `apps/api/.env` 是否存在
2. 解释器路径与 pip 是否可用
3. 后端关键配置是否完整（按 `LLM_PROVIDER` 检查对应 API Key + `MINERU_TOKEN`）
4. 依赖包是否齐全（仅检测，不自动安装）
5. 端口配置是否合法且未被占用

全部通过后自动：

- 打开浏览器 `http://127.0.0.1:<STARTUP_APP_PORT><STARTUP_OPEN_PATH>`
- 前台启动服务（关闭窗口即停止服务并释放端口）

## 使用流程

1. 点击「新建任务」
2. 上传 PDF
3. 可选填写 Git 仓库地址或本地路径
4. 点击「开始分析文献」
5. 等待抽取/索引/分析完成
6. 在阅读页查看模块化笔记，支持复制/下载 Markdown

## 常见问题

### 1) `STARTUP_PYTHON_EXE path not found`

- 配置的路径不正确，或解释器被移动/删除
- 修改 `apps/api/.env` 中的 `STARTUP_PYTHON_EXE`

### 2) `Missing packages: ...`

说明依赖没安装完整，请使用项目解释器重新安装：

```bash
".\env\python.exe" -m pip install -r apps/api/requirements.txt
```

### 3) `STARTUP_APP_PORT must be a number`

- `apps/api/.env` 中 `STARTUP_APP_PORT` 不是纯数字
- 例如改为：`STARTUP_APP_PORT=8000`

### 4) `Port xxxx is already in use`

- 关闭占用端口的进程，或在 `apps/api/.env` 修改 `STARTUP_APP_PORT`

### 5) provider key 仍是占位值

- 例如 `replace_with_your_openai_key` / `replace_with_your_mineru_token`
- 请替换为真实 key 后重启

## 接口说明（当前版本）

- 项目同步接口统一为：`POST /api/jobs/sync`
- 当前版本不再使用旧兼容别名路径

## 开发校验命令

后端改动后建议至少执行：

```bash
".\env\python.exe" -m compileall apps/api/app
```

服务启动后可运行轻量冒烟检查：

```bash
".\env\python.exe" scripts/smoke_check.py --base-url http://127.0.0.1:8000
```

回归检查清单见：`docs/regression-checklist.md`
