## Manual smoke with ios simulator
### Start daemon
```bash
npx appium-agent daemon:start
```

### Kill daemon
```bash
npx appium-agent daemon:kill
```

### Connect
```bash
npx appium-agent connect --caps '{"platformName": "iOS","appium:automationName": "XCUITest"}'
```
```bash
npx appium-agent connect --caps '{"platformName": "Android","appium:automationName": "UIAutomator2"}'
```

### Page source
```bash
npx appium-agent connect page-source
npx appium-agent connect page-source --raw
```

## Find element
```bash
npx appium-agent find-element --strategy 'accessibility id' --selector Login
```