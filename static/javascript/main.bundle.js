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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9kYW4vcmVwb3MvZGVhZ2xlaW8vbm9kZV9tb2R1bGVzL2dydW50LWJyb3dzZXJpZnlpbmcvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9kYW4vcmVwb3MvZGVhZ2xlaW8vc2NyaXB0cy9hcHAvbWFpbi5qcyIsIi9Vc2Vycy9kYW4vcmVwb3MvZGVhZ2xlaW8vc2NyaXB0cy9hcHAvbmF2aWdhdGlvbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLy8gTWFpbiBlbnRyeSBwb2ludCBmb3IgYXBwXG52YXIgbmF2ID0gcmVxdWlyZSgnLi9uYXZpZ2F0aW9uLmpzJyk7XG5cbiQoZG9jdW1lbnQpLm9uKCdyZWFkeScsIGZ1bmN0aW9uKCkge1xuICAgIG5hdi5pbml0KHtcbiAgICAgICAgZW50ZXI6IHRydWUsXG4gICAgICAgIGJpbmRFdmVudHM6IHRydWVcbiAgICB9KTtcbn0pOyIsIm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCkge1xuXG4gICAgdmFyIHBhcmNlbCA9IHt9LFxuICAgICAgICByb290ID0gJCgnI2NvbnRlbnQnKSxcbiAgICAgICAgdHJhbnNwb3J0ZXIgPSAnI3RyYW5zcG9ydGVyJyxcbiAgICAgICAgbmF2ID0gJCgnI21haW4tbmF2Jyk7XG5cbiAgICBwYXJjZWwuaW5pdCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICAgICAgdGhpcy5nb1RvID0gZ29UbztcblxuICAgICAgICBvcHRpb25zLnNlbGVjdG9ycyA9IG9wdGlvbnMuc2VsZWN0b3JzIHx8IHtcbiAgICAgICAgICAgIGxpbmtzOiAnYS5hamF4JyxcbiAgICAgICAgICAgIGhvbWU6ICdhLmhvbWUnXG4gICAgICAgIH07XG4gICAgICAgIGlmIChvcHRpb25zLmVudGVyKSBlbnRlcigpO1xuICAgICAgICBpZiAob3B0aW9ucy5iaW5kRXZlbnRzKSBiaW5kRXZlbnRzKG9wdGlvbnMuc2VsZWN0b3JzKTtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gZ29Ubyh1cmwpIHtcbiAgICAgICAgcm9vdC5hZGRDbGFzcygnbG9hZGluZycpLmxvYWQodXJsICsgJyAnICsgdHJhbnNwb3J0ZXIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaGlzdG9yeS5wdXNoU3RhdGUoe30sICcnLCB1cmwpO1xuICAgICAgICAgICAgcm9vdC5yZW1vdmVDbGFzcygnbG9hZGluZycpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbnRlcigpIHtcbiAgICAgICAgbmF2LmZpbmQoJ2EuYWN0aXZlJykucmVtb3ZlQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICBpZiAod2luZG93LmxvY2F0aW9uLnBhdGhuYW1lID09PSAnLycgfHwgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLmluZGV4T2YoJ2FydGljbGVzJykgIT0gLTEpIHtcbiAgICAgICAgICAgIG5hdi5maW5kKCdhW2hyZWY9XCIvYXJ0aWNsZXMvXCJdJykuYWRkQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbmF2LmZpbmQoJ2FbaHJlZj1cIicgKyB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUgKyAnXCJdJykuYWRkQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYmluZEV2ZW50cyhzZWxlY3RvcnMpIHtcbiAgICAgICAgJCgnYm9keScpLm9uKCdjbGljaycsIHNlbGVjdG9ycy5saW5rcywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICB2YXIgdXJsID0gJCh0aGlzKS5hdHRyKCdocmVmJyk7XG5cbiAgICAgICAgICAgIGlmICgkKHRoaXMpLnBhcmVudHMoJ25hdicpLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICQodGhpcykuc2libGluZ3MoJy5hY3RpdmUnKS5yZW1vdmVDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICAgICAgJCh0aGlzKS5hZGRDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodXJsID09PSAnLycpIHtcbiAgICAgICAgICAgICAgICBuYXYuZmluZCgnYS5hY3RpdmUnKS5yZW1vdmVDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICAgICAgbmF2LmZpbmQoc2VsZWN0b3JzLmhvbWUpLmFkZENsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZ29Ubyh1cmwpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcGFyY2VsO1xufSgpKTsiXX0=
