/* StreamFlix Client (08/14) — Cinema Hub, Hero Billboard, Top 10 & Live Search */
    /* ----------------------------------------------------------------------
       6. FULL STREAMFLIX CINEMA HUB (Hero Billboard, Live Search, Top 10 & Carousels)
       ---------------------------------------------------------------------- */
    function isOnHomeRoute() {
        var h = (window.location.hash || '').toLowerCase();
        return h === '' || h === '#' || h === '#/' || h === '#!/' || h.indexOf('#/home') === 0 || h.indexOf('#!/home') === 0;
    }

    function getJellyfinAuthContext() {
        var userId = (state.activeProfile && state.activeProfile.jellyfinUserId)
            || (window.ApiClient && typeof window.ApiClient.getCurrentUserId === 'function' ? window.ApiClient.getCurrentUserId() : null);
        var token = (state.activeProfile && state.activeProfile.accessToken)
            || (window.ApiClient && typeof window.ApiClient.accessToken === 'function' ? window.ApiClient.accessToken() : null);
        return { userId: userId, token: token };
    }

    function getItemBackdropUrl(item, maxWidth) {
        if (!item) {
            return '';
        }
        var w = maxWidth || 1280;
        if (item.BackdropImageTags && item.BackdropImageTags.length > 0) {
            return apiBase() + '/Items/' + encodeURIComponent(item.Id) + '/Images/Backdrop/0?maxWidth=' + w + '&quality=85';
        }
        if (item.ParentBackdropItemId && (!item.ParentBackdropImageTags || item.ParentBackdropImageTags.length > 0)) {
            return apiBase() + '/Items/' + encodeURIComponent(item.ParentBackdropItemId) + '/Images/Backdrop/0?maxWidth=' + w + '&quality=85';
        }
        if (item.Type === 'Episode' && item.ImageTags && item.ImageTags.Primary) {
            return apiBase() + '/Items/' + encodeURIComponent(item.Id) + '/Images/Primary?maxWidth=' + w + '&quality=85';
        }
        if (item.ImageTags && item.ImageTags.Thumb) {
            return apiBase() + '/Items/' + encodeURIComponent(item.Id) + '/Images/Thumb?maxWidth=' + w + '&quality=85';
        }
        if (item.SeriesId) {
            return apiBase() + '/Items/' + encodeURIComponent(item.SeriesId) + '/Images/Backdrop/0?maxWidth=' + w + '&quality=85';
        }
        return apiBase() + '/Items/' + encodeURIComponent(item.Id) + '/Images/Primary?maxWidth=' + w + '&quality=85';
    }

    function getItemPosterUrl(item, maxWidth) {
        if (!item) {
            return '';
        }
        var w = maxWidth || 420;
        var targetId = (item.Type === 'Episode' && item.SeriesId) ? item.SeriesId : item.Id;
        return apiBase() + '/Items/' + encodeURIComponent(targetId) + '/Images/Primary?maxWidth=' + w + '&quality=85';
    }

    function formatRuntimeTicks(ticks) {
        if (!ticks || ticks <= 0) {
            return '';
        }
        var totalMins = Math.round(ticks / 600000000);
        if (totalMins < 60) {
            return totalMins + 'm';
        }
        var hrs = Math.floor(totalMins / 60);
        var mins = totalMins % 60;
        return hrs + 'h ' + (mins > 0 ? mins + 'm' : '');
    }

    function toggleFavoriteItem(item, btnEl) {
        var auth = getJellyfinAuthContext();
        if (!auth.userId || !auth.token || !item || !item.Id) {
            return;
        }
        var uid = encodeURIComponent(auth.userId);
        var iid = encodeURIComponent(item.Id);
        var isFav = item.UserData && item.UserData.IsFavorite;
        var method = isFav ? 'DELETE' : 'POST';
        apiFetch('/UserFavoriteItems/' + iid + '?userId=' + uid, {
            method: method
        }).catch(function () {
            return apiFetch('/Users/' + uid + '/FavoriteItems/' + iid, {
                method: method
            });
        }).then(function (userData) {
            item.UserData = userData || item.UserData || {};
            item.UserData.IsFavorite = !isFav;
            if (btnEl) {
                btnEl.classList.toggle('active', item.UserData.IsFavorite);
                btnEl.innerHTML = item.UserData.IsFavorite ? icon('check') : icon('plus');
                btnEl.title = item.UserData.IsFavorite ? 'Remove from My List' : 'Add to My List';
            }
            if (state.personalRowsByUser && auth.userId) {
                delete state.personalRowsByUser[auth.userId];
            }
            loadCinemaHubData(true);
        }).catch(function () {});
    }

    function togglePlayedItem(item, btnEl) {
        var auth = getJellyfinAuthContext();
        if (!auth.userId || !auth.token || !item || !item.Id) {
            return;
        }
        var uid = encodeURIComponent(auth.userId);
        var iid = encodeURIComponent(item.Id);
        var isPlayed = item.UserData && item.UserData.Played;
        var method = isPlayed ? 'DELETE' : 'POST';
        apiFetch('/UserPlayedItems/' + iid + '?userId=' + uid, {
            method: method
        }).catch(function () {
            return apiFetch('/Users/' + uid + '/PlayedItems/' + iid, {
                method: method
            });
        }).then(function (userData) {
            item.UserData = userData || item.UserData || {};
            item.UserData.Played = !isPlayed;
            if (btnEl) {
                btnEl.classList.toggle('active', item.UserData.Played);
            }
            if (state.personalRowsByUser && auth.userId) {
                delete state.personalRowsByUser[auth.userId];
            }
            loadCinemaHubData(true);
        }).catch(function () {});
    }

    function syncServerPlaybackPosition(itemId, ticks, fallbackUnplayed) {
        var auth = getJellyfinAuthContext();
        if (!auth.userId || !auth.token || !itemId) {
            return Promise.resolve();
        }
        var uid = encodeURIComponent(auth.userId);
        var iid = encodeURIComponent(itemId);
        var payload = JSON.stringify({ PlaybackPositionTicks: Math.max(0, Math.round(Number(ticks) || 0)) });
        var reqOpts = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        };
        return apiFetch('/Users/' + uid + '/Items/' + iid + '/UserData', reqOpts)
            .catch(function () {
                return apiFetch('/Items/' + iid + '/UserData?userId=' + uid, reqOpts);
            })
            .catch(function () {
                if (fallbackUnplayed && !ticks) {
                    return apiFetch('/UserPlayedItems/' + iid + '?userId=' + uid, { method: 'DELETE' });
                }
            })
            .catch(function () {});
    }

    function removeFromContinueWatching(item) {
        if (!item || !item.Id) {
            return;
        }
        var ud = item.UserData || {};
        var prevTicks = Number(ud.PlaybackPositionTicks) || 0;
        var prevPct = Number(ud.PlayedPercentage) || 0;
        var wasPlayed = Boolean(ud.Played);
        var normId = normalizeGuid(item.Id);
        var resumeList = (state.hubData && Array.isArray(state.hubData.resumeItems)) ? state.hubData.resumeItems : [];
        var prevIndex = -1;
        for (var i = 0; i < resumeList.length; i++) {
            if (resumeList[i] && normalizeGuid(resumeList[i].Id) === normId) {
                prevIndex = i;
                if (!prevTicks && resumeList[i].UserData) {
                    prevTicks = Number(resumeList[i].UserData.PlaybackPositionTicks) || 0;
                    prevPct = Number(resumeList[i].UserData.PlayedPercentage) || prevPct;
                }
                break;
            }
        }

        hidePreviewNow();

        var assignUserData = function (target, patchObj) {
            if (!target) {
                return;
            }
            var nextUd = {};
            var srcUd = target.UserData || {};
            Object.keys(srcUd).forEach(function (k) { nextUd[k] = srcUd[k]; });
            Object.keys(patchObj).forEach(function (k) { nextUd[k] = patchObj[k]; });
            target.UserData = nextUd;
        };
        var clearItemProgress = function (target) {
            if (target && target.UserData) {
                assignUserData(target, { PlaybackPositionTicks: 0, PlayedPercentage: 0 });
            }
        };
        clearItemProgress(item);
        if (state.itemCache[item.Id]) {
            clearItemProgress(state.itemCache[item.Id]);
        }
        if (state.hubData && Array.isArray(state.hubData.resumeItems)) {
            state.hubData.resumeItems = state.hubData.resumeItems.filter(function (x) {
                if (x && normalizeGuid(x.Id) === normId) {
                    clearItemProgress(x);
                    return false;
                }
                return true;
            });
        }
        renderCinemaHubContents();
        syncServerPlaybackPosition(item.Id, 0, !wasPlayed);

        var displayName = item.SeriesName ? (item.SeriesName + (item.Name ? ' · ' + item.Name : '')) : (item.Name || 'Title');
        showActionToast('Removed “' + displayName + '” from Continue Watching', 'Undo', function () {
            var restoreProgress = function (target) {
                if (!target) {
                    return;
                }
                var nextTicks = prevTicks || 6000000000;
                var nextPct = prevPct > 0
                    ? prevPct
                    : (target.RunTimeTicks > 0 && nextTicks > 0
                        ? Math.min(99, Math.max(2, Math.round(nextTicks / target.RunTimeTicks * 100)))
                        : 25);
                assignUserData(target, { PlaybackPositionTicks: nextTicks, PlayedPercentage: nextPct });
            };
            restoreProgress(item);
            if (state.itemCache[item.Id]) {
                restoreProgress(state.itemCache[item.Id]);
            }
            if (state.hubData) {
                var cur = Array.isArray(state.hubData.resumeItems) ? state.hubData.resumeItems.slice() : [];
                var exists = cur.some(function (x) { return x && normalizeGuid(x.Id) === normId; });
                if (!exists) {
                    var insertAt = prevIndex >= 0 ? Math.min(prevIndex, cur.length) : 0;
                    cur.splice(insertAt, 0, item);
                    state.hubData.resumeItems = cur;
                }
            }
            renderCinemaHubContents();
            syncServerPlaybackPosition(item.Id, prevTicks || 6000000000, false);
            showToast('Restored “' + displayName + '”', 'success', 2400);
        }, 5000);
    }

    function showPlaybackLoader(labelText) {
        try {
            document.body.classList.add('streamflix-autoplaying');
            var loader = document.getElementById('streamflix-playback-loader');
            if (!loader) {
                loader = document.createElement('div');
                loader.id = 'streamflix-playback-loader';
                loader.innerHTML = ''
                    + '<div class="streamflix-spinner-ring"></div>'
                    + '<div class="streamflix-loader-text" style="font-size:15px;font-weight:700;letter-spacing:0.4px;color:#e5e5e5;">'
                    + escapeHtml(labelText || 'Starting playback…')
                    + '</div>';
                document.body.appendChild(loader);
            }
            if (state.loaderSafetyTimeout) {
                clearTimeout(state.loaderSafetyTimeout);
            }
            state.loaderSafetyTimeout = setTimeout(function () {
                hidePlaybackLoader();
            }, 8000);
        } catch (e) {}
    }

    function hidePlaybackLoader() {
        state.autoPlayPending = null;
        if (state.autoPlayTimer) {
            clearInterval(state.autoPlayTimer);
            state.autoPlayTimer = null;
        }
        if (state.shortcutPollTimer) {
            clearInterval(state.shortcutPollTimer);
            state.shortcutPollTimer = null;
        }
        if (state.loaderSafetyTimeout) {
            clearTimeout(state.loaderSafetyTimeout);
            state.loaderSafetyTimeout = null;
        }
        document.body.classList.remove('streamflix-autoplaying');
        var loader = document.getElementById('streamflix-playback-loader');
        if (loader && loader.parentNode) {
            loader.parentNode.removeChild(loader);
        }
    }

    function findCachedItemById(itemId) {
        if (!itemId) {
            return null;
        }
        if (state.itemCache && state.itemCache[itemId]) {
            return state.itemCache[itemId];
        }
        var norm = normalizeGuid(itemId);
        var d = state.hubData || {};
        var lists = [
            d.heroItems, d.resumeItems, d.nextUpItems, d.top10Items,
            d.favoriteItems, d.recentMovies, d.recentSeries,
            d.allMovies, d.allSeries, d.collectionsItems,
            state.searchResults, state.browseFilter && state.browseFilter.items
        ];
        for (var i = 0; i < lists.length; i++) {
            var arr = lists[i];
            if (!Array.isArray(arr)) {
                continue;
            }
            for (var j = 0; j < arr.length; j++) {
                if (arr[j] && normalizeGuid(arr[j].Id) === norm) {
                    return arr[j];
                }
            }
        }
        return null;
    }

    function resolvePlayableItem(itemOrId) {
        var initialObj = (itemOrId && typeof itemOrId === 'object') ? itemOrId : null;
        var rawId = typeof itemOrId === 'string' ? itemOrId : (initialObj && initialObj.Id);
        if (!rawId) {
            return Promise.resolve(null);
        }

        var cached = initialObj || findCachedItemById(rawId);
        var itemPromise = (cached && cached.Type)
            ? Promise.resolve(cached)
            : fetchFullItemDetails(rawId).catch(function () { return cached || { Id: rawId, Type: 'Movie' }; });

        return itemPromise.then(function (item) {
            if (!item || !item.Id) {
                return { Id: rawId, Type: 'Movie', ServerId: resolveKnownServerId() };
            }
            if (!item.ServerId) {
                item.ServerId = resolveKnownServerId();
            }

            var auth = getJellyfinAuthContext();
            var uid = auth && auth.userId ? encodeURIComponent(auth.userId) : '';
            var t = (item.Type || '').toLowerCase();

            // If item is a TV Series or Season, resolve the concrete Episode to play (Resumable -> NextUp -> First Episode)
            if ((t === 'series' || t === 'season') && uid) {
                var seriesId = t === 'series' ? item.Id : (item.SeriesId || item.Id);
                return fetchUserItems(uid, 'ParentId=' + encodeURIComponent(item.Id) + '&Recursive=true&IncludeItemTypes=Episode&Filters=IsResumable&SortBy=DatePlayed&SortOrder=Descending&Limit=1')
                    .then(function (resResume) {
                        if (resResume && Array.isArray(resResume.Items) && resResume.Items.length > 0) {
                            return resResume.Items[0];
                        }
                        if (t === 'series') {
                            return apiFetch('/Shows/NextUp?userId=' + uid + '&SeriesId=' + encodeURIComponent(seriesId) + '&Limit=1')
                                .then(function (resNext) {
                                    if (resNext && Array.isArray(resNext.Items) && resNext.Items.length > 0) {
                                        return resNext.Items[0];
                                    }
                                    return null;
                                })
                                .catch(function () { return null; });
                        }
                        return null;
                    })
                    .then(function (foundEp) {
                        if (foundEp && foundEp.Id) {
                            return foundEp;
                        }
                        return apiFetch('/Shows/' + encodeURIComponent(seriesId) + '/Episodes?userId=' + uid + '&Limit=1')
                            .then(function (resEps) {
                                if (resEps && Array.isArray(resEps.Items) && resEps.Items.length > 0) {
                                    return resEps.Items[0];
                                }
                                return fetchUserItems(uid, 'ParentId=' + encodeURIComponent(item.Id) + '&Recursive=true&IncludeItemTypes=Episode&SortBy=ParentIndexNumber,IndexNumber,SortName&Limit=1')
                                    .then(function (resFallback) {
                                        return (resFallback && Array.isArray(resFallback.Items) && resFallback.Items[0]) || item;
                                    });
                            })
                            .catch(function () { return item; });
                    })
                    .catch(function () { return item; });
            }

            // If item is a BoxSet (Collection) or Folder, resolve its first resumable or first playable child Movie/Episode
            if ((t === 'boxset' || t === 'folder' || t === 'collectionfolder' || item.IsFolder) && uid) {
                return fetchUserItems(uid, 'ParentId=' + encodeURIComponent(item.Id) + '&Recursive=true&IncludeItemTypes=Movie,Episode,Video&Filters=IsResumable&SortBy=DatePlayed&SortOrder=Descending&Limit=1')
                    .then(function (resResume) {
                        if (resResume && Array.isArray(resResume.Items) && resResume.Items.length > 0) {
                            return resResume.Items[0];
                        }
                        return fetchUserItems(uid, 'ParentId=' + encodeURIComponent(item.Id) + '&Recursive=true&IncludeItemTypes=Movie,Episode,Video&SortBy=PremiereDate,ProductionYear,SortName&Limit=1')
                            .then(function (resFirst) {
                                return (resFirst && Array.isArray(resFirst.Items) && resFirst.Items[0]) || item;
                            });
                    })
                    .catch(function () { return item; });
            }

            return item;
        });
    }

    function applyTrackSelectionToDetailDom(detailPage, audioIdx, subIdx) {
        if (!detailPage) {
            return;
        }
        try {
            if (audioIdx !== undefined && audioIdx !== null && audioIdx !== '') {
                var audioSel = detailPage.querySelector('.selectAudio');
                if (audioSel && String(audioSel.value) !== String(audioIdx)) {
                    audioSel.value = String(audioIdx);
                    audioSel.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
            if (subIdx !== undefined && subIdx !== null && subIdx !== '') {
                var subSel = detailPage.querySelector('.selectSubtitles');
                if (subSel && String(subSel.value) !== String(subIdx)) {
                    subSel.value = String(subIdx);
                    subSel.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        } catch (e) {}
    }

    function findUpgradedItemsContainer() {
        var candidates = document.querySelectorAll(
            '#indexPage:not(.hide) .itemsContainer, '
            + '.page:not(.hide) .itemsContainer, '
            + '.itemsContainer[is="emby-itemscontainer"], '
            + '.itemsContainer'
        );
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            if (c && typeof c.notifyRefreshNeeded === 'function') {
                return c;
            }
        }
        var hostWrap = document.getElementById('streamflix-shortcut-host-wrap');
        if (!hostWrap && document.body) {
            hostWrap = document.createElement('div');
            hostWrap.id = 'streamflix-shortcut-host-wrap';
            hostWrap.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;';
            hostWrap.innerHTML = '<div is="emby-itemscontainer" class="itemsContainer streamflix-shortcut-host"></div>';
            document.body.appendChild(hostWrap);
        }
        var created = hostWrap ? hostWrap.querySelector('.itemsContainer') : null;
        if (created && typeof created.notifyRefreshNeeded === 'function') {
            return created;
        }
        return candidates[0] || created || null;
    }

    function tryInPlaceJellyfinShortcutPlay(targetId, itemObj, forcedStartPositionTicks) {
        try {
            patchJellyfinApiClientMethods();
            var container = findUpgradedItemsContainer();
            if (!container) {
                return false;
            }
            var serverId = (itemObj && itemObj.ServerId) || resolveKnownServerId();
            if (!serverId) {
                return false;
            }
            var itemType = (itemObj && itemObj.Type) || 'Movie';
            var isFolder = itemType === 'Series' || itemType === 'Season' || itemType === 'BoxSet' || itemType === 'Folder';
            var hasForcedPos = typeof forcedStartPositionTicks === 'number' && isFinite(forcedStartPositionTicks) && forcedStartPositionTicks >= 0;
            var posTicks = hasForcedPos
                ? Math.floor(forcedStartPositionTicks)
                : ((itemObj && itemObj.UserData && itemObj.UserData.PlaybackPositionTicks)
                    ? Number(itemObj.UserData.PlaybackPositionTicks)
                    : 0);
            var actionName = posTicks > 0 ? 'resume' : 'play';

            // IMPORTANT: In Jellyfin Web's shortcuts.js, dom.parentWithAttribute(e.target, 'data-id') stops at the first element with data-id
            // and reads data-serverid, data-type, data-mediatype, data-isfolder, and data-positionticks from THAT element.
            // So data-id MUST be on tempCard (with all data-* attributes), and NOT duplicated without data-serverid on tempBtn!
            var tempCard = document.createElement('div');
            tempCard.className = 'card playableItemCard';
            tempCard.setAttribute('data-id', targetId);
            tempCard.setAttribute('data-serverid', serverId);
            tempCard.setAttribute('data-type', itemType);
            tempCard.setAttribute('data-mediatype', 'Video');
            tempCard.setAttribute('data-isfolder', isFolder ? 'true' : 'false');
            if (posTicks > 0) {
                tempCard.setAttribute('data-positionticks', String(posTicks));
            }
            tempCard.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';

            var tempBtn = document.createElement('button');
            tempBtn.type = 'button';
            tempBtn.className = 'itemAction cardOverlayFab-primary';
            tempBtn.setAttribute('data-action', actionName);
            tempCard.appendChild(tempBtn);
            container.appendChild(tempCard);

            var clickEvt = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            tempBtn.dispatchEvent(clickEvt);

            setTimeout(function () {
                if (tempCard.parentNode) {
                    tempCard.parentNode.removeChild(tempCard);
                }
            }, 3000);

            // In Jellyfin Web's shortcuts.js (onClick), e.preventDefault() is called synchronously whenever executeAction runs!
            return Boolean(clickEvt.defaultPrevented);
        } catch (e) {
            return false;
        }
    }

    function playItemImmediately(itemOrId, audioStreamIndex, subtitleStreamIndex, forcedStartPositionTicks, playOpts) {
        var itemObj = (itemOrId && typeof itemOrId === 'object') ? itemOrId : null;
        var targetId = typeof itemOrId === 'string' ? itemOrId : (itemObj && itemObj.Id);
        if (!targetId) {
            return;
        }

        // Prevent duplicate concurrent play calls for the same item on slow mobile/HLS connections
        var isWpFollow = Boolean(playOpts && playOpts.fromWatchPartyFollow);
        var normTarget = normalizeGuid(targetId);
        var nowTs = Date.now();
        var dedupWindowMs = isWpFollow ? 4500 : 2000;
        if (!(playOpts && playOpts.forceReplay) && state.lastPlayNormId === normTarget && state.lastPlayTimestamp && (nowTs - state.lastPlayTimestamp < dedupWindowMs)) {
            return;
        }
        state.lastPlayNormId = normTarget;
        state.lastPlayTimestamp = nowTs;

        if (state.activeProfile && state.activeProfile.accessToken && state.activeProfile.jellyfinUserId) {
            applyJellyfinServerCredentials({
                serverId: state.activeProfile.serverId || (state.config && state.config.serverId),
                userId: state.activeProfile.jellyfinUserId,
                accessToken: state.activeProfile.accessToken
            });
        }
        patchJellyfinApiClientMethods();

        // 1. Immediately close any open StreamFlix detail modal AND show the dark playback transition loader
        // so the card disappears right away instead of staying stuck on screen!
        var openModals = document.querySelectorAll('.streamflix-modal-backdrop');
        for (var m = 0; m < openModals.length; m++) {
            if (openModals[m].parentNode) {
                openModals[m].parentNode.removeChild(openModals[m]);
            }
        }
        document.body.classList.remove('streamflix-modal-open');
        hidePlaybackLoader();
        showPlaybackLoader(isWpFollow ? 'Syncing Watch Party…' : 'Starting playback…');

        var hasCustomTracks = (audioStreamIndex !== undefined && audioStreamIndex !== null && audioStreamIndex !== '')
            || (subtitleStreamIndex !== undefined && subtitleStreamIndex !== null && subtitleStreamIndex !== '');

        resolvePlayableItem(itemObj || targetId).then(function (playableItem) {
            var playableId = (playableItem && playableItem.Id) || targetId;
            var serverId = (playableItem && playableItem.ServerId) || resolveKnownServerId();

            var effectiveForcedTicks = forcedStartPositionTicks;
            if (typeof onWatchPartyBeforePlayResolved === 'function') {
                var wpTicks = onWatchPartyBeforePlayResolved(playableItem || { Id: playableId }, effectiveForcedTicks, playOpts || {});
                if (typeof wpTicks === 'number' && isFinite(wpTicks) && wpTicks >= 0) {
                    effectiveForcedTicks = wpTicks;
                }
            }
            var hasForcedStart = typeof effectiveForcedTicks === 'number' && isFinite(effectiveForcedTicks) && effectiveForcedTicks >= 0;
            var forceFromBeginning = hasForcedStart && Math.floor(effectiveForcedTicks) === 0;
            var detailBtnSelector = forceFromBeginning
                ? '.btnPlay:not(.hide), .mainDetailButtons button[data-action="play"]:not(.hide), .btnResume:not(.hide), .mainDetailButtons button[data-action="resume"]:not(.hide)'
                : '.btnResume:not(.hide), .btnPlay:not(.hide), .mainDetailButtons button[data-action="resume"]:not(.hide), .mainDetailButtons button[data-action="play"]:not(.hide)';

            function pollUntilVideoPlayerStarts(maxWaitMs) {
                var pollStarted = Date.now();
                var waitLimit = maxWaitMs || 6500;
                if (state.shortcutPollTimer) {
                    clearInterval(state.shortcutPollTimer);
                }
                state.shortcutPollTimer = setInterval(function () {
                    if (isVideoPlayerActive() || document.querySelector('.dialogContainer .dialog:not(.hide)')) {
                        hidePlaybackLoader();
                        return;
                    }
                    if (Date.now() - pollStarted > waitLimit) {
                        hidePlaybackLoader();
                    }
                }, 100);
            }

            function navigateAndClickDetailPlay() {
                showPlaybackLoader(isWpFollow ? 'Syncing Watch Party…' : 'Starting playback…');
                state.autoPlayPending = {
                    id: playableId,
                    audioIndex: audioStreamIndex,
                    subtitleIndex: subtitleStreamIndex,
                    startedAt: Date.now(),
                    clickedOnce: false
                };

                var nowHash = window.location.hash || '';
                var nowMatch = nowHash.match(/[?&]id=([a-f0-9-]+)/i);
                var nowId = nowMatch ? nowMatch[1] : '';
                if (normalizeGuid(nowId) !== normalizeGuid(playableId) || nowHash.indexOf('details') === -1 || (serverId && nowHash.indexOf('serverId=') === -1)) {
                    window.location.hash = '#/details?id=' + encodeURIComponent(playableId)
                        + (serverId ? '&serverId=' + encodeURIComponent(serverId) : '');
                }

                if (state.autoPlayTimer) {
                    clearInterval(state.autoPlayTimer);
                }
                state.autoPlayTimer = setInterval(function () {
                    if (!state.autoPlayPending) {
                        hidePlaybackLoader();
                        return;
                    }
                    if (isVideoPlayerActive() || document.querySelector('.dialogContainer .dialog:not(.hide)')) {
                        hidePlaybackLoader();
                        return;
                    }
                    if (Date.now() - state.autoPlayPending.startedAt > 7500) {
                        hidePlaybackLoader();
                        return;
                    }
                    var dp = document.querySelector('#itemDetailPage:not(.hide)');
                    if (!dp) {
                        return;
                    }
                    var mainBtns = dp.querySelector('.mainDetailButtons:not(.hide)');
                    var nameEl = dp.querySelector('.itemName, h1.itemName, .parentName');
                    var hasLoadedTitle = Boolean(nameEl && (nameEl.textContent || '').trim().length > 0);
                    var playBtn = dp.querySelector(detailBtnSelector);
                    if (playBtn && mainBtns && hasLoadedTitle) {
                        var pending = state.autoPlayPending;
                        if (!pending.clickedOnce) {
                            pending.clickedOnce = true;
                            applyTrackSelectionToDetailDom(dp, pending.audioIndex, pending.subtitleIndex);
                            playBtn.click();
                            pollUntilVideoPlayerStarts(6000);
                        }
                    }
                }, 90);
            }

            // 2. Try in-place Jellyfin shortcut playback first whenever default tracks are used (or whenever Watch Party forces an exact start position!).
            // When tryInPlaceJellyfinShortcutPlay returns true, shortcuts.js has synchronously called playbackManager.play() —
            // do NOT fire a second navigateAndClickDetailPlay() call that would collide with POST /Items/{id}/PlaybackInfo!
            if ((!hasCustomTracks || hasForcedStart) && tryInPlaceJellyfinShortcutPlay(playableId, playableItem, effectiveForcedTicks)) {
                pollUntilVideoPlayerStarts(6500);
                return;
            }

            // 3. If #itemDetailPage is already visible and loaded for this exact playable item, click its native Play/Resume button ONCE
            var curHash = window.location.hash || '';
            var curIdMatch = curHash.match(/[?&]id=([a-f0-9-]+)/i);
            var curId = curIdMatch ? curIdMatch[1] : '';
            var detailPage = document.querySelector('#itemDetailPage:not(.hide)');
            if (detailPage && normalizeGuid(curId) === normalizeGuid(playableId)) {
                var curMainBtns = detailPage.querySelector('.mainDetailButtons:not(.hide)');
                var curNameEl = detailPage.querySelector('.itemName, h1.itemName, .parentName');
                var curLoaded = Boolean(curMainBtns && curNameEl && (curNameEl.textContent || '').trim().length > 0);
                var directPlayBtn = detailPage.querySelector(detailBtnSelector);
                if (directPlayBtn && curLoaded) {
                    applyTrackSelectionToDetailDom(detailPage, audioStreamIndex, subtitleStreamIndex);
                    directPlayBtn.click();
                    pollUntilVideoPlayerStarts(6000);
                    return;
                }
            }

            // 4. Otherwise navigate to #/details?id=...&serverId=... while keeping #itemDetailPage hidden behind the loader
            navigateAndClickDetailPlay();
        }).catch(function () {
            hidePlaybackLoader();
        });
    }

    function navigateOrPlayItem(itemOrId) {
        playItemImmediately(itemOrId);
    }

    function fetchFullItemDetails(itemId) {
        var auth = getJellyfinAuthContext();
        var uid = auth && auth.userId ? encodeURIComponent(auth.userId) : '';
        // Only pass valid Jellyfin C# ItemFields enum names (SeriesId and SeasonId are returned by default on BaseItemDto and are NOT valid ItemFields enum values)
        var fields = 'Overview,Genres,MediaSources,MediaStreams,People,ExternalUrls,Studios,Taglines,ParentId,Chapters';
        if (uid) {
            return apiFetch('/Users/' + uid + '/Items/' + encodeURIComponent(itemId) + '?Fields=' + fields)
                .catch(function () {
                    return apiFetch('/Items/' + encodeURIComponent(itemId) + '?userId=' + uid + '&Fields=' + fields);
                })
                .catch(function () {
                    return apiFetch('/Users/' + uid + '/Items/' + encodeURIComponent(itemId));
                })
                .catch(function () {
                    return apiFetch('/Items/' + encodeURIComponent(itemId));
                });
        }
        return apiFetch('/Items/' + encodeURIComponent(itemId) + '?Fields=' + fields)
            .catch(function () {
                return apiFetch('/Items/' + encodeURIComponent(itemId));
            });
    }

    function openHeroDetailModalById(itemId, options) {
        if (!itemId) {
            return;
        }
        var cached = findCachedItemById(itemId);
        if (cached && cached.Id && cached.Name) {
            openHeroDetailModal(cached, options);
            return;
        }
        fetchFullItemDetails(itemId).then(function (fullItem) {
            if (fullItem && fullItem.Id) {
                openHeroDetailModal(fullItem, options);
            }
        }).catch(function () {});
    }

    function fetchUserItems(uid, queryString) {
        var hasFilters = queryString.indexOf('Filters=') !== -1;
        return apiFetch('/Items?userId=' + uid + '&' + queryString).then(function (res) {
            if (res && Array.isArray(res.Items) && res.Items.length > 0) {
                return res;
            }
            return apiFetch('/Users/' + uid + '/Items?' + queryString).then(function (res2) {
                if (res2 && Array.isArray(res2.Items) && res2.Items.length > 0) {
                    return res2;
                }
                if (hasFilters) {
                    return res2 || res || { Items: [] };
                }
                return apiFetch('/Items?' + queryString).catch(function () {
                    return res2 || res || { Items: [] };
                });
            }).catch(function () {
                if (hasFilters) {
                    return res || { Items: [] };
                }
                return apiFetch('/Items?' + queryString);
            });
        }).catch(function () {
            return apiFetch('/Users/' + uid + '/Items?' + queryString);
        }).catch(function () {
            if (hasFilters) {
                return { Items: [] };
            }
            return apiFetch('/Items?' + queryString);
        }).catch(function () {
            return { Items: [] };
        });
    }

    function fetchResumeItems(uid, fields) {
        var qs = 'Recursive=true&Limit=12&MediaTypes=Video&Fields=' + fields;
        return apiFetch('/UserItems/Resume?userId=' + uid + '&' + qs).catch(function () {
            return apiFetch('/Users/' + uid + '/Items/Resume?' + qs);
        }).catch(function () {
            return apiFetch('/UserItems/Resume?' + qs);
        }).catch(function () {
            return { Items: [] };
        });
    }

    function fetchUserViews(uid) {
        return apiFetch('/UserViews?userId=' + uid).then(function (res) {
            if (res && Array.isArray(res.Items) && res.Items.length > 0) {
                return res;
            }
            return apiFetch('/Users/' + uid + '/Views').then(function (res2) {
                if (res2 && Array.isArray(res2.Items) && res2.Items.length > 0) {
                    return res2;
                }
                return apiFetch('/UserViews').catch(function () {
                    return res2 || res || { Items: [] };
                });
            }).catch(function () {
                return apiFetch('/UserViews');
            });
        }).catch(function () {
            return apiFetch('/Users/' + uid + '/Views');
        }).catch(function () {
            return apiFetch('/UserViews');
        }).catch(function () {
            return { Items: [] };
        });
    }

    function ensureCinemaHubMounted() {
        var existingHub = document.getElementById('streamflix-cinema-hub');
        if (!state.cinemaHubEnabled || !isOnHomeRoute() || isGateOpen()) {
            if (existingHub) {
                existingHub.style.display = 'none';
            }
            document.body.classList.remove('streamflix-hub-filtered', 'streamflix-hub-active');
            return;
        }
        if (existingHub) {
            // flow-root (not block) so the hero's negative top margin can't collapse through the hub
            existingHub.style.display = 'flow-root';
            if (existingHub.classList.contains('streamflix-hub-ready')) {
                document.body.classList.add('streamflix-hub-active');
            }
        }

        var auth = getJellyfinAuthContext();
        if (!auth.userId || !auth.token) {
            return;
        }

        var homeSections = document.querySelector('#indexPage:not(.hide) .homeSectionsContainer')
            || document.querySelector('.tabContent.is-active .homeSectionsContainer')
            || document.querySelector('.homeSectionsContainer')
            || document.querySelector('#indexPage:not(.hide) .sections')
            || document.querySelector('.homeTab .sections');

        var homePageContainer = document.querySelector('#indexPage:not(.hide)')
            || document.querySelector('.page.homePage:not(.hide)');

        var fallbackContainer = document.querySelector('#fallbackPage:not(.hide)')
            || document.querySelector('.mainAnimatedPages');

        if (fallbackContainer && fallbackContainer.id === 'fallbackPage') {
            fallbackContainer.classList.add('streamflix-recovered');
        }

        // If existingHub was previously mounted inside #fallbackPage or .mainAnimatedPages and #indexPage is now ready, move it into #indexPage
        if (existingHub && homeSections && homeSections.parentNode && existingHub.parentNode !== homeSections.parentNode) {
            homeSections.parentNode.insertBefore(existingHub, homeSections);
        }

        if (!existingHub) {
            if (homeSections && homeSections.parentNode) {
                existingHub = document.createElement('div');
                existingHub.id = 'streamflix-cinema-hub';
                homeSections.parentNode.insertBefore(existingHub, homeSections);
            } else if (homePageContainer) {
                existingHub = document.createElement('div');
                existingHub.id = 'streamflix-cinema-hub';
                homePageContainer.insertBefore(existingHub, homePageContainer.firstChild);
            } else if (fallbackContainer) {
                existingHub = document.createElement('div');
                existingHub.id = 'streamflix-cinema-hub';
                fallbackContainer.insertBefore(existingHub, fallbackContainer.firstChild);
            } else {
                return;
            }

            if (state.hubData.loaded && state.hubData.userId === auth.userId) {
                renderCinemaHubContents();
            } else {
                existingHub.innerHTML = buildHubSkeletonHtml();
            }
        }

        if (state.hubData.userId !== auth.userId || (!state.hubData.loaded && !state.hubData.loading)) {
            loadCinemaHubData(false);
        }
    }

    var TOP10_SESSION_SEED_KEY = 'streamflix_top10_session_seed';

    function getSessionRandomSeed() {
        if (state.sessionRandomSeed) {
            return state.sessionRandomSeed;
        }
        try {
            var existing = sessionStorage.getItem(TOP10_SESSION_SEED_KEY);
            if (existing) {
                state.sessionRandomSeed = existing;
                return existing;
            }
            var created = String(Date.now()) + '_' + String(Math.floor(Math.random() * 1000000000));
            sessionStorage.setItem(TOP10_SESSION_SEED_KEY, created);
            state.sessionRandomSeed = created;
            return created;
        } catch (e) {
            state.sessionRandomSeed = String(Date.now());
            return state.sessionRandomSeed;
        }
    }

    function hashSeedString(str) {
        var h = 2166136261 >>> 0;
        var s = String(str || 'streamflix');
        for (var i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul ? Math.imul(h, 16777619) : ((h * 16777619) >>> 0);
        }
        return h >>> 0;
    }

    function seededShuffle(items, seedStr) {
        var arr = (items || []).slice().sort(function (a, b) {
            var ka = normalizeGuid(a && a.Id);
            var kb = normalizeGuid(b && b.Id);
            return ka < kb ? -1 : (ka > kb ? 1 : 0);
        });
        var a = hashSeedString(seedStr) || 1;
        var nextRand = function () {
            a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul ? Math.imul(a ^ (a >>> 15), 1 | a) : ((a ^ (a >>> 15)) * (1 | a));
            t = (t + (Math.imul ? Math.imul(t ^ (t >>> 7), 61 | t) : ((t ^ (t >>> 7)) * (61 | t)))) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(nextRand() * (i + 1));
            var tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
        return arr;
    }

    function dedupeMediaItems(list) {
        var out = [];
        var seen = {};
        (list || []).forEach(function (it) {
            if (!it || !it.Id) {
                return;
            }
            var key = normalizeGuid(it.Id);
            if (!key || seen[key]) {
                return;
            }
            seen[key] = true;
            out.push(it);
        });
        return out;
    }

    function hasBackdropArt(it) {
        return Boolean(it && ((Array.isArray(it.BackdropImageTags) && it.BackdropImageTags.length > 0)
            || (Array.isArray(it.ParentBackdropImageTags) && it.ParentBackdropImageTags.length > 0)));
    }

    function computeTop10Items(movies, series, popularScores, mode) {
        var pool = dedupeMediaItems([].concat(movies || [], series || []));
        if (!pool.length) {
            return [];
        }
        var selMode = String(mode || (state.config && state.config.top10SelectionMode) || 'most_played').toLowerCase();
        var scores = popularScores || {};

        if (selMode === 'daily_random' || selMode === 'session_random') {
            var now = new Date();
            var seedBase = selMode === 'daily_random'
                ? ('daily:' + now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate())
                : ('session:' + getSessionRandomSeed());
            var serverSalt = (state.config && state.config.serverId) || '';
            var withPoster = pool.filter(function (it) {
                return (it.ImageTags && it.ImageTags.Primary) || hasBackdropArt(it);
            });
            var candidatePool = withPoster.length >= 10 ? withPoster : pool;
            return seededShuffle(candidatePool, seedBase + ':' + serverSalt).slice(0, 10);
        }

        if (selMode === 'recently_added') {
            return pool.slice().sort(function (a, b) {
                var da = Date.parse(a.DateCreated || '') || 0;
                var db = Date.parse(b.DateCreated || '') || 0;
                if (db !== da) {
                    return db - da;
                }
                return (Number(b.CommunityRating) || 0) - (Number(a.CommunityRating) || 0);
            }).slice(0, 10);
        }

        if (selMode === 'community_rating') {
            return pool.slice().sort(function (a, b) {
                var ra = Number(a.CommunityRating) || 0;
                var rb = Number(b.CommunityRating) || 0;
                if (rb !== ra) {
                    return rb - ra;
                }
                var da = Date.parse(a.DateCreated || '') || 0;
                var db = Date.parse(b.DateCreated || '') || 0;
                return db - da;
            }).slice(0, 10);
        }

        // Default: 'most_played' (server-wide engagement score across all Jellyfin users, falling back cleanly to user plays + rating + recency)
        return pool.slice().sort(function (a, b) {
            var sa = Number(scores[normalizeGuid(a.Id)]) || 0;
            var sb = Number(scores[normalizeGuid(b.Id)]) || 0;
            if (sb !== sa) {
                return sb - sa;
            }
            var ua = ((a.UserData && Number(a.UserData.PlayCount)) || 0) * 3
                + (a.UserData && a.UserData.Played ? 2 : 0)
                + (a.UserData && a.UserData.IsFavorite ? 1.5 : 0);
            var ub = ((b.UserData && Number(b.UserData.PlayCount)) || 0) * 3
                + (b.UserData && b.UserData.Played ? 2 : 0)
                + (b.UserData && b.UserData.IsFavorite ? 1.5 : 0);
            if (ub !== ua) {
                return ub - ua;
            }
            var ra = Number(a.CommunityRating) || 0;
            var rb = Number(b.CommunityRating) || 0;
            if (rb !== ra) {
                return rb - ra;
            }
            return (Date.parse(b.DateCreated || '') || 0) - (Date.parse(a.DateCreated || '') || 0);
        }).slice(0, 10);
    }

    function getTop10RowTitle() {
        if (typeof isKidsProfileActive === 'function' && isKidsProfileActive()) {
            return 'Top 10 Kids Favorites Today';
        }
        var mode = String((state.config && state.config.top10SelectionMode) || 'most_played').toLowerCase();
        if (mode === 'community_rating') {
            return 'Top 10 Highest Rated';
        }
        if (mode === 'recently_added') {
            return 'Top 10 Recently Added';
        }
        if (mode === 'daily_random') {
            return 'Top 10 Daily Spotlight';
        }
        if (mode === 'session_random') {
            return 'Top 10 Spotlight Picks';
        }
        return 'Top 10 in ' + getBrandName() + ' Today';
    }

    function getTop10Rank(itemId) {
        if (!itemId || !state.hubData || !state.hubData.top10RankMap) {
            return 0;
        }
        return state.hubData.top10RankMap[normalizeGuid(itemId)] || 0;
    }

    function getHeroSlideLimit() {
        var n = state.config && state.config.heroSlideCount !== undefined
            ? Number(state.config.heroSlideCount)
            : 8;
        return Math.max(1, Math.min(15, n || 8));
    }

    function getHeroIntervalMs() {
        if (state.config && state.config.heroRotationSeconds !== undefined && state.config.heroRotationSeconds !== null) {
            var sec = Number(state.config.heroRotationSeconds);
            if (!isNaN(sec) && sec <= 0) {
                return 0;
            }
            if (!isNaN(sec)) {
                return Math.max(3, Math.min(120, sec)) * 1000;
            }
        }
        return 9000;
    }

    function computeHeroItems(d) {
        d = d || state.hubData || {};
        var limit = getHeroSlideLimit();
        var cfg = state.config || {};
        var heroLibs = Array.isArray(cfg.heroLibraryIds) ? cfg.heroLibraryIds : [];
        var contentType = String(cfg.heroContentType || 'all').toLowerCase();
        var selMode = String(cfg.heroSelectionMode || 'recent').toLowerCase();

        var fullPool = dedupeMediaItems([].concat(d.allMovies || [], d.allSeries || []));
        var basePool = (heroLibs.length > 0 && Array.isArray(d.filteredHeroPool) && d.filteredHeroPool.length > 0)
            ? dedupeMediaItems(d.filteredHeroPool)
            : fullPool;

        var typeFiltered = basePool;
        if (contentType === 'movies') {
            typeFiltered = basePool.filter(function (it) { return it.Type === 'Movie'; });
        } else if (contentType === 'series') {
            typeFiltered = basePool.filter(function (it) { return it.Type === 'Series'; });
        }
        if (!typeFiltered.length) {
            typeFiltered = basePool.length ? basePool : dedupeMediaItems(d.rawHeroItems || []);
        }

        var artPool = typeFiltered.filter(hasBackdropArt);
        var candidates = artPool.length >= Math.min(limit, 3) ? artPool : typeFiltered;
        var ordered = [];

        if (selMode === 'top10') {
            var candById = {};
            candidates.forEach(function (it) { candById[normalizeGuid(it.Id)] = it; });
            (d.top10Items || []).forEach(function (t) {
                var hit = candById[normalizeGuid(t.Id)];
                if (hit) {
                    ordered.push(hit);
                }
            });
            if (ordered.length < limit) {
                var used = {};
                ordered.forEach(function (it) { used[normalizeGuid(it.Id)] = true; });
                candidates.slice().sort(smartByRating).forEach(function (it) {
                    if (ordered.length < limit && !used[normalizeGuid(it.Id)]) {
                        used[normalizeGuid(it.Id)] = true;
                        ordered.push(it);
                    }
                });
            }
        } else if (selMode === 'top_rated') {
            ordered = candidates.slice().sort(function (a, b) {
                var diff = (Number(b.CommunityRating) || 0) - (Number(a.CommunityRating) || 0);
                if (diff !== 0) {
                    return diff;
                }
                return (Date.parse(b.DateCreated || '') || 0) - (Date.parse(a.DateCreated || '') || 0);
            });
        } else if (selMode === 'random') {
            ordered = seededShuffle(candidates, 'hero:' + getSessionRandomSeed() + ':' + ((cfg && cfg.serverId) || ''));
        } else {
            ordered = candidates.slice().sort(function (a, b) {
                return (Date.parse(b.DateCreated || '') || 0) - (Date.parse(a.DateCreated || '') || 0);
            });
        }

        return ordered.slice(0, limit);
    }

    function recomputeHubDerivedLists() {
        var d = state.hubData;
        if (!d) {
            return;
        }
        var topList = computeTop10Items(d.allMovies, d.allSeries, d.popularScores, state.config && state.config.top10SelectionMode);
        if (!topList.length && Array.isArray(d.rawTop10Items) && d.rawTop10Items.length) {
            topList = d.rawTop10Items.slice(0, 10);
        }
        d.top10Items = topList;
        var rankMap = {};
        topList.forEach(function (it, idx) {
            if (it && it.Id) {
                rankMap[normalizeGuid(it.Id)] = idx + 1;
            }
        });
        d.top10RankMap = rankMap;

        var computedHero = computeHeroItems(d);
        d.heroItems = computedHero.length ? computedHero : (d.rawHeroItems || []).slice(0, getHeroSlideLimit());
        if (state.heroIndex >= d.heroItems.length) {
            state.heroIndex = 0;
        }
    }

    function loadCinemaHubData(silentRefresh) {
        var auth = getJellyfinAuthContext();
        if (!auth.userId || !auth.token) {
            return;
        }

        var reqSeq = (state.hubLoadSeq = (state.hubLoadSeq || 0) + 1);
        state.hubData.loading = true;
        state.hubData.userId = auth.userId;

        var uid = encodeURIComponent(auth.userId);
        // Only pass valid C# ItemFields enum names
        var fields = 'Overview,Genres,PrimaryImageAspectRatio,DateCreated';

        var pHero = fetchUserItems(uid, 'IncludeItemTypes=Movie,Series&Recursive=true&Limit=15&SortBy=DateCreated,SortName&SortOrder=Descending&Fields=' + fields);
        var pResume = fetchResumeItems(uid, fields);
        var pNextUp = apiFetch('/Shows/NextUp?userId=' + uid + '&Limit=12&Fields=' + fields).catch(function () { return { Items: [] }; });
        var pTop10 = fetchUserItems(uid, 'IncludeItemTypes=Movie,Series&Recursive=true&Limit=15&SortBy=CommunityRating,DateCreated&SortOrder=Descending&Fields=' + fields);
        var pFavs = fetchUserItems(uid, 'IncludeItemTypes=Movie,Series,Episode,BoxSet&Recursive=true&Filters=IsFavorite&Limit=48&Fields=' + fields);
        var pMovies = fetchUserItems(uid, 'IncludeItemTypes=Movie&Recursive=true&Limit=120&SortBy=DateCreated,SortName&SortOrder=Descending&Fields=' + fields);
        var pSeries = fetchUserItems(uid, 'IncludeItemTypes=Series&Recursive=true&Limit=120&SortBy=DateCreated,SortName&SortOrder=Descending&Fields=' + fields + ',ChildCount');
        var pCollections = fetchUserItems(uid, 'IncludeItemTypes=BoxSet&Recursive=true&Limit=100&SortBy=SortName&SortOrder=Ascending&Fields=' + fields);
        var pViews = fetchUserViews(uid);
        var pPopular = apiFetch('/StreamFlix/PopularScores').catch(function () { return { scores: {} }; });

        Promise.all([pHero, pResume, pNextUp, pTop10, pFavs, pMovies, pSeries, pCollections, pViews, pPopular]).then(function (results) {
            if (state.hubLoadSeq !== reqSeq || normalizeGuid(getJellyfinAuthContext().userId) !== normalizeGuid(auth.userId)) {
                return null;
            }
            var kFilter = typeof filterItemsForKidsMode === 'function' ? filterItemsForKidsMode : function (arr) { return arr || []; };
            state.hubData.rawHeroItems = kFilter((results[0] && results[0].Items) || []);
            state.hubData.resumeItems = kFilter((results[1] && results[1].Items) || []);
            state.hubData.nextUpItems = kFilter((results[2] && results[2].Items) || []);
            state.hubData.rawTop10Items = kFilter((results[3] && results[3].Items) || []);
            state.hubData.favoriteItems = kFilter((results[4] && results[4].Items) || []);
            state.hubData.allMovies = kFilter((results[5] && results[5].Items) || []);
            state.hubData.allSeries = kFilter((results[6] && results[6].Items) || []);
            state.hubData.recentMovies = state.hubData.allMovies.slice(0, 18);
            state.hubData.recentSeries = state.hubData.allSeries.slice(0, 18);
            state.hubData.collectionsItems = kFilter((results[7] && results[7].Items) || []);
            state.hubData.views = (results[8] && results[8].Items) || [];
            state.hubData.popularScores = (results[9] && results[9].scores) || {};
            state.hubData.filteredHeroPool = [];

            var extraPromises = [];

            var heroLibs = (state.config && Array.isArray(state.config.heroLibraryIds)) ? state.config.heroLibraryIds : [];
            if (heroLibs.length > 0) {
                var libPromises = heroLibs.map(function (libId) {
                    return fetchUserItems(uid, 'ParentId=' + encodeURIComponent(libId) + '&Recursive=true&IncludeItemTypes=Movie,Series&Limit=60&SortBy=DateCreated,SortName&SortOrder=Descending&Fields=' + fields)
                        .catch(function () { return { Items: [] }; });
                });
                extraPromises.push(
                    Promise.all(libPromises).then(function (libResults) {
                        var combinedHeroPool = [];
                        libResults.forEach(function (lr) {
                            combinedHeroPool = combinedHeroPool.concat((lr && lr.Items) || []);
                        });
                        state.hubData.filteredHeroPool = kFilter(dedupeMediaItems(combinedHeroPool));
                    })
                );
            }

            // Also query any Collections/BoxSets library view by ParentId if present
            var boxsetViews = state.hubData.views.filter(function (v) {
                var ct = (v && v.CollectionType || '').toLowerCase();
                var nm = (v && v.Name || '').toLowerCase();
                return ct === 'boxsets' || nm.indexOf('collection') !== -1;
            });
            boxsetViews.forEach(function (bv) {
                extraPromises.push(
                    fetchUserItems(uid, 'ParentId=' + encodeURIComponent(bv.Id) + '&Recursive=true&Limit=100&SortBy=SortName&SortOrder=Ascending&Fields=' + fields)
                        .then(function (bRes) {
                            var seenCol = {};
                            state.hubData.collectionsItems.forEach(function (c) {
                                if (c && c.Id) { seenCol[normalizeGuid(c.Id)] = true; }
                            });
                            ((bRes && bRes.Items) || []).forEach(function (it) {
                                if (it && it.Id && !seenCol[normalizeGuid(it.Id)] && it.Type !== 'Episode' && it.Type !== 'Season') {
                                    seenCol[normalizeGuid(it.Id)] = true;
                                    state.hubData.collectionsItems.push(it);
                                }
                            });
                        })
                        .catch(function () {})
                );
            });

            // Fallback: if top-level Recursive queries returned no movies/series but the user has library views, query each view by ParentId
            if (state.hubData.allMovies.length === 0 && state.hubData.allSeries.length === 0 && state.hubData.views.length > 0) {
                var viewPromises = state.hubData.views.map(function (v) {
                    return fetchUserItems(uid, 'ParentId=' + encodeURIComponent(v.Id) + '&Recursive=true&IncludeItemTypes=Movie,Series,BoxSet,Video&Limit=60&SortBy=DateCreated,SortName&SortOrder=Descending&Fields=' + fields);
                });
                extraPromises.push(
                    Promise.all(viewPromises).then(function (viewResList) {
                        var seenIds = {};
                        viewResList.forEach(function (vr) {
                            ((vr && vr.Items) || []).forEach(function (it) {
                                if (!it || !it.Id || seenIds[it.Id]) {
                                    return;
                                }
                                seenIds[it.Id] = true;
                                if (it.Type === 'Series') {
                                    state.hubData.allSeries.push(it);
                                } else if (it.Type === 'BoxSet') {
                                    state.hubData.collectionsItems.push(it);
                                } else {
                                    state.hubData.allMovies.push(it);
                                }
                            });
                        });
                        state.hubData.recentMovies = state.hubData.allMovies.slice(0, 18);
                        state.hubData.recentSeries = state.hubData.allSeries.slice(0, 18);
                    })
                );
            }

            return Promise.all(extraPromises);
        }).then(function () {
            if (state.hubLoadSeq !== reqSeq || normalizeGuid(getJellyfinAuthContext().userId) !== normalizeGuid(auth.userId)) {
                return;
            }
            recomputeHubDerivedLists();
            state.hubData.loading = false;
            state.hubData.loaded = true;
            try {
                var wallCache = getShowcaseItemsForWall().slice(0, 36);
                if (wallCache.length > 0) {
                    saveJson(SHOWCASE_ITEMS_KEY, wallCache);
                }
            } catch (eWall) {}
            if (!silentRefresh) {
                state.heroIndex = 0;
            }
            renderCinemaHubContents();
            enhanceLibraryListPages();
            loadPersonalRows(false);
        }).catch(function () {
            if (state.hubLoadSeq === reqSeq) {
                state.hubData.loading = false;
            }
        });
    }

    function cancelPendingSearch() {
        if (state.searchDebounce) {
            clearTimeout(state.searchDebounce);
            state.searchDebounce = null;
        }
        state.searchSeq = (state.searchSeq || 0) + 1;
        state.seerrSearchLoading = false;
    }

    function runLiveSearch(query) {
        var auth = getJellyfinAuthContext();
        if (!auth.userId || !auth.token) {
            return;
        }
        var seq = (state.searchSeq = (state.searchSeq || 0) + 1);
        var clean = (query || '').trim();
        if (!clean) {
            state.searchResults = null;
            state.seerrSearchResults = null;
            state.seerrSearchLoading = false;
            renderCinemaHubContents();
            return;
        }
        var uid = encodeURIComponent(auth.userId);
        var fields = 'Overview,Genres,PrimaryImageAspectRatio';
        var seerrAllowed = isCurrentProfileSeerrAllowed() && clean.length >= 2;
        state.seerrSearchLoading = seerrAllowed;
        if (!seerrAllowed) {
            state.seerrSearchResults = null;
        }

        fetchUserItems(uid, 'SearchTerm=' + encodeURIComponent(clean) + '&IncludeItemTypes=Movie,Series,Episode,BoxSet&Recursive=true&Limit=48&Fields=' + fields)
            .then(function (res) {
                if (state.searchSeq !== seq) {
                    return;
                }
                var rawHits = (res && res.Items) || [];
                state.searchResults = typeof filterItemsForKidsMode === 'function' ? filterItemsForKidsMode(rawHits) : rawHits;
                renderCinemaHubContents();
            })
            .catch(function () {
                if (state.searchSeq !== seq) {
                    return;
                }
                state.searchResults = [];
                renderCinemaHubContents();
            });

        if (seerrAllowed) {
            var pid = (state.activeProfile && state.activeProfile.id) || '';
            apiFetch('/StreamFlix/Seerr/Search?query=' + encodeURIComponent(clean) + '&profileId=' + encodeURIComponent(pid))
                .then(function (sRes) {
                    if (state.searchSeq !== seq) {
                        return;
                    }
                    state.seerrSearchLoading = false;
                    state.seerrSearchResults = (sRes && Array.isArray(sRes.results)) ? sRes.results : [];
                    renderCinemaHubContents();
                })
                .catch(function () {
                    if (state.searchSeq !== seq) {
                        return;
                    }
                    state.seerrSearchLoading = false;
                    state.seerrSearchResults = [];
                    renderCinemaHubContents();
                });
        }
    }

    function filterDeduplicatedSeerrResults(seerrList, localSearchList) {
        if (!Array.isArray(seerrList) || !seerrList.length) {
            return [];
        }
        var localIds = {};
        var localTitleKeys = {};
        var d = state.hubData || {};
        [].concat(localSearchList || [], d.allMovies || [], d.allSeries || []).forEach(function (it) {
            if (!it) {
                return;
            }
            if (it.Id) {
                localIds[normalizeGuid(it.Id)] = it.Type || '';
            }
            var tKey = String(it.Name || '').trim().toLowerCase() + '|' + (it.ProductionYear || '');
            if (tKey !== '|') {
                localTitleKeys[tKey] = it.Type || '';
            }
        });
        return seerrList.filter(function (s) {
            if (!s || !s.tmdbId || !s.title) {
                return false;
            }
            var isPartialTv = s.mediaType === 'tv' && Number(s.mediaStatus) === 4;
            if (isPartialTv) {
                return true;
            }
            if (Number(s.mediaStatus) === 5) {
                return false;
            }
            if (s.jellyfinMediaId && localIds[normalizeGuid(s.jellyfinMediaId)]) {
                return false;
            }
            var sKey = String(s.title || '').trim().toLowerCase() + '|' + (s.year || '');
            if (localTitleKeys[sKey] && s.mediaType === 'movie') {
                return false;
            }
            return true;
        });
    }

    function buildSeerrCardHtml(sItem) {
        var posterUrl = (typeof sItem.posterUrl === 'string' && /^https:\/\//i.test(sItem.posterUrl.trim())) ? sItem.posterUrl.trim() : '';
        var status = Number(sItem.mediaStatus) || 1;
        var rawDl = (typeof sItem.downloadProgress === 'number' && !isNaN(sItem.downloadProgress))
            ? Math.max(0, Math.min(100, Math.round(sItem.downloadProgress)))
            : null;
        var customLbl = typeof sItem.statusLabel === 'string' ? sItem.statusLabel.trim() : '';
        var isDownloading = rawDl !== null || /^downloading/i.test(customLbl);
        var isPending = status === 2 || status === 3 || isDownloading;
        var isPartial = status === 4;
        var statusCls = isDownloading
            ? 'is-downloading'
            : (status === 3 ? 'is-processing' : (status === 2 ? 'is-pending' : (isPartial ? 'is-partial' : 'is-requestable')));
        var badgeText = isDownloading
            ? (customLbl || (rawDl !== null && rawDl > 0 ? ('Downloading · ' + rawDl + '%') : 'Downloading'))
            : (status === 3 ? (customLbl || 'Processing') : (status === 2 ? (customLbl || 'Requested') : (isPartial ? 'Partial · Request Seasons' : 'Request')));
        var badgeIcon = isDownloading ? icon('download') : (isPending ? icon('clock') : icon('plus'));
        var typeTag = sItem.mediaType === 'tv' ? 'SERIES' : 'MOVIE';
        var rating = sItem.rating ? Number(sItem.rating).toFixed(1) : '';
        var key = (sItem.mediaType || 'movie') + ':' + sItem.tmdbId;

        return ''
            + '<div class="streamflix-poster-card bfx-seerr-card" data-seerr-key="' + escapeHtml(key) + '" tabindex="0" role="button" aria-label="' + escapeHtml(sItem.title + ' (' + badgeText + ')') + '">'
            + '  <div class="streamflix-poster-img-wrap">'
            + '    <div class="streamflix-card-fallback">' + escapeHtml(sItem.title) + '</div>'
            + (posterUrl
                ? '    <img class="streamflix-poster-img" loading="lazy" src="' + escapeHtml(posterUrl) + '" referrerpolicy="no-referrer" alt="" data-bfx-img="fade" />'
                : '')
            + '    <span class="bfx-seerr-badge ' + statusCls + '">' + badgeIcon + '<span>' + escapeHtml(badgeText) + '</span></span>'
            + '    <span class="bfx-seerr-type">' + typeTag + '</span>'
            + (rawDl !== null && rawDl > 0
                ? '    <div class="bfx-seerr-card-dl"><div class="streamflix-progress-fill" style="width:' + rawDl + '%;"></div></div>'
                : '')
            + '    <div class="streamflix-card-hover-overlay">'
            + '      <div class="streamflix-card-info">'
            + '        <div class="streamflix-card-title">' + escapeHtml(sItem.title) + '</div>'
            + '        <div class="streamflix-card-meta">'
            + (rating ? '<span class="streamflix-card-rating">' + icon('star') + escapeHtml(rating) + '</span>' : '')
            + '<span>' + escapeHtml([sItem.year, sItem.mediaType === 'tv' ? 'Series' : 'Movie'].filter(Boolean).join(' · ')) + '</span></div>'
            + (sItem.overview ? '<div class="bfx-seerr-overview">' + escapeHtml(sItem.overview) + '</div>' : '')
            + '      </div>'
            + '      <div class="streamflix-card-quick-btns">'
            + '        <button type="button" class="bfx-seerr-req-btn ' + statusCls + '" data-seerr-act="request">'
            + (isPending ? (badgeIcon + '<span>' + escapeHtml(badgeText) + '</span>') : (icon('plus') + '<span>' + (sItem.mediaType === 'tv' ? 'Select Seasons' : 'Request') + '</span>'))
            + '        </button>'
            + '      </div>'
            + '    </div>'
            + '  </div>'
            + '  <div class="streamflix-poster-footer">'
            + '    <div class="streamflix-poster-name">' + escapeHtml(sItem.title) + '</div>'
            + '    <div class="streamflix-poster-sub"><span>' + escapeHtml(sItem.year ? String(sItem.year) : typeTag) + '</span>' + (rating ? '<span class="streamflix-card-rating">' + icon('star') + escapeHtml(rating) + '</span>' : '') + '</div>'
            + '  </div>'
            + '</div>';
    }

    function buildSearchRowsHtml() {
        var out = '';
        var seerrOk = isCurrentProfileSeerrAllowed();
        var localList = Array.isArray(state.searchResults) ? state.searchResults : [];
        var seerrFiltered = seerrOk
            ? filterDeduplicatedSeerrResults(state.seerrSearchResults, localList)
            : [];

        if (localList.length > 0) {
            out += buildGridSectionHtml('search', 'In Your Library — “' + escapeHtml(state.searchQuery) + '”<span class="streamflix-row-count">' + localList.length + '</span>', localList);
        }

        if (seerrFiltered.length > 0) {
            out += ''
                + '<section class="streamflix-row streamflix-row-grid bfx-seerr-section" data-row-id="seerr-search">'
                + '  <div class="streamflix-row-header">'
                + '    <h2 class="streamflix-row-title">Available to Request<span class="streamflix-row-count">' + seerrFiltered.length + '</span></h2>'
                + '    <span class="bfx-seerr-kicker">Seerr</span>'
                + '    <button type="button" class="streamflix-ghost-btn bfx-btn-xs bfx-seerr-open-reqs-btn" data-open-seerr-requests="1">' + iconLabel('clock', 'Media Requests') + '</button>'
                + '  </div>'
                + '  <div class="streamflix-grid">' + seerrFiltered.map(buildSeerrCardHtml).join('') + '</div>'
                + '</section>';
        } else if (state.seerrSearchLoading && localList.length === 0) {
            out += '<div class="streamflix-filter-loading"><div class="streamflix-spinner-ring"></div><span>Searching library &amp; Seerr…</span></div>';
        } else if (seerrOk && !state.seerrSearchLoading && localList.length > 0) {
            out += '<div class="bfx-seerr-empty-reqs-wrap"><button type="button" class="streamflix-ghost-btn bfx-btn-xs" data-open-seerr-requests="1">' + iconLabel('clock', 'View Seerr Media Requests') + '</button></div>';
        }

        if (!out) {
            var emptyHint = seerrOk
                ? 'No matching titles were found in your library or on Seerr.'
                : 'Try a different title, or browse by category.';
            out = buildEmptyStateHtml('search', 'No matches for “' + state.searchQuery + '”', emptyHint)
                + (seerrOk ? '<div class="bfx-seerr-empty-reqs-wrap"><button type="button" class="streamflix-ghost-btn bfx-btn-xs" data-open-seerr-requests="1">' + iconLabel('clock', 'View Seerr Media Requests') + '</button></div>' : '');
        }
        return out;
    }

    function bindSeerrCardsInContainer(containerEl) {
        if (!containerEl) {
            return;
        }
        Array.prototype.forEach.call(containerEl.querySelectorAll('[data-open-seerr-requests]'), function (btn) {
            btn.addEventListener('click', function (ev) {
                ev.stopPropagation();
                openSeerrRequestsModal();
            });
        });
        var map = {};
        (state.seerrSearchResults || []).forEach(function (s) {
            if (s && s.tmdbId) {
                map[(s.mediaType || 'movie') + ':' + s.tmdbId] = s;
            }
        });
        Array.prototype.forEach.call(containerEl.querySelectorAll('[data-seerr-key]'), function (card) {
            var key = card.getAttribute('data-seerr-key');
            var sItem = map[key];
            if (!sItem) {
                return;
            }
            var activate = function () {
                openSeerrRequestModal(sItem);
            };
            card.addEventListener('click', function (ev) {
                ev.stopPropagation();
                activate();
            });
            card.addEventListener('keydown', function (ev) {
                if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === card) {
                    ev.preventDefault();
                    activate();
                }
            });
        });
        hydrateCompleteImages(containerEl);
    }

    function buildCardQuickButtons(item, withPlayed) {
        var isFav = item.UserData && item.UserData.IsFavorite;
        var isPlayed = item.UserData && item.UserData.Played;
        return ''
            + '<div class="streamflix-card-quick-btns">'
            + '  <button type="button" class="streamflix-qbtn play" data-action="play" title="Play" aria-label="Play">' + icon('play') + '</button>'
            + '  <button type="button" class="streamflix-qbtn' + (isFav ? ' active' : '') + '" data-action="fav" title="' + (isFav ? 'Remove from My List' : 'Add to My List') + '" aria-label="My List">' + icon(isFav ? 'check' : 'plus') + '</button>'
            + (withPlayed ? '  <button type="button" class="streamflix-qbtn' + (isPlayed ? ' active' : '') + '" data-action="played" title="' + (isPlayed ? 'Mark unwatched' : 'Mark watched') + '" aria-label="Watched">' + icon('eye') + '</button>' : '')
            + '  <button type="button" class="streamflix-qbtn streamflix-qbtn-end" data-action="info" title="Details" aria-label="Details">' + icon('chevronDown') + '</button>'
            + '</div>';
    }

    function buildCardMetaText(item) {
        var parts = [];
        if (item.ProductionYear) {
            parts.push(String(item.ProductionYear));
        }
        if (item.OfficialRating) {
            parts.push(String(item.OfficialRating));
        }
        var rt = formatRuntimeTicks(item.RunTimeTicks);
        if (rt && item.Type !== 'Series') {
            parts.push(rt.trim());
        } else if (item.Type === 'Series') {
            parts.push('Series');
        } else if (item.Type === 'BoxSet') {
            parts.push('Collection');
        }
        return parts.join(' · ');
    }

    function buildPosterCardHtml(item) {
        var posterUrl = getItemPosterUrl(item, 400);
        var year = item.ProductionYear ? String(item.ProductionYear) : '';
        var isPlayed = item.UserData && item.UserData.Played;
        var genres = Array.isArray(item.Genres) ? item.Genres.slice(0, 2).join(' · ') : '';
        var rating = item.CommunityRating ? Number(item.CommunityRating).toFixed(1) : '';
        var topRank = getTop10Rank(item && item.Id);

        return ''
            + '<div class="streamflix-poster-card" data-item-id="' + escapeHtml(item.Id) + '" tabindex="0" role="button" aria-label="' + escapeHtml((topRank ? '#' + topRank + ' ' : '') + item.Name) + '">'
            + '  <div class="streamflix-poster-img-wrap">'
            + '    <div class="streamflix-card-fallback">' + escapeHtml(item.Name) + '</div>'
            + '    <img class="streamflix-poster-img" loading="lazy" src="' + escapeHtml(posterUrl) + '" alt="" data-bfx-img="fade" />'
            + (topRank
                ? '<span class="streamflix-top10-rank-badge" title="Ranked #' + topRank + ' in Top 10">#' + topRank + '</span>'
                : (isRecentlyAdded(item) ? '<span class="streamflix-card-flag">New</span>' : ''))
            + (isPlayed ? '<span class="streamflix-card-watched" title="Watched">' + icon('check') + '</span>' : '')
            + '    <div class="streamflix-card-hover-overlay">'
            + '      <div class="streamflix-card-info">'
            + '        <div class="streamflix-card-title">' + escapeHtml(item.Name) + '</div>'
            + '        <div class="streamflix-card-meta">'
            + (rating ? '<span class="streamflix-card-rating">' + icon('star') + escapeHtml(rating) + '</span>' : '')
            + '<span>' + escapeHtml(buildCardMetaText(item)) + '</span></div>'
            + (genres ? '<div class="streamflix-card-genres">' + escapeHtml(genres) + '</div>' : '')
            + '      </div>'
            + buildCardQuickButtons(item, true)
            + '    </div>'
            + '  </div>'
            + '  <div class="streamflix-poster-footer">'
            + '    <div class="streamflix-poster-name">' + escapeHtml(item.Name) + '</div>'
            + '    <div class="streamflix-poster-sub"><span>' + escapeHtml(year) + '</span>' + (rating ? '<span class="streamflix-card-rating">' + icon('star') + escapeHtml(rating) + '</span>' : '') + '</div>'
            + '  </div>'
            + '</div>';
    }

    function buildWideCardHtml(item, opts) {
        var backdropUrl = getItemBackdropUrl(item, 640);
        var pct = (item.UserData && item.UserData.PlayedPercentage) ? Math.min(100, Math.max(2, Math.round(item.UserData.PlayedPercentage))) : 0;
        var hasResumePos = Boolean((opts && typeof opts === 'object' && opts.removable) || pct > 0 || (item.UserData && item.UserData.PlaybackPositionTicks > 0));
        var title = item.SeriesName ? item.SeriesName : item.Name;
        var timeLeft = formatTimeLeft(item);
        var sub = item.SeriesName
            ? ('S' + (item.ParentIndexNumber || 1) + ' E' + (item.IndexNumber || 1) + ' · ' + item.Name)
            : (timeLeft || buildCardMetaText(item));

        return ''
            + '<div class="streamflix-wide-card" data-item-id="' + escapeHtml(item.Id) + '" tabindex="0" role="button" aria-label="' + escapeHtml(title) + '">'
            + '  <div class="streamflix-wide-img-wrap">'
            + '    <div class="streamflix-card-fallback">' + escapeHtml(title) + '</div>'
            + '    <img class="streamflix-wide-img" loading="lazy" src="' + escapeHtml(backdropUrl) + '" alt="" data-bfx-img="fade" />'
            + '    <div class="streamflix-wide-scrim"></div>'
            + '    <button type="button" class="streamflix-wide-play" data-action="play" title="' + (pct > 0 ? 'Resume' : 'Play') + '" aria-label="Play">' + icon('play') + '</button>'
            + '    <div class="streamflix-wide-actions">'
            + (hasResumePos ? '      <button type="button" class="streamflix-qbtn streamflix-qbtn-remove-resume" data-action="remove-resume" title="Remove from Continue Watching" aria-label="Remove from Continue Watching">' + icon('close') + '</button>' : '')
            + '      <button type="button" class="streamflix-qbtn" data-action="info" title="Details" aria-label="Details">' + icon('info') + '</button>'
            + '    </div>'
            + '    <div class="streamflix-wide-caption">'
            + '      <div class="streamflix-wide-title">' + escapeHtml(title) + '</div>'
            + '      <div class="streamflix-wide-sub">' + escapeHtml(sub) + '</div>'
            + '    </div>'
            + (pct > 0
                ? '<div class="streamflix-progress-track"><div class="streamflix-progress-fill" style="width:' + pct + '%;"></div></div>'
                : '')
            + '  </div>'
            + '</div>';
    }

    function buildTop10CardHtml(item, rank) {
        var posterUrl = getItemPosterUrl(item, 400);
        return ''
            + '<div class="streamflix-top10-card" data-item-id="' + escapeHtml(item.Id) + '" tabindex="0" role="button" aria-label="' + escapeHtml('#' + rank + ' ' + item.Name) + '">'
            + '  <span class="streamflix-top10-num" aria-hidden="true">' + rank + '</span>'
            + '  <div class="streamflix-top10-poster">'
            + '    <div class="streamflix-card-fallback">' + escapeHtml(item.Name) + '</div>'
            + '    <img loading="lazy" src="' + escapeHtml(posterUrl) + '" alt="" data-bfx-img="fade" />'
            + '    <span class="streamflix-top10-rank-badge" aria-hidden="true">#' + rank + '</span>'
            + '    <div class="streamflix-card-hover-overlay">'
            + '      <div class="streamflix-card-info"><div class="streamflix-card-title">' + escapeHtml(item.Name) + '</div></div>'
            + buildCardQuickButtons(item, false)
            + '    </div>'
            + '  </div>'
            + '</div>';
    }

    function buildRowHtml(rowId, title, cardsHtml, opts) {
        if (!cardsHtml) {
            return '';
        }
        opts = opts || {};
        var safeRowCls = sanitizeClassNames(opts.className);
        return ''
            + '<section class="streamflix-row' + (safeRowCls ? ' ' + safeRowCls : '') + '" data-row-id="' + escapeHtml(rowId) + '">'
            + '  <div class="streamflix-row-header">'
            + '    <h2 class="streamflix-row-title">' + title + '</h2>'
            + (opts.link ? '<button type="button" class="streamflix-row-link" data-cat-link="' + escapeHtml(opts.link) + '">Explore all' + icon('chevronRight') + '</button>' : '')
            + '  </div>'
            + '  <div class="streamflix-carousel-wrap at-start">'
            + '    <button type="button" class="streamflix-paddle left" data-scroll-dir="-1" aria-label="Scroll left">' + icon('chevronLeft') + '</button>'
            + '    <div class="streamflix-carousel-track">' + cardsHtml + '</div>'
            + '    <button type="button" class="streamflix-paddle right" data-scroll-dir="1" aria-label="Scroll right">' + icon('chevronRight') + '</button>'
            + '  </div>'
            + '</section>';
    }

    function buildGridSectionHtml(sectionId, title, itemsList) {
        if (!Array.isArray(itemsList) || itemsList.length === 0) {
            return '';
        }
        var cardsHtml = itemsList.map(buildPosterCardHtml).join('');
        return ''
            + '<section class="streamflix-row streamflix-row-grid" data-row-id="' + escapeHtml(sectionId) + '">'
            + '  <div class="streamflix-row-header">'
            + '    <h2 class="streamflix-row-title">' + title + '</h2>'
            + '  </div>'
            + '  <div class="streamflix-grid">' + cardsHtml + '</div>'
            + '</section>';
    }

    function buildEmptyStateHtml(iconName, title, text) {
        return ''
            + '<div class="streamflix-empty-state">'
            + '  <div class="streamflix-empty-icon">' + icon(iconName) + '</div>'
            + '  <div class="streamflix-empty-title">' + escapeHtml(title) + '</div>'
            + (text ? '<div class="streamflix-empty-text">' + escapeHtml(text) + '</div>' : '')
            + '</div>';
    }

    function rowTitle(text, count) {
        return escapeHtml(text) + (count ? '<span class="streamflix-row-count">' + count + '</span>' : '');
    }
