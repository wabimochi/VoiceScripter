import * as vscode from 'vscode';
import { Settings, App, Character } from './settings';
import { CustomSetting } from './custom-settings/custom-settings';
import * as fs from 'fs';
import * as path from 'path';
import { RenameReporter } from './utilities/renameReporter';
import { VarCharacterName, VarAttribute, VarBody } from './common';
import { ChatGptManager } from './chatgpt';
import { nanoid } from 'nanoid'
import { TaskQueue } from './taskQueue';
import axios, {CancelTokenSource} from 'axios';

const metaSectionCharacter = '\\';
const metaTrimRegex = new RegExp('^\\\\|\\\\$', 'g');
const targetExtension = 'vstxt';

interface RangeDict {
    [key: string]: vscode.Range[];
}
interface TalkDecoration {
    [key: string]: vscode.TextEditorDecorationType;
}

interface Options {
    context?: vscode.ExtensionContext;
    settings?: Settings;
    enableCharacters : string[],
    talkDecoration: TalkDecoration;
    updating: boolean;
    modeConversation: boolean;
}

const options: Options = {
    context: undefined,
    settings: undefined,
    enableCharacters : [],
    talkDecoration: {},
    updating: false,
    modeConversation: false,
};

interface CompletionWait{
    id: string;
    line: number;
    cancelTokenSource: CancelTokenSource;
}
const CompletionWaitList: CompletionWait[] = [];

const invalidTextDecoration = vscode.window.createTextEditorDecorationType({
    textDecoration: 'line-through',
});
const missingTextDecoration = vscode.window.createTextEditorDecorationType({
    textDecoration: 'red wavy underline',
});

let metaTextDecoration = vscode.window.createTextEditorDecorationType({
    color: `rgba(128, 128, 128, 0.5)`,
    textDecoration: 'none',
});

const completionWaitDecoration = vscode.window.createTextEditorDecorationType({
    before: {
        contentText: "　ChatGPTからの応答を待っています…",
        width: '.6em',
        margin: `0em 20.5em 0 0`,
        color: new vscode.ThemeColor('editor.foreground'),
        backgroundColor: new vscode.ThemeColor('editor.foreground'),
    },
});

const taskQueue = new TaskQueue();
const outputChannel = vscode.window.createOutputChannel('voicescripter', 'vstxt');
const chatGptManager : ChatGptManager = new ChatGptManager(outputChannel);
let descriptionForChatGPT = '';
let lastAttrIndex: {[key: string]: number} = {};
let myStatusBarItem: vscode.StatusBarItem;

function checkEnable(editor: vscode.TextEditor | undefined) {
    return editor && 
        targetExtension === editor.document.languageId && 
        (editor.document.uri.scheme === 'file' || editor.document.uri.scheme === 'untitled');
}

function checkSettings(settings: Settings | undefined) : boolean {
    if (settings === undefined) {
        vscode.window.showInformationMessage('設定を読み込み中です。少し待ってから再度実行してください。');
        return false;
    }
    return true;
}

