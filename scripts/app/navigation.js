var velocity = require('velocity-animate');

module.exports = (function() {

    var LOAD_TIME = 300; // milliseconds

    var parcel = {},
        root = $('#content'),
        transporter = '#transporter',
        nav = $('#main-nav');

    parcel.init = function() {
        this.goTo = goTo;

        enter();
        bindEvents();
    };

    function goTo(url) {
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
            if (window.location.pathname === '/' || window.location.pathname.indexOf('articles') != -1) {
                nav.find('a[href="/articles/"]').addClass('active');
            } else {
                nav.find('a[href="' + window.location.pathname + '"]').addClass('active');
            }

        });
    }

    function bindEvents() {
        nav.on('click', 'a', function(event) {
            event.preventDefault();

            $(this).siblings('.active').removeClass('active');
            $(this).addClass('active');

            var url = $(this).attr('href');
            goTo(url);
        });

        $('#logo').on('click', 'a', function(event) {
            event.preventDefault();
            nav.find('a.active').removeClass('active');
            nav.find('a[href="/articles/"]').addClass('active');
            goTo('/');
        });

        $('#content').on('click', '#articles > a', function(event) {
            event.preventDefault();

            var url = $(this).attr('href');
            goTo(url);
        });
    }

    return parcel;
}());