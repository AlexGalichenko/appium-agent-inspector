## Manual smoke with ios simulator
### Start daemon
```bash
node dist/cli/index.js daemon:start
```

### Kill daemon
```bash
node dist/cli/index.js daemon:kill
```

### Connect
```bash
node dist/cli/index.js connect --caps '{"platformName": "iOS","appium:automationName": "XCUITest"}'
```

### Page source
```bash
node dist/cli/index.js connect page-source
node dist/cli/index.js connect page-source --raw
```

## Find element
```bash
node dist/cli/index.js find-element --strategy 'accessibility id' --selector Login
```