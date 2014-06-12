// Main entry point for app
var client = require('./client.js');
$(document).on('ready', function() {
    client.init();
});