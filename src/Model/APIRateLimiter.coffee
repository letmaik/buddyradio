# see http://stackoverflow.com/questions/667508/whats-a-good-rate-limiting-algorithm

class Model.APIRateLimiter
	# rate in messages, per in seconds
	constructor: (@rate, per) ->
		@per = per*1000
		@_allowance = @rate
		@_lastCount = Date.now()
	
	# count a new sent message
	count: () -> 
		current = Date.now()
		timePassed = current - @_lastCount
		@_lastCount = current
		@_allowance+= timePassed * (@rate / @per)
		if @_allowance > @rate
			@_allowance = @rate
		if @_allowance < 1
			console.error("API rate limit exceeded! always check with canSend() before!!")
		@_allowance-= 1
	
	canSend: () ->
		current = Date.now()
		timePassed = current - @_lastCount
		newAllowance = @_allowance + timePassed * (@rate / @per)
		newAllowance >= 1