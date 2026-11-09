# Shortcuts for the ctrl-app fork. Run `make` to start the app.

PORT ?= 4200

.PHONY: run build test

# Start the dev server: open http://localhost:$(PORT) in Chrome (WebUSB).
run: node_modules
	npx ng serve --port $(PORT)

# Compile check (development build).
build: node_modules
	npx ng build --configuration development

# Unit tests, once, in headless Chrome.
test: node_modules
	npx ng test --watch=false --browsers=ChromeHeadless

node_modules: package-lock.json
	npm ci
	touch node_modules
