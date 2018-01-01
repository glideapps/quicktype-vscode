#!/usr/bin/env bash -e

cd $APPCENTER_SOURCE_DIRECTORY
source appcenter/slack.sh

if [ "$AGENT_JOBSTATUS" != "Succeeded" ]; then
    slack_notify_build_failed
    exit 0
fi

if [ "$APPCENTER_BRANCH" == "master" ]; then
    npm run publish
    slack_notify_deployed
fi