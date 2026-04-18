interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

function parseAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:.-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]!] = m[2]!;
  }
  return attrs;
}

function parseXml(xml: string): XmlNode | null {
  const content = xml.replace(/<\?[^?]*\?>/g, '').trim();
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;

  const tagRe = /<[^>]+>/g;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(content)) !== null) {
    const raw = m[0];

    if (raw.startsWith('<!') || raw.startsWith('<?')) continue;

    if (raw.startsWith('</')) {
      stack.pop();
      continue;
    }

    const selfClosing = raw.trimEnd().endsWith('/>');
    const inner = selfClosing
      ? raw.slice(1, raw.lastIndexOf('/>')).trim()
      : raw.slice(1, -1).trim();

    const spaceIdx = inner.search(/\s/);
    const tag = spaceIdx === -1 ? inner : inner.slice(0, spaceIdx);
    const attrStr = spaceIdx === -1 ? '' : inner.slice(spaceIdx + 1);

    const node: XmlNode = { tag, attrs: parseAttributes(attrStr), children: [] };

    if (stack.length > 0) {
      stack[stack.length - 1]!.children.push(node);
    } else {
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

function getStates(node: XmlNode, name: string | null): string[] {
  const { attrs } = node;
  const states: string[] = [];

  if (attrs['enabled'] === 'false') states.push('disabled');
  if (attrs['checked'] === 'true') states.push('checked');
  if (attrs['selected'] === 'true') states.push('selected');
  if (attrs['focused'] === 'true') states.push('focused');

  const label = attrs['label'];
  if (label && label !== '' && label !== name) states.push(`label="${label}"`);

  const val = attrs['value'];
  if (val && val !== '' && val !== name) states.push(`value="${val}"`);

  return states;
}

function renderNode(node: XmlNode, depth: number): string[] {
  if (WRAPPER_TAGS.has(node.tag)) {
    return node.children.flatMap(c => renderNode(c, depth));
  }

  const name = getName(node);
  const states = getStates(node, name);

  const renderedChildren = node.children.map(c => renderNode(c, depth + 1));
  const nonEmptyChildren = renderedChildren.filter(lines => lines.length > 0);

  // Anonymous leaf → drop entirely
  if (!name && states.length === 0 && nonEmptyChildren.length === 0) return [];

  // Anonymous single-child container → transparent passthrough (shift child up one level)
  if (!name && states.length === 0 && nonEmptyChildren.length === 1) {
    return nonEmptyChildren[0]!.map(line => line.slice(2));
  }

  const role = getRole(node);
  const childLines = nonEmptyChildren.flat();
  const namePart = name ? ` "${name}"` : '';
  const statePart = states.length ? ` [${states.join(', ')}]` : '';
  const colon = childLines.length > 0 ? ':' : '';
  const prefix = '  '.repeat(depth) + '- ';

  return [`${prefix}${role}${namePart}${statePart}${colon}`, ...childLines];
}

export function toAccessibilityYaml(xml: string): string {
  const root = parseXml(xml);
  if (!root) return '';
  return renderNode(root, 0).join('\n');
}
