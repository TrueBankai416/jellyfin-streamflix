using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.StreamFlix.Configuration;

namespace Jellyfin.Plugin.StreamFlix.Services;

/// <summary>
/// Server-side client for Seerr / Jellyseerr / Overseerr (<c>/api/v1</c>).
/// Keeps the configured API key strictly on the Jellyfin server, enforces SSRF protections,
/// prefers fast IPv4 socket connections with safe redirect handling, caches search/metadata
/// lookups, and normalizes search, TV season inspection, and media request operations.
/// </summary>
public static class StreamFlixSeerrService
{
    private static readonly HttpClient SeerrHttp = new(new SocketsHttpHandler
    {
        AllowAutoRedirect = false,
        AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate | DecompressionMethods.Brotli,
        PooledConnectionLifetime = TimeSpan.FromMinutes(2),
        PooledConnectionIdleTimeout = TimeSpan.FromSeconds(4), // Below Node.js default 5s keepAliveTimeout
        ConnectTimeout = TimeSpan.FromSeconds(4),
        ConnectCallback = ConnectSeerrSocketAsync,
    })
    {
        Timeout = Timeout.InfiniteTimeSpan, // Controlled per-call via CancellationTokenSource
        DefaultRequestVersion = HttpVersion.Version11,
        DefaultVersionPolicy = HttpVersionPolicy.RequestVersionOrLower,
    };

    private static readonly Regex SafeTmdbImagePathRegex = new(@"^/[a-zA-Z0-9._-]+$", RegexOptions.Compiled);

    private static readonly ConcurrentDictionary<string, CachedHostAddresses> DnsCache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, CachedMediaMeta> MediaMetaCache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, CachedSearchResult> SearchCache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string, CachedRequestsResult> RecentRequestsCache = new(StringComparer.OrdinalIgnoreCase);

    private static string _unreachableBaseUrl = string.Empty;
    private static long _unreachableUntilTicks;

    private sealed record CachedHostAddresses(IPAddress[] Addresses, DateTime ExpiresAtUtc);

    private sealed record CachedMediaMeta(
        string Title,
        string Year,
        string PosterUrl,
        string BackdropUrl,
        int? TvdbId,
        bool IsAdult,
        bool IsMatureForKids,
        DateTime ExpiresAtUtc);

    private sealed record CachedSearchResult(List<SeerrMediaItem> Items, DateTime ExpiresAtUtc);

    private sealed record CachedRequestsResult(List<SeerrRequestEntry> Entries, DateTime ExpiresAtUtc);

    public sealed record SeerrDiagnosticCheck(string Status, string Label, string Detail);

    public sealed record SeerrMediaItem(
        int TmdbId,
        string MediaType,
        string Title,
        string Year,
        string Overview,
        double Rating,
        string PosterUrl,
        string BackdropUrl,
        int MediaStatus,
        string StatusLabel,
        int? DownloadProgress,
        string? JellyfinMediaId);

    public sealed record SeerrSeasonItem(
        int SeasonNumber,
        string Name,
        int EpisodeCount,
        string Year,
        int Status,
        string StatusLabel);

    public sealed record SeerrTvDetail(
        int TmdbId,
        string Title,
        string Year,
        string Overview,
        string BackdropUrl,
        int MediaStatus,
        string StatusLabel,
        int? DownloadProgress,
        List<SeerrSeasonItem> Seasons,
        int? TvdbId = null);

    public sealed record SeerrRequestEntry(
        int RequestId,
        int TmdbId,
        string MediaType,
        string Title,
        string Year,
        string PosterUrl,
        string BackdropUrl,
        int RequestStatus,
        int MediaStatus,
        string StatusKey,
        string StatusLabel,
        int? DownloadProgress,
        List<int> Seasons,
        string CreatedAt,
        string? JellyfinMediaId);

    public static bool IsConfigured(PluginConfiguration config)
    {
        return config.EnableSeerr
            && !string.IsNullOrWhiteSpace(config.SeerrUrl)
            && !string.IsNullOrWhiteSpace(config.SeerrApiKey);
    }

    public static void ResetTransientCaches()
    {
        Interlocked.Exchange(ref _unreachableUntilTicks, 0);
        _unreachableBaseUrl = string.Empty;
        DnsCache.Clear();
        SearchCache.Clear();
        RecentRequestsCache.Clear();
    }

    public static string NormalizeBaseUrl(string? rawUrl)
    {
        var s = (rawUrl ?? string.Empty).Trim().TrimEnd('/');
        if (s.EndsWith("/api/v1", StringComparison.OrdinalIgnoreCase))
        {
            s = s.Substring(0, s.Length - 7).TrimEnd('/');
        }

        return s;
    }

    public static int NormalizeMediaStatus(int rawStatus)
    {
        // In Seerr / Jellyseerr: 1=Unknown, 2=Pending, 3=Processing, 4=PartiallyAvailable, 5=Available, 6=Blocklisted, 7=Deleted.
        // Deleted (7) and <=0 can be requested again, so map them to 1 (Not Requested).
        if (rawStatus <= 0 || rawStatus == 7)
        {
            return 1;
        }

        return Math.Clamp(rawStatus, 1, 6);
    }

    public static string MapStatusLabel(int status) => NormalizeMediaStatus(status) switch
    {
        2 => "Pending",
        3 => "Processing",
        4 => "Partially Available",
        5 => "Available",
        6 => "Unavailable",
        _ => "Not Requested",
    };

