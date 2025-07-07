.PHONY: dev test kill-port

dev: kill-port
	npm run dev

test: kill-port
	npm run dev

kill-port:
	@lsof -ti:3456 | xargs kill -9 2>/dev/null || true
