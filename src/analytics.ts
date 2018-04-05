import { ExtensionContext } from "vscode";

import * as ua from "universal-analytics";
import { v4 as generateUUID } from "uuid";

const ANALYTICS_ID = "UA-102732788-4";

let visitor: ua.Visitor;

export function initialize(context: ExtensionContext) {
    const uuid = context.globalState.get("uuid", generateUUID());
    context.globalState.update("uuid", uuid);

    visitor = ua(ANALYTICS_ID, uuid);
    visitor.pageview("/").send();
}

export function sendEvent(action: string, label?: string) {
    visitor.event("extension", action, label).send();
}
