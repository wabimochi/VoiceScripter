import { App } from '../settings';
import {VarCharacterName, VarAttribute, VarBody} from '../common';


export function MakeApp() : App{
    return {
        appName: "",
        api: "",
        enableClipboard: true,
        enableSaveFile: true,
        saveFileExt: "txt",
        outputRule: "$name $attr＞$body"
    }
}

export const appElm = (index: number, app: App) => {
    return `
        <div class="app container" data-index="${index}">
            <h1 class="title">${app.appName}</h1>
            <h3 class="label">アプリケーション名</h3>
            <vscode-text-field class="app-name" value="${app.appName}"></vscode-text-field>
            <div class="reserve"></div>
            <h3 class="label">クリップボードへのコピー</h3>
            <vscode-checkbox class="enable-clipboard" checked="${app.enableClipboard}"></vscode-checkbox>
            <h3 class="label">ファイルへの保存</h3>
            <vscode-checkbox class="enable-save-file" checked="${app.enableSaveFile}"></vscode-checkbox>
            <h3 class="label">保存するファイルの拡張子</h3>
            <vscode-text-field class="save-file-ext" value="${app.saveFileExt}"></vscode-text-field>
            <h3 class="label">API</h3>
            <vscode-dropdown class="api-selector" position="below" current-value="${app.api}">
                <vscode-option>TODO get api list</vscode-option>
            </vscode-dropdown>
            <h3 class="label">出力ルール</h3>
            <vscode-text-field class="output-rule" value="${app.outputRule}"></vscode-text-field>
            <div class="flex-row">
                <code>${VarCharacterName}</code>：キャラクター名<div style="width:1.5em"></div>
                <code>${VarAttribute}</code>：属性名<div style="width:1.5em"></div>
                <code>${VarBody}</code>：読み上げ内容
            </div>
            <h3 class="label">出力プレビュー</h3>
            <code class="output-preview"></code>

            <div class="close-button">
                <vscode-button appearance="icon" class="close-button-inner">
                    <span class="codicon codicon-close"></span>
                </vscode-button>
            </div>
        </div>
    `
}