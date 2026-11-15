/* StreamFlix Client (12e) — Watch Together Interactive Modal */
    function openWatchTogetherModal(opts) {
        opts = opts || {};
        if (!isWatchTogetherEnabled()) {
            return;
        }

        var inPlayerNow = isVideoPlayerActive();
        var rawContextItem = opts.item || (inPlayerNow && osdState && osdState.info ? osdState.info : null) || watchPartyState.targetItem || null;
        var resolvedPlayable = opts.playableTarget || rawContextItem || null;
        if (rawContextItem && rawContextItem.Id) {
            watchPartyState.targetItem = rawContextItem;
        }

        var defaultRoomName = ((state.activeProfile && state.activeProfile.name) || 'StreamFlix') + '\'s Watch Party';
        var selectedStartMode = inPlayerNow ? 'live' : 'beginning'; // 'beginning' (0:00 default!), 'resume', or 'live'
        var hostLockCreate = false;
        var guestInvitePass = null;
        var liveClockTimer = null;

        var m = openModal('<div id="bfx-wp-modal-root" class="bfx-wp-root"><div class="bfx-wp-loading"><div class="streamflix-spinner-ring"></div><span>Loading Watch Together…</span></div></div>', {
            className: 'streamflix-modal-wide bfx-wp-modal',
            onClose: function () {
                if (liveClockTimer) {
                    clearInterval(liveClockTimer);
                    liveClockTimer = null;
                }
                if (watchPartyState.onModalRoomUpdated === onLiveRoomPush) {
                    watchPartyState.onModalRoomUpdated = null;
                }
            }
        });
        var rootEl = m.modal.querySelector('#bfx-wp-modal-root');

        var canPhoneShare = typeof canUsePhoneNativeShare === 'function' && canUsePhoneNativeShare();
        var isGuest = isGuestPassSession();
        var isAdmin = !isGuest && (isHouseholdAdmin() || Boolean(state.activeProfile && state.activeProfile.isAdmin));
        var canCreateGuestCombo = isAdmin && areGuestPassesEnabled();

        function getEligibleGuestProfiles() {
            return getProfiles().filter(function (p) {
                return !p.isAdmin && !p.isOwner && !p.isKids;
            });
        }

        function getPersonalResumeSec(itemObj) {
            if (!itemObj || !itemObj.UserData || !itemObj.UserData.PlaybackPositionTicks) {
                return 0;
            }
            var sec = Number(itemObj.UserData.PlaybackPositionTicks) / 10000000;
            return (isFinite(sec) && sec >= 45) ? Math.floor(sec) : 0;
        }

        function computeChosenStartSec() {
            if (inPlayerNow && osdState && osdState.video && resolvedPlayable && osdState.info && normalizeGuid(resolvedPlayable.Id) === normalizeGuid(osdState.info.Id)) {
                return getEffectiveVideoPositionSec(osdState.video);
            }
            if (selectedStartMode === 'resume') {
                return getPersonalResumeSec(resolvedPlayable);
            }
            return 0;
        }

        function onLiveRoomPush() {
            if (!rootEl || !m.modal.parentNode) {
                return;
            }
            var focused = document.activeElement;
            if (focused && rootEl.contains(focused) && focused.tagName === 'INPUT' && !focused.readOnly) {
                return;
            }
            renderModalBody();
        }
        watchPartyState.onModalRoomUpdated = onLiveRoomPush;

        function startLiveClockTicker() {
            if (liveClockTimer) {
                clearInterval(liveClockTimer);
                liveClockTimer = null;
            }
            liveClockTimer = setInterval(function () {
                if (!rootEl || !m.modal.parentNode) {
                    clearInterval(liveClockTimer);
                    liveClockTimer = null;
                    return;
                }
                var clockEl = rootEl.querySelector('#bfx-wp-live-pos-label');
                var room = watchPartyState.activeGroup;
                if (clockEl && room && room.itemId) {
                    var statusWord = room.isPlaying ? 'Playing' : 'Paused';
                    clockEl.textContent = statusWord + ' · ' + formatWatchPartyClock(getAuthoritativeRoomPositionSec(room));
                }
            }, 1000);
        }

        function renderModalBody() {
            if (!rootEl || !m.modal.parentNode) {
                return;
            }
            var activeRoom = watchPartyState.activeGroup;
            var rooms = Array.isArray(watchPartyState.groups) ? watchPartyState.groups : [];
            var targetTitle = formatWatchPartyMediaLabel(resolvedPlayable || rawContextItem);
            var resumeSec = (!inPlayerNow && resolvedPlayable) ? getPersonalResumeSec(resolvedPlayable) : 0;

            var startPosHtml = '';
            if (resolvedPlayable && resolvedPlayable.Id && resumeSec > 0 && !inPlayerNow) {
                startPosHtml = ''
                    + '<div class="bfx-wp-startpos-wrap">'
                    + '  <span class="bfx-wp-section-label">Start Position for Everyone</span>'
                    + '  <div class="bfx-wp-startpos-pills">'
                    + '    <button type="button" class="bfx-wp-startpos-pill' + (selectedStartMode !== 'resume' ? ' is-selected' : '') + '" data-wp-startmode="beginning">Start from Beginning (0:00)</button>'
                    + '    <button type="button" class="bfx-wp-startpos-pill' + (selectedStartMode === 'resume' ? ' is-selected' : '') + '" data-wp-startmode="resume">My Resume Point (' + escapeHtml(formatWatchPartyClock(resumeSec)) + ')</button>'
                    + '  </div>'
                    + '</div>';
            }

            var targetBannerHtml = targetTitle
                ? (''
                    + '<div class="bfx-wp-target-banner">'
                    + '  <span class="bfx-wp-target-ico">' + icon('play') + '</span>'
                    + '  <div class="bfx-wp-target-copy">'
                    + '    <span class="bfx-wp-target-kicker">' + (inPlayerNow ? 'Currently open in player' : 'Selected to watch together') + '</span>'
                    + '    <strong>' + escapeHtml(targetTitle) + '</strong>'
                    + '  </div>'
                    + '</div>')
                : '';

            var html = ''
                + '<div class="bfx-wp-header">'
                + '  <div class="bfx-wp-title-wrap">'
                + '    <span class="bfx-wp-hero-ico">' + icon('party') + '</span>'
                + '    <div>'
                + '      <h2 class="streamflix-modal-title" style="margin:0;">Watch Together</h2>'
                + '      <p class="streamflix-modal-sub" style="margin:3px 0 0;">Real-time synced play, pause, seek &amp; episode transitions.</p>'
                + '    </div>'
                + '  </div>'
                + '  <div class="bfx-wp-header-actions">'
                + '    <button type="button" class="streamflix-ghost-btn bfx-wp-icon-btn" id="bfx-wp-refresh-btn" title="Refresh" aria-label="Refresh">' + icon('refresh') + '</button>'
                + '    <button type="button" class="streamflix-ghost-btn bfx-wp-icon-btn" id="bfx-wp-close-btn" title="Close" aria-label="Close">' + icon('close') + '</button>'
                + '  </div>'
                + '</div>';

            if (activeRoom) {
                var participants = Array.isArray(activeRoom.participants) && activeRoom.participants.length
                    ? activeRoom.participants
                    : [{
                        participantId: getMyWatchPartyParticipantId(),
                        displayName: (state.activeProfile && state.activeProfile.name) || 'You',
                        avatarEmoji: (state.activeProfile && state.activeProfile.icon) || '🎬',
                        avatarColorHex: (state.activeProfile && state.activeProfile.color) || '#E50914',
                        isHost: true
                    }];
                var isMyHost = activeRoom.hostParticipantId === getMyWatchPartyParticipantId() || isAdmin;
                var canControl = canControlWatchPartyRoom(activeRoom);
                var inviteUrl = buildWatchPartyInviteUrl(activeRoom.roomId);
                var roomMediaLabel = formatWatchPartyMediaLabel(activeRoom);
                var livePosSec = getAuthoritativeRoomPositionSec(activeRoom);
                var hasDifferentTarget = Boolean(
                    resolvedPlayable && resolvedPlayable.Id
                    && (!activeRoom.itemId || normalizeGuid(resolvedPlayable.Id) !== normalizeGuid(activeRoom.itemId))
                );

                var partChipsHtml = participants.map(function (p) {
                    var pName = String(p.displayName || 'Viewer');
                    var emoji = String(p.avatarEmoji || '🎬');
                    var bg = String(p.avatarColorHex || '#10b981');
                    return '<span class="bfx-wp-member-chip">'
                        + '<span class="bfx-wp-member-av has-emoji" style="background:' + escapeHtml(bg) + ';">' + escapeHtml(emoji) + '</span>'
                        + '<span>' + escapeHtml(pName) + '</span>'
                        + (p.isHost ? '<span class="bfx-wp-member-tag">Host</span>' : '')
                        + (p.isBuffering ? '<span class="bfx-wp-member-tag is-buffering">Syncing</span>' : '')
                        + '</span>';
                }).join('');

                var nowPlayingCardHtml = activeRoom.itemId
                    ? (''
                        + '<div class="bfx-wp-nowplaying-card">'
                        + '  <div class="bfx-wp-nowplaying-meta">'
                        + '    <span class="bfx-wp-nowplaying-kicker" id="bfx-wp-live-pos-label">' + (activeRoom.isPlaying ? 'Playing' : 'Paused') + ' · ' + escapeHtml(formatWatchPartyClock(livePosSec)) + '</span>'
                        + '    <span class="bfx-wp-nowplaying-title">' + escapeHtml(roomMediaLabel || 'Synced Stream') + '</span>'
                        + '  </div>'
                        + '  <div class="bfx-wp-nowplaying-actions">'
                        + (inPlayerNow && osdState && osdState.info && normalizeGuid(osdState.info.Id) === normalizeGuid(activeRoom.itemId)
                            ? '<button type="button" class="streamflix-ghost-btn" id="bfx-wp-resync-now-btn">' + iconLabel('refresh', 'Sync Now') + '</button>'
                            : '<button type="button" class="streamflix-btn-primary" id="bfx-wp-watch-room-btn">' + iconLabel('play', 'Join Stream') + '</button>')
                        + '  </div>'
                        + '</div>')
                    : '<div class="bfx-wp-empty" style="margin-bottom:14px;">Lobby ready — share the invite link below or press Play on any movie or show to start everyone together!</div>';

                var switchTargetHtml = (hasDifferentTarget && canControl)
                    ? (targetBannerHtml
                        + startPosHtml
                        + '<button type="button" class="streamflix-btn-primary bfx-wp-play-cta" id="bfx-wp-play-selected-btn">'
                        + iconLabel('play', activeRoom.itemId ? 'Switch Party to This Title' : 'Play Together Now')
                        + '</button>')
                    : '';

                var guestComboHtml = '';
                if (canCreateGuestCombo) {
                    var guestProfiles = getEligibleGuestProfiles();
                    if (guestInvitePass && guestInvitePass.comboUrl) {
                        guestComboHtml = ''
                            + '<div class="bfx-wp-guest-card is-ready">'
                            + '  <div class="bfx-wp-guest-info">'
                            + '    <span class="bfx-wp-kicker">' + icon('ticket') + '<span>6-Hour Guest Pass + Watch Party Link</span></span>'
                            + '    <div class="bfx-wp-invite-row" style="margin-top:8px;">'
                            + '      <input type="text" class="streamflix-input bfx-wp-link-input" id="bfx-wp-guest-url-input" readonly value="' + escapeHtml(guestInvitePass.comboUrl) + '" />'
                            + '      <button type="button" class="streamflix-btn-primary" id="bfx-wp-copy-guest-btn">' + iconLabel('copy', 'Copy') + '</button>'
                            + (canPhoneShare ? '      <button type="button" class="streamflix-ghost-btn" id="bfx-wp-share-guest-btn">' + iconLabel('share', 'Share') + '</button>' : '')
                            + '    </div>'
                            + '    <div class="streamflix-field-hint" style="margin-top:6px;">Friends without an account sign in as <strong>' + escapeHtml(guestInvitePass.profileName || 'Guest') + '</strong> and jump straight into sync.</div>'
                            + '  </div>'
                            + '</div>';
                    } else if (guestProfiles.length > 0) {
                        var profOpts = guestProfiles.map(function (gp) {
                            return '<option value="' + escapeHtml(gp.id) + '">' + escapeHtml((gp.icon ? gp.icon + ' ' : '') + gp.name) + '</option>';
                        }).join('');
                        guestComboHtml = ''
                            + '<div class="bfx-wp-guest-card">'
                            + '  <div class="bfx-wp-guest-row">'
                            + '    <div>'
                            + '      <div class="bfx-wp-guest-title">' + icon('ticket') + '<span>Inviting a friend without an account?</span></div>'
                            + '      <div class="streamflix-field-hint">Generate a 6-hour Guest Pass that drops them straight into this Watch Party.</div>'
                            + '    </div>'
                            + '    <div class="bfx-wp-guest-controls">'
                            + (guestProfiles.length > 1 ? '<select id="bfx-wp-guest-prof-sel" class="streamflix-select bfx-wp-guest-select" aria-label="Guest profile">' + profOpts + '</select>' : '')
                            + '      <button type="button" class="streamflix-ghost-btn" id="bfx-wp-make-guest-btn">' + iconLabel('plus', 'Create Guest Link') + '</button>'
                            + '    </div>'
                            + '  </div>'
                            + '</div>';
                    }
                }

                html += ''
                    + '<div class="bfx-wp-active-card">'
                    + '  <div class="bfx-wp-active-top">'
                    + '    <div>'
                    + '      <div class="bfx-wp-live-pill"><span class="bfx-wp-pulse-dot"></span><span>LIVE WATCH PARTY · ' + escapeHtml(activeRoom.state || 'Ready') + '</span></div>'
                    + '      <h3 class="bfx-wp-room-name">' + escapeHtml(activeRoom.name || 'Watch Party') + '</h3>'
                    + '      <div class="bfx-wp-code-row">'
                    + '        <button type="button" class="bfx-wp-code-badge" id="bfx-wp-copy-code-btn" title="Copy room code"><span>CODE · ' + escapeHtml(activeRoom.roomId) + '</span>' + icon('copy') + '</button>'
                    + (isMyHost
                        ? ('        <button type="button" class="bfx-wp-host-toggle' + (activeRoom.hostControlOnly ? ' is-locked' : '') + '" id="bfx-wp-toggle-lock-btn">'
                            + icon(activeRoom.hostControlOnly ? 'lock' : 'users')
                            + '<span>' + (activeRoom.hostControlOnly ? 'Host Controls Only' : 'Everyone Can Pause/Seek') + '</span></button>')
                        : (activeRoom.hostControlOnly
                            ? '<span class="bfx-wp-host-toggle is-locked" style="cursor:default;">' + icon('lock') + '<span>Host Controls Only</span></span>'
                            : ''))
                    + '      </div>'
                    + '    </div>'
                    + '    <button type="button" class="streamflix-btn-danger bfx-wp-leave-btn" id="bfx-wp-leave-btn">' + iconLabel('logout', 'Leave Party') + '</button>'
                    + '  </div>'
                    + '  <div class="bfx-wp-members-wrap">'
                    + '    <div class="bfx-wp-section-label">Connected (' + participants.length + ')</div>'
                    + '    <div class="bfx-wp-members">' + partChipsHtml + '</div>'
                    + '  </div>'
                    + nowPlayingCardHtml
                    + switchTargetHtml
                    + '  <div class="bfx-wp-invite-box">'
                    + '    <div class="bfx-wp-section-label">Household Invite Link</div>'
                    + '    <div class="bfx-wp-invite-row">'
                    + '      <input type="text" class="streamflix-input bfx-wp-link-input" id="bfx-wp-invite-input" readonly value="' + escapeHtml(inviteUrl) + '" />'
                    + '      <button type="button" class="streamflix-btn-primary" id="bfx-wp-copy-invite-btn">' + iconLabel('copy', 'Copy Link') + '</button>'
                    + (canPhoneShare ? '      <button type="button" class="streamflix-ghost-btn" id="bfx-wp-share-invite-btn">' + iconLabel('share', 'Share') + '</button>' : '')
                    + '    </div>'
                    + '  </div>'
                    + guestComboHtml
                    + '</div>';
            } else {
                var roomsHtml = rooms.length
                    ? rooms.map(function (r) {
                        var parts = Array.isArray(r.participants) ? r.participants : [];
                        var countNum = r.participantCount || parts.length || 1;
                        var countLabel = countNum === 1 ? '1 viewer' : (countNum + ' viewers');
                        var mediaText = formatWatchPartyMediaLabel(r);
                        var names = parts.map(function (p) { return p.displayName; }).filter(Boolean).slice(0, 3).join(', ');
                        var subParts = ['Code ' + r.roomId, countLabel, mediaText ? ((r.isPlaying ? 'Playing ' : 'Paused ') + mediaText) : 'In Lobby', names].filter(Boolean);
                        return ''
                            + '<div class="bfx-wp-room-row">'
                            + '  <div class="bfx-wp-room-meta">'
                            + '    <div class="bfx-wp-room-row-title"><span class="bfx-wp-pulse-dot"></span><span>' + escapeHtml(r.name || 'Watch Party') + '</span></div>'
                            + '    <div class="bfx-wp-room-row-sub">' + escapeHtml(subParts.join(' · ')) + '</div>'
                            + '  </div>'
                            + '  <button type="button" class="streamflix-btn-primary bfx-wp-join-btn" data-join-room-id="' + escapeHtml(r.roomId) + '">Join</button>'
                            + '</div>';
                    }).join('')
                    : '<div class="bfx-wp-empty">No active watch parties right now. Start one above or enter a friend\'s room code!</div>';

                var hasPlayableTarget = Boolean(resolvedPlayable && resolvedPlayable.Id);
                html += ''
                    + '<div class="bfx-wp-create-card">'
                    + targetBannerHtml
                    + '  <label class="bfx-wp-section-label" for="bfx-wp-room-input">Start a New Watch Party</label>'
                    + '  <div class="bfx-wp-create-row">'
                    + '    <input type="text" id="bfx-wp-room-input" class="streamflix-input" maxlength="64" value="' + escapeHtml(defaultRoomName) + '" placeholder="Room name" />'
                    + '    <button type="button" class="bfx-wp-host-toggle' + (hostLockCreate ? ' is-locked' : '') + '" id="bfx-wp-create-lock-btn" title="Choose whether everyone can pause/seek or only you">'
                    + icon(hostLockCreate ? 'lock' : 'users')
                    + '<span>' + (hostLockCreate ? 'Host Only' : 'Everyone Controls') + '</span></button>'
                    + '  </div>'
                    + startPosHtml
                    + '  <div class="bfx-wp-create-actions">'
                    + (hasPlayableTarget && !inPlayerNow
                        ? ('    <button type="button" class="streamflix-btn-primary" id="bfx-wp-start-and-play-btn">' + iconLabel('play', 'Start & Play Together') + '</button>'
                            + '    <button type="button" class="streamflix-ghost-btn" id="bfx-wp-create-lobby-btn">' + iconLabel('party', 'Create Lobby & Invite First') + '</button>')
                        : ('    <button type="button" class="streamflix-btn-primary" id="bfx-wp-create-lobby-btn">' + iconLabel('party', inPlayerNow ? 'Start Synced Party Here' : 'Create Watch Party') + '</button>'))
                    + '  </div>'
                    + '</div>'
                    + '<div class="bfx-wp-join-code-box">'
                    + '  <label class="bfx-wp-section-label" for="bfx-wp-code-join-input">Have a Room Code or Invite Link?</label>'
                    + '  <div class="bfx-wp-create-row">'
                    + '    <input type="text" id="bfx-wp-code-join-input" class="streamflix-input bfx-wp-code-input" maxlength="180" placeholder="Enter 6-character code (e.g. K7M4X9) or paste link" />'
                    + '    <button type="button" class="streamflix-ghost-btn" id="bfx-wp-code-join-btn">Join Room</button>'
                    + '  </div>'
                    + '</div>'
                    + '<div class="bfx-wp-rooms-section">'
                    + '  <div class="bfx-wp-section-label">Active Rooms (' + rooms.length + ')</div>'
                    + '  <div class="bfx-wp-rooms-list">' + roomsHtml + '</div>'
                    + '</div>';
            }

            rootEl.innerHTML = html;
            startLiveClockTicker();

            var closeBtn = rootEl.querySelector('#bfx-wp-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', function () { m.close(); });
            }
            var refreshBtn = rootEl.querySelector('#bfx-wp-refresh-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', function () {
                    refreshWatchPartyRoomsList(false).then(renderModalBody);
                });
            }

            Array.prototype.forEach.call(rootEl.querySelectorAll('[data-wp-startmode]'), function (pill) {
                pill.addEventListener('click', function () {
                    selectedStartMode = pill.getAttribute('data-wp-startmode') || 'beginning';
                    renderModalBody();
                });
            });

            var createLockBtn = rootEl.querySelector('#bfx-wp-create-lock-btn');
            if (createLockBtn) {
                createLockBtn.addEventListener('click', function () {
                    var nameField = rootEl.querySelector('#bfx-wp-room-input');
                    if (nameField) {
                        defaultRoomName = (nameField.value || '').trim() || defaultRoomName;
                    }
                    hostLockCreate = !hostLockCreate;
                    renderModalBody();
                });
            }

            var runCreateParty = function (launchImmediately, triggerBtn) {
                var nameField = rootEl.querySelector('#bfx-wp-room-input');
                defaultRoomName = (nameField && (nameField.value || '').trim()) || defaultRoomName;
                if (triggerBtn) {
                    triggerBtn.disabled = true;
                    triggerBtn.classList.add('streamflix-btn-loading');
                }
                var startSec = computeChosenStartSec();
                var createPayload = {
                    hostControlOnly: hostLockCreate,
                    playableItem: (launchImmediately || inPlayerNow) ? resolvedPlayable : null,
                    startPositionSeconds: startSec,
                    isPlaying: Boolean(launchImmediately || (inPlayerNow && osdState && osdState.video && !osdState.video.paused)),
                    suppressImmediateAutoFollow: Boolean(launchImmediately && !inPlayerNow)
                };
                createWatchPartyRoom(defaultRoomName, createPayload).then(function (room) {
                    if (launchImmediately && resolvedPlayable && resolvedPlayable.Id && !inPlayerNow) {
                        m.close();
                        if (state.activeDetailModal && typeof state.activeDetailModal.close === 'function') {
                            state.activeDetailModal.close(true);
                        }
                        showToast('Watch Party ' + room.roomId + ' live! Starting synced playback…', 'success');
                        playItemImmediately(resolvedPlayable, null, null, Math.round(startSec * 10000000), { fromWatchPartyFollow: true });
                        return;
                    }
                    showToast('Watch Party started (Code ' + room.roomId + ')!', 'success');
                    renderModalBody();
                }).catch(function (err) {
                    if (triggerBtn) {
                        triggerBtn.disabled = false;
                        triggerBtn.classList.remove('streamflix-btn-loading');
                    }
                    showToast((err && err.message) || 'Could not start Watch Party.', 'error');
                });
            };

            var startAndPlayBtn = rootEl.querySelector('#bfx-wp-start-and-play-btn');
            if (startAndPlayBtn) {
                startAndPlayBtn.addEventListener('click', function () {
                    runCreateParty(true, startAndPlayBtn);
                });
            }
            var createLobbyBtn = rootEl.querySelector('#bfx-wp-create-lobby-btn');
            if (createLobbyBtn) {
                createLobbyBtn.addEventListener('click', function () {
                    runCreateParty(false, createLobbyBtn);
                });
            }

            var codeJoinInput = rootEl.querySelector('#bfx-wp-code-join-input');
            var codeJoinBtn = rootEl.querySelector('#bfx-wp-code-join-btn');
            if (codeJoinInput && codeJoinBtn) {
                var submitCodeJoin = function () {
                    var parsedCode = extractWatchPartyCodeFromInput(codeJoinInput.value);
                    if (!parsedCode) {
                        showToast('Enter a valid 6-character room code or Watch Party invite link.', 'info');
                        codeJoinInput.focus();
                        return;
                    }
                    codeJoinBtn.disabled = true;
                    codeJoinBtn.classList.add('streamflix-btn-loading');
                    joinWatchPartyRoom(parsedCode).then(function (joinedRoom) {
                        showToast('Joined “' + (joinedRoom.name || parsedCode) + '”!', 'success');
                        if (joinedRoom && joinedRoom.itemId) {
                            m.close();
                        } else {
                            renderModalBody();
                        }
                    }).catch(function (err) {
                        codeJoinBtn.disabled = false;
                        codeJoinBtn.classList.remove('streamflix-btn-loading');
                        showToast((err && err.message) || 'Room not found.', 'error');
                    });
                };
                codeJoinBtn.addEventListener('click', submitCodeJoin);
                codeJoinInput.addEventListener('keydown', function (ev) {
                    if (ev.key === 'Enter') {
                        ev.preventDefault();
                        submitCodeJoin();
                    }
                });
            }

            Array.prototype.forEach.call(rootEl.querySelectorAll('[data-join-room-id]'), function (joinBtn) {
                joinBtn.addEventListener('click', function () {
                    var rid = joinBtn.getAttribute('data-join-room-id');
                    joinBtn.disabled = true;
                    joinBtn.classList.add('streamflix-btn-loading');
                    joinWatchPartyRoom(rid).then(function (joinedRoom) {
                        showToast('Joined “' + (joinedRoom.name || rid) + '”!', 'success');
                        if (joinedRoom && joinedRoom.itemId) {
                            m.close();
                        } else {
                            renderModalBody();
                        }
                    }).catch(function (err) {
                        joinBtn.disabled = false;
                        joinBtn.classList.remove('streamflix-btn-loading');
                        showToast((err && err.message) || 'Could not join Watch Party.', 'error');
                    });
                });
            });

            var copyCodeBtn = rootEl.querySelector('#bfx-wp-copy-code-btn');
            if (copyCodeBtn && activeRoom) {
                copyCodeBtn.addEventListener('click', function () {
                    copyTextToClipboard(activeRoom.roomId, 'Room code ' + activeRoom.roomId + ' copied!');
                });
            }

            var toggleLockBtn = rootEl.querySelector('#bfx-wp-toggle-lock-btn');
            if (toggleLockBtn && activeRoom) {
                toggleLockBtn.addEventListener('click', function () {
                    toggleLockBtn.disabled = true;
                    sendWatchPartyCommand('toggle_host_only', { hostControlOnly: !activeRoom.hostControlOnly }).then(function () {
                        renderModalBody();
                    });
                });
            }

            var resyncBtn = rootEl.querySelector('#bfx-wp-resync-now-btn');
            if (resyncBtn) {
                resyncBtn.addEventListener('click', function () {
                    reconcilePlayerWithRoom(true);
                    showToast('Synced to live Watch Party timeline!', 'success');
                });
            }

            var watchRoomBtn = rootEl.querySelector('#bfx-wp-watch-room-btn');
            if (watchRoomBtn && activeRoom && activeRoom.itemId) {
                watchRoomBtn.addEventListener('click', function () {
                    var targetTicks = Math.max(0, Math.round(getAuthoritativeRoomPositionSec(activeRoom) * 10000000));
                    m.close();
                    if (state.activeDetailModal && typeof state.activeDetailModal.close === 'function') {
                        state.activeDetailModal.close(true);
                    }
                    playItemImmediately(activeRoom.itemId, null, null, targetTicks, { fromWatchPartyFollow: true });
                });
            }

            var playSelectedBtn = rootEl.querySelector('#bfx-wp-play-selected-btn');
            if (playSelectedBtn && resolvedPlayable && resolvedPlayable.Id) {
                playSelectedBtn.addEventListener('click', function () {
                    var startSec = computeChosenStartSec();
                    m.close();
                    if (state.activeDetailModal && typeof state.activeDetailModal.close === 'function') {
                        state.activeDetailModal.close(true);
                    }
                    playItemImmediately(resolvedPlayable, null, null, Math.round(startSec * 10000000));
                });
            }

            var leaveBtn = rootEl.querySelector('#bfx-wp-leave-btn');
            if (leaveBtn) {
                leaveBtn.addEventListener('click', function () {
                    leaveBtn.disabled = true;
                    leaveWatchPartyRoom(false).then(function () {
                        guestInvitePass = null;
                        showToast('Left Watch Party.', 'info');
                        return refreshWatchPartyRoomsList(true);
                    }).then(renderModalBody);
                });
            }

            var copyInviteBtn = rootEl.querySelector('#bfx-wp-copy-invite-btn');
            var inviteInput = rootEl.querySelector('#bfx-wp-invite-input');
            if (copyInviteBtn && inviteInput) {
                copyInviteBtn.addEventListener('click', function () {
                    copyTextToClipboard(inviteInput.value, 'Watch Party invite link copied!');
                });
                inviteInput.addEventListener('click', function () {
                    try { inviteInput.select(); } catch (e) {}
                });
            }

            var shareInviteBtn = rootEl.querySelector('#bfx-wp-share-invite-btn');
            if (shareInviteBtn && inviteInput) {
                shareInviteBtn.addEventListener('click', function () {
                    var shareMedia = formatWatchPartyMediaLabel(activeRoom) || targetTitle;
                    try {
                        navigator.share({
                            title: (activeRoom && activeRoom.name) || (getBrandName() + ' Watch Party'),
                            text: shareMedia ? ('Join my Watch Party for "' + shareMedia + '" (Code ' + activeRoom.roomId + ')!') : ('Join my ' + getBrandName() + ' Watch Party (Code ' + activeRoom.roomId + ')!'),
                            url: inviteInput.value
                        }).catch(function () {});
                    } catch (e) {}
                });
            }

            var makeGuestBtn = rootEl.querySelector('#bfx-wp-make-guest-btn');
            if (makeGuestBtn && activeRoom) {
                makeGuestBtn.addEventListener('click', function () {
                    var guestProfiles = getEligibleGuestProfiles();
                    var selEl = rootEl.querySelector('#bfx-wp-guest-prof-sel');
                    var chosenProfId = selEl ? selEl.value : (guestProfiles[0] && guestProfiles[0].id);
                    if (!chosenProfId) {
                        showToast('Create a non-admin profile first to issue a Guest Pass.', 'info');
                        return;
                    }
                    makeGuestBtn.disabled = true;
                    makeGuestBtn.classList.add('streamflix-btn-loading');
                    var labelMedia = formatWatchPartyMediaLabel(activeRoom) || targetTitle;
                    apiFetch('/StreamFlix/GuestPasses/Create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            label: 'Watch Party' + (labelMedia ? (' · ' + labelMedia.slice(0, 26)) : ''),
                            profileId: chosenProfId,
                            durationHours: 6,
                            maxRedemptions: 4
                        })
                    }).then(function (created) {
                        var rawGuestUrl = (created && created.shareUrl) || '';
                        if (rawGuestUrl && rawGuestUrl.charAt(0) === '/') {
                            rawGuestUrl = window.location.origin + rawGuestUrl;
                        }
                        var pName = (created && created.pass && created.pass.profileName) || (created && created.profileName) || 'Guest';
                        guestInvitePass = {
                            profileName: pName,
                            comboUrl: appendWatchPartyQueryToGuestUrl(rawGuestUrl, activeRoom.roomId)
                        };
                        renderModalBody();
                        if (guestInvitePass.comboUrl) {
                            copyTextToClipboard(guestInvitePass.comboUrl, '6-hour Guest Watch Party link copied!');
                        }
                    }).catch(function (err) {
                        makeGuestBtn.disabled = false;
                        makeGuestBtn.classList.remove('streamflix-btn-loading');
                        showToast((err && err.message) || 'Could not create Guest Pass link.', 'error');
                    });
                });
            }

            var copyGuestBtn = rootEl.querySelector('#bfx-wp-copy-guest-btn');
            var guestUrlInput = rootEl.querySelector('#bfx-wp-guest-url-input');
            if (copyGuestBtn && guestUrlInput) {
                copyGuestBtn.addEventListener('click', function () {
                    copyTextToClipboard(guestUrlInput.value, 'Guest Watch Party link copied!');
                });
            }
            var shareGuestBtn = rootEl.querySelector('#bfx-wp-share-guest-btn');
            if (shareGuestBtn && guestUrlInput) {
                shareGuestBtn.addEventListener('click', function () {
                    var shareMedia = formatWatchPartyMediaLabel(activeRoom) || targetTitle;
                    try {
                        navigator.share({
                            title: (activeRoom && activeRoom.name) || (getBrandName() + ' Watch Party'),
                            text: shareMedia ? ('Watch "' + shareMedia + '" together with me (6-hour Guest Pass included):') : ('Join my ' + getBrandName() + ' Watch Party (Guest Pass included):'),
                            url: guestUrlInput.value
                        }).catch(function () {});
                    } catch (e) {}
                });
            }
        }

        // Resolve Series/Season into concrete Episode before rendering so Start Position & Play Together know exact Episode metadata
        var resolveTargetPromise = (rawContextItem && rawContextItem.Id && (rawContextItem.Type === 'Series' || rawContextItem.Type === 'Season'))
            ? resolvePlayableItem(rawContextItem).then(function (ep) {
                if (ep && ep.Id) {
                    resolvedPlayable = ep;
                }
            }).catch(function () {})
            : Promise.resolve();

        Promise.all([
            resolveTargetPromise,
            refreshWatchPartyRoomsList(true)
        ]).then(renderModalBody);
    }