    public static async Task<(string Status, string Summary, List<SeerrDiagnosticCheck> Checks)> TestConnectionAsync(
        string? rawUrl,
        string? rawApiKey,
        CancellationToken cancellationToken = default)
    {
        ResetTransientCaches();

        var checks = new List<SeerrDiagnosticCheck>();
        var baseUrl = NormalizeBaseUrl(rawUrl);
        var apiKey = (rawApiKey ?? string.Empty).Trim();

        if (string.IsNullOrEmpty(baseUrl))
        {
            checks.Add(new("error", "Seerr URL", "Enter your Seerr / Jellyseerr URL (e.g. http://127.0.0.1:5055 or https://requests.example.com)."));
        }
        else
        {
            try
            {
                await ValidateSafeSeerrBaseUrlAsync(baseUrl, cancellationToken).ConfigureAwait(false);
                checks.Add(new("ok", "Seerr URL", $"Base URL validated ({baseUrl})."));
            }
            catch (Exception ex)
            {
                checks.Add(new("error", "Seerr URL", ex.Message));
            }
        }

        if (string.IsNullOrEmpty(apiKey))
        {
            checks.Add(new("error", "API Key", "Paste your Seerr / Jellyseerr API Key (found in Seerr → Settings → General → API Key)."));
        }
        else if (apiKey.Length < 16)
        {
            checks.Add(new("warn", "API Key", "API key looks unusually short — verify you copied the full key from Seerr → Settings → General."));
        }
        else
        {
            checks.Add(new("ok", "API Key format", "API key provided (stored server-side only)."));
        }

        if (checks.All(c => c.Status != "error"))
        {
            try
            {
                using var statusResp = await SendSeerrAsync(HttpMethod.Get, baseUrl + "/api/v1/status", apiKey, null, cancellationToken).ConfigureAwait(false);
                if (!statusResp.IsSuccessStatusCode)
                {
                    checks.Add(new("error", "Server Reachability", $"Seerr /api/v1/status returned HTTP {(int)statusResp.StatusCode}. Check the URL and port."));
                }
                else
                {
                    var body = await statusResp.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                    using var doc = JsonDocument.Parse(body);
                    var ver = JsonStr(doc.RootElement, "version");
                    checks.Add(new("ok", "Server Reachability", string.IsNullOrEmpty(ver)
                        ? "Connected to Seerr /api/v1/status."
                        : $"Connected to Seerr v{ver}."));

                    using var authResp = await SendSeerrAsync(HttpMethod.Get, baseUrl + "/api/v1/auth/me", apiKey, null, cancellationToken).ConfigureAwait(false);
                    if (authResp.IsSuccessStatusCode)
                    {
                        checks.Add(new("ok", "API Key Authentication", "API key verified successfully against /api/v1/auth/me."));
                    }
                    else
                    {
                        using var fallbackResp = await SendSeerrAsync(HttpMethod.Get, baseUrl + "/api/v1/request/count", apiKey, null, cancellationToken).ConfigureAwait(false);
                        if (fallbackResp.IsSuccessStatusCode)
                        {
                            checks.Add(new("ok", "API Key Authentication", "API key verified successfully against /api/v1/request/count."));
                        }
                        else if ((int)authResp.StatusCode is 401 or 403 || (int)fallbackResp.StatusCode is 401 or 403)
                        {
                            checks.Add(new("error", "API Key Authentication", "Seerr rejected the API key (HTTP 401/403). Copy the key from Seerr → Settings → General → API Key."));
                        }
                        else
                        {
                            checks.Add(new("warn", "API Key Authentication", $"Protected endpoint returned HTTP {(int)authResp.StatusCode}; verify request permissions."));
                        }
                    }
                }
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                checks.Add(new("error", "Server Reachability", "Connection to Seerr timed out. Verify the host/IP and port are reachable from the Jellyfin server."));
            }
            catch (Exception ex)
            {
                checks.Add(new("error", "Server Reachability", $"Could not connect to Seerr: {ex.Message}"));
            }
        }

        var hasErr = checks.Any(c => c.Status == "error");
        var hasWarn = checks.Any(c => c.Status == "warn");
        var overall = hasErr ? "error" : (hasWarn ? "warn" : "ok");
        var summary = hasErr
            ? "Seerr connection test failed — review the checks below."
            : (hasWarn
                ? "Connected to Seerr with warnings."
                : "Seerr connection & API key verified! Save settings to enable search requests.");

        return (overall, summary, checks);
    }

    public static async Task<List<SeerrMediaItem>> SearchAsync(
        PluginConfiguration config,
        string query,
        bool isKidsProfile,
        CancellationToken cancellationToken = default)
    {
        var items = new List<SeerrMediaItem>();
        var q = (query ?? string.Empty).Trim();
        if (q.Length < 2 || !IsConfigured(config))
        {
            return items;
        }

        if (q.Length > 100)
        {
            q = q.Substring(0, 100).Trim();
        }

        var baseUrl = NormalizeBaseUrl(config.SeerrUrl);
        var cacheKey = $"{baseUrl}|{(isKidsProfile ? "1" : "0")}|{q.ToLowerInvariant()}";
        if (SearchCache.TryGetValue(cacheKey, out var cachedSearch) && cachedSearch.ExpiresAtUtc > DateTime.UtcNow)
        {
            return cachedSearch.Items;
        }

        if (IsTemporarilyUnreachable(baseUrl))
        {
            throw new InvalidOperationException("Seerr is temporarily unreachable — retrying shortly.");
        }

        var apiKey = config.SeerrApiKey.Trim();
        await ValidateSafeSeerrBaseUrlAsync(baseUrl, cancellationToken).ConfigureAwait(false);

        var url = $"{baseUrl}/api/v1/search?query={Uri.EscapeDataString(q)}&page=1&language=en";
        using var resp = await SendSeerrWithCircuitBreakerAsync(HttpMethod.Get, url, baseUrl, apiKey, null, cancellationToken).ConfigureAwait(false);
        if (!resp.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Seerr search returned HTTP {(int)resp.StatusCode}.");
        }

        var raw = await resp.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        using var doc = JsonDocument.Parse(raw);
        if (!doc.RootElement.TryGetProperty("results", out var results) || results.ValueKind != JsonValueKind.Array)
        {
            return items;
        }

        foreach (var el in results.EnumerateArray())
        {
            var mediaType = JsonStr(el, "mediaType").Trim().ToLowerInvariant();
            if (mediaType is not ("movie" or "tv"))
            {
                continue;
            }

            if (JsonBool(el, "adult"))
            {
                continue;
            }

            if (isKidsProfile && HasMatureTmdbGenre(el))
            {
                continue;
            }

            var tmdbId = JsonInt(el, "id");
            if (tmdbId <= 0)
            {
                continue;
            }

            var title = FirstNonEmpty(JsonStr(el, "title"), JsonStr(el, "name"), JsonStr(el, "originalTitle"), JsonStr(el, "originalName"));
            if (string.IsNullOrEmpty(title))
            {
                continue;
            }

            var dateRaw = FirstNonEmpty(JsonStr(el, "releaseDate"), JsonStr(el, "firstAirDate"));
            var year = dateRaw.Length >= 4 && int.TryParse(dateRaw.AsSpan(0, 4), out var yr) && yr >= 1888 && yr <= 2100
                ? yr.ToString(CultureInfo.InvariantCulture)
                : string.Empty;

            var overview = JsonStr(el, "overview").Trim();
            var rating = Math.Round(Math.Clamp(JsonDouble(el, "voteAverage"), 0, 10), 1);
            var posterUrl = BuildSafeTmdbImageUrl(JsonStr(el, "posterPath"), "w342");
            var backdropUrl = BuildSafeTmdbImageUrl(JsonStr(el, "backdropPath"), "w1280");

            var mediaStatus = 1;
            int? downloadProgress = null;
            var isDownloading = false;
            string? jfMediaId = null;
            int? tvdbId = null;
            if (el.TryGetProperty("mediaInfo", out var mi) && mi.ValueKind == JsonValueKind.Object)
            {
                mediaStatus = NormalizeMediaStatus(JsonInt(mi, "status", 1));
                (isDownloading, downloadProgress) = ExtractDownloadProgress(mi);
                var jfId = FirstNonEmpty(JsonStr(mi, "jellyfinMediaId"), JsonStr(mi, "jellyfinMediaId4k"));
                if (!string.IsNullOrEmpty(jfId))
                {
                    jfMediaId = jfId;
                }

                var rawTvdb = JsonInt(mi, "tvdbId", 0);
                if (rawTvdb > 0)
                {
                    tvdbId = rawTvdb;
                }
            }

            StoreCachedMediaMeta(mediaType, tmdbId, title, year, posterUrl, backdropUrl, tvdbId, isAdult: false, isMatureForKids: HasMatureTmdbGenre(el));

            var statusLabel = isDownloading && mediaStatus is 2 or 3
                ? (downloadProgress.HasValue && downloadProgress.Value > 0 ? $"Downloading · {downloadProgress.Value}%" : "Downloading")
                : MapStatusLabel(mediaStatus);

            items.Add(new SeerrMediaItem(
                TmdbId: tmdbId,
                MediaType: mediaType,
                Title: title,
                Year: year,
                Overview: overview,
                Rating: rating,
                PosterUrl: posterUrl,
                BackdropUrl: backdropUrl,
                MediaStatus: mediaStatus,
                StatusLabel: statusLabel,
                DownloadProgress: isDownloading ? downloadProgress : null,
                JellyfinMediaId: jfMediaId));

            if (items.Count >= 24)
            {
                break;
            }
        }

        PruneSearchCacheIfNeeded();
        SearchCache[cacheKey] = new CachedSearchResult(items, DateTime.UtcNow.AddSeconds(75));
        return items;
    }

