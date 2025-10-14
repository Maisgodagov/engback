@echo off
chcp 65001
echo Удаление старых папок...

rmdir /s /q "apps"
rmdir /s /q "packages"
rmdir /s /q "scripts"

del /q com.facebook.react.devsupport.BundleDownloader
del /q move-backend.bat

echo.
echo ✅ Готово! Теперь у вас чистый backend проект!
echo.
echo Следующие шаги:
echo 1. npm install
echo 2. Создайте .env файл (см. .env.example)
echo 3. npm run prisma:generate
echo 4. npm run dev
echo.
pause
