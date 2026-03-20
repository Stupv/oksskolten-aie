import { useState } from "react";
import useSWR from "swr";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { fetcher } from "../../lib/fetcher";
import { useI18n } from "../../lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";

interface StorageStatsData {
  total_count: number;
  total_size_bytes: number;
  by_feed: Array<{
    feed_id: number;
    feed_name: string;
    image_count: number;
    size_bytes: number;
  }>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function StorageStatsCard() {
  const { t } = useI18n();
  const { data, error, isLoading, mutate } = useSWR<StorageStatsData>(
    "/api/settings/image-storage/stats",
    fetcher,
  );
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await mutate();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold text-text">
          {t("storageStats.title")}
        </h2>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || isLoading}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg border border-border text-text hover:bg-hover transition-colors disabled:opacity-50 select-none"
        >
          <RefreshCw
            size={12}
            className={refreshing || isLoading ? "animate-spin" : ""}
          />
          {t("storageStats.refresh")}
        </button>
      </div>
      <p className="text-xs text-muted mb-4">{t("storageStats.desc")}</p>

      {/* Loading state */}
      {isLoading && !data && (
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      )}

      {/* Error state */}
      {error && !data && (
        <div className="flex items-center gap-2 rounded-lg bg-hover px-3 py-2.5 text-sm text-muted">
          <AlertTriangle size={14} className="text-warning shrink-0" />
          <span>{t("storageStats.error")}</span>
        </div>
      )}

      {/* Data state */}
      {data && (
        <div className="space-y-3">
          {/* Summary */}
          {data.total_count === 0 ? (
            <p className="text-sm text-muted">{t("storageStats.noData")}</p>
          ) : (
            <>
              <p className="text-sm text-text">
                {t("storageStats.summary", {
                  size: formatBytes(data.total_size_bytes),
                  count: data.total_count.toLocaleString(),
                })}
              </p>

              {/* Per-feed breakdown table */}
              {data.by_feed.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-hover text-left">
                        <th className="px-3 py-1.5 text-xs font-medium text-muted">
                          {t("storageStats.feedName")}
                        </th>
                        <th className="px-3 py-1.5 text-xs font-medium text-muted text-right">
                          {t("storageStats.imageCount")}
                        </th>
                        <th className="px-3 py-1.5 text-xs font-medium text-muted text-right">
                          {t("storageStats.size")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_feed.slice(0, 10).map((row) => (
                        <tr
                          key={row.feed_id}
                          className="border-t border-border"
                        >
                          <td className="px-3 py-1.5 text-text truncate max-w-[200px]">
                            {row.feed_name}
                          </td>
                          <td className="px-3 py-1.5 text-muted text-right tabular-nums">
                            {row.image_count.toLocaleString()}
                          </td>
                          <td className="px-3 py-1.5 text-muted text-right tabular-nums">
                            {formatBytes(row.size_bytes)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
