var transit = require('jquery.transit'),
    velocity = require('velocity-animate');

module.exports = (function() {

    var LOAD_TIME = 300; // milliseconds

    var parcel = {},
        root = $('#content'),
        transporter = '#transporter',
        nav = $('#main-nav'),
        progress = $('paper-progress::shadow').find('#activeProgress');

    parcel.init = function() {
        this.to = to;
        this.enter = enter;
        enter();

        nav.on('click', 'a', function(event) {
            event.preventDefault();

            $(this).siblings('.active').removeClass('active');
            $(this).addClass('active');

            var url = $(this).attr('href');
            to(url);
        });

        $('#logo').on('click', 'a', function(event) {
            event.preventDefault();
            nav.find('a.active').removeClass('active');
            nav.find('a[href="/articles/"]').addClass('active');
            to('/');
        });
    };

    function to(url) {
        var html;
        $.get(url, function(data) {
            html = $(data).find(transporter);
        });
        $('paper-progress::shadow').find('#activeProgress').velocity({
            width: '100%'
        }, LOAD_TIME, function() {
            root.html(html);
            // End Load
            history.pushState({}, '', url);
            $('paper-progress::shadow').find('#activeProgress').velocity({
                width: '0%'
            }, 0);
        });

    }

    function enter() {
        // Begin Load
        root.load(window.location.pathname + ' ' + transporter, function() {
            // End Load
            nav.find('a.active').removeClass('active');
            if (window.location.pathname === '/') {
                nav.find('a[href="/articles/"]').addClass('active');
            } else {
                nav.find('a[href="' + window.location.pathname + '"]').addClass('active');
            }

        });
    }

    return parcel;
}());