'use strict';

var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var wiredep = require('wiredep').stream;
var karma = require('karma').server;
var del = require('del');
var runSequence = require('run-sequence');
var browserSync = require('browser-sync');
var fs = require('fs');

// -------------------------------------- Clean directories.

gulp.task('clean:tmp', function(done) {
    del(['.tmp', 'build'], done);
});
gulp.task('clean:dist', function(done) {
    del(['dist'], done);
});

// -------------------------------------- Wire dependencies (From Bower)
//
gulp.task('wiredep:app', function() {
    return gulp.src('app/index.html')
        .pipe(wiredep({
            ignorePath: /^(\.\.\/)*\.\./,
            exclude: 'bower_components/bootstrap/'
        }))
        .pipe(gulp.dest('app'));
});

gulp.task('wiredep:test', function() {
    return gulp.src('test/karma.conf.js')
        .pipe(wiredep({
            devDependencies: true,
            ignorePath: /\.\.\//,
            fileTypes: {
                js: {
                    block: /(([\s\t]*)\/{2}\s*?bower:\s*?(\S*))(\n|\r|.)*?(\/{2}\s*endbower)/gi,
                    detect: {
                        js: /'(.*\.js)'/gi
                    },
                    replace: {
                        js: '\'{{filePath}}\','
                    }
                }
            }
        }))
        .pipe(gulp.dest('test'));
});

gulp.task('wiredep:sass', function() {
    return gulp.src('app/styles/*.scss')
        .pipe(wiredep({
            ignorePath: /^(\.\.\/)+/
        }))
        .pipe(gulp.dest('app/styles'));
});

// -------------------------------------- Generate a configuration file for Angular according to environment.

function ngConfig(environment) {
    var pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    return gulp.src('config.yml')
        .pipe($.ngConfig('ngConfig', {
            environment: environment,
            parser: 'yml',
            constants: {
                version: pkg.version
            }
        }))
        .pipe(gulp.dest('app/scripts'));
}

gulp.task('ngconfig:development', function() {
    return ngConfig('development');
});

gulp.task('ngconfig:test', function() {
    return ngConfig('test');
});

gulp.task('ngconfig:integration', function() {
    return ngConfig('integration');
});

gulp.task('ngconfig:preintegration', function() {
    return ngConfig('preintegration');
});

gulp.task('ngconfig:production', function() {
    return ngConfig('production');
});

// -------------------------------------- Convert SASS files to CSS.

gulp.task('sass', function() {
    return gulp.src('app/styles/*.scss')
        .pipe($.sass())
        .pipe($.autoprefixer({
            browsers: ['last 1 version'],
            cascade: false
        }))
        .pipe(gulp.dest('.tmp/styles'));
});

// -------------------------------------- Copy images and optimize it on the fly.

gulp.task('images', function() {
    return gulp.src('app/images/**/*')
        .pipe($.imagemin({
            progressive: true,
            interlaced: true,
            svgoPlugins: [{
                cleanupIDs: false
            }]
        }))
        .pipe(gulp.dest('dist/images'));
});

// -------------------------------------- Copy fonts from dependencies (Bootstrap, fontAwesome).

gulp.task('fonts-dependency', function() {
    return gulp.src(require('main-bower-files')({
            filter: '**/*.{eot,svg,ttf,woff,woff2}'
        }).concat('app/fonts/**/*'))
        .pipe(gulp.dest('.tmp/fonts'))
        .pipe(gulp.dest('dist/fonts'));
});

gulp.task('fonts-bootstrap', function() {
    return gulp.src(require('main-bower-files')({
            filter: '**/bootstrap/**/*.{eot,svg,ttf,woff,woff2}'
        }))
        .pipe(gulp.dest('.tmp/fonts/bootstrap'))
        .pipe(gulp.dest('dist/fonts/bootstrap'));
});

// -------------------------------------- Copy .htaccess, robots.txt.

gulp.task('extras', function() {
    return gulp.src([
        'app/*.*',
        'app/**/*.json',
        '!app/*.html'
    ], {
        dot: true
    }).pipe(gulp.dest('dist'));
});

// -------------------------------------- Copy HTML views and optimize it on the fly.

gulp.task('html', function() {
    var assets = $.useref.assets();

    return gulp.src('app/**/*.html')
        .pipe(assets)
        .pipe($.if('*.js', $.uglify()))
        .pipe($.if('*.css', $.minifyCss()))
        .pipe($.rev())
        .pipe(assets.restore())
        .pipe($.useref())
        .pipe($.revReplace())
        .pipe($.if('*.html', $.minifyHtml({
            conditionals: true,
            loose: true
        })))
        .pipe(gulp.dest('dist'));
});

