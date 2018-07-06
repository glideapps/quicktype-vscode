"use strict";

import * as fs from "fs";

import * as vscode from "vscode";
import { Range } from "vscode";
import { read as readClipboard } from "clipboardy";
import {
    quicktype,
    languageNamed,
    defaultTargetLanguages,
    JSONSchemaInput,
    InputData,
    TargetLanguage,
    jsonInputForTargetLanguage
} from "quicktype-core";
import { schemaForTypeScriptSources } from "quicktype-typescript-input";

import * as analytics from "./analytics";

const spawn = require("threads").spawn;

enum Command {
    PasteJSONAsTypes = "quicktype.pasteJSONAsTypes",
    PasteJSONAsTypesAndSerialization = "quicktype.pasteJSONAsTypesAndSerialization",
    PasteSchemaAsTypes = "quicktype.pasteJSONSchemaAsTypes",
    PasteSchemaAsTypesAndSerialization = "quicktype.pasteJSONSchemaAsTypesAndSerialization",
    PasteTypeScriptAsTypesAndSerialization = "quicktype.pasteTypeScriptAsTypesAndSerialization",
    OpenQuicktypeForJSON = "quicktype.openForJSON",
    ChangeTargetLanguage = "quicktype.changeTargetLanguage"
}

function jsonIsValid(json: string) {
    try {
        JSON.parse(json);
    } catch (e) {
        return false;
    }
    return true;
}

async function promptTopLevelName(): Promise<{ cancelled: boolean; name: string }> {
    let topLevelName = await vscode.window.showInputBox({
        prompt: "Top-level type name?"
    });

    return {
        cancelled: topLevelName === undefined,
        name: topLevelName || "TopLevel"
    };
}

type TargetLanguagePick = {
    cancelled: boolean;
    lang: TargetLanguage;
};

async function pickTargetLanguage(): Promise<TargetLanguagePick> {
    const languageChoices = defaultTargetLanguages.map(l => l.displayName).sort();
    let chosenName = await vscode.window.showQuickPick(languageChoices);
    const cancelled = chosenName === undefined;
    if (chosenName === undefined) {
        chosenName = "typescript";
    }
    return { cancelled, lang: languageNamed(chosenName) };
}

async function getTargetLanguage(editor: vscode.TextEditor): Promise<TargetLanguagePick> {
    const documentLanguage = editor.document.languageId;
    const currentLanguage = languageNamed(documentLanguage);
    if (currentLanguage !== undefined) {
        return {
            cancelled: false,
            lang: currentLanguage
        };
    }
    return await pickTargetLanguage();
}

type InputKind = "json" | "schema" | "typescript";

type QuicktypeConfiguration = {
    content: string;
    kind: InputKind;
    targetLanguageName: string;
    topLevelName: string;
    justTypes: boolean;
    indentation: string | undefined;
    leadingComments: string[];
    inferMaps: boolean;
    inferEnums: boolean;
    inferDates: boolean;
    inferIntegerStrings: boolean;
};

function spawnQuicktype(cfg: QuicktypeConfiguration): Promise<string> {
    const thread = spawn(async function(input: QuicktypeConfiguration, done) {
        fs.writeFileSync("/tmp/quicktype.json", JSON.stringify(input));

        const lang = languageNamed(input.targetLanguageName);

        const rendererOptions = {};
        if (input.justTypes) {
            // FIXME: The target language should have a property to return these options.
            if (lang.name === "csharp") {
                rendererOptions["features"] = "just-types";
            } else if (lang.name === "kotlin") {
                rendererOptions["framework"] = "just-types";
            } else {
                rendererOptions["just-types"] = "true";
            }
        }

        const topLevelName = input.topLevelName;
        const content = input.content;
        const inputData = new InputData();
        switch (input.kind) {
            case "json":
                await inputData.addSource("json", { name: topLevelName, samples: [content] }, () =>
                    jsonInputForTargetLanguage(lang)
                );
                break;
            case "schema":
                await inputData.addSource(
                    "schema",
                    { name: topLevelName, schema: content },
                    () => new JSONSchemaInput(undefined)
                );
                break;
            case "typescript":
                await inputData.addSource(
                    "schema",
                    schemaForTypeScriptSources({
                        [`${topLevelName}.ts`]: content
                    }),
                    () => new JSONSchemaInput(undefined)
                );
                break;
            default:
                vscode.window.showErrorMessage(`Unrecognized input format: ${cfg.kind}`);
                return;
        }

        const result = await quicktype({
            lang: lang,
            inputData,
            leadingComments: cfg.leadingComments,
            rendererOptions,
            indentation: cfg.indentation,
            inferMaps: cfg.inferMaps,
            inferEnums: cfg.inferEnums,
            inferDates: cfg.inferDates,
            inferIntegerStrings: cfg.inferIntegerStrings
        });
        done(result.lines);
    });

    return new Promise((resolve, reject) => {
        thread
            .send(cfg)
            .on("message", r => {
                console.log("message");
                resolve(r);
            })
            .on("error", e => {
                console.log("error");
                reject(e);
            })
            .on("exit", () => console.log("thread exited"));
    });
}

