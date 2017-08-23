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
let pc;
let dataChannel;
window.dataChannel = dataChannel;

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
  pc = new RTCPeerConnection(configuration);

  // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
  // message to the other peer through the signaling server
  pc.onicecandidate = event => {
    if (event.candidate) {
      sendSignalingMessage({'candidate': event.candidate});
    }
  };


  if (isOfferer) {
    // If user is offerer let them create a negotiation offer and set up the data channel
    pc.onnegotiationneeded = () => {
      pc.createOffer(localDescCreated, error => console.error(error));
    }
    dataChannel = pc.createDataChannel('chat');
    setupDataChannel();
  } else {
    // If user is not the offerer let wait for a data channel
    pc.ondatachannel = event => {
      dataChannel = event.channel;
      setupDataChannel();
    }
  }

  // Listen to signaling data from Scaledrone
  room.on('data', (message, client) => {
    // Message was sent by us
    if (client.id === drone.clientId) {
      return;
    }
    if (message.sdp) {
      // This is called after receiving an offer or answer from another peer
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        // When receiving an offer lets answer it
        if (pc.remoteDescription.type === 'offer') {
          console.log('Answering offer');
          pc.createAnswer(localDescCreated, error => console.error(error));
        }
      }, error => console.error(error));
    } else if (message.candidate) {
      // Add the new ICE candidate to our connections remote description
      pc.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
  });
}

function localDescCreated(desc) {
  pc.setLocalDescription(
    desc,
    () => sendSignalingMessage({'sdp': pc.localDescription}),
    error => console.error(error)
  );
}

// Hook up data channel event handlers
function setupDataChannel() {
  console.log('>', dataChannel.readyState);
  dataChannel.onopen = function() {
    console.log('Data channel is open', arguments);
    document.body.style.opacity = 1;
    dataChannel.send(JSON.stringify({foo: 'bar', content: 'test'}))
  }
  dataChannel.onclose = function() {
    console.log('Data channel is closed', arguments);
    document.body.style.opacity = 0.2;
  }
  dataChannel.onmessage = function(event) {
    console.log(arguments);
    console.log('Received message from data channel', event.data);
    insertMessageToDOM(JSON.parse(event.data));
  }
}

function insertMessageToDOM(options) {
  const template = document.querySelector('template[data-template="message"]');
  template.content.querySelector('.message__name').innerText = options.emoji + ' ' + options.name;
  template.content.querySelector('.message__bubble').innerText = options.content;
  const clone = document.importNode(template.content, true);
  document.querySelector('.messages').appendChild(clone);
}
