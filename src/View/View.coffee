View = {}

class View.BuddySidebarSection
	constructor: (@controller) ->
		@radio = @controller.radio
		@radio.registerListener(@handleRadioEvent)
		@radio.buddyManager.registerListener(@handleBuddyManagerEvent)
		@init()
		
		# don't know of any better method
		@_cprInProgress = false
		@_lifesLeft = 9
		$(document).bind("DOMNodeRemoved", (e) =>
			# can't check for e.target.id, because 'sidebar_buddyradio_wrapper' never appears
			if $("#sidebar_buddyradio_wrapper").length == 0 and not @_cprInProgress and @_lifesLeft > 0
				@_cprInProgress = true
				console.warn("OMG! We were killed!")
				hold(1000)
				@_lifesLeft--
				console.warn("Phew... #{@_lifesLeft} lifes left")
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
		el = $("li.sidebar_buddy[rel='#{buddy.network.className}-#{buddy.username}']")
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
			#sidebar_buddyradio_wrapper .divider .sidebarHeading a {
				display: none;
			}
			#sidebar_buddyradio_wrapper .divider:hover .sidebarHeading a {
				display: inline;
			}
			.buddyradio_overlay {
				background: none repeat scroll 0 0 #FFFFFF;
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
			.sidebar_buddy a .icon {
				/* Some icons by Yusuke Kamiyamane. All rights reserved. Licensed under Creative Commons Attribution 3.0. */
				background: url(data:image/png;base64,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)
				            no-repeat scroll 0 0 transparent;
			}
			.sidebar_buddy a .icon:hover, .sidebar_buddy.buddy_nowplaying.buddy_feedenabled_historic a .icon:hover {
				background-position: -64px 0 !important;
			}
			.sidebar_buddy a:hover {
				background-color: #FFDFBF;
			}
			.sidebar_buddy a:hover .label {
				margin-right: 20px;
			}
			.sidebar_buddy a:hover .icon.remove {
				background-position: -16px -16px !important;
				display: block;
			}
			.sidebar_buddy a:active {
				background-color: #FF8000;
			}
			.sidebar_buddy a:active .label {
				color: #FFFFFF !important;
			}
			.sidebar_buddy a:active .icon.remove {
				background-position: -32px -16px !important;
				display: block;
			}
			.buddy_nowplaying a .icon {
				background-position: 0 0 !important;
			}
			.buddy_nowplaying.buddy_feedenabled_historic a .icon {
				background-position: -80px -16px !important;
			}
			.buddy_feedenabled.buddy_feedenabled_historic a .icon {
				background-position: -80px 0;
			}
			.buddy_feedenabled a .label {
				font-weight: bold;
			}
			.buddy_live a .label, .buddy_live a:hover .label {
				color: #FF8000;
			}
			.buddy_live a .icon {
				background-position: -16px 0;
			}
			.buddy_off a .label, .buddy_off a:hover .label {
				color: black;
			}
			.buddy_off a .icon {
				background-position: -32px 0;
			}
			.buddy_disabled a .label, .buddy_disabled a:hover .label {
				color: gray;
			}
			.buddy_disabled a .icon {
				background-position: -48px 0;
			}
		</style>
		""")
	
		$("#sidebar .container_inner").append("""
		<div id="sidebar_buddyradio_wrapper" class="listWrapper">
            <div class="divider" style="display: block;">
                <span class="sidebarHeading">Buddy Radio
					<a id="buddyradio_settingsLink">Settings</a>
				</span>
                <a class="sidebarNew"><span>Add Buddy</span></a>
            </div>
            <ul id="sidebar_buddyradio" class="link_group">
				<li> 
					<span class="label ellipsis">loading...</span>
				</li>
			</ul>
        </div>
		""")
		newButton = $("#sidebar_buddyradio_wrapper .sidebarNew")
		newButton.click( () =>
			if $("#buddyradio_newuserform").length == 1
				$("#buddyradio_newuserform").remove()
				return
				
			position = newButton.offset()
			$("body").append("""
			<div id="buddyradio_newuserform" style="position: absolute; top: #{position.top}px; left: #{position.left+20}px; display: block;width: 255px; height: 80px;" class="jjmenu">
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
				
			position = newButton.offset()
			
			songsPerFeedInARowValues = [1,2,3,4,5,10,15,20,30,40,50,100]
			optionsSongsPerFeed = @_constructOptions(songsPerFeedInARowValues, @radio.getSongsPerFeedInARow())
			
			optionsPreload = @_constructOptions([0..5], @radio.getPreloadCount())
			
			$("body").append("""
			<div id="buddyradio_settingsform" style="position: absolute; top: #{position.top}px; left: #{position.left+20}px; display: block;width: 310px" class="buddyradio_overlay">
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
		$("#sidebar_buddyradio").empty()
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
			$("#sidebar_buddyradio").append("""
				<li rel="#{buddy.network.className}-#{buddy.username}" class="sidebar_buddy buddy sidebar_link">
					<a href="">
						<span class="icon remove"></span>
						<span class="icon more"></span>
						<span class="label ellipsis" title="#{buddy.username} (#{buddy.network.name}) - #{status}">#{buddy.username}</span>
					</a>
				</li>
			""")
			@_applyStyle(buddy)
		) for buddy in sortedBuddies
		
		$("li.sidebar_buddy .more").click((event) =>
			event.preventDefault()
			event.stopPropagation()
			entry = $(event.currentTarget).parent().parent()
			[networkClassName, username] = entry.attr("rel").split("-")
			@_showMoreMenu(networkClassName, username)
		)
		$("li.sidebar_buddy .remove").click((event) =>
			event.preventDefault()
			event.stopPropagation()
			entry = $(event.currentTarget).parent().parent()
			[networkClassName, username] = entry.attr("rel").split("-")
			@controller.removeBuddy(networkClassName, username)
		)
		$("li.sidebar_buddy").click((event) =>
			event.preventDefault()
			[networkClassName, username] = $(event.currentTarget).attr("rel").split("-")
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
		position = $("li.sidebar_buddy[rel='#{networkClassName}-#{username}'] .more").offset()
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
		<div id="buddyradio_more" style="position: absolute; top: #{position.top}px; left: #{position.left+20}px; display: block;width: 260px" class="buddyradio_overlay">
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