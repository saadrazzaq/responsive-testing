@echo off
REM ===== ResponsiveQA launcher =====
REM Starts the reverse proxy (if needed) and opens the tool from the proxy
REM origin (http://localhost:8090/__app/) so cookies/data routing work.

cd /d "%~dp0"

REM Is a proxy already listening on 8090? If so, don't start a second one.
netstat -ano | findstr ":8090" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo Proxy already running on port 8090 - reusing it.
) else (
  echo Starting ResponsiveQA proxy...
  start "ResponsiveQA Proxy" cmd /k node proxy.js
)

REM Wait until the proxy answers its health check (up to ~10s).
echo Waiting for proxy to be ready...
set READY=
for /L %%i in (1,1,20) do (
  if not defined READY (
    powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://localhost:8090/__rqa/health) ^| Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 set READY=1
    if not defined READY (ping -n 2 127.0.0.1 >nul)
  )
)

echo Opening the tester...
start "" "http://localhost:8090/__app/"

echo.
echo ResponsiveQA is ready at  http://localhost:8090/__app/
echo  - Keep the proxy window open while testing.
echo  - Click "Proxy: Off" to turn it On, then load any site.
echo.
