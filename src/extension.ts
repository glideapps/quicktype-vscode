"use strict";

import * as vscode from "vscode";
import { Range } from "vscode";
import { paste as pasteCallback } from "copy-paste";
import { quicktype, languages, languageNamed, SerializedRenderResult } from "quicktype";

async function paste(): Promise<string> {
    return new Promise<string>((pass, fail) => {
        pasteCallback((err, content) => err ? fail(err) : pass(content));
    });
}

function jsonIsValid(json: string) {
    try {
        JSON.parse(json);
    } catch (e) {
        return false;
    }
    return true;
}

async function promptTopLevelName(): Promise<{ cancelled: boolean, name: string }> {
    let topLevelName = await vscode.window.showInputBox({
        prompt: "Top-level type name?"
    });

    return {
        cancelled: topLevelName === undefined,
        name: topLevelName || "TopLevel"
    };
}

async function getTargetLanguage(editor: vscode.TextEditor): Promise<{ cancelled: boolean, name: string }>
{
    const documentLanguage = editor.document.languageId;
    const currentLanguage = languageNamed(documentLanguage);
    if (currentLanguage !== undefined) {
        return {
            cancelled: false,
            name: documentLanguage
        };
    }
    
    const chosenName = await vscode.window.showQuickPick(languages.map(l => l.displayName));
    return {
        cancelled: chosenName === undefined,
        name: chosenName || "types"
    };
}

async function pasteJSONAsTypes(editor: vscode.TextEditor, justTypes: boolean) {
    const language = await getTargetLanguage(editor);
    if (language.cancelled) {
        return;
    }

    const content = await paste();
    if (!jsonIsValid(content)) {
        vscode.window.showErrorMessage("Clipboard does not contain valid JSON.");
        return;
    }

    const rendererOptions = {};
    if (justTypes) {
        rendererOptions["just-types"] = "true";
        rendererOptions["features"] = "just-types";
    }

    const topLevelName = await promptTopLevelName();
    if (topLevelName.cancelled) {
        return;
    }

    let result: SerializedRenderResult;
    try {
        result = await quicktype({
            lang: language.name,
            sources: [{name: topLevelName.name, samples: [content]}],
            rendererOptions
        });
    } catch (e) {
        // TODO Invalid JSON produces an uncatchable exception from quicktype
        // Fix this so we can catch and show an error message.
        vscode.window.showErrorMessage(e);
        return;
    }
    
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

enum Command {
    PasteJSONAsTypes = "quicktype.pasteJSONAsTypes",
    PasteJSONAsTypesAndSerialization = "quicktype.pasteJSONAsTypesAndSerialization"
}

export function activate(context: vscode.ExtensionContext) {
    const pasteAsCode = vscode.commands.registerTextEditorCommand(
        Command.PasteJSONAsTypes,
        editor => pasteJSONAsTypes(editor, true)
    );
    const pasteForSerialization = vscode.commands.registerTextEditorCommand(
        Command.PasteJSONAsTypesAndSerialization,
        editor => pasteJSONAsTypes(editor, false)
    );

    context.subscriptions.push(pasteAsCode, pasteForSerialization);
}

export function deactivate(): void {
    return;
}
