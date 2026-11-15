using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Jellyfin.Plugin.StreamFlix.Services;

/// <summary>
/// Server-authoritative real-time Watch Party room &amp; timeline synchronization engine for StreamFlix.
/// Uses monotonic server-side elapsed timeline math and <see cref="TaskCompletionSource{TResult}"/> instant-wake
/// HTTP long-polling so playback stays locked across browsers, mobile apps, and reverse proxies without WebSocket breakage.
/// </summary>
public static class StreamFlixWatchPartyService
{
    private const int MaxActiveRooms = 32;
    private const int MaxParticipantsPerRoom = 24;
    private static readonly TimeSpan ParticipantStaleTimeout = TimeSpan.FromSeconds(45);
    private static readonly TimeSpan EmptyRoomGraceTimeout = TimeSpan.FromMinutes(20);
    private static readonly TimeSpan MaxRoomIdleLifetime = TimeSpan.FromHours(8);
    private const string RoomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private static readonly Regex SafeCodeRegex = new(@"^[A-Za-z0-9-]{4,36}$", RegexOptions.Compiled);
    private static readonly Regex SafeHexColorRegex = new(@"^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$", RegexOptions.Compiled);

    private static readonly ConcurrentDictionary<string, WatchPartyRoom> Rooms = new(StringComparer.OrdinalIgnoreCase);
    private static readonly object CreateRoomLock = new();

    public sealed class ParticipantUpdateInput
    {
        public string ParticipantId { get; init; } = string.Empty;

        public string JellyfinUserId { get; init; } = string.Empty;

        public string ProfileId { get; init; } = string.Empty;

        public string DisplayName { get; init; } = "Viewer";

        public string AvatarEmoji { get; init; } = "🎬";

        public string AvatarColorHex { get; init; } = "#E50914";

        public double? PositionSeconds { get; init; }

        public bool? IsBuffering { get; init; }
    }

    public sealed class CreateRoomInput
    {
        public string Name { get; init; } = string.Empty;

        public bool HostControlOnly { get; init; }

        public string? ItemId { get; init; }

        public string? ItemName { get; init; }

        public string? SeriesName { get; init; }

        public int? SeasonNumber { get; init; }

        public int? EpisodeNumber { get; init; }

        public string? ItemType { get; init; }

        public long? RunTimeTicks { get; init; }

        public double? StartPositionSeconds { get; init; }

        public bool? IsPlaying { get; init; }
    }

    public sealed class CommandInput
    {
        public string Action { get; init; } = string.Empty;

        public string? ActionId { get; init; }

        public double? PositionSeconds { get; init; }

        public bool? IsPlaying { get; init; }

        public bool? HostControlOnly { get; init; }

        public string? ItemId { get; init; }

        public string? ItemName { get; init; }

        public string? SeriesName { get; init; }

        public int? SeasonNumber { get; init; }

        public int? EpisodeNumber { get; init; }

        public string? ItemType { get; init; }

        public long? RunTimeTicks { get; init; }

        public bool? IsBuffering { get; init; }
    }

    public sealed class RoomSnapshot
    {
        [JsonPropertyName("roomId")]
        public string RoomId { get; init; } = string.Empty;

        [JsonPropertyName("groupId")]
        public string GroupId { get; init; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; init; } = string.Empty;

        [JsonPropertyName("groupName")]
        public string GroupName { get; init; } = string.Empty;

        [JsonPropertyName("version")]
        public long Version { get; init; }

        [JsonPropertyName("serverNowUtcMs")]
        public long ServerNowUtcMs { get; init; }

        [JsonPropertyName("hostParticipantId")]
        public string HostParticipantId { get; init; } = string.Empty;

        [JsonPropertyName("hostName")]
        public string HostName { get; init; } = string.Empty;

        [JsonPropertyName("hostControlOnly")]
        public bool HostControlOnly { get; init; }

        [JsonPropertyName("itemId")]
        public string ItemId { get; init; } = string.Empty;

        [JsonPropertyName("itemName")]
        public string ItemName { get; init; } = string.Empty;

        [JsonPropertyName("seriesName")]
        public string SeriesName { get; init; } = string.Empty;

        [JsonPropertyName("seasonNumber")]
        public int? SeasonNumber { get; init; }

        [JsonPropertyName("episodeNumber")]
        public int? EpisodeNumber { get; init; }

        [JsonPropertyName("itemType")]
        public string ItemType { get; init; } = string.Empty;

        [JsonPropertyName("runTimeTicks")]
        public long? RunTimeTicks { get; init; }

        [JsonPropertyName("isPlaying")]
        public bool IsPlaying { get; init; }

        [JsonPropertyName("state")]
        public string State { get; init; } = "Ready";

