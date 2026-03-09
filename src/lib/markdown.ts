import { Marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js/lib/core'

// Register languages individually to keep bundle size small
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import sql from 'highlight.js/lib/languages/sql'
import java from 'highlight.js/lib/languages/java'
import cpp from 'highlight.js/lib/languages/cpp'
import c from 'highlight.js/lib/languages/c'
import ruby from 'highlight.js/lib/languages/ruby'
import php from 'highlight.js/lib/languages/php'
import diff from 'highlight.js/lib/languages/diff'
import markdown from 'highlight.js/lib/languages/markdown'
import swift from 'highlight.js/lib/languages/swift'
import kotlin from 'highlight.js/lib/languages/kotlin'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import ini from 'highlight.js/lib/languages/ini'
import makefile from 'highlight.js/lib/languages/makefile'
import shell from 'highlight.js/lib/languages/shell'
import plaintext from 'highlight.js/lib/languages/plaintext'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('java', java)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c', c)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('php', php)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('makefile', makefile)
hljs.registerLanguage('shell', shell)
hljs.registerLanguage('plaintext', plaintext)

// Common aliases
hljs.registerAliases(['js', 'jsx'], { languageName: 'javascript' })
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' })
hljs.registerAliases(['sh', 'zsh'], { languageName: 'bash' })
hljs.registerAliases(['yml'], { languageName: 'yaml' })
hljs.registerAliases(['html'], { languageName: 'xml' })

/**
 * Fix malformed markdown in legacy stored content.
 * New content is normalized server-side before storage; this function exists solely
 * to repair articles saved before those server-side fixes were in place.
 *
 * Repairs applied:
 *  1. [<picture>...<img src>...</picture>](url) → [![alt](src)](url)
 *  2. Standalone <picture>...</picture>         → ![alt](src)
 *  3. Stray <source> tags                       → removed
 *  4. [\n![alt](src)\n](url)                    → [![alt](src)](url)
 *  5. [text\nwith\nnewlines](url)               → [text with newlines](url)
 *
 * Fenced code blocks are preserved untouched.
 */
export function fixLegacyMarkdown(md: string): string {
  // Split on fenced code blocks to avoid transforming HTML examples inside them.
  // Odd-indexed segments are code block content; only process even-indexed (prose) segments.
  const parts = md.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
  for (let i = 0; i < parts.length; i += 2) {
    let s = parts[i]
    // Helper: extract alt text from an <img> tag string
    const extractAlt = (_match: string, imgTag: string) => {
      const altMatch = imgTag.match(/alt=["']([^"']*)["']/i)
      return altMatch?.[1] || ''
    }
    // Pattern 1: markdown link wrapping a <picture> — [<picture>...</picture>](url)
    s = s.replace(
      /\[\s*<picture[^>]*>[\s\S]*?(<img\s[^>]*?src=["']([^"']*)["'][^>]*?>)[\s\S]*?<\/picture>\s*\]\s*\(([^)]*)\)/gi,
      (_m, imgTag, src, url) => `[![${extractAlt(_m, imgTag)}](${src})](${url})`,
    )
    // Pattern 2: standalone <picture> blocks (not wrapped in a link)
    s = s.replace(
      /<picture[^>]*>[\s\S]*?(<img\s[^>]*?src=["']([^"']*)["'][^>]*?>)[\s\S]*?<\/picture>/gi,
      (_m, imgTag, src) => `![${extractAlt(_m, imgTag)}](${src})`,
    )
    // Remove any remaining standalone <source> tags
    s = s.replace(/<source\s[^>]*?\/?>/gi, '')
    // Collapse multi-line linked images: [\n![alt](src)\n](url) → [![alt](src)](url)
    s = s.replace(
      /\[\s*\n+\s*(!\[[^\]]*\]\([^)]*\))\s*\n+\s*\]\s*\(([^)]*)\)/g,
      (_m, img, url) => `[${img}](${url})`,
    )
    // Collapse multi-line markdown links (plain text, no nested brackets) into single-line
    s = s.replace(
      /\[([^\]]*(?:\n[^\]]*)+)\]\(([^)]+)\)/g,
      (_m, text: string, url: string) => {
        const collapsed = text.replace(/\s*\n\s*/g, ' ').trim()
        return `[${collapsed}](${url})`
      },
    )
    parts[i] = s
  }
  return parts.join('')
}

export const markedInstance = new Marked(
  { gfm: true, breaks: true },
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value
      }
      return hljs.highlightAuto(code).value
    },
  }),
)
