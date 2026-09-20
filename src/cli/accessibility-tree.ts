interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

export interface TreeOptions {
  /** Include on-screen coordinates so callers can tap without a find-element round trip. */
  bounds?: boolean;
  /**
   * Collapse runs of structurally identical siblings (list rows) down to one
   * full example plus a line of differences each. Defaults to on; callers that
   * need the literal hierarchy can turn it off.
   */
  collapse?: boolean;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  if (!value.includes('&')) return value;
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return ENTITIES[body] ?? match;
  });
}

function parseAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]!] = decodeEntities(m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/**
 * Scans forward from `<` to the matching `>`, skipping any `>` that sits inside
 * a quoted attribute value. XML does not require `>` to be escaped in attribute
 * values, and Android `text` attributes routinely contain one — a naive
 * `/<[^>]+>/` regex truncates the tag there and drops the element entirely.
 */
function findTagEnd(content: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < content.length; i++) {
    const ch = content[i]!;
    if (quote !== null) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') return i;
  }
  return -1;
}

function parseXml(xml: string): XmlNode | null {
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  let i = 0;

  while (i < xml.length) {
    const open = xml.indexOf('<', i);
    if (open === -1) break;

    // Skip comments, CDATA and doctype/processing instructions wholesale so
    // their contents can never be mistaken for markup.
    if (xml.startsWith('<!--', open)) {
      const end = xml.indexOf('-->', open);
      i = end === -1 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', open)) {
      const end = xml.indexOf(']]>', open);
      i = end === -1 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith('<?', open)) {
      const end = xml.indexOf('?>', open);
      i = end === -1 ? xml.length : end + 2;
      continue;
    }
    if (xml.startsWith('<!', open)) {
      const end = findTagEnd(xml, open);
      i = end === -1 ? xml.length : end + 1;
      continue;
    }

    const close = findTagEnd(xml, open);
    if (close === -1) break;

    const raw = xml.slice(open, close + 1);
    i = close + 1;

    if (raw.startsWith('</')) {
      // Popping on any closing tag lets one stray `</b>` reparent every later
      // sibling under the wrong node. Only unwind as far as a real match.
      const closing = raw.slice(2, -1).trim();
      for (let depth = stack.length - 1; depth >= 0; depth--) {
        if (stack[depth]!.tag === closing) {
          stack.length = depth;
          break;
        }
      }
      continue;
    }

    const selfClosing = raw.slice(0, -1).trimEnd().endsWith('/');
    const inner = selfClosing
      ? raw.slice(1, raw.lastIndexOf('/')).trim()
      : raw.slice(1, -1).trim();

    const spaceIdx = inner.search(/\s/);
    const tag = spaceIdx === -1 ? inner : inner.slice(0, spaceIdx);
    const attrStr = spaceIdx === -1 ? '' : inner.slice(spaceIdx + 1);

    const node: XmlNode = { tag, attrs: parseAttributes(attrStr), children: [] };

    if (stack.length > 0) {
      stack[stack.length - 1]!.children.push(node);
    } else if (root === null) {
      root = node;
    }

    if (!selfClosing) stack.push(node);
  }

  return root;
}

const WRAPPER_TAGS = new Set(['AppiumAUT', 'hierarchy']);

function getRole(node: XmlNode): string {
  const { tag, attrs } = node;

  if (tag.startsWith('XCUIElementType')) {
    return tag.slice('XCUIElementType'.length).toLowerCase();
  }

  // Android: tag IS the fully-qualified class name; class attr matches
  const cls = attrs['class'] ?? tag;
  const parts = cls.split('.');
  return (parts[parts.length - 1] ?? cls).toLowerCase();
}

function getName(node: XmlNode): string | null {
  const { attrs } = node;
  // iOS: name is the accessibility identifier (used as selector), label is human-readable
  return attrs['name'] || attrs['content-desc'] || attrs['text'] || null;
}

