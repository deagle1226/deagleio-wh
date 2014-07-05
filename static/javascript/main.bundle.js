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
},{}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvZGFuL3JlcG9zL2RlYWdsZWlvL25vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5aW5nL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvZGFuL3JlcG9zL2RlYWdsZWlvL3NjcmlwdHMvYXBwL21haW4uanMiLCIvVXNlcnMvZGFuL3JlcG9zL2RlYWdsZWlvL3NjcmlwdHMvYXBwL25hdmlnYXRpb24uanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLy8gTWFpbiBlbnRyeSBwb2ludCBmb3IgYXBwXG52YXIgbmF2ID0gcmVxdWlyZSgnLi9uYXZpZ2F0aW9uLmpzJyk7XG5cbiQoZG9jdW1lbnQpLm9uKCdyZWFkeScsIGZ1bmN0aW9uKCkge1xuICAgIG5hdi5pbml0KHtcbiAgICAgICAgZW50ZXI6IHRydWUsXG4gICAgICAgIGJpbmRFdmVudHM6IHRydWVcbiAgICB9KTtcbn0pOyIsIm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCkge1xuXG4gICAgdmFyIHBhcmNlbCA9IHt9LFxuICAgICAgICByb290ID0gJCgnI2NvbnRlbnQnKSxcbiAgICAgICAgdHJhbnNwb3J0ZXIgPSAnI3RyYW5zcG9ydGVyJyxcbiAgICAgICAgbmF2ID0gJCgnI21haW4tbmF2Jyk7XG5cbiAgICBwYXJjZWwuaW5pdCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICAgICAgdGhpcy5nb1RvID0gZ29UbztcblxuICAgICAgICBpZiAob3B0aW9ucy5lbnRlcikgZW50ZXIoKTtcbiAgICAgICAgaWYgKG9wdGlvbnMuYmluZEV2ZW50cykgYmluZEV2ZW50cygpO1xuICAgIH07XG5cbiAgICBmdW5jdGlvbiBnb1RvKHVybCkge1xuICAgICAgICByb290LmFkZENsYXNzKCdsb2FkaW5nJykubG9hZCh1cmwgKyAnICcgKyB0cmFuc3BvcnRlciwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBoaXN0b3J5LnB1c2hTdGF0ZSh7fSwgJycsIHVybCk7XG4gICAgICAgICAgICByb290LnJlbW92ZUNsYXNzKCdsb2FkaW5nJyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVudGVyKCkge1xuICAgICAgICBuYXYuZmluZCgnYS5hY3RpdmUnKS5yZW1vdmVDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgIGlmICh3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUgPT09ICcvJyB8fCB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUuaW5kZXhPZignYXJ0aWNsZXMnKSAhPSAtMSkge1xuICAgICAgICAgICAgbmF2LmZpbmQoJ2FbaHJlZj1cIi9hcnRpY2xlcy9cIl0nKS5hZGRDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBuYXYuZmluZCgnYVtocmVmPVwiJyArIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSArICdcIl0nKS5hZGRDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBiaW5kRXZlbnRzKCkge1xuICAgICAgICAkKCdib2R5Jykub24oJ2NsaWNrJywgJ2EuYWpheCcsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgdmFyIHVybCA9ICQodGhpcykuYXR0cignaHJlZicpO1xuXG4gICAgICAgICAgICBpZiAoJCh0aGlzKS5wYXJlbnRzKCduYXYnKS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAkKHRoaXMpLnNpYmxpbmdzKCcuYWN0aXZlJykucmVtb3ZlQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgICAgICQodGhpcykuYWRkQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHVybCA9PT0gJy8nKSB7XG4gICAgICAgICAgICAgICAgbmF2LmZpbmQoJ2EuYWN0aXZlJykucmVtb3ZlQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgICAgIG5hdi5maW5kKCdhLmhvbWUnKS5hZGRDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGdvVG8odXJsKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhcmNlbDtcbn0oKSk7Il19
