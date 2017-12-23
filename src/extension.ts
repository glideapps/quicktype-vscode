"use strict";

import * as vscode from "vscode";
import { Range } from "vscode";
import { paste as pasteCallback } from "copy-paste";
import { quicktype, languageNamed } from "quicktype";

async function paste(): Promise<string> {
    return new Promise<string>((pass, fail) => {
        pasteCallback((err, content) => err ? fail(err) : pass(content));
    });
}

async function pasteJSONAsCode(editor: vscode.TextEditor, justTypes: boolean) {
    const documentLanguage = editor.document.languageId;
    const maybeLanguage = languageNamed(documentLanguage);
    const language = maybeLanguage === undefined ? "types" : documentLanguage;

    const content = await paste();
    const rendererOptions = {};
    if (justTypes) {
        rendererOptions["just-types"] = "true";
        rendererOptions["features"] = "just-types";
    }

    const result = await quicktype({
        lang: language,
        sources: [{name: "TopLevel", samples: [content]}],
        rendererOptions
    });
    
    const text = result.lines.join("\n");
    const selection = editor.selection;
    editor.edit(builder => {
        if (selection.isEmpty) {
            builder.insert(selection.start, text);
        } else {
            builder.replace(new Range(selection.start, selection.end), text);
        }    
    });
}

export function activate(context: vscode.ExtensionContext) {
    const pasteAsCode = vscode.commands.registerTextEditorCommand(
        "extension.pasteJSONAsCode",
        editor => pasteJSONAsCode(editor, true)
    );
    const pasteForSerialization = vscode.commands.registerTextEditorCommand(
        "extension.pasteJSONForSerialization",
        editor => pasteJSONAsCode(editor, false)
    );

    context.subscriptions.push(pasteAsCode, pasteForSerialization);
}

export function deactivate(): void {
    return;
}
