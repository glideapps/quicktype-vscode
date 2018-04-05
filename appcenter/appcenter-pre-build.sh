#!/usr/bin/env bash -e

cd $APPCENTER_SOURCE_DIRECTORY

source appcenter/slack.sh

#############
### Build ###
#############

npm update quicktype

# Sync extension version with quicktype
vquicktype=`npm -j ls quicktype | jq -r .dependencies.quicktype.version`
npm version $vquicktype --force --no-git-tag-version

npm run compile
