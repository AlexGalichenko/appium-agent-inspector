import { describe, expect, it } from 'vitest';
import { toAccessibilityYaml } from '../../src/cli/accessibility-tree.js';

// ─── iOS fixtures ────────────────────────────────────────────────────────────

const IOS_SIMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<AppiumAUT>
  <XCUIElementTypeApplication type="XCUIElementTypeApplication" name="MyApp" label="MyApp" enabled="true" visible="true" x="0" y="0" width="390" height="844">
    <XCUIElementTypeWindow type="XCUIElementTypeWindow" enabled="true" visible="true" x="0" y="0" width="390" height="844">
      <XCUIElementTypeButton type="XCUIElementTypeButton" name="Back" label="Back" enabled="true" visible="true" x="16" y="56" width="37" height="44"/>
    </XCUIElementTypeWindow>
  </XCUIElementTypeApplication>
</AppiumAUT>`;

const IOS_WITH_VALUE = `<AppiumAUT>
  <XCUIElementTypeApplication name="App" label="App" enabled="true" visible="true" x="0" y="0" width="390" height="844">
    <XCUIElementTypeTextField name="Email" label="Email" value="user@example.com" enabled="true" visible="true" x="0" y="0" width="390" height="44"/>
    <XCUIElementTypeTextField name="Username" label="Username" value="Username" enabled="true" visible="true" x="0" y="0" width="390" height="44"/>
  </XCUIElementTypeApplication>
</AppiumAUT>`;

const IOS_STATES = `<AppiumAUT>
  <XCUIElementTypeApplication name="App" label="App" enabled="true" visible="true" x="0" y="0" width="390" height="844">
    <XCUIElementTypeButton name="Submit" label="Submit" enabled="false" visible="true" x="0" y="0" width="100" height="44"/>
    <XCUIElementTypeSwitch name="Toggle" label="Toggle" value="1" enabled="true" visible="true" x="0" y="0" width="51" height="31"/>
    <XCUIElementTypeCell name="Item" label="Item" enabled="true" visible="true" selected="true" x="0" y="0" width="390" height="44"/>
    <XCUIElementTypeTextField name="Search" label="Search" enabled="true" visible="true" focused="true" x="0" y="0" width="300" height="44"/>
  </XCUIElementTypeApplication>
</AppiumAUT>`;

const IOS_LABEL_OVER_NAME = `<AppiumAUT>
  <XCUIElementTypeApplication name="bundle-id" label="My App" enabled="true" visible="true" x="0" y="0" width="390" height="844">
  </XCUIElementTypeApplication>
</AppiumAUT>`;

// ─── Android fixtures ─────────────────────────────────────────────────────────

const ANDROID_SIMPLE = `<hierarchy rotation="0">
  <android.widget.FrameLayout index="0" package="com.example.app" class="android.widget.FrameLayout" text="" resource-id="" content-desc="" enabled="true" bounds="[0,0][1080,1920]">
    <android.widget.Button index="0" class="android.widget.Button" text="Login" resource-id="com.example:id/btn_login" content-desc="" enabled="true" clickable="true" bounds="[40,800][1040,960]"/>
    <android.widget.CheckBox index="1" class="android.widget.CheckBox" text="Remember me" content-desc="" enabled="true" checked="true" bounds="[40,980][520,1060]"/>
  </android.widget.FrameLayout>
</hierarchy>`;

const ANDROID_CONTENT_DESC_OVER_TEXT = `<hierarchy rotation="0">
  <android.widget.ImageButton index="0" class="android.widget.ImageButton" text="" content-desc="Navigate up" enabled="true" bounds="[0,0][144,168]"/>
</hierarchy>`;

const ANDROID_SELECTED = `<hierarchy rotation="0">
  <android.widget.LinearLayout index="0" class="android.widget.LinearLayout" text="" content-desc="" enabled="true" bounds="[0,0][1080,160]">
    <android.widget.TextView index="0" class="android.widget.TextView" text="Tab 1" content-desc="" enabled="true" selected="true" bounds="[0,0][540,160]"/>
    <android.widget.TextView index="1" class="android.widget.TextView" text="Tab 2" content-desc="" enabled="true" selected="false" bounds="[540,0][1080,160]"/>
  </android.widget.LinearLayout>