        [JsonPropertyName("basePositionSeconds")]
        public double BasePositionSeconds { get; init; }

        [JsonPropertyName("expectedPositionSeconds")]
        public double ExpectedPositionSeconds { get; init; }

        [JsonPropertyName("stateUpdatedAtUtcMs")]
        public long StateUpdatedAtUtcMs { get; init; }

        [JsonPropertyName("lastActionId")]
        public string LastActionId { get; init; } = string.Empty;

        [JsonPropertyName("lastActionKind")]
        public string LastActionKind { get; init; } = string.Empty;

        [JsonPropertyName("lastActorParticipantId")]
        public string LastActorParticipantId { get; init; } = string.Empty;

        [JsonPropertyName("lastActionBy")]
        public string LastActionBy { get; init; } = string.Empty;

        [JsonPropertyName("lastActionText")]
        public string LastActionText { get; init; } = string.Empty;

        [JsonPropertyName("lastActionAtUtcMs")]
        public long LastActionAtUtcMs { get; init; }

        [JsonPropertyName("participantCount")]
        public int ParticipantCount { get; init; }

        [JsonPropertyName("participants")]
        public List<ParticipantSnapshot> Participants { get; init; } = new();
    }

    public sealed class ParticipantSnapshot
    {
        [JsonPropertyName("participantId")]
        public string ParticipantId { get; init; } = string.Empty;

        [JsonPropertyName("profileId")]
        public string ProfileId { get; init; } = string.Empty;

        [JsonPropertyName("displayName")]
        public string DisplayName { get; init; } = string.Empty;

        [JsonPropertyName("avatarEmoji")]
        public string AvatarEmoji { get; init; } = string.Empty;

        [JsonPropertyName("avatarColorHex")]
        public string AvatarColorHex { get; init; } = string.Empty;

        [JsonPropertyName("isHost")]
        public bool IsHost { get; init; }

        [JsonPropertyName("positionSeconds")]
        public double PositionSeconds { get; init; }

        [JsonPropertyName("isBuffering")]
        public bool IsBuffering { get; init; }
    }

    private sealed class WatchPartyParticipant
    {
        public string ParticipantId { get; set; } = string.Empty;

        public string JellyfinUserId { get; set; } = string.Empty;

        public string ProfileId { get; set; } = string.Empty;

        public string DisplayName { get; set; } = "Viewer";

        public string AvatarEmoji { get; set; } = "🎬";

        public string AvatarColorHex { get; set; } = "#E50914";

        public double PositionSeconds { get; set; }

        public bool IsBuffering { get; set; }

        public DateTimeOffset JoinedAtUtc { get; set; }

        public DateTimeOffset LastSeenUtc { get; set; }
    }

    private sealed class WatchPartyRoom
    {
        public object SyncRoot { get; } = new();

        public string RoomId { get; set; } = string.Empty;

        public string Name { get; set; } = string.Empty;

        public DateTimeOffset CreatedAtUtc { get; set; }

        public DateTimeOffset LastActivityUtc { get; set; }

        public DateTimeOffset? EmptySinceUtc { get; set; }

        public string HostParticipantId { get; set; } = string.Empty;

        public string HostName { get; set; } = string.Empty;

        public bool HostControlOnly { get; set; }

        public long Version { get; set; } = 1;

        public string ItemId { get; set; } = string.Empty;

        public string ItemName { get; set; } = string.Empty;

        public string SeriesName { get; set; } = string.Empty;

        public int? SeasonNumber { get; set; }

        public int? EpisodeNumber { get; set; }

        public string ItemType { get; set; } = string.Empty;

        public long? RunTimeTicks { get; set; }

        public bool IsPlaying { get; set; }

        public double BasePositionSeconds { get; set; }

        public DateTimeOffset StateUpdatedAtUtc { get; set; }

        public string LastActionId { get; set; } = string.Empty;

        public string LastActionKind { get; set; } = string.Empty;

        public string LastActorParticipantId { get; set; } = string.Empty;

        public string LastActionBy { get; set; } = string.Empty;

        public string LastActionText { get; set; } = string.Empty;

        public DateTimeOffset LastActionAtUtc { get; set; }

        public Dictionary<string, WatchPartyParticipant> Participants { get; } = new(StringComparer.Ordinal);

        public TaskCompletionSource<bool> ChangeSignal { get; set; } = CreateSignal();
    }

    public static string? SanitizeRoomCode(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var trimmed = raw.Trim();
        if (!SafeCodeRegex.IsMatch(trimmed))
        {
            return null;
        }

        return trimmed.ToUpperInvariant();
    }