export function activate(context: vscode.ExtensionContext) {
    let renameReporter : RenameReporter | undefined = undefined;
    options.context = context;
    vscode.workspace.onDidOpenTextDocument(
        (document) => {
            if (targetExtension === document.languageId) {
                isEnable = true;
            }
        },
        null,
        context.subscriptions
    );
    vscode.window.onDidChangeActiveTextEditor(
        (editor) => {
            if (checkEnable(editor)) {
                isEnable = true;
                settingUpdate(editor!, options, renameReporter);
            } else {
                isEnable = false;
            }
        },
        null,
        context.subscriptions
    );

    vscode.workspace.onDidCloseTextDocument((doc) => {
        if(characterDescriptionDocument === doc && characterDescriptionSource){
            characterDescriptionSource.cancel('Document closed, operation canceled.');
        }
    }, null, context.subscriptions);

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('voicescripter.selectCharacter', (async (editor) => {
        if (checkEnable(editor) && options.settings) {
            const selections = getCharacterSelection(context);
            let maxlength = 1;
            options.settings.characters.forEach(c => {
                if(c.characterName.length > maxlength) {
                    maxlength = c.characterName.length;
                }
            });
            maxlength = Math.min(maxlength + 1, 16);
            const quickPickItems = options.settings.characters.map(c => {
                let picked = true;
                if(selections){
                    picked = selections.includes(c.characterName);
                }
                return {
                    label: c.characterName.padEnd(maxlength, '　'),
                    picked: picked,
                    description: c.appName,
                    id: c.characterName
                }
            });
            
            const result = await vscode.window.showQuickPick(quickPickItems, {
                canPickMany:true,
                matchOnDescription: true,
                title: '主に使用するキャラクターを選択してください',
                placeHolder: 'ここに入力したキーワードでフィルタリングできます'
            });

            if(result) {
                if(result.length === 0){
                    options.enableCharacters = options.settings.characters.map(c => c.characterName);
                } else {
                    options.enableCharacters = result.map(r => r.id);
                }
                setCharacterSelection(context, options.enableCharacters);
                vscode.window.showTextDocument(editor.document);
            }
        }
    })));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('voicescripter.changeCharacter', (async (editor) => {
        if (checkEnable(editor) && options.settings) {
            let maxlength = 1;
            options.settings.characters.forEach(c => {
                if(c.characterName.length > maxlength) {
                    maxlength = c.characterName.length;
                }
            });
            maxlength = Math.min(maxlength + 1, 16);
            const quickPickItems = options.settings.characters.map(c => {
                return {
                    label: c.characterName.padEnd(maxlength, '　'),
                    description: c.appName,
                    id: c.characterName
                }
            });
            const result = await vscode.window.showQuickPick(quickPickItems, {
                matchOnDescription: true,
                title: '変更先のキャラクターを選択してください',
                placeHolder: 'ここに入力したキーワードでフィルタリングできます'
            });
            if(result){
                changeCharacter(editor, options.settings, result.id);
            }
        }
    })));

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('voicescripter.startConversationMode', (async (editor) => {
        const result = await vscode.window.showInputBox({
            title: '状況を入力してください(任意)',
            prompt: 'ChatGPTに会話の状況を伝えるための文章を入力してください。空白でも構いません。',
            value: descriptionForChatGPT
        });
        if(result !== undefined){
            descriptionForChatGPT = result;
            initializeOpenai(context);
            options.modeConversation = true;
        }
    })));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('voicescripter.stopConversationMode', (async (editor) => {
        cancelAllAssistantTask();
        options.modeConversation = false;
    })));

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('voicescripter.generateCharacterDescription', (async (editor) => {
        initializeOpenai(context);
        const result = await vscode.window.showQuickPick(['日本語', 'English'], {title: '生成する説明の言語を選択してください'});
        if(result === undefined) return;
        generateCharacterDescription(editor, options, result === '日本語' ? 'ja' : 'en');
    })));


    context.subscriptions.push(vscode.commands.registerTextEditorCommand('voicescripter.next', ((editor) => {
        if (checkEnable(editor) && options.settings) {
            changeNextCharacter(editor, options.settings, 1).then((result) => {
                if (!result) {
                    vscode.window.showInformationMessage('Faild...');
                }
            });
        }
    })));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('voicescripter.prev', ((editor) => {
        if (checkEnable(editor) && options.settings) {
            changeNextCharacter(editor, options.settings, -1).then((result) => {
                if (!result) {
                    vscode.window.showInformationMessage('Faild...');
                }
            });
        }
    })));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('voicescripter.nextAttr', ((editor) => {
        if (checkEnable(editor) && options.settings) {
            changeNextCharacter(editor, options.settings, 1, true).then((result) => {
                if (!result) {
                    vscode.window.showInformationMessage('Faild...');
                }
            });
        }
    })));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('voicescripter.prevAttr', ((editor) => {
        if (checkEnable(editor) && options.settings) {
            changeNextCharacter(editor, options.settings, -1, true).then((result) => {
                if (!result) {
                    vscode.window.showInformationMessage('Faild...');
                }
            });
        }
    })));

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('voicescripter.processAndCopySelectedText', (editor) => {
        if(checkEnable(editor) && checkSettings(options.settings)){
            processAndCopySelectedText(editor, options.settings!);
        }
    }));

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('voicescripter.copyPlaneText', ((editor) => {
        if (checkEnable(editor) && options.settings) {
            copyPlaneText(editor);
        }
    })));

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('voicescripter.publish', ((editor) => {
        if (checkEnable(editor) && options.settings) {
            publish(editor, options);
        }
    })));

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('voicescripter.preview', ((editor) => {
        if (checkEnable(editor) && options.settings) {
            showPreview(editor, options);
        }
    })));

    let customEditor : CustomSetting;
    let currentSettingPanel : vscode.WebviewPanel | undefined = undefined;
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('voicescripter.openSettings', (editor) => {
        if(!checkSettings(options.settings)) return;
        const settings = options.settings!;
        if(currentSettingPanel) {
            currentSettingPanel.reveal(editor.viewColumn);
        } else {
            currentSettingPanel = vscode.window.createWebviewPanel(
                'voicescripter.characterEdit',
                'VoiceScripter Settings',
                editor.viewColumn || vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(context.extensionUri, 'dist'),
                    ],
                }
            );
            customEditor = new CustomSetting(context);
            customEditor.openWebView(context, currentSettingPanel, settings, checkApiKey, updateCallback, updateApiKey);
            currentSettingPanel.onDidDispose(
                () => {
                    currentSettingPanel = undefined;
                },
                null,
                context.subscriptions
            );
    
        }
    }));

    function updateCallback(settings: Settings, _renameReporter: RenameReporter) {
        saveSettingFile(settingFilePath, settings);
        options.settings = settings;
        renameReporter = _renameReporter;
    };

    async function updateApiKey(apiKey: string | null){
        if(apiKey !== null){
            await context.secrets.store('openai-api-key', apiKey);
            initializeOpenai(context);
        } else {
            cancelAllAssistantTask();
            await context.secrets.delete('openai-api-key');
            chatGptManager.dispose();
        }
    }

    async function checkApiKey(){
        if(await context.secrets.get('openai-api-key') === undefined) return false;
        return true;
    }
    let isEnable = true;
    const settingFilePath = vscode.Uri.joinPath(context.globalStorageUri, 'settings.json');

    readSettingFile(settingFilePath).then((v) => {
        options.settings = v;

        lastAttrIndex = {};
        for (let i = 0; i < options.settings.characters.length; i++) {
            lastAttrIndex[options.settings.characters[i].characterName] = 0;
        }

        const selections = getCharacterSelection(context);
        if(selections){
            options.enableCharacters = selections;
        } else {
            options.enableCharacters = options.settings.characters.map(c => c.characterName);
        }

        if(vscode.window.activeTextEditor){
            settingUpdate(vscode.window.activeTextEditor, options);
        }
    });

    let ignoreNextInsert = false;
    let ignoreLineDelete = false;
    vscode.workspace.onDidChangeTextDocument(
        async (event) => {
            if (!isEnable) return;
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                if (event.reason !== undefined) {
                    applyDecorations(activeEditor, options);
                    return;
                }
                if (isNewLineAdded(event.contentChanges) && !ignoreNextInsert) {
                    if (activeEditor.document === event.document) {
                        if(options.modeConversation && event.reason === undefined){
                            const currentText = activeEditor.document.lineAt(activeEditor.selection.active.line).text;
                            const nextText = activeEditor.document.lineAt(activeEditor.selection.active.line + 1).text
                            if(currentText === "" && nextText === ""){
                                generateTalk(activeEditor, options);
                            }
                        }
                        ignoreNextInsert = true;
                        await newCharacterLine(activeEditor, options);
                        ignoreNextInsert = false;
                    }
                }

                if (isLineDeleted(event.contentChanges) && !ignoreLineDelete) {
                    const line = activeEditor.document.lineAt(event.contentChanges[0].range.start.line);
                    const lineText = line.text;
                    if (activeEditor.selection.isSingleLine && isMetaSection(lineText) && line.lineNumber < activeEditor.selection.active.line) {
                        const meta = getMetaInfo(activeEditor, line.lineNumber);
                        if(meta){
                            const index = CompletionWaitList.findIndex((v) => v.id === meta.id);
                            if(index >= 0){
                                CompletionWaitList[index].cancelTokenSource.cancel('Operation canceled by the user.');
                                CompletionWaitList.splice(index, 1);
                            }
                        }
                        const metaSectionEnd = lineText.indexOf(metaSectionCharacter, 1) + 1;
                        const prevLine = activeEditor.document.lineAt(Math.max(0, line.lineNumber - 1));

                        const appendStart = new vscode.Position(prevLine.lineNumber, prevLine.text.length);
                        const deleteRange = new vscode.Range(line.lineNumber, 0, line.lineNumber + 1, 0);
                        ignoreLineDelete = true;
                        await activeEditor.edit((editBuilder) => {
                            editBuilder.insert(appendStart, line.text.substring(metaSectionEnd));
                            editBuilder.delete(deleteRange);
                        }, { undoStopBefore: false, undoStopAfter: true });
                        moveCursorToPosition(activeEditor, appendStart.line, appendStart.character);
                        ignoreLineDelete = false;
                    }
                }

                applyDecorations(activeEditor, options);
            }
        },
        null,
        context.subscriptions
    );

    let prevCaretLine = 0;
    let prevCaretCharacter = 0;
    vscode.window.onDidChangeTextEditorSelection(
        (event) => {
            if (!isEnable) return;
            const activeEditor = event.textEditor;
            if(event.selections.length === 1){
                const newPosition = event.selections[0].active;
                const anchor = event.selections[0].anchor;
                const line = activeEditor.document.lineAt(newPosition.line);
                const lineText = line.text;
                if (isMetaSection(lineText)) {
                    let delta = -1;
                    if (newPosition.line > prevCaretLine || newPosition.line === 0) {
                        delta = 1;
                    }
                    const newAnchor = ((newPosition.line !== anchor.line) || (newPosition.character !== anchor.character)) ? anchor : undefined;
                    moveCursorToPosition(activeEditor, newPosition.line + delta, prevCaretCharacter, newAnchor);
                }

                prevCaretLine = newPosition.line;
                prevCaretCharacter = newPosition.character;
            } else {
                const newSelections: vscode.Selection[] = [];
                for (const selection of event.selections) {
                    const line = activeEditor.document.lineAt(selection.start.line);
                    const lineText = line.text;
                    if (!isMetaSection(lineText)) {
                        newSelections.push(selection);
                    }
                }
                activeEditor.selections = newSelections;
            }
        },
        null,
        context.subscriptions
    );

    function moveCursorToPosition(editor: vscode.TextEditor, line: number, character: number, anchor?: vscode.Position) {
        const position = new vscode.Position(line, character);
        const newSelection = new vscode.Selection(anchor || position, position);
        editor.selection = newSelection;
    }

    // 次のキャラクターにメタ情報を書き換える
    async function changeNextCharacter(editor: vscode.TextEditor, settings: Settings, direction: 1 | -1 = 1, isAttr: boolean = false): Promise<boolean> {
        const newMetaTextList: string[] = [];
        const rangeList: vscode.Range[] = [];
        editor.selections.forEach((selection) => {
            if (selection.active.line === 0) return;
            if (isMetaSection(editor.document.lineAt(selection.active.line).text)) return;
            let metaLine = selection.active.line - 1;
            const meta = getMetaInfo(editor, metaLine);
            if (meta === undefined) return;
            let currentCharacter = settings.characters.findIndex((character) => character.characterName === meta.name);
            // キャラクターが見つからなかったら最初のキャラクターを選択するようにする
            if (currentCharacter === -1) currentCharacter = settings.characters.length;

            direction = direction >= 0 ? 1 : -1;

            let nextCharacter = currentCharacter;
            let nextAttr = (currentCharacter < 0 || currentCharacter >= settings.characters.length) ? 0 :
                Math.max(0, settings.characters[currentCharacter].attributes.findIndex((attr) => attr.attr === meta.attr));
            if (!isAttr) {
                // characters.rankがrank以上の次のキャラクターを探す
                nextCharacter = getNextCharacter(options, currentCharacter, direction);
            } else {
                // 次のattributeを探す
                if (nextCharacter >= settings.characters.length) nextCharacter = 0;
                if (nextCharacter < 0) nextCharacter = settings.characters.length - 1;
                nextAttr = getNextAttribute(options, nextCharacter, nextAttr, direction);
            }

            const newCharacter = settings.characters[nextCharacter];
            // currentCharacterがnextCharacterと違う場合、nextAttrを更新する
            if (currentCharacter !== nextCharacter) {
                nextAttr = lastAttrIndex[newCharacter.characterName];
            } else {
                lastAttrIndex[newCharacter.characterName] = nextAttr;
            }

            const newMeta = {
                name: newCharacter.characterName,
                attr: nextAttr < newCharacter.attributes.length ? newCharacter.attributes[nextAttr].attr : '',
                id: meta.id,
            };
            newMetaTextList.push(createMetaSectionText(newMeta));
            rangeList.push(new vscode.Range(metaLine, 0, metaLine, editor.document.lineAt(metaLine).range.end.character));
        });

        if (newMetaTextList.length === 0) return false;

        await editor.edit((editBuilder) => {
            for (let i = 0; i < newMetaTextList.length; i += 1) {
                editBuilder.replace(rangeList[i], newMetaTextList[i]);
            }
        }, { undoStopBefore: true, undoStopAfter: true });
        return true;
    }

	context.subscriptions.push(myStatusBarItem);
	myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
}

