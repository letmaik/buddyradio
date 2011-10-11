(function() {
  var Controller, EOVR, LastFmApi, Model, View, http;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; }, __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) {
    for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; }
    function ctor() { this.constructor = child; }
    ctor.prototype = parent.prototype;
    child.prototype = new ctor;
    child.__super__ = parent.prototype;
    return child;
  }, __slice = Array.prototype.slice;
  exports.start = function() {
    var controller;
    controller = new Controller.Radio([new Model.LastFmBuddyNetwork], [new Model.GroovesharkStreamingNetwork]);
    return controller.start();
  };
  http = require("apollo:http");
  LastFmApi = require("apollo:lastfm");
  LastFmApi.key = "53cda3b9d8760dbded7b4ca420b5abb2";
  EOVR = new Error("must be overriden");
  Model = {};
  Model.APIRateLimiter = (function() {
    function APIRateLimiter(rate, per) {
      this.rate = rate;
      this.per = per * 1000;
      this._allowance = this.rate;
      this._lastCount = Date.now();
    }
    APIRateLimiter.prototype.count = function() {
      var current, timePassed;
      current = Date.now();
      timePassed = current - this._lastCount;
      this._lastCount = current;
      this._allowance += timePassed * (this.rate / this.per);
      if (this._allowance > this.rate) this._allowance = this.rate;
      if (this._allowance < 1) {
        console.error("API rate limit exceeded! always check with canSend() before!!");
      }
      return this._allowance -= 1;
    };
    APIRateLimiter.prototype.canSend = function() {
      var current, newAllowance, timePassed;
      current = Date.now();
      timePassed = current - this._lastCount;
      newAllowance = this._allowance + timePassed * (this.rate / this.per);
      return newAllowance >= 1;
    };
    return APIRateLimiter;
  })();
  Model.Buddy = (function() {
    function Buddy(network, username) {
      var info;
      this.network = network;
      this.username = username;
      this._handleNetworkEvent = __bind(this._handleNetworkEvent, this);
      info = this.network.getInfo(this.username);
      this.username = info.name;
      this.avatarUrl = info.avatarUrl;
      this.profileUrl = info.profileUrl;
      this.listeningStatus = this.network.getStatus(this.username);
      this.lastSong = this.network.getLastSong(this.username);
      this._networkListener = __bind(function(name, data) {
        return this._handleNetworkEvent(name, data);
      }, this);
      this.network.registerListener(this._networkListener, this.username);
      this._eventListeners = [];
    }
    Buddy.prototype.getLiveFeed = function() {
      console.log("getting live feed");
      return this.network.getLiveFeed(this.username);
    };
    Buddy.prototype.getHistoricFeed = function(fromTime, toTime) {
      if (fromTime === null || toTime === null) {
        throw new Error("times must be given for historic feed");
      }
      return this.network.getHistoricFeed(this.username, fromTime, toTime);
    };
    Buddy.prototype.registerListener = function(listener) {
      return this._eventListeners.push(listener);
    };
    Buddy.prototype.removeListener = function(listenerToBeRemoved) {
      var listener;
      return this._eventListeners = (function() {
        var _i, _len, _ref, _results;
        _ref = this._eventListeners;
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          listener = _ref[_i];
          if (listener !== listenerToBeRemoved) _results.push(listener);
        }
        return _results;
      }).call(this);
    };
    Buddy.prototype.dispose = function() {
      this.network.removeListener(this._networkListener, this.username);
      return this._eventListeners = [];
    };
    Buddy.prototype._handleNetworkEvent = function(name, data) {
      var listener, _i, _len, _ref, _results;
      if (name === "statusChanged") {
        this.listeningStatus = data;
      } else if (name === "lastSongChanged") {
        this.lastSong = data;
      }
      _ref = this._eventListeners;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        listener = _ref[_i];
        _results.push(listener(name, data));
      }
      return _results;
    };
    Buddy.prototype.toString = function() {
      return "Buddy[" + this.network.name + ":" + this.username + "]";
    };
    return Buddy;
  })();
  Model.BuddyManager = (function() {
    function BuddyManager(buddyNetworks) {
      this.buddyNetworks = buddyNetworks;
      this._handleBuddyEvent = __bind(this._handleBuddyEvent, this);
    }
    BuddyManager.prototype.buddies = [];
    BuddyManager.prototype.storageKey = "buddyRadio_Buddies";
    BuddyManager.prototype.eventListeners = [];
    BuddyManager.prototype.getBuddy = function(buddyNetworkClassName, username) {
      return this.buddies.filter(function(buddy) {
        return buddy.network.className === buddyNetworkClassName && buddy.username === username;
      })[0];
    };
    BuddyManager.prototype.addBuddy = function(buddyNetworkClassName, username) {
      var buddy, listener, network, _i, _len, _ref, _results;
      if (this.buddies.some(function(buddy) {
        return buddy.network.className === buddyNetworkClassName && buddy.username === username;
      })) {
        console.debug("user " + username + " is already added");
        return;
      }
      console.debug("adding " + buddyNetworkClassName + " user " + username);
      network = this._findBuddyNetwork(buddyNetworkClassName);
      if (network.isValid(username)) {
        buddy = new Model.Buddy(network, username);
        buddy.registerListener(__bind(function(name, data) {
          return this._handleBuddyEvent(buddy, name, data);
        }, this));
        this.buddies.push(buddy);
        this.saveLocal();
        console.info("user " + username + " added, informing listeners");
        _ref = this.eventListeners;
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          listener = _ref[_i];
          _results.push(listener("buddyAdded", buddy));
        }
        return _results;
      } else {
        return console.info("user " + username + " not found");
      }
    };
    BuddyManager.prototype.removeBuddy = function(buddyToBeRemoved) {
      var listener, _i, _len, _ref, _results;
      this.buddies = this.buddies.filter(function(buddy) {
        return buddy !== buddyToBeRemoved;
      });
      buddyToBeRemoved.dispose();
      this.saveLocal();
      console.info("user " + buddyToBeRemoved.username + " removed, informing listeners");
      _ref = this.eventListeners;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        listener = _ref[_i];
        _results.push(listener("buddyRemoved", buddyToBeRemoved));
      }
      return _results;
    };
    BuddyManager.prototype.saveLocal = function() {
      var buddy, listener, reducedBuddies, _i, _len, _ref, _results;
      reducedBuddies = (function() {
        var _i, _len, _ref, _results;
        _ref = this.buddies;
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          buddy = _ref[_i];
          _results.push([buddy.network.className, buddy.username]);
        }
        return _results;
      }).call(this);
      localStorage[this.storageKey] = JSON.stringify(reducedBuddies);
      _ref = this.eventListeners;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        listener = _ref[_i];
        _results.push(listener("buddiesSaved"));
      }
      return _results;
    };
    BuddyManager.prototype.loadLocal = function() {
      var listener, reducedBuddies, reducedBuddy, _i, _j, _len, _len2, _ref, _results;
      reducedBuddies = JSON.parse(localStorage[this.storageKey] || "[]");
      for (_i = 0, _len = reducedBuddies.length; _i < _len; _i++) {
        reducedBuddy = reducedBuddies[_i];
        this.addBuddy(reducedBuddy[0], reducedBuddy[1]);
      }
      _ref = this.eventListeners;
      _results = [];
      for (_j = 0, _len2 = _ref.length; _j < _len2; _j++) {
        listener = _ref[_j];
        _results.push(listener("buddiesLoaded"));
      }
      return _results;
    };
    BuddyManager.prototype.registerListener = function(listener) {
      return this.eventListeners.push(listener);
    };
    BuddyManager.prototype._handleBuddyEvent = function(buddy, name, data) {
      var listener, _i, _len, _ref, _results;
      if (["statusChanged", "lastSongChanged"].indexOf(name) !== -1) {
        _ref = this.eventListeners;
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          listener = _ref[_i];
          _results.push(listener(name, {
            buddy: buddy,
            data: data
          }));
        }
        return _results;
      }
    };
    BuddyManager.prototype._findBuddyNetwork = function(networkClassName) {
      return this.buddyNetworks.filter(function(network) {
        return network.className === networkClassName;
      })[0];
    };
    return BuddyManager;
  })();
  Model.BuddyNetwork = (function() {
    function BuddyNetwork() {}
    BuddyNetwork.prototype.name = "Network Name";
    BuddyNetwork.prototype.className = "Model.XYZBuddyNetwork";
    BuddyNetwork.prototype.isValid = function(buddyId) {
      throw EOVR;
    };
    BuddyNetwork.prototype.getStatus = function(buddyId) {
      throw EOVR;
    };
    BuddyNetwork.prototype.getInfo = function(buddyId) {
      throw EOVR;
    };
    BuddyNetwork.prototype.getLastSong = function(buddyId) {
      throw EOVR;
    };
    BuddyNetwork.prototype.getLiveFeed = function(buddyId) {
      throw EOVR;
    };
    BuddyNetwork.prototype.registerListener = function(listener, buddyId) {
      throw EOVR;
    };
    BuddyNetwork.prototype.removeListener = function(listener, buddyId) {
      throw EOVR;
    };
    return BuddyNetwork;
  })();
  Model.Radio = (function() {
    function Radio(buddyNetworks, streamingNetworks) {
      this.buddyNetworks = buddyNetworks;
      this.streamingNetworks = streamingNetworks;
      this._handleSongFeedStreamEvent = __bind(this._handleSongFeedStreamEvent, this);
      this._handleFeedCombinatorEvent = __bind(this._handleFeedCombinatorEvent, this);
      this._handleBuddyManagerEvent = __bind(this._handleBuddyManagerEvent, this);
      this.buddyManager = new Model.BuddyManager(this.buddyNetworks);
      this.buddyManager.registerListener(this._handleBuddyManagerEvent);
      this._currentStream = null;
      this._eventListeners = [];
      this._feedEnabledBuddies = {};
      this._feedCombinator = new Model.AlternatingSongFeedCombinator();
      this._feedCombinator.registerListener(this._handleFeedCombinatorEvent);
      this._feededSongs = {};
      this.onAirBuddy = null;
    }
    Radio.prototype.tune = function(buddy) {
      var feed, listener, oldOnAirBuddy, result, _i, _j, _k, _len, _len2, _len3, _ref, _ref2, _ref3;
      if (this.isFeedEnabled(buddy)) {
        return this.tuneOut(buddy);
      } else {
        if (buddy.listeningStatus === "disabled") {
          _ref = this._eventListeners;
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            listener = _ref[_i];
            listener("errorTuningIn", {
              buddy: buddy,
              reason: "disabled"
            });
          }
          return;
        }
        feed = buddy.getLiveFeed();
        this._feedCombinator.addFeed(feed);
        this._feedEnabledBuddies[buddy.username] = feed;
        _ref2 = this._eventListeners;
        for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
          listener = _ref2[_j];
          listener("tunedIn", buddy);
        }
        if (this._currentStream === null) {
          this._currentStream = new Model.SongFeedStream(this._feedCombinator, this.streamingNetworks);
          this._currentStream.registerListener(this._handleSongFeedStreamEvent);
          console.debug("starting new stream");
          result = this._currentStream.startStreaming();
          console.debug("stream returned: " + result.status);
          if (result.status === "stopRequest") {
            oldOnAirBuddy = this.onAirBuddy;
            this.onAirBuddy = null;
            _ref3 = this._eventListeners;
            for (_k = 0, _len3 = _ref3.length; _k < _len3; _k++) {
              listener = _ref3[_k];
              listener("nobodyPlaying", {
                lastPlayingBuddy: oldOnAirBuddy
              });
            }
            return console.info("stream stopped");
          }
        }
      }
    };
    Radio.prototype.tuneOut = function(buddy, reason) {
      var listener, _i, _len, _ref;
      if (reason == null) reason = "request";
      if (this.isFeedEnabled(buddy)) {
        this._feedCombinator.removeFeed(this._feedEnabledBuddies[buddy.username]);
        delete this._feedEnabledBuddies[buddy.username];
        _ref = this._eventListeners;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          listener = _ref[_i];
          listener("tunedOut", {
            buddy: buddy,
            reason: reason
          });
        }
        if (Object.keys(this._feedEnabledBuddies).length === 0) {
          this._currentStream.stopStreaming();
          this._currentStream.dispose();
          return this._currentStream = null;
        }
      }
    };
    Radio.prototype.registerListener = function(listener) {
      return this._eventListeners.push(listener);
    };
    Radio.prototype.isFeedEnabled = function(buddy) {
      return this._feedEnabledBuddies.hasOwnProperty(buddy.username);
    };
    Radio.prototype.isOnAir = function(buddy) {
      return buddy === this.onAirBuddy;
    };
    Radio.prototype._handleBuddyManagerEvent = function(name, data) {
      if (name === "buddyRemoved" && this.isFeedEnabled(data)) {
        this.tuneOut(data, "buddyRemoved");
      }
      if (name === "statusChanged" && data.data === "disabled" && this.isFeedEnabled(data.buddy)) {
        return this.tuneOut(data.buddy, "disabled");
      }
    };
    Radio.prototype._handleFeedCombinatorEvent = function(name, data) {
      var username;
      if (name === "nextSongReturned") {
        username = this._getUsernameByFeed(data.feed);
        if (!this._feededSongs.hasOwnProperty(username)) {
          this._feededSongs[username] = [];
        }
        this._feededSongs[username].push(data.song);
        return console.debug("song '" + data.song + "' feeded from " + username);
      }
    };
    Radio.prototype._getUsernameByFeed = function(feed) {
      return Object.keys(this._feedEnabledBuddies).filter(__bind(function(username) {
        return this._feedEnabledBuddies[username] === feed;
      }, this))[0];
    };
    Radio.prototype._getUsernameBySong = function(song) {
      return Object.keys(this._feededSongs).filter(__bind(function(username) {
        return this._feededSongs[username].indexOf(song) !== -1;
      }, this))[0];
    };
    Radio.prototype._handleSongFeedStreamEvent = function(name, data) {
      var listener, oldOnAirBuddy, song, username, _i, _j, _len, _len2, _ref, _ref2;
      if (name === "songPlaying") {
        song = data;
        username = this._getUsernameBySong(song);
        oldOnAirBuddy = this.onAirBuddy;
        this.onAirBuddy = this.buddyManager.buddies.filter(function(buddy) {
          return buddy.username === username;
        })[0];
        _ref = this._eventListeners;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          listener = _ref[_i];
          listener("nowPlaying", {
            buddy: this.onAirBuddy,
            lastPlayingBuddy: oldOnAirBuddy
          });
        }
        return console.debug("new song playing by " + this.onAirBuddy);
      } else if (name === "nothingPlaying") {
        oldOnAirBuddy = this.onAirBuddy;
        this.onAirBuddy = null;
        _ref2 = this._eventListeners;
        for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
          listener = _ref2[_j];
          listener("nobodyPlaying", {
            lastPlayingBuddy: oldOnAirBuddy
          });
        }
        return console.debug("nobody's playing anything");
      }
    };
    return Radio;
  })();
  Model.Song = (function() {
    function Song(artist, title, listenedAt) {
      this.artist = artist;
      this.title = title;
      this.listenedAt = listenedAt;
      if (!(this.listenedAt != null)) {
        this.listenedAt = Math.round(Date.now() / 1000);
      }
      this.resources = null;
    }
    Song.prototype.toString = function() {
      return "Song[" + this.artist + " - " + this.title + "]";
    };
    return Song;
  })();
  Model.SongResource = (function() {
    function SongResource() {
      this.length = null;
    }
    SongResource.prototype.getPlayingPosition = function() {
      throw E;
    };
    return SongResource;
  })();
  Model.SongFeed = (function() {
    function SongFeed() {}
    SongFeed.prototype.hasOpenEnd = function() {
      throw EOVR;
    };
    SongFeed.prototype.hasNext = function() {
      throw EOVR;
    };
    SongFeed.prototype.next = function() {
      throw EOVR;
    };
    return SongFeed;
  })();
  Model.SequentialSongFeedCombinator = (function() {
    __extends(SequentialSongFeedCombinator, Model.SongFeed);
    function SequentialSongFeedCombinator() {
      var feeds;
      feeds = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      this.feeds = feeds;
      if (this.feeds.length === 0) throw new Error("no feeds given!");
      this._currentFeedIdx = 0;
    }
    SequentialSongFeedCombinator.prototype.hasOpenEnd = function() {
      return this.feeds[this.feeds.length - 1].hasOpenEnd();
    };
    SequentialSongFeedCombinator.prototype.hasNext = function() {
      var hasNext;
      hasNext = this.feeds[this._currentFeedIdx].hasNext();
      if (!hasNext && !this.feeds[this._currentFeedIdx].hasOpenEnd() && this._currentFeedIdx < this.feeds.length - 1) {
        this._currentFeedIdx++;
        return this.hasNext();
      } else {
        return hasNext;
      }
    };
    SequentialSongFeedCombinator.prototype.next = function() {
      return this.feeds[this._currentFeedIdx].next();
    };
    SequentialSongFeedCombinator.prototype.addFeed = function(feed) {
      return this.feeds.push(feed);
    };
    return SequentialSongFeedCombinator;
  })();
  Model.AlternatingSongFeedCombinator = (function() {
    __extends(AlternatingSongFeedCombinator, Model.SongFeed);
    function AlternatingSongFeedCombinator() {
      var feeds, songsPerFeedInARow;
      songsPerFeedInARow = arguments[0], feeds = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      this.songsPerFeedInARow = songsPerFeedInARow != null ? songsPerFeedInARow : 1;
      this.feeds = feeds;
      this._currentFeedIdx = 0;
      this._currentFeedSongsInARow = 0;
      this._eventListeners = [];
    }
    AlternatingSongFeedCombinator.prototype.registerListener = function(listener) {
      return this._eventListeners.push(listener);
    };
    AlternatingSongFeedCombinator.prototype.hasOpenEnd = function() {
      return this.feeds.some(function(feed) {
        return feed.hasOpenEnd();
      });
    };
    AlternatingSongFeedCombinator.prototype.hasNext = function() {
      var startIdx;
      if (this.feeds.length === 0) return false;
      if (this._currentFeedSongsInARow < this.songsPerFeedInARow && this.feeds[this._currentFeedIdx].hasNext()) {
        return true;
      }
      this._moveToNextFeed();
      this._currentFeedSongsInARow = 0;
      startIdx = this._currentFeedIdx;
      while (!this.feeds[this._currentFeedIdx].hasNext()) {
        this._moveToNextFeed();
        if (this._currentFeedIdx === startIdx) return false;
      }
      return true;
    };
    AlternatingSongFeedCombinator.prototype._moveToNextFeed = function() {
      return this._currentFeedIdx = this._currentFeedIdx === this.feeds.length - 1 ? 0 : this._currentFeedIdx + 1;
    };
    AlternatingSongFeedCombinator.prototype.next = function() {
      var listener, song, _i, _len, _ref;
      this._currentFeedSongsInARow++;
      song = this.feeds[this._currentFeedIdx].next();
      _ref = this._eventListeners;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        listener = _ref[_i];
        listener("nextSongReturned", {
          feed: this.feeds[this._currentFeedIdx],
          song: song
        });
      }
      return song;
    };
    AlternatingSongFeedCombinator.prototype.addFeed = function(feed) {
      this.feeds.push(feed);
      return console.debug("feed added");
    };
    AlternatingSongFeedCombinator.prototype.removeFeed = function(feedToRemove) {
      if (!this.feeds.some(function(feed) {
        return feed === feedToRemove;
      })) {
        throw new Error("feed cannot be removed (not found)");
      }
      this.feeds = this.feeds.filter(function(feed) {
        return feed !== feedToRemove;
      });
      this._currentFeedIdx = 0;
      console.debug("feed removed");
      return this._currentFeedSongsInARow = 0;
    };
    return AlternatingSongFeedCombinator;
  })();
  Model.SongFeedStream = (function() {
    function SongFeedStream(songFeed, streamingNetworks) {
      var network, _i, _len, _ref;
      this.songFeed = songFeed;
      this.streamingNetworks = streamingNetworks;
      this._handleStreamingNetworkEvent = __bind(this._handleStreamingNetworkEvent, this);
      _ref = this.streamingNetworks;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        network = _ref[_i];
        network.registerListener(this._handleStreamingNetworkEvent);
      }
      this.stopRequest = false;
      this.queue = [];
      this._eventListeners = [];
      this._stopRequestCall = function() {};
    }
    SongFeedStream.prototype.registerListener = function(listener) {
      return this._eventListeners.push(listener);
    };
    SongFeedStream.prototype.stopStreaming = function() {
      var listener, _i, _len, _ref;
      this.stopRequest = true;
      console.log("stop request received");
      _ref = this._eventListeners;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        listener = _ref[_i];
        listener("streamingStoppedByRequest");
      }
      return this._stopRequestCall();
    };
    SongFeedStream.prototype.startStreaming = function() {
      var lastSongReceivedAt, lastSongStreamedNetwork, listener, network, preferredResource, rv, song, _i, _len, _ref, _results;
      this.stopRequest = false;
      lastSongReceivedAt = -1;
      lastSongStreamedNetwork = null;
      waitfor {
        _results = [];
        while (true) {
          console.log("next iteration");
          if (this.stopRequest) {
            return {
              status: "stopRequest"
            };
          }
          if (!this.songFeed.hasNext()) {
            if (this.songFeed.hasOpenEnd()) {
              console.log("holding..15secs");
              hold(15000);
              continue;
            } else {
              console.info("end of feed, all available songs streamed");
              return {
                status: "endOfFeed"
              };
            }
          } else {
            song = this.songFeed.next();
            console.log("next: " + song);
            lastSongReceivedAt = Date.now();
            if (this._findAndAddSongResources(song)) {
              preferredResource = this._getPreferredResource(song.resources, lastSongStreamedNetwork);
              network = this.streamingNetworks.filter(function(network) {
                return network.canPlay(preferredResource);
              })[0];
              if (network.enqueue && lastSongStreamedNetwork === network && this.queue.length > 0) {
                this.queue.push({
                  song: song,
                  resource: preferredResource
                });
                network.enqueue(preferredResource);
                console.log("waiting");
                _results.push(this._waitUntilEndOfQueue(0.9));
              } else {
                console.log("waiting 2");
                this._waitUntilEndOfQueue(1.0);
                this.queue.push({
                  song: song,
                  resource: preferredResource
                });
                _ref = this._eventListeners;
                for (_i = 0, _len = _ref.length; _i < _len; _i++) {
                  listener = _ref[_i];
                  listener("songPlaying", song);
                }
                network.play(preferredResource);
                lastSongStreamedNetwork = network;
                console.log("waiting 3");
                _results.push(this._waitUntilEndOfQueue(0.9));
              }
            } else {
              continue;
            }
          }
        }
        return _results;
      }
      or {
        waitfor (rv) {
          this._stopRequestCall = resume;
        }
        return {
          status: "stopRequest"
        };
      }
    };
    SongFeedStream.prototype.dispose = function() {
      var network, _i, _len, _ref;
      if (!this.stopRequest) {
        throw new Error("can only dispose after streaming was stopped");
      }
      _ref = this.streamingNetworks;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        network = _ref[_i];
        network.removeListener(this._handleStreamingNetworkEvent);
      }
      return this._eventListeners = [];
    };
    SongFeedStream.prototype._waitUntilEndOfQueue = function(factor) {
      var length, position, songEndsIn, waitingResource;
      while (this.queue.length > 1) {
        console.debug("holding on... " + this.queue.length + " songs in queue");
        hold(5000);
      }
      if (this.queue.length === 0) return;
      console.debug("holding on.. until song nearly finished");
      waitingResource = this.queue[0].resource;
      while (this.queue.length === 1 && this.queue[0].resource === waitingResource) {
        length = waitingResource.length;
        position = waitingResource.getPlayingPosition();
        console.debug("length: " + length + ", position: " + position);
        if ((length != null) && (position != null)) {
          songEndsIn = Math.round(factor * waitingResource.length - waitingResource.getPlayingPosition());
          console.debug("songEndsIn: " + songEndsIn);
          if (songEndsIn < 0) {
            break;
          } else if (songEndsIn < 10000) {
            hold(songEndsIn);
            break;
          }
        }
        hold(5000);
      }
      if (this.queue.length !== 1) {
        console.warn("queue length changed to " + this.queue.length);
      }
      if (this.queue > 0 && this.queue[0].resource !== waitingResource) {
        return console.warn("resource on which we are waiting for changed to " + this.waitingResource);
      }
    };
    SongFeedStream.prototype._findAndAddSongResources = function(song) {
      var network, resources;
      if (song.resources === null) {
        resources = (function() {
          var _i, _len, _ref, _results;
          _ref = this.streamingNetworks;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            network = _ref[_i];
            _results.push(network.findSongResource(song.artist, song.title));
          }
          return _results;
        }).call(this);
        song.resources = resources.filter(function(resource) {
          return resource != null;
        });
      }
      return song.resources.length > 0;
    };
    SongFeedStream.prototype._getPreferredResource = function(resources, preferredNetwork) {
      var matchingResource;
      if (!(preferredNetwork != null)) {
        return resources[0];
      } else {
        matchingResource = resources.filter(__bind(function(resource) {
          var network;
          network = this.streamingNetworks.filter(function(network) {
            return network.canPlay(resource);
          })[0];
          return network === preferredNetwork;
        }, this));
        if (matchingResource.length === 0) {
          return resources[0];
        } else {
          return matchingResource[0];
        }
      }
    };
    SongFeedStream.prototype._handleStreamingNetworkEvent = function(name, data) {
      var listener, _i, _j, _len, _len2, _ref, _ref2, _results, _results2;
      if (["streamingSkipped", "streamingCompleted", "streamingFailed"].indexOf(name) !== -1 && this.queue[0].resource === data) {
        if (name === "streamingSkipped") {
          console.log("song skipped, shifting");
        } else if (name === "streamingCompleted") {
          console.log("song completed, shifting");
        } else if (name === "streamingFailed") {
          console.log("song failed to play, shifting");
        }
        this.queue.shift();
        if (this.queue.length > 0) {
          _ref = this._eventListeners;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            listener = _ref[_i];
            _results.push(listener("songPlaying", this.queue[0].song));
          }
          return _results;
        } else {
          _ref2 = this._eventListeners;
          _results2 = [];
          for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
            listener = _ref2[_j];
            _results2.push(listener("nothingPlaying"));
          }
          return _results2;
        }
      }
    };
    return SongFeedStream;
  })();
  Model.StreamingNetwork = (function() {
    function StreamingNetwork() {
      this.eventListeners = [];
    }
    StreamingNetwork.prototype.registerListener = function(listener) {
      return this.eventListeners.push(listener);
    };
    StreamingNetwork.prototype.removeListener = function(listenerToBeRemoved) {
      return this.eventListeners = this.eventListeners.filter(function(listener) {
        return listener !== listenerToBeRemoved;
      });
    };
    StreamingNetwork.prototype.findSongResource = function(artist, title) {
      throw new Error("must be overriden");
    };
    StreamingNetwork.prototype.canPlay = function(songResource) {
      throw new Error("must be overriden");
    };
    StreamingNetwork.prototype.play = function(songResource) {
      throw new Error("must be overriden");
    };
    StreamingNetwork.prototype.stop = function() {
      throw new Error("must be overriden");
    };
    return StreamingNetwork;
  })();
  Model.GroovesharkSongResource = (function() {
    __extends(GroovesharkSongResource, Model.SongResource);
    function GroovesharkSongResource(songId, groovesharkNetwork) {
      this.songId = songId;
      this.groovesharkNetwork = groovesharkNetwork;
      GroovesharkSongResource.__super__.constructor.call(this);
    }
    GroovesharkSongResource.prototype.getPlayingPosition = function() {
      return this.groovesharkNetwork.getPlayingPosition(this);
    };
    GroovesharkSongResource.prototype.toString = function() {
      return "GroovesharkSongResource[songId: " + this.songId + "]";
    };
    return GroovesharkSongResource;
  })();
  Model.GroovesharkStreamingNetwork = (function() {
    var currentSongShouldHaveStartedAt, lastFailedSongResource;
    __extends(GroovesharkStreamingNetwork, Model.StreamingNetwork);
    function GroovesharkStreamingNetwork() {
      this.handleGroovesharkEvent = __bind(this.handleGroovesharkEvent, this);      GroovesharkStreamingNetwork.__super__.constructor.call(this);
      if (!((Grooveshark.addSongsByID != null) && (Grooveshark.setSongStatusCallback != null) && (Grooveshark.pause != null) && (Grooveshark.removeCurrentSongFromQueue != null))) {
        throw new Error("Grooveshark API not available or has changed");
      }
      Grooveshark.setSongStatusCallback(this.handleGroovesharkEvent);
    }
    GroovesharkStreamingNetwork.prototype.findSongResource = function(artist, title) {
      var response, url;
      url = http.constructURL("http://buddyradioproxy.appspot.com/tinysong?artist=" + artist + "&title=" + title);
      response = http.json(url);
      if (response.SongID != null) {
        return new Model.GroovesharkSongResource(response.SongID, this);
      } else {
        console.warn("no result from tinysong for: " + artist + " - " + title);
        if (response.error != null) console.error("error was: " + response.error);
        return null;
      }
    };
    GroovesharkStreamingNetwork.prototype.canPlay = function(songResource) {
      return songResource instanceof Model.GroovesharkSongResource;
    };
    GroovesharkStreamingNetwork.prototype.queuedSongResources = [];
    currentSongShouldHaveStartedAt = null;
    lastFailedSongResource = null;
    GroovesharkStreamingNetwork.prototype.play = function(songResource) {
      var listener, _i, _len, _ref, _ref2;
      console.debug("playing... Grooveshark songID " + songResource.songId);
      Grooveshark.addSongsByID([songResource.songId]);
      waitfor {
        while (((_ref = Grooveshark.getCurrentSongStatus().song) != null ? _ref.songID : void 0) !== songResource.songId) {
          console.debug("skipping to next song to get to the current one");
          Grooveshark.next();
          hold(1000);
        }
      }
      or {
        hold(10000);
        console.error("couldn't skip to current song in Grooveshark player, informing listeners");
        _ref2 = this.eventListeners;
        for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
          listener = _ref2[_i];
          listener("streamingSkipped", songResource);
        }
        return;
      }
      this.currentSongShouldHaveStartedAt = Date.now();
      this.queuedSongResources.push(songResource);
      return this._playIfPaused();
    };
    GroovesharkStreamingNetwork.prototype.enqueue = function(songResource) {
      this.queuedSongResources.push(songResource);
      return Grooveshark.addSongsByID([songResource.songId]);
    };
    GroovesharkStreamingNetwork.prototype.getPlayingPosition = function(songResource) {
      var gsSong, resources;
      this.cleanup();
      gsSong = Grooveshark.getCurrentSongStatus().song;
      if ((gsSong != null) && gsSong.songID === songResource.songId) {
        resources = this.queuedSongResources.filter(function(resource) {
          return resource === songResource;
        });
        if (resources.length === 1 && resources[0].length !== null && Math.round(gsSong.calculatedDuration) > resources[0].length) {
          console.debug("song length corrected from " + resources[0].length + "ms to " + (Math.round(gsSong.calculatedDuration)) + "ms");
          resources[0].length = Math.round(gsSong.calculatedDuration);
        }
        return gsSong.position;
      } else {
        return null;
      }
    };
    GroovesharkStreamingNetwork.prototype.cleanup = function() {
      var listener, oldDate, resource, _i, _len, _ref, _ref2, _results;
      if (this.queuedSongResources.length > 0 && this.queuedSongResources[0].length === null) {
        if ((Date.now() - this.currentSongShouldHaveStartedAt) > 10000) {
          console.warn("grooveshark got stuck... trying to re-add current song");
          resource = this.queuedSongResources.shift();
          oldDate = this.currentSongShouldHaveStartedAt;
          if (((_ref = Grooveshark.getCurrentSongStatus().song) != null ? _ref.songID : void 0) === resource.songId) {
            Grooveshark.removeCurrentSongFromQueue();
          }
          this.play(resource);
          return this.currentSongShouldHaveStartedAt = oldDate;
        } else if ((Date.now() - this.currentSongShouldHaveStartedAt) > 25000) {
          console.warn("grooveshark got stuck... giving up. skipping song and fixing queue");
          resource = this.queuedSongResources.shift();
          _ref2 = this.eventListeners;
          _results = [];
          for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
            listener = _ref2[_i];
            _results.push(listener("streamingSkipped", resource));
          }
          return _results;
        }
      }
    };
    GroovesharkStreamingNetwork.prototype.stop = function() {
      Grooveshark.pause();
      return this.queuedSongResources = [];
    };
    GroovesharkStreamingNetwork.prototype._playIfPaused = function() {
      var _results;
      _results = [];
      while (["paused", "none"].indexOf(Grooveshark.getCurrentSongStatus().status) !== -1) {
        Grooveshark.play();
        _results.push(hold(1000));
      }
      return _results;
    };
    GroovesharkStreamingNetwork.prototype.handleGroovesharkEvent = function(data) {
      var listener, resource, song, status, _i, _j, _k, _len, _len2, _len3, _ref, _ref2, _ref3, _results;
      status = data.status;
      song = data.song;
      console.debug("GS: " + status + ", song id: " + (song != null ? song.songID : void 0) + ", calculated duration: " + (song != null ? song.calculatedDuration : void 0) + ", estimated duration: " + (song != null ? song.estimateDuration : void 0));
      if (!this.queuedSongResources.some(function(resource) {
        return resource.songId === (song != null ? song.songID : void 0);
      })) {
        return;
      }
      if (song.calculatedDuration !== 0) {
        resource = this.queuedSongResources.filter(function(resource) {
          return resource.songId === song.songID;
        })[0];
        if (resource.length != null) {
          if (Math.round(song.calculatedDuration) > resource.length) {
            console.debug("song length corrected from " + resource.length + "ms to " + (Math.round(song.calculatedDuration)) + "ms");
            resource.length = Math.round(song.calculatedDuration);
          }
        } else {
          resource.length = Math.round(song.calculatedDuration);
          console.debug("song length set to " + resource.length + " ms (songId " + song.songID + ")");
        }
      }
      while (this.queuedSongResources[0].songId !== song.songID) {
        resource = this.queuedSongResources.shift();
        _ref = this.eventListeners;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          listener = _ref[_i];
          listener("streamingSkipped", resource);
        }
      }
      if (["completed", "failed"].indexOf(status) !== -1) {
        if (this.queuedSongResources.length > 0) {
          this.currentSongShouldHaveStartedAt = Date.now();
        }
        resource = this.queuedSongResources.shift();
        _ref2 = this.eventListeners;
        for (_j = 0, _len2 = _ref2.length; _j < _len2; _j++) {
          listener = _ref2[_j];
          listener("streamingCompleted", resource);
        }
      }
      if (status === "failed") {
        if (this.lastFailedSongResource === this.queuedSongResources[0]) {
          _ref3 = this.eventListeners;
          _results = [];
          for (_k = 0, _len3 = _ref3.length; _k < _len3; _k++) {
            listener = _ref3[_k];
            _results.push(listener("streamingFailed", this.lastFailedSongResource));
          }
          return _results;
        } else {
          resource = this.queuedSongResources.shift();
          this.lastFailedSongResource = resource;
          return this.play(resource);
        }
      }
    };
    return GroovesharkStreamingNetwork;
  })();
  Model.LastFmBuddyNetwork = (function() {
    __extends(LastFmBuddyNetwork, Model.BuddyNetwork);
    function LastFmBuddyNetwork() {
      LastFmBuddyNetwork.__super__.constructor.apply(this, arguments);
    }
    LastFmBuddyNetwork.prototype.name = "Last.fm";
    LastFmBuddyNetwork.prototype.className = "Model.LastFmBuddyNetwork";
    LastFmBuddyNetwork.prototype._rateLimiter = new Model.APIRateLimiter(500, 300);
    LastFmBuddyNetwork.prototype._buddyCache = {};
    LastFmBuddyNetwork.prototype._buddyListeningCache = {};
    LastFmBuddyNetwork.prototype._eventListeners = {};
    LastFmBuddyNetwork.prototype.isValid = function(username) {
      var user;
      if (this._buddyCache.hasOwnProperty(username.toLowerCase())) return true;
      try {
        user = LastFmApi.get({
          method: "user.getInfo",
          user: username
        });
        this._buddyCache[user.name.toLowerCase()] = {
          name: user.name,
          avatarUrl: user.image[0]["#text"],
          profileUrl: user.url
        };
        return true;
      }
      catch (e) {
        return false;
      }
    };
    LastFmBuddyNetwork.prototype._throwIfInvalid = function(username) {
      if (!this.isValid(username)) {
        throw new Error("" + username + " not existing on Last.fm");
      }
    };
    LastFmBuddyNetwork.prototype.getInfo = function(username) {
      var user;
      user = username.toLowerCase();
      this._throwIfInvalid(user);
      this._updateListeningData(user);
      return this._buddyCache[user];
    };
    LastFmBuddyNetwork.prototype.getStatus = function(username) {
      this._throwIfInvalid(username);
      this._updateListeningData(username.toLowerCase());
      return this._buddyListeningCache[username.toLowerCase()].status;
    };
    LastFmBuddyNetwork.prototype.getLastSong = function(username) {
      var user;
      user = username.toLowerCase();
      this._throwIfInvalid(user);
      this._updateListeningData(user);
      return this._doGetLastSong(user);
    };
    LastFmBuddyNetwork.prototype._doGetLastSong = function(username) {
      if (this._buddyListeningCache[username].status === "live") {
        return this._buddyListeningCache[username].currentSong;
      } else if (this._buddyListeningCache[username].pastSongs.length > 0) {
        return this._buddyListeningCache[username].pastSongs[0];
      } else {
        return null;
      }
    };
    LastFmBuddyNetwork.prototype._getPastSongs = function(username) {
      this._throwIfInvalid(username);
      return this._buddyListeningCache[username.toLowerCase()].pastSongs;
    };
    LastFmBuddyNetwork.prototype.getLiveFeed = function(username) {
      return new Model.LastFmLiveSongFeed(username, this);
    };
    LastFmBuddyNetwork.prototype.getHistoricFeed = function(username, fromTime, toTime) {
      if (fromTime === null || toTime === null) {
        throw new Error("wrong parameters");
      }
      return new Model.LastFmHistoricSongFeed(username, this, fromTime, toTime);
    };
    LastFmBuddyNetwork.prototype.registerListener = function(listener, username) {
      var user;
      user = username.toLowerCase();
      if (!this._eventListeners.hasOwnProperty(user)) {
        this._eventListeners[user] = [];
      }
      return this._eventListeners[user].push(listener);
    };
    LastFmBuddyNetwork.prototype._notifyListeners = function(username, name, data) {
      var listener, _i, _len, _ref, _results;
      if (!this._eventListeners.hasOwnProperty(username)) return;
      console.debug("last.fm notify: " + username + " " + name + " " + data);
      _ref = this._eventListeners[username];
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        listener = _ref[_i];
        _results.push(listener(name, data));
      }
      return _results;
    };
    LastFmBuddyNetwork.prototype.removeListener = function(listenerToBeRemoved, username) {
      var listener;
      return this._eventListeners[username.toLowerCase()] = (function() {
        var _i, _len, _ref, _results;
        _ref = this._eventListeners[username.toLowerCase()];
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          listener = _ref[_i];
          if (listener !== listenerToBeRemoved) _results.push(listener);
        }
        return _results;
      }).call(this);
    };
    LastFmBuddyNetwork.prototype.forceUpdateListeningData = function(username) {
      return this._updateListeningData(username.toLowerCase(), 1000);
    };
    LastFmBuddyNetwork.prototype._updateListeningData = function(username, cacheLifetime) {
      var cache, currentSong, lastUpdate, newCurrentSong, newLastSong, oldLastSong, pastSongs, response, status, track, tracks;
      if (cacheLifetime == null) cacheLifetime = 30000;
      cache = this._buddyListeningCache.hasOwnProperty(username) ? this._buddyListeningCache[username] : null;
      lastUpdate = cache != null ? cache.lastUpdate : 0;
      if ((Date.now() - lastUpdate) < cacheLifetime) return;
      if (!this._rateLimiter.canSend()) {
        console.warn("Last.fm API rate limit exceeded, skipping update of " + username + "'s listening data");
        return;
      }
      console.info("getting recent tracks and status from Last.fm for " + username);
      response = null;
      try {
        this._rateLimiter.count();
        response = LastFmApi.get({
          method: "user.getRecentTracks",
          user: username
        });
      }
      catch (e) {
        if (e.code === 4) {
          if ((cache != null ? cache.status : void 0) !== "disabled") {
            this._notifyListeners(username, "statusChanged", "disabled");
          }
          this._buddyListeningCache[username] = {
            lastUpdate: Date.now(),
            status: "disabled",
            currentSong: null,
            pastSongs: []
          };
          return;
        } else {
          throw e;
        }
      }
      tracks = response.track || [];
      currentSong = ((function() {
        var _i, _len, _ref, _results;
        _results = [];
        for (_i = 0, _len = tracks.length; _i < _len; _i++) {
          track = tracks[_i];
          if ((_ref = track["@attr"]) != null ? _ref.nowplaying : void 0) {
            _results.push(new Model.Song(track.artist["#text"], track.name));
          }
        }
        return _results;
      })())[0];
      pastSongs = (function() {
        var _i, _len, _ref, _results;
        _results = [];
        for (_i = 0, _len = tracks.length; _i < _len; _i++) {
          track = tracks[_i];
          if (!((_ref = track["@attr"]) != null ? _ref.nowplaying : void 0)) {
            _results.push(new Model.Song(track.artist["#text"], track.name, track.date.uts));
          }
        }
        return _results;
      })();
      status = currentSong != null ? "live" : "off";
      if (status !== (cache != null ? cache.status : void 0)) {
        this._notifyListeners(username, "statusChanged", status);
      }
      if (status === "off" && (cache != null ? cache.status : void 0) === "live" && (Date.now() - cache.lastUpdate) < 10000) {
        return console.debug("" + username + " went off in the last 10s, will update when >10s");
      } else {
        newCurrentSong = cache != null ? cache.currentSong : void 0;
        if (((cache != null ? cache.currentSong : void 0) != null) && (currentSong != null)) {
          if (cache.currentSong.artist !== currentSong.artist || cache.currentSong.title !== currentSong.title || (cache.pastSongs.length > 0 && cache.pastSongs[0].listenedAt !== pastSongs[0].listenedAt)) {
            newCurrentSong = currentSong;
          }
        } else {
          newCurrentSong = currentSong;
        }
        oldLastSong = cache != null ? this._doGetLastSong(username) : null;
        this._buddyListeningCache[username] = {
          lastUpdate: Date.now(),
          status: status,
          currentSong: newCurrentSong,
          pastSongs: pastSongs
        };
        newLastSong = this._doGetLastSong(username);
        if ((oldLastSong != null) && (newLastSong != null)) {
          if (oldLastSong.listenedAt !== newLastSong.listenedAt) {
            return this._notifyListeners(username, "lastSongChanged", newLastSong);
          }
        } else if (oldLastSong !== newLastSong) {
          return this._notifyListeners(username, "lastSongChanged", newLastSong);
        }
      }
    };
    return LastFmBuddyNetwork;
  })();
  Model.LastFmSongFeed = (function() {
    __extends(LastFmSongFeed, Model.SongFeed);
    function LastFmSongFeed() {
      this._songs = [];
      this._songsQueuedLength = 0;
      this._currentSongsIdx = -1;
    }
    LastFmSongFeed.prototype.hasNext = function() {
      if (this._songsQueuedLength === 0) this._updateFeed();
      return this._songsQueuedLength > 0;
    };
    LastFmSongFeed.prototype.next = function() {
      if (this._songsQueuedLength === 0) {
        throw new Error("no more songs available!");
      }
      this._currentSongsIdx++;
      this._songsQueuedLength--;
      console.debug("feed queue: " + this._songs.slice(this._currentSongsIdx, this._songs.length));
      return this._songs[this._currentSongsIdx];
    };
    LastFmSongFeed.prototype._addSong = function(song) {
      this._songs.push(song);
      return this._songsQueuedLength++;
    };
    LastFmSongFeed.prototype._updateFeed = function() {
      throw EOVR;
    };
    return LastFmSongFeed;
  })();
  Model.LastFmLiveSongFeed = (function() {
    __extends(LastFmLiveSongFeed, Model.LastFmSongFeed);
    function LastFmLiveSongFeed(username, lastFmNetwork) {
      var pastSongs;
      this.username = username;
      this.lastFmNetwork = lastFmNetwork;
      LastFmLiveSongFeed.__super__.constructor.call(this);
      this.notEarlierThan = 0;
      pastSongs = this.lastFmNetwork._getPastSongs(this.username);
      if (pastSongs.length > 0) this.notEarlierThan = pastSongs[0].listenedAt + 1;
    }
    LastFmLiveSongFeed.prototype.hasOpenEnd = function() {
      return true;
    };
    LastFmLiveSongFeed.prototype._updateFeed = function() {
      this._mergeNewSongs();
      if (this._songsQueuedLength === 0) {
        this.lastFmNetwork.forceUpdateListeningData(this.username);
        return this._mergeNewSongs();
      }
    };
    LastFmLiveSongFeed.prototype._mergeNewSongs = function() {
      var currentSong, newIdx, newStartIdx, oldIdx, oldIdxPart, oldSongsKept, pastSongs, previousNewIdx, songsToCheck, status;
      status = this.lastFmNetwork.getStatus(this.username);
      if (status === "disabled") return;
      currentSong = status === "live" ? this.lastFmNetwork.getLastSong(this.username) : null;
      if (this._songs.length === 0) {
        if (currentSong != null) this._addSong(currentSong);
        return;
      }
      if (this._songs[this._songs.length - 1] === currentSong) return;
      pastSongs = this.lastFmNetwork._getPastSongs(this.username).slice();
      songsToCheck = pastSongs.reverse();
      while (songsToCheck.length > 0 && songsToCheck[0].listenedAt < this.notEarlierThan) {
        songsToCheck.shift();
      }
      if (status === "live") songsToCheck.push(currentSong);
      if (songsToCheck.length === 0) return;
      oldIdxPart = this._songs.length - 1 - songsToCheck.length;
      oldIdx = oldIdxPart > 0 ? oldIdxPart : 0;
      newIdx = 0;
      console.debug("songsToCheck: " + songsToCheck);
      console.debug("_songs: " + this._songs);
      while (oldIdx < this._songs.length && newIdx !== songsToCheck.length) {
        console.debug("pre-loop: oldIdx: " + oldIdx + ", newIdx: " + newIdx);
        previousNewIdx = newIdx;
        while (newIdx < songsToCheck.length && (this._songs[oldIdx].artist !== songsToCheck[newIdx].artist || this._songs[oldIdx].title !== songsToCheck[newIdx].title)) {
          console.debug("oldIdx: " + oldIdx + ", newIdx: " + newIdx);
          newIdx++;
        }
        if (newIdx === songsToCheck.length) {
          if (previousNewIdx === 0) {
            newIdx = 0;
          } else {
            newIdx = previousNewIdx;
          }
        } else {
          newIdx++;
        }
        oldIdx++;
      }
      while (newIdx < songsToCheck.length) {
        this._addSong(songsToCheck[newIdx]);
        ++newIdx;
      }
      if (this._currentSongsIdx > songsToCheck.length * 10) {
        oldSongsKept = songsToCheck.length * 2;
        newStartIdx = this._currentSongsIdx - oldSongsKept;
        this._songs = this._songs.slice(newStartIdx);
        return this._currentSongsIdx = this._currentSongsIdx - newStartIdx;
      }
    };
    return LastFmLiveSongFeed;
  })();
  Model.LastFmHistoricSongFeed = (function() {
    __extends(LastFmHistoricSongFeed, Model.LastFmSongFeed);
    function LastFmHistoricSongFeed(username, lastFmNetwork, fromTime, toTime) {
      var response;
      this.username = username;
      this.lastFmNetwork = lastFmNetwork;
      this.fromTime = fromTime;
      this.toTime = toTime;
      LastFmHistoricSongFeed.__super__.constructor.call(this);
      response = this._getPage(1);
      if (response === null) throw new Error("listening history disabled");
      this.page = response["@attr"].totalPages;
    }
    LastFmHistoricSongFeed.prototype.hasOpenEnd = function() {
      return false;
    };
    LastFmHistoricSongFeed.prototype._updateFeed = function() {
      var response, track, tracks, _i, _len, _ref, _results;
      if (this.page < 1) return;
      response = this._getPage(this.page);
      if (response === null) return;
      this.page--;
      tracks = (response.track || []).reverse();
      _results = [];
      for (_i = 0, _len = tracks.length; _i < _len; _i++) {
        track = tracks[_i];
        if (!((_ref = track["@attr"]) != null ? _ref.nowplaying : void 0)) {
          _results.push(this._addSong(new Model.Song(track.artist["#text"], track.name, track.date.uts)));
        }
      }
      return _results;
    };
    LastFmHistoricSongFeed.prototype._getPage = function(page) {
      var response;
      response = null;
      try {
        response = LastFmApi.get({
          method: "user.getRecentTracks",
          user: this.username,
          from: this.fromTime,
          to: this.toTime,
          page: page
        });
      }
      catch (e) {
        if (e.code === 4) {
          return null;
        } else {
          throw e;
        }
      }
      return response;
    };
    return LastFmHistoricSongFeed;
  })();
  View = {};
  View.BuddySidebarSection = (function() {
    function BuddySidebarSection(radio, controller) {
      this.radio = radio;
      this.controller = controller;
      this.handleBuddyManagerEvent = __bind(this.handleBuddyManagerEvent, this);
      this.handleRadioEvent = __bind(this.handleRadioEvent, this);
      this.radio.registerListener(this.handleRadioEvent);
      this.radio.buddyManager.registerListener(this.handleBuddyManagerEvent);
      this.init();
    }
    BuddySidebarSection.prototype.handleRadioEvent = function(name, data) {
      if (name === "tunedIn") {
        this._applyStyle(data);
      } else if (name === "nowPlaying" && data.buddy !== data.lastPlayingBuddy) {
        this._applyStyle(data.buddy);
        this._applyStyle(data.lastPlayingBuddy);
      } else if (name === "nobodyPlaying") {
        this._applyStyle(data.lastPlayingBuddy);
      } else if (name === "tunedOut") {
        this._applyStyle(data.buddy);
      } else if (name === "errorTuningIn" && data.reason === "disabled") {
        alert("Can't tune in. " + data.buddy.username + " has disabled access to his song listening data.");
      }
      if (name === "tunedOut" && data.reason === "disabled") {
        return alert("Radio for " + data.buddy.username + " was stopped because the user has disabled access to his song listening data.");
      }
    };
    BuddySidebarSection.prototype._applyStyle = function(buddy) {
      var classes, el;
      if (buddy === null) return;
      el = $("li.sidebar_buddy[rel='" + buddy.network.className + "-" + buddy.username + "']");
      el.removeClass("buddy_nowplaying buddy_feedenabled buddy_live buddy_off buddy_disabled");
      classes = "buddy_" + buddy.listeningStatus;
      if (this.radio.isFeedEnabled(buddy)) classes += " buddy_feedenabled";
      if (this.radio.isOnAir(buddy)) classes += " buddy_nowplaying";
      return el.addClass(classes);
    };
    BuddySidebarSection.prototype.handleBuddyManagerEvent = function(name, data) {
      if (["buddyRemoved", "buddyAdded", "statusChanged", "lastSongChanged", "buddiesLoaded"].indexOf(name) !== -1) {
        return this.refresh();
      }
    };
    BuddySidebarSection.prototype.init = function() {
      var newButton;
      $("head").append("<style type=\"text/css\">\n	.sidebar_buddy a .icon {\n		/* Some icons by Yusuke Kamiyamane. All rights reserved. Licensed under Creative Commons Attribution 3.0. */\n		background: url(data:image/png;base64,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)\n		            no-repeat scroll 0 0 transparent;\n	}\n	.sidebar_buddy a:hover {\n		background-color: #FFDFBF;\n	}\n	.sidebar_buddy a:hover .label {\n		margin-right: 20px;\n	}\n	.sidebar_buddy a:hover .icon.remove {\n		background-position: -16px -16px !important;\n		display: block;\n	}\n	.sidebar_buddy a:active {\n		background-color: #FF8000;\n	}\n	.sidebar_buddy a:active .label {\n		color: #FFFFFF !important;\n	}\n	.sidebar_buddy a:active .icon.remove {\n		background-position: -32px -16px;\n		display: block;\n	}\n	.buddy_nowplaying a .icon {\n		background-position: 0 0 !important;\n	}\n	.buddy_feedenabled a .label {\n		font-weight: bold;\n	}\n	.buddy_live a .label, .buddy_live a:hover .label {\n		color: #FF8000;\n	}\n	.buddy_live a .icon {\n		background-position: -16px 0;\n	}\n	.buddy_off a .label, .buddy_off a:hover .label {\n		color: black;\n	}\n	.buddy_off a .icon {\n		background-position: -32px 0;\n	}\n	.buddy_disabled a .label, .buddy_disabled a:hover .label {\n		color: gray;\n	}\n	.buddy_disabled a .icon {\n		background-position: -48px 0;\n	}\n</style>");
      $("#sidebar .container_inner").append("<div id=\"sidebar_buddyradio_wrapper\" class=\"listWrapper\">\n            <div class=\"divider\" style=\"display: block;\">\n                <span class=\"sidebarHeading\">Buddy Radio</span>\n                <a class=\"sidebarNew\"><span>Add Buddy</span></a>\n            </div>\n            <ul id=\"sidebar_buddyradio\" class=\"link_group\">\n		<li> \n			<span class=\"label ellipsis\">loading...</span>\n		</li>\n	</ul>\n        </div>");
      newButton = $("#sidebar_buddyradio_wrapper .sidebarNew");
      return newButton.click(__bind(function() {
        var onConfirm, position;
        if ($("#buddyradio_newuserform").length === 1) {
          $("#buddyradio_newuserform").remove();
          return;
        }
        position = newButton.offset();
        $("body").append("<div id=\"buddyradio_newuserform\" style=\"position: absolute; top: " + position.top + "px; left: " + (position.left + 20) + "px; display: block;width: 220px; height:40px\" class=\"jjmenu sidebarmenu jjsidebarMenuNew bottomOriented\">\n	<div class=\"jj_menu_item\">\n		<div style=\"width: 100px;float:left\" class=\"input_wrapper\">\n			<div class=\"cap\">\n				<input type=\"text\" id=\"buddyradio_newuser\" name=\"buddy\"> \n			</div>\n		</div>\n		<button id=\"buddyradio_adduserbutton\" type=\"button\" class=\"btn_style1\" style=\"margin: 4px 0 0 5px\">\n			<span>Add Last.fm Buddy</span>\n		</button>\n		\n	</div>\n</div>");
        $("#buddyradio_newuser").focus();
        onConfirm = __bind(function() {
          this.controller.addBuddy("Model.LastFmBuddyNetwork", $("#buddyradio_newuser")[0].value);
          return $("#buddyradio_newuserform").remove();
        }, this);
        $("#buddyradio_adduserbutton").click(onConfirm);
        return $("#buddyradio_newuser").keydown(__bind(function(event) {
          if (event.which === 13) return onConfirm();
        }, this));
      }, this));
    };
    BuddySidebarSection.prototype.refresh = function() {
      var buddy, song, sortedBuddies, status, _i, _len;
      console.debug("refreshing view");
      $("#sidebar_buddyradio").empty();
      sortedBuddies = this.radio.buddyManager.buddies.slice();
      sortedBuddies.sort(function(a, b) {
        if (a.listeningStatus === b.listeningStatus) {
          if (a.username.toLowerCase() < b.username.toLowerCase()) {
            return -1;
          } else {
            return 1;
          }
        } else if (a.listeningStatus === "live") {
          return -1;
        } else if (b.listeningStatus === "live") {
          return 1;
        } else if (a.listeningStatus === "off") {
          return -1;
        } else {
          return 1;
        }
      });
      for (_i = 0, _len = sortedBuddies.length; _i < _len; _i++) {
        buddy = sortedBuddies[_i];
        status = buddy.listeningStatus.toUpperCase();
        if ((status === "LIVE" || status === "OFF") && (buddy.lastSong != null)) {
          song = "" + buddy.lastSong.artist + " - " + buddy.lastSong.title;
          if (status === "LIVE") {
            status += ", listening to: " + song;
          } else if (status === "OFF" && (buddy.lastSong != null)) {
            status += ", last listened to: " + song;
          }
        }
        $("#sidebar_buddyradio").append("<li title=\"" + buddy.username + " (" + buddy.network.name + ") - " + status + "\" rel=\"" + buddy.network.className + "-" + buddy.username + "\" class=\"sidebar_buddy buddy sidebar_link\">\n	<a href=\"\">\n		<span class=\"icon remove\"></span>\n		<span class=\"icon\"></span>\n		<span class=\"label ellipsis\">" + buddy.username + "</span>\n	</a>\n</li>");
        this._applyStyle(buddy);
      }
      $("li.sidebar_buddy .remove").click(__bind(function(event) {
        var entry, networkClassName, username, _ref;
        event.preventDefault();
        event.stopPropagation();
        entry = $(event.currentTarget).parent().parent();
        _ref = entry.attr("rel").split("-"), networkClassName = _ref[0], username = _ref[1];
        return this.controller.removeBuddy(networkClassName, username);
      }, this));
      return $("li.sidebar_buddy").click(__bind(function(event) {
        var networkClassName, username, _ref;
        event.preventDefault();
        _ref = $(event.currentTarget).attr("rel").split("-"), networkClassName = _ref[0], username = _ref[1];
        return this.controller.tune(networkClassName, username);
      }, this));
    };
    return BuddySidebarSection;
  })();
  Controller = {};
  Controller.Radio = (function() {
    function Radio(buddyNetworks, streamingNetworks) {
      this.buddyNetworks = buddyNetworks;
      this.streamingNetworks = streamingNetworks;
      this.radio = new Model.Radio(this.buddyNetworks, this.streamingNetworks);
      this.view = new View.BuddySidebarSection(this.radio, this);
    }
    Radio.prototype.start = function() {
      return this.radio.buddyManager.loadLocal();
    };
    Radio.prototype.addBuddy = function(networkClassName, username) {
      if (networkClassName && username) {
        return this.radio.buddyManager.addBuddy(networkClassName, username);
      }
    };
    Radio.prototype.removeBuddy = function(networkClassName, username) {
      if (networkClassName && username) {
        return this.radio.buddyManager.removeBuddy(this.radio.buddyManager.getBuddy(networkClassName, username));
      }
    };
    Radio.prototype.tune = function(networkClassName, username) {
      if (networkClassName && username) {
        return this.radio.tune(this.radio.buddyManager.getBuddy(networkClassName, username));
      }
    };
    return Radio;
  })();
}).call(this);
