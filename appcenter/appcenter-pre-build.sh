#!/usr/bin/env bash -e

cd $APPCENTER_SOURCE_DIRECTORY

source appcenter/slack.sh

#############
### Build ###
#############

npm update quicktype-core

# Sync extension version with quicktype
vext=`npm -j ls quicktype-core | jq -r '.dependencies["quicktype-core"].version | split(".") | map(tonumber) | .[0] |= . + 7 | map(tostring) | join(".")'`
npm version $vext --force --no-git-tag-version

npm run compile