    public static string SanitizeParticipantId(string? raw, string fallbackSeed)
    {
        var candidate = (raw ?? string.Empty).Trim();
        if (candidate.Length >= 6 && candidate.Length <= 64 && SafeCodeRegex.IsMatch(candidate.Replace('_', '-')))
        {
            return candidate;
        }

        var fallback = Regex.Replace(fallbackSeed ?? string.Empty, @"[^A-Za-z0-9-]", string.Empty);
        if (fallback.Length >= 6)
        {
            return "wp-" + fallback.Substring(0, Math.Min(24, fallback.Length));
        }

        return "wp-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant();
    }

    public static List<RoomSnapshot> ListActiveRooms()
    {
        var now = DateTimeOffset.UtcNow;
        PruneRooms(now);

        var snapshots = new List<RoomSnapshot>();
        foreach (var kvp in Rooms)
        {
            var room = kvp.Value;
            lock (room.SyncRoot)
            {
                PruneStaleParticipantsNoLock(room, now);
                if (IsRoomExpiredNoLock(room, now))
                {
                    if (Rooms.TryRemove(kvp.Key, out var removed))
                    {
                        SignalRoomWaitersNoLock(removed);
                    }

                    continue;
                }

                snapshots.Add(BuildSnapshotNoLock(room, now));
            }
        }

        return snapshots
            .OrderByDescending(r => r.ParticipantCount)
            .ThenByDescending(r => r.StateUpdatedAtUtcMs)
            .ToList();
    }

    public static (RoomSnapshot? Room, string? ErrorMessage) CreateRoom(CreateRoomInput input, ParticipantUpdateInput creator)
    {
        var now = DateTimeOffset.UtcNow;
        PruneRooms(now);

        lock (CreateRoomLock)
        {
            if (Rooms.Count >= MaxActiveRooms)
            {
                PruneRooms(now);
                if (Rooms.Count >= MaxActiveRooms)
                {
                    return (null, "Too many active Watch Parties right now. Join an existing room or close an unused one.");
                }
            }

            RemoveParticipantFromOtherRooms(creator.ParticipantId, exceptRoomId: null, now);

            var roomId = GenerateUniqueRoomCode();
            var cleanName = CleanShortText(input.Name, 64);
            if (string.IsNullOrEmpty(cleanName))
            {
                cleanName = $"{CleanShortText(creator.DisplayName, 28)}'s Watch Party";
            }

            var cleanItemId = CleanItemId(input.ItemId);
            var startPos = ClampSeconds(input.StartPositionSeconds ?? 0, input.RunTimeTicks);
            var startPlaying = !string.IsNullOrEmpty(cleanItemId) && (input.IsPlaying ?? false);

            var room = new WatchPartyRoom
            {
                RoomId = roomId,
                Name = cleanName,
                CreatedAtUtc = now,
                LastActivityUtc = now,
                EmptySinceUtc = null,
                HostParticipantId = creator.ParticipantId,
                HostName = CleanShortText(creator.DisplayName, 32),
                HostControlOnly = input.HostControlOnly,
                Version = 1,
                ItemId = cleanItemId,
                ItemName = CleanShortText(input.ItemName, 120),
                SeriesName = CleanShortText(input.SeriesName, 120),
                SeasonNumber = input.SeasonNumber,
                EpisodeNumber = input.EpisodeNumber,
                ItemType = CleanShortText(input.ItemType, 32),
                RunTimeTicks = input.RunTimeTicks is > 0 ? input.RunTimeTicks : null,
                IsPlaying = startPlaying,
                BasePositionSeconds = startPos,
                StateUpdatedAtUtc = now,
                LastActionKind = "created",
                LastActorParticipantId = creator.ParticipantId,
                LastActionBy = CleanShortText(creator.DisplayName, 32),
                LastActionText = $"{CleanShortText(creator.DisplayName, 32)} started the party",
                LastActionAtUtc = now,
            };

            UpsertParticipantNoLock(room, creator, now);
            Rooms[roomId] = room;

            lock (room.SyncRoot)
            {
                return (BuildSnapshotNoLock(room, now), null);
            }
        }
    }

