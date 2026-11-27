const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('legacy clinic bookmark opens standalone clinic search and keeps query parameters', () => {
  let destination;
  const location = new URL('http://localhost/app.html?part=nose#clinic-title');
  location.replace = value => { destination = value; };
  vm.runInNewContext(fs.readFileSync('navigation.js', 'utf8'), {location});
  assert.equal(destination, '/clinics.html?part=nose');
});
