/* StreamFlix Client (03/14) — Google OAuth, Custom OIDC, Guest Handoff & Profile Activation */
    /* ----------------------------------------------------------------------
       1. Google OAuth 2.0 Flow (with CSRF state) & Server Verification
       ---------------------------------------------------------------------- */
    function getGoogleRedirectUri() {
        return window.location.origin + window.location.pathname;
    }

    function extractGoogleOAuthResultFromUrl() {
        var raw = (window.location.hash || '') + '&' + (window.location.search || '').replace(/^\?/, '');
        if (raw.indexOf('access_token=') === -1 && raw.indexOf('error=') === -1) {
            return null;
        }
        var param = function (name) {
            var match = raw.match(new RegExp('(?:[#?&/]|^)' + name + '=([^&]+)'));
            if (!match) {
                return '';
            }
            try {
                return decodeURIComponent(match[1].replace(/\+/g, ' '));
            } catch (e) {
                return match[1];
            }
        };
        var result = {
            token: param('access_token'),
            error: param('error'),
            state: param('state')
        };
        if (!result.token && !(result.error && result.state)) {
            return null;
        }

        var expected = '';
        try {
            expected = sessionStorage.getItem(OAUTH_STATE_KEY) || '';
            sessionStorage.removeItem(OAUTH_STATE_KEY);
        } catch (e) {}
        result.stateOk = Boolean(expected) && expected === result.state;

        state.justCompletedGoogleOAuth = true;
        // Strip the token from the address bar and history immediately
        try {
            window.history.replaceState(null, document.title, window.location.pathname + '#/home');
        } catch (e) {
            window.location.hash = '#/home';
        }
        return result;
    }

    function takePendingProfileId() {
        var pid = '';
        try {
            pid = sessionStorage.getItem(PENDING_PROFILE_KEY) || '';
            sessionStorage.removeItem(PENDING_PROFILE_KEY);
        } catch (e) {}
        return pid;
    }

    function startGoogleOAuthRedirect(pendingProfileId, loginHint) {
        var clientId = state.config && state.config.googleClientId;
        if (!clientId) {
            showToast('Google Sign-In isn\'t configured on this server yet.', 'error');
            return;
        }
        var oauthState = randomToken(16);
        try {
            sessionStorage.setItem(OAUTH_STATE_KEY, oauthState);
            if (pendingProfileId) {
                sessionStorage.setItem(PENDING_PROFILE_KEY, pendingProfileId);
            } else {
                sessionStorage.removeItem(PENDING_PROFILE_KEY);
            }
        } catch (e) {}

        var authUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
            + '?client_id=' + encodeURIComponent(clientId)
            + '&redirect_uri=' + encodeURIComponent(getGoogleRedirectUri())
            + '&response_type=token'
            + '&scope=' + encodeURIComponent('openid email profile')
            + '&state=' + encodeURIComponent(oauthState)
            + '&include_granted_scopes=true'
            + '&prompt=select_account'
            + (loginHint ? '&login_hint=' + encodeURIComponent(loginHint) : '');

        var btn = document.getElementById('streamflix-google-login-btn');
        if (btn) {
            btn.disabled = true;
            btn.classList.add('streamflix-btn-loading');
        }
        window.location.assign(authUrl);
    }

    function verifyGoogleAccessToken(accessToken) {
        state.verifyingGoogle = true;
        renderGoogleAuthGate('Verifying your Google account…');

        return apiFetch('/StreamFlix/VerifyGoogle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accessToken: accessToken,
                approveIfUnlisted: false
            })
        }).then(function (res) {
            state.verifyingGoogle = false;
            if (!res || !res.verified || !res.sessionToken) {
                takePendingProfileId();
                renderGoogleAuthGate(null, (res && res.message) || 'Google verification failed.');
                return null;
            }

            setHouseholdSession({
                token: res.sessionToken,
                email: res.email,
                name: res.name || res.email,
                picture: res.picture || '',
                expiresAt: res.expiresAt || ''
            });
            // Netflix-style: always choose who's watching after signing in
            state.activeProfile = null;
            localStorage.removeItem(PROFILE_KEY);

            var pendingId = takePendingProfileId();
            return fetchPublicConfig().then(function () {
                renderProfilePickerGate();
                var pending = pendingId ? findProfileById(pendingId) : null;
                if (pending) {
                    handleSelectProfile(pending);
                } else {
                    showToast('Signed in as ' + res.email, 'success');
                }
                return res;
            });
        }).catch(function (err) {
            state.verifyingGoogle = false;
            takePendingProfileId();
            renderGoogleAuthGate(null, (err && err.message) || 'Google verification failed.');
        });
    }

    /* ----------------------------------------------------------------------
       1b. Custom OpenID Connect (OIDC) Authorization Code + PKCE Flow (Beta)
       ---------------------------------------------------------------------- */
    function getOidcProviderLabel() {
        var name = state.config && typeof state.config.oidcProviderName === 'string'
            ? state.config.oidcProviderName.trim()
            : '';
        return name || 'Single Sign-On';
    }

    function extractOidcCallbackFromUrl() {
        var searchStr = (window.location.search || '').replace(/^\?/, '');
        var hashStr = (window.location.hash || '');
        var raw = searchStr + '&' + hashStr;
        if (raw.indexOf('sf_oidc=') === -1 && raw.indexOf('sf_oidc_error=') === -1) {
            return null;
        }
        var param = function (name) {
            var match = raw.match(new RegExp('(?:[#?&/]|^)' + name + '=([^&#]+)'));
            if (!match) {
                return '';
            }
            try {
                return decodeURIComponent(match[1].replace(/\+/g, ' '));
            } catch (e) {
                return match[1];
            }
        };
        var okFlag = param('sf_oidc');
        var errMsg = param('sf_oidc_error');
        if (!okFlag && !errMsg) {
            return null;
        }
        state.justCompletedGoogleOAuth = true;
        try {
            window.history.replaceState(null, document.title, window.location.pathname + '#/home');
        } catch (e) {
            window.location.hash = '#/home';
        }
        return {
            complete: okFlag === '1',
            error: errMsg
        };
    }

    function navigateExternalNoReferrer(url) {
        try {
            var a = document.createElement('a');
            a.href = url;
            a.rel = 'noreferrer';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                if (a.parentNode) {
                    a.parentNode.removeChild(a);
                }
            }, 0);
        } catch (e) {
            window.location.assign(url);
        }
    }

    function startOidcRedirect(pendingProfileId, loginHint) {
        if (!state.config || !state.config.enableCustomOidc || !state.config.oidcConfigured) {
            showToast('OpenID Connect isn\'t configured on this server yet.', 'error');
            return;
        }
        if (state.startingOidcRedirect || state.verifyingGoogle) {
            return;
        }
        state.startingOidcRedirect = true;

        try {
            if (pendingProfileId) {
                sessionStorage.setItem(PENDING_PROFILE_KEY, pendingProfileId);
            } else {
                sessionStorage.removeItem(PENDING_PROFILE_KEY);
            }
        } catch (e) {}

        var providerLabel = getOidcProviderLabel();
        if (!hasHouseholdAccess()) {
            renderGoogleAuthGate('Connecting to ' + providerLabel + '…');
        } else {
            var btn = document.getElementById('streamflix-oidc-login-btn');
            if (btn) {
                btn.disabled = true;
                btn.classList.add('streamflix-btn-loading');
            }
        }

        apiFetch('/StreamFlix/Oidc/Begin', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                returnWebBase: window.location.pathname || '/web/',
                pendingProfileId: pendingProfileId || '',
                loginHint: loginHint || ''
            })
        }).then(function (res) {
            if (!res || !res.authorizeUrl) {
                throw new Error((res && res.message) || ('Could not start ' + providerLabel + ' sign-in.'));
            }
            navigateExternalNoReferrer(res.authorizeUrl);
        }).catch(function (err) {
            state.startingOidcRedirect = false;
            var msg = (err && err.message) || ('Could not start ' + providerLabel + ' sign-in.');
            if (!hasHouseholdAccess()) {
                renderGoogleAuthGate(null, msg);
            } else {
                showToast(msg, 'error');
            }
        });
    }

    function completeOidcHandoff() {
        state.verifyingGoogle = true;
        var providerLabel = getOidcProviderLabel();
        renderGoogleAuthGate('Completing ' + providerLabel + ' sign-in…');

        return apiFetch('/StreamFlix/Oidc/Complete', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        }).then(function (res) {
            state.verifyingGoogle = false;
            if (!res || !res.verified || !res.sessionToken) {
                takePendingProfileId();
                renderGoogleAuthGate(null, (res && res.message) || (providerLabel + ' verification failed.'));
                return null;
            }

            var resolvedProvider = res.providerName || providerLabel;
            var resolvedEmail = res.email || '';
            var resolvedUser = res.username || res.name || (resolvedEmail ? '' : 'user');
            setHouseholdSession({
                token: res.sessionToken,
                authKind: 'oidc',
                providerName: resolvedProvider,
                email: resolvedEmail,
                username: resolvedUser,
                name: res.name || resolvedEmail || resolvedUser,
                picture: res.picture || '',
                expiresAt: res.expiresAt || ''
            });

            state.activeProfile = null;
            localStorage.removeItem(PROFILE_KEY);

            var pendingId = res.pendingProfileId || takePendingProfileId();
            return fetchPublicConfig().then(function () {
                renderProfilePickerGate();
                var pending = pendingId ? findProfileById(pendingId) : null;
                if (pending) {
                    handleSelectProfile(pending);
                } else {
                    var who = resolvedEmail || resolvedUser || resolvedProvider;
                    showToast('Signed in via ' + resolvedProvider + (who && who !== resolvedProvider ? (' as ' + who) : ''), 'success');
                }
                return res;
            });
        }).catch(function (err) {
            state.verifyingGoogle = false;
            takePendingProfileId();
            renderGoogleAuthGate(null, (err && err.message) || (providerLabel + ' sign-in failed.'));
        });
    }

    /* ----------------------------------------------------------------------
       1c. Temporary Guest Pass Handoff & Code Redemption
       ---------------------------------------------------------------------- */
    function extractGuestCallbackFromUrl() {
        var searchStr = (window.location.search || '').replace(/^\?/, '');
        var hashStr = (window.location.hash || '');
        var raw = searchStr + '&' + hashStr;
        if (raw.indexOf('sf_guest=') === -1 && raw.indexOf('sf_guest_error=') === -1) {
            return null;
        }
        var param = function (name) {
            var match = raw.match(new RegExp('(?:[#?&/]|^)' + name + '=([^&#]+)'));
            if (!match) {
                return '';
            }
            try {
                return decodeURIComponent(match[1].replace(/\+/g, ' '));
            } catch (e) {
                return match[1];
            }
        };
        var okFlag = param('sf_guest');
        var errMsg = param('sf_guest_error');
        if (!okFlag && !errMsg) {
            return null;
        }
        state.justCompletedGoogleOAuth = true;
        try {
            window.history.replaceState(null, document.title, window.location.pathname + '#/home');
        } catch (e) {
            window.location.hash = '#/home';
        }
        return {
            complete: okFlag === '1',
            error: errMsg
        };
    }

    function applyGuestRedemptionResponse(res) {
        state.guestPassExpanded = false;
        state.adminLoginExpanded = false;
        var passLabel = res.guestPassLabel || 'Guest Pass';
        setHouseholdSession({
            token: res.sessionToken,
            authKind: 'guest_pass',
            email: '',
            username: passLabel,
            name: passLabel,
            guestPassId: res.guestPassId || '',
            lockedProfileId: res.lockedProfileId || '',
            picture: '',
            expiresAt: res.expiresAt || ''
        });

        var act = res.activation;
        if (act && act.accessToken && act.userId) {
            var activated = normalizeProfileModel(act.profile || { id: res.lockedProfileId, name: act.userName || passLabel }, 0);
            activated.jellyfinUserId = act.userId || activated.jellyfinUserId;
            activated.jellyfinUsername = act.userName || act.jellyfinUsername || activated.jellyfinUsername;
            activated.accessToken = act.accessToken;
            activated.serverId = act.serverId || (state.config && state.config.serverId) || '';

            state.activeProfile = activated;
            saveJson(PROFILE_KEY, activated);
            saveJson(LEGACY_PROFILE_KEY, activated);

            applyJellyfinServerCredentials({
                serverId: activated.serverId,
                userId: activated.jellyfinUserId,
                accessToken: activated.accessToken,
                user: act.user || null,
                sessionInfo: act.sessionInfo || null
            });

            return fetchPublicConfig().then(function () {
                closeOverlayGate();
                closeAccountDropdown();
                ensureHeaderWidgets();
                var normUid = normalizeGuid(activated.jellyfinUserId);
                try {
                    sessionStorage.setItem('streamflix_reload_uid', normUid || 'guest');
                } catch (e) {}
                window.location.hash = '#/home';
                window.location.reload();
                return res;
            });
        }

        state.activeProfile = null;
        localStorage.removeItem(PROFILE_KEY);
        return fetchPublicConfig().then(function () {
            var locked = res.lockedProfileId ? findProfileById(res.lockedProfileId) : (getProfiles()[0] || null);
            if (locked) {
                handleSelectProfile(locked);
            } else {
                renderProfilePickerGate();
            }
            showToast('Welcome! Guest Pass activated.', 'success');
            return res;
        });
    }

    function completeGuestHandoff() {
        state.verifyingGoogle = true;
        renderGoogleAuthGate('Activating your Guest Pass…');
        var dev = getJellyfinDeviceInfo();
        return apiFetch('/StreamFlix/Guest/Complete', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deviceId: dev.deviceId,
                deviceName: dev.deviceName,
                appName: dev.appName,
                appVersion: dev.appVersion
            })
        }).then(function (res) {
            state.verifyingGoogle = false;
            if (!res || !res.verified || !res.sessionToken) {
                renderGoogleAuthGate(null, (res && res.message) || 'Guest Pass could not be activated.');
                return null;
            }
            return applyGuestRedemptionResponse(res);
        }).catch(function (err) {
            state.verifyingGoogle = false;
            renderGoogleAuthGate(null, (err && err.message) || 'Guest Pass could not be activated.');
        });
    }

    function redeemGuestPassCode(rawCode) {
        var cleaned = String(rawCode || '').trim();
        // Accept full invite URLs pasted into the code input as well as raw codes
        var urlMatch = cleaned.match(/\/StreamFlix\/Guest\/([A-Za-z0-9_-]+)/i);
        if (urlMatch && urlMatch[1]) {
            cleaned = urlMatch[1];
        }
        var dev = getJellyfinDeviceInfo();
        return apiFetch('/StreamFlix/Guest/Redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: cleaned,
                deviceId: dev.deviceId,
                deviceName: dev.deviceName,
                appName: dev.appName,
                appVersion: dev.appVersion
            })
        }).then(function (res) {
            if (!res || !res.verified || !res.sessionToken) {
                var e = new Error((res && res.message) || 'Invalid or expired Guest Pass.');
                throw e;
            }
            state.justCompletedGoogleOAuth = true;
            return applyGuestRedemptionResponse(res);
        });
    }

    /* ----------------------------------------------------------------------
       2. Server-Backed Profile Activation & Navigation
       ---------------------------------------------------------------------- */
    function findViewByType(wantType) {
        var views = (state.hubData && Array.isArray(state.hubData.views)) ? state.hubData.views : [];
        var wt = String(wantType || '').toLowerCase();
        for (var i = 0; i < views.length; i++) {
            var v = views[i];
            if (!v || !v.Id) {
                continue;
            }
            var ct = (v.CollectionType || '').toLowerCase();
            var nm = (v.Name || '').toLowerCase();
            if (wt === 'movies' && (ct === 'movies' || nm.indexOf('movie') !== -1)) {
                return v;
            }
            if (wt === 'tvshows' && (ct === 'tvshows' || nm.indexOf('show') !== -1 || nm.indexOf('tv') !== -1)) {
                return v;
            }
            if (wt === 'boxsets' && (ct === 'boxsets' || nm.indexOf('collection') !== -1)) {
                return v;
            }
        }
        return null;
    }

    function fixBrokenJellyfinRoutes() {
        var onHome = isOnHomeRoute();
        if (document.body) {
            document.body.classList.toggle('streamflix-on-home', onHome);
        }

        var h = window.location.hash || '';
        if (h === '#!/home.html' || h === '#!/home' || h === '#/home.html') {
            window.location.hash = '#/home';
            return;
        }

        // If Jellyfin's React Router rendered FallbackRoute (#fallbackPage — "Page not found") on the home route
        // (e.g. after returning from Google OAuth with #access_token=...), hide the error text immediately and trigger router navigation to #/home
        var fbPage = document.querySelector('#fallbackPage:not(.hide)');
        if (fbPage && onHome) {
            fbPage.classList.add('streamflix-recovered');
            if (!state.recoveringFallbackPage && !document.getElementById('streamflix-overlay-root')) {
                state.recoveringFallbackPage = true;
                var goHomeLink = fbPage.querySelector('a.button-link, a[href="#/home"], a[href="/"]');
                if (goHomeLink && typeof goHomeLink.click === 'function') {
                    try {
                        goHomeLink.click();
                    } catch (e) {}
                }
                window.location.hash = '#/';
                setTimeout(function () {
                    window.location.hash = '#/home';
                    state.recoveringFallbackPage = false;
                }, 60);
            }
        }

        var hLower = h.toLowerCase();
        if (hLower.indexOf('#/search') === 0 || hLower.indexOf('#!/search') === 0) {
            var qMatch = h.match(/[?&]query=([^&]+)/i);
            if (qMatch && qMatch[1]) {
                try {
                    state.searchQuery = decodeURIComponent(qMatch[1]);
                } catch (eDec) {
                    state.searchQuery = qMatch[1];
                }
                runLiveSearch(state.searchQuery);
            }
            window.location.hash = '#/home';
            setTimeout(function () {
                ensureCinemaHubMounted();
                renderCinemaHubContents();
                var sInput = document.getElementById('streamflix-live-search-input');
                if (sInput) {
                    sInput.focus();
                }
            }, 60);
            return;
        }

        var serverId = resolveKnownServerId();
        var updatedHash = h;

        // Jellyfin's list.js controller requires parentId=, whereas top bar sometimes passes topParentId= for Collections
        if (hLower.indexOf('#/list') === 0 && updatedHash.indexOf('topParentId=') !== -1 && updatedHash.indexOf('parentId=') === -1) {
            updatedHash = updatedHash.replace(/([?&])topParentId=/i, '$1parentId=');
        }

        // Ensure #/movies and #/tv have topParentId= if previously stripped
        if (hLower.indexOf('#/movies') === 0 && updatedHash.indexOf('topParentId=') === -1) {
            var mView = findViewByType('movies');
            if (mView && mView.Id) {
                updatedHash += (updatedHash.indexOf('?') === -1 ? '?' : '&') + 'topParentId=' + encodeURIComponent(mView.Id);
            }
        } else if (hLower.indexOf('#/tv') === 0 && updatedHash.indexOf('topParentId=') === -1) {
            var tvView = findViewByType('tvshows');
            if (tvView && tvView.Id) {
                updatedHash += (updatedHash.indexOf('?') === -1 ? '?' : '&') + 'topParentId=' + encodeURIComponent(tvView.Id);
            }
        }

        // Ensure serverId= is present on #/movies, #/tv, #/list, and #/details so ConnectionManager.getApiClient(params.serverId) never returns undefined
        if (serverId
            && (hLower.indexOf('#/movies') === 0 || hLower.indexOf('#/tv') === 0 || hLower.indexOf('#/list') === 0 || hLower.indexOf('#/details') === 0)
            && updatedHash.indexOf('serverId=') === -1) {
            updatedHash += (updatedHash.indexOf('?') === -1 ? '?' : '&') + 'serverId=' + encodeURIComponent(serverId);
        }

        if (updatedHash !== h) {
            window.location.hash = updatedHash;
        }
    }

    function activateServerProfile(profile, suppliedPin) {
        var dev = getJellyfinDeviceInfo();
        var prevUserId = (state.activeProfile && state.activeProfile.jellyfinUserId)
            || (window.ApiClient && typeof window.ApiClient.getCurrentUserId === 'function' ? window.ApiClient.getCurrentUserId() : '');
        state.activatingProfileId = profile.id;
        return apiFetch('/StreamFlix/Profiles/Activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                profileId: profile.id,
                pin: suppliedPin || '',
                pinCode: suppliedPin || '',
                deviceId: dev.deviceId,
                deviceName: dev.deviceName,
                appName: dev.appName,
                appVersion: dev.appVersion
            })
        }).then(function (res) {
            state.activatingProfileId = null;
            state.legacyProfileToMigrate = null;
            var activated = normalizeProfileModel(res.profile || profile, 0);
            activated.jellyfinUserId = res.userId || activated.jellyfinUserId;
            activated.jellyfinUsername = res.userName || res.jellyfinUsername || activated.jellyfinUsername;
            activated.accessToken = res.accessToken;
            activated.serverId = res.serverId || (state.config && state.config.serverId) || '';

            state.activeProfile = activated;
            saveJson(PROFILE_KEY, activated);
            saveJson(LEGACY_PROFILE_KEY, activated);

            if (state.config) {
                state.config.isAdmin = Boolean(activated.isAdmin) && !isGuestPassSession();
                if (!state.config.isAdmin) {
                    state.config.serverUsers = [];
                    state.config.approvedGoogleAccounts = [];
                    state.config.approvedOidcUsers = [];
                }
                if (res.serverId) {
                    state.config.serverId = res.serverId;
                }
                if (Array.isArray(state.config.profiles)) {
                    for (var i = 0; i < state.config.profiles.length; i++) {
                        if (state.config.profiles[i].id === activated.id) {
                            state.config.profiles[i].jellyfinUserId = activated.jellyfinUserId;
                            state.config.profiles[i].jellyfinUsername = activated.jellyfinUsername;
                            break;
                        }
                    }
                }
                saveJson(CACHED_CONFIG_KEY, state.config);
            }

            applyJellyfinServerCredentials({
                serverId: activated.serverId,
                userId: activated.jellyfinUserId,
                accessToken: activated.accessToken,
                user: res.user || null,
                sessionInfo: res.sessionInfo || null
            });

            closeOverlayGate();
            closeAccountDropdown();
            ensureHeaderWidgets();

            // Reset Cinema Hub, search, browse filter, and per-user item/episode caches for the newly selected profile
            if (typeof cancelPendingSearch === 'function') {
                cancelPendingSearch();
            }
            state.itemCache = {};
            state.browseFilter = null;
            state.searchQuery = '';
            state.searchResults = null;
            state.seerrSearchResults = null;
            if (typeof osdState !== 'undefined' && osdState) {
                osdState.episodesCache = {};
            }
            state.hubData.userId = null;
            state.hubData.loaded = false;
            state.hubData.loading = false;
            var existingHub = document.getElementById('streamflix-cinema-hub');
            if (existingHub && existingHub.parentNode) {
                existingHub.parentNode.removeChild(existingHub);
            }

            // If we just completed Google OAuth, or #fallbackPage ("Page not found") is mounted, or the Jellyfin user changed,
            // navigate cleanly to #/home and reload once so Jellyfin Web boots directly on #/home with fresh credentials
            var normNewUid = normalizeGuid(activated.jellyfinUserId);
            var normPrevUid = normalizeGuid(prevUserId);
            var hasFallbackPage = Boolean(document.querySelector('#fallbackPage:not(.hide)'));
            var missingHomePage = !document.getElementById('indexPage');
            var lastReloadUid = '';
            try {
                lastReloadUid = sessionStorage.getItem('streamflix_reload_uid') || '';
            } catch (e) {}

            var shouldReload = state.justCompletedGoogleOAuth
                || hasFallbackPage
                || (normNewUid && normNewUid !== normPrevUid && lastReloadUid !== normNewUid)
                || (missingHomePage && lastReloadUid !== normNewUid);

            state.justCompletedGoogleOAuth = false;

            if (shouldReload) {
                try {
                    sessionStorage.setItem('streamflix_reload_uid', normNewUid || 'reloaded');
                } catch (e) {}
                window.location.hash = '#/home';
                window.location.reload();
                return activated;
            }

            if (window.location.hash !== '#/home') {
                window.location.hash = '#/home';
            }
            fetchPublicConfig().catch(function () {});
            ensureCinemaHubMounted();
            if (!state.hubData.loading && !state.hubData.loaded) {
                loadCinemaHubData(false);
            }
            return activated;
        }).catch(function (err) {
            state.activatingProfileId = null;
            throw err;
        });
    }
