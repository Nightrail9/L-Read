# 前端说明（apps/web）

本目录为前端静态资源，默认由后端同源托管。

## 推荐启动方式

请在项目根目录双击 `start.bat`。

注意：`start.bat` 启动前会检测：

- `apps/api/.env` 里的 `STARTUP_PYTHON_EXE`（建议使用相对路径 `.\env\python.exe`）
- pip 可用性
- 后端 `.env`
- 依赖包完整性

检测通过后，会自动打开浏览器并启动服务。

## 手动联调（可选）

1. 启动后端：

```bash
".\env\python.exe" -m uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8000 --reload
```

2. 打开页面：

- `http://127.0.0.1:8000/`

## 主要文件

- `index.html`：入口页面
- `src/main.js`：前端模块入口
- `src/api/`：后端 API 请求封装
- `src/state/`：前端运行态和持久化状态
- `src/ui/`：UI 公共组件函数
- `app.js`：任务流程与页面编排
- `style.css` / `fonts.css` / `fonts/`：样式与字体
