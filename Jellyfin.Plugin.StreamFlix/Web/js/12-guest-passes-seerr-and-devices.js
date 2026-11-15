/* StreamFlix Client (12/14) — Guest Passes, Seerr Requests & Active Devices Modals */
    /* ----------------------------------------------------------------------
       7b. v0.7.0+ Modals: Temporary Guest Passes & Seerr Requests
       ---------------------------------------------------------------------- */
    function openGuestPassesModal() {
        if (!areGuestPassesEnabled()) {
            showToast('Temporary Guest Passes are turned off in Dashboard → Plugins → StreamFlix.', 'info');
            return;
        }
        var passes = [];
        var eligibleProfiles = [];
        var spotlightInfo = null;
        var loading = true;
        var busyAction = false;

        var m = openModal(''
            + '<div class="bfx-modal-top">'
            + '  <div class="bfx-modal-top-title">'
            + '    <span class="bfx-modal-kicker">' + icon('ticket') + ' <span>HOUSEHOLD INVITES</span></span>'
            + '    <h2>Temporary Guest Passes</h2>'
            + '    <p class="streamflix-modal-text">Share an expiring QR code or invite link locked to a single non-admin profile — revocable in one click.</p>'
            + '  </div>'
            + '  <button type="button" class="streamflix-detail-close bfx-modal-close-inline" data-act="close" aria-label="Close">' + icon('close') + '</button>'
            + '</div>'
            + '<div id="bfx-gp-body"><div class="bfx-modal-loading"><div class="streamflix-spinner-ring"></div><span>Loading Guest Passes…</span></div></div>', {
            className: 'streamflix-modal-lg bfx-gp-modal'
        });

        m.modal.querySelector('[data-act="close"]').addEventListener('click', function () {
            m.close(false);
        });

        function statusMeta(st) {
            var s = String(st || '').toLowerCase();
            if (s === 'active') { return { cls: 'is-active', label: 'Active' }; }
            if (s === 'expired') { return { cls: 'is-expired', label: 'Expired' }; }
            if (s === 'exhausted') { return { cls: 'is-exhausted', label: 'Max Devices' }; }
            return { cls: 'is-revoked', label: 'Revoked' };
        }

        function renderBody() {
            if (m.isClosed()) {
                return;
            }
            var bodyEl = m.modal.querySelector('#bfx-gp-body');
            if (!bodyEl) {
                return;
            }
            if (loading) {
                bodyEl.innerHTML = '<div class="bfx-modal-loading"><div class="streamflix-spinner-ring"></div><span>Loading Guest Passes…</span></div>';
                return;
            }

            var hasEligible = eligibleProfiles.length > 0;
            var profileOpts = eligibleProfiles.map(function (p) {
                var tag = p.isKids ? ' (Kids)' : '';
                return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml((p.avatarEmoji ? p.avatarEmoji + ' ' : '') + p.name + tag) + '</option>';
            }).join('');

            var phoneShareReady = canUsePhoneNativeShare();
            var spotlightHtml = '';
            if (spotlightInfo && spotlightInfo.pass) {
                var sp = spotlightInfo.pass;
                var spColor = sanitizeHexColor(sp.profileColorHex, '#E50914');
                var spCap = Number(sp.maxRedemptions);
                var spCapText = spCap > 0
                    ? ('Up to ' + spCap + ' ' + (spCap === 1 ? 'device' : 'devices'))
                    : 'Unlimited devices';
                var spCode = spotlightInfo.code || sp.code || '';
                var spResolvedUrl = resolveClientGuestShareUrl(spCode, spotlightInfo.shareUrl || sp.shareUrl);
                var canPhoneShare = phoneShareReady && Boolean(spResolvedUrl);
                spotlightHtml = ''
                    + '<div class="bfx-gp-spotlight" id="bfx-gp-spotlight-card">'
                    + '  <div class="bfx-gp-qr-box" id="bfx-gp-qr-host" aria-label="Guest Pass QR Code"></div>'
                    + '  <div class="bfx-gp-spot-info">'
                    + '    <div class="bfx-gp-spot-head">'
                    + '      <div>'
                    + '        <div class="bfx-gp-spot-kicker">READY TO SHARE</div>'
                    + '        <h3 class="bfx-gp-spot-title">' + escapeHtml(sp.label || 'Guest Pass') + '</h3>'
                    + '      </div>'
                    + '      <button type="button" class="streamflix-ghost-btn bfx-btn-xs" data-gp-hide-spot="1">Hide</button>'
                    + '    </div>'
                    + '    <div class="bfx-gp-spot-meta">'
                    + '      <span class="bfx-gp-prof-pill"><span class="bfx-gp-prof-dot" style="background:' + escapeHtml(spColor) + ';">' + escapeHtml(sp.profileEmoji || '🎟️') + '</span>' + escapeHtml(sp.profileName || 'Guest') + '</span>'
                    + '      <span>' + icon('clock') + ' ' + escapeHtml(formatRelativeExpiry(sp.expiresAtUtc || sp.expiresAt) || 'Expires soon') + '</span>'
                    + '      <span>' + escapeHtml(spCapText) + '</span>'
                    + '    </div>'
                    + (canPhoneShare
                        ? '    <button type="button" class="streamflix-btn-primary bfx-gp-phone-share-btn" data-gp-native-share="1">' + iconLabel('share', 'Share Invite') + '</button>'
                        : '')
                    + '    <div class="bfx-gp-copy-row">'
                    + '      <input type="text" class="streamflix-login-input bfx-gp-copy-input" readonly value="' + escapeHtml(spResolvedUrl) + '" aria-label="Guest Pass invite link" />'
                    + '      <button type="button" class="' + (canPhoneShare ? 'streamflix-ghost-btn' : 'streamflix-btn-primary') + ' bfx-gp-copy-btn" data-copy-val="' + escapeHtml(spResolvedUrl) + '" data-copy-label="Invite link">' + iconLabel('copy', 'Copy Link') + '</button>'
                    + '    </div>'
                    + '    <div class="bfx-gp-copy-row is-compact">'
                    + '      <span class="bfx-gp-code-label">Pass Code:</span>'
                    + '      <code class="bfx-gp-code-val">' + escapeHtml(spCode) + '</code>'
                    + '      <button type="button" class="streamflix-ghost-btn bfx-btn-xs" data-copy-val="' + escapeHtml(spCode) + '" data-copy-label="Pass code">' + iconLabel('copy', 'Copy Code') + '</button>'
                    + '    </div>'
                    + '  </div>'
                    + '</div>';
            }

            var listHtml = '';
            if (!passes.length) {
                listHtml = '<div class="bfx-gp-empty">No Guest Passes created yet. Generate one above when friends or family visit.</div>';
            } else {
                listHtml = passes.map(function (p) {
                    var st = statusMeta(p.status);
                    var isActive = st.cls === 'is-active';
                    var canRevoke = isActive || st.cls === 'is-exhausted';
                    var pCol = sanitizeHexColor(p.profileColorHex, '#2b2b2b');
                    var relExp = canRevoke ? formatRelativeExpiry(p.expiresAtUtc || p.expiresAt) : '';
                    var pMax = Number(p.maxRedemptions);
                    var devSummary = pMax > 0
                        ? ('Devices: ' + Number(p.redemptionCount || 0) + ' / ' + pMax)
                        : ('Devices: ' + Number(p.redemptionCount || 0) + ' (unlimited)');
                    var rowShareUrl = isActive ? resolveClientGuestShareUrl(p.code, p.shareUrl) : '';
                    return ''
                        + '<div class="bfx-gp-row ' + st.cls + '">'
                        + '  <div class="bfx-gp-row-avatar" style="background:' + escapeHtml(pCol) + ';">' + escapeHtml(p.profileEmoji || '🎟️') + '</div>'
                        + '  <div class="bfx-gp-row-main">'
                        + '    <div class="bfx-gp-row-top">'
                        + '      <span class="bfx-gp-row-label">' + escapeHtml(p.label || 'Guest Pass') + '</span>'
                        + '      <span class="bfx-gp-badge ' + st.cls + '">' + escapeHtml(st.label) + '</span>'
                        + '    </div>'
                        + '    <div class="bfx-gp-row-sub">'
                        + '      <span>Profile: <strong>' + escapeHtml(p.profileName || 'Profile') + '</strong></span>'
                        + '      <span>•</span>'
                        + '      <span>' + escapeHtml(devSummary) + '</span>'
                        + (relExp ? '<span>•</span><span>' + escapeHtml(relExp) + '</span>' : '')
                        + '    </div>'
                        + '  </div>'
                        + '  <div class="bfx-gp-row-actions">'
                        + (isActive && phoneShareReady && rowShareUrl
                            ? '<button type="button" class="streamflix-btn-primary bfx-btn-xs bfx-gp-phone-share-inline" data-gp-row-share="' + escapeHtml(p.id) + '">' + iconLabel('share', 'Share') + '</button>'
                            : '')
                        + (isActive
                            ? '<button type="button" class="streamflix-ghost-btn bfx-btn-xs" data-gp-share="' + escapeHtml(p.id) + '">' + iconLabel('qr', 'QR & Link') + '</button>'
                            : '')
                        + (canRevoke
                            ? '<button type="button" class="streamflix-btn-danger bfx-btn-xs" data-gp-revoke="' + escapeHtml(p.id) + '">Revoke</button>'
                            : '')
                        + '  </div>'
                        + '</div>';
                }).join('');
            }

            bodyEl.innerHTML = ''
                + (hasEligible
                    ? '<form class="bfx-gp-form" id="bfx-gp-create-form">'
                    + '  <div class="bfx-gp-field bfx-gp-field-grow">'
                    + '    <label for="bfx-gp-label">Guest Label</label>'
                    + '    <input type="text" id="bfx-gp-label" class="streamflix-login-input" maxlength="60" placeholder="Weekend Guest, House Sitter…" />'
                    + '  </div>'
                    + '  <div class="bfx-gp-field">'
                    + '    <label for="bfx-gp-profile">Locked Profile</label>'
                    + '    <select id="bfx-gp-profile" class="streamflix-select">' + profileOpts + '</select>'
                    + '  </div>'
                    + '  <div class="bfx-gp-field">'
                    + '    <label for="bfx-gp-hours">Expires In</label>'
                    + '    <select id="bfx-gp-hours" class="streamflix-select">'
                    + '      <option value="4">4 hours</option>'
                    + '      <option value="12">12 hours</option>'
                    + '      <option value="24" selected>24 hours</option>'
                    + '      <option value="48">48 hours</option>'
                    + '      <option value="72">3 days</option>'
                    + '      <option value="168">7 days</option>'
                    + '      <option value="336">14 days</option>'
                    + '      <option value="720">30 days</option>'
                    + '    </select>'
                    + '  </div>'
                    + '  <div class="bfx-gp-field bfx-gp-field-span-sm">'
                    + '    <label for="bfx-gp-max">Max Devices</label>'
                    + '    <select id="bfx-gp-max" class="streamflix-select">'
                    + '      <option value="1">1 device</option>'
                    + '      <option value="2" selected>2 devices</option>'
                    + '      <option value="3">3 devices</option>'
                    + '      <option value="5">5 devices</option>'
                    + '      <option value="10">10 devices</option>'
                    + '      <option value="0">Unlimited</option>'
                    + '    </select>'
                    + '  </div>'
                    + '  <div class="bfx-gp-field bfx-gp-field-btn">'
                    + '    <button type="submit" class="streamflix-btn-primary" id="bfx-gp-create-btn">' + iconLabel('plus', 'Create Pass') + '</button>'
                    + '  </div>'
                    + '</form>'
                    : '<div class="streamflix-auth-alert streamflix-auth-alert-error" style="margin-bottom:16px;">Create at least one non-Administrator household profile first — Guest Passes never grant access to Administrator accounts.</div>')
                + spotlightHtml
                + '<div class="bfx-gp-list-head">'
                + '  <span>Active Passes (' + passes.length + ')</span>'
                + '</div>'
                + '<div class="bfx-gp-list">' + listHtml + '</div>';

            if (spotlightInfo && spotlightInfo.qrSvg) {
                mountSanitizedQrSvg(bodyEl.querySelector('#bfx-gp-qr-host'), spotlightInfo.qrSvg);
            }

            var scrollSpotlightIntoView = function () {
                var spotCard = bodyEl.querySelector('#bfx-gp-spotlight-card');
                if (!spotCard) {
                    return;
                }
                spotCard.classList.remove('is-pulse');
                void spotCard.offsetWidth;
                spotCard.classList.add('is-pulse');
                try {
                    spotCard.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
                } catch (eScr) {}
            };

            var hideSpotBtn = bodyEl.querySelector('[data-gp-hide-spot]');
            if (hideSpotBtn) {
                hideSpotBtn.addEventListener('click', function () {
                    spotlightInfo = null;
                    renderBody();
                });
            }

            var nativeShareBtn = bodyEl.querySelector('[data-gp-native-share]');
            if (nativeShareBtn && spotlightInfo && spotlightInfo.pass) {
                nativeShareBtn.addEventListener('click', function () {
                    var spPass = spotlightInfo.pass || {};
                    triggerPhoneGuestPassShare({
                        label: spPass.label,
                        profileName: spPass.profileName,
                        code: spotlightInfo.code || spPass.code,
                        shareUrl: spotlightInfo.shareUrl || spPass.shareUrl
                    });
                });
            }

            Array.prototype.forEach.call(bodyEl.querySelectorAll('[data-gp-row-share]'), function (btn) {
                btn.addEventListener('click', function () {
                    var pid = btn.getAttribute('data-gp-row-share');
                    var pMatch = null;
                    for (var i = 0; i < passes.length; i++) {
                        if (passes[i] && passes[i].id === pid) {
                            pMatch = passes[i];
                            break;
                        }
                    }
                    if (pMatch) {
                        triggerPhoneGuestPassShare({
                            label: pMatch.label,
                            profileName: pMatch.profileName,
                            code: pMatch.code,
                            shareUrl: pMatch.shareUrl
                        });
                    }
                });
            });

            Array.prototype.forEach.call(bodyEl.querySelectorAll('[data-copy-val]'), function (btn) {
                btn.addEventListener('click', function () {
                    var val = btn.getAttribute('data-copy-val') || '';
                    var lbl = btn.getAttribute('data-copy-label') || 'Copied';
                    copyTextToClipboard(val).then(function (ok) {
                        showToast(ok ? (lbl + ' copied to clipboard.') : 'Could not copy automatically.', ok ? 'success' : 'error');
                    });
                });
            });

            var createForm = bodyEl.querySelector('#bfx-gp-create-form');
            if (createForm) {
                createForm.addEventListener('submit', function (ev) {
                    ev.preventDefault();
                    if (busyAction) {
                        return;
                    }
                    var labelVal = (bodyEl.querySelector('#bfx-gp-label').value || '').trim();
                    var profVal = bodyEl.querySelector('#bfx-gp-profile').value;
                    var hoursVal = parseInt(bodyEl.querySelector('#bfx-gp-hours').value, 10) || 24;
                    var rawMaxVal = parseInt(bodyEl.querySelector('#bfx-gp-max').value, 10);
                    var maxVal = isNaN(rawMaxVal) ? 2 : rawMaxVal;
                    var createBtn = bodyEl.querySelector('#bfx-gp-create-btn');
                    busyAction = true;
                    if (createBtn) {
                        createBtn.disabled = true;
                    }
                    apiFetch('/StreamFlix/GuestPasses/Create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            label: labelVal || 'Guest Pass',
                            profileId: profVal,
                            durationHours: hoursVal,
                            maxRedemptions: maxVal
                        })
                    }).then(function (res) {
                        busyAction = false;
                        if (res && res.pass) {
                            spotlightInfo = res;
                            passes.unshift(res.pass);
                            showToast('Guest Pass ready to share!', 'success');
                            renderBody();
                            scrollSpotlightIntoView();
                        }
                    }).catch(function (err) {
                        busyAction = false;
                        if (createBtn) {
                            createBtn.disabled = false;
                        }
                        showToast((err && err.message) || 'Could not create Guest Pass.', 'error');
                    });
                });
            }

            Array.prototype.forEach.call(bodyEl.querySelectorAll('[data-gp-share]'), function (btn) {
                btn.addEventListener('click', function () {
                    if (busyAction) {
                        return;
                    }
                    var pid = btn.getAttribute('data-gp-share');
                    busyAction = true;
                    apiFetch('/StreamFlix/GuestPasses/' + encodeURIComponent(pid) + '/ShareInfo')
                        .then(function (res) {
                            busyAction = false;
                            if (res && res.pass) {
                                spotlightInfo = res;
                                renderBody();
                                scrollSpotlightIntoView();
                            }
                        })
                        .catch(function (err) {
                            busyAction = false;
                            showToast((err && err.message) || 'Could not load Guest Pass QR code.', 'error');
                        });
                });
            });

            Array.prototype.forEach.call(bodyEl.querySelectorAll('[data-gp-revoke]'), function (btn) {
                btn.addEventListener('click', function () {
                    if (busyAction) {
                        return;
                    }
                    var pid = btn.getAttribute('data-gp-revoke');
                    busyAction = true;
                    btn.disabled = true;
                    apiFetch('/StreamFlix/GuestPasses/Revoke', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: pid })
                    }).then(function (res) {
                        busyAction = false;
                        if (res && Array.isArray(res.passes)) {
                            passes = res.passes;
                        }
                        if (spotlightInfo && spotlightInfo.pass && spotlightInfo.pass.id === pid) {
                            spotlightInfo = null;
                        }
                        var term = Number((res && res.terminatedSessions) || 0);
                        showToast(term > 0 ? ('Guest Pass deleted (' + term + ' active session' + (term === 1 ? '' : 's') + ' signed out).') : 'Guest Pass deleted.', 'info');
                        renderBody();
                    }).catch(function (err) {
                        busyAction = false;
                        btn.disabled = false;
                        showToast((err && err.message) || 'Could not revoke Guest Pass.', 'error');
                    });
                });
            });
        }

        apiFetch('/StreamFlix/GuestPasses')
            .then(function (res) {
                loading = false;
                passes = (res && Array.isArray(res.passes)) ? res.passes : [];
                eligibleProfiles = (res && Array.isArray(res.eligibleProfiles)) ? res.eligibleProfiles : [];
                renderBody();
            })
            .catch(function (err) {
                loading = false;
                if (!m.isClosed()) {
                    var bodyEl = m.modal.querySelector('#bfx-gp-body');
                    if (bodyEl) {
                        bodyEl.innerHTML = '<div class="streamflix-auth-alert streamflix-auth-alert-error">' + escapeHtml((err && err.message) || 'Administrator session required to manage Guest Passes.') + '</div>';
                    }
                }
            });
    }

    function openActiveDevicesModal() {
        var devices = [];
        var loading = true;
        var busyAction = false;

        var m = openModal(''
            + '<div class="bfx-modal-top">'
            + '  <div class="bfx-modal-top-title">'
            + '    <span class="bfx-modal-kicker">' + icon('shield') + ' <span>SESSION SECURITY</span></span>'
            + '    <h2>Active Devices</h2>'
            + '    <p class="streamflix-modal-text">Signed-in TVs, phones, browsers, and Guest Passes — sign out any individual device without logging out everyone else.</p>'
            + '  </div>'
            + '  <button type="button" class="streamflix-detail-close bfx-modal-close-inline" data-act="close" aria-label="Close">' + icon('close') + '</button>'
            + '</div>'
            + '<div id="bfx-dev-body"><div class="bfx-modal-loading"><div class="streamflix-spinner-ring"></div><span>Loading signed-in devices…</span></div></div>', {
            className: 'streamflix-modal-lg bfx-devices-modal'
        });

        m.modal.querySelector('[data-act="close"]').addEventListener('click', function () {
            m.close(false);
        });

        function resolveDeviceIconName(dev) {
            var hint = (String((dev && dev.deviceName) || '') + ' ' + String((dev && dev.appName) || '')).toLowerCase();
            if (/\b(tv|roku|chromecast|fire|webos|tizen|vidaa|shield|kodi|infuse|swiftfin)\b/.test(hint)) {
                return 'tv';
            }
            if (/\b(iphone|ipod|android|ios|mobile|phone|findroid|streamyfin)\b/.test(hint)) {
                return 'smartphone';
            }
            return 'laptop';
        }

        function fetchDevices() {
            loading = true;
            renderBody();
            var localDevId = getJellyfinDeviceInfo().deviceId || '';
            apiFetch('/StreamFlix/Devices?currentDeviceId=' + encodeURIComponent(localDevId))
                .then(function (res) {
                    loading = false;
                    devices = (res && Array.isArray(res.devices)) ? res.devices : [];
                    renderBody();
                })
                .catch(function (err) {
                    loading = false;
                    if (!m.isClosed()) {
                        var bodyEl = m.modal.querySelector('#bfx-dev-body');
                        if (bodyEl) {
                            bodyEl.innerHTML = '<div class="streamflix-auth-alert streamflix-auth-alert-error">' + escapeHtml((err && err.message) || 'Administrator session required to view active devices.') + '</div>';
                        }
                    }
                });
        }

        function renderBody() {
            if (m.isClosed()) {
                return;
            }
            var bodyEl = m.modal.querySelector('#bfx-dev-body');
            if (!bodyEl) {
                return;
            }
            if (loading) {
                bodyEl.innerHTML = '<div class="bfx-modal-loading"><div class="streamflix-spinner-ring"></div><span>Loading signed-in devices…</span></div>';
                return;
            }

            var liveCount = devices.filter(function (d) { return d && (d.isLive || d.nowPlaying); }).length;
            var summaryText = !devices.length
                ? 'No active device tokens found.'
                : (devices.length + ' signed-in ' + (devices.length === 1 ? 'device' : 'devices') + (liveCount > 0 ? ' · ' + liveCount + ' online now' : ''));

            var rowsHtml = '';
            if (!devices.length) {
                rowsHtml = '<div class="bfx-gp-empty">No signed-in devices are currently registered on this Jellyfin server.</div>';
            } else {
                rowsHtml = devices.map(function (d, idx) {
                    var icoName = resolveDeviceIconName(d);
                    var isLiveNow = Boolean(d.isLive || d.nowPlaying);
                    var pCol = sanitizeHexColor(d.profileColorHex, '#2b2b2b');
                    var relLast = formatRelativePast(d.lastActivityUtc);
                    var appLabel = d.appName || 'Jellyfin Client';
                    if (d.appVersion && String(appLabel).indexOf(d.appVersion) === -1) {
                        appLabel += ' ' + d.appVersion;
                    }
                    return ''
                        + '<div class="bfx-dev-row' + (d.isCurrentDevice ? ' is-current' : '') + '">'
                        + '  <div class="bfx-dev-ico' + (isLiveNow ? ' is-live' : '') + '">' + icon(icoName) + '</div>'
                        + '  <div class="bfx-dev-main">'
                        + '    <div class="bfx-dev-top">'
                        + '      <span class="bfx-dev-name">' + escapeHtml(d.deviceName || 'Unknown Device') + '</span>'
                        + (d.isCurrentDevice ? '<span class="bfx-dev-badge is-self">This Device</span>' : '')
                        + (d.nowPlaying
                            ? '<span class="bfx-dev-badge is-playing">' + icon('play') + '<span>' + escapeHtml(d.nowPlaying) + '</span></span>'
                            : (d.isLive ? '<span class="bfx-dev-badge is-live">Online</span>' : ''))
                        + (d.isGuestPass
                            ? '<span class="bfx-dev-badge is-guest">' + escapeHtml(d.guestPassLabel ? ('Guest · ' + d.guestPassLabel) : 'Guest Pass') + '</span>'
                            : '')
                        + (d.isAdminUser ? '<span class="bfx-dev-badge is-admin">Admin</span>' : '')
                        + '    </div>'
                        + '    <div class="bfx-dev-sub">'
                        + (d.profileName
                            ? '<span class="bfx-dev-prof"><span class="bfx-dev-prof-dot" style="background:' + escapeHtml(pCol) + ';">' + escapeHtml(d.profileEmoji || '🎬') + '</span>' + escapeHtml(d.profileName) + '</span><span>•</span>'
                            : (d.jellyfinUsername ? '<span>User: <strong>' + escapeHtml(d.jellyfinUsername) + '</strong></span><span>•</span>' : ''))
                        + '      <span>' + escapeHtml(appLabel) + '</span>'
                        + (relLast ? '<span>•</span><span>' + escapeHtml(relLast) + '</span>' : '')
                        + '    </div>'
                        + '  </div>'
                        + '  <div class="bfx-dev-actions">'
                        + '    <button type="button" class="streamflix-btn-danger bfx-btn-xs" data-dev-idx="' + idx + '">' + (d.isCurrentDevice ? 'Sign Out Here' : 'Sign Out') + '</button>'
                        + '  </div>'
                        + '</div>';
                }).join('');
            }

            bodyEl.innerHTML = ''
                + '<div class="bfx-dev-toolbar">'
                + '  <div class="bfx-dev-summary">' + escapeHtml(summaryText) + '</div>'
                + '  <div class="bfx-dev-toolbar-btns">'
                + '    <button type="button" class="streamflix-ghost-btn bfx-btn-xs" id="bfx-dev-refresh-btn">' + iconLabel('refresh', 'Refresh') + '</button>'
                + (devices.length > 0
                    ? '    <button type="button" class="streamflix-btn-danger bfx-btn-xs" id="bfx-dev-revoke-all-btn">Sign Out All Devices</button>'
                    : '')
                + '  </div>'
                + '</div>'
                + '<div class="bfx-dev-list">' + rowsHtml + '</div>';

            var refreshBtn = bodyEl.querySelector('#bfx-dev-refresh-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', function () {
                    if (!busyAction) {
                        fetchDevices();
                    }
                });
            }

            var revokeAllBtn = bodyEl.querySelector('#bfx-dev-revoke-all-btn');
            if (revokeAllBtn) {
                revokeAllBtn.addEventListener('click', function () {
                    if (busyAction) {
                        return;
                    }
                    confirmDialog({
                        title: 'Sign out all devices?',
                        message: 'Every TV, phone, browser, Guest Pass, and this device will immediately be signed out.',
                        confirmText: 'Sign Out All'
                    }).then(function (ok) {
                        if (!ok || busyAction) {
                            return;
                        }
                        busyAction = true;
                        revokeAllBtn.disabled = true;
                        apiFetch('/StreamFlix/Sessions/RevokeAll', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: '{}'
                        }).then(function () {
                            busyAction = false;
                            m.close(true);
                            showToast('All devices signed out.', 'info');
                            signOutHousehold();
                        }).catch(function (err) {
                            busyAction = false;
                            revokeAllBtn.disabled = false;
                            showToast((err && err.message) || 'Could not sign out all devices.', 'error');
                        });
                    });
                });
            }

            Array.prototype.forEach.call(bodyEl.querySelectorAll('[data-dev-idx]'), function (btn) {
                btn.addEventListener('click', function () {
                    if (busyAction) {
                        return;
                    }
                    var idx = parseInt(btn.getAttribute('data-dev-idx'), 10);
                    var target = devices[idx];
                    if (!target || !target.deviceId) {
                        return;
                    }
                    var executeRevoke = function () {
                        busyAction = true;
                        btn.disabled = true;
                        apiFetch('/StreamFlix/Devices/Revoke', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                deviceId: target.deviceId,
                                userId: target.userId || ''
                            })
                        }).then(function (res) {
                            busyAction = false;
                            if ((res && res.wasCurrentDevice) || target.isCurrentDevice) {
                                m.close(true);
                                showToast('Signed out this device.', 'info');
                                signOutHousehold();
                                return;
                            }
                            devices = devices.filter(function (item) {
                                if (!item) { return false; }
                                if (String(item.deviceId || '').toLowerCase() !== String(target.deviceId || '').toLowerCase()) {
                                    return true;
                                }
                                if (target.userId && item.userId && String(item.userId).toLowerCase() !== String(target.userId).toLowerCase()) {
                                    return true;
                                }
                                return false;
                            });
                            showToast('Signed out "' + (target.deviceName || 'device') + '".', 'info');
                            renderBody();
                        }).catch(function (err) {
                            busyAction = false;
                            btn.disabled = false;
                            showToast((err && err.message) || 'Could not sign out device.', 'error');
                        });
                    };

                    if (target.isCurrentDevice) {
                        confirmDialog({
                            title: 'Sign out this device?',
                            message: 'You are currently using "' + (target.deviceName || 'this device') + '". You will need to sign in again immediately.',
                            confirmText: 'Sign Out'
                        }).then(function (ok) {
                            if (ok) {
                                executeRevoke();
                            }
                        });
                    } else {
                        executeRevoke();
                    }
                });
            });
        }

        fetchDevices();
    }

    function openSeerrRequestModal(seerrItem) {
        if (!seerrItem || !seerrItem.tmdbId) {
            return;
        }
        var isTv = String(seerrItem.mediaType || '').toLowerCase() === 'tv';
        var tmdbId = Number(seerrItem.tmdbId);
        var activeProfId = (state.activeProfile && state.activeProfile.id) || '';
        var rawArt = seerrItem.backdropUrl || seerrItem.posterUrl || '';
        var artUrl = /^https:\/\//i.test(rawArt) ? rawArt : '';
        var rawVote = Number(seerrItem.rating || seerrItem.voteAverage || 0);
        var rating = rawVote > 0 ? rawVote.toFixed(1) : '';

        var seasons = [];
        var selectedSeasons = {};
        var loadingTv = isTv;
        var submitting = false;
        var errorMsg = '';

        var m = openModal('<div id="bfx-seerr-modal-root"></div>', {
            className: 'streamflix-modal-md bfx-seerr-modal'
        });

        function statusPillInfo(statusNum, customLabel, dlPct) {
            var st = Number(statusNum || 1);
            var hasDl = (typeof dlPct === 'number' && !isNaN(dlPct)) || /^downloading/i.test(String(customLabel || ''));
            if (hasDl && (st === 2 || st === 3)) {
                return {
                    cls: 'is-downloading',
                    text: customLabel || (typeof dlPct === 'number' && dlPct > 0 ? ('Downloading · ' + Math.round(dlPct) + '%') : 'Downloading')
                };
            }
            if (st === 5) { return { cls: 'is-available', text: customLabel || 'In Library' }; }
            if (st === 4) { return { cls: 'is-partial', text: customLabel || 'Partially Available' }; }
            if (st === 3) { return { cls: 'is-processing', text: customLabel || 'Processing' }; }
            if (st === 2) { return { cls: 'is-pending', text: customLabel || 'Requested' }; }
            return { cls: 'is-requestable', text: customLabel || 'Available to Request' };
        }

        function countSelectedSeasons() {
            return Object.keys(selectedSeasons).filter(function (k) { return Boolean(selectedSeasons[k]); }).map(function (k) { return parseInt(k, 10); }).filter(function (n) { return n > 0; });
        }

        function submitSeerrRequest() {
            if (submitting) {
                return;
            }
            var chosenSeasons = isTv ? countSelectedSeasons() : [];
            if (isTv && !chosenSeasons.length) {
                errorMsg = 'Select at least one season to request.';
                render();
                return;
            }
            submitting = true;
            errorMsg = '';
            render();

            apiFetch('/StreamFlix/Seerr/Request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tmdbId: tmdbId,
                    mediaType: isTv ? 'tv' : 'movie',
                    seasons: isTv ? chosenSeasons : undefined,
                    profileId: activeProfId
                })
            }).then(function (res) {
                submitting = false;
                var nextStatus = (res && res.mediaStatus) ? Number(res.mediaStatus) : 2;
                var nextLabel = (res && res.statusLabel) || 'Requested';
                seerrItem.mediaStatus = nextStatus;
                seerrItem.statusLabel = nextLabel;
                if (Array.isArray(state.seerrSearchResults)) {
                    state.seerrSearchResults.forEach(function (it) {
                        if (it && Number(it.tmdbId) === tmdbId && String(it.mediaType || '').toLowerCase() === (isTv ? 'tv' : 'movie')) {
                            it.mediaStatus = nextStatus;
                            it.statusLabel = nextLabel;
                        }
                    });
                }
                showToast((res && res.message) || ('Requested "' + (seerrItem.title || 'Title') + '"!'), 'success');
                m.close(true);
                if (state.searchQuery) {
                    renderCinemaHubContents();
                }
            }).catch(function (err) {
                submitting = false;
                errorMsg = (err && err.message) || 'Request failed. Please check Seerr configuration.';
                render();
            });
        }

        function render() {
            if (m.isClosed()) {
                return;
            }
            var root = m.modal.querySelector('#bfx-seerr-modal-root');
            if (!root) {
                return;
            }

            var dlNum = (typeof seerrItem.downloadProgress === 'number' && !isNaN(seerrItem.downloadProgress))
                ? Math.max(0, Math.min(100, Math.round(seerrItem.downloadProgress)))
                : null;
            var stInfo = statusPillInfo(seerrItem.mediaStatus, seerrItem.statusLabel, dlNum);
            var dlCardHtml = '';
            if (dlNum !== null || stInfo.cls === 'is-downloading') {
                var barWidth = dlNum !== null ? dlNum : 12;
                dlCardHtml = ''
                    + '<div class="bfx-seerr-dl-card">'
                    + '  <div class="bfx-seerr-dl-head">'
                    + '    <span>' + icon('download') + 'Downloading to Library</span>'
                    + (dlNum !== null ? '<span>' + dlNum + '%</span>' : '<span>Active</span>')
                    + '  </div>'
                    + '  <div class="bfx-seerr-dl-bar"><div class="bfx-seerr-dl-fill" style="width:' + barWidth + '%;"></div></div>'
                    + '</div>';
            }

            var seasonsSectionHtml = '';
            var canSubmit = false;
            var submitLabel = isTv ? 'Request Selected Seasons' : 'Request Movie';

            if (!isTv) {
                var mSt = Number(seerrItem.mediaStatus || 1);
                canSubmit = mSt === 1;
                if (mSt !== 1 && !dlCardHtml) {
                    seasonsSectionHtml = '<div class="bfx-seerr-status-note">This movie is currently <strong>' + escapeHtml(stInfo.text) + '</strong> in Seerr.</div>';
                }
            } else if (loadingTv) {
                seasonsSectionHtml = '<div class="bfx-modal-loading" style="padding:20px 0;"><div class="streamflix-spinner-ring" style="width:32px;height:32px;border-width:3px;"></div><span>Loading seasons from Seerr…</span></div>';
            } else if (!seasons.length) {
                canSubmit = Number(seerrItem.mediaStatus || 1) === 1 || Number(seerrItem.mediaStatus || 1) === 4;
                seasonsSectionHtml = '<div class="bfx-seerr-status-note">No individual season breakdown returned by Seerr.</div>';
            } else {
                var requestableCount = 0;
                var rowsHtml = seasons.map(function (s) {
                    var sNum = Number(s.seasonNumber || 0);
                    var sSt = Number(s.status || 1);
                    var isReq = sSt === 1 || sSt === 4;
                    if (isReq) {
                        requestableCount += 1;
                    }
                    var sBadge = statusPillInfo(sSt, s.statusLabel, null);
                    var checked = Boolean(selectedSeasons[sNum]);
                    var epCnt = s.episodeCount ? (s.episodeCount + ' ep' + (s.episodeCount === 1 ? '' : 's')) : '';
                    return ''
                        + '<label class="bfx-seerr-season-row' + (isReq ? ' is-selectable' : ' is-locked') + '">'
                        + '  <input type="checkbox" data-seerr-season="' + sNum + '"' + (checked ? ' checked' : '') + (isReq ? '' : ' disabled') + ' />'
                        + '  <span class="bfx-seerr-season-name">' + escapeHtml(s.name || ('Season ' + sNum)) + '</span>'
                        + (epCnt ? '<span class="bfx-seerr-season-eps">' + escapeHtml(epCnt) + '</span>' : '')
                        + '  <span class="bfx-seerr-badge ' + sBadge.cls + '">' + escapeHtml(sBadge.text) + '</span>'
                        + '</label>';
                }).join('');

                var selNums = countSelectedSeasons();
                canSubmit = selNums.length > 0;
                if (selNums.length > 0) {
                    submitLabel = 'Request ' + selNums.length + ' Season' + (selNums.length === 1 ? '' : 's');
                }
                seasonsSectionHtml = ''
                    + '<div class="bfx-seerr-seasons-head">'
                    + '  <span>Select Seasons to Request</span>'
                    + (requestableCount > 1 ? '<button type="button" class="streamflix-ghost-btn bfx-btn-xs" id="bfx-seerr-toggle-all">' + (selNums.length === requestableCount ? 'Clear Selection' : 'Select All') + '</button>' : '')
                    + '</div>'
                    + '<div class="bfx-seerr-seasons">' + rowsHtml + '</div>';
            }

            root.innerHTML = ''
                + '<div class="bfx-seerr-hero">'
                + (artUrl ? '<img class="bfx-seerr-hero-img" src="' + escapeHtml(artUrl) + '" alt="" referrerpolicy="no-referrer" data-bfx-img="fade" />' : '')
                + '  <div class="bfx-seerr-hero-scrim"></div>'
                + '  <button type="button" class="streamflix-detail-close" data-act="close" aria-label="Close">' + icon('close') + '</button>'
                + '  <div class="bfx-seerr-hero-body">'
                + '    <div class="bfx-seerr-badges-row">'
                + '      <span class="bfx-seerr-type">' + (isTv ? 'SERIES' : 'MOVIE') + '</span>'
                + '      <span class="bfx-seerr-badge ' + stInfo.cls + '">' + escapeHtml(stInfo.text) + '</span>'
                + '    </div>'
                + '    <h2 class="bfx-seerr-title">' + escapeHtml(seerrItem.title || 'Untitled') + '</h2>'
                + '    <div class="streamflix-hero-meta-row">'
                + (rating ? '<span class="streamflix-hero-rating">' + icon('star') + escapeHtml(rating) + '</span>' : '')
                + (seerrItem.year ? '<span>' + escapeHtml(String(seerrItem.year)) + '</span>' : '')
                + '      <span>TMDB #' + tmdbId + '</span>'
                + '    </div>'
                + '  </div>'
                + '</div>'
                + '<div class="bfx-seerr-body">'
                + (errorMsg ? '<div class="streamflix-auth-alert streamflix-auth-alert-error" style="margin-bottom:12px;">' + escapeHtml(errorMsg) + '</div>' : '')
                + '  <p class="bfx-seerr-modal-overview">' + escapeHtml(seerrItem.overview || 'No synopsis available on TMDB.') + '</p>'
                + dlCardHtml
                + seasonsSectionHtml
                + '  <div class="streamflix-modal-actions streamflix-modal-actions-end" style="margin-top:18px; flex-wrap:wrap;">'
                + '    <button type="button" class="streamflix-ghost-btn" id="bfx-seerr-view-all-reqs" style="margin-right:auto;">' + iconLabel('clock', 'All Requests') + '</button>'
                + '    <button type="button" class="streamflix-ghost-btn" data-act="close">Close</button>'
                + (seerrItem.jellyfinMediaId
                    ? '    <button type="button" class="streamflix-btn-primary" id="bfx-seerr-open-jf">' + iconLabel('play', 'Open in Library') + '</button>'
                    : (canSubmit || (!loadingTv && Number(seerrItem.mediaStatus || 1) === 1)
                        ? '    <button type="button" class="streamflix-btn-primary" id="bfx-seerr-submit-btn"' + ((!canSubmit || submitting) ? ' disabled' : '') + '>' + (submitting ? 'Submitting…' : iconLabel('plus', submitLabel)) + '</button>'
                        : ''))
                + '  </div>'
                + '</div>';

            hydrateCompleteImages(root);
            Array.prototype.forEach.call(root.querySelectorAll('[data-act="close"]'), function (b) {
                b.addEventListener('click', function () { m.close(false); });
            });

            var allReqsBtn = root.querySelector('#bfx-seerr-view-all-reqs');
            if (allReqsBtn) {
                allReqsBtn.addEventListener('click', function () {
                    m.close(false);
                    openSeerrRequestsModal();
                });
            }

            var openJfBtn = root.querySelector('#bfx-seerr-open-jf');
            if (openJfBtn) {
                openJfBtn.addEventListener('click', function () {
                    var jfId = seerrItem.jellyfinMediaId;
                    m.close(true);
                    openHeroDetailModalById(jfId);
                });
            }

            Array.prototype.forEach.call(root.querySelectorAll('[data-seerr-season]'), function (cb) {
                cb.addEventListener('change', function () {
                    var sNum = parseInt(cb.getAttribute('data-seerr-season'), 10);
                    if (sNum > 0) {
                        selectedSeasons[sNum] = Boolean(cb.checked);
                        render();
                    }
                });
            });

            var toggleAllBtn = root.querySelector('#bfx-seerr-toggle-all');
            if (toggleAllBtn) {
                toggleAllBtn.addEventListener('click', function () {
                    var reqSeasons = seasons.filter(function (s) { return Number(s.status || 1) === 1 || Number(s.status || 1) === 4; });
                    var allSelected = countSelectedSeasons().length === reqSeasons.length;
                    selectedSeasons = {};
                    if (!allSelected) {
                        reqSeasons.forEach(function (s) {
                            if (Number(s.seasonNumber) > 0) {
                                selectedSeasons[Number(s.seasonNumber)] = true;
                            }
                        });
                    }
                    render();
                });
            }

            var submitBtn = root.querySelector('#bfx-seerr-submit-btn');
            if (submitBtn) {
                submitBtn.addEventListener('click', submitSeerrRequest);
            }
        }

        render();

        if (isTv) {
            apiFetch('/StreamFlix/Seerr/Tv/' + encodeURIComponent(String(tmdbId)) + '?profileId=' + encodeURIComponent(activeProfId))
                .then(function (res) {
                    loadingTv = false;
                    var rawSeasons = (res && Array.isArray(res.seasons)) ? res.seasons : [];
                    seasons = rawSeasons.filter(function (s) { return s && Number(s.seasonNumber) >= 1; });
                    seasons.forEach(function (s) {
                        var st = Number(s.status || 1);
                        if (st === 1 || st === 4) {
                            selectedSeasons[Number(s.seasonNumber)] = true;
                        }
                    });
                    if (res && res.mediaStatus) {
                        seerrItem.mediaStatus = res.mediaStatus;
                    }
                    if (res && res.statusLabel) {
                        seerrItem.statusLabel = res.statusLabel;
                    }
                    if (res && typeof res.downloadProgress === 'number') {
                        seerrItem.downloadProgress = res.downloadProgress;
                    }
                    if (res && res.overview && !seerrItem.overview) {
                        seerrItem.overview = res.overview;
                    }
                    if (res && res.backdropUrl && !artUrl && /^https:\/\//i.test(res.backdropUrl)) {
                        artUrl = res.backdropUrl;
                    }
                    render();
                })
                .catch(function (err) {
                    loadingTv = false;
                    errorMsg = (err && err.message) || 'Could not load season details from Seerr.';
                    render();
                });
        }
    }

    function openSeerrRequestsModal() {
        if (!isCurrentProfileSeerrAllowed()) {
            showToast('Seerr media requests are not enabled for this profile.', 'info');
            return;
        }
        var activeProfId = (state.activeProfile && state.activeProfile.id) || '';
        var requests = [];
        var filterKey = 'all';
        var loading = true;

        var m = openModal(''
            + '<div class="bfx-modal-top">'
            + '  <div class="bfx-modal-top-title">'
            + '    <span class="bfx-modal-kicker">' + icon('sparkle') + ' <span>SEERR TRACKER</span></span>'
            + '    <h2>Media Requests</h2>'
            + '    <p class="streamflix-modal-text">Track requested movies and TV seasons from queue to download to ready-to-watch.</p>'
            + '  </div>'
            + '  <button type="button" class="streamflix-detail-close bfx-modal-close-inline" data-act="close" aria-label="Close">' + icon('close') + '</button>'
            + '</div>'
            + '<div id="bfx-seerr-reqs-body"><div class="bfx-modal-loading"><div class="streamflix-spinner-ring"></div><span>Loading recent requests from Seerr…</span></div></div>', {
            className: 'streamflix-modal-lg bfx-seerr-reqs-modal'
        });

        m.modal.querySelector('[data-act="close"]').addEventListener('click', function () {
            m.close(false);
        });

        function badgeMeta(r) {
            var k = String((r && r.statusKey) || '').toLowerCase();
            if (k === 'downloading') {
                return { cls: 'is-downloading', ico: 'download', label: r.statusLabel || 'Downloading' };
            }
            if (k === 'available') {
                return { cls: 'is-available', ico: 'check', label: r.statusLabel || 'Available' };
            }
            if (k === 'partial') {
                return { cls: 'is-partial', ico: 'check', label: r.statusLabel || 'Partially Available' };
            }
            if (k === 'declined') {
                return { cls: 'is-declined', ico: 'close', label: r.statusLabel || 'Declined' };
            }
            if (k === 'processing' || k === 'approved') {
                return { cls: 'is-processing', ico: 'clock', label: r.statusLabel || 'Processing' };
            }
            return { cls: 'is-pending', ico: 'clock', label: (r && r.statusLabel) || 'Pending Approval' };
        }

        function resolveLocalLibraryId(r) {
            if (!r) {
                return '';
            }
            var jfId = typeof r.jellyfinMediaId === 'string' ? r.jellyfinMediaId.trim() : '';
            if (jfId && /^[a-f0-9-]{16,40}$/i.test(jfId)) {
                return jfId;
            }
            var stKey = String(r.statusKey || '').toLowerCase();
            if (stKey !== 'available' && stKey !== 'partial' && Number(r.mediaStatus || 0) < 4) {
                return '';
            }
            var d = state.hubData || {};
            var pool = r.mediaType === 'tv' ? (d.allSeries || []) : (d.allMovies || []);
            var targetTitle = String(r.title || '').trim().toLowerCase();
            if (!targetTitle) {
                return '';
            }
            for (var i = 0; i < pool.length; i++) {
                var it = pool[i];
                if (!it || !it.Id) {
                    continue;
                }
                if (String(it.Name || '').trim().toLowerCase() === targetTitle) {
                    if (!r.year || !it.ProductionYear || String(it.ProductionYear) === String(r.year)) {
                        return it.Id;
                    }
                }
            }
            return '';
        }

        function fetchRequests() {
            loading = true;
            renderBody();
            apiFetch('/StreamFlix/Seerr/Requests?profileId=' + encodeURIComponent(activeProfId))
                .then(function (res) {
                    loading = false;
                    requests = (res && Array.isArray(res.requests)) ? res.requests : [];
                    renderBody();
                })
                .catch(function (err) {
                    loading = false;
                    if (!m.isClosed()) {
                        var bodyEl = m.modal.querySelector('#bfx-seerr-reqs-body');
                        if (bodyEl) {
                            bodyEl.innerHTML = '<div class="streamflix-auth-alert streamflix-auth-alert-error">' + escapeHtml((err && err.message) || 'Could not load requests from Seerr.') + '</div>';
                        }
                    }
                });
        }

        function renderBody() {
            if (m.isClosed()) {
                return;
            }
            var bodyEl = m.modal.querySelector('#bfx-seerr-reqs-body');
            if (!bodyEl) {
                return;
            }
            if (loading) {
                bodyEl.innerHTML = '<div class="bfx-modal-loading"><div class="streamflix-spinner-ring"></div><span>Loading recent requests from Seerr…</span></div>';
                return;
            }

            var inProgressList = requests.filter(function (r) {
                var k = String((r && r.statusKey) || '').toLowerCase();
                return k === 'pending' || k === 'approved' || k === 'processing' || k === 'downloading';
            });
            var availableList = requests.filter(function (r) {
                var k = String((r && r.statusKey) || '').toLowerCase();
                return k === 'available' || k === 'partial';
            });
            var visible = filterKey === 'active'
                ? inProgressList
                : (filterKey === 'available' ? availableList : requests);

            var listHtml = '';
            if (!requests.length) {
                listHtml = '<div class="bfx-gp-empty">No media requests yet. Search for any movie or show in StreamFlix Search to request it!</div>';
            } else if (!visible.length) {
                listHtml = '<div class="bfx-gp-empty">No requests match this filter right now.</div>';
            } else {
                listHtml = visible.map(function (r, vIdx) {
                    var b = badgeMeta(r);
                    var posterUrl = (typeof r.posterUrl === 'string' && /^https:\/\//i.test(r.posterUrl.trim())) ? r.posterUrl.trim() : '';
                    var isTvReq = String(r.mediaType || '').toLowerCase() === 'tv';
                    var seasonsArr = Array.isArray(r.seasons) ? r.seasons.filter(function (n) { return Number(n) > 0; }) : [];
                    var seasonsText = (isTvReq && seasonsArr.length)
                        ? ('Seasons: ' + seasonsArr.map(function (n) { return 'S' + n; }).join(', '))
                        : '';
                    var relAdded = formatRelativePast(r.createdAt);
                    var dlPct = (typeof r.downloadProgress === 'number' && !isNaN(r.downloadProgress))
                        ? Math.max(0, Math.min(100, Math.round(r.downloadProgress)))
                        : null;
                    var jfId = resolveLocalLibraryId(r);

                    return ''
                        + '<div class="bfx-req-row">'
                        + '  <div class="bfx-req-poster">'
                        + icon('film')
                        + (posterUrl ? '<img loading="lazy" src="' + escapeHtml(posterUrl) + '" referrerpolicy="no-referrer" alt="" data-bfx-img="fade" />' : '')
                        + '  </div>'
                        + '  <div class="bfx-req-main">'
                        + '    <div class="bfx-req-top">'
                        + '      <span class="bfx-req-title">' + escapeHtml(r.title || 'Requested Title') + '</span>'
                        + '      <span class="bfx-seerr-type">' + (isTvReq ? 'SERIES' : 'MOVIE') + '</span>'
                        + '      <span class="bfx-seerr-badge ' + b.cls + '">' + icon(b.ico) + '<span>' + escapeHtml(b.label) + '</span></span>'
                        + '    </div>'
                        + '    <div class="bfx-req-sub">'
                        + (r.year ? '<span>' + escapeHtml(String(r.year)) + '</span>' : '')
                        + (r.year && (seasonsText || relAdded) ? '<span>•</span>' : '')
                        + (seasonsText ? '<span>' + escapeHtml(seasonsText) + '</span>' : '')
                        + (seasonsText && relAdded ? '<span>•</span>' : '')
                        + (relAdded ? '<span>Requested ' + escapeHtml(relAdded) + '</span>' : '')
                        + '    </div>'
                        + ((dlPct !== null || b.cls === 'is-downloading')
                            ? '<div class="bfx-req-dl-wrap"><div class="bfx-seerr-dl-bar"><div class="bfx-seerr-dl-fill" style="width:' + (dlPct !== null ? dlPct : 12) + '%;"></div></div></div>'
                            : '')
                        + '  </div>'
                        + '  <div class="bfx-req-actions">'
                        + (jfId
                            ? '    <button type="button" class="streamflix-btn-primary bfx-btn-xs" data-req-open-jf="' + escapeHtml(jfId) + '">' + iconLabel('play', 'Open') + '</button>'
                            : (r.tmdbId > 0
                                ? '    <button type="button" class="streamflix-ghost-btn bfx-btn-xs" data-req-inspect="' + vIdx + '">' + (isTvReq ? 'Seasons' : 'Details') + '</button>'
                                : ''))
                        + '  </div>'
                        + '</div>';
                }).join('');
            }

            bodyEl.innerHTML = ''
                + '<div class="bfx-req-toolbar">'
                + '  <div class="bfx-req-filters">'
                + '    <button type="button" class="bfx-req-filter-pill' + (filterKey === 'all' ? ' is-active' : '') + '" data-req-filter="all">All (' + requests.length + ')</button>'
                + '    <button type="button" class="bfx-req-filter-pill' + (filterKey === 'active' ? ' is-active' : '') + '" data-req-filter="active">In Progress (' + inProgressList.length + ')</button>'
                + '    <button type="button" class="bfx-req-filter-pill' + (filterKey === 'available' ? ' is-active' : '') + '" data-req-filter="available">Available (' + availableList.length + ')</button>'
                + '  </div>'
                + '  <button type="button" class="streamflix-ghost-btn bfx-btn-xs" id="bfx-req-refresh-btn">' + iconLabel('refresh', 'Refresh') + '</button>'
                + '</div>'
                + '<div class="bfx-req-list">' + listHtml + '</div>';

            hydrateCompleteImages(bodyEl);

            Array.prototype.forEach.call(bodyEl.querySelectorAll('[data-req-filter]'), function (pill) {
                pill.addEventListener('click', function () {
                    filterKey = pill.getAttribute('data-req-filter') || 'all';
                    renderBody();
                });
            });

            var refreshBtn = bodyEl.querySelector('#bfx-req-refresh-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', fetchRequests);
            }

            Array.prototype.forEach.call(bodyEl.querySelectorAll('[data-req-open-jf]'), function (btn) {
                btn.addEventListener('click', function () {
                    var jfId = btn.getAttribute('data-req-open-jf');
                    if (jfId) {
                        m.close(true);
                        openHeroDetailModalById(jfId);
                    }
                });
            });

            Array.prototype.forEach.call(bodyEl.querySelectorAll('[data-req-inspect]'), function (btn) {
                btn.addEventListener('click', function () {
                    var idx = parseInt(btn.getAttribute('data-req-inspect'), 10);
                    var r = visible[idx];
                    if (r && r.tmdbId) {
                        m.close(false);
                        openSeerrRequestModal({
                            tmdbId: r.tmdbId,
                            mediaType: r.mediaType,
                            title: r.title,
                            year: r.year,
                            posterUrl: r.posterUrl,
                            backdropUrl: r.backdropUrl,
                            mediaStatus: r.mediaStatus,
                            statusLabel: r.statusLabel,
                            downloadProgress: r.downloadProgress,
                            jellyfinMediaId: r.jellyfinMediaId
                        });
                    }
                });
            });
        }

        fetchRequests();
    }

    function enhanceLibraryListPages() {
        try {
            var h = (window.location.hash || '').toLowerCase();
            var isMoviesRoute = h.indexOf('#/movies') === 0;
            var isTvRoute = h.indexOf('#/tv') === 0;
            var isListRoute = h.indexOf('#/list') === 0;

            var existingFallback = document.getElementById('streamflix-library-page-fallback');
            if (!isMoviesRoute && !isTvRoute && !isListRoute) {
                if (existingFallback && existingFallback.parentNode) {
                    existingFallback.parentNode.removeChild(existingFallback);
                }
                return;
            }

            if (isVideoPlayerActive() || document.getElementById('streamflix-overlay-root')) {
                return;
            }

            // Ensure Cinema Hub data is loaded so we have allMovies, allSeries, and collectionsItems
            var auth = getJellyfinAuthContext();
            if (auth.userId && auth.token && !state.hubData.loaded && !state.hubData.loading) {
                loadCinemaHubData(true);
                return;
            }
            if (!state.hubData.loaded) {
                return;
            }

            var activePage = document.querySelector('#moviesPage:not(.hide), #tvRecommendedPage:not(.hide), #listPage:not(.hide), .page.libraryPage:not(.hide), .page:not(.hide)');
            var nativeCards = activePage
                ? activePage.querySelectorAll('.itemsContainer .card[data-id]')
                : document.querySelectorAll('.mainAnimatedPages .itemsContainer .card[data-id]');

            if (nativeCards && nativeCards.length > 0) {
                if (existingFallback && existingFallback.parentNode) {
                    existingFallback.parentNode.removeChild(existingFallback);
                }
                return;
            }

            // Hide any "Nothing here." (.noItemsMessage) on the library page
            var noItemsEls = document.querySelectorAll('.noItemsMessage');
            for (var n = 0; n < noItemsEls.length; n++) {
                noItemsEls[n].style.setProperty('display', 'none', 'important');
            }

            var d = state.hubData;
            var itemsToRender = [];
            var sectionTitle = '';
            var extraRowsHtml = '';

            if (isMoviesRoute) {
                itemsToRender = d.allMovies || [];
                sectionTitle = rowTitle('Movies', itemsToRender.length);
                extraRowsHtml = buildGenreCollectionRowsHtml(itemsToRender);
            } else if (isTvRoute) {
                itemsToRender = d.allSeries || [];
                sectionTitle = rowTitle('Shows', itemsToRender.length);
                extraRowsHtml = buildGenreCollectionRowsHtml(itemsToRender);
            } else if (isListRoute) {
                if (h.indexOf('collectiontype=boxsets') !== -1 || d.collectionsItems.length > 0) {
                    itemsToRender = d.collectionsItems || [];
                    sectionTitle = rowTitle('Collections', itemsToRender.length);
                    extraRowsHtml = buildGenreCollectionRowsHtml((d.allMovies || []).concat(d.allSeries || []));
                } else {
                    itemsToRender = (d.allMovies || []).concat(d.allSeries || []);
                    sectionTitle = rowTitle('Library', itemsToRender.length);
                }
            }

            var sig = h + ':' + itemsToRender.length + ':' + (d.collectionsItems ? d.collectionsItems.length : 0);
            if (existingFallback && existingFallback.getAttribute('data-sig') === sig) {
                return;
            }

            var host = activePage || document.querySelector('.mainAnimatedPages') || document.body;
            if (!existingFallback) {
                existingFallback = document.createElement('div');
                existingFallback.id = 'streamflix-library-page-fallback';
                existingFallback.style.cssText = 'padding: 78px 0 48px 0; min-height: 70vh; position: relative; z-index: 5;';
                host.appendChild(existingFallback);
            } else if (existingFallback.parentNode !== host) {
                host.appendChild(existingFallback);
            }

            existingFallback.setAttribute('data-sig', sig);
            existingFallback.innerHTML = ''
                + (itemsToRender.length > 0 ? buildGridSectionHtml('lib-fallback-grid', sectionTitle, itemsToRender) : '')
                + extraRowsHtml;

            bindInteractiveCardsInContainer(existingFallback, itemsToRender, null);
        } catch (e) {}
    }
