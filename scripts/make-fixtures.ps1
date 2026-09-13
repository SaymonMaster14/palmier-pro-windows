# Deterministic fixtures via FFmpeg lavfi (no downloads).
ffmpeg -v error -f lavfi -i "testsrc=size=640x360:rate=30:duration=6" -f lavfi -i "sine=frequency=440:duration=6" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -y "$PSScriptRoot/../tests/fixtures/sample-av.mp4"
ffmpeg -v error -f lavfi -i "color=c=0x224488:size=640x360:duration=1" -frames:v 1 -y "$PSScriptRoot/../tests/fixtures/sample-img.png"
ffmpeg -v error -f lavfi -i "sine=frequency=880:duration=3" -y "$PSScriptRoot/../tests/fixtures/sample-audio.wav"
Write-Host "fixtures ok"
