import EventTarget from './simple-events'
import * as firebase from 'firebase/app'
import Peer from 'simple-peer'
import 'firebase/database'

const config = JSON.parse(window.atob([
  'eyJhcGlLZXkiOiJBSXphU3lDeVgtcTFFNH',
  'l4OTl4X1kyR0V5T0xQby1HbG5fVm9tcUki',
  'LCJhdXRoRG9tYWluIjoic29kb2t1LXBhcm',
  'RvLmZpcmViYXNlYXBwLmNvbSIsImRhdGFi',
  'YXNlVVJMIjoiaHR0cHM6Ly9zb2Rva3UtcG',
  'FyZG8uZmlyZWJhc2Vpby5jb20iLCJwcm9q',
  'ZWN0SWQiOiJzb2Rva3UtcGFyZG8iLCJzdG',
  '9yYWdlQnVja2V0Ijoic29kb2t1LXBhcmRv',
  'LmFwcHNwb3QuY29tIiwibWVzc2FnaW5nU2',
  'VuZGVySWQiOiIxMDE1NDIyNDAzMzUzIn0'
].join('')))

firebase.initializeApp(config)
const firebaseDatabase = firebase.database()

function uuidv4 () {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ window.crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  )
}

function getClientID () {
  // used to identify the client
  var clientID = window.localStorage.getItem('clientid')
  if (!clientID) {
    window.localStorage.setItem('clientid', uuidv4())
  }
  return window.localStorage.getItem('clientid')
}

function Networking () {
  /*
   simple 1 on 1 peer connection
   events that fires
    .on("pre-connection")
    .on("connected")
    .on("error")
    .on("network_${event.type}")
   net = Networking()
   net.hotsMatch()
   net.events.on("connected", function () { })
   net.sendEvent("player_died", "data")
   net.events.on("network_player_died", "data")
  */

  this.initialize = function () {
    this.hosting = false
    this.joining = false
    this.waitingConnection = false
    this.peerLinkName = null
    this.peerOfferSent = false
    this.peerAnswerSent = false
    this.connected = false
    this.hostingSignalOffer = null
    this.sendSignalIntervalId = null
    this.events = new EventTarget()
  }

  this.on = function (type, callback) {
    this.events.on(type, callback)
  }

  this.sendSignalInterval = function () {
    this.sendSignalIntervalId = setInterval(() => {
      console.log('Sending offer again')
      if (this.connected) {
        clearInterval(this.sendSignalIntervalId)
      }
      this.databaseRef.set(JSON.stringify(this.hostingSignalOffer))
    }, 4000)
  }

  this.connectionError = function () {
    // reset networking state
    this.hosting = false
    this.joining = false
    this.waitingConnection = false
    this.connected = false
    this.peerOfferSent = false
    this.peerAnswerSent = false
    if (this.databaseRef) { this.databaseRef.off('value') }
    this.peer.destroy()
  }

  this.sendEvent = function (type, data) {
    if (!this.connected) {
      console.log('not connected skipping: ', type)
      return
    }
    this.peer.send(JSON.stringify({ type, data }))
  }

  this.handlePeerData = function (data) {
    data = JSON.parse(data)
    this.events.fire(`network_${data.type}`, data.data)
  }

  this.connectedToServer = function () {
    // connected to server
    this.connected = true
    this.waitingConnection = false
    this.events.fire('connected')
  }

  this.connectFirebaseDatabase = function (name) {
    this.databaseRef = firebaseDatabase.ref('peer-' + name)
    this.databaseRef.on('value', snapshot => {
      this.handleFirebaseUpdate(snapshot)
    })
  }

  this.handleFirebaseUpdate = function (snapshot) {
    // firebase is used to share the signaling from peer
    if (snapshot.val() === '') { return }
    let data
    try {
      data = JSON.parse(snapshot.val())
    } catch (e) {
      return
    }
    // the host ignores the peer offer
    if (data.type === 'offer' && this.hosting) { return }
    // the client ignores the peer answer
    if (data.type === 'answer' && this.joining) { return }
    // skip sending the offer / answer again
    if (this.peerOfferSent && data.type === 'offer') { return }
    if (this.peerAnswerSent && data.type === 'answer') { return }

    this.peerOfferSent = data.type === 'offer'
    this.peerAnswerSent = data.type === 'answer'
    // send the signal to connect
    this.peer.signal(data)
  }

  this.attachPeerEvents = function (peer) {
    peer.on('error', (err) => {
      this.events.fire('error', err)
      this.connectionError()
    })
    peer.on('signal', data => {
      // set signaling value in firebase
      if (!this.hostingSignalOffer && this.hosting && data.type === 'offer') {
        // store the initial offering to re-send if the client misses the first one
        this.hostingSignalOffer = data
      }
      this.databaseRef.set(JSON.stringify(data))
    })
    this.peer.on('connect', () => {
      this.databaseRef.set('')
      this.connectedToServer()
    })
    this.peer.on('data', (data) => {
      this.handlePeerData(data)
    })
  }

  this.hostPeer = function (name) {
    console.log(`hosting peer ${name}`)
    this.waitingConnection = true
    this.hosting = true
    this.peerLinkName = name
    this.events.fire('pre-connection')
    if (this.databaseRef) { this.databaseRef.off('value') }
    this.connectFirebaseDatabase(this.peerLinkName)
    this.databaseRef.set('')
    this.peer = new Peer({ initiator: true, trickle: false })
    this.attachPeerEvents(this.peer)
    this.sendSignalInterval()
  }

  this.joinPeer = function (name) {
    console.log(`joining peer ${name}`)
    this.waitingConnection = true
    this.joining = true
    this.peerLinkName = name
    this.events.fire('pre-connection')
    if (this.databaseRef) { this.databaseRef.off('value') }
    this.connectFirebaseDatabase(this.peerLinkName)
    this.peer = new Peer({ initiator: false, trickle: false })
    this.attachPeerEvents(this.peer)
    // client will read the value already present in the store
    this.databaseRef.ref.once('value').then(snapshot => {
      this.handleFirebaseUpdate(snapshot)
    })
  }
  return this
}