    public static (RoomSnapshot? Room, string? ErrorMessage) JoinRoom(string rawRoomId, ParticipantUpdateInput participant)
    {
        var code = SanitizeRoomCode(rawRoomId);
        if (string.IsNullOrEmpty(code))
        {
            return (null, "Enter a valid Watch Party code.");
        }

        var now = DateTimeOffset.UtcNow;
        PruneRooms(now);

        if (!Rooms.TryGetValue(code, out var room))
        {
            return (null, "That Watch Party room is no longer active.");
        }

        RemoveParticipantFromOtherRooms(participant.ParticipantId, exceptRoomId: room.RoomId, now);

        lock (room.SyncRoot)
        {
            PruneStaleParticipantsNoLock(room, now);
            if (!room.Participants.ContainsKey(participant.ParticipantId) && room.Participants.Count >= MaxParticipantsPerRoom)
            {
                return (null, "This Watch Party room is full.");
            }

            var isNewMember = !room.Participants.ContainsKey(participant.ParticipantId);
            UpsertParticipantNoLock(room, participant, now);
            room.EmptySinceUtc = null;
            room.LastActivityUtc = now;

            if (string.IsNullOrEmpty(room.HostParticipantId) || !room.Participants.ContainsKey(room.HostParticipantId))
            {
                room.HostParticipantId = participant.ParticipantId;
                room.HostName = CleanShortText(participant.DisplayName, 32);
            }

            if (isNewMember)
            {
                room.LastActionKind = "join";
                room.LastActorParticipantId = participant.ParticipantId;
                room.LastActionBy = CleanShortText(participant.DisplayName, 32);
                room.LastActionText = $"{room.LastActionBy} joined the party";
                room.LastActionAtUtc = now;
                BumpVersionAndSignalNoLock(room);
            }

            return (BuildSnapshotNoLock(room, now), null);
        }
    }

    public static bool LeaveRoom(string? rawRoomId, string participantId, bool closeRoomIfHost = false)
    {
        var now = DateTimeOffset.UtcNow;
        if (string.IsNullOrWhiteSpace(rawRoomId))
        {
            RemoveParticipantFromOtherRooms(participantId, exceptRoomId: null, now);
            return true;
        }

        var code = SanitizeRoomCode(rawRoomId);
        if (string.IsNullOrEmpty(code) || !Rooms.TryGetValue(code, out var room))
        {
            return false;
        }

        lock (room.SyncRoot)
        {
            var removed = room.Participants.Remove(participantId, out var leavingMember);
            PruneStaleParticipantsNoLock(room, now);

            var shouldCloseRoom = (closeRoomIfHost && string.Equals(room.HostParticipantId, participantId, StringComparison.Ordinal))
                || room.Participants.Count == 0;

            if (shouldCloseRoom)
            {
                Rooms.TryRemove(room.RoomId, out _);
                BumpVersionAndSignalNoLock(room);
                return true;
            }

            if (removed)
            {
                EnsureValidHostNoLock(room);
                var displayName = leavingMember?.DisplayName ?? "A viewer";
                room.LastActivityUtc = now;
                room.LastActionKind = "leave";
                room.LastActorParticipantId = participantId;
                room.LastActionBy = displayName;
                room.LastActionText = $"{displayName} left the party";
                room.LastActionAtUtc = now;
                BumpVersionAndSignalNoLock(room);
            }
        }

        return true;
    }

