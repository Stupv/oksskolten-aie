# ADR-002: Soft delete for article retention policy

## Status

Accepted

## Context

Issue #10 required implementing a retention policy that automatically deletes old articles. This addresses the problem of unbounded database growth by removing read/unread articles after configurable retention periods.

Two deletion strategies were considered:

1. **Hard delete + separate table**: `DELETE` the article rows and record purged URLs in a `purged_article_urls` table
2. **Soft delete**: Add a `purged_at` column and NULL out content columns, keeping the rows themselves

### Problems with hard delete

During feed fetching, `getExistingArticleUrls()` checks which URLs already exist in the DB so that only new articles are passed to `insertArticle()` (backed by a UNIQUE constraint on `articles.url`). Hard-deleting a row would cause the next fetch cycle (every 5 minutes) to treat that URL as "new" and re-insert it.

Preventing this would require modifying `getExistingArticleUrls()` to also query the purged-URLs table. Because feed fetching is a critical path, the added complexity and bug risk were undesirable.

## Decision

**Soft delete** was adopted.

### Mechanism

- Add a `purged_at TEXT` column to the `articles` table (`migrations/0006_retention.sql`)
- On purge:
  - NULL out `full_text`, `full_text_translated`, `excerpt`, `summary`, and `og_image` (reclaims storage)
  - Set `purged_at = datetime('now')`
  - Remove the article from the search index
  - Delete any archived images
- Articles with `bookmarked_at` or `liked_at` set are excluded from purging

### Impact on feed fetching

- `getExistingArticleUrls()` requires **no changes** — URLs remain in the `articles` table, so existing duplicate checks continue to work
- The UNIQUE constraint on `insertArticle()` also continues to function

### Impact on queries

To exclude purged articles from the UI and aggregations, a `purged_at IS NULL` filter must be added to every query that reads from the `articles` table:

- `getArticles()`, `getArticlesByIds()` — article listings
- `getFeeds()` — sidebar count subqueries
- `getLikeCount()`, `getBookmarkCount()` — count helpers
- `markAllSeenByFeed()`, `markAllSeenByCategory()` — bulk mark-as-read
- `getReadingStats()` — statistics
- `recalculateScores()` — score recalculation
- `rebuildSearchIndex()`, `syncAllScoredArticlesToSearch()` — search index

## Consequences

### Benefits

- No changes required to the critical feed-fetching path
- Simple migration (column addition only, no new tables)
- Content columns account for most of the storage, so NULLing them provides substantial space reclamation
- Row metadata (URL, title, timestamps) is preserved, enabling future historical analytics

### Drawbacks

- **Every query** that reads from the `articles` table must include `purged_at IS NULL`. Forgetting this filter when adding new queries will cause purged articles to appear — a latent bug risk
- Rows themselves remain, so URL and metadata storage continues (on the order of a few hundred bytes per row)
- SQLite does not actually free the NULLed storage until VACUUM is run (mitigated by a weekly VACUUM cron job)
