'use strict';
var request = require('request'),
    path = require('path'),
    fs = require('fs'),
    _ = require('underscore'),
    yeoman = require('yeoman-generator'),
    AdmZip = require('adm-zip'),
    async = require('async'),
    shell = require('shelljs'),
    publicFolder;

var ModxGenerator = yeoman.generators.Base.extend({

    constructor: function () {
        yeoman.generators.Base.apply(this, arguments);

        this.option('git-clone', {
            desc: 'Choose git repo.',
            type: 'String',
            defaults: false
        });

        this.gitClone = this.options['git-clone'] || false;
        this.config.set('gitClone', this.gitClone);

        this.publicFolder = 'public/';

    },

    prompting: function () {
        var self = this,
            done = self.async();

        // welcome message
        self.log(this.yeoman);

        var prompts = [{
            name: 'dbName',
            message: 'Database name:',
            default: ''
        },
            {
                name: 'dbUser',
                message: 'Database user:',
                default: 'root'
            },
            {
                name: 'dbPassword',
                message: 'Database password:',
                default: 'root'
            },
            {
                name: 'dbHostname',
                message: 'Database host:',
                default: 'localhost'
            },
            {
                name: 'dbTablePrefix',
                message: 'Database table prefix:',
                default: 'modx_'
            }
        ];

        if (self.gitClone === false) {
            prompts.unshift({
                    name: 'siteName',
                    message: 'What is your sites\'s name ?'
                },
                {
                    name: 'packageName',
                    message: 'What would you like the package to be called?'
                });
        }

        if (!fs.existsSync(self.publicFolder) || fs.existsSync(self.publicFolder + '/setup/')) {
            prompts.push({
                    name: 'cmsadmin',
                    message: 'Admin User:'
                },
                {
                    name: 'cmspassword',
                    message: 'Admin password:'
                },
                {
                    name: 'cmsadminemail',
                    message: 'Admin email:'
                });
        }

        if (fs.existsSync(this.destinationRoot() + '/yoPrompt.json')) {
            var defaults = require(this.destinationRoot() + '/yoPrompt.json');
            _.each(prompts, function (prompt) {
                if (defaults.hasOwnProperty(prompt.name)) prompt.default = defaults[prompt.name];
            });
        }


        this.prompt(prompts, function (answers) {
            var config = {};

            _.each(answers, function (value, key) {
                self[key] = value;
                if (key != 'cmspassword') config[key] = value;
            });

            if (!self.packageName && self.gitClone !== false) {
                var str = self.gitClone;
                if (str.substr(-1) == '/') str = str.substr(0, str.length - 1);
                var res = str.split('/');

                self.packageName = res.pop();
                config.packageName = self.packageName;
            }

            self.packageDir = path.join(self.publicFolder, 'packages/');
            config.packageDir = self.packageDir;

            var configFile = this.destinationRoot() + '/yoPrompt.json';
            fs.writeFile(configFile, JSON.stringify(config));

            done();
        }.bind(this));
    },

    writing: {
        downloadModx: function () {
            var self = this,
                done = self.async();

            if (!fs.existsSync(self.publicFolder)) {
                self.log('Downloading latest version of MODx...');
                request('https://github.com/modxcms/revolution/archive/master.zip').pipe(fs.createWriteStream('modx.zip')).on('close', done);
            } else {
                done();
            }

        },

        unzipModx: function () {
            var self = this;
            if (fs.existsSync(self.publicFolder)) return;

            self.log('Unzipping MODx...');
            var zip = new AdmZip('modx.zip');
            zip.extractAllTo(this.destinationRoot(), true);
        },

        cleanup: function () {
            var self = this;
            if (fs.existsSync(self.publicFolder)) return;

            self.log('Cleaning up...');
            fs.renameSync('./revolution-master', './public');
            fs.unlinkSync('./modx.zip');
        },

        writeModxConfig: function () {
            var self = this;
            if (fs.existsSync(self.publicFolder + 'core/packages/core.transport.zip')) return;

            self.log('Writing Modx build config');
            self.template('_build.config.php', self.publicFolder + '_build/build.config.php');
            self.template('_build.properties.php', self.publicFolder + '_build/build.properties.php');
        },

        writeModxSetup: function () {
            var self = this;
            if (!fs.existsSync(self.publicFolder + '/setup/')) return;

            self.log('Writing Modx setup config');
            self.basePath = self.destinationRoot();
            self.template('_config.xml', self.publicFolder + '/setup/config.xml');
        },

        cloneRepoman: function () {
            var self = this,
                cloneTo = path.join(self.packageDir, 'repoman/');

            if (fs.existsSync(cloneTo)) {
                self.log('Pull latest version of Repoman package');
                shell.exec('git -C ' + cloneTo + ' pull');
            } else {
                self.log('Clone latest version of Repoman package');
                shell.exec('git clone https://github.com/craftsmancoding/repoman ' + cloneTo);
            }

        },

        clonePackage: function () {
            var self = this,
                cloneTo = path.join(self.packageDir, self.packageName);
            if (self.gitClone === false) return;

            if (fs.existsSync(cloneTo)) {
                self.log('Pull latest version of package');
                shell.exec('git -C ' + cloneTo + ' pull');
            } else {
                self.log('Clone package');
                shell.exec('git clone ' + self.gitClone + ' ' + cloneTo);
            }
        }

    },

    install: {
        buildModxCore: function () {
            var self = this;
            if (fs.existsSync(self.publicFolder + 'core/packages/core.transport.zip')) return;
            self.log('Running Modx build script');
            shell.exec('php ' + self.publicFolder + '_build/transport.core.php');
        },

        runModxSetup: function () {
            var self = this;
            if (!fs.existsSync(self.publicFolder + 'setup/')) return;
            self.log('Running Modx setup script');
            shell.exec('php ' + self.publicFolder + 'setup/index.php --installmode=new');
        },

        installComposer: function () {
            var self = this;
            if (fs.existsSync(self.packageDir + 'repoman/composer.json')) shell.exec('(cd ' + self.packageDir + 'repoman/; composer install)');
            if (fs.existsSync(self.packageDir + self.packageName + '/composer.json')) shell.exec('(cd ' + self.packageDir + self.packageName + '; composer install)');
        },

        repomanInstallPackages: function () {
            var self = this;
            if (fs.existsSync(self.packageDir + 'repoman/vendor')) shell.exec('(cd ' + self.packageDir + 'repoman/; php repoman install .)');
            if (fs.existsSync(self.packageDir + self.packageName + '/vendor')) shell.exec('(cd ' + self.packageDir + 'repoman/; php repoman install ../'+self.packageName+')');
        }

    },

    _newPackage: function () {
        var self = this,
            newDir = path.join(self.packageDir, self.packageName);
        this.mkdir(newDir);
    }

});

module.exports = ModxGenerator;