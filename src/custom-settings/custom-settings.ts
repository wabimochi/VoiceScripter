import { Settings } from '../settings';
import * as vscode from 'vscode';
import { getUri } from "../utilities/getUri";
import { getNonce } from "../utilities/getNonce";
import { colorList } from './colorList';
import { RenameReporter } from "../utilities/renameReporter";

export class CustomSetting {
    public static readonly viewType = 'voicescripter.characterEdit';
    webviewPanel : vscode.WebviewPanel | undefined = undefined;
    private readonly context : vscode.ExtensionContext;
    
    constructor(private readonly extensionContext: vscode.ExtensionContext) {
        this.context = extensionContext;
     }

    public async openWebView(
        context: vscode.ExtensionContext,
        webviewPanel: vscode.WebviewPanel,
        settings: Settings,
        checkApiKey: () => Promise<boolean>,
        updateCallback : (settings: Settings, _renameReporter: RenameReporter) => void,
        updateApiKey: (apiKey: string | null) => Promise<void>,
    ): Promise<void> {
        this.webviewPanel = webviewPanel;
        let settingsClone = JSON.parse(JSON.stringify(settings)) as Settings;
        let renameReporter = new RenameReporter();
        renameReporter.initialize(settingsClone);

        // ウェブビューのHTMLコンテンツを設定
        webviewPanel.webview.html = this.getWebviewContent(webviewPanel.webview, settingsClone);

        // ウェブビューとのメッセージの受信をハンドル
        webviewPanel.webview.onDidReceiveMessage(
            async (message) => {
                if(message.command === 'update'){
                    settingsClone = message.data.settings;
                    renameReporter = message.data.renameReporter;
                } else if(message.command === 'update-api-key'){
                    if(message.data === null){
                        const word = 'delete';
                        if(await confirm(`削除するには「${word}」と入力してください`) === word){
                            await updateApiKey(null);
                            vscode.window.showInformationMessage(`API Keyを削除しました。`, {modal: true});
                            webviewPanel.webview.postMessage({
                                command: 'update-api-key',
                                data: await checkApiKey()
                            });
                        }    
                    } else if(message.data !== ''){
                        await updateApiKey(message.data);
                        vscode.window.showInformationMessage(`API Keyをセットしました。`);
                        webviewPanel.webview.postMessage({
                            command: 'update-api-key',
                            data: await checkApiKey()
                        });
                    }
                }
            },
            null,
            context.subscriptions
        );

        // ウェブビューが閉じられたときの処理
        webviewPanel.onDidDispose(() => {
            const _renameReporter = new RenameReporter();
            _renameReporter.initializeFromRenameReporter(renameReporter);
            validateAndFixSettings(settingsClone);
            updateCallback(settingsClone, _renameReporter);
        });

        webviewPanel.onDidChangeViewState(
            async e => {
                if(e.webviewPanel.visible === true){
                    webviewPanel.webview.postMessage({
                        command: 'initialize',
                        data: {settings: settingsClone, enableAssistant: await checkApiKey(), renameReporter: renameReporter}
                    });
                }
            }
        );

        // ウェブビューの初期データを設定
        webviewPanel.webview.postMessage({
            command: 'initialize',
            data: {settings: settingsClone, enableAssistant: await checkApiKey(), renameReporter: renameReporter}
        });
    }

    private getWebviewContent(webview: vscode.Webview, settings: Settings) {
        const webviewUri = getUri(webview, this.context.extensionUri, ["dist", "webview.js"]);
        const styleUri = getUri(webview, this.context.extensionUri, ["dist", "src", "webview", "style.css"]);
        const codiconUri = getUri(webview, this.context.extensionUri, ["dist", "src", "webview", "codicon.css"]);
        const nonce = getNonce();
        
        return `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Cat Coding</title>
                <link rel="stylesheet" href="${styleUri}">
                <link rel="stylesheet" href="${codiconUri}">
            </head>
            <body>
                <vscode-panels aria-label="Default">
                    <vscode-panel-tab id="extension-tab">VoiceScripter</vscode-panel-tab>
                    <vscode-panel-tab id="assistant-tab">アシスタント</vscode-panel-tab>
                    <vscode-panel-tab id="app-tab">アプリ</vscode-panel-tab>
                    <vscode-panel-tab id="characters-tab">キャラクター</vscode-panel-tab>
                    <vscode-panel-view id="extension-view"></vscode-panel-view>
                    <vscode-panel-view id="assistant-view"></vscode-panel-view>
                    <vscode-panel-view id="app-view"></vscode-panel-view>
                    <vscode-panel-view id="characters-view"></vscode-panel-view>
                </vscode-panels>

                <datalist id="color-list">
                    ${colorList}
                </datalist>

                <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
                <script>
                    const vscode = acquireVsCodeApi();
                    document.addEventListener('DOMContentLoaded', () => {
                        initialize(vscode);
                    });
                </script>
            </body>
        </html>`;
    }
}

async function confirm(title: string) {
    const result = await vscode.window.showInputBox({
        value: '',
        title: title,
    });
    return result;
}

function validateAndFixSettings(settings: Settings){
    const defaultAppName = settings.apps.length > 0 ? settings.apps[0].appName : '';
    settings.characters.forEach(character => {
        if(character.appName === ''){
            character.appName = defaultAppName;
        }
    })
}