/**
 * iOS marks off-screen nodes with `visible="false"`; UiAutomator2 uses
 * `displayed="false"`. Honouring only one of them leaks hidden elements into
 * the tree on the other platform.
 */
function isHidden(node: XmlNode): boolean {
  return node.attrs['visible'] === 'false' || node.attrs['displayed'] === 'false';
}

/** Android reports `bounds="[x1,y1][x2,y2]"`; iOS uses discrete attributes. */
function getRect(
  node: XmlNode,
): { x: number; y: number; width: number; height: number } | null {
  const bounds = node.attrs['bounds'];
  if (bounds !== undefined) {
    const m = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(bounds);
    if (m) {
      const x1 = Number(m[1]);
      const y1 = Number(m[2]);
      const x2 = Number(m[3]);
      const y2 = Number(m[4]);
      return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    }
  }

  const { x, y, width, height } = node.attrs;
  if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
    const rect = {
      x: Number(x),
      y: Number(y),
      width: Number(width),
      height: Number(height),
    };
    // A non-numeric attribute yields NaN, which slips past the `<= 0` size
    // check in getBoundsParts and renders as "@NaN,NaN".
    return Object.values(rect).every(Number.isFinite) ? rect : null;
  }

  return null;
}

function getStates(node: XmlNode, name: string | null): string[] {
  const { attrs } = node;
  const states: string[] = [];

  if (attrs['enabled'] === 'false') states.push('disabled');
  if (attrs['checked'] === 'true') states.push('checked');
  if (attrs['selected'] === 'true') states.push('selected');
  if (attrs['focused'] === 'true') states.push('focused');
  if (attrs['scrollable'] === 'true') states.push('scrollable');
  if (attrs['clickable'] === 'true') states.push('clickable');
  if (attrs['password'] === 'true') states.push('password');

  const label = attrs['label'];
  if (label && label !== '' && label !== name) states.push(`label="${label}"`);

  const val = attrs['value'];
  if (val && val !== '' && val !== name) states.push(`value="${val}"`);

  const hint = attrs['hint'];
  if (hint && hint !== '' && hint !== name) states.push(`hint="${hint}"`);

  const resourceId = attrs['resource-id'];
  if (resourceId && resourceId !== '') {
    const shortId = resourceId.includes(':id/')
      ? resourceId.split(':id/')[1]!
      : resourceId;
    states.push(`id="${shortId}"`);
  }

  return states;
}

/**
 * Coordinates are rendered but deliberately excluded from `getStates`: they
 * apply to every node, so counting them as state would stop anonymous wrapper
 * nodes collapsing and bury the tree in layout containers.
 *
 * The `@cx,cy WxH` shorthand is deliberately terse — these repeat on every
 * annotated node, so the long `at=…, size=…` spelling cost more in an agent's
 * context than it bought in readability.
 */
function getBoundsParts(node: XmlNode): string[] {
  const rect = getRect(node);
  if (rect === null || rect.width <= 0 || rect.height <= 0) return [];

  const cx = Math.round(rect.x + rect.width / 2);
  const cy = Math.round(rect.y + rect.height / 2);
  return [`@${cx},${cy} ${rect.width}x${rect.height}`];
}

/**
 * The parts of a rendered line that vary between otherwise identical siblings:
 * quoted text (names, labels, values, ids) and `--bounds` coordinates. Anything
 * outside these is structure, and structure is what collapseRuns deduplicates.
 */
const VARIABLE_TOKEN = /"[^"]*"|@-?\d+,-?\d+ -?\d+x-?\d+/g;

/** Two subtrees share a shape when they differ only in their variable tokens. */
function shapeOf(lines: string[]): string {
  return lines.join('\n').replace(VARIABLE_TOKEN, '\u0000');
}

function tokensOf(lines: string[]): string[] {
  return lines.join('\n').match(VARIABLE_TOKEN) ?? [];
}

/** A run shorter than this is cheaper to print in full than to explain. */
const MIN_RUN = 3;