function getCharacterIndex(settings: Settings, characterName: string): number {
    return settings.characters.findIndex((character) => character.characterName === characterName);
}

function getCharacterFromSettings(settings: Settings, characterName: string): Character | undefined {
    const index = getCharacterIndex(settings, characterName);
    return index < 0 ? undefined : settings.characters[index];
}

function getAttributeFromSettings(settings: Settings, characterIndex: number, attrIndex: number): string {
    if(characterIndex < 0 || characterIndex >= settings.characters.length) return "";
    if(attrIndex < 0 || attrIndex >= settings.characters[characterIndex].attributes.length) return "";
    return settings.characters[characterIndex].attributes[attrIndex].attr;
}

// 次のキャラクターを取得する
function getNextCharacter(options: Options, currentCharacter: number, direction: number): number {
    if(!checkSettings(options.settings)) return 0;
    const settings = options.settings!;
    direction = direction >= 0 ? 1 : -1;
    let nextCharacter = currentCharacter;
    // characters.rankがrank以上の次のキャラクターを探す
    nextCharacter += direction;
    const length = settings.characters.length;
    let count = 0;
    while (count < length) {
        if (nextCharacter >= length) nextCharacter = 0;
        if (nextCharacter < 0) nextCharacter = length - 1;
        if (options.enableCharacters.includes(settings.characters[nextCharacter].characterName)) break;
        nextCharacter += direction;
        count += 1;
    }
    if (count >= length) return 0;
    return nextCharacter;
}