async function runQuicktype(
    content: string,
    kind: InputKind,
    lang: TargetLanguage,
    topLevelName: string,
    justTypes: boolean,
    indentation: string | undefined,
    additionalLeadingComments: string[]
): Promise<string> {
    const configuration = vscode.workspace.getConfiguration("quicktype");
    return await spawnQuicktype({
        content,
        kind,
        targetLanguageName: lang.name,
        topLevelName,
        justTypes,
        indentation,
        leadingComments: ["Generated by https://quicktype.io"].concat(additionalLeadingComments),
        inferMaps: configuration.inferMaps,
        inferEnums: configuration.inferEnums,
        inferDates: configuration.inferDates,
        inferIntegerStrings: configuration.inferIntegerStrings
    });
}

async function pasteAsTypes(editor: vscode.TextEditor, kind: InputKind, justTypes: boolean) {
    let indentation: string;
    if (editor.options.insertSpaces) {
        const tabSize = editor.options.tabSize as number;
        indentation = " ".repeat(tabSize);
    } else {
        indentation = "\t";
    }

    const language = await getTargetLanguage(editor);
    if (language.cancelled) {
        return;
    }

    let content: string;
    try {
        content = await readClipboard();
    } catch (e) {
        vscode.window.showErrorMessage("Could not get clipboard contents");
    }

    if (kind !== "typescript" && !jsonIsValid(content)) {
        vscode.window.showErrorMessage("Clipboard does not contain valid JSON.");
        return;
    }

    let topLevelName: string;
    if (kind === "typescript") {
        topLevelName = "input";
    } else {
        const tln = await promptTopLevelName();
        if (tln.cancelled) {
            return;
        }
        topLevelName = tln.name;
    }

    analytics.sendEvent(`paste ${kind}`, language.lang.name);

    let text: string;
    try {
        text = await runQuicktype(content, kind, language.lang, topLevelName, justTypes, indentation, []);
    } catch (e) {
        // TODO Invalid JSON produces an uncatchable exception from quicktype
        // Fix this so we can catch and show an error message.
        vscode.window.showErrorMessage(e);
        return;
    }

    const selection = editor.selection;
    editor.edit(builder => {
        if (selection.isEmpty) {
            builder.insert(selection.start, text);
        } else {
            builder.replace(new Range(selection.start, selection.end), text);
        }
    });
}

class CodeProvider implements vscode.TextDocumentContentProvider {
    readonly scheme: string = "quicktype";
    readonly uri: vscode.Uri;

    private _documentText: string = "{}";

    private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    private readonly _changeSubscription: vscode.Disposable;
    private readonly _onDidChangeVisibleTextEditors: vscode.Disposable;

    private _isOpen = false;
    private _timer: NodeJS.Timer | undefined = undefined;

    private _targetCode = "";

    constructor(private readonly _targetLanguage: TargetLanguage, private _document: vscode.TextDocument) {
        this.scheme = `quicktype-${this._targetLanguage.name}`;
        this.uri = vscode.Uri.parse(`${this.scheme}:QuickType.${this._targetLanguage.extension}`);

        this._changeSubscription = vscode.workspace.onDidChangeTextDocument(ev => this.textDidChange(ev));
        this._onDidChangeVisibleTextEditors = vscode.window.onDidChangeVisibleTextEditors(editors =>
            this.handleDidChangeVisibleTextEditors(editors)
        );
    }

    dispose(): void {
        this._onDidChange.dispose();
        this._changeSubscription.dispose();
        this._onDidChangeVisibleTextEditors.dispose();
    }

    get document(): vscode.TextDocument {
        return this._document;
    }

    setDocument(document: vscode.TextDocument): void {
        this._document = document;
    }

