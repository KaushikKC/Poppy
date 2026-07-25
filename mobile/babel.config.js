module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Required by react-native-reanimated / react-native-worklets (pulled in by
  // react-native-audio-api). Must be the LAST plugin.
  plugins: ['react-native-worklets/plugin'],
};