// 次の属性を取得する
function getNextAttribute(options: Options, currentCharacter: number, currentAttr: number, direction: number): number {
    if(!options.settings) return 0;
    let nextAttr = currentAttr + direction;
    const length = options.settings.characters[currentCharacter].attributes.length;
    if (nextAttr >= length) nextAttr = 0;
    if (nextAttr < 0) nextAttr = length - 1;
    return nextAttr;
}

// metaSectionか判定する
function isMetaSection(text: string): boolean {
    return text.length > 0 ? text[0] === metaSectionCharacter : false;
}

function createMetaSectionText(obj: { [key: string]: string }): string {
    return metaSectionCharacter + JSON.stringify(obj, null, 0) + metaSectionCharacter;
}

function getMetaInfo(editor: vscode.TextEditor, lineNumber: number): { [key: string]: string } | undefined {
    if(editor.document.lineCount <= lineNumber) return undefined;
    let line = editor.document.lineAt(lineNumber);
    if (!isMetaSection(line.text)) {
        lineNumber = Math.max(0, lineNumber - 1);
        line = editor.document.lineAt(lineNumber);
        if (!isMetaSection(line.text)) return undefined;
    }
    const lineText = line.text;
    const metaSectionEnd = lineText.indexOf(metaSectionCharacter, 1);
    const metaSectionText = lineText.substring(1, metaSectionEnd);
    return JSON.parse(metaSectionText);
}

function getMetaInfoFromText(text: string) : { [key: string]: string } | undefined {
    if (!isMetaSection(text)) return undefined;
    const metaSectionEnd = text.indexOf(metaSectionCharacter, 1);
    const metaSectionText = text.substring(1, metaSectionEnd);
    return JSON.parse(metaSectionText);
}

function getCharacterSelection(context: vscode.ExtensionContext): string[] | undefined {
    return context.workspaceState.get('selections');
}
function setCharacterSelection(context: vscode.ExtensionContext, selections: string[]){
    context.workspaceState.update('selections', selections);
}

function getAppList(text: string, settings: Settings, mode: 'copy' | 'publish' | 'all') : string[] {
    const lines = text.split('\n');
    const appList: { [key: string]: boolean} = {};
    const appFilter: { [key: string]: boolean} = {};
    settings.apps.forEach((app) => {
        appList[app.appName] = false;
        if(mode === 'copy'){
            appFilter[app.appName] =  app.enableClipboard
        } else if(mode === 'publish'){
            appFilter[app.appName] =  app.enableSaveFile;
        } else {
            appFilter[app.appName] = true;
        }
    });

    lines.forEach((line) => {
        if(isMetaSection(line)){
            const meta = getMetaInfoFromText(line);
            if(meta){
                const index = getCharacterIndex(settings, meta.name);
                if(index >= 0) {
                    const appName = settings.characters[index].appName;
                    appList[appName] = true && appFilter[appName];
                }
            }
        }
    });
    return Object.keys(appList).filter(key => appList[key]);
}