    public static async Task<SeerrTvDetail> GetTvDetailsAsync(
        PluginConfiguration config,
        int tmdbId,
        CancellationToken cancellationToken = default)
    {
        if (tmdbId <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(tmdbId));
        }

        var baseUrl = NormalizeBaseUrl(config.SeerrUrl);
        var apiKey = config.SeerrApiKey.Trim();
        await ValidateSafeSeerrBaseUrlAsync(baseUrl, cancellationToken).ConfigureAwait(false);

        var url = $"{baseUrl}/api/v1/tv/{tmdbId.ToString(CultureInfo.InvariantCulture)}";
        using var resp = await SendSeerrWithCircuitBreakerAsync(HttpMethod.Get, url, baseUrl, apiKey, null, cancellationToken).ConfigureAwait(false);
        if (!resp.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Could not load TV seasons from Seerr (HTTP {(int)resp.StatusCode}).");
        }

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
        var root = doc.RootElement;

        var title = FirstNonEmpty(JsonStr(root, "name"), JsonStr(root, "originalName"), "Series");
        var dateRaw = JsonStr(root, "firstAirDate");
        var year = dateRaw.Length >= 4 ? dateRaw.Substring(0, 4) : string.Empty;
        var overview = JsonStr(root, "overview").Trim();
        var posterUrl = BuildSafeTmdbImageUrl(JsonStr(root, "posterPath"), "w342");
        var backdropUrl = BuildSafeTmdbImageUrl(JsonStr(root, "backdropPath"), "w1280");

        int? tvdbId = null;
        if (root.TryGetProperty("externalIds", out var extIds) && extIds.ValueKind == JsonValueKind.Object)
        {
            var extTvdb = JsonInt(extIds, "tvdbId", 0);
            if (extTvdb > 0)
            {
                tvdbId = extTvdb;
            }
        }

        var mediaStatus = 1;
        int? downloadProgress = null;
        var isDownloading = false;
        var seasonStatuses = new Dictionary<int, int>();
        if (root.TryGetProperty("mediaInfo", out var mi) && mi.ValueKind == JsonValueKind.Object)
        {
            mediaStatus = NormalizeMediaStatus(JsonInt(mi, "status", 1));
            (isDownloading, downloadProgress) = ExtractDownloadProgress(mi);
            if (!tvdbId.HasValue)
            {
                var miTvdb = JsonInt(mi, "tvdbId", 0);
                if (miTvdb > 0)
                {
                    tvdbId = miTvdb;
                }
            }

            if (mi.TryGetProperty("seasons", out var miSeasons) && miSeasons.ValueKind == JsonValueKind.Array)
            {
                foreach (var ms in miSeasons.EnumerateArray())
                {
                    var sNum = JsonInt(ms, "seasonNumber", -1);
                    var sSt = NormalizeMediaStatus(JsonInt(ms, "status", 1));
                    if (sNum >= 0)
                    {
                        seasonStatuses[sNum] = sSt;
                    }
                }
            }
        }

        StoreCachedMediaMeta("tv", tmdbId, title, year, posterUrl, backdropUrl, tvdbId, JsonBool(root, "adult"), HasMatureDetailGenres(root));

        var seasons = new List<SeerrSeasonItem>();
        if (root.TryGetProperty("seasons", out var seasonsArr) && seasonsArr.ValueKind == JsonValueKind.Array)
        {
            foreach (var sEl in seasonsArr.EnumerateArray())
            {
                var sNum = JsonInt(sEl, "seasonNumber", -1);
                if (sNum <= 0)
                {
                    continue; // Skip Season 0 (Specials)
                }

                var epCount = Math.Max(0, JsonInt(sEl, "episodeCount", 0));
                var sName = FirstNonEmpty(JsonStr(sEl, "name"), $"Season {sNum}");
                var airRaw = JsonStr(sEl, "airDate");
                var sYear = airRaw.Length >= 4 ? airRaw.Substring(0, 4) : string.Empty;
                var st = seasonStatuses.TryGetValue(sNum, out var foundSt) ? foundSt : 1;

                seasons.Add(new SeerrSeasonItem(
                    SeasonNumber: sNum,
                    Name: sName,
                    EpisodeCount: epCount,
                    Year: sYear,
                    Status: st,
                    StatusLabel: MapStatusLabel(st)));
            }
        }

