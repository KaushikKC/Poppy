// Bridge between the classic chat.js scripts and the ES-module 3D avatar
// controller (avatar3d.module.mjs), which loads asynchronously after the page.
//
// chat.js drives `window.companionAvatar` with the same calls the old avatars
// used (setState / setAnalyser / setColors / setIdentity). This stub stores them
// immediately; the module "upgrades" it by setting _onAnalyser / _onState once
// TalkingHead + HeadAudio are ready, then replays whatever was buffered.
window.companionAvatar = {
  _analyser: null,
  _state: "idle",
  _onAnalyser: null,
  _onState: null,

  // chat.js calls this once with the audio AnalyserNode (on the first reply).
  // The 3D controller taps that node so HeadAudio can derive visemes from the
  // actual Kokoro voice and move the avatar's lips.
  setAnalyser(node) {
    this._analyser = node;
    if (this._onAnalyser) this._onAnalyser(node);
  },

  setState(s) {
    this._state = s;
    if (this._onState) this._onState(s);
  },

  // kept for API parity; the 3D avatar carries its own look + identity
  setColors() {},
  setIdentity() {},
};
