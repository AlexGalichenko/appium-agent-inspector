## Manual smoke with an iOS simulator or Android emulator

Requires an Appium server with the platform's driver installed:

```bash
npm install -g appium
appium driver install xcuitest      # iOS
appium driver install uiautomator2  # Android
appium
```

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
npx appium-agent connect --caps '{"platformName": "Android","appium:automationName": "UiAutomator2"}'
```

### Page source
```bash
npx appium-agent page-source
npx appium-agent page-source --raw
```

### Find element
```bash
npx appium-agent find-element --strategy 'accessibility id' --selector Login
```

### iOS strategies that previously mis-routed
```bash
npx appium-agent find-element --strategy '-ios predicate string' --selector 'type == "XCUIElementTypeButton"'
npx appium-agent find-element --strategy '-ios class chain' --selector '**/XCUIElementTypeButton'
```

### Typing appends unless --clear is passed
```bash
npx appium-agent type --strategy 'accessibility id' --selector Username --text 'ad'
npx appium-agent type --strategy 'accessibility id' --selector Username --text 'min'    # field reads "admin"
npx appium-agent type --strategy 'accessibility id' --selector Username --text 'root' --clear  # field reads "root"
```
