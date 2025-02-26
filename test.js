const notifier = require('node-notifier');
// String
//notifier.notify('Message');
//
// Object
notifier.notify({
  title: 'My notification',
  message: 'Hello, there!',
  wait: true,
  timeout: 42,
  actions: 'Approve',
  closeLabel: 'Deny'
}, function (err, response, message) {
  console.log(err, response, message);
})

