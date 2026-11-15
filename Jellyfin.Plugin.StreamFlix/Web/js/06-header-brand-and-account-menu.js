/* StreamFlix Client (06/14) — Custom Brand Wordmark, Quick Connect & Account Menu */
    /* ----------------------------------------------------------------------
       5. Merged Top-Right Profile & Account Dropdown Menu + STREAMFLIX Brand
       ---------------------------------------------------------------------- */
    function isAdminConfigRoute() {
        var h = (window.location.hash || '').toLowerCase();
        return h.indexOf('configurationpage') !== -1
            || h.indexOf('dashboard') !== -1;
    }

    function setCinemaHubEnabled(nextEnabled, silent) {
        var enabled = Boolean(nextEnabled);
        state.cinemaHubEnabled = enabled;
        saveJson(CINEMA_HUB_PREF_KEY, enabled);
        if (document.body) {
            document.body.classList.toggle('bfx-classic-home', !enabled);
        }
        var existingHub = document.getElementById('streamflix-cinema-hub');
        if (!enabled && existingHub && existingHub.parentNode) {
            existingHub.parentNode.removeChild(existingHub);
            document.body.classList.remove('streamflix-hub-filtered', 'streamflix-hub-active');
        } else if (enabled && isOnHomeRoute()) {
            ensureCinemaHubMounted();
        }
        if (!silent) {
            showToast(getBrandName() + ' Home ' + (enabled ? 'enabled' : 'disabled') + '.', 'info');
        }
        return enabled;
    }

    function hideRedundantJellyfinAvatarIcon() {
        try {
            var adminRoute = isAdminConfigRoute();
            if (document.body) {
                document.body.classList.toggle('bfx-admin-route', adminRoute);
                document.body.classList.toggle('bfx-classic-home', state.cinemaHubEnabled === false);
            }

            // Tag native Jellyfin top-left hamburger / drawer buttons so CSS hides them cleanly on StreamFlix views
            // while keeping them functional on Dashboard / Classic Jellyfin routes.
            var drawerSelectors = document.querySelectorAll(
                '.skinHeader:not(.osdHeader) .mainDrawerButton, '
                + '.skinHeader:not(.osdHeader) .barsMenuButton, '
                + '.skinHeader:not(.osdHeader) .headerMenuButton, '
                + '.skinHeader:not(.osdHeader) .material-icons.menu, '
                + '.MuiToolbar-root [data-testid="MenuIcon"], '
                + '.MuiToolbar-root button[title="Menu"], '
                + '.MuiToolbar-root button[aria-label="Menu"], '
                + '.MuiToolbar-root button[aria-label="Open navigation"], '
                + '.MuiToolbar-root button[aria-label="open drawer"]'
            );
            for (var d = 0; d < drawerSelectors.length; d++) {
                var dNode = drawerSelectors[d];
                var dBtn = dNode.closest ? (dNode.closest('button, a, [role="button"]') || dNode) : dNode;
                if (
                    dBtn
                    && dBtn.id !== 'streamflix-header-profile-btn'
                    && dBtn.getAttribute('data-streamflix-corner-brand') !== 'true'
                    && !(dBtn.closest && dBtn.closest('#streamflix-account-dropdown, #streamflix-overlay-root, .osdHeader'))
                ) {
                    if (dBtn.getAttribute('data-bfx-drawer-btn') !== '1') {
                        dBtn.setAttribute('data-bfx-drawer-btn', '1');
                    }
                }
            }

            var redundant = document.querySelectorAll(
                '.MuiToolbar-root .MuiAvatar-root, '
                + '.skinHeader .headerUserButton, '
                + '.skinHeader .headerSearchButton, '
                + '.skinHeader .headerTabs, '
                + '.skinHeader .sectionTabs, '
                + '.MuiToolbar-root a[href*="mypreferencesmenu"], '
                + '.skinHeader a[href*="mypreferencesmenu"], '
                + '.MuiToolbar-root a[href*="search"], '
                + '.skinHeader a[href*="search"], '
                + '.MuiToolbar-root button[title="Search"], '
                + '.MuiToolbar-root button[aria-label="Search"], '
                + '.skinHeader button[title="Search"], '
                + '.skinHeader button[aria-label="Search"], '
                + '.MuiToolbar-root [data-testid="SearchIcon"], '
                + '.MuiToolbar-root a[href*="tab="], '
                + '.MuiToolbar-root a[href*="#/movies"], '
                + '.MuiToolbar-root a[href*="#/tv"], '
                + '.MuiToolbar-root a[href*="#/list"], '
                + '.MuiToolbar-root a[href*="#/boxsets"], '
                + '.MuiToolbar-root button[aria-controls="user-views-menu"], '
                + '.MuiToolbar-root .MuiStack-root > :not(:first-child):not([data-streamflix-corner-brand="true"])'
            );
            for (var i = 0; i < redundant.length; i++) {
                var el = redundant[i];
                if (el.getAttribute && el.getAttribute('data-streamflix-corner-brand') === 'true') {
                    continue;
                }
                if (el.classList && (el.classList.contains('headerTabs') || el.classList.contains('sectionTabs'))) {
                    el.style.setProperty('display', 'none', 'important');
                    continue;
                }
                var btn = el.closest ? (el.closest('button') || el.closest('a') || el) : el;
                if (btn && btn.id !== 'streamflix-header-profile-btn' && btn.getAttribute('data-streamflix-corner-brand') !== 'true') {
                    btn.style.setProperty('display', 'none', 'important');
                }
            }
        } catch (e) {}
    }

    function isVideoPlayerActive() {
        var h = (window.location.hash || '').toLowerCase();
        if (h.indexOf('#/video') === 0 || h.indexOf('#!/video') === 0) {
            return true;
        }
        if (document.querySelector('#videoOsdPage:not(.hide), .videoPlayerContainer, video.htmlvideoplayer, .htmlvideoplayer')) {
            return true;
        }
        return false;
    }

    function neutralizeConflictingBrandingCss() {
        try {
            // 1. Only neutralize legacy JellyFlix Custom CSS in #cssBranding if it does NOT contain our STREAMFLIX stylesheet.
            var brandingStyle = document.getElementById('cssBranding');
            if (brandingStyle && brandingStyle.textContent) {
                var bTxt = brandingStyle.textContent;
                if (bTxt.toLowerCase().indexOf('jellyflix') !== -1 && bTxt.indexOf('STREAMFLIX') === -1) {
                    brandingStyle.textContent = '';
                }
            }
            var allStyles = document.querySelectorAll('style, link[rel="stylesheet"]');
            for (var i = 0; i < allStyles.length; i++) {
                var el = allStyles[i];
                var href = (el.getAttribute && el.getAttribute('href')) || '';
                var txt = el.textContent || '';
                if (href.toLowerCase().indexOf('jellyflix') !== -1
                    || (txt.toLowerCase().indexOf('jellyflix') !== -1 && txt.indexOf('STREAMFLIX') === -1)) {
                    if (el.tagName === 'STYLE') {
                        el.textContent = '';
                    } else if (el.parentNode) {
                        el.parentNode.removeChild(el);
                    }
                }
            }

            // 2. Ensure our stylesheet is present, cache-busted by assetVersion, and placed at the end of <head> so it wins the CSS cascade
            var assetVer = (state.config && state.config.assetVersion) || VERSION;
            var wantedLinkId = 'streamflix-live-styles-' + String(assetVer).replace(/[^a-zA-Z0-9_.-]/g, '_');
            if (document.head && !document.getElementById(wantedLinkId)) {
                Array.prototype.forEach.call(document.querySelectorAll('link[id^="streamflix-live-styles-"]'), function (oldLink) {
                    if (oldLink.parentNode) {
                        oldLink.parentNode.removeChild(oldLink);
                    }
                });
                var liveLink = document.createElement('link');
                liveLink.id = wantedLinkId;
                liveLink.rel = 'stylesheet';
                liveLink.href = '/StreamFlix/ClientStyles?v=' + encodeURIComponent(assetVer);
                document.head.appendChild(liveLink);
            }
        } catch (e) {}
    }

    function enhanceItemDetailPage() {
        try {
            if (isVideoPlayerActive()) {
                document.body.classList.remove('streamflix-on-details-page');
                return;
            }
            var h = (window.location.hash || '');
            var detailPage = document.querySelector('#itemDetailPage:not(.hide)');
            var onDetails = h.indexOf('details') !== -1 || Boolean(detailPage);
            document.body.classList.toggle('streamflix-on-details-page', onDetails);
            if (!onDetails) {
                return;
            }

            if (detailPage && detailPage.classList.contains('noBackdrop')) {
                detailPage.classList.remove('noBackdrop');
            }

            var idMatch = h.match(/[?&]id=([a-f0-9-]+)/i);
            var itemId = idMatch ? idMatch[1] : null;

            // Inject top-right '✕' close button inside #itemDetailPage so it behaves identically to 'The Devil Wears Prada 2' card
            if (detailPage && !document.getElementById('streamflix-detail-page-close')) {
                var closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.id = 'streamflix-detail-page-close';
                closeBtn.className = 'streamflix-detail-close';
                closeBtn.title = 'Close';
                closeBtn.innerHTML = icon('close');
                closeBtn.addEventListener('click', function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    if (window.history.length > 1) {
                        window.history.back();
                    } else {
                        window.location.hash = '#/home';
                    }
                });
                detailPage.appendChild(closeBtn);
            }

            // Ensure high-res widescreen backdrop (including Series/Episode fallback!) is always set on #itemBackdrop
            var backdropEl = document.getElementById('itemBackdrop');
            if (backdropEl && itemId && backdropEl.getAttribute('data-streamflix-item-id') !== itemId) {
                backdropEl.setAttribute('data-streamflix-item-id', itemId);
                backdropEl.classList.remove('noBackdrop');
                fetchFullItemDetails(itemId).then(function (fullItem) {
                    if (!fullItem) {
                        return;
                    }
                    var bestBg = safeCssUrl(getItemBackdropUrl(fullItem, 1920));
                    var curBackdropEl = document.getElementById('itemBackdrop');
                    if (curBackdropEl && bestBg) {
                        curBackdropEl.style.backgroundImage = 'url("' + bestBg + '")';
                        curBackdropEl.classList.remove('noBackdrop');
                    }
                }).catch(function () {
                    var fallbackBg = safeCssUrl('/Items/' + encodeURIComponent(itemId) + '/Images/Backdrop/0?maxWidth=1920&quality=90');
                    if (backdropEl && fallbackBg) {
                        backdropEl.style.backgroundImage = 'url("' + fallbackBg + '")';
                    }
                });
            }

            // Remove any duplicate .streamflix-play-label spans from earlier versions
            if (detailPage) {
                var dupLabels = detailPage.querySelectorAll('.streamflix-play-label');
                for (var i = 0; i < dupLabels.length; i++) {
                    if (dupLabels[i].parentNode) {
                        dupLabels[i].parentNode.removeChild(dupLabels[i]);
                    }
                }
            }
        } catch (e) {}
    }

    /* Jellyfin Quick Connect: authorize another device (TV, phone, app) with the code it displays */
    function openQuickConnectModal() {
        var active = state.activeProfile || {};
        var len = 6;
        var boxesHtml = '';
        for (var i = 0; i < len; i++) {
            boxesHtml += '<span class="streamflix-pin-box"></span>';
        }
        var m = openModal(''
            + '<div class="streamflix-qc-badge">' + icon('tv') + '</div>'
            + '<h2>Quick Connect</h2>'
            + '<p class="streamflix-modal-text">On your TV or other device, choose <strong>Quick Connect</strong> on the Jellyfin sign-in screen and enter the code it shows. It will sign in as <strong>' + escapeHtml(active.name || 'this profile') + '</strong>.</p>'
            + '<label class="streamflix-pin-pad streamflix-qc-pad">'
            + '  <input type="text" class="streamflix-pin-input streamflix-qc-input" inputmode="numeric" autocomplete="one-time-code" maxlength="' + len + '" aria-label="Quick Connect code" />'
            + '  <span class="streamflix-pin-boxes">' + boxesHtml + '</span>'
            + '</label>'
            + '<div class="streamflix-pin-msg" aria-live="assertive"></div>'
            + '<div class="streamflix-modal-actions streamflix-modal-actions-center">'
            + '  <button type="button" class="streamflix-ghost-btn" data-act="cancel">Cancel</button>'
            + '  <button type="button" class="streamflix-btn-primary" data-act="ok" disabled>Connect</button>'
            + '</div>', { className: 'streamflix-modal-pin streamflix-modal-qc' });

        var input = m.modal.querySelector('.streamflix-qc-input');
        var boxEls = m.modal.querySelectorAll('.streamflix-pin-box');
        var msg = m.modal.querySelector('.streamflix-pin-msg');
        var okBtn = m.modal.querySelector('[data-act="ok"]');
        var busy = false;

        function paint() {
            var v = input.value;
            var focused = document.activeElement === input;
            for (var k = 0; k < boxEls.length; k++) {
                boxEls[k].textContent = v.charAt(k) || '';
                boxEls[k].classList.toggle('filled', k < v.length);
                boxEls[k].classList.toggle('active', focused && k === Math.min(v.length, len - 1));
            }
            okBtn.disabled = busy || input.disabled || v.length < len;
        }

        function fail(text) {
            msg.textContent = text;
            m.modal.classList.remove('streamflix-shake');
            void m.modal.offsetWidth;
            m.modal.classList.add('streamflix-shake');
            try { input.focus(); input.select(); } catch (e) {}
            paint();
        }

        function submit() {
            var code = input.value;
            if (busy || code.length < len) {
                return;
            }
            busy = true;
            m.modal.classList.add('streamflix-busy');
            msg.textContent = '';
            paint();
            apiFetch('/QuickConnect/Authorize?code=' + encodeURIComponent(code), { method: 'POST' }).then(function () {
                busy = false;
                m.modal.classList.remove('streamflix-busy');
                m.modal.innerHTML = ''
                    + '<div class="streamflix-qc-badge streamflix-qc-success">' + icon('check') + '</div>'
                    + '<h2>Device connected</h2>'
                    + '<p class="streamflix-modal-text">Your device is now signed in as <strong>' + escapeHtml(active.name || 'this profile') + '</strong>.</p>'
                    + '<div class="streamflix-modal-actions streamflix-modal-actions-center"><button type="button" class="streamflix-btn-primary" data-act="done">Done</button></div>';
                m.modal.querySelector('[data-act="done"]').addEventListener('click', function () { m.close(true); });
                setTimeout(function () { m.close(true); }, 2600);
            }).catch(function (err) {
                busy = false;
                m.modal.classList.remove('streamflix-busy');
                var status = err && err.status;
                if (status === 404 || status === 400) {
                    fail('That code wasn\'t found or has expired. Check the code on your device and try again.');
                } else if (status === 401 || status === 403) {
                    fail('Quick Connect isn\'t available. An administrator can turn it on in Dashboard → General.');
                } else {
                    fail((err && err.message) || 'Couldn\'t connect the device. Please try again.');
                }
            });
        }

        input.addEventListener('input', function () {
            input.value = input.value.replace(/[^0-9a-z]/gi, '').toUpperCase().slice(0, len);
            if (msg.textContent && !busy && !input.disabled) {
                msg.textContent = '';
            }
            paint();
            if (input.value.length === len) {
                submit();
            }
        });
        input.addEventListener('focus', paint);
        input.addEventListener('blur', paint);
        input.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') {
                submit();
            }
        });
        okBtn.addEventListener('click', submit);
        m.modal.querySelector('[data-act="cancel"]').addEventListener('click', function () { m.close(false); });

        apiFetch('/QuickConnect/Enabled').then(function (enabled) {
            if (enabled === false || enabled === 'false') {
                input.disabled = true;
                msg.textContent = 'Quick Connect is turned off on this server. An administrator can enable it in Dashboard → General.';
                paint();
            }
        }).catch(function () {});

        setTimeout(function () {
            try { input.focus(); } catch (e) {}
            paint();
        }, 40);
        return m;
    }

    /* Jellyfin's Cast ("Play on") and SyncPlay header buttons are tucked out of sight (see CSS) and
       surfaced as tiles in the account menu instead; these helpers find and drive the native buttons. */
    var NATIVE_HEADER_SELECTORS = {
        cast: ['.headerCastButton', '.skinHeader .castButton', '.MuiToolbar-root button[title="Play On"]', '.MuiToolbar-root button[aria-label="Play On"]', '.MuiToolbar-root button[title="Cast"]', '.MuiToolbar-root button[aria-label="Cast"]'],
        sync: ['.headerSyncButton', '.skinHeader .syncButton', '.MuiToolbar-root button[title="SyncPlay"]', '.MuiToolbar-root button[aria-label="SyncPlay"]']
    };

    var NATIVE_HEADER_ICON_SELECTORS = {
        cast: '.material-icons.cast, .material-icons.cast_connected, svg[data-testid="CastIcon"], svg[data-testid="CastConnectedIcon"]',
        sync: '.material-icons.groups, .material-icons.group, .material-icons.group_add, svg[data-testid="GroupsIcon"], svg[data-testid="GroupIcon"], svg[data-testid="GroupAddIcon"]'
    };
    var NATIVE_HEADER_ROOTS = '.skinHeader, header, .MuiAppBar-root, .MuiToolbar-root';

    // Tag Jellyfin's Cast / SyncPlay header buttons, whatever header Jellyfin renders, so CSS can park them
    function tagNativeHeaderButtons() {
        var roots = document.querySelectorAll(NATIVE_HEADER_ROOTS);
        Object.keys(NATIVE_HEADER_ICON_SELECTORS).forEach(function (kind) {
            var found = [];
            (NATIVE_HEADER_SELECTORS[kind] || []).forEach(function (sel) {
                Array.prototype.push.apply(found, document.querySelectorAll(sel));
            });
            for (var r = 0; r < roots.length; r++) {
                var icons = roots[r].querySelectorAll(NATIVE_HEADER_ICON_SELECTORS[kind]);
                for (var i = 0; i < icons.length; i++) {
                    var b = icons[i].closest('button, a, [role="button"]');
                    if (b && !b.closest('#streamflix-account-dropdown, #streamflix-header-profile-btn, #streamflix-overlay-root')) {
                        found.push(b);
                    }
                }
            }
            found.forEach(function (b) {
                if (b.getAttribute('data-bfx-native') !== kind) {
                    b.setAttribute('data-bfx-native', kind);
                }
            });
        });
    }

    function findNativeHeaderButton(kind) {
        tagNativeHeaderButtons();
        var tagged = document.querySelectorAll('[data-bfx-native="' + kind + '"]');
        for (var t = 0; t < tagged.length; t++) {
            if (!tagged[t].classList.contains('hide') && !(tagged[t].closest && tagged[t].closest('.hide'))) {
                return tagged[t];
            }
        }
        var sels = NATIVE_HEADER_SELECTORS[kind] || [];
        for (var i = 0; i < sels.length; i++) {
            var list = document.querySelectorAll(sels[i]);
            for (var j = 0; j < list.length; j++) {
                var b = list[j];
                // Jellyfin adds .hide when the feature is unavailable for this user/device
                if (b.classList.contains('hide') || (b.closest && b.closest('.hide'))) {
                    continue;
                }
                return b;
            }
        }
        return null;
    }

    function getNativeCastState() {
        var b = findNativeHeaderButton('cast');
        if (!b) {
            return { connected: false, deviceName: '' };
        }
        var connected = b.classList.contains('castButton-active') || Boolean(b.querySelector('.cast_connected, svg[data-testid="CastConnectedIcon"]'));
        var nameEl = document.querySelector('.headerSelectedPlayer');
        return { connected: connected, deviceName: connected && nameEl ? (nameEl.textContent || '').trim() : '' };
    }

    function openNativeHeaderMenu(kind) {
        var b = findNativeHeaderButton(kind);
        if (!b) {
            showToast('Casting isn\'t available on this device.', 'info');
            return;
        }
        // Let the menu's own click finish first so Jellyfin's popup doesn't treat it as an outside click
        setTimeout(function () {
            try { b.click(); } catch (e) {}
        }, 60);
    }

    function syncHeaderCastIndicator(btn) {
        if (!btn) {
            return;
        }
        var info = getNativeCastState();
        var badge = btn.querySelector('.streamflix-header-cast');
        if (info.connected && !badge) {
            badge = document.createElement('span');
            badge.className = 'streamflix-header-cast';
            badge.innerHTML = icon('cast');
            btn.insertBefore(badge, btn.firstChild);
        } else if (!info.connected && badge && badge.parentNode) {
            badge.parentNode.removeChild(badge);
        }
        if (badge && info.connected) {
            badge.title = 'Casting to ' + (info.deviceName || 'another device');
        }
    }

    function closeAccountDropdown() {
        state.accountDropdownOpen = false;
        var dd = document.getElementById('streamflix-account-dropdown');
        if (dd && dd.parentNode) {
            dd.parentNode.removeChild(dd);
        }
        var btn = document.getElementById('streamflix-header-profile-btn');
        if (btn) {
            btn.classList.remove('open');
        }
        syncMobileDockState();
    }

    function toggleAccountDropdown() {
        if (state.accountDropdownOpen && document.getElementById('streamflix-account-dropdown')) {
            closeAccountDropdown();
            return;
        }
        var active = state.activeProfile;
        if (!active) {
            return;
        }
        state.accountDropdownOpen = true;
        var btn = document.getElementById('streamflix-header-profile-btn');
        if (btn) {
            btn.classList.add('open');
        }

        var existing = document.getElementById('streamflix-account-dropdown');
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }

        var profiles = getProfiles();
        var isGuest = isGuestPassSession();
        var isKidsActive = Boolean(active.isKids);
        var isAdmin = !isGuest && !isKidsActive && (isHouseholdAdmin() || Boolean(active.isAdmin));
        var googleEmail = state.googleUser && state.googleUser.email;
        var sessionUsername = state.googleUser && state.googleUser.username;
        var isOidcSession = Boolean(state.googleUser && state.googleUser.authKind === 'oidc');
        var guestRel = isGuest
            ? formatRelativeExpiry((state.config && state.config.guestPassExpiresAt) || (state.googleUser && state.googleUser.expiresAt))
            : '';
        var accountSubLabel = isKidsActive
            ? ('Kids Mode' + (isGuest && guestRel ? (' · ' + guestRel) : ' · Family-friendly titles'))
            : (isGuest
                ? ('Temporary Guest Pass' + (guestRel ? ' · ' + guestRel : ''))
                : (isOidcSession
                    ? ((state.googleUser.providerName || getOidcProviderLabel()) + ' · ' + (googleEmail || sessionUsername || active.jellyfinUsername || active.name))
                    : (googleEmail
                        || (sessionUsername ? ((state.googleUser.authKind === 'jellyfin_admin' ? 'Admin · ' : 'Signed in as ') + sessionUsername) : '')
                        || (state.config && state.config.bypassLoginGateOnLan && state.config.isLocalLan ? ('Local Network · ' + (active.jellyfinUsername || active.name)) : '')
                        || ('Jellyfin user: ' + (active.jellyfinUsername || active.name)))));

        var otherProfiles = isGuest ? [] : profiles.filter(function (p) { return p.id !== active.id; });
        var quickProfilesHtml = otherProfiles.map(function (p) {
            var lockedOut = p.googleLocked && !p.googleLockSatisfied;
            var lockMeta = p.googleLocked ? getProfileLockMeta(p) : null;
            var lockHint = p.googleAccountEmail || p.googleAccountHint || '';
            var rowTitle = lockedOut
                ? ('Locked to ' + (lockMeta ? lockMeta.providerLabel : 'another') + (lockHint ? ' (' + lockHint + ')' : ' account'))
                : ('Switch to ' + p.name);
            var lockBadgeHtml = lockMeta
                ? '<span class="bfx-dd-prof-lock is-acct ' + lockMeta.badgeClass + '">' + lockMeta.badgeSvg + '</span>'
                : (p.hasPin ? '<span class="bfx-dd-prof-lock">•••</span>' : '');
            return ''
                + '<button type="button" class="bfx-dd-prof' + (lockedOut ? ' is-locked' : '') + '" data-quick-switch-id="' + escapeHtml(p.id) + '" title="' + escapeHtml(rowTitle) + '">'
                + '  <span class="bfx-dd-prof-av" style="background:' + escapeHtml(p.color || '#E50914') + ';">' + escapeHtml(p.icon || '🎬')
                + lockBadgeHtml
                + '</span>'
                + '  <span class="bfx-dd-prof-name">' + escapeHtml(p.name) + '</span>'
                + '</button>';
        }).join('');

        var ddItem = function (id, iconName, label, sub, extraClass, trailing) {
            return '<button type="button" role="menuitem" class="streamflix-dd-item' + (extraClass ? ' ' + extraClass : '') + '" id="' + id + '">'
                + '<span class="bfx-dd-ico">' + icon(iconName) + '</span>'
                + '<span class="bfx-dd-label">' + escapeHtml(label) + (sub ? '<small>' + escapeHtml(sub) + '</small>' : '') + '</span>'
                + (trailing || '')
                + '</button>';
        };

        var castBtnNative = findNativeHeaderButton('cast');
        var castInfo = getNativeCastState();
        var isPhoneSheet = Boolean(document.body && document.body.classList.contains('bfx-phone-mode'));
        var canPhoneSurprise = isPhoneSheet
            && state.cinemaHubEnabled !== false
            && state.hubData
            && ((state.hubData.allMovies ? state.hubData.allMovies.length : 0) + (state.hubData.allSeries ? state.hubData.allSeries.length : 0)) >= 2;

        var ddTile = function (id, iconName, label, hint, extraClass) {
            return '<button type="button" role="menuitem" class="bfx-dd-tile' + (extraClass ? ' ' + extraClass : '') + '" id="' + id + '" title="' + escapeHtml(hint) + '">'
                + '<span class="bfx-dd-tile-ico">' + icon(iconName) + '</span>'
                + '<span class="bfx-dd-tile-label">' + escapeHtml(label) + '</span>'
                + '</button>';
        };
        var wpEnabled = !isKidsActive && typeof isWatchTogetherEnabled === 'function' && isWatchTogetherEnabled();
        var wpActiveGroup = wpEnabled && typeof watchPartyState !== 'undefined' ? watchPartyState.activeGroup : null;
        var wpCount = wpActiveGroup && typeof getActiveWatchPartyParticipantCount === 'function' ? getActiveWatchPartyParticipantCount() : 0;
        var wpTrailingHtml = wpActiveGroup
            ? ('<span class="bfx-dd-wp-live-pill"><span class="bfx-wp-pulse-dot" aria-hidden="true"></span><span>Live · ' + wpCount + '</span></span>')
            : ('<span class="bfx-dd-chev">' + icon('chevronRight') + '</span>');
        var wpSubLabel = wpActiveGroup
            ? ('In "' + (wpActiveGroup.name || wpActiveGroup.groupName || wpActiveGroup.GroupName || 'Watch Party') + '"' + (wpActiveGroup.roomId ? ' · ' + wpActiveGroup.roomId : ''))
            : 'Synced watch parties & invite links';

        var tilesHtml = ''
            + (isPhoneSheet && state.cinemaHubEnabled !== false ? ddTile('streamflix-dd-mylist', 'bookmark', 'My List', 'Saved movies & shows', 'is-mylist') : '')
            + (canPhoneSurprise ? ddTile('streamflix-dd-surprise', 'shuffle', 'Surprise Me', 'Pick something great to watch', 'is-surprise') : '')
            + (castBtnNative ? ddTile('streamflix-dd-cast', 'cast', castInfo.connected ? 'Casting' : 'Cast', castInfo.connected ? ('Connected to ' + (castInfo.deviceName || 'another device')) : 'Play on a TV, Chromecast or another device', 'is-cast' + (castInfo.connected ? ' is-live' : '')) : '')
            + (!isGuest && !isKidsActive ? ddTile('streamflix-dd-quick-connect', 'tv', 'Quick Connect', 'Sign in on a TV or another device with a 6-digit code', 'is-qc') : '');

        var kidsLockNeeded = isKidsActive && typeof isKidsExitLockRequired === 'function' && isKidsExitLockRequired()
            && !(typeof getValidKidsExitSession === 'function' && getValidKidsExitSession());

        var dd = document.createElement('div');
        dd.id = 'streamflix-account-dropdown';
        dd.setAttribute('role', 'menu');
        dd.innerHTML = ''
            + '<div class="streamflix-dd-active-header">'
            + '  <div class="streamflix-dd-active-avatar" style="background:' + escapeHtml(active.color || '#E50914') + ';">' + escapeHtml(active.icon || '🎬') + '</div>'
            + '  <div class="streamflix-dd-active-meta">'
            + '    <div class="streamflix-dd-active-name">'
            + '      <span>' + escapeHtml(active.name) + '</span>'
            + (isKidsActive
                ? '<span class="streamflix-dd-kids-pill">KIDS</span>'
                : (isGuest
                    ? '<span class="streamflix-dd-guest-pill">Guest</span>'
                    : (active.isAdmin ? '<span class="streamflix-dd-admin-pill">Admin</span>' : '')))
            + '    </div>'
            + '    <div class="streamflix-dd-active-sub">' + escapeHtml(accountSubLabel) + '</div>'
            + '  </div>'
            + '  <button type="button" class="bfx-dd-close" id="streamflix-dd-close" title="Close" aria-label="Close menu">' + icon('chevronDown') + '</button>'
            + '</div>'
            + (isKidsActive && !isGuest
                ? ('<div class="bfx-dd-kids-exit-wrap"><button type="button" class="bfx-dd-exit-kids-btn" id="streamflix-dd-exit-kids">'
                    + (kidsLockNeeded ? icon('lock') : icon('logout'))
                    + '<span>Exit Kids Mode</span></button></div>')
                : '')
            + (isGuest
                ? ''
                : (isKidsActive
                    ? (otherProfiles.length ? ('<div class="bfx-dd-profiles">' + quickProfilesHtml + '</div>') : '')
                    : ('<div class="bfx-dd-profiles">' + quickProfilesHtml
                        + '<button type="button" class="bfx-dd-prof bfx-dd-prof-manage" id="streamflix-dd-manage-profiles" title="Manage profiles"><span class="bfx-dd-prof-av">' + icon('edit') + '</span><span class="bfx-dd-prof-name">Manage</span></button>'
                        + '</div>')))
            + (tilesHtml ? ('<div class="bfx-dd-tiles">' + tilesHtml + '</div>') : '')
            + (isKidsActive
                ? ((isCurrentProfileSeerrAllowed() ? ('<div class="streamflix-dd-divider"></div>' + ddItem('streamflix-dd-seerr-requests', 'sparkle', 'Media Requests', 'Track requested movies & shows', '', '<span class="bfx-dd-chev">' + icon('chevronRight') + '</span>')) : '')
                    + (isGuest ? ('<div class="streamflix-dd-divider"></div>' + ddItem('streamflix-dd-signout', 'logout', 'Exit Guest Pass', '', 'danger')) : ''))
                : ('<div class="streamflix-dd-divider"></div>'
                    + (wpEnabled ? ddItem('streamflix-dd-watch-party', 'party', 'Watch Together', wpSubLabel, wpActiveGroup ? 'is-watchparty-live' : '', wpTrailingHtml) : '')
                    + (!isGuest ? ddItem('streamflix-dd-user-prefs', 'sliders', 'Settings', 'Subtitles, playback & ' + getBrandName() + ' Home', '', '<span class="bfx-dd-chev">' + icon('chevronRight') + '</span>') : '')
                    + (isCurrentProfileSeerrAllowed() ? ddItem('streamflix-dd-seerr-requests', 'sparkle', 'Media Requests', 'Track requested movies & shows', '', '<span class="bfx-dd-chev">' + icon('chevronRight') + '</span>') : '')
                    + (isAdmin && areGuestPassesEnabled() ? ddItem('streamflix-dd-guest-passes', 'ticket', 'Guest Passes', 'Temporary invite links & QR', '', '<span class="bfx-dd-chev">' + icon('chevronRight') + '</span>') : '')
                    + (isAdmin ? ddItem('streamflix-dd-dashboard', 'gear', 'Dashboard', 'Server & ' + getBrandName() + ' plugin settings', '', '<span class="bfx-dd-chev">' + icon('chevronRight') + '</span>') : '')
                    + '<div class="streamflix-dd-divider"></div>'
                    + ddItem('streamflix-dd-signout', 'logout', isGuest ? 'Exit Guest Pass' : 'Sign out', '', 'danger')));

        document.body.appendChild(dd);

        Array.prototype.forEach.call(dd.querySelectorAll('[data-quick-switch-id]'), function (row) {
            row.addEventListener('click', function () {
                var target = findProfileById(row.getAttribute('data-quick-switch-id'));
                closeAccountDropdown();
                if (target) {
                    handleSelectProfile(target);
                }
            });
        });

        var bind = function (id, handler) {
            var el = document.getElementById(id);
            if (el) {
                el.addEventListener('click', function () {
                    closeAccountDropdown();
                    handler();
                });
            }
        };

        bind('streamflix-dd-close', function () {});
        bind('streamflix-dd-exit-kids', function () {
            if (typeof exitKidsModeToPicker === 'function') {
                exitKidsModeToPicker();
            }
        });
        bind('streamflix-dd-watch-party', function () {
            if (typeof openWatchTogetherModal === 'function') {
                openWatchTogetherModal({});
            }
        });
        bind('streamflix-dd-mylist', function () {
            cancelPendingSearch();
            state.mobileSearchOpen = false;
            state.searchQuery = '';
            state.searchResults = null;
            state.seerrSearchResults = null;
            state.browseFilter = null;
            state.activeCategory = 'mylist';
            state.heroIndex = 0;
            if (!isOnHomeRoute()) {
                window.location.hash = '#/home';
                setTimeout(function () {
                    ensureCinemaHubMounted();
                    renderCinemaHubContents();
                    syncMobileDockState();
                    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) {}
                }, 40);
            } else {
                ensureCinemaHubMounted();
                renderCinemaHubContents();
                syncMobileDockState();
                try { window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); } catch (e) {}
            }
        });
        bind('streamflix-dd-surprise', function () {
            triggerSurpriseMe();
        });
        // Cast reuses Jellyfin's own picker (Chromecast, AirPlay, other sessions)
        bind('streamflix-dd-cast', function () {
            openNativeHeaderMenu('cast');
        });
        bind('streamflix-dd-quick-connect', function () {
            openQuickConnectModal();
        });
        bind('streamflix-dd-seerr-requests', function () {
            openSeerrRequestsModal();
        });
        bind('streamflix-dd-guest-passes', function () {
            openGuestPassesModal();
        });
        bind('streamflix-dd-manage-profiles', function () {
            window.__STREAMFLIX_OPEN_PROFILE_PICKER__(true);
        });
        bind('streamflix-dd-user-prefs', function () {
            window.location.hash = '#/mypreferencesmenu';
        });
        bind('streamflix-dd-dashboard', function () {
            window.location.hash = '#/dashboard';
        });
        bind('streamflix-dd-signout', function () {
            var signoutMsg = isGuest
                ? 'You\'ll exit this Guest Pass on this device.'
                : (isOpenWithoutLogin(state.config) && !(state.googleUser && state.googleUser.token)
                    ? 'You\'ll exit this profile and return to Who\'s Watching.'
                    : 'You\'ll need to sign in again on this device.');
            confirmDialog({
                title: isGuest ? 'Exit Guest Pass?' : ('Sign out of ' + getBrandName() + '?'),
                message: signoutMsg,
                confirmText: isGuest ? 'Exit Guest Pass' : 'Sign Out'
            }).then(function (ok) {
                if (ok) {
                    signOutHousehold();
                }
            });
        });
        syncMobileDockState();
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', function (ev) {
        if (!state.accountDropdownOpen) {
            return;
        }
        var dd = document.getElementById('streamflix-account-dropdown');
        var btn = document.getElementById('streamflix-header-profile-btn');
        var dock = document.getElementById('streamflix-mobile-dock');
        if (dd && !dd.contains(ev.target) && (!btn || !btn.contains(ev.target)) && (!dock || !dock.contains(ev.target))) {
            closeAccountDropdown();
        }
    });

    function unmarkCornerBrandElement(el) {
        if (!el) {
            return;
        }
        el.removeAttribute('data-streamflix-corner-brand');
        el.classList.remove('streamflix-toolbar-brand-link');
        var inlines = el.querySelectorAll('.streamflix-inline-brand');
        for (var i = 0; i < inlines.length; i++) {
            if (inlines[i].parentNode) {
                inlines[i].parentNode.removeChild(inlines[i]);
            }
        }
    }

    function styleCornerBrandElement(el) {
        if (!el) {
            return;
        }
        el.setAttribute('data-streamflix-corner-brand', 'true');
        el.classList.add('streamflix-toolbar-brand-link');

        // Hide any Jellyfin triangle icon img / svg / startIcon inside the brand button
        var icons = el.querySelectorAll('img, svg, .MuiButton-startIcon, .MuiButton-icon');
        for (var k = 0; k < icons.length; k++) {
            icons[k].style.setProperty('display', 'none', 'important');
        }

        // Remove any legacy .streamflix-inline-brand child spans if native text nodes exist, or keep exactly ONE text node with the configured brand logo
        var brandLogo = getBrandLogoText();
        var inlines = el.querySelectorAll('.streamflix-inline-brand');
        for (var m = 1; m < inlines.length; m++) {
            if (inlines[m].parentNode) {
                inlines[m].parentNode.removeChild(inlines[m]);
            }
        }

        var foundFirstText = false;
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while ((node = walker.nextNode())) {
            var val = (node.nodeValue || '').trim();
            if (val) {
                if (!foundFirstText) {
                    if (node.nodeValue !== brandLogo) {
                        node.nodeValue = brandLogo;
                    }
                    foundFirstText = true;
                } else {
                    // Clear any secondary text node so it can NEVER double
                    node.nodeValue = '';
                }
            }
        }
        if (!foundFirstText && !el.querySelector('.streamflix-inline-brand')) {
            var span = document.createElement('span');
            span.className = 'streamflix-inline-brand';
            span.textContent = brandLogo;
            el.appendChild(span);
        }
    }

    function syncFallbackCornerBrand(hasVisibleNativeBrand) {
        var fb = document.getElementById('bfx-fixed-corner-brand');
        var suppressFallback = Boolean(hasVisibleNativeBrand)
            || isVideoPlayerActive()
            || isGateOpen()
            || isAdminConfigRoute()
            || (state.cinemaHubEnabled === false && !isUserPreferencesRoute());

        if (suppressFallback) {
            if (fb && fb.parentNode) {
                fb.parentNode.removeChild(fb);
            }
            return;
        }

        var brandLogo = getBrandLogoText();
        if (!fb && document.body) {
            fb = document.createElement('a');
            fb.id = 'bfx-fixed-corner-brand';
            fb.href = '#/home';
            fb.className = 'bfx-fixed-corner-brand';
            fb.setAttribute('aria-label', getBrandName() + ' Home');
            document.body.appendChild(fb);
        }
        if (fb && fb.textContent !== brandLogo) {
            fb.textContent = brandLogo;
        }
    }

    function replaceToolbarLogoInPlace() {
        try {
            // Remove any legacy floating #streamflix-fixed-brand element
            var legacyFixed = document.getElementById('streamflix-fixed-brand');
            if (legacyFixed && legacyFixed.parentNode) {
                legacyFixed.parentNode.removeChild(legacyFixed);
            }

            // Never inject STREAMFLIX into the Video Player OSD header!
            if (isVideoPlayerActive()) {
                var osdTitles = document.querySelectorAll('.skinHeader .pageTitle, .osdHeader .pageTitle, [data-streamflix-corner-brand="true"]');
                for (var z = 0; z < osdTitles.length; z++) {
                    if (osdTitles[z].closest && osdTitles[z].closest('.skinHeader')) {
                        unmarkCornerBrandElement(osdTitles[z]);
                    }
                }
                syncFallbackCornerBrand(false);
                if (typeof syncKidsModeChrome === 'function') {
                    syncKidsModeChrome();
                }
                return;
            }

            var srvName = ((state.config && state.config.serverName) || '').toLowerCase();
            var hasMuiToolbar = Boolean(document.querySelector('.MuiToolbar-root'));
            var visibleStyledEl = null;

            // 1. If Jellyfin 10.11 / 12.1 React MuiToolbar is present, style ONLY the single first brand element inside .MuiToolbar-root
            if (hasMuiToolbar) {
                // Clean .skinHeader .pageTitle so we don't get a second STREAMFLIX logo underneath .MuiToolbar-root
                var skinLogos = document.querySelectorAll('.skinHeader .pageTitleWithDefaultLogo, .skinHeader .pageTitleWithLogo, .skinHeader [data-streamflix-corner-brand="true"]');
                for (var s = 0; s < skinLogos.length; s++) {
                    unmarkCornerBrandElement(skinLogos[s]);
                }

                var candidates = document.querySelectorAll('.MuiToolbar-root a, .MuiToolbar-root button');
                var styledOne = false;
                for (var i = 0; i < candidates.length; i++) {
                    var el = candidates[i];
                    if (el.id === 'streamflix-header-profile-btn') {
                        continue;
                    }
                    if (el.closest && (el.closest('.MuiDrawer-root') || el.closest('.MuiDrawer-paper'))) {
                        continue;
                    }
                    var href = (el.getAttribute('href') || '').toLowerCase();
                    var text = (el.textContent || '').trim().toLowerCase();
                    if (href.indexOf('tab=') !== -1 || text.indexOf('favorite') !== -1) {
                        continue;
                    }

                    var isHomeHref = href === '#/'
                        || href === '/web/#/'
                        || href === '#/home'
                        || href === '#/home.html'
                        || href === '/web/#/home'
                        || href === '/web/#/home.html';

                    var hasBrandImg = Boolean(el.querySelector('img'));
                    var currentBrandLower = getBrandLogoText().toLowerCase();
                    var isBrandText = text === 'jellyfin'
                        || text === 'streamflix'
                        || (currentBrandLower && text === currentBrandLower)
                        || (srvName && text === srvName);

                    if (!styledOne && (isHomeHref || hasBrandImg || isBrandText || el.getAttribute('data-streamflix-corner-brand') === 'true')) {
                        styleCornerBrandElement(el);
                        styledOne = true;
                        if (el.offsetParent !== null && el.getBoundingClientRect().width > 8) {
                            visibleStyledEl = el;
                        }
                    } else if (el.getAttribute('data-streamflix-corner-brand') === 'true') {
                        unmarkCornerBrandElement(el);
                    }
                }
                syncFallbackCornerBrand(Boolean(visibleStyledEl));
                if (typeof syncKidsModeChrome === 'function') {
                    syncKidsModeChrome();
                }
                return;
            }

            // 2. Fallback for classic skinHeader (when .MuiToolbar-root is not present and not in OSD)
            var classicLogos = document.querySelectorAll('.skinHeader:not(.osdHeader) .pageTitleWithDefaultLogo, .skinHeader:not(.osdHeader) .pageTitleWithLogo');
            if (classicLogos.length > 0) {
                var cl = classicLogos[0];
                var classicBrand = getBrandLogoText();
                cl.setAttribute('data-streamflix-corner-brand', 'true');
                cl.style.setProperty('background-image', 'none', 'important');
                cl.style.setProperty('width', 'auto', 'important');
                if (cl.textContent !== classicBrand) {
                    cl.innerHTML = '<span class="streamflix-inline-brand">' + escapeHtml(classicBrand) + '</span>';
                }
                if (cl.offsetParent !== null && cl.getBoundingClientRect().width > 8) {
                    visibleStyledEl = cl;
                }
            }
            syncFallbackCornerBrand(Boolean(visibleStyledEl));
            if (typeof syncKidsModeChrome === 'function') {
                syncKidsModeChrome();
            }
        } catch (e) {}
    }