const regCharacterName = new RegExp('\\' + VarCharacterName, 'g');
const regAttribute = new RegExp('\\' + VarAttribute, 'g');
const regCBody = new RegExp('\\' + VarBody, 'g');
function getProcessedSelectedText(text: string,
                                    settings: Settings,
                                    app: string | undefined = undefined,
                                    start: number | undefined = undefined,
                                    end: number | undefined = undefined,
                                    tail: number | undefined = undefined,
                                    overrideOutputRule: string | undefined = undefined): string {
    const appMap = settings.apps.reduce((map, app) => {
        map[app.appName] = app;
        return map;
    }, {} as { [key: string]: App });
    const characterMap = settings.characters.reduce((map, character) => {
        map[character.characterName] = character;
        return map;
    }, {} as { [key: string]: Character });

    // meta sectionを分ける
    const lines = text.split('\n');
    const talkLines: string[] = [];
    const metaLines: string[] = [];
    start = start === undefined ? 0 : Math.max(0, start);
    end = end === undefined ? lines.length : Math.min(lines.length, end);
    for (let i = start; i < end; i++) {
        if (isMetaSection(lines[i]) && i + 1 < lines.length && !isMetaSection(lines[i + 1])) {
            metaLines.push(lines[i]);
            talkLines.push(lines[i + 1]);
            i++;
        }
    }

    const processedLines: string[] = [];
    const startLine = tail === undefined ? 0 : Math.max(0, talkLines.length - tail);
    for (let i = startLine; i < metaLines.length; i++) {
        const metaLine = metaLines[i];
        const meta = JSON.parse(metaLine.replace(metaTrimRegex, ''));
        const appName = characterMap[meta.name].appName;
        if (app !== undefined && appName !== app) {
            continue;
        }
        const talk = talkLines[i];
        const outputRule = overrideOutputRule || appMap[appName].outputRule;
        const processed = outputRule.replace(regCharacterName, meta.name).replace(regAttribute, meta.attr).replace(regCBody, talk);
        processedLines.push(processed);
    }

    return processedLines.join('\n');
}

async function processAndCopySelectedText(editor: vscode.TextEditor, settings: Settings) {
    // 選択されたテキストを取得する
    let startOffset = -1;
    if (editor.selection.start.line === 0) {
        if (isMetaSection(editor.document.lineAt(0).text)) {
            startOffset = 0;
        } else {
            startOffset = 1;
        }
    }
    const range = new vscode.Range(editor.selection.start.line + startOffset, 0, editor.selection.end.line + 1, 0);
    const selectedText = editor.document.getText(range);

    if(settings.extension.separateCopy){
        const appList = getAppList(selectedText, settings, 'copy');
        for(let i = appList.length - 1; i >= 0; i--){
            const result = getProcessedSelectedText(selectedText, settings, appList[i]);
            await vscode.env.clipboard.writeText(result);
            await new Promise(resolve => setTimeout(resolve, 200)); // for mac
        };
    } else {
        const result = getProcessedSelectedText(selectedText, settings);   
        await vscode.env.clipboard.writeText(result);
    }
}

async function copyPlaneText(editor: vscode.TextEditor) {
    const result = editor.document.getText(editor.selection);
    await vscode.env.clipboard.writeText(result);
}

function isNewLineAdded(changes: readonly vscode.TextDocumentContentChangeEvent[]): boolean {
    return changes.some((change) => change.text.includes('\n'));
}
function isLineDeleted(changes: readonly vscode.TextDocumentContentChangeEvent[]): boolean {
    return changes.some((change) => change.text === '' && change.rangeLength > 0);
}

async function newCharacterLine(editor:vscode.TextEditor, options: Options){
    if (!checkSettings(options.settings)) return;
    const settings = options.settings!;
    const textToInsertList: string[] = [];
    const insertPositionList: vscode.Position[] = [];
    let lineOffset = 1;
    editor.selections.forEach((selection) => { 
        const meta = getMetaInfo(editor, selection.active.line);
        const currentCharacter = meta !== undefined ? getCharacterIndex(settings, meta.name) : -1;
        const nextCharacter = getNextCharacter(options, currentCharacter, 1);
        const name = settings.characters[nextCharacter].characterName;
        const lastAttr = lastAttrIndex[name];
        const attr = lastAttr >= 0 && lastAttr < settings.characters[nextCharacter].attributes.length ? settings.characters[nextCharacter].attributes[lastAttr].attr : '';
        const textToInsert = `${metaSectionCharacter}{"name":"${name}","attr":"${attr}","id":"${nanoid(10)}"}${metaSectionCharacter}\n`;
        textToInsertList.push(textToInsert);
        insertPositionList.push(new vscode.Position(selection.active.line + lineOffset, 0));
        lineOffset++;
    });
    await editor.edit((editBuilder) => {
        textToInsertList.forEach((textToInsert, index) => {
            editBuilder.insert(insertPositionList[index], textToInsert);
        });
    }, { undoStopBefore: false, undoStopAfter: true });
}


async function changeCharacter(editor: vscode.TextEditor, settings: Settings, newCharacter: string) {
    if(!editor) return;
    const index = getCharacterIndex(settings, newCharacter);
    if(index === -1) return;
    const newMetaTextList: string[] = [];
    const rangeList: vscode.Range[] = [];
    editor.selections.forEach((selection) => {
        const line = Math.max(0, selection.active.line - 1);
        if (!isMetaSection(editor.document.lineAt(line).text)) return;
        const meta = getMetaInfo(editor, line)!;
        meta.name = newCharacter;
        meta.attr = getAttributeFromSettings(settings, index, lastAttrIndex[newCharacter]);
        newMetaTextList.push(createMetaSectionText(meta));
        rangeList.push(new vscode.Range(line, 0, line, editor.document.lineAt(line).range.end.character));
    });
    if (newMetaTextList.length === 0) return false;
    await editor.edit((editBuilder) => {
        for (let i = 0; i < newMetaTextList.length; i += 1) {
            editBuilder.replace(rangeList[i], newMetaTextList[i]);
        }
    }, { undoStopBefore: true, undoStopAfter: true });
}

