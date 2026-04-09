/**
 * HTML to Markdown converter.
 *
 * Converts XHTML chapter content from EPUB files into clean Markdown.
 * Inspired by tepub's markdown_export.py which uses html2text.
 * This is a browser-native implementation using DOM parsing.
 */

/**
 * Convert HTML string to Markdown.
 *
 * @param {string} html - HTML content to convert.
 * @returns {string} Markdown formatted text.
 */
export function htmlToMarkdown(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;
  if (!body) return '';

  return convertNode(body).trim();
}

function convertNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent.replace(/\s+/g, ' ');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName.toLowerCase();
  const children = () => convertChildren(node);

  switch (tag) {
    case 'h1': return `\n\n# ${children().trim()}\n\n`;
    case 'h2': return `\n\n## ${children().trim()}\n\n`;
    case 'h3': return `\n\n### ${children().trim()}\n\n`;
    case 'h4': return `\n\n#### ${children().trim()}\n\n`;
    case 'h5': return `\n\n##### ${children().trim()}\n\n`;
    case 'h6': return `\n\n###### ${children().trim()}\n\n`;

    case 'p':
    case 'div':
    case 'section':
    case 'article': {
      const text = children().trim();
      return text ? `\n\n${text}\n\n` : '';
    }

    case 'br': return '\n';

    case 'strong':
    case 'b': {
      const text = children().trim();
      return text ? `**${text}**` : '';
    }

    case 'em':
    case 'i': {
      const text = children().trim();
      return text ? `*${text}*` : '';
    }

    case 'a': {
      const href = node.getAttribute('href');
      const text = children().trim();
      if (href && !href.startsWith('#')) return `[${text}](${href})`;
      return text;
    }

    case 'img': {
      const src = node.getAttribute('src') || '';
      const alt = node.getAttribute('alt') || 'image';
      return `\n\n![${alt}](${src})\n\n`;
    }

    case 'blockquote': {
      const text = children().trim();
      const lines = text.split('\n').map(l => `> ${l}`);
      return `\n\n${lines.join('\n')}\n\n`;
    }

    case 'pre': {
      const code = node.querySelector('code');
      const text = code ? code.textContent : node.textContent;
      return `\n\n\`\`\`\n${text}\n\`\`\`\n\n`;
    }

    case 'code': {
      // Inline code (not inside pre)
      if (node.parentElement?.tagName?.toLowerCase() !== 'pre') {
        return `\`${node.textContent}\``;
      }
      return node.textContent;
    }

    case 'ul': {
      const items = Array.from(node.children)
        .filter(c => c.tagName?.toLowerCase() === 'li')
        .map(li => `- ${convertChildren(li).trim()}`);
      return `\n\n${items.join('\n')}\n\n`;
    }

    case 'ol': {
      const items = Array.from(node.children)
        .filter(c => c.tagName?.toLowerCase() === 'li')
        .map((li, i) => `${i + 1}. ${convertChildren(li).trim()}`);
      return `\n\n${items.join('\n')}\n\n`;
    }

    case 'li': return children();

    case 'hr': return '\n\n---\n\n';

    case 'table': return convertTable(node);

    case 'sup': return `^${children().trim()}`;
    case 'sub': return `~${children().trim()}`;

    case 'span':
    case 'small':
    case 'mark':
      return children();

    // Skip non-content elements
    case 'style':
    case 'script':
    case 'head':
    case 'meta':
    case 'link':
      return '';

    default:
      return children();
  }
}

function convertChildren(node) {
  let result = '';
  for (const child of node.childNodes) {
    result += convertNode(child);
  }
  return result;
}

function convertTable(table) {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const data = rows.map(row =>
    Array.from(row.querySelectorAll('th, td')).map(cell =>
      convertChildren(cell).trim().replace(/\|/g, '\\|')
    )
  );

  const maxCols = Math.max(...data.map(r => r.length));

  // Pad rows
  for (const row of data) {
    while (row.length < maxCols) row.push('');
  }

  let md = '\n\n';
  md += '| ' + data[0].join(' | ') + ' |\n';
  md += '| ' + data[0].map(() => '---').join(' | ') + ' |\n';
  for (let i = 1; i < data.length; i++) {
    md += '| ' + data[i].join(' | ') + ' |\n';
  }
  md += '\n';
  return md;
}

/**
 * Clean up markdown: normalize whitespace, remove excess blank lines.
 */
export function cleanMarkdown(md) {
  return md
    .replace(/\n{3,}/g, '\n\n')  // Max 2 consecutive newlines
    .replace(/^\s+/, '')           // Trim leading whitespace
    .replace(/\s+$/, '\n');        // Trim trailing, keep one newline
}
