// Main entry point for app
var nav = require('./navigation.js');

$(document).on('ready', function() {
    nav.init();
});