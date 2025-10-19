import { SignalingClient } from '../signalingClient.js';

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' }
  // TURN sunuculari SIGNALING_ICE_SERVERS degiskeniyle tanimlanir
];

function serializeIceCandidateError(event) {
  if (!event) {
    return { message: 'unknown-ice-candidate-error' };
  }

  const detail = {
    address: event.address ?? null,
    port: event.port ?? null,
    protocol: event.protocol ?? null,
    url: event.url ?? null,
    errorCode: event.errorCode ?? null,
    errorText: event.errorText ?? event.message ?? null
  };

  if (event?.hostCandidate) {
    detail.hostCandidate = event.hostCandidate;
  }
  if (event?.relatedAddress) {
    detail.relatedAddress = event.relatedAddress;
  }
  if (event?.relatedPort) {
    detail.relatedPort = event.relatedPort;
  }
  if (event?.errorDetail) {
    detail.errorDetail = event.errorDetail;
  }

  return detail;
}

/**
 * WebRTCConnectionManager, signaling servisi aracılığıyla iki peer arasında
 * DataChannel kurulumunu yönetir. MVP aşamasında sadece tek bir DataChannel
 * ("chunks") açılır ve temel mesaj alışverişi desteklenir.
 */
export class WebRTCConnectionManager extends EventTarget {
  constructor({ signalingUrl, peerId, authToken = null }) {
    super();
    this.signalingUrl = signalingUrl;
    this.peerId = peerId;
    this.authToken = authToken;

    this.signalingClient = null;
    this.peerConnection = null;
    this.dataChannel = null;
    this.targetPeerId = null;
    this.iceServers = [...DEFAULT_ICE_SERVERS];
  }

  async connect() {
    const signalingClient = new SignalingClient({
      url: this.signalingUrl,
      peerId: this.peerId,
      authToken: this.authToken,
      capabilities: ['store', 'relay'],
      metadata: { userAgent: navigator.userAgent }
    });

    signalingClient.addEventListener('message', (event) => {
      this.handleSignalingMessage(event.detail);
    });

    signalingClient.addEventListener('registered', (event) => {
      this.peerId = event.detail.peerId;
      if (Array.isArray(event.detail.iceServers)) {
        this.iceServers = event.detail.iceServers;
      }
      this.dispatchEvent(new CustomEvent('registered', { detail: event.detail }));
    });

    signalingClient.addEventListener('error', (event) => {
      this.dispatchEvent(new CustomEvent('error', { detail: event.detail }));
    });

    await signalingClient.connect();
    this.signalingClient = signalingClient;
    return signalingClient.registeredPeerId;
  }

  /**
   * Başka bir peer ile bağlantı kurmak için çağrılır.
   */
  async initiateConnection(targetPeerId) {
    if (!this.signalingClient) {
      throw new Error('Signaling client not connected');
    }
    this.targetPeerId = targetPeerId;
    await this.setupPeerConnection();

    this.dataChannel = this.peerConnection.createDataChannel('chunks');
    this.bindDataChannelEvents(this.dataChannel);

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    this.signalingClient.send({
      type: 'signal',
      targetPeerId,
      payload: {
        type: 'offer',
        sdp: offer.sdp
      }
    });
  }

  /**
   * Signaling üzerinden gelen offer/answer/candidate mesajlarını işler.
   */
  async handleSignalingMessage(message) {
    if (message.type !== 'signal') {
      if (message.type === 'peer-list' && Array.isArray(message.iceServers)) {
        this.iceServers = message.iceServers;
      }
      this.dispatchEvent(new CustomEvent('signaling', { detail: message }));
      return;
    }

    const { fromPeerId, payload } = message;
    switch (payload.type) {
      case 'offer':
        await this.onOffer(fromPeerId, payload);
        break;
      case 'answer':
        await this.onAnswer(payload);
        break;
      case 'ice-candidate':
        await this.onRemoteCandidate(payload);
        break;
      default:
        console.warn('Unknown signaling payload', payload);
    }
  }

