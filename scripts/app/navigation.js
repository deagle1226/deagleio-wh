module.exports = (function() {

    var parcel = {},
        root = $('#content');

    parcel.to = function(url) {
        // Begin Load
        root.load(url, function() {
            // End Load
            history.pushState({}, '', '#' + url);
        });
    };

    parcel.enter = function() {
        root.load(window.location.pathname.replace('#', ''));
    };

    return parcel;
}());