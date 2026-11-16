/* StreamFlix Client (09/14) — Smart Collections & Curated Genre Rows */
    /* ----------------------------------------------------------------------
       v7.3 — Smart collections: rows built automatically from your library
       ---------------------------------------------------------------------- */
    var SMART_MIN_ITEMS = 6;
    var FAMILY_RATINGS = { 'G': 1, 'PG': 1, 'TV-G': 1, 'TV-Y': 1, 'TV-Y7': 1, 'TV-Y7-FV': 1, 'TV-PG': 1, 'U': 1, 'PG-8': 1, 'ALL': 1 };

    function smartByRating(a, b) {
        return (Number(b.CommunityRating) || 0) - (Number(a.CommunityRating) || 0);
    }

    function buildSmartCollections(d) {
        d = d || state.hubData || {};
        var movies = (d.allMovies || []).filter(function (it) { return it && it.Id; });
        var series = (d.allSeries || []).filter(function (it) { return it && it.Id; });
        var sig = movies.length + ':' + series.length + ':' + (movies[0] ? movies[0].Id : '') + ':' + (series[0] ? series[0].Id : '');
        if (state.smartCache && state.smartCache.sig === sig && state.smartCache.movies === d.allMovies) {
            return state.smartCache.rows;
        }
        var rows = [];
        var add = function (id, title, items, scope) {
            if (items.length >= SMART_MIN_ITEMS) {
                rows.push({ id: id, title: title, items: items.slice(0, 24), scope: scope });
            }
        };
        var rated = function (it, min) { return Number(it.CommunityRating) >= min; };
        var played = function (it) { return Boolean(it.UserData && it.UserData.Played); };
        var now = Date.now();
        var oldEnough = function (it) {
            var t = it.DateCreated ? Date.parse(it.DateCreated) : NaN;
            return isNaN(t) || now - t > 60 * 24 * 3600 * 1000;
        };

        var acclaimedMovies = movies.filter(function (it) { return rated(it, 7.5); }).sort(smartByRating);
        var acclaimedShows = series.filter(function (it) { return rated(it, 7.5); }).sort(smartByRating);
        add('smart-acclaimed', 'Critically Acclaimed', movies.concat(series).filter(function (it) { return rated(it, 7.5); }).sort(smartByRating), 'home');
        add('smart-acclaimed-movies', 'Critically Acclaimed Movies', acclaimedMovies, 'movies');
        add('smart-acclaimed-shows', 'Critically Acclaimed Shows', acclaimedShows, 'series');
        add('smart-gems', 'Hidden Gems', movies.concat(series).filter(function (it) {
            return !played(it) && rated(it, 7) && oldEnough(it);
        }).sort(smartByRating), 'home');
        add('smart-short', 'Under 90 Minutes', movies.filter(function (it) {
            var ticks = Number(it.RunTimeTicks) || 0;
            return ticks > 0 && ticks <= 95 * 60 * 10000000;
        }).sort(smartByRating), 'movies');

        var thisDecade = Math.floor(new Date().getFullYear() / 10) * 10;
        var decades = {};
        movies.forEach(function (it) {
            var y = Number(it.ProductionYear) || 0;
            if (!y) {
                return;
            }
            var dec = y < 1970 ? 1900 : Math.floor(y / 10) * 10;
            if (dec >= thisDecade) {
                return;
            }
            (decades[dec] = decades[dec] || []).push(it);
        });
        Object.keys(decades).map(Number).filter(function (dec) {
            return decades[dec].length >= SMART_MIN_ITEMS;
        }).sort(function (a, b) {
            return decades[b].length - decades[a].length;
        }).slice(0, 2).sort(function (a, b) { return a - b; }).forEach(function (dec) {
            var label = dec === 1900 ? 'Classics' : (dec < 2000 ? '\u2019' + String(dec).slice(2) + 's Favourites' : dec + 's Favourites');
            add('smart-decade-' + dec, label, decades[dec].slice().sort(smartByRating), 'movies');
        });

        add('smart-family', 'Family Night', movies.concat(series).filter(function (it) {
            return FAMILY_RATINGS[String(it.OfficialRating || '').toUpperCase()] === 1;
        }).sort(smartByRating), 'movies');

        var binge = series.filter(function (it) {
            return String(it.Status || '') === 'Ended' && (Number(it.ChildCount) || 0) >= 2;
        });
        if (binge.length < SMART_MIN_ITEMS) {
            binge = series.filter(function (it) { return (Number(it.ChildCount) || 0) >= 3; });
        }
        add('smart-binge', 'Binge-Worthy Series', binge.sort(smartByRating), 'series');

        state.smartCache = { sig: sig, movies: d.allMovies, rows: rows };
        return rows;
    }

    function smartRowsHtml(ids) {
        var rows = buildSmartCollections();
        return rows.filter(function (r) {
            return ids === '*' || ids.indexOf(r.id) !== -1 || (ids.indexOf('smart-decade') !== -1 && r.id.indexOf('smart-decade-') === 0);
        }).map(function (r) {
            return buildRowHtml(r.id, rowTitle(r.title), r.items.map(buildPosterCardHtml).join(''), { className: 'streamflix-row-smart' });
        }).join('');
    }

    function buildGenreCollectionRowsHtml(itemsPool) {
        if (!Array.isArray(itemsPool) || itemsPool.length === 0) {
            return '';
        }
        var genreBuckets = {};
        var genreOrder = [];
        itemsPool.forEach(function (it) {
            if (!it || !Array.isArray(it.Genres)) {
                return;
            }
            it.Genres.forEach(function (g) {
                var gClean = String(g || '').trim();
                if (!gClean) {
                    return;
                }
                if (!genreBuckets[gClean]) {
                    genreBuckets[gClean] = [];
                    genreOrder.push(gClean);
                }
                if (genreBuckets[gClean].length < 20) {
                    genreBuckets[gClean].push(it);
                }
            });
        });
        genreOrder.sort(function (a, b) {
            return genreBuckets[b].length - genreBuckets[a].length;
        });
        return genreOrder.slice(0, 6).map(function (gName, idx) {
            if (genreBuckets[gName].length < 2 && genreOrder.length > 3) {
                return '';
            }
            return buildRowHtml('genre-' + idx, rowTitle(gName), genreBuckets[gName].map(buildPosterCardHtml).join(''));
        }).join('');
    }

    function updatePaddleState(wrap) {
        var track = wrap && wrap.querySelector('.streamflix-carousel-track');
        if (!track) {
            return;
        }
        var max = track.scrollWidth - track.clientWidth;
        wrap.classList.toggle('at-start', track.scrollLeft <= 4);
        wrap.classList.toggle('at-end', track.scrollLeft >= max - 4);
        wrap.classList.toggle('no-scroll', max <= 4);
    }

    function bindInteractiveCardsInContainer(containerEl, extraItemsList, onAfterPlay) {
        if (!containerEl) {
            return;
        }
        var d = state.hubData || {};
        var itemMap = {};
        [
            d.heroItems, d.resumeItems, d.nextUpItems, d.top10Items,
            d.favoriteItems, d.recentMovies, d.recentSeries,
            d.allMovies, d.allSeries, d.collectionsItems,
            state.searchResults || [], (state.browseFilter && state.browseFilter.items) || [], personalRowItems(), extraItemsList || []
        ].forEach(function (arr) {
            (arr || []).forEach(function (it) {
                if (it && it.Id) {
                    // The same title can sit in several rows; keep the copy that knows how far in you are
                    var prev = itemMap[it.Id];
                    var prevPct = prev && prev.UserData && prev.UserData.PlayedPercentage;
                    if (!prevPct || (it.UserData && it.UserData.PlayedPercentage)) {
                        itemMap[it.Id] = it;
                    }
                }
            });
        });

        Array.prototype.forEach.call(containerEl.querySelectorAll('.streamflix-paddle'), function (paddle) {
            paddle.addEventListener('click', function () {
                var dir = parseInt(paddle.getAttribute('data-scroll-dir'), 10) || 1;
                var track = paddle.parentNode && paddle.parentNode.querySelector('.streamflix-carousel-track');
                if (track) {
                    track.scrollBy({ left: dir * Math.round(track.clientWidth * 0.86), behavior: 'smooth' });
                }
            });
        });

        Array.prototype.forEach.call(containerEl.querySelectorAll('.streamflix-carousel-wrap'), function (wrap) {
            var track = wrap.querySelector('.streamflix-carousel-track');
            if (!track) {
                return;
            }
            var pending = false;
            track.addEventListener('scroll', function () {
                if (pending) {
                    return;
                }
                pending = true;
                (window.requestAnimationFrame || setTimeout)(function () {
                    pending = false;
                    updatePaddleState(wrap);
                });
            }, { passive: true });
            updatePaddleState(wrap);
        });

        Array.prototype.forEach.call(containerEl.querySelectorAll('[data-item-id]'), function (card) {
            var itemId = card.getAttribute('data-item-id');
            var item = itemMap[itemId] || findCachedItemById(itemId) || { Id: itemId };
            card.__bfxItem = item;

            card.addEventListener('click', function (ev) {
                var actionBtn = ev.target && ev.target.closest ? ev.target.closest('[data-action]') : null;
                if (actionBtn) {
                    ev.stopPropagation();
                    var act = actionBtn.getAttribute('data-action');
                    if (act === 'play') {
                        if (typeof onAfterPlay === 'function') {
                            onAfterPlay();
                        }
                        navigateOrPlayItem(item);
                    } else if (act === 'fav') {
                        toggleFavoriteItem(item, actionBtn);
                    } else if (act === 'played') {
                        togglePlayedItem(item, actionBtn);
                    } else if (act === 'remove-resume') {
                        removeFromContinueWatching(item);
                    } else if (act === 'info') {
                        openHeroDetailModal(item);
                    }
                    return;
                }
                openHeroDetailModal(item);
            });
            card.addEventListener('keydown', function (ev) {
                if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === card) {
                    ev.preventDefault();
                    openHeroDetailModal(item);
                }
            });
        });
        hydrateCompleteImages(containerEl);
    }

    function getActiveHeroItems() {
        var d = state.hubData;
        var limit = getHeroSlideLimit();
        var cat = state.activeCategory || 'all';
        if (cat === 'movies') {
            return (d.recentMovies && d.recentMovies.length) ? d.recentMovies.slice(0, limit) : (d.heroItems || []).slice(0, limit);
        }
        if (cat === 'series') {
            return (d.recentSeries && d.recentSeries.length) ? d.recentSeries.slice(0, limit) : (d.heroItems || []).slice(0, limit);
        }
        if (cat === 'collections' || cat === 'mylist' || cat === 'top10' || cat === 'hot') {
            return [];
        }
        if (d.heroItems && d.heroItems.length) {
            return d.heroItems.slice(0, limit);
        }
        return (d.recentMovies || []).concat(d.recentSeries || []).slice(0, limit);
    }

    function pickSurpriseTitle() {
        var d = state.hubData || {};
        var cat = state.activeCategory || 'all';
        var basePool = [];
        if (cat === 'movies' && Array.isArray(d.allMovies) && d.allMovies.length >= 2) {
            basePool = dedupeMediaItems(d.allMovies);
        } else if (cat === 'series' && Array.isArray(d.allSeries) && d.allSeries.length >= 2) {
            basePool = dedupeMediaItems(d.allSeries);
        } else {
            basePool = dedupeMediaItems([].concat(d.allMovies || [], d.allSeries || []));
        }
        if (!basePool.length) {
            return null;
        }
        var unwatched = basePool.filter(function (it) {
            return !(it.UserData && it.UserData.Played);
        });
        var candidatePool = unwatched.length >= 2 ? unwatched : basePool;
        if (candidatePool.length > 1 && state.lastSurpriseId) {
            var lastNorm = normalizeGuid(state.lastSurpriseId);
            var filtered = candidatePool.filter(function (it) {
                return normalizeGuid(it.Id) !== lastNorm;
            });
            if (filtered.length > 0) {
                candidatePool = filtered;
            }
        }
        var picked = candidatePool[Math.floor(Math.random() * candidatePool.length)];
        if (picked && picked.Id) {
            state.lastSurpriseId = picked.Id;
        }
        return picked || null;
    }

    function triggerSurpriseMe() {
        var chosen = pickSurpriseTitle();
        if (!chosen) {
            showToast('Add a few movies or shows to use Surprise Me.', 'info');
            return;
        }
        openHeroDetailModal(chosen, { fromSurprise: true });
    }

    function applyBrowseFilter(filterSpec) {
        if (!filterSpec || !filterSpec.name) {
            return;
        }
        cancelPendingSearch();
        var reqId = (state.browseFilterSeq = (state.browseFilterSeq || 0) + 1);
        state.searchQuery = '';
        state.searchResults = null;
        state.seerrSearchResults = null;
        state.browseFilter = {
            kind: filterSpec.kind || 'genre',
            role: filterSpec.role || '',
            name: String(filterSpec.name).trim(),
            id: filterSpec.id ? String(filterSpec.id).trim() : '',
            loading: true,
            items: []
        };

        if (!isOnHomeRoute()) {
            window.location.hash = '#/home';
        }
        ensureCinemaHubMounted();
        renderCinemaHubContents();
        try {
            window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        } catch (e) {
            window.scrollTo(0, 0);
        }

        var d = state.hubData || {};
        var fullLocalPool = dedupeMediaItems([].concat(d.allMovies || [], d.allSeries || []));
        var auth = getJellyfinAuthContext();
        var uid = auth && auth.userId ? encodeURIComponent(auth.userId) : '';
        var fields = 'Overview,Genres,PrimaryImageAspectRatio,DateCreated';
        var targetLower = state.browseFilter.name.toLowerCase();

        var finish = function (serverItems, localFallback) {
            if (state.browseFilterSeq !== reqId || !state.browseFilter) {
                return;
            }
            state.browseFilter.items = dedupeMediaItems([].concat(serverItems || [], localFallback || []));
            state.browseFilter.loading = false;
            renderCinemaHubContents();
        };

        if (state.browseFilter.kind === 'genre') {
            var localGenreHits = fullLocalPool.filter(function (it) {
                return Array.isArray(it.Genres) && it.Genres.some(function (g) {
                    return String(g || '').toLowerCase() === targetLower;
                });
            });
            if (!uid) {
                finish([], localGenreHits);
                return;
            }
            fetchUserItems(uid, 'Recursive=true&IncludeItemTypes=Movie,Series&Genres=' + encodeURIComponent(state.browseFilter.name) + '&SortBy=CommunityRating,DateCreated&SortOrder=Descending&Limit=100&Fields=' + fields)
                .then(function (res) {
                    finish((res && res.Items) || [], localGenreHits);
                })
                .catch(function () {
                    finish([], localGenreHits);
                });
            return;
        }

        // Person filter (Director / Cast)
        if (!uid) {
            finish([], []);
            return;
        }
        var personNameEnc = encodeURIComponent(state.browseFilter.name);
        var personByIdPromise = state.browseFilter.id
            ? fetchUserItems(uid, 'Recursive=true&IncludeItemTypes=Movie,Series&PersonIds=' + encodeURIComponent(state.browseFilter.id) + '&SortBy=CommunityRating,DateCreated&SortOrder=Descending&Limit=100&Fields=' + fields)
            : Promise.resolve({ Items: [] });

        personByIdPromise.then(function (resById) {
            var byIdItems = (resById && resById.Items) || [];
            if (byIdItems.length > 0) {
                finish(byIdItems, []);
                return null;
            }
            return fetchUserItems(uid, 'Recursive=true&IncludeItemTypes=Movie,Series&Person=' + personNameEnc + '&SortBy=CommunityRating,DateCreated&SortOrder=Descending&Limit=100&Fields=' + fields)
                .then(function (resByName) {
                    finish((resByName && resByName.Items) || [], []);
                });
        }).catch(function () {
            finish([], []);
        });
    }

    function renderCinemaHubContents() {
        var hub = document.getElementById('streamflix-cinema-hub');
        if (!hub) {
            return;
        }

        var d = state.hubData;
        var profileName = (state.activeProfile && state.activeProfile.name) || 'You';
        var cat = state.activeCategory || 'all';
        var bf = (!state.searchQuery && state.browseFilter) ? state.browseFilter : null;

        document.body.classList.toggle('streamflix-hub-filtered', Boolean(state.searchQuery) || Boolean(bf) || cat !== 'all');

        var pills = [
            { id: 'all', label: 'Home' },
            { id: 'series', label: 'Shows', hide: !d.allSeries.length },
            { id: 'movies', label: 'Movies', hide: !d.allMovies.length },
            { id: 'collections', label: 'Collections', hide: !d.collectionsItems.length && !buildSmartCollections(d).length },
            { id: 'top10', label: 'Top 10', hide: !d.top10Items.length },
            { id: 'mylist', label: 'My List' }
        ];

        var pillsHtml = pills.filter(function (p) { return !p.hide || cat === p.id; }).map(function (p) {
            var isActive = !state.searchQuery && !bf && cat === p.id;
            return '<button type="button" class="streamflix-pill' + (isActive ? ' active' : '') + '" data-cat-id="' + p.id + '"' + (isActive ? ' aria-current="page"' : '') + '>' + escapeHtml(p.label) + '</button>';
        }).join('');

        var canSurprise = (d.allMovies.length + d.allSeries.length) >= 2;
        var searchPlaceholder = isCurrentProfileSeerrAllowed() ? 'Titles, genres, or request…' : 'Titles, genres…';
        var showClearBtn = Boolean(state.searchQuery || state.mobileSearchOpen);
        var subnavHtml = ''
            + '<div class="streamflix-subnav' + ((state.mobileSearchOpen || state.searchQuery) ? ' is-search-open' : '') + '">'
            + '  <nav class="streamflix-FilterPills" aria-label="Browse">' + pillsHtml + '</nav>'
            + '  <div class="streamflix-subnav-right">'
            + (canSurprise
                ? '    <button type="button" id="streamflix-surprise-btn" class="streamflix-surprise-btn" aria-label="Surprise Me">' + icon('shuffle') + '<span>Surprise Me</span></button>'
                : '')
            + '    <div class="streamflix-search-box' + (state.searchQuery ? ' has-value' : '') + '">'
            + '      <span class="streamflix-search-icon">' + icon('search') + '</span>'
            + '      <input type="search" id="streamflix-live-search-input" class="streamflix-search-input" placeholder="' + escapeHtml(searchPlaceholder) + '" autocomplete="off" spellcheck="false" aria-label="Search" value="' + escapeHtml(state.searchQuery) + '" />'
            + (showClearBtn
                ? '      <button type="button" id="streamflix-search-clear-btn" class="streamflix-search-clear" title="Close search" aria-label="Close search">' + icon('close') + '</button>'
                : '      <kbd class="streamflix-search-kbd" aria-hidden="true">/</kbd>')
            + '    </div>'
            + '  </div>'
            + '</div>';

        var activeHeroItems = getActiveHeroItems();
        var showHero = !state.searchQuery && !bf && activeHeroItems.length > 0;
        var heroHtml = '<div id="streamflix-hero-billboard" style="' + (showHero ? '' : 'display:none !important;') + '"></div>';
        var top10Cards = function () {
            return d.top10Items.map(function (it, idx) { return buildTop10CardHtml(it, idx + 1); }).join('');
        };

        var kidsWorldStripHtml = (!state.searchQuery && !bf && cat === 'all' && typeof buildKidsWorldStripHtml === 'function')
            ? buildKidsWorldStripHtml(d.allMovies.concat(d.allSeries))
            : '';

        var rowsHtml = '';
        if (state.searchQuery && (Array.isArray(state.searchResults) || Array.isArray(state.seerrSearchResults) || state.seerrSearchLoading)) {
            rowsHtml += buildSearchRowsHtml();
        } else if (bf) {
            var bfKicker = bf.kind === 'genre'
                ? 'Genre'
                : (bf.role === 'Director' ? 'Directed by' : 'Featuring');
            rowsHtml += ''
                + '<section class="streamflix-row streamflix-row-grid streamflix-filter-view" data-row-id="browse-filter">'
                + '  <div class="streamflix-filter-banner">'
                + '    <div class="streamflix-filter-banner-copy">'
                + '      <span class="streamflix-filter-kicker">' + escapeHtml(bfKicker) + '</span>'
                + '      <h2 class="streamflix-row-title">' + escapeHtml(bf.name) + (!bf.loading ? '<span class="streamflix-row-count">' + bf.items.length + '</span>' : '') + '</h2>'
                + '    </div>'
                + '    <button type="button" class="streamflix-ghost-btn streamflix-filter-clear-btn" id="streamflix-clear-browse-filter">' + icon('chevronLeft') + '<span>Back to Browse</span></button>'
                + '  </div>'
                + (bf.loading
                    ? '  <div class="streamflix-filter-loading"><div class="streamflix-spinner-ring"></div><span>Finding titles…</span></div>'
                    : (bf.items.length > 0
                        ? '  <div class="streamflix-grid">' + bf.items.map(buildPosterCardHtml).join('') + '</div>'
                        : buildEmptyStateHtml('film', 'No titles found for “' + bf.name + '”', 'Try another genre, cast member, or category.')))
                + '</section>';
        } else if (cat === 'movies') {
            if (d.recentMovies.length > 0) {
                rowsHtml += buildRowHtml('movies-recent', rowTitle('New on ' + getBrandName()), d.recentMovies.map(buildPosterCardHtml).join(''));
            }
            rowsHtml += smartRowsHtml(['smart-acclaimed-movies', 'smart-short', 'smart-decade', 'smart-family']);
            rowsHtml += buildGenreCollectionRowsHtml(d.allMovies);
            if (d.allMovies.length > 0) {
                rowsHtml += buildGridSectionHtml('movies-all', rowTitle('All Movies', d.allMovies.length), d.allMovies);
            }
        } else if (cat === 'series') {
            if (d.nextUpItems.length > 0) {
                rowsHtml += buildRowHtml('nextup', rowTitle('Next Up'), d.nextUpItems.map(buildWideCardHtml).join(''), { className: 'streamflix-row-wide' });
            }
            if (d.recentSeries.length > 0) {
                rowsHtml += buildRowHtml('series-recent', rowTitle('New Episodes & Series'), d.recentSeries.map(buildPosterCardHtml).join(''));
            }
            rowsHtml += smartRowsHtml(['smart-binge', 'smart-acclaimed-shows']);
            rowsHtml += buildGenreCollectionRowsHtml(d.allSeries);
            if (d.allSeries.length > 0) {
                rowsHtml += buildGridSectionHtml('series-all', rowTitle('All Shows', d.allSeries.length), d.allSeries);
            }
        } else if (cat === 'collections') {
            rowsHtml += smartRowsHtml(['smart-acclaimed', 'smart-gems', 'smart-binge', 'smart-short', 'smart-decade', 'smart-family']);
            if (d.collectionsItems.length > 0) {
                rowsHtml += buildGridSectionHtml('collections-boxsets', rowTitle('Collections', d.collectionsItems.length), d.collectionsItems);
            }
            rowsHtml += buildGenreCollectionRowsHtml(d.allMovies.concat(d.allSeries));
        } else if (cat === 'mylist') {
            if (d.favoriteItems.length > 0) {
                rowsHtml += buildGridSectionHtml('mylist-grid', rowTitle('My List', d.favoriteItems.length), d.favoriteItems);
            }
        } else if (cat === 'top10') {
            if (d.top10Items.length > 0) {
                rowsHtml += buildRowHtml('top10', rowTitle(getTop10RowTitle()), top10Cards(), { className: 'streamflix-row-top10' });
                rowsHtml += buildGridSectionHtml('top10-grid', rowTitle('Top 10 Lineup', d.top10Items.length), d.top10Items);
            }
        } else if (cat === 'hot') {
            if (d.top10Items.length > 0) {
                rowsHtml += buildRowHtml('top10', rowTitle(getTop10RowTitle()), top10Cards(), { className: 'streamflix-row-top10' });
            }
            if (d.recentMovies.length > 0) {
                rowsHtml += buildRowHtml('hot-movies', rowTitle('New Movies on ' + getBrandName()), d.recentMovies.map(buildPosterCardHtml).join(''));
            }
            if (d.recentSeries.length > 0) {
                rowsHtml += buildRowHtml('hot-series', rowTitle('New Episodes & Series'), d.recentSeries.map(buildPosterCardHtml).join(''));
            }
            rowsHtml += smartRowsHtml(['smart-acclaimed', 'smart-gems']);
        } else if (typeof isKidsProfileActive === 'function' && isKidsProfileActive() && state.kidsWorld && state.kidsWorld !== 'all' && typeof filterItemsByKidsWorld === 'function') {
            var kwMeta = typeof getKidsWorldMeta === 'function' ? getKidsWorldMeta(state.kidsWorld) : { emoji: '🌟', label: 'Kids' };
            var kwPool = dedupeMediaItems(d.allMovies.concat(d.allSeries));
            var kwItems = filterItemsByKidsWorld(kwPool, state.kidsWorld);
            if (kwItems.length > 0) {
                rowsHtml += buildGridSectionHtml('kids-world-' + state.kidsWorld, rowTitle(kwMeta.emoji + ' ' + kwMeta.label, kwItems.length), kwItems);
            } else {
                rowsHtml += buildEmptyStateHtml('film', 'No titles in ' + kwMeta.label + ' yet', 'Tap another Kids World bubble above to keep exploring.');
            }
        } else {
            if (d.resumeItems.length > 0) {
                rowsHtml += buildRowHtml('resume', rowTitle('Continue Watching for ' + profileName), d.resumeItems.map(function (it) { return buildWideCardHtml(it, { removable: true }); }).join(''), { className: 'streamflix-row-wide' });
            }
            if (d.nextUpItems.length > 0) {
                rowsHtml += buildRowHtml('nextup', rowTitle('Next Up'), d.nextUpItems.map(buildWideCardHtml).join(''), { className: 'streamflix-row-wide', link: 'series' });
            }
            var pr = getPersonalRows() || { topPicks: [], because: [], watchAgain: [] };
            var becauseRow = function (b, idx) {
                return b ? buildRowHtml('because-' + idx, 'Because you watched <span class="bfx-row-em">' + escapeHtml(b.seed.name) + '</span>', b.items.map(buildPosterCardHtml).join(''), { className: 'streamflix-row-personal' }) : '';
            };
            if (pr.topPicks.length > 0) {
                rowsHtml += buildRowHtml('toppicks', 'Top Picks for ' + escapeHtml(profileName), pr.topPicks.map(buildPosterCardHtml).join(''), { className: 'streamflix-row-personal' });
            }
            rowsHtml += becauseRow(pr.because[0], 0);
            if (d.top10Items.length > 0) {
                rowsHtml += buildRowHtml('top10', rowTitle(getTop10RowTitle()), top10Cards(), { className: 'streamflix-row-top10', link: 'top10' });
            }
            if (d.favoriteItems.length > 0) {
                rowsHtml += buildRowHtml('mylist', rowTitle('My List'), d.favoriteItems.map(buildPosterCardHtml).join(''), { link: 'mylist' });
            }
            rowsHtml += smartRowsHtml(['smart-acclaimed']);
            if (d.recentMovies.length > 0) {
                rowsHtml += buildRowHtml('movies', rowTitle('New Movies'), d.recentMovies.map(buildPosterCardHtml).join(''), { link: 'movies' });
            }
            rowsHtml += becauseRow(pr.because[1], 1);
            if (d.recentSeries.length > 0) {
                rowsHtml += buildRowHtml('series', rowTitle('New Shows'), d.recentSeries.map(buildPosterCardHtml).join(''), { link: 'series' });
            }
            rowsHtml += smartRowsHtml(['smart-gems']);
            if (d.collectionsItems.length > 0) {
                rowsHtml += buildRowHtml('collections', rowTitle('Collections'), d.collectionsItems.map(buildPosterCardHtml).join(''), { link: 'collections' });
            }
            if (pr.watchAgain.length > 0) {
                rowsHtml += buildRowHtml('watchagain', rowTitle('Watch It Again'), pr.watchAgain.map(buildPosterCardHtml).join(''));
            }
        }

        if (!rowsHtml && d.loaded) {
            rowsHtml = cat === 'mylist'
                ? buildEmptyStateHtml('plus', 'Your list is empty', 'Add movies and shows with the + button and they\'ll show up here.')
                : buildEmptyStateHtml('film', 'Nothing here yet', 'Titles will appear as soon as they are added to your libraries.');
        }
        if (kidsWorldStripHtml) {
            rowsHtml = kidsWorldStripHtml + rowsHtml;
        }

        var bindCategoryPills = function (scopeNode) {
            Array.prototype.forEach.call(scopeNode.querySelectorAll('[data-cat-id]'), function (btn) {
                btn.addEventListener('click', function () {
                    cancelPendingSearch();
                    var pickedCat = btn.getAttribute('data-cat-id') || 'all';
                    var isPhoneMode = Boolean(document.body && document.body.classList.contains('bfx-phone-mode'));
                    if (isPhoneMode && pickedCat !== 'all' && !state.searchQuery && !state.browseFilter && state.activeCategory === pickedCat) {
                        pickedCat = 'all';
                    }
                    state.activeCategory = pickedCat;
                    state.kidsWorld = 'all';
                    state.heroIndex = 0;
                    state.mobileSearchOpen = false;
                    state.searchQuery = '';
                    state.searchResults = null;
                    state.seerrSearchResults = null;
                    state.browseFilter = null;
                    renderCinemaHubContents();
                });
            });
        };

        var bindRowsInteractive = function (rowsScope) {
            Array.prototype.forEach.call(rowsScope.querySelectorAll('[data-cat-link]'), function (btn) {
                btn.addEventListener('click', function () {
                    cancelPendingSearch();
                    state.activeCategory = btn.getAttribute('data-cat-link') || 'all';
                    state.heroIndex = 0;
                    state.browseFilter = null;
                    renderCinemaHubContents();
                    try { hub.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }); } catch (e) {}
                });
            });
            var clearBrowseFilterBtn = rowsScope.querySelector('#streamflix-clear-browse-filter');
            if (clearBrowseFilterBtn) {
                clearBrowseFilterBtn.addEventListener('click', function () {
                    state.browseFilter = null;
                    renderCinemaHubContents();
                });
            }
            if (typeof bindKidsWorldStrip === 'function') {
                bindKidsWorldStrip(rowsScope);
            }
            bindInteractiveCardsInContainer(rowsScope, null, null);
            bindSeerrCardsInContainer(rowsScope);
        };

        var bindClearSearchBtn = function () {
            var clearSearchBtn = document.getElementById('streamflix-search-clear-btn');
            if (clearSearchBtn && !clearSearchBtn.__bfxBound) {
                clearSearchBtn.__bfxBound = true;
                clearSearchBtn.addEventListener('click', function () {
                    cancelPendingSearch();
                    state.mobileSearchOpen = false;
                    state.searchQuery = '';
                    state.searchResults = null;
                    state.seerrSearchResults = null;
                    if (document.body) {
                        document.body.classList.remove('bfx-mobile-search-focused');
                    }
                    var liveIn = document.getElementById('streamflix-live-search-input');
                    if (liveIn) {
                        liveIn.value = '';
                        try { liveIn.blur(); } catch (e) {}
                    }
                    renderCinemaHubContents();
                });
            }
        };

        // In-place update when the user is actively typing in #streamflix-live-search-input so IME composition,
        // mobile keyboard, and caret position are never disrupted!
        var existingSearchInput = document.getElementById('streamflix-live-search-input');
        var existingRowsEl = hub.querySelector('.streamflix-rows');
        var existingPillsNav = hub.querySelector('.streamflix-FilterPills');
        if (existingSearchInput && existingRowsEl && existingPillsNav && hub.contains(existingSearchInput) && document.activeElement === existingSearchInput) {
            existingPillsNav.innerHTML = pillsHtml;
            bindCategoryPills(existingPillsNav);
            existingSearchInput.placeholder = searchPlaceholder;
            var sBox = existingSearchInput.closest ? existingSearchInput.closest('.streamflix-search-box') : null;
            if (sBox) {
                sBox.classList.toggle('has-value', Boolean(state.searchQuery));
                var oldClr = sBox.querySelector('#streamflix-search-clear-btn');
                var oldKbd = sBox.querySelector('.streamflix-search-kbd');
                if (showClearBtn && !oldClr) {
                    if (oldKbd && oldKbd.parentNode) { oldKbd.parentNode.removeChild(oldKbd); }
                    existingSearchInput.insertAdjacentHTML('afterend', '<button type="button" id="streamflix-search-clear-btn" class="streamflix-search-clear" title="Close search" aria-label="Close search">' + icon('close') + '</button>');
                    bindClearSearchBtn();
                } else if (!showClearBtn && !oldKbd) {
                    if (oldClr && oldClr.parentNode) { oldClr.parentNode.removeChild(oldClr); }
                    existingSearchInput.insertAdjacentHTML('afterend', '<kbd class="streamflix-search-kbd" aria-hidden="true">/</kbd>');
                }
            }
            var curHeroEl = document.getElementById('streamflix-hero-billboard');
            if (curHeroEl) {
                curHeroEl.style.display = showHero ? 'flex' : 'none';
            } else if (showHero) {
                existingRowsEl.insertAdjacentHTML('beforebegin', '<div id="streamflix-hero-billboard"></div>');
            }
            state.heroCatKey = showHero ? cat : null;
            if (!showHero) {
                hub.style.removeProperty('--bfx-ambient');
            }
            hub.classList.toggle('streamflix-has-hero', showHero);
            document.body.classList.add('streamflix-hub-active');
            syncHeroBleed(hub);
            if (showHero) {
                renderHeroSlide();
                if (!state.heroTimer) {
                    restartHeroTimer();
                }
            }
            existingRowsEl.innerHTML = rowsHtml;
            bindRowsInteractive(existingRowsEl);
            syncMobileDockState();
            return;
        }

        var prevHero = document.getElementById('streamflix-hero-billboard');
        var keepHero = showHero && prevHero && prevHero.parentNode === hub && state.heroCatKey === cat
            && Boolean(prevHero.querySelector('.streamflix-hero-bg-stack'));
        if (keepHero) {
            // Swap everything around the billboard so the hero doesn't flash on re-render
            Array.prototype.slice.call(hub.children).forEach(function (child) {
                if (child !== prevHero) {
                    hub.removeChild(child);
                }
            });
            prevHero.insertAdjacentHTML('beforebegin', subnavHtml);
            prevHero.insertAdjacentHTML('afterend', '<div class="streamflix-rows">' + rowsHtml + '</div>');
        } else {
            hub.innerHTML = subnavHtml + heroHtml + '<div class="streamflix-rows">' + rowsHtml + '</div>';
        }
        state.heroCatKey = showHero ? cat : null;
        if (!showHero) {
            hub.style.removeProperty('--bfx-ambient');
        }
        hub.classList.toggle('streamflix-has-hero', showHero);
        // The StreamFlix hub replaces Jellyfin's stock home sections (My Media, Continue Watching, Recently Added…)
        document.body.classList.add('streamflix-hub-active');
        syncHeroBleed(hub);

        if (!hub.classList.contains('streamflix-hub-ready')) {
            hub.classList.add('streamflix-hub-ready');
        }

        if (showHero) {
            renderHeroSlide();
            if (!keepHero || !state.heroTimer) {
                restartHeroTimer();
            }
        }

        bindCategoryPills(hub);

        var surpriseBtn = document.getElementById('streamflix-surprise-btn');
        if (surpriseBtn) {
            surpriseBtn.addEventListener('click', function () {
                triggerSurpriseMe();
            });
        }

        // Bind Live Search Input & Clear Button (with compact tap-to-expand support on phones)
        var searchInput = document.getElementById('streamflix-live-search-input');
        var searchBoxEl = hub.querySelector('.streamflix-search-box');
        var subnavEl = hub.querySelector('.streamflix-subnav');
        if (searchBoxEl && searchInput) {
            searchBoxEl.addEventListener('click', function (ev) {
                if (ev.target && ev.target.closest && ev.target.closest('#streamflix-search-clear-btn')) {
                    return;
                }
                if (subnavEl) {
                    subnavEl.classList.add('is-search-open');
                }
                if (document.activeElement !== searchInput) {
                    try { searchInput.focus(); } catch (e) {}
                }
            });
            searchInput.addEventListener('focus', function () {
                if (subnavEl) {
                    subnavEl.classList.add('is-search-open');
                }
                if (document.body) {
                    document.body.classList.add('bfx-mobile-search-focused');
                }
                syncMobileDockState();
            });
            searchInput.addEventListener('blur', function () {
                if (document.body) {
                    document.body.classList.remove('bfx-mobile-search-focused');
                }
                if (subnavEl && !searchInput.value && !state.mobileSearchOpen) {
                    subnavEl.classList.remove('is-search-open');
                }
                syncMobileDockState();
            });
        }
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                state.searchQuery = searchInput.value;
                if (state.searchDebounce) {
                    clearTimeout(state.searchDebounce);
                    state.searchDebounce = null;
                }
                if (typeof previewInstantLocalSearch === 'function') {
                    previewInstantLocalSearch(state.searchQuery);
                }
                if ((state.searchQuery || '').trim()) {
                    state.searchDebounce = setTimeout(function () {
                        runLiveSearch(state.searchQuery);
                    }, 220);
                }
            });
            searchInput.addEventListener('keydown', function (ev) {
                if (ev.key === 'Escape' && (state.searchQuery || state.mobileSearchOpen)) {
                    ev.preventDefault();
                    cancelPendingSearch();
                    state.mobileSearchOpen = false;
                    state.searchQuery = '';
                    state.searchResults = null;
                    state.seerrSearchResults = null;
                    searchInput.value = '';
                    try { searchInput.blur(); } catch (eEsc) {}
                    renderCinemaHubContents();
                }
            });
            if (state.searchQuery && !document.querySelector('.streamflix-modal-backdrop') && !isGateOpen()) {
                searchInput.focus();
                try {
                    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
                } catch (e) {}
            }
        }

        bindClearSearchBtn();
        var newRowsEl = hub.querySelector('.streamflix-rows') || hub;
        bindRowsInteractive(newRowsEl);
        syncMobileDockState();
    }

    function stepHeroSlide(delta) {
        var slides = getActiveHeroItems();
        if (!slides || slides.length <= 1) {
            return;
        }
        state.heroIndex = (state.heroIndex + delta + slides.length * 10) % slides.length;
        renderHeroSlide();
        restartHeroTimer();
    }

    function renderHeroSlide() {
        var hero = document.getElementById('streamflix-hero-billboard');
        var heroItems = getActiveHeroItems();
        if (!hero || !heroItems.length) {
            if (hero) {
                hero.style.display = 'none';
            }
            return;
        }
        hero.style.display = 'flex';
        hero.style.backgroundImage = 'none';

        var prevFocusKey = '';
        var curActive = document.activeElement;
        if (curActive && hero.contains(curActive)) {
            if (curActive.id === 'streamflix-hero-play-btn') {
                prevFocusKey = 'play';
            } else if (curActive.id === 'streamflix-hero-info-btn') {
                prevFocusKey = 'info';
            } else if (curActive.id === 'streamflix-hero-fav-btn') {
                prevFocusKey = 'fav';
            } else if (curActive.classList && curActive.classList.contains('prev')) {
                prevFocusKey = 'prev';
            } else if (curActive.classList && curActive.classList.contains('next')) {
                prevFocusKey = 'next';
            } else if (curActive.classList && curActive.classList.contains('streamflix-hero-dot')) {
                prevFocusKey = 'dot';
            }
        }

        // Persistent layers: background stack (crossfades), content slot and slide navigation
        var bgStack = hero.querySelector('.streamflix-hero-bg-stack');
        if (!bgStack) {
            hero.innerHTML = ''
                + '<div class="streamflix-hero-bg-stack" aria-hidden="true"></div>'
                + '<div class="streamflix-hero-content-slot"></div>'
                + '<div class="streamflix-hero-nav">'
                + '  <button type="button" class="streamflix-hero-arrow prev" aria-label="Previous featured title" title="Previous featured title">' + icon('chevronLeft') + '</button>'
                + '  <div class="streamflix-hero-dots"></div>'
                + '  <button type="button" class="streamflix-hero-arrow next" aria-label="Next featured title" title="Next featured title">' + icon('chevronRight') + '</button>'
                + '</div>';
            bgStack = hero.querySelector('.streamflix-hero-bg-stack');
            var prevBtn = hero.querySelector('.streamflix-hero-arrow.prev');
            var nextBtn = hero.querySelector('.streamflix-hero-arrow.next');
            if (prevBtn) {
                prevBtn.addEventListener('click', function () { stepHeroSlide(-1); });
            }
            if (nextBtn) {
                nextBtn.addEventListener('click', function () { stepHeroSlide(1); });
            }
            hero.addEventListener('mouseenter', function () { state.heroPaused = true; });
            hero.addEventListener('mouseleave', function () { state.heroPaused = false; });
            hero.addEventListener('focusin', function () { state.heroPaused = true; });
            hero.addEventListener('focusout', function (ev) {
                state.heroPaused = Boolean(ev && ev.relatedTarget && hero.contains(ev.relatedTarget));
            });
            // Touch swipe left/right on phones & tablets to flip hero slides
            var touchStartX = 0;
            var touchStartY = 0;
            var touchTracking = false;
            hero.addEventListener('touchstart', function (ev) {
                if (!ev.touches || ev.touches.length !== 1) {
                    touchTracking = false;
                    return;
                }
                if (ev.target && ev.target.closest && ev.target.closest('button, a, input')) {
                    touchTracking = false;
                    return;
                }
                touchStartX = ev.touches[0].clientX;
                touchStartY = ev.touches[0].clientY;
                touchTracking = true;
            }, { passive: true });
            hero.addEventListener('touchend', function (ev) {
                if (!touchTracking || !ev.changedTouches || !ev.changedTouches.length) {
                    return;
                }
                touchTracking = false;
                var dx = ev.changedTouches[0].clientX - touchStartX;
                var dy = ev.changedTouches[0].clientY - touchStartY;
                var slides = getActiveHeroItems();
                if (slides.length > 1 && Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                    stepHeroSlide(dx < 0 ? 1 : -1);
                }
            }, { passive: true });
        }
        var slot = hero.querySelector('.streamflix-hero-content-slot');
        var navEl = hero.querySelector('.streamflix-hero-nav');
        var dotsEl = hero.querySelector('.streamflix-hero-dots');
        if (navEl) {
            navEl.style.display = heroItems.length > 1 ? 'flex' : 'none';
        }

        var slideIdx = state.heroIndex % heroItems.length;
        var item = heroItems[slideIdx];
        var backdropUrl = getItemBackdropUrl(item, 1920);
        var prevItemId = hero.getAttribute('data-hero-item');
        var itemChanged = prevItemId !== item.Id;
        hero.setAttribute('data-hero-item', item.Id);

        if (bgStack.getAttribute('data-src') !== backdropUrl) {
            bgStack.setAttribute('data-src', backdropUrl);
            var layer = document.createElement('div');
            layer.className = 'streamflix-hero-bg';
            var safeHeroBg = safeCssUrl(backdropUrl);
            if (safeHeroBg) {
                layer.style.backgroundImage = 'url("' + safeHeroBg + '")';
            }
            var reveal = function () {
                if (layer.getAttribute('data-shown') === '1' || bgStack.getAttribute('data-src') !== backdropUrl) {
                    return;
                }
                layer.setAttribute('data-shown', '1');
                bgStack.appendChild(layer);
                applyHeroAmbient(backdropUrl);
                void layer.offsetWidth;
                layer.classList.add('is-visible');
                var olds = bgStack.querySelectorAll('.streamflix-hero-bg');
                Array.prototype.forEach.call(olds, function (old) {
                    if (old !== layer) {
                        setTimeout(function () {
                            if (old.parentNode) {
                                old.parentNode.removeChild(old);
                            }
                        }, 1000);
                    }
                });
            };
            var pre = new Image();
            pre.onload = reveal;
            pre.onerror = reveal;
            pre.src = backdropUrl;
            setTimeout(reveal, 1500);
        }

        var year = item.ProductionYear ? String(item.ProductionYear) : '';
        var rating = item.OfficialRating ? String(item.OfficialRating) : '';
        var runtime = item.Type === 'Series' ? '' : formatRuntimeTicks(item.RunTimeTicks);
        var genres = Array.isArray(item.Genres) ? item.Genres.slice(0, 3) : [];
        var community = item.CommunityRating ? Number(item.CommunityRating).toFixed(1) : '';
        var isFav = item.UserData && item.UserData.IsFavorite;
        var hasResume = item.UserData && item.UserData.PlaybackPositionTicks && item.UserData.PlaybackPositionTicks > 0;
        var resumePct = hasResume && item.RunTimeTicks ? Math.min(100, Math.max(2, Math.round(item.UserData.PlaybackPositionTicks / item.RunTimeTicks * 100))) : 0;
        var logoUrl = getItemLogoUrl(item, 800);
        var kicker = item.Type === 'Series' ? 'Series' : (item.Type === 'BoxSet' ? 'Collection' : 'Film');
        var heroRank = getTop10Rank(item && item.Id);
        var brandInitial = getBrandLogoText().charAt(0) || 'S';
        var slotSig = item.Id + ':' + (isFav ? 1 : 0) + ':' + heroRank + ':' + brandInitial + ':' + (item.UserData ? item.UserData.PlaybackPositionTicks || 0 : 0);
        var slotFresh = slot.getAttribute('data-sig') !== slotSig || !slot.firstChild;
        slot.setAttribute('data-sig', slotSig);

        var titleHtml = logoUrl
            ? '<h1 class="streamflix-hero-title streamflix-hero-title-has-logo">'
                + '<img class="streamflix-hero-logo" src="' + escapeHtml(logoUrl) + '" alt="" data-bfx-logo-fallback="hero" />'
                + '<span class="streamflix-hero-title-text">' + escapeHtml(item.Name) + '</span></h1>'
            : '<h1 class="streamflix-hero-title">' + escapeHtml(item.Name) + '</h1>';

        if (slotFresh) {
            slot.innerHTML = ''
                + '<div class="streamflix-hero-content' + (itemChanged ? ' streamflix-hero-swap' : '') + '">'
                + '  <div class="streamflix-hero-brand-row">'
                + '    <span class="streamflix-n-badge">' + escapeHtml(brandInitial) + '</span>'
                + '    <span class="streamflix-hero-series-tag">' + escapeHtml(kicker) + '</span>'
                + (heroRank
                    ? '<span class="streamflix-hero-top10-pill"><b>TOP 10</b><span>#' + heroRank + ' Today</span></span>'
                    : (isRecentlyAdded(item) ? '<span class="streamflix-hero-new">Recently added</span>' : ''))
                + '  </div>'
                + titleHtml
                + '  <div class="streamflix-hero-meta-row">'
                + (community ? '<span class="streamflix-hero-rating">' + icon('star') + escapeHtml(community) + '</span>' : '')
                + (year ? '<span>' + escapeHtml(year) + '</span>' : '')
                + (rating ? '<span class="streamflix-maturity-pill">' + escapeHtml(rating) + '</span>' : '')
                + (runtime ? '<span>' + escapeHtml(runtime.trim()) + '</span>' : '')
                + (genres.length ? '<span class="streamflix-hero-genres">' + genres.map(escapeHtml).join('<i></i>') + '</span>' : '')
                + '  </div>'
                + (item.Overview ? '<p class="streamflix-hero-overview">' + escapeHtml(item.Overview) + '</p>' : '')
                + (resumePct
                    ? '<div class="streamflix-hero-progress"><div class="streamflix-hero-progress-bar"><span style="width:' + resumePct + '%;"></span></div><span>' + escapeHtml(formatTimeLeft(item)) + '</span></div>'
                    : '')
                + '  <div class="streamflix-hero-actions">'
                + '    <button type="button" class="streamflix-hero-play" id="streamflix-hero-play-btn">' + iconLabel('play', hasResume ? 'Resume' : 'Play') + '</button>'
                + '    <button type="button" class="streamflix-hero-secondary" id="streamflix-hero-info-btn">' + iconLabel('info', 'More Info') + '</button>'
                + '    <button type="button" class="streamflix-hero-icon-btn' + (isFav ? ' active' : '') + '" id="streamflix-hero-fav-btn" title="' + (isFav ? 'Remove from My List' : 'Add to My List') + '" aria-label="' + (isFav ? 'Remove from My List' : 'Add to My List') + '">' + icon(isFav ? 'check' : 'plus') + '</button>'
                + '  </div>'
                + '</div>';
            hydrateCompleteImages(slot);
        }

        dotsEl.innerHTML = heroItems.length > 1
            ? heroItems.map(function (_, idx) {
                return '<button type="button" class="streamflix-hero-dot' + (idx === slideIdx ? ' active' : '') + (idx < slideIdx ? ' done' : '') + '" data-slide-idx="' + idx + '" aria-label="Show title ' + (idx + 1) + ' of ' + heroItems.length + '"><span class="streamflix-hero-dot-fill"></span></button>';
            }).join('')
            : '';

        if (slotFresh) {
            document.getElementById('streamflix-hero-play-btn').addEventListener('click', function () {
                navigateOrPlayItem(item);
            });
            document.getElementById('streamflix-hero-info-btn').addEventListener('click', function () {
                openHeroDetailModal(item);
            });
            document.getElementById('streamflix-hero-fav-btn').addEventListener('click', function () {
                toggleFavoriteItem(item, null);
                renderHeroSlide();
            });
        }

        Array.prototype.forEach.call(dotsEl.querySelectorAll('.streamflix-hero-dot'), function (dot) {
            dot.addEventListener('click', function () {
                state.heroIndex = parseInt(dot.getAttribute('data-slide-idx'), 10) || 0;
                renderHeroSlide();
                restartHeroTimer();
            });
        });

        if (prevFocusKey) {
            var focusTarget = null;
            if (prevFocusKey === 'play') {
                focusTarget = document.getElementById('streamflix-hero-play-btn');
            } else if (prevFocusKey === 'info') {
                focusTarget = document.getElementById('streamflix-hero-info-btn');
            } else if (prevFocusKey === 'fav') {
                focusTarget = document.getElementById('streamflix-hero-fav-btn');
            } else if (prevFocusKey === 'prev') {
                focusTarget = hero.querySelector('.streamflix-hero-arrow.prev');
            } else if (prevFocusKey === 'next') {
                focusTarget = hero.querySelector('.streamflix-hero-arrow.next');
            } else if (prevFocusKey === 'dot') {
                focusTarget = dotsEl.querySelector('.streamflix-hero-dot.active') || dotsEl.querySelector('.streamflix-hero-dot');
            }
            if (focusTarget && document.activeElement !== focusTarget) {
                try { focusTarget.focus({ preventScroll: true }); } catch (eFoc) { try { focusTarget.focus(); } catch (e2) {} }
            }
        }
        paintHeroProgress();
    }

    var HERO_TICK_MS = 200;

    function paintHeroProgress() {
        var fill = document.querySelector('#streamflix-hero-billboard .streamflix-hero-dot.active .streamflix-hero-dot-fill');
        if (fill) {
            var intervalMs = getHeroIntervalMs();
            if (intervalMs <= 0) {
                fill.style.transform = 'scaleX(1)';
                return;
            }
            var frac = (state.heroElapsed || 0) / intervalMs;
            fill.style.transform = 'scaleX(' + Math.min(1, Math.max(0, frac)).toFixed(3) + ')';
        }
    }

    // Story-style hero timer: pauses on hover/focus, hidden tabs, open modals and search; honors admin rotation interval (0 = off).
    function restartHeroTimer() {
        if (state.heroTimer) {
            clearInterval(state.heroTimer);
            state.heroTimer = null;
        }
        state.heroElapsed = 0;
        var heroRoot = document.getElementById('streamflix-hero-billboard');
        var intervalMs = getHeroIntervalMs();
        if (heroRoot) {
            heroRoot.classList.toggle('is-static-rotation', intervalMs <= 0);
        }
        paintHeroProgress();
        if (intervalMs <= 0 || prefersReducedMotion()) {
            return;
        }
        state.heroTimer = setInterval(function () {
            var heroEl = document.getElementById('streamflix-hero-billboard');
            var curHero = getActiveHeroItems();
            var curInterval = getHeroIntervalMs();
            if (!heroEl || curInterval <= 0) {
                clearInterval(state.heroTimer);
                state.heroTimer = null;
                if (heroEl && curInterval <= 0) {
                    heroEl.classList.add('is-static-rotation');
                    paintHeroProgress();
                }
                return;
            }
            heroEl.classList.remove('is-static-rotation');
            var paused = heroHardPaused() || state.heroPaused || curHero.length <= 1;
            heroEl.classList.toggle('is-paused', Boolean(paused));
            if (paused) {
                return;
            }
            state.heroElapsed = (state.heroElapsed || 0) + HERO_TICK_MS;
            if (state.heroElapsed >= curInterval) {
                state.heroElapsed = 0;
                state.heroIndex = (state.heroIndex + 1) % curHero.length;
                renderHeroSlide();
            }
            paintHeroProgress();
        }, HERO_TICK_MS);
    }

    // Let the hero billboard bleed up underneath Jellyfin's fixed header for an edge-to-edge look
    function syncHeroBleed(hub) {
        hub = hub || document.getElementById('streamflix-cinema-hub');
        if (!hub) {
            return;
        }
        if (!hub.classList.contains('streamflix-has-hero')) {
            hub.style.removeProperty('--bfx-bleed');
            return;
        }
        var offset = 0;
        try {
            var el = hub.parentNode;
            while (el && el.nodeType === 1) {
                offset += el.scrollTop || 0;
                el = el.parentNode;
            }
            offset += hub.getBoundingClientRect().top + (window.pageYOffset || 0);
        } catch (e) {
            offset = 0;
        }
        offset = Math.max(0, Math.min(220, Math.round(offset)));
        hub.style.setProperty('--bfx-bleed', offset + 'px');
    }

    function heroHardPaused() {
        var hub = document.getElementById('streamflix-cinema-hub');
        return Boolean(document.hidden || state.searchQuery || state.browseFilter || isGateOpen() || isVideoPlayerActive()
            || !hub || hub.style.display === 'none' || !isOnHomeRoute()
            || document.body.classList.contains('streamflix-modal-open') || document.querySelector('.streamflix-modal-backdrop'));
    }

    /* Ambient colour: sample the backdrop and let the page below the hero take on its hue */
    function rgbToHsl(rgb) {
        var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        var h = 0, s = 0, l = (mx + mn) / 2;
        if (mx !== mn) {
            var d = mx - mn;
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : (mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
            h /= 6;
        }
        return [h, s, l];
    }

    function hslToRgb(hsl) {
        var h = hsl[0], s = hsl[1], l = hsl[2];
        if (s === 0) {
            return [l * 255, l * 255, l * 255];
        }
        var hue = function (p, q, t) {
            if (t < 0) { t += 1; }
            if (t > 1) { t -= 1; }
            if (t < 1 / 6) { return p + (q - p) * 6 * t; }
            if (t < 1 / 2) { return q; }
            if (t < 2 / 3) { return p + (q - p) * (2 / 3 - t) * 6; }
            return p;
        };
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
    }

    function sampleAmbientColor(url, cb) {
        if (state.ambientCache[url]) {
            cb(state.ambientCache[url]);
            return;
        }
        var img = new Image();
        img.onload = function () {
            try {
                var c = document.createElement('canvas');
                c.width = 32;
                c.height = 18;
                var ctx = c.getContext && c.getContext('2d');
                if (!ctx) {
                    return;
                }
                ctx.drawImage(img, 0, 0, 32, 18);
                var d = ctx.getImageData(0, 0, 32, 18).data;
                var r = 0, g = 0, b = 0, w = 0, ar = 0, ag = 0, ab = 0, n = 0;
                for (var i = 0; i < d.length; i += 4) {
                    var R = d[i], G = d[i + 1], B = d[i + 2];
                    var hsl = rgbToHsl([R, G, B]);
                    ar += R; ag += G; ab += B; n++;
                    if (hsl[2] > 0.12 && hsl[2] < 0.82 && hsl[1] > 0.22) {
                        var wt = hsl[1] * hsl[1];
                        r += R * wt; g += G * wt; b += B * wt; w += wt;
                    }
                }
                var vivid = w > 0.6;
                var base = vivid ? [r / w, g / w, b / w] : [ar / n, ag / n, ab / n];
                var out = rgbToHsl(base);
                out[1] = Math.min(0.72, Math.max(out[1], vivid ? 0.38 : 0.08));
                out[2] = 0.3;
                var css = 'rgb(' + hslToRgb(out).map(function (v) { return Math.round(v); }).join(', ') + ')';
                putAmbientCache(url, css);
                cb(css);
            } catch (e) {
                // cross-origin artwork taints the canvas — keep the neutral background
            }
        };
        img.src = url;
    }

    function applyHeroAmbient(url) {
        sampleAmbientColor(url, function (css) {
            var hub = document.getElementById('streamflix-cinema-hub');
            var stack = document.querySelector('#streamflix-hero-billboard .streamflix-hero-bg-stack');
            if (hub && stack && stack.getAttribute('data-src') === url) {
                hub.style.setProperty('--bfx-ambient', css);
            }
        });
    }