        seasons.Sort((a, b) => a.SeasonNumber.CompareTo(b.SeasonNumber));
        var tvStatusLabel = isDownloading && mediaStatus is 2 or 3
            ? (downloadProgress.HasValue && downloadProgress.Value > 0 ? $"Downloading · {downloadProgress.Value}%" : "Downloading")
            : MapStatusLabel(mediaStatus);

        return new SeerrTvDetail(
            TmdbId: tmdbId,
            Title: title,
            Year: year,
            Overview: overview,
            BackdropUrl: backdropUrl,
            MediaStatus: mediaStatus,
            StatusLabel: tvStatusLabel,
            DownloadProgress: isDownloading ? downloadProgress : null,
            Seasons: seasons,
            TvdbId: tvdbId);
    }

    public static async Task<List<SeerrRequestEntry>> GetRecentRequestsAsync(
        PluginConfiguration config,
        bool isKidsProfile,
        CancellationToken cancellationToken = default)
    {
        var entries = new List<SeerrRequestEntry>();
        if (!IsConfigured(config))
        {
            return entries;
        }

        var baseUrl = NormalizeBaseUrl(config.SeerrUrl);
        var reqCacheKey = $"{baseUrl}|{(isKidsProfile ? "1" : "0")}";
        if (RecentRequestsCache.TryGetValue(reqCacheKey, out var cachedReqs) && cachedReqs.ExpiresAtUtc > DateTime.UtcNow)
        {
            return cachedReqs.Entries;
        }

        var apiKey = config.SeerrApiKey.Trim();
        await ValidateSafeSeerrBaseUrlAsync(baseUrl, cancellationToken).ConfigureAwait(false);

        using var resp = await SendSeerrWithCircuitBreakerAsync(
            HttpMethod.Get,
            $"{baseUrl}/api/v1/request?take=20&skip=0&sort=added",
            baseUrl,
            apiKey,
            null,
            cancellationToken).ConfigureAwait(false);
        if (!resp.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Seerr requests endpoint returned HTTP {(int)resp.StatusCode}.");
        }

        var raw = await resp.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        using var doc = JsonDocument.Parse(raw);
        if (!doc.RootElement.TryGetProperty("results", out var results) || results.ValueKind != JsonValueKind.Array)
        {
            return entries;
        }

        var parsedRows = new List<(
            int RequestId,
            int RequestStatus,
            string MediaType,
            int TmdbId,
            int MediaStatus,
            bool IsDownloading,
            int? DownloadProgress,
            string? JellyfinMediaId,
            List<int> Seasons,
            string CreatedAt)>();

        foreach (var el in results.EnumerateArray())
        {
            var reqId = JsonInt(el, "id", 0);
            var reqStatus = Math.Clamp(JsonInt(el, "status", 1), 1, 5);
            var createdAt = JsonStr(el, "createdAt");

            var mediaType = FirstNonEmpty(JsonStr(el, "type")).ToLowerInvariant();
            var tmdbId = 0;
            var mediaStatus = 2;
            var isDownloading = false;
            int? dlProgress = null;
            string? jfMediaId = null;

            if (el.TryGetProperty("media", out var mediaEl) && mediaEl.ValueKind == JsonValueKind.Object)
            {
                tmdbId = JsonInt(mediaEl, "tmdbId", 0);
                if (string.IsNullOrEmpty(mediaType))
                {
                    mediaType = JsonStr(mediaEl, "mediaType").Trim().ToLowerInvariant();
                }

                mediaStatus = NormalizeMediaStatus(JsonInt(mediaEl, "status", 2));
                (isDownloading, dlProgress) = ExtractDownloadProgress(mediaEl);
                var jfId = FirstNonEmpty(JsonStr(mediaEl, "jellyfinMediaId"), JsonStr(mediaEl, "jellyfinMediaId4k"));
                if (!string.IsNullOrEmpty(jfId))
                {
                    jfMediaId = jfId;
                }

                var inlineTitle = FirstNonEmpty(JsonStr(mediaEl, "title"), JsonStr(mediaEl, "name"));
                if (tmdbId > 0 && !string.IsNullOrEmpty(inlineTitle) && mediaType is "movie" or "tv")
                {
                    var inlinePoster = BuildSafeTmdbImageUrl(JsonStr(mediaEl, "posterPath"), "w342");
                    var inlineBackdrop = BuildSafeTmdbImageUrl(JsonStr(mediaEl, "backdropPath"), "w1280");
                    StoreCachedMediaMeta(mediaType, tmdbId, inlineTitle, string.Empty, inlinePoster, inlineBackdrop, null, false, false);
                }
            }

            if (tmdbId <= 0 || mediaType is not ("movie" or "tv"))
            {
                continue;
            }

            var reqSeasons = new List<int>();
            if (el.TryGetProperty("seasons", out var sArr) && sArr.ValueKind == JsonValueKind.Array)
            {
                foreach (var sEl in sArr.EnumerateArray())
                {
                    var sn = sEl.ValueKind == JsonValueKind.Number
                        ? (sEl.TryGetInt32(out var directSn) ? directSn : 0)
                        : JsonInt(sEl, "seasonNumber", 0);
                    if (sn > 0 && sn <= 200 && !reqSeasons.Contains(sn))
                    {
                        reqSeasons.Add(sn);
                    }
                }

                reqSeasons.Sort();
            }

            parsedRows.Add((reqId, reqStatus, mediaType, tmdbId, mediaStatus, isDownloading, dlProgress, jfMediaId, reqSeasons, createdAt));
            if (parsedRows.Count >= 18)
            {
                break;
            }
        }

        if (parsedRows.Count == 0)
        {
            return entries;
        }

        // Resolve uncached TMDB title/poster metadata under a strict non-throwing 3.5s timebox (max 8 uncached per call)
        // so slow upstream TMDB lookups NEVER cause "The operation was canceled." on the request tracker!
        var uncachedPairs = parsedRows
            .Select(r => (r.MediaType, r.TmdbId))
            .Distinct()
            .Where(pair =>
            {
                var ck = $"{pair.MediaType}:{pair.TmdbId.ToString(CultureInfo.InvariantCulture)}";
                return !MediaMetaCache.TryGetValue(ck, out var c) || c.ExpiresAtUtc <= DateTime.UtcNow;
            })
            .Take(8)
            .ToList();

        if (uncachedPairs.Count > 0)
        {
            using var metaCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            metaCts.CancelAfter(TimeSpan.FromSeconds(3.5));
            using var gate = new SemaphoreSlim(6, 6);

            var fetchTasks = uncachedPairs.Select(async pair =>
            {
                var acquired = false;
                try
                {
                    await gate.WaitAsync(metaCts.Token).ConfigureAwait(false);
                    acquired = true;

                    var cacheKey = $"{pair.MediaType}:{pair.TmdbId.ToString(CultureInfo.InvariantCulture)}";
                    if (MediaMetaCache.TryGetValue(cacheKey, out var cached) && cached.ExpiresAtUtc > DateTime.UtcNow)
                    {
                        return;
                    }

                    var metaUrl = $"{baseUrl}/api/v1/{pair.MediaType}/{pair.TmdbId.ToString(CultureInfo.InvariantCulture)}";
                    using var metaResp = await SendSeerrAsync(HttpMethod.Get, metaUrl, apiKey, null, metaCts.Token).ConfigureAwait(false);
                    if (!metaResp.IsSuccessStatusCode)
                    {
                        return;
                    }

                    using var mDoc = JsonDocument.Parse(await metaResp.Content.ReadAsStringAsync(metaCts.Token).ConfigureAwait(false));
                    var mRoot = mDoc.RootElement;
                    var mTitle = FirstNonEmpty(JsonStr(mRoot, "title"), JsonStr(mRoot, "name"), JsonStr(mRoot, "originalTitle"), JsonStr(mRoot, "originalName"));
                    var mDate = FirstNonEmpty(JsonStr(mRoot, "releaseDate"), JsonStr(mRoot, "firstAirDate"));
                    var mYear = mDate.Length >= 4 && int.TryParse(mDate.AsSpan(0, 4), out var yr) && yr >= 1888 && yr <= 2100
                        ? yr.ToString(CultureInfo.InvariantCulture)
                        : string.Empty;
                    var mPoster = BuildSafeTmdbImageUrl(JsonStr(mRoot, "posterPath"), "w342");
                    var mBackdrop = BuildSafeTmdbImageUrl(JsonStr(mRoot, "backdropPath"), "w1280");
                    int? mTvdb = null;
                    if (mRoot.TryGetProperty("externalIds", out var extIds) && extIds.ValueKind == JsonValueKind.Object)
                    {
                        var tvdbVal = JsonInt(extIds, "tvdbId", 0);
                        if (tvdbVal > 0)
                        {
                            mTvdb = tvdbVal;
                        }
                    }

                    StoreCachedMediaMeta(pair.MediaType, pair.TmdbId, mTitle, mYear, mPoster, mBackdrop, mTvdb, JsonBool(mRoot, "adult"), HasMatureDetailGenres(mRoot));
                }
                catch
                {
                    // Non-fatal: return request rows immediately even if TMDB metadata is slow
                }
                finally
                {
                    if (acquired)
                    {
                        gate.Release();
                    }
                }
            });

            await Task.WhenAll(fetchTasks).ConfigureAwait(false);
        }

        foreach (var row in parsedRows)
        {
            var cacheKey = $"{row.MediaType}:{row.TmdbId.ToString(CultureInfo.InvariantCulture)}";
            MediaMetaCache.TryGetValue(cacheKey, out var meta);
            if (meta != null && (meta.IsAdult || (isKidsProfile && meta.IsMatureForKids)))
            {
                continue;
            }

            var title = meta != null && !string.IsNullOrEmpty(meta.Title)
                ? meta.Title
                : $"{(row.MediaType == "tv" ? "Series" : "Movie")} #{row.TmdbId.ToString(CultureInfo.InvariantCulture)}";
            var year = meta?.Year ?? string.Empty;
            var posterUrl = meta?.PosterUrl ?? string.Empty;
            var backdropUrl = meta?.BackdropUrl ?? string.Empty;

            string statusKey;
            string statusLabel;
            if (row.RequestStatus == 3)
            {
                statusKey = "declined";
                statusLabel = "Declined";
            }
            else if (row.RequestStatus == 4)
            {
                statusKey = "failed";
                statusLabel = "Failed";
            }
            else if (row.MediaStatus == 5)
            {
                statusKey = "available";
                statusLabel = "Available";
            }
            else if (row.MediaStatus == 4)
            {
                statusKey = "partial";
                statusLabel = "Partially Available";
            }
            else if (row.IsDownloading)
            {
                statusKey = "downloading";
                statusLabel = row.DownloadProgress.HasValue && row.DownloadProgress.Value > 0
                    ? $"Downloading · {row.DownloadProgress.Value}%"
                    : "Downloading";
            }
            else if (row.RequestStatus == 1)
            {
                statusKey = "pending";
                statusLabel = "Pending Approval";
            }
            else if (row.MediaStatus == 3)
            {
                statusKey = "processing";
                statusLabel = "Processing";
            }
            else
            {
                statusKey = "approved";
                statusLabel = "Approved · Queued";
            }

            entries.Add(new SeerrRequestEntry(
                RequestId: row.RequestId,
                TmdbId: row.TmdbId,
                MediaType: row.MediaType,
                Title: title,
                Year: year,
                PosterUrl: posterUrl,
                BackdropUrl: backdropUrl,
                RequestStatus: row.RequestStatus,
                MediaStatus: row.MediaStatus,
                StatusKey: statusKey,
                StatusLabel: statusLabel,
                DownloadProgress: row.IsDownloading ? row.DownloadProgress : null,
                Seasons: row.Seasons,
                CreatedAt: row.CreatedAt,
                JellyfinMediaId: row.JellyfinMediaId));
        }

        RecentRequestsCache[reqCacheKey] = new CachedRequestsResult(entries, DateTime.UtcNow.AddSeconds(6));
        return entries;
    }

    public static async Task<(bool Ok, int MediaStatus, string StatusLabel, string Message)> SubmitRequestAsync(
        PluginConfiguration config,
        int tmdbId,
        string mediaType,
        List<int>? requestedSeasons,
        CancellationToken cancellationToken = default)
    {
        if (tmdbId <= 0)
        {
            throw new InvalidOperationException("Invalid media identifier.");
        }

        var cleanType = (mediaType ?? string.Empty).Trim().ToLowerInvariant();
        if (cleanType is not ("movie" or "tv"))
        {
            throw new InvalidOperationException("Media type must be 'movie' or 'tv'.");
        }

        var baseUrl = NormalizeBaseUrl(config.SeerrUrl);
        var apiKey = config.SeerrApiKey.Trim();
        await ValidateSafeSeerrBaseUrlAsync(baseUrl, cancellationToken).ConfigureAwait(false);

        string payloadJson;
        if (cleanType == "movie")
        {
            payloadJson = JsonSerializer.Serialize(new
            {
                mediaType = "movie",
                mediaId = tmdbId,
                is4k = false,
            });
        }
        else
        {
            var seasons = (requestedSeasons ?? new List<int>())
                .Where(s => s > 0 && s <= 200)
                .Distinct()
                .OrderBy(s => s)
                .ToList();

            var metaKey = $"tv:{tmdbId.ToString(CultureInfo.InvariantCulture)}";
            MediaMetaCache.TryGetValue(metaKey, out var cachedMeta);
            int? tvdbId = cachedMeta?.TvdbId;

            if (seasons.Count == 0 || !tvdbId.HasValue)
            {
                try
                {
                    using var tvCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    tvCts.CancelAfter(TimeSpan.FromSeconds(8));
                    var tvDetail = await GetTvDetailsAsync(config, tmdbId, tvCts.Token).ConfigureAwait(false);
                    if (tvDetail.TvdbId.HasValue && tvDetail.TvdbId.Value > 0)
                    {
                        tvdbId = tvDetail.TvdbId;
                    }

                    if (seasons.Count == 0)
                    {
                        seasons = tvDetail.Seasons
                            .Where(s => s.Status is not (2 or 3 or 4 or 5))
                            .Select(s => s.SeasonNumber)
                            .ToList();
                        if (seasons.Count == 0)
                        {
                            seasons = tvDetail.Seasons
                                .Where(s => s.Status is not 5)
                                .Select(s => s.SeasonNumber)
                                .ToList();
                        }

                        if (seasons.Count == 0 && tvDetail.Seasons.Count > 0)
                        {
                            seasons = tvDetail.Seasons.Select(s => s.SeasonNumber).ToList();
                        }
                    }
                }
                catch
                {
                    // Fall back cleanly if TV detail preflight times out
                }
            }

            if (seasons.Count == 0)
            {
                seasons.Add(1);
            }

            payloadJson = tvdbId.HasValue && tvdbId.Value > 0
                ? JsonSerializer.Serialize(new
                {
                    mediaType = "tv",
                    mediaId = tmdbId,
                    tvdbId = tvdbId.Value,
                    seasons,
                    is4k = false,
                })
                : JsonSerializer.Serialize(new
                {
                    mediaType = "tv",
                    mediaId = tmdbId,
                    seasons,
                    is4k = false,
                });
        }

        using var resp = await SendSeerrWithCircuitBreakerAsync(
            HttpMethod.Post,
            baseUrl + "/api/v1/request",
            baseUrl,
            apiKey,
            payloadJson,
            cancellationToken).ConfigureAwait(false);
        var respBody = await resp.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);

        SearchCache.Clear();
        RecentRequestsCache.Clear();

        if ((int)resp.StatusCode == 409)
        {
            return (true, 2, "Requested", "This title has already been requested in Seerr.");
        }

        if ((int)resp.StatusCode == 202)
        {
            var note = ExtractSeerrError(respBody) ?? "All available seasons are already requested or in your library.";
            return (true, 2, "Requested", note);
        }

        if (!resp.IsSuccessStatusCode)
        {
            var errMsg = ExtractSeerrError(respBody) ?? $"Seerr returned HTTP {(int)resp.StatusCode}.";
            throw new InvalidOperationException(errMsg);
        }

        var newStatus = 2;
        try
        {
            using var doc = JsonDocument.Parse(respBody);
            if (doc.RootElement.TryGetProperty("media", out var mediaEl) && mediaEl.ValueKind == JsonValueKind.Object)
            {
                newStatus = Math.Clamp(NormalizeMediaStatus(JsonInt(mediaEl, "status", 2)), 2, 5);
            }
        }
        catch
        {
        }

        return (true, newStatus, MapStatusLabel(newStatus), "Request submitted to Seerr!");
    }

    public static async Task ValidateSafeSeerrBaseUrlAsync(string rawBaseUrl, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(rawBaseUrl, UriKind.Absolute, out var uri))
        {
            throw new InvalidOperationException("Seerr URL must be a valid http:// or https:// address.");
        }

        if (!string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Only http:// or https:// Seerr URLs are supported.");
        }

        if (!string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment))
        {
            throw new InvalidOperationException("Seerr URL must not embed credentials, query parameters, or URL fragments.");
        }

        await ResolveAndValidateHostAddressesAsync(uri.DnsSafeHost, cancellationToken).ConfigureAwait(false);
    }

    private static async Task<IPAddress[]> ResolveAndValidateHostAddressesAsync(string host, CancellationToken cancellationToken)
    {
        if (IPAddress.TryParse(host, out var literalIp))
        {
            var norm = literalIp.IsIPv4MappedToIPv6 ? literalIp.MapToIPv4() : literalIp;
            if (IsForbiddenMetadataOrUnspecifiedIp(norm))
            {
                throw new InvalidOperationException("Seerr target IP is blocked by SSRF security policy.");
            }

            return new[] { norm };
        }

        if (DnsCache.TryGetValue(host, out var cached) && cached.ExpiresAtUtc > DateTime.UtcNow && cached.Addresses.Length > 0)
        {
            return cached.Addresses;
        }

        var rawAddrs = await Dns.GetHostAddressesAsync(host, cancellationToken).ConfigureAwait(false);
        if (rawAddrs.Length == 0)
        {
            throw new InvalidOperationException($"Could not resolve Seerr host '{host}'.");
        }

        var ordered = new List<IPAddress>(rawAddrs.Length);
        foreach (var rawIp in rawAddrs)
        {
            var ip = rawIp.IsIPv4MappedToIPv6 ? rawIp.MapToIPv4() : rawIp;
            if (IsForbiddenMetadataOrUnspecifiedIp(ip))
            {
                throw new InvalidOperationException("Seerr target IP is blocked by SSRF security policy.");
            }

            ordered.Add(ip);
        }

        // Prefer IPv4 before IPv6 so dual-stack localhost / Cloudflare / Docker bridges without IPv6 never stall on SYN timeouts
        var sorted = ordered
            .OrderBy(a => a.AddressFamily == AddressFamily.InterNetwork ? 0 : 1)
            .ToArray();

        if (DnsCache.Count > 64)
        {
            DnsCache.Clear();
        }

        DnsCache[host] = new CachedHostAddresses(sorted, DateTime.UtcNow.AddMinutes(2));
        return sorted;
    }

    private static async ValueTask<Stream> ConnectSeerrSocketAsync(SocketsHttpConnectionContext context, CancellationToken cancellationToken)
    {
        var host = context.DnsEndPoint.Host;
        var port = context.DnsEndPoint.Port;
        var addresses = await ResolveAndValidateHostAddressesAsync(host, cancellationToken).ConfigureAwait(false);

        Exception? lastEx = null;
        var sawConnectionRefused = false;

        foreach (var ip in addresses)
        {
            var socket = new Socket(ip.AddressFamily, SocketType.Stream, ProtocolType.Tcp)
            {
                NoDelay = true,
            };

            try
            {
                using var perIpCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                perIpCts.CancelAfter(TimeSpan.FromMilliseconds(2500));
                await socket.ConnectAsync(new IPEndPoint(ip, port), perIpCts.Token).ConfigureAwait(false);
                return new NetworkStream(socket, ownsSocket: true);
            }
            catch (Exception ex)
            {
                socket.Dispose();
                if (cancellationToken.IsCancellationRequested)
                {
                    throw;
                }

                if (ex is SocketException se && se.SocketErrorCode == SocketError.ConnectionRefused)
                {
                    sawConnectionRefused = true;
                }

                lastEx = ex;
            }
        }

        // Helpful Docker container fallback: if Jellyfin runs in Docker and the admin entered http://localhost:5055,
        // try host.docker.internal:<port> automatically when localhost refuses connection.
        if (sawConnectionRefused
            && (string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase) || string.Equals(host, "127.0.0.1", StringComparison.Ordinal)))
        {
            try
            {
                var dockerHostIps = await ResolveAndValidateHostAddressesAsync("host.docker.internal", cancellationToken).ConfigureAwait(false);
                foreach (var dip in dockerHostIps)
                {
                    var dSocket = new Socket(dip.AddressFamily, SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
                    try
                    {
                        using var dCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                        dCts.CancelAfter(TimeSpan.FromMilliseconds(2000));
                        await dSocket.ConnectAsync(new IPEndPoint(dip, port), dCts.Token).ConfigureAwait(false);
                        return new NetworkStream(dSocket, ownsSocket: true);
                    }
                    catch
                    {
                        dSocket.Dispose();
                    }
                }
            }
            catch
            {
            }
        }

        throw lastEx ?? new SocketException((int)SocketError.HostUnreachable);
    }

    private static async Task<HttpResponseMessage> SendSeerrWithCircuitBreakerAsync(
        HttpMethod method,
        string url,
        string baseUrl,
        string apiKey,
        string? jsonBody,
        CancellationToken cancellationToken)
    {
        try
        {
            var resp = await SendSeerrAsync(method, url, apiKey, jsonBody, cancellationToken).ConfigureAwait(false);
            if (string.Equals(_unreachableBaseUrl, baseUrl, StringComparison.OrdinalIgnoreCase))
            {
                Interlocked.Exchange(ref _unreachableUntilTicks, 0);
            }

            return resp;
        }
        catch (HttpRequestException)
        {
            MarkTemporarilyUnreachable(baseUrl);
            throw;
        }
        catch (SocketException)
        {
            MarkTemporarilyUnreachable(baseUrl);
            throw;
        }
    }

    private static async Task<HttpResponseMessage> SendSeerrAsync(
        HttpMethod method,
        string url,
        string apiKey,
        string? jsonBody,
        CancellationToken cancellationToken)
    {
        var currentUri = new Uri(url, UriKind.Absolute);
        var initialHost = currentUri.DnsSafeHost;
        var currentMethod = method;
        var currentBody = jsonBody;

        for (var hop = 0; hop <= 3; hop++)
        {
            using var req = new HttpRequestMessage(currentMethod, currentUri);
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            if (string.Equals(currentUri.DnsSafeHost, initialHost, StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(apiKey))
            {
                req.Headers.TryAddWithoutValidation("X-Api-Key", apiKey);
            }

            if (currentBody != null && (currentMethod == HttpMethod.Post || currentMethod == HttpMethod.Put))
            {
                req.Content = new StringContent(currentBody, Encoding.UTF8, "application/json");
            }

            var resp = await SeerrHttp.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
            var code = (int)resp.StatusCode;
            if (code is not (301 or 302 or 303 or 307 or 308) || resp.Headers.Location == null || hop == 3)
            {
                return resp;
            }

            var loc = resp.Headers.Location;
            resp.Dispose();

            var nextUri = loc.IsAbsoluteUri ? loc : new Uri(currentUri, loc);
            if (!string.Equals(nextUri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)
                && !string.Equals(nextUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Seerr redirect pointed to an unsupported URL scheme.");
            }

            await ResolveAndValidateHostAddressesAsync(nextUri.DnsSafeHost, cancellationToken).ConfigureAwait(false);

            var isSameHostHttpsUpgrade = string.Equals(nextUri.DnsSafeHost, currentUri.DnsSafeHost, StringComparison.OrdinalIgnoreCase)
                && string.Equals(currentUri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)
                && string.Equals(nextUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase);

            if (code == 303 || ((code is 301 or 302) && currentMethod != HttpMethod.Get && !isSameHostHttpsUpgrade))
            {
                currentMethod = HttpMethod.Get;
                currentBody = null;
            }

            currentUri = nextUri;
        }

        throw new InvalidOperationException("Too many redirects from Seerr.");
    }

    private static bool IsTemporarilyUnreachable(string baseUrl)
    {
        var until = Interlocked.Read(ref _unreachableUntilTicks);
        return until > DateTime.UtcNow.Ticks && string.Equals(_unreachableBaseUrl, baseUrl, StringComparison.OrdinalIgnoreCase);
    }

    private static void MarkTemporarilyUnreachable(string baseUrl)
    {
        _unreachableBaseUrl = baseUrl;
        Interlocked.Exchange(ref _unreachableUntilTicks, DateTime.UtcNow.AddSeconds(12).Ticks);
    }

    private static void PruneSearchCacheIfNeeded()
    {
        if (SearchCache.Count <= 96)
        {
            return;
        }

        var now = DateTime.UtcNow;
        foreach (var kv in SearchCache)
        {
            if (kv.Value.ExpiresAtUtc <= now)
            {
                SearchCache.TryRemove(kv.Key, out _);
            }
        }
    }

    private static void StoreCachedMediaMeta(
        string mediaType,
        int tmdbId,
        string title,
        string year,
        string posterUrl,
        string backdropUrl,
        int? tvdbId,
        bool isAdult,
        bool isMatureForKids)
    {
        if (tmdbId <= 0 || string.IsNullOrEmpty(title))
        {
            return;
        }

        if (MediaMetaCache.Count > 500)
        {
            var now = DateTime.UtcNow;
            foreach (var kv in MediaMetaCache)
            {
                if (kv.Value.ExpiresAtUtc <= now)
                {
                    MediaMetaCache.TryRemove(kv.Key, out _);
                }
            }
        }

        var key = $"{mediaType}:{tmdbId.ToString(CultureInfo.InvariantCulture)}";
        MediaMetaCache.TryGetValue(key, out var existing);
        MediaMetaCache[key] = new CachedMediaMeta(
            Title: title,
            Year: !string.IsNullOrEmpty(year) ? year : (existing?.Year ?? string.Empty),
            PosterUrl: !string.IsNullOrEmpty(posterUrl) ? posterUrl : (existing?.PosterUrl ?? string.Empty),
            BackdropUrl: !string.IsNullOrEmpty(backdropUrl) ? backdropUrl : (existing?.BackdropUrl ?? string.Empty),
            TvdbId: tvdbId ?? existing?.TvdbId,
            IsAdult: isAdult,
            IsMatureForKids: isMatureForKids,
            ExpiresAtUtc: DateTime.UtcNow.AddMinutes(60));
    }

    private static (bool IsDownloading, int? ProgressPercent) ExtractDownloadProgress(JsonElement mediaObj)
    {
        if (mediaObj.ValueKind != JsonValueKind.Object)
        {
            return (false, null);
        }

        long totalSize = 0;
        long totalLeft = 0;
        var hasAnyItem = false;

        foreach (var propName in new[] { "downloadStatus", "downloadStatus4k" })
        {
            if (!mediaObj.TryGetProperty(propName, out var arr) || arr.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            foreach (var item in arr.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                hasAnyItem = true;
                var size = JsonLong(item, "size");
                var left = JsonLong(item, "sizeLeft");
                if (size > 0)
                {
                    totalSize += size;
                    totalLeft += Math.Clamp(left, 0, size);
                }
            }
        }

        if (!hasAnyItem)
        {
            return (false, null);
        }

        if (totalSize > 0)
        {
            var pct = (int)Math.Clamp(Math.Round((1.0 - ((double)totalLeft / totalSize)) * 100.0), 0, 100);
            return (true, pct);
        }

        return (true, null);
    }

    private static bool HasMatureDetailGenres(JsonElement root)
    {
        if (HasMatureTmdbGenre(root))
        {
            return true;
        }

        if (root.TryGetProperty("genres", out var gArr) && gArr.ValueKind == JsonValueKind.Array)
        {
            foreach (var g in gArr.EnumerateArray())
            {
                var gid = JsonInt(g, "id", 0);
                var gName = JsonStr(g, "name");
                if (gid == 27 || string.Equals(gName, "Horror", StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static string BuildSafeTmdbImageUrl(string rawPath, string sizeBucket)
    {
        var trimmed = (rawPath ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(trimmed) || !SafeTmdbImagePathRegex.IsMatch(trimmed))
        {
            return string.Empty;
        }

        return $"https://image.tmdb.org/t/p/{sizeBucket}{trimmed}";
    }

    private static bool HasMatureTmdbGenre(JsonElement el)
    {
        if (!el.TryGetProperty("genreIds", out var arr) || arr.ValueKind != JsonValueKind.Array)
        {
            return false;
        }

        foreach (var item in arr.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out var gid))
            {
                if (gid == 27)
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static string? ExtractSeerrError(string? body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(body);
            var msg = FirstNonEmpty(JsonStr(doc.RootElement, "message"), JsonStr(doc.RootElement, "error"));
            if (!string.IsNullOrWhiteSpace(msg))
            {
                return msg.Length > 200 ? msg.Substring(0, 200) : msg;
            }
        }
        catch
        {
        }

        return null;
    }

    private static bool IsForbiddenMetadataOrUnspecifiedIp(IPAddress ip)
    {
        if (ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.IPv6Any) || ip.Equals(IPAddress.Broadcast))
        {
            return true;
        }

        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            var b = ip.GetAddressBytes();
            if (b[0] == 0 || (b[0] == 169 && b[1] == 254) || (b[0] == 100 && b[1] == 100 && b[2] == 100 && b[3] == 200))
            {
                return true;
            }
        }
        else if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            if (ip.IsIPv6LinkLocal || ip.IsIPv6Multicast)
            {
                return true;
            }

            var b = ip.GetAddressBytes();
            if (b[0] == 0xfd && b[1] == 0x00 && b[2] == 0x0e && b[3] == 0xc2)
            {
                return true;
            }
        }

        return false;
    }

    private static string JsonStr(JsonElement obj, string propName)
    {
        if (obj.ValueKind == JsonValueKind.Object && obj.TryGetProperty(propName, out var prop))
        {
            return prop.ValueKind switch
            {
                JsonValueKind.String => prop.GetString() ?? string.Empty,
                JsonValueKind.Number => prop.GetRawText(),
                _ => string.Empty,
            };
        }

        return string.Empty;
    }

    private static int JsonInt(JsonElement obj, string propName, int fallback = 0)
    {
        if (obj.ValueKind == JsonValueKind.Object && obj.TryGetProperty(propName, out var prop))
        {
            if (prop.ValueKind == JsonValueKind.Number && prop.TryGetInt32(out var v))
            {
                return v;
            }

            if (prop.ValueKind == JsonValueKind.String && int.TryParse(prop.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var sv))
            {
                return sv;
            }
        }

        return fallback;
    }

    private static long JsonLong(JsonElement obj, string propName, long fallback = 0)
    {
        if (obj.ValueKind == JsonValueKind.Object && obj.TryGetProperty(propName, out var prop))
        {
            if (prop.ValueKind == JsonValueKind.Number && prop.TryGetInt64(out var v))
            {
                return v;
            }

            if (prop.ValueKind == JsonValueKind.String && long.TryParse(prop.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var sv))
            {
                return sv;
            }
        }

        return fallback;
    }

    private static double JsonDouble(JsonElement obj, string propName)
    {
        if (obj.ValueKind == JsonValueKind.Object && obj.TryGetProperty(propName, out var prop) && prop.ValueKind == JsonValueKind.Number && prop.TryGetDouble(out var d))
        {
            return d;
        }

        return 0;
    }

    private static bool JsonBool(JsonElement obj, string propName)
    {
        if (obj.ValueKind == JsonValueKind.Object && obj.TryGetProperty(propName, out var prop))
        {
            return prop.ValueKind == JsonValueKind.True;
        }

        return false;
    }

    private static string FirstNonEmpty(params string?[] vals)
    {
        foreach (var v in vals)
        {
            if (!string.IsNullOrWhiteSpace(v))
            {
                return v.Trim();
            }
        }

        return string.Empty;
    }
}
