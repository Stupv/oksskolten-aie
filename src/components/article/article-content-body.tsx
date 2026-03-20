import { Skeleton } from "../ui/skeleton";
import { SanitizedHTML } from "../ui/sanitized-html";
import { HintBanner } from "../ui/hint-banner";
import { useI18n } from "../../lib/i18n";
import { ExternalLink } from "lucide-react";

const MIN_CONTENT_LENGTH = 50;

function isContentEmpty(body: string | null | undefined): boolean {
  if (!body) return true;
  return body.trim().length < MIN_CONTENT_LENGTH;
}

type HintVariant = "js-render" | "paywall" | "generic";

function classifyFailure(
  fullText: string | null | undefined,
  articleUrl: string | undefined,
  lastError: string | null | undefined,
  requiresJs: boolean,
): HintVariant {
  // Check for JS-rendered page signals
  if (requiresJs) return "js-render";
  if (articleUrl) {
    try {
      const hostname = new URL(articleUrl).hostname.toLowerCase();
      // Known JS-heavy SPA sites
      const jsHeavySites = [
        "twitter.com",
        "x.com",
        "instagram.com",
        "facebook.com",
        "linkedin.com",
      ];
      if (jsHeavySites.some((s) => hostname.includes(s))) return "js-render";
    } catch {
      // ignore invalid URL
    }
  }

  // Check for paywall/auth signals
  if (lastError) {
    const lower = lastError.toLowerCase();
    if (
      lower.includes("paywall") ||
      lower.includes("login") ||
      lower.includes("subscribe") ||
      lower.includes("401") ||
      lower.includes("403")
    ) {
      return "paywall";
    }
  }

  // Check the body fragment for paywall indicators
  if (fullText) {
    const lower = fullText.toLowerCase();
    if (
      lower.includes("sign in") ||
      lower.includes("subscribe to") ||
      lower.includes("create an account") ||
      lower.includes("premium content")
    ) {
      return "paywall";
    }
  }

  return "generic";
}

interface ArticleContentBodyProps {
  translating: boolean;
  translatingText: string;
  translatingHtml: string;
  displayContent: string;
  /** Raw article full_text for empty-content detection */
  fullText?: string | null;
  /** Article URL for the "read at source" link */
  articleUrl?: string;
  /** Last error from the article or feed for hint classification */
  lastError?: string | null;
  /** Whether the feed requires JS challenge */
  requiresJs?: boolean;
}

export function ArticleContentBody({
  translating,
  translatingText,
  translatingHtml,
  displayContent,
  fullText,
  articleUrl,
  lastError,
  requiresJs = false,
}: ArticleContentBodyProps) {
  const { t } = useI18n();

  if (translating && translatingText) {
    return (
      <SanitizedHTML
        html={translatingHtml}
        className="prose transition-opacity duration-150"
      />
    );
  }

  if (translating) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  const showHint = !translating && isContentEmpty(fullText);
  const variant = showHint
    ? classifyFailure(fullText, articleUrl, lastError, requiresJs)
    : null;

  const hintMessages: Record<HintVariant, string> = {
    "js-render": t("article.hintJsRender"),
    paywall: t("article.hintPaywall"),
    generic: t("article.hintGeneric"),
  };

  return (
    <>
      {showHint && variant && (
        <HintBanner storageKey={`hint-extraction-${articleUrl ?? "unknown"}`}>
          <span>
            {hintMessages[variant]}{" "}
            {articleUrl && (
              <a
                href={articleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-accent hover:underline font-medium"
              >
                {t("article.readAtSource")}
                <ExternalLink size={12} />
              </a>
            )}
          </span>
        </HintBanner>
      )}
      <SanitizedHTML
        html={displayContent}
        className="prose transition-opacity duration-150"
      />
    </>
  );
}