/** Stands in for a token a sibling shares with the example above it. */
const SAME = '=';

/**
 * List rows dominate a real page source: twenty-five cells that differ only in
 * their text still cost twenty-five copies of the same scaffolding. Render the
 * first of a run in full and reduce the rest to the tokens that actually differ
 * from it, which is the only part a caller can build a selector from.
 *
 * Single-line siblings are left alone — `- [1] "Item 1"` is no shorter than the
 * `- cell "Item 1"` it would replace, and it reads worse.
 */
function collapseRuns(groups: string[][]): string[] {
  const out: string[] = [];
  let i = 0;

  while (i < groups.length) {
    const first = groups[i]!;
    const shape = shapeOf(first);

    let end = i + 1;
    while (end < groups.length && shapeOf(groups[end]!) === shape) end++;
    const run = end - i;

    if (run < MIN_RUN || first.length < 2) {
      for (let k = i; k < end; k++) out.push(...groups[k]!);
      i = end;
      continue;
    }

    const indent = /^\s*/.exec(first[0]!)![0];
    const baseline = tokensOf(first);
    out.push(...first);
    // `[n]` counts siblings inside this run — it is not a `find-element --index`,
    // which counts matches of one selector across the whole hierarchy.
    out.push(
      `${indent}# +${run - 1} same-shape siblings; [n] is the sibling position, ` +
        `tokens align with the example above, "${SAME}" means unchanged:`,
    );

    for (let k = i + 1; k < end; k++) {
      // Dropping unchanged tokens instead of marking them would leave the rest
      // to be matched against the example by position — and a coordinate
      // attributed to the wrong child is a tap on the wrong thing.
      const detail = tokensOf(groups[k]!)
        .map((tok, idx) => (tok === baseline[idx] ? SAME : tok))
        .join(' ');
      out.push(`${indent}- [${k - i}] ${detail}`);
    }

    i = end;
  }

  return out;
}

function renderNode(node: XmlNode, depth: number, options: TreeOptions): string[] {
  if (WRAPPER_TAGS.has(node.tag)) {
    return node.children.flatMap((c) => renderNode(c, depth, options));
  }

  if (isHidden(node)) return [];

  const name = getName(node);
  const states = getStates(node, name);

  const renderedChildren = node.children.map((c) => renderNode(c, depth + 1, options));
  const nonEmptyChildren = renderedChildren.filter((lines) => lines.length > 0);
  const childLines =
    options.collapse === false ? nonEmptyChildren.flat() : collapseRuns(nonEmptyChildren);

  // An anonymous, stateless node carries nothing a selector could target, so it
  // is a transparent passthrough whatever its child count: its children shift up
  // one level and it disappears. With no children left that prunes it entirely.
  if (!name && states.length === 0) {
    return childLines.map((line) => line.slice(2));
  }

  const role = getRole(node);
  const namePart = name ? ` "${name}"` : '';
  const annotations =
    options.bounds === true && isTapTarget(node, nonEmptyChildren.length)
      ? [...states, ...getBoundsParts(node)]
      : states;
  const statePart = annotations.length ? ` [${annotations.join(', ')}]` : '';
  const colon = childLines.length > 0 ? ':' : '';
  const prefix = '  '.repeat(depth) + '- ';

  return [`${prefix}${role}${namePart}${statePart}${colon}`, ...childLines];
}

/**
 * Coordinates only help on something you would actually tap. Layout containers
 * wrapping half the screen have a centre point too, and annotating them buried
 * the real targets — so a node earns bounds by being explicitly clickable or by
 * being a leaf, which is what every iOS control renders as.
 */
function isTapTarget(node: XmlNode, childCount: number): boolean {
  return node.attrs['clickable'] === 'true' || childCount === 0;
}

export function toAccessibilityYaml(xml: string, options: TreeOptions = {}): string {
  const root = parseXml(xml);
  if (!root) return '';
  return renderNode(root, 0, options).join('\n');
}