    public static (RoomSnapshot? Room, int StatusCode, string? ErrorMessage) ApplyCommand(
        string rawRoomId,
        ParticipantUpdateInput actor,
        CommandInput command,
        bool isHouseholdAdmin)
    {
        var code = SanitizeRoomCode(rawRoomId);
        if (string.IsNullOrEmpty(code) || !Rooms.TryGetValue(code, out var room))
        {
            return (null, 404, "This Watch Party room has ended.");
        }

        var now = DateTimeOffset.UtcNow;
        var action = (command.Action ?? string.Empty).Trim().ToLowerInvariant();
        var actionId = CleanShortText(command.ActionId, 48);

        lock (room.SyncRoot)
        {
            PruneStaleParticipantsNoLock(room, now);
            UpsertParticipantNoLock(room, actor, now);
            room.EmptySinceUtc = null;
            room.LastActivityUtc = now;

            if (string.IsNullOrEmpty(room.HostParticipantId) || !room.Participants.ContainsKey(room.HostParticipantId))
            {
                room.HostParticipantId = actor.ParticipantId;
                room.HostName = CleanShortText(actor.DisplayName, 32);
            }

            var isHost = string.Equals(room.HostParticipantId, actor.ParticipantId, StringComparison.Ordinal);

            if (action == "heartbeat")
            {
                return (BuildSnapshotNoLock(room, now), 200, null);
            }

            if (action == "toggle_host_only")
            {
                if (!isHost && !isHouseholdAdmin)
                {
                    return (BuildSnapshotNoLock(room, now), 403, "Only the room host can lock or unlock playback controls.");
                }

                var nextLock = command.HostControlOnly ?? !room.HostControlOnly;
                if (room.HostControlOnly != nextLock)
                {
                    room.HostControlOnly = nextLock;
                    RecordActionMetadataNoLock(
                        room,
                        actor,
                        actionId,
                        "settings",
                        nextLock ? $"{actor.DisplayName} locked controls to host" : $"{actor.DisplayName} unlocked controls for everyone",
                        now);
                    BumpVersionAndSignalNoLock(room);
                }

                return (BuildSnapshotNoLock(room, now), 200, null);
            }

            if (room.HostControlOnly && !isHost && !isHouseholdAdmin)
            {
                return (BuildSnapshotNoLock(room, now), 403, $"Playback controls are locked to {room.HostName}.");
            }

            switch (action)
            {
                case "set_media":
                {
                    var itemId = CleanItemId(command.ItemId);
                    if (string.IsNullOrEmpty(itemId))
                    {
                        return (BuildSnapshotNoLock(room, now), 400, "Choose a valid movie or episode to watch together.");
                    }

                    room.ItemId = itemId;
                    room.ItemName = CleanShortText(command.ItemName, 120);
                    room.SeriesName = CleanShortText(command.SeriesName, 120);
                    room.SeasonNumber = command.SeasonNumber;
                    room.EpisodeNumber = command.EpisodeNumber;
                    room.ItemType = CleanShortText(command.ItemType, 32);
                    room.RunTimeTicks = command.RunTimeTicks is > 0 ? command.RunTimeTicks : null;
                    room.BasePositionSeconds = ClampSeconds(command.PositionSeconds ?? 0, room.RunTimeTicks);
                    room.IsPlaying = command.IsPlaying ?? true;
                    room.StateUpdatedAtUtc = now;

                    var label = FormatItemDisplayLabel(room);
                    RecordActionMetadataNoLock(
                        room,
                        actor,
                        actionId,
                        "set_media",
                        $"{actor.DisplayName} started {label}",
                        now);
                    BumpVersionAndSignalNoLock(room);
                    break;
                }

                case "play":
                {
                    var currentExpected = ComputeExpectedPositionNoLock(room, now);
                    var targetPos = ClampSeconds(command.PositionSeconds ?? currentExpected, room.RunTimeTicks);
                    var alreadyAligned = room.IsPlaying
                        && Math.Abs(currentExpected - targetPos) < 1.25
                        && (now - room.StateUpdatedAtUtc).TotalMilliseconds < 700;

                    if (!alreadyAligned)
                    {
                        room.BasePositionSeconds = targetPos;
                        room.IsPlaying = true;
                        room.StateUpdatedAtUtc = now;
                        RecordActionMetadataNoLock(
                            room,
                            actor,
                            actionId,
                            "play",
                            $"{actor.DisplayName} resumed at {FormatClock(targetPos)}",
                            now);
                        BumpVersionAndSignalNoLock(room);
                    }

                    break;
                }

                case "pause":
                {
                    var currentExpected = ComputeExpectedPositionNoLock(room, now);
                    var targetPos = ClampSeconds(command.PositionSeconds ?? currentExpected, room.RunTimeTicks);
                    var changed = room.IsPlaying || Math.Abs(room.BasePositionSeconds - targetPos) > 0.75;
                    if (changed)
                    {
                        room.BasePositionSeconds = targetPos;
                        room.IsPlaying = false;
                        room.StateUpdatedAtUtc = now;
                        RecordActionMetadataNoLock(
                            room,
                            actor,
                            actionId,
                            "pause",
                            $"{actor.DisplayName} paused at {FormatClock(targetPos)}",
                            now);
                        BumpVersionAndSignalNoLock(room);
                    }

                    break;
                }

                case "seek":
                {
                    var targetPos = ClampSeconds(command.PositionSeconds ?? ComputeExpectedPositionNoLock(room, now), room.RunTimeTicks);
                    room.BasePositionSeconds = targetPos;
                    if (command.IsPlaying.HasValue)
                    {
                        room.IsPlaying = command.IsPlaying.Value;
                    }

                    room.StateUpdatedAtUtc = now;
                    RecordActionMetadataNoLock(
                        room,
                        actor,
                        actionId,
                        "seek",
                        $"{actor.DisplayName} jumped to {FormatClock(targetPos)}",
                        now);
                    BumpVersionAndSignalNoLock(room);
                    break;
                }

                default:
                    return (BuildSnapshotNoLock(room, now), 400, "Unsupported Watch Party command.");
            }

            return (BuildSnapshotNoLock(room, now), 200, null);
        }
    }

