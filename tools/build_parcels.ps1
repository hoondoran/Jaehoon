<#
  build_parcels.ps1 — 표본목록.xls → data/parcels.js 재생성

  엑셀 원본이 갱신되면 이 스크립트만 다시 돌리면 된다.
  Microsoft Excel 이 설치된 Windows 에서 COM 으로 읽는다.

  사용:  powershell -ExecutionPolicy Bypass -File tools\build_parcels.ps1
         powershell -ExecutionPolicy Bypass -File tools\build_parcels.ps1 -Xls "다른파일.xls"

  시트 구조 전제
    · 1행 비어 있음 / 2행 헤더 / 3행부터 데이터
    · G열(7) = 표준지 위치(지번주소)   · BX열(76) = PNU
#>
param(
    [string]$Xls  = (Join-Path (Split-Path -Parent $PSScriptRoot) '표본목록.xls'),
    [string]$Out  = (Join-Path (Split-Path -Parent $PSScriptRoot) 'data\parcels.js'),
    [string]$Region = '대구광역시 달성군',
    [int]$HeaderRow = 2
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $Xls)) { throw "엑셀 파일을 찾을 수 없습니다: $Xls" }

# 엑셀 열번호 → 출력 키 / 타입(n=숫자, s=문자)
$COLS = @(3,5,6,7,11,12,13,15,16,19,21,22,24,25,26,29,30,31,32,33,34,39,40,41,42,43,44,45,47,49,50,51,53,64,73,74,75,76)
$KEYS = @('no','dong','jibun','loc','road','jimok','area','zone1','zone2','use','hgt','shape','rface','pos1','pos2',
          'price','prev','chg','pa','pb','gap','mkt','mkta','mktb','pmkt','mchg','r27','r26','dist1','fac','facr',
          'etc1','etcd','env','memoa','memob','memof','pnu')
$TYPES= @('n','s','s','s','s','s','n','s','s','s','s','s','s','s','s',
          'n','n','n','n','n','n','n','n','n','n','n','n','n','s','s','n',
          's','s','s','s','s','s','s')

Write-Host "엑셀 열기: $Xls"
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
    $wb = $excel.Workbooks.Open($Xls, 0, $true)
    $ws = $wb.Worksheets.Item(1)
    $lastRow = $ws.UsedRange.Rows.Count
    $maxCol  = ($COLS | Measure-Object -Maximum).Maximum
    Write-Host "시트 '$($ws.Name)'  행 $lastRow  (헤더 $HeaderRow 행)"

    # 한 번에 읽어오기 (셀 단위 COM 호출은 매우 느리다)
    $arr = $ws.Range($ws.Cells.Item($HeaderRow + 1, 1), $ws.Cells.Item($lastRow, $maxCol)).Value2

    $sb = New-Object System.Text.StringBuilder
    $count = 0
    $rows = New-Object System.Collections.Generic.List[string]

    for ($r = 1; $r -le ($lastRow - $HeaderRow); $r++) {
        $loc = [string]$arr.GetValue($r, 7)
        $pnu = [string]$arr.GetValue($r, 76)
        if ([string]::IsNullOrWhiteSpace($loc) -or [string]::IsNullOrWhiteSpace($pnu)) { continue }

        $cells = New-Object System.Collections.Generic.List[string]
        for ($i = 0; $i -lt $COLS.Count; $i++) {
            $v = $arr.GetValue($r, $COLS[$i])
            $s = if ($null -eq $v) { '' } else { ([string]$v).Trim() }
            if ($TYPES[$i] -eq 'n') {
                $s = $s -replace ',', ''
                if ($s -match '^-?\d+(\.\d+)?$') { $cells.Add($s) } else { $cells.Add('0') }
            } else {
                if ($s -eq '0') { $s = '' }
                $s = $s -replace '\\', '\\\\' -replace '"', '\"' -replace '[\r\n\t]', ' '
                $cells.Add('"' + $s + '"')
            }
        }
        $rows.Add('[' + ($cells -join ',') + ']')
        $count++
    }

    [void]$sb.AppendLine("// 자동 생성 파일 — $(Split-Path -Leaf $Xls) 에서 추출 (직접 수정하지 말 것)")
    [void]$sb.AppendLine("// 재생성: powershell -ExecutionPolicy Bypass -File tools\build_parcels.ps1")
    [void]$sb.AppendLine("// 대상: $Region 표준지 $count 필지 · 생성 $(Get-Date -Format 'yyyy-MM-dd HH:mm')")
    [void]$sb.AppendLine("var PARCEL_REGION = '$Region';")
    [void]$sb.AppendLine("var PARCEL_FIELDS = [" + (($KEYS | ForEach-Object { '"' + $_ + '"' }) -join ',') + "];")
    [void]$sb.AppendLine("var PARCEL_ROWS = [")
    [void]$sb.AppendLine(($rows -join ",`n"))
    [void]$sb.AppendLine("];")

    [System.IO.File]::WriteAllText($Out, $sb.ToString(), (New-Object System.Text.UTF8Encoding $false))
    Write-Host "생성 완료: $Out  ($count 필지, $((Get-Item $Out).Length) bytes)"
}
finally {
    if ($wb) { $wb.Close($false) }
    $excel.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
