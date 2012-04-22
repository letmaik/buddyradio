# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

class View.GroovesharkV2
	constructor: (@controller) ->
		@radio = @controller.radio
		@radio.registerListener(@handleRadioEvent)
		@radio.buddyManager.registerListener(@handleBuddyManagerEvent)
		@init()
		
		# don't know of any better method
		@_cprInProgress = false
		$(document).bind("DOMNodeRemoved", (e) =>
			# can't check for e.target.id, because 'sidebar_buddyradio_wrapper' never appears
			if $("#sidebar_buddyradio_wrapper").length == 0 and $("#sidebar_pinboard").length == 1 and not @_cprInProgress
				@_cprInProgress = true
				hold(1000)
				@init()
				@refresh()
				@_cprInProgress = false
		)
		
	handleRadioEvent: (name, data) =>
		if name == "tunedIn"
			@_applyStyle(data)
		else if name == "nowPlaying" and data.buddy != data.lastPlayingBuddy
			@_applyStyle(data.buddy)
			@_applyStyle(data.lastPlayingBuddy)
		else if name == "nobodyPlaying"
			@_applyStyle(data.lastPlayingBuddy)
		else if name == "tunedOut"
			@_applyStyle(data.buddy)
		else if name == "errorTuningIn" and data.reason == "disabled"
			alert("Can't tune in. #{data.buddy.username} has disabled access to his song listening data.")
		if name == "tunedOut" and data.reason == "disabled"
			alert("Radio for #{data.buddy.username} was stopped because the user has disabled access to his song listening data.")
	
	handleBuddyManagerEvent: (name, data) =>
		if ["buddyRemoved", "buddyAdded", "statusChanged", "lastSongChanged", "buddiesLoaded"].indexOf(name) != -1
			@refresh()
		if name == "buddyNotAdded"
			if data.reason == "notFound"
				alert("The buddy with username #{data.username} couldn't be found.")
	
	_applyStyle: (buddy) ->
		if not buddy?
			return
		el = $("a.sidebar_buddy[rel='#{buddy.network.className}:#{buddy.username}']")
		el.removeClass("buddy_nowplaying buddy_feedenabled buddy_feedenabled_historic buddy_live buddy_off buddy_disabled")
		classes = "buddy_#{buddy.listeningStatus}"
		if @radio.isFeedEnabled(buddy)
			classes += " buddy_feedenabled"
			if @radio.getFeedType(buddy) == "historic"
				classes += " buddy_feedenabled_historic"
		if @radio.isOnAir(buddy)
			classes += " buddy_nowplaying"
		el.addClass(classes)
		
	init: () ->
		$("head").append("""
		<style type="text/css">
			#sidebar_buddyradio_wrapper {
				display: block;
			}
			.buddyradio_overlay {
				background: none repeat scroll 0 0 #F5F5F5;
				border: 1px solid rgba(0, 0, 0, 0.25);
				border-radius: 3px 3px 3px 3px;
				padding: 5px;
				color: black;
				max-height: 325px;
				overflow-x: hidden;
				overflow-y: auto;
				position: absolute;
				z-index: 9999;
			}
			a.sidebar_buddy .icon {
				/* Some icons by Yusuke Kamiyamane. All rights reserved. Licensed under Creative Commons Attribution 3.0. */
				background: url(data:image/png;base64,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)
				            no-repeat scroll 0 0 transparent;
			}
			a.sidebar_buddy .icon:hover, a.sidebar_buddy.buddy_nowplaying.buddy_feedenabled_historic .icon:hover {
				background-position: -64px 0 !important;
			}
			a.sidebar_buddy:hover .label {
				margin-right: 20px;
			}
			a.sidebar_buddy:hover .icon.remove {
				background-position: -48px -16px !important;
				display: block;
			}
			a.sidebar_buddy:hover .icon.remove:hover {
				background-position: -64px -16px !important;
				display: block;
			}
			a.buddy_nowplaying .icon {
				background-position: 0 0 !important;
			}
			a.buddy_nowplaying.buddy_feedenabled_historic .icon {
				background-position: -80px -16px !important;
			}
			a.buddy_feedenabled.buddy_feedenabled_historic .icon {
				background-position: -80px 0;
			}
			a.buddy_feedenabled .label {
				font-weight: bold;
			}
			a.buddy_live .label, a.buddy_live:hover .label {
				color: #FF8000;
			}
			a.buddy_live .icon {
				background-position: -16px 0;
			}
			a.buddy_off .label, a.buddy_off:hover .label {
				color: black;
			}
			a.buddy_off .icon {
				background-position: -32px 0;
			}
			a.buddy_disabled .label, a.buddy_disabled:hover .label {
				color: gray;
			}
			a.buddy_disabled .icon {
				background-position: -48px 0;
			}
		</style>
		""")
	
		$("#sidebar_pinboard .overview").append("""
		<a id="sidebar_buddyradio_divider" class="sidebar_pin_divider">
			<span class="sidebar_pin_collapse"></span>
			<span class="sidebar_pin_heading">Buddy Radio</span>
		</a>
		<div id="sidebar_buddyradio_wrapper" class="sidebar_pin_group">
            <div id="sidebar_buddyradio" class="link_group">
				<span class="buddyradio_users">
					<span class="label ellipsis">loading...</span>
				</span>				
				<a class="sidebar_link" id="buddyradio_addLink">
					<span class="label">Add...</span>
				</a>
				<a class="sidebar_link" id="buddyradio_settingsLink">
					<span class="label">Settings</span>
				</a>
			</div>	
        </div>
		""")
		newButton = $("#buddyradio_addLink")
		newButton.click( () =>
			if $("#buddyradio_newuserform").length == 1
				$("#buddyradio_newuserform").remove()
				return
				
			position = newButton.offset()
			$("body").append("""
			<div id="buddyradio_newuserform" style="position: absolute; top: #{position.top+20}px; left: #{position.left+20}px; display: block;width: auto; height: 80px;" class="jjmenu">
				<div class="jj_menu_item">
					<div style="width: 100px;float:left" class="input_wrapper">
						<div class="cap">
							<input type="text" id="buddyradio_newuser" name="buddy" /> 
						</div>
					</div>
					<button id="buddyradio_adduserbutton" type="button" class="btn_style1" style="margin: 4px 0 0 5px">
						<span>Add Last.fm Buddy</span>
					</button>
				</div>
				<div class="jj_menu_item" style="clear:both">
					<div class="input_wrapper" style="width: 100px; float: left;">
						<div class="cap">
							<input type="text" name="buddy" id="buddyradio_importusers"> 
						</div>
					</div>
					<button style="margin: 4px 0pt 0pt 5px;" class="btn_style1" type="button" id="buddyradio_importusersbutton">
						<span>Import my Last.fm Buddies</span>
					</button>
					
				</div>
			</div>
			""")
			$("#buddyradio_newuser").focus()
			onConfirmAddBuddy = () =>
				$("#buddyradio_adduserbutton span").html("Adding Buddy...")
				@controller.addBuddy("Model.LastFmBuddyNetwork", $("#buddyradio_newuser")[0].value)
				$("#buddyradio_newuserform").remove()
			$("#buddyradio_adduserbutton").click(onConfirmAddBuddy)
			$("#buddyradio_newuser").keydown((event) =>
				if event.which == 13
					onConfirmAddBuddy()
			)
			onConfirmImportBuddies = () =>
				username = $("#buddyradio_importusers")[0].value
				if not username
					alert("You need to enter the user name from which you want to import the Last.fm buddies.")
					return
				$("#buddyradio_importusersbutton span").html("Importing Buddies...")
				result = @controller.importBuddies("Model.LastFmBuddyNetwork", username)
				if result.error == "invalid_user"
					alert("The user name you entered doesn't exist on Last.fm!")
				$("#buddyradio_newuserform").remove()
			$("#buddyradio_importusersbutton").click(onConfirmImportBuddies)
			$("#buddyradio_importusers").keydown((event) =>
				if event.which == 13
					onConfirmImportBuddies()
			)
		)
		$("#buddyradio_settingsLink").click( () =>
			if $("#buddyradio_settingsform").length == 1
				$("#buddyradio_settingsform").remove()
				return
				
			position = $("#buddyradio_settingsLink").offset()
			
			songsPerFeedInARowValues = [1,2,3,4,5,10,15,20,30,40,50,100]
			optionsSongsPerFeed = @_constructOptions(songsPerFeedInARowValues, @radio.getSongsPerFeedInARow())
			
			optionsPreload = @_constructOptions([0..5], @radio.getPreloadCount())
			
			$("body").append("""
			<div id="buddyradio_settingsform" style="position: absolute; top: #{position.top+20}px; left: #{position.left+20}px; display: block;width: 310px" class="buddyradio_overlay">
				<div>
					Play 
					<select name="songsPerFeedInARow">
						#{optionsSongsPerFeed}
					</select>
					song/s in a row from same buddy
				</div>
				<div style="margin-top: 5px">
					Preload
					<select name="preloadCount">
						#{optionsPreload}
					</select>
					song/s when playing historic radio
				</div>
				<div style="padding-top:10px">
					<button type="button" class="btn_style1">
						<span>Apply</span>
					</button>					
				</div>
				<div style="margin-top:10px; float:right; text-align:right">
					BuddyRadio v0.3.1<br />
					<a href="http://neothemachine.github.com/buddyradio" target="_blank">Project Page</a>
				</div>
			</div>
			""")
			$("#buddyradio_settingsform button").click(() =>
				songsPerFeed = $("#buddyradio_settingsform select[name=songsPerFeedInARow]")[0].value
				preloadCount = $("#buddyradio_settingsform select[name=preloadCount]")[0].value		
				@controller.setSongsPerFeedInARow(parseInt(songsPerFeed))
				@controller.setPreloadCount(parseInt(preloadCount))
				$("#buddyradio_settingsform").remove()
			)
		)
	
	_constructOptions: (options, selected = null) ->
		options.map((n) ->
			sel = if selected == n then " selected" else ""
			"<option value=\"#{n}\"#{sel}>#{n}</option>"
		).join()
		
	refresh: () ->
		console.debug("refreshing view")
		$("#sidebar_buddyradio .buddyradio_users").empty()
		sortedBuddies = @radio.buddyManager.buddies.slice() # clone array
		sortedBuddies.sort((a, b) ->
			if a.listeningStatus == b.listeningStatus
				if a.username.toLowerCase() < b.username.toLowerCase() then -1 else 1
			else if a.listeningStatus == "live"
				-1
			else if b.listeningStatus == "live"
				1
			else if a.listeningStatus == "off"
				-1
			else
				1
		)
		(
			status = buddy.listeningStatus.toUpperCase()
			if (status == "LIVE" or status == "OFF") and buddy.lastSong?
				song = "#{buddy.lastSong.artist} - #{buddy.lastSong.title}"
				if status == "LIVE"
					status += ", listening to: #{song}"
				else if status == "OFF" and buddy.lastSong?
					status += ", last listened to: #{song}"
			$("#sidebar_buddyradio .buddyradio_users").append("""
				<a rel="#{buddy.network.className}:#{buddy.username}" class="sidebar_buddy buddy sidebar_link">
					<span class="icon remove"></span>
					<span class="icon more"></span>
					<span class="label ellipsis" title="#{buddy.username} (#{buddy.network.name}) - #{status}">#{buddy.username}</span>
				</a>
			""")
			@_applyStyle(buddy)
		) for buddy in sortedBuddies
		
		$("a.sidebar_buddy .more").click((event) =>
			event.preventDefault()
			event.stopPropagation()
			entry = $(event.currentTarget).parent()
			[networkClassName, username] = entry.attr("rel").split(":")
			@_showMoreMenu(networkClassName, username)
		)
		$("a.sidebar_buddy .remove").click((event) =>
			event.preventDefault()
			event.stopPropagation()
			[networkClassName, username] = $(event.currentTarget).parent().attr("rel").split(":")
			@controller.removeBuddy(networkClassName, username)
		)
		$("a.sidebar_buddy").click((event) =>
			event.preventDefault()
			[networkClassName, username] = $(event.currentTarget).attr("rel").split(":")
			@controller.tune(networkClassName, username)
		)
	
	_currentlyOpenedMenu: null
	
	_showMoreMenu: (networkClassName, username) =>
		buddy = @controller.getBuddy(networkClassName, username)
		if $("#buddyradio_more").length == 1
			$("#buddyradio_more").remove()
			if @_currentlyOpenedMenu == buddy
				@_currentlyOpenedMenu = null
				return
		@_currentlyOpenedMenu = buddy
		position = $("a.sidebar_buddy[rel='#{networkClassName}:#{username}'] .more").offset()
		if not position?
			return
		
		feedInfo = ""
		if @radio.isFeedEnabled(buddy)
			feedType = @radio.getFeedType(buddy)
			feedInfo = """
				<div style="margin-bottom:10px">Tuned into <strong>#{feedType}</strong> radio.<br />
			"""
			if feedType == "historic"
				feedInfo += "#{@radio.getAlreadyFeededCount(buddy)} of #{@radio.getTotalCountForHistoricFeed(buddy)} songs enqueued so far."
			else
				feedInfo += "#{@radio.getAlreadyFeededCount(buddy)} songs enqueued so far."
			feedInfo += "</div>"
				
		$("body").append("""
		<div id="buddyradio_more" style="position: absolute; top: #{position.top+20}px; left: #{position.left+20}px; display: block;width: 260px" class="buddyradio_overlay">
			#{feedInfo}
			<div class="buttons">
				<img style="float:left; padding-right:10px;" src="#{buddy.avatarUrl}" />
				<button type="button" class="btn_style1 viewprofile">
					<span>View Profile on #{buddy.network.name}</span>
				</button>
			</div>
		</div>
		""")
		$("#buddyradio_more button.viewprofile").click(() =>
			# FIXME scrolls current page to top, why??
			window.open(buddy.profileUrl)
			$("#buddyradio_more").remove()
			@_currentlyOpenedMenu = null
		)
		
		if buddy.supportsHistoricFeed()
			$("#buddyradio_more div.buttons").append("""
				<button style="margin-top: 5px" type="button" class="btn_style1 fetchlastweek">
					<span>Listen previously played songs</span>
				</button>
			""")
			$("#buddyradio_more").append("""
				<div class="lastweekdata" style="clear:both"></div>
			""")
			$("#buddyradio_more button.fetchlastweek").click(() =>
				$("#buddyradio_more button.fetchlastweek span").html("Checking last week's songs...")
				# check last 7 days for song data
				el = $("#buddyradio_more .lastweekdata")
				today = new Date()
				todaysDay = today.getDate()
				(
					date = new Date(today.getFullYear(), today.getMonth(), day)
					if buddy.hasHistoricData(date)
						
						# TODO read out song count of that day and display it here: "Listen 123 songs from.."
						
						el.append("""
						<a rel="#{date.getTime()}">Listen songs from #{date.toDateString()}</a><br />
						""")
					else
						el.append("No songs played #{date.toDateString()}<br />")
				) for day in [todaysDay...todaysDay-7]
			
				$("#buddyradio_more button.fetchlastweek").remove()
				$("#buddyradio_more .lastweekdata a").click((event) =>
					$("#buddyradio_more").remove()
					from = new Date(parseInt($(event.currentTarget).attr("rel")))
					to = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 23, 59, 59)
					@controller.tuneHistoric(networkClassName, username, from, to)					
				)
			)