function Mesh () {
  this.initialize = function () {
    this.roomName = null
    this.id = getClientID()
    this.connections = {}
    this.events = new EventTarget()
    this.peerNetworkEventsCallbacks = [
      // [type, callback]
    ]
    // this.connections will hold 1-1 connections index
    // by "id_id" where id is my id  and the other id
    // id_id will be sorted so the one initiating the peer will be the first id
    setInterval(() => {
      this.broadcastEvent('heartbeat', `Love ${this.id}`)
    }, 10000)
  }

  this.attachCallbacksToNewPeer = function (networking) {
    // when a new peer appears
    // attach old events handlers to peer
    this.peerNetworkEventsCallbacks.forEach(({ type, callback }) => {
      this.attachCallbackWithParticipantId(
        networking, type, callback
      )
    })
  }

  this.attachCallbackWithParticipantId = function (networking, type, callback) {
    // attach event handler to peer and wrap to include peer id
    if (!networking.connected) { return }
    networking.on(type, (data) => {
      callback(networking.participantId, data)
    })
  }

  this.on = function (type, callback) {
    if (type.slice(0, 8) === 'network_') {
      for (const key in this.connections) {
        this.attachCallbackWithParticipantId(
          this.connections[key], type, callback
        )
      }
      this.peerNetworkEventsCallbacks.push({ type, callback })
    } else {
      this.events.on(type, callback)
    }
  }

  this.sendPresence = function () {
    if (!this.myRoomRef) { return }
    this.myRoomRef.set(parseInt((new Date()).getTime() / 1000))
  }

  this.attachNetworkingEvents = function (participantId, key, networking) {
    networking.on('network_heartbeat', (data) => {
      console.log(data)
    })

    networking.on('connected', (data) => {
      this.attachCallbacksToNewPeer(networking)
      this.events.fire('connected', {
        participantId: participantId,
        networking: networking
      })
    })

    networking.on('error', (err) => {
      delete this.connections[key]
      this.events.fire('error', {
        participantId: participantId,
        networking: networking,
        error: err
      })
    })
  }
  this.whisperEvent = function (participantId, type, data) {
    const key = this.getKey(participantId)
    this.connections[key].sendEvent(type, data)
  }
  this.broadcastEvent = function (type, data) {
    for (const key in this.connections) {
      this.connections[key].sendEvent(type, data)
    }
  }

  this.hostPeer = function (participantId) {
    const key = this.getKey(participantId)
    if (this.connections[key]) { return }
    this.connections[key] = new Networking()
    this.connections[key].participantId = participantId
    this.connections[key].initialize()
    this.attachNetworkingEvents(participantId, key, this.connections[key])
    this.connections[key].hostPeer(key)
  }

  this.joinPeer = function (participantId) {
    const key = this.getKey(participantId)
    if (this.connections[key]) { return }
    this.connections[key] = new Networking()
    this.connections[key].participantId = participantId
    this.connections[key].initialize()
    this.attachNetworkingEvents(participantId, key, this.connections[key])
    setTimeout(() => {
      // give some time to the other peer to create the link
      // then try to join
      this.connections[key].joinPeer(key)
    }, 1000)
  }

  this.roomUpdate = function (participants) {
    // { partipantid: seconds }
    if (participants === 'sync') {
      return this.sendPresence()
    }
    console.log('Participants', participants)
    const participantsIds = Object.keys(participants)
    participantsIds.forEach((participantId) => {
      if (participantId > this.id) {
        // My id is smaller I should host a peer link
        this.hostPeer(participantId)
      } else if (participantId < this.id) {
        // My id is bigger I should connect to a peer link
        this.joinPeer(participantId)
      }
    })
  }

  this.disconnectRoom = function () {
    if (this.myRoomRef) {
      this.myRoomRef.off('value')
    }
    if (this.roomRef) {
      this.roomRef.off('value')
    }
  }

  this.joinRoom = function (name) {
    this.disconnectRoom()
    this.roomName = name
    this.myRoomRef = firebaseDatabase.ref(`room/${this.roomName}/${this.id}`)
    this.roomRef = firebaseDatabase.ref(`room/${this.roomName}`)
    this.roomRef.set('sync')
    this.roomRef.on('value', snapshot => {
      this.roomUpdate(snapshot.val() || {})
    })
  }

  this.getKey = function (participantId) {
    if (participantId > this.id) {
      // My id is smaller I should host a peer link
      return `${this.id}_${participantId}`
    } else if (participantId < this.id) {
      // My id is bigger I should connect to a peer link
      return `${participantId}_${this.id}`
    }
  }
}

export { Mesh, Networking }
