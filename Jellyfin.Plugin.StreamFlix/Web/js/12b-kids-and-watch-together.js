/* StreamFlix Client (12b/14) — Dedicated Kids Profile Mode, Parental Exit Lock & Clean Watch Together */
    /* ======================================================================
       PART A. DEDICATED KIDS PROFILE MODE & PARENTAL EXIT LOCK
       ====================================================================== */
    var KIDS_UNLOCK_SESSION_KEY = 'streamflix_kids_exit_ok_v1';
    var KIDS_UNLOCK_TTL_MS = 90 * 1000;
    var lastKidsGuardToastAt = 0;

    var GROWNUP_WORDS = [
        { digit: '1', word: 'One' },
        { digit: '2', word: 'Two' },
        { digit: '3', word: 'Three' },
        { digit: '4', word: 'Four' },
        { digit: '5', word: 'Five' },
        { digit: '6', word: 'Six' },
        { digit: '7', word: 'Seven' },
        { digit: '8', word: 'Eight' },
        { digit: '9', word: 'Nine' }
    ];

    var KIDS_WORLDS = [
        { id: 'all', emoji: '🌟', label: 'All Kids' },
        { id: 'animation', emoji: '🎨', label: 'Animation' },
        { id: 'family', emoji: '🧸', label: 'Family' },
        { id: 'adventure', emoji: '🚀', label: 'Adventure' },
        { id: 'comedy', emoji: '😂', label: 'Silly & Funny' },
        { id: 'fantasy', emoji: '🦄', label: 'Magic & Fantasy' },
        { id: 'short', emoji: '⚡', label: 'Quick Watch' }
    ];

    function isKidsProfileActive() {
        return Boolean(state.activeProfile && state.activeProfile.isKids);
    }

    function isKidsExitLockRequired() {
        if (!isKidsProfileActive()) {
            return false;
        }
        return state.activeProfile.kidsExitPinRequired !== false;
    }

    function clearKidsExitSession() {
        try {
            sessionStorage.removeItem(KIDS_UNLOCK_SESSION_KEY);
        } catch (e) {}
    }

    function getValidKidsExitSession() {
        try {
            var raw = sessionStorage.getItem(KIDS_UNLOCK_SESSION_KEY);
            if (!raw) {
                return null;
            }
            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                return null;
            }
            var curId = state.activeProfile && state.activeProfile.id;
            if (!curId || parsed.profileId !== curId) {
                sessionStorage.removeItem(KIDS_UNLOCK_SESSION_KEY);
                return null;
            }
            if (!parsed.ts || (Date.now() - Number(parsed.ts)) > KIDS_UNLOCK_TTL_MS) {
                sessionStorage.removeItem(KIDS_UNLOCK_SESSION_KEY);
                return null;
            }
            return parsed;
        } catch (e) {
            return null;
        }
    }

    function saveKidsExitSession(adultPin) {
        if (!state.activeProfile || !state.activeProfile.id) {
            return;
        }
        try {
            sessionStorage.setItem(KIDS_UNLOCK_SESSION_KEY, JSON.stringify({
                profileId: state.activeProfile.id,
                adultPin: String(adultPin || ''),
                ts: Date.now()
            }));
        } catch (e) {}
    }

    function isBlockedRouteInKidsMode(hashStr) {
        var h = String(hashStr || '').toLowerCase();
        if (!h) {
            return false;
        }
        return h.indexOf('#/dashboard') === 0
            || h.indexOf('#!/dashboard') === 0
            || h.indexOf('#/configurationpage') === 0
            || h.indexOf('#!/configurationpage') === 0
            || h.indexOf('#/mypreferences') === 0
            || h.indexOf('#!/mypreferences') === 0
            || h.indexOf('#/userprofile') === 0
            || h.indexOf('#!/userprofile') === 0
            || h.indexOf('#/quickconnect') === 0
            || h.indexOf('#!/quickconnect') === 0;
    }

    function enforceKidsRouteGuard() {
        if (!isKidsProfileActive() || isGateOpen()) {
            return false;
        }
        if (!isBlockedRouteInKidsMode(window.location.hash)) {
            return false;
        }
        window.location.hash = '#/home';
        var now = Date.now();
        if (now - lastKidsGuardToastAt > 2500) {
            lastKidsGuardToastAt = now;
            showToast('Settings are locked while in Kids mode.', 'info');
        }
        return true;
    }

    function filterItemsForKidsMode(items) {
        if (!Array.isArray(items) || !isKidsProfileActive()) {
            return items || [];
        }
        var adultRatingRe = /^(R|NC-17|TV-MA|18\+|18|16\+|MA\s*15\+|R18\+|FSK[\s-]*18|BBFC[\s-]*18|X|XXX|ADULT)$/i;
        return items.filter(function (it) {
            if (!it) {
                return false;
            }
            var rating = String(it.OfficialRating || '').trim();
            if (rating && adultRatingRe.test(rating)) {
                return false;
            }
            if (Array.isArray(it.Genres)) {
                for (var i = 0; i < it.Genres.length; i++) {
                    var g = String(it.Genres[i] || '').trim().toLowerCase();
                    if (g === 'horror' || g === 'erotica' || g === 'adult') {
                        return false;
                    }
                }
            }
            return true;
        });
    }

    function itemMatchesKidsWorld(item, worldId) {
        if (!item) {
            return false;
        }
        if (!worldId || worldId === 'all') {
            return true;
        }
        var genres = Array.isArray(item.Genres) ? item.Genres.map(function (g) { return String(g || '').toLowerCase(); }) : [];
        var hasGenre = function (terms) {
            for (var i = 0; i < genres.length; i++) {
                for (var j = 0; j < terms.length; j++) {
                    if (genres[i].indexOf(terms[j]) !== -1) {
                        return true;
                    }
                }
            }
            return false;
        };
        if (worldId === 'animation') {
            return hasGenre(['animation', 'anime', 'cartoon']);
        }
        if (worldId === 'family') {
            return hasGenre(['family', 'kids', 'children']);
        }
        if (worldId === 'adventure') {
            return hasGenre(['adventure', 'action', 'sci-fi']);
        }
        if (worldId === 'comedy') {
            return hasGenre(['comedy', 'funny']);
        }
        if (worldId === 'fantasy') {
            return hasGenre(['fantasy', 'magic', 'fairy']);
        }
        if (worldId === 'short') {
            var ticks = Number(item.RunTimeTicks || 0);
            if (ticks > 0 && ticks <= 35 * 60 * 10000000) {
                return true;
            }
            return item.Type === 'Episode';
        }
        return true;
    }

    function filterItemsByKidsWorld(items, worldId) {
        if (!Array.isArray(items)) {
            return [];
        }
        if (!worldId || worldId === 'all') {
            return items;
        }
        return items.filter(function (it) {
            return itemMatchesKidsWorld(it, worldId);
        });
    }

    function getKidsWorldMeta(worldId) {
        for (var i = 0; i < KIDS_WORLDS.length; i++) {
            if (KIDS_WORLDS[i].id === worldId) {
                return KIDS_WORLDS[i];
            }
        }
        return KIDS_WORLDS[0];
    }

    function buildKidsWorldStripHtml(poolItems) {
        if (!isKidsProfileActive()) {
            return '';
        }
        var pool = Array.isArray(poolItems) ? poolItems : [];
        if (pool.length < 2) {
            return '';
        }
        var activeWorld = state.kidsWorld || 'all';
        var available = KIDS_WORLDS.filter(function (w) {
            if (w.id === 'all') {
                return true;
            }
            return pool.some(function (it) { return itemMatchesKidsWorld(it, w.id); });
        });
        if (available.length <= 1) {
            return '';
        }
        if (!available.some(function (w) { return w.id === activeWorld; })) {
            activeWorld = 'all';
            state.kidsWorld = 'all';
        }
        return ''
            + '<div class="bfx-kids-worlds" role="tablist" aria-label="Kids Worlds">'
            + available.map(function (w) {
                var isAct = w.id === activeWorld;
                return '<button type="button" role="tab" aria-selected="' + (isAct ? 'true' : 'false') + '" class="bfx-kids-world-chip' + (isAct ? ' is-active' : '') + '" data-kids-world="' + escapeHtml(w.id) + '">'
                    + '<span class="bfx-kids-world-emoji" aria-hidden="true">' + w.emoji + '</span>'
                    + '<span class="bfx-kids-world-label">' + escapeHtml(w.label) + '</span>'
                    + '</button>';
            }).join('')
            + '</div>';
    }

    function bindKidsWorldStrip(scopeEl) {
        if (!scopeEl) {
            return;
        }
        Array.prototype.forEach.call(scopeEl.querySelectorAll('[data-kids-world]'), function (chip) {
            if (chip.__bfxKidsBound) {
                return;
            }
            chip.__bfxKidsBound = true;
            chip.addEventListener('click', function () {
                var nextWorld = chip.getAttribute('data-kids-world') || 'all';
                if (state.kidsWorld === nextWorld && nextWorld !== 'all') {
                    nextWorld = 'all';
                }
                state.kidsWorld = nextWorld;
                renderCinemaHubContents();
            });
        });
    }

    function syncKidsModeChrome() {
        if (!document.body) {
            return;
        }
        var kidsActive = isKidsProfileActive();
        document.body.classList.toggle('bfx-kids-mode', kidsActive);

        var overlayOpen = isGateOpen();
        var inVideo = isVideoPlayerActive();
        var onAdmin = isAdminConfigRoute();

        // 1. Top-left KIDS pill next to the brand wordmark
        var showBrandPill = kidsActive && !overlayOpen && !inVideo && !onAdmin;
        var existingPill = document.getElementById('bfx-kids-brand-pill');
        if (!showBrandPill) {
            if (existingPill && existingPill.parentNode) {
                existingPill.parentNode.removeChild(existingPill);
            }
        } else {
            var fbBrand = document.getElementById('bfx-fixed-corner-brand');
            var nativeBrand = document.querySelector('[data-streamflix-corner-brand="true"]');
            var anchor = null;
            var useFixedCoords = false;

            if (fbBrand && fbBrand.offsetParent !== null) {
                anchor = fbBrand;
                useFixedCoords = true;
            } else if (nativeBrand && nativeBrand.offsetParent !== null && nativeBrand.getBoundingClientRect().width > 8) {
                anchor = nativeBrand;
                useFixedCoords = false;
            }

            if (!anchor) {
                if (existingPill && existingPill.parentNode) {
                    existingPill.parentNode.removeChild(existingPill);
                }
            } else {
                if (!existingPill) {
                    existingPill = document.createElement('span');
                    existingPill.id = 'bfx-kids-brand-pill';
                    existingPill.className = 'bfx-kids-brand-pill';
                    existingPill.textContent = 'KIDS';
                    existingPill.setAttribute('aria-label', 'Kids Mode');
                }
                if (useFixedCoords) {
                    existingPill.classList.add('is-fixed');
                    existingPill.classList.remove('is-inline');
                    if (existingPill.parentNode !== document.body) {
                        document.body.appendChild(existingPill);
                    }
                    var rect = anchor.getBoundingClientRect();
                    existingPill.style.left = Math.round(rect.right + 8) + 'px';
                    existingPill.style.top = Math.round(rect.top + Math.max(0, (rect.height - 20) / 2)) + 'px';
                } else {
                    existingPill.classList.add('is-inline');
                    existingPill.classList.remove('is-fixed');
                    existingPill.style.removeProperty('left');
                    existingPill.style.removeProperty('top');
                    if (anchor.nextSibling !== existingPill) {
                        anchor.insertAdjacentElement('afterend', existingPill);
                    }
                }
            }
        }

        // 2. Top-right Exit Kids button on desktop / tablet / Smart TV (phones use the Kids sheet via mobile dock)
        var isGuest = isGuestPassSession();
        var showExitBtn = kidsActive && !isGuest && !overlayOpen && !inVideo && !onAdmin && !isMobileDockViewportActive();
        var exitBtn = document.getElementById('bfx-exit-kids-btn');
        if (!showExitBtn) {
            if (exitBtn && exitBtn.parentNode) {
                exitBtn.parentNode.removeChild(exitBtn);
            }
            return;
        }

        if (!exitBtn) {
            exitBtn = document.createElement('button');
            exitBtn.type = 'button';
            exitBtn.id = 'bfx-exit-kids-btn';
            exitBtn.className = 'bfx-exit-kids-btn';
            exitBtn.addEventListener('click', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                exitKidsModeToPicker();
            });
            document.body.appendChild(exitBtn);
        }

        var lockNeeded = isKidsExitLockRequired() && !getValidKidsExitSession();
        var wantedSig = lockNeeded ? 'locked' : 'unlocked';
        if (exitBtn.getAttribute('data-sig') !== wantedSig) {
            exitBtn.setAttribute('data-sig', wantedSig);
            exitBtn.title = lockNeeded ? 'Exit Kids mode (parental check)' : 'Exit Kids mode';
            exitBtn.innerHTML = (lockNeeded ? icon('lock') : icon('logout')) + '<span>Exit Kids</span>';
        }

        var profBtn = document.getElementById('streamflix-header-profile-btn');
        if (profBtn && profBtn.offsetParent !== null) {
            var pRect = profBtn.getBoundingClientRect();
            if (pRect.width > 0) {
                exitBtn.style.right = Math.max(84, Math.round(window.innerWidth - pRect.left + 10)) + 'px';
            }
        } else {
            exitBtn.style.right = '148px';
        }
    }

    function openAdultPinExitModal(initialError) {
        return new Promise(function (resolve) {
            var settled = false;
            var finish = function (val) {
                if (settled) {
                    return;
                }
                settled = true;
                resolve(val);
            };

            var m = openModal(''
                + '<div class="bfx-kids-lock-head">'
                + '  <div class="bfx-kids-lock-badge">' + icon('lock') + '</div>'
                + '  <h2 class="streamflix-modal-title" style="margin:0;">Exit Kids Mode</h2>'
                + '  <p class="streamflix-modal-sub" style="margin:6px 0 0;">Enter any adult profile PIN to leave Kids mode.</p>'
                + '</div>'
                + '<div class="bfx-kids-pin-field">'
                + '  <input type="password" id="bfx-adult-exit-pin-input" class="streamflix-input bfx-adult-pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="one-time-code" placeholder="Enter 4–8 digit PIN" />'
                + '</div>'
                + '<div id="bfx-adult-exit-err" class="streamflix-pin-error" aria-live="assertive">' + escapeHtml(initialError || '') + '</div>'
                + '<div class="streamflix-modal-actions" style="justify-content:space-between;margin-top:16px;">'
                + '  <button type="button" class="streamflix-ghost-btn" id="bfx-adult-exit-cancel">Stay in Kids</button>'
                + '  <button type="button" class="streamflix-btn-primary" id="bfx-adult-exit-submit">' + iconLabel('lock', 'Unlock') + '</button>'
                + '</div>', {
                className: 'streamflix-modal-pin bfx-kids-exit-modal',
                onClose: function () {
                    finish({ verified: false, adultPin: '' });
                }
            });

            var modal = m.modal;
            var input = modal.querySelector('#bfx-adult-exit-pin-input');
            var errEl = modal.querySelector('#bfx-adult-exit-err');
            var submitBtn = modal.querySelector('#bfx-adult-exit-submit');
            var cancelBtn = modal.querySelector('#bfx-adult-exit-cancel');
            var busy = false;

            input.addEventListener('input', function () {
                input.value = input.value.replace(/\D/g, '').slice(0, 8);
                if (errEl && errEl.textContent) {
                    errEl.textContent = '';
                }
            });

            var doVerify = function () {
                if (busy) {
                    return;
                }
                var pinVal = (input.value || '').trim();
                if (!/^\d{4,8}$/.test(pinVal)) {
                    errEl.textContent = 'Enter a 4 to 8 digit adult PIN.';
                    input.focus();
                    return;
                }
                busy = true;
                submitBtn.disabled = true;
                submitBtn.classList.add('streamflix-btn-loading');
                apiFetch('/StreamFlix/Profiles/VerifyAdultPin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin: pinVal })
                }).then(function () {
                    saveKidsExitSession(pinVal);
                    settled = true;
                    m.close();
                    syncKidsModeChrome();
                    resolve({ verified: true, adultPin: pinVal });
                }).catch(function (err) {
                    busy = false;
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('streamflix-btn-loading');
                    errEl.textContent = (err && err.message) || 'Incorrect PIN.';
                    modal.classList.remove('shake');
                    void modal.offsetWidth;
                    modal.classList.add('shake');
                    input.value = '';
                    try { input.focus(); } catch (e) {}
                });
            };

            submitBtn.addEventListener('click', doVerify);
            cancelBtn.addEventListener('click', function () {
                m.close();
            });
            input.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    doVerify();
                }
            });
            setTimeout(function () {
                try { input.focus(); } catch (e) {}
            }, 40);
        });
    }

    function openGrownUpChallengeModal() {
        return new Promise(function (resolve) {
            var settled = false;
            var finish = function (val) {
                if (settled) {
                    return;
                }
                settled = true;
                resolve(val);
            };

            var challenge = [];
            for (var i = 0; i < 4; i++) {
                challenge.push(GROWNUP_WORDS[Math.floor(Math.random() * GROWNUP_WORDS.length)]);
            }
            var expectedCode = challenge.map(function (c) { return c.digit; }).join('');
            var wordsHtml = challenge.map(function (c) {
                return '<span class="bfx-grownup-word">' + escapeHtml(c.word) + '</span>';
            }).join('<span class="bfx-grownup-dot" aria-hidden="true">·</span>');

            var boxesHtml = '';
            for (var b = 0; b < 4; b++) {
                boxesHtml += '<input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" class="streamflix-pin-box" data-idx="' + b + '" autocomplete="off" aria-label="Digit ' + (b + 1) + '" />';
            }

            var m = openModal(''
                + '<div class="bfx-kids-lock-head">'
                + '  <div class="bfx-kids-lock-badge is-grownup">' + icon('shield') + '</div>'
                + '  <h2 class="streamflix-modal-title" style="margin:0;">Grown-Up Check</h2>'
                + '  <p class="streamflix-modal-sub" style="margin:6px 0 0;">Enter these four numbers as digits to exit Kids mode:</p>'
                + '</div>'
                + '<div class="bfx-grownup-words" aria-label="Challenge words">' + wordsHtml + '</div>'
                + '<div class="streamflix-pin-boxes" id="bfx-grownup-boxes">' + boxesHtml + '</div>'
                + '<div id="bfx-grownup-err" class="streamflix-pin-error" aria-live="assertive"></div>'
                + '<div class="streamflix-modal-actions" style="justify-content:center;margin-top:12px;">'
                + '  <button type="button" class="streamflix-ghost-btn" id="bfx-grownup-cancel">Stay in Kids</button>'
                + '</div>', {
                className: 'streamflix-modal-pin bfx-kids-exit-modal',
                onClose: function () {
                    finish({ verified: false, adultPin: '' });
                }
            });

            var modal = m.modal;
            var boxes = Array.prototype.slice.call(modal.querySelectorAll('.streamflix-pin-box'));
            var errEl = modal.querySelector('#bfx-grownup-err');

            var checkCode = function () {
                var code = boxes.map(function (bx) { return bx.value; }).join('');
                if (code.length < 4) {
                    return;
                }
                if (code === expectedCode) {
                    saveKidsExitSession('');
                    settled = true;
                    m.close();
                    syncKidsModeChrome();
                    resolve({ verified: true, adultPin: '' });
                    return;
                }
                errEl.textContent = 'Those digits didn\'t match. Try again.';
                modal.classList.remove('shake');
                void modal.offsetWidth;
                modal.classList.add('shake');
                boxes.forEach(function (bx) { bx.value = ''; });
                try { boxes[0].focus(); } catch (e) {}
            };

            boxes.forEach(function (box, idx) {
                box.addEventListener('input', function () {
                    var v = box.value.replace(/\D/g, '');
                    box.value = v ? v.slice(-1) : '';
                    if (errEl && errEl.textContent) {
                        errEl.textContent = '';
                    }
                    if (box.value && idx < boxes.length - 1) {
                        boxes[idx + 1].focus();
                    }
                    if (boxes.every(function (bx) { return bx.value.length === 1; })) {
                        checkCode();
                    }
                });
                box.addEventListener('keydown', function (ev) {
                    if (ev.key === 'Backspace' && !box.value && idx > 0) {
                        boxes[idx - 1].value = '';
                        boxes[idx - 1].focus();
                    } else if (ev.key === 'Enter') {
                        checkCode();
                    }
                });
            });

            modal.querySelector('#bfx-grownup-cancel').addEventListener('click', function () {
                m.close();
            });
            setTimeout(function () {
                try { boxes[0].focus(); } catch (e) {}
            }, 40);
        });
    }

    function requestExitKidsVerification(targetProfile, initialError) {
        if (!isKidsExitLockRequired()) {
            return Promise.resolve({ verified: true, adultPin: '' });
        }
        if (!initialError) {
            var cached = getValidKidsExitSession();
            if (cached) {
                return Promise.resolve({ verified: true, adultPin: cached.adultPin || '' });
            }
        }
        var hasAdultPin = Boolean(state.config && state.config.hasAnyAdultPin);
        if (hasAdultPin) {
            return openAdultPinExitModal(initialError || '');
        }
        return openGrownUpChallengeModal();
    }

    function exitKidsModeToPicker() {
        closeAccountDropdown();
        return requestExitKidsVerification(null).then(function (res) {
            if (!res || !res.verified) {
                return;
            }
            state.manageMode = false;
            renderProfilePickerGate();
        });
    }

    /* ======================================================================
       PART B. CLEAN WATCH TOGETHER (Jellyfin SyncPlay Engine)
       ====================================================================== */
    var PENDING_WATCHPARTY_KEY = 'streamflix_pending_watchparty_v1';
    var ACTIVE_WATCHPARTY_GROUP_KEY = 'streamflix_active_wp_group_v1';

    var watchPartyState = {
        activeGroup: null,
        joinedGroupId: '',
        targetItem: null,
        groups: [],
        loading: false,
        pollTimer: null,
        wsListenersInstalled: false,
        processingPending: false
    };

    try {
        watchPartyState.joinedGroupId = sessionStorage.getItem(ACTIVE_WATCHPARTY_GROUP_KEY) || '';
    } catch (e) {}

    function isWatchTogetherEnabled() {
        if (!state.config || state.config.enableWatchTogether === false) {
            return false;
        }
        if (!state.activeProfile || state.activeProfile.isKids) {
            return false;
        }
        return true;
    }

    function setJoinedWatchPartyGroupId(groupId) {
        var norm = groupId ? String(groupId).trim() : '';
        watchPartyState.joinedGroupId = norm;
        try {
            if (norm) {
                sessionStorage.setItem(ACTIVE_WATCHPARTY_GROUP_KEY, norm);
            } else {
                sessionStorage.removeItem(ACTIVE_WATCHPARTY_GROUP_KEY);
            }
        } catch (e) {}
    }

    function isValidGuidString(val) {
        return /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(String(val || '').trim());
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
            var groupId = extractParam('watchparty');
            var itemId = extractParam('wpitem');
            if (!isValidGuidString(groupId)) {
                return null;
            }
            var payload = {
                groupId: groupId,
                itemId: isValidGuidString(itemId) ? itemId : '',
                capturedAt: Date.now()
            };
            sessionStorage.setItem(PENDING_WATCHPARTY_KEY, JSON.stringify(payload));

            // Strip watchparty/wpitem from search bar only when no OAuth/OIDC/Guest callback is still pending in window.location.search
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

    function ensureJellyfinWebSocketOpen() {
        try {
            var ac = window.ApiClient;
            if (!ac) {
                return;
            }
            var openNow = typeof ac.isWebSocketOpen === 'function' ? ac.isWebSocketOpen() : false;
            if (!openNow) {
                if (typeof ac.ensureWebSocket === 'function') {
                    ac.ensureWebSocket();
                } else if (typeof ac.openWebSocket === 'function') {
                    ac.openWebSocket();
                }
            }
            if (!watchPartyState.wsListenersInstalled && window.Events && typeof window.Events.on === 'function') {
                watchPartyState.wsListenersInstalled = true;
                window.Events.on(ac, 'message', function (_, msg) {
                    if (msg && (msg.MessageType === 'SyncPlayGroupUpdate' || msg.MessageType === 'SyncPlayCommand')) {
                        if (msg.MessageType === 'SyncPlayGroupUpdate' && msg.Data) {
                            var updateType = String(msg.Data.Type || '');
                            if (updateType === 'GroupLeft' || updateType === 'NotInGroup') {
                                setJoinedWatchPartyGroupId('');
                                watchPartyState.activeGroup = null;
                                stopWatchPartyPolling();
                                syncWatchPartyIndicators();
                                return;
                            }
                            if (msg.Data.GroupId && (updateType === 'GroupJoined' || updateType === 'StateUpdate')) {
                                setJoinedWatchPartyGroupId(msg.Data.GroupId);
                            }
                        }
                        refreshWatchPartyState(true);
                    }
                });
            }
        } catch (e) {}
    }

    function stopWatchPartyPolling() {
        if (watchPartyState.pollTimer) {
            clearInterval(watchPartyState.pollTimer);
            watchPartyState.pollTimer = null;
        }
    }

    function ensureWatchPartyPolling() {
        if (!watchPartyState.activeGroup) {
            stopWatchPartyPolling();
            return;
        }
        if (watchPartyState.pollTimer) {
            return;
        }
        watchPartyState.pollTimer = setInterval(function () {
            if (document.hidden || !isWatchTogetherEnabled()) {
                return;
            }
            refreshWatchPartyState(true);
        }, 12000);
    }

    function getActiveWatchPartyParticipantCount() {
        var g = watchPartyState.activeGroup;
        if (!g) {
            return 0;
        }
        if (Array.isArray(g.Participants) && g.Participants.length > 0) {
            return g.Participants.length;
        }
        return 1;
    }

    function syncWatchPartyIndicators() {
        var activeGroup = isWatchTogetherEnabled() ? watchPartyState.activeGroup : null;
        var count = activeGroup ? getActiveWatchPartyParticipantCount() : 0;

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
                wpChip.title = 'In Watch Together: ' + (activeGroup.GroupName || 'Watch Party') + ' (' + count + ')';
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

        // 3. Video OSD button state if player is active
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

    function resolveActiveGroupFromList(groups) {
        if (!Array.isArray(groups) || !groups.length) {
            return null;
        }
        var joinedNorm = normalizeGuid(watchPartyState.joinedGroupId);
        if (joinedNorm) {
            for (var i = 0; i < groups.length; i++) {
                if (groups[i] && normalizeGuid(groups[i].GroupId) === joinedNorm) {
                    return groups[i];
                }
            }
            // Group ended or user left on another event
            setJoinedWatchPartyGroupId('');
        }
        return null;
    }

    function refreshWatchPartyState(silent) {
        if (!isWatchTogetherEnabled() || !getJellyfinAuthContext().token) {
            watchPartyState.groups = [];
            watchPartyState.activeGroup = null;
            stopWatchPartyPolling();
            syncWatchPartyIndicators();
            return Promise.resolve([]);
        }
        watchPartyState.loading = true;
        return apiFetch('/SyncPlay/List').then(function (list) {
            watchPartyState.loading = false;
            var groups = Array.isArray(list) ? list : [];
            watchPartyState.groups = groups;
            watchPartyState.activeGroup = resolveActiveGroupFromList(groups);
            ensureWatchPartyPolling();
            syncWatchPartyIndicators();
            return groups;
        }).catch(function (err) {
            watchPartyState.loading = false;
            if (!silent) {
                showToast((err && err.message) || 'Could not load Watch Together rooms.', 'error');
            }
            return watchPartyState.groups || [];
        });
    }

    function createWatchPartyRoom(groupName, targetItem) {
        var cleanName = String(groupName || '').trim().slice(0, 64);
        if (!cleanName) {
            var pName = (state.activeProfile && state.activeProfile.name) || 'StreamFlix';
            cleanName = pName + '\'s Watch Party';
        }
        ensureJellyfinWebSocketOpen();
        var prevIds = {};
        (watchPartyState.groups || []).forEach(function (g) {
            if (g && g.GroupId) {
                prevIds[normalizeGuid(g.GroupId)] = true;
            }
        });

        return apiFetch('/SyncPlay/New', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ GroupName: cleanName })
        }).then(function (createdRes) {
            if (createdRes && typeof createdRes === 'object' && createdRes.GroupId) {
                setJoinedWatchPartyGroupId(createdRes.GroupId);
            }
            if (targetItem && targetItem.Id) {
                watchPartyState.targetItem = targetItem;
            }
            return apiFetch('/SyncPlay/List');
        }).then(function (list) {
            var groups = Array.isArray(list) ? list : [];
            watchPartyState.groups = groups;
            if (!watchPartyState.joinedGroupId && groups.length > 0) {
                var myUser = String((state.activeProfile && state.activeProfile.jellyfinUsername) || '').toLowerCase();
                var matched = null;
                for (var i = 0; i < groups.length; i++) {
                    var g = groups[i];
                    if (!g || !g.GroupId) {
                        continue;
                    }
                    if (!prevIds[normalizeGuid(g.GroupId)] && String(g.GroupName || '') === cleanName) {
                        matched = g;
                        break;
                    }
                }
                if (!matched) {
                    for (var j = 0; j < groups.length; j++) {
                        var gj = groups[j];
                        if (!gj || !gj.GroupId) {
                            continue;
                        }
                        var parts = Array.isArray(gj.Participants) ? gj.Participants : [];
                        if (String(gj.GroupName || '') === cleanName || (myUser && parts.some(function (u) { return String(u || '').toLowerCase() === myUser; }))) {
                            matched = gj;
                            break;
                        }
                    }
                }
                if (!matched && groups.length === 1) {
                    matched = groups[0];
                }
                if (matched && matched.GroupId) {
                    setJoinedWatchPartyGroupId(matched.GroupId);
                }
            }
            watchPartyState.activeGroup = resolveActiveGroupFromList(groups);
            ensureWatchPartyPolling();
            syncWatchPartyIndicators();
            return watchPartyState.activeGroup;
        });
    }

    function joinWatchPartyRoom(groupId) {
        if (!isValidGuidString(groupId)) {
            return Promise.reject(new Error('Invalid Watch Together room ID.'));
        }
        ensureJellyfinWebSocketOpen();
        return apiFetch('/SyncPlay/Join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ GroupId: groupId })
        }).then(function () {
            setJoinedWatchPartyGroupId(groupId);
            return refreshWatchPartyState(true);
        }).then(function () {
            return watchPartyState.activeGroup;
        });
    }

    function leaveWatchPartyRoom() {
        return apiFetch('/SyncPlay/Leave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        }).catch(function () {}).then(function () {
            setJoinedWatchPartyGroupId('');
            watchPartyState.activeGroup = null;
            watchPartyState.targetItem = null;
            stopWatchPartyPolling();
            syncWatchPartyIndicators();
            return refreshWatchPartyState(true);
        });
    }

    function buildWatchPartyInviteUrl(groupId, itemId) {
        var base = window.location.origin + (window.location.pathname || '/web/');
        var qs = '?watchparty=' + encodeURIComponent(groupId);
        if (itemId && isValidGuidString(itemId)) {
            qs += '&wpitem=' + encodeURIComponent(itemId);
        }
        return base + qs + '#/home';
    }

    function appendWatchPartyQueryToGuestUrl(guestUrl, groupId, itemId) {
        if (!guestUrl || !groupId) {
            return guestUrl || '';
        }
        var sep = guestUrl.indexOf('?') === -1 ? '?' : '&';
        var out = guestUrl + sep + 'watchparty=' + encodeURIComponent(groupId);
        if (itemId && isValidGuidString(itemId)) {
            out += '&wpitem=' + encodeURIComponent(itemId);
        }
        return out;
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
            // If this tab previously joined a room before a page reload, re-sync indicators quietly
            if (watchPartyState.joinedGroupId && !watchPartyState.activeGroup && isWatchTogetherEnabled()) {
                ensureJellyfinWebSocketOpen();
                refreshWatchPartyState(true);
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
        if (!pending || !isValidGuidString(pending.groupId)) {
            return;
        }
        if (pending.capturedAt && (Date.now() - Number(pending.capturedAt)) > 3 * 3600 * 1000) {
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
        joinWatchPartyRoom(pending.groupId).then(function (group) {
            watchPartyState.processingPending = false;
            var roomLabel = (group && group.GroupName) ? ('“' + group.GroupName + '”') : 'Watch Party';
            showToast('Joined ' + roomLabel + '!', 'success');
            if (pending.itemId && isValidGuidString(pending.itemId)) {
                var uid = getJellyfinAuthContext().userId;
                if (uid) {
                    apiFetch('/Users/' + encodeURIComponent(uid) + '/Items/' + encodeURIComponent(pending.itemId))
                        .then(function (it) {
                            if (it && it.Id) {
                                watchPartyState.targetItem = it;
                                if (!isVideoPlayerActive()) {
                                    openWatchTogetherModal({ item: it });
                                }
                            }
                        }).catch(function () {
                            if (!isVideoPlayerActive()) {
                                openWatchTogetherModal({});
                            }
                        });
                    return;
                }
            }
            if (!isVideoPlayerActive()) {
                openWatchTogetherModal({});
            }
        }).catch(function (err) {
            watchPartyState.processingPending = false;
            showToast((err && err.message) || 'That Watch Together room is no longer active.', 'info');
        });
    }

    function formatSyncPlayStateLabel(rawState) {
        var s = String(rawState || '').toLowerCase();
        if (s === 'playing') {
            return 'Playing in sync';
        }
        if (s === 'paused') {
            return 'Paused';
        }
        if (s === 'waiting') {
            return 'Buffering / syncing';
        }
        return 'Ready';
    }

    function openWatchTogetherModal(opts) {
        opts = opts || {};
        if (!isWatchTogetherEnabled()) {
            return;
        }
        ensureJellyfinWebSocketOpen();

        var contextItem = opts.item || watchPartyState.targetItem || null;
        var playableTarget = opts.playableTarget || contextItem || null;
        if (contextItem && contextItem.Id) {
            watchPartyState.targetItem = contextItem;
        }

        var defaultRoomName = ((state.activeProfile && state.activeProfile.name) || 'StreamFlix') + '\'s Watch Party';
        var guestInvitePass = null;

        var m = openModal('<div id="bfx-wp-modal-root" class="bfx-wp-root"><div class="bfx-wp-loading"><div class="streamflix-spinner-ring"></div><span>Loading Watch Together…</span></div></div>', {
            className: 'streamflix-modal-wide bfx-wp-modal'
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

        function renderModalBody() {
            if (!rootEl || !m.modal.parentNode) {
                return;
            }
            var activeGroup = watchPartyState.activeGroup;
            var groups = Array.isArray(watchPartyState.groups) ? watchPartyState.groups : [];
            var itemTitle = '';
            var itemId = '';
            if (contextItem && contextItem.Id) {
                itemId = contextItem.Id;
                itemTitle = contextItem.SeriesName
                    ? (contextItem.SeriesName + (contextItem.Name ? ' · ' + contextItem.Name : ''))
                    : (contextItem.Name || 'Selected Title');
            }

            var targetBannerHtml = itemTitle
                ? (''
                    + '<div class="bfx-wp-target-banner">'
                    + '  <span class="bfx-wp-target-ico">' + icon('play') + '</span>'
                    + '  <div class="bfx-wp-target-copy">'
                    + '    <span class="bfx-wp-target-kicker">Ready to watch together</span>'
                    + '    <strong>' + escapeHtml(itemTitle) + '</strong>'
                    + '  </div>'
                    + '</div>')
                : '';

            var html = ''
                + '<div class="bfx-wp-header">'
                + '  <div class="bfx-wp-title-wrap">'
                + '    <span class="bfx-wp-hero-ico">' + icon('party') + '</span>'
                + '    <div>'
                + '      <h2 class="streamflix-modal-title" style="margin:0;">Watch Together</h2>'
                + '      <p class="streamflix-modal-sub" style="margin:3px 0 0;">Play, pause &amp; seek in real-time sync across devices.</p>'
                + '    </div>'
                + '  </div>'
                + '  <div class="bfx-wp-header-actions">'
                + '    <button type="button" class="streamflix-ghost-btn bfx-wp-icon-btn" id="bfx-wp-refresh-btn" title="Refresh rooms" aria-label="Refresh rooms">' + icon('refresh') + '</button>'
                + '    <button type="button" class="streamflix-ghost-btn bfx-wp-icon-btn" id="bfx-wp-close-btn" title="Close" aria-label="Close">' + icon('close') + '</button>'
                + '  </div>'
                + '</div>';

            if (activeGroup) {
                var participants = Array.isArray(activeGroup.Participants) && activeGroup.Participants.length
                    ? activeGroup.Participants
                    : [(state.activeProfile && state.activeProfile.jellyfinUsername) || (state.activeProfile && state.activeProfile.name) || 'You'];
                var inviteUrl = buildWatchPartyInviteUrl(activeGroup.GroupId, itemId);
                var stateLabel = formatSyncPlayStateLabel(activeGroup.State);

                var partChipsHtml = participants.map(function (u) {
                    var label = String(u || 'Viewer');
                    var initial = label.charAt(0).toUpperCase() || 'V';
                    return '<span class="bfx-wp-member-chip"><span class="bfx-wp-member-av">' + escapeHtml(initial) + '</span><span>' + escapeHtml(label) + '</span></span>';
                }).join('');

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
                            + '    <div class="streamflix-field-hint" style="margin-top:6px;">Friends without an account sign in automatically as <strong>' + escapeHtml(guestInvitePass.profileName || 'Guest') + '</strong> and join this room in one tap.</div>'
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
                    + '      <div class="bfx-wp-live-pill"><span class="bfx-wp-pulse-dot"></span><span>LIVE ROOM · ' + escapeHtml(stateLabel) + '</span></div>'
                    + '      <h3 class="bfx-wp-room-name">' + escapeHtml(activeGroup.GroupName || 'Watch Party') + '</h3>'
                    + '    </div>'
                    + '    <button type="button" class="streamflix-btn-danger bfx-wp-leave-btn" id="bfx-wp-leave-btn">' + iconLabel('logout', 'Leave Party') + '</button>'
                    + '  </div>'
                    + '  <div class="bfx-wp-members-wrap">'
                    + '    <div class="bfx-wp-section-label">Watching (' + participants.length + ')</div>'
                    + '    <div class="bfx-wp-members">' + partChipsHtml + '</div>'
                    + '  </div>'
                    + targetBannerHtml
                    + (playableTarget && playableTarget.Id && !isVideoPlayerActive()
                        ? '  <button type="button" class="streamflix-btn-primary bfx-wp-play-cta" id="bfx-wp-play-now-btn">' + iconLabel('play', 'Start Watching Together') + '</button>'
                        : '')
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
                var roomsHtml = groups.length
                    ? groups.map(function (g) {
                        var parts = Array.isArray(g.Participants) ? g.Participants : [];
                        var countLabel = parts.length === 1 ? '1 viewer' : (parts.length + ' viewers');
                        var sub = countLabel + ' · ' + formatSyncPlayStateLabel(g.State) + (parts.length ? ' · ' + parts.slice(0, 3).join(', ') : '');
                        return ''
                            + '<div class="bfx-wp-room-row">'
                            + '  <div class="bfx-wp-room-meta">'
                            + '    <div class="bfx-wp-room-row-title"><span class="bfx-wp-pulse-dot"></span><span>' + escapeHtml(g.GroupName || 'Watch Party') + '</span></div>'
                            + '    <div class="bfx-wp-room-row-sub">' + escapeHtml(sub) + '</div>'
                            + '  </div>'
                            + '  <button type="button" class="streamflix-btn-primary bfx-wp-join-btn" data-join-group-id="' + escapeHtml(g.GroupId) + '">Join</button>'
                            + '</div>';
                    }).join('')
                    : '<div class="bfx-wp-empty">No active watch parties right now. Start one above and share the link!</div>';

                html += ''
                    + '<div class="bfx-wp-create-card">'
                    + targetBannerHtml
                    + '  <label class="bfx-wp-section-label" for="bfx-wp-room-input">Start a New Watch Party</label>'
                    + '  <div class="bfx-wp-create-row">'
                    + '    <input type="text" id="bfx-wp-room-input" class="streamflix-input" maxlength="64" value="' + escapeHtml(defaultRoomName) + '" placeholder="Room name" />'
                    + '    <button type="button" class="streamflix-btn-primary" id="bfx-wp-create-btn">' + iconLabel('party', 'Start Party') + '</button>'
                    + '  </div>'
                    + '</div>'
                    + '<div class="bfx-wp-rooms-section">'
                    + '  <div class="bfx-wp-section-label">Active Rooms (' + groups.length + ')</div>'
                    + '  <div class="bfx-wp-rooms-list">' + roomsHtml + '</div>'
                    + '</div>';
            }

            rootEl.innerHTML = html;

            var closeBtn = rootEl.querySelector('#bfx-wp-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', function () { m.close(); });
            }
            var refreshBtn = rootEl.querySelector('#bfx-wp-refresh-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', function () {
                    refreshWatchPartyState(false).then(renderModalBody);
                });
            }

            var createBtn = rootEl.querySelector('#bfx-wp-create-btn');
            var roomInput = rootEl.querySelector('#bfx-wp-room-input');
            if (createBtn && roomInput) {
                var handleCreate = function () {
                    createBtn.disabled = true;
                    createBtn.classList.add('streamflix-btn-loading');
                    defaultRoomName = (roomInput.value || '').trim() || defaultRoomName;
                    createWatchPartyRoom(defaultRoomName, contextItem).then(function () {
                        showToast('Watch Party started! Share the invite link below.', 'success');
                        renderModalBody();
                    }).catch(function (err) {
                        createBtn.disabled = false;
                        createBtn.classList.remove('streamflix-btn-loading');
                        showToast((err && err.message) || 'Could not start Watch Party.', 'error');
                    });
                };
                createBtn.addEventListener('click', handleCreate);
                roomInput.addEventListener('keydown', function (ev) {
                    if (ev.key === 'Enter') {
                        ev.preventDefault();
                        handleCreate();
                    }
                });
            }

            Array.prototype.forEach.call(rootEl.querySelectorAll('[data-join-group-id]'), function (joinBtn) {
                joinBtn.addEventListener('click', function () {
                    var gid = joinBtn.getAttribute('data-join-group-id');
                    joinBtn.disabled = true;
                    joinBtn.classList.add('streamflix-btn-loading');
                    joinWatchPartyRoom(gid).then(function () {
                        showToast('Joined Watch Party!', 'success');
                        renderModalBody();
                    }).catch(function (err) {
                        joinBtn.disabled = false;
                        joinBtn.classList.remove('streamflix-btn-loading');
                        showToast((err && err.message) || 'Could not join Watch Party.', 'error');
                    });
                });
            });

            var leaveBtn = rootEl.querySelector('#bfx-wp-leave-btn');
            if (leaveBtn) {
                leaveBtn.addEventListener('click', function () {
                    leaveBtn.disabled = true;
                    leaveWatchPartyRoom().then(function () {
                        guestInvitePass = null;
                        showToast('Left Watch Party.', 'info');
                        renderModalBody();
                    });
                });
            }

            var playNowBtn = rootEl.querySelector('#bfx-wp-play-now-btn');
            if (playNowBtn && playableTarget) {
                playNowBtn.addEventListener('click', function () {
                    m.close();
                    if (state.activeDetailModal && typeof state.activeDetailModal.close === 'function') {
                        state.activeDetailModal.close(true);
                    }
                    playItemImmediately(playableTarget);
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
                    try {
                        navigator.share({
                            title: (activeGroup && activeGroup.GroupName) || (getBrandName() + ' Watch Party'),
                            text: itemTitle ? ('Join my Watch Party for "' + itemTitle + '"!') : ('Join my ' + getBrandName() + ' Watch Party!'),
                            url: inviteInput.value
                        }).catch(function () {});
                    } catch (e) {}
                });
            }

            var makeGuestBtn = rootEl.querySelector('#bfx-wp-make-guest-btn');
            if (makeGuestBtn && activeGroup) {
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
                    apiFetch('/StreamFlix/GuestPasses/Create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            label: 'Watch Party' + (itemTitle ? (' · ' + itemTitle.slice(0, 28)) : ''),
                            profileId: chosenProfId,
                            durationHours: 6,
                            maxDevices: 2
                        })
                    }).then(function (created) {
                        var rawGuestUrl = (created && created.shareUrl) || '';
                        if (rawGuestUrl && rawGuestUrl.charAt(0) === '/') {
                            rawGuestUrl = window.location.origin + rawGuestUrl;
                        }
                        guestInvitePass = {
                            profileName: (created && created.profileName) || 'Guest',
                            comboUrl: appendWatchPartyQueryToGuestUrl(rawGuestUrl, activeGroup.GroupId, itemId)
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
                    try {
                        navigator.share({
                            title: (activeGroup && activeGroup.GroupName) || (getBrandName() + ' Watch Party'),
                            text: itemTitle ? ('Watch "' + itemTitle + '" together with me (6-hour Guest Pass included):') : ('Join my ' + getBrandName() + ' Watch Party (Guest Pass included):'),
                            url: guestUrlInput.value
                        }).catch(function () {});
                    } catch (e) {}
                });
            }
        }

        refreshWatchPartyState(true).then(renderModalBody);
    }