async function publish(editor:vscode.TextEditor, options: Options) {
    if(!checkSettings(options.settings)) return;
    const settings = options.settings!;
    const selectedText = editor.document.getText();
    const processedTextList: string[] = [];
    const extList: string[] = [];
    const appList = getAppList(selectedText, settings, 'publish');
    for(let i = 0; i < appList.length; i++){
        const result = getProcessedSelectedText(selectedText, settings, appList[i]);
        processedTextList.push(result);
        for(let j = 0; j < settings.apps.length; j++){
            if(settings.apps[j].appName === appList[i]){
                const ext = settings.apps[j].saveFileExt;
                extList.push(ext.substring(ext.indexOf('.') + 1));
                break;
            }
        }
    };
    const filename = path.basename(editor.document.fileName, path.extname(editor.document.fileName));
    const dirname = path.dirname(editor.document.fileName);
    vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(dirname, filename)),
        saveLabel:`保存(${appList.length}ファイル)`,
        title: 'Publish',
        filters: {'VoiceScripterPublish' : [`(${extList.join('|')})`]}
    }).then(async (uri) => {
        if(uri === undefined) return;
        const savePath = uri.path;
        const saveFilename = path.basename(savePath, path.extname(savePath));
        const saveDirname = path.dirname(savePath);
        for(let i = 0; i < appList.length; i++){
            const saveUri = vscode.Uri.file(path.join(saveDirname, saveFilename + `_${appList[i]}.` + extList[i]));
            const content = new Uint8Array(Buffer.from(processedTextList[i]));
            vscode.workspace.fs.writeFile(saveUri, content);
        }
    });
}

let publishDocument : vscode.TextDocument | undefined = undefined;
async function showPreview(editor:vscode.TextEditor, options: Options) {
    if(!checkSettings(options.settings)) return;
    const settings = options.settings!;
    const selectedText = editor.document.getText();

    const processedTextList: string[] = [];
    const appList = getAppList(selectedText, settings, 'all');
    for(let i = 0; i < appList.length; i++){
        const result = getProcessedSelectedText(selectedText, settings, appList[i]);
        processedTextList.push(`### ${appList[i]} ###`);
        processedTextList.push(result);
        processedTextList.push('\n');
    };

    if(publishDocument === undefined){
        vscode.workspace.openTextDocument({
            language: 'plaintext', content: processedTextList.join('\n')
        }).then((doc) => {
            publishDocument = doc;
            vscode.window.showTextDocument(publishDocument, {preview:true, viewColumn:vscode.ViewColumn.Beside});
        });
    } else {
        vscode.window.showTextDocument(publishDocument, {preserveFocus:true, preview:true, viewColumn:vscode.ViewColumn.Beside}).then(async editor => {
            if(editor === undefined) return;
            await editor.edit((editBuilder) => {
                editBuilder.replace(new vscode.Range(0, 0, editor.document.lineCount, 0), processedTextList.join('\n'));
            });
        });
    }

}

async function readSettingFile(settingFile: vscode.Uri): Promise<Settings> {
    if(fs.existsSync(settingFile.path)){
        const content: Uint8Array = await vscode.workspace.fs.readFile(settingFile);
        const text = content.toString();
        return JSON.parse(text) as Settings;
    } else {
        return {
            assistant: {
                maxLine: 5,
                conversationPrompt: '空欄一人分のみ'
            },
            extension: {
                metaAlpha: 30,
                nameLength: 8,
                separateCopy: true,
            },
            apps: [],
            characters: [],
        } as Settings;
    }
}

function saveSettingFile(settingFile: vscode.Uri, setting: Settings): Thenable<void> {
    const text = JSON.stringify(setting, null, 2);
    const content = new Uint8Array(Buffer.from(text));
    return vscode.workspace.fs.writeFile(settingFile, content);
}

function limitString(str: string, limit: number): string {
    if (str.length > limit) {
        return str.substring(0, limit);
    }
    return str;
}

export async function settingUpdate(editor: vscode.TextEditor, options: Options, renameReporter: RenameReporter | undefined = undefined) {
    if(renameReporter){
        options.updating = true;
        await rename(editor, options.settings, renameReporter);
        renameReporter = undefined;
        options.updating = false;
    }
    makeDecoration(editor, options);
    applyDecorations(editor, options);
}

async function rename(editor: vscode.TextEditor, settings: Settings | undefined, renameReporter: RenameReporter){
    if(!editor || !settings) return;

    const newAttrIndex:{[key: string]: number} = {};
    for(let key in lastAttrIndex){
        const newName = renameReporter.getNewCharacterName(key);
        if(newName && newName !== ''){
            newAttrIndex[newName] = lastAttrIndex[key];
        }
    }
    for(let i = 0; i < settings.characters.length; i++){
        if(!(settings.characters[i].characterName in newAttrIndex)){
            newAttrIndex[settings.characters[i].characterName] = 0;
        }
    }
    lastAttrIndex = newAttrIndex;

    const newMetaTextList: string[] = [];
    const rangeList: vscode.Range[] = [];
    for(let i = 0; i < editor.document.lineCount; i++){
        if (!isMetaSection(editor.document.lineAt(i).text)) continue;
        const meta = getMetaInfo(editor, i)!;
        const newAttr = renameReporter.getNewAttributeName(meta.attr, meta.name);
        const newName = renameReporter.getNewCharacterName(meta.name);
        if(newAttr && newName && (newAttr !== meta.attr || newName !== meta.name)){
            meta.attr = newAttr;
            meta.name = newName;
            newMetaTextList.push(createMetaSectionText(meta));
            rangeList.push(new vscode.Range(i, 0, i, editor.document.lineAt(i).range.end.character));
        }
    }
    
    await editor.edit((editBuilder) => {
        for (let i = 0; i < newMetaTextList.length; i += 1) {
            editBuilder.replace(rangeList[i], newMetaTextList[i]);
        }
    });
}