// -------------------------------------- JSHint checks.

function jshint(type) {
    var src, jshintConfigurationFile;
    if (type === 'app') {
        src = ['app/scripts/**/*.js', '!app/scripts/config.js'];
        jshintConfigurationFile = '.jshintrc';
    } else if (type === 'test') {
        src = ['test/spec/**/*.js'];
        jshintConfigurationFile = 'test/.jshintrc';
    }
    return gulp.src(src)
        .pipe($.jshint(jshintConfigurationFile))
        .pipe($.jshint.reporter('jshint-stylish'))
        .pipe($.jshint.reporter('fail'));
}

gulp.task('jshint:app', function() {
    return jshint('app');
});

gulp.task('jshint:test', function() {
    return jshint('test');
});

// -------------------------------------- Unit test configuration with Karma.

gulp.task('karma', ['wiredep:test', 'ngconfig:test'], function(done) {
    karma.start({
        configFile: __dirname + '/test/karma.conf.js',
        singleRun: true
    }, done);
});

//
// -------------------------------------- Public tasks.
//

// -------------------------------------- Launch an embedded server with livereload.

gulp.task('serve', ['wiredep:app', 'wiredep:sass', 'ngconfig:development', 'sass', 'fonts-dependency', 'fonts-bootstrap'], function() {
    browserSync({
        notify: false,
        port: 10000,
        server: {
            baseDir: ['.tmp', 'app'],
            routes: {
                '/bower_components': 'bower_components'
            }
        }
    });

    // watch for changes
    gulp.watch([
        'app/**/*.html',
        'app/scripts/**/*.js',
        'app/scripts/**/*.json',
        'app/images/**/*',
        '.tmp/fonts/**/*'
    ]).on('change', browserSync.reload);

    gulp.watch('app/styles/**/*.scss', ['sass']).on('change', browserSync.reload);
    gulp.watch('app/fonts/**/*', ['fonts-dependency']).on('change', browserSync.reload);
    gulp.watch('bower.json', ['wiredep:app', 'wiredep:sass', 'sass', 'fonts-dependency', 'fonts-bootstrap']).on('change', browserSync.reload);
});

// -------------------------------------- Launch Unit Tests.

gulp.task('test', function(done) {
    runSequence('jshint:test', 'clean:tmp', 'karma', done);
});

// -------------------------------------- Launch Project Build.

gulp.task('build-integration', function(done) {
    runSequence('jshint:app', 'clean:dist', 'wiredep:app', 'wiredep:sass', 'sass', 'images', 'fonts-dependency', 'fonts-bootstrap', 'extras', 'ngconfig:integration', 'html', done);
});

gulp.task('build-preintegration', function(done) {
    runSequence('jshint:app', 'clean:dist', 'wiredep:app', 'wiredep:sass', 'sass', 'images', 'fonts-dependency', 'fonts-bootstrap', 'extras', 'ngconfig:preintegration', 'html', done);
});

gulp.task('build-production', function(done) {
    runSequence('jshint:app', 'clean:dist', 'wiredep:app', 'wiredep:sass', 'sass', 'images', 'fonts-dependency', 'fonts-bootstrap', 'extras', 'ngconfig:production', 'html', done);
});

// -------------------------------------- Zip Build directory.

gulp.task('package', function() {
    var pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    return gulp.src(['dist/**/*', 'dist/.htaccess'])
        .pipe($.zip(pkg.name + '-' + pkg.version + '.zip'))
        .pipe(gulp.dest('dist'));
});

// -------------------------------------- Bump version.

function bump(type) {
    return gulp.src(['./bower.json', './component.json', './package.json'])
        .pipe($.bump({
            type: type,
            indent: 4
        }))
        .pipe(gulp.dest('./'));
}

gulp.task('bump-major', function() {
    return bump('major');
});

gulp.task('bump-minor', function() {
    return bump('minor');
});

gulp.task('bump-patch', function() {
    return bump('patch');
});

// -------------------------------------- Default Task (Test, Build, Package).

gulp.task('integration', function(done) {
    runSequence('build-integration', 'package', done);
});

gulp.task('preintegration', function(done) {
    runSequence('build-preintegration', 'package', done);
});

gulp.task('default', function(done) {
    runSequence('build-production', 'package', done);
});
