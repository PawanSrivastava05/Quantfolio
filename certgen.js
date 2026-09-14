// Generates a self-signed TLS certificate so the app can run on HTTPS.
const selfsigned = require('selfsigned');
const fs = require('fs');
const path = require('path');

const pems = selfsigned.generate(
  [{ name: 'commonName', value: 'localhost' }],
  {
    days: 365,
    keySize: 2048,
    extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }] }]
  }
);
fs.writeFileSync(path.join(__dirname, 'key.pem'), pems.private);
fs.writeFileSync(path.join(__dirname, 'cert.pem'), pems.cert);
console.log('Self-signed certs written: key.pem, cert.pem');
