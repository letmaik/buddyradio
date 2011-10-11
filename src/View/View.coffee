View = {}

# TODO Feature idea: make the orange station icon glow when a song from the particular buddy is played
#      -> this is esp. useful when multiple buddies are listened to

class View.BuddySidebarSection
	constructor: (@radio, @controller) ->
		@radio.registerListener(@handleRadioEvent)
		@radio.buddyManager.registerListener(@handleBuddyManagerEvent)
		@init()
		
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
	
	_applyStyle: (buddy) ->
		if buddy == null
			return
		el = $("li.sidebar_buddy[rel='#{buddy.network.className}-#{buddy.username}']")
		el.removeClass("buddy_nowplaying buddy_feedenabled buddy_live buddy_off buddy_disabled")
		classes = "buddy_#{buddy.listeningStatus}"
		if @radio.isFeedEnabled(buddy)
			classes += " buddy_feedenabled"
		if @radio.isOnAir(buddy)
			classes += " buddy_nowplaying"
		el.addClass(classes)
		
	handleBuddyManagerEvent: (name, data) =>
		if ["buddyRemoved", "buddyAdded", "statusChanged", "lastSongChanged", "buddiesLoaded"].indexOf(name) != -1
			@refresh()	
		
	init: () ->
		$("head").append("""
		<style type="text/css">
			.sidebar_buddy a .icon {
				/* Some icons by Yusuke Kamiyamane. All rights reserved. Licensed under Creative Commons Attribution 3.0. */
				background: url(data:image/png;base64,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)
				            no-repeat scroll 0 0 transparent;
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
				background-position: -32px -16px;
				display: block;
			}
			.buddy_nowplaying a .icon {
				background-position: 0 0 !important;
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
                <span class="sidebarHeading">Buddy Radio</span>
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
			<div id="buddyradio_newuserform" style="position: absolute; top: #{position.top}px; left: #{position.left+20}px; display: block;width: 220px; height:40px" class="jjmenu sidebarmenu jjsidebarMenuNew bottomOriented">
				<div class="jj_menu_item">
					<div style="width: 100px;float:left" class="input_wrapper">
						<div class="cap">
							<input type="text" id="buddyradio_newuser" name="buddy"> 
						</div>
					</div>
					<button id="buddyradio_adduserbutton" type="button" class="btn_style1" style="margin: 4px 0 0 5px">
						<span>Add Last.fm Buddy</span>
					</button>
					
				</div>
			</div>
			""")
			$("#buddyradio_newuser").focus()
			onConfirm = () =>
				@controller.addBuddy("Model.LastFmBuddyNetwork", $("#buddyradio_newuser")[0].value)
				$("#buddyradio_newuserform").remove()
			$("#buddyradio_adduserbutton").click(onConfirm)
			$("#buddyradio_newuser").keydown((event) =>
				if event.which == 13
					onConfirm()
			)
		)
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
				<li title="#{buddy.username} (#{buddy.network.name}) - #{status}" rel="#{buddy.network.className}-#{buddy.username}" class="sidebar_buddy buddy sidebar_link">
					<a href="">
						<span class="icon remove"></span>
						<span class="icon"></span>
						<span class="label ellipsis">#{buddy.username}</span>
					</a>
				</li>
			""")
			@_applyStyle(buddy)
		) for buddy in sortedBuddies
		
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