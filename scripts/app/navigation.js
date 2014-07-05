module.exports = (function() {

    var parcel = {},
        root = $('#content'),
        transporter = '#transporter',
        nav = $('#main-nav');

    parcel.init = function(options) {
        this.goTo = goTo;

        if (options.enter) enter();
        if (options.bindEvents) bindEvents();
    };

    function goTo(url) {
        root.addClass('loading').load(url + ' ' + transporter, function() {
            history.pushState({}, '', url);
            root.removeClass('loading');
        });
    }

    function enter() {
        nav.find('a.active').removeClass('active');
        if (window.location.pathname === '/' || window.location.pathname.indexOf('articles') != -1) {
            nav.find('a[href="/articles/"]').addClass('active');
        } else {
            nav.find('a[href="' + window.location.pathname + '"]').addClass('active');
        }
    }

    function bindEvents() {
        $('body').on('click', 'a.ajax', function(event) {
            event.preventDefault();
            var url = $(this).attr('href');

            if ($(this).parents('nav').length) {
                $(this).siblings('.active').removeClass('active');
                $(this).addClass('active');
            }
            if (url === '/') {
                nav.find('a.active').removeClass('active');
                nav.find('a.home').addClass('active');
            }

            goTo(url);
        });
    }

    return parcel;
}());