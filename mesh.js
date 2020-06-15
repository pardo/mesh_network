import './square.css'
import { Mesh } from './networking.js'

const throttle = (func, limit) => {
  let inThrottle
  return function () {
    const args = arguments
    const context = this
    if (!inThrottle) {
      func.apply(context, args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}

function clearLocalStorage () {
  var lastTime = window.localStorage.getItem('lastTime')
  if (!lastTime) {
    window.localStorage.setItem('lastTime', (new Date()).toISOString())
  } else {
    var timeDiff = (new Date()) - (new Date(lastTime))
    var twoDays = 1000 * 60 * 60 * 24 * 2
    if (timeDiff > twoDays) {
      window.localStorage.clear()
    }
  }
}
clearLocalStorage()

function getName (getNameCallback) {
  // used to identify the client
  var myname = window.localStorage.getItem('myname')
  if (!myname) {
    window.localStorage.setItem('myname', getNameCallback())
  }
  return window.localStorage.getItem('myname')
}

function MeshTest () {
  this.initialize = function (container) {
    // networking
    this.container = container
    this.roomName = null
    this.names = {}
    this.mesh = new Mesh()
    this.mesh.initialize()
    this.attachUIEvents()
    setInterval(() => {
      this.log()
    }, 1000)
    this.attachEvents()
  }

  this.attachUIEvents = function () {
    window.document.querySelector('#connect').addEventListener('click', (e) => {
      this.connect()
    })
  }

  this.connect = function () {
    this.myName = getName(() => {
      return window.prompt('Your name?').replace(/[^A-Za-z0-9]/g, '')
    })
    this.roomName = window.prompt('Room name?').replace(/[^a-z0-9]/g, '')
    this.names[this.mesh.id] = this.myName
    this.mesh.joinRoom(this.roomName)
  }

  this.log = function () {
    if (!this.mesh.connected) { return }
    let data = ''
    data += `<div>My ID: ${this.myName} ${this.mesh.id}</div>`
    for (const key in this.mesh.connections) {
      const name = this.names[key] || key
      data += `<div>${name} = ${this.mesh.connections[key].connected}</div>`
    }
    document.getElementById('connections').innerHTML = data
  }

  this.attachEvents = function () {
    this.mesh.on('connected', (data) => {
      // another one connected
      this.mesh.whisperEvent(data.participantId, 'name', this.myName)
    })

    this.mesh.on('network_name', (participantId, name) => {
      this.names[participantId] = name
    })
    this.mesh.on('network_mousemove', (participantId, position) => {
      this.renderMouse(participantId, position[0], position[1])
    })
    document.getElementById('square').addEventListener('mousemove',
      throttle((evt) => {
        this.mesh.broadcastEvent('mousemove', [evt.offsetX, evt.offsetY])
      }, 33)
    )
  }

  this.renderMouse = function (participantId, x, y) {
    let element = document.getElementById(participantId)
    if (!element) {
      element = document.createElement('div')
      element.className = 'mouse'
      element.innerText = this.names[participantId]
      element.id = participantId
      document.getElementById('square').appendChild(element)
    }
    element.style.left = `${x}px`
    element.style.top = `${y}px`
  }
}

const game = new MeshTest()

window.addEventListener('load', function () {
  var container = document.getElementById('mount-point')
  game.initialize(container)
})

export default () => {}
