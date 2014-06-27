// Main entry point for app
var client = require('./client.js');
var nav = require('./navigation.js');

$(document).on('ready', function() {
    //client.init();
    nav.init();
});