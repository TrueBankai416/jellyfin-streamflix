/* StreamFlix Client (12d) — Watch Together Room Actions, Invite Links & Modal UI */
    /* ======================================================================
       PART B2. WATCH PARTY ROOM MANAGEMENT, INVITES & MODAL INTERFACE
       ====================================================================== */
    function formatWatchPartyClock(sec) {
        var total = Math.max(0, Math.round(Number(sec) || 0));
        var h = Math.floor(total / 3600);
        var m = Math.floor((total % 3600) / 60);
        var s = total % 60;
        var pad = function (n) { return n < 10 ? ('0' + n) : String(n); };
        return h > 0 ? (h + ':' + pad(m) + ':' + pad(s)) : (m + ':' + pad(s));
    }

    function formatWatchPartyMediaLabel(roomOrItem) {
        if (!roomOrItem) {
            return '';
        }
        var series = roomOrItem.seriesName || roomOrItem.SeriesName || '';
        var name = roomOrItem.itemName || roomOrItem.Name || '';
        var sNum = roomOrItem.seasonNumber != null ? roomOrItem.seasonNumber : roomOrItem.ParentIndexNumber;
        var eNum = roomOrItem.episodeNumber != null ? roomOrItem.episodeNumber : roomOrItem.IndexNumber;
        if (series) {
            var epTag = (sNum != null && eNum != null) ? ('S' + sNum + ':E' + eNum) : '';
            return [series, epTag, name].filter(Boolean).join(' · ');
        }
        return name || '';
    }

    function getActiveWatchPartyParticipantCount() {
        var g = watchPartyState.activeGroup;
        if (!g) {
            return 0;
        }
        if (typeof g.participantCount === 'number' && g.participantCount > 0) {
            return g.participantCount;
        }
        if (Array.isArray(g.participants) && g.participants.length > 0) {
            return g.participants.length;
        }
        return 1;
    }

    function syncWatchPartyIndicators() {
        var activeGroup = isWatchTogetherEnabled() ? watchPartyState.activeGroup : null;
        var count = activeGroup ? getActiveWatchPartyParticipantCount() : 0;
        var roomTitle = activeGroup ? (activeGroup.name || activeGroup.GroupName || 'Watch Party') : '';

        // 1. Desktop / Tablet / TV top-right profile pill indicator (ONLY while actively in a room)
        var profBtn = document.getElementById('streamflix-header-profile-btn');
        if (profBtn) {
            var wpChip = profBtn.querySelector('.streamflix-header-watchparty');
            if (activeGroup && !wpChip) {
                wpChip = document.createElement('span');
                wpChip.className = 'streamflix-header-watchparty';
                profBtn.insertBefore(wpChip, profBtn.firstChild);
            } else if (!activeGroup && wpChip && wpChip.parentNode) {
                wpChip.parentNode.removeChild(wpChip);
                wpChip = null;
            }
            if (wpChip && activeGroup) {
                var wantedHtml = '<span class="bfx-wp-pulse-dot" aria-hidden="true"></span><span class="bfx-wp-chip-count">' + count + '</span>';
                if (wpChip.innerHTML !== wantedHtml) {
                    wpChip.innerHTML = wantedHtml;
                }
                wpChip.title = 'In Watch Together: ' + roomTitle + ' (' + count + ')';
            }
        }

        // 2. Mobile floating dock profile avatar live dot (ONLY while actively in a room)
        var dockBtn = document.getElementById('bfx-dock-profile-btn');
        if (dockBtn) {
            var dockDot = dockBtn.querySelector('.bfx-dock-wp-dot');
            if (activeGroup && !dockDot) {
                dockDot = document.createElement('span');
                dockDot.className = 'bfx-dock-wp-dot';
                dockDot.setAttribute('aria-hidden', 'true');
                var av = dockBtn.querySelector('.bfx-dock-avatar');
                if (av) {
                    av.appendChild(dockDot);
                }
            } else if (!activeGroup && dockDot && dockDot.parentNode) {
                dockDot.parentNode.removeChild(dockDot);
            }
        }

        // 3. Detail modal button state if open
        var detailWpBtn = document.getElementById('streamflix-modal-watchparty-btn');
        if (detailWpBtn) {
            detailWpBtn.classList.toggle('active', Boolean(activeGroup));
            detailWpBtn.classList.toggle('is-live', Boolean(activeGroup));
        }

        // 4. Video OSD button state if player is active
        var osdBtn = document.querySelector('#videoOsdPage .streamflix-osd-watchparty-btn');
        if (osdBtn) {
            var showOsd = isWatchTogetherEnabled();
            osdBtn.classList.toggle('hide', !showOsd);
            osdBtn.classList.toggle('is-live', Boolean(activeGroup));
            var badge = osdBtn.querySelector('.bfx-osd-wp-badge');
            if (activeGroup) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'bfx-osd-wp-badge';
                    osdBtn.appendChild(badge);
                }
                badge.textContent = String(count);
            } else if (badge && badge.parentNode) {
                badge.parentNode.removeChild(badge);
            }
        }
    }

    function capturePendingWatchPartyFromUrl() {
        try {
            var searchStr = (window.location.search || '').replace(/^\?/, '');
            var hashStr = window.location.hash || '';
            var combined = searchStr + '&' + hashStr;
            if (combined.indexOf('watchparty=') === -1) {
                return null;
            }
            var extractParam = function (name) {
                var m = combined.match(new RegExp('(?:[#?&/]|^)' + name + '=([^&#]+)'));
                if (!m) {
                    return '';
                }
                try {
                    return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
                } catch (e) {
                    return m[1].trim();
                }
            };
            var roomCode = extractWatchPartyCodeFromInput(extractParam('watchparty'));
            var rawItem = extractParam('wpitem');
            if (!roomCode) {
                return null;
            }
            var payload = {
                roomId: roomCode,
                itemId: /^[0-9a-f-]{32,36}$/i.test(rawItem) ? rawItem : '',
                capturedAt: Date.now()
            };
            sessionStorage.setItem(PENDING_WATCHPARTY_KEY, JSON.stringify(payload));

            var hasAuthCallback = /(?:^|[?&])(access_token|sf_oidc|sf_oidc_error|sf_guest|sf_guest_error)=/.test(window.location.search || '');
            if (!hasAuthCallback && window.location.search && window.location.search.indexOf('watchparty=') !== -1) {
                var cleanedSearch = window.location.search
                    .replace(/([?&])watchparty=[^&#]*(&?)/gi, function (_, p1, p2) { return p2 ? p1 : ''; })
                    .replace(/([?&])wpitem=[^&#]*(&?)/gi, function (_, p1, p2) { return p2 ? p1 : ''; })
                    .replace(/[?&]$/, '');
                var cleanHash = (window.location.hash || '#/home')
                    .replace(/([?&])watchparty=[^&#]*(&?)/gi, function (_, p1, p2) { return p2 ? p1 : ''; })
                    .replace(/([?&])wpitem=[^&#]*(&?)/gi, function (_, p1, p2) { return p2 ? p1 : ''; })
                    .replace(/[?&]$/, '');
                window.history.replaceState(null, document.title, window.location.pathname + cleanedSearch + cleanHash);
            }
            return payload;
        } catch (e) {
            return null;
        }
    }

    function refreshWatchPartyRoomsList(silent) {
        if (!isWatchTogetherEnabled()) {
            watchPartyState.groups = [];
            return Promise.resolve([]);
        }
        var profId = (state.activeProfile && state.activeProfile.id) || '';
        watchPartyState.loading = true;
        return apiFetch('/StreamFlix/WatchParty/Rooms?profileId=' + encodeURIComponent(profId)).then(function (res) {
            watchPartyState.loading = false;
            var rawRooms = res && (Array.isArray(res.rooms) ? res.rooms : (Array.isArray(res.Rooms) ? res.Rooms : []));
            var rooms = normalizeWatchPartyRoomsArray(rawRooms);
            watchPartyState.groups = rooms;
            return rooms;
        }).catch(function (err) {
            watchPartyState.loading = false;
            if (!silent) {
                showToast((err && err.message) || 'Could not load Watch Together rooms.', 'error');
            }
            return watchPartyState.groups || [];
        });
    }

    function createWatchPartyRoom(roomName, createOpts) {
        createOpts = createOpts || {};
        var prof = state.activeProfile || {};
        var cleanName = String(roomName || '').trim().slice(0, 64);
        if (!cleanName) {
            cleanName = (prof.name || 'StreamFlix') + '\'s Watch Party';
        }
        var body = {
            name: cleanName,
            participantId: getMyWatchPartyParticipantId(),
            profileId: prof.id || '',
            displayName: prof.name || '',
            avatarEmoji: prof.icon || '🎬',
            avatarColorHex: prof.color || '#E50914',
            hostControlOnly: Boolean(createOpts.hostControlOnly)
        };
        var it = createOpts.playableItem;
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
            body.startPositionSeconds = Math.max(0, Number(createOpts.startPositionSeconds) || 0);
            body.isPlaying = Boolean(createOpts.isPlaying);
        }

        var t0 = Date.now();
        return apiFetch('/StreamFlix/WatchParty/Create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (res) {
            var rtt = Date.now() - t0;
            wpSync.joinedAtMs = Date.now();
            var rawRooms = res && (Array.isArray(res.rooms) ? res.rooms : (Array.isArray(res.Rooms) ? res.Rooms : null));
            if (rawRooms) {
                watchPartyState.groups = normalizeWatchPartyRoomsArray(rawRooms);
            }
            var rawRoom = res && (res.room || res.Room);
            var normRoom = normalizeWatchPartyRoomSnapshot(rawRoom);
            if (normRoom && normRoom.roomId) {
                if (createOpts.suppressImmediateAutoFollow && normRoom.itemId) {
                    markWatchPartyRoomItemAutoLaunched(normRoom.roomId, normRoom.itemId);
                }
                var applied = applyIncomingRoomSnapshot(normRoom, rtt, { forceReconcile: true });
                if (applied && applied.roomId) {
                    return applied;
                }
            }
            throw new Error((res && (res.message || res.Message)) || 'Could not start Watch Party.');
        });
    }

    function joinWatchPartyRoom(rawRoomCode) {
        var code = extractWatchPartyCodeFromInput(rawRoomCode);
        if (!code) {
            return Promise.reject(new Error('Enter a valid Watch Party room code or link.'));
        }
        var prof = state.activeProfile || {};
        var t0 = Date.now();
        return apiFetch('/StreamFlix/WatchParty/Join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomId: code,
                participantId: getMyWatchPartyParticipantId(),
                profileId: prof.id || '',
                displayName: prof.name || '',
                avatarEmoji: prof.icon || '🎬',
                avatarColorHex: prof.color || '#E50914'
            })
        }).then(function (res) {
            var rtt = Date.now() - t0;
            wpSync.joinedAtMs = Date.now();
            wpSync.autoLaunchedRoomItemKey = '';
            wpSync.lastAutoLaunchItemId = '';
            var rawRooms = res && (Array.isArray(res.rooms) ? res.rooms : (Array.isArray(res.Rooms) ? res.Rooms : null));
            if (rawRooms) {
                watchPartyState.groups = normalizeWatchPartyRoomsArray(rawRooms);
            }
            var rawRoom = res && (res.room || res.Room);
            var applied = applyIncomingRoomSnapshot(rawRoom, rtt, { forceReconcile: true });
            if (applied && applied.roomId) {
                return applied;
            }
            throw new Error((res && (res.message || res.Message)) || 'Could not join Watch Party.');
        });
    }

    function leaveWatchPartyRoom(closeRoomForAll) {
        var prevRoomId = watchPartyState.joinedGroupId || (watchPartyState.activeGroup && watchPartyState.activeGroup.roomId) || '';
        var prof = state.activeProfile || {};
        setJoinedWatchPartyGroupId('');
        watchPartyState.activeGroup = null;
        watchPartyState.targetItem = null;
        stopWatchPartySyncEngine();
        syncWatchPartyIndicators();

        if (!prevRoomId) {
            return Promise.resolve();
        }
        return apiFetch('/StreamFlix/WatchParty/Leave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomId: prevRoomId,
                participantId: getMyWatchPartyParticipantId(),
                profileId: prof.id || '',
                closeRoom: Boolean(closeRoomForAll)
            })
        }).then(function (res) {
            var rawRooms = res && (Array.isArray(res.rooms) ? res.rooms : (Array.isArray(res.Rooms) ? res.Rooms : null));
            if (rawRooms) {
                watchPartyState.groups = normalizeWatchPartyRoomsArray(rawRooms);
            }
        }).catch(function () {});
    }

    function deleteWatchPartyRoom(rawRoomCode) {
        var code = extractWatchPartyCodeFromInput(rawRoomCode || watchPartyState.joinedGroupId || (watchPartyState.activeGroup && watchPartyState.activeGroup.roomId) || '');
        if (!code) {
            return Promise.reject(new Error('Invalid Watch Party room code.'));
        }
        var prof = state.activeProfile || {};
        var wasMyActiveRoom = (watchPartyState.joinedGroupId && watchPartyState.joinedGroupId.toUpperCase() === code)
            || (watchPartyState.activeGroup && watchPartyState.activeGroup.roomId === code);

        if (wasMyActiveRoom) {
            setJoinedWatchPartyGroupId('');
            watchPartyState.activeGroup = null;
            watchPartyState.targetItem = null;
            stopWatchPartySyncEngine();
            syncWatchPartyIndicators();
        }

        return apiFetch('/StreamFlix/WatchParty/Delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomId: code,
                participantId: getMyWatchPartyParticipantId(),
                profileId: prof.id || ''
            })
        }).then(function (res) {
            var rawRooms = res && (Array.isArray(res.rooms) ? res.rooms : (Array.isArray(res.Rooms) ? res.Rooms : null));
            if (rawRooms) {
                watchPartyState.groups = normalizeWatchPartyRoomsArray(rawRooms);
            } else {
                watchPartyState.groups = (watchPartyState.groups || []).filter(function (g) {
                    return g && g.roomId !== code;
                });
            }
            return res;
        });
    }

    function buildWatchPartyInviteUrl(roomId) {
        var base = window.location.origin + (window.location.pathname || '/web/');
        return base + '?watchparty=' + encodeURIComponent(roomId) + '#/home';
    }

    function appendWatchPartyQueryToGuestUrl(guestUrl, roomId) {
        if (!guestUrl || !roomId) {
            return guestUrl || '';
        }
        var sep = guestUrl.indexOf('?') === -1 ? '?' : '&';
        return guestUrl + sep + 'watchparty=' + encodeURIComponent(roomId);
    }

    function processPendingWatchPartyIfReady() {
        if (watchPartyState.processingPending) {
            return;
        }
        if (!state.activeProfile || !state.activeProfile.accessToken || isGateOpen()) {
            return;
        }
        var raw = null;
        try {
            raw = sessionStorage.getItem(PENDING_WATCHPARTY_KEY);
        } catch (e) {}
        if (!raw) {
            if (watchPartyState.joinedGroupId && !watchPartyState.activeGroup && isWatchTogetherEnabled()) {
                watchPartyState.processingPending = true;
                joinWatchPartyRoom(watchPartyState.joinedGroupId).then(function () {
                    watchPartyState.processingPending = false;
                }).catch(function () {
                    watchPartyState.processingPending = false;
                    setJoinedWatchPartyGroupId('');
                    syncWatchPartyIndicators();
                });
            }
            return;
        }

        var pending = null;
        try {
            pending = JSON.parse(raw);
            sessionStorage.removeItem(PENDING_WATCHPARTY_KEY);
        } catch (e) {
            return;
        }
        var code = pending && extractWatchPartyCodeFromInput(pending.roomId || pending.groupId);
        if (!code) {
            return;
        }
        if (pending.capturedAt && (Date.now() - Number(pending.capturedAt)) > 6 * 3600 * 1000) {
            return;
        }
        if (isKidsProfileActive()) {
            showToast('Switch to a non-Kids profile to join Watch Together.', 'info');
            return;
        }
        if (!isWatchTogetherEnabled()) {
            return;
        }

        watchPartyState.processingPending = true;
        joinWatchPartyRoom(code).then(function (room) {
            watchPartyState.processingPending = false;
            var roomLabel = (room && room.name) ? ('“' + room.name + '”') : ('Room ' + code);
            showToast('Joined ' + roomLabel + '!', 'success');
            // If room has no active media yet, open the Watch Together lobby modal so the viewer sees connected members
            if (room && !room.itemId && !isVideoPlayerActive()) {
                openWatchTogetherModal({});
            }
        }).catch(function (err) {
            watchPartyState.processingPending = false;
            showToast((err && err.message) || 'That Watch Party room is no longer active.', 'info');
        });
    }
