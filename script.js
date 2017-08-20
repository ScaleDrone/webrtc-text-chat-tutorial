const roomHash = 'test';

// TODO: Replace with your own channel ID
const drone = new ScaleDrone('63o6Zfoz6yeAcJDG');
// Room name needs to be prefixed with 'observable-'
const roomName = 'observable-' + roomHash;
const configuration = {
  iceServers: [{
    url: 'stun:stun.l.google.com:19302'
  }]
};
let room;
let localConnection;
let remoteConnection;

drone.on('open', error => {
  if (error) {
    return console.error(error);
  }
  room = drone.subscribe(roomName);
  room.on('open', error => {
    console.log('Connected to signaling server');
    if (error) {
      console.error(error);
    }
  });
  // We're connected to the room and received an array of 'members'
  // connected to the room (including us). Signaling server is ready.
  room.on('members', members => {
    console.log('Connected members in signaling server room', members);
    // If we are the second user to connect to the room we will be creating the offer
    const isOfferer = members.length === 2;
    startWebRTC(isOfferer);
  });
});

// Send signaling data via Scaledrone
function sendSignalingMessage(message) {
  drone.publish({
    room: roomName,
    message
  });
}

function startWebRTC(isOfferer) {
  localConnection = new RTCPeerConnection(configuration);

  // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
  // message to the other peer through the signaling server
  localConnection.onicecandidate = event => {
    if (event.candidate) {
      sendSignalingMessage({'candidate': event.candidate});
    }
  };

  // If user is offerer let the 'negotiationneeded' event create the offer
  if (isOfferer) {
    localConnection.onnegotiationneeded = () => {
      localConnection.createOffer(localDescCreated, error => console.error(error));
    }
  }

  const localToRemoteChannel = localConnection.createDataChannel('localToRemote');
  localToRemoteChannel.onopen = function() {
    console.log('OPEN', arguments);
  }
  localToRemoteChannel.onclose = function() {
    console.log('CLOSE', arguments);
  }

  remoteConnection = new RTCPeerConnection(configuration);
  remoteConnection.ondatachannel = event => {
    const remoteToLocalChannel = event.channel;
    remoteToLocalChannel.onmessage = handleReceiveMessage;
    remoteToLocalChannel.onopen = function() {
      console.log('OPEN REMOTE', arguments);
    };
    remoteToLocalChannel.onclose = function() {
      console.log('CLOSE REMOTE', arguments);
    };
  };

  // Listen to signaling data from Scaledrone
  room.on('data', (message, client) => {
    console.log('CLIENT', client);
    // Message was sent by us
    if (client.id === drone.clientId) {
      return;
    }
    if (message.sdp) {
      // This is called after receiving an offer or answer from another peer
      localConnection.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        // When receiving an offer lets answer it
        if (localConnection.remoteDescription.type === 'offer') {
          localConnection.createAnswer(localDescCreated, error => console.error(error));
        }
      }, error => console.error(error));
    } else if (message.candidate) {
      // Add the new ICE candidate to our connections remote description
      localConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
  });
}

function localDescCreated(desc) {
  localConnection.setLocalDescription(
    desc,
    () => sendSignalingMessage({'sdp': localConnection.localDescription}),
    error => console.error(error)
  );
}
