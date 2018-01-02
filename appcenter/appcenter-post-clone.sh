#!/usr/bin/env bash -e

cd $APPCENTER_SOURCE_DIRECTORY

source appcenter/slack.sh

brew install jq
npm install