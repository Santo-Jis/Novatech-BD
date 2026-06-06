#!/bin/bash
echo "🚀 Novatech-BD — Customer APK Deploy"
echo "======================================"

git add .
git commit -m "feat: add customer APK build (VITE_APP_MODE)"
git push origin main

echo ""
echo "✅ Push complete!"
echo "GitHub Actions-এ দুটো workflow চলবে:"
echo "  → Build Android Release APK  (Staff APK)"
echo "  → Build Customer APK         (Customer APK)"
