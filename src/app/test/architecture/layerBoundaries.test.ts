import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT_DIR = process.cwd()
const SRC_APP_DIR = join(ROOT_DIR, 'src', 'app')
const ROOT_CONFIG_FILES = ['vite.config.mts', 'vitest.config.mts']
const ROOT_DOC_FILES = ['README.md', 'AGENTS.md', 'SECURITY.md']
const HYGIENE_EXTENSIONS = new Set(['.ts', '.tsx', '.scss', '.html', '.mts'])
const CODE_EXTENSIONS = new Set(['.ts', '.tsx'])
const EXCLUDED_DIRECTORIES = new Set(['node_modules', 'out', 'release'])
const FORBIDDEN_UI_PACKAGES = [
  'react',
  'react-dom',
  'antd',
  '@ant-design',
  'lucide-react',
  'react-i18next',
] as const
const FORBIDDEN_PACKAGE_JSON_DEPENDENCIES = [
  ...FORBIDDEN_UI_PACKAGES,
  '@types/react',
  '@types/react-dom',
  '@vitejs/plugin-react',
] as const

const EXTERNAL_ATTRIBUTION_PATTERN = new RegExp(
  [
    ['vs', 'code'].join('\\s*'),
    ['visual', 'studio'].join('\\s+'),
    ['dark', 'modern'].join('\\s+'),
    ['light', 'modern'].join('\\s+'),
  ].join('|'),
  'i',
)

const REGEX_PRECEDING_KEYWORDS = new Set([
  'return',
  'case',
  'throw',
  'in',
  'of',
  'typeof',
  'void',
  'delete',
  'yield',
  'await',
  'new',
  'else',
  'do',
  'instanceof',
])

const REGEX_PRECEDING_CHARS = new Set([
  '(',
  '[',
  '{',
  ',',
  ';',
  ':',
  '?',
  '!',
  '=',
  '+',
  '-',
  '*',
  '%',
  '&',
  '|',
  '^',
  '~',
  '<',
  '>',
])

function toPosixPath(filePath: string): string {
  return filePath.replaceAll('\\', '/')
}

function collectFiles(directory: string, extensions: ReadonlySet<string>): string[] {
  if (!existsSync(directory)) {
    return []
  }
  const results: string[] = []
  const entries = readdirSync(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) {
      continue
    }
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, extensions))
    } else if (extensions.has(extname(entry.name))) {
      results.push(fullPath)
    }
  }
  return results.sort()
}

function isIdentifierChar(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch)
}

function canPrecedeRegex(source: string, index: number): boolean {
  let cursor = index - 1
  while (cursor >= 0 && /\s/.test(source.charAt(cursor))) {
    cursor -= 1
  }
  if (cursor < 0) {
    return true
  }
  const ch = source.charAt(cursor)
  if (REGEX_PRECEDING_CHARS.has(ch)) {
    return true
  }
  if (isIdentifierChar(ch)) {
    let start = cursor
    while (start > 0 && isIdentifierChar(source.charAt(start - 1))) {
      start -= 1
    }
    const word = source.slice(start, cursor + 1)
    return REGEX_PRECEDING_KEYWORDS.has(word)
  }
  return false
}