    public static async Task<RoomSnapshot?> WaitForRoomStateAsync(
        string rawRoomId,
        ParticipantUpdateInput? callerParticipant,
        long sinceVersion,
        int waitMs,
        CancellationToken cancellationToken)
    {
        var code = SanitizeRoomCode(rawRoomId);
        if (string.IsNullOrEmpty(code) || !Rooms.TryGetValue(code, out var room))
        {
            return null;
        }

        var now = DateTimeOffset.UtcNow;
        Task? waitSignalTask = null;

        lock (room.SyncRoot)
        {
            var pruned = PruneStaleParticipantsNoLock(room, now);
            if (callerParticipant != null && !string.IsNullOrEmpty(callerParticipant.ParticipantId))
            {
                if (room.Participants.TryGetValue(callerParticipant.ParticipantId, out var existing))
                {
                    existing.LastSeenUtc = now;
                    if (callerParticipant.PositionSeconds.HasValue)
                    {
                        existing.PositionSeconds = Math.Max(0, callerParticipant.PositionSeconds.Value);
                    }

                    if (callerParticipant.IsBuffering.HasValue && existing.IsBuffering != callerParticipant.IsBuffering.Value)
                    {
                        existing.IsBuffering = callerParticipant.IsBuffering.Value;
                        pruned = true;
                    }
                }
                else if (room.Participants.Count < MaxParticipantsPerRoom)
                {
                    UpsertParticipantNoLock(room, callerParticipant, now);
                    pruned = true;
                }

                room.EmptySinceUtc = null;
                room.LastActivityUtc = now;
            }

            if (pruned)
            {
                BumpVersionAndSignalNoLock(room);
            }

            if (sinceVersion <= 0 || room.Version > sinceVersion || waitMs <= 0)
            {
                return BuildSnapshotNoLock(room, now);
            }

            waitSignalTask = room.ChangeSignal.Task;
        }

        var clampedWait = Math.Clamp(waitMs, 500, 15000);
        try
        {
            using var delayCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            var delayTask = Task.Delay(clampedWait, delayCts.Token);
            var completed = await Task.WhenAny(waitSignalTask, delayTask).ConfigureAwait(false);
            if (completed == waitSignalTask)
            {
                delayCts.Cancel();
            }
        }
        catch (OperationCanceledException)
        {
            // Normal client abort or navigation; return latest snapshot below if room still exists
        }

        if (!Rooms.TryGetValue(code, out var afterRoom))
        {
            return null;
        }

        var afterNow = DateTimeOffset.UtcNow;
        lock (afterRoom.SyncRoot)
        {
            if (PruneStaleParticipantsNoLock(afterRoom, afterNow))
            {
                BumpVersionAndSignalNoLock(afterRoom);
            }

            if (IsRoomExpiredNoLock(afterRoom, afterNow))
            {
                Rooms.TryRemove(afterRoom.RoomId, out _);
                return null;
            }

            return BuildSnapshotNoLock(afterRoom, afterNow);
        }
    }

    private static void PruneRooms(DateTimeOffset now)
    {
        foreach (var kvp in Rooms)
        {
            var room = kvp.Value;
            lock (room.SyncRoot)
            {
                var pruned = PruneStaleParticipantsNoLock(room, now);
                if (IsRoomExpiredNoLock(room, now))
                {
                    if (Rooms.TryRemove(kvp.Key, out var removed))
                    {
                        SignalRoomWaitersNoLock(removed);
                    }

                    continue;
                }

                if (pruned)
                {
                    BumpVersionAndSignalNoLock(room);
                }
            }
        }
    }

