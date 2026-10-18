@echo off
cd /d "%~dp0"
bundle exec jekyll serve --port 4333 --livereload
