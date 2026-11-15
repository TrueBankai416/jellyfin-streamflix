/* StreamFlix Client (13/14) — Redesigned User Settings & Preferences */
    /* ----------------------------------------------------------------------
       7b. Redesigned User Settings & Preferences (#/mypreferences* & #/userprofile)
       ---------------------------------------------------------------------- */
    var USER_PREFS_SUBPAGES = {
        profile: {
            icon: 'user',
            title: 'Profile & Password',
            subtitle: 'Jellyfin account image, password & profile lock settings',
            selector: '#userProfilePage:not(.hide), .userProfilePage:not(.hide)'
        },
        display: {
            icon: 'tv',
            title: 'Display',
            subtitle: 'Display language, date/time format, theme & browsing behavior',
            selector: '#displayPreferencesPage:not(.hide), .displayPreferencesPage:not(.hide)'
        },
        home: {
            icon: 'home',
            title: 'Home',
            subtitle: 'Home screen experience, library order & classic Jellyfin sections',
            selector: '#homePreferencesPage:not(.hide), .homePreferencesPage:not(.hide)'
        },
        playback: {
            icon: 'play',
            title: 'Playback',
            subtitle: 'Preferred audio language, streaming quality, skip intervals & autoplay',
            selector: '#languagePreferencesPage:not(.hide), #playbackPreferencesPage:not(.hide), .languagePreferencesPage:not(.hide)'
        },
        subtitles: {
            icon: 'subtitles',
            title: 'Subtitles',
            subtitle: 'Subtitle language, delivery mode, font styling & appearance',
            selector: '#subtitlePreferencesPage:not(.hide), .subtitlePreferencesPage:not(.hide)'
        },
        controls: {
            icon: 'sliders',
            title: 'Controls',
            subtitle: 'Keyboard shortcuts, remote keys & controller navigation',
            selector: '#controlsPreferencesPage:not(.hide), .controlsPreferencesPage:not(.hide)'
        },
        quickconnect: {
            icon: 'smartphone',
            title: 'Quick Connect',
            subtitle: 'Authorize a Smart TV or another device using a 6-digit code',
            selector: '#myPreferencesQuickConnectPage:not(.hide), #quickConnectPreferencesPage:not(.hide)'
        }
    };

    function getUserPreferencesRouteKind() {
        var rawHash = String(window.location.hash || '');
        var h = rawHash.toLowerCase();
        if (h.indexOf('configurationpage') !== -1 || h.indexOf('dashboard') !== -1) {
            return '';
        }
        if (h.indexOf('mypreferencesmenu') !== -1) {
            return 'menu';
        }
        if (h.indexOf('mypreferencesdisplay') !== -1) {
            return 'display';
        }
        if (h.indexOf('mypreferenceshome') !== -1) {
            return 'home';
        }
        if (h.indexOf('mypreferencesplayback') !== -1) {
            return 'playback';
        }
        if (h.indexOf('mypreferencessubtitles') !== -1) {
            return 'subtitles';
        }
        if (h.indexOf('mypreferencescontrols') !== -1) {
            return 'controls';
        }
        if (h.indexOf('mypreferencesquickconnect') !== -1) {
            return 'quickconnect';
        }
        if (h.indexOf('userprofile') !== -1 || h.indexOf('myprofile') !== -1) {
            var uidMatch = rawHash.match(/[?&]userid=([^&#]+)/i);
            if (!uidMatch) {
                return 'profile';
            }
            var targetUid = '';
            try {
                targetUid = decodeURIComponent(uidMatch[1]);
            } catch (e) {
                targetUid = uidMatch[1];
            }
            var activeUid = getActiveUserId();
            if (!activeUid || normalizeGuid(targetUid) === normalizeGuid(activeUid)) {
                return 'profile';
            }
            return '';
        }
        if (document.querySelector('#myPreferencesMenuPage:not(.hide)')) {
            return 'menu';
        }
        return '';
    }

    function isUserPreferencesRoute() {
        return Boolean(getUserPreferencesRouteKind());
    }

    function navigateBackToStreamFlixHome(ev) {
        if (ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button > 0)) {
            return;
        }
        if (ev) {
            ev.preventDefault();
        }
        cancelPendingSearch();
        state.activeCategory = 'all';
        state.heroIndex = 0;
        state.searchQuery = '';
        state.searchResults = null;
        state.seerrSearchResults = null;
        state.browseFilter = null;
        if (!isOnHomeRoute()) {
            window.location.hash = '#/home';
        }
        setTimeout(function () {
            if (state.cinemaHubEnabled !== false && isOnHomeRoute()) {
                ensureCinemaHubMounted();
                renderCinemaHubContents();
            }
            try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) {}
        }, 30);
    }

    function findActiveUserPreferencesPageEl(kind) {
        if (!kind) {
            return null;
        }
        if (kind === 'menu') {
            return document.querySelector('#myPreferencesMenuPage:not(.hide), .myPreferencesMenuPage:not(.hide)');
        }
        var meta = USER_PREFS_SUBPAGES[kind];
        if (meta && meta.selector) {
            var found = document.querySelector(meta.selector);
            if (found) {
                return found;
            }
        }
        return document.querySelector('.mainAnimatedPages > .page:not(.hide):not(#indexPage):not(#loginPage):not(#itemDetailPage):not(#videoOsdPage)');
    }

    function buildCinemaHubToggleCardHtml() {
        var brand = escapeHtml(getBrandName());
        var hubOn = state.cinemaHubEnabled !== false;
        return ''
            + '<div class="bfx-prefs-feature-card" data-bfx-hub-card="1">'
            + '  <div class="bfx-prefs-feature-ico">' + icon('home') + '</div>'
            + '  <div class="bfx-prefs-feature-copy">'
            + '    <div class="bfx-prefs-feature-title-row">'
            + '      <span class="bfx-prefs-feature-title">' + brand + ' Home</span>'
            + '      <span class="bfx-prefs-status-pill' + (hubOn ? ' is-on' : '') + '" data-bfx-hub-pill="1">' + (hubOn ? 'Active' : 'Classic') + '</span>'
            + '    </div>'
            + '    <div class="bfx-prefs-feature-desc">Netflix-style hero billboard, Top 10 row, and profile carousels on Home. Turn off to use classic Jellyfin Home on this device.</div>'
            + '  </div>'
            + '  <button type="button" role="switch" aria-checked="' + (hubOn ? 'true' : 'false') + '" aria-label="Toggle ' + brand + ' Home" class="bfx-prefs-toggle-btn" data-bfx-toggle-cinema-hub="1">'
            + '    <span class="bfx-switch' + (hubOn ? ' on' : '') + '"><i></i></span>'
            + '  </button>'
            + '</div>';
    }

    function bindCinemaHubToggleCards(container) {
        if (!container) {
            return;
        }
        var syncAllCards = function (enabled) {
            Array.prototype.forEach.call(document.querySelectorAll('[data-bfx-toggle-cinema-hub="1"]'), function (b) {
                b.setAttribute('aria-checked', enabled ? 'true' : 'false');
                var sw = b.querySelector('.bfx-switch');
                if (sw) {
                    sw.classList.toggle('on', enabled);
                }
            });
            Array.prototype.forEach.call(document.querySelectorAll('[data-bfx-hub-pill="1"]'), function (p) {
                p.classList.toggle('is-on', enabled);
                p.textContent = enabled ? 'Active' : 'Classic';
            });
        };

        Array.prototype.forEach.call(container.querySelectorAll('[data-bfx-hub-card="1"]'), function (card) {
            if (card.getAttribute('data-bfx-bound') === '1') {
                return;
            }
            card.setAttribute('data-bfx-bound', '1');
            card.addEventListener('click', function (ev) {
                var next = !Boolean(state.cinemaHubEnabled !== false);
                setCinemaHubEnabled(next, false);
                syncAllCards(next);
                ev.stopPropagation();
            });
            var btn = card.querySelector('[data-bfx-toggle-cinema-hub="1"]');
            if (btn) {
                btn.addEventListener('keydown', function (ev) {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        ev.stopPropagation();
                        var next = !Boolean(state.cinemaHubEnabled !== false);
                        setCinemaHubEnabled(next, false);
                        syncAllCards(next);
                    }
                });
            }
        });
    }

    function enhanceNativePrefsMenuRows(menuPage) {
        if (!menuPage) {
            return;
        }
        menuPage.classList.add('bfx-prefs-menu-enhanced');
        var rows = menuPage.querySelectorAll('a.emby-button, .listItem-border');
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row || row.closest('#bfx-prefs-hero')) {
                continue;
            }
            var cls = (row.className || '').toLowerCase();
            var href = (row.getAttribute('href') || '').toLowerCase();
            var labelEl = row.querySelector('.listItemBodyText') || row.querySelector('.listItemBody');
            var rawLabel = ((labelEl && labelEl.textContent) || '').trim().toLowerCase();

            var rowKind = '';
            var rowSub = '';
            if (cls.indexOf('lnkuserprofile') !== -1 || href.indexOf('userprofile') !== -1 || rawLabel === 'profile') {
                rowKind = 'profile';
                rowSub = 'Password, Jellyfin avatar & account security';
            } else if (cls.indexOf('lnkdisplaypreferences') !== -1 || href.indexOf('mypreferencesdisplay') !== -1 || rawLabel === 'display') {
                rowKind = 'display';
                rowSub = 'Language, date format, theme & browsing layout';
            } else if (cls.indexOf('lnkhomepreferences') !== -1 || href.indexOf('mypreferenceshome') !== -1 || rawLabel === 'home') {
                rowKind = 'home';
                rowSub = 'Library order, sections & classic home rows';
            } else if (cls.indexOf('lnklanguagepreferences') !== -1 || cls.indexOf('lnkplaybackpreferences') !== -1 || href.indexOf('mypreferencesplayback') !== -1 || rawLabel === 'playback') {
                rowKind = 'playback';
                rowSub = 'Audio language, video quality, streaming & autoplay';
            } else if (cls.indexOf('lnksubtitlepreferences') !== -1 || href.indexOf('mypreferencessubtitles') !== -1 || rawLabel === 'subtitles') {
                rowKind = 'subtitles';
                rowSub = 'Subtitle language, burn-in, font size & styling';
            } else if (cls.indexOf('lnkcontrolspreferences') !== -1 || href.indexOf('mypreferencescontrols') !== -1 || rawLabel === 'controls') {
                rowKind = 'controls';
                rowSub = 'Keyboard shortcuts & controller navigation';
            } else if (cls.indexOf('lnkquickconnectpreferences') !== -1 || href.indexOf('mypreferencesquickconnect') !== -1 || rawLabel === 'quick connect') {
                rowKind = 'quickconnect';
                rowSub = 'Authorize a TV or another device with a 6-digit code';
            } else if (cls.indexOf('lnkdashboard') !== -1 || href.indexOf('dashboard') !== -1 || rawLabel === 'dashboard') {
                rowKind = 'dashboard';
                rowSub = 'Server administration, libraries, users & plugins';
            } else if (cls.indexOf('btnlogout') !== -1 || rawLabel === 'sign out' || rawLabel === 'log out') {
                rowKind = 'logout';
                rowSub = 'Sign out of ' + getBrandName() + ' on this device';
            } else if (cls.indexOf('btnselectserver') !== -1 || rawLabel === 'select server') {
                rowKind = 'server';
                rowSub = 'Switch or manage connected Jellyfin servers';
            }

            if (rowKind && row.getAttribute('data-bfx-row-kind') !== rowKind) {
                row.setAttribute('data-bfx-row-kind', rowKind);
            }

            if (rowKind === 'logout' && row.getAttribute('data-bfx-logout-bound') !== '1') {
                row.setAttribute('data-bfx-logout-bound', '1');
                row.addEventListener('click', function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    var guest = isGuestPassSession();
                    confirmDialog({
                        title: guest ? 'Exit Guest Pass?' : ('Sign out of ' + getBrandName() + '?'),
                        message: guest ? 'You\'ll exit this Guest Pass on this device.' : 'You\'ll need to sign in again on this device.',
                        confirmText: guest ? 'Exit Guest Pass' : 'Sign Out'
                    }).then(function (ok) {
                        if (ok) {
                            signOutHousehold();
                        }
                    });
                }, true);
            }

            if (row.getAttribute('data-bfx-row-enhanced') === '1') {
                continue;
            }
            var bodyEl = row.querySelector('.listItemBody');
            if (!bodyEl) {
                continue;
            }
            row.setAttribute('data-bfx-row-enhanced', '1');
            if (rowSub && !bodyEl.querySelector('.bfx-prefs-row-sub')) {
                var subDiv = document.createElement('div');
                subDiv.className = 'bfx-prefs-row-sub';
                subDiv.textContent = rowSub;
                bodyEl.appendChild(subDiv);
            }
            if (rowKind !== 'logout' && !row.querySelector('.bfx-prefs-row-chev')) {
                var chev = document.createElement('span');
                chev.className = 'bfx-prefs-row-chev';
                chev.setAttribute('aria-hidden', 'true');
                chev.innerHTML = icon('chevronRight');
                var innerItem = row.querySelector('.listItem') || row;
                innerItem.appendChild(chev);
            }
        }
    }

    function clearUserPreferencesEnhancements() {
        if (document.body) {
            document.body.classList.remove('bfx-settings-route', 'bfx-settings-subpage');
        }
    }

    function enhanceUserPreferencesPages() {
        try {
            var kind = (!isVideoPlayerActive() && !isGateOpen() && !isAdminConfigRoute())
                ? getUserPreferencesRouteKind()
                : '';

            if (!kind || !state.activeProfile) {
                clearUserPreferencesEnhancements();
                return;
            }

            if (document.body) {
                document.body.classList.add('bfx-settings-route');
                document.body.classList.toggle('bfx-settings-subpage', kind !== 'menu');
            }

            var active = state.activeProfile;
            var sp = findProfileById(active.id) || active;
            var isGuest = isGuestPassSession();
            var isAdmin = !isGuest && (isHouseholdAdmin() || Boolean(active.isAdmin));
            var brandName = getBrandName();
            var uid = getActiveUserId() || active.jellyfinUserId || '';
            var uidSuffix = uid ? ('?userId=' + encodeURIComponent(uid)) : '';

            if (kind === 'menu') {
                var staleSub = document.getElementById('bfx-prefs-subbar');
                if (staleSub && staleSub.parentNode) {
                    staleSub.parentNode.removeChild(staleSub);
                }

                var menuPage = findActiveUserPreferencesPageEl('menu');
                if (!menuPage) {
                    return;
                }
                var heroHost = menuPage.querySelector('.readOnlyContent, .content-primary')
                    || menuPage.querySelector('.padded-left')
                    || menuPage;

                var googleEmail = state.googleUser && state.googleUser.email;
                var sessionUsername = state.googleUser && state.googleUser.username;
                var isOidcSession = Boolean(state.googleUser && state.googleUser.authKind === 'oidc');
                var guestRel = isGuest
                    ? formatRelativeExpiry((state.config && state.config.guestPassExpiresAt) || (state.googleUser && state.googleUser.expiresAt))
                    : '';
                var accountSubLabel = isGuest
                    ? ('Temporary Guest Pass' + (guestRel ? ' · ' + guestRel : ''))
                    : (isOidcSession
                        ? ((state.googleUser.providerName || getOidcProviderLabel()) + ' · ' + (googleEmail || sessionUsername || active.jellyfinUsername || active.name))
                        : (googleEmail
                            || (sessionUsername ? ((state.googleUser.authKind === 'jellyfin_admin' ? 'Administrator · ' : 'Signed in as ') + sessionUsername) : '')
                            || (state.config && state.config.bypassLoginGateOnLan && state.config.isLocalLan ? ('Home Network · ' + (active.jellyfinUsername || active.name)) : '')
                            || ('Linked Jellyfin user: ' + (active.jellyfinUsername || active.name))));

                var sig = [
                    'menu',
                    active.id,
                    active.name,
                    active.icon,
                    active.color,
                    Boolean(active.isKids),
                    Boolean(sp && sp.hasPin),
                    Boolean(isAdmin),
                    Boolean(isGuest),
                    Boolean(state.cinemaHubEnabled !== false),
                    brandName,
                    accountSubLabel
                ].join('|');

                var existingHero = document.getElementById('bfx-prefs-hero');
                if (existingHero && existingHero.parentNode !== heroHost) {
                    if (existingHero.parentNode) {
                        existingHero.parentNode.removeChild(existingHero);
                    }
                    existingHero = null;
                }

                if (!existingHero || existingHero.getAttribute('data-sig') !== sig) {
                    if (!existingHero) {
                        existingHero = document.createElement('div');
                        existingHero.id = 'bfx-prefs-hero';
                        existingHero.className = 'bfx-prefs-hero';
                        heroHost.insertBefore(existingHero, heroHost.firstChild);
                    }
                    existingHero.setAttribute('data-sig', sig);

                    var badgesHtml = ''
                        + (isGuest
                            ? '<span class="bfx-prefs-badge is-guest">Guest Pass</span>'
                            : (isAdmin ? '<span class="bfx-prefs-badge is-admin">Admin</span>' : ''))
                        + (active.isKids ? '<span class="bfx-prefs-badge is-kids">Kids</span>' : '')
                        + (sp && sp.hasPin ? '<span class="bfx-prefs-badge is-pin">' + icon('lock') + 'PIN</span>' : '');

                    existingHero.innerHTML = ''
                        + '<div class="bfx-prefs-topbar">'
                        + '  <a href="#/home" class="bfx-prefs-back-btn" data-bfx-prefs-home="1">' + icon('chevronLeft') + '<span>Back to ' + escapeHtml(brandName) + '</span></a>'
                        + '  <span class="bfx-prefs-kicker">Account &amp; Settings</span>'
                        + '</div>'
                        + '<div class="bfx-prefs-profile-card">'
                        + '  <div class="bfx-prefs-avatar" style="background:' + escapeHtml(active.color || '#E50914') + ';">' + escapeHtml(active.icon || '🎬') + '</div>'
                        + '  <div class="bfx-prefs-profile-meta">'
                        + '    <div class="bfx-prefs-profile-title-row">'
                        + '      <h1 class="bfx-prefs-profile-name">' + escapeHtml(active.name || 'Profile') + '</h1>'
                        + badgesHtml
                        + '    </div>'
                        + '    <div class="bfx-prefs-profile-sub">' + escapeHtml(accountSubLabel) + '</div>'
                        + '  </div>'
                        + (isGuest
                            ? ''
                            : ('  <div class="bfx-prefs-profile-actions">'
                                + '    <button type="button" class="bfx-prefs-pill-btn is-primary" data-bfx-prefs-edit-profile="1">' + icon('edit') + '<span>Edit Profile</span></button>'
                                + '    <button type="button" class="bfx-prefs-pill-btn" data-bfx-prefs-switch-profile="1">' + icon('users') + '<span>Switch Profile</span></button>'
                                + '  </div>'))
                        + '</div>'
                        + buildCinemaHubToggleCardHtml()
                        + (isAdmin
                            ? ('<div class="bfx-prefs-admin-card">'
                                + '  <div class="bfx-prefs-feature-ico is-admin">' + icon('shield') + '</div>'
                                + '  <div class="bfx-prefs-feature-copy">'
                                + '    <div class="bfx-prefs-feature-title-row">'
                                + '      <span class="bfx-prefs-feature-title">' + escapeHtml(brandName) + ' Plugin &amp; Active Devices</span>'
                                + '      <span class="bfx-prefs-status-pill is-admin">Admin</span>'
                                + '    </div>'
                                + '    <div class="bfx-prefs-feature-desc">Inspect active TVs, phones &amp; browsers, sign out individual devices, and configure Guest Passes, SSO &amp; Seerr.</div>'
                                + '  </div>'
                                + '  <div class="bfx-prefs-admin-actions">'
                                + '    <a href="#/configurationpage?name=StreamFlix&tab=devices" class="bfx-prefs-pill-btn is-accent">' + icon('smartphone') + '<span>Active Devices</span></a>'
                                + '    <a href="#/configurationpage?name=StreamFlix" class="bfx-prefs-pill-btn">' + icon('gear') + '<span>Plugin Settings</span></a>'
                                + '  </div>'
                                + '</div>')
                            : '');

                    var homeBtn = existingHero.querySelector('[data-bfx-prefs-home="1"]');
                    if (homeBtn) {
                        homeBtn.addEventListener('click', navigateBackToStreamFlixHome);
                    }
                    var editProfBtn = existingHero.querySelector('[data-bfx-prefs-edit-profile="1"]');
                    if (editProfBtn) {
                        editProfBtn.addEventListener('click', function () {
                            openProfileEditorModal(findProfileById(active.id) || active);
                        });
                    }
                    var switchProfBtn = existingHero.querySelector('[data-bfx-prefs-switch-profile="1"]');
                    if (switchProfBtn) {
                        switchProfBtn.addEventListener('click', function () {
                            window.__STREAMFLIX_OPEN_PROFILE_PICKER__(false);
                        });
                    }
                    bindCinemaHubToggleCards(existingHero);
                }

                enhanceNativePrefsMenuRows(menuPage);
                return;
            }

            // Subpage view (profile, display, home, playback, subtitles, controls, quickconnect)
            var staleHero = document.getElementById('bfx-prefs-hero');
            if (staleHero && staleHero.parentNode) {
                staleHero.parentNode.removeChild(staleHero);
            }

            var subPage = findActiveUserPreferencesPageEl(kind);
            if (!subPage) {
                return;
            }
            subPage.classList.add('bfx-prefs-subpage-enhanced');

            var subHost = subPage.querySelector('.readOnlyContent, .content-primary');
            if (!subHost) {
                var formEl = subPage.querySelector('form');
                subHost = (formEl && formEl.parentNode && formEl.parentNode !== document.body) ? formEl.parentNode : subPage;
            }

            var meta = USER_PREFS_SUBPAGES[kind] || {
                icon: 'sliders',
                title: 'Settings',
                subtitle: 'Account & playback preferences'
            };

            var showControlsTab = kind === 'controls' || !canUsePhoneNativeShare();
            var subSig = [
                kind,
                active.id,
                active.name,
                active.icon,
                active.color,
                Boolean(isGuest),
                Boolean(state.cinemaHubEnabled !== false),
                Boolean(showControlsTab),
                brandName,
                uid
            ].join('|');

            var existingSub = document.getElementById('bfx-prefs-subbar');
            if (existingSub && existingSub.parentNode !== subHost) {
                if (existingSub.parentNode) {
                    existingSub.parentNode.removeChild(existingSub);
                }
                existingSub = null;
            }

            if (!existingSub || existingSub.getAttribute('data-sig') !== subSig) {
                if (!existingSub) {
                    existingSub = document.createElement('div');
                    existingSub.id = 'bfx-prefs-subbar';
                    existingSub.className = 'bfx-prefs-subbar';
                    subHost.insertBefore(existingSub, subHost.firstChild);
                }
                existingSub.setAttribute('data-sig', subSig);

                var tabItems = [
                    { key: 'menu', label: 'Overview', href: '#/mypreferencesmenu' },
                    { key: 'profile', label: 'Profile', href: '#/userprofile.html' + uidSuffix },
                    { key: 'display', label: 'Display', href: '#/mypreferencesdisplay.html' + uidSuffix },
                    { key: 'home', label: 'Home', href: '#/mypreferenceshome.html' + uidSuffix },
                    { key: 'playback', label: 'Playback', href: '#/mypreferencesplayback.html' + uidSuffix },
                    { key: 'subtitles', label: 'Subtitles', href: '#/mypreferencessubtitles.html' + uidSuffix }
                ];
                if (showControlsTab) {
                    tabItems.push({ key: 'controls', label: 'Controls', href: '#/mypreferencescontrols.html' + uidSuffix });
                }
                if (!isGuest || kind === 'quickconnect') {
                    tabItems.push({ key: 'quickconnect', label: 'Quick Connect', href: '#/mypreferencesquickconnect.html' });
                }

                var tabsHtml = tabItems.map(function (t) {
                    var isAct = t.key === kind;
                    return '<a href="' + escapeHtml(t.href) + '" class="bfx-prefs-tab' + (isAct ? ' is-active' : '') + '"' + (isAct ? ' aria-current="page"' : '') + '>' + escapeHtml(t.label) + '</a>';
                }).join('');

                var contextualCardHtml = '';
                if (kind === 'home') {
                    contextualCardHtml = buildCinemaHubToggleCardHtml();
                } else if (kind === 'profile' && !isGuest) {
                    contextualCardHtml = ''
                        + '<div class="bfx-prefs-context-card">'
                        + '  <div class="bfx-prefs-context-av" style="background:' + escapeHtml(active.color || '#E50914') + ';">' + escapeHtml(active.icon || '🎬') + '</div>'
                        + '  <div class="bfx-prefs-feature-copy">'
                        + '    <div class="bfx-prefs-feature-title">' + escapeHtml(brandName) + ' Profile: ' + escapeHtml(active.name || 'Profile') + '</div>'
                        + '    <div class="bfx-prefs-feature-desc">Customize your ' + escapeHtml(brandName) + ' emoji avatar, accent color, Kids mode, maturity rating, PIN, or SSO lock.</div>'
                        + '  </div>'
                        + '  <button type="button" class="bfx-prefs-pill-btn is-primary" data-bfx-sub-edit-profile="1">' + icon('edit') + '<span>Edit ' + escapeHtml(brandName) + ' Profile</span></button>'
                        + '</div>';
                }

                existingSub.innerHTML = ''
                    + '<div class="bfx-prefs-subtop">'
                    + '  <a href="#/mypreferencesmenu" class="bfx-prefs-back-btn">' + icon('chevronLeft') + '<span>All Settings</span></a>'
                    + '  <a href="#/home" class="bfx-prefs-home-chip" data-bfx-prefs-home="1">' + icon('home') + '<span>' + escapeHtml(brandName) + ' Home</span></a>'
                    + '</div>'
                    + '<div class="bfx-prefs-subhead">'
                    + '  <div class="bfx-prefs-subhead-ico">' + icon(meta.icon) + '</div>'
                    + '  <div class="bfx-prefs-subhead-copy">'
                    + '    <h1 class="bfx-prefs-subhead-title">' + escapeHtml(meta.title) + '</h1>'
                    + '    <p class="bfx-prefs-subhead-desc">' + escapeHtml(meta.subtitle) + '</p>'
                    + '  </div>'
                    + '</div>'
                    + '<nav class="bfx-prefs-tabs" aria-label="Settings sections">' + tabsHtml + '</nav>'
                    + contextualCardHtml;

                var subHomeBtn = existingSub.querySelector('[data-bfx-prefs-home="1"]');
                if (subHomeBtn) {
                    subHomeBtn.addEventListener('click', navigateBackToStreamFlixHome);
                }
                var subEditProfBtn = existingSub.querySelector('[data-bfx-sub-edit-profile="1"]');
                if (subEditProfBtn) {
                    subEditProfBtn.addEventListener('click', function () {
                        openProfileEditorModal(findProfileById(active.id) || active);
                    });
                }
                bindCinemaHubToggleCards(existingSub);
            }
        } catch (e) {}
    }

    function installGlobalCardClickInterceptor() {
        if (window.__STREAMFLIX_CARD_INTERCEPTOR__) {
            return;
        }
        window.__STREAMFLIX_CARD_INTERCEPTOR__ = true;

        document.addEventListener('click', function (ev) {
            try {
                // Never intercept programmatic/synthetic .click() calls (e.g. playItemImmediately)
                if (!ev.isTrusted) {
                    return;
                }
                if (!state.config || state.config.enableStreamFlixUi === false) {
                    return;
                }
                var target = ev.target;
                if (!target || !target.closest) {
                    return;
                }

                // 1. If the user clicks Play or Resume inside native #itemDetailPage ('The Devil Wears Prada 2' 880px card),
                // immediately show the playback loader so #itemDetailPage disappears right away while native onPlayClick starts the player!
                var detailPlayBtn = target.closest('#itemDetailPage .btnPlay, #itemDetailPage .btnResume, #itemDetailPage button[data-action="play"], #itemDetailPage button[data-action="resume"]');
                if (detailPlayBtn) {
                    if (state.activeProfile && state.activeProfile.accessToken && state.activeProfile.jellyfinUserId) {
                        applyJellyfinServerCredentials({
                            serverId: state.activeProfile.serverId || (state.config && state.config.serverId),
                            userId: state.activeProfile.jellyfinUserId,
                            accessToken: state.activeProfile.accessToken
                        });
                    }
                    patchJellyfinApiClientMethods();
                    showPlaybackLoader('Starting playback…');
                    var detailPollStart = Date.now();
                    if (state.shortcutPollTimer) {
                        clearInterval(state.shortcutPollTimer);
                    }
                    state.shortcutPollTimer = setInterval(function () {
                        if (isVideoPlayerActive() || document.querySelector('.dialogContainer .dialog:not(.hide)') || (Date.now() - detailPollStart > 6500)) {
                            hidePlaybackLoader();
                        }
                    }, 100);
                    return;
                }

                // 2. If the user clicks "Movies", "TV Shows" ("Shows"), "Collections", or "Home" in the top bar (.MuiToolbar-root / .skinHeader) or side drawer (.MuiDrawer-root),
                // ensure it routes cleanly or switches the StreamFlix Cinema Hub category!
                var navClickEl = target.closest('.MuiToolbar-root a, .MuiToolbar-root button, .skinHeader a, .skinHeader button, .MuiDrawer-root a, .MuiDrawer-root button, .MuiListItemButton-root, #bfx-fixed-corner-brand');
                if (navClickEl && navClickEl.id !== 'streamflix-header-profile-btn' && !navClickEl.closest('#streamflix-account-dropdown')) {
                    if (navClickEl.id === 'bfx-fixed-corner-brand') {
                        navigateBackToStreamFlixHome(ev);
                        return;
                    }
                    var navHref = (navClickEl.getAttribute('href') || '').toLowerCase();
                    var navText = (navClickEl.textContent || '').trim().toLowerCase();
                    var wantCat = null;
                    if (navText === 'movies' || navHref.indexOf('#/movies') !== -1 || navHref.indexOf('collectiontype=movies') !== -1) {
                        wantCat = 'movies';
                    } else if (navText === 'tv shows' || navText === 'shows' || navHref.indexOf('#/tv') !== -1 || navHref.indexOf('collectiontype=tvshows') !== -1) {
                        wantCat = 'series';
                    } else if (navText === 'collections' || navHref.indexOf('collectiontype=boxsets') !== -1) {
                        wantCat = 'collections';
                    } else if (navText === 'home' || navClickEl.getAttribute('data-streamflix-corner-brand') === 'true') {
                        wantCat = 'all';
                    }

                    if (wantCat && state.cinemaHubEnabled && !isAdminConfigRoute()) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        cancelPendingSearch();
                        state.activeCategory = wantCat;
                        state.heroIndex = 0;
                        state.searchQuery = '';
                        state.searchResults = null;
                        state.seerrSearchResults = null;
                        state.browseFilter = null;
                        if (!isOnHomeRoute()) {
                            window.location.hash = '#/home';
                        }
                        setTimeout(function () {
                            ensureCinemaHubMounted();
                            renderCinemaHubContents();
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }, 30);
                        return;
                    }
                }

                // Ignore other clicks inside #itemDetailPage, user settings pages, video player, StreamFlix modals, Cinema Hub, mobile dock, top bar, side drawer, or dialogs
                if (isUserPreferencesRoute() || target.closest('#itemDetailPage, #myPreferencesMenuPage, #userProfilePage, #displayPreferencesPage, #homePreferencesPage, #languagePreferencesPage, #playbackPreferencesPage, #subtitlePreferencesPage, #controlsPreferencesPage, #myPreferencesQuickConnectPage, #bfx-prefs-hero, #bfx-prefs-subbar, #videoOsdPage, .videoPlayerContainer, .streamflix-modal-backdrop, #streamflix-cinema-hub, #streamflix-library-page-fallback, #streamflix-overlay-root, #streamflix-account-dropdown, #streamflix-header-profile-btn, #streamflix-mobile-dock, .MuiDrawer-root, .skinHeader, .videoOsdBottom, .actionSheet, .dialogContainer')) {
                    return;
                }

                // 3. If user clicked a quick Play / Resume overlay button on a native Jellyfin card (including big .overflowBackdropCard / .backdropCard),
                // play it through our reliable playItemImmediately engine!
                var nativePlayBtn = target.closest('button[data-action="play"], button[data-action="resume"], .cardOverlayFab-primary');
                if (nativePlayBtn) {
                    var parentCard = nativePlayBtn.closest('.card[data-id], .listItem[data-id], [data-id]');
                    var playId = (parentCard && parentCard.getAttribute('data-id')) || nativePlayBtn.getAttribute('data-id');
                    if (playId) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        playItemImmediately(playId);
                        return;
                    }
                }

                // Let Jellyfin handle Favorite / Watched / Menu buttons on native cards directly
                if (target.closest('button[data-action="menu"], button[data-action="toggleplayed"], .btnUserData')) {
                    return;
                }

                // 4. If user clicked a "My Media" library card or a link pointing to #/movies, #/tv, or #/list, route to the corresponding category!
                var anyAnchor = target.closest('a[href]');
                if (anyAnchor) {
                    var aHref = (anyAnchor.getAttribute('href') || '').toLowerCase();
                    if (aHref && aHref.indexOf('details?id=') === -1) {
                        if (state.cinemaHubEnabled) {
                            var mediaCat = null;
                            if (aHref.indexOf('movies') !== -1) {
                                mediaCat = 'movies';
                            } else if (aHref.indexOf('/tv') !== -1 || aHref.indexOf('tvshows') !== -1) {
                                mediaCat = 'series';
                            } else if (aHref.indexOf('boxsets') !== -1 || aHref.indexOf('/list') !== -1) {
                                mediaCat = 'collections';
                            }
                            if (mediaCat) {
                                ev.preventDefault();
                                ev.stopPropagation();
                                cancelPendingSearch();
                                state.activeCategory = mediaCat;
                                state.heroIndex = 0;
                                state.searchQuery = '';
                                state.searchResults = null;
                                state.seerrSearchResults = null;
                                state.browseFilter = null;
                                if (!isOnHomeRoute()) {
                                    window.location.hash = '#/home';
                                }
                                ensureCinemaHubMounted();
                                renderCinemaHubContents();
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                return;
                            }
                        }
                        return;
                    }
                }

                // 5. If user clicked a Movie, Series, Episode, or BoxSet card in native library/home grids (including big .overflowBackdropCard),
                // open 'The Devil Wears Prada 2' Netflix card modal!
                var linkEl = target.closest('a[href*="details?id="]');
                var cardEl = target.closest('.card[data-id], .listItem[data-id]');
                var itemId = null;
                var itemType = '';

                if (linkEl) {
                    var href = linkEl.getAttribute('href') || '';
                    var m = href.match(/[?&]id=([a-f0-9-]+)/i);
                    if (m) {
                        itemId = m[1];
                    }
                }
                if (cardEl) {
                    itemId = itemId || cardEl.getAttribute('data-id');
                    itemType = (cardEl.getAttribute('data-type') || '').toLowerCase();
                }

                if (!itemId) {
                    return;
                }

                // If it's a top-level UserView / CollectionFolder card ("My Media"), switch to its Cinema Hub category
                if (itemType === 'collectionfolder' || itemType === 'userview' || isKnownTopLevelViewId(itemId)) {
                    if (state.cinemaHubEnabled) {
                        var inferred = inferItemTypesForParentOrRoute(itemId, '');
                        var targetCat = inferred === 'Movie' ? 'movies' : (inferred === 'Series' ? 'series' : 'collections');
                        ev.preventDefault();
                        ev.stopPropagation();
                        cancelPendingSearch();
                        state.activeCategory = targetCat;
                        state.heroIndex = 0;
                        state.searchQuery = '';
                        state.searchResults = null;
                        state.seerrSearchResults = null;
                        if (!isOnHomeRoute()) {
                            window.location.hash = '#/home';
                        }
                        ensureCinemaHubMounted();
                        renderCinemaHubContents();
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                    return;
                }

                // Let Folders, Persons/Actors, and Genres navigate to their list views (BoxSets open in our Netflix Collection Modal!)
                var nonModalTypes = ['folder', 'person', 'actor', 'genre', 'studio', 'playlist'];
                if (itemType && nonModalTypes.indexOf(itemType) !== -1) {
                    return;
                }

                var isCardLinkAction = Boolean(linkEl) || Boolean(target.closest('[data-action="link"], .cardImageContainer, .cardBox, .cardScalable, .cardPadder, .listItemBody'));
                if (!isCardLinkAction) {
                    return;
                }

                ev.preventDefault();
                ev.stopPropagation();
                openHeroDetailModalById(itemId, { isRouteBacked: false });
            } catch (e) {}
        }, true);
    }
