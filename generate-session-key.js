let sodium = require('sodium-native');
let buffer = Buffer.allocUnsafe(sodium.crypto_secretbox_KEYBYTES);
sodium.randombytes_buf(buffer);
console.log(buffer.toString('hex'));