    get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event;
    }

    private handleDidChangeVisibleTextEditors(editors: vscode.TextEditor[]) {
        const isOpen = editors.some(e => e.document.uri.scheme === this.scheme);
        if (!this._isOpen && isOpen) {
            this.update();
        }
        this._isOpen = isOpen;
    }

    textDidChange(ev: vscode.TextDocumentChangeEvent): void {
        if (!this._isOpen) return;

        if (ev.document !== this._document) return;

        if (this._timer) {
            clearTimeout(this._timer);
        }
        this._timer = setTimeout(() => {
            this._timer = undefined;
            this.update();
        }, 300);
    }

    async update(): Promise<void> {
        this._documentText = this._document.getText();
        try {
            this._targetCode = await runQuicktype(
                this._documentText,
                "json",
                this._targetLanguage,
                "TopLevel",
                true,
                undefined,
                ["", 'To change the language, run the command "Change quicktype\'s target language"']
            );

            if (!this._isOpen) return;

            this._onDidChange.fire(this.uri);
        } catch (e) {}
    }

    provideTextDocumentContent(_uri: vscode.Uri, _token: vscode.CancellationToken): vscode.ProviderResult<string> {
        this._isOpen = true;

        return this._targetCode;
    }
}

function deduceTargetLanguage(): TargetLanguage {
    return languageNamed("typescript");
}

let extensionContext: vscode.ExtensionContext | undefined = undefined;

const codeProviders: Map<string, CodeProvider> = new Map();

let lastCodeProvider: CodeProvider | undefined = undefined;
let explicitlySetTargetLanguage: TargetLanguage | undefined = undefined;

async function openQuicktype(targetLanguage: TargetLanguage, document: vscode.TextDocument): Promise<void> {
    let codeProvider = codeProviders.get(targetLanguage.name);
    if (codeProvider === undefined) {
        codeProvider = new CodeProvider(targetLanguage, document);
        codeProviders.set(targetLanguage.name, codeProvider);
        if (extensionContext !== undefined) {
            extensionContext.subscriptions.push(
                vscode.workspace.registerTextDocumentContentProvider(codeProvider.scheme, codeProvider)
            );
        }
    } else {
        codeProvider.setDocument(document);
    }

    let originalEditor: vscode.TextEditor;
    if (lastCodeProvider !== undefined) {
        const doc = lastCodeProvider.document;
        originalEditor = vscode.window.visibleTextEditors.find(e => e.document === doc);
    }
    if (originalEditor === undefined) {
        originalEditor = vscode.window.activeTextEditor;
    }

    lastCodeProvider = codeProvider;

    codeProvider.update();
    const doc = await vscode.workspace.openTextDocument(codeProvider.uri);
    vscode.window.showTextDocument(doc, originalEditor.viewColumn + 1, true);
}

async function openForJSON(editor: vscode.TextEditor, _languageName: string): Promise<void> {
    // FIXME: analytics

    const targetLanguage =
        explicitlySetTargetLanguage !== undefined ? explicitlySetTargetLanguage : deduceTargetLanguage();
    await openQuicktype(targetLanguage, editor.document);
}

async function changeTargetLanguage(): Promise<void> {
    // FIXME: analytics

    const pick = await pickTargetLanguage();
    if (pick.cancelled) return;

    explicitlySetTargetLanguage = pick.lang;
    if (lastCodeProvider === undefined) return;

    await openQuicktype(explicitlySetTargetLanguage, lastCodeProvider.document);
}

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;

    analytics.initialize(context);

    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(Command.PasteJSONAsTypes, editor =>
            pasteAsTypes(editor, "json", true)
        ),
        vscode.commands.registerTextEditorCommand(Command.PasteJSONAsTypesAndSerialization, editor =>
            pasteAsTypes(editor, "json", false)
        ),
        vscode.commands.registerTextEditorCommand(Command.PasteSchemaAsTypes, editor =>
            pasteAsTypes(editor, "schema", true)
        ),
        vscode.commands.registerTextEditorCommand(Command.PasteSchemaAsTypesAndSerialization, editor =>
            pasteAsTypes(editor, "schema", false)
        ),
        vscode.commands.registerTextEditorCommand(Command.PasteTypeScriptAsTypesAndSerialization, editor =>
            pasteAsTypes(editor, "typescript", false)
        ),
        vscode.commands.registerTextEditorCommand(Command.OpenQuicktypeForJSON, editor =>
            openForJSON(editor, "csharp")
        ),
        vscode.commands.registerCommand(Command.ChangeTargetLanguage, changeTargetLanguage)
    );
}

export function deactivate(): void {
    return;
}
