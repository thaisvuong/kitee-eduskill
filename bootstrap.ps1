$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "[1/5] Check Node"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
 throw "Node.js chưa cài. Cài Node 22 LTS trước."
}
node -v

Write-Host "[2/5] Install deps"
npm install

Write-Host "[3/5] Seed env"
if (-not (Test-Path .env.local)) {
 Copy-Item .env.example .env.local
 Write-Host "Đã tạo .env.local — nhớ sửa giá trị cho máy bạn."
}

Write-Host "[4/5] Build"
npm run build

Write-Host "[5/5] Done"
Write-Host "Chạy: npm run start"
Write-Host "Mở: http://localhost:3100"
