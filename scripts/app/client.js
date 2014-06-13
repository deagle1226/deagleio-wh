var events = require('./events/client.js');

module.exports = {
    init: function() {
        var main = $('main');
        this.bind.nav(main);
        //this.bind.article();
    },

    bind: {

        nav: function(main) {
            main.find('nav').on('click', 'div', events.nav.pages);
            $('aside').find('nav').on('click', 'div', events.nav.pages);

            $('#main-nav-fixed').hide();
            $('#logo.fixed').removeClass('shown');
            $('main').on('scroll', function(event) {
                var top = $('#main-nav').offset().top - 5;
                if (top <= 0) {
                    $('#main-nav-fixed').show();
                    $('#logo.fixed').addClass('shown');
                } else {
                    $('#main-nav-fixed').hide();
                    $('#logo.fixed').removeClass('shown');
                }
            });
        },

        article: function() {
            $('main').on('click', 'article > header', function() {
                $(this).siblings('div.body').slideToggle();
                $(this).parents('article').toggleClass('active');
            });
        }
    }
};