function makeDecoration(editor: vscode.TextEditor, options: Options) {
    const settings = options.settings;
    const context = options.context;
    const talkDecoration = options.talkDecoration;
    if(!settings || !context || !editor || options.updating) return;

    editor.setDecorations(metaTextDecoration, []);
    editor.setDecorations(completionWaitDecoration, []);

    metaTextDecoration = vscode.window.createTextEditorDecorationType({
        color: `rgba(128, 128, 128, ${settings.extension.metaAlpha / 100})`,
        textDecoration: 'none',
    });

    for (const key in talkDecoration) {
        editor.setDecorations(talkDecoration[key], []);
        delete talkDecoration[key];
    }
    editor.setDecorations(missingTextDecoration, []);

    const nameLength = settings.extension.nameLength;

    const createDeco = (iconPath: string | undefined, name: string, color: string) => {
        const limitName = "　" + limitString(name, nameLength);
        return vscode.window.createTextEditorDecorationType({
            gutterIconPath: iconPath ? context.asAbsolutePath(iconPath) : undefined,
            gutterIconSize: 'contain',
            before: {
                contentText: limitName,
                width: '.6em',
                margin: `0em ${nameLength + 1}.5em 0 0`,
                color: color,
                backgroundColor: color,
            },
            after: {
                contentText: '',
            },
            color: new vscode.ThemeColor('editor.foreground'),
        });
    }

    settings.characters.forEach((character) => {
        const dirpath = path.join(context.globalStorageUri.path, 'images');

        if(character.attributes.length === 0){
            let iconPath: string | undefined = path.join(dirpath, `${character.characterName}.png`); // fallback
            if (!fs.existsSync(context.asAbsolutePath(iconPath))) {
                iconPath = undefined
            }
            const colorbg = character.color;
            const name = character.characterName;
            const inlineTextDecorationType = createDeco(iconPath, name, colorbg);
            talkDecoration[name] = inlineTextDecorationType;
        } else {
            character.attributes.forEach((attribute) => {
                let iconPath: string | undefined =  path.join(dirpath, `${character.characterName}${attribute.attr}.png`);
                if (!fs.existsSync(context.asAbsolutePath(iconPath))) {
                    iconPath = path.join(dirpath, `${character.characterName}.png`); // fallback
                    if (!fs.existsSync(context.asAbsolutePath(iconPath))) {
                        iconPath = undefined
                    }
                }
                const colorbg = attribute.colorInherit ? character.color : attribute.color;
                const name = character.characterName + attribute.attr;
                const inlineTextDecorationType = createDeco(iconPath, name, colorbg);
                talkDecoration[name] = inlineTextDecorationType;
            });
        }
    });
}

let missingCharacterRange : vscode.DecorationOptions[] = []
function applyDecorations(editor : vscode.TextEditor, options: Options) {
    if(options.settings !== undefined && options.updating === false){
        updateTalkSectionDecoration(editor, options);
        updateMetaSectionDecoration();
    }
}

function removeDecorations(editor: vscode.TextEditor, options: Options){
    editor.setDecorations(metaTextDecoration, []);
    editor.setDecorations(completionWaitDecoration, []);
    editor.setDecorations(missingTextDecoration, []);
    const talkDecoration = options.talkDecoration;
    for (const key in talkDecoration) {
        editor.setDecorations(talkDecoration[key], []);
    }
}

function updateTalkSectionDecoration(editor: vscode.TextEditor, options: Options) {
    const settings = options.settings;
    const talkDecoration = options.talkDecoration;
    if (editor && settings !== undefined) {
        const characterMap = settings.characters.reduce((map, character) => {
            map[character.characterName] = character;
            return map;
        }, {} as { [key: string]: Character });

        const decorationOptions: RangeDict = {};
        for (let key in talkDecoration) {
            decorationOptions[key] = [];
        }

        const invalidRange: vscode.DecorationOptions[] = [];
        const completionWaitRange: vscode.Range[] = [];
        missingCharacterRange = [];
        const linesCount = editor.document.lineCount;
        for (let i = 0; i < linesCount; i++) {
            const line = editor.document.lineAt(i);
            if (isMetaSection(line.text)) continue;
            if (i > 0) {
                const metaLine = editor.document.lineAt(i - 1);
                if (isMetaSection(metaLine.text)) {
                    const meta = getMetaInfo(editor, i - 1)!;
                    if(CompletionWaitList.findIndex((v) => v.id === meta.id) >= 0){
                        completionWaitRange.push(line.range);
                    } else if(meta.name in characterMap){
                        const name = meta.name + (meta.attr ? meta.attr : '');
                        const noAttr = characterMap[meta.name].attributes.length === 0;
                        if(decorationOptions[name] || noAttr){
                            decorationOptions[name].push(line.range);
                        } else {
                            missingCharacterRange.push({ range: line.range, hoverMessage: '属性が見つかりません。設定を確認してください。' })
                        }
                    } else {
                        missingCharacterRange.push({ range: line.range, hoverMessage: 'キャラクターが見つかりません。設定を確認してください。' })
                    }
                } else {
                    invalidRange.push({ range: line.range, hoverMessage: '上の行にメタ情報が無いため、この行は認識されません。' });
                }
            } else {
                invalidRange.push({ range: line.range, hoverMessage: '上の行にメタ情報が無いため、この行は認識されません。' });
            }
        }
        for (let key in talkDecoration) {
            editor.setDecorations(talkDecoration[key], decorationOptions[key]);
        }
        editor.setDecorations(invalidTextDecoration, invalidRange);
        editor.setDecorations(missingTextDecoration, missingCharacterRange);
        editor.setDecorations(completionWaitDecoration, completionWaitRange);
    }
}

function updateMetaSectionDecoration(){
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const decorationRange: vscode.Range[] = [];
        const linesCount = activeEditor.document.lineCount;
        for (let i = 0; i < linesCount; i++) {
            let isMissing = false;
            for(let j = 0; j < missingCharacterRange.length; j++){
                if(missingCharacterRange[j].range.start.line === i + 1){
                    isMissing = true;
                    break;
                }
            }
            if(isMissing) continue;
            const line = activeEditor.document.lineAt(i);
            const lineText = line.text;
            if (lineText[0] === metaSectionCharacter) {
                decorationRange.push(line.range);
            }
        }
        activeEditor.setDecorations(metaTextDecoration, decorationRange);
    }
}

