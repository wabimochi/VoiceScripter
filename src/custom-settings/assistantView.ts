import { Settings } from '../settings';

export const assistantView = (settings: Settings, enableAssistant: boolean) => {
    return `
        <div id="assistant-root" class="component-root">
            <h3 class="label">API Key</h3>
            <div>ChatGPTを使用するためのAPI Keyを設定します。</div>
            <vscode-text-field id="apikey-input" type="password" value=""></vscode-text-field>
            <div class="flex-row sub-component">
                <vscode-button ${enableAssistant ? "hidden" : ""} appearance="primary" id="set-apikey-button" class="margin-right">セット</vscode-button>
                <vscode-button ${enableAssistant ? "" : "hidden"} appearance="primary" id="update-apikey-button" class="margin-right">更新</vscode-button>
                <vscode-button ${enableAssistant ? "" : "hidden"} appearance="secondary" id="delete-apikey-button" class="margin-right">削除</vscode-button>
            </div>
            <h3 class="label large-margin">最大行数</h3>
            <div class="">対話モードでChatGPTに送る会話部分の最大行数を指定します。この値が大きいと多くのトークンを消費します。</div>
            <div class="flex-row">
                <vscode-text-field id="assistant-max-length" class="input-min-width margin-right input-uint" min="2" max="100" value="${settings.assistant.maxLine}"></vscode-text-field>
                <div class="add-info-label ">2-100</div>
            </div>
            <h3 class="label large-margin">対話モードのプロンプト</h3>
            <div class="">ChatGPTに送るプロンプトを指定します。</div>
            <vscode-text-area resize="vertical" rows="5" id="assistant-prompt" value="${settings.assistant.conversationPrompt}"></vscode-text-area>
            <div class="sub-component">
                <vscode-button appearance="primary" id="reset-assistant-prompt">リセット</vscode-button>
            </div>
        </div>
    `;
}