$env:Path = "C:\Program Files\nodejs;" + $env:Path
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$env:Path = 'C:\Program Files\nodejs;' + `$env:Path; cd '$root\frontend'; npm run dev"
