# Sync script - pulls latest assessment data from GitHub
cd "c:\Users\rflip\Documents\Programming Sandbox\Kids School"
& "C:\Program Files\Git\cmd\git.exe" pull origin main
Write-Host "Sync complete! Assessment data is now up to date."
