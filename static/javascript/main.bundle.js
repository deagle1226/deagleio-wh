(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvZGFuL3JlcG9zL2RlYWdsZWlvL25vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5aW5nL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvZGFuL3JlcG9zL2RlYWdsZWlvL3NjcmlwdHMvYXBwL2NsaWVudC5qcyIsIi9Vc2Vycy9kYW4vcmVwb3MvZGVhZ2xlaW8vc2NyaXB0cy9hcHAvZXZlbnRzL2NsaWVudC5qcyIsIi9Vc2Vycy9kYW4vcmVwb3MvZGVhZ2xlaW8vc2NyaXB0cy9hcHAvbWFpbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ2YXIgZXZlbnRzID0gcmVxdWlyZSgnLi9ldmVudHMvY2xpZW50LmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIGluaXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgbWFpbiA9ICQoJ21haW4nKTtcbiAgICAgICAgdGhpcy5iaW5kLm5hdihtYWluKTtcbiAgICAgICAgLy90aGlzLmJpbmQuYXJ0aWNsZSgpO1xuICAgIH0sXG5cbiAgICBiaW5kOiB7XG5cbiAgICAgICAgbmF2OiBmdW5jdGlvbihtYWluKSB7XG4gICAgICAgICAgICBtYWluLmZpbmQoJ25hdicpLm9uKCdjbGljaycsICdkaXYnLCBldmVudHMubmF2LnBhZ2VzKTtcbiAgICAgICAgICAgICQoJ2FzaWRlJykuZmluZCgnbmF2Jykub24oJ2NsaWNrJywgJ2RpdicsIGV2ZW50cy5uYXYucGFnZXMpO1xuXG4gICAgICAgICAgICAkKCcjbWFpbi1uYXYtZml4ZWQnKS5oaWRlKCk7XG4gICAgICAgICAgICAkKCcjbG9nby5maXhlZCcpLnJlbW92ZUNsYXNzKCdzaG93bicpO1xuICAgICAgICAgICAgJCgnbWFpbicpLm9uKCdzY3JvbGwnLCBmdW5jdGlvbihldmVudCkge1xuICAgICAgICAgICAgICAgIHZhciB0b3AgPSAkKCcjbWFpbi1uYXYnKS5vZmZzZXQoKS50b3AgLSA1O1xuICAgICAgICAgICAgICAgIGlmICh0b3AgPD0gMCkge1xuICAgICAgICAgICAgICAgICAgICAkKCcjbWFpbi1uYXYtZml4ZWQnKS5zaG93KCk7XG4gICAgICAgICAgICAgICAgICAgICQoJyNsb2dvLmZpeGVkJykuYWRkQ2xhc3MoJ3Nob3duJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgJCgnI21haW4tbmF2LWZpeGVkJykuaGlkZSgpO1xuICAgICAgICAgICAgICAgICAgICAkKCcjbG9nby5maXhlZCcpLnJlbW92ZUNsYXNzKCdzaG93bicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9LFxuXG4gICAgICAgIGFydGljbGU6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgJCgnbWFpbicpLm9uKCdjbGljaycsICdhcnRpY2xlID4gaGVhZGVyJywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgJCh0aGlzKS5zaWJsaW5ncygnZGl2LmJvZHknKS5zbGlkZVRvZ2dsZSgpO1xuICAgICAgICAgICAgICAgICQodGhpcykucGFyZW50cygnYXJ0aWNsZScpLnRvZ2dsZUNsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfVxufTsiLCJtb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBuYXY6IHtcbiAgICAgICAgcGFnZXM6IGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgICAgICB2YXIgbnVtID0gJCh0aGlzKS5hdHRyKCdpZCcpLnNwbGl0KCctJykucG9wKCk7XG4gICAgICAgICAgICAkKCdzZWN0aW9uW2lkXj1cInBhZ2VcIl06dmlzaWJsZScpLmZhZGVPdXQoMTUwLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAkKCdzZWN0aW9uI3BhZ2UtJyArIG51bSkuZmFkZUluKDE1MCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgJCgnI2VkaXRvcicpLmZpbmQoJ3NlY3Rpb246dmlzaWJsZScpLmZhZGVPdXQoMTUwLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAkKCcjZWRpdG9yJykuZmluZCgnc2VjdGlvbiNlZGl0cGFnZS0nICsgbnVtKS5mYWRlSW4oMTUwKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAkKCdtYWluID4gbmF2LCBhc2lkZSA+IG5hdicpLmZpbmQoJ2RpdiwgYScpLnJlbW92ZUNsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgICQoJyNuYXYtJyArIG51bSArICcsICNuYXYyLScgKyBudW0gKyAnLCAjZWRpdG5hdi0nICsgbnVtKS5hZGRDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgIH1cbiAgICB9XG59OyIsIi8vIE1haW4gZW50cnkgcG9pbnQgZm9yIGFwcFxudmFyIGNsaWVudCA9IHJlcXVpcmUoJy4vY2xpZW50LmpzJyk7XG4kKGRvY3VtZW50KS5vbigncmVhZHknLCBmdW5jdGlvbigpIHtcbiAgICBjbGllbnQuaW5pdCgpO1xufSk7Il19
