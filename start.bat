@echo off
echo マインスイーパーサーバーを起動します...
cd %~dp0
npm install
start http://localhost:3000
npm start