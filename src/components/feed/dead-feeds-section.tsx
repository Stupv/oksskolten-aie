import { useState } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { extractDomain } from "../../lib/url";
import type { FeedWithCounts } from "../../../shared/types";

export const DEAD_FEED_THRESHOLD = 20;
const DEAD_FEED_STALE_DAYS = 7;

export function isDeadFeed(feed: FeedWithCounts): boolean {
  if (feed.type === "clip" || feed.disabled) return false;
  if (feed.error_count > DEAD_FEED_THRESHOLD) return true;
  if (feed.last_error) {
    if (!feed.latest_published_at) return true;
    const daysSince =
      (Date.now() - new Date(feed.latest_published_at).getTime()) /
      (1000 * 60 * 60 * 24);
    if (daysSince > DEAD_FEED_STALE_DAYS) return true;
  }
  return false;
}

function classifyLastError(lastError: string | null): string {
  if (!lastError) return "Unknown";
  if (lastError === "No RSS URL") return "No RSS URL";
  if (lastError.includes("CssSelectorBridge")) return "CSS Bridge failed";
  if (lastError === "FlareSolverr failed") return "FlareSolverr failed";
  const httpMatch = lastError.match(/HTTP (\d{3})/);
  if (httpMatch) return `HTTP ${httpMatch[1]}`;
  if (lastError.includes("Could not parse")) return "Parse failed";
  if (lastError.includes("ENOTFOUND") || lastError.includes("DNS"))
    return "DNS failure";
  if (lastError.includes("ECONNREFUSED")) return "Connection refused";
  if (lastError.includes("ETIMEDOUT") || lastError.includes("timeout"))
    return "Timeout";
  return "Fetch error";
}

interface DeadFeedsSectionProps {
  deadFeeds: FeedWithCounts[];
  onRemove: (feedId: number) => void;
}

export function DeadFeedsSection({
  deadFeeds,
  onRemove,
}: DeadFeedsSectionProps) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(true);
  const [removing, setRemoving] = useState<Set<number>>(new Set());

  if (deadFeeds.length === 0) return null;

  async function handleRemove(feedId: number) {
    if (removing.has(feedId)) return;
    setRemoving((prev) => new Set(prev).add(feedId));
    try {
      onRemove(feedId);
    } finally {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(feedId);
        return next;
      });
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full text-left px-2 py-1.5 rounded-lg text-sm flex items-center gap-1 outline-none transition-colors hover:bg-hover-sidebar text-muted"
      >
        <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-hover transition-colors">
          <ChevronRight
            size={14}
            strokeWidth={1.5}
            className={`text-muted transition-transform duration-150 ${collapsed ? "" : "rotate-90"}`}
          />
        </span>
        <span className="truncate text-[11px] font-medium uppercase tracking-wider">
          {t("feeds.deadFeeds", { count: String(deadFeeds.length) })}
        </span>
      </button>

      {!collapsed && (
        <div className="space-y-px">
          {deadFeeds.map((feed) => {
            const domain = extractDomain(feed.url);
            const errorLabel = classifyLastError(feed.last_error);
            return (
              <div
                key={feed.id}
                className="flex items-center pl-7 pr-2 py-1.5 text-sm group hover:bg-hover-sidebar rounded-lg"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {domain && (
                    <img
                      src={`https://www.google.com/s2/favicons?sz=16&domain=${domain}`}
                      alt=""
                      width={16}
                      height={16}
                      className="shrink-0 opacity-50"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="truncate block text-muted">
                      {feed.name}
                    </span>
                    <span className="text-[10px] text-error truncate block">
                      {errorLabel}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => void handleRemove(feed.id)}
                  disabled={removing.has(feed.id)}
                  className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-hover transition-all text-error disabled:opacity-50"
                  title={t("feeds.removeDeadFeed")}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
