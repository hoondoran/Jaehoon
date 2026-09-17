<#
  serve.ps1 — 의존성 없는 정적 파일 서버 (Windows PowerShell 5.1)

  카카오 지도 SDK는 file:// 에서 동작하지 않으므로 로컬 확인 시 이 서버를 쓴다.
  사용:  powershell -ExecutionPolicy Bypass -File tools\serve.ps1 [-Port 8080]
  종료:  Ctrl+C
#>
param(
    [int]$Port = 8080,
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path $Root).Path

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.htm'  = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.csv'  = 'text/csv; charset=utf-8'
    '.txt'  = 'text/plain; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.ico'  = 'image/x-icon'
    '.pdf'  = 'application/pdf'
    '.woff' = 'font/woff'
    '.woff2'= 'font/woff2'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "공시지가 산정 GIS  →  http://localhost:$Port/"
Write-Host "root: $Root   (Ctrl+C 로 종료)"

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response
        try {
            $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }

            # --- 개발용 저장 엔드포인트 -------------------------------------
            # 페이지의 "coords.js 저장" / "도로 경로 계산" 결과를 data/ 에 바로 쓴다.
            # 로컬 전용 서버이고, 쓰기 대상은 아래 목록으로 고정한다.
            #   POST /__save-coords            → data/coords.js
            #   POST /__save-data?f=roads.js   → data/roads.js
            $allowed = @{
                'coords.js' = 'var PARCEL_COORDS'
                'roads.js'  = 'var ROAD_ROUTES'
                'shapes.js' = 'var PARCEL_SHAPES'
            }
            $saveName = $null
            if ($req.HttpMethod -eq 'POST' -and $rel -eq '__save-coords') { $saveName = 'coords.js' }
            if ($req.HttpMethod -eq 'POST' -and $rel -eq '__save-data') {
                $f = $req.QueryString['f']
                if ($allowed.ContainsKey($f)) { $saveName = $f } else { throw "허용되지 않는 대상: $f" }
            }

            if ($saveName) {
                $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd()
                $reader.Close()
                if ($body.Length -gt 20MB) { throw "본문이 너무 큽니다 ($($body.Length) bytes)" }
                if ($body -notmatch [regex]::Escape($allowed[$saveName])) {
                    throw "$saveName 형식이 아닙니다"
                }
                $target = Join-Path $Root (Join-Path 'data' $saveName)
                [System.IO.File]::WriteAllText($target, $body, (New-Object System.Text.UTF8Encoding $false))
                $res.StatusCode = 200
                $res.ContentType = 'application/json; charset=utf-8'
                $ok = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true,"bytes":' + $body.Length + '}')
                $res.OutputStream.Write($ok, 0, $ok.Length)
                Write-Host ("SAVE data/{0} ({1} bytes)" -f $saveName, $body.Length)
                $rel = $null      # 정적 파일 처리를 건너뛴다
            }

            if ($null -ne $rel) {

            $full = Join-Path $Root $rel

            # 루트 밖 경로 차단
            $fullResolved = $null
            if (Test-Path -LiteralPath $full) { $fullResolved = (Resolve-Path -LiteralPath $full).Path }

            if ($fullResolved -and $fullResolved.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $fullResolved -PathType Leaf)) {
                $ext = [System.IO.Path]::GetExtension($fullResolved).ToLower()
                $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
                $bytes = [System.IO.File]::ReadAllBytes($fullResolved)
                $res.StatusCode = 200
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host ("200 {0}" -f $rel)
            } else {
                $res.StatusCode = 404
                $b = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $rel")
                $res.ContentType = 'text/plain; charset=utf-8'
                $res.OutputStream.Write($b, 0, $b.Length)
                Write-Host ("404 {0}" -f $rel)
            }

            }   # if ($null -ne $rel)
        } catch {
            $res.StatusCode = 500
            $b = [System.Text.Encoding]::UTF8.GetBytes("500 " + $_.Exception.Message)
            try { $res.OutputStream.Write($b, 0, $b.Length) } catch {}
            Write-Host ("500 {0}" -f $_.Exception.Message)
        } finally {
            try { $res.OutputStream.Close() } catch {}
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
