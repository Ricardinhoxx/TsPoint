$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

function Resolve-Python {
  if (Get-Command py -ErrorAction SilentlyContinue) {
    # Prefer Python 3.12/3.11 because pydantic-core wheels may not exist for newer versions (ex: 3.14).
    foreach ($ver in @("3.12", "3.11")) {
      try {
        & py "-$ver" -c "import sys; print(sys.version)" | Out-Null
        return @{ Command = "py"; Args = @("-$ver") }
      } catch {}
    }
    return @{ Command = "py"; Args = @() }
  }
  if (Get-Command python -ErrorAction SilentlyContinue) {
    return @{ Command = "python"; Args = @() }
  }
  throw "Python not found. Install Python 3.12+ (recommended 3.12) and try again."
}

$py = Resolve-Python
$pyCmd = $py.Command
$pyArgs = $py.Args

if (!(Test-Path ".venv")) {
  & $pyCmd @pyArgs -m venv .venv
}

& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt

$envFileArgs = @()
if (Test-Path ".env") {
  $envFileArgs = @("--env-file", ".env")
}

& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8080 @envFileArgs
