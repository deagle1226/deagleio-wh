(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var events = require('./events/client.js');

module.exports = {
    init: function() {
        var main = $('main');
        this.bind.nav(main);
        this.bind.article();
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
},{"./events/client.js":2}],2:[function(require,module,exports){
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
},{}],3:[function(require,module,exports){
// Main entry point for app
var client = require('./client.js');
$(document).on('ready', function() {
    client.init();
});
},{"./client.js":1}]},{},[3])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvZGFuL0dvb2dsZSBEcml2ZS93ZWJfcGxheV9ncy93ZWJob29rL2RlYWdsZWlvL25vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5aW5nL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvZGFuL0dvb2dsZSBEcml2ZS93ZWJfcGxheV9ncy93ZWJob29rL2RlYWdsZWlvL3NjcmlwdHMvYXBwL2NsaWVudC5qcyIsIi9Vc2Vycy9kYW4vR29vZ2xlIERyaXZlL3dlYl9wbGF5X2dzL3dlYmhvb2svZGVhZ2xlaW8vc2NyaXB0cy9hcHAvZXZlbnRzL2NsaWVudC5qcyIsIi9Vc2Vycy9kYW4vR29vZ2xlIERyaXZlL3dlYl9wbGF5X2dzL3dlYmhvb2svZGVhZ2xlaW8vc2NyaXB0cy9hcHAvbWFpbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ2YXIgZXZlbnRzID0gcmVxdWlyZSgnLi9ldmVudHMvY2xpZW50LmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIGluaXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgbWFpbiA9ICQoJ21haW4nKTtcbiAgICAgICAgdGhpcy5iaW5kLm5hdihtYWluKTtcbiAgICAgICAgdGhpcy5iaW5kLmFydGljbGUoKTtcbiAgICB9LFxuXG4gICAgYmluZDoge1xuXG4gICAgICAgIG5hdjogZnVuY3Rpb24obWFpbikge1xuICAgICAgICAgICAgbWFpbi5maW5kKCduYXYnKS5vbignY2xpY2snLCAnZGl2JywgZXZlbnRzLm5hdi5wYWdlcyk7XG4gICAgICAgICAgICAkKCdhc2lkZScpLmZpbmQoJ25hdicpLm9uKCdjbGljaycsICdkaXYnLCBldmVudHMubmF2LnBhZ2VzKTtcblxuICAgICAgICAgICAgJCgnI21haW4tbmF2LWZpeGVkJykuaGlkZSgpO1xuICAgICAgICAgICAgJCgnI2xvZ28uZml4ZWQnKS5yZW1vdmVDbGFzcygnc2hvd24nKTtcbiAgICAgICAgICAgICQoJ21haW4nKS5vbignc2Nyb2xsJywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICAgICAgICB2YXIgdG9wID0gJCgnI21haW4tbmF2Jykub2Zmc2V0KCkudG9wIC0gNTtcbiAgICAgICAgICAgICAgICBpZiAodG9wIDw9IDApIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnI21haW4tbmF2LWZpeGVkJykuc2hvdygpO1xuICAgICAgICAgICAgICAgICAgICAkKCcjbG9nby5maXhlZCcpLmFkZENsYXNzKCdzaG93bicpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICQoJyNtYWluLW5hdi1maXhlZCcpLmhpZGUoKTtcbiAgICAgICAgICAgICAgICAgICAgJCgnI2xvZ28uZml4ZWQnKS5yZW1vdmVDbGFzcygnc2hvd24nKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcblxuICAgICAgICBhcnRpY2xlOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICQoJ21haW4nKS5vbignY2xpY2snLCAnYXJ0aWNsZSA+IGhlYWRlcicsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICQodGhpcykuc2libGluZ3MoJ2Rpdi5ib2R5Jykuc2xpZGVUb2dnbGUoKTtcbiAgICAgICAgICAgICAgICAkKHRoaXMpLnBhcmVudHMoJ2FydGljbGUnKS50b2dnbGVDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cbn07IiwibW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbmF2OiB7XG4gICAgICAgIHBhZ2VzOiBmdW5jdGlvbihldmVudCkge1xuICAgICAgICAgICAgdmFyIG51bSA9ICQodGhpcykuYXR0cignaWQnKS5zcGxpdCgnLScpLnBvcCgpO1xuICAgICAgICAgICAgJCgnc2VjdGlvbltpZF49XCJwYWdlXCJdOnZpc2libGUnKS5mYWRlT3V0KDE1MCwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgJCgnc2VjdGlvbiNwYWdlLScgKyBudW0pLmZhZGVJbigxNTApO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICQoJyNlZGl0b3InKS5maW5kKCdzZWN0aW9uOnZpc2libGUnKS5mYWRlT3V0KDE1MCwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgJCgnI2VkaXRvcicpLmZpbmQoJ3NlY3Rpb24jZWRpdHBhZ2UtJyArIG51bSkuZmFkZUluKDE1MCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgJCgnbWFpbiA+IG5hdiwgYXNpZGUgPiBuYXYnKS5maW5kKCdkaXYsIGEnKS5yZW1vdmVDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICAkKCcjbmF2LScgKyBudW0gKyAnLCAjbmF2Mi0nICsgbnVtICsgJywgI2VkaXRuYXYtJyArIG51bSkuYWRkQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICB9XG4gICAgfVxufTsiLCIvLyBNYWluIGVudHJ5IHBvaW50IGZvciBhcHBcbnZhciBjbGllbnQgPSByZXF1aXJlKCcuL2NsaWVudC5qcycpO1xuJChkb2N1bWVudCkub24oJ3JlYWR5JywgZnVuY3Rpb24oKSB7XG4gICAgY2xpZW50LmluaXQoKTtcbn0pOyJdfQ==
