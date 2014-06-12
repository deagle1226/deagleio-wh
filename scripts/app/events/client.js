module.exports = {
    nav: {
        pages: function(event) {
            var num = $(this).attr('id').split('-').pop();
            $('section[id^="page"]:visible').fadeOut(150, function() {
                $('section#page-' + num).fadeIn(150);
            });

            $('#editor').find('section:visible').fadeOut(150, function() {
                $('#editor').find('section#editpage-' + num).fadeIn(150);
            });

            $('main > nav, aside > nav').find('div, a').removeClass('active');
            $('#nav-' + num + ', #nav2-' + num + ', #editnav-' + num).addClass('active');
        }
    }
};