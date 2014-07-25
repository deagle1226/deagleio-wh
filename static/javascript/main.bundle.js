(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// Main entry point for app
var nav = require('./navigation.js');

$(document).on('ready', function() {
    nav.init({
        enter: true,
        bindEvents: true
    });
});
},{"./navigation.js":2}],2:[function(require,module,exports){
module.exports = (function() {

    var parcel = {},
        root = $('#content'),
        transporter = '#transporter',
        nav = $('#main-nav');

    parcel.init = function(options) {
        this.goTo = goTo;

        options.selectors = options.selectors || {
            links: 'a.ajax',
            home: 'a.home'
        };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9kYW4vcmVwb3MvZGVhZ2xlaW8vbm9kZV9tb2R1bGVzL2dydW50LWJyb3dzZXJpZnlpbmcvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9kYW4vcmVwb3MvZGVhZ2xlaW8vc2NyaXB0cy9hcHAvbWFpbi5qcyIsIi9Vc2Vycy9kYW4vcmVwb3MvZGVhZ2xlaW8vc2NyaXB0cy9hcHAvbmF2aWdhdGlvbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvLyBNYWluIGVudHJ5IHBvaW50IGZvciBhcHBcbnZhciBuYXYgPSByZXF1aXJlKCcuL25hdmlnYXRpb24uanMnKTtcblxuJChkb2N1bWVudCkub24oJ3JlYWR5JywgZnVuY3Rpb24oKSB7XG4gICAgbmF2LmluaXQoe1xuICAgICAgICBlbnRlcjogdHJ1ZSxcbiAgICAgICAgYmluZEV2ZW50czogdHJ1ZVxuICAgIH0pO1xufSk7IiwibW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKSB7XG5cbiAgICB2YXIgcGFyY2VsID0ge30sXG4gICAgICAgIHJvb3QgPSAkKCcjY29udGVudCcpLFxuICAgICAgICB0cmFuc3BvcnRlciA9ICcjdHJhbnNwb3J0ZXInLFxuICAgICAgICBuYXYgPSAkKCcjbWFpbi1uYXYnKTtcblxuICAgIHBhcmNlbC5pbml0ID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgICAgICB0aGlzLmdvVG8gPSBnb1RvO1xuXG4gICAgICAgIG9wdGlvbnMuc2VsZWN0b3JzID0gb3B0aW9ucy5zZWxlY3RvcnMgfHwge1xuICAgICAgICAgICAgbGlua3M6ICdhLmFqYXgnLFxuICAgICAgICAgICAgaG9tZTogJ2EuaG9tZSdcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKG9wdGlvbnMuZW50ZXIpIGVudGVyKCk7XG4gICAgICAgIGlmIChvcHRpb25zLmJpbmRFdmVudHMpIGJpbmRFdmVudHMob3B0aW9ucy5zZWxlY3RvcnMpO1xuXG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIGdvVG8odXJsKSB7XG4gICAgICAgIHJvb3QuYWRkQ2xhc3MoJ2xvYWRpbmcnKS5sb2FkKHVybCArICcgJyArIHRyYW5zcG9ydGVyLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGhpc3RvcnkucHVzaFN0YXRlKHt9LCAnJywgdXJsKTtcbiAgICAgICAgICAgIHJvb3QucmVtb3ZlQ2xhc3MoJ2xvYWRpbmcnKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW50ZXIoKSB7XG4gICAgICAgIG5hdi5maW5kKCdhLmFjdGl2ZScpLnJlbW92ZUNsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgaWYgKHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSA9PT0gJy8nIHx8IHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZS5pbmRleE9mKCdhcnRpY2xlcycpICE9IC0xKSB7XG4gICAgICAgICAgICBuYXYuZmluZCgnYVtocmVmPVwiL2FydGljbGVzL1wiXScpLmFkZENsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG5hdi5maW5kKCdhW2hyZWY9XCInICsgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lICsgJ1wiXScpLmFkZENsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGJpbmRFdmVudHMoc2VsZWN0b3JzKSB7XG4gICAgICAgICQoJ2JvZHknKS5vbignY2xpY2snLCBzZWxlY3RvcnMubGlua3MsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgdmFyIHVybCA9ICQodGhpcykuYXR0cignaHJlZicpO1xuXG4gICAgICAgICAgICBpZiAoJCh0aGlzKS5wYXJlbnRzKCduYXYnKS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAkKHRoaXMpLnNpYmxpbmdzKCcuYWN0aXZlJykucmVtb3ZlQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgICAgICQodGhpcykuYWRkQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHVybCA9PT0gJy8nKSB7XG4gICAgICAgICAgICAgICAgbmF2LmZpbmQoJ2EuYWN0aXZlJykucmVtb3ZlQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgICAgIG5hdi5maW5kKHNlbGVjdG9ycy5ob21lKS5hZGRDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGdvVG8odXJsKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhcmNlbDtcbn0oKSk7Il19
