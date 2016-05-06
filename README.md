# iMessage Backup #

## Purpose ##
I developed this app because the iMessage app is notoriously bad at searching, exporting, and managing historic messages.  Like many Apple users, I sync my iPhone with my Mac, and I use the Mac iMessage app when I am at my computer.  
The iMessage app keeps all messages in a database, so I wrote this little node script to export them into a much more searchable format: HTML.

## Installation ##
You need to install Node JS.  If you do not have Node installed, please download from here:
[https://nodejs.org/en/download/](https://nodejs.org/en/download/)

Open `Terminal.app` and make sure you are in the iMessagesBackup folder.
Run the following command:

    npm install
    
Great!  You are now ready to export your iMessage conversations!

## Run the script ##
I have added some options to the script for customizing the output of the script.
You can see all the options by running

    node exportMessages.js -help

Which will display:

    Usage: exportMessages [options] <accountId>
 
    Options:

     -h, --help                   output usage information
     -V, --version                output the version number
     -o, --order <order>          Sort messages by date in asc or desc order
     -s, --skip <n>               Skip the first <n> number of rows
     -l, --limit <n>              Only export <n> number of rows
     -d, --debug                  Run in debug mode
     -f, --file <file>            Specify the iMessage database file to load.
     -n, --line-numbers           Show line numbers
     -a, --output-file <outFile>  The name of the output file html
    
    Arguments:
    
    accountId      The iMessage phone number or email address to pull records for. IE: +15554443333
    
Note, the `<accountId>` parameter is either a phone number or the email address of the iMessage account you want to export.
If it is a phone number, you will need to have a "+" and the country code of the phone number.  So a US number would need a +1 in front of it.

All Image attachments will be viewable inline, but any other attachments will be linked.  All output files and attachments are saved in the `output` directory.

## Examples ##

    node exportMessages.js -o asc -s 1000 -l 1000 -o 1000To2000.html +15555555555
Will export the first 1001 to 2001 messages of the conversation you had with 555-555-5555 and save them as the file 1000To2000.html.

## Customize ##
Feel free to customize the `templates/default.hbs` template if you would like to change the look and feel.  I use Handlebars templates.  
For information on using Handlebars, visit [http://handlebarsjs.com/](http://handlebarsjs.com/)

## Acknowledgement ##
The HTML/CSS template is based on work done by http://codepen.io/2ne/

## Donate ##
If you found this script helpful, you can <a href='https://ko-fi.com/A6681RO'>Buy Me a Coffee</a>!
