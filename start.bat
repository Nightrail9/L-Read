@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"

if not exist "apps\api\.env" (
    echo [ERROR] Missing apps\api\.env
    echo Run: copy apps\api\.env.example apps\api\.env
    pause
    exit /b 1
)

set "PYTHON_EXE="
set "APP_PORT="
set "BACKEND_PORT="
set "OPEN_PATH="
set "OPENAI_API_KEY="
set "GPT_API_KEY="
set "GEMINI_API_KEY="
set "OPENAI_COMPAT_API_KEY="
set "LLM_PROVIDER="
set "MINERU_TOKEN="

for /f "usebackq tokens=1,* delims==" %%A in (`findstr /R /V /C:"^[ ]*#" /C:"^[ ]*;" /C:"^[ ]*$" "apps\api\.env"`) do (
    set "KEY=%%A"
    set "VAL=%%B"
    if /i "!KEY!"=="STARTUP_PYTHON_EXE" set "PYTHON_EXE=!VAL!"
    if /i "!KEY!"=="STARTUP_APP_PORT" set "APP_PORT=!VAL!"
    if /i "!KEY!"=="BACKEND_PORT" set "BACKEND_PORT=!VAL!"
    if /i "!KEY!"=="STARTUP_OPEN_PATH" set "OPEN_PATH=!VAL!"
    if /i "!KEY!"=="OPENAI_API_KEY" set "OPENAI_API_KEY=!VAL!"
    if /i "!KEY!"=="GPT_API_KEY" set "GPT_API_KEY=!VAL!"
    if /i "!KEY!"=="GEMINI_API_KEY" set "GEMINI_API_KEY=!VAL!"
    if /i "!KEY!"=="OPENAI_COMPAT_API_KEY" set "OPENAI_COMPAT_API_KEY=!VAL!"
    if /i "!KEY!"=="LLM_PROVIDER" set "LLM_PROVIDER=!VAL!"
    if /i "!KEY!"=="MINERU_TOKEN" set "MINERU_TOKEN=!VAL!"
)

if not defined PYTHON_EXE (
    echo [ERROR] STARTUP_PYTHON_EXE is not configured in apps\api\.env
    echo Example: STARTUP_PYTHON_EXE=.\env\python.exe
    pause
    exit /b 1
)

if not defined APP_PORT (
    if defined BACKEND_PORT (
        set "APP_PORT=%BACKEND_PORT%"
    ) else (
        set "APP_PORT=8000"
    )
)

if not defined OPEN_PATH set "OPEN_PATH=/task"
if not "%OPEN_PATH:~0,1%"=="/" set "OPEN_PATH=/%OPEN_PATH%"

echo %APP_PORT%| findstr /R "^[0-9][0-9]*$" >nul
if errorlevel 1 (
    echo [ERROR] STARTUP_APP_PORT must be a number in apps\api\.env
    pause
    exit /b 1
)

rem Resolve relative interpreter path against repository root
set "PYTHON_EXE_RAW=%PYTHON_EXE%"
if not "%PYTHON_EXE:~1,1%"==":" if not "%PYTHON_EXE:~0,2%"=="\\" (
    set "PYTHON_EXE=%ROOT%%PYTHON_EXE%"
)

echo [1/4] Checking Python interpreter...
if not exist "%PYTHON_EXE%" (
    echo [ERROR] STARTUP_PYTHON_EXE path not found:
    echo %PYTHON_EXE%
    echo Raw value from .env: %PYTHON_EXE_RAW%
    pause
    exit /b 1
)

"%PYTHON_EXE%" --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python executable is not runnable.
    pause
    exit /b 1
)

"%PYTHON_EXE%" -m pip --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] pip is not available for this interpreter.
    pause
    exit /b 1
)

echo [2/4] Checking service config...
if not defined LLM_PROVIDER set "LLM_PROVIDER=gpt"

if /i "%LLM_PROVIDER%"=="gpt" (
    if not defined GPT_API_KEY set "GPT_API_KEY=%OPENAI_API_KEY%"
    if not defined GPT_API_KEY (
        echo [ERROR] GPT provider requires API key in apps\api\.env
        echo Set GPT_API_KEY or OPENAI_API_KEY
        pause
        exit /b 1
    )
    if /i "%GPT_API_KEY%"=="replace_with_your_openai_key" (
        echo [ERROR] GPT_API_KEY/OPENAI_API_KEY is still placeholder value in apps\api\.env
        pause
        exit /b 1
    )
) else if /i "%LLM_PROVIDER%"=="gemini" (
    if not defined GEMINI_API_KEY (
        echo [ERROR] GEMINI provider requires GEMINI_API_KEY in apps\api\.env
        pause
        exit /b 1
    )
    if /i "%GEMINI_API_KEY%"=="replace_with_your_gemini_key" (
        echo [ERROR] GEMINI_API_KEY is still placeholder value in apps\api\.env
        pause
        exit /b 1
    )
) else if /i "%LLM_PROVIDER%"=="openai-compatible" (
    if not defined OPENAI_COMPAT_API_KEY (
        echo [ERROR] OPENAI-COMPAT provider requires OPENAI_COMPAT_API_KEY in apps\api\.env
        pause
        exit /b 1
    )
    if /i "%OPENAI_COMPAT_API_KEY%"=="replace_with_your_openai_compat_key" (
        echo [ERROR] OPENAI_COMPAT_API_KEY is still placeholder value in apps\api\.env
        pause
        exit /b 1
    )
) else (
    echo [ERROR] Unsupported LLM_PROVIDER in apps\api\.env: %LLM_PROVIDER%
    echo Allowed: gpt ^| gemini ^| openai-compatible
    pause
    exit /b 1
)

if not defined MINERU_TOKEN (
    echo [ERROR] MINERU_TOKEN is empty in apps\api\.env
    pause
    exit /b 1
)
if /i "%MINERU_TOKEN%"=="replace_with_your_mineru_token" (
    echo [ERROR] MINERU_TOKEN is still placeholder value in apps\api\.env
    pause
    exit /b 1
)

echo [3/4] Checking required packages...
set "MISS_FILE=%TEMP%\lread_missing_%RANDOM%.txt"
"%PYTHON_EXE%" -c "import importlib.util;mods=['fastapi','uvicorn','requests','dotenv','multipart'];missing=[m for m in mods if importlib.util.find_spec(m) is None];print(' '.join(missing))" > "%MISS_FILE%" 2>nul
set "MISSING="
if exist "%MISS_FILE%" set /p MISSING=<"%MISS_FILE%"
if exist "%MISS_FILE%" del /q "%MISS_FILE%" >nul 2>&1

if defined MISSING (
    echo [ERROR] Missing packages: %MISSING%
    echo Install first:
    echo "%PYTHON_EXE%" -m pip install -r apps\api\requirements.txt
    pause
    exit /b 1
)

echo [4/4] Starting service...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%APP_PORT% .*LISTENING"') do (
    echo [ERROR] Port %APP_PORT% is already in use.
    pause
    exit /b 1
)

start "" "http://127.0.0.1:%APP_PORT%%OPEN_PATH%"
cd /d "%ROOT%apps\api"
"%PYTHON_EXE%" -m uvicorn app.main:app --host 127.0.0.1 --port %APP_PORT% --no-access-log --log-level warning

set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
    echo [ERROR] Server exited with code %EXIT_CODE%.
    pause
)

endlocal
