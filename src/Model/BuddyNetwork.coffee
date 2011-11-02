# Copyright (c) 2011 Maik Riechert
# Licensed under the GNU General Public License v3
# License available at http://www.gnu.org/licenses/gpl-3.0.html

# only a buddy gets a network and uses it (no one else calls it's methods!)
# exception: getBuddies() is called from BuddyManager to import existing buddies/friends
class Model.BuddyNetwork
	name: "Network Name" # used in links etc.
	className: "Model.XYZBuddyNetwork"
	isValid: (buddyId) -> throw EOVR
	getStatus: (buddyId) -> throw EOVR # live | off | disabled
	getInfo: (buddyId) -> throw EOVR
	getLastSong: (buddyId) -> throw EOVR
	getLiveFeed: (buddyId) -> throw EOVR
	# getHistoricFeed: (buddyId, from, to) # from, to = Date objects; implement in sub class if supported
	# hasHistoricData: (buddyId, date) # date = Date object; implement if getHistoricFeed() is implemented
	getBuddies: (buddyId) -> throw EOVR # returns array of buddyId's
	registerListener: (listener, buddyId) -> throw EOVR
	removeListener: (listener, buddyId) -> throw EOVR