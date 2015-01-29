module.exports = function(grunt) {

    require('time-grunt')(grunt);
    require('jit-grunt')(grunt);

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
                    src: ['**/*.scss'],
                    dest: 'static/css',
                    ext: '.css'
                }]
            }
        },
        jshint: {
            options: {
                ignores: [],
                globals: {
                    jQuery: true
                }
            },
            all: ['scripts/app/**/*.js']
        },
        browserifying: {
            build: {
                files: {
                    './static/javascript/main.bundle.js': './scripts/app/main.js'
                },
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
                tasks: ['sass', 'build']
            },
            js: {
                files: ['scripts/app/**/*.js'],
                tasks: ['newer:jshint', 'browserifying:dev', 'build']
            },
            html: {
                files: ['static/imports/link_map.html', 'pages/*.html'],
                tasks: ['vulcanize', 'build']
            }
        },

        vulcanize: {
            default: {
                options: {
                    csp: true,
                    strip: true
                },
                files: {
                    'static/imports/index.html': 'static/imports/link_map.html'
                }
            }
        }
    });

    // grunt.loadNpmTasks('grunt-contrib-sass');
    // grunt.loadNpmTasks('grunt-contrib-jshint');
    // grunt.loadNpmTasks('grunt-newer');
    // grunt.loadNpmTasks('grunt-browserifying');
    // grunt.loadNpmTasks('grunt-vulcanize');

    // NEVER REMOVE THESE LINES, OR ELSE YOUR PROJECT MAY NOT WORK
    require('./options/generatorOptions.js')(grunt);
    grunt.loadTasks('tasks');
};