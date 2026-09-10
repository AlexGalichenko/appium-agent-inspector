interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

export interface TreeOptions {
  /** Include on-screen coordinates so callers can tap without a find-element round trip. */
  bounds?: boolean;
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
      stack.pop();
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
    return { x: Number(x), y: Number(y), width: Number(width), height: Number(height) };
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
 */
function getBoundsParts(node: XmlNode): string[] {
  const rect = getRect(node);
  if (rect === null || rect.width <= 0 || rect.height <= 0) return [];

  const cx = Math.round(rect.x + rect.width / 2);
  const cy = Math.round(rect.y + rect.height / 2);
  return [`at=${cx},${cy}`, `size=${rect.width}x${rect.height}`];
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

  // Anonymous leaf → drop entirely
  if (!name && states.length === 0 && nonEmptyChildren.length === 0) return [];

  // Anonymous single-child container → transparent passthrough (shift child up one level)
  if (!name && states.length === 0 && nonEmptyChildren.length === 1) {
    return nonEmptyChildren[0]!.map((line) => line.slice(2));
  }

  const role = getRole(node);
  const childLines = nonEmptyChildren.flat();
  const namePart = name ? ` "${name}"` : '';
  const annotations =
    options.bounds === true ? [...states, ...getBoundsParts(node)] : states;
  const statePart = annotations.length ? ` [${annotations.join(', ')}]` : '';
  const colon = childLines.length > 0 ? ':' : '';
  const prefix = '  '.repeat(depth) + '- ';

  return [`${prefix}${role}${namePart}${statePart}${colon}`, ...childLines];
}

export function toAccessibilityYaml(xml: string, options: TreeOptions = {}): string {
  const root = parseXml(xml);
  if (!root) return '';
  return renderNode(root, 0, options).join('\n');
}
