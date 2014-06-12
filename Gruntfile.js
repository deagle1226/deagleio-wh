'use strict';
module.exports = function(grunt) {

    // ----------------------------------------------------------
    // WARNING, BRAVE DEVELOPER
    // ----------------------------------------------------------
    // Webhook allows you to use local grunt tasks and files.
    // However, these tasks are ONLY RUN LOCALLY and not when
    // your live site needs to be rebuilt. This means you should
    // only use grunt for pre-processing tasks like building
    // Sass, less or coffescript files, not for reading things
    // from your templates and making dynamic changes during
    // the build process. Doing so will cause your live site
    // not to regerate.
    //
    // You have been warned!
    grunt.initConfig({
        sass: {
            dev: {
                options: {
                    style: 'nested'
                },
                files: [{
                    expand: true,
                    cwd: 'sass',
                    src: ['*.scss'],
                    dest: 'static/css',
                    ext: '.css'
                }]
            }
        },
        jshint: {
            options: {
                ignores: ['static/javascript/app/*.bundle.js', 'static/javascript/app/bundle.js'],
                globals: {
                    jQuery: true
                }
            },
            all: ['static/javascript/app/**/*.js']
        },
        browserifying: {
            build: {
                files: getModules(grunt),
                options: {
                    watch: false,
                    sourceMaps: false
                }
            },
            dev: {
                files: {
                    './static/javascript/main.bundle.js': './scripts/app/main.js'
                },
                options: {
                    watch: false,
                    sourceMaps: true
                }
            }
        },
        watch: {
            sass: {
                files: ['sass/**/*.scss'],
                tasks: ['newer:sass']
            },
            js: {
                files: ['scripts/app/**/*.js'],
                tasks: ['newer:jshint', 'browserifying:dev']
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-sass');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-newer');
    grunt.loadNpmTasks('grunt-browserifying');

    // NEVER REMOVE THESE LINES, OR ELSE YOUR PROJECT MAY NOT WORK
    require('./options/generatorOptions.js')(grunt);
    grunt.loadTasks('tasks');
};


/*jshint loopfunc: true */
function getModules(grunt) {
    var modules = grunt.file.expand({
        cwd: '../docroot/res/js/app/modules'
    }, '**/main.js');
    var out = {};
    modules.forEach(function(module) {
        out['../docroot/res/js/app/modules/' + module.split('/')[0] + '.js'] = '../docroot/res/js/app/modules/' + module;
    });
    return out;
}


function getRes(type, grunt) {
    var res = grunt.file.readJSON('../docroot/application/res.json'),
        resOut = {
            css: {},
            js: {}
        },
        key, module, i;
    if (type == 'css') {
        for (key in res.css) {
            module = res.css[key];
            key = '../docroot/application/res/out/' + key;
            i = 0;
            module.forEach(function(source) {
                //grunt.log.ok('../docroot/res/js/' + source);
                module[i] = '../docroot/res' + source.replace('..', '');
                i++;
            });
            resOut.css[key] = module;
        }
        return resOut.css;
    } else if (type == 'js') {
        for (key in res.js) {
            module = res.js[key];
            key = '../docroot/res/out/' + key;
            i = 0;
            module.forEach(function(source) {
                module[i] = '../docroot/res/js/' + source;
                i++;
            });
            resOut.js[key] = module;
        }
        return resOut.js;
    }
}