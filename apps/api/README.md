# 后端服务说明（apps/api）

本目录为后端服务代码，提供任务创建、PDF 抽取、仓库索引和模块化分析接口。

## 前置准备

1. 使用项目内置解释器（推荐）：`env\python.exe`
2. 首次使用先手动安装依赖：

```bash
".\env\python.exe" -m pip install -r apps/api/requirements.txt
```

3. 创建并编辑环境变量文件：

```bash
copy apps/api/.env.example apps/api/.env
```

必须填写：

- `OPENAI_API_KEY`
- `MINERU_TOKEN`

启动脚本还会读取：

- `STARTUP_PYTHON_EXE`（必填，建议配置为相对路径 `.\env\python.exe`）
- `STARTUP_APP_PORT`（可选，默认 `8000`）

## 启动方式

### 方式 A（推荐）

使用根目录 `start.bat`，解释器路径在 `apps/api/.env` 中管理。

### 方式 B（手动）

```bash
".\env\python.exe" -m uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8000 --reload
```

访问：

- 页面：`http://127.0.0.1:8000/`
- API：`http://127.0.0.1:8000/api/...`

## 关键接口

- `POST /api/jobs`
- `POST /api/jobs/{job_id}/pdf`
- `POST /api/jobs/{job_id}/repo`
- `POST /api/jobs/{job_id}/extract`
- `POST /api/jobs/{job_id}/index`
- `POST /api/jobs/{job_id}/run`
- `GET /api/jobs/{job_id}`
- `GET /api/jobs/{job_id}/outputs/{module_name}`
- `GET /api/jobs/{job_id}/download`
- `GET /api/jobs/{job_id}/artifacts/{artifact_id}/raw`

## 校验命令

```bash
".\env\python.exe" -m compileall apps/api/app
```

如果安装了 ruff：

```bash
ruff check apps/api/app
ruff format apps/api/app
```