  async onOffer(fromPeerId, payload) {
    this.targetPeerId = fromPeerId;
    await this.setupPeerConnection();

    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription({ type: 'offer', sdp: payload.sdp })
    );

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.signalingClient.send({
      type: 'signal',
      targetPeerId: fromPeerId,
      payload: {
        type: 'answer',
        sdp: answer.sdp
      }
    });
  }

  async onAnswer(payload) {
    if (!this.peerConnection) return;

    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription({ type: 'answer', sdp: payload.sdp })
    );
  }

  async onRemoteCandidate(payload) {
    if (!this.peerConnection || !payload.candidate) return;

    try {
      await this.peerConnection.addIceCandidate(
        new RTCIceCandidate(payload.candidate)
      );
    } catch (error) {
      console.error('Failed to add ICE candidate', error);
    }
  }

  async setupPeerConnection() {
    if (this.peerConnection) return;

    const configuration = {
      iceServers: this.iceServers.length ? this.iceServers : DEFAULT_ICE_SERVERS
    };
    const pc = new RTCPeerConnection(configuration);
    this.peerConnection = pc;

    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate && this.targetPeerId) {
        this.signalingClient?.send({
          type: 'signal',
          targetPeerId: this.targetPeerId,
          payload: {
            type: 'ice-candidate',
            candidate: event.candidate.toJSON()
          }
        });
      }
    });

    pc.addEventListener('icecandidateerror', (event) => {
      this.dispatchEvent(
        new CustomEvent('icecandidateerror', {
          detail: serializeIceCandidateError(event)
        })
      );
    });

    pc.addEventListener('icegatheringstatechange', () => {
      this.dispatchEvent(
        new CustomEvent('icegatheringstatechange', {
          detail: pc.iceGatheringState
        })
      );
    });

    pc.addEventListener('iceconnectionstatechange', () => {
      const state = pc.iceConnectionState;
      this.dispatchEvent(
        new CustomEvent('iceconnectionstatechange', {
          detail: state
        })
      );
      if (state === 'failed') {
        this.dispatchEvent(
          new CustomEvent('icefailure', {
            detail: {
              state,
              reason: 'ice-connection-failed'
            }
          })
        );
      }
    });

    pc.addEventListener('connectionstatechange', () => {
      this.dispatchEvent(
        new CustomEvent('connectionstatechange', { detail: pc.connectionState })
      );
    });

    pc.addEventListener('datachannel', (event) => {
      this.dataChannel = event.channel;
      this.bindDataChannelEvents(this.dataChannel);
    });
  }

  bindDataChannelEvents(channel) {
    channel.binaryType = 'arraybuffer';

    channel.addEventListener('open', () => {
      this.dispatchEvent(new CustomEvent('channel-open', { detail: channel }));
    });

    channel.addEventListener('close', () => {
      this.dispatchEvent(new CustomEvent('channel-close', { detail: channel }));
    });

    channel.addEventListener('message', (event) => {
      const data = event.data;
      if (typeof data === 'string') {
        this.dispatchEvent(
          new CustomEvent('channel-message', { detail: { kind: 'text', data } })
        );
        return;
      }

      if (data instanceof ArrayBuffer) {
        this.dispatchEvent(
          new CustomEvent('channel-message', {
            detail: { kind: 'binary', data }
          })
        );
        return;
      }

      if (data instanceof Blob) {
        data.arrayBuffer().then((buffer) => {
          this.dispatchEvent(
            new CustomEvent('channel-message', {
              detail: { kind: 'binary', data: buffer }
            })
          );
        });
        return;
      }

      this.dispatchEvent(
        new CustomEvent('channel-message', { detail: { kind: 'unknown', data } })
      );
    });
  }

  sendJson(message) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel is not open');
    }

    const payload =
      typeof message === 'string' ? message : JSON.stringify(message);
    this.dataChannel.send(payload);
  }

  sendBinary(data) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel is not open');
    }

    if (data instanceof ArrayBuffer) {
      this.dataChannel.send(data);
      return;
    }

    if (ArrayBuffer.isView(data)) {
      this.dataChannel.send(data);
      return;
    }

    throw new TypeError('Binary payload must be ArrayBuffer or typed array');
  }

  sendData(message) {
    this.sendJson(message);
  }

  resetPeerConnection() {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.targetPeerId = null;
  }

  disconnect() {
    this.resetPeerConnection();
    if (this.signalingClient) {
      this.signalingClient.disconnect();
    }
    this.signalingClient = null;
  }

  requestPeerList() {
    this.signalingClient?.send({ type: 'discover' });
  }

  getPeerId() {
    return this.peerId;
  }

  getBufferedAmount() {
    return this.dataChannel?.bufferedAmount ?? 0;
  }

  isChannelReady() {
    return Boolean(this.dataChannel && this.dataChannel.readyState === 'open');
  }

  requestChunk({ requestId, manifestId, chunkIndex }) {
    if (!this.isChannelReady()) {
      throw new Error('Data channel is not open');
    }
    this.sendJson({
      type: 'chunk-request',
      requestId,
      manifestId,
      chunkIndex
    });
  }
}







