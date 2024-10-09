#!/bin/ksh -p

. /lib/svc/share/smf_include.sh

cd /opt/boxvault/api

function startup
{
        nodemon index &
}

function shutdown
{
        lsof -Pi :5000 | grep node |  awk '{system("pfexec kill -9 " $2)}'
}

case $1 in
    start) startup ;;
    stop)  shutdown ;;

    *) echo "Usage: $0 { start | stop }" >&2
       exit $SMF_EXIT_ERR_FATAL
       ;;
esac

exit $SMF_EXIT_OK
