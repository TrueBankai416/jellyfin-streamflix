/* StreamFlix Client (02/14) — Jellyfin 12 Fetch/XHR Interceptors & Session Sync */
    function rewriteJellyfinItemsQueryUrl(rawUrl) {
        try {
            var u = new URL(rawUrl, window.location.origin);
            var pathLower = (u.pathname || '').toLowerCase();
            var isItems = pathLower === '/items' || (/^\/users\/[^/]+\/items$/i).test(u.pathname);
            var isLatest = pathLower === '/items/latest' || (/^\/users\/[^/]+\/items\/latest$/i).test(u.pathname);
            var isNextUp = pathLower === '/shows/nextup';
            var isRecs = pathLower === '/movies/recommendations';

            if (!isItems && !isLatest && !isNextUp && !isRecs) {
                return rawUrl;
            }

            var changed = false;
            var pid = u.searchParams.get('ParentId') || u.searchParams.get('parentId') || '';
            if (pid === 'undefined' || pid === 'null') {
                u.searchParams.delete('ParentId');
                u.searchParams.delete('parentId');
                pid = '';
                changed = true;
            }

            var uid = getActiveUserId();
            if (uid && !u.searchParams.has('userId') && !u.searchParams.has('UserId') && u.pathname.toLowerCase().indexOf('/users/') === -1) {
                u.searchParams.set('userId', uid);
                changed = true;
            }

            if (isItems) {
                var itemTypes = u.searchParams.get('IncludeItemTypes') || u.searchParams.get('includeItemTypes') || '';
                var filters = u.searchParams.get('Filters') || u.searchParams.get('filters') || '';
                if (itemTypes !== 'Episode' && itemTypes !== 'Season' && !filters) {
                    if (!pid || isKnownTopLevelViewId(pid)) {
                        var recVal = u.searchParams.get('Recursive') || u.searchParams.get('recursive') || '';
                        if (String(recVal).toLowerCase() !== 'true') {
                            u.searchParams.delete('recursive');
                            u.searchParams.set('Recursive', 'true');
                            changed = true;
                        }
                        if (!itemTypes) {
                            var inferred = inferItemTypesForParentOrRoute(pid, '');
                            if (inferred) {
                                u.searchParams.set('IncludeItemTypes', inferred);
                                changed = true;
                            }
                        }
                    }
                }
            }

            if (!changed) {
                return rawUrl;
            }
            if (rawUrl.indexOf('http://') === 0 || rawUrl.indexOf('https://') === 0) {
                return u.toString();
            }
            return u.pathname + u.search;
        } catch (e) {
            return rawUrl;
        }
    }

    function installJellyfin12XhrInterceptor() {
        if (window.__STREAMFLIX_XHR_PATCHED__ || typeof XMLHttpRequest === 'undefined') {
            return;
        }
        window.__STREAMFLIX_XHR_PATCHED__ = true;

        var origOpen = XMLHttpRequest.prototype.open;
        var origSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
        var origSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url) {
            this.__streamflixMethod = String(method || 'GET').toUpperCase();
            var urlStr = typeof url === 'string' ? url : String(url || '');
            var isSameOrigin = isSafeSameOriginUrl(urlStr);
            this.__streamflixSameOrigin = isSameOrigin;
            this.__streamflixHeaders = {};

            if (isSameOrigin && this.__streamflixMethod === 'GET') {
                urlStr = rewriteJellyfinItemsQueryUrl(urlStr);
            }
            this.__streamflixUrl = urlStr;
            var args = Array.prototype.slice.call(arguments);
            args[1] = urlStr;
            return origOpen.apply(this, args);
        };

        XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
            var lower = String(name || '').toLowerCase();
            if (this.__streamflixSameOrigin && lower) {
                var activeToken = getActiveToken();
                if (activeToken) {
                    if (lower === 'authorization' || lower === 'x-emby-authorization') {
                        value = getEmbyAuthHeader(activeToken);
                    } else if (lower === 'x-emby-token') {
                        value = activeToken;
                    }
                }
            }
            if (this.__streamflixHeaders && lower) {
                this.__streamflixHeaders[lower] = value;
            }
            return origSetRequestHeader.call(this, name, value);
        };

        XMLHttpRequest.prototype.send = function (bodyArg) {
            try {
                if (this.__streamflixSameOrigin) {
                    var token = getActiveToken();
                    if (token) {
                        var authVal = getEmbyAuthHeader(token);
                        var hdrs = this.__streamflixHeaders || {};
                        if (!hdrs['authorization']) {
                            origSetRequestHeader.call(this, 'Authorization', authVal);
                        }
                        if (!hdrs['x-emby-authorization']) {
                            origSetRequestHeader.call(this, 'X-Emby-Authorization', authVal);
                        }
                        if (!hdrs['x-emby-token']) {
                            origSetRequestHeader.call(this, 'X-Emby-Token', token);
                        }
                    }
                    if (this.__streamflixMethod === 'POST' && typeof bodyArg === 'string' && typeof onWatchPartyNativeProgressReport === 'function') {
                        var xUrlLow = String(this.__streamflixUrl || '').toLowerCase();
                        if (xUrlLow.indexOf('/sessions/playing') !== -1 && bodyArg.charAt(0) === '{') {
                            onWatchPartyNativeProgressReport(JSON.parse(bodyArg), xUrlLow);
                        }
                    }
                }
            } catch (e) {}
            return origSend.apply(this, arguments);
        };
    }

    function installJellyfin12FetchInterceptor() {
        installJellyfin12XhrInterceptor();
        if (!nativeFetch || window.__STREAMFLIX_FETCH_PATCHED__) {
            return;
        }
        window.__STREAMFLIX_FETCH_PATCHED__ = true;

        window.fetch = function (input, init) {
            var urlStr = '';
            try {
                urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));
            } catch (e) {}

            var isSameOrigin = isSafeSameOriginUrl(urlStr);

            var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();

            if (isSameOrigin && method === 'POST' && init && typeof init.body === 'string' && typeof onWatchPartyNativeProgressReport === 'function') {
                try {
                    var fUrlLow = String(urlStr || '').toLowerCase();
                    if (fUrlLow.indexOf('/sessions/playing') !== -1 && init.body.charAt(0) === '{') {
                        onWatchPartyNativeProgressReport(JSON.parse(init.body), fUrlLow);
                    }
                } catch (eProg) {}
            }

            if (isSameOrigin && method === 'GET' && typeof input === 'string') {
                urlStr = rewriteJellyfinItemsQueryUrl(urlStr);
                input = urlStr;
            }

            if (isSameOrigin && getActiveToken()) {
                init = init || {};
                var token = getActiveToken();
                var authVal = getEmbyAuthHeader(token);
                if (typeof Headers !== 'undefined' && init.headers instanceof Headers) {
                    init.headers.set('Authorization', authVal);
                    init.headers.set('X-Emby-Authorization', authVal);
                    init.headers.set('X-Emby-Token', token);
                } else if (typeof input !== 'string' && input && input.headers && typeof Headers !== 'undefined') {
                    var mergedHeaders = new Headers(input.headers);
                    if (init.headers) {
                        var extraHeaders = new Headers(init.headers);
                        extraHeaders.forEach(function (v, k) {
                            mergedHeaders.set(k, v);
                        });
                    }
                    mergedHeaders.set('Authorization', authVal);
                    mergedHeaders.set('X-Emby-Authorization', authVal);
                    mergedHeaders.set('X-Emby-Token', token);
                    init.headers = mergedHeaders;
                } else {
                    init.headers = buildJellyfinAuthHeaders(init.headers);
                }
            }

            return nativeFetch(input, init).then(function (res) {
                if (isSameOrigin && res && res.status === 401 && state.activeProfile && state.activeProfile.accessToken) {
                    var lowUrl = String(urlStr || '').toLowerCase();
                    if (lowUrl.indexOf('/streamflix/') === -1 && lowUrl.indexOf('/sessions/logout') === -1) {
                        clearLocalJellyfinAuth();
                        state.activeProfile = null;
                        state.sessionVerifiedOnce = false;
                        try {
                            localStorage.removeItem(PROFILE_KEY);
                            localStorage.removeItem(LEGACY_PROFILE_KEY);
                        } catch (e401) {}
                        fetchPublicConfig().then(function () {
                            scheduleLifecycleTick(0);
                        }).catch(function () {
                            scheduleLifecycleTick(0);
                        });
                    }
                }

                if (!isSameOrigin || method !== 'GET' || !res || !res.ok) {
                    return res;
                }

                var urlObj;
                try {
                    urlObj = new URL(urlStr, window.location.origin);
                } catch (e) {
                    return res;
                }

                var pathLower = (urlObj.pathname || '').toLowerCase();
                var isItemsEndpoint = pathLower === '/items' || (/^\/users\/[^/]+\/items$/i).test(urlObj.pathname);
                var isLatestEndpoint = pathLower === '/items/latest' || (/^\/users\/[^/]+\/items\/latest$/i).test(urlObj.pathname);

                if (!isItemsEndpoint && !isLatestEndpoint) {
                    return res;
                }

                var activeUid = getActiveUserId();

                if (isItemsEndpoint) {
                    var filters = urlObj.searchParams.get('Filters') || urlObj.searchParams.get('filters') || '';
                    var itemTypes = urlObj.searchParams.get('IncludeItemTypes') || urlObj.searchParams.get('includeItemTypes') || '';
                    if (filters || itemTypes === 'Episode' || itemTypes === 'Season') {
                        return res;
                    }

                    return res.clone().json().then(function (data) {
                        if (data && Array.isArray(data.Items) && data.Items.length > 0) {
                            stampServerIdOnItems(data);
                            return new Response(JSON.stringify(data), {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }

                        var sp1 = new URLSearchParams(urlObj.search);
                        if (activeUid && !sp1.has('userId') && !sp1.has('UserId')) {
                            sp1.set('userId', activeUid);
                        }
                        sp1.delete('recursive');
                        sp1.set('Recursive', 'true');

                        var authHeaders = buildJellyfinAuthHeaders();
                        return nativeFetch(apiBase() + '/Items?' + sp1.toString(), { headers: authHeaders })
                            .then(function (r1) { return r1.ok ? r1.json() : null; })
                            .then(function (d1) {
                                if (d1 && Array.isArray(d1.Items) && d1.Items.length > 0) {
                                    stampServerIdOnItems(d1);
                                    return new Response(JSON.stringify(d1), {
                                        status: 200,
                                        headers: { 'Content-Type': 'application/json' }
                                    });
                                }

                                var pid = sp1.get('ParentId') || sp1.get('parentId') || '';
                                if (pid && !isKnownTopLevelViewId(pid)) {
                                    return res;
                                }
                                var inferredType = inferItemTypesForParentOrRoute(pid, itemTypes);
                                if (!inferredType) {
                                    return res;
                                }

                                sp1.delete('ParentId');
                                sp1.delete('parentId');
                                sp1.set('IncludeItemTypes', inferredType);

                                return nativeFetch(apiBase() + '/Items?' + sp1.toString(), { headers: authHeaders })
                                    .then(function (r2) { return r2.ok ? r2.json() : null; })
                                    .then(function (d2) {
                                        if (d2 && Array.isArray(d2.Items) && d2.Items.length > 0) {
                                            stampServerIdOnItems(d2);
                                            return new Response(JSON.stringify(d2), {
                                                status: 200,
                                                headers: { 'Content-Type': 'application/json' }
                                            });
                                        }
                                        return res;
                                    });
                            })
                            .catch(function () {
                                return res;
                            });
                    }).catch(function () {
                        return res;
                    });
                }

                if (isLatestEndpoint) {
                    return res.clone().json().then(function (data) {
                        if (Array.isArray(data) && data.length > 0) {
                            stampServerIdOnItems(data);
                            return new Response(JSON.stringify(data), {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }

                        var spL = new URLSearchParams(urlObj.search);
                        var pid = spL.get('ParentId') || spL.get('parentId') || '';
                        var existingType = spL.get('IncludeItemTypes') || spL.get('includeItemTypes') || '';
                        var inferredType = inferItemTypesForParentOrRoute(pid, existingType) || 'Movie,Series';

                        if (activeUid && !spL.has('userId') && !spL.has('UserId')) {
                            spL.set('userId', activeUid);
                        }
                        spL.set('Recursive', 'true');
                        spL.set('IncludeItemTypes', inferredType);
                        spL.set('SortBy', 'DateCreated,SortName');
                        spL.set('SortOrder', 'Descending');

                        var authHeaders = buildJellyfinAuthHeaders();
                        return nativeFetch(apiBase() + '/Items?' + spL.toString(), { headers: authHeaders })
                            .then(function (rL1) { return rL1.ok ? rL1.json() : null; })
                            .then(function (dL1) {
                                if (dL1 && Array.isArray(dL1.Items) && dL1.Items.length > 0) {
                                    stampServerIdOnItems(dL1.Items);
                                    return new Response(JSON.stringify(dL1.Items), {
                                        status: 200,
                                        headers: { 'Content-Type': 'application/json' }
                                    });
                                }

                                if (!pid || !isKnownTopLevelViewId(pid)) {
                                    return res;
                                }

                                spL.delete('ParentId');
                                spL.delete('parentId');
                                return nativeFetch(apiBase() + '/Items?' + spL.toString(), { headers: authHeaders })
                                    .then(function (rL2) { return rL2.ok ? rL2.json() : null; })
                                    .then(function (dL2) {
                                        if (dL2 && Array.isArray(dL2.Items) && dL2.Items.length > 0) {
                                            stampServerIdOnItems(dL2.Items);
                                            return new Response(JSON.stringify(dL2.Items), {
                                                status: 200,
                                                headers: { 'Content-Type': 'application/json' }
                                            });
                                        }
                                        return res;
                                    });
                            })
                            .catch(function () {
                                return res;
                            });
                    }).catch(function () {
                        return res;
                    });
                }

                return res;
            });
        };
    }

    function patchJellyfinApiClientMethods() {
        try {
            var cmList = [];
            if (window.ConnectionManager) {
                cmList.push(window.ConnectionManager);
            }
            if (window.Emby && window.Emby.ConnectionManager && cmList.indexOf(window.Emby.ConnectionManager) === -1) {
                cmList.push(window.Emby.ConnectionManager);
            }
            for (var cIdx = 0; cIdx < cmList.length; cIdx++) {
                var cm = cmList[cIdx];
                if (cm && !cm.__streamflixPatched) {
                    cm.__streamflixPatched = true;
                    if (typeof cm.getApiClient === 'function') {
                        var origGetApiClient = cm.getApiClient.bind(cm);
                        cm.getApiClient = function (itemOrServerId) {
                            try {
                                var res = origGetApiClient(itemOrServerId);
                                if (res) {
                                    return res;
                                }
                            } catch (e) {}
                            return window.ApiClient || null;
                        };
                    }
                    if (typeof cm.getApi === 'function') {
                        var origGetApi = cm.getApi.bind(cm);
                        cm.getApi = function (itemOrServerId) {
                            try {
                                var apiRes = origGetApi(itemOrServerId);
                                if (apiRes) {
                                    return apiRes;
                                }
                            } catch (e) {}
                            return (window.ApiClient && window.ApiClient._sdk) || undefined;
                        };
                    }
                }
            }

            if (!window.ApiClient || window.ApiClient.__streamflixPatched) {
                return;
            }
            window.ApiClient.__streamflixPatched = true;

            if (typeof window.ApiClient.serverId === 'function') {
                var origServerId = window.ApiClient.serverId.bind(window.ApiClient);
                window.ApiClient.__origServerId = origServerId;
                window.ApiClient.serverId = function () {
                    var sid = origServerId();
                    return sid || (state.activeProfile && state.activeProfile.serverId) || (state.config && state.config.serverId) || '';
                };
            }

            if (typeof window.ApiClient.getCurrentUserId === 'function') {
                var origGetCurrentUserId = window.ApiClient.getCurrentUserId.bind(window.ApiClient);
                window.ApiClient.__origGetCurrentUserId = origGetCurrentUserId;
                window.ApiClient.getCurrentUserId = function () {
                    var uid = origGetCurrentUserId();
                    return uid || (state.activeProfile && state.activeProfile.jellyfinUserId) || '';
                };
            }

            if (typeof window.ApiClient.accessToken === 'function') {
                var origAccessToken = window.ApiClient.accessToken.bind(window.ApiClient);
                window.ApiClient.__origAccessToken = origAccessToken;
                window.ApiClient.accessToken = function () {
                    var tok = origAccessToken();
                    return tok || (state.activeProfile && state.activeProfile.accessToken) || '';
                };
            }

            if (typeof window.ApiClient.getItems === 'function') {
                var origGetItems = window.ApiClient.getItems.bind(window.ApiClient);
                window.ApiClient.getItems = function (userId, options) {
                    var opts = Object.assign({}, options || {});
                    if (opts.ParentId === 'undefined' || opts.ParentId === 'null') {
                        delete opts.ParentId;
                    }
                    if (opts.parentId === 'undefined' || opts.parentId === 'null') {
                        delete opts.parentId;
                    }
                    var uid = userId || getActiveUserId();
                    return origGetItems(uid, opts).then(function (res) {
                        if (res && Array.isArray(res.Items) && res.Items.length > 0) {
                            return stampServerIdOnItems(res);
                        }
                        if (opts.Filters || opts.IncludeItemTypes === 'Episode' || opts.IncludeItemTypes === 'Season') {
                            return res;
                        }
                        var qs = new URLSearchParams();
                        if (uid) {
                            qs.set('userId', String(uid));
                        }
                        Object.keys(opts).forEach(function (k) {
                            if (opts[k] !== undefined && opts[k] !== null && k.toLowerCase() !== 'userid') {
                                qs.set(k, String(opts[k]));
                            }
                        });
                        qs.set('Recursive', 'true');
                        return apiFetch('/Items?' + qs.toString()).then(function (d1) {
                            if (d1 && Array.isArray(d1.Items) && d1.Items.length > 0) {
                                return stampServerIdOnItems(d1);
                            }
                            var pid = qs.get('ParentId') || qs.get('parentId') || '';
                            if (pid && !isKnownTopLevelViewId(pid)) {
                                return res;
                            }
                            var inferredType = inferItemTypesForParentOrRoute(pid, qs.get('IncludeItemTypes'));
                            if (!inferredType) {
                                return res;
                            }
                            qs.delete('ParentId');
                            qs.delete('parentId');
                            qs.set('IncludeItemTypes', inferredType);
                            return apiFetch('/Items?' + qs.toString()).then(function (d2) {
                                return (d2 && Array.isArray(d2.Items) && d2.Items.length > 0) ? stampServerIdOnItems(d2) : res;
                            });
                        }).catch(function () {
                            return res;
                        });
                    });
                };
            }

            if (typeof window.ApiClient.getLatestItems === 'function') {
                var origGetLatest = window.ApiClient.getLatestItems.bind(window.ApiClient);
                window.ApiClient.getLatestItems = function (options) {
                    return origGetLatest(options).then(function (res) {
                        if (Array.isArray(res) && res.length > 0) {
                            return stampServerIdOnItems(res);
                        }
                        var opts = options || {};
                        var pid = opts.ParentId || opts.parentId || '';
                        var inferredType = inferItemTypesForParentOrRoute(pid, opts.IncludeItemTypes) || 'Movie,Series';
                        var qs = new URLSearchParams();
                        var uid = getActiveUserId();
                        if (uid) {
                            qs.set('userId', String(uid));
                        }
                        qs.set('Recursive', 'true');
                        qs.set('IncludeItemTypes', inferredType);
                        qs.set('SortBy', 'DateCreated,SortName');
                        qs.set('SortOrder', 'Descending');
                        qs.set('Limit', String(opts.Limit || 16));
                        if (opts.Fields) {
                            qs.set('Fields', String(opts.Fields));
                        }
                        return apiFetch('/Items?' + qs.toString()).then(function (d) {
                            return (d && Array.isArray(d.Items) && d.Items.length > 0) ? stampServerIdOnItems(d.Items) : res;
                        }).catch(function () {
                            return res;
                        });
                    });
                };
            }
        } catch (e) {}
    }

    function resolveKnownServerId(preferredServerId) {
        if (preferredServerId) {
            return preferredServerId;
        }
        if (state.activeProfile && state.activeProfile.serverId) {
            return state.activeProfile.serverId;
        }
        if (state.config && state.config.serverId) {
            return state.config.serverId;
        }
        try {
            var sidFn = window.ApiClient && (window.ApiClient.__origServerId || window.ApiClient.serverId);
            if (typeof sidFn === 'function') {
                var sid = sidFn.call(window.ApiClient);
                if (sid) {
                    return sid;
                }
            }
            var creds = JSON.parse(localStorage.getItem('jellyfin_credentials') || '{"Servers":[]}');
            if (creds && Array.isArray(creds.Servers) && creds.Servers.length > 0 && creds.Servers[0].Id) {
                return creds.Servers[0].Id;
            }
        } catch (e) {}
        return '';
    }

    function applyJellyfinServerCredentials(authPayload) {
        if (!authPayload || !authPayload.accessToken || !authPayload.userId) {
            return;
        }

        var serverId = resolveKnownServerId(authPayload.serverId);
        var address = apiBase();

        try {
            localStorage.setItem('enableAutoLogin', 'true');

            var raw = localStorage.getItem('jellyfin_credentials');
            var creds = raw ? JSON.parse(raw) : { Servers: [] };
            if (!Array.isArray(creds.Servers)) {
                creds.Servers = [];
            }

            if (creds.Servers.length === 0) {
                creds.Servers.push({
                    ManualAddress: address,
                    LocalAddress: address,
                    manualAddressOnly: true,
                    LastConnectionMode: 2,
                    Id: serverId,
                    Name: (state.config && state.config.serverName) || 'StreamFlix',
                    UserId: authPayload.userId,
                    AccessToken: authPayload.accessToken,
                    DateLastAccessed: Date.now()
                });
            } else {
                for (var i = 0; i < creds.Servers.length; i++) {
                    var srv = creds.Servers[i];
                    srv.ManualAddress = srv.ManualAddress || address;
                    srv.LocalAddress = srv.LocalAddress || address;
                    srv.manualAddressOnly = true;
                    srv.LastConnectionMode = 2;
                    if (serverId) {
                        srv.Id = serverId;
                    }
                    srv.UserId = authPayload.userId;
                    srv.AccessToken = authPayload.accessToken;
                    srv.DateLastAccessed = Date.now();
                }
            }

            localStorage.setItem('jellyfin_credentials', JSON.stringify(creds));
        } catch (e) {}

        try {
            if (window.ApiClient) {
                if (window.ApiClient._serverInfo) {
                    if (serverId) {
                        window.ApiClient._serverInfo.Id = serverId;
                    }
                    window.ApiClient._serverInfo.UserId = authPayload.userId;
                    window.ApiClient._serverInfo.AccessToken = authPayload.accessToken;
                    window.ApiClient._serverInfo.ManualAddress = window.ApiClient._serverInfo.ManualAddress || address;
                    window.ApiClient._serverInfo.LocalAddress = window.ApiClient._serverInfo.LocalAddress || address;
                }
                try {
                    if (typeof window.ApiClient.setAuthenticationInfo === 'function') {
                        window.ApiClient.setAuthenticationInfo(authPayload.accessToken, authPayload.userId);
                    }
                } catch (eAuth) {}
                // NOTE: In @jellyfin/sdk, Api.prototype.accessToken is a getter-only property!
                // Never assign window.ApiClient._sdk.accessToken = ... directly in strict mode; call _sdk.update() instead.
                try {
                    if (window.ApiClient._sdk && typeof window.ApiClient._sdk.update === 'function') {
                        window.ApiClient._sdk.update({
                            basePath: address,
                            accessToken: authPayload.accessToken
                        });
                    }
                } catch (eSdk) {}
                if (authPayload.user) {
                    if (serverId && !authPayload.user.ServerId) {
                        authPayload.user.ServerId = serverId;
                    }
                    window.ApiClient._currentUser = authPayload.user;
                    try {
                        if (typeof window.ApiClient.onAuthenticated === 'function') {
                            window.ApiClient.onAuthenticated(window.ApiClient, {
                                User: authPayload.user,
                                SessionInfo: authPayload.sessionInfo || null,
                                AccessToken: authPayload.accessToken,
                                ServerId: serverId || (authPayload.user && authPayload.user.ServerId) || ''
                            });
                        }
                    } catch (eOnAuth) {}
                } else if (window.ApiClient._currentUser && normalizeGuid(window.ApiClient._currentUser.Id) !== normalizeGuid(authPayload.userId)) {
                    window.ApiClient._currentUser = null;
                }
            }
        } catch (e) {}
    }

    function sanitizeHexColor(raw, fallback) {
        var s = String(raw == null ? '' : raw).trim();
        return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s) ? s : (fallback || '#E50914');
    }

    function normalizeProfileModel(p, index) {
        p = p || {};
        var idx = typeof index === 'number' ? index : 0;
        var color = sanitizeHexColor(p.avatarColorHex || p.color, AVATAR_COLORS[idx % AVATAR_COLORS.length]);
        var icon = String(p.avatarEmoji || p.icon || (p.isKids ? '🦊' : AVATAR_ICONS[idx % AVATAR_ICONS.length])).slice(0, 16);
        var googleLocked = Boolean(p.googleLocked || p.googleAccountEmail);
        return {
            id: p.id || ('streamflix_profile_' + idx),
            name: p.name || ('Profile ' + (idx + 1)),
            color: color,
            icon: icon,
            avatarColorIndex: typeof p.avatarColorIndex === 'number' ? p.avatarColorIndex : 0,
            avatarIconIndex: typeof p.avatarIconIndex === 'number' ? p.avatarIconIndex : 0,
            isKids: Boolean(p.isKids),
            kidsExitPinRequired: p.kidsExitPinRequired !== false,
            isAdmin: Boolean(p.isAdmin),
            isOwner: Boolean(p.isOwner || p.id === 'streamflix_owner'),
            autoplayNextEpisode: p.autoplayNextEpisode !== false,
            maxParentalRating: p.maturityRating || p.maxParentalRating || (p.isKids ? 'Older Kids (TV-Y7 / PG)' : 'TV-MA / R (All Maturity Levels)'),
            hasPin: Boolean(p.hasPin),
            pinLength: typeof p.pinLength === 'number' ? p.pinLength : 0,
            googleLocked: googleLocked,
            accountLockKind: String(p.accountLockKind || '').toLowerCase(),
            googleAccountEmail: p.googleAccountEmail || '',
            googleAccountHint: p.googleAccountHint || '',
            googleLockSatisfied: googleLocked ? Boolean(p.googleLockSatisfied) : true,
            jellyfinUserId: p.jellyfinUserId || '',
            jellyfinUsername: p.jellyfinUsername || p.name || ''
        };
    }

    /* Household session (issued by /StreamFlix/VerifyGoogle, /Auth/StandardLogin, /Auth/AdminLogin, or /Guest/*; HMAC-signed by the server) */
    function loadHouseholdSession() {
        var s = loadJson(GOOGLE_KEY, null);
        if (!s || !s.token || (!s.email && !s.username && s.authKind !== 'guest_pass')) {
            return null;
        }
        if (s.expiresAt && Date.parse(s.expiresAt) < Date.now()) {
            saveJson(GOOGLE_KEY, null);
            return null;
        }
        return s;
    }

    function setHouseholdSession(session) {
        state.googleUser = session;
        saveJson(GOOGLE_KEY, session);
    }

    function clearHouseholdSession() {
        state.googleUser = null;
        saveJson(GOOGLE_KEY, null);
    }

    function isOpenWithoutLogin(cfg) {
        cfg = cfg || state.config;
        if (!cfg) {
            return false;
        }
        return Boolean(cfg.bypassLoginGateOnLan && cfg.isLocalLan);
    }

    function hasHouseholdAccess() {
        var cfg = state.config;
        if (!cfg || isOpenWithoutLogin(cfg)) {
            return true;
        }
        if (cfg.hasAccess) {
            return true;
        }
        // Until the server has answered, trust a locally stored (unexpired) session token
        return !state.configFresh && Boolean(state.googleUser && state.googleUser.token);
    }

    function isGuestPassSession() {
        return Boolean(
            (state.config && state.config.isGuestPass)
            || (state.googleUser && state.googleUser.authKind === 'guest_pass')
        );
    }

    function areGuestPassesEnabled() {
        return !(state.config && state.config.enableGuestPasses === false);
    }

    function isCurrentProfileSeerrAllowed() {
        var cfg = state.config;
        if (!cfg || !cfg.seerrEnabled) {
            return false;
        }
        if (isGuestPassSession() && !cfg.seerrAllowGuests) {
            return false;
        }
        if (state.activeProfile && state.activeProfile.isKids && !cfg.seerrAllowKids) {
            return false;
        }
        return Boolean(state.activeProfile && state.activeProfile.id);
    }

    function clearShowcaseAndMediaCaches() {
        try { localStorage.removeItem(SHOWCASE_ITEMS_KEY); } catch (e) {}
        state.itemCache = {};
        state.seerrSearchResults = null;
        state.seerrSearchLoading = false;
        state.ambientCache = {};
        state.personalRowsByUser = {};
        if (state.hubData) {
            state.hubData.heroItems = [];
            state.hubData.filteredHeroPool = [];
            state.hubData.popularScores = {};
            state.hubData.top10Items = [];
            state.hubData.allMovies = [];
            state.hubData.allSeries = [];
            state.hubData.resumeItems = [];
            state.hubData.favoriteItems = [];
            state.hubData.recentMovies = [];
            state.hubData.recentSeries = [];
        }
        if (state.config) {
            state.config.showcaseItems = [];
            state.config.serverUsers = [];
            state.config.approvedGoogleAccounts = [];
            state.config.approvedOidcUsers = [];
        }
    }

    function handleHouseholdSessionLost() {
        var hadSession = Boolean(state.googleUser && state.googleUser.token);
        var wasGuest = isGuestPassSession();
        clearHouseholdSession();
        var openAccess = isOpenWithoutLogin(state.config);
        if (state.config) {
            state.config.hasAccess = openAccess;
            state.config.session = null;
            state.config.isAdmin = false;
            state.config.isGuestPass = false;
            state.config.guestPassLabel = '';
            state.config.guestPassExpiresAt = null;
            state.config.lockedProfileId = null;
            if (!openAccess) {
                clearShowcaseAndMediaCaches();
            }
        }
        if (state.verifyingGoogle || !state.config || openAccess) {
            return;
        }
        state.activatingProfileId = null;
        renderGoogleAuthGate(null, hadSession
            ? (wasGuest ? 'Your Guest Pass has expired or was revoked.' : 'Your sign-in expired. Please sign in again.')
            : null);
    }

    function applyConfigFromServerResponse(cfg) {
        if (!cfg || typeof cfg !== 'object') {
            return state.config;
        }
        var prevCfg = state.config || DEFAULT_CONFIG;
        var rawProfiles = Array.isArray(cfg.profiles) ? cfg.profiles : [];
        var normalizedProfiles = rawProfiles.map(function (p, i) {
            return normalizeProfileModel(p, i);
        });
        var requireGoogle = true;
        var isLocalLan = Boolean(cfg.isLocalLan);
        var bypassLan = Boolean(cfg.bypassLoginGateOnLan);
        var resolvedAccess = Boolean(cfg.hasAccess) || (bypassLan && isLocalLan);
        var serverShowcase = [];
        if (resolvedAccess) {
            serverShowcase = Array.isArray(cfg.showcaseItems) && cfg.showcaseItems.length > 0
                ? cfg.showcaseItems
                : ((prevCfg && Array.isArray(prevCfg.showcaseItems)) ? prevCfg.showcaseItems : []);
            if (serverShowcase.length > 0) {
                saveJson(SHOWCASE_ITEMS_KEY, serverShowcase);
            }
        } else {
            try { localStorage.removeItem(SHOWCASE_ITEMS_KEY); } catch (e) {}
        }

        var nextHeroLibs = Array.isArray(cfg.heroLibraryIds)
            ? cfg.heroLibraryIds.map(function (x) { return String(x || '').trim(); }).filter(Boolean)
            : [];
        var prevHeroLibsSig = Array.isArray(prevCfg.heroLibraryIds) ? prevCfg.heroLibraryIds.join(',') : '';
        var nextHeroLibsSig = nextHeroLibs.join(',');

        var nextTop10Mode = String(cfg.top10SelectionMode || 'most_played').toLowerCase();
        var nextHeroRot = cfg.heroRotationSeconds !== undefined && cfg.heroRotationSeconds !== null
            ? Math.max(0, Math.min(120, Number(cfg.heroRotationSeconds) || 0))
            : 9;
        var nextHeroCount = Math.max(1, Math.min(15, Number(cfg.heroSlideCount) || 8));
        var nextHeroSel = String(cfg.heroSelectionMode || 'recent').toLowerCase();
        var nextHeroType = String(cfg.heroContentType || 'all').toLowerCase();

        var hubSettingsChanged = prevCfg.top10SelectionMode !== nextTop10Mode
            || prevCfg.heroRotationSeconds !== nextHeroRot
            || prevCfg.heroSlideCount !== nextHeroCount
            || prevCfg.heroSelectionMode !== nextHeroSel
            || prevCfg.heroContentType !== nextHeroType
            || prevHeroLibsSig !== nextHeroLibsSig;

        state.configFresh = true;
        state.configAttempted = true;
        state.config = {
            version: cfg.version || '',
            assetVersion: cfg.assetVersion || cfg.version || VERSION,
            serverId: cfg.serverId || (prevCfg && prevCfg.serverId) || '',
            serverName: cfg.serverName || 'StreamFlix',
            customBrandName: typeof cfg.customBrandName === 'string' ? cfg.customBrandName.trim() : '',
            enableStreamFlixUi: cfg.enableStreamFlixUi !== false,
            requireGoogleAuth: requireGoogle,
            enableGoogleSignIn: cfg.enableGoogleSignIn !== false,
            enableCustomOidc: Boolean(cfg.enableCustomOidc),
            oidcConfigured: Boolean(cfg.oidcConfigured),
            oidcProviderName: (typeof cfg.oidcProviderName === 'string' && cfg.oidcProviderName.trim()) ? cfg.oidcProviderName.trim() : 'Single Sign-On',
            oidcRequireAllowlist: Boolean(cfg.oidcRequireAllowlist),
            hasOidcClientSecret: Boolean(cfg.hasOidcClientSecret),
            allowStandardJellyfinLogin: Boolean(cfg.allowStandardJellyfinLogin),
            allowAdminFallbackLogin: Boolean(cfg.allowAdminFallbackLogin),
            adminFallbackLanOnly: Boolean(cfg.adminFallbackLanOnly),
            bypassLoginGateOnLan: bypassLan,
            isLocalLan: isLocalLan,
            canShowAdminFallback: cfg.canShowAdminFallback !== undefined
                ? Boolean(cfg.canShowAdminFallback)
                : (Boolean(cfg.allowAdminFallbackLogin) && (!cfg.adminFallbackLanOnly || isLocalLan)),
            googleClientId: cfg.googleClientId || '',
            googleConfigured: cfg.googleConfigured !== undefined ? Boolean(cfg.googleConfigured) : Boolean(cfg.googleClientId),
            hasGoogleClientSecret: Boolean(cfg.hasGoogleClientSecret),
            hasAccess: resolvedAccess,
            isAdmin: Boolean(cfg.isAdmin),
            enableGuestPasses: cfg.enableGuestPasses !== false,
            enableWatchTogether: cfg.enableWatchTogether !== false,
            hasAnyAdultPin: Boolean(cfg.hasAnyAdultPin),
            isGuestPass: Boolean(cfg.isGuestPass),
            guestPassLabel: typeof cfg.guestPassLabel === 'string' ? cfg.guestPassLabel : '',
            guestPassExpiresAt: cfg.guestPassExpiresAt || null,
            lockedProfileId: cfg.lockedProfileId || null,
            seerrEnabled: Boolean(cfg.seerrEnabled),
            seerrAllowKids: Boolean(cfg.seerrAllowKids),
            seerrAllowGuests: Boolean(cfg.seerrAllowGuests),
            session: cfg.session || null,
            top10SelectionMode: nextTop10Mode,
            heroRotationSeconds: nextHeroRot,
            heroSlideCount: nextHeroCount,
            heroSelectionMode: nextHeroSel,
            heroContentType: nextHeroType,
            heroLibraryIds: nextHeroLibs,
            approvedGoogleAccounts: Array.isArray(cfg.approvedGoogleAccounts) ? cfg.approvedGoogleAccounts : [],
            approvedOidcUsers: Array.isArray(cfg.approvedOidcUsers) ? cfg.approvedOidcUsers : [],
            serverUsers: Array.isArray(cfg.serverUsers) ? cfg.serverUsers : [],
            showcaseItems: serverShowcase,
            profiles: normalizedProfiles
        };

        // A token the server no longer accepts has expired or been revoked ("Sign out all devices")
        if (state.googleUser && state.googleUser.token) {
            if (!cfg.session) {
                clearHouseholdSession();
            } else {
                var sessionUpdated = false;
                if (cfg.session.expiresAt && cfg.session.expiresAt !== state.googleUser.expiresAt) {
                    state.googleUser.expiresAt = cfg.session.expiresAt;
                    sessionUpdated = true;
                }
                if (cfg.session.authKind && cfg.session.authKind !== state.googleUser.authKind) {
                    state.googleUser.authKind = cfg.session.authKind;
                    sessionUpdated = true;
                }
                if (cfg.session.username && cfg.session.username !== state.googleUser.username) {
                    state.googleUser.username = cfg.session.username;
                    sessionUpdated = true;
                }
                if (cfg.session.providerName && cfg.session.providerName !== state.googleUser.providerName) {
                    state.googleUser.providerName = cfg.session.providerName;
                    sessionUpdated = true;
                }
                if (cfg.session.guestPassId && cfg.session.guestPassId !== state.googleUser.guestPassId) {
                    state.googleUser.guestPassId = cfg.session.guestPassId;
                    sessionUpdated = true;
                }
                if (cfg.session.lockedProfileId && cfg.session.lockedProfileId !== state.googleUser.lockedProfileId) {
                    state.googleUser.lockedProfileId = cfg.session.lockedProfileId;
                    sessionUpdated = true;
                }
                if (sessionUpdated) {
                    saveJson(GOOGLE_KEY, state.googleUser);
                }
            }
        }

        if (!resolvedAccess) {
            if (state.activeProfile) {
                state.activeProfile = null;
                state.sessionVerifiedOnce = false;
                try {
                    localStorage.removeItem(PROFILE_KEY);
                    localStorage.removeItem(LEGACY_PROFILE_KEY);
                } catch (eProf) {}
            }
            clearLocalJellyfinAuth();
            scheduleLifecycleTick(0);
        }

        if (state.config.assetVersion) {
            clearStaleHtmlCaches(state.config.assetVersion);
            neutralizeConflictingBrandingCss();
        }

        saveJson(CACHED_CONFIG_KEY, state.config);
        var wm = document.querySelector('#streamflix-overlay-root .streamflix-wordmark');
        if (wm) {
            wm.textContent = getBrandLogoText();
        }
        replaceToolbarLogoInPlace();
        refreshNetflixBackdropWallInPlace();

        if (hubSettingsChanged && state.hubData && state.hubData.loaded) {
            if (prevHeroLibsSig !== nextHeroLibsSig) {
                loadCinemaHubData(true);
            } else {
                recomputeHubDerivedLists();
                if (document.getElementById('streamflix-cinema-hub')) {
                    renderCinemaHubContents();
                    restartHeroTimer();
                }
            }
        }
        return state.config;
    }
