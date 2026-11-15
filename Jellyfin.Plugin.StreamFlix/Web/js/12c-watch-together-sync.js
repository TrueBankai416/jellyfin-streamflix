/* StreamFlix Client (12c) — Server-Authoritative Watch Together Sync Engine */
    /* ======================================================================
       PART B1. WATCH PARTY REAL-TIME TIMELINE & PLAYER SYNC ENGINE
       ====================================================================== */
    var PENDING_WATCHPARTY_KEY = 'streamflix_pending_watchparty_v2';
    var ACTIVE_WATCHPARTY_ROOM_KEY = 'streamflix_active_wp_room_v2';
    var WATCHPARTY_PARTICIPANT_KEY = 'streamflix_wp_participant_v2';

    var watchPartyState = {
        activeGroup: null,
        joinedGroupId: '',
        participantId: '',
        targetItem: null,
        groups: [],
        loading: false,
        processingPending: false,
        onModalRoomUpdated: null
    };

    var wpSync = {
        loopRunning: false,
        abortCtrl: null,
        driftTimer: null,
        pauseVerifyTimer: null,
        seekDebounceTimer: null,
        bannerTimer: null,
        snapshotPerfMs: 0,
        lastHalfRttSec: 0,
        lastVersion: 0,
        lastActionShownKey: '',
        lastSentActionId: '',
        suppressEventsUntil: 0,
        joinedAtMs: 0,
        followingItemId: '',
        lastAutoLaunchItemId: '',
        lastAutoLaunchAtMs: 0,
        isBuffering: false,
        autoplayBlocked: false,
        actionCounter: 0
    };

    try {
        watchPartyState.joinedGroupId = sessionStorage.getItem(ACTIVE_WATCHPARTY_ROOM_KEY) || '';
        watchPartyState.participantId = sessionStorage.getItem(WATCHPARTY_PARTICIPANT_KEY) || '';
    } catch (e) {}

    function getMyWatchPartyParticipantId() {
        if (watchPartyState.participantId && watchPartyState.participantId.length >= 8) {
            return watchPartyState.participantId;
        }
        var bytes = new Uint8Array(6);
        try {
            if (window.crypto && window.crypto.getRandomValues) {
                window.crypto.getRandomValues(bytes);
            } else {
                for (var b = 0; b < bytes.length; b++) {
                    bytes[b] = Math.floor(Math.random() * 256);
                }
            }
        } catch (e) {}
        var hex = '';
        for (var i = 0; i < bytes.length; i++) {
            hex += ('0' + (bytes[i] & 0xff).toString(16)).slice(-2);
        }
        watchPartyState.participantId = 'wp-' + hex;
        try {
            sessionStorage.setItem(WATCHPARTY_PARTICIPANT_KEY, watchPartyState.participantId);
        } catch (e) {}
        return watchPartyState.participantId;
    }

    function nextWatchPartyActionId() {
        wpSync.actionCounter = (wpSync.actionCounter + 1) % 1000000;
        var id = getMyWatchPartyParticipantId() + '-' + Date.now().toString(36) + '-' + wpSync.actionCounter;
        wpSync.lastSentActionId = id;
        return id;
    }

    function isWatchTogetherEnabled() {
        if (!state.config || state.config.enableWatchTogether === false) {
            return false;
        }
        if (!state.activeProfile || state.activeProfile.isKids) {
            return false;
        }
        return true;
    }

    function isValidWatchPartyRoomCode(raw) {
        return /^[A-Za-z0-9-]{4,36}$/.test(String(raw || '').trim());
    }

    function extractWatchPartyCodeFromInput(rawInput) {
        var s = String(rawInput || '').trim();
        if (!s) {
            return '';
        }
        var m = s.match(/(?:[?&#]|^)watchparty=([A-Za-z0-9-]{4,36})/i);
        if (m && m[1]) {
            return m[1].toUpperCase();
        }
        var cleaned = s.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
        return isValidWatchPartyRoomCode(cleaned) ? cleaned : '';
    }

    function setJoinedWatchPartyGroupId(roomId) {
        var norm = roomId ? String(roomId).trim().toUpperCase() : '';
        watchPartyState.joinedGroupId = norm;
        try {
            if (norm) {
                sessionStorage.setItem(ACTIVE_WATCHPARTY_ROOM_KEY, norm);
            } else {
                sessionStorage.removeItem(ACTIVE_WATCHPARTY_ROOM_KEY);
            }
        } catch (e) {}
    }

    function suppressLocalWatchPartyEvents(ms) {
        var until = performance.now() + Math.max(150, Number(ms) || 1200);
        if (until > wpSync.suppressEventsUntil) {
            wpSync.suppressEventsUntil = until;
        }
    }

    function isLocalWatchPartySuppressed() {
        return performance.now() < wpSync.suppressEventsUntil;
    }

    function canControlWatchPartyRoom(room) {
        var r = room || watchPartyState.activeGroup;
        if (!r) {
            return false;
        }
        if (!r.hostControlOnly) {
            return true;
        }
        if (r.hostParticipantId && r.hostParticipantId === getMyWatchPartyParticipantId()) {
            return true;
        }
        return Boolean(!isGuestPassSession() && (isHouseholdAdmin() || (state.activeProfile && state.activeProfile.isAdmin)));
    }

    function getAuthoritativeRoomPositionSec(room) {
        var r = room || watchPartyState.activeGroup;
        if (!r) {
            return 0;
        }
        var base = Number(r.expectedPositionSeconds || 0) + (r.isPlaying ? (wpSync.lastHalfRttSec || 0) : 0);
        if (!r.isPlaying) {
            return Math.max(0, base);
        }
        var snapMs = wpSync.snapshotPerfMs || performance.now();
        var elapsed = Math.max(0, (performance.now() - snapMs) / 1000);
        var pos = base + elapsed;
        if (r.runTimeTicks && Number(r.runTimeTicks) > 0) {
            pos = Math.min(pos, Number(r.runTimeTicks) / 10000000);
        }
        return Math.max(0, pos);
    }

    function parseOsdClockTextToSec(text) {
        var clean = String(text || '').trim().replace(/^-\s*/, '');
        if (!clean || !/^\d+(?::\d{2}){1,2}$/.test(clean)) {
            return null;
        }
        var parts = clean.split(':').map(function (p) { return parseInt(p, 10) || 0; });
        if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        if (parts.length === 2) {
            return parts[0] * 60 + parts[1];
        }
        return null;
    }

    function getKnownTotalDurationSec(v) {
        var infoTicks = (osdState && osdState.info && Number(osdState.info.RunTimeTicks)) || 0;
        if (!infoTicks && watchPartyState.activeGroup && Number(watchPartyState.activeGroup.runTimeTicks) > 0) {
            infoTicks = Number(watchPartyState.activeGroup.runTimeTicks);
        }
        if (infoTicks > 0) {
            return infoTicks / 10000000;
        }
        var vd = v ? Number(v.duration) : 0;
        return (isFinite(vd) && vd > 0) ? vd : 0;
    }

    function isDirectFullTimelineVideo(v) {
        if (!v) {
            return false;
        }
        var vd = Number(v.duration);
        if (!isFinite(vd) || vd <= 5) {
            return false;
        }
        var totalSec = getKnownTotalDurationSec(v);
        if (!totalSec || Math.abs(vd - totalSec) <= Math.max(25, totalSec * 0.06)) {
            var posTextEl = document.querySelector('#videoOsdPage .osdPositionText');
            var clockSec = posTextEl ? parseOsdClockTextToSec(posTextEl.textContent) : null;
            if (clockSec !== null && Math.abs(clockSec - (Number(v.currentTime) || 0)) > 12) {
                return false;
            }
            return true;
        }
        return false;
    }

    function getEffectiveVideoPositionSec(v) {
        v = v || (osdState && osdState.video);
        if (!v) {
            return 0;
        }
        var rawCur = Number(v.currentTime) || 0;
        if (isDirectFullTimelineVideo(v)) {
            return Math.max(0, rawCur);
        }
        var totalSec = getKnownTotalDurationSec(v);
        var slider = document.querySelector('#videoOsdPage .osdPositionSlider');
        if (slider && totalSec > 0) {
            var pct = parseFloat(slider.value);
            if (isFinite(pct) && pct >= 0 && pct <= 100) {
                var sliderSec = (pct / 100) * totalSec;
                var posEl = document.querySelector('#videoOsdPage .osdPositionText');
                var clockSec = posEl ? parseOsdClockTextToSec(posEl.textContent) : null;
                if (clockSec !== null && Math.abs(clockSec - sliderSec) < 8) {
                    return Math.max(0, sliderSec);
                }
                if (!isFinite(Number(v.duration)) || Math.abs(sliderSec - rawCur) > 8) {
                    return Math.max(0, sliderSec);
                }
            }
        }
        return Math.max(0, rawCur);
    }

    function seekEffectiveVideoToSec(v, targetSec) {
        v = v || (osdState && osdState.video);
        if (!v) {
            return false;
        }
        var totalSec = getKnownTotalDurationSec(v);
        var clamped = Math.max(0, Number(targetSec) || 0);
        if (totalSec > 2 && clamped > totalSec - 0.5) {
            clamped = Math.max(0, totalSec - 0.5);
        }

        suppressLocalWatchPartyEvents(1600);

        if (isDirectFullTimelineVideo(v)) {
            try {
                v.currentTime = clamped;
                return true;
            } catch (e) {}
        }

        var slider = document.querySelector('#videoOsdPage .osdPositionSlider');
        if (slider && totalSec > 5) {
            var pct = Math.min(99.95, Math.max(0, (clamped / totalSec) * 100));
            slider.__bfxWpProgrammatic = true;
            try {
                slider.value = String(pct.toFixed(3));
                slider.dispatchEvent(new Event('input', { bubbles: true }));
                slider.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (eSlider) {
                try { v.currentTime = clamped; } catch (e2) {}
            } finally {
                setTimeout(function () {
                    slider.__bfxWpProgrammatic = false;
                }, 80);
            }
            return true;
        }

        try {
            v.currentTime = clamped;
            return true;
        } catch (eFallback) {
            return false;
        }
    }

    function showWatchPartyOsdBanner(text) {
        if (!text || !isVideoPlayerActive() || !document.body) {
            return;
        }
        var banner = document.getElementById('bfx-wp-osd-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'bfx-wp-osd-banner';
            banner.setAttribute('role', 'status');
            banner.setAttribute('aria-live', 'polite');
            document.body.appendChild(banner);
        }
        banner.innerHTML = '<span class="bfx-wp-pulse-dot" aria-hidden="true"></span><span>' + escapeHtml(text) + '</span>';
        void banner.offsetWidth;
        banner.classList.add('is-visible');
        if (wpSync.bannerTimer) {
            clearTimeout(wpSync.bannerTimer);
        }
        wpSync.bannerTimer = setTimeout(function () {
            var el = document.getElementById('bfx-wp-osd-banner');
            if (el) {
                el.classList.remove('is-visible');
            }
        }, 2900);
    }

    function removeWatchPartyAutoplayUnlockPill() {
        wpSync.autoplayBlocked = false;
        var el = document.getElementById('bfx-wp-autoplay-unlock');
        if (el && el.parentNode) {
            el.parentNode.removeChild(el);
        }
    }

    function showWatchPartyAutoplayUnlockPill() {
        if (!isVideoPlayerActive() || !document.body) {
            return;
        }
        wpSync.autoplayBlocked = true;
        var btn = document.getElementById('bfx-wp-autoplay-unlock');
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'bfx-wp-autoplay-unlock';
            btn.innerHTML = icon('play') + '<span>Tap to Sync &amp; Play with Party</span>';
            btn.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                removeWatchPartyAutoplayUnlockPill();
                var v = osdState && osdState.video;
                if (v && watchPartyState.activeGroup) {
                    suppressLocalWatchPartyEvents(1500);
                    seekEffectiveVideoToSec(v, getAuthoritativeRoomPositionSec());
                    if (watchPartyState.activeGroup.isPlaying) {
                        var pr = v.play();
                        if (pr && typeof pr.catch === 'function') {
                            pr.catch(function () {});
                        }
                    }
                }
            });
            document.body.appendChild(btn);
        }
    }

    function resetVideoPlaybackRate(v) {
        v = v || (osdState && osdState.video);
        if (v && isFinite(v.playbackRate) && v.playbackRate !== 1) {
            try { v.playbackRate = 1; } catch (e) {}
        }
    }

    function reconcilePlayerWithRoom(forceHardSeek) {
        var room = watchPartyState.activeGroup;
        if (!room || !isWatchTogetherEnabled()) {
            resetVideoPlaybackRate();
            removeWatchPartyAutoplayUnlockPill();
            return;
        }

        // 1. If the room has an active movie/episode and this viewer isn't playing it yet, transition automatically!
        var roomItemNorm = room.itemId ? normalizeGuid(room.itemId) : '';
        if (roomItemNorm && !isGateOpen()) {
            var curOsdNorm = (osdState && osdState.info && osdState.info.Id) ? normalizeGuid(osdState.info.Id) : '';
            var nowMs = Date.now();
            var inPlayer = isVideoPlayerActive();

            if (!inPlayer || (curOsdNorm && curOsdNorm !== roomItemNorm)) {
                var sameRecentLaunch = wpSync.lastAutoLaunchItemId === roomItemNorm && (nowMs - wpSync.lastAutoLaunchAtMs < 6500);
                if (!sameRecentLaunch) {
                    wpSync.lastAutoLaunchItemId = roomItemNorm;
                    wpSync.lastAutoLaunchAtMs = nowMs;
                    wpSync.followingItemId = roomItemNorm;
                    var startTicks = Math.max(0, Math.round(getAuthoritativeRoomPositionSec(room) * 10000000));
                    playItemImmediately(room.itemId, null, null, startTicks, { fromWatchPartyFollow: true });
                }
                return;
            }
        }

        // 2. Align <video> play/pause state & timeline position smoothly
        var v = osdState && osdState.video;
        if (!v || !isVideoPlayerActive() || v.readyState < 1) {
            return;
        }
        if (roomItemNorm && osdState.info && osdState.info.Id && normalizeGuid(osdState.info.Id) !== roomItemNorm) {
            return;
        }

        var expectedSec = getAuthoritativeRoomPositionSec(room);
        var actualSec = getEffectiveVideoPositionSec(v);
        var drift = actualSec - expectedSec; // positive = local is ahead; negative = local is behind
        var absDrift = Math.abs(drift);

        if (!room.isPlaying) {
            removeWatchPartyAutoplayUnlockPill();
            resetVideoPlaybackRate(v);
            if (!v.paused && !v.ended) {
                suppressLocalWatchPartyEvents(1200);
                try { v.pause(); } catch (ePause) {}
            }
            if ((forceHardSeek && absDrift > 0.6) || absDrift > 1.35) {
                seekEffectiveVideoToSec(v, expectedSec);
            }
            return;
        }

        // Room IS playing
        if (forceHardSeek ? (absDrift > 1.2) : (absDrift > 4.2)) {
            resetVideoPlaybackRate(v);
            seekEffectiveVideoToSec(v, expectedSec);
        } else if (absDrift > 1.45 && isDirectFullTimelineVideo(v)) {
            var desiredRate = drift < 0 ? 1.04 : 0.96;
            if (Math.abs((v.playbackRate || 1) - desiredRate) > 0.005) {
                try { v.playbackRate = desiredRate; } catch (eRate) {}
            }
        } else if (absDrift < 0.35 && v.playbackRate !== 1) {
            resetVideoPlaybackRate(v);
        }

        if (v.paused && !v.ended && !wpSync.autoplayBlocked) {
            suppressLocalWatchPartyEvents(1400);
            try {
                var playPromise = v.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(function () {
                        showWatchPartyAutoplayUnlockPill();
                    });
                }
            } catch (ePlay) {
                showWatchPartyAutoplayUnlockPill();
            }
        }
    }

    function applyIncomingRoomSnapshot(room, rttMs) {
        if (!room || !room.roomId) {
            return null;
        }
        watchPartyState.activeGroup = room;
        setJoinedWatchPartyGroupId(room.roomId);
        wpSync.lastHalfRttSec = Math.min(1.25, Math.max(0, (Number(rttMs) || 0) / 2000));
        wpSync.snapshotPerfMs = performance.now();
        wpSync.lastVersion = Number(room.version || 0);

        if (room.itemId && wpSync.followingItemId && normalizeGuid(room.itemId) === wpSync.followingItemId && isVideoPlayerActive()) {
            wpSync.followingItemId = '';
        }

        var actionKey = String(room.version || '') + ':' + String(room.lastActionAtUtcMs || '');
        if (actionKey !== wpSync.lastActionShownKey) {
            var hadPrior = Boolean(wpSync.lastActionShownKey);
            wpSync.lastActionShownKey = actionKey;
            var isFromOther = room.lastActorParticipantId && room.lastActorParticipantId !== getMyWatchPartyParticipantId()
                && (!room.lastActionId || room.lastActionId !== wpSync.lastSentActionId);
            var isRecent = room.lastActionAtUtcMs && Math.abs((room.serverNowUtcMs || Date.now()) - room.lastActionAtUtcMs) < 8000;
            if (hadPrior && isFromOther && isRecent && room.lastActionText) {
                showWatchPartyOsdBanner(room.lastActionText);
            }
        }

        syncWatchPartyIndicators();
        ensureWatchPartyDriftTimer();
        ensureWatchPartyLongPollLoop();

        var isOwnEcho = Boolean(room.lastActionId && room.lastActionId === wpSync.lastSentActionId);
        if (!isOwnEcho) {
            reconcilePlayerWithRoom(room.lastActionKind === 'seek' || room.lastActionKind === 'set_media');
        }

        if (typeof watchPartyState.onModalRoomUpdated === 'function') {
            try { watchPartyState.onModalRoomUpdated(room); } catch (eModal) {}
        }
        return room;
    }

    function stopWatchPartySyncEngine() {
        wpSync.loopRunning = false;
        if (wpSync.abortCtrl) {
            try { wpSync.abortCtrl.abort(); } catch (e) {}
            wpSync.abortCtrl = null;
        }
        if (wpSync.driftTimer) {
            clearInterval(wpSync.driftTimer);
            wpSync.driftTimer = null;
        }
        if (wpSync.pauseVerifyTimer) {
            clearTimeout(wpSync.pauseVerifyTimer);
            wpSync.pauseVerifyTimer = null;
        }
        if (wpSync.seekDebounceTimer) {
            clearTimeout(wpSync.seekDebounceTimer);
            wpSync.seekDebounceTimer = null;
        }
        wpSync.lastVersion = 0;
        wpSync.lastActionShownKey = '';
        wpSync.followingItemId = '';
        wpSync.lastAutoLaunchItemId = '';
        resetVideoPlaybackRate();
        removeWatchPartyAutoplayUnlockPill();
    }

    function ensureWatchPartyDriftTimer() {
        if (!watchPartyState.activeGroup) {
            if (wpSync.driftTimer) {
                clearInterval(wpSync.driftTimer);
                wpSync.driftTimer = null;
            }
            return;
        }
        if (wpSync.driftTimer) {
            return;
        }
        wpSync.driftTimer = setInterval(function () {
            if (!watchPartyState.activeGroup || !isWatchTogetherEnabled()) {
                stopWatchPartySyncEngine();
                return;
            }
            if (isVideoPlayerActive()) {
                reconcilePlayerWithRoom(false);
            }
        }, 1000);
    }

    function ensureWatchPartyLongPollLoop() {
        if (wpSync.loopRunning || !watchPartyState.joinedGroupId || !isWatchTogetherEnabled()) {
            return;
        }
        wpSync.loopRunning = true;

        function step(backoffMs) {
            if (!wpSync.loopRunning || !watchPartyState.joinedGroupId || !isWatchTogetherEnabled()) {
                wpSync.loopRunning = false;
                return;
            }
            var waitBefore = backoffMs || 0;
            setTimeout(function () {
                if (!wpSync.loopRunning || !watchPartyState.joinedGroupId) {
                    wpSync.loopRunning = false;
                    return;
                }
                var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
                wpSync.abortCtrl = ctrl;
                var roomId = watchPartyState.joinedGroupId;
                var pid = getMyWatchPartyParticipantId();
                var profId = (state.activeProfile && state.activeProfile.id) || '';
                var sinceVer = wpSync.lastVersion || 0;
                var waitMs = document.hidden ? 3000 : 10000;
                var qs = '?roomId=' + encodeURIComponent(roomId)
                    + '&participantId=' + encodeURIComponent(pid)
                    + '&profileId=' + encodeURIComponent(profId)
                    + '&sinceVersion=' + encodeURIComponent(String(sinceVer))
                    + '&waitMs=' + (sinceVer > 0 ? waitMs : 0);

                if (isVideoPlayerActive() && osdState && osdState.video) {
                    qs += '&pos=' + encodeURIComponent(getEffectiveVideoPositionSec(osdState.video).toFixed(2));
                    qs += '&buffering=' + (wpSync.isBuffering ? 'true' : 'false');
                }

                var t0 = Date.now();
                apiFetch('/StreamFlix/WatchParty/State' + qs, ctrl ? { signal: ctrl.signal } : {})
                    .then(function (res) {
                        var rtt = Date.now() - t0;
                        if (!wpSync.loopRunning || watchPartyState.joinedGroupId !== roomId) {
                            return;
                        }
                        if (!res || res.active === false || !res.room) {
                            setJoinedWatchPartyGroupId('');
                            watchPartyState.activeGroup = null;
                            stopWatchPartySyncEngine();
                            syncWatchPartyIndicators();
                            if (typeof watchPartyState.onModalRoomUpdated === 'function') {
                                try { watchPartyState.onModalRoomUpdated(null); } catch (eM) {}
                            }
                            return;
                        }
                        applyIncomingRoomSnapshot(res.room, rtt);
                        step(40);
                    })
                    .catch(function (err) {
                        if (!wpSync.loopRunning) {
                            return;
                        }
                        if (err && err.name === 'AbortError') {
                            return;
                        }
                        if (err && (err.status === 403 || err.status === 404)) {
                            setJoinedWatchPartyGroupId('');
                            watchPartyState.activeGroup = null;
                            stopWatchPartySyncEngine();
                            syncWatchPartyIndicators();
                            return;
                        }
                        step(2000);
                    });
            }, waitBefore);
        }

        step(0);
    }

    function sendWatchPartyCommand(action, extraPayload) {
        var room = watchPartyState.activeGroup;
        if (!room || !room.roomId || !isWatchTogetherEnabled()) {
            return Promise.resolve(null);
        }
        extraPayload = extraPayload || {};
        var prof = state.activeProfile || {};
        var body = {
            roomId: room.roomId,
            participantId: getMyWatchPartyParticipantId(),
            profileId: prof.id || '',
            displayName: prof.name || '',
            avatarEmoji: prof.icon || '🎬',
            avatarColorHex: prof.color || '#E50914',
            action: action,
            actionId: nextWatchPartyActionId()
        };
        if (extraPayload.positionSeconds !== undefined && extraPayload.positionSeconds !== null) {
            body.positionSeconds = Math.max(0, Number(extraPayload.positionSeconds) || 0);
        }
        if (typeof extraPayload.isPlaying === 'boolean') {
            body.isPlaying = extraPayload.isPlaying;
        }
        if (typeof extraPayload.hostControlOnly === 'boolean') {
            body.hostControlOnly = extraPayload.hostControlOnly;
        }
        if (typeof extraPayload.isBuffering === 'boolean') {
            body.isBuffering = extraPayload.isBuffering;
        }
        var it = extraPayload.item;
        if (it && it.Id) {
            body.itemId = it.Id;
            body.itemName = it.Name || '';
            body.seriesName = it.SeriesName || '';
            if (it.ParentIndexNumber != null) {
                body.seasonNumber = Number(it.ParentIndexNumber);
            }
            if (it.IndexNumber != null) {
                body.episodeNumber = Number(it.IndexNumber);
            }
            body.itemType = it.Type || '';
            if (it.RunTimeTicks && Number(it.RunTimeTicks) > 0) {
                body.runTimeTicks = Number(it.RunTimeTicks);
            }
        }

        var t0 = Date.now();
        return apiFetch('/StreamFlix/WatchParty/Command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (res) {
            if (res && res.room) {
                return applyIncomingRoomSnapshot(res.room, Date.now() - t0);
            }
            return null;
        }).catch(function (err) {
            if (err && err.status === 403 && err.data && err.data.room) {
                applyIncomingRoomSnapshot(err.data.room, 0);
                showWatchPartyOsdBanner(err.message || 'Controls are locked to the host.');
            }
            return null;
        });
    }

    /* Hooks invoked by 08-cinema-hub-and-hero.js and 07-video-player-and-mobile-dock.js */
    function onWatchPartyBeforePlayResolved(playableItem, forcedStartPositionTicks, playOpts) {
        var room = watchPartyState.activeGroup;
        if (!room || !isWatchTogetherEnabled() || !playableItem || !playableItem.Id) {
            return forcedStartPositionTicks;
        }
        if (playOpts && playOpts.fromWatchPartyFollow) {
            return forcedStartPositionTicks;
        }

        var playNorm = normalizeGuid(playableItem.Id);
        var roomNorm = room.itemId ? normalizeGuid(room.itemId) : '';
        var hasExplicitStart = typeof forcedStartPositionTicks === 'number' && isFinite(forcedStartPositionTicks) && forcedStartPositionTicks >= 0;

        if (roomNorm && playNorm === roomNorm && !hasExplicitStart) {
            wpSync.followingItemId = roomNorm;
            wpSync.lastAutoLaunchItemId = roomNorm;
            wpSync.lastAutoLaunchAtMs = Date.now();
            return Math.max(0, Math.round(getAuthoritativeRoomPositionSec(room) * 10000000));
        }

        if (canControlWatchPartyRoom(room)) {
            var chosenTicks = hasExplicitStart ? Math.floor(forcedStartPositionTicks) : 0;
            wpSync.followingItemId = playNorm;
            wpSync.lastAutoLaunchItemId = playNorm;
            wpSync.lastAutoLaunchAtMs = Date.now();
            sendWatchPartyCommand('set_media', {
                item: playableItem,
                positionSeconds: chosenTicks / 10000000,
                isPlaying: true
            });
            return chosenTicks;
        }

        return forcedStartPositionTicks;
    }

    function onWatchPartyOsdInfoLoaded(item) {
        var room = watchPartyState.activeGroup;
        if (!room || !isWatchTogetherEnabled() || !item || !item.Id) {
            return;
        }
        var itemNorm = normalizeGuid(item.Id);
        var roomNorm = room.itemId ? normalizeGuid(room.itemId) : '';

        if (roomNorm && itemNorm === roomNorm) {
            wpSync.followingItemId = '';
            reconcilePlayerWithRoom(true);
            return;
        }

        if (!roomNorm && canControlWatchPartyRoom(room)) {
            var v = osdState && osdState.video;
            sendWatchPartyCommand('set_media', {
                item: item,
                positionSeconds: v ? getEffectiveVideoPositionSec(v) : 0,
                isPlaying: v ? !v.paused : true
            });
            return;
        }

        if (roomNorm && itemNorm !== roomNorm) {
            if (wpSync.followingItemId === roomNorm) {
                return;
            }
            if (canControlWatchPartyRoom(room) && (Date.now() - wpSync.joinedAtMs > 3500)) {
                var vNow = osdState && osdState.video;
                sendWatchPartyCommand('set_media', {
                    item: item,
                    positionSeconds: vNow ? getEffectiveVideoPositionSec(vNow) : 0,
                    isPlaying: true
                });
            } else {
                reconcilePlayerWithRoom(true);
            }
        }
    }

    function onWatchPartySliderScrub(slider) {
        var room = watchPartyState.activeGroup;
        if (!room || !isWatchTogetherEnabled() || isLocalWatchPartySuppressed()) {
            return;
        }
        var v = osdState && osdState.video;
        var totalSec = getKnownTotalDurationSec(v);
        var pct = slider ? parseFloat(slider.value) : NaN;
        if (!isFinite(pct) || totalSec <= 0) {
            return;
        }
        var targetSec = Math.max(0, (pct / 100) * totalSec);
        if (!canControlWatchPartyRoom(room)) {
            reconcilePlayerWithRoom(true);
            showWatchPartyOsdBanner('Controls are locked to ' + (room.hostName || 'the host') + '.');
            return;
        }
        if (wpSync.seekDebounceTimer) {
            clearTimeout(wpSync.seekDebounceTimer);
        }
        wpSync.seekDebounceTimer = setTimeout(function () {
            wpSync.seekDebounceTimer = null;
            sendWatchPartyCommand('seek', {
                positionSeconds: targetSec,
                isPlaying: v ? !v.paused : room.isPlaying
            });
        }, 160);
    }

    function onWatchPartyVideoEvent(evName, v) {
        var room = watchPartyState.activeGroup;
        if (!room || !isWatchTogetherEnabled() || !v) {
            return;
        }

        if (evName === 'waiting') {
            wpSync.isBuffering = true;
            return;
        }
        if (evName === 'playing') {
            wpSync.isBuffering = false;
            removeWatchPartyAutoplayUnlockPill();
            return;
        }
        if (evName === 'attached' || evName === 'loadedmetadata' || evName === 'canplay') {
            wpSync.isBuffering = false;
            var curInfoNorm = (osdState && osdState.info && osdState.info.Id) ? normalizeGuid(osdState.info.Id) : '';
            if (!room.itemId || !curInfoNorm || curInfoNorm === normalizeGuid(room.itemId)) {
                reconcilePlayerWithRoom(true);
            }
            return;
        }
        if (evName === 'loadstart') {
            suppressLocalWatchPartyEvents(900);
            resetVideoPlaybackRate(v);
            return;
        }

        if (isLocalWatchPartySuppressed()) {
            return;
        }

        if (evName === 'play') {
            removeWatchPartyAutoplayUnlockPill();
            if (wpSync.pauseVerifyTimer) {
                clearTimeout(wpSync.pauseVerifyTimer);
                wpSync.pauseVerifyTimer = null;
            }
            if (!canControlWatchPartyRoom(room) && !room.isPlaying) {
                reconcilePlayerWithRoom(true);
                showWatchPartyOsdBanner('Controls are locked to ' + (room.hostName || 'the host') + '.');
                return;
            }
            var posPlay = getEffectiveVideoPositionSec(v);
            if (!room.isPlaying || Math.abs(posPlay - getAuthoritativeRoomPositionSec(room)) > 2.2) {
                sendWatchPartyCommand('play', { positionSeconds: posPlay, isPlaying: true });
            }
            return;
        }

        if (evName === 'pause') {
            if (v.ended || v.seeking || wpSync.autoplayBlocked) {
                return;
            }
            if (wpSync.pauseVerifyTimer) {
                clearTimeout(wpSync.pauseVerifyTimer);
            }
            wpSync.pauseVerifyTimer = setTimeout(function () {
                wpSync.pauseVerifyTimer = null;
                if (!watchPartyState.activeGroup || !isVideoPlayerActive() || osdState.video !== v) {
                    return;
                }
                if (!v.paused || v.ended || v.seeking || wpSync.isBuffering || wpSync.autoplayBlocked || isLocalWatchPartySuppressed()) {
                    return;
                }
                if (!canControlWatchPartyRoom(watchPartyState.activeGroup)) {
                    if (watchPartyState.activeGroup.isPlaying) {
                        reconcilePlayerWithRoom(false);
                        showWatchPartyOsdBanner('Controls are locked to ' + (watchPartyState.activeGroup.hostName || 'the host') + '.');
                    }
                    return;
                }
                sendWatchPartyCommand('pause', {
                    positionSeconds: getEffectiveVideoPositionSec(v),
                    isPlaying: false
                });
            }, 240);
            return;
        }

        if (evName === 'seeked') {
            if (wpSync.pauseVerifyTimer) {
                clearTimeout(wpSync.pauseVerifyTimer);
                wpSync.pauseVerifyTimer = null;
            }
            var seekPos = getEffectiveVideoPositionSec(v);
            if (Math.abs(seekPos - getAuthoritativeRoomPositionSec(room)) < 1.25) {
                return;
            }
            if (!canControlWatchPartyRoom(room)) {
                reconcilePlayerWithRoom(true);
                showWatchPartyOsdBanner('Controls are locked to ' + (room.hostName || 'the host') + '.');
                return;
            }
            if (wpSync.seekDebounceTimer) {
                clearTimeout(wpSync.seekDebounceTimer);
            }
            wpSync.seekDebounceTimer = setTimeout(function () {
                wpSync.seekDebounceTimer = null;
                sendWatchPartyCommand('seek', {
                    positionSeconds: getEffectiveVideoPositionSec(v),
                    isPlaying: !v.paused
                });
            }, 180);
        }
    }

    function onWatchPartyOsdTeardown() {
        removeWatchPartyAutoplayUnlockPill();
        var banner = document.getElementById('bfx-wp-osd-banner');
        if (banner && banner.parentNode) {
            banner.parentNode.removeChild(banner);
        }
    }
