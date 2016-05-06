/**
 * Created by breinhart on 4/13/16.
 *
 * Description:
 *  To export all iMessage conversations and images for a given account to an HTML document
 *  for easy searching, viewing, sharing, and storing.
 */

'use strict';

var sqlite3 = require('sqlite3').verbose();
var program = require('commander');
var path = require('path');
var readline = require('readline');
var fs = require('fs');
var Handlebars = require('handlebars');
var async = require('async');
var Guid = require('guid');

// Local variable declarations
var dbPath;
var outDest;
var db;
var stmt;
var timerId;
var scope = {};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Program control and argument parsing
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

program
    .version('0.0.1')
    .usage('[options] <accountId>')
    .option('-o, --order <order>', 'Sort messages by date in asc or desc order', /^(asc|desc)$/i, 'asc')
    .option('-s, --skip <n>', 'Skip the first <n> number of rows', parseInt)
    .option('-l, --limit <n>', 'Only export <n> number of rows', parseInt)
    .option('-d, --debug', 'Run in debug mode')
    .option('-f, --file <file>', 'Specify the iMessage database file to load.')
    .option('-n, --line-numbers', 'Show line numbers')
    .option('-a, --output-file <outFile>', 'The name of the output file html', 'index.html');



program.on('--help', function(){
    console.log('  Arguments:');
    console.log('');
    console.log('    accountId      The iMessage phone number or email address to pull records for. IE: +15554443333');
    console.log('');
});

program.parse(process.argv);

if(program.args.length <= 0) {
    console.error("Invalid arguments.  AccountId is required");
    process.exit(1);
}


//This is the format of handle_id stored in the chat_handle_join table.
scope.handle = 'iMessage;-;' + program.args[0];
scope.show_numbers = program.lineNumbers;


if(program.debug === true) {
    //Enable verbose stack traces
    sqlite3.verbose();
}

//Determine if we should load the default chat database or one specified with the --file flag.
if(program.file) {
    dbPath = program.file;
}
else {
    dbPath = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'] + '/Library/Messages/chat.db';
}
db = new sqlite3.Database(dbPath);


/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  Build the Query
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
var query = "SELECT m.ROWID, m.is_from_me, m.text, datetime(m.date + strftime('%s', '2001-01-01 00:00:00'), 'unixepoch', 'localtime') "
    + "as date, m.cache_has_attachments, a.filename "
    + "FROM message m "
    +   "LEFT OUTER JOIN message_attachment_join maj "
    +       "on maj.message_id = m.rowid "
    +   "LEFT OUTER JOIN attachment a "
    +       "on a.rowid = maj.attachment_id "
    + "WHERE m.handle_id=("
    +   "SELECT handle_id FROM chat_handle_join WHERE chat_id=("
    +       "SELECT ROWID FROM chat WHERE guid = ?"
    +   ")"
    + ")";

if(program.order) {
    query += " ORDER BY date " + program.order;
}

if(program.limit) {
    query += " LIMIT " + program.limit;
}

if(program.skip) {
    if(!program.limit) {
        query += " LIMIT -1";
    }
    query += " OFFSET " + program.skip;
}

stmt = db.prepare(query);



//Clear the screen
readline.cursorTo(process.stdout, 0,0);
readline.clearScreenDown(process.stdout);
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//Building some Handlebars helpers for rendering the attachments
Handlebars.registerHelper('hb_attachment', function() {
    var filename = this.attachment;
    var ext = path.extname(filename);

    if(['.jpeg','.jpg','.png','.gif','.bmp','.tiff'].indexOf(ext.toLowerCase()) >= 0) {
        //We have a renderable image.
        return new Handlebars.SafeString(
            '<img src="' + filename + '"/><br/>' + this.text

        );
    }
    else {
        //Just link to the file
        return new Handlebars.SafeString(
            '<a href="' + filename + '">' + ext + ' attachment</a><br/>' + this.text
        );
    }

});


