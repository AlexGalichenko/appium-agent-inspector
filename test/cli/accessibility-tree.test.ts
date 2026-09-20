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
    // The framelayout below it is anonymous and stateless, so it flattens too
    // and the first real element surfaces at the root.
    const result = toAccessibilityYaml(ANDROID_SIMPLE);
    expect(result).toMatch(/^- button "Login"/);
    expect(result).not.toContain('hierarchy');
  });
});

// ─── iOS tree structure ───────────────────────────────────────────────────────

describe('iOS simple tree', () => {
  it('renders the full indented tree (anonymous window collapsed)', () => {
    // XCUIElementTypeWindow has no name → single-child passthrough → button promoted
    expect(toAccessibilityYaml(IOS_SIMPLE)).toBe(
      ['- application "MyApp":', '  - button "Back"'].join('\n'),
    );
  });
});

// ─── Android tree structure ───────────────────────────────────────────────────

describe('Android simple tree', () => {
  it('flattens the anonymous framelayout and renders its children', () => {
    expect(toAccessibilityYaml(ANDROID_SIMPLE)).toBe(
      [
        '- button "Login" [clickable, id="btn_login"]',
        '- checkbox "Remember me" [checked]',
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

  it('flattens an anonymous container that has several children', () => {
    // It carries no name, id or state, so there is nothing to target it by and
    // nothing lost by lifting its children into its place.
    const xml = `<AppiumAUT>
      <XCUIElementTypeOther enabled="true" visible="true" x="0" y="0" width="390" height="844">
        <XCUIElementTypeButton name="A" label="A" enabled="true" visible="true" x="0" y="0" width="80" height="44"/>
        <XCUIElementTypeButton name="B" label="B" enabled="true" visible="true" x="0" y="80" width="80" height="44"/>
      </XCUIElementTypeOther>
    </AppiumAUT>`;
    expect(toAccessibilityYaml(xml)).toBe(['- button "A"', '- button "B"'].join('\n'));
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

// ---------------------------------------------------------------------------
// Parser robustness — each case here silently dropped or mangled elements
// before the parser became quote-aware and entity-decoding.
// ---------------------------------------------------------------------------

describe('attribute values containing markup characters', () => {
  it('keeps an element whose text contains a bare ">"', () => {
    const xml =
      '<hierarchy><android.widget.TextView text="a > b"/>' +
      '<android.widget.Button content-desc="OK"/></hierarchy>';
    const out = toAccessibilityYaml(xml);
    expect(out).toContain('"a > b"');
    expect(out).toContain('"OK"');
  });

  it('keeps siblings after an element whose text contains ">"', () => {
    const xml =
      '<hierarchy><android.widget.TextView text="Next >"/>' +
      '<android.widget.TextView text="After"/></hierarchy>';
    expect(toAccessibilityYaml(xml)).toContain('"After"');
  });

  it('handles a "<" inside an attribute value', () => {
    const xml = '<hierarchy><android.widget.TextView text="1 &lt; 2"/></hierarchy>';
    expect(toAccessibilityYaml(xml)).toContain('"1 < 2"');
  });

  it('supports single-quoted attribute values', () => {
    const xml = "<hierarchy><android.widget.Button content-desc='Save'/></hierarchy>";
    expect(toAccessibilityYaml(xml)).toContain('"Save"');
  });
});

describe('XML entity decoding', () => {
  it('decodes named entities in names', () => {
    const xml =
      '<hierarchy><android.widget.TextView text="5 &gt; 3 &amp; rising"/></hierarchy>';
    expect(toAccessibilityYaml(xml)).toContain('"5 > 3 & rising"');
  });

  it('decodes quotes and apostrophes', () => {
    const xml =
      '<hierarchy><android.widget.TextView text="&quot;hi&quot; &apos;there&apos;"/></hierarchy>';
    expect(toAccessibilityYaml(xml)).toContain('"hi" \'there\'');
  });

  it('decodes decimal and hex numeric entities', () => {
    const xml = '<hierarchy><android.widget.TextView text="&#65;&#x42;"/></hierarchy>';
    expect(toAccessibilityYaml(xml)).toContain('"AB"');
  });

  it('leaves an unknown entity untouched rather than corrupting the text', () => {
    const xml = '<hierarchy><android.widget.TextView text="&nope; ok"/></hierarchy>';
    expect(toAccessibilityYaml(xml)).toContain('"&nope; ok"');
  });
});

describe('hidden element filtering', () => {
  it('drops iOS nodes marked visible="false"', () => {
    const xml =
      '<hierarchy><XCUIElementTypeButton name="Hidden" visible="false"/>' +
      '<XCUIElementTypeButton name="Shown" visible="true"/></hierarchy>';
    const out = toAccessibilityYaml(xml);
    expect(out).not.toContain('Hidden');
    expect(out).toContain('Shown');
  });

  it('drops Android nodes marked displayed="false"', () => {
    const xml =
      '<hierarchy><android.widget.TextView text="Hidden" displayed="false"/>' +
      '<android.widget.TextView text="Shown" displayed="true"/></hierarchy>';
    const out = toAccessibilityYaml(xml);
    expect(out).not.toContain('Hidden');
    expect(out).toContain('Shown');
  });
});

describe('comments, CDATA and declarations', () => {
  it('ignores comments, including ones containing tags', () => {
    const xml =
      '<hierarchy><!-- <android.widget.Button content-desc="Ghost"/> -->' +
      '<android.widget.Button content-desc="Real"/></hierarchy>';
    const out = toAccessibilityYaml(xml);
    expect(out).not.toContain('Ghost');
    expect(out).toContain('Real');
  });

  it('ignores the XML declaration', () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><hierarchy><android.widget.Button content-desc="Go"/></hierarchy>';
    expect(toAccessibilityYaml(xml)).toContain('"Go"');
  });

  it('returns an empty string for input with no elements', () => {
    expect(toAccessibilityYaml('<?xml version="1.0"?>')).toBe('');
  });
});

describe('bounds option', () => {
  it('emits centre point and size from Android bounds', () => {
    const xml =
      '<hierarchy><android.widget.Button content-desc="Tap" bounds="[10,20][110,70]"/></hierarchy>';
    const out = toAccessibilityYaml(xml, { bounds: true });
    expect(out).toContain('@60,45 100x50');
  });

  it('emits centre point and size from iOS x/y/width/height', () => {
    const xml =
      '<hierarchy><XCUIElementTypeButton name="Tap" x="0" y="100" width="200" height="40"/></hierarchy>';
    const out = toAccessibilityYaml(xml, { bounds: true });
    expect(out).toContain('@100,120 200x40');
  });

  it('omits coordinates unless asked for', () => {
    const xml =
      '<hierarchy><android.widget.Button content-desc="Tap" bounds="[10,20][110,70]"/></hierarchy>';
    expect(toAccessibilityYaml(xml)).not.toContain('@');
  });

  it('skips zero-area elements', () => {
    const xml =
      '<hierarchy><android.widget.Button content-desc="Tap" bounds="[10,20][10,20]"/></hierarchy>';
    expect(toAccessibilityYaml(xml, { bounds: true })).not.toContain('@');
  });
});

// ─── Repeated-sibling collapsing ──────────────────────────────────────────────

/** A list of `count` rows that differ only in their title text. */
function androidRows(count: number): string {
  const rows = Array.from(
    { length: count },
    (_, i) =>
      `<android.widget.FrameLayout class="android.widget.FrameLayout" resource-id="com.example:id/row" clickable="true" enabled="true" bounds="[0,${300 + i * 180}][1080,${470 + i * 180}]" displayed="true">` +
      `<android.widget.TextView class="android.widget.TextView" text="Item ${i}" resource-id="com.example:id/title" enabled="true" bounds="[180,${315 + i * 180}][800,${370 + i * 180}]" displayed="true"/>` +
      `<android.widget.Button class="android.widget.Button" text="Add" resource-id="com.example:id/add" clickable="true" enabled="true" bounds="[880,${340 + i * 180}][1040,${430 + i * 180}]" displayed="true"/>` +
      `</android.widget.FrameLayout>`,
  ).join('');
  return `<hierarchy><androidx.recyclerview.widget.RecyclerView class="androidx.recyclerview.widget.RecyclerView" resource-id="com.example:id/list" scrollable="true" enabled="true" bounds="[0,280][1080,2400]" displayed="true">${rows}</androidx.recyclerview.widget.RecyclerView></hierarchy>`;
}

describe('repeated sibling collapsing', () => {
  it('renders the first row in full and reduces the rest to their differences', () => {
    expect(toAccessibilityYaml(androidRows(4))).toBe(
      [
        '- recyclerview [scrollable, id="list"]:',
        '  - framelayout [clickable, id="row"]:',
        '    - textview "Item 0" [id="title"]',
        '    - button "Add" [clickable, id="add"]',
        '  # +3 same-shape siblings; [n] is the sibling position, tokens align with the example above, "=" means unchanged:',
        '  - [1] = "Item 1" = = =',
        '  - [2] = "Item 2" = = =',
        '  - [3] = "Item 3" = = =',
      ].join('\n'),
    );
  });

  it('leaves a run shorter than three siblings alone', () => {
    const rendered = toAccessibilityYaml(androidRows(2));
    expect(rendered).not.toContain('same-shape siblings');
    expect(rendered).toContain('"Item 0"');
    expect(rendered).toContain('"Item 1"');
  });

  it('lists every sibling in full when collapsing is turned off', () => {
    const rendered = toAccessibilityYaml(androidRows(4), { collapse: false });
    expect(rendered).not.toContain('same-shape siblings');
    for (const i of [0, 1, 2, 3]) {
      expect(rendered).toContain(`- textview "Item ${i}" [id="title"]`);
    }
  });

  it('does not collapse single-line siblings, which a summary would not shorten', () => {
    const cells = Array.from(
      { length: 4 },
      (_, i) =>
        `<XCUIElementTypeCell name="Row ${i}" x="0" y="${i * 40}" width="390" height="40"/>`,
    ).join('');
    const xml = `<hierarchy><XCUIElementTypeTable name="List" x="0" y="0" width="390" height="844">${cells}</XCUIElementTypeTable></hierarchy>`;
    const rendered = toAccessibilityYaml(xml);
    expect(rendered).not.toContain('same-shape siblings');
    expect(rendered).toContain('- cell "Row 3"');
  });

  it("keeps each sibling's coordinates distinguishable under --bounds", () => {
    const rendered = toAccessibilityYaml(androidRows(4), { bounds: true });
    // Row 1 sits 180px below row 0, so its own centre must survive the collapse.
    expect(rendered).toContain('- framelayout [clickable, id="row", @540,385 1080x170]:');
    expect(rendered).toContain('@540,565 1080x170');
  });

  it('marks a sibling that differs in nothing at all', () => {
    const row =
      '<android.widget.FrameLayout class="android.widget.FrameLayout" resource-id="com.example:id/row" enabled="true">' +
      '<android.widget.TextView class="android.widget.TextView" text="Same" enabled="true"/>' +
      '<android.widget.Button class="android.widget.Button" text="Go" enabled="true"/>' +
      '</android.widget.FrameLayout>';
    const xml = `<hierarchy><android.widget.LinearLayout class="android.widget.LinearLayout" resource-id="com.example:id/list" enabled="true">${row.repeat(3)}</android.widget.LinearLayout></hierarchy>`;
    const rendered = toAccessibilityYaml(xml);
    expect(rendered).toContain('- [1] = =');
    expect(rendered).toContain('- [2] = =');
  });

  it('does not merge neighbouring runs that have different shapes', () => {
    const cell = (i: number) =>
      `<XCUIElementTypeCell name="A${i}" x="0" y="${i * 40}" width="390" height="40"><XCUIElementTypeStaticText name="T${i}" x="0" y="${i * 40}" width="100" height="40"/></XCUIElementTypeCell>`;
    const other = (i: number) =>
      `<XCUIElementTypeCell name="B${i}" x="0" y="${i * 40}" width="390" height="40"><XCUIElementTypeButton name="U${i}" x="0" y="${i * 40}" width="100" height="40"/></XCUIElementTypeCell>`;
    const xml = `<hierarchy><XCUIElementTypeTable name="List" x="0" y="0" width="390" height="844">${cell(0)}${cell(1)}${cell(2)}${other(3)}${other(4)}${other(5)}</XCUIElementTypeTable></hierarchy>`;
    const rendered = toAccessibilityYaml(xml);
    expect(rendered).toContain('- statictext "T0"');
    expect(rendered).toContain('- button "U3"');
    expect(rendered.match(/same-shape siblings/g)).toHaveLength(2);
  });
});

// ─── Tap-target bounds ────────────────────────────────────────────────────────

describe('bounds are limited to tap targets', () => {
  it('annotates a clickable container but not a plain layout one', () => {
    const xml =
      '<hierarchy><android.widget.LinearLayout class="android.widget.LinearLayout" resource-id="com.example:id/wrap" enabled="true" bounds="[0,0][1080,400]">' +
      '<android.widget.FrameLayout class="android.widget.FrameLayout" resource-id="com.example:id/card" clickable="true" enabled="true" bounds="[0,0][1080,200]">' +
      '<android.widget.TextView class="android.widget.TextView" text="Hi" enabled="true" bounds="[10,10][110,60]"/>' +
      '</android.widget.FrameLayout></android.widget.LinearLayout>';
    const rendered = toAccessibilityYaml(xml, { bounds: true });
    // The wrapper has an id, so it survives — but it is not something to tap.
    expect(rendered).toContain('- linearlayout [id="wrap"]:');
    expect(rendered).toContain('[clickable, id="card", @540,100 1080x200]');
    expect(rendered).toContain('- textview "Hi" [@60,35 100x50]');
  });

  it('annotates leaves, which is how every iOS control renders', () => {
    const xml =
      '<hierarchy><XCUIElementTypeCell name="Row" x="0" y="0" width="390" height="80">' +
      '<XCUIElementTypeStaticText name="Label" x="10" y="10" width="100" height="20"/>' +
      '</XCUIElementTypeCell></hierarchy>';
    const rendered = toAccessibilityYaml(xml, { bounds: true });
    expect(rendered).toBe(
      ['- cell "Row":', '  - statictext "Label" [@60,20 100x20]'].join('\n'),
    );
  });
});

describe('malformed markup', () => {
  it('ignores a stray closing tag that matches no open element', () => {
    // Popping unconditionally would unwind the parent and reparent the second
    // button at the root, losing the nesting the caller relies on.
    const xml = `<hierarchy><XCUIElementTypeOther name="Panel"><XCUIElementTypeButton name="A"/></b><XCUIElementTypeButton name="B"/></XCUIElementTypeOther></hierarchy>`;
    expect(toAccessibilityYaml(xml)).toBe(
      ['- other "Panel":', '  - button "A"', '  - button "B"'].join('\n'),
    );
  });

  it('unwinds to the matching ancestor when a closing tag is skipped', () => {
    const xml = `<hierarchy><XCUIElementTypeOther name="Outer"><XCUIElementTypeOther name="Inner"><XCUIElementTypeButton name="A"/></XCUIElementTypeOther><XCUIElementTypeButton name="B"/></XCUIElementTypeOther></hierarchy>`;
    expect(toAccessibilityYaml(xml)).toBe(
      [
        '- other "Outer":',
        '  - other "Inner":',
        '    - button "A"',
        '  - button "B"',
      ].join('\n'),
    );
  });
});

describe('bounds rendering', () => {
  it('omits coordinates entirely without the bounds option', () => {
    const xml = `<hierarchy><XCUIElementTypeButton name="A" x="0" y="0" width="10" height="10"/></hierarchy>`;
    expect(toAccessibilityYaml(xml)).toBe('- button "A"');
  });

  it('renders the centre and size of an iOS rect', () => {
    const xml = `<hierarchy><XCUIElementTypeButton name="A" x="10" y="20" width="100" height="40"/></hierarchy>`;
    expect(toAccessibilityYaml(xml, { bounds: true })).toBe(
      '- button "A" [@60,40 100x40]',
    );
  });

  it('renders the centre and size of an Android bounds attribute', () => {
    const xml = `<hierarchy><android.widget.Button class="android.widget.Button" text="A" bounds="[40,800][1040,960]"/></hierarchy>`;
    expect(toAccessibilityYaml(xml, { bounds: true })).toBe(
      '- button "A" [@540,880 1000x160]',
    );
  });

  it('drops a zero-area rect rather than emitting a useless tap point', () => {
    const xml = `<hierarchy><XCUIElementTypeButton name="A" x="5" y="5" width="0" height="0"/></hierarchy>`;
    expect(toAccessibilityYaml(xml, { bounds: true })).toBe('- button "A"');
  });

  it('drops a rect with non-numeric coordinates instead of printing NaN', () => {
    // A NaN width slips past the `<= 0` area check, so the guard has to reject
    // the rect at parse time or the tree renders "@NaN,NaN".
    const xml = `<hierarchy><XCUIElementTypeButton name="A" x="null" y="20" width="100" height="40"/></hierarchy>`;
    const rendered = toAccessibilityYaml(xml, { bounds: true });
    expect(rendered).not.toMatch(/NaN/);
    expect(rendered).toBe('- button "A"');
  });

  it('drops a rect whose width is non-numeric', () => {
    const xml = `<hierarchy><XCUIElementTypeButton name="A" x="0" y="0" width="auto" height="40"/></hierarchy>`;
    expect(toAccessibilityYaml(xml, { bounds: true })).toBe('- button "A"');
  });
});