    private static void RemoveParticipantFromOtherRooms(string participantId, string? exceptRoomId, DateTimeOffset now)
    {
        if (string.IsNullOrEmpty(participantId))
        {
            return;
        }

        foreach (var kvp in Rooms)
        {
            if (exceptRoomId != null && string.Equals(kvp.Key, exceptRoomId, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var other = kvp.Value;
            lock (other.SyncRoot)
            {
                if (!other.Participants.Remove(participantId))
                {
                    continue;
                }

                if (other.Participants.Count == 0)
                {
                    Rooms.TryRemove(other.RoomId, out _);
                    BumpVersionAndSignalNoLock(other);
                }
                else
                {
                    EnsureValidHostNoLock(other);
                    other.LastActivityUtc = now;
                    BumpVersionAndSignalNoLock(other);
                }
            }
        }
    }

    private static bool PruneStaleParticipantsNoLock(WatchPartyRoom room, DateTimeOffset now)
    {
        List<string>? staleIds = null;
        foreach (var kvp in room.Participants)
        {
            if (now - kvp.Value.LastSeenUtc > ParticipantStaleTimeout)
            {
                staleIds ??= new List<string>();
                staleIds.Add(kvp.Key);
            }
        }

        if (staleIds == null || staleIds.Count == 0)
        {
            if (room.Participants.Count == 0 && !room.EmptySinceUtc.HasValue)
            {
                room.EmptySinceUtc = now;
            }

            return false;
        }

        foreach (var id in staleIds)
        {
            room.Participants.Remove(id);
        }

        if (room.Participants.Count == 0)
        {
            room.EmptySinceUtc ??= now;
        }
        else
        {
            EnsureValidHostNoLock(room);
        }

        return true;
    }

    private static void EnsureValidHostNoLock(WatchPartyRoom room)
    {
        if (!string.IsNullOrEmpty(room.HostParticipantId) && room.Participants.TryGetValue(room.HostParticipantId, out var currentHost))
        {
            room.HostName = currentHost.DisplayName;
            return;
        }

        var nextHost = room.Participants.Values
            .OrderBy(p => p.JoinedAtUtc)
            .FirstOrDefault();

        if (nextHost != null)
        {
            room.HostParticipantId = nextHost.ParticipantId;
            room.HostName = nextHost.DisplayName;
        }
    }

    private static bool IsRoomExpiredNoLock(WatchPartyRoom room, DateTimeOffset now)
    {
        if (now - room.LastActivityUtc > MaxRoomIdleLifetime)
        {
            return true;
        }

        if (room.Participants.Count == 0 && room.EmptySinceUtc.HasValue && (now - room.EmptySinceUtc.Value) > EmptyRoomGraceTimeout)
        {
            return true;
        }

        return false;
    }

    private static void UpsertParticipantNoLock(WatchPartyRoom room, ParticipantUpdateInput input, DateTimeOffset now)
    {
        if (!room.Participants.TryGetValue(input.ParticipantId, out var part))
        {
            part = new WatchPartyParticipant
            {
                ParticipantId = input.ParticipantId,
                JoinedAtUtc = now,
            };
            room.Participants[input.ParticipantId] = part;
        }

        part.JellyfinUserId = input.JellyfinUserId ?? string.Empty;
        part.ProfileId = CleanShortText(input.ProfileId, 48);
        var name = CleanShortText(input.DisplayName, 32);
        part.DisplayName = string.IsNullOrEmpty(name) ? "Viewer" : name;
        var emoji = CleanShortText(input.AvatarEmoji, 8);
        part.AvatarEmoji = string.IsNullOrEmpty(emoji) ? "🎬" : emoji;
        part.AvatarColorHex = SafeHexColorRegex.IsMatch(input.AvatarColorHex ?? string.Empty) ? input.AvatarColorHex! : "#E50914";

        if (input.PositionSeconds.HasValue)
        {
            part.PositionSeconds = Math.Max(0, input.PositionSeconds.Value);
        }

        if (input.IsBuffering.HasValue)
        {
            part.IsBuffering = input.IsBuffering.Value;
        }

        part.LastSeenUtc = now;
    }

    private static double ComputeExpectedPositionNoLock(WatchPartyRoom room, DateTimeOffset now)
    {
        var pos = room.BasePositionSeconds;
        if (room.IsPlaying && !string.IsNullOrEmpty(room.ItemId))
        {
            var elapsed = (now - room.StateUpdatedAtUtc).TotalSeconds;
            if (elapsed > 0)
            {
                pos += elapsed;
            }
        }

        return ClampSeconds(pos, room.RunTimeTicks);
    }

    private static RoomSnapshot BuildSnapshotNoLock(WatchPartyRoom room, DateTimeOffset now)
    {
        var expected = ComputeExpectedPositionNoLock(room, now);
        var anyBuffering = room.Participants.Values.Any(p => p.IsBuffering);
        var stateLabel = string.IsNullOrEmpty(room.ItemId)
            ? "Lobby"
            : (room.IsPlaying ? (anyBuffering ? "Syncing" : "Playing") : "Paused");

        var participants = room.Participants.Values
            .OrderByDescending(p => string.Equals(p.ParticipantId, room.HostParticipantId, StringComparison.Ordinal))
            .ThenBy(p => p.JoinedAtUtc)
            .Select(p => new ParticipantSnapshot
            {
                ParticipantId = p.ParticipantId,
                ProfileId = p.ProfileId,
                DisplayName = p.DisplayName,
                AvatarEmoji = p.AvatarEmoji,
                AvatarColorHex = p.AvatarColorHex,
                IsHost = string.Equals(p.ParticipantId, room.HostParticipantId, StringComparison.Ordinal),
                PositionSeconds = Math.Round(p.PositionSeconds, 2),
                IsBuffering = p.IsBuffering,
            })
            .ToList();

        return new RoomSnapshot
        {
            RoomId = room.RoomId,
            GroupId = room.RoomId,
            Name = room.Name,
            GroupName = room.Name,
            Version = room.Version,
            ServerNowUtcMs = now.ToUnixTimeMilliseconds(),
            HostParticipantId = room.HostParticipantId,
            HostName = room.HostName,
            HostControlOnly = room.HostControlOnly,
            ItemId = room.ItemId,
            ItemName = room.ItemName,
            SeriesName = room.SeriesName,
            SeasonNumber = room.SeasonNumber,
            EpisodeNumber = room.EpisodeNumber,
            ItemType = room.ItemType,
            RunTimeTicks = room.RunTimeTicks,
            IsPlaying = room.IsPlaying,
            State = stateLabel,
            BasePositionSeconds = Math.Round(room.BasePositionSeconds, 3),
            ExpectedPositionSeconds = Math.Round(expected, 3),
            StateUpdatedAtUtcMs = room.StateUpdatedAtUtc.ToUnixTimeMilliseconds(),
            LastActionId = room.LastActionId,
            LastActionKind = room.LastActionKind,
            LastActorParticipantId = room.LastActorParticipantId,
            LastActionBy = room.LastActionBy,
            LastActionText = room.LastActionText,
            LastActionAtUtcMs = room.LastActionAtUtc.ToUnixTimeMilliseconds(),
            ParticipantCount = participants.Count,
            Participants = participants,
        };
    }

    private static void RecordActionMetadataNoLock(
        WatchPartyRoom room,
        ParticipantUpdateInput actor,
        string actionId,
        string kind,
        string text,
        DateTimeOffset now)
    {
        room.LastActionId = actionId;
        room.LastActionKind = kind;
        room.LastActorParticipantId = actor.ParticipantId;
        room.LastActionBy = CleanShortText(actor.DisplayName, 32);
        room.LastActionText = CleanShortText(text, 140);
        room.LastActionAtUtc = now;
    }

    private static void BumpVersionAndSignalNoLock(WatchPartyRoom room)
    {
        room.Version++;
        SignalRoomWaitersNoLock(room);
    }

    private static void SignalRoomWaitersNoLock(WatchPartyRoom room)
    {
        var prev = room.ChangeSignal;
        room.ChangeSignal = CreateSignal();
        prev.TrySetResult(true);
    }

    private static TaskCompletionSource<bool> CreateSignal() =>
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    private static string GenerateUniqueRoomCode()
    {
        Span<byte> randomBytes = stackalloc byte[6];
        Span<char> chars = stackalloc char[6];
        for (var attempt = 0; attempt < 32; attempt++)
        {
            RandomNumberGenerator.Fill(randomBytes);
            for (var i = 0; i < 6; i++)
            {
                chars[i] = RoomCodeAlphabet[randomBytes[i] % RoomCodeAlphabet.Length];
            }

            var code = new string(chars);
            if (!Rooms.ContainsKey(code))
            {
                return code;
            }
        }

        return Convert.ToHexString(RandomNumberGenerator.GetBytes(4));
    }

    private static double ClampSeconds(double seconds, long? runTimeTicks)
    {
        if (double.IsNaN(seconds) || double.IsInfinity(seconds) || seconds < 0)
        {
            return 0;
        }

        if (runTimeTicks is > 0)
        {
            var maxSec = runTimeTicks.Value / 10_000_000.0;
            if (maxSec > 1 && seconds > maxSec)
            {
                return maxSec;
            }
        }

        return seconds;
    }

    private static string CleanItemId(string? rawId)
    {
        if (string.IsNullOrWhiteSpace(rawId))
        {
            return string.Empty;
        }

        return Guid.TryParse(rawId.Trim(), out var parsed) ? parsed.ToString("N") : string.Empty;
    }

    private static string CleanShortText(string? raw, int maxLen)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return string.Empty;
        }

        var trimmed = raw.Trim();
        return trimmed.Length <= maxLen ? trimmed : trimmed.Substring(0, maxLen).Trim();
    }

    private static string FormatItemDisplayLabel(WatchPartyRoom room)
    {
        if (!string.IsNullOrEmpty(room.SeriesName))
        {
            var epPrefix = (room.SeasonNumber.HasValue && room.EpisodeNumber.HasValue)
                ? $"S{room.SeasonNumber.Value}:E{room.EpisodeNumber.Value} "
                : string.Empty;
            var epTitle = !string.IsNullOrEmpty(room.ItemName) ? $"· {room.ItemName}" : string.Empty;
            return $"{room.SeriesName} {epPrefix}{epTitle}".Trim();
        }

        return !string.IsNullOrEmpty(room.ItemName) ? room.ItemName : "a title";
    }

    private static string FormatClock(double seconds)
    {
        var total = Math.Max(0, (int)Math.Round(seconds));
        var h = total / 3600;
        var m = (total % 3600) / 60;
        var s = total % 60;
        return h > 0
            ? string.Format(CultureInfo.InvariantCulture, "{0}:{1:D2}:{2:D2}", h, m, s)
            : string.Format(CultureInfo.InvariantCulture, "{0}:{1:D2}", m, s);
    }
}
