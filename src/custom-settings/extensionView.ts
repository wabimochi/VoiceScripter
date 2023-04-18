import { Settings } from '../settings';

export const extensionView = (settings: Settings) => {
    
    return `
        <div id="extension-root" class="component-root">
            <h3 class="label">メタセクションの不透明度</h3>
            <div class="flex-row">
                <vscode-text-field id="meta-alpha" class="input-min-width margin-right input-uint" maxlength="3" min="0" max="100" value="${settings.extension.metaAlpha}"></vscode-text-field>
                <div class="add-info-label ">0-100</div>
            </div>
            <h3 class="label">キャラクター名の長さ</h3>
            <div class="flex-row">
                <vscode-text-field id="name-length" class="input-min-width margin-right input-uint" maxlength="2" min="3" max="20" value="${settings.extension.nameLength}"></vscode-text-field>
                <div class="add-info-label ">3-20</div>
            </div>
            <h3 class="label">クリップボードへのコピーをアプリ毎に分ける</h3>
            <vscode-checkbox id="copy-clipbord-per-app" checked="${settings.extension.separateCopy}"></vscode-checkbox>
        </div>
    `;
}
