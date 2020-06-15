// https://developer.mozilla.org/en-US/docs/Web/API/EventTarget
var EventTarget = function () {
  this.listeners = {}
}

EventTarget.prototype.listeners = null
EventTarget.prototype.on = function (type, callback) {
  if (!(type in this.listeners)) {
    this.listeners[type] = []
  }
  this.listeners[type].push(callback)
}

EventTarget.prototype.off = function (type, callback) {
  if (!(type in this.listeners)) {
    return
  }
  var stack = this.listeners[type]
  for (var i = 0, l = stack.length; i < l; i++) {
    if (stack[i] === callback) {
      stack.splice(i, 1)
      return
    }
  }
}

EventTarget.prototype.fire = function (type, data) {
  if (!(type in this.listeners)) {
    return true
  }
  var stack = this.listeners[type].slice()

  for (var i = 0, l = stack.length; i < l; i++) {
    stack[i].call(this, data)
  }
}

export default EventTarget
