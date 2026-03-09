import Piscina from 'piscina'
import { fetchHtml } from './http.js'
import { fetchViaFlareSolverr } from './flaresolverr.js'
import type { CleanerConfig } from '../lib/cleaner/selectors.js'
import type { ParseHtmlInput, ParseHtmlResult } from './contentWorker.js'

// Worker pool for CPU-intensive DOM parsing (jsdom + Readability + Turndown).
// Runs on separate threads so the main event loop stays responsive for API requests.
// Inherit the parent's execArgv so the tsx TypeScript loader is available in workers.
const pool = new Piscina({
  filename: new URL('./contentWorker.ts', import.meta.url).href,
  execArgv: process.execArgv,
  maxThreads: Number(process.env.PARSE_MAX_THREADS) || 2,
})

/** Per-task timeout for worker pool (30 s should be plenty for even large HTML). */
const WORKER_TIMEOUT_MS = 30_000

/**
 * Strip heavy non-content tags before passing HTML to the worker thread.
 * This runs on the main thread with simple regex (no DOM parsing), so it's fast.
 * Removes <script>, <style>, <svg>, and <noscript> blocks that are irrelevant
 * to Readability extraction but can make jsdom parsing extremely slow on large pages.
 */
function stripHeavyTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
}

export interface FetchFullTextOptions {
  cleanerConfig?: CleanerConfig
  requiresJsChallenge?: boolean
}

export async function fetchFullText(articleUrl: string, options?: FetchFullTextOptions): Promise<ParseHtmlResult> {
  const cleanerConfig = options?.cleanerConfig
  const requiresJsChallenge = options?.requiresJsChallenge ?? false

  // Step 1: Fetch HTML (async I/O, non-blocking — stays on main thread)
  const { html } = await fetchHtml(articleUrl, { useFlareSolverr: requiresJsChallenge })

  // Step 2: Parse HTML in worker thread (CPU-intensive, off main thread)
  const input: ParseHtmlInput = { html: stripHeavyTags(html), articleUrl, cleanerConfig }
  const result: ParseHtmlResult = await pool.run(input, { signal: AbortSignal.timeout(WORKER_TIMEOUT_MS) })

  // Step 3: FlareSolverr fallback if extracted text is too short or looks like garbage
  const extractedLen = result.fullText.replace(/\s+/g, ' ').trim().length
  const needsRetry = extractedLen < 200 || isGarbageExtraction(result.fullText)
  if (needsRetry && !requiresJsChallenge) {
    const flare = await fetchViaFlareSolverr(articleUrl, {
      waitForSelector: 'article, main, [role="main"], .post-content, .entry-content',
    })
    if (flare) {
      const flareInput: ParseHtmlInput = { html: stripHeavyTags(flare.body), articleUrl, cleanerConfig }
      const flareResult: ParseHtmlResult = await pool.run(flareInput, { signal: AbortSignal.timeout(WORKER_TIMEOUT_MS) })
      const flareLen = flareResult.fullText.replace(/\s+/g, ' ').trim().length
      if (flareLen > extractedLen) {
        return flareResult
      }
    }
  }

  return result
}

/**
 * Detect garbage extraction: text that is mostly code/scripts with little natural prose.
 * Strips markdown code fences and checks if remaining text has enough prose sentences.
 * A legitimate blog post about JS has explanatory sentences outside code blocks;
 * garbage extraction from leaked scripts has almost none.
 */
function isGarbageExtraction(text: string): boolean {
  // Bot detection / form submission pages
  if (isBotBlockPage(text)) return true

  // Strip markdown code blocks (```...```)
  const withoutCodeBlocks = text.replace(/```[\s\S]*?```/g, '')
  // Strip inline code (`...`)
  const withoutInlineCode = withoutCodeBlocks.replace(/`[^`]+`/g, '')

  const prose = withoutInlineCode.replace(/\s+/g, ' ').trim()
  if (prose.length === 0) return true

  // Count prose sentences: sequences ending with sentence-final punctuation
  // that contain at least a few word-like tokens
  const sentences = prose.match(/[^.!?。！？]+[.!?。！？]/g) || []
  const proseSentences = sentences.filter(s => {
    const words = s.trim().split(/\s+/)
    return words.length >= 3
  })

  // A real article should have at least a handful of prose sentences
  if (proseSentences.length < 3) return true

  // Check ratio: if prose (outside code fences) is tiny relative to total text, likely garbage
  if (prose.length < text.length * 0.1) return true

  return false
}

/** Detect bot-block / form-submission pages that Readability mistakenly extracts. */
export function isBotBlockPage(text: string): boolean {
  const lower = text.toLowerCase()
  const patterns = [
    'your submission has been received',
    'something went wrong while submitting',
    'please verify you are a human',
    'checking your browser',
    'enable javascript and cookies',
    'just a moment',
    'attention required',
    'access denied',
  ]
  return patterns.some(p => lower.includes(p))
}
