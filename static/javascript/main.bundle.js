(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// Main entry point for app
var nav = require('./navigation.js');

$(document).on('ready', function() {
    nav.init();
});
},{"./navigation.js":2}],2:[function(require,module,exports){
var defaults = {
    enter: true,
    bindEvents: true,
    selectors: {
        links: 'a.ajax',
        home: 'a.home'
    }
};

module.exports = (function() {

    var parcel = {},
        root = $('#content'),
        transporter = '#transporter',
        nav = $('#main-nav');

    parcel.init = function(options) {
        this.goTo = goTo;

        options = $.extend({}, defaults, options);
        if (options.enter) enter();
        if (options.bindEvents) bindEvents(options.selectors);

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

    function bindEvents(selectors) {
        $('body').on('click', selectors.links, function(event) {
            event.preventDefault();
            var url = $(this).attr('href');

            if ($(this).parents('nav').length) {
                $(this).siblings('.active').removeClass('active');
                $(this).addClass('active');
            }
            if (url === '/') {
                nav.find('a.active').removeClass('active');
                nav.find(selectors.home).addClass('active');
            }

            goTo(url);
        });
    }

    return parcel;
}());
},{}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9kYW4vcmVwb3MvZGVhZ2xlaW8vbm9kZV9tb2R1bGVzL2dydW50LWJyb3dzZXJpZnlpbmcvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9kYW4vcmVwb3MvZGVhZ2xlaW8vc2NyaXB0cy9hcHAvbWFpbi5qcyIsIi9Vc2Vycy9kYW4vcmVwb3MvZGVhZ2xlaW8vc2NyaXB0cy9hcHAvbmF2aWdhdGlvbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvLyBNYWluIGVudHJ5IHBvaW50IGZvciBhcHBcbnZhciBuYXYgPSByZXF1aXJlKCcuL25hdmlnYXRpb24uanMnKTtcblxuJChkb2N1bWVudCkub24oJ3JlYWR5JywgZnVuY3Rpb24oKSB7XG4gICAgbmF2LmluaXQoKTtcbn0pOyIsInZhciBkZWZhdWx0cyA9IHtcbiAgICBlbnRlcjogdHJ1ZSxcbiAgICBiaW5kRXZlbnRzOiB0cnVlLFxuICAgIHNlbGVjdG9yczoge1xuICAgICAgICBsaW5rczogJ2EuYWpheCcsXG4gICAgICAgIGhvbWU6ICdhLmhvbWUnXG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKSB7XG5cbiAgICB2YXIgcGFyY2VsID0ge30sXG4gICAgICAgIHJvb3QgPSAkKCcjY29udGVudCcpLFxuICAgICAgICB0cmFuc3BvcnRlciA9ICcjdHJhbnNwb3J0ZXInLFxuICAgICAgICBuYXYgPSAkKCcjbWFpbi1uYXYnKTtcblxuICAgIHBhcmNlbC5pbml0ID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICB0aGlzLmdvVG8gPSBnb1RvO1xuXG4gICAgICAgIG9wdGlvbnMgPSAkLmV4dGVuZCh7fSwgZGVmYXVsdHMsIG9wdGlvbnMpO1xuICAgICAgICBpZiAob3B0aW9ucy5lbnRlcikgZW50ZXIoKTtcbiAgICAgICAgaWYgKG9wdGlvbnMuYmluZEV2ZW50cykgYmluZEV2ZW50cyhvcHRpb25zLnNlbGVjdG9ycyk7XG5cbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gZ29Ubyh1cmwpIHtcbiAgICAgICAgcm9vdC5hZGRDbGFzcygnbG9hZGluZycpLmxvYWQodXJsICsgJyAnICsgdHJhbnNwb3J0ZXIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaGlzdG9yeS5wdXNoU3RhdGUoe30sICcnLCB1cmwpO1xuICAgICAgICAgICAgcm9vdC5yZW1vdmVDbGFzcygnbG9hZGluZycpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbnRlcigpIHtcbiAgICAgICAgbmF2LmZpbmQoJ2EuYWN0aXZlJykucmVtb3ZlQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICBpZiAod2luZG93LmxvY2F0aW9uLnBhdGhuYW1lID09PSAnLycgfHwgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLmluZGV4T2YoJ2FydGljbGVzJykgIT0gLTEpIHtcbiAgICAgICAgICAgIG5hdi5maW5kKCdhW2hyZWY9XCIvYXJ0aWNsZXMvXCJdJykuYWRkQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbmF2LmZpbmQoJ2FbaHJlZj1cIicgKyB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUgKyAnXCJdJykuYWRkQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYmluZEV2ZW50cyhzZWxlY3RvcnMpIHtcbiAgICAgICAgJCgnYm9keScpLm9uKCdjbGljaycsIHNlbGVjdG9ycy5saW5rcywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB2YXIgdXJsID0gJCh0aGlzKS5hdHRyKCdocmVmJyk7XG5cbiAgICAgICAgICAgIGlmICgkKHRoaXMpLnBhcmVudHMoJ25hdicpLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICQodGhpcykuc2libGluZ3MoJy5hY3RpdmUnKS5yZW1vdmVDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICAgICAgJCh0aGlzKS5hZGRDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodXJsID09PSAnLycpIHtcbiAgICAgICAgICAgICAgICBuYXYuZmluZCgnYS5hY3RpdmUnKS5yZW1vdmVDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICAgICAgbmF2LmZpbmQoc2VsZWN0b3JzLmhvbWUpLmFkZENsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZ29Ubyh1cmwpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcGFyY2VsO1xufSgpKTsiXX0=