/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Run the query and build the output
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
async.waterfall([
    function (asyncCallback) {
        //Create the directory
        startElipsis('Creating output directory');
        //Only create the directory if it doesn't exist
        fs.stat('output/attachments', function(dErr) {
            if(dErr && dErr.code === 'ENOENT') {
                fs.mkdir('output', function(err) {
                    if(err) {
                       return asyncCallback(err);
                   }
                   fs.mkdir('output/attachments', function(err2) {
                       if(err2) {
                           return asyncCallback(err2);
                       }
                       asyncCallback(null);
                    })
                });
            }
            else {
                asyncCallback(null);
            }
        });
    },
    function(asyncCallback) {
        startElipsis('Fetching rows from the database');
        stmt.all(scope.handle, function(err, rows) {
            if(err) {
                return asyncCallback(err);
            }
            //newline of output
            rl.write('\n');
            rl.write('Retrieved ' + rows.length + ' records.\n');
            asyncCallback(null, rows);
        });
        stmt.finalize();
        //Clean up
        db.close();
    },
    function(messages, asyncCallback) {
        startElipsis('copying attachments');
        var lastDate = null;
        var rowNum = program.skip || 0;
        async.eachSeries(messages, function(message, eachCallback) {
            //If the last message we have seen is > 5 minutes, show the date/time
            var newDate = new Date(message.date);
            if(lastDate === null) {
                message.show_date = true;
            }
            //If 5 minutes have passed since the last date was found.
            else if((lastDate.getTime() + 5 * 60 * 1000) < newDate.getTime()) {
                message.show_date = true;
            }
            else {
                message.show_date = false;
            }
            lastDate = newDate;
            
            message.rowNum = rowNum;
            rowNum++;

            if(message.cache_has_attachments) {
                var ext = path.extname(message.filename);
                var outFile = 'attachments/' + Guid.create() + ext;
                copyFile(resolveHome(message.filename), 'output/' + outFile, function(err) {
                    if(err) {
                        //I don't want to fail if one attachment fails to copy.  Keep on chugging.
                        console.error('Unable to copy file @ %s to output folder @ %s. -', resolveHome(message.filename), outFile, err);
                        eachCallback();
                    }
                    else {
                        message.attachment = outFile;
                        eachCallback();
                    }
                })
            }
            else {
                //protect against call stack size issues
                async.setImmediate(function() {
                    eachCallback();
                });
            }

        },function() {
            asyncCallback(null, messages);
        });
    },
    function(results, asyncCallback) {
        //Load the handlebars template.
        startElipsis('Loading template');
        fs.readFile('templates/default.hbs','utf-8',function(err, source) {
            if(err) {
                return asyncCallback(err);
            }
            rl.write('Template Loaded.\n');

            //This is the handlebars scope object;
            scope.messages = results;
            //compile the template
            var template = Handlebars.compile(source);
            var html = template(scope);
            asyncCallback(null, html);

        });
    },
    function(template, asyncCallback) {
        //Write the html to disk
        startElipsis('Writing compiled html to disk');
        fs.writeFile('output/' + program.outputFile, template, function (err) {
            if(err) {
                return asyncCallback(err);
            }
            asyncCallback(err);
        });
    }
], function(err) {
    if(err) {
        console.error('Any error occurred while exporting your messages - ' + err);
    }
    clearInterval(timerId);

    rl.write('Done!\n');
    rl.close();
});




/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Console Candy...
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
var line = 0;
function startElipsis(statement) {
    clearInterval(timerId);
    var elipsisCount = 0;
    line += 1;
    timerId = setInterval(function () {
        //Clear the line
        readline.cursorTo(process.stdout, 0, line);
        rl.write(statement);
        for (var i = 0; i < elipsisCount % 4; i++) {
            rl.write('.');
        }
        elipsisCount++;
    }, 1000);
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Copy a file
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
function copyFile(source, target, cb) {
    var cbCalled = false;

    var rd = fs.createReadStream(source);
    rd.on("error", function(err) {
        done(err);
    });
    var wr = fs.createWriteStream(target);
    wr.on("error", function(err) {
        done(err);
    });
    wr.on("close", function(ex) {
        done();
    });
    rd.pipe(wr);

    function done(err) {
        if (!cbCalled) {
            cb(err);
            cbCalled = true;
        }
    }
}

function resolveHome(filepath) {
    if (filepath[0] === '~') {
        return path.join(process.env.HOME, filepath.slice(1));
    }
    return path;
}