async function initializeOpenai(context: vscode.ExtensionContext) {
    const key = await context.secrets.get('openai-api-key');
    if(key === undefined) {
        vscode.window.showErrorMessage('OpenAIのAPI Keyがセットされていません。');
        return;
    }
    if(chatGptManager.isEnable) return;
    const usedToken = context.globalState.get('openai-used-token', 0);
    chatGptManager.initializeOpenai(key, 'gpt-3.5-turbo', usedToken);
    const updateStatusBar = (token: number) => {
        context.globalState.update('openai-used-token', token);
        myStatusBarItem.text = `UsedToken ${chatGptManager.getFormatedUsedToken()}(${chatGptManager.getFormatedCost()})`;
        myStatusBarItem.show();
    } 
    chatGptManager.SetChangeUsedTokenCallback(updateStatusBar);
    updateStatusBar(usedToken);
}

function getLineById(editor: vscode.TextEditor, id: string): number {
    for(let i = 0; i < editor.document.lineCount; i++){
        const meta = getMetaInfo(editor, i);
        if(meta && meta.id === id) return i;
    }
    return -1;
}

async function generateTalk(editor: vscode.TextEditor, options: Options) {
    if(!options.settings || !chatGptManager.isEnable) return;
    const settings = options.settings;
    const meta = getMetaInfo(editor, editor.selection.active.line);
    if(!meta) return;
    const character = getCharacterFromSettings(settings, meta.name);
    if(!character) return;
    
    const line = editor.selection.active.line;

    const CancelToken = axios.CancelToken;
    const source = CancelToken.source();
    CompletionWaitList.push({id:meta.id, line:line, cancelTokenSource: source});
    const removeWaitList = () => {
        const index = CompletionWaitList.findIndex((v) => v.id === meta.id);
        if(index >= 0) CompletionWaitList.splice(index, 1);
    }
    taskQueue.add(async () => {
        try{
            const description = character.description ? `${character.characterName}:${character.description}` : '';
            const targetLine = getLineById(editor, meta.id);
            if(targetLine === -1) return;
            const allText = getProcessedSelectedText(editor.document.getText(),settings, undefined, 0, targetLine + 1, settings.assistant.maxLine, "$name>$body");
            const message = await chatGptManager.createChatCompletion(
                [
                    {role:'user', content: `${settings.assistant.conversationPrompt}`},
                    {role:'user', content: `状況:${descriptionForChatGPT}`},
                    {role:'user', content: `${description}`},
                    {role:'user', content: '### 会話 ###'},
                    {role:'user', content: allText}
                ],
                source.token
            );
            const workspaceEdit = new vscode.WorkspaceEdit();
            const currentMeta = getMetaInfo(editor, line);
            if(currentMeta && currentMeta.id === meta.id){
                removeWaitList();
                workspaceEdit.insert(editor.document.uri, new vscode.Position(line, 0), message);
            } else {
                removeWaitList();
                const currentLine = getLineById(editor, meta.id);
                if(currentLine >= 0){
                    workspaceEdit.insert(editor.document.uri, new vscode.Position(currentLine, 0), message);            
                }
            }
            vscode.workspace.applyEdit(workspaceEdit);
        } catch(error){
            removeWaitList();
            applyDecorations(editor, options);
        }
    });
}

let characterDescriptionDocument: vscode.TextDocument | undefined = undefined;
let characterDescriptionSource: CancelTokenSource | undefined = undefined;

async function generateCharacterDescription(editor: vscode.TextEditor, options: Options, language: 'ja' | 'en'){
    if(!options.settings || !chatGptManager.isEnable) return;
    const settings = options.settings;
    const allText = getProcessedSelectedText(editor.document.getText(), settings, undefined, undefined, undefined, undefined, "$name>$body");
    characterDescriptionSource = axios.CancelToken.source();

    taskQueue.add(async () => {
        try{
            characterDescriptionDocument = await vscode.workspace.openTextDocument({
                language: 'plaintext', content: '### キャラクターの説明がここに表示されます ###\nChatGPTからの応答を待っています…'
            });
            const orger = language === 'ja' ? 
                '以下の会話から登場するキャラクターの性格を再現するための説明をください' : 
                'Please provide descriptive sentences to recreate the characters that appear in the following conversation.';
            const format = language === 'ja' ? 
                '### 出力フォーマット ###\nキャラクター名:説明文' : 
                '### Output format ###\nCharacterName:Description';
            const editorPromise = vscode.window.showTextDocument(characterDescriptionDocument, {preview:true, viewColumn:vscode.ViewColumn.Beside});
            const message = await chatGptManager.createChatCompletion(
                [
                    {role:'user', content: orger},
                    {role:'user', content: format},
                    {role:'user', content: '### 会話 ###'},
                    {role:'user', content: `${allText}`},
                ],
                characterDescriptionSource!.token
            );
            characterDescriptionSource = undefined;

            const editor = await editorPromise;
            if(!editor.document.isClosed){
                const workspaceEdit = new vscode.WorkspaceEdit();
                workspaceEdit.replace(editor.document.uri, new vscode.Range(0, 0, characterDescriptionDocument.lineCount, 0), message);
                vscode.workspace.applyEdit(workspaceEdit);
            }
        } catch(error){
            characterDescriptionSource = undefined;
        }
    });
}

function cancelAllAssistantTask(){
    CompletionWaitList.forEach((v) => {
        v.cancelTokenSource.cancel();
    });
    CompletionWaitList.splice(0, CompletionWaitList.length);
}

// This method is called when your extension is deactivated
export function deactivate() { }