function findTsCommentViolations(source: string): string[] {
  const violations: string[] = []
  const templateBraceStack: number[] = []
  let line = 1
  let index = 0
  let inTemplateText = false

  while (index < source.length) {
    const ch = source.charAt(index)
    const next = source.charAt(index + 1)

    if (ch === '\n') {
      line += 1
      index += 1
      continue
    }

    if (inTemplateText) {
      if (ch === '\\') {
        if (next === '\n') {
          line += 1
        }
        index += 2
        continue
      }
      if (ch === '`') {
        inTemplateText = false
        index += 1
        continue
      }
      if (ch === '$' && next === '{') {
        inTemplateText = false
        templateBraceStack.push(1)
        index += 2
        continue
      }
      index += 1
      continue
    }

    if (ch === "'" || ch === '"') {
      const quote = ch
      index += 1
      while (index < source.length) {
        const inner = source.charAt(index)
        if (inner === '\\') {
          if (source.charAt(index + 1) === '\n') {
            line += 1
          }
          index += 2
          continue
        }
        if (inner === '\n') {
          line += 1
        }
        if (inner === quote) {
          index += 1
          break
        }
        index += 1
      }
      continue
    }

    if (ch === '`') {
      inTemplateText = true
      index += 1
      continue
    }

    if (ch === '{' && templateBraceStack.length > 0) {
      const topIndex = templateBraceStack.length - 1
      templateBraceStack[topIndex] = (templateBraceStack[topIndex] ?? 0) + 1
      index += 1
      continue
    }

    if (ch === '}' && templateBraceStack.length > 0) {
      const topIndex = templateBraceStack.length - 1
      const depth = (templateBraceStack[topIndex] ?? 1) - 1
      if (depth === 0) {
        templateBraceStack.pop()
        inTemplateText = true
      } else {
        templateBraceStack[topIndex] = depth
      }
      index += 1
      continue
    }

    if (ch === '/' && next === '/') {
      violations.push(`line ${line}: single-line comment`)
      while (index < source.length && source.charAt(index) !== '\n') {
        index += 1
      }
      continue
    }

    if (ch === '/' && next === '*') {
      violations.push(`line ${line}: block comment`)
      index += 2
      while (index < source.length) {
        if (source.charAt(index) === '\n') {
          line += 1
        }
        if (source.charAt(index) === '*' && source.charAt(index + 1) === '/') {
          index += 2
          break
        }
        index += 1
      }
      continue
    }

    if (ch === '*' && next === '/') {
      violations.push(`line ${line}: closing block comment`)
      index += 2
      continue
    }

    if (ch === '<' && source.slice(index, index + 4) === '<!--') {
      violations.push(`line ${line}: html comment`)
      index += 4
      continue
    }

    if (ch === '/' && canPrecedeRegex(source, index)) {
      index += 1
      let inCharClass = false
      while (index < source.length) {
        const inner = source.charAt(index)
        if (inner === '\n') {
          line += 1
          index += 1
          break
        }
        if (inner === '\\') {
          index += 2
          continue
        }
        if (inner === '[') {
          inCharClass = true
          index += 1
          continue
        }
        if (inner === ']') {
          inCharClass = false
          index += 1
          continue
        }
        if (inner === '/' && !inCharClass) {
          index += 1
          while (index < source.length && /[a-z]/i.test(source.charAt(index))) {
            index += 1
          }
          break
        }
        index += 1
      }
      continue
    }

    index += 1
  }

  return violations
}

function findScssCommentViolations(source: string): string[] {
  const violations: string[] = []
  let line = 1
  let index = 0

  while (index < source.length) {
    const ch = source.charAt(index)
    const next = source.charAt(index + 1)

    if (ch === '\n') {
      line += 1
      index += 1
      continue
    }

    if (ch === "'" || ch === '"') {
      const quote = ch
      index += 1
      while (index < source.length) {
        const inner = source.charAt(index)
        if (inner === '\\') {
          index += 2
          continue
        }
        if (inner === '\n') {
          line += 1
        }
        if (inner === quote) {
          index += 1
          break
        }
        index += 1
      }
      continue
    }

    if ((ch === 'u' || ch === 'U') && source.slice(index, index + 4).toLowerCase() === 'url(') {
      index += 4
      while (index < source.length && source.charAt(index) !== ')') {
        if (source.charAt(index) === '\n') {
          line += 1
        }
        index += 1
      }
      index += 1
      continue
    }

    if (ch === '/' && next === '/') {
      violations.push(`line ${line}: single-line comment`)
      while (index < source.length && source.charAt(index) !== '\n') {
        index += 1
      }
      continue
    }

    if (ch === '/' && next === '*') {
      violations.push(`line ${line}: block comment`)
      index += 2
      while (index < source.length) {
        if (source.charAt(index) === '\n') {
          line += 1
        }
        if (source.charAt(index) === '*' && source.charAt(index + 1) === '/') {
          index += 2
          break
        }
        index += 1
      }
      continue
    }

    if (ch === '*' && next === '/') {
      violations.push(`line ${line}: closing block comment`)
      index += 2
      continue
    }

    index += 1
  }

  return violations
}

function findHtmlCommentViolations(source: string): string[] {
  const violations: string[] = []
  const lines = source.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const content = lines[index] ?? ''
    if (content.includes('<!--')) {
      violations.push(`line ${index + 1}: html comment`)
    }
  }
  return violations
}

function extractModuleSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  const patterns = [
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (specifier) {
        specifiers.push(specifier)
      }
    }
  }
  return specifiers
}

