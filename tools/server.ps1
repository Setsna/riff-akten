# ==========================================================
#  Riff-Akten - kleiner Webserver fuer den Rauchtest
#
#  Startet im Projektordner einen Server auf http://localhost:8123/
#  (wie frueher "python -m http.server 8123", aber ohne Python).
#
#    powershell -ExecutionPolicy Bypass -File tools\server.ps1
#
#  Danach im Browser oeffnen:
#    http://localhost:8123/tools/rauchtest.html
#
#  Beenden mit Strg+C. Der Server ist nur auf diesem Rechner erreichbar.
# ==========================================================
param([int]$Port = 8123)

$wurzel = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\') + '\'
$typen = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.csv'  = 'text/csv; charset=utf-8'
  '.md'   = 'text/markdown; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.webp' = 'image/webp'
  '.woff2' = 'font/woff2'
  '.jpg'  = 'image/jpeg'
  '.ico'  = 'image/x-icon'
}

$hoerer = New-Object System.Net.HttpListener
$hoerer.Prefixes.Add("http://localhost:$Port/")
$hoerer.Start()
Write-Host "Riff-Akten laeuft auf http://localhost:$Port/  (Ordner: $wurzel)"
Write-Host "Rauchtest:  http://localhost:$Port/tools/rauchtest.html"

try {
  while ($hoerer.IsListening) {
    $ktx = $hoerer.GetContext()
    $antwort = $ktx.Response
    try {
      $pfad = [System.Uri]::UnescapeDataString($ktx.Request.Url.AbsolutePath)
      if ($pfad.EndsWith('/')) { $pfad += 'index.html' }
      $datei = [System.IO.Path]::GetFullPath((Join-Path $wurzel $pfad.TrimStart('/')))

      # Nichts ausserhalb des Projektordners ausliefern.
      if (-not $datei.StartsWith($wurzel, [System.StringComparison]::OrdinalIgnoreCase) -or
          -not (Test-Path -LiteralPath $datei -PathType Leaf)) {
        $antwort.StatusCode = 404
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('Nicht gefunden')
      } else {
        $endung = [System.IO.Path]::GetExtension($datei).ToLower()
        $antwort.ContentType = if ($typen.ContainsKey($endung)) { $typen[$endung] } else { 'application/octet-stream' }
        $antwort.Headers.Add('Cache-Control', 'no-store')
        $bytes = [System.IO.File]::ReadAllBytes($datei)
      }
      $antwort.ContentLength64 = $bytes.Length
      $antwort.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      Write-Host "Fehler: $_"
    } finally {
      $antwort.Close()
    }
  }
} finally {
  $hoerer.Stop()
}
