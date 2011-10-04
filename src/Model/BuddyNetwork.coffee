# only a buddy gets a network and uses it (no one else calls it's methods!)
class Model.BuddyNetwork
	name: "Network Name" # used in links etc.
	className: "Model.XYZBuddyNetwork"
	isValid: (buddyId) -> throw EOVR
	getStatus: (buddyId) -> throw EOVR # live | off | disabled
	getInfo: (buddyId) -> throw EOVR
	getLastSong: (buddyId) -> throw EOVR
	getLiveFeed: (buddyId) -> throw EOVR
	# getHistoricFeed: (buddyId, fromTime, toTime) - implement in sub class if supported
	registerListener: (listener, buddyId) -> throw EOVR
	removeListener: (listener, buddyId) -> throw EOVR