</hierarchy>`;

// ─── Role mapping ─────────────────────────────────────────────────────────────

describe('iOS role mapping', () => {
  it.each([
    ['XCUIElementTypeApplication', 'application'],
    ['XCUIElementTypeWindow', 'window'],
    ['XCUIElementTypeButton', 'button'],
    ['XCUIElementTypeStaticText', 'statictext'],
    ['XCUIElementTypeTextField', 'textfield'],
    ['XCUIElementTypeSecureTextField', 'securetextfield'],
    ['XCUIElementTypeNavigationBar', 'navigationbar'],
    ['XCUIElementTypeTabBar', 'tabbar'],
    ['XCUIElementTypeTable', 'table'],
    ['XCUIElementTypeCell', 'cell'],
    ['XCUIElementTypeSwitch', 'switch'],
    ['XCUIElementTypeScrollView', 'scrollview'],
    ['XCUIElementTypeOther', 'other'],
  ])('%s → %s', (xcuiType, expectedRole) => {
    const xml = `<AppiumAUT><${xcuiType} name="x" label="x" enabled="true" visible="true" x="0" y="0" width="1" height="1"/></AppiumAUT>`;
    expect(toAccessibilityYaml(xml)).toBe(`- ${expectedRole} "x"`);
  });
});

describe('Android role mapping', () => {
  it.each([
    ['android.widget.Button', 'button'],
    ['android.widget.TextView', 'textview'],
    ['android.widget.EditText', 'edittext'],
    ['android.widget.FrameLayout', 'framelayout'],
    ['android.widget.LinearLayout', 'linearlayout'],
    ['android.widget.ImageView', 'imageview'],
    ['android.widget.CheckBox', 'checkbox'],
    ['android.widget.Switch', 'switch'],
    ['android.widget.ScrollView', 'scrollview'],
    ['androidx.recyclerview.widget.RecyclerView', 'recyclerview'],
  ])('%s → %s', (cls, expectedRole) => {
    const xml = `<hierarchy><${cls} class="${cls}" text="x" content-desc="" enabled="true" bounds="[0,0][1,1]"/></hierarchy>`;
    expect(toAccessibilityYaml(xml)).toBe(`- ${expectedRole} "x"`);
  });
});

// ─── Wrapper tag stripping ────────────────────────────────────────────────────

describe('wrapper tags', () => {
  it('strips AppiumAUT and starts from its child', () => {
    const result = toAccessibilityYaml(IOS_SIMPLE);
    expect(result).toMatch(/^- application/);
    expect(result).not.toContain('appiumaut');
  });

  it('strips hierarchy and starts from its child', () => {
    const result = toAccessibilityYaml(ANDROID_SIMPLE);
    expect(result).toMatch(/^- framelayout/);
    expect(result).not.toContain('hierarchy');
  });
});

// ─── iOS tree structure ───────────────────────────────────────────────────────

describe('iOS simple tree', () => {
  it('renders the full indented tree (anonymous window collapsed)', () => {
    // XCUIElementTypeWindow has no name → single-child passthrough → button promoted
    expect(toAccessibilityYaml(IOS_SIMPLE)).toBe(
      [
        '- application "MyApp":',
        '  - button "Back"',
      ].join('\n'),
    );
  });
});

// ─── Android tree structure ───────────────────────────────────────────────────

describe('Android simple tree', () => {
  it('renders framelayout with children', () => {
    expect(toAccessibilityYaml(ANDROID_SIMPLE)).toBe(
      [
        '- framelayout:',
        '  - button "Login"',
        '  - checkbox "Remember me" [checked]',
      ].join('\n'),
    );
  });
});

// ─── Name resolution ─────────────────────────────────────────────────────────

describe('name resolution', () => {
  it('uses name as primary identifier and shows label as extra attribute when different', () => {
    const result = toAccessibilityYaml(IOS_LABEL_OVER_NAME);
    expect(result).toContain('"bundle-id"');
    expect(result).toContain('[label="My App"]');
  });

  it('prefers content-desc over text for Android elements', () => {
    const result = toAccessibilityYaml(ANDROID_CONTENT_DESC_OVER_TEXT);
    expect(result).toContain('"Navigate up"');
  });

  it('falls back to text when content-desc is empty', () => {
    const result = toAccessibilityYaml(ANDROID_SIMPLE);
    expect(result).toContain('"Login"');
  });

  it('drops anonymous leaf entirely (no name, no children)', () => {
    const xml = `<hierarchy><android.widget.FrameLayout class="android.widget.FrameLayout" text="" content-desc="" enabled="true" bounds="[0,0][1,1]"/></hierarchy>`;
    expect(toAccessibilityYaml(xml)).toBe('');
  });
});

// ─── State attributes ─────────────────────────────────────────────────────────

describe('state attributes', () => {
  it('adds [disabled] when enabled="false"', () => {
    const result = toAccessibilityYaml(IOS_STATES);
    expect(result).toContain('button "Submit" [disabled]');
  });

  it('adds [checked] when checked="true"', () => {
    const result = toAccessibilityYaml(ANDROID_SIMPLE);
    expect(result).toContain('checkbox "Remember me" [checked]');
  });

  it('adds [selected] when selected="true"', () => {
    const result = toAccessibilityYaml(ANDROID_SELECTED);
    expect(result).toContain('textview "Tab 1" [selected]');
  });

  it('does NOT add [selected] when selected="false"', () => {
    const result = toAccessibilityYaml(ANDROID_SELECTED);
    expect(result).not.toContain('textview "Tab 2" [selected]');
  });

  it('adds [focused] when focused="true"', () => {
    const result = toAccessibilityYaml(IOS_STATES);
    expect(result).toContain('textfield "Search" [focused]');
  });

  it('adds [value="..."] when value differs from name', () => {
    const result = toAccessibilityYaml(IOS_WITH_VALUE);
    expect(result).toContain('textfield "Email" [value="user@example.com"]');
  });

  it('does NOT add [value="..."] when value equals name', () => {
    const result = toAccessibilityYaml(IOS_WITH_VALUE);
    expect(result).not.toContain('textfield "Username" [value=');
  });

  it('does NOT add [value="..."] when value is empty', () => {
    const xml = `<AppiumAUT><XCUIElementTypeTextField name="Search" label="Search" value="" enabled="true" visible="true" x="0" y="0" width="300" height="44"/></AppiumAUT>`;
    const result = toAccessibilityYaml(xml);
    expect(result).toBe('- textfield "Search"');
  });

  it('combines multiple states', () => {
    const xml = `<AppiumAUT><XCUIElementTypeSwitch name="Wi-Fi" label="Wi-Fi" value="1" enabled="false" visible="true" selected="true" x="0" y="0" width="51" height="31"/></AppiumAUT>`;
    const result = toAccessibilityYaml(xml);
    expect(result).toContain('[disabled, selected, value="1"]');
  });
});

// ─── Colon suffix for parents ─────────────────────────────────────────────────

describe('colon suffix', () => {
  it('adds colon to named elements that have visible children', () => {
    // IOS_STATES: application "App" has 4 named children
    const result = toAccessibilityYaml(IOS_STATES);
    expect(result).toContain('application "App":');
  });

  it('does NOT add colon to leaf elements', () => {
    const result = toAccessibilityYaml(IOS_SIMPLE);
    expect(result).not.toContain('button "Back":');
    expect(result).toMatch(/button "Back"$/m);
  });
});

// ─── XML declaration handling ─────────────────────────────────────────────────

describe('XML declaration', () => {
  it('handles XML with processing instruction', () => {
    const result = toAccessibilityYaml(IOS_SIMPLE);
    expect(result).toMatch(/^- application/);
  });

  it('handles XML without processing instruction', () => {
    const xml = `<AppiumAUT><XCUIElementTypeButton name="OK" label="OK" enabled="true" visible="true" x="0" y="0" width="80" height="44"/></AppiumAUT>`;
    expect(toAccessibilityYaml(xml)).toBe('- button "OK"');
  });
});

// ─── Anonymous-node pruning ───────────────────────────────────────────────────

describe('anonymous leaf pruning', () => {
  it('drops a single anonymous leaf', () => {
    const xml = `<AppiumAUT><XCUIElementTypeOther enabled="true" visible="true" x="0" y="0" width="390" height="44"/></AppiumAUT>`;
    expect(toAccessibilityYaml(xml)).toBe('');
  });

  it('drops anonymous leaves among named siblings', () => {
    const xml = `<AppiumAUT>
      <XCUIElementTypeApplication name="App" label="App" enabled="true" visible="true" x="0" y="0" width="390" height="844">
        <XCUIElementTypeOther enabled="true" visible="true" x="0" y="0" width="390" height="1"/>
        <XCUIElementTypeButton name="OK" label="OK" enabled="true" visible="true" x="0" y="0" width="80" height="44"/>
        <XCUIElementTypeOther enabled="true" visible="true" x="0" y="0" width="390" height="1"/>
      </XCUIElementTypeApplication>
    </AppiumAUT>`;
    expect(toAccessibilityYaml(xml)).toBe(
      ['- application "App":', '  - button "OK"'].join('\n'),
    );
  });
});

describe('anonymous single-child collapse', () => {
  it('promotes the sole named child to the parent depth', () => {
    const xml = `<AppiumAUT>
      <XCUIElementTypeOther enabled="true" visible="true" x="0" y="0" width="390" height="844">
        <XCUIElementTypeButton name="OK" label="OK" enabled="true" visible="true" x="0" y="0" width="80" height="44"/>
      </XCUIElementTypeOther>
    </AppiumAUT>`;
    expect(toAccessibilityYaml(xml)).toBe('- button "OK"');
  });

  it('recursively collapses a deep chain of anonymous containers', () => {
    const xml = `<AppiumAUT>
      <XCUIElementTypeOther enabled="true" visible="true" x="0" y="0" width="390" height="844">
        <XCUIElementTypeOther enabled="true" visible="true" x="0" y="0" width="390" height="844">
          <XCUIElementTypeOther enabled="true" visible="true" x="0" y="0" width="390" height="844">
            <XCUIElementTypeButton name="Deep" label="Deep" enabled="true" visible="true" x="0" y="0" width="80" height="44"/>
          </XCUIElementTypeOther>
        </XCUIElementTypeOther>
      </XCUIElementTypeOther>
    </AppiumAUT>`;
    expect(toAccessibilityYaml(xml)).toBe('- button "Deep"');
  });

  it('keeps anonymous container when it has multiple non-empty children', () => {
    const xml = `<AppiumAUT>
      <XCUIElementTypeOther enabled="true" visible="true" x="0" y="0" width="390" height="844">
        <XCUIElementTypeButton name="A" label="A" enabled="true" visible="true" x="0" y="0" width="80" height="44"/>
        <XCUIElementTypeButton name="B" label="B" enabled="true" visible="true" x="0" y="80" width="80" height="44"/>
      </XCUIElementTypeOther>
    </AppiumAUT>`;
    expect(toAccessibilityYaml(xml)).toBe(
      ['- other:', '  - button "A"', '  - button "B"'].join('\n'),
    );
  });

  it('preserves the subtree structure when collapsing', () => {
    // anonymous wrapper → named parent with children → collapse wrapper
    const xml = `<AppiumAUT>
      <XCUIElementTypeOther enabled="true" visible="true" x="0" y="0" width="390" height="844">
        <XCUIElementTypeApplication name="App" label="App" enabled="true" visible="true" x="0" y="0" width="390" height="844">
          <XCUIElementTypeButton name="OK" label="OK" enabled="true" visible="true" x="0" y="0" width="80" height="44"/>
        </XCUIElementTypeApplication>
      </XCUIElementTypeOther>
    </AppiumAUT>`;
    expect(toAccessibilityYaml(xml)).toBe(
      ['- application "App":', '  - button "OK"'].join('\n'),
    );
  });

  it('does not collapse anonymous node that has states', () => {
    const xml = `<AppiumAUT>
      <XCUIElementTypeOther enabled="false" visible="true" x="0" y="0" width="390" height="44">
        <XCUIElementTypeButton name="OK" label="OK" enabled="true" visible="true" x="0" y="0" width="80" height="44"/>
      </XCUIElementTypeOther>
    </AppiumAUT>`;
    // The other has [disabled] state → kept as a container
    const result = toAccessibilityYaml(xml);
    expect(result).toContain('other [disabled]:');
    expect(result).toContain('button "OK"');
  });
});

// ─── Empty / degenerate input ─────────────────────────────────────────────────

describe('edge cases', () => {
  it('returns empty string for empty input', () => {
    expect(toAccessibilityYaml('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(toAccessibilityYaml('   \n  ')).toBe('');
  });

  it('handles a single self-closing root element', () => {
    const xml = `<XCUIElementTypeButton name="OK" label="OK" enabled="true" visible="true" x="0" y="0" width="80" height="44"/>`;
    expect(toAccessibilityYaml(xml)).toBe('- button "OK"');
  });
});
