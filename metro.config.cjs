const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Local environment files are inputs to tooling, never JavaScript modules or assets.
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  /[/\\]\.env(?:\.[^/\\]*)?$/,
];
module.exports = config;