function resolveAppRelativeTarget(importingFile: string, specifier: string): string | null {
  if (specifier.startsWith('@app/')) {
    return specifier.slice('@app/'.length)
  }
  if (specifier.startsWith('.')) {
    const absoluteTarget = resolve(dirname(importingFile), specifier)
    const rel = toPosixPath(relative(SRC_APP_DIR, absoluteTarget))
    if (!rel.startsWith('..')) {
      return rel
    }
  }
  return null
}

function hasPathSegment(posixPath: string, segment: string): boolean {
  return posixPath.split('/').includes(segment)
}

function isTestFile(posixPath: string): boolean {
  return hasPathSegment(posixPath, 'test')
}

function isExternalPackage(specifier: string, packageName: string): boolean {
  return specifier === packageName || specifier.startsWith(`${packageName}/`)
}

describe('architecture and hygiene rules', () => {
  it('enforces zero comments across src/app and root config files', () => {
    const files = [
      ...collectFiles(SRC_APP_DIR, HYGIENE_EXTENSIONS),
      ...ROOT_CONFIG_FILES.map((file) => join(ROOT_DIR, file)).filter((file) => existsSync(file)),
    ]

    const allViolations: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const extension = extname(file)
      const rel = toPosixPath(relative(ROOT_DIR, file))
      const fileViolations =
        extension === '.scss'
          ? findScssCommentViolations(source)
          : extension === '.html'
            ? findHtmlCommentViolations(source)
            : findTsCommentViolations(source)
      for (const violation of fileViolations) {
        allViolations.push(`${rel}: ${violation}`)
      }
    }

    expect(allViolations).toEqual([])
  })

  it('enforces vertical layer boundaries (base -> platform -> workbench -> code)', () => {
    const files = collectFiles(SRC_APP_DIR, CODE_EXTENSIONS)
    const violations: string[] = []

    for (const file of files) {
      const rel = toPosixPath(relative(SRC_APP_DIR, file))
      const layer = rel.split('/')[0]
      if (layer === 'test') {
        continue
      }
      const source = readFileSync(file, 'utf8')

      for (const specifier of extractModuleSpecifiers(source)) {
        const target = resolveAppRelativeTarget(file, specifier)
        if (!target) {
          continue
        }
        const targetLayer = target.split('/')[0]
        if (layer === 'base' && targetLayer !== 'base') {
          violations.push(`${rel} illegally imports ${specifier} (target layer: ${targetLayer})`)
        } else if (
          layer === 'platform' &&
          (targetLayer === 'workbench' || targetLayer === 'code')
        ) {
          violations.push(`${rel} illegally imports ${specifier} (target layer: ${targetLayer})`)
        } else if (layer === 'workbench' && targetLayer === 'code') {
          violations.push(`${rel} illegally imports ${specifier} (target layer: ${targetLayer})`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('enforces runtime layer boundaries across common, node, and browser production directories', () => {
    const files = collectFiles(SRC_APP_DIR, CODE_EXTENSIONS)
    const violations: string[] = []

    for (const file of files) {
      const rel = toPosixPath(relative(SRC_APP_DIR, file))
      if (isTestFile(rel)) {
        continue
      }
      const source = readFileSync(file, 'utf8')
      const isCommon = hasPathSegment(rel, 'common')
      const isNode = hasPathSegment(rel, 'node')
      const isBrowser = hasPathSegment(rel, 'browser')

      for (const specifier of extractModuleSpecifiers(source)) {
        const target = resolveAppRelativeTarget(file, specifier)

        if (isCommon) {
          if (
            specifier.startsWith('node:') ||
            isExternalPackage(specifier, 'electron') ||
            isExternalPackage(specifier, 'react') ||
            isExternalPackage(specifier, 'react-dom') ||
            isExternalPackage(specifier, 'antd') ||
            (target !== null &&
              (hasPathSegment(target, 'node') ||
                hasPathSegment(target, 'browser') ||
                hasPathSegment(target, 'electron-main') ||
                hasPathSegment(target, 'electron-browser')))
          ) {
            violations.push(`common file ${rel} illegally imports ${specifier}`)
          }
        }

        if (isNode) {
          if (
            isExternalPackage(specifier, 'electron') ||
            isExternalPackage(specifier, 'react') ||
            (target !== null &&
              (hasPathSegment(target, 'browser') ||
                hasPathSegment(target, 'electron-main') ||
                hasPathSegment(target, 'electron-browser')))
          ) {
            violations.push(`node file ${rel} illegally imports ${specifier}`)
          }
        }

        if (isBrowser) {
          if (
            specifier.startsWith('node:') ||
            isExternalPackage(specifier, 'electron') ||
            (target !== null &&
              (hasPathSegment(target, 'node') || hasPathSegment(target, 'electron-main')))
          ) {
            violations.push(`browser file ${rel} illegally imports ${specifier}`)
          }
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('restricts ipcMain imports from electron exclusively to validatedIpcMain.ts', () => {
    const allowedFile = 'base/parts/ipc/electron-main/validatedIpcMain.ts'
    const files = collectFiles(SRC_APP_DIR, CODE_EXTENSIONS)
    const violations: string[] = []
    const electronImportPattern = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]electron['"]/g

    for (const file of files) {
      const rel = toPosixPath(relative(SRC_APP_DIR, file))
      if (rel === allowedFile || isTestFile(rel)) {
        continue
      }
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(electronImportPattern)) {
        const clause = match[1] ?? ''
        if (/\bipcMain\b/.test(clause)) {
          violations.push(`${rel} imports ipcMain directly from electron`)
        }
      }
      if (/\belectron\.ipcMain\b/.test(source)) {
        violations.push(`${rel} accesses electron.ipcMain directly`)
      }
    }

    expect(violations).toEqual([])
  })

  it('forbids importing or referencing the Settings2 icon anywhere in production src/app', () => {
    const files = collectFiles(SRC_APP_DIR, CODE_EXTENSIONS)
    const violations: string[] = []

    for (const file of files) {
      const rel = toPosixPath(relative(SRC_APP_DIR, file))
      if (isTestFile(rel)) {
        continue
      }
      const source = readFileSync(file, 'utf8')
      if (/\bSettings2\b/.test(source)) {
        violations.push(`${rel} references forbidden icon Settings2`)
      }
    }

    expect(violations).toEqual([])
  })

  it('forbids React, Ant Design, Lucide, and react-i18next imports and dependencies', () => {
    const files = collectFiles(SRC_APP_DIR, CODE_EXTENSIONS)
    const importViolations: string[] = []

    for (const file of files) {
      const rel = toPosixPath(relative(SRC_APP_DIR, file))
      const source = readFileSync(file, 'utf8')
      for (const specifier of extractModuleSpecifiers(source)) {
        for (const forbidden of FORBIDDEN_UI_PACKAGES) {
          if (isExternalPackage(specifier, forbidden)) {
            importViolations.push(`${rel} imports forbidden package ${specifier}`)
          }
        }
      }
    }

    expect(importViolations).toEqual([])

    const pkg = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }
    const dependencySections = [
      pkg.dependencies,
      pkg.devDependencies,
      pkg.peerDependencies,
      pkg.optionalDependencies,
    ]
    const dependencyViolations: string[] = []

    for (const section of dependencySections) {
      if (!section) {
        continue
      }
      for (const depName of Object.keys(section)) {
        for (const forbidden of FORBIDDEN_PACKAGE_JSON_DEPENDENCIES) {
          if (isExternalPackage(depName, forbidden)) {
            dependencyViolations.push(`package.json still declares forbidden dependency ${depName}`)
          }
        }
      }
    }

    expect(dependencyViolations).toEqual([])
  })

  it('keeps legacy directories removed, docs free of external origin mentions, and package version clean', () => {
    expect(existsSync(join(ROOT_DIR, 'old'))).toBe(false)
    expect(existsSync(join(ROOT_DIR, 'old_frontend'))).toBe(false)
    expect(existsSync(join(ROOT_DIR, 'tests'))).toBe(false)

    const packageJson = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8')) as {
      version?: string
    }
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/)

    const filesToScan = [
      ...ROOT_DOC_FILES.map((file) => join(ROOT_DIR, file)).filter((file) => existsSync(file)),
      ...collectFiles(SRC_APP_DIR, HYGIENE_EXTENSIONS),
    ]
    const attributionViolations: string[] = []
    for (const file of filesToScan) {
      const rel = toPosixPath(relative(ROOT_DIR, file))
      if (rel === 'src/app/test/architecture/layerBoundaries.test.ts') {
        continue
      }
      const content = readFileSync(file, 'utf8')
      if (EXTERNAL_ATTRIBUTION_PATTERN.test(content)) {
        attributionViolations.push(`${rel} contains disallowed external origin attribution`)
      }
    }
    expect(attributionViolations).toEqual([])
  })
})
