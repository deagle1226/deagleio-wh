(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/***************
    Details
***************/

/*!
* Velocity.js: Accelerated JavaScript animation.
* @version 0.2.1
* @docs http://velocityjs.org
* @license Copyright 2014 Julian Shapiro. MIT License: http://en.wikipedia.org/wiki/MIT_License
*/

/****************
     Summary
****************/

/*
Velocity is a concise CSS manipulation library with a performant animation stack built on top of it. To minimize DOM interaction, Velocity reuses previous animation values and batches DOM queries wherever possible.
Whenever Velocity triggers a DOM query (a GET) or a DOM update (a SET), a comment indicating such is placed next to the offending line of code.
To learn more about the nuances of DOM performance, check out these talks: https://www.youtube.com/watch?v=cmZqLzPy0XE and https://www.youtube.com/watch?v=n8ep4leoN9A.

Velocity is structured into four sections:
- CSS Stack: Works independently from the rest of Velocity.
- Velocity.animate() is the core animation method that iterates over the targeted element set and queues the incoming Velocity animation onto each element individually. This process consists of:
  - Pre-Queueing: Prepare the element for animation by instantiating its data cache and processing the call's options argument.
  - Queueing: The logic that runs once the call has reached its point of execution in the element's $.queue() stack. Most logic is placed here to avoid risking it becoming stale.
  - Pushing: Consolidation of the tween data followed by its push onto the global in-progress calls container.
- tick(): The single requestAnimationFrame loop responsible for tweening all in-progress calls.
- completeCall(): Handles the cleanup process for each Velocity call.

The biggest cause of both codebase bloat and codepath obfuscation is support for animating individual values of compound-value CSS properties (e.g. "textShadowBlur" in "textShadow: 0px 0px 0px black").
*/

/* NOTICE: Despite the ensuing code indicating that Velocity works *without* jQuery and *with* Zepto, this support has not yet landed. */

;(function (global, window, document, undefined) {

    /*****************
        Constants
    *****************/

    var NAME = "velocity",
        DEFAULT_DURATION = 400,
        DEFAULT_EASING = "swing";

    /*********************
       Helper Functions
    *********************/

    /* IE detection. Gist: https://gist.github.com/julianshapiro/9098609 */
    var IE = (function() {
        if (document.documentMode) {
            return document.documentMode;
        } else {
            for (var i = 7; i > 4; i--) {
                var div = document.createElement("div");

                div.innerHTML = "<!--[if IE " + i + "]><span></span><![endif]-->";

                if (div.getElementsByTagName("span").length) {
                    div = null;

                    return i;
                }
            }
        }

        return undefined;
    })();

    /* RAF polyfill. Gist: https://gist.github.com/julianshapiro/9497513 */
    var requestAnimationFrame = window.requestAnimationFrame || (function() {
        var timeLast = 0;

        return window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || function(callback) {
            var timeCurrent = (new Date()).getTime(),
                timeDelta;

            /* Dynamically set delay on a per-tick basis to match 60fps. */
            /* Technique by Erik Moller. MIT license: https://gist.github.com/paulirish/1579671 */
            timeDelta = Math.max(0, 16 - (timeCurrent - timeLast));
            timeLast = timeCurrent + timeDelta;

            return setTimeout(function() { callback(timeCurrent + timeDelta); }, timeDelta);
        };
    })();

    /* Sparse array compacting. Copyright Lo-Dash. MIT License: https://github.com/lodash/lodash/blob/master/LICENSE.txt */
    function compactSparseArray (array) {
        var index = -1,
            length = array ? array.length : 0,
            result = [];

        while (++index < length) {
            var value = array[index];

            if (value) {
                result.push(value);
            }
        }

        return result;
    }

    var Type = {
        isString: function (variable) {
            return (typeof variable === "string");
        },

        isArray: Array.isArray || function (variable) {
            return Object.prototype.toString.call(variable) === "[object Array]";
        },

        isFunction: function (variable) {
            return Object.prototype.toString.call(variable) === "[object Function]";
        },

        /* Copyright Martin Bohm. MIT License: https://gist.github.com/Tomalak/818a78a226a0738eaade */
        isNodeList: function (variable) {
            return typeof variable === "object" &&
                /^\[object (HTMLCollection|NodeList|Object)\]$/.test(Object.prototype.toString.call(variable)) &&
                variable.length !== undefined &&
                (variable.length === 0 || (typeof variable[0] === "object" && variable[0].nodeType > 0));
        },

        /* Determine if variable is a wrapped jQuery or Zepto element. */
        isWrapped: function (variable) {
            return variable && (variable.jquery || (window.Zepto && window.Zepto.zepto.isZ(variable)));
        }
    };

    /*****************
       Dependencies
    *****************/

    /* Local to our Velocity scope, assign $ to our jQuery shim if jQuery itself isn't loaded. (The shim is a port of the jQuery utility functions that Velocity uses.) */
    /* Note: We can't default to Zepto since the shimless version of Velocity does not work with Zepto, which is missing several utility functions that Velocity requires. */
    var $ = window.jQuery || (global.Velocity && global.Velocity.Utilities);

    if (!$) {
        throw new Error("Velocity: Either jQuery or Velocity's jQuery shim must first be loaded.")
    /* We allow the global Velocity variable to pre-exist so long as we were responsible for its creation (via the jQuery shim, which uniquely assigns a Utilities property to the Velocity object). */
    } else if (global.Velocity !== undefined && !global.Velocity.Utilities) {
        throw new Error("Velocity: Namespace is occupied.");
    /* Nothing prevents Velocity from working on IE6+7, but it is not worth the time to test on them. Revert to jQuery's $.animate(), and lose Velocity's extra features. */
    } else if (IE <= 7) {
        if (!window.jQuery) {
            throw new Error("Velocity: For IE<=7, Velocity falls back to jQuery, which must first be loaded.");
        } else {
            window.jQuery.fn.velocity = window.jQuery.fn.animate;

            /* Now that $.fn.velocity is aliased, abort this Velocity declaration. */
            return;
        }
    /* IE8 doesn't work with the jQuery shim; it requires jQuery proper. */
    } else if (IE === 8 && !window.jQuery) {
        throw new Error("Velocity: For IE8, Velocity requires jQuery to be loaded. (Velocity's jQuery shim does not work with IE8.)");
    }

    /* Shorthand alias for jQuery's $.data() utility. */
    function Data (element) {
        /* Hardcode a reference to the plugin name. */
        var response = $.data(element, NAME);

        /* jQuery <=1.4.2 returns null instead of undefined when no match is found. We normalize this behavior. */
        return response === null ? undefined : response;
    };

    /*************
        State
    *************/

    /* Velocity registers itself onto a global container (window.jQuery || window.Zepto || window) so that that certain features are accessible beyond just a per-element scope. This master object contains an .animate() method,
       which is later assigned to $.fn (if jQuery or Zepto are present). Accordingly, Velocity can both act on wrapped DOM elements and stand alone for targeting raw DOM elements. */
    /* Note: The global object also doubles as a publicly-accessible data store for the purposes of unit testing. (Capitalized objects are meant for private use, lowercase objects are meant for public use.) */
    /* Note: We alias both the lowercase and uppercase variants of "velocity" to minimize user issues due to the lowercase nature of the $.fn extension. */
    var Velocity = global.Velocity = global.velocity = {
        /* Container for page-wide Velocity state data. */
        State: {
            /* Detect mobile devices to determine if mobileHA should be turned on. */
            isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
            /* The mobileHA option's behavior changes on older Android devices (Gingerbread, versions 2.3.3-2.3.7). */
            isAndroid: /Android/i.test(navigator.userAgent),
            isGingerbread: /Android 2\.3\.[3-7]/i.test(navigator.userAgent),
            /* Create a cached element for re-use when checking for CSS property prefixes. */
            prefixElement: document.createElement("div"),
            /* Cache every prefix match to avoid repeating lookups. */
            prefixMatches: {},
            /* Cache the anchor used for animating window scrolling. */
            scrollAnchor: null,
            /* Cache the property names associated with the scroll anchor. */
            scrollPropertyLeft: null,
            scrollPropertyTop: null,
            /* Keep track of whether our RAF tick is running. */
            isTicking: false,
            /* Container for every in-progress call to Velocity. */
            calls: []
        },
        /* Velocity's custom CSS stack. Made global for unit testing. */
        CSS: { /* Defined below. */ },
        /* Defined by Velocity's optional jQuery shim. */
        Utilities: window.jQuery ? {} : $,
        /* Container for the user's custom animation sequences that are referenced by name via Velocity's first argument (in place of a properties map object). */
        Sequences: {
            /* Manually registered by the user. Learn more: VelocityJS.org/#sequences */
        },
        Easings: {
            /* Defined below. */
        },
        /* Page-wide option defaults, which can be overriden by the user. */
        defaults: {
            queue: "",
            duration: DEFAULT_DURATION,
            easing: DEFAULT_EASING,
            begin: null,
            complete: null,
            progress: null,
            display: null,
            loop: false,
            delay: false,
            mobileHA: true,
            /* Set to false to prevent property values from being cached between immediately consecutive Velocity-initiated calls. See Value Transferring for further details. */
            _cacheValues: true
        },
        /* Velocity's core animation method, subsequently aliased to $.fn. */
        animate: function () { /* Defined below. */ },
        /* Set to true to force a duration of 1ms for all animations so that UI testing can be performed without waiting on animations to complete. */
        mock: false,
        /* Set to 1 or 2 (most verbose) to output debug info to console. */
        debug: false
    };

    /* Retrieve the appropriate scroll anchor and property name for the browser. Learn more: https://developer.mozilla.org/en-US/docs/Web/API/Window.scrollY */
    if (window.pageYOffset !== undefined) {
        Velocity.State.scrollAnchor = window;
        Velocity.State.scrollPropertyLeft = "pageXOffset";
        Velocity.State.scrollPropertyTop = "pageYOffset";
    } else {
        Velocity.State.scrollAnchor = document.documentElement || document.body.parentNode || document.body;
        Velocity.State.scrollPropertyLeft = "scrollLeft";
        Velocity.State.scrollPropertyTop = "scrollTop";
    }

    /**************
        Easing
    **************/

    /* Step easing generator. */
    function generateStep (steps) {
        return function (p) { 
            return Math.round(p * steps) * (1 / steps);
        };   
    }

    /* Bezier curve function generator. Copyright Gaetan Renaudeau. MIT License: http://en.wikipedia.org/wiki/MIT_License */
    var generateBezier = (function () {
        function A (aA1, aA2) {
            return 1.0 - 3.0 * aA2 + 3.0 * aA1;
        }

        function B (aA1, aA2) {
            return 3.0 * aA2 - 6.0 * aA1;
        }
        function C (aA1) {
            return 3.0 * aA1;
        }

        function calcBezier (aT, aA1, aA2) {
            return ((A(aA1, aA2)*aT + B(aA1, aA2))*aT + C(aA1))*aT;
        }

        function getSlope (aT, aA1, aA2) {
            return 3.0 * A(aA1, aA2)*aT*aT + 2.0 * B(aA1, aA2) * aT + C(aA1);
        }

        return function (mX1, mY1, mX2, mY2) {
            /* Must contain four arguments. */
            if (arguments.length !== 4) {
                return false;
            }

            /* Arguments must be numbers. */
            for (var i = 0; i < 4; ++i) {
                if (typeof arguments[i] !== "number" || isNaN(arguments[i]) || !isFinite(arguments[i])) {
                    return false;
                }
            }

            /* X values must be in the [0, 1] range. */
            mX1 = Math.min(mX1, 1);
            mX2 = Math.min(mX2, 1);
            mX1 = Math.max(mX1, 0);
            mX2 = Math.max(mX2, 0);

            function getTForX (aX) {
                var aGuessT = aX;

                for (var i = 0; i < 8; ++i) {
                    var currentSlope = getSlope(aGuessT, mX1, mX2);

                    if (currentSlope === 0.0) {
                        return aGuessT;
                    }

                    var currentX = calcBezier(aGuessT, mX1, mX2) - aX;

                    aGuessT -= currentX / currentSlope;
                }

                return aGuessT;
            }

            return function (aX) {
                if (mX1 === mY1 && mX2 === mY2) {
                    return aX;
                } else {
                    return calcBezier(getTForX(aX), mY1, mY2);
                }
            };
        };
    }());

    /* Runge-Kutta spring physics function generator. Adapted from Framer.js, copyright Koen Bok. MIT License: http://en.wikipedia.org/wiki/MIT_License */
    /* Given a tension, friction, and duration, a simulation at 60FPS will first run without a defined duration in order to calculate the full path. A second pass
       then adjusts the time dela -- using the relation between actual time and duration -- to calculate the path for the duration-constrained animation. */
    var generateSpringRK4 = (function () {

        function springAccelerationForState (state) {
            return (-state.tension * state.x) - (state.friction * state.v);
        }

        function springEvaluateStateWithDerivative (initialState, dt, derivative) {
            var state = {
                x: initialState.x + derivative.dx * dt,
                v: initialState.v + derivative.dv * dt,
                tension: initialState.tension,
                friction: initialState.friction
            };

            return { dx: state.v, dv: springAccelerationForState(state) };
        }

        function springIntegrateState (state, dt) {
            var a = {
                    dx: state.v,
                    dv: springAccelerationForState(state)
                },
                b = springEvaluateStateWithDerivative(state, dt * 0.5, a),
                c = springEvaluateStateWithDerivative(state, dt * 0.5, b),
                d = springEvaluateStateWithDerivative(state, dt, c),
                dxdt = 1.0 / 6.0 * (a.dx + 2.0 * (b.dx + c.dx) + d.dx),
                dvdt = 1.0 / 6.0 * (a.dv + 2.0 * (b.dv + c.dv) + d.dv);

            state.x = state.x + dxdt * dt;
            state.v = state.v + dvdt * dt;

            return state;
        }

        return function springRK4Factory (tension, friction, duration) {

            var initState = {
                    x: -1,
                    v: 0,
                    tension: null,
                    friction: null
                },
                path = [0],
                time_lapsed = 0,
                tolerance = 1 / 10000,
                DT = 16 / 1000,
                have_duration, dt, last_state;

            tension = parseFloat(tension) || 600;
            friction = parseFloat(friction) || 20;
            duration = duration || null;

            initState.tension = tension;
            initState.friction = friction;

            have_duration = duration !== null;

            /* Calculate the actual time it takes for this animation to complete with the provided conditions. */
            if (have_duration) {
                /* Run the simulation without a duration. */
                time_lapsed = springRK4Factory(tension, friction);
                /* Compute the adjusted time delta. */
                dt = time_lapsed / duration * DT;
            } else {
                dt = DT;
            }

            while (true) {
                /* Next/step function .*/
                last_state = springIntegrateState(last_state || initState, dt);
                /* Store the position. */
                path.push(1 + last_state.x);
                time_lapsed += 16;
                /* If the change threshold is reached, break. */
                if (!(Math.abs(last_state.x) > tolerance && Math.abs(last_state.v) > tolerance)) {
                    break;
                }
            }

            /* If duration is not defined, return the actual time required for completing this animation. Otherwise, return a closure that holds the
               computed path and returns a snapshot of the position according to a given percentComplete. */
            return !have_duration ? time_lapsed : function(percentComplete) { return path[ (percentComplete * (path.length - 1)) | 0 ]; };
        };
    }());

    /* Velocity embeds the named easings from jQuery, jQuery UI, and CSS3 in order to save users from having to include additional libraries on their page. */
    (function () {
        /* jQuery's default named easing types. */
        Velocity.Easings["linear"] = function(p) {
            return p;
        };
        Velocity.Easings["swing"] = function(p) {
            return 0.5 - Math.cos(p * Math.PI) / 2;
        };

        /* CSS3's named easing types. */
        Velocity.Easings["ease"] = generateBezier(0.25, 0.1, 0.25, 1.0);
        Velocity.Easings["ease-in"] = generateBezier(0.42, 0.0, 1.00, 1.0);
        Velocity.Easings["ease-out"] = generateBezier(0.00, 0.0, 0.58, 1.0);
        Velocity.Easings["ease-in-out"] = generateBezier(0.42, 0.0, 0.58, 1.0);

        /* jQuery UI's Robert Penner easing equations. Copyright The jQuery Foundation. MIT License: https://jquery.org/license */
        var baseEasings = {};

        $.each(["Quad", "Cubic", "Quart", "Quint", "Expo"], function(i, name) {
            baseEasings[name] = function(p) {
                return Math.pow(p, i + 2);
            };
        });

        $.extend(baseEasings, {
            Sine: function (p) {
                return 1 - Math.cos(p * Math.PI / 2);
            },

            Circ: function (p) {
                return 1 - Math.sqrt(1 - p * p);
            },

            Elastic: function(p) {
                return p === 0 || p === 1 ? p :
                    -Math.pow(2, 8 * (p - 1)) * Math.sin(((p - 1) * 80 - 7.5) * Math.PI / 15);
            },

            Back: function(p) {
                return p * p * (3 * p - 2);
            },

            Bounce: function (p) {
                var pow2,
                    bounce = 4;

                while (p < ((pow2 = Math.pow(2, --bounce)) - 1) / 11) {}
                return 1 / Math.pow(4, 3 - bounce) - 7.5625 * Math.pow((pow2 * 3 - 2) / 22 - p, 2);
            }
        });

        /* jQuery's easing generator for the object above. */
        $.each(baseEasings, function(name, easeIn) {
            Velocity.Easings["easeIn" + name] = easeIn;
            Velocity.Easings["easeOut" + name] = function(p) {
                return 1 - easeIn(1 - p);
            };
            Velocity.Easings["easeInOut" + name] = function(p) {
                return p < 0.5 ?
                    easeIn(p * 2) / 2 :
                    1 - easeIn(p * -2 + 2) / 2;
            };
        });

        /* Bonus "spring" easing, which is a less exaggerated version of easeInOutElastic. */
        Velocity.Easings["spring"] = function(p) {
            return 1 - (Math.cos(p * 4.5 * Math.PI) * Math.exp(-p * 6));
        };
    })();

    /* Determine the appropriate easing type given an easing input. */
    function getEasing(value, duration) {
        var easing = value;

        /* The easing option can either be a string that references a pre-registered easing, or it can be a two-/four-item array of integers to be converted into a bezier/spring function. */
        if (Type.isString(value)) {
            /* Ensure that the easing has been assigned to jQuery's Velocity.Easings object. */
            if (!Velocity.Easings[value]) {
                easing = false;
            }
        } else if (Type.isArray(value) && value.length === 1) {
            easing = generateStep.apply(null, value);
        } else if (Type.isArray(value) && value.length === 2) {
            /* springRK4 must be passed the animation's duration. */
            /* Note: If the springRK4 array contains non-numbers, generateSpringRK4() returns an easing function generated with default tension and friction values. */
            easing = generateSpringRK4.apply(null, value.concat([ duration ]));
        } else if (Type.isArray(value) && value.length === 4) {
            /* Note: If the bezier array contains non-numbers, generateBezier() returns false. */
            easing = generateBezier.apply(null, value);
        } else {
            easing = false;
        }

        /* Revert to the Velocity-wide default easing type, or fall back to "swing" (which is also jQuery's default) if the Velocity-wide default has been incorrectly modified. */
        if (easing === false) {
            if (Velocity.Easings[Velocity.defaults.easing]) {
                easing = Velocity.defaults.easing;
            } else {
                easing = DEFAULT_EASING;
            }
        }

        return easing;
    }

    /*****************
        CSS Stack
    *****************/

    /* The CSS object is a highly condensed and performant CSS stack that fully replaces jQuery's. It handles the validation, getting, and setting of both standard CSS properties and CSS property hooks. */
    /* Note: A "CSS" shorthand is aliased so that our code is easier to read. */
    var CSS = Velocity.CSS = {

        /*************
            RegEx
        *************/

        RegEx: {
            /* Unwrap a property value's surrounding text, e.g. "rgba(4, 3, 2, 1)" ==> "4, 3, 2, 1" and "rect(4px 3px 2px 1px)" ==> "4px 3px 2px 1px". */
            valueUnwrap: /^[A-z]+\((.*)\)$/i,
            wrappedValueAlreadyExtracted: /[0-9.]+ [0-9.]+ [0-9.]+( [0-9.]+)?/,
            /* Split a multi-value property into an array of subvalues, e.g. "rgba(4, 3, 2, 1) 4px 3px 2px 1px" ==> [ "rgba(4, 3, 2, 1)", "4px", "3px", "2px", "1px" ]. */
            valueSplit: /([A-z]+\(.+\))|(([A-z0-9#-.]+?)(?=\s|$))/ig
        },

        /************
            Hooks
        ************/

        /* Hooks allow a subproperty (e.g. "boxShadowBlur") of a compound-value CSS property (e.g. "boxShadow: X Y Blur Spread Color") to be animated as if it were a discrete property. */
        /* Note: Beyond enabling fine-grained property animation, hooking is necessary since Velocity only tweens properties with single numeric values; unlike CSS transitions, Velocity does not interpolate compound-values. */
        Hooks: {
            /********************
                Registration
            ********************/

            /* Templates are a concise way of indicating which subproperties must be individually registered for each compound-value CSS property. */
            /* Each template consists of the compound-value's base name, its constituent subproperty names, and those subproperties' default values. */
            templates: {
                /* Note: Colors are defaulted to white -- as opposed to black -- since colors that are currently set to "transparent" default to their respective template below when color-animated,
                   and white is typically a closer match to transparent than black is. */
                "color": [ "Red Green Blue Alpha", "255 255 255 1" ],
                "backgroundColor": [ "Red Green Blue Alpha", "255 255 255 1" ],
                "borderColor": [ "Red Green Blue Alpha", "255 255 255 1" ],
                "borderTopColor": [ "Red Green Blue Alpha", "255 255 255 1" ],
                "borderRightColor": [ "Red Green Blue Alpha", "255 255 255 1" ],
                "borderBottomColor": [ "Red Green Blue Alpha", "255 255 255 1" ],
                "borderLeftColor": [ "Red Green Blue Alpha", "255 255 255 1" ],
                "outlineColor": [ "Red Green Blue Alpha", "255 255 255 1" ],
                "textShadow": [ "Color X Y Blur", "black 0px 0px 0px" ],
                /* Todo: Add support for inset boxShadows. (webkit places it last whereas IE places it first.) */
                "boxShadow": [ "Color X Y Blur Spread", "black 0px 0px 0px 0px" ],
                "clip": [ "Top Right Bottom Left", "0px 0px 0px 0px" ],
                "backgroundPosition": [ "X Y", "0% 0%" ],
                "transformOrigin": [ "X Y Z", "50% 50% 0%" ],
                "perspectiveOrigin": [ "X Y", "50% 50%" ]
            },

            /* A "registered" hook is one that has been converted from its template form into a live, tweenable property. It contains data to associate it with its root property. */
            registered: {
                /* Note: A registered hook looks like this ==> textShadowBlur: [ "textShadow", 3 ], which consists of the subproperty's name, the associated root property's name,
                   and the subproperty's position in the root's value. */
            },
            /* Convert the templates into individual hooks then append them to the registered object above. */
            register: function () {
                var rootProperty,
                    hookTemplate,
                    hookNames;

                /* In IE, color values inside compound-value properties are positioned at the end the value instead of at the beginning. Thus, we re-arrange the templates accordingly. */
                if (IE) {
                    for (rootProperty in CSS.Hooks.templates) {
                        hookTemplate = CSS.Hooks.templates[rootProperty];
                        hookNames = hookTemplate[0].split(" ");

                        var defaultValues = hookTemplate[1].match(CSS.RegEx.valueSplit);

                        if (hookNames[0] === "Color") {
                            /* Reposition both the hook's name and its default value to the end of their respective strings. */
                            hookNames.push(hookNames.shift());
                            defaultValues.push(defaultValues.shift());

                            /* Replace the existing template for the hook's root property. */
                            CSS.Hooks.templates[rootProperty] = [ hookNames.join(" "), defaultValues.join(" ") ];
                        }
                    }
                 }

                /* Hook registration. */
                for (rootProperty in CSS.Hooks.templates) {
                    hookTemplate = CSS.Hooks.templates[rootProperty];
                    hookNames = hookTemplate[0].split(" ");

                    for (var i in hookNames) {
                        var fullHookName = rootProperty + hookNames[i],
                            hookPosition = i;

                        /* For each hook, register its full name (e.g. textShadowBlur) with its root property (e.g. textShadow) and the hook's position in its template's default value string. */
                        CSS.Hooks.registered[fullHookName] = [ rootProperty, hookPosition ];
                    }
                }
            },

            /*****************************
               Injection and Extraction
            *****************************/

            /* Look up the root property associated with the hook (e.g. return "textShadow" for "textShadowBlur"). */
            /* Since a hook cannot be set directly (the browser won't recognize it), style updating for hooks is routed through the hook's root property. */
            getRoot: function (property) {
                var hookData = CSS.Hooks.registered[property];

                if (hookData) {
                    return hookData[0];
                } else {
                    /* If there was no hook match, return the property name untouched. */
                    return property;
                }
            },
            /* Convert any rootPropertyValue, null or otherwise, into a space-delimited list of hook values so that the targeted hook can be injected or extracted at its standard position. */
            cleanRootPropertyValue: function(rootProperty, rootPropertyValue) {
                /* If the rootPropertyValue is wrapped with "rgb()", "clip()", etc., remove the wrapping to normalize the value before manipulation. */
                if (CSS.RegEx.valueUnwrap.test(rootPropertyValue)) {
                    rootPropertyValue = rootPropertyValue.match(CSS.Hooks.RegEx.valueUnwrap)[1];
                }

                /* If rootPropertyValue is a CSS null-value (from which there's inherently no hook value to extract), default to the root's default value as defined in CSS.Hooks.templates. */
                /* Note: CSS null-values include "none", "auto", and "transparent". They must be converted into their zero-values (e.g. textShadow: "none" ==> textShadow: "0px 0px 0px black") for hook manipulation to proceed. */
                if (CSS.Values.isCSSNullValue(rootPropertyValue)) {
                    rootPropertyValue = CSS.Hooks.templates[rootProperty][1];
                }

                return rootPropertyValue;
            },
            /* Extracted the hook's value from its root property's value. This is used to get the starting value of an animating hook. */
            extractValue: function (fullHookName, rootPropertyValue) {
                var hookData = CSS.Hooks.registered[fullHookName];

                if (hookData) {
                    var hookRoot = hookData[0],
                        hookPosition = hookData[1];

                    rootPropertyValue = CSS.Hooks.cleanRootPropertyValue(hookRoot, rootPropertyValue);

                    /* Split rootPropertyValue into its constituent hook values then grab the desired hook at its standard position. */
                    return rootPropertyValue.toString().match(CSS.RegEx.valueSplit)[hookPosition];
                } else {
                    /* If the provided fullHookName isn't a registered hook, return the rootPropertyValue that was passed in. */
                    return rootPropertyValue;
                }
            },
            /* Inject the hook's value into its root property's value. This is used to piece back together the root property once Velocity has updated one of its individually hooked values through tweening. */
            injectValue: function (fullHookName, hookValue, rootPropertyValue) {
                var hookData = CSS.Hooks.registered[fullHookName];

                if (hookData) {
                    var hookRoot = hookData[0],
                        hookPosition = hookData[1],
                        rootPropertyValueParts,
                        rootPropertyValueUpdated;

                    rootPropertyValue = CSS.Hooks.cleanRootPropertyValue(hookRoot, rootPropertyValue);

                    /* Split rootPropertyValue into its individual hook values, replace the targeted value with hookValue, then reconstruct the rootPropertyValue string. */
                    rootPropertyValueParts = rootPropertyValue.toString().match(CSS.RegEx.valueSplit);
                    rootPropertyValueParts[hookPosition] = hookValue;
                    rootPropertyValueUpdated = rootPropertyValueParts.join(" ");

                    return rootPropertyValueUpdated;
                } else {
                    /* If the provided fullHookName isn't a registered hook, return the rootPropertyValue that was passed in. */
                    return rootPropertyValue;
                }
            }
        },

        /*******************
           Normalizations
        *******************/

        /* Normalizations standardize CSS property manipulation by pollyfilling browser-specific implementations (e.g. opacity) and reformatting special properties (e.g. clip, rgba) to look like standard ones. */
        Normalizations: {
            /* Normalizations are passed a normalization target (either the property's name, its extracted value, or its injected value), the targeted element (which may need to be queried), and the targeted property value. */
            registered: {
                clip: function(type, element, propertyValue) {
                    switch (type) {
                        case "name":
                            return "clip";
                        /* Clip needs to be unwrapped and stripped of its commas during extraction. */
                        case "extract":
                            var extracted;

                            /* If Velocity also extracted this value, skip extraction. */
                            if (CSS.RegEx.wrappedValueAlreadyExtracted.test(propertyValue)) {
                                extracted = propertyValue;
                            } else {
                                /* Remove the "rect()" wrapper. */
                                extracted = propertyValue.toString().match(CSS.RegEx.valueUnwrap);

                                /* Strip off commas. */
                                extracted = extracted ? extracted[1].replace(/,(\s+)?/g, " ") : propertyValue;
                            }

                            return extracted;
                        /* Clip needs to be re-wrapped during injection. */
                        case "inject":
                            return "rect(" + propertyValue + ")";
                    }
                },

                /* <=IE8 do not support the standard opacity property. They use filter:alpha(opacity=INT) instead. */
                opacity: function (type, element, propertyValue) {
                    if (IE <= 8) {
                        switch (type) {
                            case "name":
                                return "filter";
                            case "extract":
                                /* <=IE8 return a "filter" value of "alpha(opacity=\d{1,3})". Extract the value and convert it to a decimal value to match the standard CSS opacity property's formatting. */
                                var extracted = propertyValue.toString().match(/alpha\(opacity=(.*)\)/i);

                                if (extracted) {
                                    /* Convert to decimal value. */
                                    propertyValue = extracted[1] / 100;
                                } else {
                                    /* When extracting opacity, default to 1 (fully visible) since a null value means opacity hasn't been set and the element is therefore fully visible. */
                                    propertyValue = 1;
                                }

                                return propertyValue;
                            case "inject":
                                /* Opacified elements are required to have their zoom property set to a non-zero value. */
                                element.style.zoom = 1;

                                /* Setting the filter property on elements with certain font property combinations can result in a highly unappealing ultra-bolding effect. There's no way to remedy this throughout a tween,
                                   but dropping the value altogether (when opacity hits 1) at leasts ensures that the glitch is gone post-tweening. */
                                if (parseFloat(propertyValue) >= 1) {
                                    return "";
                                } else {
                                  /* As per the filter property's spec, convert the decimal value to a whole number and wrap the value. */
                                  return "alpha(opacity=" + parseInt(parseFloat(propertyValue) * 100, 10) + ")";
                                }
                        }
                    /* With all other browsers, normalization is not required; return the same values that were passed in. */
                    } else {
                        switch (type) {
                            case "name":
                                return "opacity";
                            case "extract":
                                return propertyValue;
                            case "inject":
                                return propertyValue;
                        }
                    }
                }
            },

            /*****************************
                Batched Registrations
            *****************************/

            /* Note: Batched normalizations extend the CSS.Normalizations.registered object. */
            register: function () {

                /*****************
                    Transforms
                *****************/

                /* Transforms are the subproperties contained by the CSS "transform" property. Transforms must undergo normalization so that they can be referenced in a properties map by their individual names. */
                /* Note: When transforms are "set", they are actually assigned to a per-element transformCache. When all transform setting is complete complete, CSS.flushTransformCache() must be manually called to flush the values to the DOM.
                   Transform setting is batched in this way to improve performance: the transform style only needs to be updated once when multiple transform subproperties are being animated simultaneously. */
                var transformProperties = [ "translateX", "translateY", "scale", "scaleX", "scaleY", "skewX", "skewY", "rotateZ" ];

                /* IE9 and Android Gingerbread have support for 2D -- but not 3D -- transforms. Since animating unsupported transform properties results in the browser ignoring the *entire* transform string, we prevent these 3D values
                   from being normalized for these browsers so that tweening skips these properties altogether (since it will ignore them as being unsupported by the browser.) */
                if (!(IE <= 9) && !Velocity.State.isGingerbread) {
                    /* Append 3D transform properties onto transformProperties. */
                    /* Note: Since the standalone CSS "perspective" property and the CSS transform "perspective" subproperty share the same name, the latter is given a unique token within Velocity: "transformPerspective". */
                    transformProperties = transformProperties.concat([ "transformPerspective", "translateZ", "scaleZ", "rotateX", "rotateY" ]);
                }

                for (var i = 0, transformPropertiesLength = transformProperties.length; i < transformPropertiesLength; i++) {
                    /* Wrap the dynamically generated normalization function in a new scope so that transformName's value is paired with its respective function. (Otherwise, all functions would take the final for loop's transformName.) */
                    (function() {
                        var transformName = transformProperties[i];

                        CSS.Normalizations.registered[transformName] = function (type, element, propertyValue) {
                            switch (type) {
                                /* The normalized property name is the parent "transform" property -- the property that is actually set in CSS. */
                                case "name":
                                    return "transform";
                                /* Transform values are cached onto a per-element transformCache object. */
                                case "extract":
                                    /* If this transform has yet to be assigned a value, return its null value. */
                                    if (Data(element).transformCache[transformName] === undefined) {
                                        /* Scale transformProperties default to 1 whereas all other transform properties default to 0. */
                                        return /^scale/i.test(transformName) ? 1 : 0;
                                    /* When transform values are set, they are wrapped in parentheses as per the CSS spec. Thus, when extracting their values (for tween calculations), we strip off the parentheses. */
                                    } else {
                                        return Data(element).transformCache[transformName].replace(/[()]/g, "");
                                    }
                                case "inject":
                                    var invalid = false;

                                    /* If an individual transform property contains an unsupported unit type, the browser ignores the *entire* transform property.
                                       Thus, protect users from themselves by skipping setting for transform values supplied with invalid unit types. */
                                    /* Switch on the base transform type; ignore the axis by removing the last letter from the transform's name. */
                                    switch (transformName.substr(0, transformName.length - 1)) {
                                        /* Whitelist unit types for each transform. */
                                        case "translate":
                                            invalid = !/(%|px|em|rem|\d)$/i.test(propertyValue);
                                            break;
                                        /* Since an axis-free "scale" property is supported as well, a little hack is used here to detect it by chopping off its last letter. */
                                        case "scal":
                                        case "scale":
                                            /* Chrome on Android has a bug in which scaled elements blur if their initial scale value is below 1 (which can happen with forcefeeding). Thus, we detect a yet-unset scale property
                                               and ensure that its first value is always 1. More info here: http://stackoverflow.com/questions/10417890/css3-animations-with-transform-causes-blurred-elements-on-webkit/10417962#10417962 */
                                            if (Velocity.State.isAndroid && Data(element).transformCache[transformName] === undefined) {
                                                propertyValue = 1;
                                            }

                                            invalid = !/(\d)$/i.test(propertyValue);
                                            break;
                                        case "skew":
                                            invalid = !/(deg|\d)$/i.test(propertyValue);
                                            break;
                                        case "rotate":
                                            invalid = !/(deg|\d)$/i.test(propertyValue);
                                            break;
                                    }

                                    if (!invalid) {
                                        /* As per the CSS spec, wrap the value in parentheses. */
                                        Data(element).transformCache[transformName] = "(" + propertyValue + ")";
                                    }

                                    /* Although the value is set on the transformCache object, return the newly-updated value for the calling code to process as normal. */
                                    return Data(element).transformCache[transformName];
                            }
                        };
                    })();
                }

                /*************
                    Colors
                *************/

                /* Since Velocity only animates a single numeric value per property, color animation is achieved by hooking the individual RGBA components of CSS color properties.
                   Accordingly, color values must be normalized (e.g. "#ff0000", "red", and "rgb(255, 0, 0)" ==> "255 0 0 1") so that their components can be injected/extracted by CSS.Hooks logic. */
                var colorProperties = [ "color", "backgroundColor", "borderColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor" ];

                for (var i = 0, colorPropertiesLength = colorProperties.length; i < colorPropertiesLength; i++) {
                    /* Hex to RGB conversion. Copyright Tim Down: http://stackoverflow.com/questions/5623838/rgb-to-hex-and-hex-to-rgb */
                    function hexToRgb (hex) {
                        var shortformRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i,
                            longformRegex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i,
                            rgbParts;

                        hex = hex.replace(shortformRegex, function (m, r, g, b) {
                            return r + r + g + g + b + b;
                        });

                        rgbParts = longformRegex.exec(hex);

                        return rgbParts ? "rgb(" + (parseInt(rgbParts[1], 16) + " " + parseInt(rgbParts[2], 16) + " " + parseInt(rgbParts[3], 16)) + ")" : "rgb(0 0 0)";
                    }

                    /* Wrap the dynamically generated normalization function in a new scope so that colorName's value is paired with its respective function. (Otherwise, all functions would take the final for loop's colorName.) */
                    (function () {
                        var colorName = colorProperties[i];

                        /* Note: In IE<=8, which support rgb but not rgba, colorProperties are reverted to rgb by stripping off the alpha component. */
                        CSS.Normalizations.registered[colorName] = function(type, element, propertyValue) {
                            switch (type) {
                                case "name":
                                    return colorName;
                                /* Convert all color values into the rgb format. (Old IE can return hex values and color names instead of rgb/rgba.) */
                                case "extract":
                                    var extracted;

                                    /* If the color is already in its hookable form (e.g. "255 255 255 1") due to having been previously extracted, skip extraction. */
                                    if (CSS.RegEx.wrappedValueAlreadyExtracted.test(propertyValue)) {
                                        extracted = propertyValue;
                                    } else {
                                        var converted,
                                            colorNames = {
                                                aqua: "rgb(0, 255, 255);",
                                                black: "rgb(0, 0, 0)",
                                                blue: "rgb(0, 0, 255)",
                                                fuchsia: "rgb(255, 0, 255)",
                                                gray: "rgb(128, 128, 128)",
                                                green: "rgb(0, 128, 0)",
                                                lime: "rgb(0, 255, 0)",
                                                maroon: "rgb(128, 0, 0)",
                                                navy: "rgb(0, 0, 128)",
                                                olive: "rgb(128, 128, 0)",
                                                purple: "rgb(128, 0, 128)",
                                                red: "rgb(255, 0, 0)",
                                                silver: "rgb(192, 192, 192)",
                                                teal: "rgb(0, 128, 128)",
                                                white: "rgb(255, 255, 255)",
                                                yellow: "rgb(255, 255, 0)"
                                            };

                                        /* Convert color names to rgb. */
                                        if (/^[A-z]+$/i.test(propertyValue)) {
                                            if (colorNames[propertyValue] !== undefined) {
                                                converted = colorNames[propertyValue]
                                            } else {
                                                /* If an unmatched color name is provided, default to black. */
                                                converted = colorNames.black;
                                            }
                                        /* Convert hex values to rgb. */
                                        } else if (/^#([A-f\d]{3}){1,2}$/i.test(propertyValue)) {
                                            converted = hexToRgb(propertyValue);
                                        /* If the provided color doesn't match any of the accepted color formats, default to black. */
                                        } else if (!(/^rgba?\(/i.test(propertyValue))) {
                                            converted = colorNames.black;
                                        }

                                        /* Remove the surrounding "rgb/rgba()" string then replace commas with spaces and strip repeated spaces (in case the value included spaces to begin with). */
                                        extracted = (converted || propertyValue).toString().match(CSS.RegEx.valueUnwrap)[1].replace(/,(\s+)?/g, " ");
                                    }

                                    /* So long as this isn't <=IE8, add a fourth (alpha) component if it's missing and default it to 1 (visible). */
                                    if (!(IE <= 8) && extracted.split(" ").length === 3) {
                                        extracted += " 1";
                                    }

                                    return extracted;
                                case "inject":
                                    /* If this is IE<=8 and an alpha component exists, strip it off. */
                                    if (IE <= 8) {
                                        if (propertyValue.split(" ").length === 4) {
                                            propertyValue = propertyValue.split(/\s+/).slice(0, 3).join(" ");
                                        }
                                    /* Otherwise, add a fourth (alpha) component if it's missing and default it to 1 (visible). */
                                    } else if (propertyValue.split(" ").length === 3) {
                                        propertyValue += " 1";
                                    }

                                    /* Re-insert the browser-appropriate wrapper("rgb/rgba()"), insert commas, and strip off decimal units on all values but the fourth (R, G, and B only accept whole numbers). */
                                    return (IE <= 8 ? "rgb" : "rgba") + "(" + propertyValue.replace(/\s+/g, ",").replace(/\.(\d)+(?=,)/g, "") + ")";
                            }
                        };
                    })();
                }
            }
        },

        /************************
           CSS Property Names
        ************************/

        Names: {
            /* Camelcase a property name into its JavaScript notation (e.g. "background-color" ==> "backgroundColor"). Camelcasing is used to normalize property names between and across calls. */
            camelCase: function (property) {
                return property.replace(/-(\w)/g, function (match, subMatch) {
                    return subMatch.toUpperCase();
                });
            },

            /* Determine whether a property should be set with a vendor prefix. */
            /* If a prefixed version of the property exists, return it. Otherwise, return the original property name. If the property is not at all supported by the browser, return a false flag. */
            prefixCheck: function (property) {
                /* If this property has already been checked, return the cached value. */
                if (Velocity.State.prefixMatches[property]) {
                    return [ Velocity.State.prefixMatches[property], true ];
                } else {
                    var vendors = [ "", "Webkit", "Moz", "ms", "O" ];

                    for (var i = 0, vendorsLength = vendors.length; i < vendorsLength; i++) {
                        var propertyPrefixed;

                        if (i === 0) {
                            propertyPrefixed = property;
                        } else {
                            /* Capitalize the first letter of the property to conform to JavaScript vendor prefix notation (e.g. webkitFilter). */
                            propertyPrefixed = vendors[i] + property.replace(/^\w/, function(match) { return match.toUpperCase(); });
                        }

                        /* Check if the browser supports this property as prefixed. */
                        if (Type.isString(Velocity.State.prefixElement.style[propertyPrefixed])) {
                            /* Cache the match. */
                            Velocity.State.prefixMatches[property] = propertyPrefixed;

                            return [ propertyPrefixed, true ];
                        }
                    }

                    /* If the browser doesn't support this property in any form, include a false flag so that the caller can decide how to proceed. */
                    return [ property, false ];
                }
            }
        },

        /************************
           CSS Property Values
        ************************/

        Values: {
            isCSSNullValue: function (value) {
                /* The browser defaults CSS values that have not been set to either 0 or one of several possible null-value strings. Thus, we check for both falsiness and these special strings. */
                /* Null-value checking is performed to default the special strings to 0 (for the sake of tweening) or their hook templates as defined as CSS.Hooks (for the sake of hook injection/extraction). */
                /* Note: Chrome returns "rgba(0, 0, 0, 0)" for an undefined color whereas IE returns "transparent". */
                return (value == 0 || /^(none|auto|transparent|(rgba\(0, ?0, ?0, ?0\)))$/i.test(value));
            },
            /* Retrieve a property's default unit type. Used for assigning a unit type when one is not supplied by the user. */
            getUnitType: function (property) {
                if (/^(rotate|skew)/i.test(property)) {
                    return "deg";
                } else if (/(^(scale|scaleX|scaleY|scaleZ|opacity|alpha|fillOpacity|flexGrow|flexHeight|zIndex|fontWeight)$)|color/i.test(property)) {
                    /* The above properties are unitless. */
                    return "";
                } else {
                    /* Default to px for all other properties. */
                    return "px";
                }
            },
            /* HTML elements default to an associated display type when they're not set to display:none. */
            /* Note: This function is used for correctly setting the non-"none" display value in certain Velocity sequences, such as fadeIn/Out. */
            getDisplayType: function (element) {
                var tagName = element.tagName.toString().toLowerCase();

                if (/^(b|big|i|small|tt|abbr|acronym|cite|code|dfn|em|kbd|strong|samp|var|a|bdo|br|img|map|object|q|script|span|sub|sup|button|input|label|select|textarea)$/i.test(tagName)) {
                    return "inline";
                } else if (/^(li)$/i.test(tagName)) {
                    return "list-item";
                } else if (/^(tr)$/i.test(tagName)) {
                    return "table-row";
                /* Default to "block" when no match is found. */
                } else {
                    return "block";
                }
            }
        },

        /****************************
           Style Getting & Setting
        ****************************/

        /* The singular getPropertyValue, which routes the logic for all normalizations, hooks, and standard CSS properties. */
        getPropertyValue: function (element, property, rootPropertyValue, forceStyleLookup) {
            /* Get an element's computed property value. */
            /* Note: Retrieving the value of a CSS property cannot simply be performed by checking an element's style attribute (which only reflects user-defined values).
               Instead, the browser must be queried for a property's *computed* value. You can read more about getComputedStyle here: https://developer.mozilla.org/en/docs/Web/API/window.getComputedStyle */
            function computePropertyValue (element, property) {
                /* When box-sizing isn't set to border-box, height and width style values are incorrectly computed when an element's scrollbars are visible (which expands the element's dimensions). Thus, we defer
                   to the more accurate offsetHeight/Width property, which includes the total dimensions for interior, border, padding, and scrollbar. We subtract border and padding to get the sum of interior + scrollbar. */

                var computedValue = 0;

                /* IE<=8 doesn't support window.getComputedStyle, thus we defer to jQuery, which has an extensive array of hacks to accurately retrieve IE8 property values.
                   Re-implementing that logic here is not worth bloating the codebase for a dying browser. The performance repercussions of using jQuery here are minimal since
                   Velocity is optimized to rarely (and sometimes never) query the DOM. Further, the $.css() codepath isn't that slow. */
                if (IE <= 8) {
                    computedValue = $.css(element, property); /* GET */
                /* All other browsers support getComputedStyle. The returned live object reference is cached onto its associated element so that it does not need to be refetched upon every GET. */
                } else {
                    if (!forceStyleLookup) {
                        if (property === "height" && CSS.getPropertyValue(element, "boxSizing").toString().toLowerCase() !== "border-box") {
                            return element.offsetHeight - (parseFloat(CSS.getPropertyValue(element, "borderTopWidth")) || 0) - (parseFloat(CSS.getPropertyValue(element, "borderBottomWidth")) || 0) - (parseFloat(CSS.getPropertyValue(element, "paddingTop")) || 0) - (parseFloat(CSS.getPropertyValue(element, "paddingBottom")) || 0);
                        } else if (property === "width" && CSS.getPropertyValue(element, "boxSizing").toString().toLowerCase() !== "border-box") {
                            return element.offsetWidth - (parseFloat(CSS.getPropertyValue(element, "borderLeftWidth")) || 0) - (parseFloat(CSS.getPropertyValue(element, "borderRightWidth")) || 0) - (parseFloat(CSS.getPropertyValue(element, "paddingLeft")) || 0) - (parseFloat(CSS.getPropertyValue(element, "paddingRight")) || 0);
                        }
                    }

                    var computedStyle;

                    /* For elements that Velocity hasn't been called on directly (e.g. when Velocity queries the DOM on behalf of a parent of an element its animating), perform a direct getComputedStyle lookup since the object isn't cached. */
                    if (Data(element) === undefined) {
                        computedStyle = window.getComputedStyle(element, null); /* GET */
                    /* If the computedStyle object has yet to be cached, do so now. */
                    } else if (!Data(element).computedStyle) {
                        computedStyle = Data(element).computedStyle = window.getComputedStyle(element, null); /* GET */
                    /* If computedStyle is cached, use it. */
                    } else {
                        computedStyle = Data(element).computedStyle;
                    }

                    /* IE doesn't return a value for borderColor -- it only returns individual values for each border side's color. As a polyfill, default to querying for just the top border's color. */
                    if (IE && property === "borderColor") {
                        property = "borderTopColor";
                    }

                    /* IE9 has a bug in which the "filter" property must be accessed from computedStyle using the getPropertyValue method instead of a direct property lookup.
                       The getPropertyValue method is slower than a direct lookup, which is why we avoid it by default. */
                    if (IE === 9 && property === "filter") {
                        computedValue = computedStyle.getPropertyValue(property); /* GET */
                    } else {
                        computedValue = computedStyle[property];
                    }

                    /* Fall back to the property's style value (if defined) when computedValue returns nothing, which can happen when the element hasn't been painted. */
                    if (computedValue === "" || computedValue === null) {
                        computedValue = element.style[property];
                    }
                }

                /* For top, right, bottom, and left (TRBL) values that are set to "auto" on elements of "fixed" or "absolute" position, defer to jQuery for converting "auto" to a numeric value.
                   (For elements with a "static" or "relative" position, "auto" has the same effect as being set to 0, so no conversion is necessary.) */
                /* An example of why numeric conversion is necessary: When an element with "position:absolute" has an untouched "left" property, which reverts to "auto", left's value is 0 relative to its parent element,
                   but is often non-zero relative to its *containing* (not parent) element, which is the nearest "position:relative" ancestor or the viewport (and always the viewport in the case of "position:fixed"). */
                if (computedValue === "auto" && /^(top|right|bottom|left)$/i.test(property)) {
                    var position = computePropertyValue(element, "position"); /* GET */

                    /* For absolute positioning, jQuery's $.position() only returns values for top and left; right and bottom will have their "auto" value reverted to 0. */
                    /* Note: A jQuery object must be created here since jQuery doesn't have a low-level alias for $.position(). Not a big deal since we're currently in a GET batch anyway. */
                    if (position === "fixed" || (position === "absolute" && /top|left/i.test(property))) {
                        /* Note: jQuery strips the pixel unit from its returned values; we re-add it here to conform with computePropertyValue's behavior. */
                        computedValue = $(element).position()[property] + "px"; /* GET */
                    }
                }

                return computedValue;
            }

            var propertyValue;

            /* If this is a hooked property (e.g. "clipLeft" instead of the root property of "clip"), extract the hook's value from a normalized rootPropertyValue using CSS.Hooks.extractValue(). */
            if (CSS.Hooks.registered[property]) {
                var hook = property,
                    hookRoot = CSS.Hooks.getRoot(hook);

                /* If a cached rootPropertyValue wasn't passed in (which Velocity always attempts to do in order to avoid requerying the DOM), query the DOM for the root property's value. */
                if (rootPropertyValue === undefined) {
                    /* Since the browser is now being directly queried, use the official post-prefixing property name for this lookup. */
                    rootPropertyValue = CSS.getPropertyValue(element, CSS.Names.prefixCheck(hookRoot)[0]); /* GET */
                }

                /* If this root has a normalization registered, peform the associated normalization extraction. */
                if (CSS.Normalizations.registered[hookRoot]) {
                    rootPropertyValue = CSS.Normalizations.registered[hookRoot]("extract", element, rootPropertyValue);
                }

                /* Extract the hook's value. */
                propertyValue = CSS.Hooks.extractValue(hook, rootPropertyValue);

            /* If this is a normalized property (e.g. "opacity" becomes "filter" in <=IE8) or "translateX" becomes "transform"), normalize the property's name and value, and handle the special case of transforms. */
            /* Note: Normalizing a property is mutually exclusive from hooking a property since hook-extracted values are strictly numerical and therefore do not require normalization extraction. */
            } else if (CSS.Normalizations.registered[property]) {
                var normalizedPropertyName,
                    normalizedPropertyValue;

                normalizedPropertyName = CSS.Normalizations.registered[property]("name", element);

                /* Transform values are calculated via normalization extraction (see below), which checks against the element's transformCache. At no point do transform GETs ever actually query the DOM; initial stylesheet values are never processed.
                   This is because parsing 3D transform matrices is not always accurate and would bloat our codebase; thus, normalization extraction defaults initial transform values to their zero-values (e.g. 1 for scaleX and 0 for translateX). */
                if (normalizedPropertyName !== "transform") {
                    normalizedPropertyValue = computePropertyValue(element, CSS.Names.prefixCheck(normalizedPropertyName)[0]); /* GET */

                    /* If the value is a CSS null-value and this property has a hook template, use that zero-value template so that hooks can be extracted from it. */
                    if (CSS.Values.isCSSNullValue(normalizedPropertyValue) && CSS.Hooks.templates[property]) {
                        normalizedPropertyValue = CSS.Hooks.templates[property][1];
                    }
                }

                propertyValue = CSS.Normalizations.registered[property]("extract", element, normalizedPropertyValue);
            }

            /* If a value wasn't produced via hook extraction or normalization, query the DOM. */
            if (!/^[\d-]/.test(propertyValue)) {
                propertyValue = computePropertyValue(element, CSS.Names.prefixCheck(property)[0]); /* GET */
            }

            /* Since property lookups are for animation purposes (which entails computing the numeric delta between start and end values), convert CSS null-values to an integer of value 0. */
            if (CSS.Values.isCSSNullValue(propertyValue)) {
                propertyValue = 0;
            }

            if (Velocity.debug >= 2) console.log("Get " + property + ": " + propertyValue);

            return propertyValue;
        },

        /* The singular setPropertyValue, which routes the logic for all normalizations, hooks, and standard CSS properties. */
        setPropertyValue: function(element, property, propertyValue, rootPropertyValue, scrollData) {
            var propertyName = property;

            /* In order to be subjected to call options and element queueing, scroll animation is routed through Velocity as if it were a standard CSS property. */
            if (property === "scroll") {
                /* If a container option is present, scroll the container instead of the browser window. */
                if (scrollData.container) {
                    scrollData.container["scroll" + scrollData.direction] = propertyValue;
                /* Otherwise, Velocity defaults to scrolling the browser window. */
                } else {
                    if (scrollData.direction === "Left") {
                        window.scrollTo(propertyValue, scrollData.alternateValue);
                    } else {
                        window.scrollTo(scrollData.alternateValue, propertyValue);
                    }
                }
            } else {
                /* Transforms (translateX, rotateZ, etc.) are applied to a per-element transformCache object, which is manually flushed via flushTransformCache(). Thus, for now, we merely cache transforms being SET. */
                if (CSS.Normalizations.registered[property] && CSS.Normalizations.registered[property]("name", element) === "transform") {
                    /* Perform a normalization injection. */
                    /* Note: The normalization logic handles the transformCache updating. */
                    CSS.Normalizations.registered[property]("inject", element, propertyValue);

                    propertyName = "transform";
                    propertyValue = Data(element).transformCache[property];
                } else {
                    /* Inject hooks. */
                    if (CSS.Hooks.registered[property]) {
                        var hookName = property,
                            hookRoot = CSS.Hooks.getRoot(property);

                        /* If a cached rootPropertyValue was not provided, query the DOM for the hookRoot's current value. */
                        rootPropertyValue = rootPropertyValue || CSS.getPropertyValue(element, hookRoot); /* GET */

                        propertyValue = CSS.Hooks.injectValue(hookName, propertyValue, rootPropertyValue);
                        property = hookRoot;
                    }

                    /* Normalize names and values. */
                    if (CSS.Normalizations.registered[property]) {
                        propertyValue = CSS.Normalizations.registered[property]("inject", element, propertyValue);
                        property = CSS.Normalizations.registered[property]("name", element);
                    }

                    /* Assign the appropriate vendor prefix before perform an official style update. */
                    propertyName = CSS.Names.prefixCheck(property)[0];

                    /* A try/catch is used for IE<=8, which throws an error when "invalid" CSS values are set, e.g. a negative width. Try/catch is avoided for other browsers since it incurs a performance overhead. */
                    if (IE <= 8) {
                        try {
                            element.style[propertyName] = propertyValue;
                        } catch (e) { console.log("Error setting [" + propertyName + "] to [" + propertyValue + "]"); }
                    } else {
                        element.style[propertyName] = propertyValue;
                    }

                    if (Velocity.debug >= 2) console.log("Set " + property + " (" + propertyName + "): " + propertyValue);
                }
            }

            /* Return the normalized property name and value in case the caller wants to know how these values were modified before being applied to the DOM. */
            return [ propertyName, propertyValue ];
        },

        /* To increase performance by batching transform updates into a single SET, transforms are not directly applied to an element until flushTransformCache() is called. */
        /* Note: Velocity does not apply transform values in the same order that they were defined in the call's property map. Doing so would become problematic since there'd
           be no indication of how an element's existing transforms should be re-ordered along with the new ones. */
        flushTransformCache: function(element) {
            var transformString = "",
                transformName,
                transformValue,
                perspective;

            /* Transform properties are stored as members of the transformCache object. Concatenate all the members into a string. */
            for (transformName in Data(element).transformCache) {
                transformValue = Data(element).transformCache[transformName];

                /* Transform's perspective subproperty must be set first in order to take effect. We store it for now. */
                if (transformName === "transformPerspective") {
                    perspective = transformValue;
                    continue;
                }

                /* IE9 only supports one rotation type, rotateZ, which it refers to as "rotate". */
                if (IE === 9 && transformName === "rotateZ") {
                    transformName = "rotate";
                }

                transformString += transformName + transformValue + " ";
            }

            /* If present, set the perspective subproperty first. */
            if (perspective) {
                transformString = "perspective" + perspective + " " + transformString;
            }

            CSS.setPropertyValue(element, "transform", transformString);
        }
    };

    /* Register hooks and normalizations. */
    CSS.Hooks.register();
    CSS.Normalizations.register();

    /**********************
       Velocity.animate
    **********************/

    Velocity.animate = function() {

        /*******************
            Return Chain
        *******************/

        /* Returns the appropriate element set type (depending on whether jQuery/Zepto-wrapped elements were passed in) back to the call chain. Used for exiting out of Velocity.animate(). */
        function getChain () {
            return elementsWrapped || elements;
        }

        /*************************
           Arguments Assignment
        *************************/

        /* To allow for expressive CoffeeScript code, Velocity supports an alternative syntax in which "properties" and "options" objects are defined on a container object that's passed in as Velocity's sole argument. */
        /* Note: Some browsers automatically populate arguments with a "properties" object. We detect it by checking for its default "names" property. */
        var syntacticSugar = (arguments[0] && (($.isPlainObject(arguments[0].properties) && !arguments[0].properties.names) || Type.isString(arguments[0].properties))),
            /* When Velocity is called via the utility function ($.Velocity.animate()/Velocity.animate()), elements are explicitly passed in as the first parameter. Thus, argument positioning varies. We normalize them here. */
            elementsWrapped,
            argumentIndex;

        var elements,
            propertiesMap,
            options;

        /* Detect jQuery/Zepto elements being animated via the $.fn method. */
        if (Type.isWrapped(this)) {
            argumentIndex = 0;
            elements = this;
            elementsWrapped = this;
        /* Otherwise, raw elements are being animated via the utility function. */
        } else {
            argumentIndex = 1;
            elements = syntacticSugar ? arguments[0].elements : arguments[0];
        }

        elements = Type.isWrapped(elements) ? [].slice.call(elements) : elements;

        if (!elements) {
            return;
        }

        if (syntacticSugar) {
            propertiesMap = arguments[0].properties;
            options = arguments[0].options;
        } else {
            propertiesMap = arguments[argumentIndex];
            options = arguments[argumentIndex + 1];
        }

        /* The length of the element set (in the form of a nodeList or an array of elements) is defaulted to 1 in case a single raw DOM element is passed in (which doesn't contain a length property). */
        var elementsLength = (Type.isArray(elements) || Type.isNodeList(elements)) ? elements.length : 1,
            elementsIndex = 0;

        /***************************
            Argument Overloading
        ***************************/

        /* Support is included for jQuery's argument overloading: $.animate(propertyMap [, duration] [, easing] [, complete]). Overloading is detected by checking for the absence of an object being passed into options. */
        /* Note: The stop action does not accept animation options, and is therefore excluded from this check. */
        /* Note: Although argument overloading is a sloppy practice in JavaScript, support is included so that velocity() can act as a drop-in replacement for jQuery's $.animate(). */
        if (propertiesMap !== "stop" && !$.isPlainObject(options)) {
            /* The utility function shifts all arguments one position to the right, so we adjust for that offset. */
            var startingArgumentPosition = argumentIndex + 1;

            options = {};

            /* Iterate through all options arguments */
            for (var i = startingArgumentPosition; i < arguments.length; i++) {
                /* Treat a number as a duration. Parse it out. */
                /* Note: The following RegEx will return true if passed an array with a number as its first item. Thus, arrays are skipped from this check. */
                if (!Type.isArray(arguments[i]) && /^\d/.test(arguments[i])) {
                    options.duration = parseFloat(arguments[i]);
                /* Treat a string as an easing. Also treat one-item (steps), two-item (tension, friction), and four-item (cubic bezier points) arrays as an easing. */
                } else if (Type.isString(arguments[i]) || (Type.isArray(arguments[i]) && (arguments[i].length === 1 || arguments[i].length === 2 || arguments[i].length === 4))) {
                    options.easing = arguments[i];
                /* Treat a function as a complete callback. */
                } else if (Type.isFunction(arguments[i])) {
                    options.complete = arguments[i];
                }
            }
        }

        /*********************
           Action Detection
        *********************/

        /* Velocity's behavior is categorized into "actions": Elements can either be specially scrolled into view, or they can be started, stopped, or reversed. If a literal or referenced properties map is passed
           in as Velocity's first argument, the associated action is "start". Alternatively, "scroll", "reverse", or "stop" can be passed in instead of a properties map. */
        var action;

        switch (propertiesMap) {
            case "scroll":
                action = "scroll";
                break;

            case "reverse":
                action = "reverse";
                break;

            case "stop":
                /*******************
                    Action: Stop
                *******************/

                var callsToStop = [];

                /* When the stop action is triggered, the elements' currently active call is immediately stopped. The active call might have been applied to multiple elements, in which
                   case all of the call's elements will be subjected to stopping. When an element is stopped, the next item in its animation queue is immediately triggered. */
                /* An additional argument may be passed in to clear an element's remaining queued calls. Either true (which defaults to the "fx" queue) or a custom queue string can be passed in. */
                /* Stopping is achieved by traversing active calls for those which contain the targeted element. */
                /* Note: The stop command runs prior to Queueing since its behavior is intended to take effect *immediately*, regardless of the element's current queue state. */
                $.each(Velocity.State.calls, function(i, activeCall) {  
                    /* Inactive calls are set to false by the logic inside completeCall(). Skip them. */
                    if (activeCall !== false) {    
                        /* If we're operating on a single element, wrap it in an array so that $.each() can iterate over it. */                  
                        $.each(activeCall[1].nodeType ? [ activeCall[1] ] : activeCall[1], function(k, activeElement) {
                            $.each(elements.nodeType ? [ elements ] : elements, function(l, element) {
                                /* Check that this call was applied to the target element. */
                                if (element === activeElement) {
                                    if (Data(element)) {
                                        /* Since "reverse" uses cached start values (the previous call's endValues), these values must be changed to reflect the final value that the elements were actually tweened to. */ 
                                        $.each(Data(element).tweensContainer, function(m, activeTween) {
                                            activeTween.endValue = activeTween.currentValue;
                                        });
                                    }

                                    /* Remaining queue clearing. */
                                    if (options === true || Type.isString(options)) {
                                        /* Clearing the $.queue() array is achieved by manually setting it to []. */
                                        $.queue(element, Type.isString(options) ? options : "", []);
                                    }

                                    callsToStop.push(i);
                                }
                            });
                        });
                    }
                });

                /* Prematurely call completeCall() on each matched active call, passing an additional flag to indicate that the complete callback and display:none setting should be skipped. */
                $.each(callsToStop, function(i, j) {
                    completeCall(j, true);
                });

                /* Since we're stopping, do not proceed with Queueing. */
                return getChain();

            default:
                /* Treat a non-empty plain object as a literal properties map. */
                if ($.isPlainObject(propertiesMap) && !$.isEmptyObject(propertiesMap)) {
                    action = "start";

                /****************
                    Sequences
                ****************/

                /* Check if a string matches a registered sequence (see Sequences above). */
                } else if (Type.isString(propertiesMap) && Velocity.Sequences[propertiesMap]) {
                    var elementsOriginal = elements,
                        durationOriginal = options.duration;

                    /* If the backwards option was passed in, reverse the element set so that elements animate from the last to the first (useful in combination with the stagger option). */
                    if (options.backwards === true) {
                        elements = (elements.jquery ? [].slice.call(elements) : elements).reverse();
                    }

                    /* Individually trigger the sequence for each element in the set to prevent users from having to handle iteration logic in their own sequence code. */
                    $.each(elements, function(elementIndex, element) {
                        /* If the stagger option was passed in, successively delay each element by the stagger value (in ms). */
                        if (parseFloat(options.stagger)) {
                            options.delay = parseFloat(options.stagger) * elementIndex;
                        }

                        /* If the drag option was passed in, successively increase/decrease (depending on the presense of options.backwards) the duration of each element's animation, using floors to prevent producing very short durations. */
                        if (options.drag) {
                            /* Default the duration of UI pack effects (callouts and transitions) to 1000ms instead of the usual default duration of 400ms. */
                            options.duration = parseFloat(durationOriginal) || (/^(callout|transition)/.test(propertiesMap) ? 1000 : DEFAULT_DURATION);

                            /* For each element, take the greater duration of: A) animation completion percentage relative to the original duration, B) 75% of the original duration, or C) a 200ms fallback
                               (in case duration is already set to a low value). The end result is a baseline of 75% of the sequence's duration that increases/decreases as the end of the element set is approached. */
                            options.duration = Math.max(options.duration * (options.backwards ? 1 - elementIndex/elementsLength : (elementIndex + 1) / elementsLength), options.duration * 0.75, 200);
                        }

                        /* Pass in the call's options object so that the sequence can optionally extend it. It defaults to an empty object instead of null to reduce the options checking logic required inside the sequence. */
                        /* Note: The element is passed in as both the call's context and its first argument -- allowing for more expressive sequence declarations. */
                        Velocity.Sequences[propertiesMap].call(element, element, options || {}, elementIndex, elementsLength);
                    });

                    /* Since the animation logic resides within the sequence's own code, abort the remainder of this call. (The performance overhead up to this point is virtually non-existant.) */
                    /* Note: The jQuery call chain is kept intact by returning the complete element set. */
                    return elementsWrapped || elementsOriginal;
                } else {
                    console.log("First argument was not a property map, a known action, or a registered sequence. Aborting.")

                    return getChain();
                }
        }

        /**************************
            Call-Wide Variables
        **************************/

        /* A container for CSS unit conversion ratios (e.g. %, rem, and em ==> px) that is used to cache ratios across all properties being animated in a single Velocity call.
           Calculating unit ratios necessitates DOM querying and updating, and is therefore avoided (via caching) wherever possible; further, ratios are only calculated when they're needed. */
        /* Note: This container is call-wide instead of page-wide to avoid the risk of using stale conversion metrics across Velocity animations that are not immediately consecutively chained. */
        var unitConversionRatios = {
                /* Performance optimization insight: When the parent element, CSS position value, and fontSize do not differ amongst elements, the elements' unit ratios are identical. */
                lastParent: null,
                lastPosition: null,
                lastFontSize: null,
                /* Percent is the only unit types whose ratio is dependant upon axis. */
                lastPercentToPxWidth: null,
                lastPercentToPxHeight: null,
                lastEmToPx: null,
                /* The rem==>px ratio is relative to the document's fontSize -- not any property belonging to the element. Thus, it is automatically call-wide cached whenever the rem unit is being animated. */
                remToPxRatio: null
            };

        /* A container for all the ensuing tween data and metadata associated with this call. This container gets pushed to the page-wide Velocity.State.calls array that is processed during animation ticking. */
        var call = [];

        /************************
           Element Processing
        ************************/

        /* Element processing consists of three parts -- data processing that cannot go stale and data processing that *can* go stale (i.e. third-party style modifications):
           1) Pre-Queueing: Element-wide variables, including the element's data storage, are instantiated. Call options are prepared. If triggered, the Stop action is executed.
           2) Queueing: The logic that runs once this call has reached its point of execution in the element's $.queue() stack. Most logic is placed here to avoid risking it becoming stale.
           3) Pushing: Consolidation of the tween data followed by its push onto the global in-progress calls container.
        */

        function processElement () {

            /*************************
               Part I: Pre-Queueing
            *************************/

            /***************************
               Element-Wide Variables
            ***************************/

            var element = this,
                /* The runtime opts object is the extension of the current call's options and Velocity's page-wide option defaults. */
                opts = $.extend({}, Velocity.defaults, options),
                /* A container for the processed data associated with each property in the propertyMap. (Each property in the map produces its own "tween".) */
                tweensContainer = {};

            /******************
                Data Cache
            ******************/

            /* A primary design goal of Velocity is to cache data wherever possible in order to avoid DOM requerying. Accordingly, each element has a data cache instantiated on it. */
            if (Data(element) === undefined) {
                $.data(element, NAME, {
                    /* Keep track of whether the element is currently being animated by Velocity. This is used to ensure that property values are not transferred between non-consecutive (stale) calls. */
                    isAnimating: false,
                    /* A reference to the element's live computedStyle object. You can learn more about computedStyle here: https://developer.mozilla.org/en/docs/Web/API/window.getComputedStyle */
                    computedStyle: null,
                    /* Tween data is cached for each animation on the element so that data can be passed across calls -- in particular, end values are used as subsequent start values in consecutive Velocity calls. */
                    tweensContainer: null,
                    /* The full root property values of each CSS hook being animated on this element are cached so that:
                       1) Concurrently-animating hooks sharing the same root can have their root values' merged into one while tweening.
                       2) Post-hook-injection root values can be transferred over to consecutively chained Velocity calls as starting root values.
                    */
                    rootPropertyValueCache: {},
                    /* A cache for transform updates, which must be manually flushed via CSS.flushTransformCache(). */
                    transformCache: {}
                });
            }

            /******************
               Option: Delay
            ******************/

            /* Since queue:false doesn't respect the item's existing queue, we avoid injecting its delay here (it's set later on). */
            /* Note: Velocity rolls its own delay function since jQuery doesn't have a utility alias for $.fn.delay() (and thus requires jQuery element creation, which we avoid since its overhead includes DOM querying). */
            if (/^\d/.test(opts.delay) && opts.queue !== false) {
                $.queue(element, opts.queue, function(next) {
                    /* This is a flag used to indicate to the upcoming completeCall() function that this queue entry was initiated by Velocity. See completeCall() for further details. */
                    Velocity.velocityQueueEntryFlag = true;

                    /* The ensuing queue item (which is assigned to the "next" argument that $.queue() automatically passes in) will be triggered after a setTimeout delay. */
                    setTimeout(next, parseFloat(opts.delay));
                });
            }

            /*********************
               Option: Duration
            *********************/

            /* In mock mode, all animations are forced to 1ms so that they occur immediately upon the next rAF tick. */
            if (Velocity.mock === true) {
                opts.duration = 1;
            } else {
                /* Support for jQuery's named durations. */
                switch (opts.duration.toString().toLowerCase()) {
                    case "fast":
                        opts.duration = 200;
                        break;

                    case "normal":
                        opts.duration = DEFAULT_DURATION;
                        break;

                    case "slow":
                        opts.duration = 600;
                        break;

                    default:
                        /* Remove the potential "ms" suffix and default to 1 if the user is attempting to set a duration of 0 (in order to produce an immediate style change). */
                        opts.duration = parseFloat(opts.duration) || 1;
                }
            }

            /*******************
               Option: Easing
            *******************/

            opts.easing = getEasing(opts.easing, opts.duration);

            /**********************
               Option: Callbacks
            **********************/

            /* Callbacks must functions. Otherwise, default to null. */
            if (opts.begin && !Type.isFunction(opts.begin)) {
                opts.begin = null;
            }

            if (opts.progress && !Type.isFunction(opts.progress)) {
                opts.progress = null;
            }

            if (opts.complete && !Type.isFunction(opts.complete)) {
                opts.complete = null;
            }

            /********************
               Option: Display
            ********************/

            /* Refer to Velocity's documentation (VelocityJS.org/#display) for a description of the display option's behavior. */
            if (opts.display) {
                opts.display = opts.display.toString().toLowerCase();
            }

            /**********************
               Option: mobileHA
            **********************/

            /* When set to true, and if this is a mobile device, mobileHA automatically enables hardware acceleration (via a null transform hack) on animating elements. HA is removed from the element at the completion of its animation. */
            /* Note: Android Gingerbread doesn't support HA. If a null transform hack (mobileHA) is in fact set, it will prevent other tranform subproperties from taking effect. */
            /* Note: You can read more about the use of mobileHA in Velocity's documentation: VelocityJS.org/#mobileHA. */
            opts.mobileHA = (opts.mobileHA && Velocity.State.isMobile && !Velocity.State.isGingerbread);

            /***********************
               Part II: Queueing
            ***********************/

            /* When a set of elements is targeted by a Velocity call, the set is broken up and each element has the current Velocity call individually queued onto it.
               In this way, each element's existing queue is respected; some elements may already be animating and accordingly should not have this current Velocity call triggered immediately. */
            /* In each queue, tween data is processed for each animating property then pushed onto the call-wide calls array. When the last element in the set has had its tweens processed,
               the call array is pushed to Velocity.State.calls for live processing by the requestAnimationFrame tick. */
            function buildQueue (next) {

                /*******************
                   Option: Begin
                *******************/

                /* The begin callback is fired once per call -- not once per elemenet -- and is passed the full raw DOM element set as both its context and its first argument. */
                if (opts.begin && elementsIndex === 0) {
                    opts.begin.call(elements, elements);
                }

                /*****************************************
                   Tween Data Construction (for Scroll)
                *****************************************/

                /* Note: In order to be subjected to chaining and animation options, scroll's tweening is routed through Velocity as if it were a standard CSS property animation. */
                if (action === "scroll") {
                    /* The scroll action uniquely takes an optional "offset" option -- specified in pixels -- that offsets the targeted scroll position. */
                    var scrollDirection = (/^x$/i.test(opts.axis) ? "Left" : "Top"),
                        scrollOffset = parseFloat(opts.offset) || 0,
                        scrollPositionCurrent,
                        scrollPositionCurrentAlternate,
                        scrollPositionEnd;

                    /* Scroll also uniquely takes an optional "container" option, which indicates the parent element that should be scrolled -- as opposed to the browser window itself.
                       This is useful for scrolling toward an element that's inside an overflowing parent element. */
                    if (opts.container) {
                        /* Ensure that either a jQuery object or a raw DOM element was passed in. */
                        if (opts.container.jquery || opts.container.nodeType) {
                            /* Extract the raw DOM element from the jQuery wrapper. */
                            opts.container = opts.container[0] || opts.container;
                            /* Note: Unlike other properties in Velocity, the browser's scroll position is never cached since it so frequently changes (due to the user's natural interaction with the page). */
                            scrollPositionCurrent = opts.container["scroll" + scrollDirection]; /* GET */

                            /* $.position() values are relative to the container's currently viewable area (without taking into account the container's true dimensions -- say, for example, if the container was not overflowing).
                               Thus, the scroll end value is the sum of the child element's position *and* the scroll container's current scroll position. */
                            /* Note: jQuery does not offer a utility alias for $.position(), so we have to incur jQuery object conversion here. This syncs up with an ensuing batch of GETs, so it fortunately does not trigger layout thrashing. */
                            scrollPositionEnd = (scrollPositionCurrent + $(element).position()[scrollDirection.toLowerCase()]) + scrollOffset; /* GET */
                        /* If a value other than a jQuery object or a raw DOM element was passed in, default to null so that this option is ignored. */
                        } else {
                            opts.container = null;
                        }
                    } else {
                        /* If the window itself is being scrolled -- not a containing element -- perform a live scroll position lookup using the appropriate cached property names (which differ based on browser type). */
                        scrollPositionCurrent = Velocity.State.scrollAnchor[Velocity.State["scrollProperty" + scrollDirection]]; /* GET */
                        /* When scrolling the browser window, cache the alternate axis's current value since window.scrollTo() doesn't let us change only one value at a time. */
                        scrollPositionCurrentAlternate = Velocity.State.scrollAnchor[Velocity.State["scrollProperty" + (scrollDirection === "Left" ? "Top" : "Left")]]; /* GET */

                        /* Unlike $.position(), $.offset() values are relative to the browser window's true dimensions -- not merely its currently viewable area -- and therefore end values do not need to be compounded onto current values. */
                        scrollPositionEnd = $(element).offset()[scrollDirection.toLowerCase()] + scrollOffset; /* GET */
                    }

                    /* Since there's only one format that scroll's associated tweensContainer can take, we create it manually. */
                    tweensContainer = {
                        scroll: {
                            rootPropertyValue: false,
                            startValue: scrollPositionCurrent,
                            currentValue: scrollPositionCurrent,
                            endValue: scrollPositionEnd,
                            unitType: "",
                            easing: opts.easing,
                            scrollData: {
                                container: opts.container,
                                direction: scrollDirection,
                                alternateValue: scrollPositionCurrentAlternate
                            }
                        },
                        element: element
                    };

                /******************************************
                   Tween Data Construction (for Reverse)
                ******************************************/

                /* Reverse acts like a "start" action in that a property map is animated toward. The only difference is that the property map used for reverse is the inverse of the map used in the previous call.
                   Thus, we manipulate the previous call to construct our new map: use the previous map's end values as our new map's start values. Copy over all other data. */
                /* Note: Reverse can be directly called via the "reverse" parameter, or it can be indirectly triggered via the loop option. (Loops are composed of multiple reverses.) */
                /* Note: Reverse calls do not need to be consecutively chained onto a currently-animating element in order to operate on cached values; there is no harm to reverse being called on a potentially stale data cache since
                   reverse's behavior is simply defined as reverting to the element's values as they were prior to the previous *Velocity* call. */
                } else if (action === "reverse") {
                    /* Abort if there is no prior animation data to reverse to. */
                    if (!Data(element).tweensContainer) {
                        /* Dequeue the element so that this queue entry releases itself immediately, allowing subsequent queue entries to run. */
                        $.dequeue(element, opts.queue);

                        return;
                    } else {
                        /*********************
                           Options Parsing
                        *********************/

                        /* If the element was hidden via the display option in the previous call, revert display to block prior to reversal so that the element is visible again. */
                        if (Data(element).opts.display === "none") {
                            Data(element).opts.display = "block";
                        }

                        /* If the loop option was set in the previous call, disable it so that "reverse" calls aren't recursively generated. Further, remove the previous call's callback options;
                           typically, users do not want these to be refired. */
                        Data(element).opts.loop = false;
                        Data(element).opts.begin = null;
                        Data(element).opts.complete = null;

                        /* Since we're extending an opts object that has already been exteded with the defaults options object, we remove non-explicitly-defined properties that are auto-assigned values. */
                        if (!options.easing) {
                            delete opts.easing;
                        }

                        if (!options.duration) {
                            delete opts.duration;
                        }

                        /* The opts object used for reversal is an extension of the options object optionally passed into this reverse call plus the options used in the previous Velocity call. */
                        opts = $.extend({}, Data(element).opts, opts);

                        /*************************************
                           Tweens Container Reconstruction
                        *************************************/

                        /* Create a deepy copy (indicated via the true flag) of the previous call's tweensContainer. */
                        var lastTweensContainer = $.extend(true, {}, Data(element).tweensContainer);

                        /* Manipulate the previous tweensContainer by replacing its end values and currentValues with its start values. */
                        for (var lastTween in lastTweensContainer) {
                            /* In addition to tween data, tweensContainers contain an element property that we ignore here. */
                            if (lastTween !== "element") {
                                var lastStartValue = lastTweensContainer[lastTween].startValue;

                                lastTweensContainer[lastTween].startValue = lastTweensContainer[lastTween].currentValue = lastTweensContainer[lastTween].endValue;
                                lastTweensContainer[lastTween].endValue = lastStartValue;

                                /* Easing is the only option that embeds into the individual tween data (since it can be defined on a per-property basis). Accordingly, every property's easing value must
                                   be updated when an options object is passed in with a reverse call. The side effect of this extensibility is that all per-property easing values are forcefully reset to the new value. */
                                if (options) {
                                    lastTweensContainer[lastTween].easing = opts.easing;
                                }
                            }
                        }

                        tweensContainer = lastTweensContainer;
                    }

                /*****************************************
                   Tween Data Construction (for Start)
                *****************************************/

                } else if (action === "start") {

                    /*************************
                        Value Transferring
                    *************************/

                    /* If this queue entry follows a previous Velocity-initiated queue entry *and* if this entry was created while the element was in the process of being animated by Velocity, then this current call
                       is safe to use the end values from the prior call as its start values. Velocity attempts to perform this value transfer process whenever possible in order to avoid requerying the DOM. */
                    /* If values aren't transferred from a prior call and start values were not forcefed by the user (more on this below), then the DOM is queried for the element's current values as a last resort. */
                    /* Note: Conversely, animation reversal (and looping) *always* perform inter-call value transfers; they never requery the DOM. */
                    var lastTweensContainer;

                    /* The per-element isAnimating flag is used to indicate whether it's safe (i.e. the data isn't stale) to transfer over end values to use as start values. If it's set to true and there is a previous
                       Velocity call to pull values from, do so. */
                    if (Data(element).tweensContainer && Data(element).isAnimating === true) {
                        lastTweensContainer = Data(element).tweensContainer;
                    }

                    /***************************
                       Tween Data Calculation
                    ***************************/

                    /* This function parses property data and defaults endValue, easing, and startValue as appropriate. */
                    /* Property map values can either take the form of 1) a single value representing the end value, or 2) an array in the form of [ endValue, [, easing] [, startValue] ].
                       The optional third parameter is a forcefed startValue to be used instead of querying the DOM for the element's current value. Read Velocity's docmentation to learn more about forcefeeding: VelocityJS.org/#forcefeeding */
                    function parsePropertyValue (valueData) {
                        var endValue = undefined,
                            easing = undefined,
                            startValue = undefined;

                        /* Handle the array format, which can be structured as one of three potential overloads: A) [ endValue, easing, startValue ], B) [ endValue, easing ], or C) [ endValue, startValue ] */
                        if (Type.isArray(valueData)) {
                            /* endValue is always the first item in the array. Don't bother validating endValue's value now since the ensuing property cycling logic inherently does that. */
                            endValue = valueData[0];

                            /* Two-item array format: If the second item is a number or a function, treat it as a start value since easings can only be strings or arrays. */
                            if ((!Type.isArray(valueData[1]) && /^[\d-]/.test(valueData[1])) || Type.isFunction(valueData[1])) {
                                startValue = valueData[1];
                            /* Two or three-item array: If the second item is a string, treat it as an easing. */
                            } else if (Type.isString(valueData[1]) || Type.isArray(valueData[1])) {
                                easing = getEasing(valueData[1], opts.duration);

                                /* Don't bother validating startValue's value now since the ensuing property cycling logic inherently does that. */
                                if (valueData[2]) {
                                    startValue = valueData[2];
                                }
                            }
                        /* Handle the single-value format. */
                        } else {
                            endValue = valueData;
                        }

                        /* Default to the call's easing if a per-property easing type was not defined. */
                        easing = easing || opts.easing;

                        /* If functions were passed in as values, pass the function the current element as its context, plus the element's index and the element set's size as arguments. Then, assign the returned value. */
                        if (Type.isFunction(endValue)) {
                            endValue = endValue.call(element, elementsIndex, elementsLength);
                        }

                        if (Type.isFunction(startValue)) {
                            startValue = startValue.call(element, elementsIndex, elementsLength);
                        }

                        /* Allow startValue to be left as undefined to indicate to the ensuing code that its value was not forcefed. */
                        return [ endValue || 0, easing, startValue ];
                    }

                    /* Create a tween out of each property, and append its associated data to tweensContainer. */
                    for (var property in propertiesMap) {
                        /* Normalize property names via camel casing so that properties can be consistently manipulated. */
                        /**************************
                           Start Value Sourcing
                        **************************/

                        /* Parse out endValue, easing, and startValue from the property's data. */
                        var valueData = parsePropertyValue(propertiesMap[property]),
                            endValue = valueData[0],
                            easing = valueData[1],
                            startValue = valueData[2];

                        /* Now that the original property name's format has been used for the parsePropertyValue() lookup above, we force the property to its camelCase styling to normalize it for manipulation. */
                        property = CSS.Names.camelCase(property);

                        /* In case this property is a hook, there are circumstances where we will intend to work on the hook's root property and not the hooked subproperty. */
                        var rootProperty = CSS.Hooks.getRoot(property),
                            rootPropertyValue = false;

                        /* Properties that are not supported by the browser (and do not have an associated normalization) will inherently produce no style changes when set, so they are skipped in order to decrease animation tick overhead.
                           Property support is determined via prefixCheck(), which returns a false flag when no supported is detected. */
                        if (CSS.Names.prefixCheck(rootProperty)[1] === false && CSS.Normalizations.registered[rootProperty] === undefined) {
                            if (Velocity.debug) console.log("Skipping [" + rootProperty + "] due to a lack of browser support.");

                            continue;
                        }

                        /* If the display option is being set to a non-"none" (e.g. "block") and opacity (filter on IE<=8) is being animated to an endValue of non-zero, the user's intention is to fade in from invisible,
                           thus we forcefeed opacity a startValue of 0 if its startValue hasn't already been sourced by value transferring or prior forcefeeding. */
                        if ((opts.display && opts.display !== "none") && /opacity|filter/.test(property) && !startValue && endValue !== 0) {
                            startValue = 0;
                        }

                        /* If values have been transferred from the previous Velocity call, extract the endValue and rootPropertyValue for all of the current call's properties that were *also* animated in the previous call. */
                        /* Note: Value transferring can optionally be disabled by the user via the _cacheValues option. */
                        if (opts._cacheValues && lastTweensContainer && lastTweensContainer[property]) {
                            if (startValue === undefined) {
                                startValue = lastTweensContainer[property].endValue + lastTweensContainer[property].unitType;
                            }

                            /* The previous call's rootPropertyValue is extracted from the element's data cache since that's the instance of rootPropertyValue that gets freshly updated by the tweening process,
                               whereas the rootPropertyValue attached to the incoming lastTweensContainer is equal to the root property's value prior to any tweening. */
                            rootPropertyValue = Data(element).rootPropertyValueCache[rootProperty];
                        /* If values were not transferred from a previous Velocity call, query the DOM as needed. */
                        } else {
                            /* Handle hooked properties. */
                            if (CSS.Hooks.registered[property]) {
                               if (startValue === undefined) {
                                    rootPropertyValue = CSS.getPropertyValue(element, rootProperty); /* GET */
                                    /* Note: The following getPropertyValue() call does not actually trigger a DOM query; getPropertyValue() will extract the hook from rootPropertyValue. */
                                    startValue = CSS.getPropertyValue(element, property, rootPropertyValue);
                                /* If startValue is already defined via forcefeeding, do not query the DOM for the root property's value; just grab rootProperty's zero-value template from CSS.Hooks. This overwrites the element's actual
                                   root property value (if one is set), but this is acceptable since the primary reason users forcefeed is to avoid DOM queries, and thus we likewise avoid querying the DOM for the root property's value. */
                                } else {
                                    /* Grab this hook's zero-value template, e.g. "0px 0px 0px black". */
                                    rootPropertyValue = CSS.Hooks.templates[rootProperty][1];
                                }
                            /* Handle non-hooked properties that haven't already been defined via forcefeeding. */
                            } else if (startValue === undefined) {
                                startValue = CSS.getPropertyValue(element, property); /* GET */
                            }
                        }

                        /**************************
                           Value Data Extraction
                        **************************/

                        var separatedValue,
                            endValueUnitType,
                            startValueUnitType,
                            operator;

                        /* Separates a property value into its numeric value and its unit type. */
                        function separateValue (property, value) {
                            var unitType,
                                numericValue;

                            numericValue = (value || 0)
                                .toString()
                                .toLowerCase()
                                /* Match the unit type at the end of the value. */
                                .replace(/[%A-z]+$/, function(match) {
                                    /* Grab the unit type. */
                                    unitType = match;

                                    /* Strip the unit type off of value. */
                                    return "";
                                });

                            /* If no unit type was supplied, assign one that is appropriate for this property (e.g. "deg" for rotateZ or "px" for width). */
                            if (!unitType) {
                                unitType = CSS.Values.getUnitType(property);
                            }

                            return [ numericValue, unitType ];
                        }

                        /* Separate startValue. */
                        separatedValue = separateValue(property, startValue);
                        startValue = separatedValue[0];
                        startValueUnitType = separatedValue[1];

                        /* Separate endValue, and extract a value operator (e.g. "+=", "-=") if one exists. */
                        separatedValue = separateValue(property, endValue);
                        endValue = separatedValue[0].replace(/^([+-\/*])=/, function(match, subMatch) {
                            operator = subMatch;

                            /* Strip the operator off of the value. */
                            return "";
                        });
                        endValueUnitType = separatedValue[1];

                        /* Parse float values from endValue and startValue. Default to 0 if NaN is returned. */
                        startValue = parseFloat(startValue) || 0;
                        endValue = parseFloat(endValue) || 0;

                        /*****************************
                           Value & Unit Conversion
                        *****************************/

                        var elementUnitRatios;

                        /* Custom support for properties that don't actually accept the % unit type, but where pollyfilling is trivial and relatively foolproof. */
                        if (endValueUnitType === "%") {
                            /* A %-value fontSize/lineHeight is relative to the parent's fontSize (as opposed to the parent's dimensions), which is identical to the em unit's behavior, so we piggyback off of that. */
                            if (/^(fontSize|lineHeight)$/.test(property)) {
                                /* Convert % into an em decimal value. */
                                endValue = endValue / 100;
                                endValueUnitType = "em";
                            /* For scaleX and scaleY, convert the value into its decimal format and strip off the unit type. */
                            } else if (/^scale/.test(property)) {
                                endValue = endValue / 100;
                                endValueUnitType = "";
                            /* For RGB components, take the defined percentage of 255 and strip off the unit type. */
                            } else if (/(Red|Green|Blue)$/i.test(property)) {
                                endValue = (endValue / 100) * 255;
                                endValueUnitType = "";
                            }
                        }

                        /* When queried, the browser returns (most) CSS property values in pixels. Therefore, if an endValue with a unit type of %, em, or rem is animated toward, startValue must be converted from pixels into the same unit type
                           as endValue in order for value manipulation logic (increment/decrement) to proceed. Further, if the startValue was forcefed or transferred from a previous call, startValue may also not be in pixels. Unit conversion logic
                           therefore consists of two steps: 1) Calculating the ratio of %,/em/rem relative to pixels then 2) Converting startValue into the same unit of measurement as endValue based on these ratios. */
                        /* Unit conversion ratios are calculated by momentarily setting a value with the target unit type on the element, comparing the returned pixel value, then reverting to the original value. */
                        /* Note: Even if only one of these unit types is being animated, all unit ratios are calculated at once since the overhead of batching the SETs and GETs together upfront outweights the potential overhead
                                 of layout thrashing caused by re-querying for uncalculated ratios for subsequently-processed properties. */
                        /* Note: Instead of adjusting the CSS properties on the target element, an alternative way of performing value conversion is to inject a cloned element into the element's parent and manipulate *its* values instead.
                                 This is a cleaner method that avoids the ensuing rounds of layout thrashing, but it's ultimately less performant due to the overhead involved with DOM tree modification (element insertion/deletion). */
                        /* Todo: Shift this logic into the calls' first tick instance so that it's synced with RAF. */
                        /* Todo: Store the original values and skip re-setting if we're animating height or width in the properties map. */
                        function calculateUnitRatios () {
                            /* The properties below are used to determine whether the element differs sufficiently from this same call's prior element (in the overall element set) to also differ in its unit conversion ratios.
                               If the properties match up with those of the prior element, the prior element's conversion ratios are used. Like most optimizations in Velocity, this is done to minimize DOM querying. */
                            var sameRatioIndicators = {
                                    parent: element.parentNode, /* GET */
                                    position: CSS.getPropertyValue(element, "position"), /* GET */
                                    fontSize: CSS.getPropertyValue(element, "fontSize") /* GET */
                                },
                                /* Determine if the same % ratio can be used. % is relative to the element's position value and the parent's width and height dimensions. */
                                sameBasePercent = ((sameRatioIndicators.position === unitConversionRatios.lastPosition) && (sameRatioIndicators.parent === unitConversionRatios.lastParent)),
                                /* Determine if the same em ratio can be used. em is relative to the element's fontSize, which itself is relative to the parent's fontSize. */
                                sameBaseEm = ((sameRatioIndicators.fontSize === unitConversionRatios.lastFontSize) && (sameRatioIndicators.parent === unitConversionRatios.lastParent));

                            /* Store these ratio indicators call-wide for the next element to compare against. */
                            unitConversionRatios.lastParent = sameRatioIndicators.parent;
                            unitConversionRatios.lastPosition = sameRatioIndicators.position;
                            unitConversionRatios.lastFontSize = sameRatioIndicators.fontSize;

                            /* Whereas % and em ratios are determined on a per-element basis, the rem unit type only needs to be checked once per call since it is exclusively dependant upon the body element's fontSize.
                               If this is the first time that calculateUnitRatios() is being run during this call, remToPxRatio will still be set to its default value of null, so we calculate it now. */
                            if (unitConversionRatios.remToPxRatio === null) {
                                /* Default to most browsers' default fontSize of 16px in the case of 0. */
                                unitConversionRatios.remToPxRatio = parseFloat(CSS.getPropertyValue(document.body, "fontSize")) || 16; /* GET */
                            }

                            var originalValues = {
                                    /* To accurately and consistently calculate conversion ratios, the element's overflow and box-sizing are temporarily removed. Both properties modify an element's visible dimensions. */
                                    /* Note: Overflow must be manipulated on a per-axis basis since the plain overflow property overwrites its subproperties' values. */
                                    overflowX: null,
                                    overflowY: null,
                                    boxSizing: null,
                                    /* width and height act as our proxy properties for measuring the horizontal and vertical % ratios. Since they can be artificially constrained by their min-/max- equivalents, those properties are converted as well. */
                                    width: null,
                                    minWidth: null,
                                    maxWidth: null,
                                    height: null,
                                    minHeight: null,
                                    maxHeight: null,
                                    /* paddingLeft arbitrarily acts as our proxy for the em ratio. */
                                    paddingLeft: null
                                },
                                elementUnitRatios = {},
                                /* Note: IE<=8 round to the nearest pixel when returning CSS values, thus we perform conversions using a measurement of 10 (instead of 1) to give our ratios a precision of at least 1 decimal value. */
                                measurement = 10;

                            /* For organizational purposes, current ratios calculations are consolidated onto the elementUnitRatios object. */
                            elementUnitRatios.remToPxRatio = unitConversionRatios.remToPxRatio;

                            /* After temporary unit conversion logic runs, width and height properties that were originally set to "auto" must be set back to "auto" instead of to the actual corresponding pixel value. Leaving the values
                               at their hard-coded pixel value equivalents would inherently prevent the elements from vertically adjusting as the height of its inner content changes. */
                            /* IE tells us whether or not the property is set to "auto". Other browsers provide no way of determing "auto" values on height/width, and thus we have to trigger additional layout thrashing (see below) to solve this. */
                            if (IE) {
                                var isIEWidthAuto = /^auto$/i.test(element.currentStyle.width),
                                    isIEHeightAuto = /^auto$/i.test(element.currentStyle.height);
                            }

                            /* Note: To minimize layout thrashing, the ensuing unit conversion logic is split into batches to synchronize GETs and SETs. */
                            if (!sameBasePercent || !sameBaseEm) {
                                originalValues.overflowX = CSS.getPropertyValue(element, "overflowX"); /* GET */
                                originalValues.overflowY = CSS.getPropertyValue(element, "overflowY"); /* GET */
                                originalValues.boxSizing = CSS.getPropertyValue(element, "boxSizing"); /* GET */

                                /* Since % values are relative to their respective axes, ratios are calculated for both width and height. In contrast, only a single ratio is required for rem and em. */
                                /* When calculating % values, we set a flag to indiciate that we want the computed value instead of offsetWidth/Height, which incorporate additional dimensions (such as padding and border-width) into their values. */
                                originalValues.width = CSS.getPropertyValue(element, "width", null, true); /* GET */
                                originalValues.minWidth = CSS.getPropertyValue(element, "minWidth"); /* GET */
                                /* Note: max-width/height must default to "none" when 0 is returned, otherwise the element cannot have its width/height set. */
                                originalValues.maxWidth = CSS.getPropertyValue(element, "maxWidth") || "none"; /* GET */

                                originalValues.height = CSS.getPropertyValue(element, "height", null, true); /* GET */
                                originalValues.minHeight = CSS.getPropertyValue(element, "minHeight"); /* GET */
                                originalValues.maxHeight = CSS.getPropertyValue(element, "maxHeight") || "none"; /* GET */

                                originalValues.paddingLeft = CSS.getPropertyValue(element, "paddingLeft"); /* GET */
                            }

                            if (sameBasePercent) {
                                elementUnitRatios.percentToPxRatioWidth = unitConversionRatios.lastPercentToPxWidth;
                                elementUnitRatios.percentToPxRatioHeight = unitConversionRatios.lastPercentToPxHeight;
                            } else {
                                CSS.setPropertyValue(element, "overflowX",  "hidden"); /* SET */
                                CSS.setPropertyValue(element, "overflowY",  "hidden"); /* SET */
                                CSS.setPropertyValue(element, "boxSizing",  "content-box"); /* SET */

                                CSS.setPropertyValue(element, "width", measurement + "%"); /* SET */
                                CSS.setPropertyValue(element, "minWidth", measurement + "%"); /* SET */
                                CSS.setPropertyValue(element, "maxWidth", measurement + "%"); /* SET */

                                CSS.setPropertyValue(element, "height",  measurement + "%"); /* SET */
                                CSS.setPropertyValue(element, "minHeight",  measurement + "%"); /* SET */
                                CSS.setPropertyValue(element, "maxHeight",  measurement + "%"); /* SET */
                            }

                            if (sameBaseEm) {
                                elementUnitRatios.emToPxRatio = unitConversionRatios.lastEmToPx;
                            } else {
                                CSS.setPropertyValue(element, "paddingLeft", measurement + "em"); /* SET */
                            }

                            /* The following pixel-value GETs cannot be batched with the prior GETs since they depend upon the values temporarily set immediately above; layout thrashing cannot be avoided here. */
                            if (!sameBasePercent) {
                                /* Divide the returned value by the measurement value to get the ratio between 1% and 1px. Default to 1 since conversion logic using 0 can produce Infinite. */
                                elementUnitRatios.percentToPxRatioWidth = unitConversionRatios.lastPercentToPxWidth = (parseFloat(CSS.getPropertyValue(element, "width", null, true)) || 1) / measurement; /* GET */
                                elementUnitRatios.percentToPxRatioHeight = unitConversionRatios.lastPercentToPxHeight = (parseFloat(CSS.getPropertyValue(element, "height", null, true)) || 1) / measurement; /* GET */
                            }

                            if (!sameBaseEm) {
                                elementUnitRatios.emToPxRatio = unitConversionRatios.lastEmToPx = (parseFloat(CSS.getPropertyValue(element, "paddingLeft")) || 1) / measurement; /* GET */
                            }

                            /* Revert each test property to its original value. */
                            for (var originalValueProperty in originalValues) {
                                if (originalValues[originalValueProperty] !== null) {
                                    CSS.setPropertyValue(element, originalValueProperty, originalValues[originalValueProperty]); /* SETs */
                                }
                            }

                            /* In IE, revert to "auto" for width and height if it was originally set. */
                            if (IE) {
                                if (isIEWidthAuto) {
                                    CSS.setPropertyValue(element, "width", "auto"); /* SET */
                                }

                                if (isIEHeightAuto) {
                                    CSS.setPropertyValue(element, "height", "auto"); /* SET */
                                }
                            /* For other browsers, additional layout thrashing must be triggered to determine whether a property was originally set to "auto". */
                            } else {
                                /* Set height to "auto" then compare the returned value against the element's current height value. If they're identical, leave height set to "auto".
                                   If they're different, then "auto" wasn't originally set on the element prior to our conversions, and we revert it to its actual value. */
                                /* Note: The following GETs and SETs cannot be batched together due to the cross-effect setting one axis to "auto" has on the other. */
                                CSS.setPropertyValue(element, "height", "auto"); /* SET */
                                if (originalValues.height !== CSS.getPropertyValue(element, "height", null, true)) { /* GET */
                                    CSS.setPropertyValue(element, "height", originalValues.height); /* SET */
                                }

                                CSS.setPropertyValue(element, "width", "auto"); /* SET */
                                if (originalValues.width !== CSS.getPropertyValue(element, "width", null, true)) { /* GET */
                                    CSS.setPropertyValue(element, "width", originalValues.width); /* SET */
                                }
                            }

                            if (Velocity.debug >= 1) console.log("Unit ratios: " + JSON.stringify(elementUnitRatios), element);

                            return elementUnitRatios;
                        }

                        /* The * and / operators, which are not passed in with an associated unit, inherently use startValue's unit. Skip value and unit conversion. */
                        if (/[\/*]/.test(operator)) {
                            endValueUnitType = startValueUnitType;
                        /* If startValue and endValue differ in unit type, convert startValue into the same unit type as endValue so that if endValueUnitType is a relative unit (%, em, rem), the values set during tweening will continue
                           to be accurately relative even if the metrics they depend on are dynamically changing during the course of the animation. Conversely, if we always normalized into px and used px for setting values, the px ratio
                           would become stale if the original unit being animated toward was relative and the underlying metrics change during the animation. */
                        /* Since 0 is 0 in any unit type, no conversion is necessary when startValue is 0 -- we just start at 0 with endValueUnitType. */
                        } else if ((startValueUnitType !== endValueUnitType) && startValue !== 0) {
                            /* Unit conversion is also skipped when endValue is 0, but *startValueUnitType* must be used in this case for tween values to remain accurate. */
                            /* Note: Skipping unit conversion here means that if endValueUnitType was originally a relative unit, the animation won't relatively match the underlying metrics if they change, but this is acceptable
                               since we're animating toward invisibility instead of toward visibility that remains past the point of the animation's completion. */
                            if (endValue === 0) {
                                endValueUnitType = startValueUnitType;
                            } else {
                                /* By this point, we cannot avoid unit conversion (it's undesirable since it causes layout thrashing). If we haven't already, we trigger calculateUnitRatios(), which runs once per element per call. */
                                elementUnitRatios = elementUnitRatios || calculateUnitRatios();

                                /* The following RegEx matches CSS properties that have their % values measured relative to the x-axis. */
                                /* Note: W3C spec mandates that all of margin and padding's properties (even top and bottom) are %-relative to the *width* of the parent element, so they're included in this expression. */
                                var axis = (/margin|padding|left|right|width|text|word|letter/i.test(property) || /X$/.test(property)) ? "x" : "y";

                                /* In order to avoid generating n^2 bespoke conversion functions, unit conversion is a two-step process: 1) Convert startValue into pixels. 2) Convert this new pixel value into endValue's unit type. */
                                switch (startValueUnitType) {
                                    case "%":
                                        /* Note: translateX and translateY are the only properties that are %-relative to an element's own dimensions -- not its parent's dimensions. Velocity does not include a special conversion process
                                           for these properties due of the additional DOM overhead it would entail. Therefore, animating translateX/Y from a % value to a non-% value will produce an incorrect start value. Fortunately,
                                           this sort of cross-unit conversion is rarely done by users in practice. */
                                        startValue *= (axis === "x" ? elementUnitRatios.percentToPxRatioWidth : elementUnitRatios.percentToPxRatioHeight);
                                        break;

                                    case "em":
                                        startValue *= elementUnitRatios.emToPxRatio;
                                        break;

                                    case "rem":
                                        startValue *= elementUnitRatios.remToPxRatio;
                                        break;

                                    case "px":
                                        /* px acts as our midpoint in the unit conversion process; do nothing. */
                                        break;
                                }

                                /* Invert the px ratios to convert into to the target unit. */
                                switch (endValueUnitType) {
                                    case "%":
                                        startValue *= 1 / (axis === "x" ? elementUnitRatios.percentToPxRatioWidth : elementUnitRatios.percentToPxRatioHeight);
                                        break;

                                    case "em":
                                        startValue *= 1 / elementUnitRatios.emToPxRatio;
                                        break;

                                    case "rem":
                                        startValue *= 1 / elementUnitRatios.remToPxRatio;
                                        break;

                                    case "px":
                                        /* startValue is already in px, do nothing; we're done. */
                                        break;
                                }
                            }
                        }

                        /***********************
                            Value Operators
                        ***********************/

                        /* Operator logic must be performed last since it requires unit-normalized start and end values. */
                        /* Note: Relative percent values do not behave how most people think; while one would expect "+=50%" to increase the property 1.5x its current value, it in fact increases the percent units in absolute terms:
                                 50 points is added on top of the current % value. */
                        switch (operator) {
                            case "+":
                                endValue = startValue + endValue;
                                break;

                            case "-":
                                endValue = startValue - endValue;
                                break;

                            case "*":
                                endValue = startValue * endValue;
                                break;

                            case "/":
                                endValue = startValue / endValue;
                                break;
                        }

                        /**************************
                           tweensContainer Push
                        **************************/

                        /* Construct the per-property tween object, and push it to the element's tweensContainer. */
                        tweensContainer[property] = {
                            rootPropertyValue: rootPropertyValue,
                            startValue: startValue,
                            currentValue: startValue,
                            endValue: endValue,
                            unitType: endValueUnitType,
                            easing: easing
                        };

                        if (Velocity.debug) console.log("tweensContainer (" + property + "): " + JSON.stringify(tweensContainer[property]), element);
                    }

                    /* Along with its property data, store a reference to the element itself onto tweensContainer. */
                    tweensContainer.element = element;
                }

                /***************
                    Pushing
                ***************/

                /* Note: tweensContainer can be empty if all of the properties in this call's property map were skipped due to not being supported by the browser.
                   The element property is used as a proxy for checking that the tweensContainer has been appended to. */
                if (tweensContainer.element) {

                    /*****************
                        Call Push
                    *****************/

                    /* The call array houses the tweensContainers for each element being animated in the current call. */
                    call.push(tweensContainer);

                    /* Store on the element its tweensContainer plus the current call's opts so that Velocity can reference this data the next time this element is animated. */
                    Data(element).tweensContainer = tweensContainer;
                    Data(element).opts = opts;
                    /* Switch on the element's animating flag. */
                    Data(element).isAnimating = true;

                    /******************
                        Calls Push
                    ******************/

                    /* Once the final element in this call's targeted element set has been processed, push the call array onto Velocity.State.calls for the animation tick to immediately begin processing. */
                    if (elementsIndex === elementsLength - 1) {
                        /* To speed up iterating over this array, it is compacted (falsey items -- calls that have completed -- are removed) when its length has ballooned to a point that can impact tick performance.
                           This only becomes necessary when animation has been continuous with many elements over a long period of time; whenever all active calls are completed, completeCall() clears Velocity.State.calls. */
                        if (Velocity.State.calls.length > 10000) {
                            Velocity.State.calls = compactSparseArray(Velocity.State.calls);
                        }

                        /* Add the current call plus its associated metadata (the element set and the call's options) onto the page-wide call container. Anything on this call container is subjected to tick() processing. */
                        Velocity.State.calls.push([ call, elements, opts ]);

                        /* If the animation tick isn't currently running, start it. (Velocity shuts the tick off when there are no active calls to process.) */
                        if (Velocity.State.isTicking === false) {
                            Velocity.State.isTicking = true;

                            /* Start the tick loop. */
                            tick();
                        }
                    } else {
                        elementsIndex++;
                    }
                }
            }

            /* When the queue option is set to false, the call skips the element's queue and fires immediately. */
            if (opts.queue === false) {
                /* Since this buildQueue call doesn't respect the element's existing queue (which is where a delay option would have been appended), we manually inject the delay property here with an explicit setTimeout. */
                if (opts.delay) {
                    setTimeout(buildQueue, opts.delay);
                } else {
                    buildQueue();
                }
            /* Otherwise, the call undergoes element queueing as normal. */
            /* Note: To interoperate with jQuery, Velocity uses jQuery's own $.queue() stack for queuing logic. */
            } else {
                $.queue(element, opts.queue, function(next) {
                    /* This is a flag used to indicate to the upcoming completeCall() function that this queue entry was initiated by Velocity. See completeCall() for further details. */
                    Velocity.velocityQueueEntryFlag = true;

                    buildQueue(next);
                });
            }

            /*********************
                Auto-Dequeuing
            *********************/

            /* As per jQuery's $.queue() behavior, to fire the first non-custom-queue entry on an element, the element must be dequeued if its queue stack consists *solely* of the current call.
               (This can be determined by checking for the "inprogress" item that jQuery prepends to active queue stack arrays.) Regardless, whenever the element's queue is further appended with
               additional items -- including $.delay()'s or even $.animate() calls, the queue's first entry is automatically fired. This behavior contrasts that of custom queues, which never auto-fire. */
            /* Note: When an element set is being subjected to a non-parallel Velocity call, the animation will not begin until each one of the elements in the set has reached the end of its individually pre-existing queue chain. */
            /* Note: Unfortunately, most people don't fully grasp jQuery's powerful, yet quirky, $.queue() function. Lean more here: http://stackoverflow.com/questions/1058158/can-somebody-explain-jquery-queue-to-me */
            if ((opts.queue === "" || opts.queue === "fx") && $.queue(element)[0] !== "inprogress") {
                $.dequeue(element);
            }
        }

        /**************************
           Element Set Iteration
        **************************/

        /* If the "nodeType" property exists on the elements variable, we're animating a single element. Place it in an array so that $.each can iterate over it. */
        $.each(elements.nodeType ? [ elements ] : elements, function(i, element) {
            /* Ensure each element in a set has a nodeType (is a real element) to avoid throwing errors. */
            if (element.nodeType) {
                processElement.call(element);
            }
        });

        /********************
            Option: Loop
        ********************/

        /* The loop option accepts an integer indicating how many times the element should loop between the values in the current call's properties map and the element's property values prior to this call. */
        /* Note: The loop option's logic is performed here -- after element processing -- because the current call needs to undergo its queue insertion prior to the loop option generating its series of constituent "reverse" calls,
           which chain after the current call. Two reverse calls (two "alternations") constitute one loop. */
        var opts = $.extend({}, Velocity.defaults, options),
            reverseCallsCount;

        opts.loop = parseInt(opts.loop);
        reverseCallsCount = (opts.loop * 2) - 1;

        if (opts.loop) {
            /* Double the loop count to convert it into its appropriate number of "reverse" calls. Subtract 1 from the resulting value since the current call is included in the total alternation count. */
            for (var x = 0; x < reverseCallsCount; x++) {
                /* Since the logic for the reverse action occurs inside Queueing and thus this call's options object isn't parsed until then as well, the current call's delay option must be explicitly passed
                   into the reverse call so that the delay logic that occurs inside *Pre-Queueing* can process this delay. */
                var reverseOptions = {
                    delay: opts.delay
                };

                /* If a complete callback was passed into this call, transfer it to the loop sequence's final "reverse" call so that it's triggered when the entire sequence is complete (and not when the very first animation is complete). */
                if (opts.complete && (x === reverseCallsCount - 1)) {
                    reverseOptions.complete = opts.complete;
                }

                Velocity.animate(elements, "reverse", reverseOptions);
            }
        }

        /***************
            Chaining
        ***************/

        /* Return the elements back to the call chain, with wrapped elements taking precedence in case Velocity was called via the $.fn. extension. */
        return getChain();
    };

    /*****************************
       Tick (Calls Processing)
    *****************************/

    /* Note: There is only a single tick() instance; all calls to Velocity are pushed to the Velocity.State.calls array, which is fully iterated through upon each tick. */
    function tick (timestamp) {
        /* An empty timestamp argument indicates that this is the first tick occurence since ticking was turned on (which implies that this tick wasn't called by itself). We leverage this indicator to fully ignore the first tick pass
           since RAF's initial pass is fired whenever the browser's next tick sync time occurs (whereas subsequent RAF passes are spaced by a timer resolution of ~16ms), which results in the first elements subjected to Velocity
           calls being animated out of sync with any elements animated immediately thereafter. In short, we ignore the first RAF tick pass so that elements being immediately consecutively animated -- instead of simultaneously animated
           by the same Velocity call -- are properly batched into the same initial RAF tick and consequently remain in sync thereafter. */
        if (timestamp) {
            /* We ignore RAF's high resolution timestamp since it can be significantly offset when the browser is under high stress; we opt for choppiness over allowing the browser to drop huge chunks of frames. */
            var timeCurrent = (new Date).getTime();

            /********************
               Call Iteration
            ********************/

            /* Iterate through each active call. */
            for (var i = 0, callsLength = Velocity.State.calls.length; i < callsLength; i++) {
                /* When a velocity call is completed, its Velocity.State.calls array entry is set to false. Continue on to the next call. */
                if (!Velocity.State.calls[i]) {
                    continue;
                }

                /************************
                   Call-Wide Variables
                ************************/

                var callContainer = Velocity.State.calls[i],
                    call = callContainer[0],
                    opts = callContainer[2],
                    timeStart = callContainer[3];

                /* If timeStart is undefined, then this is the first time that this call has been processed by tick(). We assign timeStart now so that its value is as close to the real animation start time as possible.
                   (Conversely, had timeStart been defined when this call was added to Velocity.State.calls, the delay between that time and now would cause the first few frames of the tween to be skipped since percentComplete is
                   calculated relative to timeStart.) */
                /* Further, subtract 16ms (the approximate resolution of RAF) from the current time value so that the first tick iteration isn't wasted by animating at 0% tween completion,
                   which would produce the same style value as the element's current value. */
                if (!timeStart) {
                    timeStart = Velocity.State.calls[i][3] = timeCurrent - 16;
                }

                /* The tween's completion percentage is relative to the tween's start time, not the tween's start value (which would result in unpredictable tween durations since JavaScript's timers are not particularly accurate).
                   Accordingly, we ensure that percentComplete does not exceed 1. */
                var percentComplete = Math.min((timeCurrent - timeStart) / opts.duration, 1);

                /**********************
                   Element Iteration
                **********************/

                /* For every call, iterate through each of the elements in its set. */
                for (var j = 0, callLength = call.length; j < callLength; j++) {
                    var tweensContainer = call[j],
                        element = tweensContainer.element;

                    /* Check to see if this element has been deleted midway through the animation by checking for the continued existence of its data cache. If it's gone, skip animating this element. */
                    if (!Data(element)) {
                        continue;
                    }

                    var transformPropertyExists = false;

                    /*********************
                       Display Toggling
                    *********************/

                    /* If the display option is set to non-"none", set it upfront so that the element has a chance to become visible before tweening begins. (Otherwise, display's "none" value is set in completeCall() once the animation has completed.) */
                    if (opts.display && opts.display !== "none") {
                        CSS.setPropertyValue(element, "display", opts.display);
                    }

                    /************************
                       Property Iteration
                    ************************/

                    /* For every element, iterate through each property. */
                    for (var property in tweensContainer) {
                        /* Note: In addition to property tween data, tweensContainer contains a reference to its associated element. */
                        if (property !== "element") {
                            var tween = tweensContainer[property],
                                currentValue,
                                /* Easing can either be a bezier function or a string that references a pre-registered easing on the Velocity.Easings object. In either case, return the appropriate easing function. */
                                easing = Type.isString(tween.easing) ? Velocity.Easings[tween.easing] : tween.easing;

                            /******************************
                               Current Value Calculation
                            ******************************/

                            /* If this is the last tick pass (if we've reached 100% completion for this tween), ensure that currentValue is explicitly set to its target endValue so that it's not subjected to any rounding. */
                            if (percentComplete === 1) {
                                currentValue = tween.endValue;
                            /* Otherwise, calculate currentValue based on the current delta from startValue. */
                            } else {
                                currentValue = tween.startValue + ((tween.endValue - tween.startValue) * easing(percentComplete));
                            }

                            tween.currentValue = currentValue;

                            /******************
                               Hooks: Part I
                            ******************/

                            /* For hooked properties, the newly-updated rootPropertyValueCache is cached onto the element so that it can be used for subsequent hooks in this call that are associated with the same root property.
                               If we didn't cache the updated rootPropertyValue, each subsequent update to the root property in this tick pass would reset the previous hook's updates to rootPropertyValue prior to injection. */
                            /* A nice performance byproduct of rootPropertyValue caching is that subsequently chained animations using the same hookRoot but a different hook can use this cached rootPropertyValue. */
                            if (CSS.Hooks.registered[property]) {
                                var hookRoot = CSS.Hooks.getRoot(property),
                                    rootPropertyValueCache = Data(element).rootPropertyValueCache[hookRoot];

                                if (rootPropertyValueCache) {
                                    tween.rootPropertyValue = rootPropertyValueCache;
                                }
                            }

                            /*****************
                                DOM Update
                            *****************/

                            /* setPropertyValue() returns an array of the property name and property value post any normalization that may have been performed. */
                            /* Note: To solve an IE<=8 positioning bug, the unit type is dropped when setting a property value of 0. */
                            var adjustedSetData = CSS.setPropertyValue(element, property, tween.currentValue + (parseFloat(currentValue) === 0 ? "" : tween.unitType), tween.rootPropertyValue, tween.scrollData); /* SET */

                            /*******************
                               Hooks: Part II
                            *******************/

                            /* Now that we have the hook's updated rootPropertyValue (which is the post-processed value provided by the adjustedSetData array), cache it onto the element. */
                            if (CSS.Hooks.registered[property]) {
                                /* Since adjustedSetData contains normalized data ready for DOM updating, the rootPropertyValue needs to be re-extracted from its normalized form. */
                                if (CSS.Normalizations.registered[hookRoot]) {
                                    Data(element).rootPropertyValueCache[hookRoot] = CSS.Normalizations.registered[hookRoot]("extract", null, adjustedSetData[1]);
                                } else {
                                    Data(element).rootPropertyValueCache[hookRoot] = adjustedSetData[1];
                                }
                            }

                            /***************
                               Transforms
                            ***************/

                            /* Flag whether a transform property is being animated so that flushTransformCache() can be triggered once this tick pass is complete. */
                            if (adjustedSetData[0] === "transform") {
                                transformPropertyExists = true;
                            }
                        }
                    }

                    /****************
                        mobileHA
                    ****************/

                    /* If mobileHA is enabled, set the translate3d transform to null to force hardware acceleration. It's safe to override this property since Velocity doesn't actually support its animation (hooks are used in its place). */
                    if (opts.mobileHA) {
                        /* Don't set the null transform hack if we've already done so. */
                        if (Data(element).transformCache.translate3d === undefined) {
                            /* All entries on the transformCache object are concatenated into a single transform string via flushTransformCache(). */
                            Data(element).transformCache.translate3d = "(0px, 0px, 0px)";

                            transformPropertyExists = true;
                        }
                    }

                    if (transformPropertyExists) {
                        CSS.flushTransformCache(element);
                    }
                }

                /* The non-"none" display value is only applied to an element once -- when its associated call is first ticked through. Accordingly, it's set to false so that it isn't re-processed by this call in the next tick. */
                if (opts.display && opts.display !== "none") {
                    Velocity.State.calls[i][2].display = false;
                }

                /* Pass the elements and the timing data (percentComplete, msRemaining, and timeStart) into the progress callback. */
                if (opts.progress) {
                    opts.progress.call(callContainer[1], callContainer[1], percentComplete, Math.max(0, (timeStart + opts.duration) - timeCurrent), timeStart);
                }

                /* If this call has finished tweening, pass its index to completeCall() to handle call cleanup. */
                if (percentComplete === 1) {
                    completeCall(i);
                }
            }
        }

        /* Note: completeCall() contains the logic for setting the isTicking flag to false (which occurs when the last active call on Velocity.State.calls has completed). */
        if (Velocity.State.isTicking) {
            requestAnimationFrame(tick);
        }
    }

    /**********************
        Call Completion
    **********************/

    /* Note: Unlike tick(), which processes all active calls at once, call completion is handled on a per-call basis. */
    function completeCall (callIndex, isStopped) {
        /* Ensure the call exists. */
        if (!Velocity.State.calls[callIndex]) {
            return false;
        }

        /* Pull the metadata from the call. */
        var call = Velocity.State.calls[callIndex][0],
            elements = Velocity.State.calls[callIndex][1],
            opts = Velocity.State.calls[callIndex][2];

        var remainingCallsExist = false;

        /*************************
           Element Finalization
        *************************/
            
        for (var i = 0, callLength = call.length; i < callLength; i++) {
            var element = call[i].element;

            /* If the display option is set to "none" (meaning the user intends to hide the element), set this value now that the animation is complete. */
            /* Note: The display option is ignored with "reverse" calls, which is what loops are composed of. See reverse's logic for further details. */
            /* Note: display:none isn't set when calls are manually stopped (via Velocity.animate("stop"). */
            if (!isStopped && opts.display === "none" && !opts.loop) {
                CSS.setPropertyValue(element, "display", opts.display);
            }

            /* If the element's queue is empty (if only the "inprogress" item is left at position 0) or if its queue is about to run a non-Velocity-initiated entry, turn off the isAnimating flag.
               A non-Velocity-initiatied queue entry's logic might alter an element's CSS values and thereby cause Velocity's cached value data to go stale. To detect if a queue entry was initiated by Velocity,
               we check for the existence of our special Velocity.queueEntryFlag declaration, which minifiers won't rename since the flag is assigned to jQuery's global $ object and thus exists out of Velocity's own scope. */
            if ($.queue(element)[1] === undefined || !/\.velocityQueueEntryFlag/i.test($.queue(element)[1])) {
                /* The element may have been deleted. Ensure that its data cache still exists before acting on it. */
                if (Data(element)) {
                    Data(element).isAnimating = false;
                    /* Clear the element's rootPropertyValueCache, which will become stale. */
                    Data(element).rootPropertyValueCache = {};

                    /* Transform subproperties that trigger hardware acceleration are de-applied entirely when they hit their zero values so that HA'd elements don't remain blurry. */
                    var transformHAProperties = [ "transformPerspective", "translateZ", "rotateX", "rotateY" ],
                        transformHAProperty,
                        transformHAPropertyExists = false;

                    for (var transformHAPropertyIndex in transformHAProperties) {
                        transformHAProperty = transformHAProperties[transformHAPropertyIndex];

                        /* If any transform subproperty begins with "(0", remove it. */
                        if (/^\(0[^.]/.test(Data(element).transformCache[transformHAProperty])) {
                            transformHAPropertyExists = true;
                            delete Data(element).transformCache[transformHAProperty];
                        }
                    }

                    /* Mobile devices have hardware acceleration removed at the end of the animation in order to avoid straining the GPU's available memory. */
                    if (opts.mobileHA) {
                        transformHAPropertyExists = true;
                        delete Data(element).transformCache.translate3d;
                    }

                    /* Flush the subproperty removals to the DOM. */
                    if (transformHAPropertyExists) {
                        CSS.flushTransformCache(element);
                    }
                }
            }

            /*********************
               Option: Complete
            *********************/

            /* The complete callback is fired once per call -- not once per elemenet -- and is passed the full raw DOM element set as both its context and its first argument. */
            /* Note: Callbacks aren't fired when calls are manually stopped (via Velocity.animate("stop"). */
            /* Note: If this is a loop, complete callback firing is handled by the loop's final reverse call -- we skip handling it here. */
            if (!isStopped && opts.complete && !opts.loop && (i === callLength - 1)) {
                opts.complete.call(elements, elements);
            }

            /***************
               Dequeueing
            ***************/

            /* Fire the next call in the queue so long as this call's queue wasn't set to false (to trigger a parallel animation), which would have already caused the next call to fire. */
            /* Note: Even if the end of the animation queue has been reached, $.dequeue() must still be called in order to completely clear jQuery's animation queue. */
            if (opts.queue !== false) {
                $.dequeue(element, opts.queue);
            }
        }

        /************************
           Calls Array Cleanup
        ************************/

        /* Since this call is complete, remove it from Velocity.State.calls. For performance reasons, the call is set to false instead of being deleted from the array. Learn more here: http://www.html5rocks.com/en/tutorials/speed/v8/ */
        Velocity.State.calls[callIndex] = false;

        /* Iterate through the calls array to determine if this was the last running animation. If so, set a flag to end ticking and clear the calls array. */
        for (var j = 0, callsLength = Velocity.State.calls.length; j < callsLength; j++) {
            if (Velocity.State.calls[j] !== false) {
                remainingCallsExist = true;

                break;
            }    
        }

        if (remainingCallsExist === false) {
            /* tick() will detect this flag upon its next iteration and subsequently turn itself off. */
            Velocity.State.isTicking = false;

            /* Clear the calls array so that its length is reset. */
            delete Velocity.State.calls;
            Velocity.State.calls = [];
        }
    }

    /*******************
        Installation
    *******************/

    /* Both jQuery and Zepto allow their $.fn object to be extended to allow wrapped elements to be subjected to plugin calls. If either framework is loaded, register a "velocity" extension pointing to Velocity's core animate() method. */
    var framework = window.jQuery || window.Zepto;

    if (framework) {
        /* Assign the object function to Velocity's animate() method. */
        framework.fn.velocity = Velocity.animate;

        /* Assign the object function's defaults to Velocity's global defaults object. */
        framework.fn.velocity.defaults = Velocity.defaults;
    }

    /* Support for AMD and CommonJS module loaders. */
    if (typeof define !== "undefined" && define.amd) {
        define(function() { return Velocity; });
    } else if (typeof module !== "undefined" && module.exports) {
        module.exports = Velocity;
    }

    /***********************
       Packaged Sequences
    ***********************/

    /* slideUp, slideDown */
    $.each([ "Down", "Up" ], function(i, direction) {
        Velocity.Sequences["slide" + direction] = function (element, options) {
            /* Don't re-run a slide sequence if the element is already at its final display value. */
            //if ((direction === "Up" && Velocity.CSS.getPropertyValue(element, "display") === 0) ||
            //    (direction === "Down" && Velocity.CSS.getPropertyValue(element, "display") !== 0)) {
            //    return;
            //}

            var opts = $.extend({}, options),
                originalValues = {
                    height: null,
                    marginTop: null,
                    marginBottom: null,
                    paddingTop: null,
                    paddingBottom: null,
                    overflow: null,
                    overflowX: null,
                    overflowY: null
                },
                /* The slide functions make use of the begin and complete callbacks, so the the user's custom callbacks are stored upfront for triggering once slideDown/Up's own callback logic is complete. */
                begin = opts.begin,
                complete = opts.complete,
                isHeightAuto = false;

            /* Allow the user to set display to null to bypass display toggling. */
            if (opts.display !== null) {
                /* Unless the user is trying to override the display option, show the element before slideDown begins and hide the element after slideUp completes. */
                if (direction === "Down") {
                    /* All elements subjected to sliding down are set to the "block" display value (-- )as opposed to an element-appropriate block/inline distinction) because inline elements cannot actually have their dimensions modified. */
                    opts.display = opts.display || Velocity.CSS.Values.getDisplayType(element);
                } else {
                    opts.display = opts.display || "none";
                }
            }

            /* Begin callback. */
            opts.begin = function () {
                /* Check for height: "auto" so we can revert back to it when the sliding animation is complete. */
                function checkHeightAuto() {
                    element.style.display = "block";
                    originalValues.height = Velocity.CSS.getPropertyValue(element, "height");

                    /* We determine if height was originally set to "auto" by checking if the computed "auto" value is identical to the original value. */
                    element.style.height = "auto";
                    if (Velocity.CSS.getPropertyValue(element, "height") === originalValues.height) {
                        isHeightAuto = true;
                    }

                    /* Revert to the computed value before sliding begins to prevent vertical popping due to scrollbars. */
                    /* Note: Webkit has a glitch where height must be explicitly assigned the "px" unit to take effect when height is currently set to "auto". */
                    Velocity.CSS.setPropertyValue(element, "height", originalValues.height + "px");
                }

                if (direction === "Down") {
                    originalValues.overflow = [ Velocity.CSS.getPropertyValue(element, "overflow"), 0 ];
                    originalValues.overflowX = [ Velocity.CSS.getPropertyValue(element, "overflowX"), 0 ];
                    originalValues.overflowY = [ Velocity.CSS.getPropertyValue(element, "overflowY"), 0 ];

                    /* Ensure the element is visible, and temporarily remove vertical scrollbars since animating them is visually unappealing. */
                    element.style.overflow = "hidden";
                    element.style.overflowX = "visible";
                    element.style.overflowY = "hidden";

                    /* With the scrollars no longer affecting sizing, determine whether the element is currently set to height: "auto". */
                    checkHeightAuto();

                    /* Cache the elements' original vertical dimensional values so that we can animate back to them from starting values of 0. */
                    for (var property in originalValues) {
                        /* Overflow values have already been cached, do not overwrite them with "hidden" (which they were just set to). */
                        if (/^overflow/.test(property)) {
                            continue;
                        }

                        /* Use forcefeeding to animate slideDown properties from 0. */
                        originalValues[property] = [ Velocity.CSS.getPropertyValue(element, property), 0 ];
                    }

                    /* Hide the element inside this begin callback, otherwise it'll momentarily flash itself before the actual animation tick begins. */
                    element.style.display = "none";
                } else {
                    checkHeightAuto();

                    for (var property in originalValues) {
                        /* Use forcefeeding to animate slideUp properties toward 0. */
                        originalValues[property] = [ 0, Velocity.CSS.getPropertyValue(element, property) ];
                    }

                    /* As with slideDown, slideUp hides the element's scrollbars while animating since scrollbar height tweening looks unappealing. */
                    element.style.overflow = "hidden";
                    element.style.overflowX = "visible";
                    element.style.overflowY = "hidden";
                }

                /* If the user passed in a begin callback, fire it now. */
                if (begin) {
                    begin.call(element, element);
                }
            }

            /* Complete callback. */
            opts.complete = function (element) {
                var propertyValuePosition = (direction === "Down") ? 0 : 1;

                if (isHeightAuto === true) {
                    /* If the element's height was originally set to auto, overwrite the computed value with "auto". */
                    originalValues.height[propertyValuePosition] = "auto";
                } else {
                    /* Note: Webkit has a glitch where height must be explicitly assigned the "px" unit to take effect after an element's height has been set to "auto". */
                    originalValues.height[propertyValuePosition] += "px";
                }

                /* Reset the element to its original values once its slide animation is complete. (For slideDown, overflow values are reset. For slideUp, all values are reset (since they were animated to 0).) */
                for (var property in originalValues) {
                    element.style[property] = originalValues[property][propertyValuePosition];
                }

                /* If the user passed in a complete callback, fire it now. */
                if (complete) {
                    complete.call(element, element);
                }
            };

            /* Animation triggering. */
            Velocity.animate(element, originalValues, opts);
        };
    });

    /* fadeIn, fadeOut */
    $.each([ "In", "Out" ], function(i, direction) {
        Velocity.Sequences["fade" + direction] = function (element, options, elementsIndex, elementsSize) {
            var opts = $.extend({}, options),
                propertiesMap = {
                    opacity: (direction === "In") ? 1 : 0
                };

            /* Since sequences are triggered individually for each element in the animated set, we avoid repeatedly triggering callbacks by firing them only when the final element is reached. */
            if (elementsIndex !== elementsSize - 1) {
                opts.complete = opts.begin = null;
            }

            /* If a display value was passed into the sequence, use it. Otherwise, default to "none" for fadeOut and default to the element-specific default value for fadeIn. */
            /* Note: We allow users to pass in "null" to skip display setting altogether. */
            if (opts.display !== null) {
                opts.display = (direction === "In") ? Velocity.CSS.Values.getDisplayType(element) : "none";
            }

            Velocity.animate(this, propertiesMap, opts);
        };
    });
})((window.jQuery || window.Zepto || window), window, document);

/******************
   Known Issues
******************/

/* When animating height or width to a % value on an element *without* box-sizing:border-box and *with* visible scrollbars on *both* axes, the opposite axis (e.g. height vs width) will be shortened by the height/width of its scrollbar. */
/* The translateX/Y/Z subproperties of the transform CSS property are %-relative to the element itself -- not its parent. Velocity, however, doesn't make the distinction. Thus, converting to or from the % unit with these subproperties will produce an inaccurate conversion value. */
},{}],2:[function(require,module,exports){
// Main entry point for app
var nav = require('./navigation.js');

$(document).on('ready', function() {
    //client.init();
    nav.init();
});
},{"./navigation.js":3}],3:[function(require,module,exports){
var velocity = require('velocity-animate');

module.exports = (function() {

    var LOAD_TIME = 300; // milliseconds

    var parcel = {},
        root = $('#content'),
        transporter = '#transporter',
        nav = $('#main-nav');

    parcel.init = function() {
        this.to = to;
        this.enter = enter;

        enter();
        bindEvents();
    };

    function bindEvents() {
        nav.on('click', 'a', function(event) {
            event.preventDefault();

            $(this).siblings('.active').removeClass('active');
            $(this).addClass('active');

            var url = $(this).attr('href');
            to(url);
        });

        $('#logo').on('click', 'a', function(event) {
            event.preventDefault();
            nav.find('a.active').removeClass('active');
            nav.find('a[href="/articles/"]').addClass('active');
            to('/');
        });

        $('#content').on('click', '#articles > a', function(event) {
            event.preventDefault();

            var url = $(this).attr('href');
            to(url);
        });
    }

    function to(url) {
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

    return parcel;
}());
},{"velocity-animate":1}]},{},[2])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvZGFuL3JlcG9zL2RlYWdsZWlvL25vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5aW5nL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvZGFuL3JlcG9zL2RlYWdsZWlvL25vZGVfbW9kdWxlcy92ZWxvY2l0eS1hbmltYXRlL2pxdWVyeS52ZWxvY2l0eS5qcyIsIi9Vc2Vycy9kYW4vcmVwb3MvZGVhZ2xlaW8vc2NyaXB0cy9hcHAvbWFpbi5qcyIsIi9Vc2Vycy9kYW4vcmVwb3MvZGVhZ2xlaW8vc2NyaXB0cy9hcHAvbmF2aWdhdGlvbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3gxRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qKioqKioqKioqKioqKipcbiAgICBEZXRhaWxzXG4qKioqKioqKioqKioqKiovXG5cbi8qIVxuKiBWZWxvY2l0eS5qczogQWNjZWxlcmF0ZWQgSmF2YVNjcmlwdCBhbmltYXRpb24uXG4qIEB2ZXJzaW9uIDAuMi4xXG4qIEBkb2NzIGh0dHA6Ly92ZWxvY2l0eWpzLm9yZ1xuKiBAbGljZW5zZSBDb3B5cmlnaHQgMjAxNCBKdWxpYW4gU2hhcGlyby4gTUlUIExpY2Vuc2U6IGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvTUlUX0xpY2Vuc2VcbiovXG5cbi8qKioqKioqKioqKioqKioqXG4gICAgIFN1bW1hcnlcbioqKioqKioqKioqKioqKiovXG5cbi8qXG5WZWxvY2l0eSBpcyBhIGNvbmNpc2UgQ1NTIG1hbmlwdWxhdGlvbiBsaWJyYXJ5IHdpdGggYSBwZXJmb3JtYW50IGFuaW1hdGlvbiBzdGFjayBidWlsdCBvbiB0b3Agb2YgaXQuIFRvIG1pbmltaXplIERPTSBpbnRlcmFjdGlvbiwgVmVsb2NpdHkgcmV1c2VzIHByZXZpb3VzIGFuaW1hdGlvbiB2YWx1ZXMgYW5kIGJhdGNoZXMgRE9NIHF1ZXJpZXMgd2hlcmV2ZXIgcG9zc2libGUuXG5XaGVuZXZlciBWZWxvY2l0eSB0cmlnZ2VycyBhIERPTSBxdWVyeSAoYSBHRVQpIG9yIGEgRE9NIHVwZGF0ZSAoYSBTRVQpLCBhIGNvbW1lbnQgaW5kaWNhdGluZyBzdWNoIGlzIHBsYWNlZCBuZXh0IHRvIHRoZSBvZmZlbmRpbmcgbGluZSBvZiBjb2RlLlxuVG8gbGVhcm4gbW9yZSBhYm91dCB0aGUgbnVhbmNlcyBvZiBET00gcGVyZm9ybWFuY2UsIGNoZWNrIG91dCB0aGVzZSB0YWxrczogaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1jbVpxTHpQeTBYRSBhbmQgaHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1uOGVwNGxlb045QS5cblxuVmVsb2NpdHkgaXMgc3RydWN0dXJlZCBpbnRvIGZvdXIgc2VjdGlvbnM6XG4tIENTUyBTdGFjazogV29ya3MgaW5kZXBlbmRlbnRseSBmcm9tIHRoZSByZXN0IG9mIFZlbG9jaXR5LlxuLSBWZWxvY2l0eS5hbmltYXRlKCkgaXMgdGhlIGNvcmUgYW5pbWF0aW9uIG1ldGhvZCB0aGF0IGl0ZXJhdGVzIG92ZXIgdGhlIHRhcmdldGVkIGVsZW1lbnQgc2V0IGFuZCBxdWV1ZXMgdGhlIGluY29taW5nIFZlbG9jaXR5IGFuaW1hdGlvbiBvbnRvIGVhY2ggZWxlbWVudCBpbmRpdmlkdWFsbHkuIFRoaXMgcHJvY2VzcyBjb25zaXN0cyBvZjpcbiAgLSBQcmUtUXVldWVpbmc6IFByZXBhcmUgdGhlIGVsZW1lbnQgZm9yIGFuaW1hdGlvbiBieSBpbnN0YW50aWF0aW5nIGl0cyBkYXRhIGNhY2hlIGFuZCBwcm9jZXNzaW5nIHRoZSBjYWxsJ3Mgb3B0aW9ucyBhcmd1bWVudC5cbiAgLSBRdWV1ZWluZzogVGhlIGxvZ2ljIHRoYXQgcnVucyBvbmNlIHRoZSBjYWxsIGhhcyByZWFjaGVkIGl0cyBwb2ludCBvZiBleGVjdXRpb24gaW4gdGhlIGVsZW1lbnQncyAkLnF1ZXVlKCkgc3RhY2suIE1vc3QgbG9naWMgaXMgcGxhY2VkIGhlcmUgdG8gYXZvaWQgcmlza2luZyBpdCBiZWNvbWluZyBzdGFsZS5cbiAgLSBQdXNoaW5nOiBDb25zb2xpZGF0aW9uIG9mIHRoZSB0d2VlbiBkYXRhIGZvbGxvd2VkIGJ5IGl0cyBwdXNoIG9udG8gdGhlIGdsb2JhbCBpbi1wcm9ncmVzcyBjYWxscyBjb250YWluZXIuXG4tIHRpY2soKTogVGhlIHNpbmdsZSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgbG9vcCByZXNwb25zaWJsZSBmb3IgdHdlZW5pbmcgYWxsIGluLXByb2dyZXNzIGNhbGxzLlxuLSBjb21wbGV0ZUNhbGwoKTogSGFuZGxlcyB0aGUgY2xlYW51cCBwcm9jZXNzIGZvciBlYWNoIFZlbG9jaXR5IGNhbGwuXG5cblRoZSBiaWdnZXN0IGNhdXNlIG9mIGJvdGggY29kZWJhc2UgYmxvYXQgYW5kIGNvZGVwYXRoIG9iZnVzY2F0aW9uIGlzIHN1cHBvcnQgZm9yIGFuaW1hdGluZyBpbmRpdmlkdWFsIHZhbHVlcyBvZiBjb21wb3VuZC12YWx1ZSBDU1MgcHJvcGVydGllcyAoZS5nLiBcInRleHRTaGFkb3dCbHVyXCIgaW4gXCJ0ZXh0U2hhZG93OiAwcHggMHB4IDBweCBibGFja1wiKS5cbiovXG5cbi8qIE5PVElDRTogRGVzcGl0ZSB0aGUgZW5zdWluZyBjb2RlIGluZGljYXRpbmcgdGhhdCBWZWxvY2l0eSB3b3JrcyAqd2l0aG91dCogalF1ZXJ5IGFuZCAqd2l0aCogWmVwdG8sIHRoaXMgc3VwcG9ydCBoYXMgbm90IHlldCBsYW5kZWQuICovXG5cbjsoZnVuY3Rpb24gKGdsb2JhbCwgd2luZG93LCBkb2N1bWVudCwgdW5kZWZpbmVkKSB7XG5cbiAgICAvKioqKioqKioqKioqKioqKipcbiAgICAgICAgQ29uc3RhbnRzXG4gICAgKioqKioqKioqKioqKioqKiovXG5cbiAgICB2YXIgTkFNRSA9IFwidmVsb2NpdHlcIixcbiAgICAgICAgREVGQVVMVF9EVVJBVElPTiA9IDQwMCxcbiAgICAgICAgREVGQVVMVF9FQVNJTkcgPSBcInN3aW5nXCI7XG5cbiAgICAvKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgSGVscGVyIEZ1bmN0aW9uc1xuICAgICoqKioqKioqKioqKioqKioqKioqKi9cblxuICAgIC8qIElFIGRldGVjdGlvbi4gR2lzdDogaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vanVsaWFuc2hhcGlyby85MDk4NjA5ICovXG4gICAgdmFyIElFID0gKGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAoZG9jdW1lbnQuZG9jdW1lbnRNb2RlKSB7XG4gICAgICAgICAgICByZXR1cm4gZG9jdW1lbnQuZG9jdW1lbnRNb2RlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDc7IGkgPiA0OyBpLS0pIHtcbiAgICAgICAgICAgICAgICB2YXIgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblxuICAgICAgICAgICAgICAgIGRpdi5pbm5lckhUTUwgPSBcIjwhLS1baWYgSUUgXCIgKyBpICsgXCJdPjxzcGFuPjwvc3Bhbj48IVtlbmRpZl0tLT5cIjtcblxuICAgICAgICAgICAgICAgIGlmIChkaXYuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJzcGFuXCIpLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBkaXYgPSBudWxsO1xuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfSkoKTtcblxuICAgIC8qIFJBRiBwb2x5ZmlsbC4gR2lzdDogaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vanVsaWFuc2hhcGlyby85NDk3NTEzICovXG4gICAgdmFyIHJlcXVlc3RBbmltYXRpb25GcmFtZSA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHwgKGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgdGltZUxhc3QgPSAwO1xuXG4gICAgICAgIHJldHVybiB3aW5kb3cud2Via2l0UmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8IHdpbmRvdy5tb3pSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHwgZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHZhciB0aW1lQ3VycmVudCA9IChuZXcgRGF0ZSgpKS5nZXRUaW1lKCksXG4gICAgICAgICAgICAgICAgdGltZURlbHRhO1xuXG4gICAgICAgICAgICAvKiBEeW5hbWljYWxseSBzZXQgZGVsYXkgb24gYSBwZXItdGljayBiYXNpcyB0byBtYXRjaCA2MGZwcy4gKi9cbiAgICAgICAgICAgIC8qIFRlY2huaXF1ZSBieSBFcmlrIE1vbGxlci4gTUlUIGxpY2Vuc2U6IGh0dHBzOi8vZ2lzdC5naXRodWIuY29tL3BhdWxpcmlzaC8xNTc5NjcxICovXG4gICAgICAgICAgICB0aW1lRGVsdGEgPSBNYXRoLm1heCgwLCAxNiAtICh0aW1lQ3VycmVudCAtIHRpbWVMYXN0KSk7XG4gICAgICAgICAgICB0aW1lTGFzdCA9IHRpbWVDdXJyZW50ICsgdGltZURlbHRhO1xuXG4gICAgICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW5jdGlvbigpIHsgY2FsbGJhY2sodGltZUN1cnJlbnQgKyB0aW1lRGVsdGEpOyB9LCB0aW1lRGVsdGEpO1xuICAgICAgICB9O1xuICAgIH0pKCk7XG5cbiAgICAvKiBTcGFyc2UgYXJyYXkgY29tcGFjdGluZy4gQ29weXJpZ2h0IExvLURhc2guIE1JVCBMaWNlbnNlOiBodHRwczovL2dpdGh1Yi5jb20vbG9kYXNoL2xvZGFzaC9ibG9iL21hc3Rlci9MSUNFTlNFLnR4dCAqL1xuICAgIGZ1bmN0aW9uIGNvbXBhY3RTcGFyc2VBcnJheSAoYXJyYXkpIHtcbiAgICAgICAgdmFyIGluZGV4ID0gLTEsXG4gICAgICAgICAgICBsZW5ndGggPSBhcnJheSA/IGFycmF5Lmxlbmd0aCA6IDAsXG4gICAgICAgICAgICByZXN1bHQgPSBbXTtcblxuICAgICAgICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgICAgICAgICAgdmFyIHZhbHVlID0gYXJyYXlbaW5kZXhdO1xuXG4gICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIHZhciBUeXBlID0ge1xuICAgICAgICBpc1N0cmluZzogZnVuY3Rpb24gKHZhcmlhYmxlKSB7XG4gICAgICAgICAgICByZXR1cm4gKHR5cGVvZiB2YXJpYWJsZSA9PT0gXCJzdHJpbmdcIik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaXNBcnJheTogQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAodmFyaWFibGUpIHtcbiAgICAgICAgICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFyaWFibGUpID09PSBcIltvYmplY3QgQXJyYXldXCI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaXNGdW5jdGlvbjogZnVuY3Rpb24gKHZhcmlhYmxlKSB7XG4gICAgICAgICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhcmlhYmxlKSA9PT0gXCJbb2JqZWN0IEZ1bmN0aW9uXVwiO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qIENvcHlyaWdodCBNYXJ0aW4gQm9obS4gTUlUIExpY2Vuc2U6IGh0dHBzOi8vZ2lzdC5naXRodWIuY29tL1RvbWFsYWsvODE4YTc4YTIyNmEwNzM4ZWFhZGUgKi9cbiAgICAgICAgaXNOb2RlTGlzdDogZnVuY3Rpb24gKHZhcmlhYmxlKSB7XG4gICAgICAgICAgICByZXR1cm4gdHlwZW9mIHZhcmlhYmxlID09PSBcIm9iamVjdFwiICYmXG4gICAgICAgICAgICAgICAgL15cXFtvYmplY3QgKEhUTUxDb2xsZWN0aW9ufE5vZGVMaXN0fE9iamVjdClcXF0kLy50ZXN0KE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YXJpYWJsZSkpICYmXG4gICAgICAgICAgICAgICAgdmFyaWFibGUubGVuZ3RoICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgICAgICAgICAodmFyaWFibGUubGVuZ3RoID09PSAwIHx8ICh0eXBlb2YgdmFyaWFibGVbMF0gPT09IFwib2JqZWN0XCIgJiYgdmFyaWFibGVbMF0ubm9kZVR5cGUgPiAwKSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyogRGV0ZXJtaW5lIGlmIHZhcmlhYmxlIGlzIGEgd3JhcHBlZCBqUXVlcnkgb3IgWmVwdG8gZWxlbWVudC4gKi9cbiAgICAgICAgaXNXcmFwcGVkOiBmdW5jdGlvbiAodmFyaWFibGUpIHtcbiAgICAgICAgICAgIHJldHVybiB2YXJpYWJsZSAmJiAodmFyaWFibGUuanF1ZXJ5IHx8ICh3aW5kb3cuWmVwdG8gJiYgd2luZG93LlplcHRvLnplcHRvLmlzWih2YXJpYWJsZSkpKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvKioqKioqKioqKioqKioqKipcbiAgICAgICBEZXBlbmRlbmNpZXNcbiAgICAqKioqKioqKioqKioqKioqKi9cblxuICAgIC8qIExvY2FsIHRvIG91ciBWZWxvY2l0eSBzY29wZSwgYXNzaWduICQgdG8gb3VyIGpRdWVyeSBzaGltIGlmIGpRdWVyeSBpdHNlbGYgaXNuJ3QgbG9hZGVkLiAoVGhlIHNoaW0gaXMgYSBwb3J0IG9mIHRoZSBqUXVlcnkgdXRpbGl0eSBmdW5jdGlvbnMgdGhhdCBWZWxvY2l0eSB1c2VzLikgKi9cbiAgICAvKiBOb3RlOiBXZSBjYW4ndCBkZWZhdWx0IHRvIFplcHRvIHNpbmNlIHRoZSBzaGltbGVzcyB2ZXJzaW9uIG9mIFZlbG9jaXR5IGRvZXMgbm90IHdvcmsgd2l0aCBaZXB0bywgd2hpY2ggaXMgbWlzc2luZyBzZXZlcmFsIHV0aWxpdHkgZnVuY3Rpb25zIHRoYXQgVmVsb2NpdHkgcmVxdWlyZXMuICovXG4gICAgdmFyICQgPSB3aW5kb3cualF1ZXJ5IHx8IChnbG9iYWwuVmVsb2NpdHkgJiYgZ2xvYmFsLlZlbG9jaXR5LlV0aWxpdGllcyk7XG5cbiAgICBpZiAoISQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVmVsb2NpdHk6IEVpdGhlciBqUXVlcnkgb3IgVmVsb2NpdHkncyBqUXVlcnkgc2hpbSBtdXN0IGZpcnN0IGJlIGxvYWRlZC5cIilcbiAgICAvKiBXZSBhbGxvdyB0aGUgZ2xvYmFsIFZlbG9jaXR5IHZhcmlhYmxlIHRvIHByZS1leGlzdCBzbyBsb25nIGFzIHdlIHdlcmUgcmVzcG9uc2libGUgZm9yIGl0cyBjcmVhdGlvbiAodmlhIHRoZSBqUXVlcnkgc2hpbSwgd2hpY2ggdW5pcXVlbHkgYXNzaWducyBhIFV0aWxpdGllcyBwcm9wZXJ0eSB0byB0aGUgVmVsb2NpdHkgb2JqZWN0KS4gKi9cbiAgICB9IGVsc2UgaWYgKGdsb2JhbC5WZWxvY2l0eSAhPT0gdW5kZWZpbmVkICYmICFnbG9iYWwuVmVsb2NpdHkuVXRpbGl0aWVzKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlZlbG9jaXR5OiBOYW1lc3BhY2UgaXMgb2NjdXBpZWQuXCIpO1xuICAgIC8qIE5vdGhpbmcgcHJldmVudHMgVmVsb2NpdHkgZnJvbSB3b3JraW5nIG9uIElFNis3LCBidXQgaXQgaXMgbm90IHdvcnRoIHRoZSB0aW1lIHRvIHRlc3Qgb24gdGhlbS4gUmV2ZXJ0IHRvIGpRdWVyeSdzICQuYW5pbWF0ZSgpLCBhbmQgbG9zZSBWZWxvY2l0eSdzIGV4dHJhIGZlYXR1cmVzLiAqL1xuICAgIH0gZWxzZSBpZiAoSUUgPD0gNykge1xuICAgICAgICBpZiAoIXdpbmRvdy5qUXVlcnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlZlbG9jaXR5OiBGb3IgSUU8PTcsIFZlbG9jaXR5IGZhbGxzIGJhY2sgdG8galF1ZXJ5LCB3aGljaCBtdXN0IGZpcnN0IGJlIGxvYWRlZC5cIik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB3aW5kb3cualF1ZXJ5LmZuLnZlbG9jaXR5ID0gd2luZG93LmpRdWVyeS5mbi5hbmltYXRlO1xuXG4gICAgICAgICAgICAvKiBOb3cgdGhhdCAkLmZuLnZlbG9jaXR5IGlzIGFsaWFzZWQsIGFib3J0IHRoaXMgVmVsb2NpdHkgZGVjbGFyYXRpb24uICovXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAvKiBJRTggZG9lc24ndCB3b3JrIHdpdGggdGhlIGpRdWVyeSBzaGltOyBpdCByZXF1aXJlcyBqUXVlcnkgcHJvcGVyLiAqL1xuICAgIH0gZWxzZSBpZiAoSUUgPT09IDggJiYgIXdpbmRvdy5qUXVlcnkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVmVsb2NpdHk6IEZvciBJRTgsIFZlbG9jaXR5IHJlcXVpcmVzIGpRdWVyeSB0byBiZSBsb2FkZWQuIChWZWxvY2l0eSdzIGpRdWVyeSBzaGltIGRvZXMgbm90IHdvcmsgd2l0aCBJRTguKVwiKTtcbiAgICB9XG5cbiAgICAvKiBTaG9ydGhhbmQgYWxpYXMgZm9yIGpRdWVyeSdzICQuZGF0YSgpIHV0aWxpdHkuICovXG4gICAgZnVuY3Rpb24gRGF0YSAoZWxlbWVudCkge1xuICAgICAgICAvKiBIYXJkY29kZSBhIHJlZmVyZW5jZSB0byB0aGUgcGx1Z2luIG5hbWUuICovXG4gICAgICAgIHZhciByZXNwb25zZSA9ICQuZGF0YShlbGVtZW50LCBOQU1FKTtcblxuICAgICAgICAvKiBqUXVlcnkgPD0xLjQuMiByZXR1cm5zIG51bGwgaW5zdGVhZCBvZiB1bmRlZmluZWQgd2hlbiBubyBtYXRjaCBpcyBmb3VuZC4gV2Ugbm9ybWFsaXplIHRoaXMgYmVoYXZpb3IuICovXG4gICAgICAgIHJldHVybiByZXNwb25zZSA9PT0gbnVsbCA/IHVuZGVmaW5lZCA6IHJlc3BvbnNlO1xuICAgIH07XG5cbiAgICAvKioqKioqKioqKioqKlxuICAgICAgICBTdGF0ZVxuICAgICoqKioqKioqKioqKiovXG5cbiAgICAvKiBWZWxvY2l0eSByZWdpc3RlcnMgaXRzZWxmIG9udG8gYSBnbG9iYWwgY29udGFpbmVyICh3aW5kb3cualF1ZXJ5IHx8IHdpbmRvdy5aZXB0byB8fCB3aW5kb3cpIHNvIHRoYXQgdGhhdCBjZXJ0YWluIGZlYXR1cmVzIGFyZSBhY2Nlc3NpYmxlIGJleW9uZCBqdXN0IGEgcGVyLWVsZW1lbnQgc2NvcGUuIFRoaXMgbWFzdGVyIG9iamVjdCBjb250YWlucyBhbiAuYW5pbWF0ZSgpIG1ldGhvZCxcbiAgICAgICB3aGljaCBpcyBsYXRlciBhc3NpZ25lZCB0byAkLmZuIChpZiBqUXVlcnkgb3IgWmVwdG8gYXJlIHByZXNlbnQpLiBBY2NvcmRpbmdseSwgVmVsb2NpdHkgY2FuIGJvdGggYWN0IG9uIHdyYXBwZWQgRE9NIGVsZW1lbnRzIGFuZCBzdGFuZCBhbG9uZSBmb3IgdGFyZ2V0aW5nIHJhdyBET00gZWxlbWVudHMuICovXG4gICAgLyogTm90ZTogVGhlIGdsb2JhbCBvYmplY3QgYWxzbyBkb3VibGVzIGFzIGEgcHVibGljbHktYWNjZXNzaWJsZSBkYXRhIHN0b3JlIGZvciB0aGUgcHVycG9zZXMgb2YgdW5pdCB0ZXN0aW5nLiAoQ2FwaXRhbGl6ZWQgb2JqZWN0cyBhcmUgbWVhbnQgZm9yIHByaXZhdGUgdXNlLCBsb3dlcmNhc2Ugb2JqZWN0cyBhcmUgbWVhbnQgZm9yIHB1YmxpYyB1c2UuKSAqL1xuICAgIC8qIE5vdGU6IFdlIGFsaWFzIGJvdGggdGhlIGxvd2VyY2FzZSBhbmQgdXBwZXJjYXNlIHZhcmlhbnRzIG9mIFwidmVsb2NpdHlcIiB0byBtaW5pbWl6ZSB1c2VyIGlzc3VlcyBkdWUgdG8gdGhlIGxvd2VyY2FzZSBuYXR1cmUgb2YgdGhlICQuZm4gZXh0ZW5zaW9uLiAqL1xuICAgIHZhciBWZWxvY2l0eSA9IGdsb2JhbC5WZWxvY2l0eSA9IGdsb2JhbC52ZWxvY2l0eSA9IHtcbiAgICAgICAgLyogQ29udGFpbmVyIGZvciBwYWdlLXdpZGUgVmVsb2NpdHkgc3RhdGUgZGF0YS4gKi9cbiAgICAgICAgU3RhdGU6IHtcbiAgICAgICAgICAgIC8qIERldGVjdCBtb2JpbGUgZGV2aWNlcyB0byBkZXRlcm1pbmUgaWYgbW9iaWxlSEEgc2hvdWxkIGJlIHR1cm5lZCBvbi4gKi9cbiAgICAgICAgICAgIGlzTW9iaWxlOiAvQW5kcm9pZHx3ZWJPU3xpUGhvbmV8aVBhZHxpUG9kfEJsYWNrQmVycnl8SUVNb2JpbGV8T3BlcmEgTWluaS9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCksXG4gICAgICAgICAgICAvKiBUaGUgbW9iaWxlSEEgb3B0aW9uJ3MgYmVoYXZpb3IgY2hhbmdlcyBvbiBvbGRlciBBbmRyb2lkIGRldmljZXMgKEdpbmdlcmJyZWFkLCB2ZXJzaW9ucyAyLjMuMy0yLjMuNykuICovXG4gICAgICAgICAgICBpc0FuZHJvaWQ6IC9BbmRyb2lkL2kudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KSxcbiAgICAgICAgICAgIGlzR2luZ2VyYnJlYWQ6IC9BbmRyb2lkIDJcXC4zXFwuWzMtN10vaS50ZXN0KG5hdmlnYXRvci51c2VyQWdlbnQpLFxuICAgICAgICAgICAgLyogQ3JlYXRlIGEgY2FjaGVkIGVsZW1lbnQgZm9yIHJlLXVzZSB3aGVuIGNoZWNraW5nIGZvciBDU1MgcHJvcGVydHkgcHJlZml4ZXMuICovXG4gICAgICAgICAgICBwcmVmaXhFbGVtZW50OiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLFxuICAgICAgICAgICAgLyogQ2FjaGUgZXZlcnkgcHJlZml4IG1hdGNoIHRvIGF2b2lkIHJlcGVhdGluZyBsb29rdXBzLiAqL1xuICAgICAgICAgICAgcHJlZml4TWF0Y2hlczoge30sXG4gICAgICAgICAgICAvKiBDYWNoZSB0aGUgYW5jaG9yIHVzZWQgZm9yIGFuaW1hdGluZyB3aW5kb3cgc2Nyb2xsaW5nLiAqL1xuICAgICAgICAgICAgc2Nyb2xsQW5jaG9yOiBudWxsLFxuICAgICAgICAgICAgLyogQ2FjaGUgdGhlIHByb3BlcnR5IG5hbWVzIGFzc29jaWF0ZWQgd2l0aCB0aGUgc2Nyb2xsIGFuY2hvci4gKi9cbiAgICAgICAgICAgIHNjcm9sbFByb3BlcnR5TGVmdDogbnVsbCxcbiAgICAgICAgICAgIHNjcm9sbFByb3BlcnR5VG9wOiBudWxsLFxuICAgICAgICAgICAgLyogS2VlcCB0cmFjayBvZiB3aGV0aGVyIG91ciBSQUYgdGljayBpcyBydW5uaW5nLiAqL1xuICAgICAgICAgICAgaXNUaWNraW5nOiBmYWxzZSxcbiAgICAgICAgICAgIC8qIENvbnRhaW5lciBmb3IgZXZlcnkgaW4tcHJvZ3Jlc3MgY2FsbCB0byBWZWxvY2l0eS4gKi9cbiAgICAgICAgICAgIGNhbGxzOiBbXVxuICAgICAgICB9LFxuICAgICAgICAvKiBWZWxvY2l0eSdzIGN1c3RvbSBDU1Mgc3RhY2suIE1hZGUgZ2xvYmFsIGZvciB1bml0IHRlc3RpbmcuICovXG4gICAgICAgIENTUzogeyAvKiBEZWZpbmVkIGJlbG93LiAqLyB9LFxuICAgICAgICAvKiBEZWZpbmVkIGJ5IFZlbG9jaXR5J3Mgb3B0aW9uYWwgalF1ZXJ5IHNoaW0uICovXG4gICAgICAgIFV0aWxpdGllczogd2luZG93LmpRdWVyeSA/IHt9IDogJCxcbiAgICAgICAgLyogQ29udGFpbmVyIGZvciB0aGUgdXNlcidzIGN1c3RvbSBhbmltYXRpb24gc2VxdWVuY2VzIHRoYXQgYXJlIHJlZmVyZW5jZWQgYnkgbmFtZSB2aWEgVmVsb2NpdHkncyBmaXJzdCBhcmd1bWVudCAoaW4gcGxhY2Ugb2YgYSBwcm9wZXJ0aWVzIG1hcCBvYmplY3QpLiAqL1xuICAgICAgICBTZXF1ZW5jZXM6IHtcbiAgICAgICAgICAgIC8qIE1hbnVhbGx5IHJlZ2lzdGVyZWQgYnkgdGhlIHVzZXIuIExlYXJuIG1vcmU6IFZlbG9jaXR5SlMub3JnLyNzZXF1ZW5jZXMgKi9cbiAgICAgICAgfSxcbiAgICAgICAgRWFzaW5nczoge1xuICAgICAgICAgICAgLyogRGVmaW5lZCBiZWxvdy4gKi9cbiAgICAgICAgfSxcbiAgICAgICAgLyogUGFnZS13aWRlIG9wdGlvbiBkZWZhdWx0cywgd2hpY2ggY2FuIGJlIG92ZXJyaWRlbiBieSB0aGUgdXNlci4gKi9cbiAgICAgICAgZGVmYXVsdHM6IHtcbiAgICAgICAgICAgIHF1ZXVlOiBcIlwiLFxuICAgICAgICAgICAgZHVyYXRpb246IERFRkFVTFRfRFVSQVRJT04sXG4gICAgICAgICAgICBlYXNpbmc6IERFRkFVTFRfRUFTSU5HLFxuICAgICAgICAgICAgYmVnaW46IG51bGwsXG4gICAgICAgICAgICBjb21wbGV0ZTogbnVsbCxcbiAgICAgICAgICAgIHByb2dyZXNzOiBudWxsLFxuICAgICAgICAgICAgZGlzcGxheTogbnVsbCxcbiAgICAgICAgICAgIGxvb3A6IGZhbHNlLFxuICAgICAgICAgICAgZGVsYXk6IGZhbHNlLFxuICAgICAgICAgICAgbW9iaWxlSEE6IHRydWUsXG4gICAgICAgICAgICAvKiBTZXQgdG8gZmFsc2UgdG8gcHJldmVudCBwcm9wZXJ0eSB2YWx1ZXMgZnJvbSBiZWluZyBjYWNoZWQgYmV0d2VlbiBpbW1lZGlhdGVseSBjb25zZWN1dGl2ZSBWZWxvY2l0eS1pbml0aWF0ZWQgY2FsbHMuIFNlZSBWYWx1ZSBUcmFuc2ZlcnJpbmcgZm9yIGZ1cnRoZXIgZGV0YWlscy4gKi9cbiAgICAgICAgICAgIF9jYWNoZVZhbHVlczogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICAvKiBWZWxvY2l0eSdzIGNvcmUgYW5pbWF0aW9uIG1ldGhvZCwgc3Vic2VxdWVudGx5IGFsaWFzZWQgdG8gJC5mbi4gKi9cbiAgICAgICAgYW5pbWF0ZTogZnVuY3Rpb24gKCkgeyAvKiBEZWZpbmVkIGJlbG93LiAqLyB9LFxuICAgICAgICAvKiBTZXQgdG8gdHJ1ZSB0byBmb3JjZSBhIGR1cmF0aW9uIG9mIDFtcyBmb3IgYWxsIGFuaW1hdGlvbnMgc28gdGhhdCBVSSB0ZXN0aW5nIGNhbiBiZSBwZXJmb3JtZWQgd2l0aG91dCB3YWl0aW5nIG9uIGFuaW1hdGlvbnMgdG8gY29tcGxldGUuICovXG4gICAgICAgIG1vY2s6IGZhbHNlLFxuICAgICAgICAvKiBTZXQgdG8gMSBvciAyIChtb3N0IHZlcmJvc2UpIHRvIG91dHB1dCBkZWJ1ZyBpbmZvIHRvIGNvbnNvbGUuICovXG4gICAgICAgIGRlYnVnOiBmYWxzZVxuICAgIH07XG5cbiAgICAvKiBSZXRyaWV2ZSB0aGUgYXBwcm9wcmlhdGUgc2Nyb2xsIGFuY2hvciBhbmQgcHJvcGVydHkgbmFtZSBmb3IgdGhlIGJyb3dzZXIuIExlYXJuIG1vcmU6IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9XaW5kb3cuc2Nyb2xsWSAqL1xuICAgIGlmICh3aW5kb3cucGFnZVlPZmZzZXQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBWZWxvY2l0eS5TdGF0ZS5zY3JvbGxBbmNob3IgPSB3aW5kb3c7XG4gICAgICAgIFZlbG9jaXR5LlN0YXRlLnNjcm9sbFByb3BlcnR5TGVmdCA9IFwicGFnZVhPZmZzZXRcIjtcbiAgICAgICAgVmVsb2NpdHkuU3RhdGUuc2Nyb2xsUHJvcGVydHlUb3AgPSBcInBhZ2VZT2Zmc2V0XCI7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgVmVsb2NpdHkuU3RhdGUuc2Nyb2xsQW5jaG9yID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50IHx8IGRvY3VtZW50LmJvZHkucGFyZW50Tm9kZSB8fCBkb2N1bWVudC5ib2R5O1xuICAgICAgICBWZWxvY2l0eS5TdGF0ZS5zY3JvbGxQcm9wZXJ0eUxlZnQgPSBcInNjcm9sbExlZnRcIjtcbiAgICAgICAgVmVsb2NpdHkuU3RhdGUuc2Nyb2xsUHJvcGVydHlUb3AgPSBcInNjcm9sbFRvcFwiO1xuICAgIH1cblxuICAgIC8qKioqKioqKioqKioqKlxuICAgICAgICBFYXNpbmdcbiAgICAqKioqKioqKioqKioqKi9cblxuICAgIC8qIFN0ZXAgZWFzaW5nIGdlbmVyYXRvci4gKi9cbiAgICBmdW5jdGlvbiBnZW5lcmF0ZVN0ZXAgKHN0ZXBzKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAocCkgeyBcbiAgICAgICAgICAgIHJldHVybiBNYXRoLnJvdW5kKHAgKiBzdGVwcykgKiAoMSAvIHN0ZXBzKTtcbiAgICAgICAgfTsgICBcbiAgICB9XG5cbiAgICAvKiBCZXppZXIgY3VydmUgZnVuY3Rpb24gZ2VuZXJhdG9yLiBDb3B5cmlnaHQgR2FldGFuIFJlbmF1ZGVhdS4gTUlUIExpY2Vuc2U6IGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvTUlUX0xpY2Vuc2UgKi9cbiAgICB2YXIgZ2VuZXJhdGVCZXppZXIgPSAoZnVuY3Rpb24gKCkge1xuICAgICAgICBmdW5jdGlvbiBBIChhQTEsIGFBMikge1xuICAgICAgICAgICAgcmV0dXJuIDEuMCAtIDMuMCAqIGFBMiArIDMuMCAqIGFBMTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIEIgKGFBMSwgYUEyKSB7XG4gICAgICAgICAgICByZXR1cm4gMy4wICogYUEyIC0gNi4wICogYUExO1xuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIEMgKGFBMSkge1xuICAgICAgICAgICAgcmV0dXJuIDMuMCAqIGFBMTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNhbGNCZXppZXIgKGFULCBhQTEsIGFBMikge1xuICAgICAgICAgICAgcmV0dXJuICgoQShhQTEsIGFBMikqYVQgKyBCKGFBMSwgYUEyKSkqYVQgKyBDKGFBMSkpKmFUO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZ2V0U2xvcGUgKGFULCBhQTEsIGFBMikge1xuICAgICAgICAgICAgcmV0dXJuIDMuMCAqIEEoYUExLCBhQTIpKmFUKmFUICsgMi4wICogQihhQTEsIGFBMikgKiBhVCArIEMoYUExKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAobVgxLCBtWTEsIG1YMiwgbVkyKSB7XG4gICAgICAgICAgICAvKiBNdXN0IGNvbnRhaW4gZm91ciBhcmd1bWVudHMuICovXG4gICAgICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCAhPT0gNCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLyogQXJndW1lbnRzIG11c3QgYmUgbnVtYmVycy4gKi9cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgNDsgKytpKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBhcmd1bWVudHNbaV0gIT09IFwibnVtYmVyXCIgfHwgaXNOYU4oYXJndW1lbnRzW2ldKSB8fCAhaXNGaW5pdGUoYXJndW1lbnRzW2ldKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvKiBYIHZhbHVlcyBtdXN0IGJlIGluIHRoZSBbMCwgMV0gcmFuZ2UuICovXG4gICAgICAgICAgICBtWDEgPSBNYXRoLm1pbihtWDEsIDEpO1xuICAgICAgICAgICAgbVgyID0gTWF0aC5taW4obVgyLCAxKTtcbiAgICAgICAgICAgIG1YMSA9IE1hdGgubWF4KG1YMSwgMCk7XG4gICAgICAgICAgICBtWDIgPSBNYXRoLm1heChtWDIsIDApO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBnZXRURm9yWCAoYVgpIHtcbiAgICAgICAgICAgICAgICB2YXIgYUd1ZXNzVCA9IGFYO1xuXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCA4OyArK2kpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGN1cnJlbnRTbG9wZSA9IGdldFNsb3BlKGFHdWVzc1QsIG1YMSwgbVgyKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudFNsb3BlID09PSAwLjApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBhR3Vlc3NUO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIGN1cnJlbnRYID0gY2FsY0JlemllcihhR3Vlc3NULCBtWDEsIG1YMikgLSBhWDtcblxuICAgICAgICAgICAgICAgICAgICBhR3Vlc3NUIC09IGN1cnJlbnRYIC8gY3VycmVudFNsb3BlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiBhR3Vlc3NUO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGFYKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1YMSA9PT0gbVkxICYmIG1YMiA9PT0gbVkyKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhWDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2FsY0JlemllcihnZXRURm9yWChhWCksIG1ZMSwgbVkyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9O1xuICAgIH0oKSk7XG5cbiAgICAvKiBSdW5nZS1LdXR0YSBzcHJpbmcgcGh5c2ljcyBmdW5jdGlvbiBnZW5lcmF0b3IuIEFkYXB0ZWQgZnJvbSBGcmFtZXIuanMsIGNvcHlyaWdodCBLb2VuIEJvay4gTUlUIExpY2Vuc2U6IGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvTUlUX0xpY2Vuc2UgKi9cbiAgICAvKiBHaXZlbiBhIHRlbnNpb24sIGZyaWN0aW9uLCBhbmQgZHVyYXRpb24sIGEgc2ltdWxhdGlvbiBhdCA2MEZQUyB3aWxsIGZpcnN0IHJ1biB3aXRob3V0IGEgZGVmaW5lZCBkdXJhdGlvbiBpbiBvcmRlciB0byBjYWxjdWxhdGUgdGhlIGZ1bGwgcGF0aC4gQSBzZWNvbmQgcGFzc1xuICAgICAgIHRoZW4gYWRqdXN0cyB0aGUgdGltZSBkZWxhIC0tIHVzaW5nIHRoZSByZWxhdGlvbiBiZXR3ZWVuIGFjdHVhbCB0aW1lIGFuZCBkdXJhdGlvbiAtLSB0byBjYWxjdWxhdGUgdGhlIHBhdGggZm9yIHRoZSBkdXJhdGlvbi1jb25zdHJhaW5lZCBhbmltYXRpb24uICovXG4gICAgdmFyIGdlbmVyYXRlU3ByaW5nUks0ID0gKGZ1bmN0aW9uICgpIHtcblxuICAgICAgICBmdW5jdGlvbiBzcHJpbmdBY2NlbGVyYXRpb25Gb3JTdGF0ZSAoc3RhdGUpIHtcbiAgICAgICAgICAgIHJldHVybiAoLXN0YXRlLnRlbnNpb24gKiBzdGF0ZS54KSAtIChzdGF0ZS5mcmljdGlvbiAqIHN0YXRlLnYpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gc3ByaW5nRXZhbHVhdGVTdGF0ZVdpdGhEZXJpdmF0aXZlIChpbml0aWFsU3RhdGUsIGR0LCBkZXJpdmF0aXZlKSB7XG4gICAgICAgICAgICB2YXIgc3RhdGUgPSB7XG4gICAgICAgICAgICAgICAgeDogaW5pdGlhbFN0YXRlLnggKyBkZXJpdmF0aXZlLmR4ICogZHQsXG4gICAgICAgICAgICAgICAgdjogaW5pdGlhbFN0YXRlLnYgKyBkZXJpdmF0aXZlLmR2ICogZHQsXG4gICAgICAgICAgICAgICAgdGVuc2lvbjogaW5pdGlhbFN0YXRlLnRlbnNpb24sXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IGluaXRpYWxTdGF0ZS5mcmljdGlvblxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgcmV0dXJuIHsgZHg6IHN0YXRlLnYsIGR2OiBzcHJpbmdBY2NlbGVyYXRpb25Gb3JTdGF0ZShzdGF0ZSkgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHNwcmluZ0ludGVncmF0ZVN0YXRlIChzdGF0ZSwgZHQpIHtcbiAgICAgICAgICAgIHZhciBhID0ge1xuICAgICAgICAgICAgICAgICAgICBkeDogc3RhdGUudixcbiAgICAgICAgICAgICAgICAgICAgZHY6IHNwcmluZ0FjY2VsZXJhdGlvbkZvclN0YXRlKHN0YXRlKVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgYiA9IHNwcmluZ0V2YWx1YXRlU3RhdGVXaXRoRGVyaXZhdGl2ZShzdGF0ZSwgZHQgKiAwLjUsIGEpLFxuICAgICAgICAgICAgICAgIGMgPSBzcHJpbmdFdmFsdWF0ZVN0YXRlV2l0aERlcml2YXRpdmUoc3RhdGUsIGR0ICogMC41LCBiKSxcbiAgICAgICAgICAgICAgICBkID0gc3ByaW5nRXZhbHVhdGVTdGF0ZVdpdGhEZXJpdmF0aXZlKHN0YXRlLCBkdCwgYyksXG4gICAgICAgICAgICAgICAgZHhkdCA9IDEuMCAvIDYuMCAqIChhLmR4ICsgMi4wICogKGIuZHggKyBjLmR4KSArIGQuZHgpLFxuICAgICAgICAgICAgICAgIGR2ZHQgPSAxLjAgLyA2LjAgKiAoYS5kdiArIDIuMCAqIChiLmR2ICsgYy5kdikgKyBkLmR2KTtcblxuICAgICAgICAgICAgc3RhdGUueCA9IHN0YXRlLnggKyBkeGR0ICogZHQ7XG4gICAgICAgICAgICBzdGF0ZS52ID0gc3RhdGUudiArIGR2ZHQgKiBkdDtcblxuICAgICAgICAgICAgcmV0dXJuIHN0YXRlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIHNwcmluZ1JLNEZhY3RvcnkgKHRlbnNpb24sIGZyaWN0aW9uLCBkdXJhdGlvbikge1xuXG4gICAgICAgICAgICB2YXIgaW5pdFN0YXRlID0ge1xuICAgICAgICAgICAgICAgICAgICB4OiAtMSxcbiAgICAgICAgICAgICAgICAgICAgdjogMCxcbiAgICAgICAgICAgICAgICAgICAgdGVuc2lvbjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgZnJpY3Rpb246IG51bGxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHBhdGggPSBbMF0sXG4gICAgICAgICAgICAgICAgdGltZV9sYXBzZWQgPSAwLFxuICAgICAgICAgICAgICAgIHRvbGVyYW5jZSA9IDEgLyAxMDAwMCxcbiAgICAgICAgICAgICAgICBEVCA9IDE2IC8gMTAwMCxcbiAgICAgICAgICAgICAgICBoYXZlX2R1cmF0aW9uLCBkdCwgbGFzdF9zdGF0ZTtcblxuICAgICAgICAgICAgdGVuc2lvbiA9IHBhcnNlRmxvYXQodGVuc2lvbikgfHwgNjAwO1xuICAgICAgICAgICAgZnJpY3Rpb24gPSBwYXJzZUZsb2F0KGZyaWN0aW9uKSB8fCAyMDtcbiAgICAgICAgICAgIGR1cmF0aW9uID0gZHVyYXRpb24gfHwgbnVsbDtcblxuICAgICAgICAgICAgaW5pdFN0YXRlLnRlbnNpb24gPSB0ZW5zaW9uO1xuICAgICAgICAgICAgaW5pdFN0YXRlLmZyaWN0aW9uID0gZnJpY3Rpb247XG5cbiAgICAgICAgICAgIGhhdmVfZHVyYXRpb24gPSBkdXJhdGlvbiAhPT0gbnVsbDtcblxuICAgICAgICAgICAgLyogQ2FsY3VsYXRlIHRoZSBhY3R1YWwgdGltZSBpdCB0YWtlcyBmb3IgdGhpcyBhbmltYXRpb24gdG8gY29tcGxldGUgd2l0aCB0aGUgcHJvdmlkZWQgY29uZGl0aW9ucy4gKi9cbiAgICAgICAgICAgIGlmIChoYXZlX2R1cmF0aW9uKSB7XG4gICAgICAgICAgICAgICAgLyogUnVuIHRoZSBzaW11bGF0aW9uIHdpdGhvdXQgYSBkdXJhdGlvbi4gKi9cbiAgICAgICAgICAgICAgICB0aW1lX2xhcHNlZCA9IHNwcmluZ1JLNEZhY3RvcnkodGVuc2lvbiwgZnJpY3Rpb24pO1xuICAgICAgICAgICAgICAgIC8qIENvbXB1dGUgdGhlIGFkanVzdGVkIHRpbWUgZGVsdGEuICovXG4gICAgICAgICAgICAgICAgZHQgPSB0aW1lX2xhcHNlZCAvIGR1cmF0aW9uICogRFQ7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGR0ID0gRFQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgICAgICAgICAgLyogTmV4dC9zdGVwIGZ1bmN0aW9uIC4qL1xuICAgICAgICAgICAgICAgIGxhc3Rfc3RhdGUgPSBzcHJpbmdJbnRlZ3JhdGVTdGF0ZShsYXN0X3N0YXRlIHx8IGluaXRTdGF0ZSwgZHQpO1xuICAgICAgICAgICAgICAgIC8qIFN0b3JlIHRoZSBwb3NpdGlvbi4gKi9cbiAgICAgICAgICAgICAgICBwYXRoLnB1c2goMSArIGxhc3Rfc3RhdGUueCk7XG4gICAgICAgICAgICAgICAgdGltZV9sYXBzZWQgKz0gMTY7XG4gICAgICAgICAgICAgICAgLyogSWYgdGhlIGNoYW5nZSB0aHJlc2hvbGQgaXMgcmVhY2hlZCwgYnJlYWsuICovXG4gICAgICAgICAgICAgICAgaWYgKCEoTWF0aC5hYnMobGFzdF9zdGF0ZS54KSA+IHRvbGVyYW5jZSAmJiBNYXRoLmFicyhsYXN0X3N0YXRlLnYpID4gdG9sZXJhbmNlKSkge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8qIElmIGR1cmF0aW9uIGlzIG5vdCBkZWZpbmVkLCByZXR1cm4gdGhlIGFjdHVhbCB0aW1lIHJlcXVpcmVkIGZvciBjb21wbGV0aW5nIHRoaXMgYW5pbWF0aW9uLiBPdGhlcndpc2UsIHJldHVybiBhIGNsb3N1cmUgdGhhdCBob2xkcyB0aGVcbiAgICAgICAgICAgICAgIGNvbXB1dGVkIHBhdGggYW5kIHJldHVybnMgYSBzbmFwc2hvdCBvZiB0aGUgcG9zaXRpb24gYWNjb3JkaW5nIHRvIGEgZ2l2ZW4gcGVyY2VudENvbXBsZXRlLiAqL1xuICAgICAgICAgICAgcmV0dXJuICFoYXZlX2R1cmF0aW9uID8gdGltZV9sYXBzZWQgOiBmdW5jdGlvbihwZXJjZW50Q29tcGxldGUpIHsgcmV0dXJuIHBhdGhbIChwZXJjZW50Q29tcGxldGUgKiAocGF0aC5sZW5ndGggLSAxKSkgfCAwIF07IH07XG4gICAgICAgIH07XG4gICAgfSgpKTtcblxuICAgIC8qIFZlbG9jaXR5IGVtYmVkcyB0aGUgbmFtZWQgZWFzaW5ncyBmcm9tIGpRdWVyeSwgalF1ZXJ5IFVJLCBhbmQgQ1NTMyBpbiBvcmRlciB0byBzYXZlIHVzZXJzIGZyb20gaGF2aW5nIHRvIGluY2x1ZGUgYWRkaXRpb25hbCBsaWJyYXJpZXMgb24gdGhlaXIgcGFnZS4gKi9cbiAgICAoZnVuY3Rpb24gKCkge1xuICAgICAgICAvKiBqUXVlcnkncyBkZWZhdWx0IG5hbWVkIGVhc2luZyB0eXBlcy4gKi9cbiAgICAgICAgVmVsb2NpdHkuRWFzaW5nc1tcImxpbmVhclwiXSA9IGZ1bmN0aW9uKHApIHtcbiAgICAgICAgICAgIHJldHVybiBwO1xuICAgICAgICB9O1xuICAgICAgICBWZWxvY2l0eS5FYXNpbmdzW1wic3dpbmdcIl0gPSBmdW5jdGlvbihwKSB7XG4gICAgICAgICAgICByZXR1cm4gMC41IC0gTWF0aC5jb3MocCAqIE1hdGguUEkpIC8gMjtcbiAgICAgICAgfTtcblxuICAgICAgICAvKiBDU1MzJ3MgbmFtZWQgZWFzaW5nIHR5cGVzLiAqL1xuICAgICAgICBWZWxvY2l0eS5FYXNpbmdzW1wiZWFzZVwiXSA9IGdlbmVyYXRlQmV6aWVyKDAuMjUsIDAuMSwgMC4yNSwgMS4wKTtcbiAgICAgICAgVmVsb2NpdHkuRWFzaW5nc1tcImVhc2UtaW5cIl0gPSBnZW5lcmF0ZUJlemllcigwLjQyLCAwLjAsIDEuMDAsIDEuMCk7XG4gICAgICAgIFZlbG9jaXR5LkVhc2luZ3NbXCJlYXNlLW91dFwiXSA9IGdlbmVyYXRlQmV6aWVyKDAuMDAsIDAuMCwgMC41OCwgMS4wKTtcbiAgICAgICAgVmVsb2NpdHkuRWFzaW5nc1tcImVhc2UtaW4tb3V0XCJdID0gZ2VuZXJhdGVCZXppZXIoMC40MiwgMC4wLCAwLjU4LCAxLjApO1xuXG4gICAgICAgIC8qIGpRdWVyeSBVSSdzIFJvYmVydCBQZW5uZXIgZWFzaW5nIGVxdWF0aW9ucy4gQ29weXJpZ2h0IFRoZSBqUXVlcnkgRm91bmRhdGlvbi4gTUlUIExpY2Vuc2U6IGh0dHBzOi8vanF1ZXJ5Lm9yZy9saWNlbnNlICovXG4gICAgICAgIHZhciBiYXNlRWFzaW5ncyA9IHt9O1xuXG4gICAgICAgICQuZWFjaChbXCJRdWFkXCIsIFwiQ3ViaWNcIiwgXCJRdWFydFwiLCBcIlF1aW50XCIsIFwiRXhwb1wiXSwgZnVuY3Rpb24oaSwgbmFtZSkge1xuICAgICAgICAgICAgYmFzZUVhc2luZ3NbbmFtZV0gPSBmdW5jdGlvbihwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIE1hdGgucG93KHAsIGkgKyAyKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuXG4gICAgICAgICQuZXh0ZW5kKGJhc2VFYXNpbmdzLCB7XG4gICAgICAgICAgICBTaW5lOiBmdW5jdGlvbiAocCkge1xuICAgICAgICAgICAgICAgIHJldHVybiAxIC0gTWF0aC5jb3MocCAqIE1hdGguUEkgLyAyKTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIENpcmM6IGZ1bmN0aW9uIChwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIDEgLSBNYXRoLnNxcnQoMSAtIHAgKiBwKTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIEVsYXN0aWM6IGZ1bmN0aW9uKHApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcCA9PT0gMCB8fCBwID09PSAxID8gcCA6XG4gICAgICAgICAgICAgICAgICAgIC1NYXRoLnBvdygyLCA4ICogKHAgLSAxKSkgKiBNYXRoLnNpbigoKHAgLSAxKSAqIDgwIC0gNy41KSAqIE1hdGguUEkgLyAxNSk7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBCYWNrOiBmdW5jdGlvbihwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHAgKiBwICogKDMgKiBwIC0gMik7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBCb3VuY2U6IGZ1bmN0aW9uIChwKSB7XG4gICAgICAgICAgICAgICAgdmFyIHBvdzIsXG4gICAgICAgICAgICAgICAgICAgIGJvdW5jZSA9IDQ7XG5cbiAgICAgICAgICAgICAgICB3aGlsZSAocCA8ICgocG93MiA9IE1hdGgucG93KDIsIC0tYm91bmNlKSkgLSAxKSAvIDExKSB7fVxuICAgICAgICAgICAgICAgIHJldHVybiAxIC8gTWF0aC5wb3coNCwgMyAtIGJvdW5jZSkgLSA3LjU2MjUgKiBNYXRoLnBvdygocG93MiAqIDMgLSAyKSAvIDIyIC0gcCwgMik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8qIGpRdWVyeSdzIGVhc2luZyBnZW5lcmF0b3IgZm9yIHRoZSBvYmplY3QgYWJvdmUuICovXG4gICAgICAgICQuZWFjaChiYXNlRWFzaW5ncywgZnVuY3Rpb24obmFtZSwgZWFzZUluKSB7XG4gICAgICAgICAgICBWZWxvY2l0eS5FYXNpbmdzW1wiZWFzZUluXCIgKyBuYW1lXSA9IGVhc2VJbjtcbiAgICAgICAgICAgIFZlbG9jaXR5LkVhc2luZ3NbXCJlYXNlT3V0XCIgKyBuYW1lXSA9IGZ1bmN0aW9uKHApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gMSAtIGVhc2VJbigxIC0gcCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgVmVsb2NpdHkuRWFzaW5nc1tcImVhc2VJbk91dFwiICsgbmFtZV0gPSBmdW5jdGlvbihwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHAgPCAwLjUgP1xuICAgICAgICAgICAgICAgICAgICBlYXNlSW4ocCAqIDIpIC8gMiA6XG4gICAgICAgICAgICAgICAgICAgIDEgLSBlYXNlSW4ocCAqIC0yICsgMikgLyAyO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLyogQm9udXMgXCJzcHJpbmdcIiBlYXNpbmcsIHdoaWNoIGlzIGEgbGVzcyBleGFnZ2VyYXRlZCB2ZXJzaW9uIG9mIGVhc2VJbk91dEVsYXN0aWMuICovXG4gICAgICAgIFZlbG9jaXR5LkVhc2luZ3NbXCJzcHJpbmdcIl0gPSBmdW5jdGlvbihwKSB7XG4gICAgICAgICAgICByZXR1cm4gMSAtIChNYXRoLmNvcyhwICogNC41ICogTWF0aC5QSSkgKiBNYXRoLmV4cCgtcCAqIDYpKTtcbiAgICAgICAgfTtcbiAgICB9KSgpO1xuXG4gICAgLyogRGV0ZXJtaW5lIHRoZSBhcHByb3ByaWF0ZSBlYXNpbmcgdHlwZSBnaXZlbiBhbiBlYXNpbmcgaW5wdXQuICovXG4gICAgZnVuY3Rpb24gZ2V0RWFzaW5nKHZhbHVlLCBkdXJhdGlvbikge1xuICAgICAgICB2YXIgZWFzaW5nID0gdmFsdWU7XG5cbiAgICAgICAgLyogVGhlIGVhc2luZyBvcHRpb24gY2FuIGVpdGhlciBiZSBhIHN0cmluZyB0aGF0IHJlZmVyZW5jZXMgYSBwcmUtcmVnaXN0ZXJlZCBlYXNpbmcsIG9yIGl0IGNhbiBiZSBhIHR3by0vZm91ci1pdGVtIGFycmF5IG9mIGludGVnZXJzIHRvIGJlIGNvbnZlcnRlZCBpbnRvIGEgYmV6aWVyL3NwcmluZyBmdW5jdGlvbi4gKi9cbiAgICAgICAgaWYgKFR5cGUuaXNTdHJpbmcodmFsdWUpKSB7XG4gICAgICAgICAgICAvKiBFbnN1cmUgdGhhdCB0aGUgZWFzaW5nIGhhcyBiZWVuIGFzc2lnbmVkIHRvIGpRdWVyeSdzIFZlbG9jaXR5LkVhc2luZ3Mgb2JqZWN0LiAqL1xuICAgICAgICAgICAgaWYgKCFWZWxvY2l0eS5FYXNpbmdzW3ZhbHVlXSkge1xuICAgICAgICAgICAgICAgIGVhc2luZyA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKFR5cGUuaXNBcnJheSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICBlYXNpbmcgPSBnZW5lcmF0ZVN0ZXAuYXBwbHkobnVsbCwgdmFsdWUpO1xuICAgICAgICB9IGVsc2UgaWYgKFR5cGUuaXNBcnJheSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICAvKiBzcHJpbmdSSzQgbXVzdCBiZSBwYXNzZWQgdGhlIGFuaW1hdGlvbidzIGR1cmF0aW9uLiAqL1xuICAgICAgICAgICAgLyogTm90ZTogSWYgdGhlIHNwcmluZ1JLNCBhcnJheSBjb250YWlucyBub24tbnVtYmVycywgZ2VuZXJhdGVTcHJpbmdSSzQoKSByZXR1cm5zIGFuIGVhc2luZyBmdW5jdGlvbiBnZW5lcmF0ZWQgd2l0aCBkZWZhdWx0IHRlbnNpb24gYW5kIGZyaWN0aW9uIHZhbHVlcy4gKi9cbiAgICAgICAgICAgIGVhc2luZyA9IGdlbmVyYXRlU3ByaW5nUks0LmFwcGx5KG51bGwsIHZhbHVlLmNvbmNhdChbIGR1cmF0aW9uIF0pKTtcbiAgICAgICAgfSBlbHNlIGlmIChUeXBlLmlzQXJyYXkodmFsdWUpICYmIHZhbHVlLmxlbmd0aCA9PT0gNCkge1xuICAgICAgICAgICAgLyogTm90ZTogSWYgdGhlIGJlemllciBhcnJheSBjb250YWlucyBub24tbnVtYmVycywgZ2VuZXJhdGVCZXppZXIoKSByZXR1cm5zIGZhbHNlLiAqL1xuICAgICAgICAgICAgZWFzaW5nID0gZ2VuZXJhdGVCZXppZXIuYXBwbHkobnVsbCwgdmFsdWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZWFzaW5nID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBSZXZlcnQgdG8gdGhlIFZlbG9jaXR5LXdpZGUgZGVmYXVsdCBlYXNpbmcgdHlwZSwgb3IgZmFsbCBiYWNrIHRvIFwic3dpbmdcIiAod2hpY2ggaXMgYWxzbyBqUXVlcnkncyBkZWZhdWx0KSBpZiB0aGUgVmVsb2NpdHktd2lkZSBkZWZhdWx0IGhhcyBiZWVuIGluY29ycmVjdGx5IG1vZGlmaWVkLiAqL1xuICAgICAgICBpZiAoZWFzaW5nID09PSBmYWxzZSkge1xuICAgICAgICAgICAgaWYgKFZlbG9jaXR5LkVhc2luZ3NbVmVsb2NpdHkuZGVmYXVsdHMuZWFzaW5nXSkge1xuICAgICAgICAgICAgICAgIGVhc2luZyA9IFZlbG9jaXR5LmRlZmF1bHRzLmVhc2luZztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZWFzaW5nID0gREVGQVVMVF9FQVNJTkc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZWFzaW5nO1xuICAgIH1cblxuICAgIC8qKioqKioqKioqKioqKioqKlxuICAgICAgICBDU1MgU3RhY2tcbiAgICAqKioqKioqKioqKioqKioqKi9cblxuICAgIC8qIFRoZSBDU1Mgb2JqZWN0IGlzIGEgaGlnaGx5IGNvbmRlbnNlZCBhbmQgcGVyZm9ybWFudCBDU1Mgc3RhY2sgdGhhdCBmdWxseSByZXBsYWNlcyBqUXVlcnkncy4gSXQgaGFuZGxlcyB0aGUgdmFsaWRhdGlvbiwgZ2V0dGluZywgYW5kIHNldHRpbmcgb2YgYm90aCBzdGFuZGFyZCBDU1MgcHJvcGVydGllcyBhbmQgQ1NTIHByb3BlcnR5IGhvb2tzLiAqL1xuICAgIC8qIE5vdGU6IEEgXCJDU1NcIiBzaG9ydGhhbmQgaXMgYWxpYXNlZCBzbyB0aGF0IG91ciBjb2RlIGlzIGVhc2llciB0byByZWFkLiAqL1xuICAgIHZhciBDU1MgPSBWZWxvY2l0eS5DU1MgPSB7XG5cbiAgICAgICAgLyoqKioqKioqKioqKipcbiAgICAgICAgICAgIFJlZ0V4XG4gICAgICAgICoqKioqKioqKioqKiovXG5cbiAgICAgICAgUmVnRXg6IHtcbiAgICAgICAgICAgIC8qIFVud3JhcCBhIHByb3BlcnR5IHZhbHVlJ3Mgc3Vycm91bmRpbmcgdGV4dCwgZS5nLiBcInJnYmEoNCwgMywgMiwgMSlcIiA9PT4gXCI0LCAzLCAyLCAxXCIgYW5kIFwicmVjdCg0cHggM3B4IDJweCAxcHgpXCIgPT0+IFwiNHB4IDNweCAycHggMXB4XCIuICovXG4gICAgICAgICAgICB2YWx1ZVVud3JhcDogL15bQS16XStcXCgoLiopXFwpJC9pLFxuICAgICAgICAgICAgd3JhcHBlZFZhbHVlQWxyZWFkeUV4dHJhY3RlZDogL1swLTkuXSsgWzAtOS5dKyBbMC05Ll0rKCBbMC05Ll0rKT8vLFxuICAgICAgICAgICAgLyogU3BsaXQgYSBtdWx0aS12YWx1ZSBwcm9wZXJ0eSBpbnRvIGFuIGFycmF5IG9mIHN1YnZhbHVlcywgZS5nLiBcInJnYmEoNCwgMywgMiwgMSkgNHB4IDNweCAycHggMXB4XCIgPT0+IFsgXCJyZ2JhKDQsIDMsIDIsIDEpXCIsIFwiNHB4XCIsIFwiM3B4XCIsIFwiMnB4XCIsIFwiMXB4XCIgXS4gKi9cbiAgICAgICAgICAgIHZhbHVlU3BsaXQ6IC8oW0Etel0rXFwoLitcXCkpfCgoW0EtejAtOSMtLl0rPykoPz1cXHN8JCkpL2lnXG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqKioqKioqKioqKlxuICAgICAgICAgICAgSG9va3NcbiAgICAgICAgKioqKioqKioqKioqL1xuXG4gICAgICAgIC8qIEhvb2tzIGFsbG93IGEgc3VicHJvcGVydHkgKGUuZy4gXCJib3hTaGFkb3dCbHVyXCIpIG9mIGEgY29tcG91bmQtdmFsdWUgQ1NTIHByb3BlcnR5IChlLmcuIFwiYm94U2hhZG93OiBYIFkgQmx1ciBTcHJlYWQgQ29sb3JcIikgdG8gYmUgYW5pbWF0ZWQgYXMgaWYgaXQgd2VyZSBhIGRpc2NyZXRlIHByb3BlcnR5LiAqL1xuICAgICAgICAvKiBOb3RlOiBCZXlvbmQgZW5hYmxpbmcgZmluZS1ncmFpbmVkIHByb3BlcnR5IGFuaW1hdGlvbiwgaG9va2luZyBpcyBuZWNlc3Nhcnkgc2luY2UgVmVsb2NpdHkgb25seSB0d2VlbnMgcHJvcGVydGllcyB3aXRoIHNpbmdsZSBudW1lcmljIHZhbHVlczsgdW5saWtlIENTUyB0cmFuc2l0aW9ucywgVmVsb2NpdHkgZG9lcyBub3QgaW50ZXJwb2xhdGUgY29tcG91bmQtdmFsdWVzLiAqL1xuICAgICAgICBIb29rczoge1xuICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICAgUmVnaXN0cmF0aW9uXG4gICAgICAgICAgICAqKioqKioqKioqKioqKioqKioqKi9cblxuICAgICAgICAgICAgLyogVGVtcGxhdGVzIGFyZSBhIGNvbmNpc2Ugd2F5IG9mIGluZGljYXRpbmcgd2hpY2ggc3VicHJvcGVydGllcyBtdXN0IGJlIGluZGl2aWR1YWxseSByZWdpc3RlcmVkIGZvciBlYWNoIGNvbXBvdW5kLXZhbHVlIENTUyBwcm9wZXJ0eS4gKi9cbiAgICAgICAgICAgIC8qIEVhY2ggdGVtcGxhdGUgY29uc2lzdHMgb2YgdGhlIGNvbXBvdW5kLXZhbHVlJ3MgYmFzZSBuYW1lLCBpdHMgY29uc3RpdHVlbnQgc3VicHJvcGVydHkgbmFtZXMsIGFuZCB0aG9zZSBzdWJwcm9wZXJ0aWVzJyBkZWZhdWx0IHZhbHVlcy4gKi9cbiAgICAgICAgICAgIHRlbXBsYXRlczoge1xuICAgICAgICAgICAgICAgIC8qIE5vdGU6IENvbG9ycyBhcmUgZGVmYXVsdGVkIHRvIHdoaXRlIC0tIGFzIG9wcG9zZWQgdG8gYmxhY2sgLS0gc2luY2UgY29sb3JzIHRoYXQgYXJlIGN1cnJlbnRseSBzZXQgdG8gXCJ0cmFuc3BhcmVudFwiIGRlZmF1bHQgdG8gdGhlaXIgcmVzcGVjdGl2ZSB0ZW1wbGF0ZSBiZWxvdyB3aGVuIGNvbG9yLWFuaW1hdGVkLFxuICAgICAgICAgICAgICAgICAgIGFuZCB3aGl0ZSBpcyB0eXBpY2FsbHkgYSBjbG9zZXIgbWF0Y2ggdG8gdHJhbnNwYXJlbnQgdGhhbiBibGFjayBpcy4gKi9cbiAgICAgICAgICAgICAgICBcImNvbG9yXCI6IFsgXCJSZWQgR3JlZW4gQmx1ZSBBbHBoYVwiLCBcIjI1NSAyNTUgMjU1IDFcIiBdLFxuICAgICAgICAgICAgICAgIFwiYmFja2dyb3VuZENvbG9yXCI6IFsgXCJSZWQgR3JlZW4gQmx1ZSBBbHBoYVwiLCBcIjI1NSAyNTUgMjU1IDFcIiBdLFxuICAgICAgICAgICAgICAgIFwiYm9yZGVyQ29sb3JcIjogWyBcIlJlZCBHcmVlbiBCbHVlIEFscGhhXCIsIFwiMjU1IDI1NSAyNTUgMVwiIF0sXG4gICAgICAgICAgICAgICAgXCJib3JkZXJUb3BDb2xvclwiOiBbIFwiUmVkIEdyZWVuIEJsdWUgQWxwaGFcIiwgXCIyNTUgMjU1IDI1NSAxXCIgXSxcbiAgICAgICAgICAgICAgICBcImJvcmRlclJpZ2h0Q29sb3JcIjogWyBcIlJlZCBHcmVlbiBCbHVlIEFscGhhXCIsIFwiMjU1IDI1NSAyNTUgMVwiIF0sXG4gICAgICAgICAgICAgICAgXCJib3JkZXJCb3R0b21Db2xvclwiOiBbIFwiUmVkIEdyZWVuIEJsdWUgQWxwaGFcIiwgXCIyNTUgMjU1IDI1NSAxXCIgXSxcbiAgICAgICAgICAgICAgICBcImJvcmRlckxlZnRDb2xvclwiOiBbIFwiUmVkIEdyZWVuIEJsdWUgQWxwaGFcIiwgXCIyNTUgMjU1IDI1NSAxXCIgXSxcbiAgICAgICAgICAgICAgICBcIm91dGxpbmVDb2xvclwiOiBbIFwiUmVkIEdyZWVuIEJsdWUgQWxwaGFcIiwgXCIyNTUgMjU1IDI1NSAxXCIgXSxcbiAgICAgICAgICAgICAgICBcInRleHRTaGFkb3dcIjogWyBcIkNvbG9yIFggWSBCbHVyXCIsIFwiYmxhY2sgMHB4IDBweCAwcHhcIiBdLFxuICAgICAgICAgICAgICAgIC8qIFRvZG86IEFkZCBzdXBwb3J0IGZvciBpbnNldCBib3hTaGFkb3dzLiAod2Via2l0IHBsYWNlcyBpdCBsYXN0IHdoZXJlYXMgSUUgcGxhY2VzIGl0IGZpcnN0LikgKi9cbiAgICAgICAgICAgICAgICBcImJveFNoYWRvd1wiOiBbIFwiQ29sb3IgWCBZIEJsdXIgU3ByZWFkXCIsIFwiYmxhY2sgMHB4IDBweCAwcHggMHB4XCIgXSxcbiAgICAgICAgICAgICAgICBcImNsaXBcIjogWyBcIlRvcCBSaWdodCBCb3R0b20gTGVmdFwiLCBcIjBweCAwcHggMHB4IDBweFwiIF0sXG4gICAgICAgICAgICAgICAgXCJiYWNrZ3JvdW5kUG9zaXRpb25cIjogWyBcIlggWVwiLCBcIjAlIDAlXCIgXSxcbiAgICAgICAgICAgICAgICBcInRyYW5zZm9ybU9yaWdpblwiOiBbIFwiWCBZIFpcIiwgXCI1MCUgNTAlIDAlXCIgXSxcbiAgICAgICAgICAgICAgICBcInBlcnNwZWN0aXZlT3JpZ2luXCI6IFsgXCJYIFlcIiwgXCI1MCUgNTAlXCIgXVxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLyogQSBcInJlZ2lzdGVyZWRcIiBob29rIGlzIG9uZSB0aGF0IGhhcyBiZWVuIGNvbnZlcnRlZCBmcm9tIGl0cyB0ZW1wbGF0ZSBmb3JtIGludG8gYSBsaXZlLCB0d2VlbmFibGUgcHJvcGVydHkuIEl0IGNvbnRhaW5zIGRhdGEgdG8gYXNzb2NpYXRlIGl0IHdpdGggaXRzIHJvb3QgcHJvcGVydHkuICovXG4gICAgICAgICAgICByZWdpc3RlcmVkOiB7XG4gICAgICAgICAgICAgICAgLyogTm90ZTogQSByZWdpc3RlcmVkIGhvb2sgbG9va3MgbGlrZSB0aGlzID09PiB0ZXh0U2hhZG93Qmx1cjogWyBcInRleHRTaGFkb3dcIiwgMyBdLCB3aGljaCBjb25zaXN0cyBvZiB0aGUgc3VicHJvcGVydHkncyBuYW1lLCB0aGUgYXNzb2NpYXRlZCByb290IHByb3BlcnR5J3MgbmFtZSxcbiAgICAgICAgICAgICAgICAgICBhbmQgdGhlIHN1YnByb3BlcnR5J3MgcG9zaXRpb24gaW4gdGhlIHJvb3QncyB2YWx1ZS4gKi9cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAvKiBDb252ZXJ0IHRoZSB0ZW1wbGF0ZXMgaW50byBpbmRpdmlkdWFsIGhvb2tzIHRoZW4gYXBwZW5kIHRoZW0gdG8gdGhlIHJlZ2lzdGVyZWQgb2JqZWN0IGFib3ZlLiAqL1xuICAgICAgICAgICAgcmVnaXN0ZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICB2YXIgcm9vdFByb3BlcnR5LFxuICAgICAgICAgICAgICAgICAgICBob29rVGVtcGxhdGUsXG4gICAgICAgICAgICAgICAgICAgIGhvb2tOYW1lcztcblxuICAgICAgICAgICAgICAgIC8qIEluIElFLCBjb2xvciB2YWx1ZXMgaW5zaWRlIGNvbXBvdW5kLXZhbHVlIHByb3BlcnRpZXMgYXJlIHBvc2l0aW9uZWQgYXQgdGhlIGVuZCB0aGUgdmFsdWUgaW5zdGVhZCBvZiBhdCB0aGUgYmVnaW5uaW5nLiBUaHVzLCB3ZSByZS1hcnJhbmdlIHRoZSB0ZW1wbGF0ZXMgYWNjb3JkaW5nbHkuICovXG4gICAgICAgICAgICAgICAgaWYgKElFKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAocm9vdFByb3BlcnR5IGluIENTUy5Ib29rcy50ZW1wbGF0ZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGhvb2tUZW1wbGF0ZSA9IENTUy5Ib29rcy50ZW1wbGF0ZXNbcm9vdFByb3BlcnR5XTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGhvb2tOYW1lcyA9IGhvb2tUZW1wbGF0ZVswXS5zcGxpdChcIiBcIik7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBkZWZhdWx0VmFsdWVzID0gaG9va1RlbXBsYXRlWzFdLm1hdGNoKENTUy5SZWdFeC52YWx1ZVNwbGl0KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhvb2tOYW1lc1swXSA9PT0gXCJDb2xvclwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogUmVwb3NpdGlvbiBib3RoIHRoZSBob29rJ3MgbmFtZSBhbmQgaXRzIGRlZmF1bHQgdmFsdWUgdG8gdGhlIGVuZCBvZiB0aGVpciByZXNwZWN0aXZlIHN0cmluZ3MuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaG9va05hbWVzLnB1c2goaG9va05hbWVzLnNoaWZ0KCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHRWYWx1ZXMucHVzaChkZWZhdWx0VmFsdWVzLnNoaWZ0KCkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogUmVwbGFjZSB0aGUgZXhpc3RpbmcgdGVtcGxhdGUgZm9yIHRoZSBob29rJ3Mgcm9vdCBwcm9wZXJ0eS4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBDU1MuSG9va3MudGVtcGxhdGVzW3Jvb3RQcm9wZXJ0eV0gPSBbIGhvb2tOYW1lcy5qb2luKFwiIFwiKSwgZGVmYXVsdFZhbHVlcy5qb2luKFwiIFwiKSBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8qIEhvb2sgcmVnaXN0cmF0aW9uLiAqL1xuICAgICAgICAgICAgICAgIGZvciAocm9vdFByb3BlcnR5IGluIENTUy5Ib29rcy50ZW1wbGF0ZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgaG9va1RlbXBsYXRlID0gQ1NTLkhvb2tzLnRlbXBsYXRlc1tyb290UHJvcGVydHldO1xuICAgICAgICAgICAgICAgICAgICBob29rTmFtZXMgPSBob29rVGVtcGxhdGVbMF0uc3BsaXQoXCIgXCIpO1xuXG4gICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgaW4gaG9va05hbWVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgZnVsbEhvb2tOYW1lID0gcm9vdFByb3BlcnR5ICsgaG9va05hbWVzW2ldLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhvb2tQb3NpdGlvbiA9IGk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIEZvciBlYWNoIGhvb2ssIHJlZ2lzdGVyIGl0cyBmdWxsIG5hbWUgKGUuZy4gdGV4dFNoYWRvd0JsdXIpIHdpdGggaXRzIHJvb3QgcHJvcGVydHkgKGUuZy4gdGV4dFNoYWRvdykgYW5kIHRoZSBob29rJ3MgcG9zaXRpb24gaW4gaXRzIHRlbXBsYXRlJ3MgZGVmYXVsdCB2YWx1ZSBzdHJpbmcuICovXG4gICAgICAgICAgICAgICAgICAgICAgICBDU1MuSG9va3MucmVnaXN0ZXJlZFtmdWxsSG9va05hbWVdID0gWyByb290UHJvcGVydHksIGhvb2tQb3NpdGlvbiBdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICBJbmplY3Rpb24gYW5kIEV4dHJhY3Rpb25cbiAgICAgICAgICAgICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgICAgICAvKiBMb29rIHVwIHRoZSByb290IHByb3BlcnR5IGFzc29jaWF0ZWQgd2l0aCB0aGUgaG9vayAoZS5nLiByZXR1cm4gXCJ0ZXh0U2hhZG93XCIgZm9yIFwidGV4dFNoYWRvd0JsdXJcIikuICovXG4gICAgICAgICAgICAvKiBTaW5jZSBhIGhvb2sgY2Fubm90IGJlIHNldCBkaXJlY3RseSAodGhlIGJyb3dzZXIgd29uJ3QgcmVjb2duaXplIGl0KSwgc3R5bGUgdXBkYXRpbmcgZm9yIGhvb2tzIGlzIHJvdXRlZCB0aHJvdWdoIHRoZSBob29rJ3Mgcm9vdCBwcm9wZXJ0eS4gKi9cbiAgICAgICAgICAgIGdldFJvb3Q6IGZ1bmN0aW9uIChwcm9wZXJ0eSkge1xuICAgICAgICAgICAgICAgIHZhciBob29rRGF0YSA9IENTUy5Ib29rcy5yZWdpc3RlcmVkW3Byb3BlcnR5XTtcblxuICAgICAgICAgICAgICAgIGlmIChob29rRGF0YSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaG9va0RhdGFbMF07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLyogSWYgdGhlcmUgd2FzIG5vIGhvb2sgbWF0Y2gsIHJldHVybiB0aGUgcHJvcGVydHkgbmFtZSB1bnRvdWNoZWQuICovXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBwcm9wZXJ0eTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgLyogQ29udmVydCBhbnkgcm9vdFByb3BlcnR5VmFsdWUsIG51bGwgb3Igb3RoZXJ3aXNlLCBpbnRvIGEgc3BhY2UtZGVsaW1pdGVkIGxpc3Qgb2YgaG9vayB2YWx1ZXMgc28gdGhhdCB0aGUgdGFyZ2V0ZWQgaG9vayBjYW4gYmUgaW5qZWN0ZWQgb3IgZXh0cmFjdGVkIGF0IGl0cyBzdGFuZGFyZCBwb3NpdGlvbi4gKi9cbiAgICAgICAgICAgIGNsZWFuUm9vdFByb3BlcnR5VmFsdWU6IGZ1bmN0aW9uKHJvb3RQcm9wZXJ0eSwgcm9vdFByb3BlcnR5VmFsdWUpIHtcbiAgICAgICAgICAgICAgICAvKiBJZiB0aGUgcm9vdFByb3BlcnR5VmFsdWUgaXMgd3JhcHBlZCB3aXRoIFwicmdiKClcIiwgXCJjbGlwKClcIiwgZXRjLiwgcmVtb3ZlIHRoZSB3cmFwcGluZyB0byBub3JtYWxpemUgdGhlIHZhbHVlIGJlZm9yZSBtYW5pcHVsYXRpb24uICovXG4gICAgICAgICAgICAgICAgaWYgKENTUy5SZWdFeC52YWx1ZVVud3JhcC50ZXN0KHJvb3RQcm9wZXJ0eVZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICByb290UHJvcGVydHlWYWx1ZSA9IHJvb3RQcm9wZXJ0eVZhbHVlLm1hdGNoKENTUy5Ib29rcy5SZWdFeC52YWx1ZVVud3JhcClbMV07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLyogSWYgcm9vdFByb3BlcnR5VmFsdWUgaXMgYSBDU1MgbnVsbC12YWx1ZSAoZnJvbSB3aGljaCB0aGVyZSdzIGluaGVyZW50bHkgbm8gaG9vayB2YWx1ZSB0byBleHRyYWN0KSwgZGVmYXVsdCB0byB0aGUgcm9vdCdzIGRlZmF1bHQgdmFsdWUgYXMgZGVmaW5lZCBpbiBDU1MuSG9va3MudGVtcGxhdGVzLiAqL1xuICAgICAgICAgICAgICAgIC8qIE5vdGU6IENTUyBudWxsLXZhbHVlcyBpbmNsdWRlIFwibm9uZVwiLCBcImF1dG9cIiwgYW5kIFwidHJhbnNwYXJlbnRcIi4gVGhleSBtdXN0IGJlIGNvbnZlcnRlZCBpbnRvIHRoZWlyIHplcm8tdmFsdWVzIChlLmcuIHRleHRTaGFkb3c6IFwibm9uZVwiID09PiB0ZXh0U2hhZG93OiBcIjBweCAwcHggMHB4IGJsYWNrXCIpIGZvciBob29rIG1hbmlwdWxhdGlvbiB0byBwcm9jZWVkLiAqL1xuICAgICAgICAgICAgICAgIGlmIChDU1MuVmFsdWVzLmlzQ1NTTnVsbFZhbHVlKHJvb3RQcm9wZXJ0eVZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICByb290UHJvcGVydHlWYWx1ZSA9IENTUy5Ib29rcy50ZW1wbGF0ZXNbcm9vdFByb3BlcnR5XVsxXTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gcm9vdFByb3BlcnR5VmFsdWU7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgLyogRXh0cmFjdGVkIHRoZSBob29rJ3MgdmFsdWUgZnJvbSBpdHMgcm9vdCBwcm9wZXJ0eSdzIHZhbHVlLiBUaGlzIGlzIHVzZWQgdG8gZ2V0IHRoZSBzdGFydGluZyB2YWx1ZSBvZiBhbiBhbmltYXRpbmcgaG9vay4gKi9cbiAgICAgICAgICAgIGV4dHJhY3RWYWx1ZTogZnVuY3Rpb24gKGZ1bGxIb29rTmFtZSwgcm9vdFByb3BlcnR5VmFsdWUpIHtcbiAgICAgICAgICAgICAgICB2YXIgaG9va0RhdGEgPSBDU1MuSG9va3MucmVnaXN0ZXJlZFtmdWxsSG9va05hbWVdO1xuXG4gICAgICAgICAgICAgICAgaWYgKGhvb2tEYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBob29rUm9vdCA9IGhvb2tEYXRhWzBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgaG9va1Bvc2l0aW9uID0gaG9va0RhdGFbMV07XG5cbiAgICAgICAgICAgICAgICAgICAgcm9vdFByb3BlcnR5VmFsdWUgPSBDU1MuSG9va3MuY2xlYW5Sb290UHJvcGVydHlWYWx1ZShob29rUm9vdCwgcm9vdFByb3BlcnR5VmFsdWUpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8qIFNwbGl0IHJvb3RQcm9wZXJ0eVZhbHVlIGludG8gaXRzIGNvbnN0aXR1ZW50IGhvb2sgdmFsdWVzIHRoZW4gZ3JhYiB0aGUgZGVzaXJlZCBob29rIGF0IGl0cyBzdGFuZGFyZCBwb3NpdGlvbi4gKi9cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJvb3RQcm9wZXJ0eVZhbHVlLnRvU3RyaW5nKCkubWF0Y2goQ1NTLlJlZ0V4LnZhbHVlU3BsaXQpW2hvb2tQb3NpdGlvbl07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLyogSWYgdGhlIHByb3ZpZGVkIGZ1bGxIb29rTmFtZSBpc24ndCBhIHJlZ2lzdGVyZWQgaG9vaywgcmV0dXJuIHRoZSByb290UHJvcGVydHlWYWx1ZSB0aGF0IHdhcyBwYXNzZWQgaW4uICovXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByb290UHJvcGVydHlWYWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgLyogSW5qZWN0IHRoZSBob29rJ3MgdmFsdWUgaW50byBpdHMgcm9vdCBwcm9wZXJ0eSdzIHZhbHVlLiBUaGlzIGlzIHVzZWQgdG8gcGllY2UgYmFjayB0b2dldGhlciB0aGUgcm9vdCBwcm9wZXJ0eSBvbmNlIFZlbG9jaXR5IGhhcyB1cGRhdGVkIG9uZSBvZiBpdHMgaW5kaXZpZHVhbGx5IGhvb2tlZCB2YWx1ZXMgdGhyb3VnaCB0d2VlbmluZy4gKi9cbiAgICAgICAgICAgIGluamVjdFZhbHVlOiBmdW5jdGlvbiAoZnVsbEhvb2tOYW1lLCBob29rVmFsdWUsIHJvb3RQcm9wZXJ0eVZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdmFyIGhvb2tEYXRhID0gQ1NTLkhvb2tzLnJlZ2lzdGVyZWRbZnVsbEhvb2tOYW1lXTtcblxuICAgICAgICAgICAgICAgIGlmIChob29rRGF0YSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgaG9va1Jvb3QgPSBob29rRGF0YVswXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGhvb2tQb3NpdGlvbiA9IGhvb2tEYXRhWzFdLFxuICAgICAgICAgICAgICAgICAgICAgICAgcm9vdFByb3BlcnR5VmFsdWVQYXJ0cyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvb3RQcm9wZXJ0eVZhbHVlVXBkYXRlZDtcblxuICAgICAgICAgICAgICAgICAgICByb290UHJvcGVydHlWYWx1ZSA9IENTUy5Ib29rcy5jbGVhblJvb3RQcm9wZXJ0eVZhbHVlKGhvb2tSb290LCByb290UHJvcGVydHlWYWx1ZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLyogU3BsaXQgcm9vdFByb3BlcnR5VmFsdWUgaW50byBpdHMgaW5kaXZpZHVhbCBob29rIHZhbHVlcywgcmVwbGFjZSB0aGUgdGFyZ2V0ZWQgdmFsdWUgd2l0aCBob29rVmFsdWUsIHRoZW4gcmVjb25zdHJ1Y3QgdGhlIHJvb3RQcm9wZXJ0eVZhbHVlIHN0cmluZy4gKi9cbiAgICAgICAgICAgICAgICAgICAgcm9vdFByb3BlcnR5VmFsdWVQYXJ0cyA9IHJvb3RQcm9wZXJ0eVZhbHVlLnRvU3RyaW5nKCkubWF0Y2goQ1NTLlJlZ0V4LnZhbHVlU3BsaXQpO1xuICAgICAgICAgICAgICAgICAgICByb290UHJvcGVydHlWYWx1ZVBhcnRzW2hvb2tQb3NpdGlvbl0gPSBob29rVmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIHJvb3RQcm9wZXJ0eVZhbHVlVXBkYXRlZCA9IHJvb3RQcm9wZXJ0eVZhbHVlUGFydHMuam9pbihcIiBcIik7XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJvb3RQcm9wZXJ0eVZhbHVlVXBkYXRlZDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvKiBJZiB0aGUgcHJvdmlkZWQgZnVsbEhvb2tOYW1lIGlzbid0IGEgcmVnaXN0ZXJlZCBob29rLCByZXR1cm4gdGhlIHJvb3RQcm9wZXJ0eVZhbHVlIHRoYXQgd2FzIHBhc3NlZCBpbi4gKi9cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJvb3RQcm9wZXJ0eVZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvKioqKioqKioqKioqKioqKioqKlxuICAgICAgICAgICBOb3JtYWxpemF0aW9uc1xuICAgICAgICAqKioqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgIC8qIE5vcm1hbGl6YXRpb25zIHN0YW5kYXJkaXplIENTUyBwcm9wZXJ0eSBtYW5pcHVsYXRpb24gYnkgcG9sbHlmaWxsaW5nIGJyb3dzZXItc3BlY2lmaWMgaW1wbGVtZW50YXRpb25zIChlLmcuIG9wYWNpdHkpIGFuZCByZWZvcm1hdHRpbmcgc3BlY2lhbCBwcm9wZXJ0aWVzIChlLmcuIGNsaXAsIHJnYmEpIHRvIGxvb2sgbGlrZSBzdGFuZGFyZCBvbmVzLiAqL1xuICAgICAgICBOb3JtYWxpemF0aW9uczoge1xuICAgICAgICAgICAgLyogTm9ybWFsaXphdGlvbnMgYXJlIHBhc3NlZCBhIG5vcm1hbGl6YXRpb24gdGFyZ2V0IChlaXRoZXIgdGhlIHByb3BlcnR5J3MgbmFtZSwgaXRzIGV4dHJhY3RlZCB2YWx1ZSwgb3IgaXRzIGluamVjdGVkIHZhbHVlKSwgdGhlIHRhcmdldGVkIGVsZW1lbnQgKHdoaWNoIG1heSBuZWVkIHRvIGJlIHF1ZXJpZWQpLCBhbmQgdGhlIHRhcmdldGVkIHByb3BlcnR5IHZhbHVlLiAqL1xuICAgICAgICAgICAgcmVnaXN0ZXJlZDoge1xuICAgICAgICAgICAgICAgIGNsaXA6IGZ1bmN0aW9uKHR5cGUsIGVsZW1lbnQsIHByb3BlcnR5VmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwibmFtZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBcImNsaXBcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIENsaXAgbmVlZHMgdG8gYmUgdW53cmFwcGVkIGFuZCBzdHJpcHBlZCBvZiBpdHMgY29tbWFzIGR1cmluZyBleHRyYWN0aW9uLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImV4dHJhY3RcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgZXh0cmFjdGVkO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogSWYgVmVsb2NpdHkgYWxzbyBleHRyYWN0ZWQgdGhpcyB2YWx1ZSwgc2tpcCBleHRyYWN0aW9uLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChDU1MuUmVnRXgud3JhcHBlZFZhbHVlQWxyZWFkeUV4dHJhY3RlZC50ZXN0KHByb3BlcnR5VmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RlZCA9IHByb3BlcnR5VmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogUmVtb3ZlIHRoZSBcInJlY3QoKVwiIHdyYXBwZXIuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RlZCA9IHByb3BlcnR5VmFsdWUudG9TdHJpbmcoKS5tYXRjaChDU1MuUmVnRXgudmFsdWVVbndyYXApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIFN0cmlwIG9mZiBjb21tYXMuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RlZCA9IGV4dHJhY3RlZCA/IGV4dHJhY3RlZFsxXS5yZXBsYWNlKC8sKFxccyspPy9nLCBcIiBcIikgOiBwcm9wZXJ0eVZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBleHRyYWN0ZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBDbGlwIG5lZWRzIHRvIGJlIHJlLXdyYXBwZWQgZHVyaW5nIGluamVjdGlvbi4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJpbmplY3RcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJyZWN0KFwiICsgcHJvcGVydHlWYWx1ZSArIFwiKVwiO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgICAgIC8qIDw9SUU4IGRvIG5vdCBzdXBwb3J0IHRoZSBzdGFuZGFyZCBvcGFjaXR5IHByb3BlcnR5LiBUaGV5IHVzZSBmaWx0ZXI6YWxwaGEob3BhY2l0eT1JTlQpIGluc3RlYWQuICovXG4gICAgICAgICAgICAgICAgb3BhY2l0eTogZnVuY3Rpb24gKHR5cGUsIGVsZW1lbnQsIHByb3BlcnR5VmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKElFIDw9IDgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJuYW1lXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBcImZpbHRlclwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJleHRyYWN0XCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIDw9SUU4IHJldHVybiBhIFwiZmlsdGVyXCIgdmFsdWUgb2YgXCJhbHBoYShvcGFjaXR5PVxcZHsxLDN9KVwiLiBFeHRyYWN0IHRoZSB2YWx1ZSBhbmQgY29udmVydCBpdCB0byBhIGRlY2ltYWwgdmFsdWUgdG8gbWF0Y2ggdGhlIHN0YW5kYXJkIENTUyBvcGFjaXR5IHByb3BlcnR5J3MgZm9ybWF0dGluZy4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGV4dHJhY3RlZCA9IHByb3BlcnR5VmFsdWUudG9TdHJpbmcoKS5tYXRjaCgvYWxwaGFcXChvcGFjaXR5PSguKilcXCkvaSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV4dHJhY3RlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogQ29udmVydCB0byBkZWNpbWFsIHZhbHVlLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlWYWx1ZSA9IGV4dHJhY3RlZFsxXSAvIDEwMDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIFdoZW4gZXh0cmFjdGluZyBvcGFjaXR5LCBkZWZhdWx0IHRvIDEgKGZ1bGx5IHZpc2libGUpIHNpbmNlIGEgbnVsbCB2YWx1ZSBtZWFucyBvcGFjaXR5IGhhc24ndCBiZWVuIHNldCBhbmQgdGhlIGVsZW1lbnQgaXMgdGhlcmVmb3JlIGZ1bGx5IHZpc2libGUuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVZhbHVlID0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBwcm9wZXJ0eVZhbHVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJpbmplY3RcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogT3BhY2lmaWVkIGVsZW1lbnRzIGFyZSByZXF1aXJlZCB0byBoYXZlIHRoZWlyIHpvb20gcHJvcGVydHkgc2V0IHRvIGEgbm9uLXplcm8gdmFsdWUuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUuem9vbSA9IDE7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogU2V0dGluZyB0aGUgZmlsdGVyIHByb3BlcnR5IG9uIGVsZW1lbnRzIHdpdGggY2VydGFpbiBmb250IHByb3BlcnR5IGNvbWJpbmF0aW9ucyBjYW4gcmVzdWx0IGluIGEgaGlnaGx5IHVuYXBwZWFsaW5nIHVsdHJhLWJvbGRpbmcgZWZmZWN0LiBUaGVyZSdzIG5vIHdheSB0byByZW1lZHkgdGhpcyB0aHJvdWdob3V0IGEgdHdlZW4sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJ1dCBkcm9wcGluZyB0aGUgdmFsdWUgYWx0b2dldGhlciAod2hlbiBvcGFjaXR5IGhpdHMgMSkgYXQgbGVhc3RzIGVuc3VyZXMgdGhhdCB0aGUgZ2xpdGNoIGlzIGdvbmUgcG9zdC10d2VlbmluZy4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHBhcnNlRmxvYXQocHJvcGVydHlWYWx1ZSkgPj0gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogQXMgcGVyIHRoZSBmaWx0ZXIgcHJvcGVydHkncyBzcGVjLCBjb252ZXJ0IHRoZSBkZWNpbWFsIHZhbHVlIHRvIGEgd2hvbGUgbnVtYmVyIGFuZCB3cmFwIHRoZSB2YWx1ZS4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJhbHBoYShvcGFjaXR5PVwiICsgcGFyc2VJbnQocGFyc2VGbG9hdChwcm9wZXJ0eVZhbHVlKSAqIDEwMCwgMTApICsgXCIpXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLyogV2l0aCBhbGwgb3RoZXIgYnJvd3NlcnMsIG5vcm1hbGl6YXRpb24gaXMgbm90IHJlcXVpcmVkOyByZXR1cm4gdGhlIHNhbWUgdmFsdWVzIHRoYXQgd2VyZSBwYXNzZWQgaW4uICovXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwibmFtZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJvcGFjaXR5XCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImV4dHJhY3RcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHByb3BlcnR5VmFsdWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImluamVjdFwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcHJvcGVydHlWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIC8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuICAgICAgICAgICAgICAgIEJhdGNoZWQgUmVnaXN0cmF0aW9uc1xuICAgICAgICAgICAgKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgIC8qIE5vdGU6IEJhdGNoZWQgbm9ybWFsaXphdGlvbnMgZXh0ZW5kIHRoZSBDU1MuTm9ybWFsaXphdGlvbnMucmVnaXN0ZXJlZCBvYmplY3QuICovXG4gICAgICAgICAgICByZWdpc3RlcjogZnVuY3Rpb24gKCkge1xuXG4gICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICAgICAgIFRyYW5zZm9ybXNcbiAgICAgICAgICAgICAgICAqKioqKioqKioqKioqKioqKi9cblxuICAgICAgICAgICAgICAgIC8qIFRyYW5zZm9ybXMgYXJlIHRoZSBzdWJwcm9wZXJ0aWVzIGNvbnRhaW5lZCBieSB0aGUgQ1NTIFwidHJhbnNmb3JtXCIgcHJvcGVydHkuIFRyYW5zZm9ybXMgbXVzdCB1bmRlcmdvIG5vcm1hbGl6YXRpb24gc28gdGhhdCB0aGV5IGNhbiBiZSByZWZlcmVuY2VkIGluIGEgcHJvcGVydGllcyBtYXAgYnkgdGhlaXIgaW5kaXZpZHVhbCBuYW1lcy4gKi9cbiAgICAgICAgICAgICAgICAvKiBOb3RlOiBXaGVuIHRyYW5zZm9ybXMgYXJlIFwic2V0XCIsIHRoZXkgYXJlIGFjdHVhbGx5IGFzc2lnbmVkIHRvIGEgcGVyLWVsZW1lbnQgdHJhbnNmb3JtQ2FjaGUuIFdoZW4gYWxsIHRyYW5zZm9ybSBzZXR0aW5nIGlzIGNvbXBsZXRlIGNvbXBsZXRlLCBDU1MuZmx1c2hUcmFuc2Zvcm1DYWNoZSgpIG11c3QgYmUgbWFudWFsbHkgY2FsbGVkIHRvIGZsdXNoIHRoZSB2YWx1ZXMgdG8gdGhlIERPTS5cbiAgICAgICAgICAgICAgICAgICBUcmFuc2Zvcm0gc2V0dGluZyBpcyBiYXRjaGVkIGluIHRoaXMgd2F5IHRvIGltcHJvdmUgcGVyZm9ybWFuY2U6IHRoZSB0cmFuc2Zvcm0gc3R5bGUgb25seSBuZWVkcyB0byBiZSB1cGRhdGVkIG9uY2Ugd2hlbiBtdWx0aXBsZSB0cmFuc2Zvcm0gc3VicHJvcGVydGllcyBhcmUgYmVpbmcgYW5pbWF0ZWQgc2ltdWx0YW5lb3VzbHkuICovXG4gICAgICAgICAgICAgICAgdmFyIHRyYW5zZm9ybVByb3BlcnRpZXMgPSBbIFwidHJhbnNsYXRlWFwiLCBcInRyYW5zbGF0ZVlcIiwgXCJzY2FsZVwiLCBcInNjYWxlWFwiLCBcInNjYWxlWVwiLCBcInNrZXdYXCIsIFwic2tld1lcIiwgXCJyb3RhdGVaXCIgXTtcblxuICAgICAgICAgICAgICAgIC8qIElFOSBhbmQgQW5kcm9pZCBHaW5nZXJicmVhZCBoYXZlIHN1cHBvcnQgZm9yIDJEIC0tIGJ1dCBub3QgM0QgLS0gdHJhbnNmb3Jtcy4gU2luY2UgYW5pbWF0aW5nIHVuc3VwcG9ydGVkIHRyYW5zZm9ybSBwcm9wZXJ0aWVzIHJlc3VsdHMgaW4gdGhlIGJyb3dzZXIgaWdub3JpbmcgdGhlICplbnRpcmUqIHRyYW5zZm9ybSBzdHJpbmcsIHdlIHByZXZlbnQgdGhlc2UgM0QgdmFsdWVzXG4gICAgICAgICAgICAgICAgICAgZnJvbSBiZWluZyBub3JtYWxpemVkIGZvciB0aGVzZSBicm93c2VycyBzbyB0aGF0IHR3ZWVuaW5nIHNraXBzIHRoZXNlIHByb3BlcnRpZXMgYWx0b2dldGhlciAoc2luY2UgaXQgd2lsbCBpZ25vcmUgdGhlbSBhcyBiZWluZyB1bnN1cHBvcnRlZCBieSB0aGUgYnJvd3Nlci4pICovXG4gICAgICAgICAgICAgICAgaWYgKCEoSUUgPD0gOSkgJiYgIVZlbG9jaXR5LlN0YXRlLmlzR2luZ2VyYnJlYWQpIHtcbiAgICAgICAgICAgICAgICAgICAgLyogQXBwZW5kIDNEIHRyYW5zZm9ybSBwcm9wZXJ0aWVzIG9udG8gdHJhbnNmb3JtUHJvcGVydGllcy4gKi9cbiAgICAgICAgICAgICAgICAgICAgLyogTm90ZTogU2luY2UgdGhlIHN0YW5kYWxvbmUgQ1NTIFwicGVyc3BlY3RpdmVcIiBwcm9wZXJ0eSBhbmQgdGhlIENTUyB0cmFuc2Zvcm0gXCJwZXJzcGVjdGl2ZVwiIHN1YnByb3BlcnR5IHNoYXJlIHRoZSBzYW1lIG5hbWUsIHRoZSBsYXR0ZXIgaXMgZ2l2ZW4gYSB1bmlxdWUgdG9rZW4gd2l0aGluIFZlbG9jaXR5OiBcInRyYW5zZm9ybVBlcnNwZWN0aXZlXCIuICovXG4gICAgICAgICAgICAgICAgICAgIHRyYW5zZm9ybVByb3BlcnRpZXMgPSB0cmFuc2Zvcm1Qcm9wZXJ0aWVzLmNvbmNhdChbIFwidHJhbnNmb3JtUGVyc3BlY3RpdmVcIiwgXCJ0cmFuc2xhdGVaXCIsIFwic2NhbGVaXCIsIFwicm90YXRlWFwiLCBcInJvdGF0ZVlcIiBdKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgdHJhbnNmb3JtUHJvcGVydGllc0xlbmd0aCA9IHRyYW5zZm9ybVByb3BlcnRpZXMubGVuZ3RoOyBpIDwgdHJhbnNmb3JtUHJvcGVydGllc0xlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIC8qIFdyYXAgdGhlIGR5bmFtaWNhbGx5IGdlbmVyYXRlZCBub3JtYWxpemF0aW9uIGZ1bmN0aW9uIGluIGEgbmV3IHNjb3BlIHNvIHRoYXQgdHJhbnNmb3JtTmFtZSdzIHZhbHVlIGlzIHBhaXJlZCB3aXRoIGl0cyByZXNwZWN0aXZlIGZ1bmN0aW9uLiAoT3RoZXJ3aXNlLCBhbGwgZnVuY3Rpb25zIHdvdWxkIHRha2UgdGhlIGZpbmFsIGZvciBsb29wJ3MgdHJhbnNmb3JtTmFtZS4pICovXG4gICAgICAgICAgICAgICAgICAgIChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB0cmFuc2Zvcm1OYW1lID0gdHJhbnNmb3JtUHJvcGVydGllc1tpXTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgQ1NTLk5vcm1hbGl6YXRpb25zLnJlZ2lzdGVyZWRbdHJhbnNmb3JtTmFtZV0gPSBmdW5jdGlvbiAodHlwZSwgZWxlbWVudCwgcHJvcGVydHlWYWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBUaGUgbm9ybWFsaXplZCBwcm9wZXJ0eSBuYW1lIGlzIHRoZSBwYXJlbnQgXCJ0cmFuc2Zvcm1cIiBwcm9wZXJ0eSAtLSB0aGUgcHJvcGVydHkgdGhhdCBpcyBhY3R1YWxseSBzZXQgaW4gQ1NTLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwibmFtZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwidHJhbnNmb3JtXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIFRyYW5zZm9ybSB2YWx1ZXMgYXJlIGNhY2hlZCBvbnRvIGEgcGVyLWVsZW1lbnQgdHJhbnNmb3JtQ2FjaGUgb2JqZWN0LiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiZXh0cmFjdFwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogSWYgdGhpcyB0cmFuc2Zvcm0gaGFzIHlldCB0byBiZSBhc3NpZ25lZCBhIHZhbHVlLCByZXR1cm4gaXRzIG51bGwgdmFsdWUuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoRGF0YShlbGVtZW50KS50cmFuc2Zvcm1DYWNoZVt0cmFuc2Zvcm1OYW1lXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogU2NhbGUgdHJhbnNmb3JtUHJvcGVydGllcyBkZWZhdWx0IHRvIDEgd2hlcmVhcyBhbGwgb3RoZXIgdHJhbnNmb3JtIHByb3BlcnRpZXMgZGVmYXVsdCB0byAwLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAvXnNjYWxlL2kudGVzdCh0cmFuc2Zvcm1OYW1lKSA/IDEgOiAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogV2hlbiB0cmFuc2Zvcm0gdmFsdWVzIGFyZSBzZXQsIHRoZXkgYXJlIHdyYXBwZWQgaW4gcGFyZW50aGVzZXMgYXMgcGVyIHRoZSBDU1Mgc3BlYy4gVGh1cywgd2hlbiBleHRyYWN0aW5nIHRoZWlyIHZhbHVlcyAoZm9yIHR3ZWVuIGNhbGN1bGF0aW9ucyksIHdlIHN0cmlwIG9mZiB0aGUgcGFyZW50aGVzZXMuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBEYXRhKGVsZW1lbnQpLnRyYW5zZm9ybUNhY2hlW3RyYW5zZm9ybU5hbWVdLnJlcGxhY2UoL1soKV0vZywgXCJcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJpbmplY3RcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBpbnZhbGlkID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIElmIGFuIGluZGl2aWR1YWwgdHJhbnNmb3JtIHByb3BlcnR5IGNvbnRhaW5zIGFuIHVuc3VwcG9ydGVkIHVuaXQgdHlwZSwgdGhlIGJyb3dzZXIgaWdub3JlcyB0aGUgKmVudGlyZSogdHJhbnNmb3JtIHByb3BlcnR5LlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgVGh1cywgcHJvdGVjdCB1c2VycyBmcm9tIHRoZW1zZWx2ZXMgYnkgc2tpcHBpbmcgc2V0dGluZyBmb3IgdHJhbnNmb3JtIHZhbHVlcyBzdXBwbGllZCB3aXRoIGludmFsaWQgdW5pdCB0eXBlcy4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIFN3aXRjaCBvbiB0aGUgYmFzZSB0cmFuc2Zvcm0gdHlwZTsgaWdub3JlIHRoZSBheGlzIGJ5IHJlbW92aW5nIHRoZSBsYXN0IGxldHRlciBmcm9tIHRoZSB0cmFuc2Zvcm0ncyBuYW1lLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3dpdGNoICh0cmFuc2Zvcm1OYW1lLnN1YnN0cigwLCB0cmFuc2Zvcm1OYW1lLmxlbmd0aCAtIDEpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogV2hpdGVsaXN0IHVuaXQgdHlwZXMgZm9yIGVhY2ggdHJhbnNmb3JtLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJ0cmFuc2xhdGVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW52YWxpZCA9ICEvKCV8cHh8ZW18cmVtfFxcZCkkL2kudGVzdChwcm9wZXJ0eVZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogU2luY2UgYW4gYXhpcy1mcmVlIFwic2NhbGVcIiBwcm9wZXJ0eSBpcyBzdXBwb3J0ZWQgYXMgd2VsbCwgYSBsaXR0bGUgaGFjayBpcyB1c2VkIGhlcmUgdG8gZGV0ZWN0IGl0IGJ5IGNob3BwaW5nIG9mZiBpdHMgbGFzdCBsZXR0ZXIuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInNjYWxcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwic2NhbGVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogQ2hyb21lIG9uIEFuZHJvaWQgaGFzIGEgYnVnIGluIHdoaWNoIHNjYWxlZCBlbGVtZW50cyBibHVyIGlmIHRoZWlyIGluaXRpYWwgc2NhbGUgdmFsdWUgaXMgYmVsb3cgMSAod2hpY2ggY2FuIGhhcHBlbiB3aXRoIGZvcmNlZmVlZGluZykuIFRodXMsIHdlIGRldGVjdCBhIHlldC11bnNldCBzY2FsZSBwcm9wZXJ0eVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhbmQgZW5zdXJlIHRoYXQgaXRzIGZpcnN0IHZhbHVlIGlzIGFsd2F5cyAxLiBNb3JlIGluZm8gaGVyZTogaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8xMDQxNzg5MC9jc3MzLWFuaW1hdGlvbnMtd2l0aC10cmFuc2Zvcm0tY2F1c2VzLWJsdXJyZWQtZWxlbWVudHMtb24td2Via2l0LzEwNDE3OTYyIzEwNDE3OTYyICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChWZWxvY2l0eS5TdGF0ZS5pc0FuZHJvaWQgJiYgRGF0YShlbGVtZW50KS50cmFuc2Zvcm1DYWNoZVt0cmFuc2Zvcm1OYW1lXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVZhbHVlID0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGludmFsaWQgPSAhLyhcXGQpJC9pLnRlc3QocHJvcGVydHlWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJza2V3XCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGludmFsaWQgPSAhLyhkZWd8XFxkKSQvaS50ZXN0KHByb3BlcnR5VmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwicm90YXRlXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGludmFsaWQgPSAhLyhkZWd8XFxkKSQvaS50ZXN0KHByb3BlcnR5VmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFpbnZhbGlkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogQXMgcGVyIHRoZSBDU1Mgc3BlYywgd3JhcCB0aGUgdmFsdWUgaW4gcGFyZW50aGVzZXMuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgRGF0YShlbGVtZW50KS50cmFuc2Zvcm1DYWNoZVt0cmFuc2Zvcm1OYW1lXSA9IFwiKFwiICsgcHJvcGVydHlWYWx1ZSArIFwiKVwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBBbHRob3VnaCB0aGUgdmFsdWUgaXMgc2V0IG9uIHRoZSB0cmFuc2Zvcm1DYWNoZSBvYmplY3QsIHJldHVybiB0aGUgbmV3bHktdXBkYXRlZCB2YWx1ZSBmb3IgdGhlIGNhbGxpbmcgY29kZSB0byBwcm9jZXNzIGFzIG5vcm1hbC4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBEYXRhKGVsZW1lbnQpLnRyYW5zZm9ybUNhY2hlW3RyYW5zZm9ybU5hbWVdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIH0pKCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLyoqKioqKioqKioqKipcbiAgICAgICAgICAgICAgICAgICAgQ29sb3JzXG4gICAgICAgICAgICAgICAgKioqKioqKioqKioqKi9cblxuICAgICAgICAgICAgICAgIC8qIFNpbmNlIFZlbG9jaXR5IG9ubHkgYW5pbWF0ZXMgYSBzaW5nbGUgbnVtZXJpYyB2YWx1ZSBwZXIgcHJvcGVydHksIGNvbG9yIGFuaW1hdGlvbiBpcyBhY2hpZXZlZCBieSBob29raW5nIHRoZSBpbmRpdmlkdWFsIFJHQkEgY29tcG9uZW50cyBvZiBDU1MgY29sb3IgcHJvcGVydGllcy5cbiAgICAgICAgICAgICAgICAgICBBY2NvcmRpbmdseSwgY29sb3IgdmFsdWVzIG11c3QgYmUgbm9ybWFsaXplZCAoZS5nLiBcIiNmZjAwMDBcIiwgXCJyZWRcIiwgYW5kIFwicmdiKDI1NSwgMCwgMClcIiA9PT4gXCIyNTUgMCAwIDFcIikgc28gdGhhdCB0aGVpciBjb21wb25lbnRzIGNhbiBiZSBpbmplY3RlZC9leHRyYWN0ZWQgYnkgQ1NTLkhvb2tzIGxvZ2ljLiAqL1xuICAgICAgICAgICAgICAgIHZhciBjb2xvclByb3BlcnRpZXMgPSBbIFwiY29sb3JcIiwgXCJiYWNrZ3JvdW5kQ29sb3JcIiwgXCJib3JkZXJDb2xvclwiLCBcImJvcmRlclRvcENvbG9yXCIsIFwiYm9yZGVyUmlnaHRDb2xvclwiLCBcImJvcmRlckJvdHRvbUNvbG9yXCIsIFwiYm9yZGVyTGVmdENvbG9yXCIsIFwib3V0bGluZUNvbG9yXCIgXTtcblxuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBjb2xvclByb3BlcnRpZXNMZW5ndGggPSBjb2xvclByb3BlcnRpZXMubGVuZ3RoOyBpIDwgY29sb3JQcm9wZXJ0aWVzTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgLyogSGV4IHRvIFJHQiBjb252ZXJzaW9uLiBDb3B5cmlnaHQgVGltIERvd246IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvNTYyMzgzOC9yZ2ItdG8taGV4LWFuZC1oZXgtdG8tcmdiICovXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIGhleFRvUmdiIChoZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBzaG9ydGZvcm1SZWdleCA9IC9eIz8oW2EtZlxcZF0pKFthLWZcXGRdKShbYS1mXFxkXSkkL2ksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9uZ2Zvcm1SZWdleCA9IC9eIz8oW2EtZlxcZF17Mn0pKFthLWZcXGRdezJ9KShbYS1mXFxkXXsyfSkkL2ksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmdiUGFydHM7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGhleCA9IGhleC5yZXBsYWNlKHNob3J0Zm9ybVJlZ2V4LCBmdW5jdGlvbiAobSwgciwgZywgYikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByICsgciArIGcgKyBnICsgYiArIGI7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgcmdiUGFydHMgPSBsb25nZm9ybVJlZ2V4LmV4ZWMoaGV4KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJnYlBhcnRzID8gXCJyZ2IoXCIgKyAocGFyc2VJbnQocmdiUGFydHNbMV0sIDE2KSArIFwiIFwiICsgcGFyc2VJbnQocmdiUGFydHNbMl0sIDE2KSArIFwiIFwiICsgcGFyc2VJbnQocmdiUGFydHNbM10sIDE2KSkgKyBcIilcIiA6IFwicmdiKDAgMCAwKVwiO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLyogV3JhcCB0aGUgZHluYW1pY2FsbHkgZ2VuZXJhdGVkIG5vcm1hbGl6YXRpb24gZnVuY3Rpb24gaW4gYSBuZXcgc2NvcGUgc28gdGhhdCBjb2xvck5hbWUncyB2YWx1ZSBpcyBwYWlyZWQgd2l0aCBpdHMgcmVzcGVjdGl2ZSBmdW5jdGlvbi4gKE90aGVyd2lzZSwgYWxsIGZ1bmN0aW9ucyB3b3VsZCB0YWtlIHRoZSBmaW5hbCBmb3IgbG9vcCdzIGNvbG9yTmFtZS4pICovXG4gICAgICAgICAgICAgICAgICAgIChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgY29sb3JOYW1lID0gY29sb3JQcm9wZXJ0aWVzW2ldO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBOb3RlOiBJbiBJRTw9OCwgd2hpY2ggc3VwcG9ydCByZ2IgYnV0IG5vdCByZ2JhLCBjb2xvclByb3BlcnRpZXMgYXJlIHJldmVydGVkIHRvIHJnYiBieSBzdHJpcHBpbmcgb2ZmIHRoZSBhbHBoYSBjb21wb25lbnQuICovXG4gICAgICAgICAgICAgICAgICAgICAgICBDU1MuTm9ybWFsaXphdGlvbnMucmVnaXN0ZXJlZFtjb2xvck5hbWVdID0gZnVuY3Rpb24odHlwZSwgZWxlbWVudCwgcHJvcGVydHlWYWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwibmFtZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNvbG9yTmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogQ29udmVydCBhbGwgY29sb3IgdmFsdWVzIGludG8gdGhlIHJnYiBmb3JtYXQuIChPbGQgSUUgY2FuIHJldHVybiBoZXggdmFsdWVzIGFuZCBjb2xvciBuYW1lcyBpbnN0ZWFkIG9mIHJnYi9yZ2JhLikgKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImV4dHJhY3RcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBleHRyYWN0ZWQ7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIElmIHRoZSBjb2xvciBpcyBhbHJlYWR5IGluIGl0cyBob29rYWJsZSBmb3JtIChlLmcuIFwiMjU1IDI1NSAyNTUgMVwiKSBkdWUgdG8gaGF2aW5nIGJlZW4gcHJldmlvdXNseSBleHRyYWN0ZWQsIHNraXAgZXh0cmFjdGlvbi4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChDU1MuUmVnRXgud3JhcHBlZFZhbHVlQWxyZWFkeUV4dHJhY3RlZC50ZXN0KHByb3BlcnR5VmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXh0cmFjdGVkID0gcHJvcGVydHlWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGNvbnZlcnRlZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29sb3JOYW1lcyA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFxdWE6IFwicmdiKDAsIDI1NSwgMjU1KTtcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJsYWNrOiBcInJnYigwLCAwLCAwKVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYmx1ZTogXCJyZ2IoMCwgMCwgMjU1KVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZnVjaHNpYTogXCJyZ2IoMjU1LCAwLCAyNTUpXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBncmF5OiBcInJnYigxMjgsIDEyOCwgMTI4KVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZ3JlZW46IFwicmdiKDAsIDEyOCwgMClcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpbWU6IFwicmdiKDAsIDI1NSwgMClcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hcm9vbjogXCJyZ2IoMTI4LCAwLCAwKVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmF2eTogXCJyZ2IoMCwgMCwgMTI4KVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb2xpdmU6IFwicmdiKDEyOCwgMTI4LCAwKVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHVycGxlOiBcInJnYigxMjgsIDAsIDEyOClcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZDogXCJyZ2IoMjU1LCAwLCAwKVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2lsdmVyOiBcInJnYigxOTIsIDE5MiwgMTkyKVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGVhbDogXCJyZ2IoMCwgMTI4LCAxMjgpXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aGl0ZTogXCJyZ2IoMjU1LCAyNTUsIDI1NSlcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHllbGxvdzogXCJyZ2IoMjU1LCAyNTUsIDApXCJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIENvbnZlcnQgY29sb3IgbmFtZXMgdG8gcmdiLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICgvXltBLXpdKyQvaS50ZXN0KHByb3BlcnR5VmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb2xvck5hbWVzW3Byb3BlcnR5VmFsdWVdICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnZlcnRlZCA9IGNvbG9yTmFtZXNbcHJvcGVydHlWYWx1ZV1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIElmIGFuIHVubWF0Y2hlZCBjb2xvciBuYW1lIGlzIHByb3ZpZGVkLCBkZWZhdWx0IHRvIGJsYWNrLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udmVydGVkID0gY29sb3JOYW1lcy5ibGFjaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIENvbnZlcnQgaGV4IHZhbHVlcyB0byByZ2IuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICgvXiMoW0EtZlxcZF17M30pezEsMn0kL2kudGVzdChwcm9wZXJ0eVZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb252ZXJ0ZWQgPSBoZXhUb1JnYihwcm9wZXJ0eVZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBJZiB0aGUgcHJvdmlkZWQgY29sb3IgZG9lc24ndCBtYXRjaCBhbnkgb2YgdGhlIGFjY2VwdGVkIGNvbG9yIGZvcm1hdHMsIGRlZmF1bHQgdG8gYmxhY2suICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICghKC9ecmdiYT9cXCgvaS50ZXN0KHByb3BlcnR5VmFsdWUpKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb252ZXJ0ZWQgPSBjb2xvck5hbWVzLmJsYWNrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIFJlbW92ZSB0aGUgc3Vycm91bmRpbmcgXCJyZ2IvcmdiYSgpXCIgc3RyaW5nIHRoZW4gcmVwbGFjZSBjb21tYXMgd2l0aCBzcGFjZXMgYW5kIHN0cmlwIHJlcGVhdGVkIHNwYWNlcyAoaW4gY2FzZSB0aGUgdmFsdWUgaW5jbHVkZWQgc3BhY2VzIHRvIGJlZ2luIHdpdGgpLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RlZCA9IChjb252ZXJ0ZWQgfHwgcHJvcGVydHlWYWx1ZSkudG9TdHJpbmcoKS5tYXRjaChDU1MuUmVnRXgudmFsdWVVbndyYXApWzFdLnJlcGxhY2UoLywoXFxzKyk/L2csIFwiIFwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogU28gbG9uZyBhcyB0aGlzIGlzbid0IDw9SUU4LCBhZGQgYSBmb3VydGggKGFscGhhKSBjb21wb25lbnQgaWYgaXQncyBtaXNzaW5nIGFuZCBkZWZhdWx0IGl0IHRvIDEgKHZpc2libGUpLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCEoSUUgPD0gOCkgJiYgZXh0cmFjdGVkLnNwbGl0KFwiIFwiKS5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHRyYWN0ZWQgKz0gXCIgMVwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXh0cmFjdGVkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiaW5qZWN0XCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBJZiB0aGlzIGlzIElFPD04IGFuZCBhbiBhbHBoYSBjb21wb25lbnQgZXhpc3RzLCBzdHJpcCBpdCBvZmYuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoSUUgPD0gOCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eVZhbHVlLnNwbGl0KFwiIFwiKS5sZW5ndGggPT09IDQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlWYWx1ZSA9IHByb3BlcnR5VmFsdWUuc3BsaXQoL1xccysvKS5zbGljZSgwLCAzKS5qb2luKFwiIFwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBPdGhlcndpc2UsIGFkZCBhIGZvdXJ0aCAoYWxwaGEpIGNvbXBvbmVudCBpZiBpdCdzIG1pc3NpbmcgYW5kIGRlZmF1bHQgaXQgdG8gMSAodmlzaWJsZSkuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5VmFsdWUuc3BsaXQoXCIgXCIpLmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5VmFsdWUgKz0gXCIgMVwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBSZS1pbnNlcnQgdGhlIGJyb3dzZXItYXBwcm9wcmlhdGUgd3JhcHBlcihcInJnYi9yZ2JhKClcIiksIGluc2VydCBjb21tYXMsIGFuZCBzdHJpcCBvZmYgZGVjaW1hbCB1bml0cyBvbiBhbGwgdmFsdWVzIGJ1dCB0aGUgZm91cnRoIChSLCBHLCBhbmQgQiBvbmx5IGFjY2VwdCB3aG9sZSBudW1iZXJzKS4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAoSUUgPD0gOCA/IFwicmdiXCIgOiBcInJnYmFcIikgKyBcIihcIiArIHByb3BlcnR5VmFsdWUucmVwbGFjZSgvXFxzKy9nLCBcIixcIikucmVwbGFjZSgvXFwuKFxcZCkrKD89LCkvZywgXCJcIikgKyBcIilcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICB9KSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvKioqKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgIENTUyBQcm9wZXJ0eSBOYW1lc1xuICAgICAgICAqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgTmFtZXM6IHtcbiAgICAgICAgICAgIC8qIENhbWVsY2FzZSBhIHByb3BlcnR5IG5hbWUgaW50byBpdHMgSmF2YVNjcmlwdCBub3RhdGlvbiAoZS5nLiBcImJhY2tncm91bmQtY29sb3JcIiA9PT4gXCJiYWNrZ3JvdW5kQ29sb3JcIikuIENhbWVsY2FzaW5nIGlzIHVzZWQgdG8gbm9ybWFsaXplIHByb3BlcnR5IG5hbWVzIGJldHdlZW4gYW5kIGFjcm9zcyBjYWxscy4gKi9cbiAgICAgICAgICAgIGNhbWVsQ2FzZTogZnVuY3Rpb24gKHByb3BlcnR5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHByb3BlcnR5LnJlcGxhY2UoLy0oXFx3KS9nLCBmdW5jdGlvbiAobWF0Y2gsIHN1Yk1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBzdWJNYXRjaC50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgLyogRGV0ZXJtaW5lIHdoZXRoZXIgYSBwcm9wZXJ0eSBzaG91bGQgYmUgc2V0IHdpdGggYSB2ZW5kb3IgcHJlZml4LiAqL1xuICAgICAgICAgICAgLyogSWYgYSBwcmVmaXhlZCB2ZXJzaW9uIG9mIHRoZSBwcm9wZXJ0eSBleGlzdHMsIHJldHVybiBpdC4gT3RoZXJ3aXNlLCByZXR1cm4gdGhlIG9yaWdpbmFsIHByb3BlcnR5IG5hbWUuIElmIHRoZSBwcm9wZXJ0eSBpcyBub3QgYXQgYWxsIHN1cHBvcnRlZCBieSB0aGUgYnJvd3NlciwgcmV0dXJuIGEgZmFsc2UgZmxhZy4gKi9cbiAgICAgICAgICAgIHByZWZpeENoZWNrOiBmdW5jdGlvbiAocHJvcGVydHkpIHtcbiAgICAgICAgICAgICAgICAvKiBJZiB0aGlzIHByb3BlcnR5IGhhcyBhbHJlYWR5IGJlZW4gY2hlY2tlZCwgcmV0dXJuIHRoZSBjYWNoZWQgdmFsdWUuICovXG4gICAgICAgICAgICAgICAgaWYgKFZlbG9jaXR5LlN0YXRlLnByZWZpeE1hdGNoZXNbcHJvcGVydHldKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbIFZlbG9jaXR5LlN0YXRlLnByZWZpeE1hdGNoZXNbcHJvcGVydHldLCB0cnVlIF07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHZlbmRvcnMgPSBbIFwiXCIsIFwiV2Via2l0XCIsIFwiTW96XCIsIFwibXNcIiwgXCJPXCIgXTtcblxuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgdmVuZG9yc0xlbmd0aCA9IHZlbmRvcnMubGVuZ3RoOyBpIDwgdmVuZG9yc0xlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcHJvcGVydHlQcmVmaXhlZDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGkgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVByZWZpeGVkID0gcHJvcGVydHk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIENhcGl0YWxpemUgdGhlIGZpcnN0IGxldHRlciBvZiB0aGUgcHJvcGVydHkgdG8gY29uZm9ybSB0byBKYXZhU2NyaXB0IHZlbmRvciBwcmVmaXggbm90YXRpb24gKGUuZy4gd2Via2l0RmlsdGVyKS4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVByZWZpeGVkID0gdmVuZG9yc1tpXSArIHByb3BlcnR5LnJlcGxhY2UoL15cXHcvLCBmdW5jdGlvbihtYXRjaCkgeyByZXR1cm4gbWF0Y2gudG9VcHBlckNhc2UoKTsgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIENoZWNrIGlmIHRoZSBicm93c2VyIHN1cHBvcnRzIHRoaXMgcHJvcGVydHkgYXMgcHJlZml4ZWQuICovXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoVHlwZS5pc1N0cmluZyhWZWxvY2l0eS5TdGF0ZS5wcmVmaXhFbGVtZW50LnN0eWxlW3Byb3BlcnR5UHJlZml4ZWRdKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIENhY2hlIHRoZSBtYXRjaC4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBWZWxvY2l0eS5TdGF0ZS5wcmVmaXhNYXRjaGVzW3Byb3BlcnR5XSA9IHByb3BlcnR5UHJlZml4ZWQ7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gWyBwcm9wZXJ0eVByZWZpeGVkLCB0cnVlIF07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvKiBJZiB0aGUgYnJvd3NlciBkb2Vzbid0IHN1cHBvcnQgdGhpcyBwcm9wZXJ0eSBpbiBhbnkgZm9ybSwgaW5jbHVkZSBhIGZhbHNlIGZsYWcgc28gdGhhdCB0aGUgY2FsbGVyIGNhbiBkZWNpZGUgaG93IHRvIHByb2NlZWQuICovXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbIHByb3BlcnR5LCBmYWxzZSBdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvKioqKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgIENTUyBQcm9wZXJ0eSBWYWx1ZXNcbiAgICAgICAgKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgIFZhbHVlczoge1xuICAgICAgICAgICAgaXNDU1NOdWxsVmFsdWU6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIC8qIFRoZSBicm93c2VyIGRlZmF1bHRzIENTUyB2YWx1ZXMgdGhhdCBoYXZlIG5vdCBiZWVuIHNldCB0byBlaXRoZXIgMCBvciBvbmUgb2Ygc2V2ZXJhbCBwb3NzaWJsZSBudWxsLXZhbHVlIHN0cmluZ3MuIFRodXMsIHdlIGNoZWNrIGZvciBib3RoIGZhbHNpbmVzcyBhbmQgdGhlc2Ugc3BlY2lhbCBzdHJpbmdzLiAqL1xuICAgICAgICAgICAgICAgIC8qIE51bGwtdmFsdWUgY2hlY2tpbmcgaXMgcGVyZm9ybWVkIHRvIGRlZmF1bHQgdGhlIHNwZWNpYWwgc3RyaW5ncyB0byAwIChmb3IgdGhlIHNha2Ugb2YgdHdlZW5pbmcpIG9yIHRoZWlyIGhvb2sgdGVtcGxhdGVzIGFzIGRlZmluZWQgYXMgQ1NTLkhvb2tzIChmb3IgdGhlIHNha2Ugb2YgaG9vayBpbmplY3Rpb24vZXh0cmFjdGlvbikuICovXG4gICAgICAgICAgICAgICAgLyogTm90ZTogQ2hyb21lIHJldHVybnMgXCJyZ2JhKDAsIDAsIDAsIDApXCIgZm9yIGFuIHVuZGVmaW5lZCBjb2xvciB3aGVyZWFzIElFIHJldHVybnMgXCJ0cmFuc3BhcmVudFwiLiAqL1xuICAgICAgICAgICAgICAgIHJldHVybiAodmFsdWUgPT0gMCB8fCAvXihub25lfGF1dG98dHJhbnNwYXJlbnR8KHJnYmFcXCgwLCA/MCwgPzAsID8wXFwpKSkkL2kudGVzdCh2YWx1ZSkpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIC8qIFJldHJpZXZlIGEgcHJvcGVydHkncyBkZWZhdWx0IHVuaXQgdHlwZS4gVXNlZCBmb3IgYXNzaWduaW5nIGEgdW5pdCB0eXBlIHdoZW4gb25lIGlzIG5vdCBzdXBwbGllZCBieSB0aGUgdXNlci4gKi9cbiAgICAgICAgICAgIGdldFVuaXRUeXBlOiBmdW5jdGlvbiAocHJvcGVydHkpIHtcbiAgICAgICAgICAgICAgICBpZiAoL14ocm90YXRlfHNrZXcpL2kudGVzdChwcm9wZXJ0eSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiZGVnXCI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICgvKF4oc2NhbGV8c2NhbGVYfHNjYWxlWXxzY2FsZVp8b3BhY2l0eXxhbHBoYXxmaWxsT3BhY2l0eXxmbGV4R3Jvd3xmbGV4SGVpZ2h0fHpJbmRleHxmb250V2VpZ2h0KSQpfGNvbG9yL2kudGVzdChwcm9wZXJ0eSkpIHtcbiAgICAgICAgICAgICAgICAgICAgLyogVGhlIGFib3ZlIHByb3BlcnRpZXMgYXJlIHVuaXRsZXNzLiAqL1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvKiBEZWZhdWx0IHRvIHB4IGZvciBhbGwgb3RoZXIgcHJvcGVydGllcy4gKi9cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwicHhcIjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgLyogSFRNTCBlbGVtZW50cyBkZWZhdWx0IHRvIGFuIGFzc29jaWF0ZWQgZGlzcGxheSB0eXBlIHdoZW4gdGhleSdyZSBub3Qgc2V0IHRvIGRpc3BsYXk6bm9uZS4gKi9cbiAgICAgICAgICAgIC8qIE5vdGU6IFRoaXMgZnVuY3Rpb24gaXMgdXNlZCBmb3IgY29ycmVjdGx5IHNldHRpbmcgdGhlIG5vbi1cIm5vbmVcIiBkaXNwbGF5IHZhbHVlIGluIGNlcnRhaW4gVmVsb2NpdHkgc2VxdWVuY2VzLCBzdWNoIGFzIGZhZGVJbi9PdXQuICovXG4gICAgICAgICAgICBnZXREaXNwbGF5VHlwZTogZnVuY3Rpb24gKGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICB2YXIgdGFnTmFtZSA9IGVsZW1lbnQudGFnTmFtZS50b1N0cmluZygpLnRvTG93ZXJDYXNlKCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoL14oYnxiaWd8aXxzbWFsbHx0dHxhYmJyfGFjcm9ueW18Y2l0ZXxjb2RlfGRmbnxlbXxrYmR8c3Ryb25nfHNhbXB8dmFyfGF8YmRvfGJyfGltZ3xtYXB8b2JqZWN0fHF8c2NyaXB0fHNwYW58c3VifHN1cHxidXR0b258aW5wdXR8bGFiZWx8c2VsZWN0fHRleHRhcmVhKSQvaS50ZXN0KHRhZ05hbWUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcImlubGluZVwiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoL14obGkpJC9pLnRlc3QodGFnTmFtZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwibGlzdC1pdGVtXCI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICgvXih0cikkL2kudGVzdCh0YWdOYW1lKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJ0YWJsZS1yb3dcIjtcbiAgICAgICAgICAgICAgICAvKiBEZWZhdWx0IHRvIFwiYmxvY2tcIiB3aGVuIG5vIG1hdGNoIGlzIGZvdW5kLiAqL1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcImJsb2NrXCI7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIC8qKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgIFN0eWxlIEdldHRpbmcgJiBTZXR0aW5nXG4gICAgICAgICoqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgLyogVGhlIHNpbmd1bGFyIGdldFByb3BlcnR5VmFsdWUsIHdoaWNoIHJvdXRlcyB0aGUgbG9naWMgZm9yIGFsbCBub3JtYWxpemF0aW9ucywgaG9va3MsIGFuZCBzdGFuZGFyZCBDU1MgcHJvcGVydGllcy4gKi9cbiAgICAgICAgZ2V0UHJvcGVydHlWYWx1ZTogZnVuY3Rpb24gKGVsZW1lbnQsIHByb3BlcnR5LCByb290UHJvcGVydHlWYWx1ZSwgZm9yY2VTdHlsZUxvb2t1cCkge1xuICAgICAgICAgICAgLyogR2V0IGFuIGVsZW1lbnQncyBjb21wdXRlZCBwcm9wZXJ0eSB2YWx1ZS4gKi9cbiAgICAgICAgICAgIC8qIE5vdGU6IFJldHJpZXZpbmcgdGhlIHZhbHVlIG9mIGEgQ1NTIHByb3BlcnR5IGNhbm5vdCBzaW1wbHkgYmUgcGVyZm9ybWVkIGJ5IGNoZWNraW5nIGFuIGVsZW1lbnQncyBzdHlsZSBhdHRyaWJ1dGUgKHdoaWNoIG9ubHkgcmVmbGVjdHMgdXNlci1kZWZpbmVkIHZhbHVlcykuXG4gICAgICAgICAgICAgICBJbnN0ZWFkLCB0aGUgYnJvd3NlciBtdXN0IGJlIHF1ZXJpZWQgZm9yIGEgcHJvcGVydHkncyAqY29tcHV0ZWQqIHZhbHVlLiBZb3UgY2FuIHJlYWQgbW9yZSBhYm91dCBnZXRDb21wdXRlZFN0eWxlIGhlcmU6IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuL2RvY3MvV2ViL0FQSS93aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZSAqL1xuICAgICAgICAgICAgZnVuY3Rpb24gY29tcHV0ZVByb3BlcnR5VmFsdWUgKGVsZW1lbnQsIHByb3BlcnR5KSB7XG4gICAgICAgICAgICAgICAgLyogV2hlbiBib3gtc2l6aW5nIGlzbid0IHNldCB0byBib3JkZXItYm94LCBoZWlnaHQgYW5kIHdpZHRoIHN0eWxlIHZhbHVlcyBhcmUgaW5jb3JyZWN0bHkgY29tcHV0ZWQgd2hlbiBhbiBlbGVtZW50J3Mgc2Nyb2xsYmFycyBhcmUgdmlzaWJsZSAod2hpY2ggZXhwYW5kcyB0aGUgZWxlbWVudCdzIGRpbWVuc2lvbnMpLiBUaHVzLCB3ZSBkZWZlclxuICAgICAgICAgICAgICAgICAgIHRvIHRoZSBtb3JlIGFjY3VyYXRlIG9mZnNldEhlaWdodC9XaWR0aCBwcm9wZXJ0eSwgd2hpY2ggaW5jbHVkZXMgdGhlIHRvdGFsIGRpbWVuc2lvbnMgZm9yIGludGVyaW9yLCBib3JkZXIsIHBhZGRpbmcsIGFuZCBzY3JvbGxiYXIuIFdlIHN1YnRyYWN0IGJvcmRlciBhbmQgcGFkZGluZyB0byBnZXQgdGhlIHN1bSBvZiBpbnRlcmlvciArIHNjcm9sbGJhci4gKi9cblxuICAgICAgICAgICAgICAgIHZhciBjb21wdXRlZFZhbHVlID0gMDtcblxuICAgICAgICAgICAgICAgIC8qIElFPD04IGRvZXNuJ3Qgc3VwcG9ydCB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZSwgdGh1cyB3ZSBkZWZlciB0byBqUXVlcnksIHdoaWNoIGhhcyBhbiBleHRlbnNpdmUgYXJyYXkgb2YgaGFja3MgdG8gYWNjdXJhdGVseSByZXRyaWV2ZSBJRTggcHJvcGVydHkgdmFsdWVzLlxuICAgICAgICAgICAgICAgICAgIFJlLWltcGxlbWVudGluZyB0aGF0IGxvZ2ljIGhlcmUgaXMgbm90IHdvcnRoIGJsb2F0aW5nIHRoZSBjb2RlYmFzZSBmb3IgYSBkeWluZyBicm93c2VyLiBUaGUgcGVyZm9ybWFuY2UgcmVwZXJjdXNzaW9ucyBvZiB1c2luZyBqUXVlcnkgaGVyZSBhcmUgbWluaW1hbCBzaW5jZVxuICAgICAgICAgICAgICAgICAgIFZlbG9jaXR5IGlzIG9wdGltaXplZCB0byByYXJlbHkgKGFuZCBzb21ldGltZXMgbmV2ZXIpIHF1ZXJ5IHRoZSBET00uIEZ1cnRoZXIsIHRoZSAkLmNzcygpIGNvZGVwYXRoIGlzbid0IHRoYXQgc2xvdy4gKi9cbiAgICAgICAgICAgICAgICBpZiAoSUUgPD0gOCkge1xuICAgICAgICAgICAgICAgICAgICBjb21wdXRlZFZhbHVlID0gJC5jc3MoZWxlbWVudCwgcHJvcGVydHkpOyAvKiBHRVQgKi9cbiAgICAgICAgICAgICAgICAvKiBBbGwgb3RoZXIgYnJvd3NlcnMgc3VwcG9ydCBnZXRDb21wdXRlZFN0eWxlLiBUaGUgcmV0dXJuZWQgbGl2ZSBvYmplY3QgcmVmZXJlbmNlIGlzIGNhY2hlZCBvbnRvIGl0cyBhc3NvY2lhdGVkIGVsZW1lbnQgc28gdGhhdCBpdCBkb2VzIG5vdCBuZWVkIHRvIGJlIHJlZmV0Y2hlZCB1cG9uIGV2ZXJ5IEdFVC4gKi9cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWZvcmNlU3R5bGVMb29rdXApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eSA9PT0gXCJoZWlnaHRcIiAmJiBDU1MuZ2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcImJveFNpemluZ1wiKS50b1N0cmluZygpLnRvTG93ZXJDYXNlKCkgIT09IFwiYm9yZGVyLWJveFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQub2Zmc2V0SGVpZ2h0IC0gKHBhcnNlRmxvYXQoQ1NTLmdldFByb3BlcnR5VmFsdWUoZWxlbWVudCwgXCJib3JkZXJUb3BXaWR0aFwiKSkgfHwgMCkgLSAocGFyc2VGbG9hdChDU1MuZ2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcImJvcmRlckJvdHRvbVdpZHRoXCIpKSB8fCAwKSAtIChwYXJzZUZsb2F0KENTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwicGFkZGluZ1RvcFwiKSkgfHwgMCkgLSAocGFyc2VGbG9hdChDU1MuZ2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcInBhZGRpbmdCb3R0b21cIikpIHx8IDApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eSA9PT0gXCJ3aWR0aFwiICYmIENTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwiYm94U2l6aW5nXCIpLnRvU3RyaW5nKCkudG9Mb3dlckNhc2UoKSAhPT0gXCJib3JkZXItYm94XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZWxlbWVudC5vZmZzZXRXaWR0aCAtIChwYXJzZUZsb2F0KENTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwiYm9yZGVyTGVmdFdpZHRoXCIpKSB8fCAwKSAtIChwYXJzZUZsb2F0KENTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwiYm9yZGVyUmlnaHRXaWR0aFwiKSkgfHwgMCkgLSAocGFyc2VGbG9hdChDU1MuZ2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcInBhZGRpbmdMZWZ0XCIpKSB8fCAwKSAtIChwYXJzZUZsb2F0KENTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwicGFkZGluZ1JpZ2h0XCIpKSB8fCAwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHZhciBjb21wdXRlZFN0eWxlO1xuXG4gICAgICAgICAgICAgICAgICAgIC8qIEZvciBlbGVtZW50cyB0aGF0IFZlbG9jaXR5IGhhc24ndCBiZWVuIGNhbGxlZCBvbiBkaXJlY3RseSAoZS5nLiB3aGVuIFZlbG9jaXR5IHF1ZXJpZXMgdGhlIERPTSBvbiBiZWhhbGYgb2YgYSBwYXJlbnQgb2YgYW4gZWxlbWVudCBpdHMgYW5pbWF0aW5nKSwgcGVyZm9ybSBhIGRpcmVjdCBnZXRDb21wdXRlZFN0eWxlIGxvb2t1cCBzaW5jZSB0aGUgb2JqZWN0IGlzbid0IGNhY2hlZC4gKi9cbiAgICAgICAgICAgICAgICAgICAgaWYgKERhdGEoZWxlbWVudCkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29tcHV0ZWRTdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQsIG51bGwpOyAvKiBHRVQgKi9cbiAgICAgICAgICAgICAgICAgICAgLyogSWYgdGhlIGNvbXB1dGVkU3R5bGUgb2JqZWN0IGhhcyB5ZXQgdG8gYmUgY2FjaGVkLCBkbyBzbyBub3cuICovXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIURhdGEoZWxlbWVudCkuY29tcHV0ZWRTdHlsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29tcHV0ZWRTdHlsZSA9IERhdGEoZWxlbWVudCkuY29tcHV0ZWRTdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQsIG51bGwpOyAvKiBHRVQgKi9cbiAgICAgICAgICAgICAgICAgICAgLyogSWYgY29tcHV0ZWRTdHlsZSBpcyBjYWNoZWQsIHVzZSBpdC4gKi9cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXB1dGVkU3R5bGUgPSBEYXRhKGVsZW1lbnQpLmNvbXB1dGVkU3R5bGU7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvKiBJRSBkb2Vzbid0IHJldHVybiBhIHZhbHVlIGZvciBib3JkZXJDb2xvciAtLSBpdCBvbmx5IHJldHVybnMgaW5kaXZpZHVhbCB2YWx1ZXMgZm9yIGVhY2ggYm9yZGVyIHNpZGUncyBjb2xvci4gQXMgYSBwb2x5ZmlsbCwgZGVmYXVsdCB0byBxdWVyeWluZyBmb3IganVzdCB0aGUgdG9wIGJvcmRlcidzIGNvbG9yLiAqL1xuICAgICAgICAgICAgICAgICAgICBpZiAoSUUgJiYgcHJvcGVydHkgPT09IFwiYm9yZGVyQ29sb3JcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHkgPSBcImJvcmRlclRvcENvbG9yXCI7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvKiBJRTkgaGFzIGEgYnVnIGluIHdoaWNoIHRoZSBcImZpbHRlclwiIHByb3BlcnR5IG11c3QgYmUgYWNjZXNzZWQgZnJvbSBjb21wdXRlZFN0eWxlIHVzaW5nIHRoZSBnZXRQcm9wZXJ0eVZhbHVlIG1ldGhvZCBpbnN0ZWFkIG9mIGEgZGlyZWN0IHByb3BlcnR5IGxvb2t1cC5cbiAgICAgICAgICAgICAgICAgICAgICAgVGhlIGdldFByb3BlcnR5VmFsdWUgbWV0aG9kIGlzIHNsb3dlciB0aGFuIGEgZGlyZWN0IGxvb2t1cCwgd2hpY2ggaXMgd2h5IHdlIGF2b2lkIGl0IGJ5IGRlZmF1bHQuICovXG4gICAgICAgICAgICAgICAgICAgIGlmIChJRSA9PT0gOSAmJiBwcm9wZXJ0eSA9PT0gXCJmaWx0ZXJcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29tcHV0ZWRWYWx1ZSA9IGNvbXB1dGVkU3R5bGUuZ2V0UHJvcGVydHlWYWx1ZShwcm9wZXJ0eSk7IC8qIEdFVCAqL1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29tcHV0ZWRWYWx1ZSA9IGNvbXB1dGVkU3R5bGVbcHJvcGVydHldO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLyogRmFsbCBiYWNrIHRvIHRoZSBwcm9wZXJ0eSdzIHN0eWxlIHZhbHVlIChpZiBkZWZpbmVkKSB3aGVuIGNvbXB1dGVkVmFsdWUgcmV0dXJucyBub3RoaW5nLCB3aGljaCBjYW4gaGFwcGVuIHdoZW4gdGhlIGVsZW1lbnQgaGFzbid0IGJlZW4gcGFpbnRlZC4gKi9cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXB1dGVkVmFsdWUgPT09IFwiXCIgfHwgY29tcHV0ZWRWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29tcHV0ZWRWYWx1ZSA9IGVsZW1lbnQuc3R5bGVbcHJvcGVydHldO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLyogRm9yIHRvcCwgcmlnaHQsIGJvdHRvbSwgYW5kIGxlZnQgKFRSQkwpIHZhbHVlcyB0aGF0IGFyZSBzZXQgdG8gXCJhdXRvXCIgb24gZWxlbWVudHMgb2YgXCJmaXhlZFwiIG9yIFwiYWJzb2x1dGVcIiBwb3NpdGlvbiwgZGVmZXIgdG8galF1ZXJ5IGZvciBjb252ZXJ0aW5nIFwiYXV0b1wiIHRvIGEgbnVtZXJpYyB2YWx1ZS5cbiAgICAgICAgICAgICAgICAgICAoRm9yIGVsZW1lbnRzIHdpdGggYSBcInN0YXRpY1wiIG9yIFwicmVsYXRpdmVcIiBwb3NpdGlvbiwgXCJhdXRvXCIgaGFzIHRoZSBzYW1lIGVmZmVjdCBhcyBiZWluZyBzZXQgdG8gMCwgc28gbm8gY29udmVyc2lvbiBpcyBuZWNlc3NhcnkuKSAqL1xuICAgICAgICAgICAgICAgIC8qIEFuIGV4YW1wbGUgb2Ygd2h5IG51bWVyaWMgY29udmVyc2lvbiBpcyBuZWNlc3Nhcnk6IFdoZW4gYW4gZWxlbWVudCB3aXRoIFwicG9zaXRpb246YWJzb2x1dGVcIiBoYXMgYW4gdW50b3VjaGVkIFwibGVmdFwiIHByb3BlcnR5LCB3aGljaCByZXZlcnRzIHRvIFwiYXV0b1wiLCBsZWZ0J3MgdmFsdWUgaXMgMCByZWxhdGl2ZSB0byBpdHMgcGFyZW50IGVsZW1lbnQsXG4gICAgICAgICAgICAgICAgICAgYnV0IGlzIG9mdGVuIG5vbi16ZXJvIHJlbGF0aXZlIHRvIGl0cyAqY29udGFpbmluZyogKG5vdCBwYXJlbnQpIGVsZW1lbnQsIHdoaWNoIGlzIHRoZSBuZWFyZXN0IFwicG9zaXRpb246cmVsYXRpdmVcIiBhbmNlc3RvciBvciB0aGUgdmlld3BvcnQgKGFuZCBhbHdheXMgdGhlIHZpZXdwb3J0IGluIHRoZSBjYXNlIG9mIFwicG9zaXRpb246Zml4ZWRcIikuICovXG4gICAgICAgICAgICAgICAgaWYgKGNvbXB1dGVkVmFsdWUgPT09IFwiYXV0b1wiICYmIC9eKHRvcHxyaWdodHxib3R0b218bGVmdCkkL2kudGVzdChwcm9wZXJ0eSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHBvc2l0aW9uID0gY29tcHV0ZVByb3BlcnR5VmFsdWUoZWxlbWVudCwgXCJwb3NpdGlvblwiKTsgLyogR0VUICovXG5cbiAgICAgICAgICAgICAgICAgICAgLyogRm9yIGFic29sdXRlIHBvc2l0aW9uaW5nLCBqUXVlcnkncyAkLnBvc2l0aW9uKCkgb25seSByZXR1cm5zIHZhbHVlcyBmb3IgdG9wIGFuZCBsZWZ0OyByaWdodCBhbmQgYm90dG9tIHdpbGwgaGF2ZSB0aGVpciBcImF1dG9cIiB2YWx1ZSByZXZlcnRlZCB0byAwLiAqL1xuICAgICAgICAgICAgICAgICAgICAvKiBOb3RlOiBBIGpRdWVyeSBvYmplY3QgbXVzdCBiZSBjcmVhdGVkIGhlcmUgc2luY2UgalF1ZXJ5IGRvZXNuJ3QgaGF2ZSBhIGxvdy1sZXZlbCBhbGlhcyBmb3IgJC5wb3NpdGlvbigpLiBOb3QgYSBiaWcgZGVhbCBzaW5jZSB3ZSdyZSBjdXJyZW50bHkgaW4gYSBHRVQgYmF0Y2ggYW55d2F5LiAqL1xuICAgICAgICAgICAgICAgICAgICBpZiAocG9zaXRpb24gPT09IFwiZml4ZWRcIiB8fCAocG9zaXRpb24gPT09IFwiYWJzb2x1dGVcIiAmJiAvdG9wfGxlZnQvaS50ZXN0KHByb3BlcnR5KSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIE5vdGU6IGpRdWVyeSBzdHJpcHMgdGhlIHBpeGVsIHVuaXQgZnJvbSBpdHMgcmV0dXJuZWQgdmFsdWVzOyB3ZSByZS1hZGQgaXQgaGVyZSB0byBjb25mb3JtIHdpdGggY29tcHV0ZVByb3BlcnR5VmFsdWUncyBiZWhhdmlvci4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXB1dGVkVmFsdWUgPSAkKGVsZW1lbnQpLnBvc2l0aW9uKClbcHJvcGVydHldICsgXCJweFwiOyAvKiBHRVQgKi9cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiBjb21wdXRlZFZhbHVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgcHJvcGVydHlWYWx1ZTtcblxuICAgICAgICAgICAgLyogSWYgdGhpcyBpcyBhIGhvb2tlZCBwcm9wZXJ0eSAoZS5nLiBcImNsaXBMZWZ0XCIgaW5zdGVhZCBvZiB0aGUgcm9vdCBwcm9wZXJ0eSBvZiBcImNsaXBcIiksIGV4dHJhY3QgdGhlIGhvb2sncyB2YWx1ZSBmcm9tIGEgbm9ybWFsaXplZCByb290UHJvcGVydHlWYWx1ZSB1c2luZyBDU1MuSG9va3MuZXh0cmFjdFZhbHVlKCkuICovXG4gICAgICAgICAgICBpZiAoQ1NTLkhvb2tzLnJlZ2lzdGVyZWRbcHJvcGVydHldKSB7XG4gICAgICAgICAgICAgICAgdmFyIGhvb2sgPSBwcm9wZXJ0eSxcbiAgICAgICAgICAgICAgICAgICAgaG9va1Jvb3QgPSBDU1MuSG9va3MuZ2V0Um9vdChob29rKTtcblxuICAgICAgICAgICAgICAgIC8qIElmIGEgY2FjaGVkIHJvb3RQcm9wZXJ0eVZhbHVlIHdhc24ndCBwYXNzZWQgaW4gKHdoaWNoIFZlbG9jaXR5IGFsd2F5cyBhdHRlbXB0cyB0byBkbyBpbiBvcmRlciB0byBhdm9pZCByZXF1ZXJ5aW5nIHRoZSBET00pLCBxdWVyeSB0aGUgRE9NIGZvciB0aGUgcm9vdCBwcm9wZXJ0eSdzIHZhbHVlLiAqL1xuICAgICAgICAgICAgICAgIGlmIChyb290UHJvcGVydHlWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIC8qIFNpbmNlIHRoZSBicm93c2VyIGlzIG5vdyBiZWluZyBkaXJlY3RseSBxdWVyaWVkLCB1c2UgdGhlIG9mZmljaWFsIHBvc3QtcHJlZml4aW5nIHByb3BlcnR5IG5hbWUgZm9yIHRoaXMgbG9va3VwLiAqL1xuICAgICAgICAgICAgICAgICAgICByb290UHJvcGVydHlWYWx1ZSA9IENTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIENTUy5OYW1lcy5wcmVmaXhDaGVjayhob29rUm9vdClbMF0pOyAvKiBHRVQgKi9cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvKiBJZiB0aGlzIHJvb3QgaGFzIGEgbm9ybWFsaXphdGlvbiByZWdpc3RlcmVkLCBwZWZvcm0gdGhlIGFzc29jaWF0ZWQgbm9ybWFsaXphdGlvbiBleHRyYWN0aW9uLiAqL1xuICAgICAgICAgICAgICAgIGlmIChDU1MuTm9ybWFsaXphdGlvbnMucmVnaXN0ZXJlZFtob29rUm9vdF0pIHtcbiAgICAgICAgICAgICAgICAgICAgcm9vdFByb3BlcnR5VmFsdWUgPSBDU1MuTm9ybWFsaXphdGlvbnMucmVnaXN0ZXJlZFtob29rUm9vdF0oXCJleHRyYWN0XCIsIGVsZW1lbnQsIHJvb3RQcm9wZXJ0eVZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvKiBFeHRyYWN0IHRoZSBob29rJ3MgdmFsdWUuICovXG4gICAgICAgICAgICAgICAgcHJvcGVydHlWYWx1ZSA9IENTUy5Ib29rcy5leHRyYWN0VmFsdWUoaG9vaywgcm9vdFByb3BlcnR5VmFsdWUpO1xuXG4gICAgICAgICAgICAvKiBJZiB0aGlzIGlzIGEgbm9ybWFsaXplZCBwcm9wZXJ0eSAoZS5nLiBcIm9wYWNpdHlcIiBiZWNvbWVzIFwiZmlsdGVyXCIgaW4gPD1JRTgpIG9yIFwidHJhbnNsYXRlWFwiIGJlY29tZXMgXCJ0cmFuc2Zvcm1cIiksIG5vcm1hbGl6ZSB0aGUgcHJvcGVydHkncyBuYW1lIGFuZCB2YWx1ZSwgYW5kIGhhbmRsZSB0aGUgc3BlY2lhbCBjYXNlIG9mIHRyYW5zZm9ybXMuICovXG4gICAgICAgICAgICAvKiBOb3RlOiBOb3JtYWxpemluZyBhIHByb3BlcnR5IGlzIG11dHVhbGx5IGV4Y2x1c2l2ZSBmcm9tIGhvb2tpbmcgYSBwcm9wZXJ0eSBzaW5jZSBob29rLWV4dHJhY3RlZCB2YWx1ZXMgYXJlIHN0cmljdGx5IG51bWVyaWNhbCBhbmQgdGhlcmVmb3JlIGRvIG5vdCByZXF1aXJlIG5vcm1hbGl6YXRpb24gZXh0cmFjdGlvbi4gKi9cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoQ1NTLk5vcm1hbGl6YXRpb25zLnJlZ2lzdGVyZWRbcHJvcGVydHldKSB7XG4gICAgICAgICAgICAgICAgdmFyIG5vcm1hbGl6ZWRQcm9wZXJ0eU5hbWUsXG4gICAgICAgICAgICAgICAgICAgIG5vcm1hbGl6ZWRQcm9wZXJ0eVZhbHVlO1xuXG4gICAgICAgICAgICAgICAgbm9ybWFsaXplZFByb3BlcnR5TmFtZSA9IENTUy5Ob3JtYWxpemF0aW9ucy5yZWdpc3RlcmVkW3Byb3BlcnR5XShcIm5hbWVcIiwgZWxlbWVudCk7XG5cbiAgICAgICAgICAgICAgICAvKiBUcmFuc2Zvcm0gdmFsdWVzIGFyZSBjYWxjdWxhdGVkIHZpYSBub3JtYWxpemF0aW9uIGV4dHJhY3Rpb24gKHNlZSBiZWxvdyksIHdoaWNoIGNoZWNrcyBhZ2FpbnN0IHRoZSBlbGVtZW50J3MgdHJhbnNmb3JtQ2FjaGUuIEF0IG5vIHBvaW50IGRvIHRyYW5zZm9ybSBHRVRzIGV2ZXIgYWN0dWFsbHkgcXVlcnkgdGhlIERPTTsgaW5pdGlhbCBzdHlsZXNoZWV0IHZhbHVlcyBhcmUgbmV2ZXIgcHJvY2Vzc2VkLlxuICAgICAgICAgICAgICAgICAgIFRoaXMgaXMgYmVjYXVzZSBwYXJzaW5nIDNEIHRyYW5zZm9ybSBtYXRyaWNlcyBpcyBub3QgYWx3YXlzIGFjY3VyYXRlIGFuZCB3b3VsZCBibG9hdCBvdXIgY29kZWJhc2U7IHRodXMsIG5vcm1hbGl6YXRpb24gZXh0cmFjdGlvbiBkZWZhdWx0cyBpbml0aWFsIHRyYW5zZm9ybSB2YWx1ZXMgdG8gdGhlaXIgemVyby12YWx1ZXMgKGUuZy4gMSBmb3Igc2NhbGVYIGFuZCAwIGZvciB0cmFuc2xhdGVYKS4gKi9cbiAgICAgICAgICAgICAgICBpZiAobm9ybWFsaXplZFByb3BlcnR5TmFtZSAhPT0gXCJ0cmFuc2Zvcm1cIikge1xuICAgICAgICAgICAgICAgICAgICBub3JtYWxpemVkUHJvcGVydHlWYWx1ZSA9IGNvbXB1dGVQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIENTUy5OYW1lcy5wcmVmaXhDaGVjayhub3JtYWxpemVkUHJvcGVydHlOYW1lKVswXSk7IC8qIEdFVCAqL1xuXG4gICAgICAgICAgICAgICAgICAgIC8qIElmIHRoZSB2YWx1ZSBpcyBhIENTUyBudWxsLXZhbHVlIGFuZCB0aGlzIHByb3BlcnR5IGhhcyBhIGhvb2sgdGVtcGxhdGUsIHVzZSB0aGF0IHplcm8tdmFsdWUgdGVtcGxhdGUgc28gdGhhdCBob29rcyBjYW4gYmUgZXh0cmFjdGVkIGZyb20gaXQuICovXG4gICAgICAgICAgICAgICAgICAgIGlmIChDU1MuVmFsdWVzLmlzQ1NTTnVsbFZhbHVlKG5vcm1hbGl6ZWRQcm9wZXJ0eVZhbHVlKSAmJiBDU1MuSG9va3MudGVtcGxhdGVzW3Byb3BlcnR5XSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbm9ybWFsaXplZFByb3BlcnR5VmFsdWUgPSBDU1MuSG9va3MudGVtcGxhdGVzW3Byb3BlcnR5XVsxXTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHByb3BlcnR5VmFsdWUgPSBDU1MuTm9ybWFsaXphdGlvbnMucmVnaXN0ZXJlZFtwcm9wZXJ0eV0oXCJleHRyYWN0XCIsIGVsZW1lbnQsIG5vcm1hbGl6ZWRQcm9wZXJ0eVZhbHVlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLyogSWYgYSB2YWx1ZSB3YXNuJ3QgcHJvZHVjZWQgdmlhIGhvb2sgZXh0cmFjdGlvbiBvciBub3JtYWxpemF0aW9uLCBxdWVyeSB0aGUgRE9NLiAqL1xuICAgICAgICAgICAgaWYgKCEvXltcXGQtXS8udGVzdChwcm9wZXJ0eVZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHByb3BlcnR5VmFsdWUgPSBjb21wdXRlUHJvcGVydHlWYWx1ZShlbGVtZW50LCBDU1MuTmFtZXMucHJlZml4Q2hlY2socHJvcGVydHkpWzBdKTsgLyogR0VUICovXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8qIFNpbmNlIHByb3BlcnR5IGxvb2t1cHMgYXJlIGZvciBhbmltYXRpb24gcHVycG9zZXMgKHdoaWNoIGVudGFpbHMgY29tcHV0aW5nIHRoZSBudW1lcmljIGRlbHRhIGJldHdlZW4gc3RhcnQgYW5kIGVuZCB2YWx1ZXMpLCBjb252ZXJ0IENTUyBudWxsLXZhbHVlcyB0byBhbiBpbnRlZ2VyIG9mIHZhbHVlIDAuICovXG4gICAgICAgICAgICBpZiAoQ1NTLlZhbHVlcy5pc0NTU051bGxWYWx1ZShwcm9wZXJ0eVZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHByb3BlcnR5VmFsdWUgPSAwO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoVmVsb2NpdHkuZGVidWcgPj0gMikgY29uc29sZS5sb2coXCJHZXQgXCIgKyBwcm9wZXJ0eSArIFwiOiBcIiArIHByb3BlcnR5VmFsdWUpO1xuXG4gICAgICAgICAgICByZXR1cm4gcHJvcGVydHlWYWx1ZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKiBUaGUgc2luZ3VsYXIgc2V0UHJvcGVydHlWYWx1ZSwgd2hpY2ggcm91dGVzIHRoZSBsb2dpYyBmb3IgYWxsIG5vcm1hbGl6YXRpb25zLCBob29rcywgYW5kIHN0YW5kYXJkIENTUyBwcm9wZXJ0aWVzLiAqL1xuICAgICAgICBzZXRQcm9wZXJ0eVZhbHVlOiBmdW5jdGlvbihlbGVtZW50LCBwcm9wZXJ0eSwgcHJvcGVydHlWYWx1ZSwgcm9vdFByb3BlcnR5VmFsdWUsIHNjcm9sbERhdGEpIHtcbiAgICAgICAgICAgIHZhciBwcm9wZXJ0eU5hbWUgPSBwcm9wZXJ0eTtcblxuICAgICAgICAgICAgLyogSW4gb3JkZXIgdG8gYmUgc3ViamVjdGVkIHRvIGNhbGwgb3B0aW9ucyBhbmQgZWxlbWVudCBxdWV1ZWluZywgc2Nyb2xsIGFuaW1hdGlvbiBpcyByb3V0ZWQgdGhyb3VnaCBWZWxvY2l0eSBhcyBpZiBpdCB3ZXJlIGEgc3RhbmRhcmQgQ1NTIHByb3BlcnR5LiAqL1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5ID09PSBcInNjcm9sbFwiKSB7XG4gICAgICAgICAgICAgICAgLyogSWYgYSBjb250YWluZXIgb3B0aW9uIGlzIHByZXNlbnQsIHNjcm9sbCB0aGUgY29udGFpbmVyIGluc3RlYWQgb2YgdGhlIGJyb3dzZXIgd2luZG93LiAqL1xuICAgICAgICAgICAgICAgIGlmIChzY3JvbGxEYXRhLmNvbnRhaW5lcikge1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGxEYXRhLmNvbnRhaW5lcltcInNjcm9sbFwiICsgc2Nyb2xsRGF0YS5kaXJlY3Rpb25dID0gcHJvcGVydHlWYWx1ZTtcbiAgICAgICAgICAgICAgICAvKiBPdGhlcndpc2UsIFZlbG9jaXR5IGRlZmF1bHRzIHRvIHNjcm9sbGluZyB0aGUgYnJvd3NlciB3aW5kb3cuICovXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNjcm9sbERhdGEuZGlyZWN0aW9uID09PSBcIkxlZnRcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LnNjcm9sbFRvKHByb3BlcnR5VmFsdWUsIHNjcm9sbERhdGEuYWx0ZXJuYXRlVmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LnNjcm9sbFRvKHNjcm9sbERhdGEuYWx0ZXJuYXRlVmFsdWUsIHByb3BlcnR5VmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvKiBUcmFuc2Zvcm1zICh0cmFuc2xhdGVYLCByb3RhdGVaLCBldGMuKSBhcmUgYXBwbGllZCB0byBhIHBlci1lbGVtZW50IHRyYW5zZm9ybUNhY2hlIG9iamVjdCwgd2hpY2ggaXMgbWFudWFsbHkgZmx1c2hlZCB2aWEgZmx1c2hUcmFuc2Zvcm1DYWNoZSgpLiBUaHVzLCBmb3Igbm93LCB3ZSBtZXJlbHkgY2FjaGUgdHJhbnNmb3JtcyBiZWluZyBTRVQuICovXG4gICAgICAgICAgICAgICAgaWYgKENTUy5Ob3JtYWxpemF0aW9ucy5yZWdpc3RlcmVkW3Byb3BlcnR5XSAmJiBDU1MuTm9ybWFsaXphdGlvbnMucmVnaXN0ZXJlZFtwcm9wZXJ0eV0oXCJuYW1lXCIsIGVsZW1lbnQpID09PSBcInRyYW5zZm9ybVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIC8qIFBlcmZvcm0gYSBub3JtYWxpemF0aW9uIGluamVjdGlvbi4gKi9cbiAgICAgICAgICAgICAgICAgICAgLyogTm90ZTogVGhlIG5vcm1hbGl6YXRpb24gbG9naWMgaGFuZGxlcyB0aGUgdHJhbnNmb3JtQ2FjaGUgdXBkYXRpbmcuICovXG4gICAgICAgICAgICAgICAgICAgIENTUy5Ob3JtYWxpemF0aW9ucy5yZWdpc3RlcmVkW3Byb3BlcnR5XShcImluamVjdFwiLCBlbGVtZW50LCBwcm9wZXJ0eVZhbHVlKTtcblxuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eU5hbWUgPSBcInRyYW5zZm9ybVwiO1xuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVZhbHVlID0gRGF0YShlbGVtZW50KS50cmFuc2Zvcm1DYWNoZVtwcm9wZXJ0eV07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLyogSW5qZWN0IGhvb2tzLiAqL1xuICAgICAgICAgICAgICAgICAgICBpZiAoQ1NTLkhvb2tzLnJlZ2lzdGVyZWRbcHJvcGVydHldKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgaG9va05hbWUgPSBwcm9wZXJ0eSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBob29rUm9vdCA9IENTUy5Ib29rcy5nZXRSb290KHByb3BlcnR5KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLyogSWYgYSBjYWNoZWQgcm9vdFByb3BlcnR5VmFsdWUgd2FzIG5vdCBwcm92aWRlZCwgcXVlcnkgdGhlIERPTSBmb3IgdGhlIGhvb2tSb290J3MgY3VycmVudCB2YWx1ZS4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIHJvb3RQcm9wZXJ0eVZhbHVlID0gcm9vdFByb3BlcnR5VmFsdWUgfHwgQ1NTLmdldFByb3BlcnR5VmFsdWUoZWxlbWVudCwgaG9va1Jvb3QpOyAvKiBHRVQgKi9cblxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlWYWx1ZSA9IENTUy5Ib29rcy5pbmplY3RWYWx1ZShob29rTmFtZSwgcHJvcGVydHlWYWx1ZSwgcm9vdFByb3BlcnR5VmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHkgPSBob29rUm9vdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8qIE5vcm1hbGl6ZSBuYW1lcyBhbmQgdmFsdWVzLiAqL1xuICAgICAgICAgICAgICAgICAgICBpZiAoQ1NTLk5vcm1hbGl6YXRpb25zLnJlZ2lzdGVyZWRbcHJvcGVydHldKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eVZhbHVlID0gQ1NTLk5vcm1hbGl6YXRpb25zLnJlZ2lzdGVyZWRbcHJvcGVydHldKFwiaW5qZWN0XCIsIGVsZW1lbnQsIHByb3BlcnR5VmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJvcGVydHkgPSBDU1MuTm9ybWFsaXphdGlvbnMucmVnaXN0ZXJlZFtwcm9wZXJ0eV0oXCJuYW1lXCIsIGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLyogQXNzaWduIHRoZSBhcHByb3ByaWF0ZSB2ZW5kb3IgcHJlZml4IGJlZm9yZSBwZXJmb3JtIGFuIG9mZmljaWFsIHN0eWxlIHVwZGF0ZS4gKi9cbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlOYW1lID0gQ1NTLk5hbWVzLnByZWZpeENoZWNrKHByb3BlcnR5KVswXTtcblxuICAgICAgICAgICAgICAgICAgICAvKiBBIHRyeS9jYXRjaCBpcyB1c2VkIGZvciBJRTw9OCwgd2hpY2ggdGhyb3dzIGFuIGVycm9yIHdoZW4gXCJpbnZhbGlkXCIgQ1NTIHZhbHVlcyBhcmUgc2V0LCBlLmcuIGEgbmVnYXRpdmUgd2lkdGguIFRyeS9jYXRjaCBpcyBhdm9pZGVkIGZvciBvdGhlciBicm93c2VycyBzaW5jZSBpdCBpbmN1cnMgYSBwZXJmb3JtYW5jZSBvdmVyaGVhZC4gKi9cbiAgICAgICAgICAgICAgICAgICAgaWYgKElFIDw9IDgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZVtwcm9wZXJ0eU5hbWVdID0gcHJvcGVydHlWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHsgY29uc29sZS5sb2coXCJFcnJvciBzZXR0aW5nIFtcIiArIHByb3BlcnR5TmFtZSArIFwiXSB0byBbXCIgKyBwcm9wZXJ0eVZhbHVlICsgXCJdXCIpOyB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlW3Byb3BlcnR5TmFtZV0gPSBwcm9wZXJ0eVZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKFZlbG9jaXR5LmRlYnVnID49IDIpIGNvbnNvbGUubG9nKFwiU2V0IFwiICsgcHJvcGVydHkgKyBcIiAoXCIgKyBwcm9wZXJ0eU5hbWUgKyBcIik6IFwiICsgcHJvcGVydHlWYWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvKiBSZXR1cm4gdGhlIG5vcm1hbGl6ZWQgcHJvcGVydHkgbmFtZSBhbmQgdmFsdWUgaW4gY2FzZSB0aGUgY2FsbGVyIHdhbnRzIHRvIGtub3cgaG93IHRoZXNlIHZhbHVlcyB3ZXJlIG1vZGlmaWVkIGJlZm9yZSBiZWluZyBhcHBsaWVkIHRvIHRoZSBET00uICovXG4gICAgICAgICAgICByZXR1cm4gWyBwcm9wZXJ0eU5hbWUsIHByb3BlcnR5VmFsdWUgXTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKiBUbyBpbmNyZWFzZSBwZXJmb3JtYW5jZSBieSBiYXRjaGluZyB0cmFuc2Zvcm0gdXBkYXRlcyBpbnRvIGEgc2luZ2xlIFNFVCwgdHJhbnNmb3JtcyBhcmUgbm90IGRpcmVjdGx5IGFwcGxpZWQgdG8gYW4gZWxlbWVudCB1bnRpbCBmbHVzaFRyYW5zZm9ybUNhY2hlKCkgaXMgY2FsbGVkLiAqL1xuICAgICAgICAvKiBOb3RlOiBWZWxvY2l0eSBkb2VzIG5vdCBhcHBseSB0cmFuc2Zvcm0gdmFsdWVzIGluIHRoZSBzYW1lIG9yZGVyIHRoYXQgdGhleSB3ZXJlIGRlZmluZWQgaW4gdGhlIGNhbGwncyBwcm9wZXJ0eSBtYXAuIERvaW5nIHNvIHdvdWxkIGJlY29tZSBwcm9ibGVtYXRpYyBzaW5jZSB0aGVyZSdkXG4gICAgICAgICAgIGJlIG5vIGluZGljYXRpb24gb2YgaG93IGFuIGVsZW1lbnQncyBleGlzdGluZyB0cmFuc2Zvcm1zIHNob3VsZCBiZSByZS1vcmRlcmVkIGFsb25nIHdpdGggdGhlIG5ldyBvbmVzLiAqL1xuICAgICAgICBmbHVzaFRyYW5zZm9ybUNhY2hlOiBmdW5jdGlvbihlbGVtZW50KSB7XG4gICAgICAgICAgICB2YXIgdHJhbnNmb3JtU3RyaW5nID0gXCJcIixcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm1OYW1lLFxuICAgICAgICAgICAgICAgIHRyYW5zZm9ybVZhbHVlLFxuICAgICAgICAgICAgICAgIHBlcnNwZWN0aXZlO1xuXG4gICAgICAgICAgICAvKiBUcmFuc2Zvcm0gcHJvcGVydGllcyBhcmUgc3RvcmVkIGFzIG1lbWJlcnMgb2YgdGhlIHRyYW5zZm9ybUNhY2hlIG9iamVjdC4gQ29uY2F0ZW5hdGUgYWxsIHRoZSBtZW1iZXJzIGludG8gYSBzdHJpbmcuICovXG4gICAgICAgICAgICBmb3IgKHRyYW5zZm9ybU5hbWUgaW4gRGF0YShlbGVtZW50KS50cmFuc2Zvcm1DYWNoZSkge1xuICAgICAgICAgICAgICAgIHRyYW5zZm9ybVZhbHVlID0gRGF0YShlbGVtZW50KS50cmFuc2Zvcm1DYWNoZVt0cmFuc2Zvcm1OYW1lXTtcblxuICAgICAgICAgICAgICAgIC8qIFRyYW5zZm9ybSdzIHBlcnNwZWN0aXZlIHN1YnByb3BlcnR5IG11c3QgYmUgc2V0IGZpcnN0IGluIG9yZGVyIHRvIHRha2UgZWZmZWN0LiBXZSBzdG9yZSBpdCBmb3Igbm93LiAqL1xuICAgICAgICAgICAgICAgIGlmICh0cmFuc2Zvcm1OYW1lID09PSBcInRyYW5zZm9ybVBlcnNwZWN0aXZlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcGVyc3BlY3RpdmUgPSB0cmFuc2Zvcm1WYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLyogSUU5IG9ubHkgc3VwcG9ydHMgb25lIHJvdGF0aW9uIHR5cGUsIHJvdGF0ZVosIHdoaWNoIGl0IHJlZmVycyB0byBhcyBcInJvdGF0ZVwiLiAqL1xuICAgICAgICAgICAgICAgIGlmIChJRSA9PT0gOSAmJiB0cmFuc2Zvcm1OYW1lID09PSBcInJvdGF0ZVpcIikge1xuICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm1OYW1lID0gXCJyb3RhdGVcIjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm1TdHJpbmcgKz0gdHJhbnNmb3JtTmFtZSArIHRyYW5zZm9ybVZhbHVlICsgXCIgXCI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8qIElmIHByZXNlbnQsIHNldCB0aGUgcGVyc3BlY3RpdmUgc3VicHJvcGVydHkgZmlyc3QuICovXG4gICAgICAgICAgICBpZiAocGVyc3BlY3RpdmUpIHtcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm1TdHJpbmcgPSBcInBlcnNwZWN0aXZlXCIgKyBwZXJzcGVjdGl2ZSArIFwiIFwiICsgdHJhbnNmb3JtU3RyaW5nO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBDU1Muc2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcInRyYW5zZm9ybVwiLCB0cmFuc2Zvcm1TdHJpbmcpO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8qIFJlZ2lzdGVyIGhvb2tzIGFuZCBub3JtYWxpemF0aW9ucy4gKi9cbiAgICBDU1MuSG9va3MucmVnaXN0ZXIoKTtcbiAgICBDU1MuTm9ybWFsaXphdGlvbnMucmVnaXN0ZXIoKTtcblxuICAgIC8qKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgVmVsb2NpdHkuYW5pbWF0ZVxuICAgICoqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICBWZWxvY2l0eS5hbmltYXRlID0gZnVuY3Rpb24oKSB7XG5cbiAgICAgICAgLyoqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgIFJldHVybiBDaGFpblxuICAgICAgICAqKioqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgIC8qIFJldHVybnMgdGhlIGFwcHJvcHJpYXRlIGVsZW1lbnQgc2V0IHR5cGUgKGRlcGVuZGluZyBvbiB3aGV0aGVyIGpRdWVyeS9aZXB0by13cmFwcGVkIGVsZW1lbnRzIHdlcmUgcGFzc2VkIGluKSBiYWNrIHRvIHRoZSBjYWxsIGNoYWluLiBVc2VkIGZvciBleGl0aW5nIG91dCBvZiBWZWxvY2l0eS5hbmltYXRlKCkuICovXG4gICAgICAgIGZ1bmN0aW9uIGdldENoYWluICgpIHtcbiAgICAgICAgICAgIHJldHVybiBlbGVtZW50c1dyYXBwZWQgfHwgZWxlbWVudHM7XG4gICAgICAgIH1cblxuICAgICAgICAvKioqKioqKioqKioqKioqKioqKioqKioqKlxuICAgICAgICAgICBBcmd1bWVudHMgQXNzaWdubWVudFxuICAgICAgICAqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgIC8qIFRvIGFsbG93IGZvciBleHByZXNzaXZlIENvZmZlZVNjcmlwdCBjb2RlLCBWZWxvY2l0eSBzdXBwb3J0cyBhbiBhbHRlcm5hdGl2ZSBzeW50YXggaW4gd2hpY2ggXCJwcm9wZXJ0aWVzXCIgYW5kIFwib3B0aW9uc1wiIG9iamVjdHMgYXJlIGRlZmluZWQgb24gYSBjb250YWluZXIgb2JqZWN0IHRoYXQncyBwYXNzZWQgaW4gYXMgVmVsb2NpdHkncyBzb2xlIGFyZ3VtZW50LiAqL1xuICAgICAgICAvKiBOb3RlOiBTb21lIGJyb3dzZXJzIGF1dG9tYXRpY2FsbHkgcG9wdWxhdGUgYXJndW1lbnRzIHdpdGggYSBcInByb3BlcnRpZXNcIiBvYmplY3QuIFdlIGRldGVjdCBpdCBieSBjaGVja2luZyBmb3IgaXRzIGRlZmF1bHQgXCJuYW1lc1wiIHByb3BlcnR5LiAqL1xuICAgICAgICB2YXIgc3ludGFjdGljU3VnYXIgPSAoYXJndW1lbnRzWzBdICYmICgoJC5pc1BsYWluT2JqZWN0KGFyZ3VtZW50c1swXS5wcm9wZXJ0aWVzKSAmJiAhYXJndW1lbnRzWzBdLnByb3BlcnRpZXMubmFtZXMpIHx8IFR5cGUuaXNTdHJpbmcoYXJndW1lbnRzWzBdLnByb3BlcnRpZXMpKSksXG4gICAgICAgICAgICAvKiBXaGVuIFZlbG9jaXR5IGlzIGNhbGxlZCB2aWEgdGhlIHV0aWxpdHkgZnVuY3Rpb24gKCQuVmVsb2NpdHkuYW5pbWF0ZSgpL1ZlbG9jaXR5LmFuaW1hdGUoKSksIGVsZW1lbnRzIGFyZSBleHBsaWNpdGx5IHBhc3NlZCBpbiBhcyB0aGUgZmlyc3QgcGFyYW1ldGVyLiBUaHVzLCBhcmd1bWVudCBwb3NpdGlvbmluZyB2YXJpZXMuIFdlIG5vcm1hbGl6ZSB0aGVtIGhlcmUuICovXG4gICAgICAgICAgICBlbGVtZW50c1dyYXBwZWQsXG4gICAgICAgICAgICBhcmd1bWVudEluZGV4O1xuXG4gICAgICAgIHZhciBlbGVtZW50cyxcbiAgICAgICAgICAgIHByb3BlcnRpZXNNYXAsXG4gICAgICAgICAgICBvcHRpb25zO1xuXG4gICAgICAgIC8qIERldGVjdCBqUXVlcnkvWmVwdG8gZWxlbWVudHMgYmVpbmcgYW5pbWF0ZWQgdmlhIHRoZSAkLmZuIG1ldGhvZC4gKi9cbiAgICAgICAgaWYgKFR5cGUuaXNXcmFwcGVkKHRoaXMpKSB7XG4gICAgICAgICAgICBhcmd1bWVudEluZGV4ID0gMDtcbiAgICAgICAgICAgIGVsZW1lbnRzID0gdGhpcztcbiAgICAgICAgICAgIGVsZW1lbnRzV3JhcHBlZCA9IHRoaXM7XG4gICAgICAgIC8qIE90aGVyd2lzZSwgcmF3IGVsZW1lbnRzIGFyZSBiZWluZyBhbmltYXRlZCB2aWEgdGhlIHV0aWxpdHkgZnVuY3Rpb24uICovXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhcmd1bWVudEluZGV4ID0gMTtcbiAgICAgICAgICAgIGVsZW1lbnRzID0gc3ludGFjdGljU3VnYXIgPyBhcmd1bWVudHNbMF0uZWxlbWVudHMgOiBhcmd1bWVudHNbMF07XG4gICAgICAgIH1cblxuICAgICAgICBlbGVtZW50cyA9IFR5cGUuaXNXcmFwcGVkKGVsZW1lbnRzKSA/IFtdLnNsaWNlLmNhbGwoZWxlbWVudHMpIDogZWxlbWVudHM7XG5cbiAgICAgICAgaWYgKCFlbGVtZW50cykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN5bnRhY3RpY1N1Z2FyKSB7XG4gICAgICAgICAgICBwcm9wZXJ0aWVzTWFwID0gYXJndW1lbnRzWzBdLnByb3BlcnRpZXM7XG4gICAgICAgICAgICBvcHRpb25zID0gYXJndW1lbnRzWzBdLm9wdGlvbnM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm9wZXJ0aWVzTWFwID0gYXJndW1lbnRzW2FyZ3VtZW50SW5kZXhdO1xuICAgICAgICAgICAgb3B0aW9ucyA9IGFyZ3VtZW50c1thcmd1bWVudEluZGV4ICsgMV07XG4gICAgICAgIH1cblxuICAgICAgICAvKiBUaGUgbGVuZ3RoIG9mIHRoZSBlbGVtZW50IHNldCAoaW4gdGhlIGZvcm0gb2YgYSBub2RlTGlzdCBvciBhbiBhcnJheSBvZiBlbGVtZW50cykgaXMgZGVmYXVsdGVkIHRvIDEgaW4gY2FzZSBhIHNpbmdsZSByYXcgRE9NIGVsZW1lbnQgaXMgcGFzc2VkIGluICh3aGljaCBkb2Vzbid0IGNvbnRhaW4gYSBsZW5ndGggcHJvcGVydHkpLiAqL1xuICAgICAgICB2YXIgZWxlbWVudHNMZW5ndGggPSAoVHlwZS5pc0FycmF5KGVsZW1lbnRzKSB8fCBUeXBlLmlzTm9kZUxpc3QoZWxlbWVudHMpKSA/IGVsZW1lbnRzLmxlbmd0aCA6IDEsXG4gICAgICAgICAgICBlbGVtZW50c0luZGV4ID0gMDtcblxuICAgICAgICAvKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICBBcmd1bWVudCBPdmVybG9hZGluZ1xuICAgICAgICAqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgLyogU3VwcG9ydCBpcyBpbmNsdWRlZCBmb3IgalF1ZXJ5J3MgYXJndW1lbnQgb3ZlcmxvYWRpbmc6ICQuYW5pbWF0ZShwcm9wZXJ0eU1hcCBbLCBkdXJhdGlvbl0gWywgZWFzaW5nXSBbLCBjb21wbGV0ZV0pLiBPdmVybG9hZGluZyBpcyBkZXRlY3RlZCBieSBjaGVja2luZyBmb3IgdGhlIGFic2VuY2Ugb2YgYW4gb2JqZWN0IGJlaW5nIHBhc3NlZCBpbnRvIG9wdGlvbnMuICovXG4gICAgICAgIC8qIE5vdGU6IFRoZSBzdG9wIGFjdGlvbiBkb2VzIG5vdCBhY2NlcHQgYW5pbWF0aW9uIG9wdGlvbnMsIGFuZCBpcyB0aGVyZWZvcmUgZXhjbHVkZWQgZnJvbSB0aGlzIGNoZWNrLiAqL1xuICAgICAgICAvKiBOb3RlOiBBbHRob3VnaCBhcmd1bWVudCBvdmVybG9hZGluZyBpcyBhIHNsb3BweSBwcmFjdGljZSBpbiBKYXZhU2NyaXB0LCBzdXBwb3J0IGlzIGluY2x1ZGVkIHNvIHRoYXQgdmVsb2NpdHkoKSBjYW4gYWN0IGFzIGEgZHJvcC1pbiByZXBsYWNlbWVudCBmb3IgalF1ZXJ5J3MgJC5hbmltYXRlKCkuICovXG4gICAgICAgIGlmIChwcm9wZXJ0aWVzTWFwICE9PSBcInN0b3BcIiAmJiAhJC5pc1BsYWluT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAvKiBUaGUgdXRpbGl0eSBmdW5jdGlvbiBzaGlmdHMgYWxsIGFyZ3VtZW50cyBvbmUgcG9zaXRpb24gdG8gdGhlIHJpZ2h0LCBzbyB3ZSBhZGp1c3QgZm9yIHRoYXQgb2Zmc2V0LiAqL1xuICAgICAgICAgICAgdmFyIHN0YXJ0aW5nQXJndW1lbnRQb3NpdGlvbiA9IGFyZ3VtZW50SW5kZXggKyAxO1xuXG4gICAgICAgICAgICBvcHRpb25zID0ge307XG5cbiAgICAgICAgICAgIC8qIEl0ZXJhdGUgdGhyb3VnaCBhbGwgb3B0aW9ucyBhcmd1bWVudHMgKi9cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSBzdGFydGluZ0FyZ3VtZW50UG9zaXRpb247IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAvKiBUcmVhdCBhIG51bWJlciBhcyBhIGR1cmF0aW9uLiBQYXJzZSBpdCBvdXQuICovXG4gICAgICAgICAgICAgICAgLyogTm90ZTogVGhlIGZvbGxvd2luZyBSZWdFeCB3aWxsIHJldHVybiB0cnVlIGlmIHBhc3NlZCBhbiBhcnJheSB3aXRoIGEgbnVtYmVyIGFzIGl0cyBmaXJzdCBpdGVtLiBUaHVzLCBhcnJheXMgYXJlIHNraXBwZWQgZnJvbSB0aGlzIGNoZWNrLiAqL1xuICAgICAgICAgICAgICAgIGlmICghVHlwZS5pc0FycmF5KGFyZ3VtZW50c1tpXSkgJiYgL15cXGQvLnRlc3QoYXJndW1lbnRzW2ldKSkge1xuICAgICAgICAgICAgICAgICAgICBvcHRpb25zLmR1cmF0aW9uID0gcGFyc2VGbG9hdChhcmd1bWVudHNbaV0pO1xuICAgICAgICAgICAgICAgIC8qIFRyZWF0IGEgc3RyaW5nIGFzIGFuIGVhc2luZy4gQWxzbyB0cmVhdCBvbmUtaXRlbSAoc3RlcHMpLCB0d28taXRlbSAodGVuc2lvbiwgZnJpY3Rpb24pLCBhbmQgZm91ci1pdGVtIChjdWJpYyBiZXppZXIgcG9pbnRzKSBhcnJheXMgYXMgYW4gZWFzaW5nLiAqL1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoVHlwZS5pc1N0cmluZyhhcmd1bWVudHNbaV0pIHx8IChUeXBlLmlzQXJyYXkoYXJndW1lbnRzW2ldKSAmJiAoYXJndW1lbnRzW2ldLmxlbmd0aCA9PT0gMSB8fCBhcmd1bWVudHNbaV0ubGVuZ3RoID09PSAyIHx8IGFyZ3VtZW50c1tpXS5sZW5ndGggPT09IDQpKSkge1xuICAgICAgICAgICAgICAgICAgICBvcHRpb25zLmVhc2luZyA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgICAgICAgICAvKiBUcmVhdCBhIGZ1bmN0aW9uIGFzIGEgY29tcGxldGUgY2FsbGJhY2suICovXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChUeXBlLmlzRnVuY3Rpb24oYXJndW1lbnRzW2ldKSkge1xuICAgICAgICAgICAgICAgICAgICBvcHRpb25zLmNvbXBsZXRlID0gYXJndW1lbnRzW2ldO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8qKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgQWN0aW9uIERldGVjdGlvblxuICAgICAgICAqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgLyogVmVsb2NpdHkncyBiZWhhdmlvciBpcyBjYXRlZ29yaXplZCBpbnRvIFwiYWN0aW9uc1wiOiBFbGVtZW50cyBjYW4gZWl0aGVyIGJlIHNwZWNpYWxseSBzY3JvbGxlZCBpbnRvIHZpZXcsIG9yIHRoZXkgY2FuIGJlIHN0YXJ0ZWQsIHN0b3BwZWQsIG9yIHJldmVyc2VkLiBJZiBhIGxpdGVyYWwgb3IgcmVmZXJlbmNlZCBwcm9wZXJ0aWVzIG1hcCBpcyBwYXNzZWRcbiAgICAgICAgICAgaW4gYXMgVmVsb2NpdHkncyBmaXJzdCBhcmd1bWVudCwgdGhlIGFzc29jaWF0ZWQgYWN0aW9uIGlzIFwic3RhcnRcIi4gQWx0ZXJuYXRpdmVseSwgXCJzY3JvbGxcIiwgXCJyZXZlcnNlXCIsIG9yIFwic3RvcFwiIGNhbiBiZSBwYXNzZWQgaW4gaW5zdGVhZCBvZiBhIHByb3BlcnRpZXMgbWFwLiAqL1xuICAgICAgICB2YXIgYWN0aW9uO1xuXG4gICAgICAgIHN3aXRjaCAocHJvcGVydGllc01hcCkge1xuICAgICAgICAgICAgY2FzZSBcInNjcm9sbFwiOlxuICAgICAgICAgICAgICAgIGFjdGlvbiA9IFwic2Nyb2xsXCI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJyZXZlcnNlXCI6XG4gICAgICAgICAgICAgICAgYWN0aW9uID0gXCJyZXZlcnNlXCI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgXCJzdG9wXCI6XG4gICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgICAgICAgQWN0aW9uOiBTdG9wXG4gICAgICAgICAgICAgICAgKioqKioqKioqKioqKioqKioqKi9cblxuICAgICAgICAgICAgICAgIHZhciBjYWxsc1RvU3RvcCA9IFtdO1xuXG4gICAgICAgICAgICAgICAgLyogV2hlbiB0aGUgc3RvcCBhY3Rpb24gaXMgdHJpZ2dlcmVkLCB0aGUgZWxlbWVudHMnIGN1cnJlbnRseSBhY3RpdmUgY2FsbCBpcyBpbW1lZGlhdGVseSBzdG9wcGVkLiBUaGUgYWN0aXZlIGNhbGwgbWlnaHQgaGF2ZSBiZWVuIGFwcGxpZWQgdG8gbXVsdGlwbGUgZWxlbWVudHMsIGluIHdoaWNoXG4gICAgICAgICAgICAgICAgICAgY2FzZSBhbGwgb2YgdGhlIGNhbGwncyBlbGVtZW50cyB3aWxsIGJlIHN1YmplY3RlZCB0byBzdG9wcGluZy4gV2hlbiBhbiBlbGVtZW50IGlzIHN0b3BwZWQsIHRoZSBuZXh0IGl0ZW0gaW4gaXRzIGFuaW1hdGlvbiBxdWV1ZSBpcyBpbW1lZGlhdGVseSB0cmlnZ2VyZWQuICovXG4gICAgICAgICAgICAgICAgLyogQW4gYWRkaXRpb25hbCBhcmd1bWVudCBtYXkgYmUgcGFzc2VkIGluIHRvIGNsZWFyIGFuIGVsZW1lbnQncyByZW1haW5pbmcgcXVldWVkIGNhbGxzLiBFaXRoZXIgdHJ1ZSAod2hpY2ggZGVmYXVsdHMgdG8gdGhlIFwiZnhcIiBxdWV1ZSkgb3IgYSBjdXN0b20gcXVldWUgc3RyaW5nIGNhbiBiZSBwYXNzZWQgaW4uICovXG4gICAgICAgICAgICAgICAgLyogU3RvcHBpbmcgaXMgYWNoaWV2ZWQgYnkgdHJhdmVyc2luZyBhY3RpdmUgY2FsbHMgZm9yIHRob3NlIHdoaWNoIGNvbnRhaW4gdGhlIHRhcmdldGVkIGVsZW1lbnQuICovXG4gICAgICAgICAgICAgICAgLyogTm90ZTogVGhlIHN0b3AgY29tbWFuZCBydW5zIHByaW9yIHRvIFF1ZXVlaW5nIHNpbmNlIGl0cyBiZWhhdmlvciBpcyBpbnRlbmRlZCB0byB0YWtlIGVmZmVjdCAqaW1tZWRpYXRlbHkqLCByZWdhcmRsZXNzIG9mIHRoZSBlbGVtZW50J3MgY3VycmVudCBxdWV1ZSBzdGF0ZS4gKi9cbiAgICAgICAgICAgICAgICAkLmVhY2goVmVsb2NpdHkuU3RhdGUuY2FsbHMsIGZ1bmN0aW9uKGksIGFjdGl2ZUNhbGwpIHsgIFxuICAgICAgICAgICAgICAgICAgICAvKiBJbmFjdGl2ZSBjYWxscyBhcmUgc2V0IHRvIGZhbHNlIGJ5IHRoZSBsb2dpYyBpbnNpZGUgY29tcGxldGVDYWxsKCkuIFNraXAgdGhlbS4gKi9cbiAgICAgICAgICAgICAgICAgICAgaWYgKGFjdGl2ZUNhbGwgIT09IGZhbHNlKSB7ICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgLyogSWYgd2UncmUgb3BlcmF0aW5nIG9uIGEgc2luZ2xlIGVsZW1lbnQsIHdyYXAgaXQgaW4gYW4gYXJyYXkgc28gdGhhdCAkLmVhY2goKSBjYW4gaXRlcmF0ZSBvdmVyIGl0LiAqLyAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgJC5lYWNoKGFjdGl2ZUNhbGxbMV0ubm9kZVR5cGUgPyBbIGFjdGl2ZUNhbGxbMV0gXSA6IGFjdGl2ZUNhbGxbMV0sIGZ1bmN0aW9uKGssIGFjdGl2ZUVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAkLmVhY2goZWxlbWVudHMubm9kZVR5cGUgPyBbIGVsZW1lbnRzIF0gOiBlbGVtZW50cywgZnVuY3Rpb24obCwgZWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBDaGVjayB0aGF0IHRoaXMgY2FsbCB3YXMgYXBwbGllZCB0byB0aGUgdGFyZ2V0IGVsZW1lbnQuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlbGVtZW50ID09PSBhY3RpdmVFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoRGF0YShlbGVtZW50KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIFNpbmNlIFwicmV2ZXJzZVwiIHVzZXMgY2FjaGVkIHN0YXJ0IHZhbHVlcyAodGhlIHByZXZpb3VzIGNhbGwncyBlbmRWYWx1ZXMpLCB0aGVzZSB2YWx1ZXMgbXVzdCBiZSBjaGFuZ2VkIHRvIHJlZmxlY3QgdGhlIGZpbmFsIHZhbHVlIHRoYXQgdGhlIGVsZW1lbnRzIHdlcmUgYWN0dWFsbHkgdHdlZW5lZCB0by4gKi8gXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJC5lYWNoKERhdGEoZWxlbWVudCkudHdlZW5zQ29udGFpbmVyLCBmdW5jdGlvbihtLCBhY3RpdmVUd2Vlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY3RpdmVUd2Vlbi5lbmRWYWx1ZSA9IGFjdGl2ZVR3ZWVuLmN1cnJlbnRWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogUmVtYWluaW5nIHF1ZXVlIGNsZWFyaW5nLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMgPT09IHRydWUgfHwgVHlwZS5pc1N0cmluZyhvcHRpb25zKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIENsZWFyaW5nIHRoZSAkLnF1ZXVlKCkgYXJyYXkgaXMgYWNoaWV2ZWQgYnkgbWFudWFsbHkgc2V0dGluZyBpdCB0byBbXS4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAkLnF1ZXVlKGVsZW1lbnQsIFR5cGUuaXNTdHJpbmcob3B0aW9ucykgPyBvcHRpb25zIDogXCJcIiwgW10pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsc1RvU3RvcC5wdXNoKGkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgLyogUHJlbWF0dXJlbHkgY2FsbCBjb21wbGV0ZUNhbGwoKSBvbiBlYWNoIG1hdGNoZWQgYWN0aXZlIGNhbGwsIHBhc3NpbmcgYW4gYWRkaXRpb25hbCBmbGFnIHRvIGluZGljYXRlIHRoYXQgdGhlIGNvbXBsZXRlIGNhbGxiYWNrIGFuZCBkaXNwbGF5Om5vbmUgc2V0dGluZyBzaG91bGQgYmUgc2tpcHBlZC4gKi9cbiAgICAgICAgICAgICAgICAkLmVhY2goY2FsbHNUb1N0b3AsIGZ1bmN0aW9uKGksIGopIHtcbiAgICAgICAgICAgICAgICAgICAgY29tcGxldGVDYWxsKGosIHRydWUpO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgLyogU2luY2Ugd2UncmUgc3RvcHBpbmcsIGRvIG5vdCBwcm9jZWVkIHdpdGggUXVldWVpbmcuICovXG4gICAgICAgICAgICAgICAgcmV0dXJuIGdldENoYWluKCk7XG5cbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgLyogVHJlYXQgYSBub24tZW1wdHkgcGxhaW4gb2JqZWN0IGFzIGEgbGl0ZXJhbCBwcm9wZXJ0aWVzIG1hcC4gKi9cbiAgICAgICAgICAgICAgICBpZiAoJC5pc1BsYWluT2JqZWN0KHByb3BlcnRpZXNNYXApICYmICEkLmlzRW1wdHlPYmplY3QocHJvcGVydGllc01hcCkpIHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uID0gXCJzdGFydFwiO1xuXG4gICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgICAgICAgU2VxdWVuY2VzXG4gICAgICAgICAgICAgICAgKioqKioqKioqKioqKioqKi9cblxuICAgICAgICAgICAgICAgIC8qIENoZWNrIGlmIGEgc3RyaW5nIG1hdGNoZXMgYSByZWdpc3RlcmVkIHNlcXVlbmNlIChzZWUgU2VxdWVuY2VzIGFib3ZlKS4gKi9cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKFR5cGUuaXNTdHJpbmcocHJvcGVydGllc01hcCkgJiYgVmVsb2NpdHkuU2VxdWVuY2VzW3Byb3BlcnRpZXNNYXBdKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBlbGVtZW50c09yaWdpbmFsID0gZWxlbWVudHMsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdXJhdGlvbk9yaWdpbmFsID0gb3B0aW9ucy5kdXJhdGlvbjtcblxuICAgICAgICAgICAgICAgICAgICAvKiBJZiB0aGUgYmFja3dhcmRzIG9wdGlvbiB3YXMgcGFzc2VkIGluLCByZXZlcnNlIHRoZSBlbGVtZW50IHNldCBzbyB0aGF0IGVsZW1lbnRzIGFuaW1hdGUgZnJvbSB0aGUgbGFzdCB0byB0aGUgZmlyc3QgKHVzZWZ1bCBpbiBjb21iaW5hdGlvbiB3aXRoIHRoZSBzdGFnZ2VyIG9wdGlvbikuICovXG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLmJhY2t3YXJkcyA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudHMgPSAoZWxlbWVudHMuanF1ZXJ5ID8gW10uc2xpY2UuY2FsbChlbGVtZW50cykgOiBlbGVtZW50cykucmV2ZXJzZSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLyogSW5kaXZpZHVhbGx5IHRyaWdnZXIgdGhlIHNlcXVlbmNlIGZvciBlYWNoIGVsZW1lbnQgaW4gdGhlIHNldCB0byBwcmV2ZW50IHVzZXJzIGZyb20gaGF2aW5nIHRvIGhhbmRsZSBpdGVyYXRpb24gbG9naWMgaW4gdGhlaXIgb3duIHNlcXVlbmNlIGNvZGUuICovXG4gICAgICAgICAgICAgICAgICAgICQuZWFjaChlbGVtZW50cywgZnVuY3Rpb24oZWxlbWVudEluZGV4LCBlbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBJZiB0aGUgc3RhZ2dlciBvcHRpb24gd2FzIHBhc3NlZCBpbiwgc3VjY2Vzc2l2ZWx5IGRlbGF5IGVhY2ggZWxlbWVudCBieSB0aGUgc3RhZ2dlciB2YWx1ZSAoaW4gbXMpLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHBhcnNlRmxvYXQob3B0aW9ucy5zdGFnZ2VyKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuZGVsYXkgPSBwYXJzZUZsb2F0KG9wdGlvbnMuc3RhZ2dlcikgKiBlbGVtZW50SW5kZXg7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIElmIHRoZSBkcmFnIG9wdGlvbiB3YXMgcGFzc2VkIGluLCBzdWNjZXNzaXZlbHkgaW5jcmVhc2UvZGVjcmVhc2UgKGRlcGVuZGluZyBvbiB0aGUgcHJlc2Vuc2Ugb2Ygb3B0aW9ucy5iYWNrd2FyZHMpIHRoZSBkdXJhdGlvbiBvZiBlYWNoIGVsZW1lbnQncyBhbmltYXRpb24sIHVzaW5nIGZsb29ycyB0byBwcmV2ZW50IHByb2R1Y2luZyB2ZXJ5IHNob3J0IGR1cmF0aW9ucy4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLmRyYWcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBEZWZhdWx0IHRoZSBkdXJhdGlvbiBvZiBVSSBwYWNrIGVmZmVjdHMgKGNhbGxvdXRzIGFuZCB0cmFuc2l0aW9ucykgdG8gMTAwMG1zIGluc3RlYWQgb2YgdGhlIHVzdWFsIGRlZmF1bHQgZHVyYXRpb24gb2YgNDAwbXMuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5kdXJhdGlvbiA9IHBhcnNlRmxvYXQoZHVyYXRpb25PcmlnaW5hbCkgfHwgKC9eKGNhbGxvdXR8dHJhbnNpdGlvbikvLnRlc3QocHJvcGVydGllc01hcCkgPyAxMDAwIDogREVGQVVMVF9EVVJBVElPTik7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBGb3IgZWFjaCBlbGVtZW50LCB0YWtlIHRoZSBncmVhdGVyIGR1cmF0aW9uIG9mOiBBKSBhbmltYXRpb24gY29tcGxldGlvbiBwZXJjZW50YWdlIHJlbGF0aXZlIHRvIHRoZSBvcmlnaW5hbCBkdXJhdGlvbiwgQikgNzUlIG9mIHRoZSBvcmlnaW5hbCBkdXJhdGlvbiwgb3IgQykgYSAyMDBtcyBmYWxsYmFja1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIChpbiBjYXNlIGR1cmF0aW9uIGlzIGFscmVhZHkgc2V0IHRvIGEgbG93IHZhbHVlKS4gVGhlIGVuZCByZXN1bHQgaXMgYSBiYXNlbGluZSBvZiA3NSUgb2YgdGhlIHNlcXVlbmNlJ3MgZHVyYXRpb24gdGhhdCBpbmNyZWFzZXMvZGVjcmVhc2VzIGFzIHRoZSBlbmQgb2YgdGhlIGVsZW1lbnQgc2V0IGlzIGFwcHJvYWNoZWQuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5kdXJhdGlvbiA9IE1hdGgubWF4KG9wdGlvbnMuZHVyYXRpb24gKiAob3B0aW9ucy5iYWNrd2FyZHMgPyAxIC0gZWxlbWVudEluZGV4L2VsZW1lbnRzTGVuZ3RoIDogKGVsZW1lbnRJbmRleCArIDEpIC8gZWxlbWVudHNMZW5ndGgpLCBvcHRpb25zLmR1cmF0aW9uICogMC43NSwgMjAwKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLyogUGFzcyBpbiB0aGUgY2FsbCdzIG9wdGlvbnMgb2JqZWN0IHNvIHRoYXQgdGhlIHNlcXVlbmNlIGNhbiBvcHRpb25hbGx5IGV4dGVuZCBpdC4gSXQgZGVmYXVsdHMgdG8gYW4gZW1wdHkgb2JqZWN0IGluc3RlYWQgb2YgbnVsbCB0byByZWR1Y2UgdGhlIG9wdGlvbnMgY2hlY2tpbmcgbG9naWMgcmVxdWlyZWQgaW5zaWRlIHRoZSBzZXF1ZW5jZS4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIE5vdGU6IFRoZSBlbGVtZW50IGlzIHBhc3NlZCBpbiBhcyBib3RoIHRoZSBjYWxsJ3MgY29udGV4dCBhbmQgaXRzIGZpcnN0IGFyZ3VtZW50IC0tIGFsbG93aW5nIGZvciBtb3JlIGV4cHJlc3NpdmUgc2VxdWVuY2UgZGVjbGFyYXRpb25zLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgVmVsb2NpdHkuU2VxdWVuY2VzW3Byb3BlcnRpZXNNYXBdLmNhbGwoZWxlbWVudCwgZWxlbWVudCwgb3B0aW9ucyB8fCB7fSwgZWxlbWVudEluZGV4LCBlbGVtZW50c0xlbmd0aCk7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgIC8qIFNpbmNlIHRoZSBhbmltYXRpb24gbG9naWMgcmVzaWRlcyB3aXRoaW4gdGhlIHNlcXVlbmNlJ3Mgb3duIGNvZGUsIGFib3J0IHRoZSByZW1haW5kZXIgb2YgdGhpcyBjYWxsLiAoVGhlIHBlcmZvcm1hbmNlIG92ZXJoZWFkIHVwIHRvIHRoaXMgcG9pbnQgaXMgdmlydHVhbGx5IG5vbi1leGlzdGFudC4pICovXG4gICAgICAgICAgICAgICAgICAgIC8qIE5vdGU6IFRoZSBqUXVlcnkgY2FsbCBjaGFpbiBpcyBrZXB0IGludGFjdCBieSByZXR1cm5pbmcgdGhlIGNvbXBsZXRlIGVsZW1lbnQgc2V0LiAqL1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZWxlbWVudHNXcmFwcGVkIHx8IGVsZW1lbnRzT3JpZ2luYWw7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJGaXJzdCBhcmd1bWVudCB3YXMgbm90IGEgcHJvcGVydHkgbWFwLCBhIGtub3duIGFjdGlvbiwgb3IgYSByZWdpc3RlcmVkIHNlcXVlbmNlLiBBYm9ydGluZy5cIilcblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ2V0Q2hhaW4oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgIENhbGwtV2lkZSBWYXJpYWJsZXNcbiAgICAgICAgKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgLyogQSBjb250YWluZXIgZm9yIENTUyB1bml0IGNvbnZlcnNpb24gcmF0aW9zIChlLmcuICUsIHJlbSwgYW5kIGVtID09PiBweCkgdGhhdCBpcyB1c2VkIHRvIGNhY2hlIHJhdGlvcyBhY3Jvc3MgYWxsIHByb3BlcnRpZXMgYmVpbmcgYW5pbWF0ZWQgaW4gYSBzaW5nbGUgVmVsb2NpdHkgY2FsbC5cbiAgICAgICAgICAgQ2FsY3VsYXRpbmcgdW5pdCByYXRpb3MgbmVjZXNzaXRhdGVzIERPTSBxdWVyeWluZyBhbmQgdXBkYXRpbmcsIGFuZCBpcyB0aGVyZWZvcmUgYXZvaWRlZCAodmlhIGNhY2hpbmcpIHdoZXJldmVyIHBvc3NpYmxlOyBmdXJ0aGVyLCByYXRpb3MgYXJlIG9ubHkgY2FsY3VsYXRlZCB3aGVuIHRoZXkncmUgbmVlZGVkLiAqL1xuICAgICAgICAvKiBOb3RlOiBUaGlzIGNvbnRhaW5lciBpcyBjYWxsLXdpZGUgaW5zdGVhZCBvZiBwYWdlLXdpZGUgdG8gYXZvaWQgdGhlIHJpc2sgb2YgdXNpbmcgc3RhbGUgY29udmVyc2lvbiBtZXRyaWNzIGFjcm9zcyBWZWxvY2l0eSBhbmltYXRpb25zIHRoYXQgYXJlIG5vdCBpbW1lZGlhdGVseSBjb25zZWN1dGl2ZWx5IGNoYWluZWQuICovXG4gICAgICAgIHZhciB1bml0Q29udmVyc2lvblJhdGlvcyA9IHtcbiAgICAgICAgICAgICAgICAvKiBQZXJmb3JtYW5jZSBvcHRpbWl6YXRpb24gaW5zaWdodDogV2hlbiB0aGUgcGFyZW50IGVsZW1lbnQsIENTUyBwb3NpdGlvbiB2YWx1ZSwgYW5kIGZvbnRTaXplIGRvIG5vdCBkaWZmZXIgYW1vbmdzdCBlbGVtZW50cywgdGhlIGVsZW1lbnRzJyB1bml0IHJhdGlvcyBhcmUgaWRlbnRpY2FsLiAqL1xuICAgICAgICAgICAgICAgIGxhc3RQYXJlbnQ6IG51bGwsXG4gICAgICAgICAgICAgICAgbGFzdFBvc2l0aW9uOiBudWxsLFxuICAgICAgICAgICAgICAgIGxhc3RGb250U2l6ZTogbnVsbCxcbiAgICAgICAgICAgICAgICAvKiBQZXJjZW50IGlzIHRoZSBvbmx5IHVuaXQgdHlwZXMgd2hvc2UgcmF0aW8gaXMgZGVwZW5kYW50IHVwb24gYXhpcy4gKi9cbiAgICAgICAgICAgICAgICBsYXN0UGVyY2VudFRvUHhXaWR0aDogbnVsbCxcbiAgICAgICAgICAgICAgICBsYXN0UGVyY2VudFRvUHhIZWlnaHQ6IG51bGwsXG4gICAgICAgICAgICAgICAgbGFzdEVtVG9QeDogbnVsbCxcbiAgICAgICAgICAgICAgICAvKiBUaGUgcmVtPT0+cHggcmF0aW8gaXMgcmVsYXRpdmUgdG8gdGhlIGRvY3VtZW50J3MgZm9udFNpemUgLS0gbm90IGFueSBwcm9wZXJ0eSBiZWxvbmdpbmcgdG8gdGhlIGVsZW1lbnQuIFRodXMsIGl0IGlzIGF1dG9tYXRpY2FsbHkgY2FsbC13aWRlIGNhY2hlZCB3aGVuZXZlciB0aGUgcmVtIHVuaXQgaXMgYmVpbmcgYW5pbWF0ZWQuICovXG4gICAgICAgICAgICAgICAgcmVtVG9QeFJhdGlvOiBudWxsXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgIC8qIEEgY29udGFpbmVyIGZvciBhbGwgdGhlIGVuc3VpbmcgdHdlZW4gZGF0YSBhbmQgbWV0YWRhdGEgYXNzb2NpYXRlZCB3aXRoIHRoaXMgY2FsbC4gVGhpcyBjb250YWluZXIgZ2V0cyBwdXNoZWQgdG8gdGhlIHBhZ2Utd2lkZSBWZWxvY2l0eS5TdGF0ZS5jYWxscyBhcnJheSB0aGF0IGlzIHByb2Nlc3NlZCBkdXJpbmcgYW5pbWF0aW9uIHRpY2tpbmcuICovXG4gICAgICAgIHZhciBjYWxsID0gW107XG5cbiAgICAgICAgLyoqKioqKioqKioqKioqKioqKioqKioqKlxuICAgICAgICAgICBFbGVtZW50IFByb2Nlc3NpbmdcbiAgICAgICAgKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgIC8qIEVsZW1lbnQgcHJvY2Vzc2luZyBjb25zaXN0cyBvZiB0aHJlZSBwYXJ0cyAtLSBkYXRhIHByb2Nlc3NpbmcgdGhhdCBjYW5ub3QgZ28gc3RhbGUgYW5kIGRhdGEgcHJvY2Vzc2luZyB0aGF0ICpjYW4qIGdvIHN0YWxlIChpLmUuIHRoaXJkLXBhcnR5IHN0eWxlIG1vZGlmaWNhdGlvbnMpOlxuICAgICAgICAgICAxKSBQcmUtUXVldWVpbmc6IEVsZW1lbnQtd2lkZSB2YXJpYWJsZXMsIGluY2x1ZGluZyB0aGUgZWxlbWVudCdzIGRhdGEgc3RvcmFnZSwgYXJlIGluc3RhbnRpYXRlZC4gQ2FsbCBvcHRpb25zIGFyZSBwcmVwYXJlZC4gSWYgdHJpZ2dlcmVkLCB0aGUgU3RvcCBhY3Rpb24gaXMgZXhlY3V0ZWQuXG4gICAgICAgICAgIDIpIFF1ZXVlaW5nOiBUaGUgbG9naWMgdGhhdCBydW5zIG9uY2UgdGhpcyBjYWxsIGhhcyByZWFjaGVkIGl0cyBwb2ludCBvZiBleGVjdXRpb24gaW4gdGhlIGVsZW1lbnQncyAkLnF1ZXVlKCkgc3RhY2suIE1vc3QgbG9naWMgaXMgcGxhY2VkIGhlcmUgdG8gYXZvaWQgcmlza2luZyBpdCBiZWNvbWluZyBzdGFsZS5cbiAgICAgICAgICAgMykgUHVzaGluZzogQ29uc29saWRhdGlvbiBvZiB0aGUgdHdlZW4gZGF0YSBmb2xsb3dlZCBieSBpdHMgcHVzaCBvbnRvIHRoZSBnbG9iYWwgaW4tcHJvZ3Jlc3MgY2FsbHMgY29udGFpbmVyLlxuICAgICAgICAqL1xuXG4gICAgICAgIGZ1bmN0aW9uIHByb2Nlc3NFbGVtZW50ICgpIHtcblxuICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgIFBhcnQgSTogUHJlLVF1ZXVlaW5nXG4gICAgICAgICAgICAqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgICAgICAvKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICBFbGVtZW50LVdpZGUgVmFyaWFibGVzXG4gICAgICAgICAgICAqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgIHZhciBlbGVtZW50ID0gdGhpcyxcbiAgICAgICAgICAgICAgICAvKiBUaGUgcnVudGltZSBvcHRzIG9iamVjdCBpcyB0aGUgZXh0ZW5zaW9uIG9mIHRoZSBjdXJyZW50IGNhbGwncyBvcHRpb25zIGFuZCBWZWxvY2l0eSdzIHBhZ2Utd2lkZSBvcHRpb24gZGVmYXVsdHMuICovXG4gICAgICAgICAgICAgICAgb3B0cyA9ICQuZXh0ZW5kKHt9LCBWZWxvY2l0eS5kZWZhdWx0cywgb3B0aW9ucyksXG4gICAgICAgICAgICAgICAgLyogQSBjb250YWluZXIgZm9yIHRoZSBwcm9jZXNzZWQgZGF0YSBhc3NvY2lhdGVkIHdpdGggZWFjaCBwcm9wZXJ0eSBpbiB0aGUgcHJvcGVydHlNYXAuIChFYWNoIHByb3BlcnR5IGluIHRoZSBtYXAgcHJvZHVjZXMgaXRzIG93biBcInR3ZWVuXCIuKSAqL1xuICAgICAgICAgICAgICAgIHR3ZWVuc0NvbnRhaW5lciA9IHt9O1xuXG4gICAgICAgICAgICAvKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICAgRGF0YSBDYWNoZVxuICAgICAgICAgICAgKioqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgICAgICAvKiBBIHByaW1hcnkgZGVzaWduIGdvYWwgb2YgVmVsb2NpdHkgaXMgdG8gY2FjaGUgZGF0YSB3aGVyZXZlciBwb3NzaWJsZSBpbiBvcmRlciB0byBhdm9pZCBET00gcmVxdWVyeWluZy4gQWNjb3JkaW5nbHksIGVhY2ggZWxlbWVudCBoYXMgYSBkYXRhIGNhY2hlIGluc3RhbnRpYXRlZCBvbiBpdC4gKi9cbiAgICAgICAgICAgIGlmIChEYXRhKGVsZW1lbnQpID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAkLmRhdGEoZWxlbWVudCwgTkFNRSwge1xuICAgICAgICAgICAgICAgICAgICAvKiBLZWVwIHRyYWNrIG9mIHdoZXRoZXIgdGhlIGVsZW1lbnQgaXMgY3VycmVudGx5IGJlaW5nIGFuaW1hdGVkIGJ5IFZlbG9jaXR5LiBUaGlzIGlzIHVzZWQgdG8gZW5zdXJlIHRoYXQgcHJvcGVydHkgdmFsdWVzIGFyZSBub3QgdHJhbnNmZXJyZWQgYmV0d2VlbiBub24tY29uc2VjdXRpdmUgKHN0YWxlKSBjYWxscy4gKi9cbiAgICAgICAgICAgICAgICAgICAgaXNBbmltYXRpbmc6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAvKiBBIHJlZmVyZW5jZSB0byB0aGUgZWxlbWVudCdzIGxpdmUgY29tcHV0ZWRTdHlsZSBvYmplY3QuIFlvdSBjYW4gbGVhcm4gbW9yZSBhYm91dCBjb21wdXRlZFN0eWxlIGhlcmU6IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuL2RvY3MvV2ViL0FQSS93aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZSAqL1xuICAgICAgICAgICAgICAgICAgICBjb21wdXRlZFN0eWxlOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICAvKiBUd2VlbiBkYXRhIGlzIGNhY2hlZCBmb3IgZWFjaCBhbmltYXRpb24gb24gdGhlIGVsZW1lbnQgc28gdGhhdCBkYXRhIGNhbiBiZSBwYXNzZWQgYWNyb3NzIGNhbGxzIC0tIGluIHBhcnRpY3VsYXIsIGVuZCB2YWx1ZXMgYXJlIHVzZWQgYXMgc3Vic2VxdWVudCBzdGFydCB2YWx1ZXMgaW4gY29uc2VjdXRpdmUgVmVsb2NpdHkgY2FsbHMuICovXG4gICAgICAgICAgICAgICAgICAgIHR3ZWVuc0NvbnRhaW5lcjogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgLyogVGhlIGZ1bGwgcm9vdCBwcm9wZXJ0eSB2YWx1ZXMgb2YgZWFjaCBDU1MgaG9vayBiZWluZyBhbmltYXRlZCBvbiB0aGlzIGVsZW1lbnQgYXJlIGNhY2hlZCBzbyB0aGF0OlxuICAgICAgICAgICAgICAgICAgICAgICAxKSBDb25jdXJyZW50bHktYW5pbWF0aW5nIGhvb2tzIHNoYXJpbmcgdGhlIHNhbWUgcm9vdCBjYW4gaGF2ZSB0aGVpciByb290IHZhbHVlcycgbWVyZ2VkIGludG8gb25lIHdoaWxlIHR3ZWVuaW5nLlxuICAgICAgICAgICAgICAgICAgICAgICAyKSBQb3N0LWhvb2staW5qZWN0aW9uIHJvb3QgdmFsdWVzIGNhbiBiZSB0cmFuc2ZlcnJlZCBvdmVyIHRvIGNvbnNlY3V0aXZlbHkgY2hhaW5lZCBWZWxvY2l0eSBjYWxscyBhcyBzdGFydGluZyByb290IHZhbHVlcy5cbiAgICAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICAgICAgcm9vdFByb3BlcnR5VmFsdWVDYWNoZToge30sXG4gICAgICAgICAgICAgICAgICAgIC8qIEEgY2FjaGUgZm9yIHRyYW5zZm9ybSB1cGRhdGVzLCB3aGljaCBtdXN0IGJlIG1hbnVhbGx5IGZsdXNoZWQgdmlhIENTUy5mbHVzaFRyYW5zZm9ybUNhY2hlKCkuICovXG4gICAgICAgICAgICAgICAgICAgIHRyYW5zZm9ybUNhY2hlOiB7fVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICBPcHRpb246IERlbGF5XG4gICAgICAgICAgICAqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgIC8qIFNpbmNlIHF1ZXVlOmZhbHNlIGRvZXNuJ3QgcmVzcGVjdCB0aGUgaXRlbSdzIGV4aXN0aW5nIHF1ZXVlLCB3ZSBhdm9pZCBpbmplY3RpbmcgaXRzIGRlbGF5IGhlcmUgKGl0J3Mgc2V0IGxhdGVyIG9uKS4gKi9cbiAgICAgICAgICAgIC8qIE5vdGU6IFZlbG9jaXR5IHJvbGxzIGl0cyBvd24gZGVsYXkgZnVuY3Rpb24gc2luY2UgalF1ZXJ5IGRvZXNuJ3QgaGF2ZSBhIHV0aWxpdHkgYWxpYXMgZm9yICQuZm4uZGVsYXkoKSAoYW5kIHRodXMgcmVxdWlyZXMgalF1ZXJ5IGVsZW1lbnQgY3JlYXRpb24sIHdoaWNoIHdlIGF2b2lkIHNpbmNlIGl0cyBvdmVyaGVhZCBpbmNsdWRlcyBET00gcXVlcnlpbmcpLiAqL1xuICAgICAgICAgICAgaWYgKC9eXFxkLy50ZXN0KG9wdHMuZGVsYXkpICYmIG9wdHMucXVldWUgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgJC5xdWV1ZShlbGVtZW50LCBvcHRzLnF1ZXVlLCBmdW5jdGlvbihuZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgIC8qIFRoaXMgaXMgYSBmbGFnIHVzZWQgdG8gaW5kaWNhdGUgdG8gdGhlIHVwY29taW5nIGNvbXBsZXRlQ2FsbCgpIGZ1bmN0aW9uIHRoYXQgdGhpcyBxdWV1ZSBlbnRyeSB3YXMgaW5pdGlhdGVkIGJ5IFZlbG9jaXR5LiBTZWUgY29tcGxldGVDYWxsKCkgZm9yIGZ1cnRoZXIgZGV0YWlscy4gKi9cbiAgICAgICAgICAgICAgICAgICAgVmVsb2NpdHkudmVsb2NpdHlRdWV1ZUVudHJ5RmxhZyA9IHRydWU7XG5cbiAgICAgICAgICAgICAgICAgICAgLyogVGhlIGVuc3VpbmcgcXVldWUgaXRlbSAod2hpY2ggaXMgYXNzaWduZWQgdG8gdGhlIFwibmV4dFwiIGFyZ3VtZW50IHRoYXQgJC5xdWV1ZSgpIGF1dG9tYXRpY2FsbHkgcGFzc2VzIGluKSB3aWxsIGJlIHRyaWdnZXJlZCBhZnRlciBhIHNldFRpbWVvdXQgZGVsYXkuICovXG4gICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQobmV4dCwgcGFyc2VGbG9hdChvcHRzLmRlbGF5KSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8qKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgIE9wdGlvbjogRHVyYXRpb25cbiAgICAgICAgICAgICoqKioqKioqKioqKioqKioqKioqKi9cblxuICAgICAgICAgICAgLyogSW4gbW9jayBtb2RlLCBhbGwgYW5pbWF0aW9ucyBhcmUgZm9yY2VkIHRvIDFtcyBzbyB0aGF0IHRoZXkgb2NjdXIgaW1tZWRpYXRlbHkgdXBvbiB0aGUgbmV4dCByQUYgdGljay4gKi9cbiAgICAgICAgICAgIGlmIChWZWxvY2l0eS5tb2NrID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgb3B0cy5kdXJhdGlvbiA9IDE7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8qIFN1cHBvcnQgZm9yIGpRdWVyeSdzIG5hbWVkIGR1cmF0aW9ucy4gKi9cbiAgICAgICAgICAgICAgICBzd2l0Y2ggKG9wdHMuZHVyYXRpb24udG9TdHJpbmcoKS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJmYXN0XCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBvcHRzLmR1cmF0aW9uID0gMjAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcIm5vcm1hbFwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgb3B0cy5kdXJhdGlvbiA9IERFRkFVTFRfRFVSQVRJT047XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgICAgICBjYXNlIFwic2xvd1wiOlxuICAgICAgICAgICAgICAgICAgICAgICAgb3B0cy5kdXJhdGlvbiA9IDYwMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBSZW1vdmUgdGhlIHBvdGVudGlhbCBcIm1zXCIgc3VmZml4IGFuZCBkZWZhdWx0IHRvIDEgaWYgdGhlIHVzZXIgaXMgYXR0ZW1wdGluZyB0byBzZXQgYSBkdXJhdGlvbiBvZiAwIChpbiBvcmRlciB0byBwcm9kdWNlIGFuIGltbWVkaWF0ZSBzdHlsZSBjaGFuZ2UpLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgb3B0cy5kdXJhdGlvbiA9IHBhcnNlRmxvYXQob3B0cy5kdXJhdGlvbikgfHwgMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8qKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICBPcHRpb246IEVhc2luZ1xuICAgICAgICAgICAgKioqKioqKioqKioqKioqKioqKi9cblxuICAgICAgICAgICAgb3B0cy5lYXNpbmcgPSBnZXRFYXNpbmcob3B0cy5lYXNpbmcsIG9wdHMuZHVyYXRpb24pO1xuXG4gICAgICAgICAgICAvKioqKioqKioqKioqKioqKioqKioqKlxuICAgICAgICAgICAgICAgT3B0aW9uOiBDYWxsYmFja3NcbiAgICAgICAgICAgICoqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgIC8qIENhbGxiYWNrcyBtdXN0IGZ1bmN0aW9ucy4gT3RoZXJ3aXNlLCBkZWZhdWx0IHRvIG51bGwuICovXG4gICAgICAgICAgICBpZiAob3B0cy5iZWdpbiAmJiAhVHlwZS5pc0Z1bmN0aW9uKG9wdHMuYmVnaW4pKSB7XG4gICAgICAgICAgICAgICAgb3B0cy5iZWdpbiA9IG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChvcHRzLnByb2dyZXNzICYmICFUeXBlLmlzRnVuY3Rpb24ob3B0cy5wcm9ncmVzcykpIHtcbiAgICAgICAgICAgICAgICBvcHRzLnByb2dyZXNzID0gbnVsbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG9wdHMuY29tcGxldGUgJiYgIVR5cGUuaXNGdW5jdGlvbihvcHRzLmNvbXBsZXRlKSkge1xuICAgICAgICAgICAgICAgIG9wdHMuY29tcGxldGUgPSBudWxsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgIE9wdGlvbjogRGlzcGxheVxuICAgICAgICAgICAgKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgIC8qIFJlZmVyIHRvIFZlbG9jaXR5J3MgZG9jdW1lbnRhdGlvbiAoVmVsb2NpdHlKUy5vcmcvI2Rpc3BsYXkpIGZvciBhIGRlc2NyaXB0aW9uIG9mIHRoZSBkaXNwbGF5IG9wdGlvbidzIGJlaGF2aW9yLiAqL1xuICAgICAgICAgICAgaWYgKG9wdHMuZGlzcGxheSkge1xuICAgICAgICAgICAgICAgIG9wdHMuZGlzcGxheSA9IG9wdHMuZGlzcGxheS50b1N0cmluZygpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8qKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICBPcHRpb246IG1vYmlsZUhBXG4gICAgICAgICAgICAqKioqKioqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgICAgICAvKiBXaGVuIHNldCB0byB0cnVlLCBhbmQgaWYgdGhpcyBpcyBhIG1vYmlsZSBkZXZpY2UsIG1vYmlsZUhBIGF1dG9tYXRpY2FsbHkgZW5hYmxlcyBoYXJkd2FyZSBhY2NlbGVyYXRpb24gKHZpYSBhIG51bGwgdHJhbnNmb3JtIGhhY2spIG9uIGFuaW1hdGluZyBlbGVtZW50cy4gSEEgaXMgcmVtb3ZlZCBmcm9tIHRoZSBlbGVtZW50IGF0IHRoZSBjb21wbGV0aW9uIG9mIGl0cyBhbmltYXRpb24uICovXG4gICAgICAgICAgICAvKiBOb3RlOiBBbmRyb2lkIEdpbmdlcmJyZWFkIGRvZXNuJ3Qgc3VwcG9ydCBIQS4gSWYgYSBudWxsIHRyYW5zZm9ybSBoYWNrIChtb2JpbGVIQSkgaXMgaW4gZmFjdCBzZXQsIGl0IHdpbGwgcHJldmVudCBvdGhlciB0cmFuZm9ybSBzdWJwcm9wZXJ0aWVzIGZyb20gdGFraW5nIGVmZmVjdC4gKi9cbiAgICAgICAgICAgIC8qIE5vdGU6IFlvdSBjYW4gcmVhZCBtb3JlIGFib3V0IHRoZSB1c2Ugb2YgbW9iaWxlSEEgaW4gVmVsb2NpdHkncyBkb2N1bWVudGF0aW9uOiBWZWxvY2l0eUpTLm9yZy8jbW9iaWxlSEEuICovXG4gICAgICAgICAgICBvcHRzLm1vYmlsZUhBID0gKG9wdHMubW9iaWxlSEEgJiYgVmVsb2NpdHkuU3RhdGUuaXNNb2JpbGUgJiYgIVZlbG9jaXR5LlN0YXRlLmlzR2luZ2VyYnJlYWQpO1xuXG4gICAgICAgICAgICAvKioqKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgIFBhcnQgSUk6IFF1ZXVlaW5nXG4gICAgICAgICAgICAqKioqKioqKioqKioqKioqKioqKioqKi9cblxuICAgICAgICAgICAgLyogV2hlbiBhIHNldCBvZiBlbGVtZW50cyBpcyB0YXJnZXRlZCBieSBhIFZlbG9jaXR5IGNhbGwsIHRoZSBzZXQgaXMgYnJva2VuIHVwIGFuZCBlYWNoIGVsZW1lbnQgaGFzIHRoZSBjdXJyZW50IFZlbG9jaXR5IGNhbGwgaW5kaXZpZHVhbGx5IHF1ZXVlZCBvbnRvIGl0LlxuICAgICAgICAgICAgICAgSW4gdGhpcyB3YXksIGVhY2ggZWxlbWVudCdzIGV4aXN0aW5nIHF1ZXVlIGlzIHJlc3BlY3RlZDsgc29tZSBlbGVtZW50cyBtYXkgYWxyZWFkeSBiZSBhbmltYXRpbmcgYW5kIGFjY29yZGluZ2x5IHNob3VsZCBub3QgaGF2ZSB0aGlzIGN1cnJlbnQgVmVsb2NpdHkgY2FsbCB0cmlnZ2VyZWQgaW1tZWRpYXRlbHkuICovXG4gICAgICAgICAgICAvKiBJbiBlYWNoIHF1ZXVlLCB0d2VlbiBkYXRhIGlzIHByb2Nlc3NlZCBmb3IgZWFjaCBhbmltYXRpbmcgcHJvcGVydHkgdGhlbiBwdXNoZWQgb250byB0aGUgY2FsbC13aWRlIGNhbGxzIGFycmF5LiBXaGVuIHRoZSBsYXN0IGVsZW1lbnQgaW4gdGhlIHNldCBoYXMgaGFkIGl0cyB0d2VlbnMgcHJvY2Vzc2VkLFxuICAgICAgICAgICAgICAgdGhlIGNhbGwgYXJyYXkgaXMgcHVzaGVkIHRvIFZlbG9jaXR5LlN0YXRlLmNhbGxzIGZvciBsaXZlIHByb2Nlc3NpbmcgYnkgdGhlIHJlcXVlc3RBbmltYXRpb25GcmFtZSB0aWNrLiAqL1xuICAgICAgICAgICAgZnVuY3Rpb24gYnVpbGRRdWV1ZSAobmV4dCkge1xuXG4gICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgICAgICBPcHRpb246IEJlZ2luXG4gICAgICAgICAgICAgICAgKioqKioqKioqKioqKioqKioqKi9cblxuICAgICAgICAgICAgICAgIC8qIFRoZSBiZWdpbiBjYWxsYmFjayBpcyBmaXJlZCBvbmNlIHBlciBjYWxsIC0tIG5vdCBvbmNlIHBlciBlbGVtZW5ldCAtLSBhbmQgaXMgcGFzc2VkIHRoZSBmdWxsIHJhdyBET00gZWxlbWVudCBzZXQgYXMgYm90aCBpdHMgY29udGV4dCBhbmQgaXRzIGZpcnN0IGFyZ3VtZW50LiAqL1xuICAgICAgICAgICAgICAgIGlmIChvcHRzLmJlZ2luICYmIGVsZW1lbnRzSW5kZXggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgb3B0cy5iZWdpbi5jYWxsKGVsZW1lbnRzLCBlbGVtZW50cyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICAgICAgVHdlZW4gRGF0YSBDb25zdHJ1Y3Rpb24gKGZvciBTY3JvbGwpXG4gICAgICAgICAgICAgICAgKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgICAgICAvKiBOb3RlOiBJbiBvcmRlciB0byBiZSBzdWJqZWN0ZWQgdG8gY2hhaW5pbmcgYW5kIGFuaW1hdGlvbiBvcHRpb25zLCBzY3JvbGwncyB0d2VlbmluZyBpcyByb3V0ZWQgdGhyb3VnaCBWZWxvY2l0eSBhcyBpZiBpdCB3ZXJlIGEgc3RhbmRhcmQgQ1NTIHByb3BlcnR5IGFuaW1hdGlvbi4gKi9cbiAgICAgICAgICAgICAgICBpZiAoYWN0aW9uID09PSBcInNjcm9sbFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIC8qIFRoZSBzY3JvbGwgYWN0aW9uIHVuaXF1ZWx5IHRha2VzIGFuIG9wdGlvbmFsIFwib2Zmc2V0XCIgb3B0aW9uIC0tIHNwZWNpZmllZCBpbiBwaXhlbHMgLS0gdGhhdCBvZmZzZXRzIHRoZSB0YXJnZXRlZCBzY3JvbGwgcG9zaXRpb24uICovXG4gICAgICAgICAgICAgICAgICAgIHZhciBzY3JvbGxEaXJlY3Rpb24gPSAoL154JC9pLnRlc3Qob3B0cy5heGlzKSA/IFwiTGVmdFwiIDogXCJUb3BcIiksXG4gICAgICAgICAgICAgICAgICAgICAgICBzY3JvbGxPZmZzZXQgPSBwYXJzZUZsb2F0KG9wdHMub2Zmc2V0KSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2Nyb2xsUG9zaXRpb25DdXJyZW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgc2Nyb2xsUG9zaXRpb25DdXJyZW50QWx0ZXJuYXRlLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2Nyb2xsUG9zaXRpb25FbmQ7XG5cbiAgICAgICAgICAgICAgICAgICAgLyogU2Nyb2xsIGFsc28gdW5pcXVlbHkgdGFrZXMgYW4gb3B0aW9uYWwgXCJjb250YWluZXJcIiBvcHRpb24sIHdoaWNoIGluZGljYXRlcyB0aGUgcGFyZW50IGVsZW1lbnQgdGhhdCBzaG91bGQgYmUgc2Nyb2xsZWQgLS0gYXMgb3Bwb3NlZCB0byB0aGUgYnJvd3NlciB3aW5kb3cgaXRzZWxmLlxuICAgICAgICAgICAgICAgICAgICAgICBUaGlzIGlzIHVzZWZ1bCBmb3Igc2Nyb2xsaW5nIHRvd2FyZCBhbiBlbGVtZW50IHRoYXQncyBpbnNpZGUgYW4gb3ZlcmZsb3dpbmcgcGFyZW50IGVsZW1lbnQuICovXG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHRzLmNvbnRhaW5lcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgLyogRW5zdXJlIHRoYXQgZWl0aGVyIGEgalF1ZXJ5IG9iamVjdCBvciBhIHJhdyBET00gZWxlbWVudCB3YXMgcGFzc2VkIGluLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9wdHMuY29udGFpbmVyLmpxdWVyeSB8fCBvcHRzLmNvbnRhaW5lci5ub2RlVHlwZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIEV4dHJhY3QgdGhlIHJhdyBET00gZWxlbWVudCBmcm9tIHRoZSBqUXVlcnkgd3JhcHBlci4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRzLmNvbnRhaW5lciA9IG9wdHMuY29udGFpbmVyWzBdIHx8IG9wdHMuY29udGFpbmVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIE5vdGU6IFVubGlrZSBvdGhlciBwcm9wZXJ0aWVzIGluIFZlbG9jaXR5LCB0aGUgYnJvd3NlcidzIHNjcm9sbCBwb3NpdGlvbiBpcyBuZXZlciBjYWNoZWQgc2luY2UgaXQgc28gZnJlcXVlbnRseSBjaGFuZ2VzIChkdWUgdG8gdGhlIHVzZXIncyBuYXR1cmFsIGludGVyYWN0aW9uIHdpdGggdGhlIHBhZ2UpLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjcm9sbFBvc2l0aW9uQ3VycmVudCA9IG9wdHMuY29udGFpbmVyW1wic2Nyb2xsXCIgKyBzY3JvbGxEaXJlY3Rpb25dOyAvKiBHRVQgKi9cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qICQucG9zaXRpb24oKSB2YWx1ZXMgYXJlIHJlbGF0aXZlIHRvIHRoZSBjb250YWluZXIncyBjdXJyZW50bHkgdmlld2FibGUgYXJlYSAod2l0aG91dCB0YWtpbmcgaW50byBhY2NvdW50IHRoZSBjb250YWluZXIncyB0cnVlIGRpbWVuc2lvbnMgLS0gc2F5LCBmb3IgZXhhbXBsZSwgaWYgdGhlIGNvbnRhaW5lciB3YXMgbm90IG92ZXJmbG93aW5nKS5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBUaHVzLCB0aGUgc2Nyb2xsIGVuZCB2YWx1ZSBpcyB0aGUgc3VtIG9mIHRoZSBjaGlsZCBlbGVtZW50J3MgcG9zaXRpb24gKmFuZCogdGhlIHNjcm9sbCBjb250YWluZXIncyBjdXJyZW50IHNjcm9sbCBwb3NpdGlvbi4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBOb3RlOiBqUXVlcnkgZG9lcyBub3Qgb2ZmZXIgYSB1dGlsaXR5IGFsaWFzIGZvciAkLnBvc2l0aW9uKCksIHNvIHdlIGhhdmUgdG8gaW5jdXIgalF1ZXJ5IG9iamVjdCBjb252ZXJzaW9uIGhlcmUuIFRoaXMgc3luY3MgdXAgd2l0aCBhbiBlbnN1aW5nIGJhdGNoIG9mIEdFVHMsIHNvIGl0IGZvcnR1bmF0ZWx5IGRvZXMgbm90IHRyaWdnZXIgbGF5b3V0IHRocmFzaGluZy4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY3JvbGxQb3NpdGlvbkVuZCA9IChzY3JvbGxQb3NpdGlvbkN1cnJlbnQgKyAkKGVsZW1lbnQpLnBvc2l0aW9uKClbc2Nyb2xsRGlyZWN0aW9uLnRvTG93ZXJDYXNlKCldKSArIHNjcm9sbE9mZnNldDsgLyogR0VUICovXG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBJZiBhIHZhbHVlIG90aGVyIHRoYW4gYSBqUXVlcnkgb2JqZWN0IG9yIGEgcmF3IERPTSBlbGVtZW50IHdhcyBwYXNzZWQgaW4sIGRlZmF1bHQgdG8gbnVsbCBzbyB0aGF0IHRoaXMgb3B0aW9uIGlzIGlnbm9yZWQuICovXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdHMuY29udGFpbmVyID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIElmIHRoZSB3aW5kb3cgaXRzZWxmIGlzIGJlaW5nIHNjcm9sbGVkIC0tIG5vdCBhIGNvbnRhaW5pbmcgZWxlbWVudCAtLSBwZXJmb3JtIGEgbGl2ZSBzY3JvbGwgcG9zaXRpb24gbG9va3VwIHVzaW5nIHRoZSBhcHByb3ByaWF0ZSBjYWNoZWQgcHJvcGVydHkgbmFtZXMgKHdoaWNoIGRpZmZlciBiYXNlZCBvbiBicm93c2VyIHR5cGUpLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgc2Nyb2xsUG9zaXRpb25DdXJyZW50ID0gVmVsb2NpdHkuU3RhdGUuc2Nyb2xsQW5jaG9yW1ZlbG9jaXR5LlN0YXRlW1wic2Nyb2xsUHJvcGVydHlcIiArIHNjcm9sbERpcmVjdGlvbl1dOyAvKiBHRVQgKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIFdoZW4gc2Nyb2xsaW5nIHRoZSBicm93c2VyIHdpbmRvdywgY2FjaGUgdGhlIGFsdGVybmF0ZSBheGlzJ3MgY3VycmVudCB2YWx1ZSBzaW5jZSB3aW5kb3cuc2Nyb2xsVG8oKSBkb2Vzbid0IGxldCB1cyBjaGFuZ2Ugb25seSBvbmUgdmFsdWUgYXQgYSB0aW1lLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgc2Nyb2xsUG9zaXRpb25DdXJyZW50QWx0ZXJuYXRlID0gVmVsb2NpdHkuU3RhdGUuc2Nyb2xsQW5jaG9yW1ZlbG9jaXR5LlN0YXRlW1wic2Nyb2xsUHJvcGVydHlcIiArIChzY3JvbGxEaXJlY3Rpb24gPT09IFwiTGVmdFwiID8gXCJUb3BcIiA6IFwiTGVmdFwiKV1dOyAvKiBHRVQgKi9cblxuICAgICAgICAgICAgICAgICAgICAgICAgLyogVW5saWtlICQucG9zaXRpb24oKSwgJC5vZmZzZXQoKSB2YWx1ZXMgYXJlIHJlbGF0aXZlIHRvIHRoZSBicm93c2VyIHdpbmRvdydzIHRydWUgZGltZW5zaW9ucyAtLSBub3QgbWVyZWx5IGl0cyBjdXJyZW50bHkgdmlld2FibGUgYXJlYSAtLSBhbmQgdGhlcmVmb3JlIGVuZCB2YWx1ZXMgZG8gbm90IG5lZWQgdG8gYmUgY29tcG91bmRlZCBvbnRvIGN1cnJlbnQgdmFsdWVzLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgc2Nyb2xsUG9zaXRpb25FbmQgPSAkKGVsZW1lbnQpLm9mZnNldCgpW3Njcm9sbERpcmVjdGlvbi50b0xvd2VyQ2FzZSgpXSArIHNjcm9sbE9mZnNldDsgLyogR0VUICovXG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvKiBTaW5jZSB0aGVyZSdzIG9ubHkgb25lIGZvcm1hdCB0aGF0IHNjcm9sbCdzIGFzc29jaWF0ZWQgdHdlZW5zQ29udGFpbmVyIGNhbiB0YWtlLCB3ZSBjcmVhdGUgaXQgbWFudWFsbHkuICovXG4gICAgICAgICAgICAgICAgICAgIHR3ZWVuc0NvbnRhaW5lciA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjcm9sbDoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJvb3RQcm9wZXJ0eVZhbHVlOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGFydFZhbHVlOiBzY3JvbGxQb3NpdGlvbkN1cnJlbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudFZhbHVlOiBzY3JvbGxQb3NpdGlvbkN1cnJlbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5kVmFsdWU6IHNjcm9sbFBvc2l0aW9uRW5kLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuaXRUeXBlOiBcIlwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVhc2luZzogb3B0cy5lYXNpbmcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2Nyb2xsRGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250YWluZXI6IG9wdHMuY29udGFpbmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkaXJlY3Rpb246IHNjcm9sbERpcmVjdGlvbixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWx0ZXJuYXRlVmFsdWU6IHNjcm9sbFBvc2l0aW9uQ3VycmVudEFsdGVybmF0ZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50OiBlbGVtZW50XG4gICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAvKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICAgICAgVHdlZW4gRGF0YSBDb25zdHJ1Y3Rpb24gKGZvciBSZXZlcnNlKVxuICAgICAgICAgICAgICAgICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cblxuICAgICAgICAgICAgICAgIC8qIFJldmVyc2UgYWN0cyBsaWtlIGEgXCJzdGFydFwiIGFjdGlvbiBpbiB0aGF0IGEgcHJvcGVydHkgbWFwIGlzIGFuaW1hdGVkIHRvd2FyZC4gVGhlIG9ubHkgZGlmZmVyZW5jZSBpcyB0aGF0IHRoZSBwcm9wZXJ0eSBtYXAgdXNlZCBmb3IgcmV2ZXJzZSBpcyB0aGUgaW52ZXJzZSBvZiB0aGUgbWFwIHVzZWQgaW4gdGhlIHByZXZpb3VzIGNhbGwuXG4gICAgICAgICAgICAgICAgICAgVGh1cywgd2UgbWFuaXB1bGF0ZSB0aGUgcHJldmlvdXMgY2FsbCB0byBjb25zdHJ1Y3Qgb3VyIG5ldyBtYXA6IHVzZSB0aGUgcHJldmlvdXMgbWFwJ3MgZW5kIHZhbHVlcyBhcyBvdXIgbmV3IG1hcCdzIHN0YXJ0IHZhbHVlcy4gQ29weSBvdmVyIGFsbCBvdGhlciBkYXRhLiAqL1xuICAgICAgICAgICAgICAgIC8qIE5vdGU6IFJldmVyc2UgY2FuIGJlIGRpcmVjdGx5IGNhbGxlZCB2aWEgdGhlIFwicmV2ZXJzZVwiIHBhcmFtZXRlciwgb3IgaXQgY2FuIGJlIGluZGlyZWN0bHkgdHJpZ2dlcmVkIHZpYSB0aGUgbG9vcCBvcHRpb24uIChMb29wcyBhcmUgY29tcG9zZWQgb2YgbXVsdGlwbGUgcmV2ZXJzZXMuKSAqL1xuICAgICAgICAgICAgICAgIC8qIE5vdGU6IFJldmVyc2UgY2FsbHMgZG8gbm90IG5lZWQgdG8gYmUgY29uc2VjdXRpdmVseSBjaGFpbmVkIG9udG8gYSBjdXJyZW50bHktYW5pbWF0aW5nIGVsZW1lbnQgaW4gb3JkZXIgdG8gb3BlcmF0ZSBvbiBjYWNoZWQgdmFsdWVzOyB0aGVyZSBpcyBubyBoYXJtIHRvIHJldmVyc2UgYmVpbmcgY2FsbGVkIG9uIGEgcG90ZW50aWFsbHkgc3RhbGUgZGF0YSBjYWNoZSBzaW5jZVxuICAgICAgICAgICAgICAgICAgIHJldmVyc2UncyBiZWhhdmlvciBpcyBzaW1wbHkgZGVmaW5lZCBhcyByZXZlcnRpbmcgdG8gdGhlIGVsZW1lbnQncyB2YWx1ZXMgYXMgdGhleSB3ZXJlIHByaW9yIHRvIHRoZSBwcmV2aW91cyAqVmVsb2NpdHkqIGNhbGwuICovXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChhY3Rpb24gPT09IFwicmV2ZXJzZVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIC8qIEFib3J0IGlmIHRoZXJlIGlzIG5vIHByaW9yIGFuaW1hdGlvbiBkYXRhIHRvIHJldmVyc2UgdG8uICovXG4gICAgICAgICAgICAgICAgICAgIGlmICghRGF0YShlbGVtZW50KS50d2VlbnNDb250YWluZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIERlcXVldWUgdGhlIGVsZW1lbnQgc28gdGhhdCB0aGlzIHF1ZXVlIGVudHJ5IHJlbGVhc2VzIGl0c2VsZiBpbW1lZGlhdGVseSwgYWxsb3dpbmcgc3Vic2VxdWVudCBxdWV1ZSBlbnRyaWVzIHRvIHJ1bi4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICQuZGVxdWV1ZShlbGVtZW50LCBvcHRzLnF1ZXVlKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqKioqKlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgT3B0aW9ucyBQYXJzaW5nXG4gICAgICAgICAgICAgICAgICAgICAgICAqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIElmIHRoZSBlbGVtZW50IHdhcyBoaWRkZW4gdmlhIHRoZSBkaXNwbGF5IG9wdGlvbiBpbiB0aGUgcHJldmlvdXMgY2FsbCwgcmV2ZXJ0IGRpc3BsYXkgdG8gYmxvY2sgcHJpb3IgdG8gcmV2ZXJzYWwgc28gdGhhdCB0aGUgZWxlbWVudCBpcyB2aXNpYmxlIGFnYWluLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKERhdGEoZWxlbWVudCkub3B0cy5kaXNwbGF5ID09PSBcIm5vbmVcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIERhdGEoZWxlbWVudCkub3B0cy5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBJZiB0aGUgbG9vcCBvcHRpb24gd2FzIHNldCBpbiB0aGUgcHJldmlvdXMgY2FsbCwgZGlzYWJsZSBpdCBzbyB0aGF0IFwicmV2ZXJzZVwiIGNhbGxzIGFyZW4ndCByZWN1cnNpdmVseSBnZW5lcmF0ZWQuIEZ1cnRoZXIsIHJlbW92ZSB0aGUgcHJldmlvdXMgY2FsbCdzIGNhbGxiYWNrIG9wdGlvbnM7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBpY2FsbHksIHVzZXJzIGRvIG5vdCB3YW50IHRoZXNlIHRvIGJlIHJlZmlyZWQuICovXG4gICAgICAgICAgICAgICAgICAgICAgICBEYXRhKGVsZW1lbnQpLm9wdHMubG9vcCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgRGF0YShlbGVtZW50KS5vcHRzLmJlZ2luID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIERhdGEoZWxlbWVudCkub3B0cy5jb21wbGV0ZSA9IG51bGw7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIFNpbmNlIHdlJ3JlIGV4dGVuZGluZyBhbiBvcHRzIG9iamVjdCB0aGF0IGhhcyBhbHJlYWR5IGJlZW4gZXh0ZWRlZCB3aXRoIHRoZSBkZWZhdWx0cyBvcHRpb25zIG9iamVjdCwgd2UgcmVtb3ZlIG5vbi1leHBsaWNpdGx5LWRlZmluZWQgcHJvcGVydGllcyB0aGF0IGFyZSBhdXRvLWFzc2lnbmVkIHZhbHVlcy4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghb3B0aW9ucy5lYXNpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgb3B0cy5lYXNpbmc7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghb3B0aW9ucy5kdXJhdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBvcHRzLmR1cmF0aW9uO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBUaGUgb3B0cyBvYmplY3QgdXNlZCBmb3IgcmV2ZXJzYWwgaXMgYW4gZXh0ZW5zaW9uIG9mIHRoZSBvcHRpb25zIG9iamVjdCBvcHRpb25hbGx5IHBhc3NlZCBpbnRvIHRoaXMgcmV2ZXJzZSBjYWxsIHBsdXMgdGhlIG9wdGlvbnMgdXNlZCBpbiB0aGUgcHJldmlvdXMgVmVsb2NpdHkgY2FsbC4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdHMgPSAkLmV4dGVuZCh7fSwgRGF0YShlbGVtZW50KS5vcHRzLCBvcHRzKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIFR3ZWVucyBDb250YWluZXIgUmVjb25zdHJ1Y3Rpb25cbiAgICAgICAgICAgICAgICAgICAgICAgICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIENyZWF0ZSBhIGRlZXB5IGNvcHkgKGluZGljYXRlZCB2aWEgdGhlIHRydWUgZmxhZykgb2YgdGhlIHByZXZpb3VzIGNhbGwncyB0d2VlbnNDb250YWluZXIuICovXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbGFzdFR3ZWVuc0NvbnRhaW5lciA9ICQuZXh0ZW5kKHRydWUsIHt9LCBEYXRhKGVsZW1lbnQpLnR3ZWVuc0NvbnRhaW5lcik7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIE1hbmlwdWxhdGUgdGhlIHByZXZpb3VzIHR3ZWVuc0NvbnRhaW5lciBieSByZXBsYWNpbmcgaXRzIGVuZCB2YWx1ZXMgYW5kIGN1cnJlbnRWYWx1ZXMgd2l0aCBpdHMgc3RhcnQgdmFsdWVzLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgbGFzdFR3ZWVuIGluIGxhc3RUd2VlbnNDb250YWluZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBJbiBhZGRpdGlvbiB0byB0d2VlbiBkYXRhLCB0d2VlbnNDb250YWluZXJzIGNvbnRhaW4gYW4gZWxlbWVudCBwcm9wZXJ0eSB0aGF0IHdlIGlnbm9yZSBoZXJlLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsYXN0VHdlZW4gIT09IFwiZWxlbWVudFwiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBsYXN0U3RhcnRWYWx1ZSA9IGxhc3RUd2VlbnNDb250YWluZXJbbGFzdFR3ZWVuXS5zdGFydFZhbHVlO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhc3RUd2VlbnNDb250YWluZXJbbGFzdFR3ZWVuXS5zdGFydFZhbHVlID0gbGFzdFR3ZWVuc0NvbnRhaW5lcltsYXN0VHdlZW5dLmN1cnJlbnRWYWx1ZSA9IGxhc3RUd2VlbnNDb250YWluZXJbbGFzdFR3ZWVuXS5lbmRWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGFzdFR3ZWVuc0NvbnRhaW5lcltsYXN0VHdlZW5dLmVuZFZhbHVlID0gbGFzdFN0YXJ0VmFsdWU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogRWFzaW5nIGlzIHRoZSBvbmx5IG9wdGlvbiB0aGF0IGVtYmVkcyBpbnRvIHRoZSBpbmRpdmlkdWFsIHR3ZWVuIGRhdGEgKHNpbmNlIGl0IGNhbiBiZSBkZWZpbmVkIG9uIGEgcGVyLXByb3BlcnR5IGJhc2lzKS4gQWNjb3JkaW5nbHksIGV2ZXJ5IHByb3BlcnR5J3MgZWFzaW5nIHZhbHVlIG11c3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYmUgdXBkYXRlZCB3aGVuIGFuIG9wdGlvbnMgb2JqZWN0IGlzIHBhc3NlZCBpbiB3aXRoIGEgcmV2ZXJzZSBjYWxsLiBUaGUgc2lkZSBlZmZlY3Qgb2YgdGhpcyBleHRlbnNpYmlsaXR5IGlzIHRoYXQgYWxsIHBlci1wcm9wZXJ0eSBlYXNpbmcgdmFsdWVzIGFyZSBmb3JjZWZ1bGx5IHJlc2V0IHRvIHRoZSBuZXcgdmFsdWUuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXN0VHdlZW5zQ29udGFpbmVyW2xhc3RUd2Vlbl0uZWFzaW5nID0gb3B0cy5lYXNpbmc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHR3ZWVuc0NvbnRhaW5lciA9IGxhc3RUd2VlbnNDb250YWluZXI7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuICAgICAgICAgICAgICAgICAgIFR3ZWVuIERhdGEgQ29uc3RydWN0aW9uIChmb3IgU3RhcnQpXG4gICAgICAgICAgICAgICAgKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGFjdGlvbiA9PT0gXCJzdGFydFwiKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgICAgICAgICAgIFZhbHVlIFRyYW5zZmVycmluZ1xuICAgICAgICAgICAgICAgICAgICAqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgICAgICAgICAgICAgIC8qIElmIHRoaXMgcXVldWUgZW50cnkgZm9sbG93cyBhIHByZXZpb3VzIFZlbG9jaXR5LWluaXRpYXRlZCBxdWV1ZSBlbnRyeSAqYW5kKiBpZiB0aGlzIGVudHJ5IHdhcyBjcmVhdGVkIHdoaWxlIHRoZSBlbGVtZW50IHdhcyBpbiB0aGUgcHJvY2VzcyBvZiBiZWluZyBhbmltYXRlZCBieSBWZWxvY2l0eSwgdGhlbiB0aGlzIGN1cnJlbnQgY2FsbFxuICAgICAgICAgICAgICAgICAgICAgICBpcyBzYWZlIHRvIHVzZSB0aGUgZW5kIHZhbHVlcyBmcm9tIHRoZSBwcmlvciBjYWxsIGFzIGl0cyBzdGFydCB2YWx1ZXMuIFZlbG9jaXR5IGF0dGVtcHRzIHRvIHBlcmZvcm0gdGhpcyB2YWx1ZSB0cmFuc2ZlciBwcm9jZXNzIHdoZW5ldmVyIHBvc3NpYmxlIGluIG9yZGVyIHRvIGF2b2lkIHJlcXVlcnlpbmcgdGhlIERPTS4gKi9cbiAgICAgICAgICAgICAgICAgICAgLyogSWYgdmFsdWVzIGFyZW4ndCB0cmFuc2ZlcnJlZCBmcm9tIGEgcHJpb3IgY2FsbCBhbmQgc3RhcnQgdmFsdWVzIHdlcmUgbm90IGZvcmNlZmVkIGJ5IHRoZSB1c2VyIChtb3JlIG9uIHRoaXMgYmVsb3cpLCB0aGVuIHRoZSBET00gaXMgcXVlcmllZCBmb3IgdGhlIGVsZW1lbnQncyBjdXJyZW50IHZhbHVlcyBhcyBhIGxhc3QgcmVzb3J0LiAqL1xuICAgICAgICAgICAgICAgICAgICAvKiBOb3RlOiBDb252ZXJzZWx5LCBhbmltYXRpb24gcmV2ZXJzYWwgKGFuZCBsb29waW5nKSAqYWx3YXlzKiBwZXJmb3JtIGludGVyLWNhbGwgdmFsdWUgdHJhbnNmZXJzOyB0aGV5IG5ldmVyIHJlcXVlcnkgdGhlIERPTS4gKi9cbiAgICAgICAgICAgICAgICAgICAgdmFyIGxhc3RUd2VlbnNDb250YWluZXI7XG5cbiAgICAgICAgICAgICAgICAgICAgLyogVGhlIHBlci1lbGVtZW50IGlzQW5pbWF0aW5nIGZsYWcgaXMgdXNlZCB0byBpbmRpY2F0ZSB3aGV0aGVyIGl0J3Mgc2FmZSAoaS5lLiB0aGUgZGF0YSBpc24ndCBzdGFsZSkgdG8gdHJhbnNmZXIgb3ZlciBlbmQgdmFsdWVzIHRvIHVzZSBhcyBzdGFydCB2YWx1ZXMuIElmIGl0J3Mgc2V0IHRvIHRydWUgYW5kIHRoZXJlIGlzIGEgcHJldmlvdXNcbiAgICAgICAgICAgICAgICAgICAgICAgVmVsb2NpdHkgY2FsbCB0byBwdWxsIHZhbHVlcyBmcm9tLCBkbyBzby4gKi9cbiAgICAgICAgICAgICAgICAgICAgaWYgKERhdGEoZWxlbWVudCkudHdlZW5zQ29udGFpbmVyICYmIERhdGEoZWxlbWVudCkuaXNBbmltYXRpbmcgPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxhc3RUd2VlbnNDb250YWluZXIgPSBEYXRhKGVsZW1lbnQpLnR3ZWVuc0NvbnRhaW5lcjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8qKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgICAgICAgICAgVHdlZW4gRGF0YSBDYWxjdWxhdGlvblxuICAgICAgICAgICAgICAgICAgICAqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgICAgICAgICAgLyogVGhpcyBmdW5jdGlvbiBwYXJzZXMgcHJvcGVydHkgZGF0YSBhbmQgZGVmYXVsdHMgZW5kVmFsdWUsIGVhc2luZywgYW5kIHN0YXJ0VmFsdWUgYXMgYXBwcm9wcmlhdGUuICovXG4gICAgICAgICAgICAgICAgICAgIC8qIFByb3BlcnR5IG1hcCB2YWx1ZXMgY2FuIGVpdGhlciB0YWtlIHRoZSBmb3JtIG9mIDEpIGEgc2luZ2xlIHZhbHVlIHJlcHJlc2VudGluZyB0aGUgZW5kIHZhbHVlLCBvciAyKSBhbiBhcnJheSBpbiB0aGUgZm9ybSBvZiBbIGVuZFZhbHVlLCBbLCBlYXNpbmddIFssIHN0YXJ0VmFsdWVdIF0uXG4gICAgICAgICAgICAgICAgICAgICAgIFRoZSBvcHRpb25hbCB0aGlyZCBwYXJhbWV0ZXIgaXMgYSBmb3JjZWZlZCBzdGFydFZhbHVlIHRvIGJlIHVzZWQgaW5zdGVhZCBvZiBxdWVyeWluZyB0aGUgRE9NIGZvciB0aGUgZWxlbWVudCdzIGN1cnJlbnQgdmFsdWUuIFJlYWQgVmVsb2NpdHkncyBkb2NtZW50YXRpb24gdG8gbGVhcm4gbW9yZSBhYm91dCBmb3JjZWZlZWRpbmc6IFZlbG9jaXR5SlMub3JnLyNmb3JjZWZlZWRpbmcgKi9cbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gcGFyc2VQcm9wZXJ0eVZhbHVlICh2YWx1ZURhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBlbmRWYWx1ZSA9IHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlYXNpbmcgPSB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnRWYWx1ZSA9IHVuZGVmaW5lZDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLyogSGFuZGxlIHRoZSBhcnJheSBmb3JtYXQsIHdoaWNoIGNhbiBiZSBzdHJ1Y3R1cmVkIGFzIG9uZSBvZiB0aHJlZSBwb3RlbnRpYWwgb3ZlcmxvYWRzOiBBKSBbIGVuZFZhbHVlLCBlYXNpbmcsIHN0YXJ0VmFsdWUgXSwgQikgWyBlbmRWYWx1ZSwgZWFzaW5nIF0sIG9yIEMpIFsgZW5kVmFsdWUsIHN0YXJ0VmFsdWUgXSAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKFR5cGUuaXNBcnJheSh2YWx1ZURhdGEpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogZW5kVmFsdWUgaXMgYWx3YXlzIHRoZSBmaXJzdCBpdGVtIGluIHRoZSBhcnJheS4gRG9uJ3QgYm90aGVyIHZhbGlkYXRpbmcgZW5kVmFsdWUncyB2YWx1ZSBub3cgc2luY2UgdGhlIGVuc3VpbmcgcHJvcGVydHkgY3ljbGluZyBsb2dpYyBpbmhlcmVudGx5IGRvZXMgdGhhdC4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmRWYWx1ZSA9IHZhbHVlRGF0YVswXTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIFR3by1pdGVtIGFycmF5IGZvcm1hdDogSWYgdGhlIHNlY29uZCBpdGVtIGlzIGEgbnVtYmVyIG9yIGEgZnVuY3Rpb24sIHRyZWF0IGl0IGFzIGEgc3RhcnQgdmFsdWUgc2luY2UgZWFzaW5ncyBjYW4gb25seSBiZSBzdHJpbmdzIG9yIGFycmF5cy4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoKCFUeXBlLmlzQXJyYXkodmFsdWVEYXRhWzFdKSAmJiAvXltcXGQtXS8udGVzdCh2YWx1ZURhdGFbMV0pKSB8fCBUeXBlLmlzRnVuY3Rpb24odmFsdWVEYXRhWzFdKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGFydFZhbHVlID0gdmFsdWVEYXRhWzFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIFR3byBvciB0aHJlZS1pdGVtIGFycmF5OiBJZiB0aGUgc2Vjb25kIGl0ZW0gaXMgYSBzdHJpbmcsIHRyZWF0IGl0IGFzIGFuIGVhc2luZy4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKFR5cGUuaXNTdHJpbmcodmFsdWVEYXRhWzFdKSB8fCBUeXBlLmlzQXJyYXkodmFsdWVEYXRhWzFdKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlYXNpbmcgPSBnZXRFYXNpbmcodmFsdWVEYXRhWzFdLCBvcHRzLmR1cmF0aW9uKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBEb24ndCBib3RoZXIgdmFsaWRhdGluZyBzdGFydFZhbHVlJ3MgdmFsdWUgbm93IHNpbmNlIHRoZSBlbnN1aW5nIHByb3BlcnR5IGN5Y2xpbmcgbG9naWMgaW5oZXJlbnRseSBkb2VzIHRoYXQuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZURhdGFbMl0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0VmFsdWUgPSB2YWx1ZURhdGFbMl07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBIYW5kbGUgdGhlIHNpbmdsZS12YWx1ZSBmb3JtYXQuICovXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZFZhbHVlID0gdmFsdWVEYXRhO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBEZWZhdWx0IHRvIHRoZSBjYWxsJ3MgZWFzaW5nIGlmIGEgcGVyLXByb3BlcnR5IGVhc2luZyB0eXBlIHdhcyBub3QgZGVmaW5lZC4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIGVhc2luZyA9IGVhc2luZyB8fCBvcHRzLmVhc2luZztcblxuICAgICAgICAgICAgICAgICAgICAgICAgLyogSWYgZnVuY3Rpb25zIHdlcmUgcGFzc2VkIGluIGFzIHZhbHVlcywgcGFzcyB0aGUgZnVuY3Rpb24gdGhlIGN1cnJlbnQgZWxlbWVudCBhcyBpdHMgY29udGV4dCwgcGx1cyB0aGUgZWxlbWVudCdzIGluZGV4IGFuZCB0aGUgZWxlbWVudCBzZXQncyBzaXplIGFzIGFyZ3VtZW50cy4gVGhlbiwgYXNzaWduIHRoZSByZXR1cm5lZCB2YWx1ZS4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChUeXBlLmlzRnVuY3Rpb24oZW5kVmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5kVmFsdWUgPSBlbmRWYWx1ZS5jYWxsKGVsZW1lbnQsIGVsZW1lbnRzSW5kZXgsIGVsZW1lbnRzTGVuZ3RoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKFR5cGUuaXNGdW5jdGlvbihzdGFydFZhbHVlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0VmFsdWUgPSBzdGFydFZhbHVlLmNhbGwoZWxlbWVudCwgZWxlbWVudHNJbmRleCwgZWxlbWVudHNMZW5ndGgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBBbGxvdyBzdGFydFZhbHVlIHRvIGJlIGxlZnQgYXMgdW5kZWZpbmVkIHRvIGluZGljYXRlIHRvIHRoZSBlbnN1aW5nIGNvZGUgdGhhdCBpdHMgdmFsdWUgd2FzIG5vdCBmb3JjZWZlZC4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBbIGVuZFZhbHVlIHx8IDAsIGVhc2luZywgc3RhcnRWYWx1ZSBdO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLyogQ3JlYXRlIGEgdHdlZW4gb3V0IG9mIGVhY2ggcHJvcGVydHksIGFuZCBhcHBlbmQgaXRzIGFzc29jaWF0ZWQgZGF0YSB0byB0d2VlbnNDb250YWluZXIuICovXG4gICAgICAgICAgICAgICAgICAgIGZvciAodmFyIHByb3BlcnR5IGluIHByb3BlcnRpZXNNYXApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIE5vcm1hbGl6ZSBwcm9wZXJ0eSBuYW1lcyB2aWEgY2FtZWwgY2FzaW5nIHNvIHRoYXQgcHJvcGVydGllcyBjYW4gYmUgY29uc2lzdGVudGx5IG1hbmlwdWxhdGVkLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBTdGFydCBWYWx1ZSBTb3VyY2luZ1xuICAgICAgICAgICAgICAgICAgICAgICAgKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIFBhcnNlIG91dCBlbmRWYWx1ZSwgZWFzaW5nLCBhbmQgc3RhcnRWYWx1ZSBmcm9tIHRoZSBwcm9wZXJ0eSdzIGRhdGEuICovXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgdmFsdWVEYXRhID0gcGFyc2VQcm9wZXJ0eVZhbHVlKHByb3BlcnRpZXNNYXBbcHJvcGVydHldKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmRWYWx1ZSA9IHZhbHVlRGF0YVswXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlYXNpbmcgPSB2YWx1ZURhdGFbMV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnRWYWx1ZSA9IHZhbHVlRGF0YVsyXTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLyogTm93IHRoYXQgdGhlIG9yaWdpbmFsIHByb3BlcnR5IG5hbWUncyBmb3JtYXQgaGFzIGJlZW4gdXNlZCBmb3IgdGhlIHBhcnNlUHJvcGVydHlWYWx1ZSgpIGxvb2t1cCBhYm92ZSwgd2UgZm9yY2UgdGhlIHByb3BlcnR5IHRvIGl0cyBjYW1lbENhc2Ugc3R5bGluZyB0byBub3JtYWxpemUgaXQgZm9yIG1hbmlwdWxhdGlvbi4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5ID0gQ1NTLk5hbWVzLmNhbWVsQ2FzZShwcm9wZXJ0eSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIEluIGNhc2UgdGhpcyBwcm9wZXJ0eSBpcyBhIGhvb2ssIHRoZXJlIGFyZSBjaXJjdW1zdGFuY2VzIHdoZXJlIHdlIHdpbGwgaW50ZW5kIHRvIHdvcmsgb24gdGhlIGhvb2sncyByb290IHByb3BlcnR5IGFuZCBub3QgdGhlIGhvb2tlZCBzdWJwcm9wZXJ0eS4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByb290UHJvcGVydHkgPSBDU1MuSG9va3MuZ2V0Um9vdChwcm9wZXJ0eSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcm9vdFByb3BlcnR5VmFsdWUgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLyogUHJvcGVydGllcyB0aGF0IGFyZSBub3Qgc3VwcG9ydGVkIGJ5IHRoZSBicm93c2VyIChhbmQgZG8gbm90IGhhdmUgYW4gYXNzb2NpYXRlZCBub3JtYWxpemF0aW9uKSB3aWxsIGluaGVyZW50bHkgcHJvZHVjZSBubyBzdHlsZSBjaGFuZ2VzIHdoZW4gc2V0LCBzbyB0aGV5IGFyZSBza2lwcGVkIGluIG9yZGVyIHRvIGRlY3JlYXNlIGFuaW1hdGlvbiB0aWNrIG92ZXJoZWFkLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgUHJvcGVydHkgc3VwcG9ydCBpcyBkZXRlcm1pbmVkIHZpYSBwcmVmaXhDaGVjaygpLCB3aGljaCByZXR1cm5zIGEgZmFsc2UgZmxhZyB3aGVuIG5vIHN1cHBvcnRlZCBpcyBkZXRlY3RlZC4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChDU1MuTmFtZXMucHJlZml4Q2hlY2socm9vdFByb3BlcnR5KVsxXSA9PT0gZmFsc2UgJiYgQ1NTLk5vcm1hbGl6YXRpb25zLnJlZ2lzdGVyZWRbcm9vdFByb3BlcnR5XSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKFZlbG9jaXR5LmRlYnVnKSBjb25zb2xlLmxvZyhcIlNraXBwaW5nIFtcIiArIHJvb3RQcm9wZXJ0eSArIFwiXSBkdWUgdG8gYSBsYWNrIG9mIGJyb3dzZXIgc3VwcG9ydC5cIik7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLyogSWYgdGhlIGRpc3BsYXkgb3B0aW9uIGlzIGJlaW5nIHNldCB0byBhIG5vbi1cIm5vbmVcIiAoZS5nLiBcImJsb2NrXCIpIGFuZCBvcGFjaXR5IChmaWx0ZXIgb24gSUU8PTgpIGlzIGJlaW5nIGFuaW1hdGVkIHRvIGFuIGVuZFZhbHVlIG9mIG5vbi16ZXJvLCB0aGUgdXNlcidzIGludGVudGlvbiBpcyB0byBmYWRlIGluIGZyb20gaW52aXNpYmxlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgdGh1cyB3ZSBmb3JjZWZlZWQgb3BhY2l0eSBhIHN0YXJ0VmFsdWUgb2YgMCBpZiBpdHMgc3RhcnRWYWx1ZSBoYXNuJ3QgYWxyZWFkeSBiZWVuIHNvdXJjZWQgYnkgdmFsdWUgdHJhbnNmZXJyaW5nIG9yIHByaW9yIGZvcmNlZmVlZGluZy4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICgob3B0cy5kaXNwbGF5ICYmIG9wdHMuZGlzcGxheSAhPT0gXCJub25lXCIpICYmIC9vcGFjaXR5fGZpbHRlci8udGVzdChwcm9wZXJ0eSkgJiYgIXN0YXJ0VmFsdWUgJiYgZW5kVmFsdWUgIT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGFydFZhbHVlID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLyogSWYgdmFsdWVzIGhhdmUgYmVlbiB0cmFuc2ZlcnJlZCBmcm9tIHRoZSBwcmV2aW91cyBWZWxvY2l0eSBjYWxsLCBleHRyYWN0IHRoZSBlbmRWYWx1ZSBhbmQgcm9vdFByb3BlcnR5VmFsdWUgZm9yIGFsbCBvZiB0aGUgY3VycmVudCBjYWxsJ3MgcHJvcGVydGllcyB0aGF0IHdlcmUgKmFsc28qIGFuaW1hdGVkIGluIHRoZSBwcmV2aW91cyBjYWxsLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgLyogTm90ZTogVmFsdWUgdHJhbnNmZXJyaW5nIGNhbiBvcHRpb25hbGx5IGJlIGRpc2FibGVkIGJ5IHRoZSB1c2VyIHZpYSB0aGUgX2NhY2hlVmFsdWVzIG9wdGlvbi4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvcHRzLl9jYWNoZVZhbHVlcyAmJiBsYXN0VHdlZW5zQ29udGFpbmVyICYmIGxhc3RUd2VlbnNDb250YWluZXJbcHJvcGVydHldKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXJ0VmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGFydFZhbHVlID0gbGFzdFR3ZWVuc0NvbnRhaW5lcltwcm9wZXJ0eV0uZW5kVmFsdWUgKyBsYXN0VHdlZW5zQ29udGFpbmVyW3Byb3BlcnR5XS51bml0VHlwZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBUaGUgcHJldmlvdXMgY2FsbCdzIHJvb3RQcm9wZXJ0eVZhbHVlIGlzIGV4dHJhY3RlZCBmcm9tIHRoZSBlbGVtZW50J3MgZGF0YSBjYWNoZSBzaW5jZSB0aGF0J3MgdGhlIGluc3RhbmNlIG9mIHJvb3RQcm9wZXJ0eVZhbHVlIHRoYXQgZ2V0cyBmcmVzaGx5IHVwZGF0ZWQgYnkgdGhlIHR3ZWVuaW5nIHByb2Nlc3MsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2hlcmVhcyB0aGUgcm9vdFByb3BlcnR5VmFsdWUgYXR0YWNoZWQgdG8gdGhlIGluY29taW5nIGxhc3RUd2VlbnNDb250YWluZXIgaXMgZXF1YWwgdG8gdGhlIHJvb3QgcHJvcGVydHkncyB2YWx1ZSBwcmlvciB0byBhbnkgdHdlZW5pbmcuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcm9vdFByb3BlcnR5VmFsdWUgPSBEYXRhKGVsZW1lbnQpLnJvb3RQcm9wZXJ0eVZhbHVlQ2FjaGVbcm9vdFByb3BlcnR5XTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIElmIHZhbHVlcyB3ZXJlIG5vdCB0cmFuc2ZlcnJlZCBmcm9tIGEgcHJldmlvdXMgVmVsb2NpdHkgY2FsbCwgcXVlcnkgdGhlIERPTSBhcyBuZWVkZWQuICovXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIEhhbmRsZSBob29rZWQgcHJvcGVydGllcy4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoQ1NTLkhvb2tzLnJlZ2lzdGVyZWRbcHJvcGVydHldKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXJ0VmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcm9vdFByb3BlcnR5VmFsdWUgPSBDU1MuZ2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCByb290UHJvcGVydHkpOyAvKiBHRVQgKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIE5vdGU6IFRoZSBmb2xsb3dpbmcgZ2V0UHJvcGVydHlWYWx1ZSgpIGNhbGwgZG9lcyBub3QgYWN0dWFsbHkgdHJpZ2dlciBhIERPTSBxdWVyeTsgZ2V0UHJvcGVydHlWYWx1ZSgpIHdpbGwgZXh0cmFjdCB0aGUgaG9vayBmcm9tIHJvb3RQcm9wZXJ0eVZhbHVlLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnRWYWx1ZSA9IENTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIHByb3BlcnR5LCByb290UHJvcGVydHlWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIElmIHN0YXJ0VmFsdWUgaXMgYWxyZWFkeSBkZWZpbmVkIHZpYSBmb3JjZWZlZWRpbmcsIGRvIG5vdCBxdWVyeSB0aGUgRE9NIGZvciB0aGUgcm9vdCBwcm9wZXJ0eSdzIHZhbHVlOyBqdXN0IGdyYWIgcm9vdFByb3BlcnR5J3MgemVyby12YWx1ZSB0ZW1wbGF0ZSBmcm9tIENTUy5Ib29rcy4gVGhpcyBvdmVyd3JpdGVzIHRoZSBlbGVtZW50J3MgYWN0dWFsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJvb3QgcHJvcGVydHkgdmFsdWUgKGlmIG9uZSBpcyBzZXQpLCBidXQgdGhpcyBpcyBhY2NlcHRhYmxlIHNpbmNlIHRoZSBwcmltYXJ5IHJlYXNvbiB1c2VycyBmb3JjZWZlZWQgaXMgdG8gYXZvaWQgRE9NIHF1ZXJpZXMsIGFuZCB0aHVzIHdlIGxpa2V3aXNlIGF2b2lkIHF1ZXJ5aW5nIHRoZSBET00gZm9yIHRoZSByb290IHByb3BlcnR5J3MgdmFsdWUuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBHcmFiIHRoaXMgaG9vaydzIHplcm8tdmFsdWUgdGVtcGxhdGUsIGUuZy4gXCIwcHggMHB4IDBweCBibGFja1wiLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcm9vdFByb3BlcnR5VmFsdWUgPSBDU1MuSG9va3MudGVtcGxhdGVzW3Jvb3RQcm9wZXJ0eV1bMV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBIYW5kbGUgbm9uLWhvb2tlZCBwcm9wZXJ0aWVzIHRoYXQgaGF2ZW4ndCBhbHJlYWR5IGJlZW4gZGVmaW5lZCB2aWEgZm9yY2VmZWVkaW5nLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhcnRWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0VmFsdWUgPSBDU1MuZ2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBwcm9wZXJ0eSk7IC8qIEdFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBWYWx1ZSBEYXRhIEV4dHJhY3Rpb25cbiAgICAgICAgICAgICAgICAgICAgICAgICoqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgc2VwYXJhdGVkVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5kVmFsdWVVbml0VHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGFydFZhbHVlVW5pdFR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3BlcmF0b3I7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIFNlcGFyYXRlcyBhIHByb3BlcnR5IHZhbHVlIGludG8gaXRzIG51bWVyaWMgdmFsdWUgYW5kIGl0cyB1bml0IHR5cGUuICovXG4gICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBzZXBhcmF0ZVZhbHVlIChwcm9wZXJ0eSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgdW5pdFR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG51bWVyaWNWYWx1ZTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG51bWVyaWNWYWx1ZSA9ICh2YWx1ZSB8fCAwKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAudG9TdHJpbmcoKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAudG9Mb3dlckNhc2UoKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBNYXRjaCB0aGUgdW5pdCB0eXBlIGF0IHRoZSBlbmQgb2YgdGhlIHZhbHVlLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvWyVBLXpdKyQvLCBmdW5jdGlvbihtYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogR3JhYiB0aGUgdW5pdCB0eXBlLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdW5pdFR5cGUgPSBtYXRjaDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogU3RyaXAgdGhlIHVuaXQgdHlwZSBvZmYgb2YgdmFsdWUuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBJZiBubyB1bml0IHR5cGUgd2FzIHN1cHBsaWVkLCBhc3NpZ24gb25lIHRoYXQgaXMgYXBwcm9wcmlhdGUgZm9yIHRoaXMgcHJvcGVydHkgKGUuZy4gXCJkZWdcIiBmb3Igcm90YXRlWiBvciBcInB4XCIgZm9yIHdpZHRoKS4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXVuaXRUeXBlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuaXRUeXBlID0gQ1NTLlZhbHVlcy5nZXRVbml0VHlwZShwcm9wZXJ0eSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFsgbnVtZXJpY1ZhbHVlLCB1bml0VHlwZSBdO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBTZXBhcmF0ZSBzdGFydFZhbHVlLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VwYXJhdGVkVmFsdWUgPSBzZXBhcmF0ZVZhbHVlKHByb3BlcnR5LCBzdGFydFZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0VmFsdWUgPSBzZXBhcmF0ZWRWYWx1ZVswXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0VmFsdWVVbml0VHlwZSA9IHNlcGFyYXRlZFZhbHVlWzFdO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBTZXBhcmF0ZSBlbmRWYWx1ZSwgYW5kIGV4dHJhY3QgYSB2YWx1ZSBvcGVyYXRvciAoZS5nLiBcIis9XCIsIFwiLT1cIikgaWYgb25lIGV4aXN0cy4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIHNlcGFyYXRlZFZhbHVlID0gc2VwYXJhdGVWYWx1ZShwcm9wZXJ0eSwgZW5kVmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZW5kVmFsdWUgPSBzZXBhcmF0ZWRWYWx1ZVswXS5yZXBsYWNlKC9eKFsrLVxcLypdKT0vLCBmdW5jdGlvbihtYXRjaCwgc3ViTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcGVyYXRvciA9IHN1Yk1hdGNoO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogU3RyaXAgdGhlIG9wZXJhdG9yIG9mZiBvZiB0aGUgdmFsdWUuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuZFZhbHVlVW5pdFR5cGUgPSBzZXBhcmF0ZWRWYWx1ZVsxXTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLyogUGFyc2UgZmxvYXQgdmFsdWVzIGZyb20gZW5kVmFsdWUgYW5kIHN0YXJ0VmFsdWUuIERlZmF1bHQgdG8gMCBpZiBOYU4gaXMgcmV0dXJuZWQuICovXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGFydFZhbHVlID0gcGFyc2VGbG9hdChzdGFydFZhbHVlKSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgZW5kVmFsdWUgPSBwYXJzZUZsb2F0KGVuZFZhbHVlKSB8fCAwO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIFZhbHVlICYgVW5pdCBDb252ZXJzaW9uXG4gICAgICAgICAgICAgICAgICAgICAgICAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cblxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGVsZW1lbnRVbml0UmF0aW9zO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBDdXN0b20gc3VwcG9ydCBmb3IgcHJvcGVydGllcyB0aGF0IGRvbid0IGFjdHVhbGx5IGFjY2VwdCB0aGUgJSB1bml0IHR5cGUsIGJ1dCB3aGVyZSBwb2xseWZpbGxpbmcgaXMgdHJpdmlhbCBhbmQgcmVsYXRpdmVseSBmb29scHJvb2YuICovXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZW5kVmFsdWVVbml0VHlwZSA9PT0gXCIlXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBBICUtdmFsdWUgZm9udFNpemUvbGluZUhlaWdodCBpcyByZWxhdGl2ZSB0byB0aGUgcGFyZW50J3MgZm9udFNpemUgKGFzIG9wcG9zZWQgdG8gdGhlIHBhcmVudCdzIGRpbWVuc2lvbnMpLCB3aGljaCBpcyBpZGVudGljYWwgdG8gdGhlIGVtIHVuaXQncyBiZWhhdmlvciwgc28gd2UgcGlnZ3liYWNrIG9mZiBvZiB0aGF0LiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICgvXihmb250U2l6ZXxsaW5lSGVpZ2h0KSQvLnRlc3QocHJvcGVydHkpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIENvbnZlcnQgJSBpbnRvIGFuIGVtIGRlY2ltYWwgdmFsdWUuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZFZhbHVlID0gZW5kVmFsdWUgLyAxMDA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZFZhbHVlVW5pdFR5cGUgPSBcImVtXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogRm9yIHNjYWxlWCBhbmQgc2NhbGVZLCBjb252ZXJ0IHRoZSB2YWx1ZSBpbnRvIGl0cyBkZWNpbWFsIGZvcm1hdCBhbmQgc3RyaXAgb2ZmIHRoZSB1bml0IHR5cGUuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICgvXnNjYWxlLy50ZXN0KHByb3BlcnR5KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmRWYWx1ZSA9IGVuZFZhbHVlIC8gMTAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmRWYWx1ZVVuaXRUeXBlID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBGb3IgUkdCIGNvbXBvbmVudHMsIHRha2UgdGhlIGRlZmluZWQgcGVyY2VudGFnZSBvZiAyNTUgYW5kIHN0cmlwIG9mZiB0aGUgdW5pdCB0eXBlLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoLyhSZWR8R3JlZW58Qmx1ZSkkL2kudGVzdChwcm9wZXJ0eSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5kVmFsdWUgPSAoZW5kVmFsdWUgLyAxMDApICogMjU1O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmRWYWx1ZVVuaXRUeXBlID0gXCJcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIFdoZW4gcXVlcmllZCwgdGhlIGJyb3dzZXIgcmV0dXJucyAobW9zdCkgQ1NTIHByb3BlcnR5IHZhbHVlcyBpbiBwaXhlbHMuIFRoZXJlZm9yZSwgaWYgYW4gZW5kVmFsdWUgd2l0aCBhIHVuaXQgdHlwZSBvZiAlLCBlbSwgb3IgcmVtIGlzIGFuaW1hdGVkIHRvd2FyZCwgc3RhcnRWYWx1ZSBtdXN0IGJlIGNvbnZlcnRlZCBmcm9tIHBpeGVscyBpbnRvIHRoZSBzYW1lIHVuaXQgdHlwZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgYXMgZW5kVmFsdWUgaW4gb3JkZXIgZm9yIHZhbHVlIG1hbmlwdWxhdGlvbiBsb2dpYyAoaW5jcmVtZW50L2RlY3JlbWVudCkgdG8gcHJvY2VlZC4gRnVydGhlciwgaWYgdGhlIHN0YXJ0VmFsdWUgd2FzIGZvcmNlZmVkIG9yIHRyYW5zZmVycmVkIGZyb20gYSBwcmV2aW91cyBjYWxsLCBzdGFydFZhbHVlIG1heSBhbHNvIG5vdCBiZSBpbiBwaXhlbHMuIFVuaXQgY29udmVyc2lvbiBsb2dpY1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhlcmVmb3JlIGNvbnNpc3RzIG9mIHR3byBzdGVwczogMSkgQ2FsY3VsYXRpbmcgdGhlIHJhdGlvIG9mICUsL2VtL3JlbSByZWxhdGl2ZSB0byBwaXhlbHMgdGhlbiAyKSBDb252ZXJ0aW5nIHN0YXJ0VmFsdWUgaW50byB0aGUgc2FtZSB1bml0IG9mIG1lYXN1cmVtZW50IGFzIGVuZFZhbHVlIGJhc2VkIG9uIHRoZXNlIHJhdGlvcy4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIFVuaXQgY29udmVyc2lvbiByYXRpb3MgYXJlIGNhbGN1bGF0ZWQgYnkgbW9tZW50YXJpbHkgc2V0dGluZyBhIHZhbHVlIHdpdGggdGhlIHRhcmdldCB1bml0IHR5cGUgb24gdGhlIGVsZW1lbnQsIGNvbXBhcmluZyB0aGUgcmV0dXJuZWQgcGl4ZWwgdmFsdWUsIHRoZW4gcmV2ZXJ0aW5nIHRvIHRoZSBvcmlnaW5hbCB2YWx1ZS4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIE5vdGU6IEV2ZW4gaWYgb25seSBvbmUgb2YgdGhlc2UgdW5pdCB0eXBlcyBpcyBiZWluZyBhbmltYXRlZCwgYWxsIHVuaXQgcmF0aW9zIGFyZSBjYWxjdWxhdGVkIGF0IG9uY2Ugc2luY2UgdGhlIG92ZXJoZWFkIG9mIGJhdGNoaW5nIHRoZSBTRVRzIGFuZCBHRVRzIHRvZ2V0aGVyIHVwZnJvbnQgb3V0d2VpZ2h0cyB0aGUgcG90ZW50aWFsIG92ZXJoZWFkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvZiBsYXlvdXQgdGhyYXNoaW5nIGNhdXNlZCBieSByZS1xdWVyeWluZyBmb3IgdW5jYWxjdWxhdGVkIHJhdGlvcyBmb3Igc3Vic2VxdWVudGx5LXByb2Nlc3NlZCBwcm9wZXJ0aWVzLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgLyogTm90ZTogSW5zdGVhZCBvZiBhZGp1c3RpbmcgdGhlIENTUyBwcm9wZXJ0aWVzIG9uIHRoZSB0YXJnZXQgZWxlbWVudCwgYW4gYWx0ZXJuYXRpdmUgd2F5IG9mIHBlcmZvcm1pbmcgdmFsdWUgY29udmVyc2lvbiBpcyB0byBpbmplY3QgYSBjbG9uZWQgZWxlbWVudCBpbnRvIHRoZSBlbGVtZW50J3MgcGFyZW50IGFuZCBtYW5pcHVsYXRlICppdHMqIHZhbHVlcyBpbnN0ZWFkLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgVGhpcyBpcyBhIGNsZWFuZXIgbWV0aG9kIHRoYXQgYXZvaWRzIHRoZSBlbnN1aW5nIHJvdW5kcyBvZiBsYXlvdXQgdGhyYXNoaW5nLCBidXQgaXQncyB1bHRpbWF0ZWx5IGxlc3MgcGVyZm9ybWFudCBkdWUgdG8gdGhlIG92ZXJoZWFkIGludm9sdmVkIHdpdGggRE9NIHRyZWUgbW9kaWZpY2F0aW9uIChlbGVtZW50IGluc2VydGlvbi9kZWxldGlvbikuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBUb2RvOiBTaGlmdCB0aGlzIGxvZ2ljIGludG8gdGhlIGNhbGxzJyBmaXJzdCB0aWNrIGluc3RhbmNlIHNvIHRoYXQgaXQncyBzeW5jZWQgd2l0aCBSQUYuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBUb2RvOiBTdG9yZSB0aGUgb3JpZ2luYWwgdmFsdWVzIGFuZCBza2lwIHJlLXNldHRpbmcgaWYgd2UncmUgYW5pbWF0aW5nIGhlaWdodCBvciB3aWR0aCBpbiB0aGUgcHJvcGVydGllcyBtYXAuICovXG4gICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBjYWxjdWxhdGVVbml0UmF0aW9zICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBUaGUgcHJvcGVydGllcyBiZWxvdyBhcmUgdXNlZCB0byBkZXRlcm1pbmUgd2hldGhlciB0aGUgZWxlbWVudCBkaWZmZXJzIHN1ZmZpY2llbnRseSBmcm9tIHRoaXMgc2FtZSBjYWxsJ3MgcHJpb3IgZWxlbWVudCAoaW4gdGhlIG92ZXJhbGwgZWxlbWVudCBzZXQpIHRvIGFsc28gZGlmZmVyIGluIGl0cyB1bml0IGNvbnZlcnNpb24gcmF0aW9zLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIElmIHRoZSBwcm9wZXJ0aWVzIG1hdGNoIHVwIHdpdGggdGhvc2Ugb2YgdGhlIHByaW9yIGVsZW1lbnQsIHRoZSBwcmlvciBlbGVtZW50J3MgY29udmVyc2lvbiByYXRpb3MgYXJlIHVzZWQuIExpa2UgbW9zdCBvcHRpbWl6YXRpb25zIGluIFZlbG9jaXR5LCB0aGlzIGlzIGRvbmUgdG8gbWluaW1pemUgRE9NIHF1ZXJ5aW5nLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBzYW1lUmF0aW9JbmRpY2F0b3JzID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50OiBlbGVtZW50LnBhcmVudE5vZGUsIC8qIEdFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IENTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwicG9zaXRpb25cIiksIC8qIEdFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9udFNpemU6IENTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwiZm9udFNpemVcIikgLyogR0VUICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIERldGVybWluZSBpZiB0aGUgc2FtZSAlIHJhdGlvIGNhbiBiZSB1c2VkLiAlIGlzIHJlbGF0aXZlIHRvIHRoZSBlbGVtZW50J3MgcG9zaXRpb24gdmFsdWUgYW5kIHRoZSBwYXJlbnQncyB3aWR0aCBhbmQgaGVpZ2h0IGRpbWVuc2lvbnMuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNhbWVCYXNlUGVyY2VudCA9ICgoc2FtZVJhdGlvSW5kaWNhdG9ycy5wb3NpdGlvbiA9PT0gdW5pdENvbnZlcnNpb25SYXRpb3MubGFzdFBvc2l0aW9uKSAmJiAoc2FtZVJhdGlvSW5kaWNhdG9ycy5wYXJlbnQgPT09IHVuaXRDb252ZXJzaW9uUmF0aW9zLmxhc3RQYXJlbnQpKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogRGV0ZXJtaW5lIGlmIHRoZSBzYW1lIGVtIHJhdGlvIGNhbiBiZSB1c2VkLiBlbSBpcyByZWxhdGl2ZSB0byB0aGUgZWxlbWVudCdzIGZvbnRTaXplLCB3aGljaCBpdHNlbGYgaXMgcmVsYXRpdmUgdG8gdGhlIHBhcmVudCdzIGZvbnRTaXplLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzYW1lQmFzZUVtID0gKChzYW1lUmF0aW9JbmRpY2F0b3JzLmZvbnRTaXplID09PSB1bml0Q29udmVyc2lvblJhdGlvcy5sYXN0Rm9udFNpemUpICYmIChzYW1lUmF0aW9JbmRpY2F0b3JzLnBhcmVudCA9PT0gdW5pdENvbnZlcnNpb25SYXRpb3MubGFzdFBhcmVudCkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogU3RvcmUgdGhlc2UgcmF0aW8gaW5kaWNhdG9ycyBjYWxsLXdpZGUgZm9yIHRoZSBuZXh0IGVsZW1lbnQgdG8gY29tcGFyZSBhZ2FpbnN0LiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuaXRDb252ZXJzaW9uUmF0aW9zLmxhc3RQYXJlbnQgPSBzYW1lUmF0aW9JbmRpY2F0b3JzLnBhcmVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bml0Q29udmVyc2lvblJhdGlvcy5sYXN0UG9zaXRpb24gPSBzYW1lUmF0aW9JbmRpY2F0b3JzLnBvc2l0aW9uO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuaXRDb252ZXJzaW9uUmF0aW9zLmxhc3RGb250U2l6ZSA9IHNhbWVSYXRpb0luZGljYXRvcnMuZm9udFNpemU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBXaGVyZWFzICUgYW5kIGVtIHJhdGlvcyBhcmUgZGV0ZXJtaW5lZCBvbiBhIHBlci1lbGVtZW50IGJhc2lzLCB0aGUgcmVtIHVuaXQgdHlwZSBvbmx5IG5lZWRzIHRvIGJlIGNoZWNrZWQgb25jZSBwZXIgY2FsbCBzaW5jZSBpdCBpcyBleGNsdXNpdmVseSBkZXBlbmRhbnQgdXBvbiB0aGUgYm9keSBlbGVtZW50J3MgZm9udFNpemUuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSWYgdGhpcyBpcyB0aGUgZmlyc3QgdGltZSB0aGF0IGNhbGN1bGF0ZVVuaXRSYXRpb3MoKSBpcyBiZWluZyBydW4gZHVyaW5nIHRoaXMgY2FsbCwgcmVtVG9QeFJhdGlvIHdpbGwgc3RpbGwgYmUgc2V0IHRvIGl0cyBkZWZhdWx0IHZhbHVlIG9mIG51bGwsIHNvIHdlIGNhbGN1bGF0ZSBpdCBub3cuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHVuaXRDb252ZXJzaW9uUmF0aW9zLnJlbVRvUHhSYXRpbyA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBEZWZhdWx0IHRvIG1vc3QgYnJvd3NlcnMnIGRlZmF1bHQgZm9udFNpemUgb2YgMTZweCBpbiB0aGUgY2FzZSBvZiAwLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bml0Q29udmVyc2lvblJhdGlvcy5yZW1Ub1B4UmF0aW8gPSBwYXJzZUZsb2F0KENTUy5nZXRQcm9wZXJ0eVZhbHVlKGRvY3VtZW50LmJvZHksIFwiZm9udFNpemVcIikpIHx8IDE2OyAvKiBHRVQgKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgb3JpZ2luYWxWYWx1ZXMgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBUbyBhY2N1cmF0ZWx5IGFuZCBjb25zaXN0ZW50bHkgY2FsY3VsYXRlIGNvbnZlcnNpb24gcmF0aW9zLCB0aGUgZWxlbWVudCdzIG92ZXJmbG93IGFuZCBib3gtc2l6aW5nIGFyZSB0ZW1wb3JhcmlseSByZW1vdmVkLiBCb3RoIHByb3BlcnRpZXMgbW9kaWZ5IGFuIGVsZW1lbnQncyB2aXNpYmxlIGRpbWVuc2lvbnMuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBOb3RlOiBPdmVyZmxvdyBtdXN0IGJlIG1hbmlwdWxhdGVkIG9uIGEgcGVyLWF4aXMgYmFzaXMgc2luY2UgdGhlIHBsYWluIG92ZXJmbG93IHByb3BlcnR5IG92ZXJ3cml0ZXMgaXRzIHN1YnByb3BlcnRpZXMnIHZhbHVlcy4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG92ZXJmbG93WDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG92ZXJmbG93WTogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJveFNpemluZzogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIHdpZHRoIGFuZCBoZWlnaHQgYWN0IGFzIG91ciBwcm94eSBwcm9wZXJ0aWVzIGZvciBtZWFzdXJpbmcgdGhlIGhvcml6b250YWwgYW5kIHZlcnRpY2FsICUgcmF0aW9zLiBTaW5jZSB0aGV5IGNhbiBiZSBhcnRpZmljaWFsbHkgY29uc3RyYWluZWQgYnkgdGhlaXIgbWluLS9tYXgtIGVxdWl2YWxlbnRzLCB0aG9zZSBwcm9wZXJ0aWVzIGFyZSBjb252ZXJ0ZWQgYXMgd2VsbC4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWluV2lkdGg6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXhXaWR0aDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1pbkhlaWdodDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1heEhlaWdodDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIHBhZGRpbmdMZWZ0IGFyYml0cmFyaWx5IGFjdHMgYXMgb3VyIHByb3h5IGZvciB0aGUgZW0gcmF0aW8uICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYWRkaW5nTGVmdDogbnVsbFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50VW5pdFJhdGlvcyA9IHt9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBOb3RlOiBJRTw9OCByb3VuZCB0byB0aGUgbmVhcmVzdCBwaXhlbCB3aGVuIHJldHVybmluZyBDU1MgdmFsdWVzLCB0aHVzIHdlIHBlcmZvcm0gY29udmVyc2lvbnMgdXNpbmcgYSBtZWFzdXJlbWVudCBvZiAxMCAoaW5zdGVhZCBvZiAxKSB0byBnaXZlIG91ciByYXRpb3MgYSBwcmVjaXNpb24gb2YgYXQgbGVhc3QgMSBkZWNpbWFsIHZhbHVlLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtZWFzdXJlbWVudCA9IDEwO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogRm9yIG9yZ2FuaXphdGlvbmFsIHB1cnBvc2VzLCBjdXJyZW50IHJhdGlvcyBjYWxjdWxhdGlvbnMgYXJlIGNvbnNvbGlkYXRlZCBvbnRvIHRoZSBlbGVtZW50VW5pdFJhdGlvcyBvYmplY3QuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudFVuaXRSYXRpb3MucmVtVG9QeFJhdGlvID0gdW5pdENvbnZlcnNpb25SYXRpb3MucmVtVG9QeFJhdGlvO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogQWZ0ZXIgdGVtcG9yYXJ5IHVuaXQgY29udmVyc2lvbiBsb2dpYyBydW5zLCB3aWR0aCBhbmQgaGVpZ2h0IHByb3BlcnRpZXMgdGhhdCB3ZXJlIG9yaWdpbmFsbHkgc2V0IHRvIFwiYXV0b1wiIG11c3QgYmUgc2V0IGJhY2sgdG8gXCJhdXRvXCIgaW5zdGVhZCBvZiB0byB0aGUgYWN0dWFsIGNvcnJlc3BvbmRpbmcgcGl4ZWwgdmFsdWUuIExlYXZpbmcgdGhlIHZhbHVlc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF0IHRoZWlyIGhhcmQtY29kZWQgcGl4ZWwgdmFsdWUgZXF1aXZhbGVudHMgd291bGQgaW5oZXJlbnRseSBwcmV2ZW50IHRoZSBlbGVtZW50cyBmcm9tIHZlcnRpY2FsbHkgYWRqdXN0aW5nIGFzIHRoZSBoZWlnaHQgb2YgaXRzIGlubmVyIGNvbnRlbnQgY2hhbmdlcy4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBJRSB0ZWxscyB1cyB3aGV0aGVyIG9yIG5vdCB0aGUgcHJvcGVydHkgaXMgc2V0IHRvIFwiYXV0b1wiLiBPdGhlciBicm93c2VycyBwcm92aWRlIG5vIHdheSBvZiBkZXRlcm1pbmcgXCJhdXRvXCIgdmFsdWVzIG9uIGhlaWdodC93aWR0aCwgYW5kIHRodXMgd2UgaGF2ZSB0byB0cmlnZ2VyIGFkZGl0aW9uYWwgbGF5b3V0IHRocmFzaGluZyAoc2VlIGJlbG93KSB0byBzb2x2ZSB0aGlzLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChJRSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgaXNJRVdpZHRoQXV0byA9IC9eYXV0byQvaS50ZXN0KGVsZW1lbnQuY3VycmVudFN0eWxlLndpZHRoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzSUVIZWlnaHRBdXRvID0gL15hdXRvJC9pLnRlc3QoZWxlbWVudC5jdXJyZW50U3R5bGUuaGVpZ2h0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBOb3RlOiBUbyBtaW5pbWl6ZSBsYXlvdXQgdGhyYXNoaW5nLCB0aGUgZW5zdWluZyB1bml0IGNvbnZlcnNpb24gbG9naWMgaXMgc3BsaXQgaW50byBiYXRjaGVzIHRvIHN5bmNocm9uaXplIEdFVHMgYW5kIFNFVHMuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzYW1lQmFzZVBlcmNlbnQgfHwgIXNhbWVCYXNlRW0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3JpZ2luYWxWYWx1ZXMub3ZlcmZsb3dYID0gQ1NTLmdldFByb3BlcnR5VmFsdWUoZWxlbWVudCwgXCJvdmVyZmxvd1hcIik7IC8qIEdFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcmlnaW5hbFZhbHVlcy5vdmVyZmxvd1kgPSBDU1MuZ2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcIm92ZXJmbG93WVwiKTsgLyogR0VUICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9yaWdpbmFsVmFsdWVzLmJveFNpemluZyA9IENTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwiYm94U2l6aW5nXCIpOyAvKiBHRVQgKi9cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBTaW5jZSAlIHZhbHVlcyBhcmUgcmVsYXRpdmUgdG8gdGhlaXIgcmVzcGVjdGl2ZSBheGVzLCByYXRpb3MgYXJlIGNhbGN1bGF0ZWQgZm9yIGJvdGggd2lkdGggYW5kIGhlaWdodC4gSW4gY29udHJhc3QsIG9ubHkgYSBzaW5nbGUgcmF0aW8gaXMgcmVxdWlyZWQgZm9yIHJlbSBhbmQgZW0uICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIFdoZW4gY2FsY3VsYXRpbmcgJSB2YWx1ZXMsIHdlIHNldCBhIGZsYWcgdG8gaW5kaWNpYXRlIHRoYXQgd2Ugd2FudCB0aGUgY29tcHV0ZWQgdmFsdWUgaW5zdGVhZCBvZiBvZmZzZXRXaWR0aC9IZWlnaHQsIHdoaWNoIGluY29ycG9yYXRlIGFkZGl0aW9uYWwgZGltZW5zaW9ucyAoc3VjaCBhcyBwYWRkaW5nIGFuZCBib3JkZXItd2lkdGgpIGludG8gdGhlaXIgdmFsdWVzLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcmlnaW5hbFZhbHVlcy53aWR0aCA9IENTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwid2lkdGhcIiwgbnVsbCwgdHJ1ZSk7IC8qIEdFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcmlnaW5hbFZhbHVlcy5taW5XaWR0aCA9IENTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwibWluV2lkdGhcIik7IC8qIEdFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBOb3RlOiBtYXgtd2lkdGgvaGVpZ2h0IG11c3QgZGVmYXVsdCB0byBcIm5vbmVcIiB3aGVuIDAgaXMgcmV0dXJuZWQsIG90aGVyd2lzZSB0aGUgZWxlbWVudCBjYW5ub3QgaGF2ZSBpdHMgd2lkdGgvaGVpZ2h0IHNldC4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3JpZ2luYWxWYWx1ZXMubWF4V2lkdGggPSBDU1MuZ2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcIm1heFdpZHRoXCIpIHx8IFwibm9uZVwiOyAvKiBHRVQgKi9cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcmlnaW5hbFZhbHVlcy5oZWlnaHQgPSBDU1MuZ2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcImhlaWdodFwiLCBudWxsLCB0cnVlKTsgLyogR0VUICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9yaWdpbmFsVmFsdWVzLm1pbkhlaWdodCA9IENTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwibWluSGVpZ2h0XCIpOyAvKiBHRVQgKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3JpZ2luYWxWYWx1ZXMubWF4SGVpZ2h0ID0gQ1NTLmdldFByb3BlcnR5VmFsdWUoZWxlbWVudCwgXCJtYXhIZWlnaHRcIikgfHwgXCJub25lXCI7IC8qIEdFVCAqL1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9yaWdpbmFsVmFsdWVzLnBhZGRpbmdMZWZ0ID0gQ1NTLmdldFByb3BlcnR5VmFsdWUoZWxlbWVudCwgXCJwYWRkaW5nTGVmdFwiKTsgLyogR0VUICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNhbWVCYXNlUGVyY2VudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50VW5pdFJhdGlvcy5wZXJjZW50VG9QeFJhdGlvV2lkdGggPSB1bml0Q29udmVyc2lvblJhdGlvcy5sYXN0UGVyY2VudFRvUHhXaWR0aDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudFVuaXRSYXRpb3MucGVyY2VudFRvUHhSYXRpb0hlaWdodCA9IHVuaXRDb252ZXJzaW9uUmF0aW9zLmxhc3RQZXJjZW50VG9QeEhlaWdodDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBDU1Muc2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcIm92ZXJmbG93WFwiLCAgXCJoaWRkZW5cIik7IC8qIFNFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBDU1Muc2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcIm92ZXJmbG93WVwiLCAgXCJoaWRkZW5cIik7IC8qIFNFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBDU1Muc2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcImJveFNpemluZ1wiLCAgXCJjb250ZW50LWJveFwiKTsgLyogU0VUICovXG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgQ1NTLnNldFByb3BlcnR5VmFsdWUoZWxlbWVudCwgXCJ3aWR0aFwiLCBtZWFzdXJlbWVudCArIFwiJVwiKTsgLyogU0VUICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIENTUy5zZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwibWluV2lkdGhcIiwgbWVhc3VyZW1lbnQgKyBcIiVcIik7IC8qIFNFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBDU1Muc2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcIm1heFdpZHRoXCIsIG1lYXN1cmVtZW50ICsgXCIlXCIpOyAvKiBTRVQgKi9cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBDU1Muc2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcImhlaWdodFwiLCAgbWVhc3VyZW1lbnQgKyBcIiVcIik7IC8qIFNFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBDU1Muc2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcIm1pbkhlaWdodFwiLCAgbWVhc3VyZW1lbnQgKyBcIiVcIik7IC8qIFNFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBDU1Muc2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcIm1heEhlaWdodFwiLCAgbWVhc3VyZW1lbnQgKyBcIiVcIik7IC8qIFNFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzYW1lQmFzZUVtKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnRVbml0UmF0aW9zLmVtVG9QeFJhdGlvID0gdW5pdENvbnZlcnNpb25SYXRpb3MubGFzdEVtVG9QeDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBDU1Muc2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcInBhZGRpbmdMZWZ0XCIsIG1lYXN1cmVtZW50ICsgXCJlbVwiKTsgLyogU0VUICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogVGhlIGZvbGxvd2luZyBwaXhlbC12YWx1ZSBHRVRzIGNhbm5vdCBiZSBiYXRjaGVkIHdpdGggdGhlIHByaW9yIEdFVHMgc2luY2UgdGhleSBkZXBlbmQgdXBvbiB0aGUgdmFsdWVzIHRlbXBvcmFyaWx5IHNldCBpbW1lZGlhdGVseSBhYm92ZTsgbGF5b3V0IHRocmFzaGluZyBjYW5ub3QgYmUgYXZvaWRlZCBoZXJlLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc2FtZUJhc2VQZXJjZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIERpdmlkZSB0aGUgcmV0dXJuZWQgdmFsdWUgYnkgdGhlIG1lYXN1cmVtZW50IHZhbHVlIHRvIGdldCB0aGUgcmF0aW8gYmV0d2VlbiAxJSBhbmQgMXB4LiBEZWZhdWx0IHRvIDEgc2luY2UgY29udmVyc2lvbiBsb2dpYyB1c2luZyAwIGNhbiBwcm9kdWNlIEluZmluaXRlLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50VW5pdFJhdGlvcy5wZXJjZW50VG9QeFJhdGlvV2lkdGggPSB1bml0Q29udmVyc2lvblJhdGlvcy5sYXN0UGVyY2VudFRvUHhXaWR0aCA9IChwYXJzZUZsb2F0KENTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwid2lkdGhcIiwgbnVsbCwgdHJ1ZSkpIHx8IDEpIC8gbWVhc3VyZW1lbnQ7IC8qIEdFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50VW5pdFJhdGlvcy5wZXJjZW50VG9QeFJhdGlvSGVpZ2h0ID0gdW5pdENvbnZlcnNpb25SYXRpb3MubGFzdFBlcmNlbnRUb1B4SGVpZ2h0ID0gKHBhcnNlRmxvYXQoQ1NTLmdldFByb3BlcnR5VmFsdWUoZWxlbWVudCwgXCJoZWlnaHRcIiwgbnVsbCwgdHJ1ZSkpIHx8IDEpIC8gbWVhc3VyZW1lbnQ7IC8qIEdFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc2FtZUJhc2VFbSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50VW5pdFJhdGlvcy5lbVRvUHhSYXRpbyA9IHVuaXRDb252ZXJzaW9uUmF0aW9zLmxhc3RFbVRvUHggPSAocGFyc2VGbG9hdChDU1MuZ2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcInBhZGRpbmdMZWZ0XCIpKSB8fCAxKSAvIG1lYXN1cmVtZW50OyAvKiBHRVQgKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBSZXZlcnQgZWFjaCB0ZXN0IHByb3BlcnR5IHRvIGl0cyBvcmlnaW5hbCB2YWx1ZS4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBvcmlnaW5hbFZhbHVlUHJvcGVydHkgaW4gb3JpZ2luYWxWYWx1ZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9yaWdpbmFsVmFsdWVzW29yaWdpbmFsVmFsdWVQcm9wZXJ0eV0gIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIENTUy5zZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIG9yaWdpbmFsVmFsdWVQcm9wZXJ0eSwgb3JpZ2luYWxWYWx1ZXNbb3JpZ2luYWxWYWx1ZVByb3BlcnR5XSk7IC8qIFNFVHMgKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIEluIElFLCByZXZlcnQgdG8gXCJhdXRvXCIgZm9yIHdpZHRoIGFuZCBoZWlnaHQgaWYgaXQgd2FzIG9yaWdpbmFsbHkgc2V0LiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChJRSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXNJRVdpZHRoQXV0bykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgQ1NTLnNldFByb3BlcnR5VmFsdWUoZWxlbWVudCwgXCJ3aWR0aFwiLCBcImF1dG9cIik7IC8qIFNFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGlzSUVIZWlnaHRBdXRvKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBDU1Muc2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcImhlaWdodFwiLCBcImF1dG9cIik7IC8qIFNFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogRm9yIG90aGVyIGJyb3dzZXJzLCBhZGRpdGlvbmFsIGxheW91dCB0aHJhc2hpbmcgbXVzdCBiZSB0cmlnZ2VyZWQgdG8gZGV0ZXJtaW5lIHdoZXRoZXIgYSBwcm9wZXJ0eSB3YXMgb3JpZ2luYWxseSBzZXQgdG8gXCJhdXRvXCIuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogU2V0IGhlaWdodCB0byBcImF1dG9cIiB0aGVuIGNvbXBhcmUgdGhlIHJldHVybmVkIHZhbHVlIGFnYWluc3QgdGhlIGVsZW1lbnQncyBjdXJyZW50IGhlaWdodCB2YWx1ZS4gSWYgdGhleSdyZSBpZGVudGljYWwsIGxlYXZlIGhlaWdodCBzZXQgdG8gXCJhdXRvXCIuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIElmIHRoZXkncmUgZGlmZmVyZW50LCB0aGVuIFwiYXV0b1wiIHdhc24ndCBvcmlnaW5hbGx5IHNldCBvbiB0aGUgZWxlbWVudCBwcmlvciB0byBvdXIgY29udmVyc2lvbnMsIGFuZCB3ZSByZXZlcnQgaXQgdG8gaXRzIGFjdHVhbCB2YWx1ZS4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogTm90ZTogVGhlIGZvbGxvd2luZyBHRVRzIGFuZCBTRVRzIGNhbm5vdCBiZSBiYXRjaGVkIHRvZ2V0aGVyIGR1ZSB0byB0aGUgY3Jvc3MtZWZmZWN0IHNldHRpbmcgb25lIGF4aXMgdG8gXCJhdXRvXCIgaGFzIG9uIHRoZSBvdGhlci4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgQ1NTLnNldFByb3BlcnR5VmFsdWUoZWxlbWVudCwgXCJoZWlnaHRcIiwgXCJhdXRvXCIpOyAvKiBTRVQgKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9yaWdpbmFsVmFsdWVzLmhlaWdodCAhPT0gQ1NTLmdldFByb3BlcnR5VmFsdWUoZWxlbWVudCwgXCJoZWlnaHRcIiwgbnVsbCwgdHJ1ZSkpIHsgLyogR0VUICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBDU1Muc2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcImhlaWdodFwiLCBvcmlnaW5hbFZhbHVlcy5oZWlnaHQpOyAvKiBTRVQgKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIENTUy5zZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwid2lkdGhcIiwgXCJhdXRvXCIpOyAvKiBTRVQgKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9yaWdpbmFsVmFsdWVzLndpZHRoICE9PSBDU1MuZ2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcIndpZHRoXCIsIG51bGwsIHRydWUpKSB7IC8qIEdFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgQ1NTLnNldFByb3BlcnR5VmFsdWUoZWxlbWVudCwgXCJ3aWR0aFwiLCBvcmlnaW5hbFZhbHVlcy53aWR0aCk7IC8qIFNFVCAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKFZlbG9jaXR5LmRlYnVnID49IDEpIGNvbnNvbGUubG9nKFwiVW5pdCByYXRpb3M6IFwiICsgSlNPTi5zdHJpbmdpZnkoZWxlbWVudFVuaXRSYXRpb3MpLCBlbGVtZW50KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBlbGVtZW50VW5pdFJhdGlvcztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLyogVGhlICogYW5kIC8gb3BlcmF0b3JzLCB3aGljaCBhcmUgbm90IHBhc3NlZCBpbiB3aXRoIGFuIGFzc29jaWF0ZWQgdW5pdCwgaW5oZXJlbnRseSB1c2Ugc3RhcnRWYWx1ZSdzIHVuaXQuIFNraXAgdmFsdWUgYW5kIHVuaXQgY29udmVyc2lvbi4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICgvW1xcLypdLy50ZXN0KG9wZXJhdG9yKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZFZhbHVlVW5pdFR5cGUgPSBzdGFydFZhbHVlVW5pdFR5cGU7XG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBJZiBzdGFydFZhbHVlIGFuZCBlbmRWYWx1ZSBkaWZmZXIgaW4gdW5pdCB0eXBlLCBjb252ZXJ0IHN0YXJ0VmFsdWUgaW50byB0aGUgc2FtZSB1bml0IHR5cGUgYXMgZW5kVmFsdWUgc28gdGhhdCBpZiBlbmRWYWx1ZVVuaXRUeXBlIGlzIGEgcmVsYXRpdmUgdW5pdCAoJSwgZW0sIHJlbSksIHRoZSB2YWx1ZXMgc2V0IGR1cmluZyB0d2VlbmluZyB3aWxsIGNvbnRpbnVlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICB0byBiZSBhY2N1cmF0ZWx5IHJlbGF0aXZlIGV2ZW4gaWYgdGhlIG1ldHJpY3MgdGhleSBkZXBlbmQgb24gYXJlIGR5bmFtaWNhbGx5IGNoYW5naW5nIGR1cmluZyB0aGUgY291cnNlIG9mIHRoZSBhbmltYXRpb24uIENvbnZlcnNlbHksIGlmIHdlIGFsd2F5cyBub3JtYWxpemVkIGludG8gcHggYW5kIHVzZWQgcHggZm9yIHNldHRpbmcgdmFsdWVzLCB0aGUgcHggcmF0aW9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHdvdWxkIGJlY29tZSBzdGFsZSBpZiB0aGUgb3JpZ2luYWwgdW5pdCBiZWluZyBhbmltYXRlZCB0b3dhcmQgd2FzIHJlbGF0aXZlIGFuZCB0aGUgdW5kZXJseWluZyBtZXRyaWNzIGNoYW5nZSBkdXJpbmcgdGhlIGFuaW1hdGlvbi4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIFNpbmNlIDAgaXMgMCBpbiBhbnkgdW5pdCB0eXBlLCBubyBjb252ZXJzaW9uIGlzIG5lY2Vzc2FyeSB3aGVuIHN0YXJ0VmFsdWUgaXMgMCAtLSB3ZSBqdXN0IHN0YXJ0IGF0IDAgd2l0aCBlbmRWYWx1ZVVuaXRUeXBlLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICgoc3RhcnRWYWx1ZVVuaXRUeXBlICE9PSBlbmRWYWx1ZVVuaXRUeXBlKSAmJiBzdGFydFZhbHVlICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogVW5pdCBjb252ZXJzaW9uIGlzIGFsc28gc2tpcHBlZCB3aGVuIGVuZFZhbHVlIGlzIDAsIGJ1dCAqc3RhcnRWYWx1ZVVuaXRUeXBlKiBtdXN0IGJlIHVzZWQgaW4gdGhpcyBjYXNlIGZvciB0d2VlbiB2YWx1ZXMgdG8gcmVtYWluIGFjY3VyYXRlLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIE5vdGU6IFNraXBwaW5nIHVuaXQgY29udmVyc2lvbiBoZXJlIG1lYW5zIHRoYXQgaWYgZW5kVmFsdWVVbml0VHlwZSB3YXMgb3JpZ2luYWxseSBhIHJlbGF0aXZlIHVuaXQsIHRoZSBhbmltYXRpb24gd29uJ3QgcmVsYXRpdmVseSBtYXRjaCB0aGUgdW5kZXJseWluZyBtZXRyaWNzIGlmIHRoZXkgY2hhbmdlLCBidXQgdGhpcyBpcyBhY2NlcHRhYmxlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2luY2Ugd2UncmUgYW5pbWF0aW5nIHRvd2FyZCBpbnZpc2liaWxpdHkgaW5zdGVhZCBvZiB0b3dhcmQgdmlzaWJpbGl0eSB0aGF0IHJlbWFpbnMgcGFzdCB0aGUgcG9pbnQgb2YgdGhlIGFuaW1hdGlvbidzIGNvbXBsZXRpb24uICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVuZFZhbHVlID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZFZhbHVlVW5pdFR5cGUgPSBzdGFydFZhbHVlVW5pdFR5cGU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogQnkgdGhpcyBwb2ludCwgd2UgY2Fubm90IGF2b2lkIHVuaXQgY29udmVyc2lvbiAoaXQncyB1bmRlc2lyYWJsZSBzaW5jZSBpdCBjYXVzZXMgbGF5b3V0IHRocmFzaGluZykuIElmIHdlIGhhdmVuJ3QgYWxyZWFkeSwgd2UgdHJpZ2dlciBjYWxjdWxhdGVVbml0UmF0aW9zKCksIHdoaWNoIHJ1bnMgb25jZSBwZXIgZWxlbWVudCBwZXIgY2FsbC4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudFVuaXRSYXRpb3MgPSBlbGVtZW50VW5pdFJhdGlvcyB8fCBjYWxjdWxhdGVVbml0UmF0aW9zKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogVGhlIGZvbGxvd2luZyBSZWdFeCBtYXRjaGVzIENTUyBwcm9wZXJ0aWVzIHRoYXQgaGF2ZSB0aGVpciAlIHZhbHVlcyBtZWFzdXJlZCByZWxhdGl2ZSB0byB0aGUgeC1heGlzLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBOb3RlOiBXM0Mgc3BlYyBtYW5kYXRlcyB0aGF0IGFsbCBvZiBtYXJnaW4gYW5kIHBhZGRpbmcncyBwcm9wZXJ0aWVzIChldmVuIHRvcCBhbmQgYm90dG9tKSBhcmUgJS1yZWxhdGl2ZSB0byB0aGUgKndpZHRoKiBvZiB0aGUgcGFyZW50IGVsZW1lbnQsIHNvIHRoZXkncmUgaW5jbHVkZWQgaW4gdGhpcyBleHByZXNzaW9uLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgYXhpcyA9ICgvbWFyZ2lufHBhZGRpbmd8bGVmdHxyaWdodHx3aWR0aHx0ZXh0fHdvcmR8bGV0dGVyL2kudGVzdChwcm9wZXJ0eSkgfHwgL1gkLy50ZXN0KHByb3BlcnR5KSkgPyBcInhcIiA6IFwieVwiO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIEluIG9yZGVyIHRvIGF2b2lkIGdlbmVyYXRpbmcgbl4yIGJlc3Bva2UgY29udmVyc2lvbiBmdW5jdGlvbnMsIHVuaXQgY29udmVyc2lvbiBpcyBhIHR3by1zdGVwIHByb2Nlc3M6IDEpIENvbnZlcnQgc3RhcnRWYWx1ZSBpbnRvIHBpeGVscy4gMikgQ29udmVydCB0aGlzIG5ldyBwaXhlbCB2YWx1ZSBpbnRvIGVuZFZhbHVlJ3MgdW5pdCB0eXBlLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHN0YXJ0VmFsdWVVbml0VHlwZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcIiVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBOb3RlOiB0cmFuc2xhdGVYIGFuZCB0cmFuc2xhdGVZIGFyZSB0aGUgb25seSBwcm9wZXJ0aWVzIHRoYXQgYXJlICUtcmVsYXRpdmUgdG8gYW4gZWxlbWVudCdzIG93biBkaW1lbnNpb25zIC0tIG5vdCBpdHMgcGFyZW50J3MgZGltZW5zaW9ucy4gVmVsb2NpdHkgZG9lcyBub3QgaW5jbHVkZSBhIHNwZWNpYWwgY29udmVyc2lvbiBwcm9jZXNzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIHRoZXNlIHByb3BlcnRpZXMgZHVlIG9mIHRoZSBhZGRpdGlvbmFsIERPTSBvdmVyaGVhZCBpdCB3b3VsZCBlbnRhaWwuIFRoZXJlZm9yZSwgYW5pbWF0aW5nIHRyYW5zbGF0ZVgvWSBmcm9tIGEgJSB2YWx1ZSB0byBhIG5vbi0lIHZhbHVlIHdpbGwgcHJvZHVjZSBhbiBpbmNvcnJlY3Qgc3RhcnQgdmFsdWUuIEZvcnR1bmF0ZWx5LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMgc29ydCBvZiBjcm9zcy11bml0IGNvbnZlcnNpb24gaXMgcmFyZWx5IGRvbmUgYnkgdXNlcnMgaW4gcHJhY3RpY2UuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnRWYWx1ZSAqPSAoYXhpcyA9PT0gXCJ4XCIgPyBlbGVtZW50VW5pdFJhdGlvcy5wZXJjZW50VG9QeFJhdGlvV2lkdGggOiBlbGVtZW50VW5pdFJhdGlvcy5wZXJjZW50VG9QeFJhdGlvSGVpZ2h0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImVtXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnRWYWx1ZSAqPSBlbGVtZW50VW5pdFJhdGlvcy5lbVRvUHhSYXRpbztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInJlbVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0VmFsdWUgKj0gZWxlbWVudFVuaXRSYXRpb3MucmVtVG9QeFJhdGlvO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwicHhcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBweCBhY3RzIGFzIG91ciBtaWRwb2ludCBpbiB0aGUgdW5pdCBjb252ZXJzaW9uIHByb2Nlc3M7IGRvIG5vdGhpbmcuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBJbnZlcnQgdGhlIHB4IHJhdGlvcyB0byBjb252ZXJ0IGludG8gdG8gdGhlIHRhcmdldCB1bml0LiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKGVuZFZhbHVlVW5pdFR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCIlXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnRWYWx1ZSAqPSAxIC8gKGF4aXMgPT09IFwieFwiID8gZWxlbWVudFVuaXRSYXRpb3MucGVyY2VudFRvUHhSYXRpb1dpZHRoIDogZWxlbWVudFVuaXRSYXRpb3MucGVyY2VudFRvUHhSYXRpb0hlaWdodCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJlbVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0VmFsdWUgKj0gMSAvIGVsZW1lbnRVbml0UmF0aW9zLmVtVG9QeFJhdGlvO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwicmVtXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnRWYWx1ZSAqPSAxIC8gZWxlbWVudFVuaXRSYXRpb3MucmVtVG9QeFJhdGlvO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwicHhcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBzdGFydFZhbHVlIGlzIGFscmVhZHkgaW4gcHgsIGRvIG5vdGhpbmc7IHdlJ3JlIGRvbmUuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qKioqKioqKioqKioqKioqKioqKioqKlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFZhbHVlIE9wZXJhdG9yc1xuICAgICAgICAgICAgICAgICAgICAgICAgKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIE9wZXJhdG9yIGxvZ2ljIG11c3QgYmUgcGVyZm9ybWVkIGxhc3Qgc2luY2UgaXQgcmVxdWlyZXMgdW5pdC1ub3JtYWxpemVkIHN0YXJ0IGFuZCBlbmQgdmFsdWVzLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgLyogTm90ZTogUmVsYXRpdmUgcGVyY2VudCB2YWx1ZXMgZG8gbm90IGJlaGF2ZSBob3cgbW9zdCBwZW9wbGUgdGhpbms7IHdoaWxlIG9uZSB3b3VsZCBleHBlY3QgXCIrPTUwJVwiIHRvIGluY3JlYXNlIHRoZSBwcm9wZXJ0eSAxLjV4IGl0cyBjdXJyZW50IHZhbHVlLCBpdCBpbiBmYWN0IGluY3JlYXNlcyB0aGUgcGVyY2VudCB1bml0cyBpbiBhYnNvbHV0ZSB0ZXJtczpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDUwIHBvaW50cyBpcyBhZGRlZCBvbiB0b3Agb2YgdGhlIGN1cnJlbnQgJSB2YWx1ZS4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIHN3aXRjaCAob3BlcmF0b3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiK1wiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmRWYWx1ZSA9IHN0YXJ0VmFsdWUgKyBlbmRWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiLVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmRWYWx1ZSA9IHN0YXJ0VmFsdWUgLSBlbmRWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiKlwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmRWYWx1ZSA9IHN0YXJ0VmFsdWUgKiBlbmRWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiL1wiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmRWYWx1ZSA9IHN0YXJ0VmFsdWUgLyBlbmRWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qKioqKioqKioqKioqKioqKioqKioqKioqKlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgdHdlZW5zQ29udGFpbmVyIFB1c2hcbiAgICAgICAgICAgICAgICAgICAgICAgICoqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBDb25zdHJ1Y3QgdGhlIHBlci1wcm9wZXJ0eSB0d2VlbiBvYmplY3QsIGFuZCBwdXNoIGl0IHRvIHRoZSBlbGVtZW50J3MgdHdlZW5zQ29udGFpbmVyLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgdHdlZW5zQ29udGFpbmVyW3Byb3BlcnR5XSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb290UHJvcGVydHlWYWx1ZTogcm9vdFByb3BlcnR5VmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnRWYWx1ZTogc3RhcnRWYWx1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50VmFsdWU6IHN0YXJ0VmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5kVmFsdWU6IGVuZFZhbHVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuaXRUeXBlOiBlbmRWYWx1ZVVuaXRUeXBlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVhc2luZzogZWFzaW5nXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoVmVsb2NpdHkuZGVidWcpIGNvbnNvbGUubG9nKFwidHdlZW5zQ29udGFpbmVyIChcIiArIHByb3BlcnR5ICsgXCIpOiBcIiArIEpTT04uc3RyaW5naWZ5KHR3ZWVuc0NvbnRhaW5lcltwcm9wZXJ0eV0pLCBlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8qIEFsb25nIHdpdGggaXRzIHByb3BlcnR5IGRhdGEsIHN0b3JlIGEgcmVmZXJlbmNlIHRvIHRoZSBlbGVtZW50IGl0c2VsZiBvbnRvIHR3ZWVuc0NvbnRhaW5lci4gKi9cbiAgICAgICAgICAgICAgICAgICAgdHdlZW5zQ29udGFpbmVyLmVsZW1lbnQgPSBlbGVtZW50O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8qKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgICAgICAgUHVzaGluZ1xuICAgICAgICAgICAgICAgICoqKioqKioqKioqKioqKi9cblxuICAgICAgICAgICAgICAgIC8qIE5vdGU6IHR3ZWVuc0NvbnRhaW5lciBjYW4gYmUgZW1wdHkgaWYgYWxsIG9mIHRoZSBwcm9wZXJ0aWVzIGluIHRoaXMgY2FsbCdzIHByb3BlcnR5IG1hcCB3ZXJlIHNraXBwZWQgZHVlIHRvIG5vdCBiZWluZyBzdXBwb3J0ZWQgYnkgdGhlIGJyb3dzZXIuXG4gICAgICAgICAgICAgICAgICAgVGhlIGVsZW1lbnQgcHJvcGVydHkgaXMgdXNlZCBhcyBhIHByb3h5IGZvciBjaGVja2luZyB0aGF0IHRoZSB0d2VlbnNDb250YWluZXIgaGFzIGJlZW4gYXBwZW5kZWQgdG8uICovXG4gICAgICAgICAgICAgICAgaWYgKHR3ZWVuc0NvbnRhaW5lci5lbGVtZW50KSB7XG5cbiAgICAgICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICAgICAgICAgICBDYWxsIFB1c2hcbiAgICAgICAgICAgICAgICAgICAgKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgICAgICAgICAgLyogVGhlIGNhbGwgYXJyYXkgaG91c2VzIHRoZSB0d2VlbnNDb250YWluZXJzIGZvciBlYWNoIGVsZW1lbnQgYmVpbmcgYW5pbWF0ZWQgaW4gdGhlIGN1cnJlbnQgY2FsbC4gKi9cbiAgICAgICAgICAgICAgICAgICAgY2FsbC5wdXNoKHR3ZWVuc0NvbnRhaW5lcik7XG5cbiAgICAgICAgICAgICAgICAgICAgLyogU3RvcmUgb24gdGhlIGVsZW1lbnQgaXRzIHR3ZWVuc0NvbnRhaW5lciBwbHVzIHRoZSBjdXJyZW50IGNhbGwncyBvcHRzIHNvIHRoYXQgVmVsb2NpdHkgY2FuIHJlZmVyZW5jZSB0aGlzIGRhdGEgdGhlIG5leHQgdGltZSB0aGlzIGVsZW1lbnQgaXMgYW5pbWF0ZWQuICovXG4gICAgICAgICAgICAgICAgICAgIERhdGEoZWxlbWVudCkudHdlZW5zQ29udGFpbmVyID0gdHdlZW5zQ29udGFpbmVyO1xuICAgICAgICAgICAgICAgICAgICBEYXRhKGVsZW1lbnQpLm9wdHMgPSBvcHRzO1xuICAgICAgICAgICAgICAgICAgICAvKiBTd2l0Y2ggb24gdGhlIGVsZW1lbnQncyBhbmltYXRpbmcgZmxhZy4gKi9cbiAgICAgICAgICAgICAgICAgICAgRGF0YShlbGVtZW50KS5pc0FuaW1hdGluZyA9IHRydWU7XG5cbiAgICAgICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqKlxuICAgICAgICAgICAgICAgICAgICAgICAgQ2FsbHMgUHVzaFxuICAgICAgICAgICAgICAgICAgICAqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgICAgICAgICAgLyogT25jZSB0aGUgZmluYWwgZWxlbWVudCBpbiB0aGlzIGNhbGwncyB0YXJnZXRlZCBlbGVtZW50IHNldCBoYXMgYmVlbiBwcm9jZXNzZWQsIHB1c2ggdGhlIGNhbGwgYXJyYXkgb250byBWZWxvY2l0eS5TdGF0ZS5jYWxscyBmb3IgdGhlIGFuaW1hdGlvbiB0aWNrIHRvIGltbWVkaWF0ZWx5IGJlZ2luIHByb2Nlc3NpbmcuICovXG4gICAgICAgICAgICAgICAgICAgIGlmIChlbGVtZW50c0luZGV4ID09PSBlbGVtZW50c0xlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIFRvIHNwZWVkIHVwIGl0ZXJhdGluZyBvdmVyIHRoaXMgYXJyYXksIGl0IGlzIGNvbXBhY3RlZCAoZmFsc2V5IGl0ZW1zIC0tIGNhbGxzIHRoYXQgaGF2ZSBjb21wbGV0ZWQgLS0gYXJlIHJlbW92ZWQpIHdoZW4gaXRzIGxlbmd0aCBoYXMgYmFsbG9vbmVkIHRvIGEgcG9pbnQgdGhhdCBjYW4gaW1wYWN0IHRpY2sgcGVyZm9ybWFuY2UuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBUaGlzIG9ubHkgYmVjb21lcyBuZWNlc3Nhcnkgd2hlbiBhbmltYXRpb24gaGFzIGJlZW4gY29udGludW91cyB3aXRoIG1hbnkgZWxlbWVudHMgb3ZlciBhIGxvbmcgcGVyaW9kIG9mIHRpbWU7IHdoZW5ldmVyIGFsbCBhY3RpdmUgY2FsbHMgYXJlIGNvbXBsZXRlZCwgY29tcGxldGVDYWxsKCkgY2xlYXJzIFZlbG9jaXR5LlN0YXRlLmNhbGxzLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKFZlbG9jaXR5LlN0YXRlLmNhbGxzLmxlbmd0aCA+IDEwMDAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgVmVsb2NpdHkuU3RhdGUuY2FsbHMgPSBjb21wYWN0U3BhcnNlQXJyYXkoVmVsb2NpdHkuU3RhdGUuY2FsbHMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBBZGQgdGhlIGN1cnJlbnQgY2FsbCBwbHVzIGl0cyBhc3NvY2lhdGVkIG1ldGFkYXRhICh0aGUgZWxlbWVudCBzZXQgYW5kIHRoZSBjYWxsJ3Mgb3B0aW9ucykgb250byB0aGUgcGFnZS13aWRlIGNhbGwgY29udGFpbmVyLiBBbnl0aGluZyBvbiB0aGlzIGNhbGwgY29udGFpbmVyIGlzIHN1YmplY3RlZCB0byB0aWNrKCkgcHJvY2Vzc2luZy4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIFZlbG9jaXR5LlN0YXRlLmNhbGxzLnB1c2goWyBjYWxsLCBlbGVtZW50cywgb3B0cyBdKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLyogSWYgdGhlIGFuaW1hdGlvbiB0aWNrIGlzbid0IGN1cnJlbnRseSBydW5uaW5nLCBzdGFydCBpdC4gKFZlbG9jaXR5IHNodXRzIHRoZSB0aWNrIG9mZiB3aGVuIHRoZXJlIGFyZSBubyBhY3RpdmUgY2FsbHMgdG8gcHJvY2Vzcy4pICovXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoVmVsb2NpdHkuU3RhdGUuaXNUaWNraW5nID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFZlbG9jaXR5LlN0YXRlLmlzVGlja2luZyA9IHRydWU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBTdGFydCB0aGUgdGljayBsb29wLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpY2soKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzSW5kZXgrKztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLyogV2hlbiB0aGUgcXVldWUgb3B0aW9uIGlzIHNldCB0byBmYWxzZSwgdGhlIGNhbGwgc2tpcHMgdGhlIGVsZW1lbnQncyBxdWV1ZSBhbmQgZmlyZXMgaW1tZWRpYXRlbHkuICovXG4gICAgICAgICAgICBpZiAob3B0cy5xdWV1ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAvKiBTaW5jZSB0aGlzIGJ1aWxkUXVldWUgY2FsbCBkb2Vzbid0IHJlc3BlY3QgdGhlIGVsZW1lbnQncyBleGlzdGluZyBxdWV1ZSAod2hpY2ggaXMgd2hlcmUgYSBkZWxheSBvcHRpb24gd291bGQgaGF2ZSBiZWVuIGFwcGVuZGVkKSwgd2UgbWFudWFsbHkgaW5qZWN0IHRoZSBkZWxheSBwcm9wZXJ0eSBoZXJlIHdpdGggYW4gZXhwbGljaXQgc2V0VGltZW91dC4gKi9cbiAgICAgICAgICAgICAgICBpZiAob3B0cy5kZWxheSkge1xuICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGJ1aWxkUXVldWUsIG9wdHMuZGVsYXkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGJ1aWxkUXVldWUoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAvKiBPdGhlcndpc2UsIHRoZSBjYWxsIHVuZGVyZ29lcyBlbGVtZW50IHF1ZXVlaW5nIGFzIG5vcm1hbC4gKi9cbiAgICAgICAgICAgIC8qIE5vdGU6IFRvIGludGVyb3BlcmF0ZSB3aXRoIGpRdWVyeSwgVmVsb2NpdHkgdXNlcyBqUXVlcnkncyBvd24gJC5xdWV1ZSgpIHN0YWNrIGZvciBxdWV1aW5nIGxvZ2ljLiAqL1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAkLnF1ZXVlKGVsZW1lbnQsIG9wdHMucXVldWUsIGZ1bmN0aW9uKG5leHQpIHtcbiAgICAgICAgICAgICAgICAgICAgLyogVGhpcyBpcyBhIGZsYWcgdXNlZCB0byBpbmRpY2F0ZSB0byB0aGUgdXBjb21pbmcgY29tcGxldGVDYWxsKCkgZnVuY3Rpb24gdGhhdCB0aGlzIHF1ZXVlIGVudHJ5IHdhcyBpbml0aWF0ZWQgYnkgVmVsb2NpdHkuIFNlZSBjb21wbGV0ZUNhbGwoKSBmb3IgZnVydGhlciBkZXRhaWxzLiAqL1xuICAgICAgICAgICAgICAgICAgICBWZWxvY2l0eS52ZWxvY2l0eVF1ZXVlRW50cnlGbGFnID0gdHJ1ZTtcblxuICAgICAgICAgICAgICAgICAgICBidWlsZFF1ZXVlKG5leHQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICAgQXV0by1EZXF1ZXVpbmdcbiAgICAgICAgICAgICoqKioqKioqKioqKioqKioqKioqKi9cblxuICAgICAgICAgICAgLyogQXMgcGVyIGpRdWVyeSdzICQucXVldWUoKSBiZWhhdmlvciwgdG8gZmlyZSB0aGUgZmlyc3Qgbm9uLWN1c3RvbS1xdWV1ZSBlbnRyeSBvbiBhbiBlbGVtZW50LCB0aGUgZWxlbWVudCBtdXN0IGJlIGRlcXVldWVkIGlmIGl0cyBxdWV1ZSBzdGFjayBjb25zaXN0cyAqc29sZWx5KiBvZiB0aGUgY3VycmVudCBjYWxsLlxuICAgICAgICAgICAgICAgKFRoaXMgY2FuIGJlIGRldGVybWluZWQgYnkgY2hlY2tpbmcgZm9yIHRoZSBcImlucHJvZ3Jlc3NcIiBpdGVtIHRoYXQgalF1ZXJ5IHByZXBlbmRzIHRvIGFjdGl2ZSBxdWV1ZSBzdGFjayBhcnJheXMuKSBSZWdhcmRsZXNzLCB3aGVuZXZlciB0aGUgZWxlbWVudCdzIHF1ZXVlIGlzIGZ1cnRoZXIgYXBwZW5kZWQgd2l0aFxuICAgICAgICAgICAgICAgYWRkaXRpb25hbCBpdGVtcyAtLSBpbmNsdWRpbmcgJC5kZWxheSgpJ3Mgb3IgZXZlbiAkLmFuaW1hdGUoKSBjYWxscywgdGhlIHF1ZXVlJ3MgZmlyc3QgZW50cnkgaXMgYXV0b21hdGljYWxseSBmaXJlZC4gVGhpcyBiZWhhdmlvciBjb250cmFzdHMgdGhhdCBvZiBjdXN0b20gcXVldWVzLCB3aGljaCBuZXZlciBhdXRvLWZpcmUuICovXG4gICAgICAgICAgICAvKiBOb3RlOiBXaGVuIGFuIGVsZW1lbnQgc2V0IGlzIGJlaW5nIHN1YmplY3RlZCB0byBhIG5vbi1wYXJhbGxlbCBWZWxvY2l0eSBjYWxsLCB0aGUgYW5pbWF0aW9uIHdpbGwgbm90IGJlZ2luIHVudGlsIGVhY2ggb25lIG9mIHRoZSBlbGVtZW50cyBpbiB0aGUgc2V0IGhhcyByZWFjaGVkIHRoZSBlbmQgb2YgaXRzIGluZGl2aWR1YWxseSBwcmUtZXhpc3RpbmcgcXVldWUgY2hhaW4uICovXG4gICAgICAgICAgICAvKiBOb3RlOiBVbmZvcnR1bmF0ZWx5LCBtb3N0IHBlb3BsZSBkb24ndCBmdWxseSBncmFzcCBqUXVlcnkncyBwb3dlcmZ1bCwgeWV0IHF1aXJreSwgJC5xdWV1ZSgpIGZ1bmN0aW9uLiBMZWFuIG1vcmUgaGVyZTogaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8xMDU4MTU4L2Nhbi1zb21lYm9keS1leHBsYWluLWpxdWVyeS1xdWV1ZS10by1tZSAqL1xuICAgICAgICAgICAgaWYgKChvcHRzLnF1ZXVlID09PSBcIlwiIHx8IG9wdHMucXVldWUgPT09IFwiZnhcIikgJiYgJC5xdWV1ZShlbGVtZW50KVswXSAhPT0gXCJpbnByb2dyZXNzXCIpIHtcbiAgICAgICAgICAgICAgICAkLmRlcXVldWUoZWxlbWVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgRWxlbWVudCBTZXQgSXRlcmF0aW9uXG4gICAgICAgICoqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgIC8qIElmIHRoZSBcIm5vZGVUeXBlXCIgcHJvcGVydHkgZXhpc3RzIG9uIHRoZSBlbGVtZW50cyB2YXJpYWJsZSwgd2UncmUgYW5pbWF0aW5nIGEgc2luZ2xlIGVsZW1lbnQuIFBsYWNlIGl0IGluIGFuIGFycmF5IHNvIHRoYXQgJC5lYWNoIGNhbiBpdGVyYXRlIG92ZXIgaXQuICovXG4gICAgICAgICQuZWFjaChlbGVtZW50cy5ub2RlVHlwZSA/IFsgZWxlbWVudHMgXSA6IGVsZW1lbnRzLCBmdW5jdGlvbihpLCBlbGVtZW50KSB7XG4gICAgICAgICAgICAvKiBFbnN1cmUgZWFjaCBlbGVtZW50IGluIGEgc2V0IGhhcyBhIG5vZGVUeXBlIChpcyBhIHJlYWwgZWxlbWVudCkgdG8gYXZvaWQgdGhyb3dpbmcgZXJyb3JzLiAqL1xuICAgICAgICAgICAgaWYgKGVsZW1lbnQubm9kZVR5cGUpIHtcbiAgICAgICAgICAgICAgICBwcm9jZXNzRWxlbWVudC5jYWxsKGVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgIE9wdGlvbjogTG9vcFxuICAgICAgICAqKioqKioqKioqKioqKioqKioqKi9cblxuICAgICAgICAvKiBUaGUgbG9vcCBvcHRpb24gYWNjZXB0cyBhbiBpbnRlZ2VyIGluZGljYXRpbmcgaG93IG1hbnkgdGltZXMgdGhlIGVsZW1lbnQgc2hvdWxkIGxvb3AgYmV0d2VlbiB0aGUgdmFsdWVzIGluIHRoZSBjdXJyZW50IGNhbGwncyBwcm9wZXJ0aWVzIG1hcCBhbmQgdGhlIGVsZW1lbnQncyBwcm9wZXJ0eSB2YWx1ZXMgcHJpb3IgdG8gdGhpcyBjYWxsLiAqL1xuICAgICAgICAvKiBOb3RlOiBUaGUgbG9vcCBvcHRpb24ncyBsb2dpYyBpcyBwZXJmb3JtZWQgaGVyZSAtLSBhZnRlciBlbGVtZW50IHByb2Nlc3NpbmcgLS0gYmVjYXVzZSB0aGUgY3VycmVudCBjYWxsIG5lZWRzIHRvIHVuZGVyZ28gaXRzIHF1ZXVlIGluc2VydGlvbiBwcmlvciB0byB0aGUgbG9vcCBvcHRpb24gZ2VuZXJhdGluZyBpdHMgc2VyaWVzIG9mIGNvbnN0aXR1ZW50IFwicmV2ZXJzZVwiIGNhbGxzLFxuICAgICAgICAgICB3aGljaCBjaGFpbiBhZnRlciB0aGUgY3VycmVudCBjYWxsLiBUd28gcmV2ZXJzZSBjYWxscyAodHdvIFwiYWx0ZXJuYXRpb25zXCIpIGNvbnN0aXR1dGUgb25lIGxvb3AuICovXG4gICAgICAgIHZhciBvcHRzID0gJC5leHRlbmQoe30sIFZlbG9jaXR5LmRlZmF1bHRzLCBvcHRpb25zKSxcbiAgICAgICAgICAgIHJldmVyc2VDYWxsc0NvdW50O1xuXG4gICAgICAgIG9wdHMubG9vcCA9IHBhcnNlSW50KG9wdHMubG9vcCk7XG4gICAgICAgIHJldmVyc2VDYWxsc0NvdW50ID0gKG9wdHMubG9vcCAqIDIpIC0gMTtcblxuICAgICAgICBpZiAob3B0cy5sb29wKSB7XG4gICAgICAgICAgICAvKiBEb3VibGUgdGhlIGxvb3AgY291bnQgdG8gY29udmVydCBpdCBpbnRvIGl0cyBhcHByb3ByaWF0ZSBudW1iZXIgb2YgXCJyZXZlcnNlXCIgY2FsbHMuIFN1YnRyYWN0IDEgZnJvbSB0aGUgcmVzdWx0aW5nIHZhbHVlIHNpbmNlIHRoZSBjdXJyZW50IGNhbGwgaXMgaW5jbHVkZWQgaW4gdGhlIHRvdGFsIGFsdGVybmF0aW9uIGNvdW50LiAqL1xuICAgICAgICAgICAgZm9yICh2YXIgeCA9IDA7IHggPCByZXZlcnNlQ2FsbHNDb3VudDsgeCsrKSB7XG4gICAgICAgICAgICAgICAgLyogU2luY2UgdGhlIGxvZ2ljIGZvciB0aGUgcmV2ZXJzZSBhY3Rpb24gb2NjdXJzIGluc2lkZSBRdWV1ZWluZyBhbmQgdGh1cyB0aGlzIGNhbGwncyBvcHRpb25zIG9iamVjdCBpc24ndCBwYXJzZWQgdW50aWwgdGhlbiBhcyB3ZWxsLCB0aGUgY3VycmVudCBjYWxsJ3MgZGVsYXkgb3B0aW9uIG11c3QgYmUgZXhwbGljaXRseSBwYXNzZWRcbiAgICAgICAgICAgICAgICAgICBpbnRvIHRoZSByZXZlcnNlIGNhbGwgc28gdGhhdCB0aGUgZGVsYXkgbG9naWMgdGhhdCBvY2N1cnMgaW5zaWRlICpQcmUtUXVldWVpbmcqIGNhbiBwcm9jZXNzIHRoaXMgZGVsYXkuICovXG4gICAgICAgICAgICAgICAgdmFyIHJldmVyc2VPcHRpb25zID0ge1xuICAgICAgICAgICAgICAgICAgICBkZWxheTogb3B0cy5kZWxheVxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAvKiBJZiBhIGNvbXBsZXRlIGNhbGxiYWNrIHdhcyBwYXNzZWQgaW50byB0aGlzIGNhbGwsIHRyYW5zZmVyIGl0IHRvIHRoZSBsb29wIHNlcXVlbmNlJ3MgZmluYWwgXCJyZXZlcnNlXCIgY2FsbCBzbyB0aGF0IGl0J3MgdHJpZ2dlcmVkIHdoZW4gdGhlIGVudGlyZSBzZXF1ZW5jZSBpcyBjb21wbGV0ZSAoYW5kIG5vdCB3aGVuIHRoZSB2ZXJ5IGZpcnN0IGFuaW1hdGlvbiBpcyBjb21wbGV0ZSkuICovXG4gICAgICAgICAgICAgICAgaWYgKG9wdHMuY29tcGxldGUgJiYgKHggPT09IHJldmVyc2VDYWxsc0NvdW50IC0gMSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV2ZXJzZU9wdGlvbnMuY29tcGxldGUgPSBvcHRzLmNvbXBsZXRlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIFZlbG9jaXR5LmFuaW1hdGUoZWxlbWVudHMsIFwicmV2ZXJzZVwiLCByZXZlcnNlT3B0aW9ucyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvKioqKioqKioqKioqKioqXG4gICAgICAgICAgICBDaGFpbmluZ1xuICAgICAgICAqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgLyogUmV0dXJuIHRoZSBlbGVtZW50cyBiYWNrIHRvIHRoZSBjYWxsIGNoYWluLCB3aXRoIHdyYXBwZWQgZWxlbWVudHMgdGFraW5nIHByZWNlZGVuY2UgaW4gY2FzZSBWZWxvY2l0eSB3YXMgY2FsbGVkIHZpYSB0aGUgJC5mbi4gZXh0ZW5zaW9uLiAqL1xuICAgICAgICByZXR1cm4gZ2V0Q2hhaW4oKTtcbiAgICB9O1xuXG4gICAgLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgVGljayAoQ2FsbHMgUHJvY2Vzc2luZylcbiAgICAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cblxuICAgIC8qIE5vdGU6IFRoZXJlIGlzIG9ubHkgYSBzaW5nbGUgdGljaygpIGluc3RhbmNlOyBhbGwgY2FsbHMgdG8gVmVsb2NpdHkgYXJlIHB1c2hlZCB0byB0aGUgVmVsb2NpdHkuU3RhdGUuY2FsbHMgYXJyYXksIHdoaWNoIGlzIGZ1bGx5IGl0ZXJhdGVkIHRocm91Z2ggdXBvbiBlYWNoIHRpY2suICovXG4gICAgZnVuY3Rpb24gdGljayAodGltZXN0YW1wKSB7XG4gICAgICAgIC8qIEFuIGVtcHR5IHRpbWVzdGFtcCBhcmd1bWVudCBpbmRpY2F0ZXMgdGhhdCB0aGlzIGlzIHRoZSBmaXJzdCB0aWNrIG9jY3VyZW5jZSBzaW5jZSB0aWNraW5nIHdhcyB0dXJuZWQgb24gKHdoaWNoIGltcGxpZXMgdGhhdCB0aGlzIHRpY2sgd2Fzbid0IGNhbGxlZCBieSBpdHNlbGYpLiBXZSBsZXZlcmFnZSB0aGlzIGluZGljYXRvciB0byBmdWxseSBpZ25vcmUgdGhlIGZpcnN0IHRpY2sgcGFzc1xuICAgICAgICAgICBzaW5jZSBSQUYncyBpbml0aWFsIHBhc3MgaXMgZmlyZWQgd2hlbmV2ZXIgdGhlIGJyb3dzZXIncyBuZXh0IHRpY2sgc3luYyB0aW1lIG9jY3VycyAod2hlcmVhcyBzdWJzZXF1ZW50IFJBRiBwYXNzZXMgYXJlIHNwYWNlZCBieSBhIHRpbWVyIHJlc29sdXRpb24gb2YgfjE2bXMpLCB3aGljaCByZXN1bHRzIGluIHRoZSBmaXJzdCBlbGVtZW50cyBzdWJqZWN0ZWQgdG8gVmVsb2NpdHlcbiAgICAgICAgICAgY2FsbHMgYmVpbmcgYW5pbWF0ZWQgb3V0IG9mIHN5bmMgd2l0aCBhbnkgZWxlbWVudHMgYW5pbWF0ZWQgaW1tZWRpYXRlbHkgdGhlcmVhZnRlci4gSW4gc2hvcnQsIHdlIGlnbm9yZSB0aGUgZmlyc3QgUkFGIHRpY2sgcGFzcyBzbyB0aGF0IGVsZW1lbnRzIGJlaW5nIGltbWVkaWF0ZWx5IGNvbnNlY3V0aXZlbHkgYW5pbWF0ZWQgLS0gaW5zdGVhZCBvZiBzaW11bHRhbmVvdXNseSBhbmltYXRlZFxuICAgICAgICAgICBieSB0aGUgc2FtZSBWZWxvY2l0eSBjYWxsIC0tIGFyZSBwcm9wZXJseSBiYXRjaGVkIGludG8gdGhlIHNhbWUgaW5pdGlhbCBSQUYgdGljayBhbmQgY29uc2VxdWVudGx5IHJlbWFpbiBpbiBzeW5jIHRoZXJlYWZ0ZXIuICovXG4gICAgICAgIGlmICh0aW1lc3RhbXApIHtcbiAgICAgICAgICAgIC8qIFdlIGlnbm9yZSBSQUYncyBoaWdoIHJlc29sdXRpb24gdGltZXN0YW1wIHNpbmNlIGl0IGNhbiBiZSBzaWduaWZpY2FudGx5IG9mZnNldCB3aGVuIHRoZSBicm93c2VyIGlzIHVuZGVyIGhpZ2ggc3RyZXNzOyB3ZSBvcHQgZm9yIGNob3BwaW5lc3Mgb3ZlciBhbGxvd2luZyB0aGUgYnJvd3NlciB0byBkcm9wIGh1Z2UgY2h1bmtzIG9mIGZyYW1lcy4gKi9cbiAgICAgICAgICAgIHZhciB0aW1lQ3VycmVudCA9IChuZXcgRGF0ZSkuZ2V0VGltZSgpO1xuXG4gICAgICAgICAgICAvKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgIENhbGwgSXRlcmF0aW9uXG4gICAgICAgICAgICAqKioqKioqKioqKioqKioqKioqKi9cblxuICAgICAgICAgICAgLyogSXRlcmF0ZSB0aHJvdWdoIGVhY2ggYWN0aXZlIGNhbGwuICovXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgY2FsbHNMZW5ndGggPSBWZWxvY2l0eS5TdGF0ZS5jYWxscy5sZW5ndGg7IGkgPCBjYWxsc0xlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgLyogV2hlbiBhIHZlbG9jaXR5IGNhbGwgaXMgY29tcGxldGVkLCBpdHMgVmVsb2NpdHkuU3RhdGUuY2FsbHMgYXJyYXkgZW50cnkgaXMgc2V0IHRvIGZhbHNlLiBDb250aW51ZSBvbiB0byB0aGUgbmV4dCBjYWxsLiAqL1xuICAgICAgICAgICAgICAgIGlmICghVmVsb2NpdHkuU3RhdGUuY2FsbHNbaV0pIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqKioqKioqKlxuICAgICAgICAgICAgICAgICAgIENhbGwtV2lkZSBWYXJpYWJsZXNcbiAgICAgICAgICAgICAgICAqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgICAgICB2YXIgY2FsbENvbnRhaW5lciA9IFZlbG9jaXR5LlN0YXRlLmNhbGxzW2ldLFxuICAgICAgICAgICAgICAgICAgICBjYWxsID0gY2FsbENvbnRhaW5lclswXSxcbiAgICAgICAgICAgICAgICAgICAgb3B0cyA9IGNhbGxDb250YWluZXJbMl0sXG4gICAgICAgICAgICAgICAgICAgIHRpbWVTdGFydCA9IGNhbGxDb250YWluZXJbM107XG5cbiAgICAgICAgICAgICAgICAvKiBJZiB0aW1lU3RhcnQgaXMgdW5kZWZpbmVkLCB0aGVuIHRoaXMgaXMgdGhlIGZpcnN0IHRpbWUgdGhhdCB0aGlzIGNhbGwgaGFzIGJlZW4gcHJvY2Vzc2VkIGJ5IHRpY2soKS4gV2UgYXNzaWduIHRpbWVTdGFydCBub3cgc28gdGhhdCBpdHMgdmFsdWUgaXMgYXMgY2xvc2UgdG8gdGhlIHJlYWwgYW5pbWF0aW9uIHN0YXJ0IHRpbWUgYXMgcG9zc2libGUuXG4gICAgICAgICAgICAgICAgICAgKENvbnZlcnNlbHksIGhhZCB0aW1lU3RhcnQgYmVlbiBkZWZpbmVkIHdoZW4gdGhpcyBjYWxsIHdhcyBhZGRlZCB0byBWZWxvY2l0eS5TdGF0ZS5jYWxscywgdGhlIGRlbGF5IGJldHdlZW4gdGhhdCB0aW1lIGFuZCBub3cgd291bGQgY2F1c2UgdGhlIGZpcnN0IGZldyBmcmFtZXMgb2YgdGhlIHR3ZWVuIHRvIGJlIHNraXBwZWQgc2luY2UgcGVyY2VudENvbXBsZXRlIGlzXG4gICAgICAgICAgICAgICAgICAgY2FsY3VsYXRlZCByZWxhdGl2ZSB0byB0aW1lU3RhcnQuKSAqL1xuICAgICAgICAgICAgICAgIC8qIEZ1cnRoZXIsIHN1YnRyYWN0IDE2bXMgKHRoZSBhcHByb3hpbWF0ZSByZXNvbHV0aW9uIG9mIFJBRikgZnJvbSB0aGUgY3VycmVudCB0aW1lIHZhbHVlIHNvIHRoYXQgdGhlIGZpcnN0IHRpY2sgaXRlcmF0aW9uIGlzbid0IHdhc3RlZCBieSBhbmltYXRpbmcgYXQgMCUgdHdlZW4gY29tcGxldGlvbixcbiAgICAgICAgICAgICAgICAgICB3aGljaCB3b3VsZCBwcm9kdWNlIHRoZSBzYW1lIHN0eWxlIHZhbHVlIGFzIHRoZSBlbGVtZW50J3MgY3VycmVudCB2YWx1ZS4gKi9cbiAgICAgICAgICAgICAgICBpZiAoIXRpbWVTdGFydCkge1xuICAgICAgICAgICAgICAgICAgICB0aW1lU3RhcnQgPSBWZWxvY2l0eS5TdGF0ZS5jYWxsc1tpXVszXSA9IHRpbWVDdXJyZW50IC0gMTY7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLyogVGhlIHR3ZWVuJ3MgY29tcGxldGlvbiBwZXJjZW50YWdlIGlzIHJlbGF0aXZlIHRvIHRoZSB0d2VlbidzIHN0YXJ0IHRpbWUsIG5vdCB0aGUgdHdlZW4ncyBzdGFydCB2YWx1ZSAod2hpY2ggd291bGQgcmVzdWx0IGluIHVucHJlZGljdGFibGUgdHdlZW4gZHVyYXRpb25zIHNpbmNlIEphdmFTY3JpcHQncyB0aW1lcnMgYXJlIG5vdCBwYXJ0aWN1bGFybHkgYWNjdXJhdGUpLlxuICAgICAgICAgICAgICAgICAgIEFjY29yZGluZ2x5LCB3ZSBlbnN1cmUgdGhhdCBwZXJjZW50Q29tcGxldGUgZG9lcyBub3QgZXhjZWVkIDEuICovXG4gICAgICAgICAgICAgICAgdmFyIHBlcmNlbnRDb21wbGV0ZSA9IE1hdGgubWluKCh0aW1lQ3VycmVudCAtIHRpbWVTdGFydCkgLyBvcHRzLmR1cmF0aW9uLCAxKTtcblxuICAgICAgICAgICAgICAgIC8qKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICAgICAgRWxlbWVudCBJdGVyYXRpb25cbiAgICAgICAgICAgICAgICAqKioqKioqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgICAgICAgICAgLyogRm9yIGV2ZXJ5IGNhbGwsIGl0ZXJhdGUgdGhyb3VnaCBlYWNoIG9mIHRoZSBlbGVtZW50cyBpbiBpdHMgc2V0LiAqL1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGogPSAwLCBjYWxsTGVuZ3RoID0gY2FsbC5sZW5ndGg7IGogPCBjYWxsTGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHR3ZWVuc0NvbnRhaW5lciA9IGNhbGxbal0sXG4gICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50ID0gdHdlZW5zQ29udGFpbmVyLmVsZW1lbnQ7XG5cbiAgICAgICAgICAgICAgICAgICAgLyogQ2hlY2sgdG8gc2VlIGlmIHRoaXMgZWxlbWVudCBoYXMgYmVlbiBkZWxldGVkIG1pZHdheSB0aHJvdWdoIHRoZSBhbmltYXRpb24gYnkgY2hlY2tpbmcgZm9yIHRoZSBjb250aW51ZWQgZXhpc3RlbmNlIG9mIGl0cyBkYXRhIGNhY2hlLiBJZiBpdCdzIGdvbmUsIHNraXAgYW5pbWF0aW5nIHRoaXMgZWxlbWVudC4gKi9cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFEYXRhKGVsZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHZhciB0cmFuc2Zvcm1Qcm9wZXJ0eUV4aXN0cyA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgICAgIC8qKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgICAgICAgICAgRGlzcGxheSBUb2dnbGluZ1xuICAgICAgICAgICAgICAgICAgICAqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgICAgICAgICAgLyogSWYgdGhlIGRpc3BsYXkgb3B0aW9uIGlzIHNldCB0byBub24tXCJub25lXCIsIHNldCBpdCB1cGZyb250IHNvIHRoYXQgdGhlIGVsZW1lbnQgaGFzIGEgY2hhbmNlIHRvIGJlY29tZSB2aXNpYmxlIGJlZm9yZSB0d2VlbmluZyBiZWdpbnMuIChPdGhlcndpc2UsIGRpc3BsYXkncyBcIm5vbmVcIiB2YWx1ZSBpcyBzZXQgaW4gY29tcGxldGVDYWxsKCkgb25jZSB0aGUgYW5pbWF0aW9uIGhhcyBjb21wbGV0ZWQuKSAqL1xuICAgICAgICAgICAgICAgICAgICBpZiAob3B0cy5kaXNwbGF5ICYmIG9wdHMuZGlzcGxheSAhPT0gXCJub25lXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIENTUy5zZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwiZGlzcGxheVwiLCBvcHRzLmRpc3BsYXkpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqKioqKioqKlxuICAgICAgICAgICAgICAgICAgICAgICBQcm9wZXJ0eSBJdGVyYXRpb25cbiAgICAgICAgICAgICAgICAgICAgKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgICAgICAgICAgICAgIC8qIEZvciBldmVyeSBlbGVtZW50LCBpdGVyYXRlIHRocm91Z2ggZWFjaCBwcm9wZXJ0eS4gKi9cbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgcHJvcGVydHkgaW4gdHdlZW5zQ29udGFpbmVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvKiBOb3RlOiBJbiBhZGRpdGlvbiB0byBwcm9wZXJ0eSB0d2VlbiBkYXRhLCB0d2VlbnNDb250YWluZXIgY29udGFpbnMgYSByZWZlcmVuY2UgdG8gaXRzIGFzc29jaWF0ZWQgZWxlbWVudC4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eSAhPT0gXCJlbGVtZW50XCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgdHdlZW4gPSB0d2VlbnNDb250YWluZXJbcHJvcGVydHldLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50VmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIEVhc2luZyBjYW4gZWl0aGVyIGJlIGEgYmV6aWVyIGZ1bmN0aW9uIG9yIGEgc3RyaW5nIHRoYXQgcmVmZXJlbmNlcyBhIHByZS1yZWdpc3RlcmVkIGVhc2luZyBvbiB0aGUgVmVsb2NpdHkuRWFzaW5ncyBvYmplY3QuIEluIGVpdGhlciBjYXNlLCByZXR1cm4gdGhlIGFwcHJvcHJpYXRlIGVhc2luZyBmdW5jdGlvbi4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWFzaW5nID0gVHlwZS5pc1N0cmluZyh0d2Vlbi5lYXNpbmcpID8gVmVsb2NpdHkuRWFzaW5nc1t0d2Vlbi5lYXNpbmddIDogdHdlZW4uZWFzaW5nO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIEN1cnJlbnQgVmFsdWUgQ2FsY3VsYXRpb25cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBJZiB0aGlzIGlzIHRoZSBsYXN0IHRpY2sgcGFzcyAoaWYgd2UndmUgcmVhY2hlZCAxMDAlIGNvbXBsZXRpb24gZm9yIHRoaXMgdHdlZW4pLCBlbnN1cmUgdGhhdCBjdXJyZW50VmFsdWUgaXMgZXhwbGljaXRseSBzZXQgdG8gaXRzIHRhcmdldCBlbmRWYWx1ZSBzbyB0aGF0IGl0J3Mgbm90IHN1YmplY3RlZCB0byBhbnkgcm91bmRpbmcuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHBlcmNlbnRDb21wbGV0ZSA9PT0gMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50VmFsdWUgPSB0d2Vlbi5lbmRWYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBPdGhlcndpc2UsIGNhbGN1bGF0ZSBjdXJyZW50VmFsdWUgYmFzZWQgb24gdGhlIGN1cnJlbnQgZGVsdGEgZnJvbSBzdGFydFZhbHVlLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJlbnRWYWx1ZSA9IHR3ZWVuLnN0YXJ0VmFsdWUgKyAoKHR3ZWVuLmVuZFZhbHVlIC0gdHdlZW4uc3RhcnRWYWx1ZSkgKiBlYXNpbmcocGVyY2VudENvbXBsZXRlKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHdlZW4uY3VycmVudFZhbHVlID0gY3VycmVudFZhbHVlO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKioqKlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIEhvb2tzOiBQYXJ0IElcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBGb3IgaG9va2VkIHByb3BlcnRpZXMsIHRoZSBuZXdseS11cGRhdGVkIHJvb3RQcm9wZXJ0eVZhbHVlQ2FjaGUgaXMgY2FjaGVkIG9udG8gdGhlIGVsZW1lbnQgc28gdGhhdCBpdCBjYW4gYmUgdXNlZCBmb3Igc3Vic2VxdWVudCBob29rcyBpbiB0aGlzIGNhbGwgdGhhdCBhcmUgYXNzb2NpYXRlZCB3aXRoIHRoZSBzYW1lIHJvb3QgcHJvcGVydHkuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSWYgd2UgZGlkbid0IGNhY2hlIHRoZSB1cGRhdGVkIHJvb3RQcm9wZXJ0eVZhbHVlLCBlYWNoIHN1YnNlcXVlbnQgdXBkYXRlIHRvIHRoZSByb290IHByb3BlcnR5IGluIHRoaXMgdGljayBwYXNzIHdvdWxkIHJlc2V0IHRoZSBwcmV2aW91cyBob29rJ3MgdXBkYXRlcyB0byByb290UHJvcGVydHlWYWx1ZSBwcmlvciB0byBpbmplY3Rpb24uICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogQSBuaWNlIHBlcmZvcm1hbmNlIGJ5cHJvZHVjdCBvZiByb290UHJvcGVydHlWYWx1ZSBjYWNoaW5nIGlzIHRoYXQgc3Vic2VxdWVudGx5IGNoYWluZWQgYW5pbWF0aW9ucyB1c2luZyB0aGUgc2FtZSBob29rUm9vdCBidXQgYSBkaWZmZXJlbnQgaG9vayBjYW4gdXNlIHRoaXMgY2FjaGVkIHJvb3RQcm9wZXJ0eVZhbHVlLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChDU1MuSG9va3MucmVnaXN0ZXJlZFtwcm9wZXJ0eV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGhvb2tSb290ID0gQ1NTLkhvb2tzLmdldFJvb3QocHJvcGVydHkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcm9vdFByb3BlcnR5VmFsdWVDYWNoZSA9IERhdGEoZWxlbWVudCkucm9vdFByb3BlcnR5VmFsdWVDYWNoZVtob29rUm9vdF07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJvb3RQcm9wZXJ0eVZhbHVlQ2FjaGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR3ZWVuLnJvb3RQcm9wZXJ0eVZhbHVlID0gcm9vdFByb3BlcnR5VmFsdWVDYWNoZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qKioqKioqKioqKioqKioqKlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBET00gVXBkYXRlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBzZXRQcm9wZXJ0eVZhbHVlKCkgcmV0dXJucyBhbiBhcnJheSBvZiB0aGUgcHJvcGVydHkgbmFtZSBhbmQgcHJvcGVydHkgdmFsdWUgcG9zdCBhbnkgbm9ybWFsaXphdGlvbiB0aGF0IG1heSBoYXZlIGJlZW4gcGVyZm9ybWVkLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIE5vdGU6IFRvIHNvbHZlIGFuIElFPD04IHBvc2l0aW9uaW5nIGJ1ZywgdGhlIHVuaXQgdHlwZSBpcyBkcm9wcGVkIHdoZW4gc2V0dGluZyBhIHByb3BlcnR5IHZhbHVlIG9mIDAuICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGFkanVzdGVkU2V0RGF0YSA9IENTUy5zZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIHByb3BlcnR5LCB0d2Vlbi5jdXJyZW50VmFsdWUgKyAocGFyc2VGbG9hdChjdXJyZW50VmFsdWUpID09PSAwID8gXCJcIiA6IHR3ZWVuLnVuaXRUeXBlKSwgdHdlZW4ucm9vdFByb3BlcnR5VmFsdWUsIHR3ZWVuLnNjcm9sbERhdGEpOyAvKiBTRVQgKi9cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSG9va3M6IFBhcnQgSUlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAqKioqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogTm93IHRoYXQgd2UgaGF2ZSB0aGUgaG9vaydzIHVwZGF0ZWQgcm9vdFByb3BlcnR5VmFsdWUgKHdoaWNoIGlzIHRoZSBwb3N0LXByb2Nlc3NlZCB2YWx1ZSBwcm92aWRlZCBieSB0aGUgYWRqdXN0ZWRTZXREYXRhIGFycmF5KSwgY2FjaGUgaXQgb250byB0aGUgZWxlbWVudC4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoQ1NTLkhvb2tzLnJlZ2lzdGVyZWRbcHJvcGVydHldKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8qIFNpbmNlIGFkanVzdGVkU2V0RGF0YSBjb250YWlucyBub3JtYWxpemVkIGRhdGEgcmVhZHkgZm9yIERPTSB1cGRhdGluZywgdGhlIHJvb3RQcm9wZXJ0eVZhbHVlIG5lZWRzIHRvIGJlIHJlLWV4dHJhY3RlZCBmcm9tIGl0cyBub3JtYWxpemVkIGZvcm0uICovXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChDU1MuTm9ybWFsaXphdGlvbnMucmVnaXN0ZXJlZFtob29rUm9vdF0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIERhdGEoZWxlbWVudCkucm9vdFByb3BlcnR5VmFsdWVDYWNoZVtob29rUm9vdF0gPSBDU1MuTm9ybWFsaXphdGlvbnMucmVnaXN0ZXJlZFtob29rUm9vdF0oXCJleHRyYWN0XCIsIG51bGwsIGFkanVzdGVkU2V0RGF0YVsxXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBEYXRhKGVsZW1lbnQpLnJvb3RQcm9wZXJ0eVZhbHVlQ2FjaGVbaG9va1Jvb3RdID0gYWRqdXN0ZWRTZXREYXRhWzFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyoqKioqKioqKioqKioqKlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFRyYW5zZm9ybXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBGbGFnIHdoZXRoZXIgYSB0cmFuc2Zvcm0gcHJvcGVydHkgaXMgYmVpbmcgYW5pbWF0ZWQgc28gdGhhdCBmbHVzaFRyYW5zZm9ybUNhY2hlKCkgY2FuIGJlIHRyaWdnZXJlZCBvbmNlIHRoaXMgdGljayBwYXNzIGlzIGNvbXBsZXRlLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhZGp1c3RlZFNldERhdGFbMF0gPT09IFwidHJhbnNmb3JtXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNmb3JtUHJvcGVydHlFeGlzdHMgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8qKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICAgICAgICAgICBtb2JpbGVIQVxuICAgICAgICAgICAgICAgICAgICAqKioqKioqKioqKioqKioqL1xuXG4gICAgICAgICAgICAgICAgICAgIC8qIElmIG1vYmlsZUhBIGlzIGVuYWJsZWQsIHNldCB0aGUgdHJhbnNsYXRlM2QgdHJhbnNmb3JtIHRvIG51bGwgdG8gZm9yY2UgaGFyZHdhcmUgYWNjZWxlcmF0aW9uLiBJdCdzIHNhZmUgdG8gb3ZlcnJpZGUgdGhpcyBwcm9wZXJ0eSBzaW5jZSBWZWxvY2l0eSBkb2Vzbid0IGFjdHVhbGx5IHN1cHBvcnQgaXRzIGFuaW1hdGlvbiAoaG9va3MgYXJlIHVzZWQgaW4gaXRzIHBsYWNlKS4gKi9cbiAgICAgICAgICAgICAgICAgICAgaWYgKG9wdHMubW9iaWxlSEEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIERvbid0IHNldCB0aGUgbnVsbCB0cmFuc2Zvcm0gaGFjayBpZiB3ZSd2ZSBhbHJlYWR5IGRvbmUgc28uICovXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoRGF0YShlbGVtZW50KS50cmFuc2Zvcm1DYWNoZS50cmFuc2xhdGUzZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyogQWxsIGVudHJpZXMgb24gdGhlIHRyYW5zZm9ybUNhY2hlIG9iamVjdCBhcmUgY29uY2F0ZW5hdGVkIGludG8gYSBzaW5nbGUgdHJhbnNmb3JtIHN0cmluZyB2aWEgZmx1c2hUcmFuc2Zvcm1DYWNoZSgpLiAqL1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIERhdGEoZWxlbWVudCkudHJhbnNmb3JtQ2FjaGUudHJhbnNsYXRlM2QgPSBcIigwcHgsIDBweCwgMHB4KVwiO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNmb3JtUHJvcGVydHlFeGlzdHMgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHRyYW5zZm9ybVByb3BlcnR5RXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBDU1MuZmx1c2hUcmFuc2Zvcm1DYWNoZShlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8qIFRoZSBub24tXCJub25lXCIgZGlzcGxheSB2YWx1ZSBpcyBvbmx5IGFwcGxpZWQgdG8gYW4gZWxlbWVudCBvbmNlIC0tIHdoZW4gaXRzIGFzc29jaWF0ZWQgY2FsbCBpcyBmaXJzdCB0aWNrZWQgdGhyb3VnaC4gQWNjb3JkaW5nbHksIGl0J3Mgc2V0IHRvIGZhbHNlIHNvIHRoYXQgaXQgaXNuJ3QgcmUtcHJvY2Vzc2VkIGJ5IHRoaXMgY2FsbCBpbiB0aGUgbmV4dCB0aWNrLiAqL1xuICAgICAgICAgICAgICAgIGlmIChvcHRzLmRpc3BsYXkgJiYgb3B0cy5kaXNwbGF5ICE9PSBcIm5vbmVcIikge1xuICAgICAgICAgICAgICAgICAgICBWZWxvY2l0eS5TdGF0ZS5jYWxsc1tpXVsyXS5kaXNwbGF5ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLyogUGFzcyB0aGUgZWxlbWVudHMgYW5kIHRoZSB0aW1pbmcgZGF0YSAocGVyY2VudENvbXBsZXRlLCBtc1JlbWFpbmluZywgYW5kIHRpbWVTdGFydCkgaW50byB0aGUgcHJvZ3Jlc3MgY2FsbGJhY2suICovXG4gICAgICAgICAgICAgICAgaWYgKG9wdHMucHJvZ3Jlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgb3B0cy5wcm9ncmVzcy5jYWxsKGNhbGxDb250YWluZXJbMV0sIGNhbGxDb250YWluZXJbMV0sIHBlcmNlbnRDb21wbGV0ZSwgTWF0aC5tYXgoMCwgKHRpbWVTdGFydCArIG9wdHMuZHVyYXRpb24pIC0gdGltZUN1cnJlbnQpLCB0aW1lU3RhcnQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8qIElmIHRoaXMgY2FsbCBoYXMgZmluaXNoZWQgdHdlZW5pbmcsIHBhc3MgaXRzIGluZGV4IHRvIGNvbXBsZXRlQ2FsbCgpIHRvIGhhbmRsZSBjYWxsIGNsZWFudXAuICovXG4gICAgICAgICAgICAgICAgaWYgKHBlcmNlbnRDb21wbGV0ZSA9PT0gMSkge1xuICAgICAgICAgICAgICAgICAgICBjb21wbGV0ZUNhbGwoaSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLyogTm90ZTogY29tcGxldGVDYWxsKCkgY29udGFpbnMgdGhlIGxvZ2ljIGZvciBzZXR0aW5nIHRoZSBpc1RpY2tpbmcgZmxhZyB0byBmYWxzZSAod2hpY2ggb2NjdXJzIHdoZW4gdGhlIGxhc3QgYWN0aXZlIGNhbGwgb24gVmVsb2NpdHkuU3RhdGUuY2FsbHMgaGFzIGNvbXBsZXRlZCkuICovXG4gICAgICAgIGlmIChWZWxvY2l0eS5TdGF0ZS5pc1RpY2tpbmcpIHtcbiAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aWNrKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgIENhbGwgQ29tcGxldGlvblxuICAgICoqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAvKiBOb3RlOiBVbmxpa2UgdGljaygpLCB3aGljaCBwcm9jZXNzZXMgYWxsIGFjdGl2ZSBjYWxscyBhdCBvbmNlLCBjYWxsIGNvbXBsZXRpb24gaXMgaGFuZGxlZCBvbiBhIHBlci1jYWxsIGJhc2lzLiAqL1xuICAgIGZ1bmN0aW9uIGNvbXBsZXRlQ2FsbCAoY2FsbEluZGV4LCBpc1N0b3BwZWQpIHtcbiAgICAgICAgLyogRW5zdXJlIHRoZSBjYWxsIGV4aXN0cy4gKi9cbiAgICAgICAgaWYgKCFWZWxvY2l0eS5TdGF0ZS5jYWxsc1tjYWxsSW5kZXhdKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICAvKiBQdWxsIHRoZSBtZXRhZGF0YSBmcm9tIHRoZSBjYWxsLiAqL1xuICAgICAgICB2YXIgY2FsbCA9IFZlbG9jaXR5LlN0YXRlLmNhbGxzW2NhbGxJbmRleF1bMF0sXG4gICAgICAgICAgICBlbGVtZW50cyA9IFZlbG9jaXR5LlN0YXRlLmNhbGxzW2NhbGxJbmRleF1bMV0sXG4gICAgICAgICAgICBvcHRzID0gVmVsb2NpdHkuU3RhdGUuY2FsbHNbY2FsbEluZGV4XVsyXTtcblxuICAgICAgICB2YXIgcmVtYWluaW5nQ2FsbHNFeGlzdCA9IGZhbHNlO1xuXG4gICAgICAgIC8qKioqKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgICAgIEVsZW1lbnQgRmluYWxpemF0aW9uXG4gICAgICAgICoqKioqKioqKioqKioqKioqKioqKioqKiovXG4gICAgICAgICAgICBcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGNhbGxMZW5ndGggPSBjYWxsLmxlbmd0aDsgaSA8IGNhbGxMZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGVsZW1lbnQgPSBjYWxsW2ldLmVsZW1lbnQ7XG5cbiAgICAgICAgICAgIC8qIElmIHRoZSBkaXNwbGF5IG9wdGlvbiBpcyBzZXQgdG8gXCJub25lXCIgKG1lYW5pbmcgdGhlIHVzZXIgaW50ZW5kcyB0byBoaWRlIHRoZSBlbGVtZW50KSwgc2V0IHRoaXMgdmFsdWUgbm93IHRoYXQgdGhlIGFuaW1hdGlvbiBpcyBjb21wbGV0ZS4gKi9cbiAgICAgICAgICAgIC8qIE5vdGU6IFRoZSBkaXNwbGF5IG9wdGlvbiBpcyBpZ25vcmVkIHdpdGggXCJyZXZlcnNlXCIgY2FsbHMsIHdoaWNoIGlzIHdoYXQgbG9vcHMgYXJlIGNvbXBvc2VkIG9mLiBTZWUgcmV2ZXJzZSdzIGxvZ2ljIGZvciBmdXJ0aGVyIGRldGFpbHMuICovXG4gICAgICAgICAgICAvKiBOb3RlOiBkaXNwbGF5Om5vbmUgaXNuJ3Qgc2V0IHdoZW4gY2FsbHMgYXJlIG1hbnVhbGx5IHN0b3BwZWQgKHZpYSBWZWxvY2l0eS5hbmltYXRlKFwic3RvcFwiKS4gKi9cbiAgICAgICAgICAgIGlmICghaXNTdG9wcGVkICYmIG9wdHMuZGlzcGxheSA9PT0gXCJub25lXCIgJiYgIW9wdHMubG9vcCkge1xuICAgICAgICAgICAgICAgIENTUy5zZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwiZGlzcGxheVwiLCBvcHRzLmRpc3BsYXkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvKiBJZiB0aGUgZWxlbWVudCdzIHF1ZXVlIGlzIGVtcHR5IChpZiBvbmx5IHRoZSBcImlucHJvZ3Jlc3NcIiBpdGVtIGlzIGxlZnQgYXQgcG9zaXRpb24gMCkgb3IgaWYgaXRzIHF1ZXVlIGlzIGFib3V0IHRvIHJ1biBhIG5vbi1WZWxvY2l0eS1pbml0aWF0ZWQgZW50cnksIHR1cm4gb2ZmIHRoZSBpc0FuaW1hdGluZyBmbGFnLlxuICAgICAgICAgICAgICAgQSBub24tVmVsb2NpdHktaW5pdGlhdGllZCBxdWV1ZSBlbnRyeSdzIGxvZ2ljIG1pZ2h0IGFsdGVyIGFuIGVsZW1lbnQncyBDU1MgdmFsdWVzIGFuZCB0aGVyZWJ5IGNhdXNlIFZlbG9jaXR5J3MgY2FjaGVkIHZhbHVlIGRhdGEgdG8gZ28gc3RhbGUuIFRvIGRldGVjdCBpZiBhIHF1ZXVlIGVudHJ5IHdhcyBpbml0aWF0ZWQgYnkgVmVsb2NpdHksXG4gICAgICAgICAgICAgICB3ZSBjaGVjayBmb3IgdGhlIGV4aXN0ZW5jZSBvZiBvdXIgc3BlY2lhbCBWZWxvY2l0eS5xdWV1ZUVudHJ5RmxhZyBkZWNsYXJhdGlvbiwgd2hpY2ggbWluaWZpZXJzIHdvbid0IHJlbmFtZSBzaW5jZSB0aGUgZmxhZyBpcyBhc3NpZ25lZCB0byBqUXVlcnkncyBnbG9iYWwgJCBvYmplY3QgYW5kIHRodXMgZXhpc3RzIG91dCBvZiBWZWxvY2l0eSdzIG93biBzY29wZS4gKi9cbiAgICAgICAgICAgIGlmICgkLnF1ZXVlKGVsZW1lbnQpWzFdID09PSB1bmRlZmluZWQgfHwgIS9cXC52ZWxvY2l0eVF1ZXVlRW50cnlGbGFnL2kudGVzdCgkLnF1ZXVlKGVsZW1lbnQpWzFdKSkge1xuICAgICAgICAgICAgICAgIC8qIFRoZSBlbGVtZW50IG1heSBoYXZlIGJlZW4gZGVsZXRlZC4gRW5zdXJlIHRoYXQgaXRzIGRhdGEgY2FjaGUgc3RpbGwgZXhpc3RzIGJlZm9yZSBhY3Rpbmcgb24gaXQuICovXG4gICAgICAgICAgICAgICAgaWYgKERhdGEoZWxlbWVudCkpIHtcbiAgICAgICAgICAgICAgICAgICAgRGF0YShlbGVtZW50KS5pc0FuaW1hdGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAvKiBDbGVhciB0aGUgZWxlbWVudCdzIHJvb3RQcm9wZXJ0eVZhbHVlQ2FjaGUsIHdoaWNoIHdpbGwgYmVjb21lIHN0YWxlLiAqL1xuICAgICAgICAgICAgICAgICAgICBEYXRhKGVsZW1lbnQpLnJvb3RQcm9wZXJ0eVZhbHVlQ2FjaGUgPSB7fTtcblxuICAgICAgICAgICAgICAgICAgICAvKiBUcmFuc2Zvcm0gc3VicHJvcGVydGllcyB0aGF0IHRyaWdnZXIgaGFyZHdhcmUgYWNjZWxlcmF0aW9uIGFyZSBkZS1hcHBsaWVkIGVudGlyZWx5IHdoZW4gdGhleSBoaXQgdGhlaXIgemVybyB2YWx1ZXMgc28gdGhhdCBIQSdkIGVsZW1lbnRzIGRvbid0IHJlbWFpbiBibHVycnkuICovXG4gICAgICAgICAgICAgICAgICAgIHZhciB0cmFuc2Zvcm1IQVByb3BlcnRpZXMgPSBbIFwidHJhbnNmb3JtUGVyc3BlY3RpdmVcIiwgXCJ0cmFuc2xhdGVaXCIsIFwicm90YXRlWFwiLCBcInJvdGF0ZVlcIiBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNmb3JtSEFQcm9wZXJ0eSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyYW5zZm9ybUhBUHJvcGVydHlFeGlzdHMgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciB0cmFuc2Zvcm1IQVByb3BlcnR5SW5kZXggaW4gdHJhbnNmb3JtSEFQcm9wZXJ0aWVzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm1IQVByb3BlcnR5ID0gdHJhbnNmb3JtSEFQcm9wZXJ0aWVzW3RyYW5zZm9ybUhBUHJvcGVydHlJbmRleF07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIElmIGFueSB0cmFuc2Zvcm0gc3VicHJvcGVydHkgYmVnaW5zIHdpdGggXCIoMFwiLCByZW1vdmUgaXQuICovXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoL15cXCgwW14uXS8udGVzdChEYXRhKGVsZW1lbnQpLnRyYW5zZm9ybUNhY2hlW3RyYW5zZm9ybUhBUHJvcGVydHldKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyYW5zZm9ybUhBUHJvcGVydHlFeGlzdHMgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBEYXRhKGVsZW1lbnQpLnRyYW5zZm9ybUNhY2hlW3RyYW5zZm9ybUhBUHJvcGVydHldO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLyogTW9iaWxlIGRldmljZXMgaGF2ZSBoYXJkd2FyZSBhY2NlbGVyYXRpb24gcmVtb3ZlZCBhdCB0aGUgZW5kIG9mIHRoZSBhbmltYXRpb24gaW4gb3JkZXIgdG8gYXZvaWQgc3RyYWluaW5nIHRoZSBHUFUncyBhdmFpbGFibGUgbWVtb3J5LiAqL1xuICAgICAgICAgICAgICAgICAgICBpZiAob3B0cy5tb2JpbGVIQSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNmb3JtSEFQcm9wZXJ0eUV4aXN0cyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgRGF0YShlbGVtZW50KS50cmFuc2Zvcm1DYWNoZS50cmFuc2xhdGUzZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8qIEZsdXNoIHRoZSBzdWJwcm9wZXJ0eSByZW1vdmFscyB0byB0aGUgRE9NLiAqL1xuICAgICAgICAgICAgICAgICAgICBpZiAodHJhbnNmb3JtSEFQcm9wZXJ0eUV4aXN0cykge1xuICAgICAgICAgICAgICAgICAgICAgICAgQ1NTLmZsdXNoVHJhbnNmb3JtQ2FjaGUoZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8qKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgICAgIE9wdGlvbjogQ29tcGxldGVcbiAgICAgICAgICAgICoqKioqKioqKioqKioqKioqKioqKi9cblxuICAgICAgICAgICAgLyogVGhlIGNvbXBsZXRlIGNhbGxiYWNrIGlzIGZpcmVkIG9uY2UgcGVyIGNhbGwgLS0gbm90IG9uY2UgcGVyIGVsZW1lbmV0IC0tIGFuZCBpcyBwYXNzZWQgdGhlIGZ1bGwgcmF3IERPTSBlbGVtZW50IHNldCBhcyBib3RoIGl0cyBjb250ZXh0IGFuZCBpdHMgZmlyc3QgYXJndW1lbnQuICovXG4gICAgICAgICAgICAvKiBOb3RlOiBDYWxsYmFja3MgYXJlbid0IGZpcmVkIHdoZW4gY2FsbHMgYXJlIG1hbnVhbGx5IHN0b3BwZWQgKHZpYSBWZWxvY2l0eS5hbmltYXRlKFwic3RvcFwiKS4gKi9cbiAgICAgICAgICAgIC8qIE5vdGU6IElmIHRoaXMgaXMgYSBsb29wLCBjb21wbGV0ZSBjYWxsYmFjayBmaXJpbmcgaXMgaGFuZGxlZCBieSB0aGUgbG9vcCdzIGZpbmFsIHJldmVyc2UgY2FsbCAtLSB3ZSBza2lwIGhhbmRsaW5nIGl0IGhlcmUuICovXG4gICAgICAgICAgICBpZiAoIWlzU3RvcHBlZCAmJiBvcHRzLmNvbXBsZXRlICYmICFvcHRzLmxvb3AgJiYgKGkgPT09IGNhbGxMZW5ndGggLSAxKSkge1xuICAgICAgICAgICAgICAgIG9wdHMuY29tcGxldGUuY2FsbChlbGVtZW50cywgZWxlbWVudHMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvKioqKioqKioqKioqKioqXG4gICAgICAgICAgICAgICBEZXF1ZXVlaW5nXG4gICAgICAgICAgICAqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgICAgIC8qIEZpcmUgdGhlIG5leHQgY2FsbCBpbiB0aGUgcXVldWUgc28gbG9uZyBhcyB0aGlzIGNhbGwncyBxdWV1ZSB3YXNuJ3Qgc2V0IHRvIGZhbHNlICh0byB0cmlnZ2VyIGEgcGFyYWxsZWwgYW5pbWF0aW9uKSwgd2hpY2ggd291bGQgaGF2ZSBhbHJlYWR5IGNhdXNlZCB0aGUgbmV4dCBjYWxsIHRvIGZpcmUuICovXG4gICAgICAgICAgICAvKiBOb3RlOiBFdmVuIGlmIHRoZSBlbmQgb2YgdGhlIGFuaW1hdGlvbiBxdWV1ZSBoYXMgYmVlbiByZWFjaGVkLCAkLmRlcXVldWUoKSBtdXN0IHN0aWxsIGJlIGNhbGxlZCBpbiBvcmRlciB0byBjb21wbGV0ZWx5IGNsZWFyIGpRdWVyeSdzIGFuaW1hdGlvbiBxdWV1ZS4gKi9cbiAgICAgICAgICAgIGlmIChvcHRzLnF1ZXVlICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICQuZGVxdWV1ZShlbGVtZW50LCBvcHRzLnF1ZXVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8qKioqKioqKioqKioqKioqKioqKioqKipcbiAgICAgICAgICAgQ2FsbHMgQXJyYXkgQ2xlYW51cFxuICAgICAgICAqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAgICAgLyogU2luY2UgdGhpcyBjYWxsIGlzIGNvbXBsZXRlLCByZW1vdmUgaXQgZnJvbSBWZWxvY2l0eS5TdGF0ZS5jYWxscy4gRm9yIHBlcmZvcm1hbmNlIHJlYXNvbnMsIHRoZSBjYWxsIGlzIHNldCB0byBmYWxzZSBpbnN0ZWFkIG9mIGJlaW5nIGRlbGV0ZWQgZnJvbSB0aGUgYXJyYXkuIExlYXJuIG1vcmUgaGVyZTogaHR0cDovL3d3dy5odG1sNXJvY2tzLmNvbS9lbi90dXRvcmlhbHMvc3BlZWQvdjgvICovXG4gICAgICAgIFZlbG9jaXR5LlN0YXRlLmNhbGxzW2NhbGxJbmRleF0gPSBmYWxzZTtcblxuICAgICAgICAvKiBJdGVyYXRlIHRocm91Z2ggdGhlIGNhbGxzIGFycmF5IHRvIGRldGVybWluZSBpZiB0aGlzIHdhcyB0aGUgbGFzdCBydW5uaW5nIGFuaW1hdGlvbi4gSWYgc28sIHNldCBhIGZsYWcgdG8gZW5kIHRpY2tpbmcgYW5kIGNsZWFyIHRoZSBjYWxscyBhcnJheS4gKi9cbiAgICAgICAgZm9yICh2YXIgaiA9IDAsIGNhbGxzTGVuZ3RoID0gVmVsb2NpdHkuU3RhdGUuY2FsbHMubGVuZ3RoOyBqIDwgY2FsbHNMZW5ndGg7IGorKykge1xuICAgICAgICAgICAgaWYgKFZlbG9jaXR5LlN0YXRlLmNhbGxzW2pdICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIHJlbWFpbmluZ0NhbGxzRXhpc3QgPSB0cnVlO1xuXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9ICAgIFxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJlbWFpbmluZ0NhbGxzRXhpc3QgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAvKiB0aWNrKCkgd2lsbCBkZXRlY3QgdGhpcyBmbGFnIHVwb24gaXRzIG5leHQgaXRlcmF0aW9uIGFuZCBzdWJzZXF1ZW50bHkgdHVybiBpdHNlbGYgb2ZmLiAqL1xuICAgICAgICAgICAgVmVsb2NpdHkuU3RhdGUuaXNUaWNraW5nID0gZmFsc2U7XG5cbiAgICAgICAgICAgIC8qIENsZWFyIHRoZSBjYWxscyBhcnJheSBzbyB0aGF0IGl0cyBsZW5ndGggaXMgcmVzZXQuICovXG4gICAgICAgICAgICBkZWxldGUgVmVsb2NpdHkuU3RhdGUuY2FsbHM7XG4gICAgICAgICAgICBWZWxvY2l0eS5TdGF0ZS5jYWxscyA9IFtdO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqKioqKioqKioqKioqKioqKipcbiAgICAgICAgSW5zdGFsbGF0aW9uXG4gICAgKioqKioqKioqKioqKioqKioqKi9cblxuICAgIC8qIEJvdGggalF1ZXJ5IGFuZCBaZXB0byBhbGxvdyB0aGVpciAkLmZuIG9iamVjdCB0byBiZSBleHRlbmRlZCB0byBhbGxvdyB3cmFwcGVkIGVsZW1lbnRzIHRvIGJlIHN1YmplY3RlZCB0byBwbHVnaW4gY2FsbHMuIElmIGVpdGhlciBmcmFtZXdvcmsgaXMgbG9hZGVkLCByZWdpc3RlciBhIFwidmVsb2NpdHlcIiBleHRlbnNpb24gcG9pbnRpbmcgdG8gVmVsb2NpdHkncyBjb3JlIGFuaW1hdGUoKSBtZXRob2QuICovXG4gICAgdmFyIGZyYW1ld29yayA9IHdpbmRvdy5qUXVlcnkgfHwgd2luZG93LlplcHRvO1xuXG4gICAgaWYgKGZyYW1ld29yaykge1xuICAgICAgICAvKiBBc3NpZ24gdGhlIG9iamVjdCBmdW5jdGlvbiB0byBWZWxvY2l0eSdzIGFuaW1hdGUoKSBtZXRob2QuICovXG4gICAgICAgIGZyYW1ld29yay5mbi52ZWxvY2l0eSA9IFZlbG9jaXR5LmFuaW1hdGU7XG5cbiAgICAgICAgLyogQXNzaWduIHRoZSBvYmplY3QgZnVuY3Rpb24ncyBkZWZhdWx0cyB0byBWZWxvY2l0eSdzIGdsb2JhbCBkZWZhdWx0cyBvYmplY3QuICovXG4gICAgICAgIGZyYW1ld29yay5mbi52ZWxvY2l0eS5kZWZhdWx0cyA9IFZlbG9jaXR5LmRlZmF1bHRzO1xuICAgIH1cblxuICAgIC8qIFN1cHBvcnQgZm9yIEFNRCBhbmQgQ29tbW9uSlMgbW9kdWxlIGxvYWRlcnMuICovXG4gICAgaWYgKHR5cGVvZiBkZWZpbmUgIT09IFwidW5kZWZpbmVkXCIgJiYgZGVmaW5lLmFtZCkge1xuICAgICAgICBkZWZpbmUoZnVuY3Rpb24oKSB7IHJldHVybiBWZWxvY2l0eTsgfSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgbW9kdWxlICE9PSBcInVuZGVmaW5lZFwiICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gVmVsb2NpdHk7XG4gICAgfVxuXG4gICAgLyoqKioqKioqKioqKioqKioqKioqKioqXG4gICAgICAgUGFja2FnZWQgU2VxdWVuY2VzXG4gICAgKioqKioqKioqKioqKioqKioqKioqKiovXG5cbiAgICAvKiBzbGlkZVVwLCBzbGlkZURvd24gKi9cbiAgICAkLmVhY2goWyBcIkRvd25cIiwgXCJVcFwiIF0sIGZ1bmN0aW9uKGksIGRpcmVjdGlvbikge1xuICAgICAgICBWZWxvY2l0eS5TZXF1ZW5jZXNbXCJzbGlkZVwiICsgZGlyZWN0aW9uXSA9IGZ1bmN0aW9uIChlbGVtZW50LCBvcHRpb25zKSB7XG4gICAgICAgICAgICAvKiBEb24ndCByZS1ydW4gYSBzbGlkZSBzZXF1ZW5jZSBpZiB0aGUgZWxlbWVudCBpcyBhbHJlYWR5IGF0IGl0cyBmaW5hbCBkaXNwbGF5IHZhbHVlLiAqL1xuICAgICAgICAgICAgLy9pZiAoKGRpcmVjdGlvbiA9PT0gXCJVcFwiICYmIFZlbG9jaXR5LkNTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwiZGlzcGxheVwiKSA9PT0gMCkgfHxcbiAgICAgICAgICAgIC8vICAgIChkaXJlY3Rpb24gPT09IFwiRG93blwiICYmIFZlbG9jaXR5LkNTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwiZGlzcGxheVwiKSAhPT0gMCkpIHtcbiAgICAgICAgICAgIC8vICAgIHJldHVybjtcbiAgICAgICAgICAgIC8vfVxuXG4gICAgICAgICAgICB2YXIgb3B0cyA9ICQuZXh0ZW5kKHt9LCBvcHRpb25zKSxcbiAgICAgICAgICAgICAgICBvcmlnaW5hbFZhbHVlcyA9IHtcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBtYXJnaW5Ub3A6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIG1hcmdpbkJvdHRvbTogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgcGFkZGluZ1RvcDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgcGFkZGluZ0JvdHRvbTogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgb3ZlcmZsb3c6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIG92ZXJmbG93WDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgb3ZlcmZsb3dZOiBudWxsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAvKiBUaGUgc2xpZGUgZnVuY3Rpb25zIG1ha2UgdXNlIG9mIHRoZSBiZWdpbiBhbmQgY29tcGxldGUgY2FsbGJhY2tzLCBzbyB0aGUgdGhlIHVzZXIncyBjdXN0b20gY2FsbGJhY2tzIGFyZSBzdG9yZWQgdXBmcm9udCBmb3IgdHJpZ2dlcmluZyBvbmNlIHNsaWRlRG93bi9VcCdzIG93biBjYWxsYmFjayBsb2dpYyBpcyBjb21wbGV0ZS4gKi9cbiAgICAgICAgICAgICAgICBiZWdpbiA9IG9wdHMuYmVnaW4sXG4gICAgICAgICAgICAgICAgY29tcGxldGUgPSBvcHRzLmNvbXBsZXRlLFxuICAgICAgICAgICAgICAgIGlzSGVpZ2h0QXV0byA9IGZhbHNlO1xuXG4gICAgICAgICAgICAvKiBBbGxvdyB0aGUgdXNlciB0byBzZXQgZGlzcGxheSB0byBudWxsIHRvIGJ5cGFzcyBkaXNwbGF5IHRvZ2dsaW5nLiAqL1xuICAgICAgICAgICAgaWYgKG9wdHMuZGlzcGxheSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIC8qIFVubGVzcyB0aGUgdXNlciBpcyB0cnlpbmcgdG8gb3ZlcnJpZGUgdGhlIGRpc3BsYXkgb3B0aW9uLCBzaG93IHRoZSBlbGVtZW50IGJlZm9yZSBzbGlkZURvd24gYmVnaW5zIGFuZCBoaWRlIHRoZSBlbGVtZW50IGFmdGVyIHNsaWRlVXAgY29tcGxldGVzLiAqL1xuICAgICAgICAgICAgICAgIGlmIChkaXJlY3Rpb24gPT09IFwiRG93blwiKSB7XG4gICAgICAgICAgICAgICAgICAgIC8qIEFsbCBlbGVtZW50cyBzdWJqZWN0ZWQgdG8gc2xpZGluZyBkb3duIGFyZSBzZXQgdG8gdGhlIFwiYmxvY2tcIiBkaXNwbGF5IHZhbHVlICgtLSApYXMgb3Bwb3NlZCB0byBhbiBlbGVtZW50LWFwcHJvcHJpYXRlIGJsb2NrL2lubGluZSBkaXN0aW5jdGlvbikgYmVjYXVzZSBpbmxpbmUgZWxlbWVudHMgY2Fubm90IGFjdHVhbGx5IGhhdmUgdGhlaXIgZGltZW5zaW9ucyBtb2RpZmllZC4gKi9cbiAgICAgICAgICAgICAgICAgICAgb3B0cy5kaXNwbGF5ID0gb3B0cy5kaXNwbGF5IHx8IFZlbG9jaXR5LkNTUy5WYWx1ZXMuZ2V0RGlzcGxheVR5cGUoZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgb3B0cy5kaXNwbGF5ID0gb3B0cy5kaXNwbGF5IHx8IFwibm9uZVwiO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLyogQmVnaW4gY2FsbGJhY2suICovXG4gICAgICAgICAgICBvcHRzLmJlZ2luID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIC8qIENoZWNrIGZvciBoZWlnaHQ6IFwiYXV0b1wiIHNvIHdlIGNhbiByZXZlcnQgYmFjayB0byBpdCB3aGVuIHRoZSBzbGlkaW5nIGFuaW1hdGlvbiBpcyBjb21wbGV0ZS4gKi9cbiAgICAgICAgICAgICAgICBmdW5jdGlvbiBjaGVja0hlaWdodEF1dG8oKSB7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICAgICAgICAgICAgICAgICAgb3JpZ2luYWxWYWx1ZXMuaGVpZ2h0ID0gVmVsb2NpdHkuQ1NTLmdldFByb3BlcnR5VmFsdWUoZWxlbWVudCwgXCJoZWlnaHRcIik7XG5cbiAgICAgICAgICAgICAgICAgICAgLyogV2UgZGV0ZXJtaW5lIGlmIGhlaWdodCB3YXMgb3JpZ2luYWxseSBzZXQgdG8gXCJhdXRvXCIgYnkgY2hlY2tpbmcgaWYgdGhlIGNvbXB1dGVkIFwiYXV0b1wiIHZhbHVlIGlzIGlkZW50aWNhbCB0byB0aGUgb3JpZ2luYWwgdmFsdWUuICovXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gXCJhdXRvXCI7XG4gICAgICAgICAgICAgICAgICAgIGlmIChWZWxvY2l0eS5DU1MuZ2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcImhlaWdodFwiKSA9PT0gb3JpZ2luYWxWYWx1ZXMuaGVpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpc0hlaWdodEF1dG8gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLyogUmV2ZXJ0IHRvIHRoZSBjb21wdXRlZCB2YWx1ZSBiZWZvcmUgc2xpZGluZyBiZWdpbnMgdG8gcHJldmVudCB2ZXJ0aWNhbCBwb3BwaW5nIGR1ZSB0byBzY3JvbGxiYXJzLiAqL1xuICAgICAgICAgICAgICAgICAgICAvKiBOb3RlOiBXZWJraXQgaGFzIGEgZ2xpdGNoIHdoZXJlIGhlaWdodCBtdXN0IGJlIGV4cGxpY2l0bHkgYXNzaWduZWQgdGhlIFwicHhcIiB1bml0IHRvIHRha2UgZWZmZWN0IHdoZW4gaGVpZ2h0IGlzIGN1cnJlbnRseSBzZXQgdG8gXCJhdXRvXCIuICovXG4gICAgICAgICAgICAgICAgICAgIFZlbG9jaXR5LkNTUy5zZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwiaGVpZ2h0XCIsIG9yaWdpbmFsVmFsdWVzLmhlaWdodCArIFwicHhcIik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGRpcmVjdGlvbiA9PT0gXCJEb3duXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgb3JpZ2luYWxWYWx1ZXMub3ZlcmZsb3cgPSBbIFZlbG9jaXR5LkNTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwib3ZlcmZsb3dcIiksIDAgXTtcbiAgICAgICAgICAgICAgICAgICAgb3JpZ2luYWxWYWx1ZXMub3ZlcmZsb3dYID0gWyBWZWxvY2l0eS5DU1MuZ2V0UHJvcGVydHlWYWx1ZShlbGVtZW50LCBcIm92ZXJmbG93WFwiKSwgMCBdO1xuICAgICAgICAgICAgICAgICAgICBvcmlnaW5hbFZhbHVlcy5vdmVyZmxvd1kgPSBbIFZlbG9jaXR5LkNTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIFwib3ZlcmZsb3dZXCIpLCAwIF07XG5cbiAgICAgICAgICAgICAgICAgICAgLyogRW5zdXJlIHRoZSBlbGVtZW50IGlzIHZpc2libGUsIGFuZCB0ZW1wb3JhcmlseSByZW1vdmUgdmVydGljYWwgc2Nyb2xsYmFycyBzaW5jZSBhbmltYXRpbmcgdGhlbSBpcyB2aXN1YWxseSB1bmFwcGVhbGluZy4gKi9cbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5vdmVyZmxvdyA9IFwiaGlkZGVuXCI7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUub3ZlcmZsb3dYID0gXCJ2aXNpYmxlXCI7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuc3R5bGUub3ZlcmZsb3dZID0gXCJoaWRkZW5cIjtcblxuICAgICAgICAgICAgICAgICAgICAvKiBXaXRoIHRoZSBzY3JvbGxhcnMgbm8gbG9uZ2VyIGFmZmVjdGluZyBzaXppbmcsIGRldGVybWluZSB3aGV0aGVyIHRoZSBlbGVtZW50IGlzIGN1cnJlbnRseSBzZXQgdG8gaGVpZ2h0OiBcImF1dG9cIi4gKi9cbiAgICAgICAgICAgICAgICAgICAgY2hlY2tIZWlnaHRBdXRvKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgLyogQ2FjaGUgdGhlIGVsZW1lbnRzJyBvcmlnaW5hbCB2ZXJ0aWNhbCBkaW1lbnNpb25hbCB2YWx1ZXMgc28gdGhhdCB3ZSBjYW4gYW5pbWF0ZSBiYWNrIHRvIHRoZW0gZnJvbSBzdGFydGluZyB2YWx1ZXMgb2YgMC4gKi9cbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgcHJvcGVydHkgaW4gb3JpZ2luYWxWYWx1ZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIE92ZXJmbG93IHZhbHVlcyBoYXZlIGFscmVhZHkgYmVlbiBjYWNoZWQsIGRvIG5vdCBvdmVyd3JpdGUgdGhlbSB3aXRoIFwiaGlkZGVuXCIgKHdoaWNoIHRoZXkgd2VyZSBqdXN0IHNldCB0bykuICovXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoL15vdmVyZmxvdy8udGVzdChwcm9wZXJ0eSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgLyogVXNlIGZvcmNlZmVlZGluZyB0byBhbmltYXRlIHNsaWRlRG93biBwcm9wZXJ0aWVzIGZyb20gMC4gKi9cbiAgICAgICAgICAgICAgICAgICAgICAgIG9yaWdpbmFsVmFsdWVzW3Byb3BlcnR5XSA9IFsgVmVsb2NpdHkuQ1NTLmdldFByb3BlcnR5VmFsdWUoZWxlbWVudCwgcHJvcGVydHkpLCAwIF07XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvKiBIaWRlIHRoZSBlbGVtZW50IGluc2lkZSB0aGlzIGJlZ2luIGNhbGxiYWNrLCBvdGhlcndpc2UgaXQnbGwgbW9tZW50YXJpbHkgZmxhc2ggaXRzZWxmIGJlZm9yZSB0aGUgYWN0dWFsIGFuaW1hdGlvbiB0aWNrIGJlZ2lucy4gKi9cbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tIZWlnaHRBdXRvKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgcHJvcGVydHkgaW4gb3JpZ2luYWxWYWx1ZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8qIFVzZSBmb3JjZWZlZWRpbmcgdG8gYW5pbWF0ZSBzbGlkZVVwIHByb3BlcnRpZXMgdG93YXJkIDAuICovXG4gICAgICAgICAgICAgICAgICAgICAgICBvcmlnaW5hbFZhbHVlc1twcm9wZXJ0eV0gPSBbIDAsIFZlbG9jaXR5LkNTUy5nZXRQcm9wZXJ0eVZhbHVlKGVsZW1lbnQsIHByb3BlcnR5KSBdO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLyogQXMgd2l0aCBzbGlkZURvd24sIHNsaWRlVXAgaGlkZXMgdGhlIGVsZW1lbnQncyBzY3JvbGxiYXJzIHdoaWxlIGFuaW1hdGluZyBzaW5jZSBzY3JvbGxiYXIgaGVpZ2h0IHR3ZWVuaW5nIGxvb2tzIHVuYXBwZWFsaW5nLiAqL1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlLm92ZXJmbG93ID0gXCJoaWRkZW5cIjtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5vdmVyZmxvd1ggPSBcInZpc2libGVcIjtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5vdmVyZmxvd1kgPSBcImhpZGRlblwiO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8qIElmIHRoZSB1c2VyIHBhc3NlZCBpbiBhIGJlZ2luIGNhbGxiYWNrLCBmaXJlIGl0IG5vdy4gKi9cbiAgICAgICAgICAgICAgICBpZiAoYmVnaW4pIHtcbiAgICAgICAgICAgICAgICAgICAgYmVnaW4uY2FsbChlbGVtZW50LCBlbGVtZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8qIENvbXBsZXRlIGNhbGxiYWNrLiAqL1xuICAgICAgICAgICAgb3B0cy5jb21wbGV0ZSA9IGZ1bmN0aW9uIChlbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgdmFyIHByb3BlcnR5VmFsdWVQb3NpdGlvbiA9IChkaXJlY3Rpb24gPT09IFwiRG93blwiKSA/IDAgOiAxO1xuXG4gICAgICAgICAgICAgICAgaWYgKGlzSGVpZ2h0QXV0byA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgICAgICAvKiBJZiB0aGUgZWxlbWVudCdzIGhlaWdodCB3YXMgb3JpZ2luYWxseSBzZXQgdG8gYXV0bywgb3ZlcndyaXRlIHRoZSBjb21wdXRlZCB2YWx1ZSB3aXRoIFwiYXV0b1wiLiAqL1xuICAgICAgICAgICAgICAgICAgICBvcmlnaW5hbFZhbHVlcy5oZWlnaHRbcHJvcGVydHlWYWx1ZVBvc2l0aW9uXSA9IFwiYXV0b1wiO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8qIE5vdGU6IFdlYmtpdCBoYXMgYSBnbGl0Y2ggd2hlcmUgaGVpZ2h0IG11c3QgYmUgZXhwbGljaXRseSBhc3NpZ25lZCB0aGUgXCJweFwiIHVuaXQgdG8gdGFrZSBlZmZlY3QgYWZ0ZXIgYW4gZWxlbWVudCdzIGhlaWdodCBoYXMgYmVlbiBzZXQgdG8gXCJhdXRvXCIuICovXG4gICAgICAgICAgICAgICAgICAgIG9yaWdpbmFsVmFsdWVzLmhlaWdodFtwcm9wZXJ0eVZhbHVlUG9zaXRpb25dICs9IFwicHhcIjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvKiBSZXNldCB0aGUgZWxlbWVudCB0byBpdHMgb3JpZ2luYWwgdmFsdWVzIG9uY2UgaXRzIHNsaWRlIGFuaW1hdGlvbiBpcyBjb21wbGV0ZS4gKEZvciBzbGlkZURvd24sIG92ZXJmbG93IHZhbHVlcyBhcmUgcmVzZXQuIEZvciBzbGlkZVVwLCBhbGwgdmFsdWVzIGFyZSByZXNldCAoc2luY2UgdGhleSB3ZXJlIGFuaW1hdGVkIHRvIDApLikgKi9cbiAgICAgICAgICAgICAgICBmb3IgKHZhciBwcm9wZXJ0eSBpbiBvcmlnaW5hbFZhbHVlcykge1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnN0eWxlW3Byb3BlcnR5XSA9IG9yaWdpbmFsVmFsdWVzW3Byb3BlcnR5XVtwcm9wZXJ0eVZhbHVlUG9zaXRpb25dO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8qIElmIHRoZSB1c2VyIHBhc3NlZCBpbiBhIGNvbXBsZXRlIGNhbGxiYWNrLCBmaXJlIGl0IG5vdy4gKi9cbiAgICAgICAgICAgICAgICBpZiAoY29tcGxldGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29tcGxldGUuY2FsbChlbGVtZW50LCBlbGVtZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAvKiBBbmltYXRpb24gdHJpZ2dlcmluZy4gKi9cbiAgICAgICAgICAgIFZlbG9jaXR5LmFuaW1hdGUoZWxlbWVudCwgb3JpZ2luYWxWYWx1ZXMsIG9wdHMpO1xuICAgICAgICB9O1xuICAgIH0pO1xuXG4gICAgLyogZmFkZUluLCBmYWRlT3V0ICovXG4gICAgJC5lYWNoKFsgXCJJblwiLCBcIk91dFwiIF0sIGZ1bmN0aW9uKGksIGRpcmVjdGlvbikge1xuICAgICAgICBWZWxvY2l0eS5TZXF1ZW5jZXNbXCJmYWRlXCIgKyBkaXJlY3Rpb25dID0gZnVuY3Rpb24gKGVsZW1lbnQsIG9wdGlvbnMsIGVsZW1lbnRzSW5kZXgsIGVsZW1lbnRzU2l6ZSkge1xuICAgICAgICAgICAgdmFyIG9wdHMgPSAkLmV4dGVuZCh7fSwgb3B0aW9ucyksXG4gICAgICAgICAgICAgICAgcHJvcGVydGllc01hcCA9IHtcbiAgICAgICAgICAgICAgICAgICAgb3BhY2l0eTogKGRpcmVjdGlvbiA9PT0gXCJJblwiKSA/IDEgOiAwXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLyogU2luY2Ugc2VxdWVuY2VzIGFyZSB0cmlnZ2VyZWQgaW5kaXZpZHVhbGx5IGZvciBlYWNoIGVsZW1lbnQgaW4gdGhlIGFuaW1hdGVkIHNldCwgd2UgYXZvaWQgcmVwZWF0ZWRseSB0cmlnZ2VyaW5nIGNhbGxiYWNrcyBieSBmaXJpbmcgdGhlbSBvbmx5IHdoZW4gdGhlIGZpbmFsIGVsZW1lbnQgaXMgcmVhY2hlZC4gKi9cbiAgICAgICAgICAgIGlmIChlbGVtZW50c0luZGV4ICE9PSBlbGVtZW50c1NpemUgLSAxKSB7XG4gICAgICAgICAgICAgICAgb3B0cy5jb21wbGV0ZSA9IG9wdHMuYmVnaW4gPSBudWxsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvKiBJZiBhIGRpc3BsYXkgdmFsdWUgd2FzIHBhc3NlZCBpbnRvIHRoZSBzZXF1ZW5jZSwgdXNlIGl0LiBPdGhlcndpc2UsIGRlZmF1bHQgdG8gXCJub25lXCIgZm9yIGZhZGVPdXQgYW5kIGRlZmF1bHQgdG8gdGhlIGVsZW1lbnQtc3BlY2lmaWMgZGVmYXVsdCB2YWx1ZSBmb3IgZmFkZUluLiAqL1xuICAgICAgICAgICAgLyogTm90ZTogV2UgYWxsb3cgdXNlcnMgdG8gcGFzcyBpbiBcIm51bGxcIiB0byBza2lwIGRpc3BsYXkgc2V0dGluZyBhbHRvZ2V0aGVyLiAqL1xuICAgICAgICAgICAgaWYgKG9wdHMuZGlzcGxheSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIG9wdHMuZGlzcGxheSA9IChkaXJlY3Rpb24gPT09IFwiSW5cIikgPyBWZWxvY2l0eS5DU1MuVmFsdWVzLmdldERpc3BsYXlUeXBlKGVsZW1lbnQpIDogXCJub25lXCI7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIFZlbG9jaXR5LmFuaW1hdGUodGhpcywgcHJvcGVydGllc01hcCwgb3B0cyk7XG4gICAgICAgIH07XG4gICAgfSk7XG59KSgod2luZG93LmpRdWVyeSB8fCB3aW5kb3cuWmVwdG8gfHwgd2luZG93KSwgd2luZG93LCBkb2N1bWVudCk7XG5cbi8qKioqKioqKioqKioqKioqKipcbiAgIEtub3duIElzc3Vlc1xuKioqKioqKioqKioqKioqKioqL1xuXG4vKiBXaGVuIGFuaW1hdGluZyBoZWlnaHQgb3Igd2lkdGggdG8gYSAlIHZhbHVlIG9uIGFuIGVsZW1lbnQgKndpdGhvdXQqIGJveC1zaXppbmc6Ym9yZGVyLWJveCBhbmQgKndpdGgqIHZpc2libGUgc2Nyb2xsYmFycyBvbiAqYm90aCogYXhlcywgdGhlIG9wcG9zaXRlIGF4aXMgKGUuZy4gaGVpZ2h0IHZzIHdpZHRoKSB3aWxsIGJlIHNob3J0ZW5lZCBieSB0aGUgaGVpZ2h0L3dpZHRoIG9mIGl0cyBzY3JvbGxiYXIuICovXG4vKiBUaGUgdHJhbnNsYXRlWC9ZL1ogc3VicHJvcGVydGllcyBvZiB0aGUgdHJhbnNmb3JtIENTUyBwcm9wZXJ0eSBhcmUgJS1yZWxhdGl2ZSB0byB0aGUgZWxlbWVudCBpdHNlbGYgLS0gbm90IGl0cyBwYXJlbnQuIFZlbG9jaXR5LCBob3dldmVyLCBkb2Vzbid0IG1ha2UgdGhlIGRpc3RpbmN0aW9uLiBUaHVzLCBjb252ZXJ0aW5nIHRvIG9yIGZyb20gdGhlICUgdW5pdCB3aXRoIHRoZXNlIHN1YnByb3BlcnRpZXMgd2lsbCBwcm9kdWNlIGFuIGluYWNjdXJhdGUgY29udmVyc2lvbiB2YWx1ZS4gKi8iLCIvLyBNYWluIGVudHJ5IHBvaW50IGZvciBhcHBcbnZhciBuYXYgPSByZXF1aXJlKCcuL25hdmlnYXRpb24uanMnKTtcblxuJChkb2N1bWVudCkub24oJ3JlYWR5JywgZnVuY3Rpb24oKSB7XG4gICAgLy9jbGllbnQuaW5pdCgpO1xuICAgIG5hdi5pbml0KCk7XG59KTsiLCJ2YXIgdmVsb2NpdHkgPSByZXF1aXJlKCd2ZWxvY2l0eS1hbmltYXRlJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCkge1xuXG4gICAgdmFyIExPQURfVElNRSA9IDMwMDsgLy8gbWlsbGlzZWNvbmRzXG5cbiAgICB2YXIgcGFyY2VsID0ge30sXG4gICAgICAgIHJvb3QgPSAkKCcjY29udGVudCcpLFxuICAgICAgICB0cmFuc3BvcnRlciA9ICcjdHJhbnNwb3J0ZXInLFxuICAgICAgICBuYXYgPSAkKCcjbWFpbi1uYXYnKTtcblxuICAgIHBhcmNlbC5pbml0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHRoaXMudG8gPSB0bztcbiAgICAgICAgdGhpcy5lbnRlciA9IGVudGVyO1xuXG4gICAgICAgIGVudGVyKCk7XG4gICAgICAgIGJpbmRFdmVudHMoKTtcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gYmluZEV2ZW50cygpIHtcbiAgICAgICAgbmF2Lm9uKCdjbGljaycsICdhJywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgICAgICQodGhpcykuc2libGluZ3MoJy5hY3RpdmUnKS5yZW1vdmVDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICAkKHRoaXMpLmFkZENsYXNzKCdhY3RpdmUnKTtcblxuICAgICAgICAgICAgdmFyIHVybCA9ICQodGhpcykuYXR0cignaHJlZicpO1xuICAgICAgICAgICAgdG8odXJsKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgJCgnI2xvZ28nKS5vbignY2xpY2snLCAnYScsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgbmF2LmZpbmQoJ2EuYWN0aXZlJykucmVtb3ZlQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgbmF2LmZpbmQoJ2FbaHJlZj1cIi9hcnRpY2xlcy9cIl0nKS5hZGRDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICB0bygnLycpO1xuICAgICAgICB9KTtcblxuICAgICAgICAkKCcjY29udGVudCcpLm9uKCdjbGljaycsICcjYXJ0aWNsZXMgPiBhJywgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgICAgIHZhciB1cmwgPSAkKHRoaXMpLmF0dHIoJ2hyZWYnKTtcbiAgICAgICAgICAgIHRvKHVybCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRvKHVybCkge1xuICAgICAgICB2YXIgaHRtbDtcbiAgICAgICAgJC5nZXQodXJsLCBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgICAgICBodG1sID0gJChkYXRhKS5maW5kKHRyYW5zcG9ydGVyKTtcbiAgICAgICAgfSk7XG4gICAgICAgICQoJ3BhcGVyLXByb2dyZXNzOjpzaGFkb3cnKS5maW5kKCcjYWN0aXZlUHJvZ3Jlc3MnKS52ZWxvY2l0eSh7XG4gICAgICAgICAgICB3aWR0aDogJzEwMCUnXG4gICAgICAgIH0sIExPQURfVElNRSwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByb290Lmh0bWwoaHRtbCk7XG4gICAgICAgICAgICAvLyBFbmQgTG9hZFxuICAgICAgICAgICAgaGlzdG9yeS5wdXNoU3RhdGUoe30sICcnLCB1cmwpO1xuICAgICAgICAgICAgJCgncGFwZXItcHJvZ3Jlc3M6OnNoYWRvdycpLmZpbmQoJyNhY3RpdmVQcm9ncmVzcycpLnZlbG9jaXR5KHtcbiAgICAgICAgICAgICAgICB3aWR0aDogJzAlJ1xuICAgICAgICAgICAgfSwgMCk7XG4gICAgICAgIH0pO1xuXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZW50ZXIoKSB7XG4gICAgICAgIC8vIEJlZ2luIExvYWRcbiAgICAgICAgcm9vdC5sb2FkKHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSArICcgJyArIHRyYW5zcG9ydGVyLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIC8vIEVuZCBMb2FkXG4gICAgICAgICAgICBuYXYuZmluZCgnYS5hY3RpdmUnKS5yZW1vdmVDbGFzcygnYWN0aXZlJyk7XG4gICAgICAgICAgICBpZiAod2luZG93LmxvY2F0aW9uLnBhdGhuYW1lID09PSAnLycgfHwgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLmluZGV4T2YoJ2FydGljbGVzJykgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICBuYXYuZmluZCgnYVtocmVmPVwiL2FydGljbGVzL1wiXScpLmFkZENsYXNzKCdhY3RpdmUnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbmF2LmZpbmQoJ2FbaHJlZj1cIicgKyB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUgKyAnXCJdJykuYWRkQ2xhc3MoJ2FjdGl2ZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBwYXJjZWw7XG59KCkpOyJdfQ==
