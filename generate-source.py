#!/usr/bin/env python3
"""
generate-source.py — builds test/index.html from src/ files.

test/index.html is a derived file. Do not edit it directly.
Run: python3 generate-source.py
Then: python3 build-watch.sh
"""

import os
import re

SRC_DIR = os.path.join(os.path.dirname(__file__), 'src')
OUT_FILE = os.path.join(os.path.dirname(__file__), 'test', 'index.html')

# Source files in dependency order
SRC_FILES = [
    'constants.js',
    'storage.js',
    'audio.js',
    'useInteraction.js',
    'useDrumTimer.js',
    'components/NumpadComponents.jsx',
    'components/BarProgress.jsx',
    'components/CompactSelector.jsx',
    'components/App.jsx',
]

HTML_HEAD = '''\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Shuffle" />
  <meta name="description" content="Randomise your exercises and keep time with Shuffle — a free tool that helps musicians practise more effectively." />
  <meta property="og:title" content="Shuffle" />
  <meta property="og:description" content="Randomise your exercises and keep time with Shuffle — a free tool that helps musicians practise more effectively." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://shuffleclick.com" />
  <meta property="og:image" content="https://shuffleclick.com/shuffle-icon.png" />
  <title>Shuffle</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow:wght@300;400;600&display=swap" rel="stylesheet" />
  <link rel="apple-touch-icon" href="https://shuffleclick.com/test/shuffle-icon-beta.png?v=9" />
  <link rel="apple-touch-icon" sizes="512x512" href="https://shuffleclick.com/test/shuffle-icon-beta.png?v=9" />
  <link rel="icon" href="https://shuffleclick.com/test/shuffle-icon-beta.png?v=9" />
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
'''

HTML_STANDALONE_SCRIPT = '''\
  <script>if (!navigator.standalone) document.documentElement.classList.add('browser-mode');</script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useRef, useCallback } = React;
'''

HTML_BOOTSTRAP = '''\
    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(<App />);
  </script>
  <p style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;">Randomise your exercises and keep time with Shuffle — a free tool that helps musicians practise more effectively. Set a range of exercises, choose a BPM, and let Shuffle run your session.</p>
  <script data-goatcounter="https://shuffle.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
'''

HTML_FOOT = '''\
</body>
</html>
'''

# Strip all import statements (single-line and multi-line)
# Matches: import ... from '...'; — including multi-line forms like:
#   import {
#     foo, bar,
#   } from './module.js';
# Also matches bare: import '../styles.css';
IMPORT_RE = re.compile(
    r"^import\s+"           # import keyword
    r"(?:"
    r"[^'\"]*?"             # anything before the module path (single-line form)
    r"|"
    r"\{[^}]*?\}"           # { ... } block (possibly multi-line)
    r"[^'\"]*?"
    r")"
    r"from\s+['\"][^'\"]*['\"];\s*\n?"  # from '...' or "...";
    r"|"
    r"^import\s+['\"][^'\"]*['\"];\s*\n?",  # bare import './styles.css';
    re.MULTILINE | re.DOTALL
)

# Replace: export function / export const / export class → remove export keyword
EXPORT_DECL = re.compile(r"^export\s+(function|const|class|async\s+function)\s+", re.MULTILINE)

def transform(source):
    source = IMPORT_RE.sub('', source)
    # Remove 'export default' keyword
    source = re.sub(r"^export\s+default\s+", '', source, flags=re.MULTILINE)
    # Remove 'export' from declarations
    source = EXPORT_DECL.sub(lambda m: m.group(1) + ' ', source)
    return source

def indent(source, spaces=4):
    pad = ' ' * spaces
    lines = source.splitlines(keepends=True)
    return ''.join(pad + line if line.strip() else line for line in lines)

def main():
    parts = [HTML_HEAD]

    # Inline CSS
    css_path = os.path.join(SRC_DIR, 'styles.css')
    with open(css_path, 'r', encoding='utf-8') as f:
        css = f.read()
    parts.append('  <style>\n')
    parts.append(css)
    parts.append('  </style>\n')

    parts.append(HTML_STANDALONE_SCRIPT)

    for rel_path in SRC_FILES:
        src_path = os.path.join(SRC_DIR, rel_path)
        with open(src_path, 'r', encoding='utf-8') as f:
            source = f.read()
        source = transform(source)
        source = source.strip('\n')
        # Indent each file's content by 4 spaces to match the script block
        indented = indent(source + '\n', spaces=4)
        parts.append('\n')
        parts.append(indented)

    parts.append('\n')
    parts.append(HTML_BOOTSTRAP)
    parts.append(HTML_FOOT)

    out = ''.join(parts)

    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        f.write(out)

    print(f'Written: {OUT_FILE}')

    # Sanity checks
    anchor = '    const { useState, useEffect, useRef, useCallback } = React;\n'
    count = out.count(anchor)
    if count != 1:
        print(f'WARNING: React destructuring anchor appears {count} times (expected 1)')
    else:
        print('OK: React destructuring anchor appears exactly once')

    if 'keepCtxAlive' not in out:
        print('NOTE: keepCtxAlive not found — run build-watch.sh to check watch patches')

if __name__ == '__main__':
    main()
